# cube faces → equirectangular panorama: python3 -I equirect.py <prefix> <out.jpg> [width]
import sys, numpy as np
from PIL import Image
pre, out = sys.argv[1], sys.argv[2]; W = int(sys.argv[3]) if len(sys.argv) > 3 else 2048; H = W // 2
F = { 'n': ((0,0,-1),(0,1,0)), 'e': ((1,0,0),(0,1,0)), 's': ((0,0,1),(0,1,0)), 'w': ((-1,0,0),(0,1,0)), 'u': ((0,1,0),(0,0,1)), 'd': ((0,-1,0),(0,0,-1)) }
img = { k: np.asarray(Image.open(f'{pre}_{k}.png').convert('RGB'), dtype=np.float32) for k in F }
lon = (np.arange(W) + .5) / W * 2 * np.pi - np.pi; lat = np.pi / 2 - (np.arange(H) + .5) / H * np.pi
lon, lat = np.meshgrid(lon, lat)
# the middle of the picture looks west (-x); the seam is on the east side
d = np.stack([-np.cos(lat) * np.cos(lon), np.sin(lat), -np.cos(lat) * np.sin(lon)], -1)
res = np.zeros((H, W, 3), np.float32); best = np.full((H, W), -1.0, np.float32)
for k, (f, up) in F.items():
    f = np.array(f, np.float32); up = np.array(up, np.float32); r = np.cross(f, up); u = np.cross(r, f)
    a = d @ f; ok = a > 1e-6
    x = np.where(ok, (d @ r) / np.where(ok, a, 1), 9); y = np.where(ok, (d @ u) / np.where(ok, a, 1), 9)
    inside = ok & (np.abs(x) <= 1.0005) & (np.abs(y) <= 1.0005) & (a > best)
    n = img[k].shape[0]
    col = np.clip(((x + 1) / 2 * n).astype(int), 0, n - 1); row = np.clip(((1 - y) / 2 * n).astype(int), 0, n - 1)
    res[inside] = img[k][row[inside], col[inside]]; best[inside] = a[inside]
Image.fromarray(res.astype(np.uint8)).save(out, quality=93)
print('wrote', out, W, H)
