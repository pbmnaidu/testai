import os

files = [
    'scratch/step_929_replacement.txt',
    'scratch/officer_work_step_871.txt',
    'scratch/clean_citizen_endpoints.py',
    'scratch/step_933_replacement.txt',
    'scratch/step_1004_replacement.txt'
]

for fp in files:
    if os.path.exists(fp):
        with open(fp, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        print(f"=== {fp} ({len(lines)} lines) ===")
        for i, l in enumerate(lines[:15]):
            print(f"  {i+1}: {l.rstrip()}")
        print("  ...")
        for i, l in enumerate(lines[-5:]):
            print(f"  {len(lines)-5+i+1}: {l.rstrip()}")
    else:
        print(f"NOT FOUND: {fp}")
