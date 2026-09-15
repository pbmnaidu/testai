with open('scratch/all_viewed_lines.txt', 'r', encoding='utf-8') as f:
    lines = [int(l.split(':', 1)[0]) for l in f if ':' in l and l.split(':', 1)[0].isdigit()]

print("Total lines:", len(lines))
# print continuous ranges
ranges = []
start = lines[0]
prev = lines[0]
for n in lines[1:]:
    if n == prev + 1:
        prev = n
    else:
        ranges.append((start, prev))
        start = n
        prev = n
ranges.append((start, prev))

for r in ranges:
    print(f"Range: {r[0]} to {r[1]} ({r[1] - r[0] + 1} lines)")
