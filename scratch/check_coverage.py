with open('scratch/all_viewed_lines.txt', 'r', encoding='utf-8') as f:
    lines = f.readlines()

line_map = {}
for l in lines:
    parts = l.split(': ', 1)
    if len(parts) == 2 and parts[0].isdigit():
        line_map[int(parts[0])] = parts[1]

print(f"Total mapped lines: {len(line_map)}")
print("Min line:", min(line_map.keys()), "Max line:", max(line_map.keys()))

ranges = []
cur_start = None
cur_prev = None
for k in sorted(line_map.keys()):
    if cur_start is None:
        cur_start = k
        cur_prev = k
    elif k == cur_prev + 1:
        cur_prev = k
    else:
        ranges.append((cur_start, cur_prev))
        cur_start = k
        cur_prev = k
if cur_start is not None:
    ranges.append((cur_start, cur_prev))

print("Contiguous ranges:")
for s, e in ranges:
    print(f"  {s} to {e} ({e - s + 1} lines)")
