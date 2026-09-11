"""Official MPLADS REST client and safe staging adapter."""
from __future__ import annotations

import json
import http.client
import os
import re
import ssl
import threading
import time
import uuid
import urllib.request
from urllib.error import HTTPError, URLError
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any, Callable

import pandas as pd

from src.data.sync.delta_engine import _normalise_frame
from src.data.sync.sync_config import (
    MONITORED_FILES, OFFICIAL_SOURCE_URL, RAW_DIR, REQUEST_TIMEOUT_SECONDS,
    SOURCE_URL, SYNC_AUDIT_FILE, VERIFY_SSL,
)

DEFAULT_TILE_KEY = "Works Completed"
DEFAULT_COMBO = "0,0,0,2"
SOURCE_TABLE_REQUESTS = (
    ("t1", "Allocated Limit for Hon'ble MPs"),
    ("t3", "Works Recommended"),
    ("t4", "Works Sanctioned"),
    ("t5", "Works Completed"),
    ("t6", "Expenditure on Completed and On-going Works as on Date"),
    ("t7", "Amount consented for Calamity"),
)

REQUIRED_COLUMN_GROUPS = {
    "t1": (("mp", "mpname", "honblemembersofparliaments"), ("state", "statename"), ("constituency",)),
    "t3": (("workid", "workrecommendationdtlid"), ("state", "statename"), ("constituency",), ("workdescription", "description", "activityname")),
    "t4": (("workid", "workrecommendationdtlid"), ("state", "statename"), ("constituency",), ("workdescription", "description", "activityname")),
    "t5": (("workid", "workrecommendationdtlid"), ("state", "statename"), ("constituency",), ("workdescription", "description", "activityname")),
    "t6": (("workid", "workrecommendationdtlid"), ("state", "statename"), ("constituency",), ("expenditureamount", "actualamount", "disbursedamount", "funddisbursedamount")),
    "t7": (("calamity", "calamityname", "consentamount", "consentedamount", "amountconsented"),),
}


