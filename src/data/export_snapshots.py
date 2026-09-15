"""MPLADS Platform - Static Dashboard Snapshot Exporter.

Precomputes and exports validated static JSON snapshots for all dashboard pages,
work detail shards, and metadata manifests. Runs as an additive step after the
ML and analytical pipeline completes.
"""

import os
import sys
import json
import math
import shutil
import hashlib
from datetime import datetime, date
import numpy as np
import pandas as pd

# Ensure workspace root is in sys.path
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from src.data.sync.sync_config import FEATURES_DIR, PROCESSED_DIR, DATA_DIR, SNAPSHOTS_DIR
from src.modules.compliance_engine import GUIDELINE_SOURCE, public_scope_matrix
from src.utils.mlflow_tracker import MLflowTracker

SCHEMA_VERSION = "2.0.0"
FRONTEND_PUBLIC_SNAPSHOTS = os.path.join(_ROOT, "frontend", "public", "data", "snapshots")

# Projected detail columns needed by WorkRecord & ProjectDetailPage
DETAIL_COLUMNS = [
    "work_id", "state", "constituency", "mp_name", "description",
    "work_category", "work_status", "main_sector", "sanction_amount",
    "recommended_date", "sanction_date", "completion_date",
    "effective_expenditure", "total_expenditure", "overall_risk_level",
    "overall_risk_score", "composite_risk_score", "financial_risk_score",
    "financial_risk_level", "financial_risk_rank", "is_financial_outlier",
    "financial_explanation", "financial_what_happened", "financial_why_it_matters",
    "financial_supporting_details", "financial_risk_evidence",
    "compliance_risk_score", "compliance_risk_level", "compliance_explanation",
    "compliance_what_happened", "compliance_why_it_matters", "compliance_supporting_details",
    "compliance_review_status", "is_work_level_compliance_risk",
    "duplicate_risk_score", "duplicate_risk_level", "duplicate_explanation",
    "duplicate_what_happened", "duplicate_why_it_matters", "duplicate_supporting_details",
    "schedule_risk_score", "schedule_risk_level", "schedule_explanation",
    "schedule_what_happened", "schedule_why_it_matters", "schedule_supporting_details",
    "overdue_days", "progress_gap_pct", "expected_timeline_progress_pct", "expenditure_progress_pct",
    "unit_price_comparison_eligible", "recommended_reviewer_action", "triggered_rules",
    "peer_median", "amount_to_peer_ratio", "historical_cost_median", "explainable_audit_summary",
    "last_analyzed_at"
]

SCHEDULE_RISK_COLUMNS = [
    "work_id", "state", "constituency", "mp_name", "work_category", "work_status",
    "sanction_amount", "effective_expenditure", "completion_date", "sanction_date",
    "expected_timeline_progress_pct", "expenditure_progress_pct", "progress_gap_pct",
    "overdue_days", "schedule_risk_score", "schedule_risk_level",
    "schedule_explanation", "schedule_what_happened", "schedule_why_it_matters",
    "schedule_supporting_details"
]


def clean_record_for_json(record: dict) -> dict:
    """Recursively convert pandas/NumPy values into strict JSON primitives."""
    def clean_value(value):
        if value is None or value is pd.NaT or value is pd.NA:
            return None
        if isinstance(value, (pd.Timestamp, datetime, date, np.datetime64)):
            try:
                if pd.isna(value):
                    return None
            except (TypeError, ValueError):
                pass
            return pd.Timestamp(value).strftime("%Y-%m-%d")
        if isinstance(value, np.ndarray):
            return [clean_value(item) for item in value.tolist()]
        if isinstance(value, dict):
            return {str(k): clean_value(v) for k, v in value.items()}
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

    return {str(k): clean_value(v) for k, v in record.items()}


def compute_sha256(filepath: str) -> str:
    """Compute SHA-256 hash of a file."""
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def _get_work_shard(work_id: str) -> str:
    """Compute deterministic 2-char hex shard (00-ff) for a work ID."""
    clean_id = str(work_id or "").strip()
    return hashlib.sha256(clean_id.encode("utf-8")).hexdigest()[:2]


