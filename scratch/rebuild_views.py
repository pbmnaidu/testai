import json

views = {}
with open(r'C:\Users\bhanu\.gemini\antigravity-ide\brain\01b68825-10ca-486a-87eb-e654f4d112da\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        data = json.loads(line)
        if data.get('type') == 'VIEW_FILE':
            c = data.get('content', '')
            for l in c.splitlines():
                if ': ' in l:
                    p, rest = l.split(': ', 1)
                    if p.isdigit():
                        views[int(p)] = rest

print(f"Total lines in views: {len(views)}")
with open('scratch/all_viewed_lines.txt', 'w', encoding='utf-8') as out:
    for k in sorted(views.keys()):
        out.write(f"{k}: {views[k]}\n")
