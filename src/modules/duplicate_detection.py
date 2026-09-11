"""Evidence-weighted duplicate and artificial-splitting detection.

The detector keeps the raw descriptions for audit detail, but its matching
identity is built from meaningful tokens and structured evidence. Generic
government-work words are excluded from the identity, while identifiers such
as ``MSME-A``, ``Road-5`` and ``Phase-II`` remain distinct.
"""

import json
import os
import re
from decimal import Decimal, InvalidOperation

import numpy as np
import pandas as pd

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    HAS_SKLEARN = True
except Exception:
    HAS_SKLEARN = False


GENERIC_WORDS = {
    "a", "an", "and", "at", "by", "for", "from", "in", "near", "of", "on", "or", "the", "to", "with",
    "construction", "construct", "development", "develop", "installation", "install", "improvement", "improve",
    "providing", "provide", "electrical", "civil", "work", "works", "supply", "supplied", "repair", "repairing",
    "renovation", "renovate", "infrastructure", "building", "build", "project", "scheme", "provision", "necessary",
    "various", "other", "miscellaneous", "under", "including", "completion", "complete", "continue", "continued",
}
GENERIC_DOCUMENT_TEXT = {
    "as per attachment", "as per attached", "as per estimate", "as per proposal", "as per details", "same as attachment",
}
TOKEN_RE = re.compile(r"\d+(?:,\d{3})*(?:\.\d+)?|[a-z]+(?:-[a-z0-9]+)*")
NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
    "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "twenty": 20, "thirty": 30, "forty": 40,
    "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
}
QUANTITY_UNITS = {
    "piece": "count", "pieces": "count", "pc": "count", "pcs": "count", "no": "count", "nos": "count",
    "number": "count", "numbers": "count", "unit": "count", "units": "count", "item": "count", "items": "count",
    "light": "count", "lights": "count", "pole": "count", "poles": "count", "mast": "count", "masts": "count",
    "bench": "count", "benches": "count", "tank": "count", "tanks": "count", "room": "count", "rooms": "count",
    "building": "count", "buildings": "count", "structure": "count", "structures": "count", "bridge": "count", "bridges": "count",
    "road": "count", "roads": "count", "km": "length_m", "kms": "length_m", "kilometer": "length_m", "kilometers": "length_m",
    "kilometre": "length_m", "kilometres": "length_m", "m": "length_m", "meter": "length_m", "meters": "length_m",
    "metre": "length_m", "metres": "length_m", "cm": "length_m", "ft": "length_m", "feet": "length_m",
    "sqm": "area_m2", "acre": "area_m2", "acres": "area_m2", "hectare": "area_m2", "hectares": "area_m2",
    "sqft": "area_m2", "kg": "weight_kg", "kgs": "weight_kg", "ton": "weight_kg", "tons": "weight_kg",
    "litre": "volume_l", "litres": "volume_l", "liter": "volume_l", "liters": "volume_l",
}
UNIT_MULTIPLIERS = {
    "km": 1000, "kms": 1000, "kilometer": 1000, "kilometers": 1000, "kilometre": 1000, "kilometres": 1000,
    "cm": 0.01, "ft": 0.3048, "feet": 0.3048, "acre": 4046.8564224, "acres": 4046.8564224,
    "hectare": 10000, "hectares": 10000, "sqft": 0.092903, "kg": 1, "kgs": 1, "ton": 1000, "tons": 1000,
    "litre": 1, "litres": 1, "liter": 1, "liters": 1,
}


def _not_blank(value):
    if value is None:
        return False
    try:
        if pd.isna(value):
            return False
    except (TypeError, ValueError):
        pass
    return bool(str(value).strip())


def normalize_description(text):
    if not _not_blank(text):
        return ""
    value = re.sub(r"ws/mp[a-z0-9/\-_]+", " ", str(text).lower())
    return " ".join(value.split())


def is_generic_description(text):
    return normalize_description(text).strip(" .") in GENERIC_DOCUMENT_TEXT or not normalize_description(text)


def _tokens(text):
    return TOKEN_RE.findall(normalize_description(text))


def meaningful_tokens(text):
    """Keep asset names, locations and identifiers; downweight boilerplate."""
    return [token for token in _tokens(text) if token not in GENERIC_WORDS]


def meaningful_description(text):
    return " ".join(meaningful_tokens(text))


def _number(token):
    if token in NUMBER_WORDS:
        return float(NUMBER_WORDS[token])
    try:
        return float(Decimal(token.replace(",", "")))
    except (InvalidOperation, ValueError):
        return None