def export_dashboard_snapshots(target_version: str = None) -> dict:
    """Export all precomputed dashboard data snapshots atomically."""
    start_t = datetime.now()
    now_iso = start_t.astimezone().isoformat()
    if not target_version:
        target_version = f"v_{start_t.strftime('%Y%m%d_%H%M%S')}"

    print(f"\n[SNAPSHOT EXPORT] Initializing snapshot export: {target_version}")

    os.makedirs(FRONTEND_PUBLIC_SNAPSHOTS, exist_ok=True)
    os.makedirs(SNAPSHOTS_DIR, exist_ok=True)

    # Staging directory directly under FRONTEND_PUBLIC_SNAPSHOTS
    staging_dir = os.path.join(FRONTEND_PUBLIC_SNAPSHOTS, f"{target_version}.tmp")
    if os.path.exists(staging_dir):
        shutil.rmtree(staging_dir)
    os.makedirs(staging_dir, exist_ok=True)
    work_details_staging = os.path.join(staging_dir, "work_details")
    os.makedirs(work_details_staging, exist_ok=True)

    # 1. Load Parquet datasets using explicit column projections
    master_path = os.path.join(FEATURES_DIR, "master_project_risk_scores.parquet")
    dup_path = os.path.join(FEATURES_DIR, "duplicate_work_candidates.parquet")
    cluster_path = os.path.join(FEATURES_DIR, "duplicate_work_clusters.parquet")
    constituency_path = os.path.join(FEATURES_DIR, "constituency_compliance_analysis.parquet")
    benchmarks_path = os.path.join(FEATURES_DIR, "financial_peer_benchmarks.parquet")
    t1_path = os.path.join(PROCESSED_DIR, "t1_allocated_limits.parquet")
    t6_path = os.path.join(PROCESSED_DIR, "t6_expenditure.parquet")
    t7_path = os.path.join(PROCESSED_DIR, "t7_calamity_consents.parquet")

    print("[SNAPSHOT EXPORT] Loading source datasets...")
    master_df = pd.read_parquet(master_path) if os.path.exists(master_path) else pd.DataFrame()
    dup_df = pd.read_parquet(dup_path) if os.path.exists(dup_path) else pd.DataFrame()
    cluster_df = pd.read_parquet(cluster_path) if os.path.exists(cluster_path) else pd.DataFrame()
    constituency_df = pd.read_parquet(constituency_path) if os.path.exists(constituency_path) else pd.DataFrame()
    benchmarks_df = pd.read_parquet(benchmarks_path) if os.path.exists(benchmarks_path) else pd.DataFrame()
    t1_df = pd.read_parquet(t1_path) if os.path.exists(t1_path) else pd.DataFrame()
    t6_df = pd.read_parquet(t6_path) if os.path.exists(t6_path) else pd.DataFrame()
    t7_df = pd.read_parquet(t7_path) if os.path.exists(t7_path) else pd.DataFrame()

    total_works = len(master_df)
    print(f"[SNAPSHOT EXPORT] Master records: {total_works:,}")

    # Index expenditure trips by work_id
    expenditure_by_work = {}
    if not t6_df.empty and "work_id" in t6_df.columns:
        date_col = "expenditure_date" if "expenditure_date" in t6_df.columns else "Expenditure Date"
        amt_col = "expenditure_amount" if "expenditure_amount" in t6_df.columns else "Fund Disbursed Amount ( ₹ )"
        status_col = "payment_status" if "payment_status" in t6_df.columns else "Payment Status"

        for _, row in t6_df.iterrows():
            wid = str(row.get("work_id") or "").strip()
            if not wid:
                continue
            expenditure_by_work.setdefault(wid, []).append(clean_record_for_json({
                "work_id": wid,
                "expenditure_date": row.get(date_col),
                "expenditure_amount": row.get(amt_col),
                "payment_status": row.get(status_col),
            }))
        for wid, trips in expenditure_by_work.items():
            trips.sort(key=lambda t: str(t.get("expenditure_date") or ""))
            for i, trip in enumerate(trips, start=1):
                trip["trip_number"] = i

    # Index duplicate candidates by work_id
    dups_by_work = {}
    if not dup_df.empty:
        for _, row in dup_df.iterrows():
            cand = clean_record_for_json(row.to_dict())
            for col in ("work_id_1", "work_id_2"):
                wid = str(row.get(col) or "").strip()
                if wid:
                    dups_by_work.setdefault(wid, []).append(cand)

    # 2. Compute Overview
    print("[SNAPSHOT EXPORT] Building overview.json...")
    total_allocation = float(t1_df["allocated_amount"].sum()) if not t1_df.empty and "allocated_amount" in t1_df.columns else 0.0
    total_sanctioned = float(master_df["sanction_amount"].fillna(0).sum()) if not master_df.empty else 0.0
    total_disbursed = float(master_df["effective_expenditure"].fillna(0).sum()) if not master_df.empty else 0.0
    calamity_total = float(t7_df["consent_amount"].sum()) if not t7_df.empty and "consent_amount" in t7_df.columns else 0.0
    completed_works = int(master_df["completion_date"].notnull().sum()) if "completion_date" in master_df.columns else 0

    risk_counts = master_df["overall_risk_level"].value_counts().to_dict() if "overall_risk_level" in master_df.columns else {}
    med_cnt = int(risk_counts.get("MEDIUM", 0))
    high_cnt = int(risk_counts.get("HIGH", 0))
    crit_cnt = int(risk_counts.get("CRITICAL", 0))
    low_cnt = int(risk_counts.get("LOW", 0))
    overdue_works = int((pd.to_numeric(master_df["overdue_days"], errors="coerce").fillna(0) > 0).sum()) if "overdue_days" in master_df.columns else 0

    state_source = master_df[master_df["state"].fillna("").astype(str).str.strip().ne("")].copy()
    state_agg = state_source.groupby("state").agg(
        total_works=("work_id", "count"),
        total_sanctioned=("sanction_amount", "sum"),
        total_disbursed=("effective_expenditure", "sum"),
        high_risk_works=("overall_risk_level", lambda x: (x.isin(["MEDIUM", "HIGH", "CRITICAL"])).sum()),
        critical_works=("overall_risk_level", lambda x: (x == "CRITICAL").sum()),
        average_risk_score=("overall_risk_score", "mean"),
    ).reset_index().sort_values("high_risk_works", ascending=False)

    def state_risk_level(score):
        if score >= 85: return "CRITICAL"
        if score >= 65: return "HIGH"
        if score >= 35: return "MEDIUM"
        return "LOW"

    state_agg["risk_level"] = state_agg["average_risk_score"].fillna(0).map(state_risk_level)
    state_agg["risk_percentage"] = (
        state_agg["high_risk_works"] / state_agg["total_works"].replace(0, np.nan) * 100
    ).fillna(0).round(1)

    for label, col in (
        ("financial_risk_works", "financial_risk_score"),
        ("compliance_risk_works", "compliance_risk_score"),
        ("duplicate_risk_works", "duplicate_risk_score"),
        ("schedule_risk_works", "schedule_risk_score"),
    ):
        if col in state_source.columns:
            counts = pd.to_numeric(state_source[col], errors="coerce").fillna(0).ge(35).groupby(state_source["state"]).sum()
            state_agg[label] = state_agg["state"].map(counts).fillna(0).astype(int)
        else:
            state_agg[label] = 0

    if not dup_df.empty and "state" in dup_df.columns:
        dup_st = dup_df[dup_df["state"].fillna("").astype(str).str.strip().ne("")]
        dup_counts = dup_st.groupby("state").size()
        state_agg["duplicate_candidate_pairs"] = state_agg["state"].map(dup_counts).fillna(0).astype(int)
    else:
        state_agg["duplicate_candidate_pairs"] = 0

    state_list = [clean_record_for_json(r) for r in state_agg.to_dict(orient="records")]

    cat_agg = master_df.groupby("work_category").agg(
        total_works=("work_id", "count"),
        total_sanctioned=("sanction_amount", "sum"),
        high_risk_works=("overall_risk_level", lambda x: (x.isin(["MEDIUM", "HIGH", "CRITICAL"])).sum())
    ).reset_index().sort_values("high_risk_works", ascending=False)
    cat_list = [clean_record_for_json(r) for r in cat_agg.to_dict(orient="records")]

    fin_outlier_mask = master_df.get("is_financial_outlier", pd.Series(False, index=master_df.index)).fillna(False).astype(bool)
    hist_avail = pd.to_numeric(master_df.get("historical_sample_size", pd.Series(0, index=master_df.index)), errors="coerce").fillna(0).ge(2)
    unit_avail = pd.to_numeric(master_df.get("historical_unit_price_count", pd.Series(0, index=master_df.index)), errors="coerce").fillna(0).ge(2)

    overview_payload = {
        "summary": {
            "total_allocated_funds": total_allocation,
            "total_sanctioned_amount": total_sanctioned,
            "total_disbursed_amount": total_disbursed,
            "calamity_consents_total": calamity_total,
            "total_works": total_works,
            "completed_works": completed_works,
            "high_risk_works": med_cnt + high_cnt + crit_cnt,
            "critical_works": crit_cnt,
            "overdue_works": overdue_works,
        },
        "risk_distribution": {
            "LOW": low_cnt,
            "MEDIUM": med_cnt,
            "HIGH": high_cnt,
            "CRITICAL": crit_cnt,
        },
        "top_states": state_list[:10],
        "state_metrics": state_list,
        "category_distribution": cat_list[:8],
        "financial_summary": {
            "flagged_financial_outliers": int(fin_outlier_mask.sum()),
            "historical_comparison_available": int(hist_avail.sum()),
            "unit_price_comparisons": int(unit_avail.sum()),
        },
        "metadata": {
            "schema_version": SCHEMA_VERSION,
            "generated_at": now_iso,
            "dataset_version": target_version,
            "stale_analysis": False,
        }
    }
    with open(os.path.join(staging_dir, "overview.json"), "w", encoding="utf-8") as f:
        json.dump(overview_payload, f, indent=2, ensure_ascii=False)

    # 3. State summaries for each state
    print("[SNAPSHOT EXPORT] Building state_summaries.json...")
    state_summaries = {}
    unique_states = [s for s in master_df["state"].dropna().unique() if str(s).strip()]
    for st in unique_states:
        sub = master_df[master_df["state"] == st]
        signals = []
        for key, label, col in (
            ("financial", "Financial", "financial_risk_score"),
            ("compliance", "Compliance", "compliance_risk_score"),
            ("duplicate", "Duplicate", "duplicate_risk_score"),
            ("schedule", "Schedule", "schedule_risk_score"),
        ):
            scores = pd.to_numeric(sub[col], errors="coerce").fillna(0) if col in sub.columns else pd.Series(dtype=float)
            signals.append({
                "key": key,
                "label": label,
                "average_score": round(float(scores.mean()), 1) if len(scores) else 0.0,
                "flagged_works": int((scores >= 35).sum()) if len(scores) else 0,
            })
        dominant = max(signals, key=lambda s: (s["average_score"], s["flagged_works"]), default=None) if len(sub) else None
        state_summaries[st.upper()] = {
            "state": st,
            "total_works": int(len(sub)),
            "signals": signals,
            "dominant_signal": dominant,
            "metadata": {"generated_at": now_iso, "dataset_version": target_version}
        }
    with open(os.path.join(staging_dir, "state_summaries.json"), "w", encoding="utf-8") as f:
        json.dump(state_summaries, f, indent=2, ensure_ascii=False)

    # 4. Filters
    print("[SNAPSHOT EXPORT] Building filters.json...")
    filters_payload = {
        "states": sorted([str(s) for s in master_df["state"].dropna().unique() if str(s).strip()]),
        "constituencies": sorted([str(c) for c in master_df["constituency"].dropna().unique() if str(c).strip()]),
        "mps": sorted([str(m) for m in master_df["mp_name"].dropna().unique() if str(m).strip()]),
        "categories": sorted([str(cat) for cat in master_df["work_category"].dropna().unique() if str(cat).strip()]),
        "severities": ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
        "statuses": sorted([str(st) for st in master_df["work_status"].dropna().unique() if str(st).strip() and not str(st).replace(".", "").isdigit()]),
        "risk_levels": ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
        "expenditure_options": ["WITH", "WITHOUT"],
    }
    with open(os.path.join(staging_dir, "filters.json"), "w", encoding="utf-8") as f:
        json.dump(filters_payload, f, indent=2, ensure_ascii=False)

    # 5. Compliance summary & rules & constituency compliance
    print("[SNAPSHOT EXPORT] Building compliance data...")
    comp_rules_payload = {
        "source": GUIDELINE_SOURCE,
        "work_level_rules": [r for r in public_scope_matrix() if r.get("scope") == "WORK"],
        "constituency_level_rules": [r for r in public_scope_matrix() if r.get("scope") == "CONSTITUENCY"],
        "non_guideline_heuristics": [r for r in public_scope_matrix() if r.get("scope") == "NON_GUIDELINE_HEURISTIC"],
    }
    with open(os.path.join(staging_dir, "compliance_rules.json"), "w", encoding="utf-8") as f:
        json.dump(comp_rules_payload, f, indent=2, ensure_ascii=False)

    comp_scores = pd.to_numeric(master_df.get("compliance_risk_score", pd.Series(0, index=master_df.index)), errors="coerce").fillna(0)
    comp_levels = master_df.get("compliance_risk_level", pd.Series("LOW", index=master_df.index)).fillna("LOW").astype(str).str.upper()
    comp_rule_counts = {}
    if "triggered_rules" in master_df.columns:
        vals = master_df["triggered_rules"].fillna("").astype(str).str.split(", ").explode()
        vals = vals[vals.ne("")]
        comp_rule_counts = {str(k): int(v) for k, v in vals.value_counts().items()}

    comp_summary_payload = {
        "work_level_risk": int(comp_scores.ge(20).sum()),
        "critical": int(comp_levels.eq("CRITICAL").sum()),
        "high": int(comp_levels.eq("HIGH").sum()),
        "medium": int(comp_levels.eq("MEDIUM").sum()),
        "needs_review": int(comp_scores.ge(20).sum()),
        "rule_counts": comp_rule_counts,
        "constituency_observations": len(constituency_df),
    }
    with open(os.path.join(staging_dir, "compliance_summary.json"), "w", encoding="utf-8") as f:
        json.dump(comp_summary_payload, f, indent=2, ensure_ascii=False)

    constituency_records = [clean_record_for_json(r) for r in constituency_df.to_dict(orient="records")]
    with open(os.path.join(staging_dir, "constituency_compliance.json"), "w", encoding="utf-8") as f:
        json.dump(constituency_records, f, indent=2, ensure_ascii=False)

    # 6. Duplicate clusters & candidates
    print("[SNAPSHOT EXPORT] Building duplicate data...")
    cluster_records = [clean_record_for_json(r) for r in cluster_df.to_dict(orient="records")]
    with open(os.path.join(staging_dir, "duplicate_clusters.json"), "w", encoding="utf-8") as f:
        json.dump(cluster_records, f, indent=2, ensure_ascii=False)

    top_dup_df = dup_df.sort_values("similarity_score", ascending=False).head(5000) if not dup_df.empty else dup_df
    dup_records = [clean_record_for_json(r) for r in top_dup_df.to_dict(orient="records")]
    with open(os.path.join(staging_dir, "duplicate_candidates.json"), "w", encoding="utf-8") as f:
        json.dump(dup_records, f, indent=2, ensure_ascii=False)

    # 7. Financial benchmarks
    print("[SNAPSHOT EXPORT] Building financial benchmarks...")
    benchmarks_records = [clean_record_for_json(r) for r in benchmarks_df.to_dict(orient="records")]
    benchmarks_payload = {
        "records": benchmarks_records,
        "available": {
            "states": sorted(benchmarks_df.get("state", pd.Series(dtype=str)).dropna().astype(str).unique().tolist()) if not benchmarks_df.empty else [],
            "sectors": sorted(benchmarks_df.get("main_sector", pd.Series(dtype=str)).dropna().astype(str).unique().tolist()) if not benchmarks_df.empty else [],
            "subsectors": sorted(benchmarks_df.get("subsector", pd.Series(dtype=str)).dropna().astype(str).unique().tolist()) if not benchmarks_df.empty else [],
        }
    }
    with open(os.path.join(staging_dir, "financial_benchmarks.json"), "w", encoding="utf-8") as f:
        json.dump(benchmarks_payload, f, indent=2, ensure_ascii=False)

    # 8. Schedule risk (projected to SCHEDULE_RISK_COLUMNS)
    print("[SNAPSHOT EXPORT] Building schedule risk...")
    avail_sched_cols = [c for c in SCHEDULE_RISK_COLUMNS if c in master_df.columns]
    sched_df = master_df[master_df.get("schedule_risk_score", pd.Series(0, index=master_df.index)).ge(35)]
    sched_levels = sched_df["schedule_risk_level"].value_counts().to_dict() if "schedule_risk_level" in sched_df.columns else {}
    avg_gap = float(sched_df["progress_gap_pct"].fillna(0).mean()) if "progress_gap_pct" in sched_df.columns and len(sched_df) > 0 else 0.0
    sched_projected = sched_df[avail_sched_cols].sort_values("schedule_risk_score", ascending=False).head(2000)
    sched_payload = {
        "summary": {
            "average_progress_gap_pct": round(avg_gap, 1),
            "high_schedule_risk_works": int(sched_levels.get("HIGH", 0) + sched_levels.get("CRITICAL", 0)),
            "schedule_risk_distribution": {
                "LOW": int(sched_levels.get("LOW", 0)),
                "MEDIUM": int(sched_levels.get("MEDIUM", 0)),
                "HIGH": int(sched_levels.get("HIGH", 0)),
                "CRITICAL": int(sched_levels.get("CRITICAL", 0)),
            }
        },
        "records": [clean_record_for_json(r) for r in sched_projected.to_dict(orient="records")],
        "metadata": {"generated_at": now_iso, "dataset_version": target_version}
    }
    with open(os.path.join(staging_dir, "schedule_risk.json"), "w", encoding="utf-8") as f:
        json.dump(sched_payload, f, indent=2, ensure_ascii=False)

    # 9. Officer dashboard default
    print("[SNAPSHOT EXPORT] Building officer dashboard...")
    material_eligible = master_df.get("unit_price_comparison_eligible", pd.Series(False, index=master_df.index)).fillna(False).astype(bool) if "unit_price_comparison_eligible" in master_df else pd.Series(False, index=master_df.index)
    score_mask = lambda col: pd.to_numeric(master_df.get(col, pd.Series(0, index=master_df.index)), errors="coerce").fillna(0).ge(35)
    officer_payload = {
        "summary": {
            "total_works": total_works,
            "high_priority_works": int(master_df.get("overall_risk_level", pd.Series()).isin(["HIGH", "CRITICAL"]).sum()),
            "material_price_reviews": int(material_eligible.sum()) or int(score_mask("financial_risk_score").sum()),
            "attendance_issues": 0,
            "citizen_complaints": 0,
            "compliance_issues": int(score_mask("compliance_risk_score").sum()),
            "schedule_risks": int(score_mask("schedule_risk_score").sum()),
            "duplicate_candidates": int(score_mask("duplicate_risk_score").sum()),
            "financial_reviews": int(score_mask("financial_risk_score").sum()),
        },
        "available": {
            "states": filters_payload["states"],
            "constituencies": filters_payload["constituencies"],
            "statuses": filters_payload["statuses"],
            "severities": filters_payload["severities"],
        },
        "data_availability": {
            "material": {"available": True, "source": "Material Quality & Price Fairness Engine"},
            "compliance": {"available": True, "source": "Rule Engine"},
            "schedule": {"available": True, "source": "Schedule Risk Engine"},
            "duplicate": {"available": True, "source": "Cosine / TF-IDF Similarity"},
        },
        "priority_works": [clean_record_for_json(r) for r in master_df.sort_values("overall_risk_score", ascending=False).head(100).to_dict(orient="records")],
        "queue_total": total_works,
    }
    with open(os.path.join(staging_dir, "officer_dashboard.json"), "w", encoding="utf-8") as f:
        json.dump(officer_payload, f, indent=2, ensure_ascii=False)

    # 10. Model status
    print("[SNAPSHOT EXPORT] Building model status...")
    model_status_payload = MLflowTracker.get_status()
    with open(os.path.join(staging_dir, "model_status.json"), "w", encoding="utf-8") as f:
        json.dump(model_status_payload, f, indent=2, ensure_ascii=False)

    # 11. Citizen & Attendance baseline records
    print("[SNAPSHOT EXPORT] Building citizen & attendance baseline records...")
    cit_path = os.path.join(DATA_DIR, "citizen_evidence.json")
    att_path = os.path.join(DATA_DIR, "attendance_records.json")
    cit_records = []
    att_records = []
    if os.path.exists(cit_path):
        try:
            with open(cit_path, "r", encoding="utf-8") as f:
                cit_records = json.load(f)
        except Exception:
            cit_records = []
    if os.path.exists(att_path):
        try:
            with open(att_path, "r", encoding="utf-8") as f:
                att_records = json.load(f)
        except Exception:
            att_records = []

    with open(os.path.join(staging_dir, "citizen_evidence_baseline.json"), "w", encoding="utf-8") as f:
        json.dump(cit_records, f, indent=2, ensure_ascii=False)
    with open(os.path.join(staging_dir, "attendance_baseline.json"), "w", encoding="utf-8") as f:
        json.dump(att_records, f, indent=2, ensure_ascii=False)

    # 12. Public citizen works list
    print("[SNAPSHOT EXPORT] Building citizen_works.json...")
    cit_cols = ["work_id", "description", "state", "constituency", "work_category", "work_status", "sanction_amount"]
    public_works = []
    for row in master_df[[c for c in cit_cols if c in master_df.columns]].to_dict(orient="records"):
        r = clean_record_for_json(row)
        status_str = str(r.get("work_status") or "").strip().upper()
        norm_status = "COMPLETED" if any(k in status_str for k in ("COMPLETED", "FINISHED", "CLOSED")) else ("CANCELLED" if any(k in status_str for k in ("CANCEL", "REJECT", "DROPPED")) else "ONGOING")
        public_works.append({
            "work_id": str(r.get("work_id") or "").strip(),
            "description": r.get("description") or "Work description not provided",
            "state": r.get("state") or "Unknown State",
            "constituency": r.get("constituency") or "Unknown Constituency",
            "work_category": r.get("work_category") or "Other",
            "work_status": r.get("work_status") or "Ongoing",
            "normalized_status": norm_status,
            "sanction_amount": r.get("sanction_amount"),
            "latitude": None,
            "longitude": None,
            "coordinate_available": False,
            "citizen_evidence_count": 0,
        })
    citizen_payload = {
        "records": public_works,
        "total": len(public_works),
        "stats": {
            "total_works": len(public_works),
            "ongoing_works": sum(1 for w in public_works if w["normalized_status"] == "ONGOING"),
            "completed_works": sum(1 for w in public_works if w["normalized_status"] == "COMPLETED"),
            "works_with_coordinates": 0,
            "citizen_evidence": len(cit_records),
            "categories": sorted({w["work_category"] for w in public_works if w.get("work_category")}),
        },
        "config": {
            "gps_accuracy_threshold_meters": 50,
            "allowed_evidence_radius_meters": 250,
            "max_upload_bytes": 10 * 1024 * 1024,
            "allowed_categories": ["QUALITY_DEFECT", "DELAY_ABANDONED", "UNAUTHORIZED_WORK", "OTHER_COMPLAINT"],
        }
    }
    with open(os.path.join(staging_dir, "citizen_works.json"), "w", encoding="utf-8") as f:
        json.dump(citizen_payload, f, indent=2, ensure_ascii=False)

    # 13. Risk Monitor Index (compact columns for client-side search/filters) and Default View
    print("[SNAPSHOT EXPORT] Building risk monitor index & default view...")
    risk_cols = [
        "work_id", "state", "constituency", "mp_name", "work_category", "work_status",
        "overall_risk_level", "sanction_amount", "sanction_date", "completion_date",
        "effective_expenditure", "financial_risk_score", "compliance_risk_score",
        "duplicate_risk_score", "schedule_risk_score", "composite_risk_score",
        "is_financial_outlier", "description"
    ]
    avail_risk_cols = [c for c in risk_cols if c in master_df.columns]
    risk_df = master_df[avail_risk_cols].sort_values("composite_risk_score", ascending=False)
    
    top_scores = {}
    for key, col in {
        "financial": "financial_risk_score",
        "duplicate": "duplicate_risk_score",
        "compliance": "compliance_risk_score",
        "schedule": "schedule_risk_score",
        "composite": "composite_risk_score",
    }.items():
        if col in master_df.columns:
            v = pd.to_numeric(master_df[col], errors="coerce").dropna()
            top_scores[key] = round(float(v.max()), 1) if len(v) else 0.0
        else:
            top_scores[key] = 0.0

    risk_monitor_default = {
        "total": len(risk_df),
        "page": 1,
        "limit": 50,
        "total_pages": int(math.ceil(len(risk_df) / 50)),
        "top_scores": top_scores,
        "records": [clean_record_for_json(r) for r in risk_df.head(100).to_dict(orient="records")],
        "metadata": {"generated_at": now_iso, "dataset_version": target_version}
    }
    with open(os.path.join(staging_dir, "risk_monitor_default.json"), "w", encoding="utf-8") as f:
        json.dump(risk_monitor_default, f, indent=2, ensure_ascii=False)

    risk_index_records = [clean_record_for_json(r) for r in risk_df.to_dict(orient="records")]
    with open(os.path.join(staging_dir, "risk_monitor_index.json"), "w", encoding="utf-8") as f:
        json.dump(risk_index_records, f, ensure_ascii=False)

    # 14. 256 Sharded Work Details (loaded on demand via sha256(work_id)[:2])
    print(f"[SNAPSHOT EXPORT] Building 256 work detail shards for {total_works:,} works...")
    shards_data = {f"{i:02x}": {} for i in range(256)}
    avail_detail_cols = [c for c in DETAIL_COLUMNS if c in master_df.columns]

    for _, row in master_df[avail_detail_cols].iterrows():
        wid = str(row.get("work_id") or "").strip()
        if not wid:
            continue
        h = _get_work_shard(wid)
        record = clean_record_for_json(row.to_dict())
        record["expenditure_trips"] = expenditure_by_work.get(wid, [])
        cand_dups = dups_by_work.get(wid, [])
        shards_data[h][wid] = {
            "work": record,
            "candidate_duplicates": cand_dups,
        }

    for shard_hex, items in shards_data.items():
        shard_path = os.path.join(work_details_staging, f"{shard_hex}.json")
        with open(shard_path, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False)

    # 15. Checksums and Manifest Generation
    print("[SNAPSHOT EXPORT] Computing checksums and generating manifest...")
    checksums = {}
    file_sizes = {}
    for root_dir, _, filenames in os.walk(staging_dir):
        for fn in filenames:
            full_p = os.path.join(root_dir, fn)
            rel_p = os.path.relpath(full_p, staging_dir).replace("\\", "/")
            checksums[rel_p] = compute_sha256(full_p)
            file_sizes[rel_p] = os.path.getsize(full_p)

    metadata_payload = {
        "schema_version": SCHEMA_VERSION,
        "snapshot_version": target_version,
        "generated_at": now_iso,
        "dataset_version": target_version,
        "row_counts": {
            "master_works": total_works,
            "duplicate_clusters": len(cluster_df),
            "duplicate_candidates": len(dup_records),
            "constituency_compliance": len(constituency_df),
            "financial_benchmarks": len(benchmarks_df),
            "public_works": len(public_works),
            "work_shards": len(shards_data),
        },
        "checksums": checksums,
        "file_sizes": file_sizes,
    }
    with open(os.path.join(staging_dir, "metadata.json"), "w", encoding="utf-8") as f:
        json.dump(metadata_payload, f, indent=2, ensure_ascii=False)

    # Atomic promotion in FRONTEND_PUBLIC_SNAPSHOTS
    final_public_dir = os.path.join(FRONTEND_PUBLIC_SNAPSHOTS, target_version)
    if os.path.exists(final_public_dir):
        shutil.rmtree(final_public_dir)
    os.replace(staging_dir, final_public_dir)

    # Read previous version if exists
    latest_path = os.path.join(FRONTEND_PUBLIC_SNAPSHOTS, "latest.json")
    previous_version = None
    if os.path.exists(latest_path):
        try:
            with open(latest_path, "r", encoding="utf-8") as f:
                prev = json.load(f)
                previous_version = prev.get("snapshot_version")
        except Exception:
            pass

    manifest = {
        "schema_version": SCHEMA_VERSION,
        "snapshot_version": target_version,
        "generated_at": now_iso,
        "dataset_version": target_version,
        "base_path": f"/data/snapshots/{target_version}",
        "row_counts": metadata_payload["row_counts"],
        "checksums": checksums,
        "previous_snapshot_version": previous_version,
    }

    with open(os.path.join(FRONTEND_PUBLIC_SNAPSHOTS, "latest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    # Also mirror latest.json in data/snapshots/ for repository documentation
    with open(os.path.join(SNAPSHOTS_DIR, "latest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    elapsed = (datetime.now() - start_t).total_seconds()
    print(f"[SNAPSHOT EXPORT] Successfully published snapshot {target_version} ({elapsed:.1f}s)")
    return manifest


if __name__ == "__main__":
    export_dashboard_snapshots()
