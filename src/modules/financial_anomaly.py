"""Auditable, tiered completed-work financial analysis for MPLADS.

Raw datasets are never changed. Cost comparison falls back from constituency
to state to India only when a narrower completed-work group is insufficient.
Unit pricing is restricted to specific work types with validated quantities.
"""
import os
import re
from typing import Dict, Iterable, Tuple

import numpy as np
import pandas as pd

MIN_HISTORY_RECORDS = 2
AMBIGUOUS_CATEGORY_TOKENS = ("unspecified", "unclassified", "unknown", "other")


def _series(df, name, default=np.nan): return df[name] if name in df.columns else pd.Series(default, index=df.index)
def _text(value): return "" if value is None or pd.isna(value) else str(value).strip()
def _key(value): return " ".join(re.sub(r"[^a-z0-9]+", " ", _text(value).lower()).split())
def _money(value): return "" if pd.isna(value) else f"₹{float(value):,.0f}"
def _unit_money(value, unit): return "" if pd.isna(value) else f"{_money(value)}/{unit}"


def _unit_key(value):
    raw = _key(value)
    aliases = {"m": "metre", "meter": "metre", "meters": "metre", "metres": "metre", "mt": "metre", "mtr": "metre", "sq ft": "square foot", "sq feet": "square foot", "sq foot": "square foot", "square feet": "square foot", "square ft": "square foot", "sq m": "square metre", "sq metre": "square metre", "sq metres": "square metre", "square meter": "square metre", "square meters": "square metre", "square metres": "square metre", "piece": "piece", "pieces": "piece", "unit": "unit", "units": "unit", "item": "item", "items": "item", "number": "unit", "nos": "unit", "no": "unit"}
    return aliases.get(raw, raw)


def _identifier_only_quantity(descriptions) -> pd.Series:
    """Flag numbers that look like administrative identifiers, not quantities.

    Descriptions frequently contain values such as ``SONGSOD NO-2`` or
    ``WARD 13``.  If an older or alternate parser has already placed that
    number in ``quantity_detected``, it must not be allowed to create a unit
    price.  An explicit physical expression such as ``10 lights`` or
    ``5 units`` takes precedence.
    """
    text = descriptions.fillna("").astype(str).str.lower()
    identifier = text.str.contains(
        r"\b(?:address|house\s*(?:no|number)?|h\.?\s*no|plot|door|ward|block|sector|phase|part|road|street|constituency|constituent|song(?:sad|sod)?|sansad|no|number)\s*[-./]?\s*\d+\b",
        regex=True,
        na=False,
    )
    explicit_quantity = text.str.contains(
        r"(?:\b\d+(?:\.\d+)?\s*(?:pcs?\.?|pieces?|nos\.?|numbers?|units?|poles?|lights?|classrooms?|rooms?|sets?|km|kilomet(?:er|re)s?|meters?|mtrs?)\b|\b\d+(?:\.\d+)?\s+(?:led\s+)?(?:solar(?:\s+street)?|high\s*mast|street)(?:\s+electric)?\s+lights?\b)",
        regex=True,
        na=False,
    )
    return identifier & ~explicit_quantity


def _quantity_and_unit(df) -> Tuple[pd.Series, pd.Series, pd.Series]:
    quantity = pd.to_numeric(_series(df, "quantity_detected"), errors="coerce")
    unit = _series(df, "quantity_unit", "").fillna("").map(_unit_key)
    descriptions = _series(df, "description", "")
    contact = descriptions.fillna("").astype(str).str.lower().str.contains(r"contact|phone|mobile|telephone", regex=True, na=False)
    identifier_only = _identifier_only_quantity(descriptions)
    valid = quantity.gt(0) & quantity.lt(1_000_000) & unit.ne("") & ~contact & ~identifier_only
    return quantity, unit, valid


def _stats(values: Iterable[float], prefix: str) -> Dict[str, float]:
    clean = pd.to_numeric(pd.Series(list(values)), errors="coerce").dropna()
    clean = clean[clean.gt(0)]
    return {f"{prefix}_count": int(len(clean)), f"{prefix}_min": float(clean.min()) if len(clean) else np.nan, f"{prefix}_max": float(clean.max()) if len(clean) else np.nan, f"{prefix}_median": float(clean.median()) if len(clean) else np.nan}


def _is_specific_category(value):
    category = _key(value)
    return bool(category) and not any(token in category for token in AMBIGUOUS_CATEGORY_TOKENS)