def extract_quantity_signature(text):
    """Extract explicit physical quantities without treating IDs/phones as quantities."""
    tokens = _tokens(text)
    quantities = []
    for index, token in enumerate(tokens):
        value = _number(token)
        if value is None or (1900 <= value <= 2100 and value.is_integer()):
            continue
        if index + 1 >= len(tokens):
            continue
        next_token = tokens[index + 1]
        unit = QUANTITY_UNITS.get(next_token)
        multiplier = UNIT_MULTIPLIERS.get(next_token, 1.0)
        if next_token == "square" and index + 2 < len(tokens):
            next_token = f"sq{tokens[index + 2]}"
            unit = "area_m2" if next_token in {"sqft", "sqm"} else None
            multiplier = UNIT_MULTIPLIERS.get(next_token, 1.0)
        if unit:
            quantities.append((unit, round(value * multiplier, 6)))
    return tuple(sorted(set(quantities)))


def quantity_text(signature):
    return "; ".join(f"{unit}={value:g}" for unit, value in signature)


def _quantity_relation(left, right):
    if not left or not right:
        return "MISSING_QUANTITY"
    left_map, right_map = dict(left), dict(right)
    if left_map == right_map:
        return "MATCH"
    common = set(left_map) & set(right_map)
    if common and all(abs(left_map[key] - right_map[key]) / max(left_map[key], right_map[key], 1) <= 0.10 for key in common):
        return "APPROXIMATE_MATCH"
    if common:
        return "RELATED_DIFFERENT_QUANTITY"
    return "DIFFERENT_UNITS"


ROMAN_RE = re.compile(r"^[ivxcdm]+$")


def _technical_tokens(tokens):
    if isinstance(tokens, str):
        tokens = meaningful_tokens(tokens)
    tech = set()
    for i, token in enumerate(tokens):
        if "-" in token:
            parts = token.split("-")
            if len(parts) == 2 and (parts[1].isdigit() or ROMAN_RE.match(parts[1]) or (len(parts[1]) <= 3 and parts[1].isalpha())):
                tech.add(token)
                tech.add(f"base:{parts[0]}")
        elif token in {"phase", "block", "road", "building", "ward", "sector", "part", "unit", "no", "stage"}:
            if i + 1 < len(tokens):
                nxt = tokens[i + 1]
                if nxt.isdigit() or ROMAN_RE.match(nxt) or (len(nxt) <= 3 and nxt.isalpha()):
                    tech.add(f"{token}-{nxt}")
                    tech.add(f"base:{token}")
        elif any(char.isdigit() for char in token) and any(char.isalpha() for char in token) and len(token) <= 8:
            tech.add(token)
    return tech


def _has_technical_conflict(left_tokens, right_tokens, left_tech, right_tech):
    """Ensure distinct assets like MSME vs MSME-A or Road 5 vs Road 6 are not conflated."""
    for tech in left_tech:
        if tech.startswith("base:"):
            base = tech.split(":", 1)[1]
            if base in right_tokens and not any(t.startswith(f"{base}-") for t in right_tokens):
                return True
    for tech in right_tech:
        if tech.startswith("base:"):
            base = tech.split(":", 1)[1]
            if base in left_tokens and not any(t.startswith(f"{base}-") for t in left_tokens):
                return True
    left_bases = {t.split(":", 1)[1] for t in left_tech if t.startswith("base:")}
    right_bases = {t.split(":", 1)[1] for t in right_tech if t.startswith("base:")}
    for base in (left_bases & right_bases):
        left_sub = {t for t in left_tech if t.startswith(f"{base}-")}
        right_sub = {t for t in right_tech if t.startswith(f"{base}-")}
        if left_sub and right_sub and left_sub.isdisjoint(right_sub):
            return True
    left_pure = {t for t in left_tech if not t.startswith("base:")}
    right_pure = {t for t in right_tech if not t.startswith("base:")}
    if left_pure and right_pure and left_pure.isdisjoint(right_pure):
        return True
    return False


def _comparison_identity(work_id):
    value = str(work_id or "").strip()
    return re.sub(r"/(?:REC|SANC|RECOMMENDED|SANCTIONED)(?=/|$)", "", value, flags=re.IGNORECASE)


def _preferred_description(recommended, sanctioned):
    for value in (recommended, sanctioned):
        if _not_blank(value) and not is_generic_description(value):
            return str(value).strip()
    return ""


