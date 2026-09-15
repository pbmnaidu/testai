import json

with open("data/processed/visual_ocr_results.json", "r", encoding="utf-8") as f:
    data = json.load(f)

for fn in ["WORK_243785_page4_X1.jpg", "WORK_212960_page23_X1.jpg", "WORK_219710_page13_X1.jpg", "WORK_243785_page8_X1.jpg"]:
    rec = data.get(fn, {})
    print(f"\n=== {fn} ===")
    for l in rec.get("lines", []):
        print(f"  y={l['y']:.0f}, x={l['x']:.0f} | {l['text']}")
