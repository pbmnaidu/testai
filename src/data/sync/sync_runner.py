"""Automatic and user-triggered REST sync orchestration."""
from __future__ import annotations

import json
import os
import shutil
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import pandas as pd

from src.data.sync.delta_engine import COMPARE_FIELDS, MPLADSDeltaEngine
from src.data.sync.snapshot_manager import create_snapshot, get_snapshot_history
from src.data.sync.source_adapter import MPLADSRestClient
from src.data.sync.sync_config import (
    DATA_DIR, MONITORED_FILES, PROCESSED_DIR, SOURCE_URL, SYNC_AUDIT_FILE,
    SYNC_DAILY_TIME, SYNC_INTERVAL_HOURS, SYNC_JOB_STATUS_FILE, SNAPSHOTS_DIR,
    SYNC_LOG_FILE,
)
from src.data.sync.training_manager import TRAINING_MANAGER

_PREVIEW_DIR = os.path.join(DATA_DIR, "sync_previews")
_scheduler_started = False
_scheduler_lock = threading.Lock()
_sync_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mplads-sync")
_sync_job_lock = threading.Lock()
_job_status_lock = threading.Lock()
_current_job_future: Optional[object] = None
_current_job_id: Optional[str] = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _next_scheduled_sync(now: datetime | None = None) -> datetime:
    """Return the next configured automatic run in UTC.

    ``MPLADS_SYNC_DAILY_TIME=02:00`` enables a daily fixed-time run.  In all
    other deployments the configurable hour interval is used.
    """
    now = now or _now()
    if SYNC_DAILY_TIME:
        try:
            hour, minute = (int(part) for part in SYNC_DAILY_TIME.split(":", 1))
            candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            return candidate if candidate > now else candidate + timedelta(days=1)
        except (TypeError, ValueError):
            pass
    return now + timedelta(hours=SYNC_INTERVAL_HOURS)


def _schedule_label() -> str:
    return f"Daily at {SYNC_DAILY_TIME} UTC" if SYNC_DAILY_TIME else f"Every {SYNC_INTERVAL_HOURS} Hours (Automatic)"


def _write_job_status(payload: dict) -> dict:
    os.makedirs(os.path.dirname(SYNC_JOB_STATUS_FILE), exist_ok=True)
    with open(SYNC_JOB_STATUS_FILE, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, default=str)
    return payload


def _reconcile_orphan_status(data: dict) -> dict:
    """Check if an on-disk RUNNING or QUEUED job is actually dead or orphaned."""
    global _current_job_future, _current_job_id
    job_id = data.get("job_id")

    # If this process is actively running this exact job:
    if _current_job_id == job_id and _current_job_future is not None:
        if hasattr(_current_job_future, "done") and not _current_job_future.done():
            return data
        try:
            exc = _current_job_future.exception(timeout=0) if hasattr(_current_job_future, "exception") else None
            if exc:
                data.update({
                    "status": "FAILED",
                    "completed_at": _now().isoformat(),
                    "message": _friendly_error(exc),
                    "technical_error": str(exc),
                })
                _write_job_status(data)
                return data
        except Exception:
            pass

    # If no thread in this process is running it, check timestamp staleness
    updated_at_str = data.get("updated_at") or data.get("started_at") or data.get("queued_at")
    is_stale = False
    if updated_at_str:
        try:
            updated_dt = datetime.fromisoformat(str(updated_at_str))
            if updated_dt.tzinfo is None:
                updated_dt = updated_dt.replace(tzinfo=timezone.utc)
            age_sec = (_now() - updated_dt).total_seconds()
            if (_current_job_future is None and age_sec > 60) or age_sec > 900:
                is_stale = True
        except Exception:
            is_stale = True
    else:
        is_stale = True

    if is_stale:
        data.update({
            "status": "FAILED",
            "completed_at": _now().isoformat(),
            "message": "The previous synchronization was interrupted (server restart or timeout). You may safely run sync again.",
            "technical_error": "Job was detected as orphaned from a previous server session or timeout.",
        })
        _write_job_status(data)
    return data


def _read_job_status(reconcile: bool = True) -> dict:
    try:
        with open(SYNC_JOB_STATUS_FILE, encoding="utf-8") as handle:
            data = json.load(handle)
    except Exception:
        data = {"status": "IDLE", "message": "No synchronization job is running.", "datasets": [], "counters": {}}
    if reconcile and data.get("status") in {"QUEUED", "RUNNING"}:
        data = _reconcile_orphan_status(data)
    return data


