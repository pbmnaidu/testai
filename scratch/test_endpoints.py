import urllib.request
import json
import time

endpoints = [
    '/api/health',
    '/api/overview',
    '/api/risk-monitor?limit=5',
    '/api/duplicate-candidates?limit=5',
    '/api/sync/health',
    '/api/sync/status',
]

for ep in endpoints:
    url = f'http://localhost:3000{ep}'
    t0 = time.time()
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
            parsed = json.loads(data.decode('utf-8'))
            sample = list(parsed.keys()) if isinstance(parsed, dict) else f'list of {len(parsed)} items'
            dt = round(time.time() - t0, 2)
            print(f'[OK 200] {ep} in {dt}s -> {sample}', flush=True)
    except Exception as e:
        dt = round(time.time() - t0, 2)
        print(f'[FAIL] {ep} in {dt}s -> {e}', flush=True)
