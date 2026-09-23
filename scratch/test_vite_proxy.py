import urllib.request
import urllib.error
import json

for endpoint in ['/api/sync/status', '/api/sync/health', '/api/sync/training-status']:
    url = f'http://localhost:3000{endpoint}'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'test'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = resp.read()
            print(f'{endpoint}: Status {resp.status}, length: {len(data)}')
    except urllib.error.HTTPError as e:
        print(f'{endpoint}: HTTPError {e.code} - {e.read().decode("utf-8", errors="ignore")[:300]}')
    except Exception as e:
        print(f'{endpoint}: Exception {type(e).__name__} {e}')
