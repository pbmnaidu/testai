# Reconstructing citizen endpoints cleanly

citizen_endpoints = """
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
"""
print("Defined citizen_endpoints cleanly")
