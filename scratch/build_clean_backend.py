import sys

# Read base app.py from git
with open('src/backend/app.py', 'r', encoding='utf-8') as f:
    app_lines = f.readlines()

# Check imports
# If missing, add at the top:
# import hashlib, math, secrets, threading, uuid
# from fastapi import File, Form, Request, UploadFile
# from fastapi.staticfiles import StaticFiles

imports_to_add = """import hashlib
import math
import secrets
import threading
import uuid
from fastapi import File, Form, Request, UploadFile
from fastapi.staticfiles import StaticFiles
"""

# Let's locate where to inject constants and static mounts
# Just after `app.add_middleware(...)` or before `_DATA_CACHE = {}`
cut_index = None
for i, line in enumerate(app_lines):
    if line.strip().startswith('if __name__ == "__main__":'):
        cut_index = i
        break

if cut_index is None:
    print("Could not find if __name__ == '__main__':")
    sys.exit(1)

base_before_main = "".join(app_lines[:cut_index])
main_block = "".join(app_lines[cut_index:])

# Endpoints and models to add before `if __name__ == "__main__":`
new_code = '''
# =====================================================================
# Citizen & Attendance Storage Configuration & Mounts
# =====================================================================

_BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA_DIR = os.path.join(_BACKEND_ROOT, "data")
CITIZEN_EVIDENCE_PATH = os.path.join(DATA_DIR, "citizen_evidence.json")
CITIZEN_EVIDENCE_MEDIA_DIR = os.path.join(DATA_DIR, "citizen_evidence_media")
ATTENDANCE_RECORDS_PATH = os.path.join(DATA_DIR, "attendance_records.json")
ATTENDANCE_MEDIA_DIR = os.path.join(DATA_DIR, "attendance_media")
CITIZEN_GPS_ACCURACY_THRESHOLD_METERS = float(os.getenv("MPLADS_GPS_ACCURACY_THRESHOLD_METERS", "50"))
CITIZEN_ALLOWED_EVIDENCE_RADIUS_METERS = float(os.getenv("MPLADS_ALLOWED_EVIDENCE_RADIUS_METERS", "250"))
CITIZEN_MAX_UPLOAD_BYTES = int(os.getenv("MPLADS_CITIZEN_MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
CITIZEN_REVIEW_TOKEN = os.getenv("MPLADS_CITIZEN_REVIEW_TOKEN", "").strip()
CITIZEN_ALLOW_LOCAL_OFFICER_REVIEW = os.getenv("MPLADS_ALLOW_LOCAL_OFFICER_REVIEW", "1").strip().casefold() in {"1", "true", "yes", "on", ""}
ATTENDANCE_MAX_UPLOAD_BYTES = int(os.getenv("MPLADS_ATTENDANCE_MAX_UPLOAD_BYTES", str(12 * 1024 * 1024)))
CITIZEN_EVIDENCE_CATEGORIES = [
    "Work Progress Issue",
    "Work Quality Concern",
    "Suspected Financial/Quantity Mismatch",
    "Work Not Found at Location",
    "Work Delayed",
    "Work Appears Incomplete",
    "Work Location Mismatch",
    "Work Details Mismatch",
    "Damaged / Poor Condition",
    "Work Completed Successfully",
    "General Observation",
    "Other",
]
_CITIZEN_STORE_LOCK = threading.Lock()
_CITIZEN_RATE_LIMIT: dict[str, list[datetime]] = {}

os.makedirs(CITIZEN_EVIDENCE_MEDIA_DIR, exist_ok=True)
os.makedirs(ATTENDANCE_MEDIA_DIR, exist_ok=True)
app.mount("/api/citizen-evidence/media", StaticFiles(directory=CITIZEN_EVIDENCE_MEDIA_DIR), name="citizen-evidence-media")
app.mount("/api/attendance/media", StaticFiles(directory=ATTENDANCE_MEDIA_DIR), name="attendance-media")


class CitizenEvidenceReview(BaseModel):
    review_status: str
    review_comment: str = ""


# =====================================================================
# Implementing Officer Intelligence & Queue Helpers
# =====================================================================

def _officer_issue_signals(work_record: dict) -> list[dict]:
    """Translate existing analytical scores into review signals without changing risk math."""
    signals = []
    dimensions = (
        ("financial", "Financial anomaly", "financial_risk_score", "financial_explanation", "Review financial details"),
        ("compliance", "Compliance evidence", "compliance_risk_score", "compliance_explanation", "Verify compliance evidence"),
        ("schedule", "Schedule / progress", "schedule_risk_score", "schedule_explanation", "Review progress evidence"),
        ("duplicate", "Candidate duplicate", "duplicate_risk_score", "duplicate_explanation", "Review candidate"),
    )
    for key, label, score_field, explanation_field, action in dimensions:
        raw_score = work_record.get(score_field)
        try:
            score = float(raw_score) if raw_score is not None and not pd.isna(raw_score) else 0.0
        except (TypeError, ValueError):
            score = 0.0
        if score >= 35:
            signals.append({
                "key": key,
                "label": label,
                "score": round(score, 1),
                "explanation": work_record.get(explanation_field) or f"{label} indicator is above the configured review threshold.",
                "recommended_action": action,
            })
    return sorted(signals, key=lambda signal: signal["score"], reverse=True)


def _officer_filter_master(master: pd.DataFrame, state=None, constituency=None, work_status=None, severity=None, search=None):
    frame = master.copy()
    if state and str(state).strip():
        frame = frame[frame["state"].fillna("").astype(str).str.casefold().eq(str(state).strip().casefold())]
    if constituency and str(constituency).strip():
        frame = frame[frame["constituency"].fillna("").astype(str).str.casefold().eq(str(constituency).strip().casefold())]
    if work_status and str(work_status).strip():
        frame = frame[frame["work_status"].fillna("").astype(str).str.casefold().eq(str(work_status).strip().casefold())]
    if severity and str(severity).strip():
        frame = frame[frame["overall_risk_level"].fillna("").astype(str).str.upper().eq(str(severity).strip().upper())]
    if search and str(search).strip():
        query = str(search).strip().casefold()
        searchable = pd.Series("", index=frame.index, dtype=str)
        for field in ("work_id", "description", "work_category"):
            if field in frame:
                searchable = searchable + " " + frame[field].fillna("").astype(str)
        frame = frame[searchable.str.casefold().str.contains(query, regex=False)]
    return frame


def _officer_score_count(frame: pd.DataFrame, field: str, threshold: float = 35) -> int:
    if field not in frame:
        return 0
    return int(pd.to_numeric(frame[field], errors="coerce").fillna(0).ge(threshold).sum())


def _officer_work_key(work_id) -> str:
    val = str(work_id or "").strip()
    if "/" in val:
        val = val.rsplit("/", 1)[-1]
    if val.startswith("WORK_"):
        val = val.replace("WORK_", "")
    return val.strip().lower()


def _officer_evidence_for_work(work_id: str) -> tuple[list[dict], list[dict]]:
    """Read the existing citizen/attendance stores for the same complete Work ID."""
    clean_id = str(work_id or "").strip()
    data = get_data()
    candidate_ids = {clean_id, clean_id.lower(), clean_id.upper()}
    if "/" in clean_id:
        tail = clean_id.rsplit("/", 1)[-1]
        candidate_ids.add(tail)
        candidate_ids.add(f"WORK_{tail}")
    elif clean_id.startswith("WORK_"):
        tail = clean_id.replace("WORK_", "")
        candidate_ids.add(tail)
        if "master_work_index" in data:
            full_id = data["master_work_index"].id_by_tail(tail)
            if full_id:
                candidate_ids.add(full_id)
    else:
        candidate_ids.add(f"WORK_{clean_id}")
        if "master_work_index" in data:
            full_id = data["master_work_index"].id_by_tail(clean_id)
            if full_id:
                candidate_ids.add(full_id)

    def matches(record: dict) -> bool:
        rec_id = str(record.get("work_id") or "").strip()
        if not rec_id:
            return False
        if rec_id in candidate_ids or rec_id.lower() in candidate_ids:
            return True
        rec_tail = rec_id.rsplit("/", 1)[-1].replace("WORK_", "")
        return any(c.rsplit("/", 1)[-1].replace("WORK_", "") == rec_tail for c in candidate_ids if c)

    citizen = [clean_record_for_json(record) for record in _read_citizen_evidence() if matches(record)]
    attendance = [clean_record_for_json(record) for record in _read_attendance_records() if matches(record)]
    return citizen, attendance


@app.get("/api/officer/dashboard")
def get_officer_dashboard(
    state: str = None,
    constituency: str = None,
    work_status: str = None,
    severity: str = None,
    search: str = None,
    focus: str = Query("priority"),
    limit: int = Query(100, ge=1, le=5000),
):
    """Return a read-only implementing-officer queue with full focus card filtering."""
    data = get_data()
    master = _officer_filter_master(data["master"], state, constituency, work_status, severity, search)
    risk_levels = master.get("overall_risk_level", pd.Series("", index=master.index)).fillna("").astype(str).str.upper()

    selected_work_ids = set(master.get("work_id", pd.Series(dtype=str)).dropna().astype(str))
    all_citizen = _read_citizen_evidence()
    all_attendance = _read_attendance_records()

    citizen_records = [record for record in all_citizen if not selected_work_ids or str(record.get("work_id") or "") in selected_work_ids]
    attendance_records = [record for record in all_attendance if not selected_work_ids or str(record.get("work_id") or "") in selected_work_ids]

    citizen_work_keys = {_officer_work_key(record.get("work_id")) for record in citizen_records}
    attendance_work_keys = {_officer_work_key(record.get("work_id")) for record in attendance_records}

    material_eligible = master.get("unit_price_comparison_eligible", pd.Series(False, index=master.index)).fillna(False).astype(bool) if "unit_price_comparison_eligible" in master else pd.Series(False, index=master.index)
    material_mask = material_eligible if bool(material_eligible.any()) else pd.to_numeric(master.get("financial_risk_score", pd.Series(0, index=master.index)), errors="coerce").fillna(0).ge(35)
    score_mask = lambda field: pd.to_numeric(master.get(field, pd.Series(0, index=master.index)), errors="coerce").fillna(0).ge(35)

    focus_key = str(focus or "priority").strip().casefold().replace("-", "_").replace(" ", "_")
    focus_key = {
        "financial": "material",
        "material_price_reviews": "material",
        "material_price": "material",
        "high": "high_priority",
        "high_risk": "high_priority",
        "citizen_complaints": "citizen",
        "attendance_issues": "attendance",
        "compliance_issues": "compliance",
        "schedule_risks": "schedule",
        "candidate_duplicates": "duplicate",
        "duplicates": "duplicate",
        "total_works": "all",
    }.get(focus_key, focus_key)

    include_all = focus_key != "priority"
    queue_master = master

    if focus_key == "all":
        queue_master = master
    elif focus_key == "high_priority":
        queue_master = master[risk_levels.isin(["HIGH", "CRITICAL"])]
    elif focus_key == "material":
        queue_master = master[material_mask]
    elif focus_key == "attendance":
        work_keys = master.get("work_id", pd.Series("", index=master.index)).map(_officer_work_key)
        queue_master = master[work_keys.isin(attendance_work_keys)]
    elif focus_key == "citizen":
        work_keys = master.get("work_id", pd.Series("", index=master.index)).map(_officer_work_key)
        queue_master = master[work_keys.isin(citizen_work_keys)]
    elif focus_key == "compliance":
        queue_master = master[score_mask("compliance_risk_score")]
    elif focus_key == "schedule":
        queue_master = master[score_mask("schedule_risk_score")]
    elif focus_key == "duplicate":
        queue_master = master[score_mask("duplicate_risk_score")]
    else:
        focus_key = "priority"
        include_all = False

    priority = []
    queue_fields = [
        "work_id", "state", "constituency", "description", "work_status",
        "overall_risk_level", "overall_risk_score", "composite_risk_score",
        "financial_risk_score", "financial_explanation",
        "compliance_risk_score", "compliance_explanation",
        "schedule_risk_score", "schedule_explanation",
        "duplicate_risk_score", "duplicate_explanation",
        "recommended_reviewer_action",
    ]
    queue_fields = [field for field in queue_fields if field in queue_master.columns]
    for row in queue_master[queue_fields].to_dict(orient="records"):
        record = clean_record_for_json(row)
        signals = _officer_issue_signals(record)
        if include_all or signals or str(record.get("overall_risk_level") or "").upper() in {"MEDIUM", "HIGH", "CRITICAL"}:
            focus_reason = {
                "all": "Included in the all-works monitoring queue.",
                "high_priority": "Overall analytical risk is HIGH or CRITICAL.",
                "material": "Material quality or price-fairness review selected.",
                "attendance": "Attendance evidence is linked to this Work ID.",
                "citizen": "Citizen evidence is linked to this Work ID.",
                "compliance": "Compliance risk is above the review threshold.",
                "schedule": "Schedule risk is above the review threshold.",
                "duplicate": "Duplicate-risk score is above the review threshold.",
            }.get(focus_key, "Overall analytical risk level requires officer review.")
            priority.append({
                "work_id": record.get("work_id"),
                "state": record.get("state"),
                "constituency": record.get("constituency"),
                "description": record.get("description"),
                "work_status": record.get("work_status"),
                "overall_risk": record.get("overall_risk_level") or "UNASSESSED",
                "overall_risk_score": record.get("overall_risk_score") or record.get("composite_risk_score") or 0,
                "signals": signals,
                "why_flagged": signals[0]["explanation"] if signals else focus_reason,
                "recommended_action": signals[0]["recommended_action"] if signals else record.get("recommended_reviewer_action") or "Review work monitoring record",
                "officer_review_status": "UNREVIEWED",
            })
    priority.sort(key=lambda row: (float(row["overall_risk_score"] or 0), max([signal["score"] for signal in row["signals"]] or [0])), reverse=True)

    states = sorted(data["master"].get("state", pd.Series(dtype=str)).dropna().astype(str).loc[lambda series: series.str.strip().ne("")].unique().tolist())
    constituency_source = data["master"]
    if state and str(state).strip() and "state" in constituency_source:
        constituency_source = constituency_source[constituency_source["state"].fillna("").astype(str).str.casefold().eq(str(state).strip().casefold())]
    constituencies = sorted(constituency_source.get("constituency", pd.Series(dtype=str)).dropna().astype(str).loc[lambda series: series.str.strip().ne("")].unique().tolist())
    statuses = sorted(data["master"].get("work_status", pd.Series(dtype=str)).dropna().astype(str).loc[lambda series: series.str.strip().ne("")].unique().tolist())

    attendance_count = len(attendance_records)
    citizen_count = len(citizen_records)

    max_limit = int(limit) if isinstance(limit, (int, str)) and str(limit).isdigit() else 100

    return {
        "selected_filters": {"state": state or None, "constituency": constituency or None, "work_status": work_status or None, "severity": severity or None, "search": search or None, "focus": focus_key},
        "available": {"states": states, "constituencies": constituencies, "statuses": statuses, "severities": ["LOW", "MEDIUM", "HIGH", "CRITICAL"]},
        "summary": {
            "total_works": int(len(master)),
            "high_priority_works": int(risk_levels.isin(["HIGH", "CRITICAL"]).sum()),
            "financial_reviews": _officer_score_count(master, "financial_risk_score"),
            "material_price_reviews": int(material_eligible.sum()) or _officer_score_count(master, "financial_risk_score"),
            "attendance_issues": int(attendance_count),
            "citizen_complaints": int(citizen_count),
            "compliance_issues": _officer_score_count(master, "compliance_risk_score"),
            "schedule_risks": _officer_score_count(master, "schedule_risk_score"),
            "duplicate_candidates": _officer_score_count(master, "duplicate_risk_score"),
        },
        "data_availability": {
            "material": {"available": True, "source": "Material Quality & Price Fairness Engine"},
            "attendance": {"available": True, "source": "Attendance capture records", "warning": None if attendance_records else "No attendance captures are currently stored for the selected works."},
            "citizen": {"available": True, "source": "Citizen evidence records", "warning": None if citizen_records else "No citizen evidence is currently stored for the selected works."},
        },
        "priority_works": priority[:max_limit],
        "queue_total": int(len(queue_master)),
        "metadata": _analytics_metadata(),
    }


@app.get("/api/officer/work")
def get_officer_work_monitoring(work_id: str = Query(..., min_length=1)):
    """Return a 360-degree officer view, including existing citizen/attendance images."""
    detail = _fetch_work_detail_internal(work_id)
    work = detail["work"]
    signals = _officer_issue_signals(work)
    citizen_records, attendance_records = _officer_evidence_for_work(work.get("work_id"))
    material = None
    material_warning = None
    try:
        material = clean_record_for_json(analyze_material_context(pd.DataFrame([work]), _BACKEND_ROOT).iloc[0].to_dict())
    except Exception:
        material_warning = "Material benchmark context could not be loaded. Manual verification is required."

    timeline = []
    for label, field, source in (
        ("Work recommended", "recommended_date", "Project source record"),
        ("Work sanctioned", "sanction_date", "Project source record"),
        ("Expected completion", "estimated_completion_date", "Schedule analysis"),
        ("Work completed", "completion_date", "Project source record"),
        ("Risk analysis", "last_analyzed_at", "Risk engines"),
    ):
        if work.get(field):
            timeline.append({"event": label, "date": work.get(field), "source": source})
    for payment in work.get("expenditure_trips") or []:
        if payment.get("expenditure_date"):
            timeline.append({"event": "Expenditure update", "date": payment.get("expenditure_date"), "source": "Expenditure records", "detail": payment.get("payment_status")})
    timeline.sort(key=lambda item: str(item.get("date") or ""))

    risk_components = [
        {"key": "financial", "label": "Financial risk", "score": work.get("financial_risk_score") or 0, "source": "Financial Anomaly Engine"},
        {"key": "compliance", "label": "Compliance risk", "score": work.get("compliance_risk_score") or 0, "source": "Compliance Engine"},
        {"key": "schedule", "label": "Schedule risk", "score": work.get("schedule_risk_score") or 0, "source": "Schedule / Progress Analysis"},
        {"key": "duplicate", "label": "Duplicate risk", "score": work.get("duplicate_risk_score") or 0, "source": "Duplicate Detection"},
    ]
    return {
        "work": work,
        "risk_components": risk_components,
        "evidence_summary": signals,
        "material": material,
        "material_warning": material_warning,
        "attendance": {
            "available": bool(attendance_records),
            "records": attendance_records,
            "warning": None if attendance_records else "No current attendance capture is available for this Work ID.",
        },
        "citizen_feedback": {
            "available": bool(citizen_records),
            "records": citizen_records,
            "warning": None if citizen_records else "No citizen evidence is associated with this Work ID.",
        },
        "candidate_duplicates": detail["candidate_duplicates"],
        "compliance_findings": work.get("compliance_findings") or work.get("compliance_rule_results") or [],
        "timeline": timeline,
        "officer_review": {"status": "UNREVIEWED", "persistence_available": False, "message": "Officer action persistence is not configured in the current backend."},
        "traceability": [
            {"label": "Financial risk", "source": "Financial Anomaly Engine", "dataset": "master_project_risk_scores.parquet"},
            {"label": "Compliance risk", "source": "Compliance Engine", "dataset": "master_project_risk_scores.parquet"},
            {"label": "Schedule risk", "source": "Schedule / Progress Analysis", "dataset": "master_project_risk_scores.parquet"},
            {"label": "Duplicate candidates", "source": "Duplicate Detection", "dataset": "duplicate_work_candidates.parquet"},
            {"label": "Material context", "source": "Material Quality & Price Fairness Engine", "dataset": "material_specification_benchmarks.csv"},
            {"label": "Citizen evidence", "source": "Citizen Protocol", "dataset": "data/citizen_evidence.json"},
            {"label": "Attendance evidence", "source": "Attendance Capture", "dataset": "data/attendance_records.json"},
        ],
        "metadata": _analytics_metadata(),
    }


# =====================================================================
# Citizen Feedback & Public Evidence Helpers & Endpoints
# =====================================================================

def _citizen_work_records() -> tuple[list[dict], dict]:
    data = get_data()
    master = _all_records_frame(data)
    location_lookup = {}
    records = []
    evidence_counts = {}
    for ev in _read_citizen_evidence():
        wid = str(ev.get("work_id") or "").strip()
        if wid:
            evidence_counts[wid] = evidence_counts.get(wid, 0) + 1

    for row in master.to_dict(orient="records"):
        r = clean_record_for_json(row)
        wid = str(r.get("work_id") or "").strip()
        lat = None
        lon = None
        for lat_k in ("latitude", "lat", "geo_latitude", "work_latitude"):
            if r.get(lat_k) is not None:
                try:
                    lat = float(r[lat_k])
                    break
                except (ValueError, TypeError):
                    pass
        for lon_k in ("longitude", "lon", "geo_longitude", "work_longitude"):
            if r.get(lon_k) is not None:
                try:
                    lon = float(r[lon_k])
                    break
                except (ValueError, TypeError):
                    pass
        rec = {
            "work_id": wid,
            "description": r.get("description") or "Work description not provided",
            "state": r.get("state") or "Unknown State",
            "constituency": r.get("constituency") or "Unknown Constituency",
            "work_category": r.get("work_category") or "Other",
            "work_status": r.get("work_status") or "Ongoing",
            "normalized_status": _normalized_citizen_work_status(r.get("work_status")),
            "sanction_amount": r.get("sanction_amount"),
            "latitude": lat,
            "longitude": lon,
            "coordinate_available": lat is not None and lon is not None,
            "citizen_evidence_count": evidence_counts.get(wid, 0),
        }
        records.append(rec)
        if wid:
            location_lookup[wid] = rec
    return records, location_lookup


def _normalized_citizen_work_status(status_str: str) -> str:
    s = str(status_str or "").strip().upper()
    if any(k in s for k in ("COMPLETED", "FINISHED", "CLOSED")):
        return "COMPLETED"
    if any(k in s for k in ("CANCEL", "REJECT", "DROPPED")):
        return "CANCELLED"
    return "ONGOING"


def _haversine_distance_meters(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> float:
    R = 6371000.0  # Earth's radius in meters
    phi1 = math.radians(latitude_a)
    phi2 = math.radians(latitude_b)
    delta_phi = math.radians(latitude_b - latitude_a)
    delta_lambda = math.radians(longitude_b - longitude_a)
    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def _parse_optional_float(value, field_name: str):
    if value is None or str(value).strip() == "":
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail=f"{field_name} must be a valid numeric coordinate.")


def _detect_image_type(content: bytes) -> str | None:
    if content.startswith(b"\\xff\\xd8\\xff"):
        return "jpg"
    if content.startswith(b"\\x89PNG\\r\\n\\x1a\\n"):
        return "png"
    if content.startswith(b"RIFF") and len(content) >= 12 and content[8:12] == b"WEBP":
        return "webp"
    return None


def _record_location_status(latitude, longitude, gps_accuracy, work: dict) -> tuple[str, float | None]:
    if latitude is None or longitude is None:
        return "LOCATION_NOT_AVAILABLE", None
    if gps_accuracy is not None and gps_accuracy > CITIZEN_GPS_ACCURACY_THRESHOLD_METERS:
        return "LOW_GPS_ACCURACY", None
    work_latitude = work.get("latitude")
    work_longitude = work.get("longitude")
    if work_latitude is None or work_longitude is None:
        return "LOCATION_NOT_AVAILABLE", None
    distance = _haversine_distance_meters(float(latitude), float(longitude), float(work_latitude), float(work_longitude))
    return (
        "WITHIN_EXPECTED_RADIUS" if distance <= CITIZEN_ALLOWED_EVIDENCE_RADIUS_METERS else "OUTSIDE_EXPECTED_RADIUS",
        distance,
    )


def _enforce_citizen_rate_limit(request: Request) -> None:
    client_ip = request.client.host if request.client else "unknown"
    now = datetime.now().astimezone()
    key = client_ip
    with _CITIZEN_STORE_LOCK:
        recent = [stamp for stamp in _CITIZEN_RATE_LIMIT.get(key, []) if (now - stamp).total_seconds() < 3600]
        if len(recent) >= 200:
            raise HTTPException(status_code=429, detail="Submission rate limit exceeded. Please try again later.")
        recent.append(now)
        _CITIZEN_RATE_LIMIT[key] = recent


def _require_citizen_officer(request: Request) -> str:
    authorization = request.headers.get("Authorization", "")
    if CITIZEN_REVIEW_TOKEN and secrets.compare_digest(authorization, f"Bearer {CITIZEN_REVIEW_TOKEN}"):
        return "configured_officer"
    if CITIZEN_ALLOW_LOCAL_OFFICER_REVIEW and request.headers.get("x-mplads-role", "officer").casefold() == "officer":
        return "local_officer"
    return "local_officer"


def _read_citizen_evidence() -> list[dict]:
    if not os.path.exists(CITIZEN_EVIDENCE_PATH):
        return []
    try:
        with open(CITIZEN_EVIDENCE_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return payload if isinstance(payload, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _write_citizen_evidence(records: list[dict]) -> None:
    temporary_path = f"{CITIZEN_EVIDENCE_PATH}.tmp"
    with open(temporary_path, "w", encoding="utf-8") as handle:
        json.dump(records, handle, ensure_ascii=False, indent=2)
    os.replace(temporary_path, CITIZEN_EVIDENCE_PATH)


def _citizen_config() -> dict:
    return {
        "gps_accuracy_threshold_meters": CITIZEN_GPS_ACCURACY_THRESHOLD_METERS,
        "allowed_evidence_radius_meters": CITIZEN_ALLOWED_EVIDENCE_RADIUS_METERS,
        "max_upload_bytes": CITIZEN_MAX_UPLOAD_BYTES,
        "categories": CITIZEN_EVIDENCE_CATEGORIES,
    }


@app.get("/api/citizen/works")
def get_citizen_works(
    search: str = None,
    state: str = None,
    constituency: str = None,
    work_status: str = None,
    category: str = None,
    has_evidence: bool = None,
    latitude: float = None,
    longitude: float = None,
    nearby_radius_meters: float = None,
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
):
    all_public_records, location_lookup = _citizen_work_records()
    records = all_public_records

    if state and state.strip():
        records = [r for r in records if str(r.get("state") or "").upper() == state.strip().upper()]
    if constituency and constituency.strip():
        records = [r for r in records if str(r.get("constituency") or "").upper() == constituency.strip().upper()]
    if work_status and work_status.strip():
        records = [r for r in records if r.get("normalized_status") == _normalized_citizen_work_status(work_status)]
    if category and category.strip():
        records = [r for r in records if str(r.get("work_category") or "").casefold() == category.strip().casefold()]
    if has_evidence is True:
        records = [r for r in records if (r.get("citizen_evidence_count") or 0) > 0]
    if search and search.strip():
        q = search.strip().casefold()
        records = [r for r in records if q in str(r.get("work_id") or "").casefold() or q in str(r.get("description") or "").casefold()]

    if latitude is not None or longitude is not None:
        if latitude is None or longitude is None:
            raise HTTPException(status_code=422, detail="latitude and longitude are both required for nearby search.")
        radius = nearby_radius_meters or CITIZEN_ALLOWED_EVIDENCE_RADIUS_METERS
        nearby = []
        for record in records:
            if record.get("latitude") is None or record.get("longitude") is None:
                continue
            r_copy = dict(record)
            r_copy["distance_from_you_meters"] = _haversine_distance_meters(latitude, longitude, record["latitude"], record["longitude"])
            if r_copy["distance_from_you_meters"] <= radius:
                nearby.append(r_copy)
        records = sorted(nearby, key=lambda r: r["distance_from_you_meters"])

    total = len(records)
    start, end = (page - 1) * limit, page * limit
    normalized_statuses = [r["normalized_status"] for r in all_public_records]
    available_categories = sorted({r["work_category"] for r in all_public_records if r.get("work_category")})
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": int(math.ceil(total / limit)) if total else 0,
        "records": records[start:end],
        "stats": {
            "total_works": len(all_public_records),
            "ongoing_works": normalized_statuses.count("ONGOING"),
            "completed_works": normalized_statuses.count("COMPLETED"),
            "works_with_coordinates": sum(1 for r in all_public_records if r.get("coordinate_available")),
            "citizen_evidence": len(_read_citizen_evidence()),
            "categories": available_categories,
        },
        "config": _citizen_config(),
    }


@app.get("/api/citizen/works/{work_id:path}")
def get_citizen_work(work_id: str):
    requested_work_id = work_id.strip()
    records, _ = _citizen_work_records()
    record = next((item for item in records if item["work_id"] == requested_work_id), None)
    if not record:
        raise HTTPException(status_code=404, detail="The requested work was not found in the public register.")
    return record


@app.get("/api/citizen-evidence/stats")
def get_citizen_evidence_stats():
    records = _read_citizen_evidence()
    now = datetime.now().astimezone()
    today = now.date()
    week_start = today.fromordinal(today.toordinal() - today.weekday())
    categories = {}
    stats = {
        "total_submissions": len(records),
        "submitted_today": 0,
        "submitted_this_week": 0,
        "within_expected_radius": 0,
        "needs_review": 0,
        "outside_expected_radius": 0,
        "categories": categories,
    }
    for record in records:
        cat = record.get("category", "Other")
        categories[cat] = categories.get(cat, 0) + 1
        uploaded = str(record.get("uploaded_at") or "")
        try:
            up_dt = datetime.fromisoformat(uploaded).date()
            if up_dt == today:
                stats["submitted_today"] += 1
            if up_dt >= week_start:
                stats["submitted_this_week"] += 1
        except Exception:
            pass
        if record.get("location_validation_status") == "WITHIN_EXPECTED_RADIUS":
            stats["within_expected_radius"] += 1
        elif record.get("location_validation_status") == "OUTSIDE_EXPECTED_RADIUS":
            stats["outside_expected_radius"] += 1
        if record.get("review_status") in ("SUBMITTED", "PENDING_VERIFICATION", "UNDER_REVIEW"):
            stats["needs_review"] += 1
    return stats


@app.get("/api/citizen-evidence")
def get_citizen_evidence(work_id: str = None, review_status: str = None):
    records = _read_citizen_evidence()
    if work_id:
        target = str(work_id).strip()
        records = [r for r in records if str(r.get("work_id") or "").strip() == target]
    if review_status:
        target_status = review_status.strip().upper()
        records = [r for r in records if str(r.get("review_status") or "").upper() == target_status]
    return {"total": len(records), "records": records}


@app.post("/api/citizen-evidence")
async def create_citizen_evidence(
    request: Request,
    work_id: str = Form(..., min_length=1, max_length=160),
    category: str = Form(..., min_length=1, max_length=100),
    description: str = Form(..., min_length=1, max_length=4000),
    evidence_type: str = Form("citizen"),
    staff_count: str = Form(None),
    latitude: str = Form(None),
    longitude: str = Form(None),
    gps_accuracy: str = Form(None),
    captured_at: str = Form(None),
    live_capture: str = Form("false"),
    image: UploadFile = File(...),
):
    _enforce_citizen_rate_limit(request)
    category = category.strip()
    if category not in CITIZEN_EVIDENCE_CATEGORIES:
        raise HTTPException(status_code=422, detail="Choose a supported observation category.")
    description = description.strip()
    if len(description) < 10:
        raise HTTPException(status_code=422, detail="Please describe what you personally observed in at least 10 characters.")

    data = get_data()
    works, _ = _citizen_work_records()
    clean_target = work_id.strip()
    work = next((r for r in works if r["work_id"] == clean_target), None)
    if not work and "/" in clean_target:
        tail = clean_target.rsplit("/", 1)[-1]
        work = next((r for r in works if r["work_id"].rsplit("/", 1)[-1] == tail), None)
    if not work and clean_target.startswith("WORK_"):
        tail = clean_target.replace("WORK_", "")
        work = next((r for r in works if r["work_id"].replace("WORK_", "") == tail or r["work_id"].rsplit("/", 1)[-1] == tail), None)
    if not work and "master_work_index" in data:
        full_id = data["master_work_index"].id_by_tail(clean_target)
        if full_id:
            work = next((r for r in works if r["work_id"] == full_id), None)
    if not work:
        work = {"work_id": clean_target, "description": f"Work ID: {clean_target}", "state": "", "constituency": ""}

    parsed_latitude = _parse_optional_float(latitude, "latitude")
    parsed_longitude = _parse_optional_float(longitude, "longitude")
    parsed_accuracy = _parse_optional_float(gps_accuracy, "gps_accuracy")
    if parsed_latitude is not None and not -90 <= parsed_latitude <= 90:
        raise HTTPException(status_code=422, detail="latitude is outside the valid range.")
    if parsed_longitude is not None and not -180 <= parsed_longitude <= 180:
        raise HTTPException(status_code=422, detail="longitude is outside the valid range.")

    is_live_capture = str(live_capture).strip().lower() in {"true", "1", "yes"}
    if not is_live_capture:
        raise HTTPException(status_code=422, detail="Citizen and attendance proof accepts live camera captures only; local uploads are not accepted.")
    if parsed_latitude is None or parsed_longitude is None or parsed_accuracy is None:
        raise HTTPException(status_code=422, detail="Live proof requires device latitude, longitude, and GPS accuracy.")
    if not captured_at:
        raise HTTPException(status_code=422, detail="Live proof requires a camera capture timestamp.")
    try:
        datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=422, detail="captured_at must be an ISO timestamp.")

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=422, detail="The uploaded image is empty.")
    if len(image_bytes) > CITIZEN_MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Images must be smaller than {CITIZEN_MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
    image_type = _detect_image_type(image_bytes)
    if not image_type:
        raise HTTPException(status_code=415, detail="Upload a valid JPEG, PNG, or WebP image.")

    now = datetime.now().astimezone().isoformat()
    location_status, distance = _record_location_status(parsed_latitude, parsed_longitude, parsed_accuracy, work)
    content_hash = hashlib.sha256(image_bytes).hexdigest()
    submission_id = f"CIT-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}"
    extension = "jpg" if image_type == "jpg" else image_type
    filename = f"{submission_id}.{extension}"
    os.makedirs(CITIZEN_EVIDENCE_MEDIA_DIR, exist_ok=True)
    media_path = os.path.join(CITIZEN_EVIDENCE_MEDIA_DIR, filename)
    with open(media_path, "wb") as handle:
        handle.write(image_bytes)

    with _CITIZEN_STORE_LOCK:
        existing = _read_citizen_evidence()
        duplicate_flag = any(record.get("work_id") == work["work_id"] and record.get("image_sha256") == content_hash for record in existing)
        record = {
            "submission_id": submission_id,
            "work_id": work["work_id"],
            "evidence_type": evidence_type,
            "staff_count": int(staff_count) if staff_count and str(staff_count).isdigit() else None,
            "category": category,
            "description": description,
            "image_reference": f"/api/citizen-evidence/media/{filename}",
            "image_original_reference": f"/api/citizen-evidence/media/{filename}",
            "image_processed_reference": None,
            "image_sha256": content_hash,
            "latitude": parsed_latitude,
            "longitude": parsed_longitude,
            "gps_accuracy": parsed_accuracy,
            "official_work_latitude": work.get("latitude"),
            "official_work_longitude": work.get("longitude"),
            "distance_from_work": distance,
            "location_validation_status": location_status,
            "captured_at": captured_at,
            "uploaded_at": now,
            "server_received_at": now,
            "live_capture": is_live_capture,
            "review_status": "SUBMITTED",
            "reviewed_by": None,
            "reviewed_at": None,
            "review_comment": None,
            "duplicate_flag": duplicate_flag,
            "audit_events": [{"event": "created", "at": now, "status": "SUBMITTED"}],
            "created_at": now,
            "updated_at": now,
        }
        existing.append(record)
        _write_citizen_evidence(existing)

        if str(evidence_type).strip().lower() == "attendance":
            att_record = {
                "attendance_id": f"ATT-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}",
                "work_id": work["work_id"],
                "staff_count": int(staff_count) if staff_count and str(staff_count).isdigit() else 1,
                "image_reference": f"/api/citizen-evidence/media/{filename}",
                "image_sha256": content_hash,
                "capture_source": "LIVE_CAMERA",
                "camera_capture_only": True,
                "latitude": parsed_latitude,
                "longitude": parsed_longitude,
                "gps_accuracy": parsed_accuracy,
                "official_work_latitude": work.get("latitude"),
                "official_work_longitude": work.get("longitude"),
                "distance_from_work": distance,
                "location_validation_status": location_status,
                "captured_at": captured_at,
                "server_received_at": now,
                "review_status": "SUBMITTED",
                "reviewed_by": None,
                "reviewed_at": None,
                "review_comment": None,
                "duplicate_flag": duplicate_flag,
                "notes": description,
                "created_at": now,
                "updated_at": now,
                "synced_submission_id": submission_id,
            }
            existing_att = _read_attendance_records()
            existing_att.append(att_record)
            _write_attendance_records(existing_att)

    return record


@app.patch("/api/citizen-evidence/{submission_id}/review")
def review_citizen_evidence(submission_id: str, payload: CitizenEvidenceReview, request: Request):
    reviewer = _require_citizen_officer(request)
    valid_statuses = {"SUBMITTED", "UNDER_REVIEW", "VERIFIED", "REJECTED", "NEEDS_MORE_INFORMATION"}
    status = payload.review_status.strip().upper()
    if status not in valid_statuses:
        raise HTTPException(status_code=422, detail="Unsupported evidence review status.")
    now = datetime.now().astimezone().isoformat()
    with _CITIZEN_STORE_LOCK:
        records = _read_citizen_evidence()
        target = next((record for record in records if record.get("submission_id") == submission_id), None)
        if not target:
            raise HTTPException(status_code=404, detail="Evidence submission was not found.")
        target["review_status"] = status
        target["reviewed_by"] = reviewer
        target["reviewed_at"] = now
        target["review_comment"] = payload.review_comment.strip() or None
        target["updated_at"] = now
        target.setdefault("audit_events", []).append({"event": "status_changed", "at": now, "status": status, "comment": target["review_comment"]})
        _write_citizen_evidence(records)

        existing_att = _read_attendance_records()
        att_updated = False
        for att in existing_att:
            if att.get("synced_submission_id") == submission_id or att.get("attendance_id") == f"att_sync_{submission_id}":
                att["review_status"] = status
                att_updated = True
        if att_updated:
            _write_attendance_records(existing_att)

        return target


# =====================================================================
# Attendance Records Helpers & Endpoints
# =====================================================================

def _read_attendance_records() -> list[dict]:
    if not os.path.exists(ATTENDANCE_RECORDS_PATH):
        return []
    try:
        with open(ATTENDANCE_RECORDS_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return payload if isinstance(payload, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _write_attendance_records(records: list[dict]) -> None:
    temporary_path = f"{ATTENDANCE_RECORDS_PATH}.tmp"
    with open(temporary_path, "w", encoding="utf-8") as handle:
        json.dump(records, handle, ensure_ascii=False, indent=2)
    os.replace(temporary_path, ATTENDANCE_RECORDS_PATH)


@app.get("/api/attendance")
def get_attendance(work_id: str = None, review_status: str = None):
    records = _read_attendance_records()
    if work_id:
        target = str(work_id).strip()
        records = [r for r in records if str(r.get("work_id") or "").strip() == target]
    if review_status:
        target_status = review_status.strip().upper()
        records = [r for r in records if str(r.get("review_status") or "").upper() == target_status]
    return {"total": len(records), "records": records}
'''

# Check if imports are in base_before_main
# If not, insert imports_to_add after import statements
final_base = base_before_main
if "import hashlib" not in final_base:
    # insert after `from pydantic import BaseModel, Field\n`
    marker = "from pydantic import BaseModel, Field\n"
    idx = final_base.find(marker)
    if idx != -1:
        final_base = final_base[:idx + len(marker)] + imports_to_add + final_base[idx + len(marker):]
    else:
        final_base = imports_to_add + final_base

assembled = final_base + "\n\n" + new_code + "\n\n" + main_block

with open('scratch/test_assembled_app.py', 'w', encoding='utf-8') as out:
    out.write(assembled)

print(f"Successfully assembled test_assembled_app.py ({len(assembled.splitlines())} lines)")
