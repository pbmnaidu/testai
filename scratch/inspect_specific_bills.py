import json

with open("data/processed/visual_ocr_results.json", "r", encoding="utf-8") as f:
    data = json.load(f)

for target in ["WORK_243785_page4_X1.jpg", "WORK_243785_page5_X1.jpg", "WORK_219710_page8_X1.jpg", "WORK_212960_page18_X1.jpg", "WORK_212960_page22_X1.jpg", "WORK_212960_page23_X1.jpg"]:
    rec = data.get(target, {})
    print(f"\n==================== {target} ====================")
    for l in rec.get("lines", []):
        print(f"  {l['text']}")
