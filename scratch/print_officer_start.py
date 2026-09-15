import glob

for fp in ['scratch/step_1139_view.txt', 'scratch/step_1137_view.txt', 'scratch/step_926_view.txt']:
    print(f"=== {fp} ===")
    with open(fp, 'r', encoding='utf-8') as f:
        for l in f:
            if ': ' in l:
                p, rest = l.split(': ', 1)
                if p.isdigit():
                    print(f"{p}: {rest.rstrip()}")
