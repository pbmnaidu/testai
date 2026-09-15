import subprocess

blobs = [
    "5c7087bb600a0a688c4fe5fc5bb6848919bcd190",
    "41e3b217caea0eec4f24807f1b6c74272df3270e",
    "01c4d0e758fb5e74336f46a8301fde2c4c8ac8b3",
    "4c2430c52c92511a7ff7b2ca3aabc6dc191ef8d5",
    "1cc54dacf080eee3235e6a62ad2948bafdde8f7d",
    "ee78915e0023cb123f0dd57977caf1d370635553",
    "a7a9e7039ce6997c25befe06ab89b85c53c4db75",
    "349d9f80aff382eaf523fd0ce6193b2488f7e445",
    "441e1554b6000cfd38ec8ec84de6aa209cbc3733",
    "947fe48d5cea6334be7f6391f45d1c24510689e0",
]

for b in blobs:
    out = subprocess.check_output(["git", "cat-file", "-p", b], encoding="utf-8", errors="ignore")
    if "get_officer_dashboard" in out:
        print(f"FOUND get_officer_dashboard in blob {b}! Length: {len(out)}, lines: {len(out.splitlines())}")
        with open("scratch/recovered_app.py", "w", encoding="utf-8") as f:
            f.write(out)
        print("WROTE scratch/recovered_app.py!")
