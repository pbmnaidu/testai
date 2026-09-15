import json

with open(r'C:\Users\bhanu\.gemini\antigravity-ide\brain\01b68825-10ca-486a-87eb-e654f4d112da\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if 'app.py' in line:
            data = json.loads(line)
            calls = data.get('tool_calls', [])
            for c in calls:
                print(f"Step {i}: {c.get('name')} keys={list(c.keys())}")
                if 'args' in c:
                    print(f"   args keys: {list(c['args'].keys())}")
                    tf = c['args'].get('TargetFile') or c['args'].get('AbsolutePath')
                    print(f"   target: {tf}")
                if 'arguments' in c:
                    print(f"   arguments keys: {list(c['arguments'].keys())}")
                    tf = c['arguments'].get('TargetFile') or c['arguments'].get('AbsolutePath')
                    print(f"   target: {tf}")
            if len(calls) > 0:
                pass
