import os

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DATA_DIR = os.path.join(BASE_DIR, "data")
RAW_DIR = os.path.join(DATA_DIR, "raw")
PROCESSED_DIR = os.path.join(DATA_DIR, "processed")
FEATURES_DIR = os.path.join(DATA_DIR, "features")
SNAPSHOTS_DIR = os.path.join(DATA_DIR, "snapshots")
TRAINING_DIR = os.path.join(DATA_DIR, "training")
TRAINING_STAGING_DIR = os.path.join(TRAINING_DIR, "staging")
TRAINING_BACKUP_DIR = os.path.join(TRAINING_DIR, "backups")
SYNC_LOG_FILE = os.path.join(DATA_DIR, "sync_history.json")
SYNC_STATE_FILE = os.path.join(DATA_DIR, "sync_state.json")
SYNC_AUDIT_FILE = os.path.join(DATA_DIR, "sync_audit.jsonl")
SYNC_JOB_STATUS_FILE = os.path.join(DATA_DIR, "sync_job_status.json")
TRAINING_STATUS_FILE = os.path.join(TRAINING_DIR, "status.json")

OFFICIAL_SOURCE_URL = "https://mplads.mospi.gov.in/rest/PreLoginDashboardData/getTilesReportData"
SOURCE_URL = os.getenv("MPLADS_DATA_SOURCE_URL", OFFICIAL_SOURCE_URL)
# The scheduler is deliberately configuration-driven.  Existing deployments
# keep the historical 15-day cadence unless an interval in hours is supplied.
SYNC_INTERVAL_HOURS = max(1, int(os.getenv("MPLADS_SYNC_INTERVAL_HOURS", str(15 * 24))))
SYNC_DAILY_TIME = os.getenv("MPLADS_SYNC_DAILY_TIME", "").strip()  # Optional UTC HH:MM
SYNC_INTERVAL_DAYS = SYNC_INTERVAL_HOURS / 24
REQUEST_TIMEOUT_SECONDS = int(os.getenv("MPLADS_SYNC_TIMEOUT_SECONDS", "300"))
VERIFY_SSL = os.getenv("MPLADS_VERIFY_SSL", "false").lower() not in {"0", "false", "no"}

MONITORED_FILES = {
    "t1": "t1_allocated_limits.parquet",
    "t3": "t3_works_recommended.parquet",
    "t4": "t4_works_sanctioned.parquet",
    "t5": "t5_works_completed.parquet",
    "t6": "t6_expenditure.parquet",
    "t7": "t7_calamity_consents.parquet",
}

os.makedirs(TRAINING_STAGING_DIR, exist_ok=True)
os.makedirs(TRAINING_BACKUP_DIR, exist_ok=True)