def _update_job_status(job_id: str, event: dict | None = None, **updates) -> dict:
    with _job_status_lock:
        current = _read_job_status()
        payload = dict(current)
        payload.update(updates)
        payload["job_id"] = job_id
        payload["updated_at"] = _now().isoformat()
        if event:
            event_name = event.get("event", "operation")
            payload["last_event"] = event_name
            payload["last_event_at"] = event.get("timestamp") or _now().isoformat()
            payload["message"] = event.get("message") or payload.get("message") or event_name.replace("_", " ").title()
            payload["event_detail"] = {
                key: value for key, value in event.items()
                if key not in {"timestamp", "error"}
            }
            if event.get("error"):
                payload["technical_error"] = str(event["error"])
            dataset = event.get("dataset")
            if dataset:
                datasets = list(payload.get("datasets") or [])
                row = next((item for item in datasets if item.get("dataset") == dataset), None)
                if row is None:
                    row = {"dataset": dataset}
                    datasets.append(row)
                row.update({
                    key: value for key, value in event.items()
                    if key in {"status", "label", "records_received", "records_processed", "records_failed", "pages_fetched", "error"}
                })
                if event_name == "dataset_fetch_started":
                    row["status"] = "RUNNING"
                elif event_name == "dataset_completed":
                    row["status"] = "COMPLETED"
                elif event_name == "dataset_failed":
                    row["status"] = "FAILED"
                payload["datasets"] = datasets
            counters = dict(payload.get("counters") or {})
            for key in ("records_received", "records_processed", "pages_fetched", "api_requests", "retry_count"):
                if key in event:
                    counters[key] = event[key]
            payload["counters"] = counters
        return _write_job_status(payload)


def _append_audit(event: dict) -> None:
    """Write compact, credential-free operational events for later review."""
    os.makedirs(os.path.dirname(SYNC_AUDIT_FILE), exist_ok=True)
    event = {"timestamp": _now().isoformat(), **event}
    with open(SYNC_AUDIT_FILE, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, default=str) + "\n")


def _friendly_error(error: object) -> str:
    text = str(error or "").lower()
    if any(token in text for token in ("timeout", "timed out")):
        return "The source service did not respond in time. The previous validated dataset remains available."
    if any(token in text for token in ("429", "too many requests")):
        return "The source service is temporarily limiting requests. Please try synchronization again later."
    if any(token in text for token in ("connection", "urlopen", "reset", "refused", "dns")):
        return "The source service could not be reached. The previous validated dataset remains available."
    if "required column" in text or "validation" in text:
        return "The dataset was received but did not pass validation. The previous validated dataset remains available."
    return "Synchronization could not be completed. The previous validated dataset remains available."


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
    now = _now()
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
        "records_requested": None,
        "records_received": snapshot["total_records"],
        "records_inserted": diff["new_count"],
        "records_updated": diff["updated_count"],
        "records_skipped": diff["unchanged_count"],
        "records_failed": 0,
        "pages_fetched": len(MONITORED_FILES),
        "api_requests": 0,
        "retry_count": 0,
        "training_triggered": training_status != "NOT_STARTED",
        "risk_analysis_triggered": training_status != "NOT_STARTED",
        "error_count": 0,
        "datasets": list(MONITORED_FILES.keys()),
        "last_successful_sync": now.isoformat(),
        "training_status": training_status,
        "next_scheduled_sync": _next_scheduled_sync(now).isoformat(),
        "delta": diff,
    }
    _write_history(entry)
    return entry


