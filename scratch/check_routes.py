with open('scratch/test_assembled_app.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

routes = []
for i, l in enumerate(lines):
    s = l.strip()
    if s.startswith('@app.'):
        next_def = lines[i+1].strip() if i+1 < len(lines) else ""
        routes.append((i+1, s, next_def))

print(f"Total routes found: {len(routes)}")
for line_no, dec, nxt in routes:
    print(f"{line_no:4d}: {dec} -> {nxt}")
