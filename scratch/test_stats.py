import pandas as pd
import json
import os

backend_root = r"p:\SIH\mplads_updated-main"
features_dir = os.path.join(backend_root, "data", "features")
master_path = os.path.join(features_dir, "master_project_risk_scores.parquet")

master = pd.read_parquet(master_path)
print("Total rows in master:", len(master))

risk_levels = master.get("overall_risk_level", pd.Series("", index=master.index)).fillna("").astype(str).str.upper()
high_pri = int(risk_levels.isin(["HIGH", "CRITICAL"]).sum())
print("High priority (HIGH/CRITICAL):", high_pri)

def score_count(col, thresh=35):
    if col not in master.columns:
        return 0
    return int(pd.to_numeric(master[col], errors="coerce").fillna(0).ge(thresh).sum())

print("Financial risk >= 35:", score_count("financial_risk_score"))
print("Compliance risk >= 35:", score_count("compliance_risk_score"))
print("Schedule risk >= 35:", score_count("schedule_risk_score"))
print("Duplicate risk >= 35:", score_count("duplicate_risk_score"))

material_eligible = master.get("unit_price_comparison_eligible", pd.Series(False, index=master.index)).fillna(False).astype(bool) if "unit_price_comparison_eligible" in master else pd.Series(False, index=master.index)
print("Material eligible count:", int(material_eligible.sum()))

with open(os.path.join(backend_root, "data", "citizen_evidence.json"), "r", encoding="utf-8") as f:
    cit = json.load(f)
print("Citizen evidence count:", len(cit))

with open(os.path.join(backend_root, "data", "attendance_records.json"), "r", encoding="utf-8") as f:
    att = json.load(f)
print("Attendance records count:", len(att))
