import json

with open(r'C:\Users\bhanu\.gemini\antigravity-ide\brain\01b68825-10ca-486a-87eb-e654f4d112da\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if i < 869:
            data = json.loads(line)
            for tc in data.get('tool_calls', []):
                args = tc.get('args', {})
                if 'app.py' in args.get('TargetFile', ''):
                    print(f"Step {i}: tool={tc.get('name')} target={args.get('TargetFile')}")
                    if 'write_to_file' in tc.get('name'):
                        print(f"  WRITE_TO_FILE at step {i} (len={len(args.get('CodeContent', ''))})")
                        with open(f"scratch/step_{i}_app.py", "w", encoding="utf-8") as out:
                            out.write(args.get('CodeContent', ''))
