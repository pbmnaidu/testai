"""Composite-key delta detection for reviewable MPLADS synchronisation."""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from src.data.sync.sync_config import (
    MONITORED_FILES, PROCESSED_DIR, SYNC_AUDIT_FILE, SYNC_STATE_FILE,
)


FIELD_ALIASES = {
    "work_id": {"work_id", "workid", "work", "work id", "WORK_ID"},
    "work_recommendation_dtl_id": {
        "work_recommendation_dtl_id", "workrecommendationdtlid", "recommendationdtlid",
        "work recommendation dtl id", "WORK_RECOMMENDATION_DTL_ID",
    },
    "description": {"description", "workdescription", "work description", "work_description", "activityname"},
    "sanction_amount": {"sanctionamount", "sanction amount", "sanction_amount"},
    "recommended_amount": {"recommendedamount", "recommended amount", "recommended_amount"},
    "allocated_amount": {"allocatedamt", "allocatedamount", "allocated amount", "allocated_amount"},
    "completed_disbursed_amount": {"actualamount", "completeddisbursedamount", "completed disbursed amount", "completed_disbursed_amount"},
    "expenditure_amount": {"funddisbursedamt", "funddisbursedamount", "expenditureamount", "expenditure amount", "expenditure_amount"},
    "consent_amount": {"consentedamount", "consentamount", "consented amount", "consent amount", "consent_amount"},
    "work_category": {"workcategory", "work category", "work_category"},
    "state": {"state", "statename"},
    "constituency": {"constituency", "constituencyname"},
    "sanction_date": {"sanctiondate", "sanction date", "sanction_date"},
    "recommended_date": {"recommendeddate", "recommendationdate", "recommended date", "recommended_date"},
    "completion_date": {"actualenddate", "completiondate", "completion date", "completion_date"},
    "expenditure_date": {"expendituredate", "expenditure date", "expenditure_date"},
    "consent_date": {"consentdate", "dateofconsent", "consent date", "consent_date", "crtdt"},
    "mp_name": {"mpname", "mp name", "mp_name", "honblemembersofparliaments"},
    "work_status": {"workstatus", "work status", "work_status", "workstage", "filestatus"},
}


def _compact(value: Any) -> str:
    return "".join(ch.lower() for ch in str(value or "") if ch.isalnum())


def _normalise_frame(frame: pd.DataFrame) -> pd.DataFrame:
    known = {_compact(alias): target for target, aliases in FIELD_ALIASES.items() for alias in aliases}
    preferred = {
        "work_id": ("work_id", "WORK_ID", "WORK", "workid"),
        "work_recommendation_dtl_id": ("work_recommendation_dtl_id", "WORK_RECOMMENDATION_DTL_ID", "recommendationdtlid"),
        "description": ("description", "WORK_DESCRIPTION", "work_description", "ACTIVITY_NAME", "activity_name"),
        "state": ("state", "STATE_NAME", "State", "statename"),
        "constituency": ("constituency", "CONSTITUENCY", "Constituency", "constituencyname"),
        "mp_name": ("mp_name", "MP_NAME", "mpname"),
    }
    result = frame.copy()
    compact_columns = {_compact(column): column for column in result.columns}
    for target, aliases in FIELD_ALIASES.items():
        if target in result.columns:
            continue
        candidates = []
        for preferred_name in preferred.get(target, ()):
            if preferred_name in result.columns:
                candidates.append(preferred_name)
        candidates.extend(compact_columns[alias] for alias in aliases if alias in compact_columns and compact_columns[alias] not in candidates)
        if candidates:
            result[target] = result[candidates[0]]
    if "work_id" in result:
        result["work_id"] = result["work_id"].fillna("").astype(str).str.strip()
    if "work_recommendation_dtl_id" in result:
        result["work_recommendation_dtl_id"] = result["work_recommendation_dtl_id"].fillna("").astype(str).str.strip()
    if "work_id" in result and "ACTIVITY_NAME" in result:
        activity_ids = result["ACTIVITY_NAME"].map(
            lambda value: (re.search(r"(WS/\s*[A-Za-z0-9_-]+/\d{4}-\d{4}/\d+)", str(value or "")) or [None])[0]
        )
        activity_ids = activity_ids.astype("string").str.replace(r"^WS/\s+", "WS/", regex=True)
        existing_ids = result["work_id"].fillna("").astype(str).str.strip()
        numeric_or_empty = existing_ids.eq("") | existing_ids.str.fullmatch(r"\d+(?:\.0)?")
        result.loc[numeric_or_empty & activity_ids.notna(), "work_id"] = activity_ids[numeric_or_empty & activity_ids.notna()]
    for column in ("work_id", "work_recommendation_dtl_id"):
        if column not in result:
            result[column] = ""
        result[column] = result[column].fillna("").astype(str).str.strip()
        result[column] = result[column].str.replace(r"^(\d+)\.0$", r"\1", regex=True)
    missing_detail = result["work_recommendation_dtl_id"].eq("")
    derived_detail = result["work_id"].str.extract(r"/\d{4}-\d{4}/(\d+)(?:$|[-_])", expand=False)
    fallback_detail = result["work_id"].str.extract(r"/(\d+)(?:$|[-_])", expand=False)
    derived_detail = derived_detail.fillna(fallback_detail)
    result.loc[missing_detail & derived_detail.notna(), "work_recommendation_dtl_id"] = derived_detail[missing_detail & derived_detail.notna()]
    return result


