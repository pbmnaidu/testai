"""Automatic and user-triggered REST sync orchestration."""
from __future__ import annotations

import json
import os
import shutil
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone

import pandas as pd

from src.data.sync.delta_engine import COMPARE_FIELDS, MPLADSDeltaEngine
from src.data.sync.snapshot_manager import create_snapshot, get_snapshot_history
from src.data.sync.source_adapter import MPLADSRestClient
from src.data.sync.sync_config import (
    DATA_DIR, MONITORED_FILES, PROCESSED_DIR, SOURCE_URL, SYNC_INTERVAL_DAYS,
    SNAPSHOTS_DIR, SYNC_LOG_FILE,
)
from src.data.sync.training_manager import TRAINING_MANAGER

_PREVIEW_DIR = os.path.join(DATA_DIR, "sync_previews")
_scheduler_started = False
_scheduler_lock = threading.Lock()


def _read_history() -> list:
    try:
        with open(SYNC_LOG_FILE, encoding="utf-8") as handle:
            value = json.load(handle)
            return value if isinstance(value, list) else []
    except Exception:
        return []


def _write_history(entry: dict) -> None:
    history = _read_history()
    history.insert(0, entry)
    os.makedirs(os.path.dirname(SYNC_LOG_FILE), exist_ok=True)
    with open(SYNC_LOG_FILE, "w", encoding="utf-8") as handle:
        json.dump(history[:50], handle, indent=2, default=str)


def _stage_name(prefix: str) -> str:
    os.makedirs(_PREVIEW_DIR, exist_ok=True)
    return os.path.join(_PREVIEW_DIR, f"{prefix}-{uuid.uuid4().hex[:12]}")


def _processed_files_maybe_changed(snapshot: dict) -> bool:
    """Avoid rereading six large Parquet files on every status refresh."""
    created_at = snapshot.get("created_at")
    try:
        snapshot_time = datetime.fromisoformat(str(created_at)).astimezone().timestamp()
    except (TypeError, ValueError, OverflowError):
        snapshot_time = 0
    for filename in MONITORED_FILES.values():
        current_path = os.path.join(PROCESSED_DIR, filename)
        if not os.path.exists(current_path):
            return True
        if snapshot_time and os.path.getmtime(current_path) > snapshot_time + 1:
            return True
    return False


def _read_delta_frame(path: str, table: str) -> pd.DataFrame:
    """Read only comparison columns for local status/count calculations."""
    try:
        import pyarrow.parquet as parquet
        available = set(parquet.ParquetFile(path).schema.names)
        columns = [column for column in COMPARE_FIELDS.get(table, ()) if column in available]
        return pd.read_parquet(path, columns=columns)
    except Exception:
        return pd.read_parquet(path)


def _compare_processed_to_snapshot(snapshot: dict | None) -> dict:
    """Compare current local processed files with the latest recorded snapshot."""
    result = {"generated_at": datetime.now(timezone.utc).isoformat(), "tables": {},
              "new_count": 0, "updated_count": 0, "removed_count": 0, "unchanged_count": 0}
    if not snapshot:
        result["has_previous_snapshot"] = False
        result["total_changes"] = 0
        return result

    result["has_previous_snapshot"] = True
    if not _processed_files_maybe_changed(snapshot):
        result["total_changes"] = 0
        return result
    previous_dir = os.path.join(SNAPSHOTS_DIR, snapshot.get("date", ""))
    engine = MPLADSDeltaEngine()
    for table, filename in MONITORED_FILES.items():
        current_path = os.path.join(PROCESSED_DIR, filename)
        previous_path = os.path.join(previous_dir, filename)
        if not os.path.exists(current_path) and not os.path.exists(previous_path):
            continue
        current = _read_delta_frame(current_path, table) if os.path.exists(current_path) else pd.DataFrame()
        previous = _read_delta_frame(previous_path, table) if os.path.exists(previous_path) else pd.DataFrame()
        # Status/history only need aggregate counts. Record-level rows remain
        # available in the official API preview path.
        diff = engine.compare_frames(previous, current, table, include_records=False)
        result["tables"][table] = diff
        result["new_count"] += diff.get("new_count", len(diff["new"]))
        result["updated_count"] += diff.get("modified_count", len(diff["modified"]))
        result["removed_count"] += diff.get("removed_count", len(diff["removed"]))
        result["unchanged_count"] += diff["unchanged_count"]
    result["total_changes"] = result["new_count"] + result["updated_count"] + result["removed_count"]
    return result


def record_local_pipeline_run(training_status: str = "COMPLETED") -> dict:
    """Record a successful manual/local pipeline run in Data Sync history.

    The normal API sync path records deltas when an official preview is
    committed. A user can also edit the local dataset files and run the full
    pipeline directly, so that path needs the same snapshot and counters.
    """
    snapshots = get_snapshot_history()
    previous = snapshots[0] if snapshots else None
    diff = _compare_processed_to_snapshot(previous)
    snapshot = create_snapshot()
    now = datetime.now(timezone.utc)
    entry = {
        "sync_id": f"LOCAL-{now.strftime('%Y%m%dT%H%M%SZ')}",
        "timestamp": now.isoformat(),
        "status": "SUCCESS",
        "mode": "local_dataset_pipeline",
        "source_url": "LOCAL_DATASET_FILES",
        "data_origin": "local_dataset_files",
        "snapshot_id": snapshot["snapshot_id"],
        "total_records": snapshot["total_records"],
        "new_records_count": diff["new_count"],
        "updated_records_count": diff["updated_count"],
        "removed_records_count": diff["removed_count"],
        "unchanged_records_count": diff["unchanged_count"],
        "training_status": training_status,
        "next_scheduled_sync": (now + timedelta(days=SYNC_INTERVAL_DAYS)).strftime("%Y-%m-%d %H:%M:%S"),
        "delta": diff,
    }
    _write_history(entry)
    return entry


