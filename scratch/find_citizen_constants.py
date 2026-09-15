with open('scratch/all_viewed_lines.txt', 'r', encoding='utf-8') as f:
    for l in f:
        if ': ' in l:
            p, code = l.split(': ', 1)
            if any(k in code for k in ['CITIZEN', 'CitizenEvidenceReview', 'ATTENDANCE_RECORDS_PATH', '_CITIZEN_STORE_LOCK']):
                print(f"{p}: {code.rstrip()}")