def composite_key(row: pd.Series) -> str:
    work_id = str(row.get("work_id", "")).strip()
    detail_id = str(row.get("work_recommendation_dtl_id", "")).strip()
    if not work_id and not detail_id:
        return f"row::{row.name}"
    return f"{work_id}::{detail_id or work_id}"


def _stable_row_hash(row: pd.Series) -> str:
    values = {}
    for key, value in row.items():
        if key in {"__composite_key", "_row_hash"}:
            continue
        if pd.isna(value) if not isinstance(value, (list, dict, tuple)) else False:
            value = None
        if isinstance(value, (pd.Timestamp,)):
            value = value.isoformat()
        values[str(key)] = str(value)
    return hashlib.sha256(json.dumps(values, sort_keys=True, default=str).encode()).hexdigest()


COMPARE_FIELDS = {
    "t1": ("allocated_amount", "state", "constituency", "mp_name"),
    "t3": ("work_id", "work_recommendation_dtl_id", "description", "work_category", "recommended_amount", "recommended_date", "sanction_amount", "sanction_date", "work_status", "state", "constituency", "mp_name"),
    "t4": ("work_id", "work_recommendation_dtl_id", "description", "work_category", "recommended_date", "sanction_amount", "sanction_date", "work_status", "state", "constituency", "mp_name"),
    "t5": ("work_id", "work_recommendation_dtl_id", "description", "work_category", "completed_disbursed_amount", "completion_date", "work_status", "state", "constituency", "mp_name"),
    "t6": ("work_id", "work_recommendation_dtl_id", "description", "work_category", "expenditure_amount", "expenditure_date", "work_status", "state", "constituency", "mp_name"),
    "t7": ("consent_amount", "consent_date", "calamity_name", "mp_name"),
}


def _comparison_frame(frame: pd.DataFrame, table: str) -> pd.DataFrame:
    fields = COMPARE_FIELDS.get(table, tuple(frame.columns))
    projected = frame.reindex(columns=fields, fill_value="").copy()
    date_fields = {"recommended_date", "sanction_date", "completion_date", "expenditure_date", "consent_date"}
    numeric_fields = {"allocated_amount", "recommended_amount", "sanction_amount", "completed_disbursed_amount", "expenditure_amount", "consent_amount"}
    for column in fields:
        if column in date_fields:
            projected[column] = pd.to_datetime(projected[column], errors="coerce").dt.strftime("%Y-%m-%d").fillna("")
        elif column in numeric_fields:
            numeric = pd.to_numeric(projected[column], errors="coerce")
            projected[column] = numeric.map(lambda value: "" if pd.isna(value) else f"{float(value):.6f}")
    return projected.fillna("").astype(str)


def _indexed(frame: pd.DataFrame, table: str, include_data: bool = True) -> pd.DataFrame:
    frame = _normalise_frame(frame)
    work_ids = frame["work_id"].fillna("").astype(str).str.strip()
    detail_ids = frame["work_recommendation_dtl_id"].fillna("").astype(str).str.strip()
    fallback_ids = pd.Series(frame.index.astype(str), index=frame.index)
    frame["__composite_key"] = work_ids + "::" + detail_ids.where(detail_ids.ne(""), work_ids)
    frame.loc[work_ids.eq("") & detail_ids.eq(""), "__composite_key"] = "row::" + fallback_ids
    frame = frame.drop_duplicates("__composite_key", keep="last").set_index("__composite_key", drop=False)
    projected = _comparison_frame(frame, table)
    hashes = pd.util.hash_pandas_object(projected, index=False).astype(str).to_numpy()
    if include_data:
        frame["_row_hash"] = hashes
        return frame
    return pd.DataFrame({"_row_hash": hashes}, index=frame.index)