def preview_diff(filters: dict | None = None) -> dict:
    token = uuid.uuid4().hex
    staging_dir = os.path.join(_PREVIEW_DIR, token)
    fetch = MPLADSRestClient().fetch_to_staging(staging_dir)
    if not fetch.get("success"):
        return {"success": False, "fetch": fetch, "source_url": SOURCE_URL}
    diff = MPLADSDeltaEngine().compare_staging(staging_dir)
    payload = {"success": True, "preview_token": token, "fetch": fetch, "diff": diff,
               "filters": filters or {}, "created_at": datetime.now(timezone.utc).isoformat()}
    with open(os.path.join(staging_dir, "preview.json"), "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, default=str)
    return payload


def commit_preview(preview_token: str) -> dict:
    staging_dir = os.path.join(_PREVIEW_DIR, os.path.basename(preview_token))
    meta_path = os.path.join(staging_dir, "preview.json")
    if not os.path.exists(meta_path):
        raise ValueError("Preview token is expired or unknown")
    with open(meta_path, encoding="utf-8") as handle:
        preview = json.load(handle)
    diff = preview["diff"]
    state = MPLADSDeltaEngine().commit_staging(staging_dir, diff)
    snapshot = create_snapshot()
    now = datetime.now(timezone.utc)
    entry = {
        "sync_id": f"SYNC-{now.strftime('%Y%m%dT%H%M%SZ')}", "timestamp": now.isoformat(),
        "status": "SUCCESS", "mode": "manual_or_scheduled", "source_url": SOURCE_URL,
        "snapshot_id": snapshot["snapshot_id"], "total_records": snapshot["total_records"],
        "new_records_count": diff.get("new_count", 0), "updated_records_count": diff.get("updated_count", 0),
        "removed_records_count": diff.get("removed_count", 0), "unchanged_records_count": diff.get("unchanged_count", 0),
        "next_scheduled_sync": (now + timedelta(days=SYNC_INTERVAL_DAYS)).strftime("%Y-%m-%d %H:%M:%S"),
        "delta": diff,
    }
    _write_history(entry)
    training = TRAINING_MANAGER.start(snapshot["snapshot_id"], diff)
    shutil.rmtree(staging_dir, ignore_errors=True)
    return {"success": True, "sync": entry, "state": state, "training": training}


def run_sync_job() -> dict:
    preview = preview_diff()
    if not preview.get("success"):
        now = datetime.now(timezone.utc)
        entry = {"sync_id": f"SYNC-{now.strftime('%Y%m%dT%H%M%SZ')}", "timestamp": now.isoformat(),
                 "status": "FAILED", "source_url": SOURCE_URL, "error": preview.get("fetch", {}).get("error") or "; ".join(preview.get("fetch", {}).get("errors", [])) or "REST fetch failed",
                 "next_scheduled_sync": (now + timedelta(days=SYNC_INTERVAL_DAYS)).strftime("%Y-%m-%d %H:%M:%S")}
        _write_history(entry)
        return {"success": False, "sync": entry, "fetch": preview.get("fetch")}
    return commit_preview(preview["preview_token"])


def get_sync_status() -> dict:
    history = _read_history()
    latest = history[0] if history else {}
    snapshot_history = get_snapshot_history()
    # Counts are written when the local pipeline completes. Do not recompute
    # six large Parquet deltas on every dashboard refresh; the history entry
    # is the durable, auditable source for the displayed counters.
    local_delta = latest.get("delta") if latest.get("data_origin") == "local_dataset_files" else None
    return {
        "operational_status": "healthy" if latest.get("status", "SUCCESS") != "FAILED" else "degraded",
        "sync_frequency": f"Every {SYNC_INTERVAL_DAYS} Days (Automatic)",
        "source_url": SOURCE_URL,
        "data_origin": latest.get("data_origin") or ("official_api" if latest else None),
        "last_sync": latest.get("timestamp"), "next_scheduled_sync": latest.get("next_scheduled_sync"),
        "current_snapshot_id": latest.get("snapshot_id", snapshot_history[0].get("snapshot_id") if snapshot_history else "NONE"),
        "total_records_processed": latest.get("total_records", 0),
        "new_records_since_last_sync": latest.get("new_records_count", 0),
        "updated_records_since_last_sync": latest.get("updated_records_count", 0),
        "removed_records_since_last_sync": latest.get("removed_records_count", 0),
        "pending_local_dataset_changes": False,
        "local_dataset_delta": local_delta,
        "snapshot_count": len(snapshot_history), "training": TRAINING_MANAGER.status(),
    }


def start_scheduler() -> None:
    global _scheduler_started
    if os.getenv("MPLADS_AUTOMATION_ENABLED", "true").lower() in {"0", "false", "no"}:
        return
    with _scheduler_lock:
        if _scheduler_started:
            return
        _scheduler_started = True

    def worker():
        interval = SYNC_INTERVAL_DAYS * 86400
        while True:
            history = _read_history()
            delay = interval
            if history and history[0].get("next_scheduled_sync"):
                try:
                    due = datetime.strptime(history[0]["next_scheduled_sync"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                    delay = max(60, (due - datetime.now(timezone.utc)).total_seconds())
                except (TypeError, ValueError):
                    delay = interval
            time.sleep(delay)
            try:
                run_sync_job()
            except Exception as exc:
                print(f"[MPLADS scheduler] sync failed: {exc}")

    threading.Thread(target=worker, name="mplads-sync-scheduler", daemon=True).start()
