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

print(f"Collected {len(collected_lines)} lines! Min={min(collected_lines.keys()) if collected_lines else 0}, Max={max(collected_lines.keys()) if collected_lines else 0}")

# Find missing lines
if collected_lines:
    min_k, max_k = min(collected_lines.keys()), max(collected_lines.keys())
    missing = [k for k in range(min_k, max_k + 1) if k not in collected_lines]
    print(f"Missing lines count: {len(missing)}")
    if missing:
        print("Missing sample:", missing[:20])
