"""Build the derived peer-benchmark table used by the dashboard."""
import os
import re

import numpy as np
import pandas as pd

try:
    from src.modules.financial_anomaly import _identifier_only_quantity
except ModuleNotFoundError:  # direct ``python src/data/...`` execution
    import sys
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
    from src.modules.financial_anomaly import _identifier_only_quantity


MIN_HISTORY_RECORDS = 2
AMBIGUOUS = ("unspecified", "unclassified", "unknown", "other")


def text(value):
    return "" if value is None or pd.isna(value) else str(value).strip()


def key(value):
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text(value).lower()).split())


def specific(value):
    value = key(value)
    return bool(value) and not any(token in value for token in AMBIGUOUS)


def peer_family(value):
    """Create a cost-benchmark family only when an informative label exists."""
    raw = text(value)
    if not raw:
        return ""
    family = re.sub(r"\s*\((?:unspecified|unclassified|unknown|not specified|other)\)\s*", " ", raw, flags=re.IGNORECASE)
    family = re.sub(r"\s*[-–—:]\s*(?:unspecified|unclassified|unknown|not specified|other)\s*$", "", family, flags=re.IGNORECASE)
    family = re.sub(r"\s+", " ", family).strip(" -–—:()")
    return family if specific(family) else ""


def unit_key(value):
    aliases = {"units": "unit", "nos": "unit", "no": "unit", "pieces": "piece", "pcs": "piece", "meters": "metre", "metres": "metre", "m": "metre"}
    value = key(value)
    return aliases.get(value, value)


def stat(series, prefix):
    values = pd.to_numeric(pd.Series(series), errors="coerce")
    values = values[values.gt(0)]
    return {
        f"{prefix}_count": int(values.count()),
        f"{prefix}_min": float(values.min()) if values.count() else np.nan,
        f"{prefix}_median": float(values.median()) if values.count() else np.nan,
        f"{prefix}_max": float(values.max()) if values.count() else np.nan,
    }