def _load_comparison_corpus(processed_dir):
    parts = []
    source_map = {}
    for source, filename in (("recommended", "t3_works_recommended.parquet"), ("sanctioned", "t4_works_sanctioned.parquet")):
        path = os.path.join(processed_dir, filename)
        if not os.path.exists(path):
            continue
        frame = pd.read_parquet(path).copy()
        if "work_id" not in frame.columns:
            continue
        frame["work_id"] = frame["work_id"].fillna("").astype(str).str.strip()
        frame = frame[frame["work_id"].ne("")]
        fields = ["description", "state", "constituency", "mp_name", "work_category", "sanction_amount", "sanction_date", "work_status", "recommended_amount", "recommended_date", "IDA"]
        for field in fields:
            if field not in frame.columns:
                frame[field] = np.nan if field.endswith(("_amount", "_date")) else ""
        frame["comparison_identity"] = frame["work_id"].map(_comparison_identity)
        frame = frame.drop_duplicates("comparison_identity", keep="first").set_index("comparison_identity")
        source_map[source] = frame

    if not source_map:
        return pd.DataFrame()
    identities = pd.Index(dict.fromkeys(index for frame in source_map.values() for index in frame.index), name="comparison_identity")
    result = pd.DataFrame(index=identities)

    def stage(source, field, default=""):
        frame = source_map.get(source)
        if frame is None or field not in frame.columns:
            return pd.Series(default, index=identities)
        return frame[field].reindex(identities).fillna(default)

    rec_id, sanc_id = stage("recommended", "work_id"), stage("sanctioned", "work_id")
    rec_desc, sanc_desc = stage("recommended", "description"), stage("sanctioned", "description")
    result["recommended_description"], result["sanctioned_description"] = rec_desc, sanc_desc
    result["similarity_description"] = [_preferred_description(a, b) for a, b in zip(rec_desc, sanc_desc)]
    result["recommended_work_id"], result["sanctioned_work_id"] = rec_id, sanc_id
    result["work_id"] = sanc_id.where(sanc_id.astype(str).str.strip().ne(""), rec_id)
    result["description"] = result["similarity_description"]
    has_sanc = sanc_id.astype(str).str.strip().ne("")
    for field in ("state", "constituency", "mp_name", "work_category", "sanction_amount", "sanction_date", "work_status", "IDA"):
        sanc = stage("sanctioned", field, np.nan if field.endswith(("_amount", "_date")) else "")
        rec = stage("recommended", field, np.nan if field.endswith(("_amount", "_date")) else "")
        valid = sanc.notna() if field.endswith(("_amount", "_date")) else sanc.astype(str).str.strip().ne("")
        result[field] = sanc.where(valid, rec)
    for field in ("recommended_amount", "recommended_date"):
        rec, sanc = stage("recommended", field, np.nan), stage("sanctioned", field, np.nan)
        result[field] = rec.where(rec.notna(), sanc)
    result["comparison_source"] = np.select([rec_id.astype(str).str.strip().ne("") & has_sanc, rec_id.astype(str).str.strip().ne(""), has_sanc], ["recommended+sanctioned", "recommended", "sanctioned"], default="")
    return result.reset_index()


def _numeric_id(value):
    hits = re.findall(r"\d+", str(value))
    return int(hits[-1]) if hits else None


def _date_gap(a, b):
    left, right = a, b
    if not isinstance(left, (pd.Timestamp, type(pd.NaT))):
        left = pd.to_datetime(left, errors="coerce")
    if not isinstance(right, (pd.Timestamp, type(pd.NaT))):
        right = pd.to_datetime(right, errors="coerce")
    return abs((left - right).days) if pd.notna(left) and pd.notna(right) else None


def _money(value):
    return "" if pd.isna(value) else f"₹{float(value):,.0f}"


def _friendly_indicator(value):
    return {
        "related quantities": "related quantities",
        "close work IDs": "closely numbered records",
        "nearby work IDs": "nearby record numbers",
        "same recommended date": "the same recommendation date",
        "close recommended dates": "recommendation dates recorded close together",
        "same sanctioned date": "the same sanction date",
        "close sanctioned dates": "sanction dates recorded close together",
        "closely related costs": "closely related recorded costs",
        "mathematically divided costs": "recorded costs that may represent portions of a larger scope",
        "shared asset or location terms": "shared asset or location wording",
    }.get(value, value)


def _pair_explanation(row):
    left_id, right_id = row.get("work_id_1", "the first work"), row.get("work_id_2", "the second work")
    indicators = [_friendly_indicator(item) for item in row.get("key_indicators", [])]
    indicator_text = ", ".join(dict.fromkeys(indicators))
    relationship = f"The records for {left_id} and {right_id} use closely related project details"
    if indicator_text:
        relationship += f", including {indicator_text}"
    relationship += "."
    if row.get("possible_split_work"):
        return relationship + " Their separate records may represent portions of a larger project, so the physical scope and implementing arrangements should be checked before treating them as independent works."
    return relationship + " The records should be checked to confirm that they refer to separate physical scopes rather than overlapping entries."


