import os
import sys
import json
import re
from datetime import date, datetime
import pandas as pd
import numpy as np
from fastapi import FastAPI, Query, HTTPException
from pydantic import BaseModel, Field
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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def start_automatic_sync_scheduler():
    start_scheduler()

# Resolve paths dynamically so the backend works on any machine (including Vercel)
_BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FEATURES_DIR = os.path.join(_BACKEND_ROOT, "data", "features")
PROCESSED_DIR = os.path.join(_BACKEND_ROOT, "data", "processed")
DATA_DIR = os.path.join(_BACKEND_ROOT, "data")

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
    data = get_data()
    master = data["master"]
    t1 = data["t1"]
    t7 = data["t7"]
    
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
    duplicate_counts = data["duplicates"]
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
    data = get_data()
    master = data["master"]

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

@app.get("/api/filters")
def get_filter_options(state: str = None, scope: str = "risk"):
    data = get_data()
    master = _all_records_frame(data) if scope.strip().lower() == "all" else data["master"]
    
    states = sorted([str(s) for s in master["state"].dropna().unique() if str(s).strip() != ""])
    constituency_master = master
    if state and state.strip():
        constituency_master = master[master["state"].str.upper() == state.strip().upper()]
    constituencies = sorted([str(c) for c in constituency_master["constituency"].dropna().unique() if str(c).strip() != ""])
    statuses = sorted([str(s) for s in constituency_master["work_status"].dropna().unique() if str(s).strip() != ""])
    mps = sorted([str(m) for m in master["mp_name"].dropna().unique() if str(m).strip() != ""])
    categories = sorted([str(c) for c in master["work_category"].dropna().unique() if str(c).strip() != ""])
    severities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
    
    risk_levels = sorted([str(level) for level in master["overall_risk_level"].dropna().unique() if str(level).strip() != ""]) if "overall_risk_level" in master.columns else []
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

if __name__ == "__main__":
    import uvicorn
    print("Starting FastAPI server on http://127.0.0.1:8000 ...")
    uvicorn.run(app, host="127.0.0.1", port=8000)
