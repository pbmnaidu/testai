import json

with open(r'C:\Users\bhanu\.gemini\antigravity-ide\brain\01b68825-10ca-486a-87eb-e654f4d112da\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if '2230:' in line or '2220:' in line or '2210:' in line:
            print(f"Step {i} has 2220/2230")
            data = json.loads(line)
            content = data.get('content', '')
            for l in content.splitlines():
                if any(f"{n}:" in l for n in range(2200, 2241)):
                    print(l)
