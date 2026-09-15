import pypdf
import os

pdf_files = [
    "WORK_243785_21uc.pdf",
    "WORK_212960_WC_2_UC_QC_Bill.pdf",
    "WORK_219710_6Final_bill.pdf",
    "WORK_219744_community.pdf",
    "WORK_256736_uc_bill.pdf",
    "WORK_232408_14uc.pdf",
    "WORK_232412_15uc.pdf",
    "WORK_240794_18uc.pdf",
    "WORK_240800_19uc.pdf",
    "WORK_240802_20uc.pdf",
    "WORK_256732_jammadula_uc.pdf",
    "WORK_256734_30uc.pdf",
    "WORK_274759_shankaram_uc.pdf",
    "WORK_274760_gopalapuram_uc.pdf",
    "WORK_274772_ktpalem_uc.pdf",
    "WORK_274773_akkireddypalem_uc.pdf",
]

for pf in pdf_files:
    path = os.path.join("downloads/pdfs", pf)
    if not os.path.exists(path):
        continue
    reader = pypdf.PdfReader(path)
    print(f"\n==================== {pf} ({len(reader.pages)} pages) ====================")
    for idx, page in enumerate(reader.pages):
        txt = page.extract_text() or ""
        lines = [l.strip() for l in txt.split("\n") if l.strip()]
        first_line = lines[0] if lines else "[SCANNED / IMAGE-ONLY PAGE]"
        print(f"  Page {idx+1}: {first_line[:75]} (chars: {len(txt)})")
