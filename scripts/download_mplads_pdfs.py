"""
MPLADS Official Document & PDF Downloader
==========================================
Extracts and downloads official documents (sanction orders, completion certificates,
inspection photos, PDFs) from the official MoSPI MPLADS portal:
https://mplads.mospi.gov.in/digigov/dashboard.html

Usage examples:
    # 1. Download document for a single Work ID:
    python scripts/download_mplads_pdfs.py --work_id 56999

    # 2. Batch download first 20 completed work PDFs for a specific state:
    python scripts/download_mplads_pdfs.py --limit 20 --state "MAHARASHTRA"

    # 3. Batch download from Sanctioned works:
    python scripts/download_mplads_pdfs.py --table "Works Sanctioned" --limit 10
"""

import os
import sys
import json
import ssl
import time
import base64
import argparse
import urllib.request
from typing import Dict, List, Optional, Any

BASE_URL = "https://mplads.mospi.gov.in"
API_TILES_REPORT = f"{BASE_URL}/rest/PreLoginDashboardData/getTilesReportData"
API_ATTACH_METADATA = f"{BASE_URL}/rest/PreLoginDashboardData/getAttachIdsbyFlag"
API_ATTACH_DOWNLOAD = f"{BASE_URL}/rest/PreLoginCitizenWorkRcmdRest/getAttachmentById"

# Disable SSL verification for gov portals with internal certificate chains
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

HEADERS = {
    "Content-Type": "application/json; charset=utf-8",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*"
}

def post_json(url: str, payload: dict, timeout: int = 30) -> Any:
    """Helper to send POST request and return parsed JSON."""
    data_bytes = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data_bytes, headers=HEADERS)
    with urllib.request.urlopen(req, context=SSL_CTX, timeout=timeout) as response:
        raw = response.read().decode("utf-8", errors="replace")
        return json.loads(raw)

def fetch_work_list(table_key: str = "Works Completed", combo: str = "0,0,0,2") -> List[Dict]:
    """
    Fetches raw work records from the dashboard.
    table_key can be:
        - "Works Completed"
        - "Works Sanctioned"
        - "Works Recommended"
    combo format: "state_id,constituency_id,mp_id,tenure_id" (0,0,0,2 = All Lok Sabha)
    """
    print(f"[*] Fetching works list for '{table_key}' (combo={combo})...")
    payload = {"combo": combo, "key": table_key}
    res = post_json(API_TILES_REPORT, payload, timeout=60)
    
    records = []
    if isinstance(res, dict):
        for key, val in res.items():
            if isinstance(val, str):
                try:
                    records.extend(json.loads(val))
                except Exception:
                    pass
    print(f"[+] Retrieved {len(records):,} records from {table_key}.")
    return records

def get_attachments_for_work(work_id: str, flag: str = "3") -> List[Dict[str, str]]:
    """
    Fetches attachment IDs and file names for a given work ID.
    Returns list of {'file_name': ..., 'attach_id': ...}
    """
    payload = {"json": {"FLAG": str(flag), "WORK_ID": str(work_id)}}
    try:
        res = post_json(API_ATTACH_METADATA, payload, timeout=15)
        if isinstance(res, list) and len(res) > 0:
            meta = res[0]
            file_names = meta.get("FILE_NAME", [])
            attach_ids = meta.get("ATTACH_ID", [])
            
            attachments = []
            for fname, aid in zip(file_names, attach_ids):
                if fname != "File not available.":
                    attachments.append({
                        "file_name": fname,
                        "attach_id": aid
                    })
            return attachments
    except Exception as e:
        print(f"[-] Error getting attachment metadata for work {work_id}: {e}")
    return []

def download_attachment_by_id(attach_id: str) -> Optional[bytes]:
    """Fetches and base64-decodes the file content by attach_id."""
    payload = {"id": str(attach_id)}
    try:
        res = post_json(API_ATTACH_DOWNLOAD, payload, timeout=45)
        if isinstance(res, list) and len(res) > 0:
            b64_str = res[0].get("URL", "")
            if b64_str:
                return base64.b64decode(b64_str)
    except Exception as e:
        print(f"[-] Error downloading attachment {attach_id}: {e}")
    return None

