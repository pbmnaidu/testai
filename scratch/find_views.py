import json

views = []
with open(r'C:\Users\bhanu\.gemini\antigravity-ide\brain\01b68825-10ca-486a-87eb-e654f4d112da\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if 'src/backend/app.py' in line or 'src\\backend\\app.py' in line:
            data = json.loads(line)
            if data.get('type') == 'VIEW_FILE':
                content = data.get('content', '')
                first_line = content.split('\n')[0] if content else ''
                print(f"Step {i}: len={len(content)} first={first_line}")
                views.append((i, content))

print(f"Total views: {len(views)}")
with open('scratch/all_views.json', 'w', encoding='utf-8') as out:
    json.dump([v[0] for v in views], out)
