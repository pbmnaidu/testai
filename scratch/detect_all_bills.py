import json
import glob
import os

with open("data/processed/visual_ocr_results.json", "r", encoding="utf-8") as f:
    data = json.load(f)

# Look for pages with bill/voucher/measurement book terms
results = []
for fname, rec in sorted(data.items()):
    lines = [l["text"] for l in rec.get("lines", [])]
    text = " ".join(lines).lower()
    
    is_bill = False
    bill_category = ""
    
    # 1. Official PWD Running Account Bill / Form 27
    if any(k in text for k in ["running account bill", "p.w.d. vi-75", "form 27", "cash book voucher"]):
        is_bill = True
        bill_category = "PWD Running Account Bill (Form 27)"
    # 2. Measurement Book Bill / Account of Work Done
    elif "account of work done" in text or "measurement book" in text or "supplies made" in text:
        is_bill = True
        bill_category = "Measurement Book (M-Book) Work Bill"
    # 3. Memorandum of Payments / Contractor Payment Voucher
    elif "memorandum of payment" in text or "memorandum of payments" in text:
        is_bill = True
        bill_category = "Memorandum of Payments Voucher"
    # 4. Cash / Payment Voucher
    elif any(k in text for k in ["payment voucher", "paid by cash", "cheque to", "head of account"]) and "bill" in text:
        is_bill = True
        bill_category = "Cash / Cheque Payment Voucher"
    # 5. Material / Quarry / Cement / Steel / Retail Tax Invoice
    elif any(k in text for k in ["tax invoice", "retail invoice", "cash memo", "bill of supply", "gstin"]):
        is_bill = True
        bill_category = "Commercial / Material Tax Invoice"
    # 6. Work Completion Bill / Contractor Abstract
    elif "final bill" in text or ("detailed bill" in text and "gross value" in text):
        is_bill = True
        bill_category = "Contractor Final Bill Abstract"

    if is_bill:
        wid = fname.split("_")[1] if "_" in fname else "Unknown"
        page = fname.split("_")[2] if len(fname.split("_")) > 2 else ""
        results.append({
            "work_id": wid,
            "filename": fname,
            "page": page,
            "category": bill_category,
            "line_count": len(lines),
            "snippet": " | ".join(lines[:4])
        })

print(f"Detected {len(results)} Bill/Voucher pages across all works:")
for r in results:
    print(f"Work {r['work_id']} | {r['page']} | {r['category']} | {r['filename']}")
