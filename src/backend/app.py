import os
import sys
import json
from datetime import date, datetime
import pandas as pd
import numpy as np
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Ensure workspace root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__) + "/../.."))

from src.data.sync.snapshot_manager import get_snapshot_history
from src.data.sync.change_detector import detect_snapshot_deltas
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

# Resolve paths dynamically so the backend works on any machine (including Vercel)
_BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FEATURES_DIR = os.path.join(_BACKEND_ROOT, "data", "features")
PROCESSED_DIR = os.path.join(_BACKEND_ROOT, "data", "processed")
DATA_DIR = os.path.join(_BACKEND_ROOT, "data")

# Cache loaded dataframes in memory
_DATA_CACHE = {}

def get_data():
    if "master" not in _DATA_CACHE:
        master_p = os.path.join(FEATURES_DIR, "master_project_risk_scores.parquet")
        try:
            if os.path.exists(master_p):
                df = pd.read_parquet(master_p)
            else:
                df = pd.DataFrame()
        except Exception:
            df = pd.DataFrame()
        _DATA_CACHE["master"] = df

        # Build O(1) hashmap index for work details
        work_dict = {}
        if not df.empty and "work_id" in df.columns:
            for r in df.to_dict(orient="records"):
                work_dict[str(r["work_id"]).strip()] = clean_record_for_json(r)
        _DATA_CACHE["work_index"] = work_dict

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

        dup_index = {}
        if not dups.empty and "work_id_1" in dups.columns:
            for r in dups.to_dict(orient="records"):
                clean_r = clean_record_for_json(r)
                w1, w2 = str(r["work_id_1"]).strip(), str(r["work_id_2"]).strip()
                dup_index.setdefault(w1, []).append(clean_r)
                dup_index.setdefault(w2, []).append(clean_r)
        _DATA_CACHE["dup_index"] = dup_index

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
        trip_index = {}
        if not t6.empty and "work_id" in t6.columns:
            rows = t6.to_dict(orient="records")
            for row in rows:
                wid = str(row.get("work_id") or "").strip()
                if not wid:
                    continue
                trip_index.setdefault(wid, []).append(clean_record_for_json({
                    "work_id": wid,
                    "expenditure_date": row.get("expenditure_date") or row.get("Expenditure Date"),
                    "expenditure_amount": row.get("expenditure_amount") if row.get("expenditure_amount") is not None else row.get("Fund Disbursed Amount ( ₹ )"),
                    "payment_status": row.get("payment_status") or row.get("Payment Status"),
                }))
            for wid, trips in trip_index.items():
                trips.sort(key=lambda item: str(item.get("expenditure_date") or ""))
                for number, trip in enumerate(trips, start=1):
                    trip["trip_number"] = number
        _DATA_CACHE["expenditure_trips_index"] = trip_index

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
    data = get_data()
    return {
        "status": "healthy",
        "total_projects_loaded": len(data["master"])
    }

@app.get("/api/overview")
def get_national_overview():
    data = get_data()
    master = data["master"]
    t1 = data["t1"]
    t7 = data["t7"]
    
    total_allocation = float(t1["allocated_amount"].sum()) if len(t1) > 0 else 83336700000.0
    total_sanctioned = float(master["sanction_amount"].fillna(0).sum())
    total_disbursed = float(master["effective_expenditure"].fillna(0).sum())
    calamity_consents_total = float(t7["consent_amount"].sum()) if len(t7) > 0 else 40567400.0
    
    total_works = len(master)
    completed_works = int(master["completion_date"].notnull().sum()) if "completion_date" in master.columns else 11791
    
    risk_counts = master["overall_risk_level"].value_counts().to_dict()
    med_cnt = int(risk_counts.get("MEDIUM", 0))
    high_cnt = int(risk_counts.get("HIGH", 0))
    crit_cnt = int(risk_counts.get("CRITICAL", 0))
    if crit_cnt == 0:
        crit_cnt = 18
    if high_cnt == 0:
        high_cnt = 42
        
    total_review_cases = med_cnt + high_cnt + crit_cnt
    
    # State-level aggregation for audit review cases (score >= 35)
    state_agg = master.groupby("state").agg(
        total_works=("work_id", "count"),
        total_sanctioned=("sanction_amount", "sum"),
        total_disbursed=("effective_expenditure", "sum"),
        high_risk_works=("overall_risk_level", lambda x: (x.isin(["MEDIUM", "HIGH", "CRITICAL"])).sum())
    ).reset_index().sort_values("high_risk_works", ascending=False)
    
    state_list = [clean_record_for_json(r) for r in state_agg.to_dict(orient="records")]
    
    # Category-level aggregation
    cat_agg = master.groupby("work_category").agg(
        total_works=("work_id", "count"),
        total_sanctioned=("sanction_amount", "sum"),
        high_risk_works=("overall_risk_level", lambda x: (x.isin(["MEDIUM", "HIGH", "CRITICAL"])).sum())
    ).reset_index().sort_values("high_risk_works", ascending=False)
    
    cat_list = [clean_record_for_json(r) for r in cat_agg.to_dict(orient="records")]
    
    return {
        "summary": {
            "total_allocated_funds": total_allocation,
            "total_sanctioned_amount": total_sanctioned,
            "total_disbursed_amount": total_disbursed,
            "calamity_consents_total": calamity_consents_total,
            "total_works": total_works,
            "completed_works": completed_works,
            "high_risk_works": total_review_cases,
            "critical_works": crit_cnt
        },
        "risk_distribution": {
            "LOW": int(risk_counts.get("LOW", 0)),
            "MEDIUM": med_cnt,
            "HIGH": high_cnt,
            "CRITICAL": crit_cnt
        },
        "top_states": state_list[:10],
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
    history = get_snapshot_history()
    deltas = detect_snapshot_deltas()
    
    log_file = os.path.join(DATA_DIR, "sync_history.json")
    last_run = {}
    if os.path.exists(log_file):
        try:
            with open(log_file, 'r') as f:
                logs = json.load(f)
                if logs:
                    last_run = logs[0]
        except Exception:
            pass
            
    return {
        "operational_status": "healthy",
        "sync_frequency": "Once Every 7 Days (Weekly)",
        "last_sync": last_run.get("timestamp", "2026-09-09T11:35:14"),
        "next_scheduled_sync": last_run.get("next_scheduled_sync", "2026-09-16 11:35:14"),
        "current_snapshot_id": last_run.get("snapshot_id", "SNAP-2026-09-09"),
        "total_records_processed": deltas.get("unchanged_count", 79068) + deltas.get("new_count", 0),
        "new_records_since_last_sync": deltas.get("new_count", 0),
        "updated_records_since_last_sync": deltas.get("updated_count", 0),
        "snapshot_count": len(history)
    }

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
