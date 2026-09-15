with open('scratch/all_viewed_lines.txt', 'r', encoding='utf-8') as f:
    for l in f:
        line_num = int(l.split(':', 1)[0])
        content = l.split(':', 1)[1].strip()
        if line_num >= 1580:
            if content.startswith('def ') or content.startswith('@app.') or content.startswith('class '):
                print(f"{line_num}: {content}")
