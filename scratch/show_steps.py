import json

with open(r'C:\Users\bhanu\.gemini\antigravity-ide\brain\01b68825-10ca-486a-87eb-e654f4d112da\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        data = json.loads(line)
        for tc in data.get('tool_calls', []):
            args = tc.get('args', {})
            if 'app.py' in args.get('TargetFile', ''):
                print(f"Step {i}: start={args.get('StartLine')} end={args.get('EndLine')} desc={args.get('Description')}")