def _peer_category(value):
    """Return an auditable family label for an otherwise ambiguous category.

    A label such as ``High Mast Light System (Unspecified)`` still tells us
    what broad work family it belongs to.  We use that family for completed-
    cost benchmarking, while the original label remains available and the
    unit-price comparison stays disabled because the type is not specific.
    Generic labels such as ``Unclassified`` do not create a synthetic group.
    """
    raw = _text(value)
    if not raw:
        return ""
    family = re.sub(r"\s*\((?:unspecified|unclassified|unknown|not specified|other)\)\s*", " ", raw, flags=re.IGNORECASE)
    family = re.sub(r"\s*[-–—:]\s*(?:unspecified|unclassified|unknown|not specified|other)\s*$", "", family, flags=re.IGNORECASE)
    family = re.sub(r"\s+", " ", family).strip(" -–—:()")
    return family if _is_specific_category(family) else ""


def _usable_group(value):
    group = _key(value)
    return bool(group) and not any(token in group for token in ("unclassified", "unknown", "other"))


def _tier_configs():
    return [
        ("CONSTITUENCY", "EFFECTIVE_CATEGORY", ("state_key", "constituency_key", "sector_key", "peer_category_key")),
        ("CONSTITUENCY", "SUBSECTOR", ("state_key", "constituency_key", "sector_key", "subsector_key")),
        ("CONSTITUENCY", "MAIN_SECTOR", ("state_key", "constituency_key", "sector_key")),
        ("STATE", "EFFECTIVE_CATEGORY", ("state_key", "sector_key", "peer_category_key")),
        ("STATE", "SUBSECTOR", ("state_key", "sector_key", "subsector_key")),
        ("STATE", "MAIN_SECTOR", ("state_key", "sector_key")),
        ("ALL_INDIA", "EFFECTIVE_CATEGORY", ("sector_key", "peer_category_key")),
        ("ALL_INDIA", "SUBSECTOR", ("sector_key", "subsector_key")),
        ("ALL_INDIA", "MAIN_SECTOR", ("sector_key",)),
    ]


def _tuple_key(row, fields): return tuple(str(row[field]) for field in fields)


def _location_label(row):
    if row.get("comparison_scope") == "CONSTITUENCY": return row.get("comparison_constituency") or "this constituency"
    if row.get("comparison_scope") == "STATE": return row.get("comparison_state") or "this state"
    if row.get("comparison_scope") == "ALL_INDIA": return "all-India completed-work history"
    return "the available completed-work history"


def _comparison_label(row):
    level = str(row.get("comparison_level") or "").replace("_", " ").title()
    return f"{_location_label(row)} · {level}" if level else _location_label(row)


def _build_stat_maps(history):
    cost_maps, unit_maps = {}, {}
    for scope, level, fields in _tier_configs():
        eligible = history[history.valid_history].copy()
        if level == "EFFECTIVE_CATEGORY": eligible = eligible[eligible.peer_category_key.ne("")]
        if level == "SUBSECTOR": eligible = eligible[eligible.subsector_key.ne("")]
        eligible = eligible[eligible[list(fields)].ne("").all(axis=1)]
        cost_maps[(scope, level)] = {_tuple_key(group.iloc[0], fields): _stats(group.completed_cost, "historical_cost") for _, group in eligible.groupby(list(fields), sort=False)}
        if level == "EFFECTIVE_CATEGORY":
            unit_maps[(scope, level)] = {}
            for group_key, group in eligible[eligible.unit_price_eligible].groupby(list(fields) + ["quantity_unit"], sort=False):
                key = tuple(group_key) if isinstance(group_key, tuple) else (group_key,)
                unit_maps[(scope, level)][key] = _stats(group.calculated_unit_price, "historical_unit_price")
    return cost_maps, unit_maps


def _select_cost_stats(row, cost_maps):
    for scope, level, fields in _tier_configs():
        if level == "EFFECTIVE_CATEGORY" and not row["peer_category_key"]: continue
        if level == "SUBSECTOR" and not row["subsector_key"]: continue
        key = _tuple_key(row, fields)
        stats = cost_maps[(scope, level)].get(key) if all(key) else None
        if stats and stats["historical_cost_count"] >= MIN_HISTORY_RECORDS: return scope, level, stats
    return "", "", _stats([], "historical_cost")


