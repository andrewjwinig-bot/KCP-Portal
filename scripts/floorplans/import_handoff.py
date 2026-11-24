"""Import a Claude Design floor-plan handoff (korman-siteplans: plans.js +
plans/*.webp) into the portal's building plans.

    python3 scripts/floorplans/import_handoff.py <handoff dir>

For every OFFICE floor (b<building>-<floor>) it writes
  public/buildings/<code>/floor-<n>.webp          the shell (what the card draws)
  public/buildings/<code>/floor-<n>-detail.webp   the full interiors, revealed
                                                  inside the hovered suite
  public/buildings/<code>/floor-<n>.png           a small greyscale copy for the
                                                  status report (pdf-lib reads PNG)
and lib/buildings/plans/<code>.json (geometry only — who and how big are the
rent roll's at request time). The campus map goes to public/buildings/campus/
and lib/buildings/plans/campus.json. Retail plans are skipped: the centres'
designed pages already carry theirs. Needs Pillow.
"""
import json, os, sys
from PIL import Image

SRC = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CODE = {"1": "3610", "2": "3620", "4": "3640", "5": "4050", "6": "4060", "7": "4070", "8": "4080",
        "A": "40A0", "B": "40B0", "C": "40C0"}
AMENITY = {"4060-217", "3640-112", "4080-201"}

raw = open(os.path.join(SRC, "plans.js")).read()
plans = json.loads(raw[raw.index("["):raw.rindex("]") + 1])

def pts_list(p):
    return [p] if isinstance(p, str) else list(p)

def save_images(src_rel, dest_dir, base, detail_rel=None):
    os.makedirs(dest_dir, exist_ok=True)
    src_rel = src_rel.split("?")[0]
    detail_rel = detail_rel.split("?")[0] if detail_rel else None
    im = Image.open(os.path.join(SRC, src_rel))
    im.convert("RGB").save(os.path.join(dest_dir, base + ".webp"), "WEBP", quality=90, method=6)
    if detail_rel:
        Image.open(os.path.join(SRC, detail_rel)).convert("RGB").save(
            os.path.join(dest_dir, base + "-detail.webp"), "WEBP", quality=90, method=6)
    g = im.convert("L")
    g.thumbnail((2200, 2200))
    g.quantize(16).save(os.path.join(dest_dir, base + ".png"), optimize=True)

out = {}
for p in plans:
    if p["type"] != "office" or p["id"] == "interplex":
        continue
    b = p["building"].split()[-1]
    code = CODE[b]
    floor = str(p["floor"])
    d = os.path.join(ROOT, "public", "buildings", code)
    save_images(p["image"], d, f"floor-{floor}", p.get("detailImage"))
    _, _, w, h = p["viewBox"]
    out.setdefault(code, []).append({
        "floor": floor,
        "src": f"/buildings/{code}/floor-{floor}.webp",
        "detailSrc": f"/buildings/{code}/floor-{floor}-detail.webp" if p.get("detailImage") else None,
        "pdfSrc": f"/buildings/{code}/floor-{floor}.png",
        "width": w, "height": h,
        "suites": [{"unit": u["id"], "pts": pts_list(u["pts"]), "cx": u["cx"], "cy": u["cy"],
                    **({"amenity": True} if u["id"] in AMENITY else {})} for u in p["units"]],
    })

for code, floors in out.items():
    floors.sort(key=lambda f: f["floor"])
    with open(os.path.join(ROOT, "lib", "buildings", "plans", f"{code}.json"), "w") as fh:
        json.dump({"code": code, "floors": floors}, fh, indent=1)
    print(code, [(f["floor"], len(f["suites"])) for f in floors])

ip = next(p for p in plans if p["id"] == "interplex")
d = os.path.join(ROOT, "public", "buildings", "campus")
save_images(ip["image"], d, "interplex")
_, _, w, h = ip["viewBox"]
campus = {"src": "/buildings/campus/interplex.webp", "pdfSrc": "/buildings/campus/interplex.png", "width": w, "height": h,
          "buildings": [{"id": u["id"], "code": CODE[u["id"]], "name": u.get("name", u["label"]),
                         "pts": pts_list(u["pts"]), "cx": u["cx"], "cy": u["cy"]} for u in ip["units"]]}
with open(os.path.join(ROOT, "lib", "buildings", "plans", "campus.json"), "w") as fh:
    json.dump(campus, fh, indent=1)
print("campus", [b["code"] for b in campus["buildings"]])
