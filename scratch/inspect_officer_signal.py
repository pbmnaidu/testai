import json

with open(r'C:\Users\bhanu\.gemini\antigravity-ide\brain\01b68825-10ca-486a-87eb-e654f4d112da\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if '_officer_issue_signals' in line:
            data = json.loads(line)
            step_type = data.get('type')
            print(f"Line/Step {i}: type={step_type}")
            calls = data.get('tool_calls', [])
            for c in calls:
                print(f"   tool={c.get('name')}")
            content = data.get('content', '')
            if content:
                print(f"   content len={len(content)}, start={content[:100]!r}")