def _pair_candidate(left, right, similarity):
    left_tokens, right_tokens = left.get("meaningful_tokens", []), right.get("meaningful_tokens", [])
    left_set, right_set = set(left_tokens), set(right_tokens)
    if _has_technical_conflict(left_tokens, right_tokens, left.get("technical_tokens", set()), right.get("technical_tokens", set())):
        return None
    quantity_relation = _quantity_relation(left["quantity_signature_data"], right["quantity_signature_data"])
    id_left, id_right = left.get("numeric_id"), right.get("numeric_id")
    id_distance = abs(id_left - id_right) if id_left is not None and id_right is not None else None
    rec_gap, sanc_gap = _date_gap(left.get("recommended_dt"), right.get("recommended_dt")), _date_gap(left.get("sanction_dt"), right.get("sanction_dt"))
    amount_left, amount_right = left.get("amount_numeric", np.nan), right.get("amount_numeric", np.nan)
    amount_ratio = min(amount_left, amount_right) / max(amount_left, amount_right) if pd.notna(amount_left) and pd.notna(amount_right) and max(amount_left, amount_right) > 0 else np.nan

    supports = []
    if quantity_relation in {"MATCH", "APPROXIMATE_MATCH", "RELATED_DIFFERENT_QUANTITY"}:
        supports.append("related quantities")
    if id_distance is not None and id_distance <= 10:
        supports.append("close work IDs")
    elif id_distance is not None and id_distance <= 50:
        supports.append("nearby work IDs")
    if rec_gap == 0:
        supports.append("same recommended date")
    elif rec_gap is not None and rec_gap <= 30:
        supports.append("close recommended dates")
    if sanc_gap == 0:
        supports.append("same sanctioned date")
    elif sanc_gap is not None and sanc_gap <= 30:
        supports.append("close sanctioned dates")
    if pd.notna(amount_ratio):
        if amount_ratio >= 0.85:
            supports.append("closely related costs")
        elif 0.30 <= amount_ratio <= 0.55:
            supports.append("mathematically divided costs")
    if len(left_set & right_set) >= 2:
        supports.append("shared asset or location terms")

    same_meaningful = left["meaningful_description"] == right["meaningful_description"] and bool(left["meaningful_description"])
    if similarity < 0.72 or not supports:
        return None
    score = min(100.0, similarity * 42 + min(len(supports), 4) * 10 + (10 if same_meaningful else 0) + (8 if quantity_relation == "MATCH" else 0))
    possible_split = bool((same_meaningful or similarity >= 0.88) and len(supports) >= 2 and ((id_distance is not None and id_distance <= 10) or rec_gap == 0 or sanc_gap == 0))
    what_happened = _pair_explanation({
        "work_id_1": left["work_id"], "work_id_2": right["work_id"],
        "key_indicators": supports, "possible_split_work": possible_split,
    })
    why_it_matters = (
        "Separate scope, quantity, location, and implementing-agency records should be verified so that one physical project is not recorded more than once or divided across related entries."
        if possible_split else
        "The related descriptions warrant a record-level check to confirm that expenditure is attached to distinct physical works."
    )
    supporting_details = "; ".join(_friendly_indicator(item) for item in supports) or "Related description wording"
    if pd.notna(amount_left) and pd.notna(amount_right):
        supporting_details += f"; recorded costs: {_money(amount_left)} and {_money(amount_right)}"
    if rec_gap is not None:
        supporting_details += f"; recommendation dates {rec_gap} day(s) apart"
    if sanc_gap is not None:
        supporting_details += f"; sanction dates {sanc_gap} day(s) apart"
    return {
        "work_id_1": left["work_id"], "work_id_2": right["work_id"], "state": left.get("state", ""), "constituency": left.get("constituency", ""),
        "sector": left.get("main_sector", left.get("work_category", "")), "work_type": left.get("effective_work_category", left.get("work_category", "")),
        "similarity_score": round(score, 1), "content_similarity": round(similarity * 100, 1),
        "sanction_amount_1": amount_left, "sanction_amount_2": amount_right,
        "recommended_date_1": left.get("recommended_date"), "recommended_date_2": right.get("recommended_date"),
        "sanction_date_1": left.get("sanction_date"), "sanction_date_2": right.get("sanction_date"),
        "quantity_signature_1": quantity_text(left["quantity_signature_data"]), "quantity_signature_2": quantity_text(right["quantity_signature_data"]),
        "quantity_relation": quantity_relation, "work_id_numeric_distance": id_distance, "recommended_date_gap_days": rec_gap,
        "sanctioned_date_gap_days": sanc_gap, "amount_ratio": amount_ratio, "same_meaningful_description": same_meaningful,
        "possible_split_work": possible_split, "split_work_investigation": possible_split, "key_indicators": supports,
        "duplicate_what_happened": what_happened, "duplicate_why_it_matters": why_it_matters,
        "duplicate_supporting_details": supporting_details, "nlp_explanation": f"{what_happened} {why_it_matters}",
    }


