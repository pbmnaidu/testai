"""Compatibility wrapper exposing the composite-key snapshot delta report."""
import os
import pandas as pd

from src.data.sync.delta_engine import MPLADSDeltaEngine
from src.data.sync.snapshot_manager import get_snapshot_history
from src.data.sync.sync_config import MONITORED_FILES, SNAPSHOTS_DIR


def detect_snapshot_deltas() -> dict:
    history = get_snapshot_history()
    if not history:
        return {"has_previous_snapshot": False, "new_count": 0, "updated_count": 0, "unchanged_count": 0, "new_work_ids": [], "updated_work_ids": []}
    if len(history) < 2:
        return {"has_previous_snapshot": False, "new_count": 0, "updated_count": 0, "unchanged_count": history[0].get("total_records", 0), "new_work_ids": [], "updated_work_ids": []}
    current = history[0]
    previous = history[1]
    result = {"has_previous_snapshot": True, "current_snapshot_date": current.get("date"), "previous_snapshot_date": previous.get("date"), "new_count": 0, "updated_count": 0, "unchanged_count": 0, "new_work_ids": [], "updated_work_ids": []}
    engine = MPLADSDeltaEngine()
    for table, filename in MONITORED_FILES.items():
        current_path = os.path.join(SNAPSHOTS_DIR, current.get("date", ""), filename)
        previous_path = os.path.join(SNAPSHOTS_DIR, previous.get("date", ""), filename)
        if not (os.path.exists(current_path) and os.path.exists(previous_path)):
            continue
        diff = engine.compare_frames(pd.read_parquet(previous_path), pd.read_parquet(current_path), table)
        result["new_count"] += len(diff["new"])
        result["updated_count"] += len(diff["modified"])
        result["unchanged_count"] += diff["unchanged_count"]
        result["new_work_ids"].extend(item["composite_key"] for item in diff["new"][:50])
        result["updated_work_ids"].extend(item["composite_key"] for item in diff["modified"][:50])
    return result
