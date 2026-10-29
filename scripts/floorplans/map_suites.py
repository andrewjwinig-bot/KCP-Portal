"""Map a building's suites onto its base floor plans (run by hand, once per floor).

    python3 scripts/floorplans/map_suites.py 4050 1 base-floor-1.pdf 4050-101=ste101.pdf 4050-115=ste115.pdf ...

Needs PyMuPDF and numpy (`pip install pymupdf numpy`).

The owner's floor plans come from the same architect's drawings: a BASE PLAN
per floor (walls only — no suite numbers, no demising lines) and a SHEET per
suite whose KEY PLAN is the whole floor drawn small with that suite shaded
grey. So each suite is found on its own sheet:

  1. the key plan is located automatically — the ink cluster on the sheet
     whose outline has the base floor's proportions;
  2. its grey shading, closed over the interior walls and holes filled, is the
     suite's PERIMETER (owner: "clean up all the interior walls … just block
     out the suite perimeter");
  3. the key plan's floor outline maps onto the base plan's, so the perimeter
     lands in base-plan pixels, simplified to a polygon.

Writes public/buildings/<code>/floor-<n>.png (the base plan, cropped to the
floor) and merges the floor into lib/buildings/plans/<code>.json, keeping any
suites already mapped on that floor (a re-run replaces only the ones named).
Look at the floor on the property page after a run: a sheet whose key plan
is from an older layout still maps, but check it.
"""
import json
import os
import sys
from collections import deque

import fitz  # PyMuPDF
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
IMAGE_WIDTH = 2400  # px of the floor image the site shows
CELL = 3            # key-plan cell size (px at zoom KEY_ZOOM)
KEY_ZOOM = 6


def render(page, zoom):
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), colorspace=fitz.csRGB)
    return np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, 3).astype(int)


def components(mask, diag=True):
    """Connected components of a boolean mask → list of (ys, xs) arrays."""
    h, w = mask.shape
    seen = np.zeros((h, w), bool)
    steps = ((1, 0), (-1, 0), (0, 1), (0, -1)) + (((1, 1), (1, -1), (-1, 1), (-1, -1)) if diag else ())
    out = []
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        seen[y0, x0] = True
        q = deque([(y0, x0)])
        ys, xs = [], []
        while q:
            y, x = q.popleft()
            ys.append(y)
            xs.append(x)
            for dy, dx in steps:
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True
                    q.append((yy, xx))
        out.append((np.array(ys), np.array(xs)))
    return out


def grow(m, n):
    for _ in range(n):
        e = m.copy()
        e[1:] |= m[:-1]; e[:-1] |= m[1:]; e[:, 1:] |= m[:, :-1]; e[:, :-1] |= m[:, 1:]
        m = e
    return m


def shrink(m, n):
    for _ in range(n):
        e = m.copy()
        e[1:] &= m[:-1]; e[:-1] &= m[1:]; e[:, 1:] &= m[:, :-1]; e[:, :-1] &= m[:, 1:]
        m = e
    return m


def fill_holes(m):
    outside = np.zeros_like(m)
    h, w = m.shape
    q = deque((y, x) for y in range(h) for x in (0, w - 1) if not m[y, x])
    q.extend((y, x) for x in range(w) for y in (0, h - 1) if not m[y, x])
    for y, x in q:
        outside[y, x] = True
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and not m[yy, xx] and not outside[yy, xx]:
                outside[yy, xx] = True
                q.append((yy, xx))
    return ~outside


def outline(m):
    """The boundary of a cell mask as loops of corner points (x, y)."""
    h, w = m.shape
    p = np.pad(m, 1)
    edges = {}
    for y, x in zip(*np.nonzero(m)):
        if not p[y, x + 1]: edges[(x, y)] = (x + 1, y)
        if not p[y + 1, x + 2]: edges[(x + 1, y)] = (x + 1, y + 1)
        if not p[y + 2, x + 1]: edges[(x + 1, y + 1)] = (x, y + 1)
        if not p[y + 1, x]: edges[(x, y + 1)] = (x, y)
    loops = []
    while edges:
        start, nxt = edges.popitem()
        loop = [start]
        while nxt != start and nxt in edges:
            loop.append(nxt)
            nxt = edges.pop(nxt)
        if len(loop) >= 4:
            loops.append(loop)
    return loops


