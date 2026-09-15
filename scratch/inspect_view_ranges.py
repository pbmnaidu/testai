import glob

for fpath in glob.glob('scratch/step_*_view.txt'):
    with open(fpath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    first_few = [l.strip() for l in lines[:10] if l.strip()]
    line_nums = []
    for l in lines:
        if ': ' in l:
            p = l.split(': ', 1)[0]
            if p.isdigit():
                line_nums.append(int(p))
    if line_nums:
        print(f"{fpath}: lines {min(line_nums)} to {max(line_nums)} (count {len(line_nums)})")
    else:
        print(f"{fpath}: no line numbers found")
    print("   Header:", first_few[:3])
