import json
import os

with open("data/processed/visual_ocr_results.json", "r", encoding="utf-8") as f:
    data = json.load(f)

bills = []
for fname, rec in data.items():
    text = " ".join(l["text"] for l in rec.get("lines", [])).lower()
    
    is_running_bill = any(k in text for k in [
        "running account bill", "cash book voucher", "account of work done", 
        "memorandum of payment", "memorandum of payments", "form 27"
    ])
    is_voucher = any(k in text for k in [
        "payment voucher", "paid by cash", "voucher no", "cheque no", "cash memo"
    ])
    is_invoice = any(k in text for k in [
        "tax invoice", "retail invoice", "invoice no", "gstin"
    ]) or ("supply of" in text and "bill" in text)
    is_general_bill = ("bill" in text or "receipt" in text) and any(w in text for w in [
        "contractor", "rate", "quantity", "amount", "total", "measurement"
    ])
    
    if is_running_bill or is_voucher or is_invoice or is_general_bill:
        btype = "Unknown"
        if is_running_bill:
            if "memorandum of payment" in text or "memorandum of payments" in text:
                btype = "Memorandum of Payments (Bill Summary)"
            elif "account of work done" in text:
                btype = "Account of Work Done (M-Book Bill)"
            else:
                btype = "Running Account Bill / Cash Voucher Form"
        elif is_voucher:
            btype = "Payment Voucher / Cash Memo"
        elif is_invoice:
            btype = "Material / Commercial Tax Invoice"
        elif is_general_bill:
            btype = "Contractor Bill / Work Abstract"
            
        bills.append({
            "file": fname,
            "work_id": fname.split("_")[1] if "_" in fname else "Unknown",
            "type": btype,
            "lines_count": len(rec.get("lines", [])),
            "snippet": " | ".join(l["text"] for l in rec.get("lines", [])[:5])
        })

print(f"Total bill pages detected: {len(bills)}")
for b in sorted(bills, key=lambda x: (x["work_id"], x["file"])):
    print(f"Work {b['work_id']} | {b['file']} | [{b['type']}]: {b['snippet'][:85]}")
