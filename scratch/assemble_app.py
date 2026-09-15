import json

# Read git base app.py up to line 1711
with open('src/backend/app.py', 'r', encoding='utf-8') as f:
    git_lines = f.readlines()

# Cut before if __name__ == "__main__":
cut_idx = None
for i, l in enumerate(git_lines):
    if l.strip().startswith('if __name__ == "__main__":'):
        cut_idx = i
        break

base_code = "".join(git_lines[:cut_idx])

# Read step 929 replacement (contains _officer_evidence_for_work and get_officer_dashboard)
with open('scratch/step_929_ReplacementContent.txt', 'r', encoding='utf-8') as f:
    officer_dashboard_code = f.read()

# Read step 871 content (contains get_officer_work_monitoring and work-detail endpoints)
with open('scratch/officer_work_step_871.txt', 'r', encoding='utf-8') as f:
    raw_871 = f.read()

# Extract lines from step 871
lines_871 = []
for l in raw_871.splitlines():
    if ': ' in l:
        p, rest = l.split(': ', 1)
        if p.isdigit():
            num = int(p)
            if num >= 1765:
                lines_871.append(rest)
officer_work_code = "\n".join(lines_871)

# Read citizen and attendance code from transcript views (steps 891, 893, 899, 901, 903, 905, 933, 975, 993, 997, 999, 1003)
views_by_num = {}
with open(r'C:\Users\bhanu\.gemini\antigravity-ide\brain\01b68825-10ca-486a-87eb-e654f4d112da\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        data = json.loads(line)
        if data.get('type') == 'VIEW_FILE':
            c = data.get('content', '')
            if 'app.py' in c:
                for l in c.splitlines():
                    if ': ' in l:
                        p, rest = l.split(': ', 1)
                        if p.isdigit():
                            num = int(p)
                            if num >= 2240:
                                views_by_num[num] = rest

print(f"Citizen/attendance lines >= 2240: {len(views_by_num)}")
citizen_attendance_code = "\n".join([views_by_num[k] for k in sorted(views_by_num.keys())])

# Also read step 933 (create_citizen_evidence updated)
with open('scratch/step_933_ReplacementContent.txt', 'r', encoding='utf-8') as f:
    step_933 = f.read()

with open('scratch/check_assembly.py', 'w', encoding='utf-8') as out:
    out.write(base_code + "\n\n" + officer_dashboard_code + "\n\n" + officer_work_code + "\n\n" + citizen_attendance_code)

print("Wrote scratch/check_assembly.py")
