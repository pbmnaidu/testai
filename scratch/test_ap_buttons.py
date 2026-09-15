import urllib.request
import json

base = "http://127.0.0.1:8000/api/officer/dashboard?state=ANDHRA%20PRADESH"

buttons = [
    ("Total works", "all", 3057),
    ("High priority works", "high_priority", 1347),
    ("Material price reviews", "material", 17),
    ("Attendance issues", "attendance", 0),
    ("Citizen complaints", "citizen", 1),
    ("Compliance issues", "compliance", 1876),
    ("Schedule risks", "schedule", 1747),
    ("Candidate duplicates", "duplicate", 161)
]

print("Testing all 8 buttons for Andhra Pradesh:")
for label, focus, expected_total in buttons:
    url = f"{base}&focus={focus}"
    res = urllib.request.urlopen(url)
    d = json.loads(res.read().decode('utf-8'))
    actual_q = d.get('queue_total')
    works_returned = len(d.get('priority_works', []))
    print(f"  Card '{label}' (focus={focus}): expected={expected_total}, queue_total={actual_q}, returned={works_returned}")
