"""Numbered candidate sheets for the two categories that colour rules cannot separate.

Picks from these sheets are recorded in pipeline/curated.json.
"""
import gzip
import json
import random

import numpy as np
from PIL import Image, ImageDraw

import coats
from build_model import DATASET, MEASURES, QC, unpack

COLS, ROWS, CELL = 12, 8, 108


def calico(c):
    """Needs warm, dark and light in the sampled regions, or the coat cannot read as calico on the head."""
    h = [coats.hsv(x) for x in c]
    warm = sum(1 for a, s, v in h if 8 <= a <= 48 and s > 0.38 and v > 0.42)
    dark = sum(1 for _, _, v in h if v < 0.34)
    light = sum(1 for _, s, v in h if v > 0.66 and s < 0.25)
    return warm >= 1 and dark >= 1 and (warm >= 2 or dark >= 2) and light >= 1


def point(c):
    v = [coats.hsv(x)[2] for x in c]
    cheeks = [v[coats.CHEEK_L], v[coats.CHEEK_R]]
    mask = [v[coats.BRIDGE], v[coats.MUZZLE]]
    ears = [v[coats.EAR_L], v[coats.EAR_R]]
    return min(cheeks) > 0.4 and min(mask) < 0.5 and min(ears) < 0.5 and np.mean(cheeks) > np.mean(mask + ears) + 0.15


def sheet(rows, path):
    im = Image.new("RGB", (COLS * CELL, ROWS * CELL), "white")
    draw = ImageDraw.Draw(im)
    for i, name in enumerate(rows):
        pts = np.array((DATASET / f"{name}.cat").read_text().split()[1:], float).reshape(9, 2)
        d = np.hypot(*(pts[1] - pts[0]))
        mid = (pts[0] + pts[1]) / 2
        box = [int(mid[0] - d * 1.7), int(mid[1] - d * 1.5), int(mid[0] + d * 1.7), int(mid[1] + d * 1.9)]
        x, y = i % COLS * CELL, i // COLS * CELL
        im.paste(Image.open(DATASET / name).convert("RGB").crop(box).resize((CELL - 4, CELL - 4)), (x + 2, y + 2))
        draw.rectangle([x + 2, y + 2, x + 26, y + 15], fill="white")
        draw.text((x + 4, y + 3), str(i), fill="black")
    im.save(path, quality=88)


def main():
    with gzip.open(MEASURES, "rt") as f:
        data = json.load(f)
    rng = random.Random(5)
    rows = [(n, unpack(p)) for n, p in data["coats"]]
    index = {}
    for key, test in (("calico", calico), ("point", point)):
        names = [n for n, c in rows if test(c)]
        print(key, "candidates", len(names))
        picked = rng.sample(names, min(COLS * ROWS, len(names)))
        sheet(picked, QC.parent / f"curate_{key}.jpg")
        index[key] = picked
    (QC.parent / "curate_index.json").write_text(json.dumps(index, indent=0))


if __name__ == "__main__":
    main()
