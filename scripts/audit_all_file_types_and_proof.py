"""
Audit All File Types, Scanned Images & Bill Proof (MoSPI Ground Truth)
====================================================================
Implements User Classification Criteria:
  1. Priority 1: Geotagged image or scanned picture/photo (Main First Priority).
  2. Priority 2: Bills or any related financial details (if no scanned image or geotagged photo).
  3. Priority 3: If no bills AND no progress status tables -> mark as Risk (Score 65 / HIGH Risk).
  4. Priority 4: If only 1 or 2 pages with no images, geotagged photos, or bills -> mark as Critical Risk (Score 85 / CRITICAL Risk).
  5. Cross-Work Fraud Detection:
     - Check if two works share the exact same files (SHA-256), exact same images, or exact same geotagged location stamps.
     - If identical: Flag as Suspected Fraud, OVERRIDE COMPOSITE RISK SCORE TO 100.
     - False-positive guardrail: Strict exact match only. If text changes between documents and no exact file/photo/coordinate match, do not flag as fraud.
  6. Display in Work Risk Description:
     - Remove any existing image co-relation jargon.
     - Display ONLY what is NOT present in clear, human-understandable audit language.
"""

import os
import sys
sys.stdout.reconfigure(encoding='utf-8')
import io
import re
import json
import glob
import math
import hashlib
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

