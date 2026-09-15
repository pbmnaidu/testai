with open('scratch/step_1095_view.txt', 'r', encoding='utf-8') as f:
    for l in f:
        if ': ' in l:
            p, code = l.split(': ', 1)
            if p.isdigit():
                print(f"{p}: {code.rstrip()}")
