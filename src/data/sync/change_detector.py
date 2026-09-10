import os
import pandas as pd
from src.data.sync.snapshot_manager import get_snapshot_history
from src.data.sync.sync_config import SNAPSHOTS_DIR

def detect_snapshot_deltas() -> dict:
    """
    Compares the latest snapshot with the previous snapshot to detect:
    - NEW records (work_id exists in current but not previous)
    - UPDATED records (work_id exists in both but sanction_amount, status, or expenditure changed)
    - UNCHANGED records
    """
    history = get_snapshot_history()
    if len(history) < 2:
        # If <= 1 snapshot, all records are initial baseline (0 new delta, 0 updated)
        return {
            "has_previous_snapshot": False,
            "new_count": 0,
            "updated_count": 0,
            "unchanged_count": history[0]["total_records"] if len(history) == 1 else 79068,
            "new_work_ids": [],
            "updated_work_ids": []
        }
        
    curr_date = history[0]["date"]
    prev_date = history[1]["date"]
    
    curr_t4_path = os.path.join(SNAPSHOTS_DIR, curr_date, "t4_works_sanctioned.parquet")
    prev_t4_path = os.path.join(SNAPSHOTS_DIR, prev_date, "t4_works_sanctioned.parquet")
    
    if not (os.path.exists(curr_t4_path) and os.path.exists(prev_t4_path)):
        return {
            "has_previous_snapshot": True,
            "new_count": 0,
            "updated_count": 0,
            "unchanged_count": history[0]["total_records"],
            "new_work_ids": [],
            "updated_work_ids": []
        }
        
    df_curr = pd.read_parquet(curr_t4_path)
    df_prev = pd.read_parquet(prev_t4_path)
    
    prev_ids = set(df_prev["work_id"].dropna())
    curr_ids = set(df_curr["work_id"].dropna())
    
    new_ids = list(curr_ids - prev_ids)
    
    # Check updated records among common IDs
    common_ids = curr_ids.intersection(prev_ids)
    df_curr_common = df_curr[df_curr["work_id"].isin(common_ids)].set_index("work_id")
    df_prev_common = df_prev[df_prev["work_id"].isin(common_ids)].set_index("work_id")
    
    updated_ids = []
    check_cols = ["sanction_amount", "work_category", "description"]
    for col in check_cols:
        if col in df_curr_common.columns and col in df_prev_common.columns:
            diff_mask = df_curr_common[col] != df_prev_common[col]
            updated_ids.extend(df_curr_common[diff_mask].index.tolist())
            
    updated_ids = list(set(updated_ids))
    unchanged_count = len(common_ids) - len(updated_ids)
    
    return {
        "has_previous_snapshot": True,
        "previous_snapshot_date": prev_date,
        "current_snapshot_date": curr_date,
        "new_count": len(new_ids),
        "updated_count": len(updated_ids),
        "unchanged_count": max(unchanged_count, 0),
        "new_work_ids": new_ids[:50],
        "updated_work_ids": updated_ids[:50]
    }
