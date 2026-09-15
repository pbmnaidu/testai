with open('scratch/all_viewed_lines.txt', 'r', encoding='utf-8') as f:
    for l in f:
        if ': ' in l:
            p, code = l.split(': ', 1)
            if p.isdigit():
                num = int(p)
                if 1648 <= num <= 1680:
                    print(f"{num}: {code.rstrip()}")
