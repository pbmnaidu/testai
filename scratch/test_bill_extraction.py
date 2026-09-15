import json
import re
import os

with open("data/processed/visual_ocr_results.json", "r", encoding="utf-8") as f:
    ocr_data = json.load(f)

def extract_bill_meta(fname, rec):
    lines = [l["text"] for l in rec.get("lines", [])]
    full_text = " ".join(lines)
    lower = full_text.lower()
    
    # Check if it is a bill or voucher page
    bill_types = []
    
    if "payment voucher" in lower or ("paid by cash" in lower and "voucher" in lower) or "c.b. vr.no" in lower:
        bill_types.append("Handwritten Cash Payment Voucher")
    if "running account bill" in lower or "form 27" in lower or "p.w.d. vi-75" in lower or "cash book voucher" in lower:
        bill_types.append("PWD Running Account Bill (Form 27)")
    if "account of work done" in lower or "supplies made" in lower or "measurement book" in lower:
        bill_types.append("Measurement Book (M-Book) Work Bill")
    if "memorandum of payment" in lower or "memorandum of payments" in lower:
        bill_types.append("Memorandum of Payments & Settlement")
    if "final bill" in lower or "contractor" in lower and any(k in lower for k in ["gross value", "detailed bill", "net value"]):
        bill_types.append("Contractor Final Bill Abstract")
        
    if not bill_types:
        return None
        
    # Extract details
    primary_type = bill_types[0]
    
    # Try extracting amount
    amounts = re.findall(r"(?:rs\.?|inr|rupees)[:\s]*([0-9,]+(?:\.[0-9]{2})?)", full_text, re.IGNORECASE)
    amt_candidates = []
    for a in amounts:
        cleaned = a.replace(",", "")
        try:
            val = float(cleaned)
            if 100 <= val <= 100000000:
                amt_candidates.append((val, a))
        except:
            pass
            
    # Try finding contractor
    contractor = "Unknown / Not Detected"
    m_cont = re.search(r"(?:contractor|name of the contractor|agency|paid to)[:\s\-]+([A-Za-z0-9\.\s&,]+?)(?:\n|dated|purpose|serial|$)", full_text, re.IGNORECASE)
    if m_cont:
        c_name = m_cont.group(1).strip()
        if len(c_name) > 3 and not any(skip in c_name.lower() for skip in ["division", "month", "sub"]):
            contractor = c_name[:50]

    # Try finding voucher/bill no
    bill_no = "N/A"
    m_no = re.search(r"(?:bill\s*no|voucher\s*no|vr\.?\s*no|c\.b\.?\s*vr\.?\s*no)[:\s\-]*([A-Za-z0-9\/\-]+)", full_text, re.IGNORECASE)
    if m_no:
        bill_no = m_no.group(1).strip()

    # Try finding date
    bill_date = "N/A"
    m_dt = re.search(r"(?:dated?|dt)[:\s\-]*([0-9]{1,2}[\/\.\-][0-9]{1,2}[\/\.\-][0-9]{2,4})", full_text, re.IGNORECASE)
    if m_dt:
        bill_date = m_dt.group(1).strip()

    return {
        "file": fname,
        "primary_type": primary_type,
        "all_types": bill_types,
        "bill_no": bill_no,
        "date": bill_date,
        "contractor": contractor,
        "amounts_found": [a[1] for a in amt_candidates[:3]],
        "line_count": len(lines),
        "text_sample": lines[:6]
    }

detected_bills = {}
for fname, rec in ocr_data.items():
    meta = extract_bill_meta(fname, rec)
    if meta:
        wid = fname.split("_")[1] if "_" in fname else "unknown"
        detected_bills.setdefault(wid, []).append(meta)

print(f"Total Works with detected bills: {len(detected_bills)}")
total_b = sum(len(v) for v in detected_bills.values())
print(f"Total Bill pages detected: {total_b}")

for wid, blist in sorted(detected_bills.items()):
    print(f"\nWork {wid} ({len(blist)} bill pages):")
    for b in blist:
        print(f"  - {b['file']} -> {b['primary_type']} | BillNo: {b['bill_no']} | Date: {b['date']} | Cont: {b['contractor']} | Amts: {b['amounts_found']}")
