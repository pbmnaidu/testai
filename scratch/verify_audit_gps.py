import json
with open('data/processed/combined_geotag_audit.json', 'r', encoding='utf-8') as f:
    works = json.load(f)

gps_works = [w for w in works if w.get('has_real_gps')]
print(f"Total Works with GPS: {len(gps_works)} / {len(works)}")
for w in gps_works:
    g = w['pdf_audit']['gps']
    print(f"Work {w['work_id']} [{w['constituency']} - {w['mandal']}]:")
    print(f"   Coords: {w['latitude']}, {w['longitude']} ({w['geocoding_source']})")
    print(f"   Stamp:  '{g.get('raw_stamp_text')}'")
    print(f"   Image:  {g.get('image_name')}")
    print(f"   BBox:   {g.get('bbox')}")
