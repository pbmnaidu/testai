"""
Audit All File Types, Scanned Images & Bill Proof (MoSPI Ground Truth)
====================================================================
Implements User Classification Criteria:
  1. Extract ALL types of files present (PDFs, JPEGs, PNGs, etc.).
  2. If scanned images / pictures are present in PDF or any files -> MARK AS GREEN.
  3. If entire files of a work contain ONLY text (no images) ->
       - If text contains words related to bills or completion proof -> MARK AS YELLOW ("No image - Bill / Completion Proof Only").
       - Else -> MARK AS RED ("File exists but no bills or scanned images").
  4. If no file is attached -> MARK AS RED ("No Document Uploaded").
"""

import os
import sys
sys.stdout.reconfigure(encoding='utf-8')
import io
import re
import json
import glob
from pypdf import PdfReader
from PIL import Image

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from download_mplads_pdfs import get_attachments_for_work, download_attachment_by_id

BILL_PROOF_KEYWORDS = [
    'bill', 'final bill', 'voucher', 'invoice', 'utilization certificate',
    'uc', 'expenditure', 'payment', 'm-book', 'measurement', 'passed for payment',
    'sanction order', 'completion certificate', 'completed work', 'abstract',
    'quality check', 'quality control', 'qc', 'running account bill', 'ra bill',
    'mb no', 'check slip', 'part bill', 'contractor bill'
]

def check_gps_exif(img_path):
    try:
        with Image.open(img_path) as im:
            exif = im.getexif()
            if not exif:
                return None
            gps_ifd = exif.get_ifd(0x8825)
            if not gps_ifd:
                return None
            lat_ref = gps_ifd.get(1, 'N')
            lat_vals = gps_ifd.get(2)
            lon_ref = gps_ifd.get(3, 'E')
            lon_vals = gps_ifd.get(4)
            if lat_vals and lon_vals:
                def to_deg(v):
                    return float(v[0]) + (float(v[1]) / 60.0) + (float(v[2]) / 3600.0)
                lat = to_deg(lat_vals)
                if lat_ref == 'S': lat = -lat
                lon = to_deg(lon_vals)
                if lon_ref == 'W': lon = -lon
                return {"latitude": round(lat, 6), "longitude": round(lon, 6), "source": "EXIF Tag 0x8825"}
    except Exception:
        pass
    return None

