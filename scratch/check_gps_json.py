import json

with open('data/processed/visual_ocr_results.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

gps_items = {k: v for k, v in data.items() if v.get('gps')}
print(f"Total images with GPS stamps: {len(gps_items)}")
for k, v in sorted(gps_items.items()):
    g = v['gps']
    print(f"\n--- {k} ---")
    print(f"  Lat: {g['latitude']}")
    print(f"  Lon: {g['longitude']}")
    print(f"  Raw: {g['raw_text']}")
    print(f"  Location: {g.get('location_name')}")
    print(f"  Timestamp: {g.get('timestamp')}")
    print(f"  BBox: x={g['bbox_x_pct']}%, y={g['bbox_y_pct']}%, w={g['bbox_w_pct']}%, h={g['bbox_h_pct']}%")
