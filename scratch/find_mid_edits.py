import json

with open(r'C:\Users\bhanu\.gemini\antigravity-ide\brain\01b68825-10ca-486a-87eb-e654f4d112da\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if 500 <= i <= 860:
            if 'app.py' in line and ('replace_file_content' in line or 'write_to_file' in line):
                data = json.loads(line)
                for tc in data.get('tool_calls', []):
                    args = tc.get('args', {})
                    if 'app.py' in args.get('TargetFile', ''):
                        print(f"Step {i}: {tc.get('name')} {args.get('Description')}")
                        content = args.get('ReplacementContent') or args.get('CodeContent', '')
                        print(f"  Content len={len(content)}")
                        with open(f"scratch/step_{i}_content.txt", "w", encoding="utf-8") as out:
                            out.write(content)
