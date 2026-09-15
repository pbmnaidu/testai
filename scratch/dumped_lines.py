# 60: 
# 61: 
# 62: @app.on_event("startup")
# 63: def start_automatic_sync_scheduler():
# 64:     reconcile_sync_state()
# 65:     start_scheduler()
# 66: 
# 67: # Resolve paths dynamically so the backend works on any machine (including Vercel)
# 68: _BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
# 69: FEATURES_DIR = os.path.join(_BACKEND_ROOT, "data", "features")
# 70: PROCESSED_DIR = os.path.join(_BACKEND_ROOT, "data", "processed")
# 71: DATA_DIR = os.path.join(_BACKEND_ROOT, "data")
# 72: 
# 73: # Citizen evidence is deliberately kept separate from analytical feature data.
# 74: # The JSON store is a small local-development adapter; the evidence contract is
# 75: # storage-neutral so it can be replaced by object storage/SQL in deployment.
# 76: CITIZEN_EVIDENCE_PATH = os.path.join(DATA_DIR, "citizen_evidence.json")
# 77: CITIZEN_EVIDENCE_MEDIA_DIR = os.path.join(DATA_DIR, "citizen_evidence_media")
# 78: ATTENDANCE_RECORDS_PATH = os.path.join(DATA_DIR, "attendance_records.json")
# 79: ATTENDANCE_MEDIA_DIR = os.path.join(DATA_DIR, "attendance_media")
# 80: CITIZEN_GPS_ACCURACY_THRESHOLD_METERS = float(os.getenv("MPLADS_GPS_ACCURACY_THRESHOLD_METERS", "50"))
# 81: CITIZEN_ALLOWED_EVIDENCE_RADIUS_METERS = float(os.getenv("MPLADS_ALLOWED_EVIDENCE_RADIUS_METERS", "250"))
# 82: CITIZEN_MAX_UPLOAD_BYTES = int(os.getenv("MPLADS_CITIZEN_MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
# 83: CITIZEN_REVIEW_TOKEN = os.getenv("MPLADS_CITIZEN_REVIEW_TOKEN", "").strip()
# 84: CITIZEN_ALLOW_LOCAL_OFFICER_REVIEW = os.getenv("MPLADS_ALLOW_LOCAL_OFFICER_REVIEW", "").strip().casefold() in {"1", "true", "yes", "on"}
# 85: ATTENDANCE_MAX_UPLOAD_BYTES = int(os.getenv("MPLADS_ATTENDANCE_MAX_UPLOAD_BYTES", str(12 * 1024 * 1024)))
# 86: CITIZEN_EVIDENCE_CATEGORIES = [
# 87:     "Work Progress Issue",
# 88:     "Work Quality Concern",
# 89:     "Suspected Financial/Quantity Mismatch",
# 90:     "Work Not Found at Location",
# 91:     "Work Delayed",
# 92:     "Work Appears Incomplete",
# 93:     "Work Location Mismatch",
# 94:     "Work Details Mismatch",
# 95:     "Damaged / Poor Condition",
# 96:     "Work Completed Successfully",
# 97:     "General Observation",
# 98:     "Other",
# 99: ]
# 100: _CITIZEN_STORE_LOCK = threading.Lock()
# 101: _CITIZEN_RATE_LIMIT: dict[str, list[datetime]] = {}
# 102: 
# 103: os.makedirs(CITIZEN_EVIDENCE_MEDIA_DIR, exist_ok=True)
# 104: os.makedirs(ATTENDANCE_MEDIA_DIR, exist_ok=True)
# 105: app.mount("/api/citizen-evidence/media", StaticFiles(directory=CITIZEN_EVIDENCE_MEDIA_DIR), name="citizen-evidence-media")
# 106: app.mount("/api/attendance/media", StaticFiles(directory=ATTENDANCE_MEDIA_DIR), name="attendance-media")
# 107: 
# 108: # Cache loaded dataframes in memory
# 109: _DATA_CACHE = {}
# 110: 
# 111: 
# 112: class LazyWorkIndex:
# 113:     """Resolve work details on demand instead of serializing every row at startup."""
# 114: 
# 115:     def __init__(self, frame: pd.DataFrame):
# 116:         self.frame = frame
# 117:         self.positions = {}
# 118:         self.normalized_positions = {}
# 119:         self.tail_positions = {}
# 120:         self.cache = {}
# 121:         if not frame.empty and "work_id" in frame.columns:
# 122:             for position, value in enumerate(frame["work_id"].tolist()):
# 123:                 work_id = str(value or "").strip()
# 124:                 if work_id:
# 125:                     self.positions[work_id] = position
# 126:                     self.normalized_positions.setdefault(work_id.lower().replace(" ", "-"), work_id)
# 127:                     self.tail_positions.setdefault(work_id.rsplit("/", 1)[-1], work_id)
# 128: 
# 129:     def get(self, work_id, default=None):
# 130:         clean_id = str(work_id or "").strip()
# 131:         if clean_id not in self.positions:
# 132:             return default
# 133:         if clean_id not in self.cache:
# 134:             self.cache[clean_id] = clean_record_for_json(self.frame.iloc[self.positions[clean_id]].to_dict())
# 135:         return self.cache[clean_id]
# 136: 
# 137:     def items(self):
# 138:         for work_id in self.positions:
# 139:             yield work_id, self.get(work_id)
# 140: 
# 141:     def get_by_tail(self, tail_id, default=None):
# 142:         work_id = self.tail_positions.get(str(tail_id or "").strip())
# 143:         return self.get(work_id, default) if work_id else default
# 144: 
# 145:     def id_by_tail(self, tail_id):
# 146:         return self.tail_positions.get(str(tail_id or "").strip())
# 147: 
# 148:     def get_normalized(self, normalized_id, default=None):
# 149:         work_id = self.normalized_positions.get(str(normalized_id or "").strip().lower())
# 150:         return self.get(work_id, default) if work_id else default
# 151: 
# 152:     def id_by_normalized(self, normalized_id):
# 153:         return self.normalized_positions.get(str(normalized_id or "").strip().lower())
# 154: 
# 155:     def __len__(self):
# 156:         return len(self.positions)
# 157: 
# 158: 
# 159: class LazyDuplicateIndex:
# 160:     """Index duplicate candidates by work ID without cleaning all pair rows."""
# 1590:         all_index = data.get("all_work_index") or LazyWorkIndex(_all_records_frame(data))
# 1591:         data["all_work_index"] = all_index
# 1592:         work_index = all_index
# 1593:         work_record = work_index.get(clean_id)
# 1594:         if not work_record:
# 1595:             if hasattr(work_index, "get_normalized"):
# 1596:                 resolved_id = work_index.id_by_normalized(norm_target)
# 1597:                 work_record = work_index.get_normalized(norm_target)
# 1598:                 if work_record and resolved_id:
# 1599:                     clean_id = resolved_id
# 1600:         if not work_record:
# 1601:             parts = clean_id.replace(" ", "-").split("/")
# 1602:             tail = parts[-1] if len(parts) > 1 else clean_id
# 1603:             if tail and len(tail) >= 4 and tail.isdigit() and hasattr(work_index, "get_by_tail"):
# 1604:                 resolved_id = work_index.id_by_tail(tail)
# 1605:                 work_record = work_index.get_by_tail(tail)
# 1606:                 if work_record and resolved_id:
# 1607:                     clean_id = resolved_id
# 1608:                     
# 1609:     if not work_record:
# 1610:         raise HTTPException(status_code=404, detail=f"Work ID '{clean_id}' not found.")
# 1611:         
# 1612:     cand_dup = dup_index.get(clean_id, [])
# 1613:     # Do not mutate the cached master record: detail-only fields are attached
# 1614:     # to a shallow copy so queue responses remain compact and stable.
# 1615:     work_record = dict(work_record)
# 1616:     work_record["expenditure_trips"] = data.get("expenditure_trips_index", {}).get(clean_id, [])
# 1617:     
# 1618:     return {
# 1619:         "work": work_record,
# 1620:         "candidate_duplicates": cand_dup
# 1621:     }
# 1622: 
# 1623: @app.get("/api/work-detail")
# 1624: def _officer_issue_signals(work_record: dict) -> list[dict]:
# 1625:     """Translate existing analytical scores into review signals without changing risk math."""
# 1626:     signals = []
# 1627:     dimensions = (
# 1628:         ("financial", "Financial anomaly", "financial_risk_score", "financial_explanation", "Review financial details"),
# 1629:         ("compliance", "Compliance evidence", "compliance_risk_score", "compliance_explanation", "Verify compliance evidence"),
# 1630:         ("schedule", "Schedule / progress", "schedule_risk_score", "schedule_explanation", "Review progress evidence"),
# 1631:         ("duplicate", "Candidate duplicate", "duplicate_risk_score", "duplicate_explanation", "Review candidate"),
# 1632:     )
# 1633:     for key, label, score_field, explanation_field, action in dimensions:
# 1634:         raw_score = work_record.get(score_field)
# 1635:         try:
# 1636:             score = float(raw_score) if raw_score is not None and not pd.isna(raw_score) else 0.0
# 1637:         except (TypeError, ValueError):
# 1638:             score = 0.0
# 1639:         if score >= 35:
# 1640:             signals.append({
# 1641:                 "key": key,
# 1642:                 "label": label,
# 1643:                 "score": round(score, 1),
# 1644:                 "explanation": work_record.get(explanation_field) or f"{label} indicator is above the configured review threshold.",
# 1645:                 "recommended_action": action,
# 1646:             })
# 1647:     return sorted(signals, key=lambda signal: signal["score"], reverse=True)
# 1648: 
# 1649: 
# 1650: def _officer_filter_master(master: pd.DataFrame, state=None, constituency=None, work_status=None, severity=None, search=None):
# 1651:     """Apply dashboard filters defensively to the existing risk master."""
# 1652:     frame = master.copy()
# 1653:     if state and str(state).strip() and "state" in frame:
# 1654:         frame = frame[frame["state"].fillna("").astype(str).str.casefold().eq(str(state).strip().casefold())]
# 1655:     if constituency and str(constituency).strip() and "constituency" in frame:
# 1656:         frame = frame[frame["constituency"].fillna("").astype(str).str.casefold().eq(str(constituency).strip().casefold())]
# 1657:     if work_status and str(work_status).strip() and "work_status" in frame:
# 1658:         frame = frame[frame["work_status"].fillna("").astype(str).map(_normalize_work_status).isin(_work_status_aliases(work_status))]
# 1659:     if severity and str(severity).strip() and "overall_risk_level" in frame:
# 1660:         frame = frame[frame["overall_risk_level"].fillna("").astype(str).str.upper().eq(str(severity).strip().upper())]
# 1661:     if search and str(search).strip():
# 1662:         query = str(search).strip().casefold()
# 1663:         searchable = pd.Series("", index=frame.index, dtype=str)
# 1664:         for field in ("work_id", "description", "work_category"):
# 1665:             if field in frame:
# 1666:                 searchable = searchable + " " + frame[field].fillna("").astype(str)
# 1667:         frame = frame[searchable.str.casefold().str.contains(query, regex=False)]
# 1668:     return frame
# 1669: 
# 1670: 
# 1671: def _officer_score_count(frame: pd.DataFrame, field: str, threshold: float = 35) -> int:
# 1672:     if field not in frame:
# 1673:         return 0
# 1674:     return int(pd.to_numeric(frame[field], errors="coerce").fillna(0).ge(threshold).sum())
# 1675: 
# 1676: 
# 1677: def _officer_evidence_for_work(work_id: str) -> tuple[list[dict], list[dict]]:
# 1678:     """Read the existing citizen/attendance stores for the same complete Work ID."""
# 1679:     clean_id = str(work_id or "").strip()
# 1680:     citizen = [clean_record_for_json(record) for record in _read_citizen_evidence() if str(record.get("work_id") or "").strip() == clean_id]
# 1681:     attendance = [clean_record_for_json(record) for record in _read_attendance_records() if str(record.get("work_id") or "").strip() == clean_id]
# 1682:     return citizen, attendance
# 1683: 
# 1684: 
# 1685: @app.get("/api/officer/dashboard")
# 1686: def get_officer_dashboard(
# 1687:     state: str = None,
# 1688:     constituency: str = None,
# 1689:     work_status: str = None,
# 1690:     severity: str = None,
# 1691:     search: str = None,
# 1692:     limit: int = Query(25, ge=1, le=100),
# 1693: ):
# 1694:     """Return a read-only implementing-officer queue over existing analytical data."""
# 1695:     data = get_data()
# 1696:     master = _officer_filter_master(data["master"], state, constituency, work_status, severity, search)
# 1697:     risk_levels = master.get("overall_risk_level", pd.Series("", index=master.index)).fillna("").astype(str).str.upper()
# 1698:     priority = []
# 1699:     queue_fields = [
# 1700:         "work_id", "state", "constituency", "description", "work_status",
# 1701:         "overall_risk_level", "overall_risk_score", "composite_risk_score",
# 1702:         "financial_risk_score", "financial_explanation",
# 1703:         "compliance_risk_score", "compliance_explanation",
# 1704:         "schedule_risk_score", "schedule_explanation",
# 1705:         "duplicate_risk_score", "duplicate_explanation",
# 1706:         "recommended_reviewer_action",
# 1707:     ]
# 1708:     queue_fields = [field for field in queue_fields if field in master.columns]
# 1709:     for row in master[queue_fields].to_dict(orient="records"):
# 1710:         record = clean_record_for_json(row)
# 1711:         signals = _officer_issue_signals(record)
# 1712:         if signals or str(record.get("overall_risk_level") or "").upper() in {"MEDIUM", "HIGH", "CRITICAL"}:
# 1713:             priority.append({
# 1714:                 "work_id": record.get("work_id"),
# 1715:                 "state": record.get("state"),
# 1716:                 "constituency": record.get("constituency"),
# 1717:                 "description": record.get("description"),
# 1718:                 "work_status": record.get("work_status"),
# 1719:                 "overall_risk": record.get("overall_risk_level") or "UNASSESSED",
# 1720:                 "overall_risk_score": record.get("overall_risk_score") or record.get("composite_risk_score") or 0,
# 1721:                 "signals": signals,
# 1722:                 "why_flagged": signals[0]["explanation"] if signals else "Overall analytical risk level requires officer review.",
# 1723:                 "recommended_action": signals[0]["recommended_action"] if signals else record.get("recommended_reviewer_action") or "Review work monitoring record",
# 1724:                 "officer_review_status": "UNREVIEWED",
# 1725:             })
# 1726:     priority.sort(key=lambda row: (float(row["overall_risk_score"] or 0), max([signal["score"] for signal in row["signals"]] or [0])), reverse=True)
# 1727: 
# 1728:     states = sorted(data["master"].get("state", pd.Series(dtype=str)).dropna().astype(str).loc[lambda series: series.str.strip().ne("")].unique().tolist())
# 1729:     constituency_source = data["master"]
# 1730: @app.get("/api/officer/dashboard")
# 1731: def get_officer_dashboard(
# 1732:     state: str = None,
# 1733:     constituency: str = None,
# 1734:     work_status: str = None,
# 1735:     severity: str = None,
# 1736:     search: str = None,
# 1737:     focus: str = None,
# 1738:     limit: int = Query(25, ge=1, le=100),
# 1739: ):
# 1740:     """Return a read-only implementing-officer queue over existing analytical data."""
# 1741:     data = get_data()
# 1742:     master = _officer_filter_master(data["master"], state, constituency, work_status, severity, search)
# 1743:     risk_levels = master.get("overall_risk_level", pd.Series("", index=master.index)).fillna("").astype(str).str.upper()
# 1744:     all_citizen_records = _read_citizen_evidence()
# 1745:     all_attendance_records = _read_attendance_records()
# 1746:     master_work_keys = set(master.get("work_id", pd.Series(dtype=str)).map(_officer_work_key))
# 1747:     citizen_records = [record for record in all_citizen_records if _officer_work_key(record.get("work_id")) in master_work_keys]
# 1748:     attendance_records = [record for record in all_attendance_records if _officer_work_key(record.get("work_id")) in master_work_keys]
# 1749:     citizen_work_keys = {_officer_work_key(record.get("work_id")) for record in citizen_records}
# 1750:     attendance_work_keys = {_officer_work_key(record.get("work_id")) for record in attendance_records}
# 1751:     material_eligible = master.get("unit_price_comparison_eligible", pd.Series(False, index=master.index)).fillna(False).astype(bool) if "unit_price_comparison_eligible" in master else pd.Series(False, index=master.index)
# 1752:     material_mask = material_eligible if bool(material_eligible.any()) else pd.to_numeric(master.get("financial_risk_score", pd.Series(0, index=master.index)), errors="coerce").fillna(0).ge(35)
# 1753:     score_mask = lambda field: pd.to_numeric(master.get(field, pd.Series(0, index=master.index)), errors="coerce").fillna(0).ge(35)
# 1754:     focus_key = str(focus or "priority").strip().casefold().replace("-", "_").replace(" ", "_")
# 1755:     focus_key = {
# 1756:         "financial": "material",
# 1757:         "material_price_reviews": "material",
# 1758:         "high": "high_priority",
# 1759:         "high_risk": "high_priority",
# 1760:         "citizen_complaints": "citizen",
# 1761:     }.get(focus_key, focus_key)
# 1762:     include_all = focus_key != "priority"
# 1763:     queue_master = master
# 1764:     if focus_key == "all":
# 1765:         queue_master = master
# 1766:     elif focus_key == "high_priority":
# 1767:         queue_master = master[risk_levels.isin(["HIGH", "CRITICAL"])]
# 1768:     elif focus_key == "material":
# 1769:         queue_master = master[material_mask]
# 1770:     elif focus_key == "attendance":
# 1771:         work_keys = master.get("work_id", pd.Series("", index=master.index)).map(_officer_work_key)
# 1772:         queue_master = master[work_keys.isin(attendance_work_keys)]
# 1773:     elif focus_key == "citizen":
# 1774:         work_keys = master.get("work_id", pd.Series("", index=master.index)).map(_officer_work_key)
# 1775:         queue_master = master[work_keys.isin(citizen_work_keys)]
# 1776:     elif focus_key == "compliance":
# 1777:         queue_master = master[score_mask("compliance_risk_score")]
# 1778:     elif focus_key == "schedule":
# 1779:         queue_master = master[score_mask("schedule_risk_score")]
# 1780:     elif focus_key == "duplicate":
# 1781:         queue_master = master[score_mask("duplicate_risk_score")]
# 1782:     else:
# 1783:         focus_key = "priority"
# 1784:         include_all = False
# 1785:     priority = []
# 1786:     queue_fields = [
# 1787:         "work_id", "state", "constituency", "description", "work_status",
# 1788:         "overall_risk_level", "overall_risk_score", "composite_risk_score",
# 1789:         "financial_risk_score", "financial_explanation",
# 1790:         "compliance_risk_score", "compliance_explanation",
# 1791:         "schedule_risk_score", "schedule_explanation",
# 1792:         "duplicate_risk_score", "duplicate_explanation",
# 1793:         "recommended_reviewer_action",
# 1794:     ]
# 1795:     queue_fields = [field for field in queue_fields if field in queue_master.columns]
# 1796:     for row in queue_master[queue_fields].to_dict(orient="records"):
# 1797:         record = clean_record_for_json(row)
# 1798:         signals = _officer_issue_signals(record)
# 1799:         if include_all or signals or str(record.get("overall_risk_level") or "").upper() in {"MEDIUM", "HIGH", "CRITICAL"}:
# 1800:             focus_reason = {
# 1801:                 "all": "Included in the all-works monitoring queue.",
# 1802:                 "high_priority": "Overall analytical risk is HIGH or CRITICAL.",
# 1803:                 "material": "Material quality or price-fairness review selected.",
# 1804:                 "attendance": "Attendance evidence is linked to this Work ID.",
# 1805:                 "citizen": "Citizen evidence is linked to this Work ID.",
# 1806:                 "compliance": "Compliance risk is above the review threshold.",
# 1807:                 "schedule": "Schedule risk is above the review threshold.",
# 1808:                 "duplicate": "Duplicate-risk score is above the review threshold.",
# 1809:             }.get(focus_key, "Overall analytical risk level requires officer review.")
# 1810:             priority.append({
# 1811:                 "work_id": record.get("work_id"),
# 1812:                 "state": record.get("state"),
# 1813:                 "constituency": record.get("constituency"),
# 1814:                 "description": record.get("description"),
# 1815:                 "work_status": record.get("work_status"),
# 1816:                 "overall_risk": record.get("overall_risk_level") or "UNASSESSED",
# 1817:                 "overall_risk_score": record.get("overall_risk_score") or record.get("composite_risk_score") or 0,
# 1818:                 "signals": signals,
# 1819:                 "why_flagged": signals[0]["explanation"] if signals else focus_reason,
# 1820:                 "recommended_action": signals[0]["recommended_action"] if signals else record.get("recommended_reviewer_action") or "Review work monitoring record",
# 1821:                 "officer_review_status": "UNREVIEWED",
# 1822:             })
# 1823:     priority.sort(key=lambda row: (float(row["overall_risk_score"] or 0), max([signal["score"] for signal in row["signals"]] or [0])), reverse=True)
# 1824: 
# 1825:     states = sorted(data["master"].get("state", pd.Series(dtype=str)).dropna().astype(str).loc[lambda series: series.str.strip().ne("")].unique().tolist())
# 1826:     constituency_source = data["master"]
# 1827:     if state and str(state).strip() and "state" in constituency_source:
# 1828:         constituency_source = constituency_source[constituency_source["state"].fillna("").astype(str).str.casefold().eq(str(state).strip().casefold())]
# 1829:     constituencies = sorted(constituency_source.get("constituency", pd.Series(dtype=str)).dropna().astype(str).loc[lambda series: series.str.strip().ne("")].unique().tolist())
# 1830:     statuses = sorted(data["master"].get("work_status", pd.Series(dtype=str)).dropna().astype(str).loc[lambda series: series.str.strip().ne("")].unique().tolist())
# 1831: 
# 1832:     attendance_count = len(attendance_records)
# 1833:     citizen_count = len(citizen_records)
# 1834: 
# 1835:     return {
# 1836:         "selected_filters": {"state": state or None, "constituency": constituency or None, "work_status": work_status or None, "severity": severity or None, "search": search or None, "focus": focus_key},
# 1837:         "available": {"states": states, "constituencies": constituencies, "statuses": statuses, "severities": ["LOW", "MEDIUM", "HIGH", "CRITICAL"]},
# 1838:         "summary": {
# 1839:             "total_works": int(len(master)),
# 1840:             "high_priority_works": int(risk_levels.isin(["HIGH", "CRITICAL"]).sum()),
# 1841:             "financial_reviews": _officer_score_count(master, "financial_risk_score"),
# 1842:             "material_price_reviews": int(material_eligible.sum()) or _officer_score_count(master, "financial_risk_score"),
# 1843:             "attendance_issues": int(attendance_count),
# 1844:             "citizen_complaints": int(citizen_count),
# 1845:             "compliance_issues": _officer_score_count(master, "compliance_risk_score"),
# 1846:             "schedule_risks": _officer_score_count(master, "schedule_risk_score"),
# 1847:             "duplicate_candidates": _officer_score_count(master, "duplicate_risk_score"),
# 1848:         },
# 1849:         "data_availability": {
# 1850:             "material": {"available": True, "source": "Material Quality & Price Fairness Engine"},
# 1851:             "attendance": {"available": True, "source": "Attendance capture records", "warning": None if attendance_records else "No attendance captures are currently stored for the selected works."},
# 1852:             "citizen": {"available": True, "source": "Citizen evidence records", "warning": None if citizen_records else "No citizen evidence is currently stored for the selected works."},
# 1853:         },
# 1854:         "priority_works": priority[:limit],
# 1855:         "queue_total": int(len(queue_master)),
# 1856:         "metadata": _analytics_metadata(),
# 1857:     }
# 1858: 
# 1859: 
# 1860: @app.get("/api/officer/work")
# 2240:         "description": text("description"),
# 2241:         "work_category": text("work_category", "Unclassified"),
# 2242:         "state": text("state"),
# 2243:         "constituency": text("constituency"),
# 2244:         "mp_name": text("mp_name") or None,
# 2245:         "work_status": text("work_status", "Unknown"),
# 2246:         "sanction_amount": sanction,
# 2247:         "effective_expenditure": expenditure,
# 2248:         "recommended_date": date_value("recommended_date"),
# 2249:         "sanction_date": date_value("sanction_date"),
# 2250:         "completion_date": date_value("completion_date"),
# 2251:         "estimated_completion_date": date_value("estimated_completion_date"),
# 2252:         "progress_pct": progress,
# 2253:         "latitude": location.get("latitude"),
# 2254:         "longitude": location.get("longitude"),
# 2255:         "coordinate_source": location.get("coordinate_source"),
# 2256:         "coordinate_available": location.get("latitude") is not None and location.get("longitude") is not None,
# 2257:         "normalized_status": _normalized_citizen_work_status(text("work_status", "Unknown")),
# 2258:         "citizen_evidence_count": 0,
# 2259:     }
# 2260: 
# 2261: 
# 2262: def _citizen_work_records() -> tuple[list[dict], dict]:
# 2263:     data = get_data()
# 2264:     coordinates = _load_published_work_coordinates(data)
# 2265:     evidence = _read_citizen_evidence()
# 2266:     evidence_counts = {}
# 2267:     for record in evidence:
# 2268:         key = str(record.get("work_id") or "").strip()
# 2269:         evidence_counts[key] = evidence_counts.get(key, 0) + 1
# 2270:     base_records = data.get("citizen_public_base_records")
# 2271:     if base_records is None:
# 2272:         frame = _all_records_frame(data).copy()
# 2273:         if frame.empty:
# 2274:             return [], {}
# 2275:         # Avoid converting the analytical diagnostics columns (which include
# 2276:         # nested arrays) for a public browsing endpoint. Only the public card
# 2277:         # fields are needed here.
# 2278:         public_columns = [
# 2279:             "work_id", "description", "work_category", "state", "constituency", "mp_name",
# 2280:             "work_status", "sanction_amount", "effective_expenditure", "recommended_date",
# 2281:             "sanction_date", "completion_date", "estimated_completion_date", "expenditure_progress_pct",
# 2282:         ]
# 2283:         frame = frame[[column for column in public_columns if column in frame.columns]].copy()
# 2284:         positions = {column: index for index, column in enumerate(frame.columns)}
# 2285:         base_records = [_citizen_public_work_fast(row, positions, coordinates) for row in frame.itertuples(index=False, name=None)]
# 2286:         data["citizen_public_base_records"] = base_records
# 2287:     records = [dict(record, citizen_evidence_count=int(evidence_counts.get(record["work_id"], 0))) for record in base_records]
# 2288:     # Put works with a real published position first so the first responsive
# 2289:     # page can populate the map without loading thousands of unlocated rows.
# 2290:     records.sort(key=lambda record: (not record["coordinate_available"], record["work_id"]))
# 2291:     return records, evidence_counts
# 2292: 
# 2293: 
# 2294: def _haversine_distance_meters(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> float:
# 2295:     earth_radius_meters = 6371008.8
# 2296:     lat_a, lat_b = math.radians(latitude_a), math.radians(latitude_b)
# 2297:     delta_lat = math.radians(latitude_b - latitude_a)
# 2298:     delta_lng = math.radians(longitude_b - longitude_a)
# 2299:     haversine = math.sin(delta_lat / 2) ** 2 + math.cos(lat_a) * math.cos(lat_b) * math.sin(delta_lng / 2) ** 2
# 2300:     return earth_radius_meters * 2 * math.atan2(math.sqrt(haversine), math.sqrt(max(0, 1 - haversine)))
# 2301: 
# 2302: 
# 2303: def _parse_optional_float(value, field_name: str):
# 2304:     if value in (None, ""):
# 2305:         return None
# 2306:     try:
# 2307:         parsed = float(value)
# 2308:     except (TypeError, ValueError):
# 2309:         raise HTTPException(status_code=422, detail=f"{field_name} must be numeric.")
# 2310:     if not math.isfinite(parsed):
# 2311:         raise HTTPException(status_code=422, detail=f"{field_name} must be finite.")
# 2312:     return parsed
# 2313: 
# 2314: 
# 2315: def _detect_image_type(content: bytes) -> str | None:
# 2316:     if content.startswith(b"\xff\xd8\xff"):
# 2317:         return "jpg"
# 2318:     if content.startswith(b"\x89PNG\r\n\x1a\n"):
# 2319:         return "png"
# 2320:     if content.startswith(b"RIFF") and content[8:12] == b"WEBP":
# 2321:         return "webp"
# 2322:     return None
# 2323: 
# 2324: 
# 2325: def _record_location_status(latitude, longitude, gps_accuracy, work: dict) -> tuple[str, float | None]:
# 2326:     if latitude is None or longitude is None:
# 2327:         return "LOCATION_NOT_AVAILABLE", None
# 2328:     if gps_accuracy is not None and gps_accuracy > CITIZEN_GPS_ACCURACY_THRESHOLD_METERS:
# 2329:         return "LOW_GPS_ACCURACY", None
# 2330:     work_latitude = work.get("latitude")
# 2331:     work_longitude = work.get("longitude")
# 2332:     if work_latitude is None or work_longitude is None:
# 2333:         return "LOCATION_NOT_AVAILABLE", None
# 2334:     distance = _haversine_distance_meters(float(latitude), float(longitude), float(work_latitude), float(work_longitude))
# 2335:     return (
# 2336:         "WITHIN_EXPECTED_RADIUS" if distance <= CITIZEN_ALLOWED_EVIDENCE_RADIUS_METERS else "OUTSIDE_EXPECTED_RADIUS",
# 2337:         distance,
# 2338:     )
# 2339: 
# 2340: 
# 2341: def _enforce_citizen_rate_limit(request: Request) -> None:
# 2342:     key = request.client.host if request.client else "unknown"
# 2343:     now = datetime.now().astimezone()
# 2344:     with _CITIZEN_STORE_LOCK:
# 2345:         recent = [stamp for stamp in _CITIZEN_RATE_LIMIT.get(key, []) if (now - stamp).total_seconds() < 3600]
# 2346:         if len(recent) >= 5:
# 2347:             raise HTTPException(status_code=429, detail="Submission limit reached. Please try again later.")
# 2348:         recent.append(now)
# 2349:         _CITIZEN_RATE_LIMIT[key] = recent
# 2350:     return parsed
# 2351: 
# 2352: 
# 2353: def _detect_image_type(content: bytes) -> str | None:
# 2354:     if content.startswith(b"\xff\xd8\xff"):
# 2355:         return "jpg"
# 2356:     if content.startswith(b"\x89PNG\r\n\x1a\n"):
# 2357:         return "png"
# 2358:     if content.startswith(b"RIFF") and content[8:12] == b"WEBP":
# 2359:         return "webp"
# 2360:     return None
# 2361: 
# 2362: 
# 2363: def _record_location_status(latitude, longitude, gps_accuracy, work: dict) -> tuple[str, float | None]:
# 2364:     if latitude is None or longitude is None:
# 2365:         return "LOCATION_NOT_AVAILABLE", None
# 2366:     if gps_accuracy is not None and gps_accuracy > CITIZEN_GPS_ACCURACY_THRESHOLD_METERS:
# 2367:         return "LOW_GPS_ACCURACY", None
# 2368:     work_latitude = work.get("latitude")
# 2369:     work_longitude = work.get("longitude")
# 2370:     if work_latitude is None or work_longitude is None:
# 2371:         return "LOCATION_NOT_AVAILABLE", None
# 2372:     distance = _haversine_distance_meters(float(latitude), float(longitude), float(work_latitude), float(work_longitude))
# 2373:     return (
# 2374:         "WITHIN_EXPECTED_RADIUS" if distance <= CITIZEN_ALLOWED_EVIDENCE_RADIUS_METERS else "OUTSIDE_EXPECTED_RADIUS",
# 2375:         distance,
# 2376:     )
# 2377: 
# 2378: 
# 2379: def _enforce_citizen_rate_limit(request: Request) -> None:
# 2380:     key = request.client.host if request.client else "unknown"
# 2381:     now = datetime.now().astimezone()
# 2382:     with _CITIZEN_STORE_LOCK:
# 2383:         recent = [stamp for stamp in _CITIZEN_RATE_LIMIT.get(key, []) if (now - stamp).total_seconds() < 3600]
# 2384:         if len(recent) >= 5:
# 2385:             raise HTTPException(status_code=429, detail="Submission limit reached. Please try again later.")
# 2386:         recent.append(now)
# 2387:         _CITIZEN_RATE_LIMIT[key] = recent
# 2388: 
# 2389: 
# 2390: def _require_citizen_officer(request: Request) -> str:
# 2391:     authorization = request.headers.get("authorization", "")
# 2392:     if CITIZEN_REVIEW_TOKEN and secrets.compare_digest(authorization, f"Bearer {CITIZEN_REVIEW_TOKEN}"):
# 2393:         return "configured_officer"
# 2394:     if CITIZEN_ALLOW_LOCAL_OFFICER_REVIEW and request.headers.get("x-mplads-role", "").casefold() == "officer":
# 2395:         return "local_officer"
# 2396:     raise HTTPException(status_code=403, detail="Officer authorization is required to update evidence review status.")
# 2397: 
# 2398: 
# 2399: @app.get("/api/citizen/works")
# 2400: def get_citizen_works(
# 2401:         "total": total,
# 2402:         "page": page,
# 2403:         "limit": limit,
# 2404:         "total_pages": int(math.ceil(total / limit)) if total else 0,
# 2405:         "records": records[start:end],
# 2406:         "stats": {
# 2407:             "total_works": len(all_public_records),
# 2408:             "ongoing_works": normalized_statuses.count("ONGOING"),
# 2409:             "completed_works": normalized_statuses.count("COMPLETED"),
# 2410:             "works_with_coordinates": sum(1 for record in all_public_records if record["coordinate_available"]),
# 2411:             "citizen_evidence": len(_read_citizen_evidence()),
# 2412:             "categories": available_categories,
# 2413:         },
# 2414:         "config": _citizen_config(),
# 2415:     }
# 2416: 
# 2417: 
# 2418: @app.get("/api/citizen/works/{work_id:path}")
# 2419: def get_citizen_work(work_id: str):
# 2420:     if latitude is not None or longitude is not None:
# 2421:         if latitude is None or longitude is None:
# 2422:             raise HTTPException(status_code=422, detail="latitude and longitude are both required for nearby search.")
# 2423:         radius = nearby_radius_meters or CITIZEN_ALLOWED_EVIDENCE_RADIUS_METERS
# 2424:         nearby = []
# 2425:         for record in records:
# 2426:             if record["latitude"] is None or record["longitude"] is None:
# 2427:                 continue
# 2428:             record = dict(record)
# 2429:             record["distance_from_you_meters"] = _haversine_distance_meters(latitude, longitude, record["latitude"], record["longitude"])
# 2430:             if record["distance_from_you_meters"] <= radius:
# 2431:                 nearby.append(record)
# 2432:         records = sorted(nearby, key=lambda record: record["distance_from_you_meters"])
# 2433: 
# 2434:     total = len(records)
# 2435:     start, end = (page - 1) * limit, page * limit
# 2436:     normalized_statuses = [record["normalized_status"] for record in all_public_records]
# 2437:     available_categories = sorted({record["work_category"] for record in all_public_records if record.get("work_category")})
# 2438:     return {
# 2439:         "total": total,
# 2440:         "page": page,
# 2441:         "limit": limit,
# 2442:         "total_pages": int(math.ceil(total / limit)) if total else 0,
# 2443:         "records": records[start:end],
# 2444:         "stats": {
# 2445:             "total_works": len(all_public_records),
# 2446:             "ongoing_works": normalized_statuses.count("ONGOING"),
# 2447:             "completed_works": normalized_statuses.count("COMPLETED"),
# 2448:             "works_with_coordinates": sum(1 for record in all_public_records if record["coordinate_available"]),
# 2449:             "citizen_evidence": len(_read_citizen_evidence()),
# 2450:             "categories": available_categories,
# 2451:         },
# 2452:         "config": _citizen_config(),
# 2453:     }
# 2454: 
# 2455: 
# 2456: @app.get("/api/citizen/works/{work_id:path}")
# 2457: def get_citizen_work(work_id: str):
# 2458:     requested_work_id = work_id.strip()
# 2459:     records, _ = _citizen_work_records()
# 2460:     record = next((item for item in records if item["work_id"] == requested_work_id), None)
# 2461:     if not record:
# 2462:         raise HTTPException(status_code=404, detail="The requested work was not found in the public register.")
# 2463:     return record
# 2464: 
# 2465: 
# 2466: @app.get("/api/citizen-evidence/stats")
# 2467: def get_citizen_evidence_stats():
# 2468:     records = _read_citizen_evidence()
# 2469:     now = datetime.now().astimezone()
# 2470:     today = now.date()
# 2471:     week_start = today.fromordinal(today.toordinal() - today.weekday())
# 2472:     categories = {}
# 2473:     stats = {
# 2474:         "total_submissions": len(records),
# 2475:         "submitted_today": 0,
# 2476:         "submitted_this_week": 0,
# 2477:         "within_expected_radius": 0,
# 2478:         "needs_review": 0,
# 2479:         "outside_expected_radius": 0,
# 2480:         "categories": categories,
# 2481:     }
# 2482:     for record in records:
# 2483:         categories[record.get("category", "Other")] = categories.get(record.get("category", "Other"), 0) + 1
# 2484:         uploaded = str(record.get("uploaded_at") or "")
# 2485:         try:
# 2490:     return {"total": total, "page": page, "limit": limit, "total_pages": int(math.ceil(total / limit)) if total else 0, "records": records[start:end]}
# 2491: 
# 2492: 
# 2493: @app.post("/api/citizen-evidence")
# 2494: async def create_citizen_evidence(
# 2495:     request: Request,
# 2496:     work_id: str = Form(..., min_length=1, max_length=160),
# 2497:     category: str = Form(..., min_length=1, max_length=100),
# 2498:     description: str = Form(..., min_length=1, max_length=4000),
# 2499:     latitude: str = Form(None),
# 2500:     longitude: str = Form(None),
# 2501:     gps_accuracy: str = Form(None),
# 2502:     captured_at: str = Form(None),
# 2503:     live_capture: str = Form("false"),
# 2504:     image: UploadFile = File(...),
# 2505: ):
# 2506:     _enforce_citizen_rate_limit(request)
# 2507:     category = category.strip()
# 2508:     if category not in CITIZEN_EVIDENCE_CATEGORIES:
# 2509:         raise HTTPException(status_code=422, detail="Choose a supported observation category.")
# 2510:     description = description.strip()
# 2511:     if len(description) < 10:
# 2512:         raise HTTPException(status_code=422, detail="Please describe what you personally observed in at least 10 characters.")
# 2513:     data = get_data()
# 2514:     works, _ = _citizen_work_records()
# 2515:     work = next((record for record in works if record["work_id"] == work_id.strip()), None)
# 2516:     if not work:
# 2517:         raise HTTPException(status_code=404, detail="The selected work no longer exists in the public work register.")
# 2518:     parsed_latitude = _parse_optional_float(latitude, "latitude")
# 2519:     parsed_longitude = _parse_optional_float(longitude, "longitude")
# 2520:     parsed_accuracy = _parse_optional_float(gps_accuracy, "gps_accuracy")
# 2521:     if parsed_latitude is not None and not -90 <= parsed_latitude <= 90:
# 2522:         raise HTTPException(status_code=422, detail="latitude is outside the valid range.")
# 2523:     if parsed_longitude is not None and not -180 <= parsed_longitude <= 180:
# 2524:         raise HTTPException(status_code=422, detail="longitude is outside the valid range.")
# 2525:         records.sort(key=lambda record: str(record.get("uploaded_at") or ""), reverse=True)
# 2526:     total = len(records)
# 2527:     start, end = (page - 1) * limit, page * limit
# 2528:     return {"total": total, "page": page, "limit": limit, "total_pages": int(math.ceil(total / limit)) if total else 0, "records": records[start:end]}
# 2529: 
# 2530: 
# 2531: @app.post("/api/citizen-evidence")
# 2532: async def create_citizen_evidence(
# 2533:     request: Request,
# 2534:     work_id: str = Form(..., min_length=1, max_length=160),
# 2535:     category: str = Form(..., min_length=1, max_length=100),
# 2536:     description: str = Form(..., min_length=1, max_length=4000),
# 2537:     latitude: str = Form(None),
# 2538:     longitude: str = Form(None),
# 2539:     gps_accuracy: str = Form(None),
# 2540:     captured_at: str = Form(None),
# 2541:     live_capture: str = Form("false"),
# 2542:     image: UploadFile = File(...),
# 2543: ):
# 2544:     _enforce_citizen_rate_limit(request)
# 2545:     category = category.strip()
# 2546:     if category not in CITIZEN_EVIDENCE_CATEGORIES:
# 2547:         raise HTTPException(status_code=422, detail="Choose a supported observation category.")
# 2548:     description = description.strip()
# 2549:     if len(description) < 10:
# 2550:         raise HTTPException(status_code=422, detail="Please describe what you personally observed in at least 10 characters.")
# 2551:     data = get_data()
# 2552:     works, _ = _citizen_work_records()
# 2553:     work = next((record for record in works if record["work_id"] == work_id.strip()), None)
# 2554:     if not work:
# 2555:         raise HTTPException(status_code=404, detail="The selected work no longer exists in the public work register.")
# 2556:     parsed_latitude = _parse_optional_float(latitude, "latitude")
# 2557:     parsed_longitude = _parse_optional_float(longitude, "longitude")
# 2558:     parsed_accuracy = _parse_optional_float(gps_accuracy, "gps_accuracy")
# 2559:     if parsed_latitude is not None and not -90 <= parsed_latitude <= 90:
# 2560:         raise HTTPException(status_code=422, detail="latitude is outside the valid range.")
# 2561:     if parsed_longitude is not None and not -180 <= parsed_longitude <= 180:
# 2562:         raise HTTPException(status_code=422, detail="longitude is outside the valid range.")
# 2563:     is_live_capture = str(live_capture).strip().lower() in {"true", "1", "yes"}
# 2564:     if not is_live_capture:
# 2565:         raise HTTPException(status_code=422, detail="Citizen proof accepts live camera captures only; local uploads are not accepted.")
# 2566:     if parsed_latitude is None or parsed_longitude is None or parsed_accuracy is None:
# 2567:         raise HTTPException(status_code=422, detail="Live proof requires device latitude, longitude, and GPS accuracy.")
# 2568:     if not captured_at:
# 2569:         raise HTTPException(status_code=422, detail="Live proof requires a camera capture timestamp.")
# 2570:     try:
# 2571:         datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
# 2572:     except ValueError:
# 2573:         raise HTTPException(status_code=422, detail="captured_at must be an ISO timestamp.")
# 2574:     image_bytes = await image.read()
# 2575:     if not image_bytes:
# 2576:         raise HTTPException(status_code=422, detail="The uploaded image is empty.")
# 2577:     if len(image_bytes) > CITIZEN_MAX_UPLOAD_BYTES:
# 2578:         raise HTTPException(status_code=413, detail=f"Images must be smaller than {CITIZEN_MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
# 2579:     image_type = _detect_image_type(image_bytes)
# 2580:     if not image_type:
# 2581:         raise HTTPException(status_code=415, detail="Upload a valid JPEG, PNG, or WebP image.")
# 2582:     now = datetime.now().astimezone().isoformat()
# 2583:     location_status, distance = _record_location_status(parsed_latitude, parsed_longitude, parsed_accuracy, work)
# 2584:     content_hash = hashlib.sha256(image_bytes).hexdigest()
# 2585:     submission_id = f"CIT-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}"
# 2586:     extension = "jpg" if image_type == "jpg" else image_type
# 2587:     filename = f"{submission_id}.{extension}"
# 2588:     os.makedirs(CITIZEN_EVIDENCE_MEDIA_DIR, exist_ok=True)
# 2589:     media_path = os.path.join(CITIZEN_EVIDENCE_MEDIA_DIR, filename)
# 2590:     with open(media_path, "wb") as handle:
# 2591:         handle.write(image_bytes)
# 2592:     with _CITIZEN_STORE_LOCK:
# 2593:         existing = _read_citizen_evidence()
# 2594:         duplicate_flag = any(record.get("work_id") == work["work_id"] and record.get("image_sha256") == content_hash for record in existing)
# 2595:         record = {
# 2596:             "submission_id": submission_id,
# 2597:             "work_id": work["work_id"],
# 2598:             "category": category,
# 2599:             "description": description,
# 2600:             "image_reference": f"/api/citizen-evidence/media/{filename}",
# 2601:             "image_original_reference": f"/api/citizen-evidence/media/{filename}",
# 2602:             "image_processed_reference": None,
# 2603:             "image_sha256": content_hash,
# 2604:             "latitude": parsed_latitude,
# 2605:             "longitude": parsed_longitude,
# 2606:             "gps_accuracy": parsed_accuracy,
# 2607:             "official_work_latitude": work.get("latitude"),
# 2608:             "official_work_longitude": work.get("longitude"),
# 2609:             "distance_from_work": distance,
# 2610:             "location_validation_status": location_status,
# 2611:             "captured_at": captured_at,
# 2612:             "uploaded_at": now,
# 2613:             "server_received_at": now,
# 2614:             "live_capture": is_live_capture,
# 2615:             "review_status": "SUBMITTED",
# 2616:             "reviewed_by": None,
# 2617:             "reviewed_at": None,
# 2618:             "review_comment": None,
# 2619:             "duplicate_flag": duplicate_flag,
# 2620:             "audit_events": [{"event": "created", "at": now, "status": "SUBMITTED"}],
# 2621:             "created_at": now,
# 2622:             "updated_at": now,
# 2623:         }
# 2624:         existing.append(record)
# 2625:         _write_citizen_evidence(existing)
# 2626:     return record
# 2627: 
# 2628: 
# 2629: @app.patch("/api/citizen-evidence/{submission_id}/review")
# 2630: def review_citizen_evidence(submission_id: str, payload: CitizenEvidenceReview, request: Request):
# 2631:     reviewer = _require_citizen_officer(request)
# 2632:     valid_statuses = {"SUBMITTED", "UNDER_REVIEW", "VERIFIED", "REJECTED", "NEEDS_MORE_INFORMATION"}
# 2633:     status = payload.review_status.strip().upper()
# 2634:     if status not in valid_statuses:
# 2635:         raise HTTPException(status_code=422, detail="Unsupported evidence review status.")
# 2636: 
# 2637: def _attendance_location_status(latitude, longitude, gps_accuracy, work: dict) -> tuple[str, float | None]:
# 2638:     # Attendance requires a live device fix. The comparison against the
# 2639:     # published work coordinate remains a review signal, never an automatic
# 2640:     # rejection of a capture.
# 2641:     if latitude is None or longitude is None:
# 2642:         return "LOCATION_NOT_AVAILABLE", None
# 2643:     if gps_accuracy is not None and gps_accuracy > CITIZEN_GPS_ACCURACY_THRESHOLD_METERS:
# 2644:         return "LOW_GPS_ACCURACY", None
# 2645:     work_latitude = work.get("latitude")
# 2646:     work_longitude = work.get("longitude")
# 2647:     if work_latitude is None or work_longitude is None:
# 2648:         return "LOCATION_NOT_AVAILABLE", None
# 2649:     distance = _haversine_distance_meters(float(latitude), float(longitude), float(work_latitude), float(work_longitude))
# 2650:     return (
# 2651:         "WITHIN_EXPECTED_RADIUS" if distance <= CITIZEN_ALLOWED_EVIDENCE_RADIUS_METERS else "OUTSIDE_EXPECTED_RADIUS",
# 2652:         distance,
# 2653:     )
# 2654: 
# 2655: 
# 2656: @app.get("/api/attendance")
# 2657: def get_attendance(
# 2658:     work_id: str = None,
# 2659:     review_status: str = None,
# 2660:                 "capture_source": "LIVE_CAMERA",
# 2661:                 "camera_capture_only": True,
# 2662:                 "latitude": parsed_latitude,
# 2663:                 "longitude": parsed_longitude,
# 2664:                 "gps_accuracy": parsed_accuracy,
# 2665:                 "official_work_latitude": work.get("latitude"),
# 2666:                 "official_work_longitude": work.get("longitude"),
# 2667:                 "distance_from_work": distance,
# 2668:                 "location_validation_status": location_status,
# 2669:                 "captured_at": captured_at,
# 2670:                 "server_received_at": now,
# 2671:                 "review_status": "SUBMITTED",
# 2672:                 "reviewed_by": None,
# 2673:                 "reviewed_at": None,
# 2674:                 "review_comment": None,
# 2675:                 "duplicate_flag": duplicate_flag,
# 2676:                 "notes": description,
# 2677:                 "created_at": now,
# 2678:                 "updated_at": now,
# 2679:             }
# 2680:             existing_att = _read_attendance_records()
# 2681:             existing_att.append(att_record)
# 2682:             _write_attendance_records(existing_att)
# 2683: 
# 2684:     return record
# 2685: 
# 2686: 
# 2687: @app.patch("/api/citizen-evidence/{submission_id}/review")
# 2688: def review_citizen_evidence(submission_id: str, payload: CitizenEvidenceReview, request: Request):
# 2689:     reviewer = _require_citizen_officer(request)
# 2690:     valid_statuses = {"SUBMITTED", "UNDER_REVIEW", "VERIFIED", "REJECTED", "NEEDS_MORE_INFORMATION"}
# 2691:     status = payload.review_status.strip().upper()
# 2692:     if status not in valid_statuses:
# 2693:         raise HTTPException(status_code=422, detail="Unsupported evidence review status.")
# 2694:     now = datetime.now().astimezone().isoformat()
# 2695:     with _CITIZEN_STORE_LOCK:
# 2696:         records = _read_citizen_evidence()
# 2697:         target = next((record for record in records if record.get("submission_id") == submission_id), None)
# 2698:         if not target:
# 2699:             raise HTTPException(status_code=404, detail="Evidence submission was not found.")
# 2700:         target["review_status"] = status
# 2701:         target["reviewed_by"] = reviewer
# 2702:         target["reviewed_at"] = now
# 2703:         target["review_comment"] = payload.review_comment.strip() or None
# 2704:         target["updated_at"] = now
# 2705:         target.setdefault("audit_events", []).append({"event": "status_changed", "at": now, "status": status, "comment": target["review_comment"]})
# 2706:         _write_citizen_evidence(records)
# 2707:         return target
# 2708: 
# 2709: 
# 2710: def _read_attendance_records() -> list[dict]:
# 2711:     if not os.path.exists(ATTENDANCE_RECORDS_PATH):
# 2712:         return []
# 2713:     try:
# 2714:         with open(ATTENDANCE_RECORDS_PATH, "r", encoding="utf-8") as handle:
# 2715:             payload = json.load(handle)
# 2716:         return payload if isinstance(payload, list) else []
# 2717:     except (OSError, json.JSONDecodeError):
# 2718:         return []
# 2719: 
# 2720: 
# 2721: def _write_attendance_records(records: list[dict]) -> None:
# 2722:     temporary_path = f"{ATTENDANCE_RECORDS_PATH}.tmp"
# 2723:     with open(temporary_path, "w", encoding="utf-8") as handle:
# 2724:         json.dump(records, handle, ensure_ascii=False, indent=2)
# 2725:     os.replace(temporary_path, ATTENDANCE_RECORDS_PATH)
# 2726: 
# 2727: 
# 2728: def _attendance_work_lookup() -> dict[str, dict]:
# 2729:     records, _ = _citizen_work_records()
# 2730:     return {record["work_id"]: record for record in records}
# 2731:     if len(content) > ATTENDANCE_MAX_UPLOAD_BYTES:
# 2732:         raise HTTPException(status_code=413, detail="The attendance image is larger than the configured limit.")
# 2733:     image_type = _detect_image_type(content)
# 2734:     if image_type not in {"jpg", "png", "webp"}:
# 2735:         raise HTTPException(status_code=415, detail="Only a valid camera JPEG, PNG, or WebP image is accepted.")
# 2736: 
# 2737:     now = datetime.now().astimezone().isoformat()
# 2738:     attendance_id = f"ATT-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:10].upper()}"
# 2739:     image_hash = hashlib.sha256(content).hexdigest()
# 2740:     filename = f"{attendance_id}.{image_type}"
# 2741:     image_path = os.path.join(ATTENDANCE_MEDIA_DIR, filename)
# 2742:     location_status, distance = _attendance_location_status(latitude, longitude, gps_accuracy, work)
# 2743:     with _CITIZEN_STORE_LOCK:
# 2744:         existing = _read_attendance_records()
# 2745:         duplicate_flag = any(record.get("work_id") == clean_work_id and record.get("image_sha256") == image_hash for record in existing)
# 2746:         with open(image_path, "wb") as handle:
# 2747:             handle.write(content)
# 2748:         record = {
# 2749:             "attendance_id": attendance_id,
# 2750:             "work_id": clean_work_id,
# 2751:             "staff_count": int(staff_count),
# 2752:             "image_reference": f"/api/attendance/media/{filename}",
# 2753:             "image_sha256": image_hash,
# 2754:             "capture_source": "LIVE_CAMERA",
# 2755:             "camera_capture_only": True,
# 2756:             "latitude": float(latitude),
# 2757:             "longitude": float(longitude),
# 2758:             "gps_accuracy": float(gps_accuracy) if gps_accuracy is not None else None,
# 2759:             "official_work_latitude": work.get("latitude"),
# 2760:             "official_work_longitude": work.get("longitude"),
# 2761:             "distance_from_work": distance,
# 2762:             "location_validation_status": location_status,
# 2763:             "captured_at": captured_datetime.isoformat(),
# 2764:             "server_received_at": now,
# 2765:             "review_status": "SUBMITTED",
# 2766:             "reviewed_by": None,
# 2767:             "reviewed_at": None,
# 2768:             "review_comment": None,
# 2769:             "duplicate_flag": duplicate_flag,
# 2770:             "integrity_note": "Camera-only UI assertion with server receipt, GPS metadata, and SHA-256 image hash; officer verification remains required.",
# 2771:             "audit_events": [{"event": "created", "at": now, "status": "SUBMITTED", "source": "LIVE_CAMERA"}],
# 2772:             "created_at": now,
# 2773:             "updated_at": now,
# 2774:         }
# 2775:         existing.append(record)
# 2776:         _write_attendance_records(existing)
# 2777:     return record
# 2778: 
# 2779: if __name__ == "__main__":
# 2780:     import uvicorn
