import json

with open(r'C:\Users\bhanu\.gemini\antigravity-ide\brain\01b68825-10ca-486a-87eb-e654f4d112da\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if i in (929, 933, 1004):
            data = json.loads(line)
            for tc in data.get('tool_calls', []):
                args = tc.get('args', {})
                print(f"Step {i} ({args.get('Description')}):")
                print(f"  Target: {repr(args.get('TargetContent', ''))[:80]}")
                print(f"  Replacement: {repr(args.get('ReplacementContent', ''))[:80]}")
                with open(f"scratch/step_{i}_target.txt", "w", encoding="utf-8") as f_out:
                    f_out.write(args.get('TargetContent', ''))
                with open(f"scratch/step_{i}_replacement.txt", "w", encoding="utf-8") as f_out:
                    f_out.write(args.get('ReplacementContent', ''))
