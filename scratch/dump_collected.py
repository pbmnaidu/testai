import json

steps = [853, 855, 869, 871, 877, 889, 891, 893, 899, 901, 903, 905, 910, 912, 914, 926, 928, 932, 975, 993, 997, 999, 1003, 1095, 1097, 1135, 1137, 1139, 1141]

collected_lines = {}

with open(r'C:\Users\bhanu\.gemini\antigravity-ide\brain\01b68825-10ca-486a-87eb-e654f4d112da\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if i in steps:
            data = json.loads(line)
            content = data.get('content', '')
            for line_content in content.splitlines():
                if ': ' in line_content:
                    prefix, rest = line_content.split(': ', 1)
                    if prefix.isdigit():
                        line_num = int(prefix)
                        collected_lines[line_num] = rest

with open('scratch/dumped_lines.py', 'w', encoding='utf-8') as out:
    for k in sorted(collected_lines.keys()):
        out.write(f"# {k}: {collected_lines[k]}\n")

print(f"Dumped {len(collected_lines)} lines to scratch/dumped_lines.py")