def download_work_pdf(work_id: str, flag: str = "3", output_dir: str = "data/downloaded_pdfs") -> List[str]:
    """
    Downloads all PDF/document attachments for a specific work_id and
    saves them named with the work_id.
    """
    os.makedirs(output_dir, exist_ok=True)
    attachments = get_attachments_for_work(work_id, flag)
    
    if not attachments:
        print(f"[-] No valid attachments found on portal for Work ID '{work_id}' (FLAG={flag}).")
        return []

    saved_paths = []
    for att in attachments:
        fname = att["file_name"]
        aid = att["attach_id"]
        
        # Clean safe filename
        safe_fname = "".join([c if c.isalnum() or c in ".-_" else "_" for c in fname])
        out_filename = f"WORK_{work_id}_{safe_fname}"
        out_path = os.path.join(output_dir, out_filename)
        
        print(f"[*] Downloading {fname} (ID: {aid}) for Work {work_id}...")
        file_bytes = download_attachment_by_id(aid)
        
        if file_bytes:
            with open(out_path, "wb") as f:
                f.write(file_bytes)
            print(f"[+] Saved {len(file_bytes):,} bytes -> {out_path}")
            saved_paths.append(out_path)
        else:
            print(f"[-] Failed to download content for {fname}")
            
    return saved_paths

def batch_download(
    table: str = "Works Completed",
    state_filter: Optional[str] = None,
    limit: int = 10,
    output_dir: str = "data/downloaded_pdfs"
):
    """Batch downloads PDFs for multiple works matching criteria."""
    records = fetch_work_list(table_key=table)
    
    # Filter works with files
    candidates = [r for r in records if r.get("FILE_STATUS")]
    
    if state_filter:
        s_upper = state_filter.strip().upper()
        candidates = [r for r in candidates if str(r.get("STATE_NAME", "")).upper() == s_upper]
        print(f"[*] Filtered for state '{s_upper}': {len(candidates)} works with documents available.")
    else:
        print(f"[*] Total works with documents available: {len(candidates)}")

    download_count = 0
    manifest = []
    manifest_path = os.path.join(output_dir, "download_manifest.json")

    for idx, rec in enumerate(candidates[:limit]):
        wid = rec.get("WORK_ID")
        flag = rec.get("FLAG", 3)
        mp = rec.get("MP_NAME", "")
        state = rec.get("STATE_NAME", "")
        const = rec.get("CONSTITUENCY", "")
        
        print(f"\n--- [{idx+1}/{min(limit, len(candidates))}] Work ID: {wid} | {state} - {const} ({mp}) ---")
        saved = download_work_pdf(work_id=wid, flag=flag, output_dir=output_dir)
        
        if saved:
            download_count += len(saved)
            manifest.append({
                "work_id": wid,
                "state": state,
                "constituency": const,
                "mp_name": mp,
                "files": saved,
                "downloaded_at": time.strftime("%Y-%m-%d %H:%M:%S")
            })
        
        # Polite delay between calls
        time.sleep(0.5)

    with open(manifest_path, "w", encoding="utf-8") as mf:
        json.dump(manifest, mf, indent=2)

    print(f"\n=======================================================")
    print(f"[SUCCESS] Downloaded {download_count} documents across {len(manifest)} works.")
    print(f"Manifest written to: {manifest_path}")
    print(f"=======================================================")

def main():
    parser = argparse.ArgumentParser(description="MPLADS Official PDF & Document Downloader")
    parser.add_argument("--work_id", type=str, help="Specific Work ID to download PDF for (e.g. 56999)")
    parser.add_argument("--flag", type=str, default="3", help="Server FLAG associated with the work (default: 3)")
    parser.add_argument("--limit", type=int, default=5, help="Number of works to download in batch mode (default: 5)")
    parser.add_argument("--table", type=str, default="Works Completed", choices=["Works Completed", "Works Sanctioned", "Works Recommended"], help="Table to query")
    parser.add_argument("--state", type=str, help="Filter by State Name (e.g. 'MAHARASHTRA')")
    parser.add_argument("--output_dir", type=str, default="data/downloaded_pdfs", help="Directory to save downloaded files")

    args = parser.parse_args()

    if args.work_id:
        download_work_pdf(work_id=args.work_id, flag=args.flag, output_dir=args.output_dir)
    else:
        batch_download(table=args.table, state_filter=args.state, limit=args.limit, output_dir=args.output_dir)

if __name__ == "__main__":
    main()