class MPLADSDeltaEngine:
    def __init__(self, processed_dir: str = PROCESSED_DIR):
        self.processed_dir = processed_dir

    def _load(self, path: str) -> pd.DataFrame:
        return pd.read_parquet(path) if os.path.exists(path) else pd.DataFrame()

    def compare_frames(self, current: pd.DataFrame, incoming: pd.DataFrame, table: str, include_records: bool = True) -> dict:
        old = _indexed(current, table, include_data=include_records)
        new = _indexed(incoming, table, include_data=include_records)
        new_keys_only = new.index.difference(old.index).sort_values()
        removed_keys = old.index.difference(new.index).sort_values()
        common = old.index.intersection(new.index).sort_values()
        old_hashes = old.loc[common, "_row_hash"].to_numpy()
        new_hashes = new.loc[common, "_row_hash"].to_numpy()
        modified_mask = old_hashes != new_hashes
        modified_count = int(modified_mask.sum())
        modified_keys = common[modified_mask].tolist() if include_records else []

        def records(keys, left, right):
            if not include_records:
                return []
            output = []
            for key in keys:
                old_row = left.loc[key].drop(labels=["_row_hash"], errors="ignore").to_dict() if key in left.index else None
                new_row = right.loc[key].drop(labels=["_row_hash"], errors="ignore").to_dict() if key in right.index else None
                output.append({"table": table, "composite_key": key, "old": old_row, "new": new_row})
            return output

        return {
            "table": table,
            "new": records(new_keys_only, old, new),
            "modified": records(modified_keys, old, new),
            "removed": records(removed_keys, old, new),
            "new_count": len(new_keys_only),
            "modified_count": len(modified_keys),
            "removed_count": len(removed_keys),
            "unchanged_count": len(common) - modified_count,
        }

    def compare_staging(self, staging_dir: str) -> dict:
        result = {"generated_at": datetime.now(timezone.utc).isoformat(), "tables": {},
                  "new_count": 0, "updated_count": 0, "removed_count": 0, "unchanged_count": 0}
        for table, filename in MONITORED_FILES.items():
            incoming_path = os.path.join(staging_dir, filename)
            if not os.path.exists(incoming_path):
                continue
            diff = self.compare_frames(
                self._load(os.path.join(self.processed_dir, filename)),
                self._load(incoming_path), table,
            )
            result["tables"][table] = diff
            result["new_count"] += len(diff["new"])
            result["updated_count"] += len(diff["modified"])
            result["removed_count"] += len(diff["removed"])
            result["unchanged_count"] += diff["unchanged_count"]
        result["total_changes"] = result["new_count"] + result["updated_count"]
        return result

    def compare_current(self) -> dict:
        result = {"generated_at": datetime.now(timezone.utc).isoformat(), "tables": {},
                  "new_count": 0, "updated_count": 0, "removed_count": 0, "unchanged_count": 0}
        for table, filename in MONITORED_FILES.items():
            path = os.path.join(self.processed_dir, filename)
            if os.path.exists(path):
                frame = self._load(path)
                result["tables"][table] = {"table": table, "current_count": len(frame)}
                result["unchanged_count"] += len(frame)
        return result

    def commit_staging(self, staging_dir: str, diff: dict) -> dict:
        if not diff.get("tables"):
            raise ValueError("No staged tables are available for promotion")
        state = {"last_commit_at": datetime.now(timezone.utc).isoformat(), "tables": {},
                 "last_diff": diff}
        for table, filename in MONITORED_FILES.items():
            source = os.path.join(staging_dir, filename)
            if not os.path.exists(source):
                continue
            destination = os.path.join(self.processed_dir, filename)
            os.makedirs(self.processed_dir, exist_ok=True)
            temp = f"{destination}.sync-tmp"
            shutil.copy2(source, temp)
            os.replace(temp, destination)
            state["tables"][table] = {"file": filename, "rows": int(len(pd.read_parquet(destination)))}
        with open(SYNC_STATE_FILE, "w", encoding="utf-8") as handle:
            json.dump(state, handle, indent=2, default=str)
        with open(SYNC_AUDIT_FILE, "a", encoding="utf-8") as handle:
            handle.write(json.dumps({"event": "commit", "state": state}, default=str) + "\n")
        return state
