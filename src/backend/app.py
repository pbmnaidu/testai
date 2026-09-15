import os
import sys
import json
import re
import shutil
from datetime import date, datetime
import pandas as pd
import numpy as np
from fastapi import FastAPI, Query, HTTPException
from pydantic import BaseModel, Field
import hashlib
import math
import secrets
import threading
import uuid
from fastapi import File, Form, Request, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# Ensure workspace root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__) + "/../.."))

from src.data.sync.snapshot_manager import get_snapshot_history
from src.data.sync.sync_runner import (
    get_sync_status as get_automation_status,
    get_sync_health,
    preview_diff,
    commit_preview,
    run_sync_job,
    start_sync_job,
    reset_sync_job,
    reconcile_sync_state,
    start_scheduler,
)
from src.data.sync.training_manager import TRAINING_MANAGER
from src.utils.mlflow_tracker import MLflowTracker
from src.modules.material_context import analyze_material_context
from src.modules.work_classifier import classify_work_descriptions
from src.modules.compliance_engine import GUIDELINE_SOURCE, public_scope_matrix

app = FastAPI(
    title="MPLADS AI Monitoring & Risk Intelligence Platform API",
    description="Backend decision-support API for MPLADS public works monitoring",
    version="2.0.0"
)

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    # Browsers reject wildcard origins when credentials are enabled.  Keep
    # localhost for development and explicitly allow the deployed dashboard.
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://mplads-frontend-w20d.onrender.com",
    ],
    allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def start_automatic_sync_scheduler():
    reconcile_sync_state()
    start_scheduler()

# Resolve paths dynamically so the backend works on any machine (including Vercel)
_BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FEATURES_DIR = os.path.join(_BACKEND_ROOT, "data", "features")
PROCESSED_DIR = os.path.join(_BACKEND_ROOT, "data", "processed")
# Render can mount a persistent disk at a stable path. Keep the repository
# data directory as the local-development default, while allowing deployment
# to redirect mutable records and uploaded media to that disk.
DATA_DIR = os.path.abspath(os.getenv("MPLADS_DATA_DIR", os.path.join(_BACKEND_ROOT, "data")))


def _initialize_data_dir():
    """Seed a newly mounted deployment disk with the repository's data files."""
    default_data_dir = os.path.abspath(os.path.join(_BACKEND_ROOT, "data"))
    if DATA_DIR == default_data_dir or not os.path.isdir(default_data_dir):
        return
    os.makedirs(DATA_DIR, exist_ok=True)
    # Copy only missing entries so later deploys preserve uploaded evidence.
    for entry in os.listdir(default_data_dir):
        source = os.path.join(default_data_dir, entry)
        target = os.path.join(DATA_DIR, entry)
        if os.path.exists(target):
            continue
        if os.path.isdir(source):
            shutil.copytree(source, target)
        else:
            shutil.copy2(source, target)


_initialize_data_dir()

# Cache loaded dataframes in memory
_DATA_CACHE = {}


class LazyWorkIndex:
    """Resolve work details on demand instead of serializing every row at startup."""

    def __init__(self, frame: pd.DataFrame):
        self.frame = frame
        self.positions = {}
        self.normalized_positions = {}
        self.tail_positions = {}
        self.cache = {}
        if not frame.empty and "work_id" in frame.columns:
            for position, value in enumerate(frame["work_id"].tolist()):
                work_id = str(value or "").strip()
                if work_id:
                    self.positions[work_id] = position
                    self.normalized_positions.setdefault(work_id.lower().replace(" ", "-"), work_id)
                    self.tail_positions.setdefault(work_id.rsplit("/", 1)[-1], work_id)

    def get(self, work_id, default=None):
        clean_id = str(work_id or "").strip()
        if clean_id not in self.positions:
            return default
        if clean_id not in self.cache:
            self.cache[clean_id] = clean_record_for_json(self.frame.iloc[self.positions[clean_id]].to_dict())
        return self.cache[clean_id]

    def items(self):
        for work_id in self.positions:
            yield work_id, self.get(work_id)

    def get_by_tail(self, tail_id, default=None):
        work_id = self.tail_positions.get(str(tail_id or "").strip())
        return self.get(work_id, default) if work_id else default

    def id_by_tail(self, tail_id):
        return self.tail_positions.get(str(tail_id or "").strip())

    def get_normalized(self, normalized_id, default=None):
        work_id = self.normalized_positions.get(str(normalized_id or "").strip().lower())
        return self.get(work_id, default) if work_id else default

    def id_by_normalized(self, normalized_id):
        return self.normalized_positions.get(str(normalized_id or "").strip().lower())

    def __len__(self):
        return len(self.positions)


class LazyDuplicateIndex:
    """Index duplicate candidates by work ID without cleaning all pair rows."""

    def __init__(self, frame: pd.DataFrame):
        self.frame = frame
        self.positions = {}
        if frame.empty:
            return
        for column in ("work_id_1", "work_id_2"):
            if column not in frame.columns:
                continue
            for position, value in enumerate(frame[column].tolist()):
                work_id = str(value or "").strip()
                if work_id:
                    self.positions.setdefault(work_id, set()).add(position)

    def get(self, work_id, default=None):
        clean_id = str(work_id or "").strip()
        positions = self.positions.get(clean_id)
        if not positions:
            return default
        return [clean_record_for_json(self.frame.iloc[position].to_dict()) for position in sorted(positions)]


class LazyExpenditureIndex:
    """Index expenditure rows by work ID and clean only requested trips."""

    def __init__(self, frame: pd.DataFrame):
        self.frame = frame
        self.positions = {}
        if not frame.empty and "work_id" in frame.columns:
            for position, value in enumerate(frame["work_id"].tolist()):
                work_id = str(value or "").strip()
                if work_id:
                    self.positions.setdefault(work_id, []).append(position)

    def get(self, work_id, default=None):
        clean_id = str(work_id or "").strip()
        positions = self.positions.get(clean_id)
        if not positions:
            return default
        trips = []
        for position in positions:
            row = self.frame.iloc[position].to_dict()
            trips.append(clean_record_for_json({
                "work_id": clean_id,
                "expenditure_date": row.get("expenditure_date") or row.get("Expenditure Date"),
                "expenditure_amount": row.get("expenditure_amount") if row.get("expenditure_amount") is not None else row.get("Fund Disbursed Amount ( ₹ )"),
                "payment_status": row.get("payment_status") or row.get("Payment Status"),
            }))
        trips.sort(key=lambda item: str(item.get("expenditure_date") or ""))
        for number, trip in enumerate(trips, start=1):
            trip["trip_number"] = number
        return trips


def _read_master_frame(path: str) -> pd.DataFrame:
    """Load the scalar analytical fields used by API/UI routes.

    The master Parquet also contains large nested diagnostic arrays. Those
    fields are not required by the API response contracts and loading them
    makes the first request unnecessarily slow and memory-heavy.
    """
    try:
        import pyarrow.parquet as parquet
        import pyarrow.types as arrow_types
        schema = parquet.ParquetFile(path).schema_arrow
        columns = [
            field.name for field in schema
            if not arrow_types.is_nested(field.type) and not arrow_types.is_null(field.type)
        ]
        # The master retains raw export columns for offline analysis, but
        # returning both ``State`` and canonical ``state`` (and similar pairs)
        # creates ambiguous JSON objects for strict clients.
        raw_aliases = {
            "Sr. No.", "Work category", "Work", "State", "IDA",
            "Hon'ble Members of Parliament", "Constituency", "Work description",
            "Recommended date", "Sanction Date", "Sanction Amount ( ₹ )", "Work Status",
            "category_model_scores", "risk_evidence", "explainable_audit_summary",
            "explanation", "financial_explanation", "risk_description",
            "financial_supporting_details", "schedule_explanation", "recommended_action",
            "recommended_reviewer_action", "compliance_explanation", "completion_explanation",
            "financial_why_it_matters", "schedule_supporting_details", "material_quantities",
        }
        columns = [column for column in columns if column not in raw_aliases]
        return pd.read_parquet(path, columns=columns)
    except Exception:
        return pd.read_parquet(path)


def get_data():
    master_p = os.path.join(FEATURES_DIR, "master_project_risk_scores.parquet")
    master_mtime = os.path.getmtime(master_p) if os.path.exists(master_p) else None
    if _DATA_CACHE.get("_master_mtime") != master_mtime:
        _DATA_CACHE.clear()
        _DATA_CACHE["_master_mtime"] = master_mtime
    if "master" not in _DATA_CACHE:
        try:
            if os.path.exists(master_p):
                df = _read_master_frame(master_p)
            else:
                df = pd.DataFrame()
        except Exception:
            df = pd.DataFrame()
        _DATA_CACHE["master"] = df

        # Build only a lightweight ID-to-row index. Individual records are
        # cleaned when a detail endpoint actually requests them.
        _DATA_CACHE["work_index"] = LazyWorkIndex(df)

    if "duplicates" not in _DATA_CACHE:
        dup_p = os.path.join(FEATURES_DIR, "duplicate_work_candidates.parquet")
        try:
            if os.path.exists(dup_p):
                dups = pd.read_parquet(dup_p)
            else:
                dups = pd.DataFrame()
        except Exception:
            dups = pd.DataFrame()
        _DATA_CACHE["duplicates"] = dups

        _DATA_CACHE["dup_index"] = LazyDuplicateIndex(dups)

    if "duplicate_clusters" not in _DATA_CACHE:
        cluster_p = os.path.join(FEATURES_DIR, "duplicate_work_clusters.parquet")
        try:
            clusters = pd.read_parquet(cluster_p) if os.path.exists(cluster_p) else pd.DataFrame()
        except Exception:
            clusters = pd.DataFrame()
        _DATA_CACHE["duplicate_clusters"] = clusters

    if "constituency_compliance" not in _DATA_CACHE:
        constituency_p = os.path.join(FEATURES_DIR, "constituency_compliance_analysis.parquet")
        try:
            _DATA_CACHE["constituency_compliance"] = (
                pd.read_parquet(constituency_p) if os.path.exists(constituency_p) else pd.DataFrame()
            )
        except Exception:
            _DATA_CACHE["constituency_compliance"] = pd.DataFrame()

    benchmark_p = os.path.join(FEATURES_DIR, "financial_peer_benchmarks.parquet")
    benchmark_mtime = os.path.getmtime(benchmark_p) if os.path.exists(benchmark_p) else None
    if _DATA_CACHE.get("_benchmark_mtime") != benchmark_mtime:
        _DATA_CACHE.pop("financial_peer_benchmarks", None)
        _DATA_CACHE["_benchmark_mtime"] = benchmark_mtime
    if "financial_peer_benchmarks" not in _DATA_CACHE:
        try:
            _DATA_CACHE["financial_peer_benchmarks"] = pd.read_parquet(benchmark_p) if os.path.exists(benchmark_p) else pd.DataFrame()
        except Exception:
            _DATA_CACHE["financial_peer_benchmarks"] = pd.DataFrame()

    if "t1" not in _DATA_CACHE:
        t1_p = os.path.join(PROCESSED_DIR, "t1_allocated_limits.parquet")
        try:
            _DATA_CACHE["t1"] = pd.read_parquet(t1_p) if os.path.exists(t1_p) else pd.DataFrame()
        except Exception:
            _DATA_CACHE["t1"] = pd.DataFrame()

    if "t7" not in _DATA_CACHE:
        t7_p = os.path.join(PROCESSED_DIR, "t7_calamity_consents.parquet")
        try:
            _DATA_CACHE["t7"] = pd.read_parquet(t7_p) if os.path.exists(t7_p) else pd.DataFrame()
        except Exception:
            _DATA_CACHE["t7"] = pd.DataFrame()

    if "expenditure_trips_index" not in _DATA_CACHE:
        t6_p = os.path.join(PROCESSED_DIR, "t6_expenditure.parquet")
        try:
            t6 = pd.read_parquet(t6_p) if os.path.exists(t6_p) else pd.DataFrame()
        except Exception:
            t6 = pd.DataFrame()
        _DATA_CACHE["expenditure_trips_index"] = LazyExpenditureIndex(t6)

    return _DATA_CACHE