def _select_unit_stats(row, unit_maps):
    if not row["unit_price_eligible"]: return "", _stats([], "historical_unit_price")
    # Unit values are never generalized to subsectors or sectors.
    for scope, level, fields in _tier_configs():
        if level != "EFFECTIVE_CATEGORY": continue
        key = _tuple_key(row, fields) + (str(row["quantity_unit"]),)
        stats = unit_maps[(scope, level)].get(key) if all(key) else None
        if stats and stats["historical_unit_price_count"] >= MIN_HISTORY_RECORDS: return scope, stats
    return "", _stats([], "historical_unit_price")


def _supporting_details(row):
    details = []
    if row["cost_comparison_available"]: details.append(f"Cost peer group ({_comparison_label(row)}): {_money(row['historical_cost_min'])} to {_money(row['historical_cost_max'])}; current cost: {_money(row['current_cost'])}.")
    if row["unit_comparison_available"]: details.append(f"Comparable unit prices: {_unit_money(row['historical_unit_price_min'], row['quantity_unit'])} to {_unit_money(row['historical_unit_price_max'], row['quantity_unit'])}; current unit price: {_unit_money(row['current_unit_price'], row['quantity_unit'])}.")
    elif pd.notna(row["unit_price_skip_reason"]): details.append(f"Unit-price comparison not used: {row['unit_price_skip_reason']}.")
    return " ".join(details) if details else "No comparable completed-work cost range was available."


def _write_benchmarks(features_dir, history, result):
    rows = []
    benchmark_counts = result["comparison_benchmark_id"].value_counts(dropna=True).to_dict()
    benchmark_outliers = result.loc[result["is_financial_outlier"].fillna(False).astype(bool), "comparison_benchmark_id"].value_counts(dropna=True).to_dict()
    for scope, level, fields in _tier_configs():
        groups = history[history.valid_history].copy()
        if level == "EFFECTIVE_CATEGORY": groups = groups[groups.peer_category_key.ne("")]
        if level == "SUBSECTOR": groups = groups[groups.subsector_key.ne("")]
        groups = groups[groups[list(fields)].ne("").all(axis=1)]
        for group_key, group in groups.groupby(list(fields), sort=False):
            group_key = tuple(group_key) if isinstance(group_key, tuple) else (group_key,)
            cost = _stats(group.completed_cost, "historical_cost")
            if cost["historical_cost_count"] < MIN_HISTORY_RECORDS:
                continue
            units = group[group.unit_price_eligible] if level == "EFFECTIVE_CATEGORY" else pd.DataFrame()
            unit = _stats(units.calculated_unit_price if not units.empty else [], "historical_unit_price")
            benchmark_id = "|".join((scope, level, *group_key))
            sample = group.iloc[0]
            rows.append({"benchmark_id": benchmark_id, "comparison_scope": scope, "comparison_level": level, "state": sample.state if scope != "ALL_INDIA" else "All India", "constituency": sample.constituency if scope == "CONSTITUENCY" else "All Constituencies", "main_sector": sample.main_sector, "subsector": sample.subsector if level == "SUBSECTOR" else "All Sub-sectors", "effective_work_category": sample.peer_category if level == "EFFECTIVE_CATEGORY" else "All Categories", "original_effective_work_category": sample.effective_work_category if level == "EFFECTIVE_CATEGORY" else "", "peer_category": sample.peer_category if level == "EFFECTIVE_CATEGORY" else "", "peer_category_auto_generated": bool(group.peer_category_auto_generated.any()) if level == "EFFECTIVE_CATEGORY" else False, "completed_work_count": int(cost["historical_cost_count"]), "current_work_count": int(benchmark_counts.get(benchmark_id, 0)), "outlier_count": int(benchmark_outliers.get(benchmark_id, 0)), **cost, **unit})
    pd.DataFrame(rows).to_parquet(os.path.join(features_dir, "financial_peer_benchmarks.parquet"), index=False)