def _key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def _decode_json_value(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (TypeError, ValueError):
            return value
    return value


ALIASES = {
    "t1": {"t1", "allocatedlimit", "allocatedlimits", "allocatedlimitdata"},
    "t3": {"t3", "worksrecommended", "recommendedworks", "recommended"},
    "t4": {"t4", "workssanctioned", "sanctionedworks", "sanctioned"},
    "t5": {"t5", "workscompleted", "completedworks", "completed"},
    "t6": {"t6", "expenditure", "expenditurerecords", "expendituredata"},
    "t7": {"t7", "calamityconsents", "amountconsentedforcalamity", "calamity"},
}


def _append_operational_event(event: dict) -> None:
    """Persist credential-free request telemetry for sync observability."""
    try:
        os.makedirs(os.path.dirname(SYNC_AUDIT_FILE), exist_ok=True)
        with open(SYNC_AUDIT_FILE, "a", encoding="utf-8") as handle:
            handle.write(json.dumps({"timestamp": datetime.now(timezone.utc).isoformat(), **event}, default=str) + "\n")
    except OSError:
        # Telemetry must never prevent a safe sync attempt.
        pass


class MPLADSRestClient:
    def __init__(self, source_url: str = SOURCE_URL):
        self.source_url = source_url
        # The desktop/runtime environment may expose a dead localhost proxy
        # (for example HTTP_PROXY=http://127.0.0.1:9).  The official MPLADS
        # host is reachable directly, so do not inherit proxy variables by
        # default.  A real corporate/secured proxy can still be supplied
        # explicitly through MPLADS_PROXY_URL.
        self.proxy_url = os.getenv("MPLADS_PROXY_URL", "").strip()

    def _opener(self, context: ssl.SSLContext):
        proxy_map = {}
        if self.proxy_url:
            proxy_map = {"http": self.proxy_url, "https": self.proxy_url}
        return urllib.request.build_opener(
            urllib.request.ProxyHandler(proxy_map),
            urllib.request.HTTPSHandler(context=context),
        )

    def fetch_payload(
        self,
        tile_key: str = DEFAULT_TILE_KEY,
        combo: str = DEFAULT_COMBO,
        request_callback: Callable[[dict], None] | None = None,
        page: int | None = None,
    ) -> Any:
        request_data = {"combo": combo, "key": tile_key}
        if page is not None:
            request_data["page"] = page
        request_body = json.dumps(request_data).encode("utf-8")
        attempts = max(1, int(os.getenv("MPLADS_SYNC_RETRIES", "3")))
        context = ssl.create_default_context() if VERIFY_SSL else ssl._create_unverified_context()
        opener = self._opener(context)
        last_error: Exception | None = None
        for attempt in range(attempts):
            request_id = f"REQ-{uuid.uuid4().hex[:12].upper()}"
            request_started = time.perf_counter()
            request = urllib.request.Request(
                self.source_url, data=request_body,
                headers={"Content-Type": "application/json", "Accept": "application/json", "User-Agent": "Mozilla/5.0"},
                method="POST",
            )
            try:
                if request_callback:
                    request_callback({"event": "api_request_started", "request_id": request_id, "endpoint": self.source_url, "tile_key": tile_key, "page": page or 1, "attempt": attempt + 1})
                with opener.open(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                    body = response.read()
                    response_ms = round((time.perf_counter() - request_started) * 1000, 1)
                    if request_callback:
                        request_callback({"event": "api_request_completed", "request_id": request_id, "endpoint": self.source_url, "tile_key": tile_key, "page": page or 1, "attempt": attempt + 1, "response_bytes": len(body), "response_ms": response_ms})
                    return json.loads(body.decode("utf-8"))
            except (HTTPError, URLError, http.client.RemoteDisconnected, ConnectionResetError, TimeoutError, json.JSONDecodeError) as exc:
                last_error = exc
                if request_callback:
                    request_callback({"event": "api_request_failed", "request_id": request_id, "endpoint": self.source_url, "tile_key": tile_key, "page": page or 1, "attempt": attempt + 1, "response_ms": round((time.perf_counter() - request_started) * 1000, 1), "error": str(exc), "will_retry": attempt + 1 < attempts})
                if attempt + 1 >= attempts:
                    raise
                time.sleep(min(2 ** attempt, 8))
        raise last_error or RuntimeError("official request failed")

    def _unwrap(self, payload: Any) -> Any:
        if isinstance(payload, dict):
            for name in ("data", "result", "response", "payload", "records"):
                value = payload.get(name)
                if isinstance(value, (dict, list)):
                    return self._unwrap(value)
        return payload

    def _extract_tables(self, payload: Any, default_table: str = "t5") -> dict[str, pd.DataFrame]:
        payload = self._unwrap(payload)
        found: dict[str, pd.DataFrame] = {}

        def infer_table(name: str, rows: list[dict]) -> str:
            compact_name = _key(name)
            if any(token in compact_name for token in ("expenditure", "payment", "disburs")):
                return "t6"
            if any(token in compact_name for token in ("completed", "completion")):
                return "t5"
            if any(token in compact_name for token in ("recommend", "propos")):
                return "t3"
            if any(token in compact_name for token in ("allocat", "limit")):
                return "t1"
            if any(token in compact_name for token in ("calamity", "consent")):
                return "t7"
            sample = {_key(column) for column in rows[0].keys()}
            if any("expenditure" in column or "payment" in column for column in sample):
                return "t6"
            if any("completion" in column or "completed" in column for column in sample):
                return "t5"
            if any("recommend" in column for column in sample):
                return "t3"
            return "t4"

        def walk(node: Any, name: str = "") -> None:
            if isinstance(node, list) and node and all(isinstance(row, dict) for row in node):
                table = infer_table(name, node)
                found.setdefault(table, pd.DataFrame(node))
                return
            if isinstance(node, dict):
                for child_name, child in node.items():
                    walk(child, str(child_name))

        if isinstance(payload, dict):
            for name, value in payload.items():
                value = _decode_json_value(value)
                canonical = _key(name)
                for table, aliases in ALIASES.items():
                    if canonical in aliases or any(alias in canonical for alias in aliases):
                        rows = value if isinstance(value, list) else (
                            value.get("rows") or value.get("data") or value.get("records")
                            if isinstance(value, dict) else None
                        )
                        if isinstance(rows, list):
                            found[table] = pd.DataFrame(rows)
                        break
        elif isinstance(payload, list):
            found[default_table] = pd.DataFrame(payload)
        if not found:
            walk(payload)
        if not found and isinstance(payload, dict):
            # The official endpoint commonly returns {arbitraryKey: "[...json...]"}.
            for value in payload.values():
                decoded = _decode_json_value(value)
                if isinstance(decoded, list) and decoded and all(isinstance(row, dict) for row in decoded):
                    found[default_table] = pd.DataFrame(decoded)
                    break
        return found

    @staticmethod
    def _next_page(payload: Any, current_page: int) -> int | None:
        """Read common pagination metadata without assuming one API schema."""
        if isinstance(payload, dict):
            for key in ("next_page", "nextPage", "next_page_number", "nextPageNumber"):
                value = payload.get(key)
                if isinstance(value, int) and value > current_page:
                    return value
            for key in ("has_next", "hasNext", "has_more", "hasMore"):
                if payload.get(key) is True:
                    return current_page + 1
            total = next((payload.get(key) for key in ("total_pages", "totalPages", "page_count", "pageCount") if payload.get(key) is not None), None)
            if isinstance(total, int) and total > current_page:
                return current_page + 1
            for value in payload.values():
                next_page = MPLADSRestClient._next_page(value, current_page)
                if next_page:
                    return next_page
        elif isinstance(payload, list):
            for value in payload:
                next_page = MPLADSRestClient._next_page(value, current_page)
                if next_page:
                    return next_page
        return None

    @staticmethod
    def _missing_required_columns(table: str, frame: pd.DataFrame) -> list[list[str]]:
        available = {_key(column) for column in frame.columns}
        return [list(group) for group in REQUIRED_COLUMN_GROUPS.get(table, ()) if not any(alias in available for alias in group)]

    def fetch_to_staging(self, staging_dir: str, progress_callback: Callable[[dict], None] | None = None) -> dict:
        started = datetime.now(timezone.utc)
        os.makedirs(staging_dir, exist_ok=True)
        written = {}
        errors = []
        stats = {"api_requests": 0, "retry_count": 0, "pages_fetched": 0, "records_received": 0, "records_processed": 0, "records_failed": 0, "records_skipped": 0, "datasets_failed": 0}
        stats_lock = threading.Lock()

        def emit(event: dict) -> None:
            if progress_callback:
                progress_callback({**event, "timestamp": datetime.now(timezone.utc).isoformat()})

        def request_event(event: dict) -> None:
            _append_operational_event({
                "event": event.get("event"),
                "request_id": event.get("request_id"),
                "sync_id": os.path.basename(staging_dir),
                "dataset": event.get("tile_key"),
                "page": event.get("page", 1),
                "endpoint": event.get("endpoint", self.source_url),
                "status": "FAILED" if event.get("event") == "api_request_failed" else "SUCCESS" if event.get("event") == "api_request_completed" else "STARTED",
                "response_ms": event.get("response_ms"),
                "error": event.get("error"),
                "retry_count": max(0, int(event.get("attempt", 1)) - 1),
            })
            with stats_lock:
                if event.get("event") == "api_request_started":
                    stats["api_requests"] += 1
                    if int(event.get("attempt", 1)) > 1:
                        stats["retry_count"] += 1
                counters = dict(stats)
            emit({**event, **counters})

        emit({"event": "fetch_started", "datasets": [table for table, _ in SOURCE_TABLE_REQUESTS]})

        def fetch_table(table: str, tile_key: str):
            try:
                emit({"event": "dataset_fetch_started", "dataset": table, "label": tile_key})
                page = 1
                payload = self.fetch_payload(tile_key, DEFAULT_COMBO, request_callback=request_event)
                page_payloads = [payload]
                while True:
                    next_page = self._next_page(payload, page)
                    if not next_page or next_page <= page or next_page > page + 1000:
                        break
                    page = next_page
                    payload = self.fetch_payload(tile_key, DEFAULT_COMBO, request_callback=request_event, page=page)
                    page_payloads.append(payload)
                tables = {}
                for page_payload in page_payloads:
                    for page_table, page_frame in self._extract_tables(page_payload, default_table=table).items():
                        if page_table in tables:
                            tables[page_table] = pd.concat([tables[page_table], page_frame], ignore_index=True)
                        else:
                            tables[page_table] = page_frame.copy()
                frame = tables.get(table)
                if frame is None and len(tables) == 1:
                    frame = next(iter(tables.values()))
                if frame is None or frame.empty:
                    raise ValueError("response contained no records")
                return table, tile_key, frame.drop_duplicates(ignore_index=True), None, len(page_payloads)
            except Exception as exc:
                return table, tile_key, None, str(exc), 0

        fetched = {}
        with ThreadPoolExecutor(max_workers=len(SOURCE_TABLE_REQUESTS), thread_name_prefix="mospi-fetch") as executor:
            futures = [executor.submit(fetch_table, table, tile_key) for table, tile_key in SOURCE_TABLE_REQUESTS]
            for future in as_completed(futures):
                table, tile_key, frame, error, pages = future.result()
                fetched[table] = (tile_key, frame, error, pages)

        for table, tile_key in SOURCE_TABLE_REQUESTS:
            actual_tile_key, frame, error, pages = fetched.get(table, (tile_key, None, "request did not complete", 0))
            if error:
                errors.append(f"{table} ({actual_tile_key}): {error}")
                with stats_lock:
                    stats["datasets_failed"] += 1
                    counters = dict(stats)
                emit({"event": "dataset_failed", "dataset": table, "label": actual_tile_key, "error": error, **counters})
                continue
            frame = _normalise_frame(frame)
            if table == "t6" and "expenditure_amount" not in frame.columns and "completed_disbursed_amount" in frame.columns:
                frame = frame.rename(columns={"completed_disbursed_amount": "expenditure_amount"})
            for amount_column in ("sanction_amount", "recommended_amount", "allocated_amount", "completed_disbursed_amount", "expenditure_amount", "consent_amount"):
                if amount_column in frame.columns:
                    frame[amount_column] = pd.to_numeric(frame[amount_column].astype(str).str.replace("₹", "", regex=False).str.replace(",", "", regex=False), errors="coerce")
            for date_column in ("recommended_date", "sanction_date", "completion_date", "expenditure_date", "consent_date"):
                if date_column in frame.columns:
                    frame[date_column] = pd.to_datetime(frame[date_column], errors="coerce")
            path = os.path.join(staging_dir, MONITORED_FILES[table])
            frame.to_parquet(path, index=False)
            missing = self._missing_required_columns(table, frame)
            written[table] = {"tile_key": tile_key, "path": path, "rows": int(len(frame)), "columns": list(frame.columns), "missing_required_column_groups": missing}
            if missing:
                errors.append(f"{table} ({tile_key}) missing required column groups: {missing}")
                with stats_lock:
                    stats["datasets_failed"] += 1
                    stats["records_failed"] += int(len(frame))
                    counters = dict(stats)
                emit({"event": "dataset_failed", "dataset": table, "label": tile_key, "records_received": int(len(frame)), "error": "Required columns were missing.", **counters})
            else:
                with stats_lock:
                    stats["pages_fetched"] += pages
                    stats["records_received"] += int(len(frame))
                    stats["records_processed"] += int(len(frame))
                    counters = dict(stats)
                emit({"event": "dataset_completed", "dataset": table, "label": tile_key, "records_received": int(len(frame),), "records_processed": int(len(frame)), "pages_fetched": pages, **counters})
        missing_tables = [table for table, _ in SOURCE_TABLE_REQUESTS if table not in written]
        if missing_tables:
            errors.append(f"missing datasets: {', '.join(missing_tables)}")
        success = not errors and len(written) == len(SOURCE_TABLE_REQUESTS)
        return {"success": success, "source_url": self.source_url, "endpoint": OFFICIAL_SOURCE_URL,
                "fetched_at": started.isoformat(), "tables": written, "errors": errors,
                "missing_tables": missing_tables, "staging_dir": staging_dir,
                "counters": {**stats, "datasets_completed": len(written) - stats["datasets_failed"], "datasets_failed": stats["datasets_failed"]},
                "error": "; ".join(errors) if errors else None,
                "message": "All six official datasets fetched and validated" if success else "Official dataset validation failed; no promotion is allowed"}


class MPLADSDataSinkAdapter(MPLADSRestClient):
    """Backwards-compatible name used by the original scheduled runner."""
    def fetch_latest_dataset(self) -> dict:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        return self.fetch_to_staging(os.path.join(RAW_DIR, ".sync", stamp))