TABLE_KEYWORDS = [
    's.no', 'sl.no', 'item no', 'quantity', 'rate', 'amount',
    'abstract estimate', 'measurement book', 'm.book', 'physical progress',
    'stage of work', 'work status', 'tabular'
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

def compute_sha256(file_path):
    try:
        with open(file_path, 'rb') as f:
            return hashlib.sha256(f.read()).hexdigest()
    except Exception:
        return None

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371000  # meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

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

    intermediate_works = []
    manifest = {}
    file_hash_map = {}  # sha256 -> list of (work_id, filename)
    image_hash_map = {}

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
        has_progress_tables = False
        all_images = []

        # Check PDF
        if local_pdfs:
            p = local_pdfs[0]
            pdf_file = os.path.basename(p)
            pdf_size_kb = round(os.path.getsize(p) / 1024, 1)
            pdf_hash = compute_sha256(p)
            if pdf_hash:
                file_hash_map.setdefault(pdf_hash, []).append((wid, pdf_file))

            attached_files.append({
                "name": pdf_file,
                "type": "PDF Document",
                "size_kb": pdf_size_kb,
                "path": f"downloads/pdfs/{pdf_file}",
                "sha256": pdf_hash
            })
            try:
                reader = PdfReader(p)
                pdf_page_count = len(reader.pages)
                table_hits = 0
                for page in reader.pages:
                    txt = page.extract_text()
                    if txt:
                        pdf_extracted_text += " " + txt
                        low_txt = txt.lower()
                        if any(kw in low_txt for kw in TABLE_KEYWORDS):
                            table_hits += 1
                if table_hits > 0:
                    has_progress_tables = True
            except Exception as e:
                print(f"    [-] PDF read error for Work {wid}: {e}")

        # Check Images
        for img_path in sorted(local_imgs):
            iname = os.path.basename(img_path)
            all_images.append(iname)
            img_hash = compute_sha256(img_path)
            if img_hash:
                image_hash_map.setdefault(img_hash, []).append((wid, iname))

            # Standalone attachment check
            if not ("page" in iname and "Im" in iname):
                ext = iname.split(".")[-1].upper()
                attached_files.append({
                    "name": iname,
                    "type": f"{ext} Image Attachment",
                    "size_kb": round(os.path.getsize(img_path) / 1024, 1),
                    "path": f"downloads/images/{iname}",
                    "sha256": img_hash
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

        has_scanned_images = len(all_images) > 0
        has_any_file = len(attached_files) > 0 or has_scanned_images

        # Check for bill/completion proof keywords
        combined_text = (pdf_extracted_text + " " + w.get("title", "") + " " + w.get("description", "")).lower()
        matched_bill_kws = [kw for kw in BILL_PROOF_KEYWORDS if kw in combined_text]
        has_bill_proof = len(matched_bill_kws) > 0

        intermediate_works.append({
            "base_work": w,
            "work_id": wid,
            "attached_files": attached_files,
            "pdf_file": pdf_file,
            "pdf_size_kb": pdf_size_kb,
            "pdf_page_count": pdf_page_count,
            "has_progress_tables": has_progress_tables,
            "all_images": all_images,
            "has_scanned_images": has_scanned_images,
            "has_real_gps": has_real_gps,
            "gps_data": gps_data,
            "work_image_gps": work_image_gps,
            "sample_images": sample_images,
            "has_bill_proof": has_bill_proof,
            "matched_bill_kws": matched_bill_kws,
            "has_any_file": has_any_file
        })

        manifest[wid] = {
            "pdf_file": pdf_file,
            "pdf_size": os.path.getsize(local_pdfs[0]) if local_pdfs else 0,
            "files": [f["name"] for f in attached_files],
            "images": all_images,
            "image_gps": work_image_gps
        }

    # === STEP 2: CROSS-WORK FRAUD DETECTION ENGINE ===
    print("[*] Running cross-work fraud detection engine...")
    fraud_flags = {}  # wid -> fraud_dict

    # Check GPS coordinate collisions - EXACT point-to-point match only
    # (Do not consider even a single number change as fraud. Only exact point-to-point matches are considered fraud.)
    gps_works = [iw for iw in intermediate_works if iw["has_real_gps"] and iw["gps_data"]]
    for i in range(len(gps_works)):
        for j in range(i + 1, len(gps_works)):
            w1 = gps_works[i]
            w2 = gps_works[j]
            lat1 = w1["gps_data"].get("latitude")
            lon1 = w1["gps_data"].get("longitude")
            lat2 = w2["gps_data"].get("latitude")
            lon2 = w2["gps_data"].get("longitude")

            # Exact point-to-point match: even a single number change is NOT fraud
            is_exact_point_match = (
                lat1 is not None and lat2 is not None and
                lon1 is not None and lon2 is not None and
                float(lat1) == float(lat2) and
                float(lon1) == float(lon2) and
                str(lat1).strip() == str(lat2).strip() and
                str(lon1).strip() == str(lon2).strip()
            )

            if is_exact_point_match:
                dist = haversine_distance(lat1, lon1, lat2, lon2)
                m1 = w1["base_work"].get("mandal", "")
                m2 = w2["base_work"].get("mandal", "")
                t1 = w1["base_work"].get("title", "")
                t2 = w2["base_work"].get("title", "")
                
                # Flag suspected fraud with 100 risk override only for exact point-to-point matches
                fraud_detail_1 = {
                    "is_fraud_suspected": True,
                    "fraud_type": "DUPLICATE_GEOTAG_LOCATION_REUSE",
                    "fraud_matched_work_id": w2["work_id"],
                    "fraud_matched_work_title": t2,
                    "fraud_matched_mandal": m2,
                    "fraud_matched_coords": f"{w2['gps_data']['latitude']}° N, {w2['gps_data']['longitude']}° E",
                    "fraud_distance_meters": 0.0,
                    "fraud_matched_image": w2["all_images"][0] if w2["all_images"] else "",
                    "override_risk_score": 100.0,
                    "reason": (
                        f"Exact point-to-point duplicate geotag location reused across distinct works. "
                        f"Claimed coordinates ({w1['gps_data']['latitude']}° N, {w1['gps_data']['longitude']}° E) "
                        f"are an exact point-to-point match to Work {w2['work_id']} ({m2}: {t2[:40]}...)."
                    )
                }
                fraud_detail_2 = {
                    "is_fraud_suspected": True,
                    "fraud_type": "DUPLICATE_GEOTAG_LOCATION_REUSE",
                    "fraud_matched_work_id": w1["work_id"],
                    "fraud_matched_work_title": t1,
                    "fraud_matched_mandal": m1,
                    "fraud_matched_coords": f"{w1['gps_data']['latitude']}° N, {w1['gps_data']['longitude']}° E",
                    "fraud_distance_meters": 0.0,
                    "fraud_matched_image": w1["all_images"][0] if w1["all_images"] else "",
                    "override_risk_score": 100.0,
                    "reason": (
                        f"Exact point-to-point duplicate geotag location reused across distinct works. "
                        f"Claimed coordinates ({w2['gps_data']['latitude']}° N, {w2['gps_data']['longitude']}° E) "
                        f"are an exact point-to-point match to Work {w1['work_id']} ({m1}: {t1[:40]}...)."
                    )
                }
                if w1["work_id"] not in fraud_flags:
                    fraud_flags[w1["work_id"]] = fraud_detail_1
                if w2["work_id"] not in fraud_flags:
                    fraud_flags[w2["work_id"]] = fraud_detail_2

    # Check exact file hash matches (SHA256)
    for h, file_entries in file_hash_map.items():
        wids = list(set([entry[0] for entry in file_entries]))
        if len(wids) > 1:
            for wid, fname in file_entries:
                other_entries = [e for e in file_entries if e[0] != wid]
                if other_entries:
                    other_wid, other_fname = other_entries[0]
                    fraud_flags[wid] = {
                        "is_fraud_suspected": True,
                        "fraud_type": "DUPLICATE_FILE_REUSE",
                        "fraud_matched_work_id": other_wid,
                        "fraud_matched_file": other_fname,
                        "override_risk_score": 100.0,
                        "reason": f"Exact bit-for-bit duplicate file ({fname}) reused across Work {wid} and Work {other_wid} (SHA256: {h[:12]})."
                    }

    # Check exact image hash matches
    for h, img_entries in image_hash_map.items():
        wids = list(set([entry[0] for entry in img_entries]))
        if len(wids) > 1:
            for wid, iname in img_entries:
                other_entries = [e for e in img_entries if e[0] != wid]
                if other_entries:
                    other_wid, other_iname = other_entries[0]
                    fraud_flags[wid] = {
                        "is_fraud_suspected": True,
                        "fraud_type": "DUPLICATE_IMAGE_REUSE",
                        "fraud_matched_work_id": other_wid,
                        "fraud_matched_image": other_iname,
                        "override_risk_score": 100.0,
                        "reason": f"Exact duplicate photographic proof ({iname}) reused across Work {wid} and Work {other_wid}."
                    }

    # === STEP 3: 4-PRIORITY CLASSIFICATION & WORK RISK DESCRIPTION ===
    updated_works = []
    total_with_gps = 0

    for iw in intermediate_works:
        wid = iw["work_id"]
        w = iw["base_work"]
        has_scanned_images = iw["has_scanned_images"]
        has_real_gps = iw["has_real_gps"]
        gps_data = iw["gps_data"]
        has_bill_proof = iw["has_bill_proof"]
        has_progress_tables = iw["has_progress_tables"]
        pdf_page_count = iw["pdf_page_count"]
        has_any_file = iw["has_any_file"]
        matched_bill_kws = iw["matched_bill_kws"]

        if has_real_gps:
            total_with_gps += 1

        is_fraud = wid in fraud_flags
        fraud_info = fraud_flags.get(wid, {})

        # Compute "What is NOT present"
        missing_items = []
        if not has_scanned_images:
            missing_items.append("Field photographic inspection proof (no scanned image or GPS photo)")
        elif not has_real_gps:
            missing_items.append("GPS watermark coordinates on photo (photo is untagged)")

        if not has_bill_proof:
            missing_items.append("Contractor bills, invoices, and financial vouchers")

        if not has_progress_tables:
            missing_items.append("Physical execution progress status tables")

        if not has_any_file:
            missing_items = [
                "Entire completion dossier (no photographs, bills, or completion certificates uploaded)"
            ]
        elif pdf_page_count > 0 and pdf_page_count <= 2 and not has_scanned_images and not has_bill_proof:
            missing_items = [
                "Substantive documentation (dossier is only a 1-2 page administrative stub)",
                "Field photographic inspection proof",
                "Contractor bills and payment vouchers",
                "Physical progress status tables"
            ]

        missing_summary = "Missing: " + "; ".join(missing_items) if missing_items else "All required evidence present: Field photo and completion proof verified."

        # Classification Hierarchy:
        if is_fraud:
            # OVERRIDE OTHER RISKS -> 100 RISK OVERRIDE
            classification = "FRAUD_CRITICAL"
            badge_text = "🚨 Suspected Fraud (100% Risk Override)"
            geotag_status = "FRAUD_SUSPECTED"
            risk_score = 100.0
            risk_level = "CRITICAL"
            reason = fraud_info.get("reason", "Suspected evidence reuse across works.")
            work_risk_desc = f"🚨 CRITICAL FRAUD ALERT (100% Risk Override): Evidence reuse detected. {reason} {missing_summary}"
        elif has_scanned_images:
            # Priority 1: Geotagged image or scanned picture/photo
            classification = "GREEN"
            if has_real_gps and gps_data:
                badge_text = "🟢 Geotagged Picture Verified"
                geotag_status = "GEOTAG_VERIFIED"
                source_lbl = gps_data.get("source", "GPS Stamp")
                reason = f"{len(iw['all_images'])} scanned picture(s) found. Ground-truth coordinates extracted: {gps_data['latitude']}° N, {gps_data['longitude']}° E ({gps_data.get('raw_stamp_text', '')})."
            else:
                badge_text = "🟢 Scanned Picture Present (Untagged)"
                geotag_status = "PHOTO_PRESENT_UNTAGGED"
                reason = f"{len(iw['all_images'])} authentic scanned photographic picture(s) present (GPS coordinates not stamped on photo)."
            risk_score = 15.0 if has_real_gps else 30.0
            risk_level = "LOW"
            work_risk_desc = missing_summary
        elif has_any_file and has_bill_proof:
            # Priority 2: Bills or any related details if in case no scanned image
            classification = "YELLOW"
            badge_text = "🟡 Bill / Completion Proof Only (No Images)"
            geotag_status = "TEXT_BILL_PROOF_ONLY"
            reason = f"No images found. Document contains verified bill/completion proof keywords: {', '.join(matched_bill_kws[:4])}."
            risk_score = 45.0
            risk_level = "MEDIUM"
            work_risk_desc = missing_summary
        elif has_any_file and (pdf_page_count > 0 and pdf_page_count <= 2 and not has_bill_proof):
            # Priority 4: If only 1 or 2 pages with no images, geotagged photos, or bills -> Critical
            classification = "CRITICAL"
            badge_text = "🔴 Stub Dossier (Critical - No Evidence)"
            geotag_status = "STUB_DOSSIER_NO_EVIDENCE"
            reason = f"Critical dossier gap: Uploaded file has only {pdf_page_count} page(s) and contains NO photos, NO bills, and NO progress tables."
            risk_score = 85.0
            risk_level = "CRITICAL"
            work_risk_desc = f"Critical dossier deficiency ({pdf_page_count} page stub). {missing_summary}"
        elif has_any_file and not has_bill_proof and not has_progress_tables:
            # Priority 3: If no bills and no progress status tables -> mark as risk
            classification = "RED"
            badge_text = "🔴 No Bills or Progress Tables (High Risk)"
            geotag_status = "NO_BILLS_NO_PROGRESS_TABLES"
            reason = "File exists on portal, but contains NEITHER scanned images/pictures NOR contractor bills NOR progress status tables."
            risk_score = 65.0
            risk_level = "HIGH"
            work_risk_desc = f"Physical & financial verification gap. {missing_summary}"
        else:
            # No files at all
            classification = "RED"
            badge_text = "🔴 No Document Uploaded"
            geotag_status = "NO_DOCUMENT_UPLOADED"
            reason = "No completion dossier, photographs, or proof files were uploaded to MoSPI."
            risk_score = 75.0
            risk_level = "HIGH"
            work_risk_desc = missing_summary

        updated_work = {
            **w,
            "latitude": gps_data["latitude"] if gps_data else None,
            "longitude": gps_data["longitude"] if gps_data else None,
            "geocoding_source": gps_data["source"] if gps_data else None,
            "has_real_gps": has_real_gps,
            "audit_classification": classification,
            "audit_badge_text": badge_text,
            "audit_reason": reason,
            "risk_score": risk_score,
            "risk_level": risk_level,
            "work_risk_description": work_risk_desc,
            "missing_items": missing_items,
            "missing_summary": missing_summary,
            "is_fraud_suspected": is_fraud,
            "fraud_details": fraud_info if is_fraud else None,
            "attached_files": iw["attached_files"],
            "pdf_audit": {
                "file_name": iw["pdf_file"],
                "file_size_kb": iw["pdf_size_kb"],
                "page_count": pdf_page_count,
                "has_progress_tables": has_progress_tables,
                "total_images": len(iw["all_images"]),
                "has_photo_evidence": has_scanned_images,
                "has_bill_proof": has_bill_proof,
                "bill_proof_keywords": matched_bill_kws[:6],
                "geotag_status": geotag_status,
                "gps": gps_data,
                "sample_images": iw["sample_images"]
            }
        }
        updated_works.append(updated_work)

    # Save processed datasets
    with open("data/processed/combined_geotag_audit.json", "w", encoding="utf-8") as f:
        json.dump(updated_works, f, indent=2)

    with open("data/processed/combined_download_manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    with open("data/processed/cross_work_fraud_evidence.json", "w", encoding="utf-8") as f:
        json.dump(fraud_flags, f, indent=2)

    # Print summary breakdown
    f_count = sum(1 for w in updated_works if w.get("is_fraud_suspected"))
    g_count = sum(1 for w in updated_works if w["audit_classification"] == "GREEN")
    y_count = sum(1 for w in updated_works if w["audit_classification"] == "YELLOW")
    c_count = sum(1 for w in updated_works if w["audit_classification"] == "CRITICAL")
    r_count = sum(1 for w in updated_works if w["audit_classification"] == "RED")

    print("\n=== AUDIT CLASSIFICATION & FRAUD SUMMARY ===")
    print(f"Total Works Audited: {len(updated_works)}")
    print(f"  🚨 Suspected Fraud (100% Risk Override): {f_count}")
    print(f"  🟢 Scanned Pictures Present: {g_count}")
    print(f"       └─ Verified GPS Watermarks: {total_with_gps}")
    print(f"       └─ Untagged Pictures: {g_count - total_with_gps}")
    print(f"  🟡 Bill Proof Only (No Images): {y_count}")
    print(f"  🔴 Stub Dossier <= 2 Pages (Critical Risk 85): {c_count}")
    print(f"  🔴 No Bills / Tables or No File (High Risk 65-75): {r_count}")

    if f_count > 0:
        print("\n[!] FRAUD ALERTS DETECTED (Score 100 Override):")
        for wid, f_data in fraud_flags.items():
            print(f"   - Work {wid} matches Work {f_data.get('fraud_matched_work_id')}: {f_data.get('reason')}")

if __name__ == "__main__":
    run_audit()
