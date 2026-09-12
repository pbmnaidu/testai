"""MPLADS guideline-backed compliance analysis."""

import os
import re
import json
from typing import Any, Dict, Iterable, List

import numpy as np
import pandas as pd

GUIDELINE_SOURCE = "mplads_2023_guidelines_including_changes.pdf"
GUIDELINE_NAME = "MPLADS Guidelines (April 1, 2023, including amendments)"

def _first(frame: pd.DataFrame, names: Iterable[str], default: Any = np.nan) -> pd.Series:
    for name in names:
        if name in frame.columns:
            return frame[name]
    return pd.Series(default, index=frame.index)

def _clean(value: Any) -> str:
    return re.sub(r"\W+", " ", str(value or "").lower()).strip()

def _contains(series: pd.Series, pattern: str) -> pd.Series:
    return series.fillna("").astype(str).str.contains(pattern, regex=True, na=False)

def _date_text(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    return pd.Timestamp(value).strftime("%d %b %Y")

def _financial_year(value: Any) -> str:
    if value is None or pd.isna(value):
        return "Unknown"
    stamp = pd.Timestamp(value)
    start = stamp.year if stamp.month >= 4 else stamp.year - 1
    return f"{start}-{str(start + 1)[-2:]}"

def _risk_level(score: float) -> str:
    if score >= 85:
        return "CRITICAL"
    if score >= 65:
        return "HIGH"
    if score >= 35:
        return "MEDIUM"
    return "LOW"


def _meta(rule_id: str, name: str, section: str, scope: str, interpretation: str,
          fields: List[str], threshold: str | None, points: int, decision: str) -> Dict[str, Any]:
    return {
        "rule_id": rule_id,
        "rule_name": name,
        "guideline_name": GUIDELINE_NAME,
        "guideline_section": section,
        "source_document": GUIDELINE_SOURCE,
        "scope": scope,
        "rule_interpretation": interpretation,
        "required_data_fields": fields,
        "threshold": threshold,
        "points": points,
        "implementation_decision": decision,
    }


# Aggregate rules have zero work-risk points and never enter the individual
# work risk order. This is the internal PDF-to-code audit matrix.
GUIDELINE_SCOPE_MATRIX = [
    _meta("C_SANCTION_TIMING", "Sanction or rejection timing", "Para 3.2.4", "WORK",
          "Sanction or rejection must be issued within 45 days of receiving a recommendation.",
          ["recommended_date", "sanction_date"], "45 days", 85, "KEEP_AND_MODIFY"),
    _meta("C_MINIMUM_SANCTION", "Normal minimum sanctioned amount", "Para 3.2.9", "WORK",
          "An individual work is normally sanctioned for at least Rs. 2.5 lakh; a lower amount requires reasons in the sanction letter.",
          ["sanction_amount"], "Rs. 2.5 lakh normally", 35, "MODIFY_TO_NEEDS_REVIEW"),
    _meta("C_COMPLETION_PERIOD_REVIEW", "Completion period in sanction letter", "Para 3.2.12", "WORK",
          "The sanction letter should generally set a completion period not exceeding one year, with specific justification for exceptions.",
          ["sanction_date", "completion_date", "work_status"], "Generally not more than one year", 35, "MODIFY_TO_NEEDS_REVIEW"),
    _meta("C_CALAMITY_COMPLETION_REVIEW", "Calamity rehabilitation completion", "Para 8.12.1", "WORK",
          "Rehabilitation works for a calamity are to be completed within 18 months of approval.",
          ["sanction_date", "completion_date", "description"], "18 months", 45, "ADD_WHEN_CALAMITY_EVIDENCE_EXISTS"),
    _meta("C_STOPPED_WORK_REVIEW", "Stoppage or abandonment procedure", "Para 3.2.19", "WORK",
          "A stopped or abandoned work requires full justification and referral to the State Nodal Authority.",
          ["work_status", "description"], "Full justification and referral required", 35, "ADD_AS_NEEDS_REVIEW"),
    _meta("C_MOVABLE_ASSET_REVIEW", "Movable asset eligibility and approval", "Paras 5.1.2-5.1.3", "WORK",
          "Movable assets are for Government-owned or Government-controlled institutions and require the prescribed committee approval.",
          ["description", "work_category"], "Eligible Government user and committee approval", 25, "KEEP_AS_NEEDS_REVIEW"),
    _meta("P_OPERATION_MAINTENANCE", "Operation and maintenance expenditure", "Para 5.2.1", "WORK",
          "MPLADS funds cannot be used for operation and maintenance of any nature.", ["description"], "Not permissible", 85, "KEEP_AS_NEEDS_REVIEW"),
    _meta("P_RESIDENTIAL_BUILDING", "Residential building", "Para 5.2.2", "WORK",
          "Construction of residential buildings is not permissible.", ["description"], "Not permissible", 85, "KEEP_AS_NEEDS_REVIEW"),
    _meta("P_COMMERCIAL_PRIVATE", "Commercial or private establishment", "Para 5.2.3", "WORK",
          "Work involving commercial and private establishments is not permissible.", ["description"], "Not permissible", 85, "KEEP_AS_NEEDS_REVIEW"),
    _meta("P_NAMING_ASSET", "Naming an asset after a person", "Para 5.2.4", "WORK",
          "An asset created under MPLADS cannot be named after any person.", ["description"], "Not permissible", 85, "ADD_AS_NEEDS_REVIEW"),
    _meta("P_GRANT_LOAN", "Grant or loan", "Para 5.2.5", "WORK",
          "Grants and loans are not permissible, subject to separate Chapter 6 assistance provisions.",
          ["description", "work_category"], "Not permissible unless Chapter 6 applies", 85, "MODIFY_WITH_CHAPTER_6_REVIEW"),
    _meta("P_RELIEF_FUNDS", "Contribution to relief fund", "Para 5.2.6", "WORK",
          "Contribution to a Centre or State/UT Relief Fund is not permissible.", ["description"], "Not permissible", 85, "ADD_AS_NEEDS_REVIEW"),
    _meta("P_LAND_ACQUISITION", "Land acquisition or compensation", "Para 5.2.7", "WORK",
          "Acquisition of land or compensation for acquired land is not permissible.", ["description"], "Not permissible", 85, "KEEP_AS_NEEDS_REVIEW"),
    _meta("P_REIMBURSEMENT", "Reimbursement of completed or incomplete work", "Para 5.2.8", "WORK",
          "Reimbursement for completed or partly completed works or movable items is not permissible.", ["description"], "Not permissible", 85, "MODIFY_TO_EXPLICIT_TEXT_ONLY"),
    _meta("P_INDIVIDUAL_FAMILY", "Individual or family benefit", "Paras 5.2.9 and 5.1.6", "WORK",
          "Individual or family benefits are not permissible except for the specified assistive-device exception.",
          ["description"], "Not permissible except para 5.1.6", 85, "MODIFY_WITH_EXCEPTION"),
    _meta("P_CSR_POOLING", "Pooling with CSR", "Para 5.2.10", "WORK",
          "MPLADS funds cannot be pooled with Corporate Social Responsibility funds.", ["description"], "Not permissible", 85, "KEEP_AS_NEEDS_REVIEW"),
    _meta("P_RELIGIOUS_WORK", "Religious work or premises", "Para 5.2.11", "WORK",
          "Religious works, religious worship premises, and land owned by a religious faith/group are not permissible.",
          ["description"], "Not permissible", 85, "MODIFY_TO_EXPLICIT_TEXT_ONLY"),
    _meta("P_SWAGAT_DWAR", "Swagat Dwar or welcome gate", "Para 5.2.12", "WORK",
          "Construction of Swagat Dwars or Welcome Gates is not permissible.", ["description"], "Not permissible", 85, "KEEP_AS_NEEDS_REVIEW"),
    _meta("P_UNAUTHORIZED_COLONY", "Work in an unauthorized colony", "Para 5.2.13", "WORK",
          "Works in an unauthorized colony are not permissible.", ["description"], "Not permissible", 85, "KEEP_AS_NEEDS_REVIEW"),
    _meta("P_RECURRING_EXPENDITURE", "Recurring expenditure", "Para 5.2.14", "WORK",
          "Recurring expenditure of any kind is not permissible.", ["description"], "Not permissible", 85, "KEEP_AS_NEEDS_REVIEW"),
    _meta("A_SC_ALLOCATION", "Scheduled Caste area allocation", "Para 5.4.1", "CONSTITUENCY",
          "At least 15 percent of annual MPLADS entitlement should be recommended for SC areas.",
          ["constituency", "sanction_amount", "description", "recommended_date"], "At least 15 percent", 0, "CONSTITUENCY_ONLY"),
    _meta("A_ST_ALLOCATION", "Scheduled Tribe area allocation", "Para 5.4.1", "CONSTITUENCY",
          "At least 7.5 percent of annual MPLADS entitlement should be recommended for ST areas.",
          ["constituency", "sanction_amount", "description", "recommended_date"], "At least 7.5 percent", 0, "CONSTITUENCY_ONLY"),
    _meta("A_REPAIR_RENOVATION_CAP", "Repair and renovation aggregate cap", "Para 5.1.9", "CONSTITUENCY",
          "Repair and renovation recommendations are capped at 10 percent of total authorization in a financial year.",
          ["constituency", "sanction_amount", "description", "recommended_date"], "Up to 10 percent", 0, "CONSTITUENCY_ONLY"),
    _meta("A_SOCIETY_TRUST_CAP", "Society/trust/cooperative/bar aggregate cap", "Para 6.2.6.2", "CONSTITUENCY",
          "Recommendations to listed entities together are capped at 10 percent of total authorization in a financial year.",
          ["constituency", "work_category", "sanction_amount", "recommended_date"], "Up to 10 percent", 0, "CONSTITUENCY_ONLY"),
    _meta("A_BAR_LIBRARY_CAP", "Bar Association library cap", "Para 6.4.2", "CONSTITUENCY",
          "Bar Association library book recommendations are capped at 0.1 percent of total authorization per annum.",
          ["constituency", "description", "sanction_amount", "recommended_date"], "Up to 0.1 percent", 0, "CONSTITUENCY_ONLY"),
    _meta("H_DUPLICATE_TEXT", "Duplicate or split-work heuristic", "No guideline clause", "NON_GUIDELINE_HEURISTIC",
          "Similarity is an audit indicator maintained by the separate duplicate/split-work detector.",
          ["description"], None, 0, "REMOVE_FROM_COMPLIANCE"),
    _meta("H_SECTOR_COST_RULES", "Sector cost benchmark", "No guideline clause", "NON_GUIDELINE_HEURISTIC",
          "Predefined sector price ceilings are not MPLADS compliance requirements.",
          ["sanction_amount"], None, 0, "REMOVE_FROM_COMPLIANCE"),
    _meta("C_FRAUD_DUPLICATE_EVIDENCE", "Cross-work duplicate evidence / location reuse", "Para 9.1 & Forensic Audit", "WORK",
          "Evidence reuse across separate works is prohibited. Identical photos, files, or geotagged coordinates across different projects constitute suspected fraud.",
          ["work_id", "attached_files", "geotag_status"], "No duplicate evidence across works", 100, "FRAUD_100_OVERRIDE"),
    _meta("C_EVIDENCE_STUB_DOSSIER", "Critical stub dossier without evidence", "Para 3.2.15", "WORK",
          "Completion dossiers of 1-2 pages lacking site photos, contractor bills, or progress tables fail minimum audit documentation standards.",
          ["pdf_page_count", "attached_files"], "Substantive completion records required", 85, "CRITICAL_EVIDENCE_GAP"),
    _meta("C_EVIDENCE_NO_BILLS_TABLES", "Missing financial bills and progress tables", "Para 4.1.2", "WORK",
          "Works lacking both contractor bills/vouchers and progress status tables require audit verification before final payment certification.",
          ["has_bill_proof", "has_progress_tables"], "Bills and progress tables required", 65, "HIGH_EVIDENCE_GAP"),
    _meta("C_EVIDENCE_PHOTO_GAP", "Missing field photographic inspection proof", "Para 3.2.14", "WORK",
          "Physical completion verification requires ground-level photographic evidence (preferably geotagged).",
          ["has_photo_evidence"], "Photographic inspection proof required", 65, "HIGH_EVIDENCE_GAP"),
]
WORK_RULES = {item["rule_id"]: item for item in GUIDELINE_SCOPE_MATRIX if item["scope"] == "WORK"}

INDICATOR_PATTERNS = {
    "P_OPERATION_MAINTENANCE": r"\b(?:operation(?:al)?\s+(?:cost|expenditure)|routine\s+maintenance|regular\s+maintenance|maintenance\s+of|upkeep\s+of|regular\s+servicing|electricity\s+bill|office\s+rent|staff\s+salary|salaries|recurring\s+(?:expenditure|expense))\b",
    "P_RESIDENTIAL_BUILDING": r"\b(?:construction|building|renovation)\s+of\s+(?:a\s+)?(?:residential|staff|government\s+residential)\s+(?:building|quarter|complex|house)\b",
    "P_COMMERCIAL_PRIVATE": r"\b(?:commercial\s+(?:shop|complex|establishment|unit|building)|private\s+(?:office|company|property|building|residence)|business\s+premises|factory\s+building)\b",
    "P_NAMING_ASSET": r"\b(?:named\s+after|naming\s+(?:the\s+)?(?:asset|building|hall|road|gate)\s+after)\b",
    "P_GRANT_LOAN": r"\b(?:cash\s+grant|cash\s+assistance|grant\s+in\s+aid|loan\s+to|provide\s+a\s+loan)\b",
    "P_RELIEF_FUNDS": r"\b(?:contribution|transfer|donation)\s+(?:to|towards)\s+(?:the\s+)?(?:central|state|national)?\s*relief\s+fund\b",
    "P_LAND_ACQUISITION": r"\b(?:land\s+acquisition|acquisition\s+of\s+land|purchase\s+of\s+land|buying\s+land|land\s+compensation|compensation\s+for\s+land)\b",
    "P_REIMBURSEMENT": r"\b(?:reimbursement|reimbursing|reimburse\s+(?:the|a)|payment\s+for\s+(?:an\s+)?already\s+completed\s+work)\b",
    "P_INDIVIDUAL_FAMILY": r"\b(?:individual\s+benefit|family\s+benefit|personal\s+benefit|private\s+beneficiary|individual\s+house|private\s+house)\b",
    "P_CSR_POOLING": r"\b(?:corporate\s+social\s+responsibility|csr\s+(?:fund|funds|contribution|pooling))\b",
    "P_RELIGIOUS_WORK": r"\b(?:construction|renovation|repair|development)\s+of\s+(?:a\s+)?(?:temple|mandir|mosque|masjid|church|gurudwara|dargah|ashram|religious\s+(?:building|place))\b|\b(?:within|inside|on)\s+(?:the\s+)?(?:temple|mandir|mosque|masjid|church|gurudwara|dargah|ashram)\s+(?:premises|land|compound)\b",
    "P_SWAGAT_DWAR": r"\b(?:swagat\s+dwar|welcome\s+(?:gate|arch|gateway))\b",
    "P_UNAUTHORIZED_COLONY": r"\b(?:unauthori[sz]ed\s+colony|illegal\s+colony)\b",
    "P_RECURRING_EXPENDITURE": r"\b(?:recurring\s+(?:expenditure|expense|cost)|operational\s+cost|routine\s+operating\s+cost)\b",
}
INDICATOR_TEXT = {key: value for key, value in {
    "P_OPERATION_MAINTENANCE": "The work description refers to operation or maintenance expenditure.",
    "P_RESIDENTIAL_BUILDING": "The work description refers to a residential building.",
    "P_COMMERCIAL_PRIVATE": "The work description refers to a commercial or private establishment.",
    "P_NAMING_ASSET": "The work description refers to naming an asset after a person.",
    "P_GRANT_LOAN": "The work description refers to a grant or loan.",
    "P_RELIEF_FUNDS": "The work description refers to a contribution to a relief fund.",
    "P_LAND_ACQUISITION": "The work description refers to land acquisition or compensation.",
    "P_REIMBURSEMENT": "The work description refers to reimbursement of a completed or partly completed work.",
    "P_INDIVIDUAL_FAMILY": "The work description refers to an individual or family benefit.",
    "P_CSR_POOLING": "The work description refers to pooling MPLADS funds with CSR.",
    "P_RELIGIOUS_WORK": "The work description refers to religious work or religious premises.",
    "P_SWAGAT_DWAR": "The work description refers to a Swagat Dwar or Welcome Gate.",
    "P_UNAUTHORIZED_COLONY": "The work description refers to an unauthorized colony.",
    "P_RECURRING_EXPENDITURE": "The work description refers to recurring expenditure.",
}.items()}

def _finding(meta: Dict[str, Any], status: str, what: str = "", why: str = "",
             details: Dict[str, Any] | None = None, quality: str = "available") -> Dict[str, Any]:
    return {
        "rule_id": meta["rule_id"], "rule_name": meta["rule_name"], "status": status,
        "severity": _risk_level(meta["points"]) if status != "PASS" else "LOW",
        "scope": meta["scope"], "guideline_name": meta["guideline_name"],
        "guideline_section": meta["guideline_section"], "source_document": meta["source_document"],
        "guideline_basis": f'{meta["guideline_name"]}, {meta["guideline_section"]}',
        "rule_interpretation": meta["rule_interpretation"], "required_data_fields": meta["required_data_fields"],
        "threshold": meta["threshold"], "what_happened": what, "why_it_matters": why,
        "details": details or {}, "evidence_quality": quality,
        "review_priority": "High" if meta["points"] >= 65 else "Medium" if meta["points"] >= 35 else "Low",
    }

def public_scope_matrix() -> List[Dict[str, Any]]:
    return [{key: value for key, value in item.items() if key != "points"} for item in GUIDELINE_SCOPE_MATRIX]


def _allocation_reference(processed: str) -> Dict[tuple, float]:
    path = os.path.join(processed, "t1_allocated_limits.parquet")
    if not os.path.exists(path):
        return {}
    try:
        frame = pd.read_parquet(path)
        state = _first(frame, ["state", "State"], "").fillna("").astype(str).str.upper().str.strip()
        constituency = _first(frame, ["constituency", "Constituency"], "").fillna("").astype(str).str.upper().str.strip()
        mp_name = _first(frame, ["mp_name", "Hon'ble Members of Parliaments"], "").fillna("").astype(str).str.upper().str.strip()
        amount = pd.to_numeric(_first(frame, ["allocated_amount", "Allocated AMOUNT ( ₹ )"], np.nan), errors="coerce")
        return {(str(s), str(c), str(m)): float(a) for s, c, m, a in zip(state, constituency, mp_name, amount)
                if str(c).strip() and pd.notna(a) and float(a) > 0}
    except Exception:
        return {}


def build_constituency_analysis(master: pd.DataFrame, processed: str) -> pd.DataFrame:
    if master.empty:
        return pd.DataFrame()
    frame = master.copy()
    description = _first(frame, ["description", "Work description"], "").fillna("").astype(str)
    cleaned = description.map(_clean)
    amount = pd.to_numeric(_first(frame, ["sanction_amount", "recommended_amount"], np.nan), errors="coerce").fillna(0).clip(lower=0)
    event_date = pd.to_datetime(_first(frame, ["recommended_date", "sanction_date"]), errors="coerce")
    state = _first(frame, ["state", "State"], "").fillna("").astype(str).str.upper().str.strip()
    constituency = _first(frame, ["constituency", "Constituency"], "").fillna("").astype(str).str.upper().str.strip()
    mp_name = _first(frame, ["mp_name", "Hon'ble Members of Parliament"], "").fillna("").astype(str).str.upper().str.strip()
    category = _first(frame, ["work_category", "Work category"], "").fillna("").astype(str)
    frame["_year"] = event_date.map(_financial_year)
    frame["_state"], frame["_constituency"], frame["_mp_name"], frame["_amount"] = state, constituency, mp_name, amount
    frame["_sc"] = _contains(cleaned, r"\b(?:sc\s+area|sc\s+colony|sc\s+category|scheduled\s+caste|scheduled\s+castes)\b")
    frame["_st"] = _contains(cleaned, r"\b(?:st\s+area|st\s+colony|st\s+category|scheduled\s+tribe|scheduled\s+tribes)\b")
    frame["_repair"] = _contains(cleaned, r"\b(?:repair|repairing|renovation|renovate|restoration|refurbishment)\b")
    frame["_entity"] = _contains(category.str.lower() + " " + cleaned, r"\b(?:trust|society|cooperative|co-operative|bar\s+association)\b")
    frame["_bar_library"] = _contains(cleaned, r"\b(?:bar\s+association|bar\s+library|law\s+library)\b")
    frame = frame[frame["_constituency"].ne("") & frame["_year"].ne("Unknown")]
    references = _allocation_reference(processed)
    rows = []
    for keys, group in frame.groupby(["_state", "_constituency", "_mp_name", "_year"], dropna=False):
        state_value, constituency_value, mp_value, year_value = keys
        observed_total = float(group["_amount"].sum())
        if observed_total <= 0:
            continue
        values = {name: float(group.loc[group[column], "_amount"].sum()) for name, column in {
            "sc": "_sc", "st": "_st", "repair": "_repair", "entity": "_entity", "bar": "_bar_library"
        }.items()}
        official = references.get((str(state_value), str(constituency_value), str(mp_value)))
        denominator = official if official and official > 0 else observed_total
        basis = "official allocation reference" if official else "observed sanctioned amount proxy; verify official annual entitlement"
        pct = lambda value: round(value / denominator * 100, 2) if denominator else 0.0
        sc_pct, st_pct = pct(values["sc"]), pct(values["st"])
        rows.append({
            "scope": "CONSTITUENCY", "state": str(state_value), "constituency": str(constituency_value),
            "mp_name": str(mp_value), "financial_year": str(year_value),
            "total_observed_sanctioned_amount": observed_total, "official_allocation_reference_inr": official,
            "allocation_basis": basis,
            "sc_observed_amount": values["sc"], "sc_observed_pct_of_allocation_basis": sc_pct, "sc_target_pct": 15.0,
            "sc_status": "NEEDS_OFFICIAL_AREA_DATA" if not int(group["_sc"].sum()) else ("BELOW_GUIDELINE_TARGET_REVIEW" if sc_pct < 15 else "MEETS_OBSERVED_TARGET"),
            "sc_evidence_work_count": int(group["_sc"].sum()),
            "st_observed_amount": values["st"], "st_observed_pct_of_allocation_basis": st_pct, "st_target_pct": 7.5,
            "st_status": "NEEDS_OFFICIAL_AREA_DATA" if not int(group["_st"].sum()) else ("BELOW_GUIDELINE_TARGET_REVIEW" if st_pct < 7.5 else "MEETS_OBSERVED_TARGET"),
            "st_evidence_work_count": int(group["_st"].sum()),
            "repair_renovation_amount": values["repair"], "repair_renovation_pct_of_allocation_basis": pct(values["repair"]),
            "repair_cap_pct": 10.0, "repair_status": "REVIEW_ABOVE_OBSERVED_CAP" if pct(values["repair"]) > 10 else "WITHIN_OBSERVED_CAP",
            "entity_assistance_amount": values["entity"], "entity_assistance_pct_of_allocation_basis": pct(values["entity"]),
            "entity_assistance_cap_pct": 10.0, "entity_assistance_status": "REVIEW_ABOVE_OBSERVED_CAP" if pct(values["entity"]) > 10 else "WITHIN_OBSERVED_CAP",
            "bar_library_amount": values["bar"], "bar_library_pct_of_allocation_basis": pct(values["bar"]),
            "bar_library_cap_pct": 0.1, "bar_library_status": "REVIEW_ABOVE_OBSERVED_CAP" if pct(values["bar"]) > 0.1 else "WITHIN_OBSERVED_CAP",
            "allocation_data_status": "PARTIAL_EVIDENCE",
            "analysis_note": "Aggregate observation only. SC/ST allocation is not attached to any individual work. Verify annual entitlement, area register, and sanction records before concluding compliance.",
            "source_sections": "Paras 5.4.1, 5.1.9, 6.2.6.2 and 6.4.2",
        })
    return pd.DataFrame(rows)


def run_compliance_engine() -> Dict[str, Any]:
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    features = os.environ.get("FEATURES_DIR", os.path.join(base, "data", "features"))
    processed = os.environ.get("PROCESSED_DIR", os.path.join(base, "data", "processed"))
    os.makedirs(features, exist_ok=True)
    master_path = os.path.join(features, "master_analytical.parquet")
    if not os.path.exists(master_path):
        raise FileNotFoundError(master_path)
    master = pd.read_parquet(master_path)

    geotag_audit_path = os.path.join(processed, "combined_geotag_audit.json")
    geotag_audit_by_id = {}
    if os.path.exists(geotag_audit_path):
        try:
            with open(geotag_audit_path, "r", encoding="utf-8") as f:
                for item in json.load(f):
                    wid = str(item.get("work_id", "")).strip()
                    geotag_audit_by_id[wid] = item
                    tail = wid.split("/")[-1].split("_")[-1]
                    if tail:
                        geotag_audit_by_id[tail] = item
        except Exception as e:
            print(f"[-] Error loading geotag audit: {e}")

    t3_path = os.path.join(processed, "t3_works_recommended.parquet")
    if os.path.exists(t3_path):
        t3 = pd.read_parquet(t3_path)
        if {"work_id", "recommended_date"}.issubset(t3.columns):
            t3 = t3[["work_id", "recommended_date"]].drop_duplicates("work_id")
            master = master.merge(t3, on="work_id", how="left", suffixes=("", "_t3"))
            if "recommended_date_t3" in master.columns:
                master["recommended_date"] = master["recommended_date"].fillna(master["recommended_date_t3"])
                master.drop(columns=["recommended_date_t3"], inplace=True)

    rec = pd.to_datetime(_first(master, ["recommended_date", "Recommended date"]), errors="coerce")
    sanction = pd.to_datetime(_first(master, ["sanction_date", "Sanction Date"]), errors="coerce")
    completion = pd.to_datetime(_first(master, ["completion_date"]), errors="coerce")
    status = _first(master, ["work_status", "Work Status"], "").fillna("").astype(str).str.lower()
    description = _first(master, ["description", "Work description"], "").fillna("").astype(str)
    cleaned = description.map(_clean)
    category = _first(master, ["work_category", "Work category"], "").fillna("").astype(str)
    sanctioned_amount = pd.to_numeric(_first(master, ["sanction_amount"], np.nan), errors="coerce")
    today = pd.Timestamp.now().normalize()
    calamity = _contains(cleaned, r"\b(?:calamity\s+relief|natural\s+calamity|disaster\s+relief|rehabilitation\s+and\s+reconstruction)\b")
    stopped = _contains(status, r"\babandon(?:ed|ment)?\b|\bstopp(?:ed|age)\b|\bsuspend(?:ed|sion)\b|\bdropped\b")
    movable = _contains(cleaned + " " + category.map(_clean), r"\b(?:purchase|procure|procurement|supply|buying)\b.*\b(?:vehicle|bus|van|furniture|computer|equipment|machine|ambulance|books?|laborator(?:y|ies)|smart\s+board)\b")
    indicators = {rule_id: _contains(cleaned, pattern) for rule_id, pattern in INDICATOR_PATTERNS.items()}
    assistive = _contains(cleaned, r"\b(?:prosthetic|wheel\s*chair|wheelchair|tricycle|electric\s+scoot(?:y|er)|hearing\s+aid|assistive\s+device)\b")
    indicators["P_INDIVIDUAL_FAMILY"] = indicators["P_INDIVIDUAL_FAMILY"] & ~assistive

    scores, levels, explanations = [], [], []
    triggered, findings_all, results_all, quality_all = [], [], [], []
    for index in master.index:
        findings, results, score = [], [], 0.0

        def add(meta: Dict[str, Any], result: Dict[str, Any]) -> None:
            nonlocal score
            results.append(result)
            if result["status"] in {"FAIL", "NEEDS_REVIEW"}:
                findings.append(result)
                score += meta["points"]

        meta = WORK_RULES["C_SANCTION_TIMING"]
        if pd.notna(rec.at[index]) and pd.notna(sanction.at[index]):
            deadline = rec.at[index] + pd.Timedelta(days=45)
            late = sanction.at[index] > deadline
            add(meta, _finding(meta, "FAIL" if late else "PASS",
                "The work was sanctioned after the 45-day deadline specified in the guidelines." if late else "",
                "The Implementing District Authority must issue sanction or rejection within the prescribed period." if late else "",
                {"recommended_date": _date_text(rec.at[index]), "sanctioned_date": _date_text(sanction.at[index]), "guideline_deadline": _date_text(deadline)}))
        elif pd.notna(rec.at[index]) and today > rec.at[index] + pd.Timedelta(days=45):
            deadline = rec.at[index] + pd.Timedelta(days=45)
            add(meta, _finding(meta, "NEEDS_REVIEW",
                "A sanction or rejection date is not available, so the 45-day timeline cannot be reliably assessed from the available record.",
                "The administrative file should be checked for the action date and any related correspondence before the timeline is assessed.",
                {"recommended_date": _date_text(rec.at[index]), "guideline_deadline": _date_text(deadline)}, "missing_action_date"))
        else:
            results.append(_finding(meta, "NOT_EVALUATED", quality="missing_required_data"))

        meta = WORK_RULES["C_MINIMUM_SANCTION"]
        if pd.notna(sanctioned_amount.at[index]) and sanctioned_amount.at[index] > 0:
            low = sanctioned_amount.at[index] < 250000
            add(meta, _finding(meta, "NEEDS_REVIEW" if low else "PASS",
                "The sanctioned amount is below the normal Rs. 2.5 lakh minimum." if low else "",
                "The sanction letter should record why the lower amount benefits the public at large." if low else "",
                {"sanctioned_amount_inr": float(sanctioned_amount.at[index]), "normal_minimum_amount_inr": 250000},
                "sanction_letter_reason_not_available" if low else "available"))
        else:
            results.append(_finding(meta, "NOT_EVALUATED", quality="missing_required_data"))

        meta = WORK_RULES["C_COMPLETION_PERIOD_REVIEW"]
        if pd.notna(sanction.at[index]):
            observed_end = completion.at[index] if pd.notna(completion.at[index]) else today
            beyond_year = (observed_end - sanction.at[index]).days > 365
            add(meta, _finding(meta, "NEEDS_REVIEW" if beyond_year else "PASS",
                "The work was completed or remained incomplete beyond the generally expected one-year period." if beyond_year else "",
                "Review the sanction letter for the approved completion period and any exceptional justification." if beyond_year else "",
                {"sanctioned_date": _date_text(sanction.at[index]), "completion_date": _date_text(completion.at[index]), "observed_as_of": _date_text(observed_end), "guideline_completion_period": "Generally not more than one year"},
                "sanction_letter_period_not_available" if beyond_year else "available"))
        else:
            results.append(_finding(meta, "NOT_EVALUATED", quality="missing_required_data"))

        meta = WORK_RULES["C_CALAMITY_COMPLETION_REVIEW"]
        if calamity.at[index] and pd.notna(sanction.at[index]):
            observed_end = completion.at[index] if pd.notna(completion.at[index]) else today
            late = (observed_end - sanction.at[index]).days > 548
            add(meta, _finding(meta, "NEEDS_REVIEW" if late else "PASS",
                "The calamity rehabilitation work was completed or remained incomplete beyond the permitted 18-month period." if late else "",
                "The calamity work should be reviewed against the completion requirement and any explanation on record." if late else "",
                {"approval_date": _date_text(sanction.at[index]), "completion_date": _date_text(completion.at[index]), "observed_as_of": _date_text(observed_end), "guideline_completion_period": "18 months"}))
        else:
            results.append(_finding(meta, "NOT_EVALUATED", quality="not_identified"))

        meta = WORK_RULES["C_STOPPED_WORK_REVIEW"]
        if stopped.at[index]:
            add(meta, _finding(meta, "NEEDS_REVIEW",
                "The work record indicates that the work was stopped, suspended, abandoned, or dropped.",
                "The file should show the required justification and referral before the record is treated as closed.",
                {"work_status": str(status.at[index]), "description_excerpt": description.at[index][:240]}))
        else:
            results.append(_finding(meta, "PASS"))

        meta = WORK_RULES["C_MOVABLE_ASSET_REVIEW"]
        if movable.at[index]:
            add(meta, _finding(meta, "NEEDS_REVIEW",
                "The work description refers to a movable asset purchase.",
                "Verify the eligible Government user institution and prescribed committee approval before treating the purchase as compliant.",
                {"description_excerpt": description.at[index][:240], "work_category": category.at[index]}))
        else:
            results.append(_finding(meta, "PASS"))

        for rule_id, text in INDICATOR_TEXT.items():
            meta = WORK_RULES[rule_id]
            if indicators[rule_id].at[index]:
                add(meta, _finding(meta, "NEEDS_REVIEW", text,
                    "Review the sanction, site, and supporting records against the cited guideline provision.",
                    {"description_excerpt": description.at[index][:240]}, "description_indicator"))
            else:
                results.append(_finding(meta, "PASS"))

        # Evaluate Physical / Evidence & Cross-Work Fraud Rules
        wid_raw = str(master.at[index, "work_id"] if "work_id" in master.columns else "").strip()
        wid_tail = wid_raw.split("/")[-1].split("_")[-1]
        audit_info = geotag_audit_by_id.get(wid_raw) or geotag_audit_by_id.get(wid_tail)

        if audit_info:
            # 1. Suspected Fraud Duplicate Evidence Reuse (100% Risk Override)
            meta_fraud = WORK_RULES["C_FRAUD_DUPLICATE_EVIDENCE"]
            if audit_info.get("is_fraud_suspected"):
                fraud_data = audit_info.get("fraud_details", {}) or {}
                add(meta_fraud, _finding(meta_fraud, "FAIL",
                    f"Cross-work duplicate evidence reuse detected: {fraud_data.get('reason', 'Identical proof reused across works')}",
                    "Evidence reuse across separate works constitutes suspected fraud. Override composite risk to 100.",
                    {
                        "fraud_type": fraud_data.get("fraud_type"),
                        "matched_work_id": fraud_data.get("fraud_matched_work_id"),
                        "claimed_coordinates": f"{audit_info.get('latitude')} N, {audit_info.get('longitude')} E",
                        "distance_between_works_meters": fraud_data.get("fraud_distance_meters"),
                    }, "forensic_duplicate_match"))
                score = 100.0
            else:
                results.append(_finding(meta_fraud, "PASS"))

            # 2. Stub Dossier (1-2 pages lacking substantive evidence)
            meta_stub = WORK_RULES["C_EVIDENCE_STUB_DOSSIER"]
            if audit_info.get("audit_classification") == "CRITICAL" or audit_info.get("pdf_audit", {}).get("geotag_status") == "STUB_DOSSIER_NO_EVIDENCE":
                add(meta_stub, _finding(meta_stub, "FAIL",
                    "Uploaded dossier has only 1-2 pages and lacks photographic proof, contractor bills, and progress status tables.",
                    "A stub administrative dossier without substantive physical and financial evidence cannot substantiate project completion.",
                    {"page_count": audit_info.get("pdf_audit", {}).get("page_count", 0), "missing_items": audit_info.get("missing_items", [])}))
            else:
                results.append(_finding(meta_stub, "PASS"))

            # 3. Missing Bills & Progress Tables
            meta_bills = WORK_RULES["C_EVIDENCE_NO_BILLS_TABLES"]
            if audit_info.get("pdf_audit", {}).get("geotag_status") == "NO_BILLS_NO_PROGRESS_TABLES":
                add(meta_bills, _finding(meta_bills, "NEEDS_REVIEW",
                    "Document exists but contains neither contractor bills nor physical execution progress status tables.",
                    "Verify contractor measurement book (M-book) records, bills, and physical progress before treating financial records as complete.",
                    {"missing_items": audit_info.get("missing_items", [])}))
            else:
                results.append(_finding(meta_bills, "PASS"))

            # 4. Photographic Inspection Gap
            meta_photo = WORK_RULES["C_EVIDENCE_PHOTO_GAP"]
            if not audit_info.get("pdf_audit", {}).get("has_photo_evidence"):
                add(meta_photo, _finding(meta_photo, "NEEDS_REVIEW",
                    "No ground-level photographic site inspection proof was uploaded to MoSPI.",
                    "Physical verification of the created asset requires ground-level inspection photographs.",
                    {"missing_summary": audit_info.get("missing_summary")}))
            else:
                results.append(_finding(meta_photo, "PASS"))

        score = min(float(score), 100.0)
        scores.append(score)
        levels.append(_risk_level(score))
        findings_all.append(findings)
        results_all.append(results)
        triggered.append(", ".join(item["rule_id"] for item in findings))
        explanations.append(" ".join(item["what_happened"] for item in findings if item.get("what_happened")) if findings else "No work-level guideline concern was identified from the available record.")
        missing = []
        if pd.isna(rec.at[index]):
            missing.append("recommended_date")
        if pd.isna(sanction.at[index]):
            missing.append("sanction_date")
        if not description.at[index].strip():
            missing.append("description")
        quality_all.append(missing)

    master["compliance_risk_score"] = scores
    master["compliance_risk_level"] = levels
    master["compliance_explanation"] = explanations
    master["triggered_rules"] = triggered
    master["compliance_findings"] = findings_all
    master["compliance_rule_results"] = results_all
    master["compliance_data_quality"] = quality_all
    primary_findings = [next((item for item in findings if item["status"] in {"FAIL", "NEEDS_REVIEW"}), {}) for findings in findings_all]
    compliance_what = [item.get("what_happened", "") or "No work-level guideline concern was identified from the available record." for item in primary_findings]
    compliance_why = [item.get("why_it_matters", "") for item in primary_findings]
    compliance_support = []
    for item in primary_findings:
        details = item.get("details", {}) or {}
        if not details:
            compliance_support.append("No additional supporting detail was available in the record.")
            continue
        readable = []
        for key, value in details.items():
            label = re.sub(r"_+", " ", str(key)).strip().capitalize()
            if isinstance(value, (dict, list)):
                value = json.dumps(value, ensure_ascii=False)
            readable.append(f"{label}: {value if value not in (None, '') else 'Not available'}")
        compliance_support.append("; ".join(readable))
    master["compliance_what_happened"] = compliance_what
    master["compliance_why_it_matters"] = compliance_why
    master["compliance_supporting_details"] = compliance_support
    master["compliance_explanation"] = [
        f"{what} {why}".strip() if why else what
        for what, why in zip(compliance_what, compliance_why)
    ]
    master["compliance_primary_rule_id"] = [item.get("rule_id", "") for item in primary_findings]
    master["compliance_primary_status"] = [item.get("status", "") for item in primary_findings]
    master["compliance_primary_guideline_basis"] = [item.get("guideline_basis", "") for item in primary_findings]
    master["compliance_primary_what_happened"] = [item.get("what_happened", "") for item in primary_findings]
    master["compliance_primary_why_it_matters"] = [item.get("why_it_matters", "") for item in primary_findings]
    master["compliance_primary_supporting_details"] = [
        "; ".join(f"{re.sub(r'_+', ' ', str(key)).strip().capitalize()}: {value if value not in (None, '') else 'Not available'}" for key, value in (item.get("details", {}) or {}).items())
        for item in primary_findings
    ]
    master["compliance_primary_details_json"] = [json.dumps(item.get("details", {}), ensure_ascii=False) for item in primary_findings]
    master["compliance_scope"] = "WORK_LEVEL_ONLY"
    master["compliance_review_status"] = np.where(master["compliance_risk_score"].ge(20), "REVIEW_REQUIRED", "NO_WORK_LEVEL_CONCERN")
    master["is_work_level_compliance_risk"] = master["compliance_risk_score"].ge(20)
    master["is_compliance_flagged"] = master["is_work_level_compliance_risk"]

    constituency = build_constituency_analysis(master, processed)
    constituency_path = os.path.join(features, "constituency_compliance_analysis.parquet")
    constituency.to_parquet(constituency_path, index=False)
    output_path = os.path.join(features, "compliance_risk_analysis.parquet")
    master.to_parquet(output_path, index=False)
    print(f"Compliance work-level rules evaluated for {len(master):,} works; saved to {output_path}")
    print(f"Constituency-level observations saved to {constituency_path} ({len(constituency):,} rows)")
    return {"work_path": output_path, "constituency_path": constituency_path, "scope_matrix": public_scope_matrix()}


if __name__ == "__main__":
    run_compliance_engine()
