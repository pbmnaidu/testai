with open('scratch/all_viewed_lines.txt', 'r', encoding='utf-8') as f:
    for l in f:
        if ': ' in l:
            p, rest = l.split(': ', 1)
            if p.isdigit() and 1860 <= int(p) <= 1950:
                print(f"{p}: {rest.rstrip()}")
