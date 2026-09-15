import os

brain = r'C:\Users\bhanu\.gemini\antigravity-ide\brain'
for root, dirs, files in os.walk(brain):
    for f in files:
        if f.endswith('.jsonl') or f.endswith('.txt') or f.endswith('.py'):
            p = os.path.join(root, f)
            try:
                with open(p, 'r', encoding='utf-8', errors='ignore') as fp:
                    for line in fp:
                        if 'get_officer_work_monitoring' in line or 'def get_officer_work' in line:
                            print(f"FOUND in {p}")
                            break
            except Exception:
                pass
