import os
import re
import numpy as np
import pandas as pd

MPLADS_SECTOR_MATRIX = {
    "SEC01": {
        "name": "Drinking Water Facility",
        "min_cost": 45000, "max_cost": 2500000,
        "min_days": 7, "max_days": 120,
        "primary_risk": "Invoice Inflation / Overlapping Site Duplication"
    },
    "SEC02": {
        "name": "Education",
        "min_cost": 300000, "max_cost": 1000000,
        "min_days": 15, "max_days": 180,
        "primary_risk": "Project Splitting / Hardware Kickbacks"
    },
    "SEC03": {
        "name": "Public Health & Sanitation",
        "min_cost": 800000, "max_cost": 3500000,
        "min_days": 30, "max_days": 270,
        "primary_risk": "Cost Escalation / Fake Asset Procurement"
    },
    "SEC04": {
        "name": "Roads, Pathways & Bridges",
        "min_cost": 300000, "max_cost": 3000000,
        "min_days": 60, "max_days": 120,
        "primary_risk": "Cost Inflation per Meter / Ghost Infrastructure"
    },
    "SEC05": {
        "name": "Electricity & Energy",
        "min_cost": 18000, "max_cost": 450000,
        "min_days": 7, "max_days": 30,
        "primary_risk": "Back-to-Back Splitting / Phantom Inventory"
    },
    "SEC06": {
        "name": "Agriculture & Allied",
        "min_cost": 500000, "max_cost": 4000000,
        "min_days": 45, "max_days": 270,
        "primary_risk": "Private Trust Exploitation / Ownership Fraud"
    },
    "SEC07": {
        "name": "Irrigation & Flood Control",
        "min_cost": 200000, "max_cost": 2500000,
        "min_days": 15, "max_days": 150,
        "primary_risk": "Paper-Only Earthwork / False Engineering Clearances"
    },
    "SEC08": {
        "name": "Sports & Youth Welfare",
        "min_cost": 200000, "max_cost": 5000000,
        "min_days": 15, "max_days": 365,
        "primary_risk": "Equipment Maintenance Bypassing / Delayed Completion"
    },
    "SEC09": {
        "name": "Railways & Utilities",
        "min_cost": 500000, "max_cost": 4000000,
        "min_days": 60, "max_days": 240,
        "primary_risk": "Jurisdictional Delay Fund Hoarding / Tender Collusion"
    },
    "SEC10": {
        "name": "Community Buildings",
        "min_cost": 600000, "max_cost": 3000000,
        "min_days": 120, "max_days": 270,
        "primary_risk": "Rapid Payout Risk / Banned Commercial Space Allocation"
    },
    "SEC11": {
        "name": "Public Safety & Security",
        "min_cost": 200000, "max_cost": 1200000,
        "min_days": 30, "max_days": 90,
        "primary_risk": "Overpriced Software & Hardware Licensing Fees"
    }
}


def _first(frame, names, default=np.nan):
    for name in names:
        if name in frame.columns:
            return frame[name]
    return pd.Series(default, index=frame.index)


def _clean(value):
    return re.sub(r"\W+", " ", str(value).lower()).strip()


