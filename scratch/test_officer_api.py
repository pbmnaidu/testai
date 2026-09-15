import urllib.request
import json

base_url = "http://127.0.0.1:8000/api/officer/dashboard"

def check(name, url):
    try:
        req = urllib.request.urlopen(url)
        data = json.loads(req.read().decode('utf-8'))
        print(f"=== {name} ===")
        print(f"  Status: {req.status}")
        print(f"  Summary: {data.get('summary')}")
        print(f"  Queue Total: {data.get('queue_total')}")
        print(f"  Priority works count returned: {len(data.get('priority_works', []))}")
        print(f"  Available states: {len(data.get('available', {}).get('states', []))}")
        print(f"  Available constituencies: {len(data.get('available', {}).get('constituencies', []))}")
        if data.get('priority_works'):
            first = data['priority_works'][0]
            print(f"  First work: ID={first.get('work_id')}, Risk={first.get('overall_risk')}, Score={first.get('overall_risk_score')}, Why={first.get('why_flagged')[:50]}")
    except Exception as e:
        print(f"=== {name} FAILED: {e} ===")

check("Default", base_url)
check("Focus=all", f"{base_url}?focus=all")
check("Focus=high_priority", f"{base_url}?focus=high_priority")
check("Focus=material", f"{base_url}?focus=material")
check("Focus=attendance", f"{base_url}?focus=attendance")
check("Focus=citizen", f"{base_url}?focus=citizen")
check("Focus=compliance", f"{base_url}?focus=compliance")
check("Focus=schedule", f"{base_url}?focus=schedule")
check("Focus=duplicate", f"{base_url}?focus=duplicate")
check("State=ANDHRA PRADESH", f"{base_url}?state=ANDHRA%20PRADESH")
