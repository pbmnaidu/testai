import json

with open("data/processed/visual_ocr_results.json", "r", encoding="utf-8") as f:
    ocr_results = json.load(f)

for fname, data in sorted(ocr_results.items()):
    gps = data.get("gps")
    if gps:
        print(f"\n==========================================")
        print(f"FILE: {fname} ({data['pixel_width']}x{data['pixel_height']})")
        print(f"EXTRACTED GPS:")
        print(f"  Latitude:  {gps['latitude']}")
        print(f"  Longitude: {gps['longitude']}")
        print(f"  Raw Text:  '{gps['raw_text']}'")
        print(f"  Location:  {gps.get('location_name')}")
        print(f"  Timestamp: {gps.get('timestamp')}")
        print(f"  BBox: x={gps['bbox_x_pct']}%, y={gps['bbox_y_pct']}%, w={gps['bbox_w_pct']}%, h={gps['bbox_h_pct']}%")
        print("ALL OCR LINES IN IMAGE:")
        for idx, l in enumerate(data.get("lines", [])):
            if any(w in l["text"].lower() for w in ["lat", "long", "gps", "google", "andhra", "india", "gmt", "mandal"]):
                print(f"   [{idx}] (x={l['x']:.0f}, y={l['y']:.0f}, w={l['w']:.0f}, h={l['h']:.0f}) {l['text']}")
