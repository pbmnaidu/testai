import os
import pandas as pd
import numpy as np
try:
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler
    HAS_SKLEARN = True
except Exception:
    HAS_SKLEARN = False
from src.modules.sector_classifier import MPLADS_SECTOR_MATRIX

def run_financial_anomaly_detection():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    features_dir = os.environ.get("FEATURES_DIR", os.path.join(base_dir, "data", "features"))
    master_path = os.path.join(features_dir, "master_analytical.parquet")
    
    if not os.path.exists(master_path):
        raise FileNotFoundError(f"Master analytical dataset not found at {master_path}")
        
    print("=== EXECUTING MODULE 2: FINANCIAL & EXPENDITURE ANOMALY DETECTION ===")
    df = pd.read_parquet(master_path)
    print(f"Loaded master dataset: {len(df):,} records")

    # 1. Fill missing financial values safely & calculate per-unit cost
    df["sanction_amount_clean"] = df["sanction_amount"].fillna(0)
    df["effective_expenditure_clean"] = df["effective_expenditure"].fillna(0)
    df["payment_count_clean"] = df["payment_count"].fillna(0)
    df["expenditure_to_sanction_ratio"] = np.where(
        df["sanction_amount_clean"] > 0,
        df["effective_expenditure_clean"] / df["sanction_amount_clean"],
        0.0,
    )
    df["quantity_clean"] = pd.to_numeric(df.get("quantity_detected", pd.Series(np.nan, index=df.index)), errors="coerce").fillna(1)
    df["quantity_clean"] = np.where(df["quantity_clean"] > 0, df["quantity_clean"], 1.0)
    df["unit_sanction_amount"] = df["sanction_amount_clean"] / df["quantity_clean"]

    # Historical financial baselines must come from completed works.  A unit
    # price is created only when the description supplies a real quantity and
    # unit; otherwise the comparison uses total expenditure.
    completed_mask = completion.notna() if "completion" in locals() else pd.Series(False, index=df.index)

    # Helper date/status variables for financial & data quality COs (C08-C11)
    def _first(frame, names, default=np.nan):
        for name in names:
            if name in frame.columns: return frame[name]
        return pd.Series(default, index=frame.index)

    rec = pd.to_datetime(_first(df, ["recommended_date", "Recommended date"]), errors="coerce")
    sanction = pd.to_datetime(_first(df, ["sanction_date", "Sanction Date"]), errors="coerce")
    start = pd.to_datetime(_first(df, ["start_date", "first_payment_date"]), errors="coerce")
    completion = pd.to_datetime(_first(df, ["completion_date"]), errors="coerce")
    status = _first(df, ["work_status", "Work Status"], "").fillna("").astype(str).str.lower()
    description = _first(df, ["description", "Work description"], "").fillna("").astype(str)
    constituency = _first(df, ["constituency", "Constituency"], "").fillna("").astype(str).str.lower().str.strip()

    c08 = ((rec.notna() & sanction.notna() & rec.gt(sanction)) |
           (sanction.notna() & start.notna() & sanction.gt(start)) |
           (start.notna() & completion.notna() & start.gt(completion)) |
           (sanction.notna() & completion.notna() & sanction.gt(completion)))
    c09 = df["effective_expenditure_clean"].gt(df["sanction_amount_clean"]) & df["sanction_amount_clean"].gt(0)
    c10 = df["effective_expenditure_clean"].lt(0) | df["sanction_amount_clean"].lt(0) | (df["effective_expenditure_clean"].gt(0) & df["sanction_amount_clean"].eq(0))
    c11 = rec.isna() | sanction.isna() | description.str.len().lt(5) | constituency.eq("")

    # Sector matrix bounds (C_SECTOR_COST_LOW, C_SECTOR_COST_HIGH, C_SECTOR_DAYS_HIGH)
    c_sec_cost_low = pd.Series(False, index=df.index)
    c_sec_cost_high = pd.Series(False, index=df.index)
    c_sec_days_high = pd.Series(False, index=df.index)

    for idx, row in df.iterrows():
        sec = row.get("sector_id", "")
        if sec in MPLADS_SECTOR_MATRIX:
            limits = MPLADS_SECTOR_MATRIX[sec]
            amt = row.get("sanction_amount_clean", 0)
            u_amt = row.get("unit_sanction_amount", amt)
            q = row.get("quantity_clean", 1)
            if amt > 0:
                if q > 1:
                    # For bulk quantity works, evaluate per-unit amount against sector limits
                    if u_amt < limits["min_cost"] and amt < limits["min_cost"]:
                        c_sec_cost_low.at[idx] = True
                    elif u_amt > limits["max_cost"] and amt > (q * limits["max_cost"]):
                        c_sec_cost_high.at[idx] = True
                else:
                    if amt < limits["min_cost"]:
                        c_sec_cost_low.at[idx] = True
                    elif amt > limits["max_cost"]:
                        c_sec_cost_high.at[idx] = True
            s_date = row.get("sanction_date")
            c_date = row.get("completion_date")
            if pd.notna(s_date) and pd.notna(c_date):
                if (c_date - s_date).days > limits["max_days"]:
                    c_sec_days_high.at[idx] = True

    df["c08_dates_unordered"] = c08
    df["c09_expenditure_exceeds_sanction"] = c09
    df["c10_financial_invalid"] = c10
    df["c11_info_missing"] = c11
    df["c_sec_cost_low"] = c_sec_cost_low
    df["c_sec_cost_high"] = c_sec_cost_high
    df["c_sec_days_high"] = c_sec_days_high

    completed_mask = completion.notna() | status.str.contains("complete", na=False)
    reliable_quantity = pd.to_numeric(df.get("quantity_detected", pd.Series(np.nan, index=df.index)), errors="coerce").gt(0) & df.get("quantity_unit", pd.Series("", index=df.index)).fillna("").astype(str).str.len().gt(0)
    df["current_expenditure"] = df["effective_expenditure_clean"]
    df["current_unit_price"] = np.where(reliable_quantity & df["current_expenditure"].gt(0), df["current_expenditure"] / df["quantity_clean"], np.nan)
    df["comparison_basis"] = np.where(reliable_quantity, "COMPLETED_COMPARABLE_UNIT_PRICE", "COMPLETED_COMPARABLE_TOTAL_EXPENDITURE")
    df["baseline_value"] = np.where(reliable_quantity, df["current_unit_price"], df["current_expenditure"])
    history = df[completed_mask & df["current_expenditure"].gt(0)].copy()
    history["baseline_value"] = np.where(
        reliable_quantity.loc[history.index],
        history["current_expenditure"] / history["quantity_clean"],
        history["current_expenditure"],
    )

    # 2. Peer Group Baseline Calculation at constituency + sector/category
    # level, using completed works only.
    peer_category = "effective_work_category" if "effective_work_category" in df.columns else "work_category"
    print("Computing constituency peer-group statistical baselines on per-unit cost (Median & IQR)...")
    
    # Calculate group medians, averages, IQRs, and counts at Constituency level on per-unit cost basis
    const_stats = history.groupby([peer_category, "constituency"])["baseline_value"].agg(
        constituency_historic_avg_cost="mean",
        constituency_historic_median_cost="median",
        constituency_work_count="count",
        q1=lambda x: np.percentile(x, 25),
        q3=lambda x: np.percentile(x, 75)
    ).reset_index()
    const_stats["iqr"] = const_stats["q3"] - const_stats["q1"]
    const_stats["upper_bound"] = const_stats["q3"] + 1.5 * const_stats["iqr"]
    
    df = pd.merge(df, const_stats, on=[peer_category, "constituency"], how="left")
    df["peer_group_level"] = "CATEGORY_CONSTITUENCY"
    df["peer_group_size"] = df["constituency_work_count"]
    df["peer_group_label"] = df[peer_category].astype(str) + " | " + df["constituency"].astype(str)
    df["peer_group_category"] = df[peer_category]
    df["peer_group_median"] = df["constituency_historic_median_cost"]
    df["peer_group_quality"] = np.where(df["peer_group_size"] >= 15, "HIGH", np.where(df["peer_group_size"] >= 5, "MEDIUM", "LOW"))
    df["expected_median"] = df["constituency_historic_median_cost"]
    df["historical_median_unit_price"] = np.where(reliable_quantity, df["expected_median"], np.nan)
    df["historical_sample_size"] = df["peer_group_size"].fillna(0).astype(int)
    df["comparable_work_count"] = df["historical_sample_size"]
    df["deviation_percentage"] = np.where(df["expected_median"].gt(0), ((df["baseline_value"] - df["expected_median"]) / df["expected_median"]) * 100, np.nan)

    if "reference_expected_cost_inr" in df.columns:
        reference_basis = df["reference_total_cost_inr"].where(df.get("reference_total_cost_inr", pd.Series(np.nan, index=df.index)).notna(), df["reference_expected_cost_inr"])
        df["reference_cost_basis_inr"] = reference_basis
        df["reference_cost_deviation_ratio"] = df["sanction_amount_clean"] / (reference_basis + 1)
        df["historic_cost_deviation_ratio"] = df["unit_sanction_amount"] / (df["constituency_historic_avg_cost"] + 1)
        df["reference_range_valid"] = df["reference_total_cost_max_inr"].notna() & df["quantity_detected"].notna()
        df["reference_range_exceeded"] = df["reference_range_valid"] & (df["sanction_amount_clean"] > df["reference_total_cost_max_inr"])
    
    # Calculate Statistical Ratios & Percentiles within Constituency on unit cost basis
    df["amount_to_peer_ratio"] = df["baseline_value"] / (df["constituency_historic_median_cost"] + 1)
    df["category_percentile"] = df.groupby([peer_category, "constituency"])["baseline_value"].rank(pct=True) * 100
    df["peer_percentile"] = df["category_percentile"]
    df["peer_group_median"] = df["constituency_historic_median_cost"]
    df["peer_group_q1"] = df["q1"]
    df["peer_group_q3"] = df["q3"]
    df["peer_group_iqr"] = df["iqr"]
    df["peer_group_upper_bound"] = df["upper_bound"]

    # 3. Statistical Anomaly Score (0 to 100)
    def calc_stat_score(row):
        score = 0
        ratio = row["amount_to_peer_ratio"]
        percentile = row["category_percentile"]
        bound = row["upper_bound"]
        u_amount = row["unit_sanction_amount"]
        
        # Outlier severity based on constituency median ratio
        if ratio > 3.0:
            score += 40
        elif ratio > 2.0:
            score += 25
        elif ratio > 1.5:
            score += 15
            
        # Percentile ranking score within constituency
        if percentile >= 98:
            score += 25
        elif percentile >= 95:
            score += 15
        elif percentile >= 90:
            score += 10
            
        # IQR Upper bound check
        if bound > 0 and u_amount > bound:
            score += 10

        reference_ratio = row.get("reference_cost_deviation_ratio", np.nan)
        if pd.notna(reference_ratio):
            if reference_ratio > 3:
                score += 15
            elif reference_ratio > 2:
                score += 10
            
        # Score additions for financial & sector bound rules
        if row.get("c09_expenditure_exceeds_sanction"): score += 35
        if row.get("c10_financial_invalid"): score += 35
        if row.get("c_sec_cost_low"): score += 30
        if row.get("c_sec_cost_high"): score += 40
        if row.get("c_sec_days_high"): score += 25
        if row.get("c08_dates_unordered"): score += 20
        if row.get("c11_info_missing"): score += 15

        return min(score, 100)

    df["stat_financial_score"] = df.apply(calc_stat_score, axis=1)

    # 4. Unsupervised ML Anomaly Detection (Isolation Forest)
    print("Training Isolation Forest on multi-variate financial features...")
    feature_cols = [
        "unit_sanction_amount",
        "effective_expenditure_clean",
        "amount_to_peer_ratio",
        "payment_count_clean",
        "expenditure_to_sanction_ratio",
        "quantity_clean"
    ]
    
    X = df[feature_cols].fillna(0)
    if HAS_SKLEARN:
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        
        iso_forest = IsolationForest(
            n_estimators=100,
            contamination=0.05,
            random_state=42
        )
        iso_forest.fit(X_scaled)
        
        # Raw decision function scores (lower = more anomalous)
        raw_ml_scores = iso_forest.decision_function(X_scaled)
        
        # Scale ML score to 0-100 where higher = more anomalous
        min_s, max_s = raw_ml_scores.min(), raw_ml_scores.max()
        df["ml_financial_score"] = (1.0 - (raw_ml_scores - min_s) / (max_s - min_s + 1e-5)) * 100
    else:
        # Fallback outlier calculation using normalized Euclidean distance from mean
        means = X.mean()
        stds = X.std().replace(0, 1)
        X_scaled = (X - means) / stds
        outlier_dist = np.sqrt((X_scaled ** 2).sum(axis=1))
        min_s, max_s = outlier_dist.min(), outlier_dist.max()
        df["ml_financial_score"] = ((outlier_dist - min_s) / (max_s - min_s + 1e-5) * 100).clip(0, 100)

    # 5. Composite Financial Risk Score & Risk Levels (Multi-Method Evaluation)
    material_score = df.get("material_cost_context_score", pd.Series(0.0, index=df.index)).fillna(0)
    df["financial_anomaly_score"] = (0.6 * df["stat_financial_score"] + 0.4 * df["ml_financial_score"]).round(1)
    df["financial_risk_score"] = (0.55 * df["stat_financial_score"] + 0.35 * df["ml_financial_score"] + 0.10 * material_score).round(1)
    
    def assign_risk_level(score):
        if score >= 85:
            return "CRITICAL"
        elif score >= 65:
            return "HIGH"
        elif score >= 35:
            return "MEDIUM"
        return "LOW"

    df["financial_risk_level"] = df["financial_risk_score"].apply(assign_risk_level)
    df["is_financial_outlier"] = df["financial_risk_score"] >= 65

    # 6. Multi-Method Natural Language Explainability Generator (ELI10 Format)
    def generate_explanation(row):
        reasons = []
        amount = float(row["sanction_amount_clean"])
        u_amount = float(row.get("unit_sanction_amount", amount))
        q = float(row.get("quantity_clean", 1))
        exp = float(row["effective_expenditure_clean"])
        pct = float(row.get("category_percentile", 0))
        cat = str(row.get(peer_category, "this work category"))
        constituency = str(row.get("constituency", "Constituency")).title()
        sec = str(row.get("sector_id", ""))
        ml_score = float(row.get("ml_financial_score", 0))

        const_med = row.get("constituency_historic_median_cost", np.nan)
        const_count = row.get("constituency_work_count", 0)

        # Method 1: Sector Matrix Cost Bounds Check
        sec_info = MPLADS_SECTOR_MATRIX.get(sec)
        if sec_info:
            sec_name = sec_info["name"]
            min_c = sec_info["min_cost"]
            max_c = sec_info["max_cost"]
            if row.get("c_sec_cost_high"):
                if q > 1:
                    reasons.append(f"Sector Bounds Check: Sanctioned amount (₹{amount:,.0f} for {q:g} units @ ₹{u_amount:,.0f}/unit) exceeds sector maximum cost ceiling (₹{max_c:,.0f}/unit) for {sec_name}.")
                else:
                    reasons.append(f"Sector Bounds Check: Sanctioned amount (₹{amount:,.0f}) exceeds sector maximum cost ceiling (₹{max_c:,.0f}) for {sec_name}.")
            elif row.get("c_sec_cost_low"):
                if q > 1:
                    reasons.append(f"Sector Bounds Check: Unit cost (₹{u_amount:,.0f}/unit) is below sector minimum cost floor (₹{min_c:,.0f}/unit) for {sec_name} (Potential Project Splitting).")
                else:
                    reasons.append(f"Sector Bounds Check: Sanctioned amount (₹{amount:,.0f}) is below sector minimum cost floor (₹{min_c:,.0f}) for {sec_name} (Potential Project Splitting).")
            else:
                if q > 1:
                    reasons.append(f"Sector Bounds Check: Sanctioned cost (₹{amount:,.0f} for {q:g} units @ ₹{u_amount:,.0f}/unit) is within sector allowed limits (₹{min_c:,.0f} - ₹{max_c:,.0f}/unit) for {sec_name}.")
                else:
                    reasons.append(f"Sector Bounds Check: Sanctioned cost (₹{amount:,.0f}) is within sector allowed limits (₹{min_c:,.0f} - ₹{max_c:,.0f}) for {sec_name}.")
        else:
            reasons.append(f"Sector Bounds Check: Evaluated against general MPLADS cost ceiling guidelines.")

        # Method 2: Constituency Work Type History Check
        if pd.notna(const_med) and const_med > 0 and const_count >= 2:
            const_ratio = u_amount / const_med
            if q > 1:
                if const_ratio > 1.5:
                    reasons.append(f"Constituency History Check: Per-unit cost is {const_ratio:.1f}x higher than historical median unit cost (₹{const_med:,.0f}/unit) for '{cat}' in {constituency} (Total ₹{amount:,.0f} for {q:g} units @ ₹{u_amount:,.0f}/unit).")
                elif const_ratio < 0.5:
                    reasons.append(f"Constituency History Check: Per-unit cost (₹{u_amount:,.0f}/unit for {q:g} units) is lower than local historical median unit cost (₹{const_med:,.0f}/unit) for '{cat}' in {constituency}.")
                else:
                    reasons.append(f"Constituency History Check: Per-unit cost (₹{u_amount:,.0f}/unit for {q:g} units) aligns with local historical median unit cost (₹{const_med:,.0f}/unit) for '{cat}' in {constituency}.")
            else:
                if const_ratio > 1.5:
                    reasons.append(f"Constituency History Check: Cost is {const_ratio:.1f}x higher than historical median cost (₹{const_med:,.0f}) for '{cat}' in {constituency}.")
                elif const_ratio < 0.5:
                    reasons.append(f"Constituency History Check: Cost is lower than local historical median (₹{const_med:,.0f}) for '{cat}' in {constituency}.")
                else:
                    reasons.append(f"Constituency History Check: Cost aligns with local historical median (₹{const_med:,.0f}) for '{cat}' in {constituency}.")
        else:
            if q > 1:
                reasons.append(f"Constituency History Check: Per-unit cost evaluated at ₹{u_amount:,.0f}/unit for {q:g} units for '{cat}' in {constituency}.")
            else:
                reasons.append(f"Constituency History Check: Baseline recorded for '{cat}' in {constituency} (limited historical samples).")

        # Method 3: Constituency Percentile Rank Check
        if q > 1:
            if pct >= 90:
                reasons.append(f"Constituency Percentile Rank Check: High unit-cost outlier — positioned in top {100 - pct:.0f}% (higher per-unit cost than {pct:.0f}% of similar projects in {constituency}).")
            elif pct <= 10:
                reasons.append(f"Constituency Percentile Rank Check: Low unit-cost outlier — positioned in bottom {pct:.0f}% of similar projects in {constituency}.")
            else:
                reasons.append(f"Constituency Percentile Rank Check: Positioned at {pct:.0f}th percentile on per-unit cost basis among similar projects in {constituency}.")
        else:
            if pct >= 90:
                reasons.append(f"Constituency Percentile Rank Check: High cost outlier — positioned in top {100 - pct:.0f}% (higher than {pct:.0f}% of similar projects in {constituency}).")
            elif pct <= 10:
                reasons.append(f"Constituency Percentile Rank Check: Low cost outlier — positioned in bottom {pct:.0f}% of similar projects in {constituency}.")
            else:
                reasons.append(f"Constituency Percentile Rank Check: Positioned at {pct:.0f}th percentile among similar projects in {constituency}.")

        # Method 4: AI Machine Learning Anomaly Score Check (Isolation Forest)
        if ml_score >= 65:
            reasons.append(f"AI Pattern Check: Unsupervised Machine Learning model flagged this spending pattern as anomalous (Score: {ml_score:.0f}/100).")
        else:
            reasons.append(f"AI Pattern Check: Unsupervised Machine Learning model classified spending pattern as normal (Score: {ml_score:.0f}/100).")

        # Additional Financial Integrity & Data Quality Flags (C08-C11)
        if row.get("c09_expenditure_exceeds_sanction"):
            reasons.append(f"Expenditure Breach (C09): Recorded spending (₹{exp:,.0f}) exceeds sanctioned budget (₹{amount:,.0f}).")
        if row.get("c10_financial_invalid"):
            reasons.append("Invalid Data Record (C10): Financial records have missing, zero, or negative amounts.")
        if row.get("c_sec_days_high"):
            max_d = MPLADS_SECTOR_MATRIX[sec]["max_days"] if sec in MPLADS_SECTOR_MATRIX else 0
            reasons.append(f"Execution Timeline Breach: Duration exceeded sector maximum limit of {max_d} days.")
        if row.get("c08_dates_unordered"):
            reasons.append("Date Order Error (C08): Recorded dates are not in chronological order.")
        if row.get("c11_info_missing"):
            reasons.append("Missing Details (C11): Required work details or constituency information are incomplete.")

        return "\n".join(f"{index}. {reason}" for index, reason in enumerate(reasons, start=1))

    df["financial_explanation"] = df.apply(generate_explanation, axis=1)
    def reasons(row):
        result = []
        if row.get("category_source") not in (None, "UNCLASSIFIED"):
            result.append({"type": "CLASSIFICATION", "severity": "INFO", "message": f"Description-based classification: {row.get(peer_category)}", "confidence": float(row.get("category_confidence", 0))})
        if row.get("amount_to_peer_ratio", 0) > 1.5:
            basis = "unit price" if pd.notna(row.get("current_unit_price")) else "total expenditure"
            result.append({"type": "PEER_DEVIATION", "severity": "HIGH", "metric": basis, "value": float(row["amount_to_peer_ratio"]), "peer_count": int(row.get("peer_group_size", 0)), "message": f"Current {basis} is {row['amount_to_peer_ratio']:.1f}x the median of comparable completed works."})
        if row.get("ml_financial_score", 0) >= 65:
            result.append({"type": "STATISTICAL_ANOMALY", "severity": "MEDIUM", "metric": "isolation_forest", "value": float(row["ml_financial_score"]), "message": "Isolation Forest identifies an unusual financial pattern."})
        return result
    df["risk_reasons"] = df.apply(reasons, axis=1)
    df["anomaly_detected"] = df["financial_risk_score"].ge(65)
    df["anomaly_type"] = np.where(df["current_unit_price"].notna(), "UNIT_PRICE_DEVIATION", "TOTAL_EXPENDITURE_DEVIATION")
    df["anomaly_severity"] = df["financial_risk_level"]
    df["confidence"] = np.where(df["historical_sample_size"].ge(15), "HIGH", np.where(df["historical_sample_size"].ge(5), "MEDIUM", "LOW"))
    df["explanation"] = df["financial_explanation"]
    df["risk_description"] = np.where(df["anomaly_detected"], df["financial_explanation"], "No material financial anomaly detected against completed-work comparables.")

    # Save output
    out_file = os.path.join(features_dir, "financial_anomalies.parquet")
    df.to_parquet(out_file, index=False)
    
    print("\n=== MODULE 2 EXECUTION SUMMARY ===")
    print(f"Total Works Evaluated: {len(df):,}")
    print("Risk Level Breakdown:")
    print(df["financial_risk_level"].value_counts().to_string())
    print(f"\nFlagged Financial Outliers (Score >= 65): {df['is_financial_outlier'].sum():,}")
    print(f"Results saved to: {out_file}")

if __name__ == "__main__":
    run_financial_anomaly_detection()
