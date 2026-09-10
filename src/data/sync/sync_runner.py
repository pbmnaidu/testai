import os
import sys
# Ensure workspace root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

import json
from datetime import datetime
from src.data.sync.source_adapter import MPLADSDataSinkAdapter
from src.data.sync.snapshot_manager import create_snapshot, get_snapshot_history
from src.data.sync.change_detector import detect_snapshot_deltas
from src.data.sync.sync_config import SYNC_LOG_FILE

def run_sync_job() -> dict:
    """
    Executes automated weekly synchronization job.
    1. Connects via Data Source Adapter
    2. Generates new timestamped Snapshot
    3. Detects changes (NEW / UPDATED / UNCHANGED records)
    4. Records job metadata into sync_history.json log
    """
    start_time = datetime.now()
    adapter = MPLADSDataSinkAdapter()
    fetch_result = adapter.fetch_latest_dataset()
    
    snapshot_meta = create_snapshot()
    deltas = detect_snapshot_deltas()
    
    duration_sec = round((datetime.now() - start_time).total_seconds(), 2)
    
    sync_result = {
        "sync_id": f"SYNC-{int(start_time.timestamp())}",
        "timestamp": start_time.isoformat(),
        "duration_seconds": duration_sec,
        "status": "SUCCESS" if fetch_result["success"] else "FAILED",
        "snapshot_id": snapshot_meta["snapshot_id"],
        "source_url": adapter.source_url,
        "total_records": snapshot_meta["total_records"],
        "new_records_count": deltas["new_count"],
        "updated_records_count": deltas["updated_count"],
        "unchanged_records_count": deltas["unchanged_count"],
        "next_scheduled_sync": datetime.fromtimestamp(start_time.timestamp() + 7 * 86400).strftime("%Y-%m-%d %H:%M:%S")
    }
    
    # Save/Append to sync history log
    history = []
    if os.path.exists(SYNC_LOG_FILE):
        try:
            with open(SYNC_LOG_FILE, 'r') as f:
                history = json.load(f)
        except Exception:
            history = []
            
    history.insert(0, sync_result)
    with open(SYNC_LOG_FILE, 'w') as f:
        json.dump(history[:50], f, indent=2)
        
    return sync_result

if __name__ == "__main__":
    print("=== EXECUTING WEEKLY MPLADS DATA SYNCHRONIZATION JOB ===")
    res = run_sync_job()
    print(json.dumps(res, indent=2))
