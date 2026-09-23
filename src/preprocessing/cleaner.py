import os
import re
import glob
import pandas as pd
import numpy as np

def extract_work_id(text, default_prefix="WS/UNID", row_idx=0):
    if pd.notnull(text):
        # Handles whitespace/tabs after slashes, e.g. "WS/\t MP620/2025-2026/133167"
        match = re.search(r"WS\s*/\s*([A-Za-z0-9\-_]+)\s*/\s*(\d{4}-\d{4})\s*/\s*(\d+)", str(text))
        if match:
            return f"WS/{match.group(1)}/{match.group(2)}/{match.group(3)}"
        match = re.search(r"WS\s*/\s*([A-Za-z0-9\-_]+)\s*/\s*(\d+)", str(text))
        if match:
            return f"WS/{match.group(1)}/{match.group(2)}"
        match = re.search(r"(WS/[A-Za-z0-9\-_]+/\d{4}-\d{4}/\d+)", str(text))
        if match:
            return match.group(1).strip()
        match = re.search(r"(WS/[A-Za-z0-9\-_]+/\d+)", str(text))
        if match:
            return match.group(1).strip()
    return f"{default_prefix}/{row_idx+1:06d}"

def clean_currency(val):
    if pd.isna(val):
        return np.nan
    s = str(val).replace("₹", "").replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return np.nan

def clean_text(text):
    if pd.isna(text):
        return ""
    return str(text).strip()