def simplify(pts, eps):
    """Douglas–Peucker on a closed loop — takes the stair-steps out of a diagonal."""
    def dp(seg):
        if len(seg) < 3:
            return seg
        a, b = np.array(seg[0], float), np.array(seg[-1], float)
        ab = b - a
        n = np.hypot(*ab) or 1.0
        d = [abs(ab[0] * (p[1] - a[1]) - ab[1] * (p[0] - a[0])) / n for p in seg[1:-1]]
        i = int(np.argmax(d)) + 1
        if d[i - 1] > eps:
            return dp(seg[: i + 1])[:-1] + dp(seg[i:])
        return [seg[0], seg[-1]]
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    return dp(pts[: far + 1])[:-1] + dp(pts[far:] + [pts[0]])[:-1]


def majority(m, r):
    """Each cell takes the vote of its (2r+1)² neighbourhood — rounds off the
    jagged edges a small, anti-aliased key plan leaves, keeping square corners
    square (a polygon simplifier would cut them into diagonals)."""
    p = np.pad(m.astype(int), r)
    c = np.cumsum(np.cumsum(p, 0), 1)
    c = np.pad(c, ((1, 0), (1, 0)))
    k = 2 * r + 1
    s = c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]
    return s * 2 > k * k


def label_point(m):
    """The cell deepest inside the mask — a label spot even in an L-shaped suite."""
    m = np.pad(m, 1)
    depth = np.zeros(m.shape, int)
    cur = m.copy()
    while cur.any():
        depth += cur
        cur = shrink(cur, 1)
    y, x = np.unravel_index(np.argmax(depth), depth.shape)
    return x - 0.5, y - 0.5


def base_floor(page):
    """The base plan's floor outline: the ink inside the sheet frame, above the title block."""
    z = 0.6
    a = render(page, z).mean(2)
    h, w = a.shape
    dark = a < 140
    # The sheet frame and title block hug the edges; the floor sits in the middle.
    inner = dark[int(h * 0.08): int(h * 0.82), int(w * 0.12): int(w * 0.85)]
    ys, xs = np.nonzero(inner)
    x0, y0 = xs.min() + int(w * 0.12), ys.min() + int(h * 0.08)
    x1, y1 = xs.max() + int(w * 0.12), ys.max() + int(h * 0.08)
    return [v / z for v in (x0, y0, x1, y1)]  # page units (rotated)


def key_plan(page, aspect):
    """The key plan's floor outline on a suite sheet, in pixels at KEY_ZOOM, and that render."""
    z = 2
    a = render(page, z).mean(2)
    best = None
    for ys, xs in components(a < 90):
        bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
        area = bw * bh / (a.shape[0] * a.shape[1])
        if not 0.01 < area < 0.25 or len(ys) < 200:
            continue
        err = abs((bw / bh) / aspect - 1)
        if err < 0.08 and (best is None or err < best[0]):
            best = (err, xs.min(), ys.min(), xs.max(), ys.max())
    if best is None:
        raise SystemExit("no key plan found with the floor's proportions")
    _, x0, y0, x1, y1 = best
    big = render(page, KEY_ZOOM)
    s = KEY_ZOOM / z
    pad = int(3 * s)
    X0, Y0, X1, Y1 = int(x0 * s) - pad, int(y0 * s) - pad, int(x1 * s) + pad, int(y1 * s) + pad
    crop = big[Y0:Y1, X0:X1]
    g = crop.mean(2)
    ys, xs = np.nonzero(g < 90)
    # the outer walls, re-measured at full zoom
    return crop[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]


