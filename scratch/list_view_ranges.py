import json

views_info = []
with open(r'C:\Users\bhanu\.gemini\antigravity-ide\brain\01b68825-10ca-486a-87eb-e654f4d112da\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if 'src/backend/app.py' in line or 'src\\backend\\app.py' in line:
            data = json.loads(line)
            if data.get('type') == 'VIEW_FILE':
                content = data.get('content', '')
                for l in content.splitlines()[:10]:
                    if 'Showing lines' in l:
                        print(f"Step {i}: {l}")
