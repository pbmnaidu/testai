import pandas as pd
import os

backend_root = r"p:\SIH\mplads_updated-main"
features_dir = os.path.join(backend_root, "data", "features")
master_path = os.path.join(features_dir, "master_project_risk_scores.parquet")

master = pd.read_parquet(master_path)
print("Total rows in master_project_risk_scores.parquet:", len(master))

state_counts = master["state"].value_counts()
for s, c in state_counts.items():
    if c == 3057 or abs(c - 3057) < 50:
        print(f"MATCH: State '{s}' has {c} works!")
