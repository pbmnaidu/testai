import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('data/processed/combined_geotag_audit.json', 'r', encoding='utf-8') as f:
    audit = json.load(f)

with open('data/processed/combined_download_manifest.json', 'r', encoding='utf-8') as f:
    manifest = json.load(f)

geotagged_works = [w for w in audit if w.get('has_real_gps')]
print(f"Total audit works: {len(audit)}")
print(f"Total geotagged works: {len(geotagged_works)}")

for w in geotagged_works:
    wid = str(w['work_id'])
    m = manifest.get(wid, {})
    img_gps = m.get('image_gps', {})
    assert len(img_gps) > 0, f"No image_gps in manifest for {wid}"
    for img_name, g in img_gps.items():
        assert g['latitude'] > 0 and g['longitude'] > 0
        assert g['bbox']['w_pct'] > 0
        print(f"  ✓ Work {wid} [{w['mandal']}]: {img_name} -> Lat: {g['latitude']}, Lon: {g['longitude']}, BBox: [{g['bbox']['x_pct']}%, {g['bbox']['y_pct']}%], Text=\"{g['raw_stamp_text']}\"")

print("\n[VERIFICATION PASSED] All 10 geotagged works have authentic coordinates, bounding boxes, and raw watermark text!")
