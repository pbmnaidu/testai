import os
import sys
import json
from datetime import date, datetime
import pandas as pd
import numpy as np
from fastapi import FastAPI, Query, HTTPException
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware

# Ensure workspace root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__) + "/../.."))

from src.data.sync.snapshot_manager import get_snapshot_history
from src.data.sync.sync_runner import get_sync_status as get_automation_status, preview_diff, commit_preview, run_sync_job, start_scheduler
from src.data.sync.training_manager import TRAINING_MANAGER
from src.utils.mlflow_tracker import MLflowTracker
from src.modules.material_context import analyze_material_context
from src.modules.sector_classifier import classify_and_cost, MPLADS_SECTOR_MATRIX
from src.modules.work_classifier import classify_work_descriptions

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
        self.cache = {}
        if not frame.empty and "work_id" in frame.columns:
            for position, value in enumerate(frame["work_id"].tolist()):
                work_id = str(value or "").strip()
                if work_id:
                    self.positions[work_id] = position

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
    if "master" not in _DATA_CACHE:
        master_p = os.path.join(FEATURES_DIR, "master_project_risk_scores.parquet")
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

    financial_scores = pd.to_numeric(master.get("financial_risk_score", pd.Series(0, index=master.index)), errors="coerce").fillna(0)
    peer_ratios = pd.to_numeric(master.get("amount_to_peer_ratio", pd.Series(0, index=master.index)), errors="coerce").fillna(0)
    financial_outlier_mask = master.get("is_financial_outlier", pd.Series(False, index=master.index)).fillna(False).astype(bool)
    financial_summary = {
        "flagged_financial_outliers": int(financial_scores.ge(50).sum()),
        "high_peer_ratio_works": int(peer_ratios.gt(3).sum()),
        "isolation_outlier_rate_pct": round(float(financial_outlier_mask.mean() * 100), 2) if len(master) else 0.0,
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
        "category_distribution": cat_list[:8]
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
        "suspicious_works": suspicious_records
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
        "records": records
    }

@app.get("/api/sync/status")
def get_sync_status():
    return get_automation_status()

@app.get("/api/sync/history")
def get_sync_history():
    log_file = os.path.join(DATA_DIR, "sync_history.json")
    if os.path.exists(log_file):
        try:
            with open(log_file, 'r') as f:
                return json.load(f)
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
    result = run_sync_job()
    if result.get("success"):
        _DATA_CACHE.clear()
        return result
    raise HTTPException(status_code=502, detail=result.get("sync", {}).get("error", "Official REST sync failed"))


@app.get("/api/sync/training-status")
def sync_training_status():
    return TRAINING_MANAGER.status()

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
    """Return reference-sector cost context for one work, when a match exists."""
    data = get_data()
    record = data["work_index"].get(work_id.strip())
    if not record:
        raise HTTPException(status_code=404, detail=f"Work ID '{work_id}' not found.")
    reference = os.path.join(DATA_DIR, "reference", "mplads_sector_cost_reference.csv")
    if not os.path.exists(reference):
        raise HTTPException(status_code=503, detail="Sector reference data is unavailable.")
    frame = pd.DataFrame([record])
    if "sanctioned_work_description" not in frame:
        frame["sanctioned_work_description"] = frame.get("description", "")
    result = classify_and_cost(frame, reference).iloc[0].to_dict()
    return clean_record_for_json(result)

@app.get("/api/sectors")
def get_sector_matrix():
    """Expose the source project's sector reference model to the final API."""
    return {"sector_matrix": MPLADS_SECTOR_MATRIX, "count": len(MPLADS_SECTOR_MATRIX)}

@app.get("/api/compliance/rules")
def get_compliance_rules():
    """Return the 2023 guideline thresholds used by the compliance engine."""
    return {
        "source": "mplads_2023_guidelines_including_changes.pdf",
        "deadlines": {"sanction_or_rejection_days": 45, "general_completion_days": 365},
        "minimum_work_amount_inr": 250000,
        "sc_target_pct": 15.0,
        "st_target_pct": 7.5,
        "repair_renovation": {"annual_authorization_cap_pct": 10.0, "requires_reasonable_gap": True},
        "prohibited_categories": ["residential", "commercial_private", "operation_maintenance", "grants_loans", "relief_funds", "land_acquisition", "reimbursement", "individual_family_benefit", "csr_pooling", "religious", "swagat_dwar", "unauthorized_colony"],
    }

@app.get("/api/risk-monitor")
def get_risk_monitor_queue(
    state: str = None,
    constituency: str = None,
    category: str = None,
    severity: str = None,
    search: str = None,
    min_financial_risk: float = None,
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
    if category and category.strip():
        df = df[df["work_category"].str.lower() == category.strip().lower()]
    if severity and severity.strip():
        df = df[df["overall_risk_level"].str.upper() == severity.strip().upper()]
    if min_financial_risk is not None:
        df = df[df["financial_risk_score"] >= min_financial_risk]
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
    df_sorted = df.sort_values(sort_col, ascending=False)
    
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
        "records": records
    }

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
        for wid, rec in work_index.items():
            if wid.lower().replace(" ", "-") == norm_target:
                work_record = rec
                clean_id = wid
                break
                
    if not work_record:
        parts = clean_id.replace(" ", "-").split("/")
        tail = parts[-1] if len(parts) > 1 else clean_id
        if tail and len(tail) >= 4 and tail.isdigit():
            for wid, rec in work_index.items():
                if wid.endswith("/" + tail) or wid == tail:
                    work_record = rec
                    clean_id = wid
                    break
                    
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

@app.get("/api/filters")
def get_filter_options():
    data = get_data()
    master = data["master"]
    
    states = sorted([str(s) for s in master["state"].dropna().unique() if str(s).strip() != ""])
    constituencies = sorted([str(c) for c in master["constituency"].dropna().unique() if str(c).strip() != ""])
    mps = sorted([str(m) for m in master["mp_name"].dropna().unique() if str(m).strip() != ""])
    categories = sorted([str(c) for c in master["work_category"].dropna().unique() if str(c).strip() != ""])
    severities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
    
    return {
        "states": states,
        "constituencies": constituencies,
        "mps": mps,
        "categories": categories,
        "severities": severities
    }

if __name__ == "__main__":
    import uvicorn
    print("Starting FastAPI server on http://127.0.0.1:8000 ...")
    uvicorn.run(app, host="127.0.0.1", port=8000)
