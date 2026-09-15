import re

with open('scratch/dumped_lines.py', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        raw = re.sub(r'^#\s*\d+:\s*', '', line).strip()
        if raw.startswith('def ') or raw.startswith('class ') or raw.startswith('@app.'):
            print(f"Line {i+1}: {raw}")
