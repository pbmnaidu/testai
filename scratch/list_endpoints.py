with open('frontend/src/services/api.ts', 'r', encoding='utf-8') as f:
    text = f.read()

parts = text.split('${API_BASE}')
eps = set()
for p in parts[1:]:
    ep = p.split('?')[0].split('`')[0].split('"')[0].split("'")[0]
    eps.add(ep)

for ep in sorted(eps):
    print(" ", ep)
