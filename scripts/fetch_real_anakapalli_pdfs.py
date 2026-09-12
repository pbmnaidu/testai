import os
import sys
import io
import json
import base64
from pypdf import PdfReader

sys.path.append("scripts")
from download_mplads_pdfs import download_attachment_by_id

OUT_PDF_DIR = "frontend/public/downloads/pdfs"
OUT_IMG_DIR = "frontend/public/downloads/images"
os.makedirs(OUT_PDF_DIR, exist_ok=True)
os.makedirs(OUT_IMG_DIR, exist_ok=True)

# Also save to local root folder for file:// access
LOCAL_PDF_DIR = "downloads/pdfs"
LOCAL_IMG_DIR = "downloads/images"
os.makedirs(LOCAL_PDF_DIR, exist_ok=True)
os.makedirs(LOCAL_IMG_DIR, exist_ok=True)

KNOWN_ATTACHMENTS = {
    "197316": ("work completion.pdf", "1732532.1796069"),
    "219744": ("community.pdf", "2013811.2093836"),
    "212960": ("WC 2 UC QC Bill.pdf", "1742027.1806166"),
    "219710": ("6Final bill.pdf", "1892651.1965582"),
    "243785": ("21uc.pdf", "1801842.1869071"),
    "232408": ("14uc.pdf", "1863778.1934720"),
    "232412": ("15uc.pdf", "1864283.1935297"),
    "219766": ("9uc.pdf", "1864291.1935309"),
    "240802": ("20uc.pdf", "1864390.1935412"),
    "240794": ("18uc.pdf", "1864398.1935420")
}

def fetch_and_save_real_files():
    manifest = {}
    
    for wid, (fname, aid) in KNOWN_ATTACHMENTS.items():
        print(f"[*] Fetching real PDF for Work {wid} ({fname})...")
        pdf_bytes = download_attachment_by_id(aid)
        if not pdf_bytes or not pdf_bytes.startswith(b"%PDF"):
            print(f"[-] Failed or invalid PDF for {wid}")
            continue
            
        safe_name = f"WORK_{wid}_{fname.replace(' ', '_')}"
        pdf_path_public = os.path.join(OUT_PDF_DIR, safe_name)
        pdf_path_local = os.path.join(LOCAL_PDF_DIR, safe_name)
        
        with open(pdf_path_public, "wb") as f:
            f.write(pdf_bytes)
        with open(pdf_path_local, "wb") as f:
            f.write(pdf_bytes)
            
        print(f"[+] Saved real PDF ({len(pdf_bytes):,} bytes) -> {safe_name}")
        
        # Extract images from PDF
        extracted_images = []
        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            for p_idx, page in enumerate(reader.pages):
                for img_idx, img_obj in enumerate(page.images):
                    img_data = img_obj.data
                    img_name = f"WORK_{wid}_page{p_idx+1}_{img_obj.name}"
                    img_path_public = os.path.join(OUT_IMG_DIR, img_name)
                    img_path_local = os.path.join(LOCAL_IMG_DIR, img_name)
                    
                    with open(img_path_public, "wb") as f:
                        f.write(img_data)
                    with open(img_path_local, "wb") as f:
                        f.write(img_data)
                    extracted_images.append(img_name)
            print(f"    -> Extracted {len(extracted_images)} real images from PDF.")
        except Exception as e:
            print(f"[-] Error extracting images for {wid}: {e}")
            
        manifest[wid] = {
            "pdf_file": safe_name,
            "pdf_size": len(pdf_bytes),
            "images": extracted_images
        }
        
    with open("data/processed/anakapalli_download_manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print("\n[SUCCESS] Manifest written to data/processed/anakapalli_download_manifest.json")

if __name__ == "__main__":
    fetch_and_save_real_files()