def _connected_components(pairs):
    parent = {}

    def find(value):
        parent.setdefault(value, value)
        while parent[value] != value:
            parent[value] = parent[parent[value]]
            value = parent[value]
        return value

    def union(left, right):
        root_left, root_right = find(left), find(right)
        if root_left != root_right:
            parent[root_right] = root_left

    for pair in pairs:
        union(pair["work_id_1"], pair["work_id_2"])
    components = {}
    for value in parent:
        components.setdefault(find(value), []).append(value)
    return [sorted(values) for values in components.values() if len(values) >= 2]


def _cluster_output(cluster_number, ids, lookup, pairs):
    records = [lookup[work_id] for work_id in ids if work_id in lookup]
    cluster_pairs = [pair for pair in pairs if pair["work_id_1"] in ids and pair["work_id_2"] in ids]
    scores = [pair["similarity_score"] for pair in cluster_pairs]
    split_pairs = [pair for pair in cluster_pairs if pair["possible_split_work"]]
    risk_score = max(scores or [0])

    total_cost = 0.0
    total_recommended = 0.0
    for record in records:
        value = record.get("amount_numeric", np.nan)
        if pd.notna(value):
            total_cost += float(value)
        recommended_value = pd.to_numeric(record.get("recommended_amount"), errors="coerce")
        if pd.notna(recommended_value) and recommended_value > 0:
            total_recommended += float(recommended_value)

    indicators = []
    for pair in cluster_pairs:
        indicators.extend(pair.get("key_indicators", []))
    indicators = list(dict.fromkeys(indicators))

    # Implementing authority distribution (Sections 8 & 29)
    idas = {str(r.get("IDA") or "").strip() for r in records if str(r.get("IDA") or "").strip()}
    if len(idas) > 1:
            indicators.append("separate implementing assignments")

    # Mathematical financial splitting detection (Sections 7, 20, 28)
    amounts = [float(r["amount_numeric"]) for r in records if pd.notna(r.get("amount_numeric")) and float(r["amount_numeric"]) > 0]
    is_cost_split = False
    if len(amounts) >= 2:
        sorted_amts = sorted(amounts, reverse=True)
        largest = sorted_amts[0]
        smaller = sorted_amts[1:]
        if len(smaller) >= 2 and largest > 0 and abs(sum(smaller) - largest) / largest <= 0.15:
            is_cost_split = True
            indicators.append("recorded costs may represent portions of a larger scope")
        elif all(abs(a - sum(amounts) / len(amounts)) / (sum(amounts) / len(amounts)) <= 0.10 for a in amounts):
            is_cost_split = True
            indicators.append("similar recorded cost amounts")

    is_split_candidate = bool(split_pairs or is_cost_split)
    if is_split_candidate and (len(ids) >= 3 or risk_score >= 75):
        risk_level = "HIGH"
    elif risk_score >= 75 or len(split_pairs) >= 2:
        risk_level = "HIGH"
    elif risk_score >= 60:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    numeric_ids = [_numeric_id(work_id) for work_id in ids]
    numeric_ids = [value for value in numeric_ids if value is not None]
    quantities = {}
    for record in records:
        for unit, value in record.get("quantity_signature_data", ()):
            quantities[unit] = quantities.get(unit, 0) + value

    def display_asset(record):
        for field in ("primary_asset", "effective_work_category", "work_category", "main_sector"):
            value = str(record.get(field) or "").strip()
            if value and value.lower() not in {"nan", "unclassified", "normal/others", "other / unclassified"}:
                return value
        return "Related public works"

    common_asset = pd.Series([display_asset(record) for record in records]).mode().iloc[0]

    amount_str = f"₹{total_cost / 100000:,.1f} Lakh" if total_cost < 10000000 else f"₹{total_cost / 10000000:,.2f} Crore"

    # User-facing narrative (Sections 21, 24, 25, 26, 30, 33)
    display_indicators = list(dict.fromkeys(_friendly_indicator(item) for item in indicators))
    if is_split_candidate:
        cluster_risk_reason = (
            f"{len(ids)} records describe closely related {common_asset.lower()} work and were recorded within a related period. "
            f"The records have a combined expenditure of approximately {amount_str} and may represent portions of a larger scope. "
            f"Their physical boundaries, quantities, locations, and implementing arrangements should be verified."
        )
    elif len(indicators) >= 3:
        cluster_risk_reason = (
            f"{len(ids)} records have closely related project details for {common_asset.lower()} and a combined expenditure of "
            f"{amount_str}. The available record links suggest possible overlap, but the physical scopes should be checked "
            f"before the works are treated as duplicates."
        )
    else:
        cluster_risk_reason = (
            f"Several closely recorded works contain related {common_asset.lower()} details and have a combined expenditure of "
            f"{amount_str}. The records warrant review to confirm whether they represent separate physical scopes or overlapping entries."
        )

    # Audit observation with cost-reduction / consolidation perspective (Sections 27, 33)
    if "close work IDs" in indicators and ("same recommended date" in indicators or "same sanctioned date" in indicators):
        audit_observation = (
            "Verify whether these records represent separate physical scopes or portions of one project. "
            "If the scope is shared, the file should explain the separate records, quantities, locations, and implementing arrangements."
        )
    else:
        audit_observation = (
            "Verify whether these records represent genuinely separate physical works or overlapping entries, and confirm "
            "that each recorded expenditure is supported by a distinct scope and site record."
        )

    supporting_details = f"{len(ids)} related records; combined recorded expenditure: {amount_str}."
    if display_indicators:
        supporting_details += " Supporting signals: " + ", ".join(display_indicators) + "."
    cluster_why = audit_observation

    summary_records = [{
        "work_id": record.get("work_id", ""), "work_name": display_asset(record),
        "sanction_amount": float(record.get("amount_numeric")) if pd.notna(record.get("amount_numeric")) else None,
        "recommended_amount": float(record.get("recommended_amount")) if pd.notna(pd.to_numeric(record.get("recommended_amount"), errors="coerce")) else None,
        "recommended_work_id": record.get("recommended_work_id", ""), "sanctioned_work_id": record.get("sanctioned_work_id", ""),
        "comparison_source": record.get("comparison_source", ""), "recommended_date": record.get("recommended_date"), "sanction_date": record.get("sanction_date"),
        "quantity": quantity_text(record.get("quantity_signature_data", ())),
    } for record in records]

    return {
        "cluster_id": f"DUP-{cluster_number:05d}", "work_ids": ids, "cluster_size": len(ids),
        "state": records[0].get("state", "") if records else "", "constituency": records[0].get("constituency", "") if records else "",
        "sector": records[0].get("main_sector") or records[0].get("work_category", "") if records else "",
        "common_asset": common_asset, "duplicate_risk_score": round(risk_score, 1), "duplicate_risk_level": risk_level,
        "possible_split_work": is_split_candidate, "review_classification": "PROBABLE_WORK_DIVISION" if is_split_candidate else "DUPLICATE_OVERLAP_REVIEW",
        "related_record_count": len(ids), "id_range": max(numeric_ids) - min(numeric_ids) if len(numeric_ids) >= 2 else None,
        "total_sanctioned_amount": total_cost, "total_recommended_amount": total_recommended or None,
        "recommended_to_sanctioned_ratio": round(total_recommended / total_cost, 3) if total_cost > 0 and total_recommended > 0 else None,
        "quantity_totals": quantities, "key_indicators": display_indicators,
        "risk_reason": cluster_risk_reason, "duplicate_what_happened": cluster_risk_reason,
        "duplicate_why_it_matters": cluster_why, "duplicate_supporting_details": supporting_details,
        "audit_observation": audit_observation, "record_summaries": json.dumps(summary_records, default=str),
    }


