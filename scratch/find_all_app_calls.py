import json

with open(r'C:\Users\bhanu\.gemini\antigravity-ide\brain\01b68825-10ca-486a-87eb-e654f4d112da\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if 'app.py' in line and ('tool_calls' in line):
            data = json.loads(line)
            for tc in data.get('tool_calls', []):
                args = tc.get('args', {})
                target = args.get('TargetFile') or args.get('AbsolutePath', '')
                if 'app.py' in target:
                    name = tc.get('name')
                    desc = args.get('Description') or args.get('toolSummary', '')
                    print(f"Step {i}: {name} -> {desc}")
