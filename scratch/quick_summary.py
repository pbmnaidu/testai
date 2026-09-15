import urllib.request
import json
import sys

req = urllib.request.urlopen("http://127.0.0.1:8000/api/officer/dashboard?limit=5")
data = json.loads(req.read().decode('utf-8'))
print("SUMMARY:", json.dumps(data.get('summary'), indent=2), flush=True)
print("QUEUE_TOTAL:", data.get('queue_total'), flush=True)
print("PRIORITY WORKS LEN:", len(data.get('priority_works', [])), flush=True)
