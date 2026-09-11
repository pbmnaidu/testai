import sys
import os
import time

# Ensure workspace root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__) + "/.."))

from src.preprocessing.cleaner import preprocess_all
from src.data.master_builder import build_master_dataset
from src.modules.financial_anomaly import run_financial_anomaly_detection
from src.data.build_financial_benchmarks import build_financial_benchmarks
from src.modules.duplicate_detection import run_duplicate_work_detection
from src.modules.compliance_engine import run_compliance_engine
from src.modules.delay_risk import run_schedule_risk_engine
from src.risk.composite_risk_engine import run_composite_risk_engine

def run_entire_pipeline(progress_callback=None, run_preprocessing=True, record_sync=True):
    def progress(message):
        print(message)
        if progress_callback:
            progress_callback(message)

    start_t = time.time()
    print("==================================================")
    print("   MPLADS AI PLATFORM — FULL PIPELINE EXECUTION   ")
    print("==================================================")
    
    progress("PREPROCESSING")
    if run_preprocessing:
        preprocess_all()
    
    progress("MASTER_DATASET")
    build_master_dataset()
    
    progress("FINANCIAL_ISOLATION_FOREST")
    run_financial_anomaly_detection()
    progress("FINANCIAL_PEER_BENCHMARKS")
    build_financial_benchmarks()
    
    progress("DUPLICATE_TFIDF_COSINE")
    run_duplicate_work_detection()
    
    progress("COMPLIANCE_RULE_ENGINE")
    run_compliance_engine()

    progress("SCHEDULE_RISK_ENGINE")
    run_schedule_risk_engine()
    
    progress("COMPOSITE_RISK_ENGINE")
    run_composite_risk_engine()

    if record_sync:
        from src.data.sync.sync_runner import record_local_pipeline_run
        local_sync = record_local_pipeline_run(training_status="COMPLETED")
        progress(
            f"LOCAL_DATA_SYNC: {local_sync['new_records_count']:,} new, "
            f"{local_sync['updated_records_count']:,} modified, "
            f"{local_sync['removed_records_count']:,} removed"
        )
    
    elapsed = time.time() - start_t
    print("\n==================================================")
    print(f"   FULL PIPELINE EXECUTION SUCCESSFUL ({elapsed:.1f}s)   ")
    print("==================================================")

if __name__ == "__main__":
    run_entire_pipeline()
