import json

with open(r'C:\Users\bhanu\.gemini\antigravity-ide\brain\01b68825-10ca-486a-87eb-e654f4d112da\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if i == 869:
            data = json.loads(line)
            content = data.get('content', '')
            print('Line 869 content length:', len(content))
            with open('scratch/transcript_869.txt', 'w', encoding='utf-8') as out:
                out.write(content)
            print('Saved scratch/transcript_869.txt')
