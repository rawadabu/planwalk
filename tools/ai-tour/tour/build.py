# scenes + links for the tour page: python3 -I build.py
import json, math, os
S = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(S)
plan = json.load(open(ROOT + '/dwgout/plan.json')); T = json.load(open(S + '/points.json'))
scenes = {p['id']: {'id': p['id'], 'name': p['name'], 'floor': p['floor'], 'x': p['x'], 'y': p['y'], 'links': []} for p in T['points'] if os.path.exists(f"{ROOT}/tour-site/ai/{p['id']}.jpg")}
for st in plan['storeys']:
    f = st['storey']; rooms = [r for r in st['rooms'] if not r['outdoor'] and not r.get('void')]
    def room_at(x, y):
        for i, r in enumerate(rooms):
            if any(t[0] <= x < t[2] and t[1] <= y < t[3] for t in r['tiles']): return i
        return None
    pt = {}                                                        # room index → point
    for p in T['points']:
        if p['floor'] != f or p['id'] not in scenes: continue
        i = room_at(p['x'], p['y'])
        if i is not None: pt[i] = p
    edges = {}                                                     # (a, b) → (weight, x, y)
    def add(a, b, w, x, y):
        if a is None or b is None or a == b: return
        for k in ((a, b), (b, a)):
            if k not in edges or edges[k][0] < w: edges[k] = (w, x, y)
    for o in st['openings']:
        if o['kind'] != 'door': continue
        r = o['rect']; cx, cy = (r[0] + r[2]) / 2, (r[1] + r[3]) / 2
        if o['axis'] == 'h': a, b = room_at(cx, r[1] - 32), room_at(cx, r[3] + 32)
        else: a, b = room_at(r[0] - 32, cy), room_at(r[2] + 32, cy)
        add(a, b, 1000, cx, cy)
    for i, ra in enumerate(rooms):
        for j, rb in enumerate(rooms):
            if j <= i: continue
            for ta in ra['tiles']:
                for tb in rb['tiles']:
                    oy = min(ta[3], tb[3]) - max(ta[1], tb[1]); ox = min(ta[2], tb[2]) - max(ta[0], tb[0])
                    if oy >= 60 and min(abs(ta[2] - tb[0]), abs(tb[2] - ta[0])) <= 6: add(i, j, oy, ta[2] if abs(ta[2] - tb[0]) <= 6 else ta[0], (max(ta[1], tb[1]) + min(ta[3], tb[3])) / 2)
                    if ox >= 60 and min(abs(ta[3] - tb[1]), abs(tb[3] - ta[1])) <= 6: add(i, j, ox, (max(ta[0], tb[0]) + min(ta[2], tb[2])) / 2, ta[3] if abs(ta[3] - tb[1]) <= 6 else ta[1])
    for i, p in pt.items():
        seen = {i}; frontier = [(i, None)]
        for depth in range(3):
            nxt = []
            for a, first in frontier:
                for (u, v), (w, x, y) in edges.items():
                    if u != a or v in seen: continue
                    seen.add(v); via = first or (x, y)
                    if v in pt:
                        q = pt[v]; tx, ty = via if math.hypot(via[0] - p['x'], via[1] - p['y']) > 50 else (q['x'], q['y'])
                        scenes[p['id']]['links'].append({'to': q['id'], 'name': q['name'], 'dx': round(tx - p['x']), 'dy': round(ty - p['y']), 'ax': q['x'] - p['x'], 'ay': q['y'] - p['y']})
                    else: nxt.append((v, via))
            frontier = nxt
    # the first look goes where the room is deepest: the longest clear line from the standing point to a wall
    walls = [(q[0][0], q[0][1], q[2][0], q[2][1]) for q in st['walls']]
    for p in pt.values():
        best = (0, 0, -1)
        for k in range(24):
            a = 2 * math.pi * k / 24; dx, dy = math.cos(a), math.sin(a); t = 10
            while t < 900 and not any(w[0] <= p['x'] + dx * t <= w[2] and w[1] <= p['y'] + dy * t <= w[3] for w in walls): t += 10
            if t > best[0]: best = (t, dx, dy)
        scenes[p['id']]['look'] = [round(best[1] * 100), round(best[2] * 100)]
# the stairs join the storeys
arr = T['stairs'].get('arrive', {})
if '0' in arr and '1' in arr:
    near = lambda f, a: min((p for p in T['points'] if p['floor'] == f and p['id'] in scenes), key=lambda p: math.hypot(p['x'] - a['x'], p['y'] - a['y']), default=None)
    lo, hi = near(0, arr['0']), near(1, arr['1'])
    if lo and hi:
        scenes[lo['id']]['links'].append({'to': hi['id'], 'name': 'למעלה · ' + hi['name'], 'dx': round(arr['0']['x'] - lo['x']), 'dy': round(arr['0']['y'] - lo['y']), 'ax': 0, 'ay': -1, 'up': 1})
        scenes[hi['id']]['links'].append({'to': lo['id'], 'name': 'למטה · ' + lo['name'], 'dx': round(arr['1']['x'] - hi['x']), 'dy': round(arr['1']['y'] - hi['y']), 'ax': 0, 'ay': 1, 'up': -1})
data = {'scenes': list(scenes.values()), 'bounds': T['bounds'], 'start': 'f0-4', 'floors': {'0': 'קומת קרקע', '1': 'קומה ראשונה'}}
for s in data['scenes']: print(s['id'], s['name'], '→', [l['name'] for l in s['links']])
page = open(S + '/tour.tpl.html', encoding='utf8').read().replace('/*DATA*/null', json.dumps(data, ensure_ascii=False))
open(ROOT + '/tour-site/page.html', 'w', encoding='utf8').write(page)
print('page written', len(page))