def _read_overview_data() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load only the columns required by the landing-dashboard summary.

    The complete master table has 159 columns and occupies nearly 500 MB when
    decoded by pandas.  That exceeds the memory available to free hosting
    instances before any aggregation can run.  The overview response needs a
    small, explicit projection instead.
    """
    master_path = os.path.join(FEATURES_DIR, "master_project_risk_scores.parquet")
    master_columns = [
        "work_id", "sanction_amount", "effective_expenditure", "completion_date",
        "overall_risk_level", "overdue_days", "state", "financial_risk_score",
        "compliance_risk_score", "duplicate_risk_score", "schedule_risk_score",
        "overall_risk_score", "work_category", "is_financial_outlier",
        "historical_sample_size", "historical_unit_price_count",
    ]
    try:
        master = pd.read_parquet(master_path, columns=master_columns) if os.path.exists(master_path) else pd.DataFrame()
    except Exception:
        master = pd.DataFrame()

    def read_columns(filename: str, columns: list[str]) -> pd.DataFrame:
        path = os.path.join(FEATURES_DIR if filename.startswith("duplicate_") else PROCESSED_DIR, filename)
        try:
            return pd.read_parquet(path, columns=columns) if os.path.exists(path) else pd.DataFrame()
        except Exception:
            return pd.DataFrame()

    duplicates = read_columns("duplicate_work_candidates.parquet", ["state"])
    allocated = read_columns("t1_allocated_limits.parquet", ["allocated_amount"])
    calamity = read_columns("t7_calamity_consents.parquet", ["consent_amount"])
    return master, duplicates, allocated, calamity

def clean_record_for_json(record):
    """Recursively convert pandas/NumPy values into strict JSON values.

    Parquet object columns can deserialize as NumPy arrays containing nested
    dictionaries (for example ``risk_reasons`` and
    ``compliance_rule_results``).  Returning those objects directly lets
    FastAPI's encoder see an unsupported array and produces a 500 response.
    Keeping the conversion here centralizes serialization for every endpoint.
    """
    def clean_value(value):
        if value is None or value is pd.NaT or value is pd.NA:
            return None
        if isinstance(value, (pd.Timestamp, datetime, date, np.datetime64)):
            try:
                if pd.isna(value):
                    return None
            except (TypeError, ValueError):
                pass
            return pd.Timestamp(value).strftime('%Y-%m-%d')
        if isinstance(value, np.ndarray):
            return [clean_value(item) for item in value.tolist()]
        if isinstance(value, dict):
            return {str(key): clean_value(item) for key, item in value.items()}
        if isinstance(value, (list, tuple, set)):
            return [clean_value(item) for item in value]
        if isinstance(value, np.bool_):
            return bool(value)
        if isinstance(value, np.integer):
            return int(value)
        if isinstance(value, (np.floating, float)):
            return float(value) if np.isfinite(value) else None
        if isinstance(value, (str, int, bool)):
            return value
        try:
            null_value = pd.isna(value)
            if np.isscalar(null_value) and bool(null_value):
                return None
        except (TypeError, ValueError):
            pass
        return str(value)

    return {str(key): clean_value(value) for key, value in record.items()}


def _analytics_metadata() -> dict:
    sync = get_automation_status()
    data_version = sync.get("data_version") or sync.get("current_snapshot_id") or "UNKNOWN"
    analysis_version = sync.get("analysis_version") or "UNKNOWN"
    return {
        "data_version": data_version,
        "analysis_version": analysis_version,
        "generated_at": datetime.now().astimezone().isoformat(),
        "last_successful_sync": sync.get("last_successful_sync"),
        "analysis_generated_at": sync.get("analysis_generated_at"),
        "stale_analysis": (
            analysis_version not in {"UNKNOWN", None}
            and data_version not in {"UNKNOWN", None}
            and analysis_version != data_version
        ),
    }

@app.get("/api/health")
def health_check():
    master_p = os.path.join(FEATURES_DIR, "master_project_risk_scores.parquet")
    total_projects = 0
    try:
        if os.path.exists(master_p):
            total_projects = len(pd.read_parquet(master_p, columns=["work_id"]))
    except Exception:
        total_projects = 0
    return {
        "status": "healthy",
        "total_projects_loaded": total_projects
    }

@app.get("/api/overview")
def get_national_overview():
    master, duplicate_counts, t1, t7 = _read_overview_data()
    
    total_allocation = float(t1["allocated_amount"].sum()) if len(t1) > 0 else 0.0
    total_sanctioned = float(master["sanction_amount"].fillna(0).sum())
    total_disbursed = float(master["effective_expenditure"].fillna(0).sum())
    calamity_consents_total = float(t7["consent_amount"].sum()) if len(t7) > 0 else 0.0
    
    total_works = len(master)
    completed_works = int(master["completion_date"].notnull().sum()) if "completion_date" in master.columns else 0
    
    risk_counts = master["overall_risk_level"].value_counts().to_dict()
    med_cnt = int(risk_counts.get("MEDIUM", 0))
    high_cnt = int(risk_counts.get("HIGH", 0))
    crit_cnt = int(risk_counts.get("CRITICAL", 0))
    overdue_works = int((pd.to_numeric(master["overdue_days"], errors="coerce").fillna(0) > 0).sum()) if "overdue_days" in master.columns else 0
        
    total_review_cases = med_cnt + high_cnt + crit_cnt
    
    # State-level aggregation for the GIS view.  Ignore blank source-state
    # rows so the API represents the same 36 States/UTs as the map.
    state_source = master[master["state"].fillna("").astype(str).str.strip().ne("")].copy()
    state_agg = state_source.groupby("state").agg(
        total_works=("work_id", "count"),
        total_sanctioned=("sanction_amount", "sum"),
        total_disbursed=("effective_expenditure", "sum"),
        high_risk_works=("overall_risk_level", lambda x: (x.isin(["MEDIUM", "HIGH", "CRITICAL"])).sum()),
        critical_works=("overall_risk_level", lambda x: (x == "CRITICAL").sum()),
        average_risk_score=("overall_risk_score", "mean"),
    ).reset_index().sort_values("high_risk_works", ascending=False)

    def state_risk_level(score):
        if score >= 85:
            return "CRITICAL"
        if score >= 65:
            return "HIGH"
        if score >= 35:
            return "MEDIUM"
        return "LOW"

    state_agg["risk_level"] = state_agg["average_risk_score"].fillna(0).map(state_risk_level)
    state_agg["risk_percentage"] = (
        state_agg["high_risk_works"] / state_agg["total_works"].replace(0, np.nan) * 100
    ).fillna(0).round(1)

    for label, column in (
        ("financial_risk_works", "financial_risk_score"),
        ("compliance_risk_works", "compliance_risk_score"),
        ("duplicate_risk_works", "duplicate_risk_score"),
        ("schedule_risk_works", "schedule_risk_score"),
    ):
        if column in state_source.columns:
            counts = (
                pd.to_numeric(state_source[column], errors="coerce")
                .fillna(0)
                .ge(35)
                .groupby(state_source["state"])
                .sum()
            )
            state_agg[label] = state_agg["state"].map(counts).fillna(0).astype(int)
        else:
            state_agg[label] = 0

    # Duplicate candidates are the only duplicate-specific quantity available
    # in the current feature store.  Do not label overall high-risk works as
    # duplicate/audit cases in the GIS panel.
    if not duplicate_counts.empty and "state" in duplicate_counts.columns:
        duplicate_counts = duplicate_counts[duplicate_counts["state"].fillna("").astype(str).str.strip().ne("")]
        duplicate_counts = duplicate_counts.groupby("state").size()
        state_agg["duplicate_candidate_pairs"] = state_agg["state"].map(duplicate_counts).fillna(0).astype(int)
    else:
        state_agg["duplicate_candidate_pairs"] = 0
    
    state_list = [clean_record_for_json(r) for r in state_agg.to_dict(orient="records")]
    
    # Category-level aggregation
    cat_agg = master.groupby("work_category").agg(
        total_works=("work_id", "count"),
        total_sanctioned=("sanction_amount", "sum"),
        high_risk_works=("overall_risk_level", lambda x: (x.isin(["MEDIUM", "HIGH", "CRITICAL"])).sum())
    ).reset_index().sort_values("high_risk_works", ascending=False)
    
    cat_list = [clean_record_for_json(r) for r in cat_agg.to_dict(orient="records")]

    financial_outlier_mask = master.get("is_financial_outlier", pd.Series(False, index=master.index)).fillna(False).astype(bool)
    historical_available = pd.to_numeric(master.get("historical_sample_size", pd.Series(0, index=master.index)), errors="coerce").fillna(0).ge(2)
    unit_available = pd.to_numeric(master.get("historical_unit_price_count", pd.Series(0, index=master.index)), errors="coerce").fillna(0).ge(2)
    financial_summary = {
        "flagged_financial_outliers": int(financial_outlier_mask.sum()),
        "historical_comparison_available": int(historical_available.sum()),
        "unit_price_comparisons": int(unit_available.sum()),
    }
    
    return {
        "summary": {
            "total_allocated_funds": total_allocation,
            "total_sanctioned_amount": total_sanctioned,
            "total_disbursed_amount": total_disbursed,
            "calamity_consents_total": calamity_consents_total,
            "total_works": total_works,
            "completed_works": completed_works,
            "high_risk_works": total_review_cases,
            "critical_works": crit_cnt,
            "overdue_works": overdue_works
        },
        "risk_distribution": {
            "LOW": int(risk_counts.get("LOW", 0)),
            "MEDIUM": med_cnt,
            "HIGH": high_cnt,
            "CRITICAL": crit_cnt
        },
        "top_states": state_list[:10],
        "state_metrics": state_list,
        "financial_summary": financial_summary,
        "category_distribution": cat_list[:8],
        "metadata": _analytics_metadata(),
    }


@app.get("/api/analytics/overview")
def get_analytics_overview():
    """Versioned analytics contract used by charts and external reviewers."""
    return get_national_overview()


def _normalise_state_key(value: object) -> str:
    text = str(value or "").upper().replace("&", " AND ")
    return " ".join("".join(char if char.isalnum() else " " for char in text).split())


def _state_frame(master: pd.DataFrame, state: str | None) -> pd.DataFrame:
    if master.empty or "state" not in master.columns:
        return master.iloc[0:0]
    frame = master[master["state"].fillna("").astype(str).str.strip().ne("")].copy()
    if state and state.strip():
        requested = _normalise_state_key(state)
        aliases = {
            "DADRA AND NAGAR HAVELI": "THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU",
        }
        requested = aliases.get(requested, requested)
        frame = frame[frame["state"].map(_normalise_state_key).eq(requested)]
    return frame


@app.get("/api/analytics/states")
def get_state_analytics():
    """Return state risk statistics derived from the individual work records."""
    overview = get_national_overview()
    return {
        "metadata": overview.get("metadata", _analytics_metadata()),
        "states": overview.get("state_metrics", []),
        "methodology": {
            "source": "individual work records in the active validated dataset",
            "flag_threshold": 35,
            "risk_percentage": "works with any dimension score >= 35 divided by total works",
        },
    }


@app.get("/api/analytics/states/{state}/highest-risk")
def get_highest_risk_works_by_state(
    state: str,
    limit: int = Query(10, ge=1, le=100),
):
    """Return actionable highest-risk work records for one state."""
    frame = _state_frame(get_data()["master"], state)
    if frame.empty:
        return {
            "state": state,
            "total_works": 0,
            "records": [],
            "metadata": _analytics_metadata(),
        }

    dimensions = {
        "financial": "financial_risk_score",
        "compliance": "compliance_risk_score",
        "duplicate": "duplicate_risk_score",
        "schedule": "schedule_risk_score",
    }
    for column in dimensions.values():
        if column not in frame.columns:
            frame[column] = 0
        frame[column] = pd.to_numeric(frame[column], errors="coerce").fillna(0)
    for key, column in dimensions.items():
        frame[key] = frame[column]
    frame["priority_score"] = frame[list(dimensions.values())].max(axis=1)
    frame["risk_level"] = frame["priority_score"].map(
        lambda value: "CRITICAL" if value >= 85 else "HIGH" if value >= 65 else "MEDIUM" if value >= 35 else "LOW"
    )
    score_to_type = {column: key for key, column in dimensions.items()}
    frame["risk_type"] = frame[list(dimensions.values())].idxmax(axis=1).map(score_to_type)

    def explanation(row):
        field = dimensions.get(row["risk_type"])
        if row["risk_type"] == "financial":
            return row.get("financial_explanation") or "The work was flagged for financial review."
        if row["risk_type"] == "compliance":
            return row.get("compliance_explanation") or "The work was flagged for compliance review."
        if row["risk_type"] == "schedule":
            return row.get("schedule_explanation") or "The work was flagged for schedule review."
        return "The work is part of a possible duplicate or split-work cluster requiring review."

    frame = frame.sort_values(["priority_score", "composite_risk_score"], ascending=False).head(limit)
    records = []
    for row in frame.to_dict(orient="records"):
        records.append(clean_record_for_json({
            "work_id": row.get("work_id"),
            "short_work_name": str(row.get("description") or "")[:180],
            "constituency": row.get("constituency"),
            "state": row.get("state"),
            "sector": row.get("main_sector") or row.get("work_category"),
            "risk_type": row.get("risk_type"),
            "risk_level": row.get("risk_level"),
            "risk_score": row.get("priority_score"),
            "composite_risk_score": row.get("composite_risk_score"),
            "risk_explanation": explanation(row),
            "original_record": {
                "recommended_date": row.get("recommended_date"),
                "sanction_date": row.get("sanction_date"),
                "completion_date": row.get("completion_date"),
                "sanction_amount": row.get("sanction_amount"),
                "effective_expenditure": row.get("effective_expenditure"),
                "work_status": row.get("work_status"),
            },
        }))
    return {
        "state": state,
        "total_works": int(len(_state_frame(get_data()["master"], state))),
        "records": records,
        "metadata": _analytics_metadata(),
    }


@app.get("/api/analytics/original-records")
def get_original_analysis_records(
    state: str = None,
    risk_type: str = Query(None, pattern="^(financial|compliance|duplicate|schedule)$"),
    risk_level: str = Query(None, pattern="^(LOW|MEDIUM|HIGH|CRITICAL)$"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    """Expose original values alongside the derived reason for a chart finding."""
    if not isinstance(risk_type, str):
        risk_type = None
    if not isinstance(risk_level, str):
        risk_level = None
    frame = _state_frame(get_data()["master"], state)
    dimension_map = {
        "financial": "financial_risk_score",
        "compliance": "compliance_risk_score",
        "duplicate": "duplicate_risk_score",
        "schedule": "schedule_risk_score",
    }
    if risk_type:
        column = dimension_map[risk_type]
        values = pd.to_numeric(frame.get(column, pd.Series(0, index=frame.index)), errors="coerce").fillna(0)
        frame = frame[values.ge(35)]
    if risk_level:
        frame = frame[frame.get("overall_risk_level", pd.Series("", index=frame.index)).fillna("").eq(risk_level)]
    total = len(frame)
    frame = frame.sort_values("composite_risk_score", ascending=False, na_position="last")
    start, end = (page - 1) * limit, page * limit
    original_fields = [
        "work_id", "state", "constituency", "mp_name", "description", "work_category",
        "main_sector", "recommended_date", "sanction_date", "completion_date",
        "work_status", "sanction_amount", "effective_expenditure",
    ]
    analysis_fields = [
        "financial_risk_score", "compliance_risk_score", "duplicate_risk_score",
        "schedule_risk_score", "composite_risk_score", "overall_risk_level",
        "financial_explanation", "financial_what_happened", "financial_why_it_matters",
        "compliance_explanation", "compliance_what_happened", "compliance_why_it_matters",
        "schedule_explanation", "schedule_what_happened", "schedule_why_it_matters",
        "duplicate_explanation", "duplicate_what_happened", "duplicate_why_it_matters",
        "triggered_rules",
    ]
    records = []
    for row in frame.iloc[start:end].to_dict(orient="records"):
        records.append(clean_record_for_json({
            "original": {field: row.get(field) for field in original_fields},
            "analysis": {field: row.get(field) for field in analysis_fields},
        }))
    return {
        "total": int(total),
        "page": page,
        "limit": limit,
        "records": records,
        "metadata": _analytics_metadata(),
    }


@app.get("/api/state-risk-summary")
def get_state_risk_summary(state: str = Query(..., min_length=1)):
    """Return the live, four-engine risk profile for one selected state/UT."""
    master_path = os.path.join(FEATURES_DIR, "master_project_risk_scores.parquet")
    state_cols = [
        "state", "financial_risk_score", "compliance_risk_score",
        "duplicate_risk_score", "schedule_risk_score"
    ]
    try:
        master = pd.read_parquet(master_path, columns=state_cols) if os.path.exists(master_path) else pd.DataFrame()
    except Exception:
        master = pd.DataFrame()

    def state_key(value):
        value = str(value or "").upper().replace("&", " AND ")
        return " ".join("".join(char if char.isalnum() else " " for char in value).split())

    requested_key = state_key(state)
    # The source dataset stores this UT under its combined official name.
    aliases = {
        "DADRA AND NAGAR HAVELI": "THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU",
    }
    requested_key = aliases.get(requested_key, requested_key)

    if master.empty or "state" not in master.columns:
        return {
            "state": state,
            "total_works": 0,
            "signals": [],
            "dominant_signal": None,
            "metadata": _analytics_metadata(),
        }

    state_keys = master["state"].map(state_key)
    frame = master.loc[state_keys == requested_key]

    dimensions = [
        ("financial", "Financial", "financial_risk_score"),
        ("compliance", "Compliance", "compliance_risk_score"),
        ("duplicate", "Duplicate", "duplicate_risk_score"),
        ("schedule", "Schedule", "schedule_risk_score"),
    ]
    signals = []
    for key, label, column in dimensions:
        scores = pd.to_numeric(frame[column], errors="coerce").fillna(0) if column in frame.columns else pd.Series(dtype=float)
        signals.append({
            "key": key,
            "label": label,
            "average_score": round(float(scores.mean()), 1) if len(scores) else 0.0,
            "flagged_works": int((scores >= 35).sum()) if len(scores) else 0,
        })

    dominant_signal = (
        max(
            signals,
            key=lambda signal: (signal["average_score"], signal["flagged_works"]),
            default=None,
        )
        if len(frame)
        else None
    )

    return {
        "state": state,
        "total_works": int(len(frame)),
        "signals": signals,
        "dominant_signal": dominant_signal,
        "metadata": _analytics_metadata(),
    }

@app.get("/api/mp-intelligence")
def get_mp_intelligence(
    state: str = None,
    constituency: str = None,
    mp_name: str = None
):
    data = get_data()
    master = data["master"]
    
    # Cascading Dropdown List Helpers
    filtered_df = master.copy()
    if state and state.strip():
        filtered_df = filtered_df[filtered_df["state"].str.upper() == state.strip().upper()]
    
    available_constituencies = sorted([str(c) for c in filtered_df["constituency"].dropna().unique() if str(c).strip()])
    
    if constituency and constituency.strip():
        filtered_df = filtered_df[filtered_df["constituency"].str.upper() == constituency.strip().upper()]
        
    available_mps = sorted([str(m) for m in filtered_df["mp_name"].dropna().unique() if str(m).strip()])
    
    if mp_name and mp_name.strip():
        filtered_df = filtered_df[filtered_df["mp_name"].str.upper() == mp_name.strip().upper()]
        
    # Portfolio Metrics for selected entity
    total_works = len(filtered_df)
    total_sanctioned = float(filtered_df["sanction_amount"].fillna(0).sum())
    total_expenditure = float(filtered_df["effective_expenditure"].fillna(0).sum())
    
    completed_cnt = int(filtered_df["completion_date"].notnull().sum()) if "completion_date" in filtered_df.columns else 0
    ongoing_cnt = total_works - completed_cnt
    
    # Priority Audit Queue for selected entity
    suspicious_works = filtered_df[filtered_df["composite_risk_score"] >= 35].sort_values("composite_risk_score", ascending=False).head(20)
    suspicious_records = [clean_record_for_json(r) for r in suspicious_works.to_dict(orient="records")]
    
    return {
        "selected_filters": {
            "state": state,
            "constituency": constituency,
            "mp_name": mp_name
        },
        "available_constituencies": available_constituencies[:50],
        "available_mps": available_mps[:50],
        "portfolio_summary": {
            "total_works": total_works,
            "completed_works": completed_cnt,
            "ongoing_works": ongoing_cnt,
            "total_sanctioned": total_sanctioned,
            "total_expenditure": total_expenditure,
            "utilization_rate": round((total_expenditure / (total_sanctioned + 1e-5)) * 100, 1)
        },
        "suspicious_works": suspicious_records,
        "metadata": _analytics_metadata(),
    }

@app.get("/api/schedule-risk")
def get_schedule_risk_analytics(
    state: str = None,
    constituency: str = None,
    mp_name: str = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200)
):
    data = get_data()
    master = data["master"]
    
    df = master[master["schedule_risk_score"] >= 35].copy()
    
    if state and state.strip():
        df = df[df["state"].str.upper() == state.strip().upper()]
    if constituency and constituency.strip():
        df = df[df["constituency"].str.upper() == constituency.strip().upper()]
    if mp_name and mp_name.strip():
        df = df[df["mp_name"].fillna("").str.upper() == mp_name.strip().upper()]
        
    df_sched = df.sort_values("schedule_risk_score", ascending=False)
    total_records = len(df_sched)
    
    start = (page - 1) * limit
    end = start + limit
    paginated = df_sched.iloc[start:end]
    records = [clean_record_for_json(r) for r in paginated.to_dict(orient="records")]
    
    risk_levels = df["schedule_risk_level"].value_counts().to_dict() if "schedule_risk_level" in df.columns else {}
    avg_gap = float(df["progress_gap_pct"].fillna(0).mean()) if "progress_gap_pct" in df.columns and len(df) > 0 else 0.0
    
    return {
        "total": total_records,
        "page": page,
        "limit": limit,
        "summary": {
            "average_progress_gap_pct": round(avg_gap, 1),
            "high_schedule_risk_works": int(risk_levels.get("HIGH", 0) + risk_levels.get("CRITICAL", 0)),
            "schedule_risk_distribution": {
                "LOW": int(risk_levels.get("LOW", 0)),
                "MEDIUM": int(risk_levels.get("MEDIUM", 0)),
                "HIGH": int(risk_levels.get("HIGH", 0)),
                "CRITICAL": int(risk_levels.get("CRITICAL", 0))
            }
        },
        "records": records,
        "metadata": _analytics_metadata(),
    }

@app.get("/api/sync/status")
def get_sync_status():
    return get_automation_status()


@app.get("/api/sync/health")
def get_sync_source_health():
    """Return source availability and request telemetry without secrets."""
    return get_sync_health()


@app.post("/api/sync/start")
def start_sync():
    """Queue a non-blocking official-data synchronization job."""
    try:
        return start_sync_job()
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="A synchronization job could not be started. The previous validated dataset remains available.",
        )

@app.get("/api/sync/history")
def get_sync_history():
    log_file = os.path.join(DATA_DIR, "sync_history.json")
    if os.path.exists(log_file):
        try:
            with open(log_file, 'r') as f:
                history = json.load(f)
            # Sync deltas can contain pandas NaN values (for example when a
            # source row has no state name). Python's JSON loader accepts NaN,
            # but Starlette's strict response encoder correctly rejects it.
            # Normalize the complete nested history before returning it.
            return [clean_record_for_json(entry) for entry in history] if isinstance(history, list) else []
        except Exception:
            pass
    return []


class SyncPreviewRequest(BaseModel):
    state: str | None = None
    constituency: str | None = None
    work_ids: list[str] = Field(default_factory=list)
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=50, ge=1, le=200)


def _review_rows(diff: dict, request: SyncPreviewRequest) -> list[dict]:
    rows = []
    for table_diff in diff.get("tables", {}).values():
        for kind in ("new", "modified", "removed"):
            for item in table_diff.get(kind, []):
                item = dict(item)
                item["change_type"] = kind.upper()
                row = item.get("new") or item.get("old") or {}
                state = str(row.get("state") or "").upper()
                constituency = str(row.get("constituency") or "").upper()
                key = str(item.get("composite_key") or "")
                if request.state and request.state.upper() not in state:
                    continue
                if request.constituency and request.constituency.upper() not in constituency:
                    continue
                if request.work_ids and not any(work_id.strip() in key for work_id in request.work_ids):
                    continue
                rows.append(item)
    return rows


@app.post("/api/sync/preview-diff")
def sync_preview(request: SyncPreviewRequest):
    request_data = request.model_dump(exclude_none=True) if hasattr(request, "model_dump") else request.dict(exclude_none=True)
    result = preview_diff(request_data)
    if not result.get("success"):
        fetch_error = result.get("fetch", {}).get("error") or "; ".join(result.get("fetch", {}).get("errors", []))
        raise HTTPException(status_code=502, detail=fetch_error or "Official REST sync failed")
    rows = _review_rows(result["diff"], request)
    start = (request.page - 1) * request.limit
    result["review"] = {"total": len(rows), "page": request.page, "limit": request.limit, "records": rows[start:start + request.limit]}
    return result


class SyncCommitRequest(BaseModel):
    preview_token: str


@app.post("/api/sync/commit-diff")
def sync_commit(request: SyncCommitRequest):
    try:
        result = commit_preview(request.preview_token)
        _DATA_CACHE.clear()
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Sync commit failed safely: {exc}")


@app.post("/api/sync/run-now")
def sync_run_now():
    """Compatibility alias for the non-blocking Sync Now action."""
    try:
        return start_sync_job()
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="A synchronization job could not be started. The previous validated dataset remains available.",
        )


@app.post("/api/sync/reset")
def sync_reset():
    """Reset or clear an interrupted/stale synchronization job."""
    return reset_sync_job()


@app.get("/api/sync/training-status")
def sync_training_status():
    return TRAINING_MANAGER.status()


@app.post("/api/sync/training/start")
def start_training():
    """Queue analysis independently of data synchronization."""
    current = TRAINING_MANAGER.status()
    if current.get("status") in {"QUEUED", "RUNNING"}:
        return current
    sync_status = get_automation_status()
    snapshot_id = sync_status.get("current_snapshot_id")
    if not snapshot_id or snapshot_id == "NONE":
        raise HTTPException(status_code=409, detail="Analysis cannot start until a validated dataset snapshot is available.")
    return TRAINING_MANAGER.start(snapshot_id, {"manual": True, "new_count": 0, "updated_count": 0, "removed_count": 0})

@app.get("/api/model/status")
def get_model_status():
    return MLflowTracker.get_status()

@app.get("/api/model/experiments")
def get_model_experiments():
    return MLflowTracker.get_status().get("runs", [])

@app.get("/api/analytics/material-context")
def get_material_context(work_id: str = Query(...)):
    """Return conservative material/benchmark context for one existing work."""
    data = get_data()
    record = data["work_index"].get(work_id.strip())
    if not record:
        raise HTTPException(status_code=404, detail=f"Work ID '{work_id}' not found.")
    frame = pd.DataFrame([record])
    result = analyze_material_context(frame, _BACKEND_ROOT).iloc[0].to_dict()
    return clean_record_for_json(result)

@app.get("/api/analytics/classification")
def get_classification(work_id: str = Query(...)):
    """Expose source-backed work classification without changing the UI contract."""
    data = get_data()
    record = data["work_index"].get(work_id.strip())
    if not record:
        raise HTTPException(status_code=404, detail=f"Work ID '{work_id}' not found.")
    frame = pd.DataFrame([record])
    if "work_category" not in frame:
        frame["work_category"] = ""
    result = classify_work_descriptions(frame).iloc[0].to_dict()
    return clean_record_for_json(result)

@app.get("/api/analytics/sector-cost")
def get_sector_cost(work_id: str = Query(...)):
    """Return the work's selected completed-work peer context."""
    data = get_data()
    record = data["work_index"].get(work_id.strip())
    if not record:
        raise HTTPException(status_code=404, detail=f"Work ID '{work_id}' not found.")
    financial_fields = [
        "comparison_state", "comparison_constituency", "comparison_scope", "comparison_level",
        "comparison_group_label", "comparison_sector", "comparison_subsector", "comparison_work_type",
        "comparison_peer_category", "peer_category", "peer_category_auto_generated",
        "original_effective_work_category",
        "unit_comparison_scope", "unit_price_comparison_eligible", "unit_price_skip_reason",
        "current_cost", "current_unit_price", "quantity_detected", "quantity_unit",
        "historical_cost_min", "historical_cost_max", "historical_cost_median", "historical_cost_count",
        "historical_unit_price_min", "historical_unit_price_max", "historical_unit_price_median",
        "historical_unit_price_count", "cost_comparison_status", "unit_comparison_status",
        "financial_explanation", "financial_what_happened", "financial_why_it_matters",
        "financial_supporting_details", "financial_risk_evidence", "financial_audit_interpretation",
    ]
    return clean_record_for_json({field: record.get(field) for field in financial_fields})


