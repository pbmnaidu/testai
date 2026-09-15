import json

with open(r'C:\Users\bhanu\.gemini\antigravity-ide\brain\01b68825-10ca-486a-87eb-e654f4d112da\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if 'app.py' in line and any(f"{n}:" in line for n in (2200, 2210, 2220, 2230)):
            data = json.loads(line)
            content = data.get('content', '')
            if 'app.py' in content:
                print(f"Step {i} in app.py:")
                for l in content.splitlines():
                    if any(f"{n}:" in l for n in range(2190, 2245)):
                        print(l.encode('ascii', errors='replace').decode('ascii'))
