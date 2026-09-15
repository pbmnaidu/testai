with open('scratch/step_871_view.txt', 'r', encoding='utf-8') as f:
    for l in f:
        if ': ' in l:
            p, rest = l.split(': ', 1)
            if p.isdigit() and int(p) >= 1830:
                print(f"{p}: {rest.rstrip()}")
