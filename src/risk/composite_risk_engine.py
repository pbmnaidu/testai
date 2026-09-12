import os
import re
import pandas as pd
import numpy as np

def run_composite_risk_engine():
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    features_dir = os.environ.get("FEATURES_DIR", os.path.join(root_dir, "data", "features"))
    
    master_path = os.path.join(features_dir, "master_analytical.parquet")
    fin_path = os.path.join(features_dir, "financial_anomalies.parquet")
    dup_path = os.path.join(features_dir, "work_duplicate_scores.parquet")
    comp_path = os.path.join(features_dir, "compliance_risk_analysis.parquet")
    sched_path = os.path.join(features_dir, "schedule_risk_analysis.parquet")
    
    print("=== EXECUTING PHASE 3: COMPOSITE RISK INTELLIGENCE & ALERT ENGINE ===")
    
    # Load base master
    df_base = pd.read_parquet(master_path)
    print(f"Loaded master project base: {len(df_base):,} works")
    
    # 1. Merge Financial Risk
    if os.path.exists(fin_path):
        fin_df = pd.read_parquet(fin_path)
        required_financial = ["work_id", "financial_risk_score", "financial_risk_level", "financial_explanation"]
        financial_context = [
            "is_financial_outlier", "risk_reasons", "anomaly_detected", "anomaly_type", "anomaly_severity",
            "expected_median", "current_cost", "current_expenditure", "deviation_percentage",
            "historical_sample_size", "comparison_basis", "comparable_work_count", "quantity_unit",
            "quantity_detected", "current_unit_price", "historical_median_unit_price", "confidence",
            "explanation", "risk_description", "financial_risk_evidence", "financial_audit_interpretation",
            "historical_cost_min", "historical_cost_max", "historical_cost_median", "historical_cost_count",
            "historical_unit_price_min", "historical_unit_price_max", "historical_unit_price_median",
            "historical_unit_price_count", "historical_comparable_work_count", "financial_risk_rank",
            "cost_comparison_status", "unit_comparison_status", "comparison_constituency",
            "comparison_state", "comparison_scope", "comparison_level", "comparison_group_label",
            "comparison_sector", "comparison_subsector", "comparison_work_type", "unit_comparison_scope",
            "comparison_peer_category", "peer_category", "peer_category_auto_generated",
            "original_effective_work_category",
            "unit_price_comparison_eligible", "unit_price_skip_reason",
            "financial_what_happened", "financial_why_it_matters", "financial_supporting_details",
        ]
        fin_df = fin_df[[c for c in required_financial + financial_context + ["model_name", "model_version", "dataset_snapshot", "last_analyzed_at"] if c in fin_df.columns]].drop_duplicates("work_id")
        for column, default in {
            "model_name": "MPLADS_Financial_Anomaly_Model",
            "model_version": "v2",
            "dataset_snapshot": "SNAP-2026-09-09",
            "last_analyzed_at": None,
        }.items():
            if column not in fin_df.columns:
                fin_df[column] = default
        df_base = pd.merge(df_base, fin_df, on="work_id", how="left")
    else:
        df_base["financial_risk_score"] = 0.0
        df_base["financial_risk_level"] = "LOW"
        df_base["financial_explanation"] = ""
        df_base["model_name"] = "MPLADS_Financial_Anomaly_Model"
        df_base["model_version"] = "v2"
        df_base["dataset_snapshot"] = "SNAP-2026-09-09"

    # 2. Merge Duplicate Risk
    if os.path.exists(dup_path):
        dup_df = pd.read_parquet(dup_path)
        duplicate_columns = [c for c in [
            "work_id", "duplicate_risk_score", "duplicate_risk_level", "duplicate_explanation",
            "duplicate_what_happened", "duplicate_why_it_matters", "duplicate_supporting_details",
        ] if c in dup_df.columns]
        dup_df = dup_df[duplicate_columns].drop_duplicates("work_id")
        df_base = pd.merge(df_base, dup_df, on="work_id", how="left")
    else:
        df_base["duplicate_risk_score"] = 0.0

    # 3. Merge Compliance Risk
    if os.path.exists(comp_path):
        comp_df = pd.read_parquet(comp_path)
        compliance_columns = [c for c in [
            "work_id", "compliance_risk_score", "compliance_risk_level",
            "compliance_explanation", "triggered_rules", "is_compliance_flagged",
            "is_work_level_compliance_risk", "compliance_scope",
            "compliance_review_status", "compliance_findings",
            "compliance_data_quality", "compliance_rule_results",
            "compliance_primary_rule_id", "compliance_primary_status",
            "compliance_primary_guideline_basis", "compliance_primary_what_happened",
            "compliance_primary_why_it_matters", "compliance_primary_supporting_details",
            "compliance_primary_details_json", "compliance_what_happened",
            "compliance_why_it_matters", "compliance_supporting_details",
        ] if c in comp_df.columns]
        comp_df = comp_df[compliance_columns].drop_duplicates("work_id")
        df_base = pd.merge(df_base, comp_df, on="work_id", how="left")
    else:
        df_base["compliance_risk_score"] = 0.0
        df_base["compliance_risk_level"] = "LOW"
        df_base["compliance_explanation"] = ""

    # 4. Merge Schedule Risk
    if os.path.exists(sched_path):
        schedule_columns = [c for c in ["work_id", "schedule_risk_score", "schedule_risk_level", "schedule_explanation", "schedule_what_happened", "schedule_why_it_matters", "schedule_supporting_details", "expected_timeline_progress_pct", "expenditure_progress_pct", "progress_gap_pct", "overdue_days", "expected_completion_period", "actual_or_elapsed_period", "sector_median_completion_period", "completion_deviation", "completion_risk_score", "completion_risk_category", "completion_explanation"] if c in pd.read_parquet(sched_path, columns=None).columns]
        sched_df = pd.read_parquet(sched_path)[schedule_columns].drop_duplicates("work_id")
        df_base = pd.merge(df_base, sched_df, on="work_id", how="left")
    else:
        df_base["schedule_risk_score"] = 0.0
        df_base["schedule_risk_level"] = "LOW"
        df_base["schedule_explanation"] = ""

    # Fill NaNs in risk scores safely
    df_base["financial_risk_score"] = df_base["financial_risk_score"].fillna(0)
    df_base["duplicate_risk_score"] = df_base["duplicate_risk_score"].fillna(0)
    df_base["compliance_risk_score"] = df_base["compliance_risk_score"].fillna(0)
    df_base["schedule_risk_score"] = df_base["schedule_risk_score"].fillna(0)

    # 6. Priority-preserving composite. Compliance is the controlling signal;
    # a critical compliance failure cannot be diluted by low other scores.
    # Weights are normalized to 100% after increasing schedule context to 15%.
    w_comp, w_fin, w_dup, w_sched = 0.42, 0.28, 0.15, 0.15
    
    df_base["composite_risk_score"] = (
        (w_comp * df_base["compliance_risk_score"]) +
        (w_fin * df_base["financial_risk_score"]) +
        (w_dup * df_base["duplicate_risk_score"]) +
        (w_sched * df_base["schedule_risk_score"])
    ).round(1)

    # Compute Financial Impact Score (Public Funds at Risk) = Composite Risk * Unspent Sanction Amount (in Lakhs)
    sanction_val = df_base["sanction_amount"].fillna(0)
    expend_val = df_base["effective_expenditure"].fillna(0) if "effective_expenditure" in df_base.columns else 0
    unspent_lakhs = (sanction_val - expend_val).clip(lower=0) / 100000.0
    
    df_base["impact_score"] = (df_base["composite_risk_score"] * (unspent_lakhs + 1.0)).round(1)

    def assign_overall_level(score):
        if score >= 85:
            return "CRITICAL"
        elif score >= 65:
            return "HIGH"
        elif score >= 35:
            return "MEDIUM"
        return "LOW"

    fraud_gate = (
        df_base["compliance_risk_score"].ge(99) |
        df_base["triggered_rules"].fillna("").astype(str).str.contains("C_FRAUD_DUPLICATE_EVIDENCE")
    )
    compliance_gate = df_base["compliance_risk_score"].ge(85)
    high_compliance_gate = df_base["compliance_risk_score"].ge(65)
    financial_gate = df_base["financial_risk_score"].ge(85)
    
    # Priority-preserving composite with 100% Risk Override for Suspected Fraud
    df_base["composite_risk_score"] = np.where(
        fraud_gate,
        100.0,
        np.maximum(df_base["composite_risk_score"], np.where(compliance_gate, 85, np.where(high_compliance_gate, 65, np.where(financial_gate, 65, 0))))
    )
    df_base["overall_risk_score"] = df_base["composite_risk_score"]
    df_base["overall_risk_level"] = np.where(fraud_gate, "CRITICAL", df_base["composite_risk_score"].apply(assign_overall_level))
    df_base["overall_risk_category"] = df_base["overall_risk_level"]
    df_base["requires_audit_action"] = df_base["composite_risk_score"] >= 35


    # 7. Human-readable evidence explanations and reviewer actions.
    print("Generating ranked explainable audit summaries & recommended reviewer actions...")
    
    f_exp = df_base["financial_explanation"].fillna("").astype(str) if "financial_explanation" in df_base.columns else pd.Series([""]*len(df_base))
    c_exp = df_base["compliance_explanation"].fillna("").astype(str) if "compliance_explanation" in df_base.columns else pd.Series([""]*len(df_base))
    s_exp = df_base["schedule_explanation"].fillna("").astype(str) if "schedule_explanation" in df_base.columns else pd.Series([""]*len(df_base))
    d_exp = df_base["duplicate_explanation"].fillna("").astype(str) if "duplicate_explanation" in df_base.columns else pd.Series([""]*len(df_base))

    f_high = df_base["financial_risk_score"] >= 65
    d_high = df_base["duplicate_risk_score"] >= 85
    c_high = df_base["compliance_risk_score"] >= 35
    s_high = df_base["schedule_risk_score"] >= 35

    f_driver = np.where(f_high, f_exp, "")
    d_driver = np.where(
        d_high,
        d_exp,
        "",
    )
    c_driver = np.where(c_high, c_exp, "")
    s_driver = np.where(s_high, s_exp, "")

    f_act = np.where(f_high, "Verify the estimate, quantity, scope, and supporting cost justification against comparable completed works.", "")
    d_act = np.where(d_high, "Review related records to confirm whether they represent genuinely separate physical works or portions of the same project.", "")
    c_act = np.where(c_high, "Verify the compliance timeline and eligibility documentation against MPLADS guidelines and supporting records.", "")
    s_act = np.where(s_high, "Verify physical execution milestones and request a progress report from the implementing agency.", "")
    def join_text(t1, t2, t3, t4, fallback):
        parts = []
        for text in [t1, t2, t3, t4]:
            if text:
                parts.extend(line.strip() for line in str(text).replace(" | ", "\n").splitlines() if line.strip())
        if not parts:
            return fallback
        # Keep each driver as a short paragraph.  This is deliberately not a
        # numbered machine-style list: the reviewer should read a small story
        # and then open the supporting evidence for exact values.
        return "\n\n".join(parts)

    df_base["explainable_audit_summary"] = np.vectorize(join_text)(
        f_driver, d_driver, c_driver, s_driver, "No major financial, duplicate, compliance, or schedule concern requiring audit review was observed."
    )
    
    df_base["recommended_reviewer_action"] = np.vectorize(join_text)(
        f_act, d_act, c_act, s_act, "Standard periodic monitoring."
    )

    def priority_reason(row):
        if row.get("compliance_risk_score", 0) >= 99 or "C_FRAUD_DUPLICATE_EVIDENCE" in str(row.get("triggered_rules", "")):
            return "🚨 CRITICAL FRAUD OVERRIDE: Exact duplicate evidence or geotagged coordinates reused across distinct works."
        if row["compliance_risk_score"] >= 85:
            return "A high-priority work-level guideline finding is the main reason this work was prioritized for review."
        if row["compliance_risk_score"] >= 65:
            return "A work-level guideline finding warrants priority review against the supporting records."
        if row["financial_risk_score"] >= 65:
            return "The proposed pricing is outside the observed local historical pattern and warrants estimate verification."
        if row["duplicate_risk_score"] >= 85:
            return "Related work records warrant scope verification to confirm that each entry represents a distinct physical work."
        if row.get("schedule_risk_score", 0) >= 65:
            return "Execution timeline is delayed and warrants physical progress verification."
        return "No high-priority risk signal detected."

    df_base["highest_priority_reason"] = df_base.apply(priority_reason, axis=1)

    def concise_risk_description(row):
        triggered = str(row.get("triggered_rules", ""))
        if "C_FRAUD_DUPLICATE_EVIDENCE" in triggered or float(row.get("composite_risk_score", 0) or 0) >= 99:
            comp_exp = str(row.get("compliance_explanation", "")).strip()
            return f"🚨 CRITICAL FRAUD ALERT (100% Risk Override): Evidence reuse detected. {comp_exp}"

        candidates = [
            (float(row.get("compliance_risk_score", 0) or 0), row.get("compliance_explanation", "")),
            (float(row.get("financial_risk_score", 0) or 0), row.get("financial_explanation", "")),
            (float(row.get("duplicate_risk_score", 0) or 0), row.get("duplicate_explanation", "")),
            (float(row.get("schedule_risk_score", 0) or 0), row.get("schedule_explanation", "")),
        ]
        narrative = next((str(text).strip() for _, text in sorted(candidates, key=lambda item: item[0], reverse=True) if text and str(text).strip() and str(text).lower() != "nan"), "No major risk concern requiring audit review was observed.")
        # Remove any existing co-relation jargon
        narrative = re.sub(r'\b(?:image\s+)?co[- ]?relation\b', 'physical evidence comparison', narrative, flags=re.IGNORECASE)
        sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", narrative) if part.strip()]
        return " ".join(sentences[:3])

    # The main work description stays short; the complete multi-driver
    # narrative remains available in explainable_audit_summary and evidence.
    df_base["risk_description"] = df_base.apply(concise_risk_description, axis=1)
    df_base["recommended_action"] = df_base["recommended_reviewer_action"]
    df_base["risk_evidence"] = df_base["explainable_audit_summary"]
    df_base["confidence"] = np.where(df_base["compliance_risk_score"].ge(65), "HIGH", np.where(df_base["financial_risk_score"].ge(65), "MEDIUM", "LOW"))

    out_file = os.path.join(features_dir, "master_project_risk_scores.parquet")
    df_base.to_parquet(out_file, index=False)
    
    print("\n=== PHASE 3 COMPOSITE RISK ENGINE SUMMARY ===")
    print(f"Total Projects Processed: {len(df_base):,}")
    print("Overall Composite Risk Level Breakdown:")
    print(df_base["overall_risk_level"].value_counts().to_string())
    print(f"\nProjects Requiring Review (Risk Score >= 35): {df_base['requires_audit_action'].sum():,}")
    print(f"High Risk Projects (Risk Score >= 65): {(df_base['composite_risk_score'] >= 65).sum():,}")
    print(f"Critical Action Items (Risk Score >= 85): {(df_base['overall_risk_level'] == 'CRITICAL').sum():,}")
    print(f"Master Risk Database saved to: {out_file}")

if __name__ == "__main__":
    run_composite_risk_engine()