def preview_diff(filters: dict | None = None, progress_callback=None) -> dict:
    token = uuid.uuid4().hex
    staging_dir = os.path.join(_PREVIEW_DIR, token)
    fetch = MPLADSRestClient().fetch_to_staging(staging_dir, progress_callback=progress_callback)
    if not fetch.get("success"):
        return {"success": False, "fetch": fetch, "source_url": SOURCE_URL}
    diff = MPLADSDeltaEngine().compare_staging(staging_dir)
    payload = {"success": True, "preview_token": token, "fetch": fetch, "diff": diff,
               "filters": filters or {}, "created_at": datetime.now(timezone.utc).isoformat()}
    with open(os.path.join(staging_dir, "preview.json"), "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, default=str)
    return payload


def commit_preview(preview_token: str, progress_callback=None) -> dict:
    staging_dir = os.path.join(_PREVIEW_DIR, os.path.basename(preview_token))
    meta_path = os.path.join(staging_dir, "preview.json")
    if not os.path.exists(meta_path):
        raise ValueError("Preview token is expired or unknown")
    with open(meta_path, encoding="utf-8") as handle:
        preview = json.load(handle)
    diff = preview["diff"]
    fetch = preview.get("fetch", {})
    if progress_callback:
        progress_callback({"event": "dataset_promotion_started", "message": "Promoting the validated dataset version."})
    state = MPLADSDeltaEngine().commit_staging(staging_dir, diff)
    snapshot = create_snapshot()
    now = _now()
    counters = fetch.get("counters", {})
    entry = {
        "sync_id": f"SYNC-{now.strftime('%Y%m%dT%H%M%SZ')}", "timestamp": now.isoformat(),
        "started_at": preview.get("created_at"), "completed_at": now.isoformat(),
        "status": "SUCCESS", "mode": "manual_or_scheduled", "source_url": SOURCE_URL,
        "data_origin": "official_api",
        "snapshot_id": snapshot["snapshot_id"], "total_records": snapshot["total_records"],
        "new_records_count": diff.get("new_count", 0), "updated_records_count": diff.get("updated_count", 0),
        "removed_records_count": diff.get("removed_count", 0), "unchanged_records_count": diff.get("unchanged_count", 0),
        "records_requested": None, "records_received": counters.get("records_received", 0),
        "records_inserted": diff.get("new_count", 0), "records_updated": diff.get("updated_count", 0),
        "records_skipped": diff.get("unchanged_count", 0), "records_failed": counters.get("datasets_failed", 0),
        "pages_fetched": counters.get("pages_fetched", 0), "api_requests": counters.get("api_requests", 0),
        "retry_count": counters.get("retry_count", 0), "training_triggered": True,
        "risk_analysis_triggered": True, "error_count": 0,
        "datasets": list(fetch.get("tables", {}).keys()),
        "counters": counters,
        "last_successful_sync": now.isoformat(),
        "next_scheduled_sync": _next_scheduled_sync(now).isoformat(),
        "delta": diff,
    }
    _write_history(entry)
    _append_audit({"sync_id": entry["sync_id"], "event": "sync_committed", "status": "SUCCESS", "snapshot_id": snapshot["snapshot_id"], "counters": counters})
    if progress_callback:
        progress_callback({
            "event": "dataset_promotion_completed",
            "snapshot_id": snapshot["snapshot_id"],
            "records_processed": snapshot["total_records"],
            "message": "Dataset promotion completed; queuing model retraining.",
        })
    training = TRAINING_MANAGER.start(snapshot["snapshot_id"], diff)
    if progress_callback:
        progress_callback({"event": "analysis_queued", "training": training, "message": "Validated data was published and analysis was queued."})
    shutil.rmtree(staging_dir, ignore_errors=True)
    return {"success": True, "sync": entry, "state": state, "training": training}


def run_sync_job(progress_callback=None, job_id: str | None = None) -> dict:
    job_id = job_id or f"SYNCJOB-{uuid.uuid4().hex[:12].upper()}"

    def emit(event: dict) -> None:
        _update_job_status(job_id, event)
        if progress_callback:
            progress_callback(event)

    try:
        _update_job_status(
            job_id,
            status="RUNNING",
            started_at=_now().isoformat(),
            message="Connecting to the official MPLADS data source.",
            datasets=[],
            counters={},
        )
        preview = preview_diff(progress_callback=emit)
        if not preview.get("success"):
            now = _now()
            fetch = preview.get("fetch", {})
            counters = fetch.get("counters", {})
            raw_error = fetch.get("error") or "; ".join(fetch.get("errors", [])) or "REST fetch failed"
            entry = {"sync_id": f"SYNC-{now.strftime('%Y%m%dT%H%M%SZ')}", "timestamp": now.isoformat(),
                     "started_at": preview.get("created_at"), "completed_at": now.isoformat(), "status": "FAILED", "source_url": SOURCE_URL,
                     "error": raw_error, "user_message": _friendly_error(raw_error), "records_received": counters.get("records_received", 0),
                     "records_failed": counters.get("records_failed", 0), "records_skipped": counters.get("records_skipped", 0),
                     "datasets_failed": counters.get("datasets_failed", 0), "pages_fetched": counters.get("pages_fetched", 0),
                     "api_requests": counters.get("api_requests", 0), "retry_count": counters.get("retry_count", 0),
                     "training_triggered": False, "risk_analysis_triggered": False, "error_count": max(1, len(fetch.get("errors", []))),
                     "datasets": list(fetch.get("tables", {}).keys()), "counters": counters,
                     "next_scheduled_sync": _next_scheduled_sync(now).isoformat()}
            _write_history(entry)
            _append_audit({"sync_id": entry["sync_id"], "event": "sync_failed", "status": "FAILED", "error": raw_error, "counters": counters})
            _update_job_status(
                job_id,
                status="FAILED",
                completed_at=now.isoformat(),
                message=entry["user_message"],
                counters=counters,
                error_count=entry["error_count"],
                technical_error=raw_error,
            )
            if progress_callback:
                progress_callback({"event": "sync_failed", "message": entry["user_message"], "error": raw_error})
            return {"success": False, "sync": entry, "fetch": preview.get("fetch")}

        result = commit_preview(preview["preview_token"], progress_callback=emit)
        if result.get("success"):
            _update_job_status(
                job_id,
                status="COMPLETED",
                completed_at=_now().isoformat(),
                message="Synchronization completed. Validated data was published and analysis was queued.",
                snapshot_id=result.get("sync", {}).get("snapshot_id"),
                sync_id=result.get("sync", {}).get("sync_id"),
                counters=result.get("sync", {}).get("counters", {}),
                training=result.get("training"),
            )
        return result
    except Exception as exc:
        now = _now()
        error_msg = str(exc)
        friendly = _friendly_error(error_msg)
        _update_job_status(
            job_id,
            status="FAILED",
            completed_at=now.isoformat(),
            message=friendly,
            technical_error=error_msg,
        )
        if progress_callback:
            progress_callback({"event": "sync_failed", "message": friendly, "error": error_msg})
        return {"success": False, "error": error_msg, "user_message": friendly}


def reset_sync_job() -> dict:
    """Explicitly reset any synchronization job back to IDLE."""
    global _current_job_future, _current_job_id
    with _sync_job_lock:
        if _current_job_future and hasattr(_current_job_future, "cancel") and not _current_job_future.done():
            try:
                _current_job_future.cancel()
            except Exception:
                pass
        _current_job_future = None
        _current_job_id = None
        now = _now()
        cleared = {
            "status": "IDLE",
            "message": "Synchronization was reset. Ready to sync.",
            "datasets": [],
            "counters": {},
            "reset_at": now.isoformat(),
        }
        with _job_status_lock:
            return _write_job_status(cleared)


def reconcile_sync_state() -> dict:
    """Public helper to reconcile sync state on startup or API call."""
    with _job_status_lock:
        return _read_job_status(reconcile=True)


def start_sync_job(force: bool = False) -> dict:
    """Queue one non-blocking synchronization job and return its live status."""
    global _current_job_future, _current_job_id
    with _sync_job_lock:
        current = _read_job_status(reconcile=True)
        is_active = (
            _current_job_id == current.get("job_id") and
            _current_job_future is not None and
            hasattr(_current_job_future, "done") and
            not _current_job_future.done()
        )
        if not force and current.get("status") in {"QUEUED", "RUNNING"} and is_active:
            return current
        job_id = f"SYNCJOB-{uuid.uuid4().hex[:12].upper()}"
        _current_job_id = job_id
        queued = {
            "job_id": job_id,
            "status": "QUEUED",
            "message": "Synchronization queued.",
            "queued_at": _now().isoformat(),
            "datasets": [],
            "counters": {},
        }
        with _job_status_lock:
            _write_job_status(queued)
        _current_job_future = _sync_executor.submit(run_sync_job, None, job_id)
        return queued


def get_sync_status() -> dict:
    history = _read_history()
    latest = history[0] if history else {}
    successful = next((item for item in history if item.get("status") == "SUCCESS"), {})
    snapshot_history = get_snapshot_history()
    current_snapshot = successful.get("snapshot_id", snapshot_history[0].get("snapshot_id") if snapshot_history else "NONE")

    # Auto-initialize baseline snapshot if NONE but processed files exist
    if current_snapshot == "NONE":
        has_processed = any(os.path.exists(os.path.join(PROCESSED_DIR, f)) for f in MONITORED_FILES.values())
        if has_processed:
            try:
                base_snap = create_snapshot()
                current_snapshot = base_snap["snapshot_id"]
                snapshot_history = get_snapshot_history()
            except Exception:
                pass

    local_delta = latest.get("delta") if latest.get("data_origin") == "local_dataset_files" else None
    return {
        "operational_status": "healthy" if latest.get("status", "SUCCESS") != "FAILED" else "degraded",
        "sync_frequency": _schedule_label(),
        "source_url": SOURCE_URL,
        "data_origin": latest.get("data_origin") or ("official_api" if latest else None),
        "last_sync": latest.get("timestamp"), "next_scheduled_sync": latest.get("next_scheduled_sync"),
        "current_snapshot_id": current_snapshot,
        "total_records_processed": latest.get("total_records", 0),
        "new_records_since_last_sync": latest.get("new_records_count", 0),
        "updated_records_since_last_sync": latest.get("updated_records_count", 0),
        "removed_records_since_last_sync": latest.get("removed_records_count", 0),
        "pending_local_dataset_changes": False,
        "local_dataset_delta": local_delta,
        "snapshot_count": len(snapshot_history), "training": TRAINING_MANAGER.status(),
        "job": _read_job_status(reconcile=True),
        "last_successful_sync": successful.get("completed_at") or successful.get("timestamp"),
        "data_version": current_snapshot,
        "analysis_version": (TRAINING_MANAGER.status() or {}).get("snapshot_id") or "UNKNOWN",
        "analysis_generated_at": (TRAINING_MANAGER.status() or {}).get("completed_at"),
    }


def get_sync_health() -> dict:
    """Return source health metrics from credential-free request telemetry."""
    events = []
    try:
        with open(SYNC_AUDIT_FILE, encoding="utf-8") as handle:
            for line in handle.readlines()[-500:]:
                try:
                    item = json.loads(line)
                    if str(item.get("event", "")).startswith("api_request_"):
                        events.append(item)
                except json.JSONDecodeError:
                    continue
    except OSError:
        pass
    completed = [item for item in events if item.get("event") == "api_request_completed"]
    failed = [item for item in events if item.get("event") == "api_request_failed"]
    latest_success = completed[-1] if completed else None
    latest_failure = failed[-1] if failed else None
    attempts = len(completed) + len(failed)
    response_times = [float(item["response_ms"]) for item in completed if item.get("response_ms") is not None]
    status = get_sync_status()
    return {
        "source_url": SOURCE_URL,
        "status": "available" if latest_success and not (latest_failure and latest_failure.get("timestamp", "") > latest_success.get("timestamp", "")) else "degraded" if latest_failure else "unknown",
        "last_successful_request": latest_success.get("timestamp") if latest_success else None,
        "last_failure": latest_failure.get("timestamp") if latest_failure else None,
        "response_time_ms": round(sum(response_times) / len(response_times), 1) if response_times else None,
        "records_fetched": int(status.get("job", {}).get("counters", {}).get("records_received", 0) or status.get("total_records_processed", 0) or 0),
        "request_count": attempts,
        "error_count": len(failed),
        "error_rate": round(len(failed) / attempts, 4) if attempts else 0.0,
        "last_sync": status.get("last_sync"),
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
        interval = max(60, int(SYNC_INTERVAL_HOURS * 3600))
        while True:
            history = _read_history()
            delay = interval
            if history and history[0].get("next_scheduled_sync"):
                try:
                    due = datetime.fromisoformat(str(history[0]["next_scheduled_sync"]))
                    if due.tzinfo is None:
                        due = due.replace(tzinfo=timezone.utc)
                    delay = max(60, (due - datetime.now(timezone.utc)).total_seconds())
                except (TypeError, ValueError):
                    delay = interval
            time.sleep(delay)
            try:
                start_sync_job()
            except Exception as exc:
                print(f"[MPLADS scheduler] sync failed: {exc}")

    threading.Thread(target=worker, name="mplads-sync-scheduler", daemon=True).start()
