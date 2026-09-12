import os
import json
import glob

with open('data/processed/combined_geotag_audit.json', 'r', encoding='utf-8') as f:
    works = json.load(f)

print(f"Total works: {len(works)}")
works_with_images = []
works_without_images = []

for w in works:
    wid = str(w["work_id"])
    imgs = glob.glob(f"downloads/images/WORK_{wid}_*.*")
    pdfs = glob.glob(f"downloads/pdfs/WORK_{wid}_*.pdf")
    if imgs:
        works_with_images.append((wid, w.get('constituency'), len(imgs), [os.path.basename(i) for i in imgs]))
    else:
        works_without_images.append((wid, w.get('constituency'), len(pdfs)))

print(f"\nWorks WITH images ({len(works_with_images)}):")
for wid, c, cnt, files in works_with_images:
    print(f"  Work {wid} ({c}): {cnt} images -> {files[:3]}")

print(f"\nWorks WITHOUT images ({len(works_without_images)}):")
for wid, c, pdf_cnt in works_without_images:
    print(f"  Work {wid} ({c}): {pdf_cnt} PDFs")
