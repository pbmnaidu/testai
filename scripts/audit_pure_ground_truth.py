import glob
import json
import os
import re
import pypdf
from PIL import Image
import pandas as pd

with open('data/processed/anakapalli_download_manifest.json', 'r', encoding='utf-8') as f:
    manifest = json.load(f)

df = pd.read_csv('data/raw/Works Completed.csv', low_memory=False)
anakapalle = df[(df['State'].astype(str).str.upper() == 'ANDHRA PRADESH') & (df['Constituency'].astype(str).str.upper() == 'ANAKAPALLE')]

audit_pure = []
for idx, row in anakapalle.iterrows():
    w_raw = str(row['Work'])
    wid = w_raw.split('/')[-1].split('-')[0]
    category = str(row['Work Category'])
    desc = str(row['Work Description'])
    amount_raw = str(row.get('Amount Disbursed ( \u20b9 )', '0'))
    try:
        amount = float(amount_raw.replace(',', '').strip())
    except Exception:
        amount = 0.0
    date = str(row.get('Completion Date', ''))
    
    mandal = 'Anakapalle'
    for m in ['KASIMKOTA', 'PISINIKADA', 'K.KOTAPADU', 'DEVARAPALLI', 'PARAWADA', 'MUNAGAPAKA', 'CHODAVARAM', 'S.RAYAVARAM', 'ANAKAPALLI']:
        if m in desc.upper():
            mandal = m.title()
            break
            
    manifest_info = manifest.get(wid, {})
    pdf_file = manifest_info.get('pdf_file', '')
    images = manifest_info.get('images', [])
    
    # 1. Check real PDF text for GPS
    real_pdf_path = os.path.join('downloads/pdfs', pdf_file) if pdf_file else None
    real_gps = None
    pdf_sections = []
    page_count = 0
    file_size_kb = 0
    
    # Exclude generated reportlab dossier when checking for original government GPS
    is_original_mospi_pdf = real_pdf_path and ('official_dossier' not in pdf_file) and os.path.exists(real_pdf_path)
    
    if real_pdf_path and os.path.exists(real_pdf_path):
        file_size_kb = round(os.path.getsize(real_pdf_path) / 1024, 1)
        try:
            reader = pypdf.PdfReader(real_pdf_path)
            page_count = len(reader.pages)
            all_text = ''
            for p_idx, page in enumerate(reader.pages):
                t = page.extract_text() or ''
                all_text += ' ' + t
                
                # Check for genuine coordinates text pattern in the original document:
                # e.g. Latitude: 17.xxxxx or 17°xx'xx"N or Lat: 17.xxxx
                if is_original_mospi_pdf:
                    lat_match = re.search(r'(?:Latitude|Lat)[\s:]*([0-9]{1,2}(?:\.[0-9]+)?|\d+°\d+[\'′]\d+[\"″]?\s*[NS])', t, re.IGNORECASE)
                    lon_match = re.search(r'(?:Longitude|Long|Lon)[\s:]*([0-9]{1,3}(?:\.[0-9]+)?|\d+°\d+[\'′]\d+[\"″]?\s*[EW])', t, re.IGNORECASE)
                    if lat_match and lon_match:
                        real_gps = {
                            'latitude_text': lat_match.group(1),
                            'longitude_text': lon_match.group(1),
                            'source': f'PDF Text (Page {p_idx+1})',
                            'snippet': f'{lat_match.group(0)}, {lon_match.group(0)}'
                        }
                    
            # Detect sections from actual text
            if 'utilization' in all_text.lower() or 'uc' in all_text.lower():
                pdf_sections.append('Utilization Certificate (UC)')
            if 'quality' in all_text.lower() or 'qc' in all_text.lower():
                pdf_sections.append('Quality Control Certificate')
            if 'bill' in all_text.lower() or 'voucher' in all_text.lower() or 'invoice' in all_text.lower():
                pdf_sections.append('Expenditure Vouchers / Final Bill')
            if 'completion' in all_text.lower():
                pdf_sections.append('Completion Certificate')
        except Exception as e:
            pass
            
    # 2. Check images for real EXIF GPS
    for img_name in images:
        img_path = os.path.join('downloads/images', img_name)
        if os.path.exists(img_path):
            try:
                with Image.open(img_path) as im:
                    exif = im.getexif()
                    if exif:
                        gps_ifd = exif.get_ifd(0x8825) if hasattr(exif, 'get_ifd') else None
                        if gps_ifd:
                            real_gps = {
                                'latitude': str(gps_ifd.get(2, '')),
                                'longitude': str(gps_ifd.get(4, '')),
                                'source': f'EXIF Tag 0x8825 ({img_name})'
                            }
                            break
            except Exception:
                pass
                
    has_photo = len(images) > 0
    if has_photo:
        pdf_sections.append('Photographic Evidence')
    if not pdf_sections:
        pdf_sections = ['Administrative Completion Record']
        
    status = 'GEOTAG_VERIFIED' if real_gps else ('PHOTO_PRESENT_UNTAGGED' if has_photo else 'NO_PHOTO_EVIDENCE')
    
    # PURE AUDIT OBJECT: NO HARDCODED COORDINATES!
    audit_pure.append({
        'work_id': wid,
        'title': str(row.get('Work Description', 'Work Project')),
        'description': desc,
        'category': category,
        'amount_disbursed': amount,
        'completion_date': date,
        'mandal': mandal,
        'constituency': 'Anakapalle',
        'state': 'Andhra Pradesh',
        'has_real_gps': real_gps is not None,
        'pdf_audit': {
            'file_name': pdf_file or f"work_{wid}_completion.pdf",
            'file_size_kb': file_size_kb,
            'page_count': page_count,
            'total_images': len(images),
            'has_photo_evidence': has_photo,
            'geotag_status': status,
            # GPS is ONLY populated if real GPS was found! Otherwise None!
            'gps': real_gps,
            'sections': pdf_sections,
            'sample_images': [
                {'name': img, 'is_photo': True, 'has_exif_gps': False} for img in images[:4]
            ]
        }
    })

with open('data/processed/anakapalli_geotag_audit.json', 'w', encoding='utf-8') as f:
    json.dump(audit_pure, f, indent=2)

print(f"Total works audited: {len(audit_pure)}")
has_gps_count = sum(1 for a in audit_pure if a['has_real_gps'])
photos_count = sum(1 for a in audit_pure if not a['has_real_gps'] and a['pdf_audit']['has_photo_evidence'])
no_photo_count = sum(1 for a in audit_pure if not a['pdf_audit']['has_photo_evidence'])
print(f"PURE GROUND TRUTH AUDIT SUMMARY:")
print(f"  [+] Works with Verified GPS: {has_gps_count}")
print(f"  [!] Works with Photos but UNTAGGED (No GPS in file/EXIF): {photos_count}")
print(f"  [-] Works with NO Photo Evidence (Vouchers/Bills only): {no_photo_count}")
