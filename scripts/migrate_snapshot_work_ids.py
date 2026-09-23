import os
import re
import json
import hashlib
import sys
import pandas as pd

sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SNAPSHOT_DIR = os.path.join(ROOT, "frontend", "public", "data", "snapshots", "v_20260921_195519")
RAW_CSV = os.path.join(ROOT, "data", "raw", "Works Sanctioned.csv")

def extract_id(val):
    if pd.notnull(val):
        m = re.search(r'WS\s*/\s*([A-Za-z0-9\-_]+)\s*/\s*(\d{4}-\d{4})\s*/\s*(\d+)', str(val))
        if m:
            return f'WS/{m.group(1)}/{m.group(2)}/{m.group(3)}'
        m = re.search(r'WS\s*/\s*([A-Za-z0-9\-_]+)\s*/\s*(\d+)', str(val))
        if m:
            return f'WS/{m.group(1)}/{m.group(2)}'
    return None

def sha256_2(s):
    return hashlib.sha256(s.encode('utf-8')).hexdigest()[:2]

def run_migration():
    print("--- 1. Building ID mapping from Works Sanctioned.csv ---", flush=True)
    df = pd.read_csv(RAW_CSV, low_memory=False)
    sanc_to_real = {}
    real_to_sanc = {}

    for idx, val in enumerate(df['Work']):
        sanc_id = f"WS/SANC/{idx+1:06d}"
        real_id = extract_id(val)
        if real_id and real_id != sanc_id:
            sanc_to_real[sanc_id] = real_id
            real_to_sanc[real_id] = sanc_id

    print(f"Mapped {len(sanc_to_real):,} WS/SANC IDs to authentic IDs.", flush=True)
    print("Verification: WS/SANC/000002 ->", sanc_to_real.get("WS/SANC/000002"), flush=True)

    # Save alias map
    alias_map_path = os.path.join(SNAPSHOT_DIR, "work_id_aliases.json")
    combined_aliases = {**sanc_to_real, **real_to_sanc}
    with open(alias_map_path, "w", encoding="utf-8") as f:
        json.dump(combined_aliases, f, indent=2)
    with open(os.path.join(ROOT, "frontend", "public", "data", "snapshots", "work_id_aliases.json"), "w", encoding="utf-8") as f:
        json.dump(combined_aliases, f, indent=2)
    print(f"Saved alias map -> {alias_map_path}", flush=True)

    # --- 2. Update risk_monitor_index.json ---
    print("--- 2. Updating risk_monitor_index.json ---", flush=True)
    risk_index_file = os.path.join(SNAPSHOT_DIR, "risk_monitor_index.json")
    with open(risk_index_file, "r", encoding="utf-8") as f:
        risk_index = json.load(f)

    updated_index_count = 0
    for row in risk_index:
        wid = row.get("work_id")
        if wid in sanc_to_real:
            real_id = sanc_to_real[wid]
            row["work_id"] = real_id
            row["legacy_work_id"] = wid
            updated_index_count += 1

    with open(risk_index_file, "w", encoding="utf-8") as f:
        json.dump(risk_index, f, indent=2, ensure_ascii=False)
    print(f"Updated {updated_index_count:,} rows in risk_monitor_index.json", flush=True)

    # --- 3. Update officer_dashboard.json ---
    print("--- 3. Updating officer_dashboard.json ---", flush=True)
    officer_file = os.path.join(SNAPSHOT_DIR, "officer_dashboard.json")
    with open(officer_file, "r", encoding="utf-8") as f:
        officer_data = json.load(f)

    updated_officer_count = 0
    for row in officer_data.get("priority_works", []):
        wid = row.get("work_id")
        if wid in sanc_to_real:
            real_id = sanc_to_real[wid]
            row["work_id"] = real_id
            row["legacy_work_id"] = wid
            updated_officer_count += 1

    with open(officer_file, "w", encoding="utf-8") as f:
        json.dump(officer_data, f, indent=2, ensure_ascii=False)
    print(f"Updated {updated_officer_count:,} priority works in officer_dashboard.json", flush=True)

    # --- 4. Update work_details shards efficiently ---
    print("--- 4. Updating work_details shards ---", flush=True)
    work_details_dir = os.path.join(SNAPSHOT_DIR, "work_details")
    
    # Group items to extract by their old shard and put in their new shard
    old_shard_map = {}
    for sanc_id, real_id in sanc_to_real.items():
        old_shard = f"{sha256_2(sanc_id)}.json"
        if old_shard not in old_shard_map:
            old_shard_map[old_shard] = []
        old_shard_map[old_shard].append((sanc_id, real_id))

    # Read each old shard, extract items
    extracted_items = {} # real_id -> (record, sanc_id, old_shard)
    for old_shard, pairs in old_shard_map.items():
        p = os.path.join(work_details_dir, old_shard)
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
            modified = False
            for sanc_id, real_id in pairs:
                if sanc_id in data:
                    rec = data[sanc_id]
                    if "work" in rec:
                        rec["work"]["work_id"] = real_id
                        rec["work"]["legacy_work_id"] = sanc_id
                    # Also keep an alias in this old shard
                    data[sanc_id] = rec
                    data[real_id] = rec
                    extracted_items[real_id] = (rec, sanc_id, old_shard)
                    modified = True
            if modified:
                with open(p, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Extracted {len(extracted_items):,} detail records from old shards.", flush=True)

    # Place in new shards by sha256(real_id)[:2]
    new_shard_groups = {}
    for real_id, (rec, sanc_id, old_shard) in extracted_items.items():
        new_shard = f"{sha256_2(real_id)}.json"
        if new_shard != old_shard:
            if new_shard not in new_shard_groups:
                new_shard_groups[new_shard] = []
            new_shard_groups[new_shard].append((real_id, sanc_id, rec))

    for new_shard, items in new_shard_groups.items():
        p = os.path.join(work_details_dir, new_shard)
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
        else:
            data = {}
        for real_id, sanc_id, rec in items:
            data[real_id] = rec
            data[sanc_id] = rec
        with open(p, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Placed items into {len(new_shard_groups)} target shards.", flush=True)

    # --- 5. Update duplicate files via regex in 0.05s ---
    print("--- 5. Updating duplicate files ---", flush=True)
    def replacer(match):
        sid = match.group(0)
        return sanc_to_real.get(sid, sid)

    for fname in ["duplicate_candidates.json", "duplicate_clusters.json", "citizen_evidence_baseline.json"]:
        p = os.path.join(SNAPSHOT_DIR, fname)
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                content = f.read()
            new_content = re.sub(r'WS/SANC/\d{6}', replacer, content)
            with open(p, "w", encoding="utf-8") as f:
                f.write(new_content)
            print(f"Processed {fname}", flush=True)

    # --- 6. Update metadata.json & latest.json checksums & sizes ---
    print("--- 6. Updating checksums in metadata.json & latest.json ---", flush=True)
    meta_path = os.path.join(SNAPSHOT_DIR, "metadata.json")
    if os.path.exists(meta_path):
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
        for fname in os.listdir(SNAPSHOT_DIR):
            fpath = os.path.join(SNAPSHOT_DIR, fname)
            if os.path.isfile(fpath) and fname not in ["metadata.json"]:
                with open(fpath, "rb") as bf:
                    data = bf.read()
                h = hashlib.sha256(data).hexdigest()
                sz = len(data)
                if "checksums" in meta:
                    meta["checksums"][fname] = h
                if "file_sizes" in meta:
                    meta["file_sizes"][fname] = sz
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

    latest_path = os.path.join(ROOT, "frontend", "public", "data", "snapshots", "latest.json")
    if os.path.exists(latest_path):
        with open(latest_path, "r", encoding="utf-8") as f:
            latest = json.load(f)
        for fname in os.listdir(SNAPSHOT_DIR):
            fpath = os.path.join(SNAPSHOT_DIR, fname)
            if os.path.isfile(fpath):
                with open(fpath, "rb") as bf:
                    data = bf.read()
                h = hashlib.sha256(data).hexdigest()
                if "checksums" in latest and fname in latest["checksums"]:
                    latest["checksums"][fname] = h
        with open(latest_path, "w", encoding="utf-8") as f:
            json.dump(latest, f, indent=2)

    print("=== SNAPSHOT MIGRATION COMPLETE! ===", flush=True)

if __name__ == "__main__":
    run_migration()
