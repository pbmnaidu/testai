import json

with open(r'C:\Users\bhanu\.gemini\antigravity-ide\brain\01b68825-10ca-486a-87eb-e654f4d112da\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        data = json.loads(line)
        for tc in data.get('tool_calls', []):
            args = tc.get('args', {})
            name = tc.get('name')
            target = args.get('TargetFile', '')
            if 'app.py' in target:
                print(f"Step {i}: tool={name} target={target}")
                for k in ('ReplacementContent', 'CodeContent'):
                    if k in args:
                        with open(f"scratch/step_{i}_{k}.txt", "w", encoding="utf-8") as out:
                            out.write(args[k])
                        print(f"  Saved scratch/step_{i}_{k}.txt (len={len(args[k])})")