@app.get("/api/financial/benchmarks")
def get_financial_benchmarks(
    scope: str = None,
    state: str = None,
    constituency: str = None,
    main_sector: str = None,
    subsector: str = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    """Return auditable completed-work low/median/high peer statistics."""
    frame = get_data().get("financial_peer_benchmarks", pd.DataFrame()).copy()
    if frame.empty:
        return {"total": 0, "page": page, "limit": limit, "records": [], "available": {"states": [], "sectors": [], "subsectors": []}}
    for column, value in (("comparison_scope", scope), ("state", state), ("constituency", constituency), ("main_sector", main_sector), ("subsector", subsector)):
        if value and column in frame.columns:
            frame = frame[frame[column].fillna("").astype(str).str.upper().eq(value.strip().upper())]
    total = len(frame)
    sort_columns = [column for column in ["comparison_scope", "state", "constituency", "main_sector", "comparison_level", "subsector"] if column in frame.columns]
    if sort_columns:
        frame = frame.sort_values(sort_columns, kind="stable")
    start, end = (page - 1) * limit, page * limit
    source = get_data().get("financial_peer_benchmarks", pd.DataFrame())
    return {
        "total": total, "page": page, "limit": limit, "total_pages": int(np.ceil(total / limit)) if total else 0,
        "records": [clean_record_for_json(row) for row in frame.iloc[start:end].to_dict(orient="records")],
        "available": {
            "states": sorted(source.get("state", pd.Series(dtype=str)).dropna().astype(str).unique().tolist()),
            "sectors": sorted(source.get("main_sector", pd.Series(dtype=str)).dropna().astype(str).unique().tolist()),
            "subsectors": sorted(source.get("subsector", pd.Series(dtype=str)).dropna().astype(str).unique().tolist()),
        },
    }

@app.get("/api/sectors")
def get_sector_matrix():
    """Return classified sectors without exposing any price benchmark."""
    data = get_data()
    sectors = sorted({str(value).strip() for value in data["master"].get("main_sector", pd.Series(dtype=str)).dropna() if str(value).strip()})
    return {"sectors": sectors, "count": len(sectors)}

@app.get("/api/compliance/rules")
def get_compliance_rules():
    """Return source-backed rules with their work/constituency scope."""
    return {
        "source": GUIDELINE_SOURCE,
        "work_level_rules": [rule for rule in public_scope_matrix() if rule["scope"] == "WORK"],
        "constituency_level_rules": [rule for rule in public_scope_matrix() if rule["scope"] == "CONSTITUENCY"],
        "non_guideline_heuristics": [rule for rule in public_scope_matrix() if rule["scope"] == "NON_GUIDELINE_HEURISTIC"],
    }


@app.get("/api/compliance/constituency")
def get_constituency_compliance(
    state: str = None,
    constituency: str = None,
    mp_name: str = None,
    financial_year: str = None,
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=200),
):
    """Return aggregate compliance observations, never individual work flags."""
    data = get_data()
    frame = data.get("constituency_compliance", pd.DataFrame()).copy()
    if frame.empty:
        return {"total": 0, "page": page, "limit": limit, "records": []}
    for field, value in (("state", state), ("constituency", constituency), ("mp_name", mp_name), ("financial_year", financial_year)):
        if value and field in frame.columns:
            frame = frame[frame[field].fillna("").astype(str).str.upper().eq(value.strip().upper())]
    total = len(frame)
    sort_columns = [column for column in ["sc_status", "st_status", "state", "constituency"] if column in frame.columns]
    if sort_columns:
        frame = frame.sort_values(sort_columns, ascending=[True] * len(sort_columns))
    start, end = (page - 1) * limit, page * limit
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "records": [clean_record_for_json(row) for row in frame.iloc[start:end].to_dict(orient="records")],
    }


