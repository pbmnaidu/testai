import json
import ssl
import urllib.request

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

keys = [
    "Works Recommended",
    "Works Sanctioned",
    "Works Completed",
    "Total Expenditure",
    "Allocated Limit for Hon'ble MPs"
]

for k in keys:
    payload = {"combo": "34,0,0,2", "key": k}
    req = urllib.request.Request(
        "https://mplads.mospi.gov.in/rest/PreLoginDashboardData/getTilesReportData",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
    )
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as res:
            d = json.loads(res.read().decode("utf-8", errors="replace"))
            inner_k = list(d.keys())[0] if isinstance(d, dict) and len(d) > 0 else "None"
            inner_v = json.loads(d[inner_k]) if inner_k != "None" and isinstance(d[inner_k], str) else []
            keys_sample = list(inner_v[0].keys()) if len(inner_v) > 0 else []
            print(f"[OK] {k} -> {len(inner_v)} rows. Keys: {keys_sample[:6]}")
    except Exception as e:
        print(f"[ERR] {k} -> {e}")
