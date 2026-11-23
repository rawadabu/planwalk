# AI panoramas for every standing point: python3 -I gen.py   (skips what is already done; 3 at a time)
import json, os, subprocess, sys, concurrent.futures as cf
S = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(S)
T = json.load(open(S + '/points.json'))
HEAD = ("A 360-degree equirectangular panorama photograph of a finished real home interior, taken from exactly the same camera position as the reference image. "
        "Keep the architecture exactly as in the reference: every wall, window, door opening, ceiling and stair where it is; do not move, add or remove walls, windows or doors. "
        "The reference shows simple placeholder furniture and fittings: keep each piece in the same place and replace it with a real, detailed, photorealistic piece of the same kind. ")
STYLE = ("The whole house is one warm modern Mediterranean family home: light oak plank floors, warm white plaster walls, linen and wool textiles in cream and sand tones, oak furniture, matte black window frames, green plants in clay pots. ")
TAIL = ("Soft natural daylight, realistic shadows, photorealistic, high detail, interior design magazine quality. Keep the equirectangular 360 projection of the reference, with the left and right edges matching seamlessly. No people, no text, no watermark.")
OPEN = "It is part of one open ground floor: a round oak dining table with six chairs, a white kitchen with an island and three stools, and a double-height living room with a large cream L-shaped linen sofa, a wool rug, tall black-framed glass doors to the garden and an open staircase with oak treads and a glass railing. "
ROOM = {
  'מטבח': "This is the open kitchen: a run of flat-front warm white cabinets with a light stone worktop and a sink, a tall fridge unit, a kitchen island with a hob and three stools, pendant lights over the island. " + OPEN,
  'מבואת כניסה': "This is the entrance hall area: easy chairs by the window, a slim console table with a round mirror, a bench with cushions and coat hooks near the front door, a runner rug. " + OPEN,
  'מטבחון': "This is a small second kitchen (a utility kitchen): cabinets along the walls with a worktop, a sink, a hob and a tall fridge, open shelves, bright and practical, pale stone floor tiles. ",
  'מקלחת': "This is a bathroom: a wall-hung toilet, a vanity with a basin and a round mirror, a shower or a bathtub exactly where the reference shows one, large beige stone tiles on the floor and walls, brushed brass taps, folded towels, a small window. ",
  'ממ"ד - חדר שינה': "This is a bedroom that is also the home's reinforced safe room (thick walls, one small steel-framed window, a heavy door): a double bed with linen bedding and an oak headboard, two easy chairs, a wardrobe, a rug, bedside lamps. ",
  'חדר שינה הורים': "This is the master bedroom: a double bed with an upholstered headboard and linen bedding, bedside tables with lamps, a wall-mounted television, a wool rug, sheer curtains, glass doors to a balcony. ",
  'חדר שינה ילדים 1': "This is a child's bedroom: a single bed with cheerful bedding, a desk with a chair, shelves with books and toys, a wardrobe, a round rug; playful but calm. ",
  'חדר שינה ילדים 2': "This is a teenager's bedroom: a single bed with plain bedding, a desk with a chair and a lamp, shelves with books, a wardrobe, a rug, a pinboard. ",
  'מעבר': "This is the upstairs hallway: an oak floor, a glass railing overlooking the double-height living room below, oak-framed doors to the bedrooms, a runner rug, wall lights, framed art. ",
}
def run(p):
    pid = p['id']; out = f'{ROOT}/tour-site/ai/{pid}.jpg'
    if os.path.exists(out): return pid + ' kept'
    base = f'{ROOT}/tour-site/base/{pid}.jpg'
    if not os.path.exists(base):
        if not os.path.exists(f'{S}/cap/{pid}_d.png'): return pid + ' NOT CAPTURED'
        subprocess.run(['python3', '-I', f'{ROOT}/equirect.py', f'{S}/cap/{pid}', base, '2048'], check=True, capture_output=True)
    src = f'{S}/in/{pid}.jpg'
    subprocess.run(['convert', base, '-resize', '2352x1008!', '-quality', '93', src], check=True)
    prompt = HEAD + ROOM[p['room']] + STYLE + TAIL
    r = subprocess.run(['higgsfield', 'generate', 'create', 'seedream_v5_pro', '--prompt', prompt, '--image', src, '--aspect_ratio', '21:9', '--resolution', '2k', '--wait', '--wait-timeout', '15m', '--json'], capture_output=True, text=True)
    try:
        d = json.loads(r.stdout); j = d[0] if isinstance(d, list) else d
        url = j.get('result_url') or j.get('results', {}).get('raw', {}).get('url')
        if not url:
            def find(o):
                if isinstance(o, dict):
                    for k, v in o.items():
                        if k == 'result_url' and isinstance(v, str): return v
                        f = find(v)
                        if f: return f
                elif isinstance(o, list):
                    for v in o:
                        f = find(v)
                        if f: return f
            url = find(j)
        if not url: return f'{pid} FAILED no url: {r.stdout[:200]} {r.stderr[-200:]}'
        raw = f'{S}/out/{pid}.png'
        subprocess.run(['curl', '-sS', '-m', '180', '-o', raw, url], check=True)
        subprocess.run(['convert', raw, '-resize', '4096x2048!', '-quality', '88', out], check=True)
        return pid + ' done'
    except Exception as e:
        return f'{pid} FAILED {e}: {r.stdout[:200]} {r.stderr[-300:]}'
jobs = [p for p in T['points'] if p['room'] != 'סלון' and (len(sys.argv) < 2 or p['id'] in sys.argv[1:])]
with cf.ThreadPoolExecutor(3) as ex:
    for res in ex.map(run, jobs): print(res, flush=True)