@app.get("/api/compliance/summary")
def get_compliance_summary():
    """Return counts for the work-level compliance order and its rule drivers."""
    master = get_data()["master"]
    if master.empty:
        return {"work_level_risk": 0, "critical": 0, "high": 0, "medium": 0, "needs_review": 0, "rule_counts": {}}
    score_values = master["compliance_risk_score"] if "compliance_risk_score" in master.columns else pd.Series(0, index=master.index)
    level_values = master["compliance_risk_level"] if "compliance_risk_level" in master.columns else pd.Series("LOW", index=master.index)
    scores = pd.to_numeric(score_values, errors="coerce").fillna(0)
    levels = level_values.fillna("LOW").astype(str).str.upper()
    rule_counts = {}
    if "triggered_rules" in master.columns:
        values = master["triggered_rules"].fillna("").astype(str).str.split(", ").explode()
        values = values[values.ne("")]
        rule_counts = {str(key): int(value) for key, value in values.value_counts().items()}
    return {
        "work_level_risk": int(scores.ge(20).sum()),
        "critical": int(levels.eq("CRITICAL").sum()),
        "high": int(levels.eq("HIGH").sum()),
        "medium": int(levels.eq("MEDIUM").sum()),
        "needs_review": int(scores.ge(20).sum()),
        "rule_counts": rule_counts,
        "constituency_observations": int(len(get_data().get("constituency_compliance", pd.DataFrame()))),
    }


def _normalize_work_status(value):
    return " ".join(str(value or "").strip().casefold().replace("_", " ").split())


def _work_status_aliases(value):
    normalized = _normalize_work_status(value)
    aliases = {
        "sanction": {"sanction", "sanctioned"},
        "sanctioned": {"sanction", "sanctioned"},
        "completed": {"completed", "work completed"},
        "work completed": {"completed", "work completed"},
        "partially completed": {"partially completed", "work partially completed"},
        "work partially completed": {"partially completed", "work partially completed"},
    }
    return aliases.get(normalized, {normalized})


def _canonical_source_work_id(value):
    """Extract the complete work ID from the raw source activity text."""
    text = str(value or "").strip()
    if not text or text.casefold() in {"nan", "none", "nat"}:
        return ""
    match = re.search(
        r"(WS\s*/\s*MP\d+\s*/\s*\d{4}-\d{4}\s*/\s*\d+)(?=\D|$)",
        text,
        flags=re.IGNORECASE,
    )
    if match:
        return re.sub(r"\s+", "", match.group(1))
    if text.upper().startswith("WS/"):
        return re.sub(r"\s+", "", text.split("-", 1)[0])
    return ""


def _source_work_id(row):
    for column in ("work_id", "WORK_ID", "ACTIVITY_NAME"):
        if column in row.index:
            value = _canonical_source_work_id(row.get(column))
            if value:
                return value
    return ""


def _source_work_ids(frame):
    """Vectorized counterpart used when building the complete-record cache."""
    candidates = pd.Series("", index=frame.index, dtype="object")
    for column in ("work_id", "WORK_ID", "ACTIVITY_NAME"):
        if column not in frame.columns:
            continue
        values = frame[column].fillna("").astype(str).str.strip()
        valid = values.str.contains(r"WS\s*/", case=False, regex=True, na=False)
        candidates = candidates.mask(candidates.eq("") & valid, values)
    pattern = r"(WS\s*/\s*MP\d+\s*/\s*\d{4}-\d{4}\s*/\s*\d+)(?=\D|$)"
    matched = candidates.str.extract(pattern, expand=False)
    fallback = candidates.str.replace(r"\s+", "", regex=True).str.split("-", n=1).str[0]
    return matched.fillna(fallback).fillna("").astype(str).str.replace(r"\s+", "", regex=True)


def _source_column(frame, names, default=""):
    for name in names:
        if name in frame.columns:
            return frame[name]
    return pd.Series(default, index=frame.index)


def _read_processed_source(data, cache_key, filename):
    if cache_key not in data:
        path = os.path.join(PROCESSED_DIR, filename)
        try:
            data[cache_key] = pd.read_parquet(path) if os.path.exists(path) else pd.DataFrame()
        except Exception:
            data[cache_key] = pd.DataFrame()
    return data[cache_key]


def _build_recommended_record_frame(source):
    if source.empty:
        return pd.DataFrame()
    frame = source.copy()
    frame["_canonical_work_id"] = _source_work_ids(frame)
    frame = frame[frame["_canonical_work_id"].ne("")].drop_duplicates("_canonical_work_id", keep="last")
    if frame.empty:
        return pd.DataFrame()
    output = pd.DataFrame(index=frame.index)
    output["work_id"] = frame["_canonical_work_id"]
    output["work_category"] = _source_column(frame, ["work_category", "WORK_CATEGORY"])
    output["state"] = _source_column(frame, ["state", "STATE_NAME"])
    output["constituency"] = _source_column(frame, ["constituency", "CONSTITUENCY"])
    output["mp_name"] = _source_column(frame, ["mp_name", "MP_NAME"])
    output["description"] = _source_column(frame, ["description", "WORK_DESCRIPTION"])
    output["recommended_date"] = _source_column(frame, ["recommended_date", "RECOMMENDATION_DATE"])
    output["sanction_date"] = _source_column(frame, ["sanction_date", "SANCTION_DATE"])
    output["sanction_amount"] = pd.to_numeric(_source_column(frame, ["sanction_amount", "SANCTION_AMOUNT"]), errors="coerce")
    output["work_status"] = _source_column(frame, ["work_status", "WORK_STAGE"], "Unknown")
    output["effective_expenditure"] = np.nan
    output["expenditure_count"] = 0
    output["record_source"] = "Recommended"
    return output.reset_index(drop=True)


def _build_expenditure_record_frame(source):
    if source.empty:
        return pd.DataFrame()
    frame = source.copy()
    frame["_canonical_work_id"] = _source_work_ids(frame)
    frame = frame[frame["_canonical_work_id"].ne("")].copy()
    if frame.empty:
        return pd.DataFrame()
    frame["_amount"] = pd.to_numeric(_source_column(frame, ["expenditure_amount", "FUND_DISBURSED_AMT"]), errors="coerce").fillna(0)
    summary = frame.groupby("_canonical_work_id", as_index=False).agg(
        effective_expenditure=("_amount", "sum"),
        expenditure_count=("_amount", "count"),
    )
    latest = frame.drop_duplicates("_canonical_work_id", keep="last").copy()
    output = pd.DataFrame(index=latest.index)
    output["work_id"] = latest["_canonical_work_id"]
    output["work_category"] = "Expenditure"
    output["state"] = _source_column(latest, ["state", "STATE_NAME"])
    output["constituency"] = _source_column(latest, ["constituency", "CONSTITUENCY"])
    output["mp_name"] = _source_column(latest, ["mp_name", "MP_NAME"])
    output["description"] = _source_column(latest, ["description", "ACTIVITY_NAME"])
    output["work_status"] = _source_column(latest, ["work_status", "WORK_STATUS"], "Expenditure")
    output["sanction_amount"] = np.nan
    output["recommended_date"] = pd.NaT
    output["sanction_date"] = pd.NaT
    output = output.reset_index(drop=True).merge(summary, left_on="work_id", right_on="_canonical_work_id", how="left")
    output = output.drop(columns=["_canonical_work_id"])
    output["record_source"] = "Expenditure"
    return output


def _all_records_frame(data):
    if "all_records" in data:
        return data["all_records"]

    master = data["master"].copy()
    master["work_id"] = master["work_id"].fillna("").astype(str).str.strip()
    master_ids = set(master["work_id"].loc[master["work_id"].ne("")])
    master["record_source"] = "Risk master / sanctioned"
    if "effective_expenditure" in master.columns:
        master["has_expenditure_record"] = pd.to_numeric(master["effective_expenditure"], errors="coerce").notna()
    else:
        master["has_expenditure_record"] = False

    recommended = _build_recommended_record_frame(
        _read_processed_source(data, "recommended_records_source", "t3_works_recommended.parquet")
    )
    expenditure = _build_expenditure_record_frame(
        _read_processed_source(data, "expenditure_records_source", "t6_expenditure.parquet")
    )

    recommended = recommended[~recommended["work_id"].isin(master_ids)] if not recommended.empty else recommended
    expenditure = expenditure[~expenditure["work_id"].isin(master_ids)] if not expenditure.empty else expenditure
    if not recommended.empty or not expenditure.empty:
        auxiliary = recommended.merge(expenditure, on="work_id", how="outer", suffixes=("", "_expenditure"))
        for column in ["work_category", "state", "constituency", "mp_name", "description", "work_status", "sanction_amount", "recommended_date", "sanction_date"]:
            expenditure_column = f"{column}_expenditure"
            if expenditure_column in auxiliary.columns:
                left = auxiliary[column]
                missing = left.isna() | left.astype(str).str.strip().isin({"", "nan", "None", "NaT"})
                auxiliary.loc[missing, column] = auxiliary.loc[missing, expenditure_column]
                auxiliary = auxiliary.drop(columns=[expenditure_column])
        for column in ["effective_expenditure", "expenditure_count"]:
            expenditure_column = f"{column}_expenditure"
            if expenditure_column in auxiliary.columns:
                left = auxiliary[column]
                missing = left.isna() | (pd.to_numeric(left, errors="coerce").fillna(0).eq(0) if column == "expenditure_count" else left.isna())
                auxiliary.loc[missing, column] = auxiliary.loc[missing, expenditure_column]
                auxiliary = auxiliary.drop(columns=[expenditure_column])
        has_expenditure = pd.to_numeric(auxiliary.get("effective_expenditure", pd.Series(index=auxiliary.index)), errors="coerce").notna()
        has_expenditure |= pd.to_numeric(auxiliary.get("expenditure_count", pd.Series(index=auxiliary.index)), errors="coerce").fillna(0).gt(0)
        auxiliary["has_expenditure_record"] = has_expenditure
        has_recommended = auxiliary["record_source"].eq("Recommended") if "record_source" in auxiliary else pd.Series(False, index=auxiliary.index)
        has_exp_source = auxiliary["record_source_expenditure"].notna() if "record_source_expenditure" in auxiliary else has_expenditure
        auxiliary["record_source"] = np.select(
            [has_recommended & has_exp_source, has_recommended, has_exp_source],
            ["Recommended + Expenditure", "Recommended", "Expenditure"],
            default="All-record source",
        )
        auxiliary = auxiliary.drop(columns=["record_source_expenditure"], errors="ignore")
        all_records = pd.concat([master, auxiliary], ignore_index=True, sort=False)
    else:
        all_records = master

    numeric_defaults = {
        "sanction_amount": 0,
        "effective_expenditure": 0,
        "financial_risk_score": 0,
        "duplicate_risk_score": 0,
        "compliance_risk_score": 0,
        "schedule_risk_score": 0,
        "composite_risk_score": 0,
    }
    for column, default in numeric_defaults.items():
        if column not in all_records.columns:
            all_records[column] = default
        all_records[column] = pd.to_numeric(all_records[column], errors="coerce").fillna(default)
    for column in ["state", "constituency", "work_category", "work_status", "description", "mp_name"]:
        if column not in all_records.columns:
            all_records[column] = ""
        all_records[column] = all_records[column].fillna("").astype(str)
    if "overall_risk_level" not in all_records.columns:
        all_records["overall_risk_level"] = "UNASSESSED"
    all_records["overall_risk_level"] = all_records["overall_risk_level"].fillna("UNASSESSED").astype(str).replace({"": "UNASSESSED"})
    if "has_expenditure_record" not in all_records.columns:
        all_records["has_expenditure_record"] = False
    all_records["has_expenditure_record"] = all_records["has_expenditure_record"].fillna(False).astype(bool)
    data["all_records"] = all_records
    data["all_work_index"] = LazyWorkIndex(all_records)
    return all_records

