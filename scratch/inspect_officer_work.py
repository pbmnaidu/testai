import json

with open(r'C:\Users\bhanu\.gemini\antigravity-ide\brain\01b68825-10ca-486a-87eb-e654f4d112da\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if 'get_officer_work_monitoring' in line:
            data = json.loads(line)
            print(f"Step {i}: type={data.get('type')}")
            content = data.get('content', '')
            if content:
                print(f"  Content len={len(content)}")
                with open(f"scratch/officer_work_step_{i}.txt", "w", encoding="utf-8") as out:
                    out.write(content)
            for tc in data.get('tool_calls', []):
                args = tc.get('args', {})
                print(f"  Tool {tc.get('name')}: {tc.get('args', {}).keys()}")
                with open(f"scratch/officer_work_step_{i}_tool.txt", "w", encoding="utf-8") as out:
                    out.write(json.dumps(args, indent=2))
