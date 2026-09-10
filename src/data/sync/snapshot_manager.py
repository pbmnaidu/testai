import os
import hashlib
import json
import shutil
import pandas as pd
from datetime import datetime
from src.data.sync.sync_config import SNAPSHOTS_DIR, PROCESSED_DIR, SYNC_LOG_FILE, MONITORED_FILES

def compute_file_hash(filepath: str) -> str:
    """Computes SHA-256 hash of a dataset file."""
    if not os.path.exists(filepath):
        return ""
    hasher = hashlib.sha256()
    with open(filepath, 'rb') as f:
        buf = f.read(65536)
        while len(buf) > 0:
            hasher.update(buf)
            buf = f.read(65536)
    return hasher.hexdigest()

def create_snapshot(snapshot_date: str = None) -> dict:
    """
    Creates a new snapshot folder under data/snapshots/YYYY-MM-DD/
    and records SHA-256 file hashes and record counts.
    """
    if not snapshot_date:
        snapshot_date = datetime.now().strftime("%Y-%m-%d")
        
    target_dir = os.path.join(SNAPSHOTS_DIR, snapshot_date)
    os.makedirs(target_dir, exist_ok=True)
    
    file_metadata = {}
    total_records = 0
    
    for key, fname in MONITORED_FILES.items():
        src_file = os.path.join(PROCESSED_DIR, fname)
        if os.path.exists(src_file):
            dst_file = os.path.join(target_dir, fname)
            shutil.copy2(src_file, dst_file)
            
            df = pd.read_parquet(src_file)
            rec_count = len(df)
            total_records += rec_count
            fhash = compute_file_hash(src_file)
            
            file_metadata[key] = {
                "file_name": fname,
                "record_count": rec_count,
                "sha256_hash": fhash
            }
            
    snapshot_meta = {
        "snapshot_id": f"SNAP-{snapshot_date}",
        "date": snapshot_date,
        "created_at": datetime.now().isoformat(),
        "total_records": total_records,
        "files": file_metadata
    }
    
    # Save snapshot metadata JSON inside snapshot folder
    meta_path = os.path.join(target_dir, "metadata.json")
    with open(meta_path, 'w') as f:
        json.dump(snapshot_meta, f, indent=2)
        
    return snapshot_meta

def get_snapshot_history() -> list:
    """Returns list of past historical snapshot metadata summaries."""
    snapshots = []
    if not os.path.exists(SNAPSHOTS_DIR):
        return snapshots
        
    for dname in sorted(os.listdir(SNAPSHOTS_DIR), reverse=True):
        mpath = os.path.join(SNAPSHOTS_DIR, dname, "metadata.json")
        if os.path.exists(mpath):
            try:
                with open(mpath, 'r') as f:
                    snapshots.append(json.load(f))
            except Exception:
                pass
    return snapshots