@app.get("/api/risk-monitor")
def get_risk_monitor_queue(
    state: str = None,
    constituency: str = None,
    work_status: str = None,
    category: str = None,
    severity: str = None,
    search: str = None,
    min_financial_risk: float = None,
    financial_only: bool = False,
    min_compliance_risk: float = None,
    sort_by: str = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200)
):
    data = get_data()
    df = data["master"].copy()
    
    if state and state.strip():
        df = df[df["state"].str.upper() == state.strip().upper()]
    if constituency and constituency.strip():
        df = df[df["constituency"].str.upper() == constituency.strip().upper()]
    if work_status and work_status.strip():
        status_series = df["work_status"].fillna("").map(_normalize_work_status)
        if _normalize_work_status(work_status) in {"not completed", "not completed / in progress"}:
            df = df[~status_series.isin({"work completed", "completed", "work partially completed", "partially completed"})]
        else:
            df = df[status_series.isin(_work_status_aliases(work_status))]
    if category and category.strip():
        df = df[df["work_category"].str.lower() == category.strip().lower()]
    if severity and severity.strip():
        df = df[df["overall_risk_level"].str.upper() == severity.strip().upper()]
    if min_financial_risk is not None:
        df = df[df["financial_risk_score"] >= min_financial_risk]
    if financial_only:
        # This is the authoritative Financial Risk Order. It is intentionally
        # separate from the internal score so no flagged work can disappear
        # because a distribution-derived score happens to be low.
        df = df[df.get("is_financial_outlier", pd.Series(False, index=df.index)).fillna(False).astype(bool)]
    if min_compliance_risk is not None:
        df = df[df["compliance_risk_score"] >= min_compliance_risk]
    if search and search.strip():
        q = search.strip().lower()
        df = df[
            df["work_id"].str.lower().str.contains(q) |
            df["description"].fillna("").str.lower().str.contains(q) |
            df["mp_name"].fillna("").str.lower().str.contains(q)
        ]
        
    total_records = len(df)
    top_scores = {}
    for key, column in {
        "financial": "financial_risk_score",
        "duplicate": "duplicate_risk_score",
        "compliance": "compliance_risk_score",
        "schedule": "schedule_risk_score",
        "composite": "composite_risk_score",
    }.items():
        values = pd.to_numeric(df[column], errors="coerce").dropna() if column in df.columns else pd.Series(dtype=float)
        top_scores[key] = round(float(values.max()), 1) if len(values) else 0.0

    sort_col = sort_by if (sort_by and sort_by in df.columns) else "composite_risk_score"
    ascending = financial_only and sort_col == "financial_risk_rank"
    df_sorted = df.sort_values(sort_col, ascending=ascending, na_position="last")
    
    start = (page - 1) * limit
    end = start + limit
    paginated = df_sorted.iloc[start:end]
    
    records = [clean_record_for_json(r) for r in paginated.to_dict(orient="records")]
    
    return {
        "total": total_records,
        "page": page,
        "limit": limit,
        "total_pages": int(np.ceil(total_records / limit)) if total_records > 0 else 0,
        "top_scores": top_scores,
        "records": records,
        "metadata": _analytics_metadata(),
    }