def preprocess_all():
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    raw_dir = os.environ.get("RAW_DIR", os.path.join(root_dir, "data", "raw"))
    processed_dir = os.environ.get("PROCESSED_DIR", os.path.join(root_dir, "data", "processed"))
    os.makedirs(processed_dir, exist_ok=True)
    
    print("=== STARTING DATA CLEANING & NORMALIZATION PIPELINE ===")

    # 1. Clean T1 - Allocated Limit
    f_t1 = os.path.join(raw_dir, "Allocated Limit for Honble MPs.csv")
    out1 = os.path.join(processed_dir, "t1_allocated_limits.parquet")
    existing_p1 = pd.read_parquet(out1) if os.path.exists(out1) else None

    if os.path.exists(f_t1):
        try:
            df1 = pd.read_csv(f_t1)
            df1.columns = [c.strip() for c in df1.columns]
            sr_col = next((c for c in df1.columns if c.lower().replace(" ", "").replace(".", "") in {"srno", "sno", "sr_no"}), None)
            if sr_col:
                df1 = df1[df1[sr_col].astype(str).str.replace(".","").str.isdigit()].copy()
            amt_col = next((c for c in df1.columns if "allocated" in c.lower() and "amount" in c.lower()), None)
            if amt_col:
                df1["allocated_amount"] = df1[amt_col].apply(clean_currency)
            state_col = next((c for c in df1.columns if "state" in c.lower()), "State")
            if state_col in df1.columns:
                df1["state"] = df1[state_col].apply(clean_text).str.upper()
            const_col = next((c for c in df1.columns if "constituency" in c.lower()), "Constituency")
            if const_col in df1.columns:
                df1["constituency"] = df1[const_col].apply(clean_text).str.upper()
            mp_col = next((c for c in df1.columns if "mp" in c.lower() or "member" in c.lower()), None)
            if mp_col:
                df1["mp_name"] = df1[mp_col].apply(clean_text).str.upper()

            if existing_p1 is not None and len(existing_p1) >= len(df1) and "allocated_amount" in existing_p1.columns:
                df1 = existing_p1
            df1.to_parquet(out1, index=False)
            print(f"[T1] Cleaned {len(df1):,} records -> {out1}")
        except Exception as e:
            if existing_p1 is not None:
                print(f"[T1] Preserving existing parquet due to: {e}")
                existing_p1.to_parquet(out1, index=False)
            else:
                raise e
    elif existing_p1 is not None:
        print(f"[T1] Using existing parquet ({len(existing_p1):,} records)")

    # 2. Clean T3 - Works Recommended
    f_t3 = os.path.join(raw_dir, "Works Recommended.csv")
    if os.path.exists(f_t3):
        df3 = pd.read_csv(f_t3, low_memory=False)
        df3.columns = [c.strip() for c in df3.columns]
        df3["work_id"] = [extract_work_id(val, "WS/REC", idx) for idx, val in enumerate(df3["WORK"])]
        df3["work_category"] = df3["Work category"].apply(clean_text) if "Work category" in df3.columns else ""
        df3["recommended_amount"] = df3["RECOMMENDED AMOUNT   ( ₹ )"].apply(clean_currency)
        df3["recommended_date"] = pd.to_datetime(df3["Recommended date"], errors='coerce')
        df3["sanction_date"] = pd.to_datetime(df3["Sanction Date"], errors='coerce')
        df3["state"] = df3["State"].apply(clean_text).str.upper()
        df3["constituency"] = df3["Constituency"].apply(clean_text).str.upper()
        df3["mp_name"] = df3["Hon'ble Members of Parliament"].apply(clean_text).str.upper()
        df3["description"] = df3["Work description"].apply(clean_text)
        out3 = os.path.join(processed_dir, "t3_works_recommended.parquet")
        if os.path.exists(out3):
            existing_p3 = pd.read_parquet(out3)
            if len(existing_p3) > len(df3):
                print(f"[T3] Preserving updated dataset with {len(existing_p3):,} records (raw has {len(df3):,})")
                df3 = existing_p3
        df3.to_parquet(out3, index=False)
        print(f"[T3] Cleaned {len(df3):,} records -> {out3}")

    # 3. Clean T4 - Works Sanctioned
    f_t4 = os.path.join(raw_dir, "Works Sanctioned.csv")
    if os.path.exists(f_t4):
        df4 = pd.read_csv(f_t4, low_memory=False)
        df4.columns = [c.strip() for c in df4.columns]
        df4["work_id"] = [extract_work_id(val, "WS/SANC", idx) for idx, val in enumerate(df4["Work"])]
        df4["work_category"] = df4["Work category"].apply(clean_text) if "Work category" in df4.columns else ""
        df4["sanction_amount"] = df4["Sanction Amount ( ₹ )"].apply(clean_currency)
        df4["recommended_date"] = pd.to_datetime(df4["Recommended date"], errors='coerce')
        df4["sanction_date"] = pd.to_datetime(df4["Sanction Date"], errors='coerce')
        df4["state"] = df4["State"].apply(clean_text).str.upper()
        df4["constituency"] = df4["Constituency"].apply(clean_text).str.upper()
        df4["mp_name"] = df4["Hon'ble Members of Parliament"].apply(clean_text).str.upper()
        df4["description"] = df4["Work description"].apply(clean_text)
        df4["work_status"] = df4["Work Status"].apply(clean_text)
        out4 = os.path.join(processed_dir, "t4_works_sanctioned.parquet")
        if os.path.exists(out4):
            existing_p4 = pd.read_parquet(out4)
            if len(existing_p4) > len(df4):
                print(f"[T4] Preserving updated dataset with {len(existing_p4):,} records (raw has {len(df4):,})")
                df4 = existing_p4
        df4.to_parquet(out4, index=False)
        print(f"[T4] Cleaned {len(df4):,} records -> {out4}")

    # 4. Clean T5 - Works Completed
    f_t5 = os.path.join(raw_dir, "Works Completed.csv")
    if os.path.exists(f_t5):
        df5 = pd.read_csv(f_t5, low_memory=False)
        df5.columns = [c.strip() for c in df5.columns]
        df5["work_id"] = [extract_work_id(val, "WS/COMP", idx) for idx, val in enumerate(df5["Work"])]
        df5["work_category"] = df5["Work Category"].apply(clean_text) if "Work Category" in df5.columns else ""
        df5["completed_disbursed_amount"] = df5["Amount Disbursed ( ₹ )"].apply(clean_currency)
        df5["completion_date"] = pd.to_datetime(df5["Completion Date"], errors='coerce')
        df5["state"] = df5["State"].apply(clean_text).str.upper()
        df5["constituency"] = df5["Constituency"].apply(clean_text).str.upper()
        df5["mp_name"] = df5["Hon'ble Members of Parliament"].apply(clean_text).str.upper()
        df5["description"] = df5["Work Description"].apply(clean_text)
        df5["has_image"] = df5["Image"].apply(lambda x: True if str(x).strip().lower() not in ['', 'nan', '\xa0'] else False)
        out5 = os.path.join(processed_dir, "t5_works_completed.parquet")
        if os.path.exists(out5):
            existing_p5 = pd.read_parquet(out5)
            if len(existing_p5) > len(df5):
                print(f"[T5] Preserving updated dataset with {len(existing_p5):,} records (raw has {len(df5):,})")
                df5 = existing_p5
        df5.to_parquet(out5, index=False)
        print(f"[T5] Cleaned {len(df5):,} records -> {out5}")

    # 5. Clean T6 - Expenditure Records
    f_t6 = glob.glob(os.path.join(raw_dir, "Expenditure*.csv"))
    if f_t6:
        df6 = pd.read_csv(f_t6[0], low_memory=False)
        df6.columns = [c.strip() for c in df6.columns]
        df6["work_id"] = [extract_work_id(val, "WS/EXP", idx) for idx, val in enumerate(df6["Work ID"])]
        df6["expenditure_amount"] = df6["Fund Disbursed Amount ( ₹ )"].apply(clean_currency)
        df6["expenditure_date"] = pd.to_datetime(df6["Expenditure Date"], errors='coerce')
        df6["state"] = df6["State"].apply(clean_text).str.upper()
        df6["constituency"] = df6["Constituency"].apply(clean_text).str.upper()
        df6["mp_name"] = df6["Hon'ble Members of Parliament"].apply(clean_text).str.upper()
        df6["payment_status"] = df6["Payment Status"].apply(clean_text)
        # Keep expenditure records limited to fields used by the approved risk
        # engines.
        expenditure_columns = [
            "work_id", "expenditure_amount", "expenditure_date", "state",
            "constituency", "mp_name", "payment_status",
            "Sr. No.", "State", "Work", "Work ID", "IDA",
            "Hon'ble Members of Parliament", "Constituency", "Expenditure Date",
            "Payment Status", "Fund Disbursed Amount ( ₹ )",
        ]
        df6 = df6[[column for column in expenditure_columns if column in df6.columns]].copy()
        out6 = os.path.join(processed_dir, "t6_expenditure.parquet")
        if os.path.exists(out6):
            existing_p6 = pd.read_parquet(out6)
            if len(existing_p6) > len(df6):
                print(f"[T6] Preserving updated dataset with {len(existing_p6):,} records (raw has {len(df6):,})")
                df6 = existing_p6
        df6.to_parquet(out6, index=False)
        print(f"[T6] Cleaned {len(df6):,} records -> {out6}")

    # 6. Clean T7 - Calamity Consents
    f_t7 = os.path.join(raw_dir, "Amount consented for Calamity.csv")
    if os.path.exists(f_t7):
        df7 = pd.read_csv(f_t7)
        df7.columns = [c.strip() for c in df7.columns]
        df7 = df7[df7["Sr. No."].astype(str).str.replace(".","").str.isdigit()].copy()
        df7["consent_amount"] = df7["Consent Amount ( ₹ )"].apply(clean_currency)
        df7["calamity_type"] = df7["Calamity Type"].apply(clean_text)
        df7["calamity_name"] = df7["Calamity Name"].apply(clean_text)
        df7["mp_name"] = df7["Hon'ble Members of Parliament"].apply(clean_text).str.upper()
        df7["consent_date"] = pd.to_datetime(df7["Date of Consent"], errors='coerce')
        out7 = os.path.join(processed_dir, "t7_calamity_consents.parquet")
        df7.to_parquet(out7, index=False)
        print(f"[T7] Cleaned {len(df7):,} records -> {out7}")

    print("=== PREPROCESSING COMPLETE ===")

if __name__ == "__main__":
    preprocess_all()