def build_financial_benchmarks(features_dir=None):
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    features_dir = features_dir or os.environ.get("FEATURES_DIR", os.path.join(root, "data", "features"))
    master = pd.read_parquet(os.path.join(features_dir, "master_analytical.parquet"))
    anomaly_path = os.path.join(features_dir, "financial_anomalies.parquet")
    anomaly = pd.read_parquet(anomaly_path, columns=["work_id", "is_financial_outlier"]) if os.path.exists(anomaly_path) else pd.DataFrame(columns=["work_id", "is_financial_outlier"])

    frame = pd.DataFrame({
        "work_id": master.get("work_id", pd.Series(dtype=str)).map(text),
        "state": master.get("state", pd.Series(dtype=str)).map(text),
        "constituency": master.get("constituency", pd.Series(dtype=str)).map(text),
        "main_sector": master.get("main_sector", pd.Series(dtype=str)).map(text),
        "subsector": master.get("work_subcategory", pd.Series(dtype=str)).map(text),
        "effective_work_category": master.get("effective_work_category", pd.Series(dtype=str)).map(text),
        "completion_date": pd.to_datetime(master.get("completion_date", pd.Series(dtype=object)), errors="coerce"),
        "completed_cost": pd.to_numeric(master.get("effective_expenditure", pd.Series(dtype=float)), errors="coerce"),
        "fallback_cost": pd.to_numeric(master.get("completed_disbursed_amount", pd.Series(dtype=float)), errors="coerce"),
        "quantity": pd.to_numeric(master.get("quantity_detected", pd.Series(dtype=float)), errors="coerce"),
        "quantity_unit": master.get("quantity_unit", pd.Series(dtype=str)).map(unit_key),
    })
    frame["identifier_only_quantity"] = _identifier_only_quantity(master.get("description", pd.Series("", index=master.index)))
    frame["completed_cost"] = frame["completed_cost"].where(frame["completed_cost"].gt(0), frame["fallback_cost"])
    frame["specific_category"] = frame["effective_work_category"].map(specific)
    frame["peer_category"] = frame["effective_work_category"].map(peer_family)
    frame["peer_category_auto_generated"] = frame["peer_category"].ne(frame["effective_work_category"]) & frame["peer_category"].ne("")
    frame["peer_category_key"] = frame["peer_category"].map(key)
    frame["subsector"] = frame["subsector"].where(frame["subsector"].map(specific), "")
    frame["valid_history"] = frame["completion_date"].notna() & frame["completed_cost"].gt(0) & frame[["state", "constituency", "main_sector"]].ne("").all(axis=1)
    frame["unit_price_eligible"] = frame["valid_history"] & frame["specific_category"] & frame["quantity"].gt(0) & frame["quantity_unit"].ne("") & ~frame["identifier_only_quantity"]
    frame["unit_price"] = frame["completed_cost"].div(frame["quantity"].where(frame["unit_price_eligible"]))
    if not anomaly.empty:
        frame = frame.merge(anomaly.drop_duplicates("work_id"), on="work_id", how="left")
    frame["is_financial_outlier"] = frame.get("is_financial_outlier", False).fillna(False).astype(bool)
    history = frame[frame["valid_history"]].copy()

    configs = [
        ("CONSTITUENCY", "EFFECTIVE_CATEGORY", ["state", "constituency", "main_sector", "peer_category_key"]),
        ("CONSTITUENCY", "SUBSECTOR", ["state", "constituency", "main_sector", "subsector"]),
        ("CONSTITUENCY", "MAIN_SECTOR", ["state", "constituency", "main_sector"]),
        ("STATE", "EFFECTIVE_CATEGORY", ["state", "main_sector", "peer_category_key"]),
        ("STATE", "SUBSECTOR", ["state", "main_sector", "subsector"]),
        ("STATE", "MAIN_SECTOR", ["state", "main_sector"]),
        ("ALL_INDIA", "EFFECTIVE_CATEGORY", ["main_sector", "peer_category_key"]),
        ("ALL_INDIA", "SUBSECTOR", ["main_sector", "subsector"]),
        ("ALL_INDIA", "MAIN_SECTOR", ["main_sector"]),
    ]
    rows = []
    for scope, level, fields in configs:
        groups = history.copy()
        if level == "EFFECTIVE_CATEGORY": groups = groups[groups["peer_category_key"].ne("")]
        elif level == "SUBSECTOR": groups = groups[groups["subsector"].ne("")]
        groups = groups[groups[fields].ne("").all(axis=1)]
        for group_key, group in groups.groupby(fields, sort=False, dropna=False):
            group_key = tuple(group_key) if isinstance(group_key, tuple) else (group_key,)
            cost = stat(group["completed_cost"], "historical_cost")
            if cost["historical_cost_count"] < MIN_HISTORY_RECORDS:
                continue
            benchmark_id = "|".join([scope, level, *map(str, group_key)])
            unit = stat(group.loc[group["unit_price_eligible"], "unit_price"], "historical_unit_price") if level == "EFFECTIVE_CATEGORY" else stat([], "historical_unit_price")
            sample = group.iloc[0]
            rows.append({
                "benchmark_id": benchmark_id,
                "comparison_scope": scope,
                "comparison_level": level,
                "state": sample["state"] if scope != "ALL_INDIA" else "All India",
                "constituency": sample["constituency"] if scope == "CONSTITUENCY" else "All Constituencies",
                "main_sector": sample["main_sector"],
                "subsector": sample["subsector"] if level == "SUBSECTOR" else "All Sub-sectors",
                "effective_work_category": sample["peer_category"] if level == "EFFECTIVE_CATEGORY" else "All Categories",
                "original_effective_work_category": sample["effective_work_category"] if level == "EFFECTIVE_CATEGORY" else "",
                "peer_category": sample["peer_category"] if level == "EFFECTIVE_CATEGORY" else "",
                "peer_category_auto_generated": bool(group["peer_category_auto_generated"].any()) if level == "EFFECTIVE_CATEGORY" else False,
                "completed_work_count": cost["historical_cost_count"],
                "current_work_count": int(len(group)),
                "outlier_count": int(group["is_financial_outlier"].sum()),
                **cost,
                **unit,
            })
    output = os.path.join(features_dir, "financial_peer_benchmarks.parquet")
    pd.DataFrame(rows).to_parquet(output, index=False)
    print(f"Saved {len(rows):,} benchmark groups to {output}")


if __name__ == "__main__":
    build_financial_benchmarks()
