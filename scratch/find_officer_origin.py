import os
import json

brain = r'C:\Users\bhanu\.gemini\antigravity-ide\brain'
for root, dirs, files in os.walk(brain):
    for f in files:
        if f.endswith('.jsonl'):
            p = os.path.join(root, f)
            try:
                with open(p, 'r', encoding='utf-8', errors='ignore') as fp:
                    for line_no, line in enumerate(fp):
                        if '_officer_evidence_for_work' in line and ('ReplacementContent' in line or 'CodeContent' in line):
                            print(f"File {p} line {line_no}")
                            data = json.loads(line)
                            for tc in data.get('tool_calls', []):
                                args = tc.get('args', {})
                                if '_officer_evidence_for_work' in str(args):
                                    print("  TOOL:", tc.get('name'), args.get('Description'))
                                    with open(f"scratch/found_{line_no}.txt", "w", encoding="utf-8") as out:
                                        out.write(json.dumps(args, indent=2))
            except Exception:
                pass
