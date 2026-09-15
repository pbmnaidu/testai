import json

target_steps = [869, 871, 926, 1095, 1135, 1137, 1139, 1317]

with open(r'C:\Users\bhanu\.gemini\antigravity-ide\brain\01b68825-10ca-486a-87eb-e654f4d112da\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if i in target_steps:
            data = json.loads(line)
            content = data.get('content', '')
            with open(f"scratch/step_{i}_view.txt", "w", encoding="utf-8") as out:
                out.write(content)
            print(f"Wrote scratch/step_{i}_view.txt ({len(content)} chars)")
