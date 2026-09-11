import os
import pandas as pd
import numpy as np
from datetime import datetime

def run_schedule_risk_engine():
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    features_dir = os.environ.get("FEATURES_DIR", os.path.join(root_dir, "data", "features"))
    master_path = os.path.join(features_dir, "master_analytical.parquet")
    
    if not os.path.exists(master_path):
        raise FileNotFoundError(f"Master analytical dataset not found at {master_path}")
        
    print("=== EXECUTING MODULE 6: SCHEDULE & PROGRESS RISK ENGINE ===")
    df = pd.read_parquet(master_path)
    print(f"Loaded master dataset: {len(df):,} records")

    ref_date = datetime.strptime("2026-09-09", "%Y-%m-%d")

    # Ensure estimated_completion_date column exists or derive from sanction_date + 365 days
    if "estimated_completion_date" not in df.columns:
        sanc_dates = pd.to_datetime(df["sanction_date"], errors="coerce")
        df["estimated_completion_date"] = (sanc_dates + pd.Timedelta(days=365)).dt.strftime("%Y-%m-%d")

    # Date parsing helper
    df["sanction_date_dt"] = pd.to_datetime(df["sanction_date"], errors="coerce")
    df["est_completion_date_dt"] = pd.to_datetime(df["estimated_completion_date"], errors="coerce")
    df["act_completion_date_dt"] = pd.to_datetime(df["completion_date"], errors="coerce") if "completion_date" in df.columns else pd.Series([None]*len(df))

    # Historical completion baseline: completed works in the same classified
    # sector/category are the primary reference. Fall back to the guideline's
    # one-year general target only when the historical sample is unavailable.
    peer_field = "effective_work_category" if "effective_work_category" in df.columns else "work_category"
    completed_duration = (df["act_completion_date_dt"] - df["sanction_date_dt"]).dt.days if "act_completion_date_dt" in df else pd.Series(np.nan, index=df.index)
    completed_duration = completed_duration.where(completed_duration.gt(0))
    df["historical_completion_days"] = completed_duration
    history = df.loc[completed_duration.notna()].copy()
    hist = history.groupby(peer_field)["historical_completion_days"].agg(["median", "count"]).rename(columns={"median": "sector_median_completion_period", "count": "sector_completion_sample_size"})
    df = df.join(hist, on=peer_field)
    df["sector_median_completion_period"] = df["sector_median_completion_period"].fillna(365).round(1)
    df["sector_completion_sample_size"] = df["sector_completion_sample_size"].fillna(0).astype(int)
    df["expected_completion_period"] = df["sector_median_completion_period"]

    # S1: Planned Duration (Days)
    df["planned_duration_days"] = df["sector_median_completion_period"]
    df["planned_duration_days"] = df["planned_duration_days"].apply(lambda d: max(d, 30) if pd.notnull(d) and d > 0 else 365)
    df["est_completion_date_dt"] = df["sanction_date_dt"] + pd.to_timedelta(df["planned_duration_days"], unit="D")
    df["estimated_completion_date"] = df["est_completion_date_dt"].dt.strftime("%Y-%m-%d")

    # S2: Elapsed Duration (Days)
    df["elapsed_duration_days"] = np.where(
        df["sanction_date_dt"].notnull(),
        (ref_date - df["sanction_date_dt"]).dt.days,
        180
    )
    df["elapsed_duration_days"] = df["elapsed_duration_days"].apply(lambda d: max(d, 0))

    # S3: Expected Timeline Progress %
    df["expected_timeline_progress_pct"] = np.where(
        df["planned_duration_days"] > 0,
        (df["elapsed_duration_days"] / df["planned_duration_days"]) * 100,
        50.0
    ).clip(0, 100).round(1)

    # S4: Expenditure Progress % (Financial Proxy)
    sanc_amt = df["sanction_amount"].fillna(0)
    exp_amt = df["effective_expenditure"].fillna(0)
    df["expenditure_progress_pct"] = np.where(
        sanc_amt > 0,
        (exp_amt / sanc_amt) * 100,
        0.0
    ).clip(0, 100).round(1)

    # S5: Progress Gap (Percentage Points)
    df["progress_gap_pct"] = (df["expected_timeline_progress_pct"] - df["expenditure_progress_pct"]).clip(lower=0).round(1)

    # S6: Overdue Days (for Ongoing works where today > estimated completion date)
    is_ongoing = df["act_completion_date_dt"].isnull()
    is_overdue = is_ongoing & df["est_completion_date_dt"].notnull() & (df["est_completion_date_dt"] < ref_date)
    df["overdue_days"] = np.where(
        is_overdue,
        (ref_date - df["est_completion_date_dt"]).dt.days,
        0
    )

    # S7: Actual Completion Delay (for Completed works)
    df["actual_completion_delay_days"] = np.where(
        df["act_completion_date_dt"].notnull() & df["est_completion_date_dt"].notnull(),
        (df["act_completion_date_dt"] - df["est_completion_date_dt"]).dt.days,
        0
    )

    # S8: Peer Progress Deviation (relative to State + Category expenditure progress median)
    peer_progress = df.groupby(["work_category", "state"])["expenditure_progress_pct"].median().reset_index()
    peer_progress.rename(columns={"expenditure_progress_pct": "peer_median_expenditure_progress"}, inplace=True)
    df = pd.merge(df, peer_progress, on=["work_category", "state"], how="left")
    df["peer_median_expenditure_progress"] = df["peer_median_expenditure_progress"].fillna(25.0).round(1)
    df["peer_progress_deviation"] = (df["expenditure_progress_pct"] - df["peer_median_expenditure_progress"]).round(1)

    # Calculate Schedule Risk Score (0 to 100)
    def calc_schedule_score(row):
        score = 0
        gap = row["progress_gap_pct"]
        overdue = row["overdue_days"]
        delay = row["actual_completion_delay_days"]
        
        # Progress Gap Scoring
        if gap > 50:
            score += 55
        elif gap > 30:
            score += 35
        elif gap > 15:
            score += 20
            
        # Overdue / Completion Delay Scoring
        if overdue > 180 or delay > 180:
            score += 35
        elif overdue > 90 or delay > 90:
            score += 25
        elif overdue > 30 or delay > 30:
            score += 15

        elapsed = row.get("elapsed_duration_days", 0)
        if elapsed > 365 or delay > 365:
            score += 25
        description = str(row.get("description", "")).lower()
        if any(term in description for term in ["flood", "cyclone", "earthquake", "drought", "calamity", "rehabilitation"]):
            if elapsed > 240 or delay > 240:
                score += 20
            
        # Missing Estimated Date Penalty
        if pd.isnull(row["estimated_completion_date"]):
            score += 10
            
        return min(score, 100)

    df["schedule_risk_score"] = df.apply(calc_schedule_score, axis=1)

    def assign_schedule_risk_level(score):
        if score >= 85:
            return "CRITICAL"
        elif score >= 65:
            return "HIGH"
        elif score >= 35:
            return "MEDIUM"
        return "LOW"

    df["schedule_risk_level"] = df["schedule_risk_score"].apply(assign_schedule_risk_level)
    df["actual_or_elapsed_period"] = np.where(df["act_completion_date_dt"].notna(), completed_duration, df["elapsed_duration_days"])
    df["completion_deviation"] = df["actual_or_elapsed_period"] - df["sector_median_completion_period"]
    df["completion_risk_score"] = df["schedule_risk_score"]
    df["completion_risk_category"] = df["schedule_risk_level"]

    # Human-readable schedule narrative.  The numeric fields remain available
    # as supporting evidence, while the explanation itself stays cautious and
    # does not present a schedule signal as proof of non-compliance.
    def generate_schedule_narrative(row):
        is_completed = pd.notnull(row.get("act_completion_date_dt"))
        gap = row["progress_gap_pct"]
        overdue = row["overdue_days"]
        actual_delay = row.get("actual_completion_delay_days", 0)

        if is_completed and actual_delay > 0:
            what = "The work was completed later than the historical completion timeline observed for similar works in this sector."
            why = "The completion record and the reasons for the delay should be checked against the work file."
        elif overdue > 0:
            what = "The work has passed its planned completion date and remains incomplete."
            why = "Physical progress, revised scheduling, and the implementing agency's explanation should be verified."
        elif gap > 15:
            what = "Recorded expenditure is behind the implementation progress expected for the elapsed period."
            why = "The progress record should be checked to determine whether the work is advancing as planned."
        elif row["peer_progress_deviation"] < -20:
            what = "Recorded expenditure is lower than the pattern observed for comparable works at a similar stage."
            why = "Site milestones and expenditure records should be reviewed together before drawing a conclusion about delay."
        else:
            what = "The available execution and expenditure records do not show a material schedule concern."
            why = "Routine monitoring can continue using the next physical progress and expenditure update."

        details = (
            f"Expected timeline progress: {row['expected_timeline_progress_pct']:.1f}%; "
            f"recorded expenditure progress: {row['expenditure_progress_pct']:.1f}%; "
            f"progress difference: {row['progress_gap_pct']:.1f} percentage points; "
            f"overdue days: {int(row['overdue_days'])}."
        )
        return pd.Series({
            "what": what, "why": why, "details": details,
            "explanation": f"{what} {why}",
        })

    schedule_narrative = df.apply(generate_schedule_narrative, axis=1)
    df["schedule_what_happened"] = schedule_narrative["what"]
    df["schedule_why_it_matters"] = schedule_narrative["why"]
    df["schedule_supporting_details"] = schedule_narrative["details"]
    df["schedule_explanation"] = schedule_narrative["explanation"]

    def generate_completion_explanation(row):
        if pd.notnull(row.get("act_completion_date_dt")):
            if row["completion_deviation"] > 30:
                return "The work was completed later than the historical completion duration observed for similar works in this sector. The completion record and any recorded explanation for the delay should be reviewed."
            return "The work was completed within the historical completion duration observed for similar works in this sector."
        else:
            if row["completion_deviation"] > 30:
                return "The elapsed execution duration is longer than the historical completion timeline observed for similar works in this sector. The current site status and revised completion plan should be reviewed."
            return "The elapsed execution duration remains within the historical timeline observed for similar works in this sector."

    df["completion_explanation"] = df.apply(generate_completion_explanation, axis=1)

    # Save output
    out_file = os.path.join(features_dir, "schedule_risk_analysis.parquet")
    df.to_parquet(out_file, index=False)
    
    print("\n=== MODULE 6 SCHEDULE & PROGRESS EXECUTION SUMMARY ===")
    print(f"Total Works Evaluated: {len(df):,}")
    print("Schedule Risk Level Breakdown:")
    print(df["schedule_risk_level"].value_counts().to_string())
    print(f"Results saved to: {out_file}")

if __name__ == "__main__":
    run_schedule_risk_engine()