def run_financial_anomaly_detection():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    features_dir = os.environ.get("FEATURES_DIR", os.path.join(base_dir, "data", "features"))
    master_path = os.path.join(features_dir, "master_analytical.parquet")
    if not os.path.exists(master_path): raise FileNotFoundError(f"Master analytical dataset not found at {master_path}")
    print("=== EXECUTING TIERED HISTORICAL FINANCIAL RISK ANALYSIS ===")
    df = pd.read_parquet(master_path)
    if df.empty:
        df.to_parquet(os.path.join(features_dir, "financial_anomalies.parquet"), index=False)
        return
    current_cost = pd.to_numeric(_series(df, "sanction_amount"), errors="coerce")
    completion_date = pd.to_datetime(_series(df, "completion_date"), errors="coerce")
    expenditure = pd.to_numeric(_series(df, "effective_expenditure"), errors="coerce")
    historical_cost = expenditure.where(expenditure.gt(0), pd.to_numeric(_series(df, "completed_disbursed_amount"), errors="coerce"))
    state, constituency, sector = (_series(df, name, "").fillna("").map(_text) for name in ("state", "constituency", "main_sector"))
    category = _series(df, "effective_work_category", "").fillna("").map(_text)
    # A detailed classifier category is the only safe sub-sector comparator.
    # Ambiguous labels (for example, "High Mast ... (Unspecified)") fall
    # directly to their main sector rather than an unrelated NLP work group.
    work_subcategory = _series(df, "work_subcategory", "").fillna("").map(_text)
    subsector = work_subcategory.where(work_subcategory.map(_is_specific_category), "")
    peer_category = category.map(_peer_category)
    peer_category_auto_generated = peer_category.ne(category) & peer_category.ne("")
    quantity, quantity_unit, quantity_valid = _quantity_and_unit(df)
    identifier_only_quantity = _identifier_only_quantity(_series(df, "description", ""))
    specific_category = category.map(_is_specific_category)
    unit_price_eligible = quantity_valid & specific_category
    current_unit_price = current_cost.div(quantity.where(unit_price_eligible)).where(current_cost.gt(0) & unit_price_eligible)
    skip_reason = pd.Series("", index=df.index, dtype=object)
    skip_reason.loc[~specific_category] = "work type is unspecified or too broad for a like-for-like unit-price comparison"
    skip_reason.loc[specific_category & identifier_only_quantity] = "the detected number appears to be an address or record identifier, not a physical quantity"
    skip_reason.loc[specific_category & ~quantity_valid & ~identifier_only_quantity] = "a validated quantity and unit are not available"
    history = pd.DataFrame({"work_id": _series(df, "work_id", ""), "state": state, "constituency": constituency, "main_sector": sector, "effective_work_category": category, "peer_category": peer_category, "peer_category_auto_generated": peer_category_auto_generated, "subsector": subsector, "quantity": quantity, "quantity_unit": quantity_unit, "completed_cost": historical_cost, "completion_date": completion_date, "state_key": state.map(_key), "constituency_key": constituency.map(_key), "sector_key": sector.map(_key), "category_key": category.map(_key), "peer_category_key": peer_category.map(_key), "subsector_key": subsector.map(_key), "quantity_valid": quantity_valid, "specific_category": specific_category, "unit_price_eligible": unit_price_eligible}, index=df.index)
    history["valid_history"] = history.completion_date.notna() & history.completed_cost.gt(0) & history.state_key.ne("") & history.constituency_key.ne("") & history.sector_key.ne("")
    history["calculated_unit_price"] = history.completed_cost.div(history.quantity.where(history.unit_price_eligible))
    history[history.valid_history & history.unit_price_eligible][["work_id", "state", "constituency", "main_sector", "subsector", "effective_work_category", "quantity", "quantity_unit", "completed_cost", "calculated_unit_price", "completion_date"]].to_parquet(os.path.join(features_dir, "financial_historical_unit_prices.parquet"), index=False)
    cost_maps, unit_maps = _build_stat_maps(history); rows = []
    # The financial artifact is keyed by work ID; do not duplicate raw master
    # columns here, which keeps the derived parquet write memory-safe.
    source_records, peer_records = df[["work_id"]].to_dict(orient="records"), history.to_dict(orient="records")
    for source, peer in zip(source_records, peer_records):
        cost_scope, cost_level, cstats = _select_cost_stats(peer, cost_maps); unit_scope, ustats = _select_unit_stats(peer, unit_maps)
        current = current_cost.iloc[len(rows)]; current_unit = current_unit_price.iloc[len(rows)]; is_unit_eligible = bool(unit_price_eligible.iloc[len(rows)])
        out = dict(source); out.update(cstats); out.update(ustats)
        selected_fields = next((fields for selected_scope, selected_level, fields in _tier_configs() if selected_scope == cost_scope and selected_level == cost_level), ())
        benchmark_id = "|".join((cost_scope, cost_level, *_tuple_key(peer, selected_fields))) if selected_fields else np.nan
        out.update({"current_cost": float(current) if pd.notna(current) else np.nan, "current_unit_price": float(current_unit) if pd.notna(current_unit) else np.nan, "quantity_detected": float(quantity.iloc[len(rows)]) if pd.notna(quantity.iloc[len(rows)]) else np.nan, "quantity_unit": quantity_unit.iloc[len(rows)] if is_unit_eligible else np.nan, "unit_price_comparison_eligible": is_unit_eligible, "unit_price_skip_reason": skip_reason.iloc[len(rows)] or np.nan, "historical_comparable_work_count": int(cstats["historical_cost_count"]), "comparison_scope": cost_scope or np.nan, "comparison_level": cost_level or np.nan, "comparison_benchmark_id": benchmark_id, "comparison_state": state.iloc[len(rows)] if cost_scope in {"CONSTITUENCY", "STATE"} else "All India", "comparison_constituency": constituency.iloc[len(rows)] if cost_scope == "CONSTITUENCY" else np.nan, "comparison_sector": sector.iloc[len(rows)], "comparison_subsector": subsector.iloc[len(rows)], "comparison_work_type": category.iloc[len(rows)], "comparison_peer_category": peer_category.iloc[len(rows)], "peer_category": peer_category.iloc[len(rows)], "peer_category_auto_generated": bool(peer_category_auto_generated.iloc[len(rows)]), "comparison_group_label": f"{cost_scope.replace('_', ' ').title()} · {cost_level.replace('_', ' ').title()}" if cost_scope else np.nan, "unit_comparison_scope": unit_scope or np.nan})
        cost_available = cstats["historical_cost_count"] >= MIN_HISTORY_RECORDS and pd.notna(current) and current > 0
        unit_available = ustats["historical_unit_price_count"] >= MIN_HISTORY_RECORDS and pd.notna(current_unit)
        cost_status = "INSUFFICIENT_HISTORY" if not cost_available else "ABOVE_HISTORICAL_RANGE" if current > cstats["historical_cost_max"] else "BELOW_HISTORICAL_RANGE" if current < cstats["historical_cost_min"] else "WITHIN_HISTORICAL_RANGE"
        unit_status = "NOT_APPLICABLE_AMBIGUOUS_WORK_TYPE" if not specific_category.iloc[len(rows)] else "NOT_AVAILABLE" if not unit_available else "ABOVE_HISTORICAL_RANGE" if current_unit > ustats["historical_unit_price_max"] else "BELOW_HISTORICAL_RANGE" if current_unit < ustats["historical_unit_price_min"] else "WITHIN_HISTORICAL_RANGE"
        out.update({"cost_comparison_status": cost_status, "unit_comparison_status": unit_status, "cost_comparison_available": bool(cost_available), "unit_comparison_available": bool(unit_available)})
        out["is_financial_outlier"] = bool(cost_status in {"ABOVE_HISTORICAL_RANGE", "BELOW_HISTORICAL_RANGE"} or unit_status in {"ABOVE_HISTORICAL_RANGE", "BELOW_HISTORICAL_RANGE"})
        location = _comparison_label(out)
        if out["is_financial_outlier"]: what = f"The proposed cost is {'above' if cost_status == 'ABOVE_HISTORICAL_RANGE' else 'below' if cost_status == 'BELOW_HISTORICAL_RANGE' else 'within'} the completed-work range for {location}." + (" The validated unit price is also outside its exact-category history." if unit_status in {"ABOVE_HISTORICAL_RANGE", "BELOW_HISTORICAL_RANGE"} else "")
        else: what = "There is insufficient completed-work history for a reliable cost comparison." if not cost_available else f"The proposed cost is within the completed-work range for {location}."
        why = "Verify estimate, scope, quantity, and cost justification against the completed works used for this comparison before drawing a conclusion." if out["is_financial_outlier"] else (f"Cost was assessed using the selected peer group. Unit-price comparison was not used: {out['unit_price_skip_reason']}" if pd.notna(out["unit_price_skip_reason"]) else "The available comparison does not indicate that the proposed pricing is outside the observed historical pattern.")
        out.update({"financial_what_happened": what, "financial_why_it_matters": why}); out["financial_supporting_details"] = _supporting_details(out); out["financial_explanation"] = f"{what} {why}"; out["financial_audit_interpretation"] = "This work should be reviewed to verify the quantity, estimate, scope, and supporting cost justification." if out["is_financial_outlier"] else "No financial risk signal was identified from the available comparable completed-work history."
        evidence = []
        if cost_available and cost_status in {"ABOVE_HISTORICAL_RANGE", "BELOW_HISTORICAL_RANGE"}: evidence.append(f"Historical cost range ({location}): {_money(cstats['historical_cost_min'])} – {_money(cstats['historical_cost_max'])}\nCurrent cost: {_money(current)}")
        if unit_available and unit_status in {"ABOVE_HISTORICAL_RANGE", "BELOW_HISTORICAL_RANGE"}: evidence.append(f"Historical unit-price range: {_unit_money(ustats['historical_unit_price_min'], quantity_unit.iloc[len(rows)])} – {_unit_money(ustats['historical_unit_price_max'], quantity_unit.iloc[len(rows)])}\nCurrent unit price: {_unit_money(current_unit, quantity_unit.iloc[len(rows)])}")
        out.update({"financial_risk_evidence": "\n\n".join(evidence), "risk_reasons": evidence, "comparison_basis": "TIERED_COMPLETED_WORK_PEER_HISTORY"}); rows.append(out)
    result = pd.DataFrame(rows)
    def deviation(row):
        values = []
        if row.cost_comparison_available and row.historical_cost_median > 0: values.append(abs(row.current_cost - row.historical_cost_median) / row.historical_cost_median)
        if row.unit_comparison_available and row.historical_unit_price_median > 0: values.append(abs(row.current_unit_price - row.historical_unit_price_median) / row.historical_unit_price_median)
        return max(values) if values and row.is_financial_outlier else 0.0
    result["financial_deviation_from_median"] = result.apply(deviation, axis=1); flagged = result.is_financial_outlier; result["financial_risk_score"] = 0.0
    if flagged.any(): result.loc[flagged, "financial_risk_score"] = result.loc[flagged, "financial_deviation_from_median"].rank(method="min", pct=True).mul(100).round(1)
    if flagged.any():
        scores = result.loc[flagged, "financial_risk_score"]; result["financial_risk_level"] = np.where(result.financial_risk_score >= scores.quantile(.75), "HIGH", np.where(result.financial_risk_score >= scores.quantile(.50), "MEDIUM", "LOW")); result.loc[~flagged, "financial_risk_level"] = "LOW"
    else: result["financial_risk_level"] = "LOW"
    result["financial_anomaly_score"] = result.financial_risk_score; result["anomaly_detected"] = flagged; result["anomaly_type"] = np.select([result.cost_comparison_status.eq("ABOVE_HISTORICAL_RANGE") | result.unit_comparison_status.eq("ABOVE_HISTORICAL_RANGE"), flagged], ["ABOVE_HISTORICAL_PATTERN", "OUTSIDE_HISTORICAL_RANGE"], default="NO_RELIABLE_FINANCIAL_SIGNAL"); result["anomaly_severity"] = result.financial_risk_level; result["expected_median"] = result.historical_cost_median; result["deviation_percentage"] = np.where(result.historical_cost_median.gt(0), (result.current_cost - result.historical_cost_median) / result.historical_cost_median * 100, np.nan); result["historical_sample_size"] = result.historical_cost_count; result["comparable_work_count"] = result.historical_cost_count; result["historical_median_unit_price"] = result.historical_unit_price_median; result["risk_description"] = result.financial_explanation; result["explanation"] = result.financial_explanation; result["confidence"] = np.where(result.historical_cost_count >= 5, "HIGH", np.where(result.historical_cost_count >= MIN_HISTORY_RECORDS, "MEDIUM", "LOW")); result["model_name"] = "Tiered Historical Financial Analyzer"; result["model_version"] = "historical-cost-unit-v2"; result["dataset_snapshot"] = os.environ.get("DATASET_SNAPSHOT", "CURRENT"); result["last_analyzed_at"] = pd.Timestamp.now("UTC").isoformat(); result["financial_risk_rank"] = pd.NA
    ordered = result.loc[flagged].sort_values(["financial_risk_score", "financial_deviation_from_median"], ascending=False).index; result.loc[ordered, "financial_risk_rank"] = range(1, len(ordered) + 1); result["financial_risk_rank"] = result.financial_risk_rank.astype("Int64")
    result.to_parquet(os.path.join(features_dir, "financial_anomalies.parquet"), index=False); _write_benchmarks(features_dir, history, result)
    print(f"Completed historical records used: {int(history.valid_history.sum()):,}"); print(f"Comparable financial risks identified: {int(flagged.sum()):,}"); print(f"Saved financial risk order and peer benchmarks to: {features_dir}")


if __name__ == "__main__": run_financial_anomaly_detection()