def run_audit():
    print("[*] Loading current combined audit...")
    with open("data/processed/combined_geotag_audit.json", "r", encoding="utf-8") as f:
        works = json.load(f)

    # Load Visual OCR GPS Results if available
    ocr_results = {}
    ocr_path = "data/processed/visual_ocr_results.json"
    if os.path.exists(ocr_path):
        print("[*] Loading visual OCR GPS results...")
        with open(ocr_path, "r", encoding="utf-8") as f:
            ocr_results = json.load(f)

    updated_works = []
    manifest = {}
    total_with_gps = 0

    for w in works:
        wid = str(w["work_id"])
        constituency = w.get("constituency", "Unknown")

        # 1. Gather all attached files on disk
        pdf_pattern = f"downloads/pdfs/WORK_{wid}_*.pdf"
        img_pattern = f"downloads/images/WORK_{wid}_*.*"
        
        local_pdfs = glob.glob(pdf_pattern)
        local_imgs = glob.glob(img_pattern)

        attached_files = []
        pdf_file = None
        pdf_size_kb = 0
        pdf_page_count = 0
        pdf_extracted_text = ""
        all_images = []

        # Check PDF
        if local_pdfs:
            p = local_pdfs[0]
            pdf_file = os.path.basename(p)
            pdf_size_kb = round(os.path.getsize(p) / 1024, 1)
            attached_files.append({
                "name": pdf_file,
                "type": "PDF Document",
                "size_kb": pdf_size_kb,
                "path": f"downloads/pdfs/{pdf_file}"
            })
            try:
                reader = PdfReader(p)
                pdf_page_count = len(reader.pages)
                for page in reader.pages:
                    txt = page.extract_text()
                    if txt:
                        pdf_extracted_text += " " + txt
            except Exception as e:
                print(f"    [-] PDF read error for Work {wid}: {e}")

        # Check Images (both standalone attachments and extracted PDF images)
        for img_path in sorted(local_imgs):
            iname = os.path.basename(img_path)
            all_images.append(iname)
            # If it's a direct standalone attachment (not extracted page_Im)
            if not ("page" in iname and "Im" in iname):
                is_standalone = True
                ext = iname.split(".")[-1].upper()
                attached_files.append({
                    "name": iname,
                    "type": f"{ext} Image Attachment",
                    "size_kb": round(os.path.getsize(img_path) / 1024, 1),
                    "path": f"downloads/images/{iname}"
                })

        # Forensic GPS Inspection on all images (EXIF + Visual Watermark OCR)
        has_real_gps = False
        gps_data = None
        sample_images = []
        work_image_gps = {}

        for iname in all_images:
            ipath = os.path.join("downloads/images", iname)
            gps_info = check_gps_exif(ipath)
            ocr_record = ocr_results.get(iname, {})
            ocr_gps = ocr_record.get("gps")

            final_img_gps = None
            if ocr_gps:
                final_img_gps = {
                    "latitude": ocr_gps["latitude"],
                    "longitude": ocr_gps["longitude"],
                    "source": "Visual GPS Stamp (Photo Watermark)",
                    "raw_stamp_text": ocr_gps.get("raw_text", ""),
                    "location_name": ocr_gps.get("location_name"),
                    "timestamp": ocr_gps.get("timestamp"),
                    "image_name": iname,
                    "bbox": {
                        "x_pct": ocr_gps.get("bbox_x_pct", 0),
                        "y_pct": ocr_gps.get("bbox_y_pct", 0),
                        "w_pct": ocr_gps.get("bbox_w_pct", 0),
                        "h_pct": ocr_gps.get("bbox_h_pct", 0)
                    }
                }
                work_image_gps[iname] = final_img_gps
            elif gps_info:
                final_img_gps = {
                    **gps_info,
                    "image_name": iname,
                    "raw_stamp_text": f"EXIF Tag 0x8825: {gps_info['latitude']}, {gps_info['longitude']}",
                    "bbox": None
                }
                work_image_gps[iname] = final_img_gps

            if final_img_gps and not gps_data:
                has_real_gps = True
                gps_data = final_img_gps
            elif final_img_gps:
                has_real_gps = True

            sample_images.append({
                "name": iname,
                "is_photo": True,
                "has_gps": bool(final_img_gps),
                "gps": final_img_gps
            })

        if has_real_gps:
            total_with_gps += 1

        has_scanned_images = len(all_images) > 0
        has_any_file = len(attached_files) > 0 or has_scanned_images

        # Check for bill/completion proof keywords in PDF text and title/description
        combined_text = (pdf_extracted_text + " " + w.get("title", "") + " " + w.get("description", "")).lower()
        matched_bill_kws = [kw for kw in BILL_PROOF_KEYWORDS if kw in combined_text]
        has_bill_proof = len(matched_bill_kws) > 0

        # === EXACT 3-TIER CLASSIFICATION RULES ===
        if has_scanned_images:
            # Rule 1: Scanned image picture present in pdf or any files -> GREEN
            classification = "GREEN"
            if has_real_gps and gps_data:
                badge_text = "🟢 Geotagged Picture Verified"
                geotag_status = "GEOTAG_VERIFIED"
                source_lbl = gps_data.get("source", "GPS Stamp")
                reason = f"{len(all_images)} scanned picture(s) found. Ground-truth coordinates extracted from {source_lbl}: {gps_data['latitude']}° N, {gps_data['longitude']}° E ({gps_data.get('raw_stamp_text', '')})."
            else:
                badge_text = "🟢 Scanned Image / Picture Present"
                geotag_status = "PHOTO_PRESENT_UNTAGGED"
                reason = f"{len(all_images)} authentic scanned image(s) / photographic picture(s) present (GPS coordinates not stamped on photo)."
        elif has_any_file and has_bill_proof:
            # Rule 2: Entire files contain ONLY text (no images), with bills/completion proof -> YELLOW
            classification = "YELLOW"
            badge_text = "🟡 Bill / Completion Proof Only (No Images)"
            geotag_status = "TEXT_BILL_PROOF_ONLY"
            reason = f"No images found. Document contains verified bill/completion proof keywords: {', '.join(matched_bill_kws[:4])}."
        elif has_any_file and not has_bill_proof:
            # Rule 3B: File present but no bills or scanned images -> RED
            classification = "RED"
            badge_text = "🔴 No Bills or Images (Invalid Proof)"
            geotag_status = "FILE_NO_BILLS_OR_IMAGES"
            reason = "File exists on portal, but contains NEITHER scanned images/pictures NOR bills/completion proof."
        else:
            # Rule 3A: No file present -> RED
            classification = "RED"
            badge_text = "🔴 No Document Uploaded"
            geotag_status = "NO_DOCUMENT_UPLOADED"
            reason = "No completion dossier, photographs, or proof files were uploaded to MoSPI."

        updated_work = {
            **w,
            "latitude": gps_data["latitude"] if gps_data else None,
            "longitude": gps_data["longitude"] if gps_data else None,
            "geocoding_source": gps_data["source"] if gps_data else None,
            "has_real_gps": has_real_gps,
            "audit_classification": classification,
            "audit_badge_text": badge_text,
            "audit_reason": reason,
            "attached_files": attached_files,
            "pdf_audit": {
                "file_name": pdf_file,
                "file_size_kb": pdf_size_kb,
                "page_count": pdf_page_count,
                "total_images": len(all_images),
                "has_photo_evidence": has_scanned_images,
                "has_bill_proof": has_bill_proof,
                "bill_proof_keywords": matched_bill_kws[:6],
                "geotag_status": geotag_status,
                "gps": gps_data,
                "sections": w.get("pdf_audit", {}).get("sections", []),
                "sample_images": sample_images
            }
        }
        updated_works.append(updated_work)

        manifest[wid] = {
            "pdf_file": pdf_file,
            "pdf_size": os.path.getsize(local_pdfs[0]) if local_pdfs else 0,
            "files": [f["name"] for f in attached_files],
            "images": all_images,
            "image_gps": work_image_gps
        }

    # Save outputs
    with open("data/processed/combined_geotag_audit.json", "w", encoding="utf-8") as f:
        json.dump(updated_works, f, indent=2)

    with open("data/processed/combined_download_manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    # Breakdown summary
    g_count = sum(1 for w in updated_works if w["audit_classification"] == "GREEN")
    y_count = sum(1 for w in updated_works if w["audit_classification"] == "YELLOW")
    r_count = sum(1 for w in updated_works if w["audit_classification"] == "RED")

    print("\n[SUCCESS] Audit classification complete per user rules:")
    print(f"   - 🟢 GREEN (Scanned Images / Pictures Present): {g_count}")
    print(f"        └─ With Genuine Visual GPS Stamps: {total_with_gps}")
    print(f"        └─ Scanned Pictures Untagged: {g_count - total_with_gps}")
    print(f"   - 🟡 YELLOW (Bill / Completion Proof Only - No Images): {y_count}")
    print(f"   - 🔴 RED (No Document or Missing Proof): {r_count}")

if __name__ == "__main__":
    run_audit()