def run_compliance_engine():
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    features = os.environ.get("FEATURES_DIR", os.path.join(base, "data", "features"))
    processed = os.environ.get("PROCESSED_DIR", os.path.join(base, "data", "processed"))
    master_path = os.path.join(features, "master_analytical.parquet")
    if not os.path.exists(master_path):
        raise FileNotFoundError(master_path)
    master = pd.read_parquet(master_path)

    t3_path = os.path.join(processed, "t3_works_recommended.parquet")
    if os.path.exists(t3_path):
        t3 = pd.read_parquet(t3_path)
        if {"work_id", "recommended_date"}.issubset(t3.columns):
            t3 = t3[["work_id", "recommended_date"]].drop_duplicates("work_id")
            master = master.merge(t3, on="work_id", how="left", suffixes=("", "_t3"))
            if "recommended_date_t3" in master:
                master["recommended_date"] = master["recommended_date"].fillna(master["recommended_date_t3"])
                master.drop(columns=["recommended_date_t3"], inplace=True)

    rec = pd.to_datetime(_first(master, ["recommended_date", "Recommended date"]), errors="coerce")
    sanction = pd.to_datetime(_first(master, ["sanction_date", "Sanction Date"]), errors="coerce")
    start = pd.to_datetime(_first(master, ["start_date", "first_payment_date"]), errors="coerce")
    completion = pd.to_datetime(_first(master, ["completion_date"]), errors="coerce")
    today = pd.Timestamp.now().normalize()
    status = _first(master, ["work_status", "Work Status"], "").fillna("").astype(str).str.lower()
    completed = completion.notna() | status.str.contains("complete", na=False)
    amount = pd.to_numeric(_first(master, ["effective_expenditure", "total_expenditure"], 0), errors="coerce").fillna(0)
    sanctioned = pd.to_numeric(_first(master, ["sanction_amount"], 0), errors="coerce").fillna(0)
    partial = status.str.contains("partial|progress|ongoing", na=False) | amount.gt(0)
    description = _first(master, ["description", "Work description"], "").fillna("").astype(str)
    desc_clean = description.map(_clean)
    constituency = _first(master, ["constituency", "Constituency"], "").fillna("").astype(str).str.lower().str.strip()
    sector_id = _first(master, ["sector_id", "Sector_ID"], "").fillna("").astype(str).str.strip().str.upper()

    # 1. Processing Deadlines (Timeline Check)
    # 2023 Guideline 3.2.4: sanction or rejection must be issued within 45
    # days of receipt of the recommendation.
    c01 = rec.notna() & sanction.notna() & ((sanction - rec).dt.days > 45)

    # Rejected/ineligible recommendations also require reasons within 45 days.
    is_rejected = status.str.contains("reject|unfeasible|cancel|dropped", na=False)
    c_rejection = rec.notna() & (sanction.isna() | is_rejected) & ((today - rec).dt.days > 45)

    repeat = pd.DataFrame({"key": desc_clean, "constituency": constituency, "date": rec})
    c02 = pd.Series(False, index=master.index)
    for _, group in repeat[(repeat.key != "") & repeat.date.notna()].groupby(["key", "constituency"]):
        dates = group.date.sort_values()
        if len(dates) > 1:
            c02.loc[dates.index[dates.diff().dt.days.fillna(999999).le(180)]] = True

    elapsed = (completion.fillna(today) - sanction).dt.days
    c03 = completed & sanction.notna() & elapsed.lt(15)
    # The 1-Year Construction Target: Standard physical infrastructure works must generally be completed within 1 year (365 days)
    c04 = completed & sanction.notna() & elapsed.ge(15) & elapsed.le(365) & ~c03
    c05 = sanction.notna() & ~completed & ~partial & (today - sanction).dt.days.gt(365)
    c06 = partial & ~completed & sanction.notna() & (today - sanction).dt.days.gt(365) & (today - sanction).dt.days.le(548)
    c07 = partial & ~completed & sanction.notna() & (today - sanction).dt.days.gt(548)
    c08 = ((rec.notna() & sanction.notna() & rec.gt(sanction)) |
           (sanction.notna() & start.notna() & sanction.gt(start)) |
           (start.notna() & completion.notna() & start.gt(completion)) |
           (sanction.notna() & completion.notna() & sanction.gt(completion)))
    c09 = amount.gt(sanctioned) & sanctioned.gt(0)
    c10 = amount.lt(0) | sanctioned.lt(0) | (amount.gt(0) & sanctioned.eq(0))
    c11 = rec.isna() | sanction.isna() | description.str.len().lt(5) | constituency.eq("")
    c12 = ((status.str.contains("complete", na=False) & completion.isna()) |
           (completion.notna() & status.str.contains("ongoing|progress|sanction", na=False)))

    # 2. Prohibited Works (The Banned Asset List)
    p_commercial = desc_clean.str.contains(r"\b(?:commercial shop|private office|private company|residential quarter|staff quarter|private building|private residence|private property|commercial complex|private trust)\b", regex=True)
    p_religious = desc_clean.str.contains(r"\b(?:temple|mandir|mosque|masjid|church|gurudwara|gurusthan|place of worship|religious property|religious asset|buddhist bihar|ashram|dargah)\b", regex=True)
    p_revenue = desc_clean.str.contains(r"\b(?:staff salary|salaries|office rent|regular maintenance|electricity bill|maintenance cost|recurring expenditure|recurring expense|operational cost)\b", regex=True)
    p_land = desc_clean.str.contains(r"\b(?:land acquisition|buying land|purchase of land|land compensation|acquisition of land|land cost)\b", regex=True)
    p_office_residential = desc_clean.str.contains(r"\b(?:residential building|residential quarter|staff quarter|private residence|residential complex|government residence)\b", regex=True)
    p_commercial_unit = desc_clean.str.contains(r"\b(?:commercial establishment|commercial unit|commercial complex|shop|market complex|business premises|factory|private company office)\b", regex=True)
    p_maintenance = desc_clean.str.contains(r"\b(?:maintenance|upkeep|routine upkeep|regular servicing)\b", regex=True) & ~desc_clean.str.contains(r"\b(?:re boring|reb boring|reboring of hand pump|retrofit|retrofitting)\b", regex=True)
    # Under the 2023 edition repair/renovation is permissible subject to the
    # annual 10% authorization cap and a reasonable gap; it is therefore a
    # review condition, not an automatic prohibition.
    c_repair_review = desc_clean.str.contains(r"\b(?:repair|repairing|renovation|renovate|restoration|refurbishment)\b", regex=True)
    p_grant_loan = desc_clean.str.contains(r"\b(?:grant|loan|relief fund|contribution to relief|cash assistance)\b", regex=True)
    c_movable_review = desc_clean.str.contains(r"\b(?:purchase|procurement|supply|buying)\b", regex=True) & desc_clean.str.contains(r"\b(?:vehicle|bus|van|furniture|computer|equipment|machine|ambulance|books?)\b", regex=True)
    p_reimbursement = desc_clean.str.contains(r"\b(?:reimbursement|reimbursing|already completed|partly completed|completed work)\b", regex=True)
    p_individual = desc_clean.str.contains(r"\b(?:individual benefit|family benefit|personal benefit|private beneficiary|individual house|private house)\b", regex=True)
    p_swagat = desc_clean.str.contains(r"\b(?:swagat dwar|welcome gate|welcome arch)\b", regex=True)
    p_unauthorized = desc_clean.str.contains(r"\b(?:unauthorized colony|unauthorised colony|illegal colony)\b", regex=True)
    p_csr = desc_clean.str.contains(r"\b(?:corporate social responsibility|csr funds?|csr contribution)\b", regex=True)
    p_religious = p_religious & ~desc_clean.str.contains(r"\b(?:crematorium|cremation ground|burial ground)\b", regex=True)
    p_commercial = p_commercial | p_commercial_unit
    c_min_project = sanctioned.gt(0) & sanctioned.lt(250000)

    # 3. Sector Matrix Bounds Check (MPLADS_SECTOR_MATRIX)
    c_sector_cost_low = pd.Series(False, index=master.index)
    c_sector_cost_high = pd.Series(False, index=master.index)
    c_sector_days_high = pd.Series(False, index=master.index)

    for idx, row in master.iterrows():
        sec = row.get("sector_id", "")
        if sec in MPLADS_SECTOR_MATRIX:
            limits = MPLADS_SECTOR_MATRIX[sec]
            amt = row.get("sanction_amount", 0)
            if pd.notna(amt) and amt > 0:
                if amt < limits["min_cost"]:
                    c_sector_cost_low.at[idx] = True
                elif amt > limits["max_cost"]:
                    c_sector_cost_high.at[idx] = True
            
            s_date = row.get("sanction_date")
            c_date = row.get("completion_date")
            if pd.notna(s_date) and pd.notna(c_date):
                days_taken = (c_date - s_date).days
                if days_taken > limits["max_days"]:
                    c_sector_days_high.at[idx] = True

    rules = {
        "C01": (c01, 100, "2023 Guideline 3.2.4: sanction or rejection was not issued within 45 days of recommendation."),
        "C_REJECTION": (c_rejection, 85, "45-Day Rejection Rule: District office exceeded maximum 45 days to inform MP with legal/technical reasons."),
        "C02": (c02, 100, "A similar work was recommended within 180 days."),
        "C03": (c03, 100, "The work was completed in fewer than 15 days after sanction."),
        "C04": (c04, 0, "The work was completed after 15 days and within the 1-year construction target (365 days)."),
        "C05": (c05, 35, "1-Year Construction Target Violation: More than 1 year (365 days) passed with no completion and no recorded progress updates."),
        "C06": (c06, 35, "1-Year Construction Target Violation: Work has progress updates but remains incomplete after 1 year (365 days)."),
        "C07": (c07, 100, "Severe Construction Delay: Work has progress updates but remains incomplete more than 18 months after sanction."),
        "C12": (c12, 35, "Status Mismatch: Work completion status does not match completion date."),
        "C08": (c08, 85, "Date Integrity: Recommendation, sanction, start, and completion dates are out of chronological order."),
        "C09": (c09, 65, "Financial Integrity: Recorded expenditure exceeds the sanctioned amount."),
        "C10": (c10, 85, "Financial Integrity: Negative amount or expenditure recorded against zero sanction."),
        "C11": (c11, 20, "Data Completeness: Required recommendation/sanction date, description, or constituency is missing."),
        "C_SECTOR_COST_LOW": (c_sector_cost_low, 20, "Sector cost check: sanctioned amount is below the configured sector reference floor."),
        "C_SECTOR_COST_HIGH": (c_sector_cost_high, 65, "Sector cost check: sanctioned amount exceeds the configured sector reference ceiling."),
        "C_SECTOR_DAYS_HIGH": (c_sector_days_high, 35, "Sector completion check: completed duration exceeds the configured sector reference maximum."),
        "C_BANNED_COMMERCIAL": (p_commercial, 100, "Prohibited Work: Project description mentions banned asset - Private/Commercial Benefits."),
        "C_BANNED_RELIGIOUS": (p_religious, 100, "Prohibited Work: Project description mentions banned asset - Religious Properties."),
        "C_BANNED_REVENUE": (p_revenue, 100, "Prohibited Work: Project description mentions banned asset - Revenue Expenses."),
        "C_BANNED_LAND": (p_land, 100, "Prohibited Work: Project description mentions banned asset - Land Acquisition."),
        "P_OFFICE_RESIDENTIAL": (p_office_residential, 100, "Annexure-II prohibition: office or residential building is not ordinarily permissible."),
        "P_COMMERCIAL_UNIT": (p_commercial_unit, 100, "Annexure-II prohibition: commercial establishment or unit."),
        "P_MAINTENANCE": (p_maintenance, 100, "Annexure-II prohibition: maintenance/upkeep work."),
        "C_REPAIR_RENOVATION_REVIEW": (c_repair_review, 20, "2023 Guideline 5.1.9: repair/renovation requires the 10% annual authorization cap and a reasonable gap since prior construction or repair."),
        "P_GRANT_LOAN": (p_grant_loan, 100, "Annexure-II prohibition: grant, loan, or relief-fund contribution."),
        "P_MOVABLE_ITEM_REVIEW": (c_movable_review, 20, "2023 Guideline 5.1.2-5.1.3: movable asset requires an eligible government/government-aided user institution and committee approval."),
        "P_REIMBURSEMENT": (p_reimbursement, 100, "Annexure-II prohibition: reimbursement of completed or partly completed work."),
        "P_INDIVIDUAL_FAMILY": (p_individual, 100, "Annexure-II prohibition: individual or family benefit."),
        "P_SWAGAT_DWAR": (p_swagat, 100, "Annexure-II prohibition: Swagat Dwar/welcome gate."),
        "P_UNAUTHORIZED_COLONY": (p_unauthorized, 100, "Annexure-II prohibition: work in an unauthorized colony."),
        "P_CSR_POOLING": (p_csr, 100, "2023 Guideline 5.2.10: pooling MPLADS funds with CSR is not permissible."),
        "C_MIN_PROJECT": (c_min_project, 20, "Guideline minimum-project check: sanctioned amount is below Rs. 1 lakh; District Authority exception may apply."),
    }
    rule_thresholds = {
        "C01": ">45 days", "C_REJECTION": ">45 days", "C02": "<=180 days",
        "C03": "<15 days", "C04": "15-365 days", "C05": ">365 days", "C06": ">365 and <=548 days", "C07": ">548 days",
        "C08": "chronological order", "C09": "expenditure > sanction", "C10": "negative or zero-sanction spend", "C11": "required fields present",
        "C12": "status/date consistency", "C_SECTOR_COST_LOW": "sector minimum",
        "C_SECTOR_COST_HIGH": "sector maximum", "C_SECTOR_DAYS_HIGH": "sector maximum days", "C_MIN_PROJECT": ">= Rs. 1 lakh normally",
        "P_OFFICE_RESIDENTIAL": "prohibited unless guideline exception", "P_COMMERCIAL_UNIT": "prohibited", "P_MAINTENANCE": "prohibited unless re-boring exception",
        "P_REPAIR_RENOVATION": "2023 10% annual cap and reasonable gap review", "P_REPAIR_RENOVATION_REVIEW": "2023 10% annual cap and reasonable gap review", "P_GRANT_LOAN": "prohibited", "P_MOVABLE_ITEM_REVIEW": "government/government-aided institution and committee approval",
        "P_REIMBURSEMENT": "prohibited", "P_INDIVIDUAL_FAMILY": "prohibited unless specified exception", "P_SWAGAT_DWAR": "prohibited", "P_UNAUTHORIZED_COLONY": "prohibited", "P_CSR_POOLING": "prohibited", "C_REPAIR_RENOVATION_REVIEW": "10% of annual authorization and reasonable gap",
    }

    score = pd.Series(0.0, index=master.index)
    messages = pd.DataFrame(index=master.index)
    for rule_id, (mask, points, label) in rules.items():
        score = score + mask.astype(int) * points
        if points > 0:
            messages[rule_id] = np.where(mask, label, "")
        else:
            messages[rule_id] = ""

    master["compliance_risk_score"] = score.clip(upper=100)
    master["compliance_explanation"] = messages.apply(lambda row: "\n".join(f"{index}. {value}" for index, value in enumerate((v for v in row if v), start=1)) or "No compliance rule triggered. Image verification is optional.", axis=1)
    master["triggered_rules"] = messages.apply(lambda row: ", ".join(k for k, v in row.items() if v), axis=1)
    master["compliance_risk_level"] = master.compliance_risk_score.map(lambda x: "CRITICAL" if x >= 85 else "HIGH" if x >= 65 else "MEDIUM" if x >= 35 else "LOW")
    master["is_compliance_flagged"] = master.compliance_risk_score.ge(35)
    master["compliance_rule_results"] = master.apply(
        lambda row: [
            {"rule_id": rule_id, "rule_name": label, "source": "mplads_2023_guidelines_including_changes.pdf, Guideline 3.2.4", "condition": label, "threshold": rule_thresholds.get(rule_id), "required_data_fields": ["recommended_date", "sanction_date", "completion_date", "sanction_amount", "effective_expenditure", "description", "constituency"], "status": "FAIL" if bool(mask.loc[row.name]) else "PASS", "severity": "CRITICAL" if points >= 85 else "HIGH" if points >= 65 else "MEDIUM" if points >= 35 else "LOW", "explanation": label}
            for rule_id, (mask, points, label) in rules.items()
        ], axis=1
    )
    out = os.path.join(features, "compliance_risk_analysis.parquet")
    master.to_parquet(out, index=False)
    print(f"Compliance rules evaluated for {len(master):,} works; saved to {out}")


if __name__ == "__main__":
    run_compliance_engine()
