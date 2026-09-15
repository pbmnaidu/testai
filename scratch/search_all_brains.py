import os
import json

brain = r'C:\Users\bhanu\.gemini\antigravity-ide\brain'
print("Searching across brain directories for app.py or officer endpoints...")

results = []
for root, dirs, files in os.walk(brain):
    for f in files:
        if f.endswith('.jsonl') or f.endswith('.py') or f.endswith('.txt') or f.endswith('.md'):
            p = os.path.join(root, f)
            try:
                # check if file mentions get_officer_dashboard or _officer_issue_signals
                with open(p, 'r', encoding='utf-8', errors='ignore') as fp:
                    content = fp.read()
                    if 'def _officer_issue_signals' in content:
                        print(f"Found _officer_issue_signals in {p} (size {len(content)})")
                        results.append((p, len(content)))
            except Exception:
                pass

print(f"Done search, found {len(results)} matches.")
