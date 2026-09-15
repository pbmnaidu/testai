import json

with open("data/processed/visual_ocr_results.json", "r", encoding="utf-8") as f:
    data = json.load(f)

print("Images with lowest OCR lines count (often handwriting or drawings/photos):")
sorted_by_lines = sorted(data.items(), key=lambda x: len(x[1].get("lines", [])))

handwriting_candidates = []
for fname, rec in sorted_by_lines:
    n_lines = len(rec.get("lines", []))
    # If it's a document page (has page in name) and lines are between 1 and 25
    if "page" in fname and n_lines <= 25:
        text = " ".join(l["text"] for l in rec.get("lines", []))
        handwriting_candidates.append((fname, n_lines, text[:80]))

print(f"Total document pages with low OCR text lines: {len(handwriting_candidates)}")
for fname, n, text in handwriting_candidates[:30]:
    print(f"{fname} ({n} lines): {text}")
