"""MPLADS Platform - Snapshot Validation Engine.

Strictly verifies snapshot schema integrity, file completeness, row counts,
finite risk scores, and SHA-256 checksums before deployment.
Exits with 0 if valid, 1 if any validation check fails.
"""

import os
import sys
import json
import math
import hashlib

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

FRONTEND_PUBLIC_SNAPSHOTS = os.path.join(_ROOT, "frontend", "public", "data", "snapshots")
BACKEND_SNAPSHOTS = os.path.join(_ROOT, "data", "snapshots")

REQUIRED_ROOT_FILES = [
    "overview.json",
    "state_summaries.json",
    "filters.json",
    "compliance_rules.json",
    "compliance_summary.json",
    "constituency_compliance.json",
    "duplicate_clusters.json",
    "duplicate_candidates.json",
    "financial_benchmarks.json",
    "schedule_risk.json",
    "officer_dashboard.json",
    "model_status.json",
    "citizen_works.json",
    "citizen_evidence_baseline.json",
    "attendance_baseline.json",
    "risk_monitor_default.json",
    "risk_monitor_index.json",
]


def compute_sha256(filepath: str) -> str:
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def validate_snapshots(base_dir: str = FRONTEND_PUBLIC_SNAPSHOTS) -> bool:
    manifest_path = os.path.join(base_dir, "latest.json")
    if not os.path.exists(manifest_path):
        print(f"[VALIDATION FAILED] Manifest not found at: {manifest_path}")
        return False

    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
    except Exception as e:
        print(f"[VALIDATION FAILED] Could not parse manifest JSON: {e}")
        return False

    version = manifest.get("snapshot_version")
    if not version:
        print("[VALIDATION FAILED] Manifest missing 'snapshot_version'")
        return False

    if manifest.get("schema_version") != "2.0.0":
        print(f"[VALIDATION FAILED] Invalid schema_version: {manifest.get('schema_version')}")
        return False

    snapshot_dir = os.path.join(base_dir, version)
    if not os.path.isdir(snapshot_dir):
        print(f"[VALIDATION FAILED] Snapshot directory does not exist: {snapshot_dir}")
        return False

    print(f"[VALIDATION] Validating snapshot: {version}")

    # Check required files
    for rf in REQUIRED_ROOT_FILES:
        fp = os.path.join(snapshot_dir, rf)
        if not os.path.exists(fp):
            print(f"[VALIDATION FAILED] Missing required snapshot file: {rf}")
            return False

    # Check work_details shards
    work_details_dir = os.path.join(snapshot_dir, "work_details")
    if not os.path.isdir(work_details_dir):
        print(f"[VALIDATION FAILED] Missing work_details directory: {work_details_dir}")
        return False

    shard_files = os.listdir(work_details_dir)
    if len(shard_files) != 256:
        print(f"[VALIDATION FAILED] Expected 256 work detail shards, found: {len(shard_files)}")
        return False

    # Check SHA-256 Checksums from manifest
    checksums = manifest.get("checksums", {})
    if not checksums:
        print("[VALIDATION FAILED] Manifest has no checksums recorded.")
        return False

    verified_count = 0
    for rel_path, expected_hash in checksums.items():
        actual_file = os.path.join(snapshot_dir, rel_path.replace("/", os.sep))
        if not os.path.exists(actual_file):
            print(f"[VALIDATION FAILED] Checksummed file missing from disk: {rel_path}")
            return False
        actual_hash = compute_sha256(actual_file)
        if actual_hash != expected_hash:
            print(f"[VALIDATION FAILED] Checksum mismatch for {rel_path} (expected {expected_hash}, got {actual_hash})")
            return False
        verified_count += 1

    print(f"[VALIDATION] Verified {verified_count} file checksums successfully.")

    # Validate overview content
    overview_path = os.path.join(snapshot_dir, "overview.json")
    with open(overview_path, "r", encoding="utf-8") as f:
        overview = json.load(f)
    summary = overview.get("summary", {})
    if not summary.get("total_works") or summary["total_works"] <= 0:
        print(f"[VALIDATION FAILED] Overview has invalid total_works: {summary.get('total_works')}")
        return False

    # Validate risk distribution
    risk_dist = overview.get("risk_distribution", {})
    for level in ("LOW", "MEDIUM", "HIGH", "CRITICAL"):
        if level not in risk_dist or not isinstance(risk_dist[level], int):
            print(f"[VALIDATION FAILED] Overview missing risk level count: {level}")
            return False

    # Validate risk monitor default
    rm_path = os.path.join(snapshot_dir, "risk_monitor_default.json")
    with open(rm_path, "r", encoding="utf-8") as f:
        rm = json.load(f)
    if not rm.get("records") or len(rm["records"]) == 0:
        print("[VALIDATION FAILED] Risk monitor default records list is empty.")
        return False

    top_scores = rm.get("top_scores", {})
    for k in ("financial", "duplicate", "compliance", "schedule", "composite"):
        score = top_scores.get(k)
        if score is None or not math.isfinite(score):
            print(f"[VALIDATION FAILED] Non-finite or missing top score for {k}: {score}")
            return False

    print(f"[VALIDATION PASSED] Snapshot {version} is complete, authentic, and valid.")
    return True


if __name__ == "__main__":
    success = validate_snapshots()
    sys.exit(0 if success else 1)