def run_duplicate_work_detection():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    processed_dir = os.environ.get("PROCESSED_DIR", os.path.join(base_dir, "data", "processed"))
    features_dir = os.environ.get("FEATURES_DIR", os.path.join(base_dir, "data", "features"))
    os.makedirs(features_dir, exist_ok=True)
    df = _load_comparison_corpus(processed_dir)
    if df.empty:
        raise ValueError("Recommended and sanctioned datasets contain no comparable work records")

    master_path = os.path.join(features_dir, "master_analytical.parquet")
    if os.path.exists(master_path):
        master = pd.read_parquet(master_path, columns=["work_id", "main_sector", "effective_work_category", "primary_asset", "quantity_detected", "quantity_unit"])
        df = df.merge(master.drop_duplicates("work_id"), on="work_id", how="left")
    for column, default in {"main_sector": "", "effective_work_category": "", "primary_asset": ""}.items():
        if column not in df.columns:
            df[column] = default
        df[column] = df[column].fillna(default).astype(str)
    df["meaningful_description"] = df["similarity_description"].map(meaningful_description)
    df["meaningful_tokens"] = df["similarity_description"].map(meaningful_tokens)
    df["meaningful_token_set"] = df["meaningful_tokens"].map(set)
    df["technical_tokens"] = df["similarity_description"].map(_technical_tokens)
    df["quantity_signature_data"] = df["similarity_description"].map(extract_quantity_signature)
    df["quantity_signature"] = df["quantity_signature_data"].map(quantity_text)
    df["effective_work_category"] = df["effective_work_category"].where(df["effective_work_category"].ne(""), df["work_category"].fillna(""))
    df["numeric_id"] = df["work_id"].map(_numeric_id)
    df["recommended_dt"] = pd.to_datetime(df["recommended_date"], errors="coerce")
    df["sanction_dt"] = pd.to_datetime(df["sanction_date"], errors="coerce")
    sanctioned_values = pd.to_numeric(df["sanction_amount"], errors="coerce")
    recommended_values = pd.to_numeric(df["recommended_amount"], errors="coerce")
    df["amount_numeric"] = sanctioned_values.where(sanctioned_values.gt(0), recommended_values)
    df = df[df["meaningful_description"].str.len().ge(5)].copy()
    print(f"Loaded {len(df):,} records with meaningful duplicate-analysis identity")

    pairs = []
    processed_groups = 0
    grouped = df.groupby(["state", "constituency", "main_sector", "effective_work_category"], dropna=False, sort=False)
    for _, group in grouped:
        processed_groups += 1
        if processed_groups % 1000 == 0:
            print(f"Analysed {processed_groups:,} comparison blocks", flush=True)
        if len(group) < 2:
            continue
        # Very large groups are still bounded by token blocking so common
        # words cannot make every record a candidate.
        if len(group) > 30:
            large_records = group.to_dict("records")
            exact_large = {}
            for record in large_records:
                exact_large.setdefault(record["meaningful_description"], []).append(record)
            for exact_records in exact_large.values():
                if len(exact_records) > 20:
                    exact_records = exact_records[:20]
                for left_index in range(len(exact_records)):
                    for right_index in range(left_index + 1, len(exact_records)):
                        pair = _pair_candidate(exact_records[left_index], exact_records[right_index], 1.0)
                        if pair:
                            pairs.append(pair)
            continue
        records = group.to_dict("records")
        token_index = {}
        for index, record in enumerate(records):
            for token in set(record["meaningful_tokens"]):
                # Common asset words can still occur in many records. Keep
                # only rare-to-moderate token blocks so a large constituency
                # cannot become an all-pairs comparison.
                token_index.setdefault(token, set()).add(index)
        candidate_indices = set()
        for indices in token_index.values():
            if 1 < len(indices) <= 10:
                ordered = sorted(indices)
                candidate_indices.update((ordered[a], ordered[b]) for a in range(len(ordered)) for b in range(a + 1, len(ordered)))
        # Exact meaningful identity is checked first. For a very repetitive
        # identity, compare only nearby records because the full block is
        # usually administrative boilerplate rather than one physical asset.
        exact_index = {}
        for index, record in enumerate(records):
            exact_index.setdefault(record["meaningful_description"], []).append(index)
        for indices in exact_index.values():
            ordered = sorted(indices)
            if len(ordered) <= 30:
                candidate_indices.update((ordered[a], ordered[b]) for a in range(len(ordered)) for b in range(a + 1, len(ordered)))
            else:
                candidate_indices.update((ordered[a], ordered[b]) for a in range(len(ordered)) for b in range(a + 1, min(a + 11, len(ordered))))
        if HAS_SKLEARN and len(records) <= 80:
            try:
                vectorizer = TfidfVectorizer(token_pattern=r"(?u)\b[\w-]+\b", min_df=1)
                matrix = vectorizer.fit_transform([record["meaningful_description"] for record in records])
                rows, cols = np.where(cosine_similarity(matrix) >= 0.55)
                candidate_indices.update((int(a), int(b)) for a, b in zip(rows, cols) if a < b)
            except ValueError:
                pass
        if len(candidate_indices) > 100:
            candidate_indices = set(sorted(candidate_indices)[:100])
        for left_index, right_index in candidate_indices:
            left, right = records[left_index], records[right_index]
            left_set, right_set = left["meaningful_token_set"], right["meaningful_token_set"]
            if left["meaningful_description"] != right["meaningful_description"] and len(left_set & right_set) < 2:
                continue
            similarity = len(left_set & right_set) / max(len(left_set | right_set), 1)
            if HAS_SKLEARN:
                # Jaccard is deliberately retained as the final meaningful
                # identity check, so generic-word similarity cannot dominate.
                similarity = max(similarity, 0.72 if left["meaningful_description"] == right["meaningful_description"] else 0.0)
            pair = _pair_candidate(left, right, similarity)
            if pair:
                pairs.append(pair)

    print(f"Generated evidence-supported pair candidates: {len(pairs):,}", flush=True)
    if len(pairs) > 50000:
        pairs = sorted(pairs, key=lambda item: item["similarity_score"], reverse=True)[:50000]
        print("Capped pair storage at the highest-ranked 50,000 candidates for cluster formation.", flush=True)
    pair_frame = pd.DataFrame(pairs)
    if pair_frame.empty:
        pair_frame = pd.DataFrame(columns=["work_id_1", "work_id_2", "similarity_score", "possible_split_work"])
    else:
        pair_frame["pair_key"] = pair_frame.apply(lambda row: "|".join(sorted([str(row["work_id_1"]), str(row["work_id_2"])])), axis=1)
        pair_frame = pair_frame.sort_values("similarity_score", ascending=False).drop_duplicates("pair_key").drop(columns="pair_key")
        pair_frame["duplicate_risk_level"] = np.select([pair_frame["possible_split_work"], pair_frame["similarity_score"].ge(75)], ["SPLIT-WORK", "HIGH"], default="MEDIUM")
        pair_frame["review_classification"] = np.where(pair_frame["possible_split_work"], "PROBABLE_WORK_DIVISION", "DUPLICATE_OVERLAP_REVIEW")
    pair_frame.to_parquet(os.path.join(features_dir, "duplicate_work_candidates.parquet"), index=False)

    lookup = {record["work_id"]: record for record in df.to_dict("records")}
    pair_records = pair_frame.to_dict("records") if not pair_frame.empty else []
    components = _connected_components(pair_records) if pair_records else []
    component_by_work = {work_id: index for index, ids in enumerate(components, start=1) for work_id in ids}
    pairs_by_component = {}
    for pair in pair_records:
        component_index = component_by_work.get(pair["work_id_1"])
        if component_index is not None:
            pairs_by_component.setdefault(component_index, []).append(pair)
    clusters = [_cluster_output(index, ids, lookup, pairs_by_component.get(index, [])) for index, ids in enumerate(components, start=1)]
    cluster_frame = pd.DataFrame(clusters)
    if cluster_frame.empty:
        cluster_frame = pd.DataFrame(columns=["cluster_id", "work_ids", "cluster_size", "duplicate_risk_score", "duplicate_risk_level"])

    def _safe_write(dataframe, filepath):
        try:
            dataframe.to_parquet(filepath, index=False)
        except Exception:
            import time
            time.sleep(0.5)
            dataframe.to_parquet(filepath, index=False)

    _safe_write(cluster_frame, os.path.join(features_dir, "duplicate_work_clusters.parquet"))

    if clusters:
        score_rows = []
        for cluster in clusters:
            for work_id in cluster["work_ids"]:
                score_rows.append({
                    "work_id": work_id, "duplicate_risk_score": cluster["duplicate_risk_score"],
                    "duplicate_risk_level": cluster["duplicate_risk_level"],
                    "duplicate_what_happened": cluster.get("duplicate_what_happened", ""),
                    "duplicate_why_it_matters": cluster.get("duplicate_why_it_matters", ""),
                    "duplicate_supporting_details": cluster.get("duplicate_supporting_details", ""),
                    "duplicate_explanation": f"{cluster.get('duplicate_what_happened', '')} {cluster.get('duplicate_why_it_matters', '')}".strip(),
                })
        _safe_write(pd.DataFrame(score_rows).drop_duplicates("work_id"), os.path.join(features_dir, "work_duplicate_scores.parquet"))
    else:
        _safe_write(pd.DataFrame(columns=["work_id", "duplicate_risk_score", "duplicate_risk_level"]), os.path.join(features_dir, "work_duplicate_scores.parquet"))
    print(f"Duplicate pairs retained: {len(pair_frame):,}")
    print(f"Suspicious clusters formed: {len(cluster_frame):,}")


if __name__ == "__main__":
    run_duplicate_work_detection()
