import json

with open(r'C:\Users\bhanu\.gemini\antigravity-ide\brain\01b68825-10ca-486a-87eb-e654f4d112da\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        data = json.loads(line)
        calls = data.get('tool_calls', [])
        for call in calls:
            fn = call.get('function', {})
            name = fn.get('name', '')
            args = fn.get('arguments', {})
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except Exception:
                    args = {}
            target = args.get('TargetFile', '')
            if 'app.py' in target:
                print(f"Step {i}: Tool {name} on {target}")
                inst = args.get('Instruction', '') or args.get('Description', '')
                print(f"   Instruction: {inst[:80]}")
