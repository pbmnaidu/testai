import json

with open(r'C:\Users\bhanu\.gemini\antigravity-ide\brain\01b68825-10ca-486a-87eb-e654f4d112da\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if 'app.py' in line:
            data = json.loads(line)
            calls = data.get('tool_calls', [])
            for c in calls:
                args = c.get('args', {})
                tf = args.get('TargetFile', '')
                if 'app.py' in tf:
                    print(f"Step {i}: {c.get('name')} target={tf}")
                    desc = args.get('Description', '') or args.get('Instruction', '')
                    print(f"   Desc: {desc}")
                    if c.get('name') == 'replace_file_content':
                        print(f"   Lines: {args.get('StartLine')} to {args.get('EndLine')}")
                        print(f"   Replacement len: {len(args.get('ReplacementContent', ''))}")