def suite_shape(k):
    g = k.mean(2)
    sat = k.max(2) - k.min(2)
    grey = (g >= 195) & (g <= 238) & (sat < 12)
    h, w = grey.shape[0] // CELL, grey.shape[1] // CELL
    cells = grey[: h * CELL, : w * CELL].reshape(h, CELL, w, CELL).mean((1, 3)) > 0.5
    m = majority(fill_holes(shrink(grow(cells, 7), 7)), 3)
    parts = sorted(components(m, diag=False), key=lambda c: len(c[0]), reverse=True)
    keep = np.zeros_like(m)
    for ys, xs in parts:
        if len(ys) < 0.1 * len(parts[0][0]):
            break
        keep[ys, xs] = True
    return keep, (w * CELL, h * CELL)


def main():
    code, floor, base_pdf, *pairs = sys.argv[1:]
    base = fitz.open(base_pdf)[0]
    fx0, fy0, fx1, fy1 = base_floor(base)
    margin = 0.03 * (fx1 - fx0)
    clip = fitz.Rect(fx0 - margin, fy0 - margin, fx1 + margin, fy1 + margin)
    zoom = IMAGE_WIDTH / clip.width
    # Render the page as displayed, then crop to the floor.
    full = render(base, zoom)
    X0, Y0 = max(0, int(clip.x0 * zoom)), max(0, int(clip.y0 * zoom))
    img = np.ascontiguousarray(full[Y0: int(clip.y1 * zoom), X0: int(clip.x1 * zoom)].astype(np.uint8))
    H, W = img.shape[:2]
    out_dir = os.path.join(ROOT, "public", "buildings", code)
    os.makedirs(out_dir, exist_ok=True)
    fitz.Pixmap(fitz.csRGB, W, H, img.tobytes(), False).save(os.path.join(out_dir, f"floor-{floor}.png"))
    clip = fitz.Rect(X0 / zoom, Y0 / zoom, clip.x1, clip.y1)
    # Floor outline in image pixels.
    ox0, oy0 = (fx0 - clip.x0) * zoom, (fy0 - clip.y0) * zoom
    ow, oh = (fx1 - fx0) * zoom, (fy1 - fy0) * zoom

    data_path = os.path.join(ROOT, "lib", "buildings", "plans", f"{code}.json")
    data = json.load(open(data_path)) if os.path.exists(data_path) else {"code": code, "floors": []}
    fl = next((f for f in data["floors"] if f["floor"] == floor), None)
    if fl is None:
        fl = {"floor": floor, "suites": []}
        data["floors"].append(fl)
    fl.update({"src": f"/buildings/{code}/floor-{floor}.png", "width": W, "height": H})

    for pair in pairs:
        unit, sheet = pair.split("=", 1)
        k = key_plan(fitz.open(sheet)[0], (fx1 - fx0) / (fy1 - fy0))
        mask, (kw, kh) = suite_shape(k)
        sx, sy = ow / kw * CELL, oh / kh * CELL
        to_img = lambda p: (round(ox0 + p[0] * sx, 1), round(oy0 + p[1] * sy, 1))
        loops = [simplify(L, 1.0) for L in outline(mask)]
        lx, ly = to_img(label_point(mask))
        suite = {
            "unit": unit,
            "pts": [" ".join(f"{x},{y}" for x, y in map(to_img, L)) for L in loops if len(L) >= 3],
            "cx": lx, "cy": ly,
            "source": os.path.basename(sheet),
        }
        fl["suites"] = [s for s in fl["suites"] if s["unit"] != unit] + [suite]
        print(f"{unit}: {len(suite['pts'])} shape(s), {sum(p.count(' ') + 1 for p in suite['pts'])} points")

    data["floors"].sort(key=lambda f: str(f["floor"]))
    for f in data["floors"]:
        f["suites"].sort(key=lambda s: s["unit"])
    os.makedirs(os.path.dirname(data_path), exist_ok=True)
    json.dump(data, open(data_path, "w"), indent=1)
    print(f"floor {floor}: {W}×{H}, {len(fl['suites'])} suites mapped → {os.path.relpath(data_path, ROOT)}")


if __name__ == "__main__":
    main()
