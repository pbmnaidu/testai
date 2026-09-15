import os
import json

brain = r'C:\Users\bhanu\.gemini\antigravity-ide\brain'
for root, dirs, files in os.walk(brain):
    for f in files:
        if f == 'transcript_full.jsonl':
            p = os.path.join(root, f)
            try:
                with open(p, 'r', encoding='utf-8', errors='ignore') as fp:
                    for line in fp:
                        if 'app.py' in line and 'write_to_file' in line:
                            data = json.loads(line)
                            for tc in data.get('tool_calls', []):
                                if 'write_to_file' in tc.get('name', ''):
                                    args = tc.get('args', {})
                                    target = args.get('TargetFile', '')
                                    if 'app.py' in target:
                                        content = args.get('CodeContent', '')
                                        print(f"FOUND write_to_file in {p}, len={len(content)}")
                                        with open('scratch/found_app.py', 'w', encoding='utf-8') as out:
                                            out.write(content)
            except Exception as e:
                pass
