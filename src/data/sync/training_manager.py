"""Staged, fail-safe retraining for every risk engine."""
from __future__ import annotations

import json
import os
import shutil
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from src.data.sync.sync_config import (
    FEATURES_DIR, PROCESSED_DIR, TRAINING_BACKUP_DIR, TRAINING_DIR,
    TRAINING_STAGING_DIR, TRAINING_STATUS_FILE,
)
from src.utils.mlflow_tracker import MLflowTracker


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class TrainingManager:
    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mplads-training")
        self.lock = threading.Lock()

    def _read_status(self) -> dict:
        if os.path.exists(TRAINING_STATUS_FILE):
            try:
                with open(TRAINING_STATUS_FILE, encoding="utf-8") as handle:
                    return json.load(handle)
            except Exception:
                pass
        return {"status": "IDLE", "progress": 0, "message": "No training job has run."}

    def _write_status(self, payload: dict) -> dict:
        os.makedirs(os.path.dirname(TRAINING_STATUS_FILE), exist_ok=True)
        with open(TRAINING_STATUS_FILE, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, default=str)
        return payload

    def status(self) -> dict:
        return self._read_status()

    def _validate(self, feature_dir: str) -> dict:
        required = ["master_analytical.parquet", "financial_anomalies.parquet",
                    "duplicate_work_candidates.parquet", "compliance_risk_analysis.parquet",
                    "schedule_risk_analysis.parquet", "master_project_risk_scores.parquet"]
        missing = [name for name in required if not os.path.exists(os.path.join(feature_dir, name))]
        if missing:
            raise RuntimeError(f"Training validation failed; missing artifacts: {', '.join(missing)}")
        master = pd.read_parquet(os.path.join(feature_dir, "master_project_risk_scores.parquet"))
        if master.empty or "work_id" not in master.columns:
            raise RuntimeError("Training validation failed; promoted master risk dataset is empty")
        risk_columns = [c for c in ("financial_risk_score", "duplicate_risk_score", "compliance_risk_score", "schedule_risk_score", "composite_risk_score") if c in master]
        finite = {c: int(np.isfinite(pd.to_numeric(master[c], errors="coerce")).sum()) for c in risk_columns}
        if any(count == 0 for count in finite.values()):
            raise RuntimeError("Training validation failed; risk artifacts contain no finite scores")
        return {"rows": int(len(master)), "risk_columns": finite}

    def _drift(self, old_dir: str, new_dir: str) -> dict:
        result = {}
        path = os.path.join(new_dir, "master_project_risk_scores.parquet")
        old_path = os.path.join(old_dir, "master_project_risk_scores.parquet")
        if not os.path.exists(path) or not os.path.exists(old_path):
            return result
        new = pd.read_parquet(path)
        old = pd.read_parquet(old_path)
        for column in ("financial_risk_score", "duplicate_risk_score", "compliance_risk_score", "schedule_risk_score", "composite_risk_score"):
            if column not in new or column not in old:
                continue
            a = pd.to_numeric(old[column], errors="coerce").dropna().to_numpy()
            b = pd.to_numeric(new[column], errors="coerce").dropna().to_numpy()
            if len(a) and len(b):
                result[column] = {"old_mean": float(np.mean(a)), "new_mean": float(np.mean(b)),
                                  "mean_delta": float(np.mean(b) - np.mean(a)),
                                  "old_count": int(len(a)), "new_count": int(len(b))}
        return result

    def _run(self, run_id: str, snapshot_id: str | None, diff: dict) -> dict:
        stage_root = os.path.join(TRAINING_STAGING_DIR, run_id)
        stage_processed = os.path.join(stage_root, "processed")
        stage_features = os.path.join(stage_root, "features")
        backup_dir = os.path.join(TRAINING_BACKUP_DIR, run_id)
        os.makedirs(stage_processed, exist_ok=True)
        os.makedirs(stage_features, exist_ok=True)
        status = {"run_id": run_id, "status": "RUNNING", "progress": 1, "message": "Preparing isolated training workspace.", "started_at": _now(), "snapshot_id": snapshot_id, "delta": diff}
        self._write_status(status)
        original_env = {key: os.environ.get(key) for key in ("PROCESSED_DIR", "FEATURES_DIR")}
        try:
            for name in os.listdir(PROCESSED_DIR):
                source = os.path.join(PROCESSED_DIR, name)
                if os.path.isfile(source):
                    shutil.copy2(source, os.path.join(stage_processed, name))
            os.environ["PROCESSED_DIR"] = stage_processed
            os.environ["FEATURES_DIR"] = stage_features
            from src.run_pipeline import run_entire_pipeline

            def update(message):
                phase_progress = {"MASTER_DATASET": 15, "FINANCIAL_ISOLATION_FOREST": 35, "DUPLICATE_TFIDF_COSINE": 55, "COMPLIANCE_RULE_ENGINE": 70, "SCHEDULE_RISK_ENGINE": 82, "COMPOSITE_RISK_ENGINE": 94}
                current = self._read_status()
                current.update({"status": "RUNNING", "progress": phase_progress.get(message, current.get("progress", 1)), "message": message})
                self._write_status(current)

            # The API sync commit already records the official-data snapshot.
            # Do not create a second local-dataset sync event for the isolated
            # training workspace used to validate the new artifacts.
            run_entire_pipeline(progress_callback=update, run_preprocessing=False, record_sync=False)
            validation = self._validate(stage_features)
            drift = self._drift(FEATURES_DIR, stage_features)
            status.update({"progress": 97, "message": "Validation passed; promoting atomic model artifacts."})
            self._write_status(status)
            os.makedirs(backup_dir, exist_ok=True)
            for name in os.listdir(FEATURES_DIR):
                source = os.path.join(FEATURES_DIR, name)
                if os.path.isfile(source):
                    shutil.copy2(source, os.path.join(backup_dir, name))
            for name in os.listdir(stage_features):
                source = os.path.join(stage_features, name)
                if os.path.isfile(source):
                    temp = os.path.join(FEATURES_DIR, f"{name}.training-tmp")
                    shutil.copy2(source, temp)
                    os.replace(temp, os.path.join(FEATURES_DIR, name))
            artifacts_dir = os.path.join(TRAINING_DIR, "mlruns", run_id, "artifacts")
            os.makedirs(artifacts_dir, exist_ok=True)
            for name in os.listdir(stage_features):
                source = os.path.join(stage_features, name)
                if os.path.isfile(source):
                    shutil.copy2(source, os.path.join(artifacts_dir, name))
            metrics = {"total_works": validation["rows"], "delta_new": diff.get("new_count", 0), "delta_updated": diff.get("updated_count", 0), "drift": drift}
            run_data = MLflowTracker().log_training_run({"n_estimators": 100, "contamination": 0.05, "random_state": 42}, metrics, snapshot_id or "LOCAL")
            with open(os.path.join(TRAINING_DIR, "mlruns", run_id, "run.json"), "w", encoding="utf-8") as handle:
                json.dump({"run_id": run_id, "params": {"models": "isolation_forest,tfidf_cosine,compliance_rules,schedule,composite"}, "metrics": metrics, "registry": run_data}, handle, indent=2, default=str)
            status.update({"status": "COMPLETED", "progress": 100, "message": "All risk models trained and promoted.", "completed_at": _now(), "validation": validation, "drift": drift, "artifact_dir": artifacts_dir})
            return self._write_status(status)
        except Exception as exc:
            # Restore the prior production artifact set if promotion had started.
            if os.path.isdir(backup_dir):
                for name in os.listdir(backup_dir):
                    shutil.copy2(os.path.join(backup_dir, name), os.path.join(FEATURES_DIR, name))
            status.update({"status": "FAILED_ROLLED_BACK", "progress": 0, "message": str(exc), "error": str(exc), "failed_at": _now()})
            self._write_status(status)
            return status
        finally:
            for key, value in original_env.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    def start(self, snapshot_id: str | None, diff: dict) -> dict:
        with self.lock:
            current = self._read_status()
            if current.get("status") == "RUNNING":
                return current
            run_id = f"TRAIN-{uuid.uuid4().hex[:12].upper()}"
            self._write_status({"run_id": run_id, "status": "QUEUED", "progress": 0, "message": "Training queued behind current request.", "queued_at": _now(), "snapshot_id": snapshot_id, "delta": diff})
            self.executor.submit(self._run, run_id, snapshot_id, diff)
            return self._read_status()

    def run_blocking(self, snapshot_id: str | None, diff: dict) -> dict:
        with self.lock:
            run_id = f"TRAIN-{uuid.uuid4().hex[:12].upper()}"
            return self._run(run_id, snapshot_id, diff)


TRAINING_MANAGER = TrainingManager()