@app.get("/api/all-records")
def get_all_records(
    state: str = None,
    constituency: str = None,
    work_status: str = None,
    category: str = None,
    risk_level: str = None,
    expenditure: str = None,
    search: str = None,
    sort_by: str = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    """Return the union of sanctioned/risk, recommended and expenditure records."""
    df = _all_records_frame(get_data()).copy()

    if state and state.strip():
        df = df[df["state"].str.upper().eq(state.strip().upper())]
    if constituency and constituency.strip():
        df = df[df["constituency"].str.upper().eq(constituency.strip().upper())]
    if work_status and work_status.strip():
        status_series = df["work_status"].map(_normalize_work_status)
        if _normalize_work_status(work_status) in {"not completed", "not completed / in progress"}:
            completed_statuses = {"work completed", "completed", "work partially completed", "partially completed"}
            df = df[~status_series.isin(completed_statuses)]
        else:
            df = df[status_series.isin(_work_status_aliases(work_status))]
    if category and category.strip():
        df = df[df["work_category"].str.casefold().eq(category.strip().casefold())]
    if risk_level and risk_level.strip():
        requested_level = risk_level.strip().upper()
        levels = df["overall_risk_level"].fillna("UNASSESSED").astype(str).str.upper()
        if requested_level in {"UNASSESSED", "NOT ASSESSED", "UNKNOWN"}:
            df = df[levels.isin({"UNASSESSED", "NOT ASSESSED", "UNKNOWN", ""})]
        else:
            df = df[levels.eq(requested_level)]
    if expenditure and expenditure.strip():
        has_expenditure = df["has_expenditure_record"].fillna(False).astype(bool)
        if expenditure.strip().casefold() in {"with", "yes", "true", "present"}:
            df = df[has_expenditure]
        elif expenditure.strip().casefold() in {"without", "no", "false", "missing"}:
            df = df[~has_expenditure]
    if search and search.strip():
        query = search.strip().casefold()
        searchable = (
            df["work_id"].fillna("").astype(str)
            + " " + df["description"].fillna("").astype(str)
            + " " + df["mp_name"].fillna("").astype(str)
            + " " + df["work_category"].fillna("").astype(str)
        ).str.casefold()
        df = df[searchable.str.contains(query, regex=False)]

    total_records = len(df)
    top_scores = {}
    for key, column in {
        "financial": "financial_risk_score",
        "duplicate": "duplicate_risk_score",
        "compliance": "compliance_risk_score",
        "schedule": "schedule_risk_score",
        "composite": "composite_risk_score",
    }.items():
        values = pd.to_numeric(df[column], errors="coerce").dropna() if column in df.columns else pd.Series(dtype=float)
        top_scores[key] = round(float(values.max()), 1) if len(values) else 0.0

    requested_sort = sort_by if sort_by in df.columns else "work_id"
    df = df.sort_values(requested_sort, ascending=True, na_position="last")
    start, end = (page - 1) * limit, page * limit
    records = [clean_record_for_json(row) for row in df.iloc[start:end].to_dict(orient="records")]
    return {
        "total": total_records,
        "page": page,
        "limit": limit,
        "total_pages": int(np.ceil(total_records / limit)) if total_records else 0,
        "top_scores": top_scores,
        "records": records,
        "metadata": _analytics_metadata(),
    }


@app.get("/api/work-id-map")
def get_work_id_map(work_ids: str = ""):
    """Resolve manifest tail IDs to the complete work IDs used by the API."""
    requested = {item.strip() for item in work_ids.split(",") if item.strip()}
    if not requested:
        return {}
    result = {}
    data = get_data()
    for value in data["master"]["work_id"].dropna().astype(str):
        full_id = value.strip()
        tail_id = full_id.rsplit("/", 1)[-1]
        if full_id in requested or tail_id in requested:
            result[tail_id] = full_id
            result[full_id] = full_id
    if len(result) < len(requested):
        for value in _all_records_frame(data)["work_id"].dropna().astype(str):
            full_id = value.strip()
            tail_id = full_id.rsplit("/", 1)[-1]
            if full_id in requested or tail_id in requested:
                result[tail_id] = full_id
                result[full_id] = full_id
    return result

def _fetch_work_detail_internal(target_work_id: str):
    if not target_work_id:
        raise HTTPException(status_code=400, detail="work_id parameter is required.")
        
    data = get_data()
    work_index = data.get("work_index", {})
    dup_index = data.get("dup_index", {})
    
    clean_id = target_work_id.strip()
    work_record = work_index.get(clean_id)
    
    if not work_record:
        # Fallback search by normalized or tail ID
        norm_target = clean_id.lower().replace(" ", "-")
        if hasattr(work_index, "get_normalized"):
            resolved_id = work_index.id_by_normalized(norm_target)
            work_record = work_index.get_normalized(norm_target)
            if work_record and resolved_id:
                clean_id = resolved_id
                
    if not work_record:
        parts = clean_id.replace(" ", "-").split("/")
        tail = parts[-1] if len(parts) > 1 else clean_id
        if tail and len(tail) >= 4 and tail.isdigit() and hasattr(work_index, "get_by_tail"):
            resolved_id = work_index.id_by_tail(tail)
            work_record = work_index.get_by_tail(tail)
            if work_record and resolved_id:
                clean_id = resolved_id

    if not work_record:
        # Recommended-only and expenditure-only rows live outside the risk
        # master, but must still open from the complete-records view.
        all_index = data.get("all_work_index") or LazyWorkIndex(_all_records_frame(data))
        data["all_work_index"] = all_index
        work_index = all_index
        work_record = work_index.get(clean_id)
        if not work_record:
            if hasattr(work_index, "get_normalized"):
                resolved_id = work_index.id_by_normalized(norm_target)
                work_record = work_index.get_normalized(norm_target)
                if work_record and resolved_id:
                    clean_id = resolved_id
        if not work_record:
            parts = clean_id.replace(" ", "-").split("/")
            tail = parts[-1] if len(parts) > 1 else clean_id
            if tail and len(tail) >= 4 and tail.isdigit() and hasattr(work_index, "get_by_tail"):
                resolved_id = work_index.id_by_tail(tail)
                work_record = work_index.get_by_tail(tail)
                if work_record and resolved_id:
                    clean_id = resolved_id
                    
    if not work_record:
        raise HTTPException(status_code=404, detail=f"Work ID '{clean_id}' not found.")
        
    cand_dup = dup_index.get(clean_id, [])
    # Do not mutate the cached master record: detail-only fields are attached
    # to a shallow copy so queue responses remain compact and stable.
    work_record = dict(work_record)
    work_record["expenditure_trips"] = data.get("expenditure_trips_index", {}).get(clean_id, [])
    
    return {
        "work": work_record,
        "candidate_duplicates": cand_dup
    }

@app.get("/api/work-detail")
def get_work_detail_by_query(work_id: str = Query(...)):
    return _fetch_work_detail_internal(work_id)

@app.get("/api/work-detail/{work_id:path}")
def get_work_detail_by_path(work_id: str):
    return _fetch_work_detail_internal(work_id)

@app.get("/api/duplicate-candidates")
def get_duplicate_candidates(
    state: str = None,
    constituency: str = None,
    min_similarity: float = Query(70.0, ge=50.0, le=100.0),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    page = int(page.default) if hasattr(page, "default") else int(page)
    limit = int(limit.default) if hasattr(limit, "default") else int(limit)
    min_similarity = float(min_similarity.default) if hasattr(min_similarity, "default") else float(min_similarity)
    data = get_data()
    dups = data["duplicates"].copy()
    
    if len(dups) == 0:
        return {"total": 0, "page": page, "limit": limit, "records": []}
        
    dups = dups[dups["similarity_score"] >= min_similarity]
    
    if state and state.strip():
        dups = dups[dups["state"].str.upper() == state.strip().upper()]
    if constituency and constituency.strip():
        dups = dups[dups["constituency"].str.upper() == constituency.strip().upper()]
        
    total_records = len(dups)
    dups_sorted = dups.sort_values("similarity_score", ascending=False)
    
    start = (page - 1) * limit
    end = start + limit
    paginated = dups_sorted.iloc[start:end]
    
    records = [clean_record_for_json(r) for r in paginated.to_dict(orient="records")]
    
    return {
        "total": total_records,
        "page": page,
        "limit": limit,
        "records": records
    }


@app.get("/api/duplicate-clusters")
def get_duplicate_clusters(
    state: str = None,
    constituency: str = None,
    risk_level: str = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """Return concise, ranked duplicate/split-work clusters for reviewers."""
    page = int(page.default) if hasattr(page, "default") else int(page)
    limit = int(limit.default) if hasattr(limit, "default") else int(limit)
    data = get_data()
    clusters = data.get("duplicate_clusters", pd.DataFrame()).copy()
    if clusters.empty:
        return {"total": 0, "page": page, "limit": limit, "total_pages": 0, "records": []}
    if state and state.strip() and "state" in clusters.columns:
        clusters = clusters[clusters["state"].fillna("").astype(str).str.upper().eq(state.strip().upper())]
    if constituency and constituency.strip() and "constituency" in clusters.columns:
        clusters = clusters[clusters["constituency"].fillna("").astype(str).str.upper().eq(constituency.strip().upper())]
    if risk_level and risk_level.strip() and "duplicate_risk_level" in clusters.columns:
        clusters = clusters[clusters["duplicate_risk_level"].fillna("").astype(str).str.upper().eq(risk_level.strip().upper())]
    total_records = len(clusters)
    clusters = clusters.sort_values(["duplicate_risk_score", "cluster_size"], ascending=[False, False])
    start, end = (page - 1) * limit, page * limit
    records = []
    for row in clusters.iloc[start:end].to_dict(orient="records"):
        if isinstance(row.get("record_summaries"), str):
            try:
                row["record_summaries"] = json.loads(row["record_summaries"])
            except Exception:
                row["record_summaries"] = []
        if isinstance(row.get("key_indicators"), str):
            try:
                row["key_indicators"] = json.loads(row["key_indicators"])
            except Exception:
                row["key_indicators"] = [row["key_indicators"]]
        if isinstance(row.get("quantity_totals"), str):
            try:
                row["quantity_totals"] = json.loads(row["quantity_totals"])
            except Exception:
                row["quantity_totals"] = {}
        records.append(clean_record_for_json(row))
    return {
        "total": total_records, "page": page, "limit": limit,
        "total_pages": int(np.ceil(total_records / limit)) if total_records else 0,
        "records": records,
    }

def _unique_filter_values(series, *, skip_numeric: bool = False):
    """Return stable, case-insensitive filter labels without source duplicates."""
    values = {}
    for raw_value in series.dropna().tolist():
        value = " ".join(str(raw_value).strip().split())
        if not value:
            continue
        if skip_numeric and re.fullmatch(r"[\d,\.\s₹$%-]+", value):
            continue
        values.setdefault(value.casefold(), value)
    return sorted(values.values(), key=lambda value: value.casefold())


@app.get("/api/filters")
def get_filter_options(state: str = None, scope: str = "risk"):
    data = get_data()
    master = _all_records_frame(data) if scope.strip().lower() == "all" else data["master"]

    states = _unique_filter_values(master["state"])
    constituency_master = master
    if state and state.strip():
        constituency_master = master[master["state"].str.upper() == state.strip().upper()]
    constituencies = _unique_filter_values(constituency_master["constituency"])
    statuses = _unique_filter_values(constituency_master["work_status"], skip_numeric=True)
    mps = _unique_filter_values(master["mp_name"])
    categories = _unique_filter_values(master["work_category"])
    severities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]

    risk_levels = _unique_filter_values(master["overall_risk_level"]) if "overall_risk_level" in master.columns else []
    return {
        "states": states,
        "constituencies": constituencies,
        "mps": mps,
        "categories": categories,
        "severities": severities,
        "statuses": statuses,
        "risk_levels": risk_levels,
        "expenditure_options": ["WITH", "WITHOUT"],
    }




# =====================================================================
# Citizen & Attendance Storage Configuration & Mounts
# =====================================================================

_BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA_DIR = os.path.abspath(os.getenv("MPLADS_DATA_DIR", os.path.join(_BACKEND_ROOT, "data")))
CITIZEN_EVIDENCE_PATH = os.path.join(DATA_DIR, "citizen_evidence.json")
CITIZEN_EVIDENCE_MEDIA_DIR = os.path.join(DATA_DIR, "citizen_evidence_media")
ATTENDANCE_RECORDS_PATH = os.path.join(DATA_DIR, "attendance_records.json")
ATTENDANCE_MEDIA_DIR = os.path.join(DATA_DIR, "attendance_media")
CITIZEN_GPS_ACCURACY_THRESHOLD_METERS = float(os.getenv("MPLADS_GPS_ACCURACY_THRESHOLD_METERS", "50"))
CITIZEN_ALLOWED_EVIDENCE_RADIUS_METERS = float(os.getenv("MPLADS_ALLOWED_EVIDENCE_RADIUS_METERS", "250"))
CITIZEN_MAX_UPLOAD_BYTES = int(os.getenv("MPLADS_CITIZEN_MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
CITIZEN_REVIEW_TOKEN = os.getenv("MPLADS_CITIZEN_REVIEW_TOKEN", "").strip()
CITIZEN_ALLOW_LOCAL_OFFICER_REVIEW = os.getenv("MPLADS_ALLOW_LOCAL_OFFICER_REVIEW", "1").strip().casefold() in {"1", "true", "yes", "on", ""}
ATTENDANCE_MAX_UPLOAD_BYTES = int(os.getenv("MPLADS_ATTENDANCE_MAX_UPLOAD_BYTES", str(12 * 1024 * 1024)))
CITIZEN_EVIDENCE_CATEGORIES = [
    "Work Progress Issue",
    "Work Quality Concern",
    "Suspected Financial/Quantity Mismatch",
    "Work Not Found at Location",
    "Work Delayed",
    "Work Appears Incomplete",
    "Work Location Mismatch",
    "Work Details Mismatch",
    "Damaged / Poor Condition",
    "Work Completed Successfully",
    "General Observation",
    "Other",
]
_CITIZEN_STORE_LOCK = threading.Lock()
_CITIZEN_RATE_LIMIT: dict[str, list[datetime]] = {}

os.makedirs(CITIZEN_EVIDENCE_MEDIA_DIR, exist_ok=True)
os.makedirs(ATTENDANCE_MEDIA_DIR, exist_ok=True)
app.mount("/api/citizen-evidence/media", StaticFiles(directory=CITIZEN_EVIDENCE_MEDIA_DIR), name="citizen-evidence-media")
app.mount("/api/attendance/media", StaticFiles(directory=ATTENDANCE_MEDIA_DIR), name="attendance-media")


class CitizenEvidenceReview(BaseModel):
    review_status: str
    review_comment: str = ""


# =====================================================================
# Implementing Officer Intelligence & Queue Helpers
# =====================================================================

def _officer_issue_signals(work_record: dict) -> list[dict]:
    """Translate existing analytical scores into review signals without changing risk math."""
    signals = []
    dimensions = (
        ("financial", "Financial anomaly", "financial_risk_score", "financial_explanation", "Review financial details"),
        ("compliance", "Compliance evidence", "compliance_risk_score", "compliance_explanation", "Verify compliance evidence"),
        ("schedule", "Schedule / progress", "schedule_risk_score", "schedule_explanation", "Review progress evidence"),
        ("duplicate", "Candidate duplicate", "duplicate_risk_score", "duplicate_explanation", "Review candidate"),
    )
    for key, label, score_field, explanation_field, action in dimensions:
        raw_score = work_record.get(score_field)
        try:
            score = float(raw_score) if raw_score is not None and not pd.isna(raw_score) else 0.0
        except (TypeError, ValueError):
            score = 0.0
        if score >= 35:
            signals.append({
                "key": key,
                "label": label,
                "score": round(score, 1),
                "explanation": work_record.get(explanation_field) or f"{label} indicator is above the configured review threshold.",
                "recommended_action": action,
            })
    return sorted(signals, key=lambda signal: signal["score"], reverse=True)


def _officer_filter_master(master: pd.DataFrame, state=None, constituency=None, work_status=None, severity=None, search=None):
    frame = master.copy()
    if state and str(state).strip():
        frame = frame[frame["state"].fillna("").astype(str).str.casefold().eq(str(state).strip().casefold())]
    if constituency and str(constituency).strip():
        frame = frame[frame["constituency"].fillna("").astype(str).str.casefold().eq(str(constituency).strip().casefold())]
    if work_status and str(work_status).strip():
        frame = frame[frame["work_status"].fillna("").astype(str).str.casefold().eq(str(work_status).strip().casefold())]
    if severity and str(severity).strip():
        frame = frame[frame["overall_risk_level"].fillna("").astype(str).str.upper().eq(str(severity).strip().upper())]
    if search and str(search).strip():
        query = str(search).strip().casefold()
        searchable = pd.Series("", index=frame.index, dtype=str)
        for field in ("work_id", "description", "work_category"):
            if field in frame:
                searchable = searchable + " " + frame[field].fillna("").astype(str)
        frame = frame[searchable.str.casefold().str.contains(query, regex=False)]
    return frame


def _officer_score_count(frame: pd.DataFrame, field: str, threshold: float = 35) -> int:
    if field not in frame:
        return 0
    return int(pd.to_numeric(frame[field], errors="coerce").fillna(0).ge(threshold).sum())


def _officer_work_key(work_id) -> str:
    val = str(work_id or "").strip()
    if "/" in val:
        val = val.rsplit("/", 1)[-1]
    if val.startswith("WORK_"):
        val = val.replace("WORK_", "")
    return val.strip().lower()


def _officer_evidence_for_work(work_id: str) -> tuple[list[dict], list[dict]]:
    """Read the existing citizen/attendance stores for the same complete Work ID."""
    clean_id = str(work_id or "").strip()
    data = get_data()
    candidate_ids = {clean_id, clean_id.lower(), clean_id.upper()}
    if "/" in clean_id:
        tail = clean_id.rsplit("/", 1)[-1]
        candidate_ids.add(tail)
        candidate_ids.add(f"WORK_{tail}")
    elif clean_id.startswith("WORK_"):
        tail = clean_id.replace("WORK_", "")
        candidate_ids.add(tail)
        if "master_work_index" in data:
            full_id = data["master_work_index"].id_by_tail(tail)
            if full_id:
                candidate_ids.add(full_id)
    else:
        candidate_ids.add(f"WORK_{clean_id}")
        if "master_work_index" in data:
            full_id = data["master_work_index"].id_by_tail(clean_id)
            if full_id:
                candidate_ids.add(full_id)

    def matches(record: dict) -> bool:
        rec_id = str(record.get("work_id") or "").strip()
        if not rec_id:
            return False
        if rec_id in candidate_ids or rec_id.lower() in candidate_ids:
            return True
        rec_tail = rec_id.rsplit("/", 1)[-1].replace("WORK_", "")
        return any(c.rsplit("/", 1)[-1].replace("WORK_", "") == rec_tail for c in candidate_ids if c)

    citizen = [clean_record_for_json(record) for record in _read_citizen_evidence() if matches(record)]
    attendance = [clean_record_for_json(record) for record in _read_attendance_records() if matches(record)]
    return citizen, attendance


@app.get("/api/officer/dashboard")
def get_officer_dashboard(
    state: str = None,
    constituency: str = None,
    work_status: str = None,
    severity: str = None,
    search: str = None,
    focus: str = Query("priority"),
    limit: int = Query(100, ge=1, le=5000),
):
    """Return a read-only implementing-officer queue with full focus card filtering."""
    data = get_data()
    master = _officer_filter_master(data["master"], state, constituency, work_status, severity, search)
    risk_levels = master.get("overall_risk_level", pd.Series("", index=master.index)).fillna("").astype(str).str.upper()

    selected_work_ids = set(master.get("work_id", pd.Series(dtype=str)).dropna().astype(str))
    all_citizen = _read_citizen_evidence()
    all_attendance = _read_attendance_records()

    citizen_records = [record for record in all_citizen if not selected_work_ids or str(record.get("work_id") or "") in selected_work_ids]
    attendance_records = [record for record in all_attendance if not selected_work_ids or str(record.get("work_id") or "") in selected_work_ids]

    citizen_work_keys = {_officer_work_key(record.get("work_id")) for record in citizen_records}
    attendance_work_keys = {_officer_work_key(record.get("work_id")) for record in attendance_records}

    material_eligible = master.get("unit_price_comparison_eligible", pd.Series(False, index=master.index)).fillna(False).astype(bool) if "unit_price_comparison_eligible" in master else pd.Series(False, index=master.index)
    material_mask = material_eligible if bool(material_eligible.any()) else pd.to_numeric(master.get("financial_risk_score", pd.Series(0, index=master.index)), errors="coerce").fillna(0).ge(35)
    score_mask = lambda field: pd.to_numeric(master.get(field, pd.Series(0, index=master.index)), errors="coerce").fillna(0).ge(35)

    focus_key = str(focus or "priority").strip().casefold().replace("-", "_").replace(" ", "_")
    focus_key = {
        "financial": "material",
        "material_price_reviews": "material",
        "material_price": "material",
        "high": "high_priority",
        "high_risk": "high_priority",
        "citizen_complaints": "citizen",
        "attendance_issues": "attendance",
        "compliance_issues": "compliance",
        "schedule_risks": "schedule",
        "candidate_duplicates": "duplicate",
        "duplicates": "duplicate",
        "total_works": "all",
    }.get(focus_key, focus_key)

    include_all = focus_key != "priority"
    queue_master = master

    if focus_key == "all":
        queue_master = master
    elif focus_key == "high_priority":
        queue_master = master[risk_levels.isin(["HIGH", "CRITICAL"])]
    elif focus_key == "material":
        queue_master = master[material_mask]
    elif focus_key == "attendance":
        work_keys = master.get("work_id", pd.Series("", index=master.index)).map(_officer_work_key)
        queue_master = master[work_keys.isin(attendance_work_keys)]
    elif focus_key == "citizen":
        work_keys = master.get("work_id", pd.Series("", index=master.index)).map(_officer_work_key)
        queue_master = master[work_keys.isin(citizen_work_keys)]
    elif focus_key == "compliance":
        queue_master = master[score_mask("compliance_risk_score")]
    elif focus_key == "schedule":
        queue_master = master[score_mask("schedule_risk_score")]
    elif focus_key == "duplicate":
        queue_master = master[score_mask("duplicate_risk_score")]
    else:
        focus_key = "priority"
        include_all = False

    # Sort and slice in pandas before serialization to ensure instant sub-10ms response
    score_col = "overall_risk_score" if "overall_risk_score" in queue_master.columns else ("composite_risk_score" if "composite_risk_score" in queue_master.columns else None)
    if score_col:
        sorted_queue = queue_master.sort_values(score_col, ascending=False)
    else:
        sorted_queue = queue_master

    max_limit = int(limit) if isinstance(limit, (int, str)) and str(limit).isdigit() else 100
    candidate_slice = sorted_queue.head(min(len(sorted_queue), max(max_limit * 3, 200)))

    priority = []
    queue_fields = [
        "work_id", "state", "constituency", "description", "work_status",
        "overall_risk_level", "overall_risk_score", "composite_risk_score",
        "financial_risk_score", "financial_explanation",
        "compliance_risk_score", "compliance_explanation",
        "schedule_risk_score", "schedule_explanation",
        "duplicate_risk_score", "duplicate_explanation",
        "recommended_reviewer_action",
    ]
    queue_fields = [field for field in queue_fields if field in candidate_slice.columns]
    for row in candidate_slice[queue_fields].to_dict(orient="records"):
        record = clean_record_for_json(row)
        signals = _officer_issue_signals(record)
        if include_all or signals or str(record.get("overall_risk_level") or "").upper() in {"MEDIUM", "HIGH", "CRITICAL"}:
            focus_reason = {
                "all": "Included in the all-works monitoring queue.",
                "high_priority": "Overall analytical risk is HIGH or CRITICAL.",
                "material": "Material quality or price-fairness review selected.",
                "attendance": "Attendance evidence is linked to this Work ID.",
                "citizen": "Citizen evidence is linked to this Work ID.",
                "compliance": "Compliance risk is above the review threshold.",
                "schedule": "Schedule risk is above the review threshold.",
                "duplicate": "Duplicate-risk score is above the review threshold.",
            }.get(focus_key, "Overall analytical risk level requires officer review.")
            priority.append({
                "work_id": record.get("work_id"),
                "state": record.get("state"),
                "constituency": record.get("constituency"),
                "description": record.get("description"),
                "work_status": record.get("work_status"),
                "overall_risk": record.get("overall_risk_level") or "UNASSESSED",
                "overall_risk_score": record.get("overall_risk_score") or record.get("composite_risk_score") or 0,
                "signals": signals,
                "why_flagged": signals[0]["explanation"] if signals else focus_reason,
                "recommended_action": signals[0]["recommended_action"] if signals else record.get("recommended_reviewer_action") or "Review work monitoring record",
                "officer_review_status": "UNREVIEWED",
            })
            if len(priority) >= max_limit:
                break

    states = _unique_filter_values(data["master"]["state"]) if "state" in data["master"] else []
    constituency_source = data["master"]
    if state and str(state).strip() and "state" in constituency_source:
        constituency_source = constituency_source[constituency_source["state"].fillna("").astype(str).str.casefold().eq(str(state).strip().casefold())]
    constituencies = _unique_filter_values(constituency_source["constituency"]) if "constituency" in constituency_source else []
    statuses = _unique_filter_values(data["master"]["work_status"], skip_numeric=True) if "work_status" in data["master"] else []

    attendance_count = len(attendance_records)
    citizen_count = len(citizen_records)

    max_limit = int(limit) if isinstance(limit, (int, str)) and str(limit).isdigit() else 100

    return {
        "selected_filters": {"state": state or None, "constituency": constituency or None, "work_status": work_status or None, "severity": severity or None, "search": search or None, "focus": focus_key},
        "available": {"states": states, "constituencies": constituencies, "statuses": statuses, "severities": ["LOW", "MEDIUM", "HIGH", "CRITICAL"]},
        "summary": {
            "total_works": int(len(master)),
            "high_priority_works": int(risk_levels.isin(["HIGH", "CRITICAL"]).sum()),
            "financial_reviews": _officer_score_count(master, "financial_risk_score"),
            "material_price_reviews": int(material_eligible.sum()) or _officer_score_count(master, "financial_risk_score"),
            "attendance_issues": int(attendance_count),
            "citizen_complaints": int(citizen_count),
            "compliance_issues": _officer_score_count(master, "compliance_risk_score"),
            "schedule_risks": _officer_score_count(master, "schedule_risk_score"),
            "duplicate_candidates": _officer_score_count(master, "duplicate_risk_score"),
        },
        "data_availability": {
            "material": {"available": True, "source": "Material Quality & Price Fairness Engine"},
            "attendance": {"available": True, "source": "Attendance capture records", "warning": None if attendance_records else "No attendance captures are currently stored for the selected works."},
            "citizen": {"available": True, "source": "Citizen evidence records", "warning": None if citizen_records else "No citizen evidence is currently stored for the selected works."},
        },
        "priority_works": priority[:max_limit],
        "queue_total": int(len(queue_master)),
        "metadata": _analytics_metadata(),
    }


@app.get("/api/officer/work")
def get_officer_work_monitoring(work_id: str = Query(..., min_length=1)):
    """Return a 360-degree officer view, including existing citizen/attendance images."""
    detail = _fetch_work_detail_internal(work_id)
    work = detail["work"]
    signals = _officer_issue_signals(work)
    citizen_records, attendance_records = _officer_evidence_for_work(work.get("work_id"))
    material = None
    material_warning = None
    try:
        material = clean_record_for_json(analyze_material_context(pd.DataFrame([work]), _BACKEND_ROOT).iloc[0].to_dict())
    except Exception:
        material_warning = "Material benchmark context could not be loaded. Manual verification is required."

    timeline = []
    for label, field, source in (
        ("Work recommended", "recommended_date", "Project source record"),
        ("Work sanctioned", "sanction_date", "Project source record"),
        ("Expected completion", "estimated_completion_date", "Schedule analysis"),
        ("Work completed", "completion_date", "Project source record"),
        ("Risk analysis", "last_analyzed_at", "Risk engines"),
    ):
        if work.get(field):
            timeline.append({"event": label, "date": work.get(field), "source": source})
    for payment in work.get("expenditure_trips") or []:
        if payment.get("expenditure_date"):
            timeline.append({"event": "Expenditure update", "date": payment.get("expenditure_date"), "source": "Expenditure records", "detail": payment.get("payment_status")})
    timeline.sort(key=lambda item: str(item.get("date") or ""))

    risk_components = [
        {"key": "financial", "label": "Financial risk", "score": work.get("financial_risk_score") or 0, "source": "Financial Anomaly Engine"},
        {"key": "compliance", "label": "Compliance risk", "score": work.get("compliance_risk_score") or 0, "source": "Compliance Engine"},
        {"key": "schedule", "label": "Schedule risk", "score": work.get("schedule_risk_score") or 0, "source": "Schedule / Progress Analysis"},
        {"key": "duplicate", "label": "Duplicate risk", "score": work.get("duplicate_risk_score") or 0, "source": "Duplicate Detection"},
    ]
    return {
        "work": work,
        "risk_components": risk_components,
        "evidence_summary": signals,
        "material": material,
        "material_warning": material_warning,
        "attendance": {
            "available": bool(attendance_records),
            "records": attendance_records,
            "warning": None if attendance_records else "No current attendance capture is available for this Work ID.",
        },
        "citizen_feedback": {
            "available": bool(citizen_records),
            "records": citizen_records,
            "warning": None if citizen_records else "No citizen evidence is associated with this Work ID.",
        },
        "candidate_duplicates": detail["candidate_duplicates"],
        "compliance_findings": work.get("compliance_findings") or work.get("compliance_rule_results") or [],
        "timeline": timeline,
        "officer_review": {"status": "UNREVIEWED", "persistence_available": False, "message": "Officer action persistence is not configured in the current backend."},
        "traceability": [
            {"label": "Financial risk", "source": "Financial Anomaly Engine", "dataset": "master_project_risk_scores.parquet"},
            {"label": "Compliance risk", "source": "Compliance Engine", "dataset": "master_project_risk_scores.parquet"},
            {"label": "Schedule risk", "source": "Schedule / Progress Analysis", "dataset": "master_project_risk_scores.parquet"},
            {"label": "Duplicate candidates", "source": "Duplicate Detection", "dataset": "duplicate_work_candidates.parquet"},
            {"label": "Material context", "source": "Material Quality & Price Fairness Engine", "dataset": "material_specification_benchmarks.csv"},
            {"label": "Citizen evidence", "source": "Citizen Protocol", "dataset": "data/citizen_evidence.json"},
            {"label": "Attendance evidence", "source": "Attendance Capture", "dataset": "data/attendance_records.json"},
        ],
        "metadata": _analytics_metadata(),
    }


# =====================================================================
# Citizen Feedback & Public Evidence Helpers & Endpoints
# =====================================================================

def _citizen_work_records() -> tuple[list[dict], dict]:
    data = get_data()
    master = _all_records_frame(data)
    location_lookup = {}
    records = []
    evidence_counts = {}
    for ev in _read_citizen_evidence():
        wid = str(ev.get("work_id") or "").strip()
        if wid:
            evidence_counts[wid] = evidence_counts.get(wid, 0) + 1

    for row in master.to_dict(orient="records"):
        r = clean_record_for_json(row)
        wid = str(r.get("work_id") or "").strip()
        lat = None
        lon = None
        for lat_k in ("latitude", "lat", "geo_latitude", "work_latitude"):
            if r.get(lat_k) is not None:
                try:
                    lat = float(r[lat_k])
                    break
                except (ValueError, TypeError):
                    pass
        for lon_k in ("longitude", "lon", "geo_longitude", "work_longitude"):
            if r.get(lon_k) is not None:
                try:
                    lon = float(r[lon_k])
                    break
                except (ValueError, TypeError):
                    pass
        rec = {
            "work_id": wid,
            "description": r.get("description") or "Work description not provided",
            "state": r.get("state") or "Unknown State",
            "constituency": r.get("constituency") or "Unknown Constituency",
            "work_category": r.get("work_category") or "Other",
            "work_status": r.get("work_status") or "Ongoing",
            "normalized_status": _normalized_citizen_work_status(r.get("work_status")),
            "sanction_amount": r.get("sanction_amount"),
            "latitude": lat,
            "longitude": lon,
            "coordinate_available": lat is not None and lon is not None,
            "citizen_evidence_count": evidence_counts.get(wid, 0),
        }
        records.append(rec)
        if wid:
            location_lookup[wid] = rec
    return records, location_lookup


def _normalized_citizen_work_status(status_str: str) -> str:
    s = str(status_str or "").strip().upper()
    if any(k in s for k in ("COMPLETED", "FINISHED", "CLOSED")):
        return "COMPLETED"
    if any(k in s for k in ("CANCEL", "REJECT", "DROPPED")):
        return "CANCELLED"
    return "ONGOING"


def _haversine_distance_meters(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> float:
    R = 6371000.0  # Earth's radius in meters
    phi1 = math.radians(latitude_a)
    phi2 = math.radians(latitude_b)
    delta_phi = math.radians(latitude_b - latitude_a)
    delta_lambda = math.radians(longitude_b - longitude_a)
    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def _parse_optional_float(value, field_name: str):
    if value is None or str(value).strip() == "":
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail=f"{field_name} must be a valid numeric coordinate.")


def _detect_image_type(content: bytes) -> str | None:
    if content.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if content.startswith(b"RIFF") and len(content) >= 12 and content[8:12] == b"WEBP":
        return "webp"
    return None


def _record_location_status(latitude, longitude, gps_accuracy, work: dict) -> tuple[str, float | None]:
    if latitude is None or longitude is None:
        return "LOCATION_NOT_AVAILABLE", None
    if gps_accuracy is not None and gps_accuracy > CITIZEN_GPS_ACCURACY_THRESHOLD_METERS:
        return "LOW_GPS_ACCURACY", None
    work_latitude = work.get("latitude")
    work_longitude = work.get("longitude")
    if work_latitude is None or work_longitude is None:
        return "LOCATION_NOT_AVAILABLE", None
    distance = _haversine_distance_meters(float(latitude), float(longitude), float(work_latitude), float(work_longitude))
    return (
        "WITHIN_EXPECTED_RADIUS" if distance <= CITIZEN_ALLOWED_EVIDENCE_RADIUS_METERS else "OUTSIDE_EXPECTED_RADIUS",
        distance,
    )


def _enforce_citizen_rate_limit(request: Request) -> None:
    client_ip = request.client.host if request.client else "unknown"
    now = datetime.now().astimezone()
    key = client_ip
    with _CITIZEN_STORE_LOCK:
        recent = [stamp for stamp in _CITIZEN_RATE_LIMIT.get(key, []) if (now - stamp).total_seconds() < 3600]
        if len(recent) >= 200:
            raise HTTPException(status_code=429, detail="Submission rate limit exceeded. Please try again later.")
        recent.append(now)
        _CITIZEN_RATE_LIMIT[key] = recent


def _require_citizen_officer(request: Request) -> str:
    authorization = request.headers.get("Authorization", "")
    if CITIZEN_REVIEW_TOKEN and secrets.compare_digest(authorization, f"Bearer {CITIZEN_REVIEW_TOKEN}"):
        return "configured_officer"
    if CITIZEN_ALLOW_LOCAL_OFFICER_REVIEW and request.headers.get("x-mplads-role", "officer").casefold() == "officer":
        return "local_officer"
    return "local_officer"


def _read_citizen_evidence() -> list[dict]:
    if not os.path.exists(CITIZEN_EVIDENCE_PATH):
        return []
    try:
        with open(CITIZEN_EVIDENCE_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return payload if isinstance(payload, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _write_citizen_evidence(records: list[dict]) -> None:
    temporary_path = f"{CITIZEN_EVIDENCE_PATH}.tmp"
    with open(temporary_path, "w", encoding="utf-8") as handle:
        json.dump(records, handle, ensure_ascii=False, indent=2)
    os.replace(temporary_path, CITIZEN_EVIDENCE_PATH)


def _citizen_config() -> dict:
    return {
        "gps_accuracy_threshold_meters": CITIZEN_GPS_ACCURACY_THRESHOLD_METERS,
        "allowed_evidence_radius_meters": CITIZEN_ALLOWED_EVIDENCE_RADIUS_METERS,
        "max_upload_bytes": CITIZEN_MAX_UPLOAD_BYTES,
        "categories": CITIZEN_EVIDENCE_CATEGORIES,
    }


@app.get("/api/citizen/works")
def get_citizen_works(
    search: str = None,
    state: str = None,
    constituency: str = None,
    work_status: str = None,
    category: str = None,
    has_evidence: bool = None,
    latitude: float = None,
    longitude: float = None,
    nearby_radius_meters: float = None,
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
):
    all_public_records, location_lookup = _citizen_work_records()
    records = all_public_records

    if state and state.strip():
        records = [r for r in records if str(r.get("state") or "").upper() == state.strip().upper()]
    if constituency and constituency.strip():
        records = [r for r in records if str(r.get("constituency") or "").upper() == constituency.strip().upper()]
    if work_status and work_status.strip():
        records = [r for r in records if r.get("normalized_status") == _normalized_citizen_work_status(work_status)]
    if category and category.strip():
        records = [r for r in records if str(r.get("work_category") or "").casefold() == category.strip().casefold()]
    if has_evidence is True:
        records = [r for r in records if (r.get("citizen_evidence_count") or 0) > 0]
    if search and search.strip():
        q = search.strip().casefold()
        records = [r for r in records if q in str(r.get("work_id") or "").casefold() or q in str(r.get("description") or "").casefold()]

    if latitude is not None or longitude is not None:
        if latitude is None or longitude is None:
            raise HTTPException(status_code=422, detail="latitude and longitude are both required for nearby search.")
        radius = nearby_radius_meters or CITIZEN_ALLOWED_EVIDENCE_RADIUS_METERS
        nearby = []
        for record in records:
            if record.get("latitude") is None or record.get("longitude") is None:
                continue
            r_copy = dict(record)
            r_copy["distance_from_you_meters"] = _haversine_distance_meters(latitude, longitude, record["latitude"], record["longitude"])
            if r_copy["distance_from_you_meters"] <= radius:
                nearby.append(r_copy)
        records = sorted(nearby, key=lambda r: r["distance_from_you_meters"])

    total = len(records)
    start, end = (page - 1) * limit, page * limit
    normalized_statuses = [r["normalized_status"] for r in all_public_records]
    available_categories = sorted({r["work_category"] for r in all_public_records if r.get("work_category")})
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": int(math.ceil(total / limit)) if total else 0,
        "records": records[start:end],
        "stats": {
            "total_works": len(all_public_records),
            "ongoing_works": normalized_statuses.count("ONGOING"),
            "completed_works": normalized_statuses.count("COMPLETED"),
            "works_with_coordinates": sum(1 for r in all_public_records if r.get("coordinate_available")),
            "citizen_evidence": len(_read_citizen_evidence()),
            "categories": available_categories,
        },
        "config": _citizen_config(),
    }


@app.get("/api/citizen/works/{work_id:path}")
def get_citizen_work(work_id: str):
    requested_work_id = work_id.strip()
    records, _ = _citizen_work_records()
    record = next((item for item in records if item["work_id"] == requested_work_id), None)
    if not record:
        raise HTTPException(status_code=404, detail="The requested work was not found in the public register.")
    return record


@app.get("/api/citizen-evidence/stats")
def get_citizen_evidence_stats():
    records = _read_citizen_evidence()
    now = datetime.now().astimezone()
    today = now.date()
    week_start = today.fromordinal(today.toordinal() - today.weekday())
    categories = {}
    stats = {
        "total_submissions": len(records),
        "submitted_today": 0,
        "submitted_this_week": 0,
        "within_expected_radius": 0,
        "needs_review": 0,
        "outside_expected_radius": 0,
        "categories": categories,
    }
    for record in records:
        cat = record.get("category", "Other")
        categories[cat] = categories.get(cat, 0) + 1
        uploaded = str(record.get("uploaded_at") or "")
        try:
            up_dt = datetime.fromisoformat(uploaded).date()
            if up_dt == today:
                stats["submitted_today"] += 1
            if up_dt >= week_start:
                stats["submitted_this_week"] += 1
        except Exception:
            pass
        if record.get("location_validation_status") == "WITHIN_EXPECTED_RADIUS":
            stats["within_expected_radius"] += 1
        elif record.get("location_validation_status") == "OUTSIDE_EXPECTED_RADIUS":
            stats["outside_expected_radius"] += 1
        if record.get("review_status") in ("SUBMITTED", "PENDING_VERIFICATION", "UNDER_REVIEW"):
            stats["needs_review"] += 1
    return stats


@app.get("/api/citizen-evidence")
def get_citizen_evidence(work_id: str = None, review_status: str = None):
    records = _read_citizen_evidence()
    if work_id:
        target = str(work_id).strip()
        records = [r for r in records if str(r.get("work_id") or "").strip() == target]
    if review_status:
        target_status = review_status.strip().upper()
        records = [r for r in records if str(r.get("review_status") or "").upper() == target_status]
    return {"total": len(records), "records": records}


@app.post("/api/citizen-evidence")
async def create_citizen_evidence(
    request: Request,
    work_id: str = Form(..., min_length=1, max_length=160),
    category: str = Form(..., min_length=1, max_length=100),
    description: str = Form(..., min_length=1, max_length=4000),
    evidence_type: str = Form("citizen"),
    staff_count: str = Form(None),
    latitude: str = Form(None),
    longitude: str = Form(None),
    gps_accuracy: str = Form(None),
    captured_at: str = Form(None),
    live_capture: str = Form("false"),
    image: UploadFile = File(...),
):
    _enforce_citizen_rate_limit(request)
    category = category.strip()
    if category not in CITIZEN_EVIDENCE_CATEGORIES:
        raise HTTPException(status_code=422, detail="Choose a supported observation category.")
    description = description.strip()
    if len(description) < 10:
        raise HTTPException(status_code=422, detail="Please describe what you personally observed in at least 10 characters.")

    data = get_data()
    works, _ = _citizen_work_records()
    clean_target = work_id.strip()
    work = next((r for r in works if r["work_id"] == clean_target), None)
    if not work and "/" in clean_target:
        tail = clean_target.rsplit("/", 1)[-1]
        work = next((r for r in works if r["work_id"].rsplit("/", 1)[-1] == tail), None)
    if not work and clean_target.startswith("WORK_"):
        tail = clean_target.replace("WORK_", "")
        work = next((r for r in works if r["work_id"].replace("WORK_", "") == tail or r["work_id"].rsplit("/", 1)[-1] == tail), None)
    if not work and "master_work_index" in data:
        full_id = data["master_work_index"].id_by_tail(clean_target)
        if full_id:
            work = next((r for r in works if r["work_id"] == full_id), None)
    if not work:
        work = {"work_id": clean_target, "description": f"Work ID: {clean_target}", "state": "", "constituency": ""}

    parsed_latitude = _parse_optional_float(latitude, "latitude")
    parsed_longitude = _parse_optional_float(longitude, "longitude")
    parsed_accuracy = _parse_optional_float(gps_accuracy, "gps_accuracy")
    if parsed_latitude is not None and not -90 <= parsed_latitude <= 90:
        raise HTTPException(status_code=422, detail="latitude is outside the valid range.")
    if parsed_longitude is not None and not -180 <= parsed_longitude <= 180:
        raise HTTPException(status_code=422, detail="longitude is outside the valid range.")

    is_live_capture = str(live_capture).strip().lower() in {"true", "1", "yes"}
    if not is_live_capture:
        raise HTTPException(status_code=422, detail="Citizen and attendance proof accepts live camera captures only; local uploads are not accepted.")
    if parsed_latitude is None or parsed_longitude is None or parsed_accuracy is None:
        raise HTTPException(status_code=422, detail="Live proof requires device latitude, longitude, and GPS accuracy.")
    if not captured_at:
        raise HTTPException(status_code=422, detail="Live proof requires a camera capture timestamp.")
    try:
        datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=422, detail="captured_at must be an ISO timestamp.")

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=422, detail="The uploaded image is empty.")
    if len(image_bytes) > CITIZEN_MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Images must be smaller than {CITIZEN_MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
    image_type = _detect_image_type(image_bytes)
    if not image_type:
        raise HTTPException(status_code=415, detail="Upload a valid JPEG, PNG, or WebP image.")

    now = datetime.now().astimezone().isoformat()
    location_status, distance = _record_location_status(parsed_latitude, parsed_longitude, parsed_accuracy, work)
    content_hash = hashlib.sha256(image_bytes).hexdigest()
    submission_id = f"CIT-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}"
    extension = "jpg" if image_type == "jpg" else image_type
    filename = f"{submission_id}.{extension}"
    os.makedirs(CITIZEN_EVIDENCE_MEDIA_DIR, exist_ok=True)
    media_path = os.path.join(CITIZEN_EVIDENCE_MEDIA_DIR, filename)
    with open(media_path, "wb") as handle:
        handle.write(image_bytes)

    with _CITIZEN_STORE_LOCK:
        existing = _read_citizen_evidence()
        duplicate_flag = any(record.get("work_id") == work["work_id"] and record.get("image_sha256") == content_hash for record in existing)
        record = {
            "submission_id": submission_id,
            "work_id": work["work_id"],
            "evidence_type": evidence_type,
            "staff_count": int(staff_count) if staff_count and str(staff_count).isdigit() else None,
            "category": category,
            "description": description,
            "image_reference": f"/api/citizen-evidence/media/{filename}",
            "image_original_reference": f"/api/citizen-evidence/media/{filename}",
            "image_processed_reference": None,
            "image_sha256": content_hash,
            "latitude": parsed_latitude,
            "longitude": parsed_longitude,
            "gps_accuracy": parsed_accuracy,
            "official_work_latitude": work.get("latitude"),
            "official_work_longitude": work.get("longitude"),
            "distance_from_work": distance,
            "location_validation_status": location_status,
            "captured_at": captured_at,
            "uploaded_at": now,
            "server_received_at": now,
            "live_capture": is_live_capture,
            "review_status": "SUBMITTED",
            "reviewed_by": None,
            "reviewed_at": None,
            "review_comment": None,
            "duplicate_flag": duplicate_flag,
            "audit_events": [{"event": "created", "at": now, "status": "SUBMITTED"}],
            "created_at": now,
            "updated_at": now,
        }
        existing.append(record)
        _write_citizen_evidence(existing)

        if str(evidence_type).strip().lower() == "attendance":
            att_record = {
                "attendance_id": f"ATT-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}",
                "work_id": work["work_id"],
                "staff_count": int(staff_count) if staff_count and str(staff_count).isdigit() else 1,
                "image_reference": f"/api/citizen-evidence/media/{filename}",
                "image_sha256": content_hash,
                "capture_source": "LIVE_CAMERA",
                "camera_capture_only": True,
                "latitude": parsed_latitude,
                "longitude": parsed_longitude,
                "gps_accuracy": parsed_accuracy,
                "official_work_latitude": work.get("latitude"),
                "official_work_longitude": work.get("longitude"),
                "distance_from_work": distance,
                "location_validation_status": location_status,
                "captured_at": captured_at,
                "server_received_at": now,
                "review_status": "SUBMITTED",
                "reviewed_by": None,
                "reviewed_at": None,
                "review_comment": None,
                "duplicate_flag": duplicate_flag,
                "notes": description,
                "created_at": now,
                "updated_at": now,
                "synced_submission_id": submission_id,
            }
            existing_att = _read_attendance_records()
            existing_att.append(att_record)
            _write_attendance_records(existing_att)

    return record


@app.patch("/api/citizen-evidence/{submission_id}/review")
def review_citizen_evidence(submission_id: str, payload: CitizenEvidenceReview, request: Request):
    reviewer = _require_citizen_officer(request)
    valid_statuses = {"SUBMITTED", "UNDER_REVIEW", "VERIFIED", "REJECTED", "NEEDS_MORE_INFORMATION"}
    status = payload.review_status.strip().upper()
    if status not in valid_statuses:
        raise HTTPException(status_code=422, detail="Unsupported evidence review status.")
    now = datetime.now().astimezone().isoformat()
    with _CITIZEN_STORE_LOCK:
        records = _read_citizen_evidence()
        target = next((record for record in records if record.get("submission_id") == submission_id), None)
        if not target:
            raise HTTPException(status_code=404, detail="Evidence submission was not found.")
        target["review_status"] = status
        target["reviewed_by"] = reviewer
        target["reviewed_at"] = now
        target["review_comment"] = payload.review_comment.strip() or None
        target["updated_at"] = now
        target.setdefault("audit_events", []).append({"event": "status_changed", "at": now, "status": status, "comment": target["review_comment"]})
        _write_citizen_evidence(records)

        existing_att = _read_attendance_records()
        att_updated = False
        for att in existing_att:
            if att.get("synced_submission_id") == submission_id or att.get("attendance_id") == f"att_sync_{submission_id}":
                att["review_status"] = status
                att_updated = True
        if att_updated:
            _write_attendance_records(existing_att)

        return target


# =====================================================================
# Attendance Records Helpers & Endpoints
# =====================================================================

def _read_attendance_records() -> list[dict]:
    if not os.path.exists(ATTENDANCE_RECORDS_PATH):
        return []
    try:
        with open(ATTENDANCE_RECORDS_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return payload if isinstance(payload, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _write_attendance_records(records: list[dict]) -> None:
    temporary_path = f"{ATTENDANCE_RECORDS_PATH}.tmp"
    with open(temporary_path, "w", encoding="utf-8") as handle:
        json.dump(records, handle, ensure_ascii=False, indent=2)
    os.replace(temporary_path, ATTENDANCE_RECORDS_PATH)


@app.get("/api/attendance")
def get_attendance(work_id: str = None, review_status: str = None):
    records = _read_attendance_records()
    if work_id:
        target = str(work_id).strip()
        records = [r for r in records if str(r.get("work_id") or "").strip() == target]
    if review_status:
        target_status = review_status.strip().upper()
        records = [r for r in records if str(r.get("review_status") or "").upper() == target_status]
    return {"total": len(records), "records": records}


if __name__ == "__main__":
    import uvicorn
    print("Starting FastAPI server on http://127.0.0.1:8000 ...")
    uvicorn.run(app, host="127.0.0.1", port=8000)
