"""Create a sample of the current constituency-history financial analysis."""

import os
import pandas as pd


def create_report():
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    path = os.path.join(base, "data", "features", "financial_anomalies.parquet")
    financial = pd.read_parquet(path)
    columns = [
        "work_id", "description", "constituency", "main_sector", "effective_work_category",
        "financial_risk_level", "financial_risk_rank", "financial_explanation",
        "financial_risk_evidence", "historical_cost_min", "historical_cost_max",
        "historical_cost_median", "current_cost", "historical_unit_price_min",
        "historical_unit_price_max", "historical_unit_price_median", "current_unit_price",
    ]
    columns = [column for column in columns if column in financial.columns]
    sample = financial[financial["is_financial_outlier"]].sort_values("financial_risk_rank").head(100)
    report_dir = os.path.join(base, "data", "reports")
    os.makedirs(report_dir, exist_ok=True)
    sample[columns].to_csv(os.path.join(report_dir, "constituency_financial_risk_sample.csv"), index=False)
    print(f"Wrote {len(sample)} constituency-history financial risk records")


if __name__ == "__main__":
    create_report()
