#!/usr/bin/env python3
"""Automated Live Data Sync & ML Pipeline Execution.

Fetches the latest MPLADS dataset from the official MoSPI portal API,
merges deltas into processed datasets, trains/updates all risk engines,
and exports validated static JSON snapshots for Vercel deployment.
"""
from __future__ import annotations

import os
import sys
import time
import shutil
import uuid
from datetime import datetime, timezone

# Ensure project root is in sys.path
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from src.data.sync.source_adapter import MPLADSRestClient
from src.data.sync.delta_engine import MPLADSDeltaEngine
from src.data.sync.snapshot_manager import create_snapshot
from src.data.sync.sync_config import DATA_DIR, MONITORED_FILES, PROCESSED_DIR, SOURCE_URL
from src.run_pipeline import run_entire_pipeline
from src.data.validate_snapshots import validate_snapshots


def sync_live_data(staging_dir: str | None = None) -> bool:
    """Fetch live data from official MoSPI portal and promote to data/processed."""
    token = uuid.uuid4().hex[:12]
    staging_dir = staging_dir or os.path.join(DATA_DIR, "sync_staging", token)
    os.makedirs(staging_dir, exist_ok=True)
    
    print("\n" + "=" * 60)
    print("STEP 1: FETCHING LIVE DATA FROM OFFICIAL MOSPI PORTAL")
    print(f"Source URL: {SOURCE_URL}")
    print("=" * 60)

    client = MPLADSRestClient()
    try:
        def on_event(ev):
            event_name = ev.get("event", "")
            if event_name == "dataset_fetch_started":
                print(f"  --> Fetching {ev.get('dataset')}: {ev.get('label')}...")
            elif event_name == "dataset_completed":
                print(f"  [OK] {ev.get('dataset')} fetched successfully.")
            elif event_name == "dataset_failed":
                print(f"  [WARN] {ev.get('dataset')} fetch issue: {ev.get('error')}")
            elif event_name == "api_request_failed":
                print(f"  [RETRY] {ev.get('endpoint')} failed: {ev.get('error')} (retrying...)")

        fetch_result = client.fetch_to_staging(staging_dir, progress_callback=on_event)

        if not fetch_result.get("success"):
            errors = fetch_result.get("errors", ["Unknown fetch failure"])
            print(f"[WARN] Live fetch from MoSPI was partially or fully unavailable: {'; '.join(errors)}")
            print("[INFO] Retaining existing validated datasets and continuing pipeline...")
            return False

        print("\n" + "=" * 60)
        print("STEP 2: COMPUTING DELTAS & PROMOTING PROCESSED DATASETS")
        print("=" * 60)

        delta_engine = MPLADSDeltaEngine(processed_dir=PROCESSED_DIR)
        diff = delta_engine.compare_staging(staging_dir)
        print(f"  New records detected:      {diff.get('new_count', 0):,}")
        print(f"  Modified records detected: {diff.get('updated_count', 0):,}")
        print(f"  Unchanged records:         {diff.get('unchanged_count', 0):,}")

        if diff.get("tables"):
            delta_engine.commit_staging(staging_dir, diff)
            snapshot = create_snapshot()
            print(f"  [SUCCESS] Promoted to production datasets. Snapshot ID: {snapshot['snapshot_id']}")
        else:
            print("  [INFO] No dataset tables found to commit.")

        return True

    except Exception as exc:
        print(f"[WARN] Live sync error: {exc}")
        print("[INFO] Gracefully continuing with current datasets.")
        return False
    finally:
        shutil.rmtree(staging_dir, ignore_errors=True)


def main():
    start_time = time.time()
    skip_sync = "--skip-sync" in sys.argv
    force_sync = "--force-sync" in sys.argv

    print("==================================================")
    print("   MPLADS AUTOMATED DATA SYNC & ML PIPELINE       ")
    print("==================================================")

    if not skip_sync:
        sync_success = sync_live_data()
        if not sync_success and force_sync:
            print("[ERROR] Force sync requested but live sync failed. Exiting.")
            sys.exit(1)
    else:
        print("[INFO] Skipping live sync (--skip-sync provided).")

    print("\n" + "=" * 60)
    print("STEP 3: EXECUTING FULL ML PIPELINE & SNAPSHOT EXPORT")
    print("=" * 60)
    # Run full pipeline with latest data, precomputing risk engines and dashboard snapshots
    run_entire_pipeline(run_preprocessing=False, record_sync=True)

    print("\n" + "=" * 60)
    valid = validate_snapshots()
    if not valid:
        print("[ERROR] Snapshot validation failed.")
        sys.exit(1)

    elapsed = time.time() - start_time
    print("\n==================================================")
    print(f"   PIPELINE COMPLETED SUCCESSFULLY IN {elapsed:.1f}s   ")
    print("==================================================")


if __name__ == "__main__":
    main()
