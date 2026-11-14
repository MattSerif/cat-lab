"""Reduces the cat dataset to src/data/model.json.

Default run refits from pipeline/measurements.json.gz.
--scan reads every .cat file and samples coats from the photos again.
"""
import gzip
import json
import random
import sys
from pathlib import Path

import numpy as np

import coats

ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / "datasets" / "Cat Dataset"
MEASURES = ROOT / "pipeline" / "measurements.json.gz"
OUT = ROOT / "src" / "data" / "model.json"
CURATED = ROOT / "pipeline" / "curated.json"
QC = ROOT / "pipeline" / "out" / "coats_qc.jpg"

EXPECTED_CATS = 9997
EXTEND = 1.75
BINS = 32
RANDOM_CATS = 500

SLIDERS = [
    ("eyeSpacing", "FACE", "Eye spacing", 0.02),
    ("eyeHeight", "FACE", "Eye height", None),
    ("muzzle", "FACE", "Muzzle length", 0.02),
    ("tilt", "FACE", "Head tilt", None),
    ("earLength", "EARS", "Ear length", 0.03),
    ("earWidth", "EARS", "Ear width", 0.03),
    ("earSplay", "EARS", "Ear splay", None),
    ("earGap", "EARS", "Ear gap", 0.0),
    ("wonky", "EARS", "Wonky ears", None),
]
KEYS = [s[0] for s in SLIDERS]


def read_landmarks():
    """Top-level CAT_0x only: cats/ is a byte-identical copy of the same files."""
    names, points = [], []
    for folder in sorted(DATASET.glob("CAT_0*")):
        for f in sorted(folder.glob("*.cat")):
            v = f.read_text().split()
            if v[0] != "9" or len(v) != 19:
                raise ValueError(f"bad annotation {f}")
            names.append(str(f.relative_to(DATASET))[:-4])
            points.append(np.array(v[1:], float).reshape(9, 2))
    if len(points) != EXPECTED_CATS or any("cats/" in n for n in names):
        raise ValueError(f"expected {EXPECTED_CATS} top-level annotations, found {len(points)}")
    return names, np.array(points)


def normalise(p):
    """Level eyes, eye midpoint at origin, head width 1. Returns points and tilt in degrees."""
    d = p[:, 1] - p[:, 0]
    a = np.arctan2(d[:, 1], d[:, 0])
    c, s = np.cos(-a)[:, None], np.sin(-a)[:, None]
    q = p - ((p[:, 0] + p[:, 1]) / 2)[:, None]
    n = np.stack([q[..., 0] * c - q[..., 1] * s, q[..., 0] * s + q[..., 1] * c], 2)
    width = n[:, 8, 0] - n[:, 3, 0]
    good = width > 1
    n[good] /= width[good, None, None]
    return n, np.degrees(a), good


def frontal_mask(n):
    eye = n[:, 1, 0] - n[:, 0, 0]
    left = np.hypot(*(n[:, 3] - n[:, 5]).T)
    right = np.hypot(*(n[:, 6] - n[:, 8]).T)
    return (np.abs(n[:, 2, 0]) / eye < 0.15) & (np.abs(np.log((left + 1e-6) / (right + 1e-6))) < 0.4)


def features(n, tilt):
    x, y = n[..., 0], n[..., 1]
    ear = lambda o, t, i: (n[:, t] - (n[:, o] + n[:, i]) / 2)
    l, r = ear(3, 4, 5), ear(8, 7, 6)
    llen, rlen = np.hypot(*l.T), np.hypot(*r.T)
    return {
        "eyeSpacing": x[:, 1] - x[:, 0],
        "eyeHeight": -(y[:, 3] + y[:, 5] + y[:, 6] + y[:, 8]) / 4,
        "muzzle": y[:, 2],
        "tilt": tilt,
        "earLength": (llen + rlen) / 2,
        "earWidth": (np.hypot(*(n[:, 3] - n[:, 5]).T) + np.hypot(*(n[:, 8] - n[:, 6]).T)) / 2,
        "earSplay": np.degrees((np.arctan2(-l[:, 0], -l[:, 1]) + np.arctan2(r[:, 0], -r[:, 1])) / 2),
        "earGap": x[:, 6] - x[:, 5],
        "wonky": rlen - llen,
    }


def scan():
    names, pts = read_landmarks()
    n, tilt, good = normalise(pts)
    front = frontal_mask(n) & good
    f = features(n, tilt)
    rows = np.column_stack([f[k] for k in KEYS])
    base = np.median(np.hypot(*(n[front, 3] - n[front, 5]).T))
    slope = float(np.median((n[front, 5, 1] - n[front, 3, 1]) / (n[front, 5, 0] - n[front, 3, 0])))

    seen, coat_rows, skipped = set(), [], {"turned": 0, "small or cropped": 0, "repeat image": 0}
    for i, name in enumerate(names):
        if not front[i]:
            skipped["turned"] += 1
            continue
        path = DATASET / name
        h = coats.file_hash(path)
        if h in seen:
            skipped["repeat image"] += 1
            continue
        seen.add(h)
        c = coats.sample(path, pts[i])
        if c is None:
            skipped["small or cropped"] += 1
            continue
        coat_rows.append([name, coats.pack(c)])
    data = {
        "cats": len(names),
        "keys": KEYS,
        "tiltAll": np.round(tilt[good], 2).tolist(),
        "frontal": np.round(rows[front], 4).tolist(),
        "baseSlope": slope,
        "baseMedian": float(base),
        "coats": coat_rows,
        "skipped": skipped,
    }
    with gzip.open(MEASURES, "wt") as f_out:
        json.dump(data, f_out, separators=(",", ":"))
    return data


def unpack(s):
    return [[int(s[i + j * 2 : i + j * 2 + 2], 16) for j in range(3)] for i in range(0, 48, 6)]


def write_qc(sorted_coats):
    """A small sheet of photos beside their sampled swatches. Stays in pipeline/out."""
    from PIL import Image, ImageDraw

    if not DATASET.exists():
        return
    cols, cell = 14, 92
    sheet = Image.new("RGB", (cols * cell + 110, len(sorted_coats) * cell), "white")
    draw = ImageDraw.Draw(sheet)
    rng = random.Random(3)
    for row, (key, rows) in enumerate(sorted_coats.items()):
        draw.text((4, row * cell + 40), f"{key}\n{len(rows)}", fill="black")
        for col, (name, packed) in enumerate(rng.sample(rows, min(cols, len(rows)))):
            pts = np.array((DATASET / f"{name}.cat").read_text().split()[1:], float).reshape(9, 2)
            d = np.hypot(*(pts[1] - pts[0]))
            mid = (pts[0] + pts[1]) / 2
            box = [int(mid[0] - d * 1.7), int(mid[1] - d * 1.5), int(mid[0] + d * 1.7), int(mid[1] + d * 1.9)]
            face = Image.open(DATASET / name).convert("RGB").crop(box).resize((76, 76))
            x, y = 110 + col * cell, row * cell
            sheet.paste(face, (x, y + 2))
            for i, c in enumerate(unpack(packed)):
                draw.rectangle([x + 76, y + 2 + i * 10, x + 88, y + 11 + i * 10], fill=tuple(c))
    QC.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(QC, quality=88)


def main():
    if "--scan" in sys.argv:
        data = scan()
    else:
        with gzip.open(MEASURES, "rt") as f:
            data = json.load(f)

    rows = np.array(data["frontal"])
    # head tilt describes pose, so it uses every cat rather than only frontal ones
    columns = {k: rows[:, i] for i, k in enumerate(data["keys"])}
    columns["tilt"] = np.array(data["tiltAll"])

    sliders = []
    for key, group, label, floor in SLIDERS:
        v = columns[key]
        lo, med, hi = np.percentile(v, [0.5, 50, 99.5])
        low, high = med - (med - lo) * EXTEND, med + (hi - med) * EXTEND
        if floor is not None:
            low = max(low, floor)
        hist, _ = np.histogram(v, bins=BINS, range=(low, high))
        sliders.append({
            "key": key, "group": group, "label": label,
            "min": round(float(low), 4), "max": round(float(high), 4), "def": round(float(med), 4),
            "realMin": round(float(lo), 4), "realMax": round(float(hi), 4),
            "hist": np.round(hist / hist.max(), 3).tolist(),
        })

    # real cats only: both tails stay inside the shown real range
    inside = np.all([(rows[:, i] >= s["realMin"]) & (rows[:, i] <= s["realMax"]) for i, s in enumerate(sliders)], axis=0)
    pool = rows[inside]
    pick = np.random.default_rng(7).choice(len(pool), min(RANDOM_CATS, len(pool)), replace=False)

    curated = {name: key for key, names in json.loads(CURATED.read_text()).items() for name in names}
    groups = {key: [] for key, _ in coats.CATEGORIES}
    unclear = 0
    for name, packed in data["coats"]:
        key = curated.get(name) or coats.classify(unpack(packed))
        if key is None:
            unclear += 1
        else:
            groups[key].append([name, packed])
    placed = sum(len(g) for key, g in groups.items() if key not in coats.CURATED)
    rng = random.Random(7)
    categories = [{
        "key": key, "label": label,
        "share": None if key in coats.CURATED else round(len(groups[key]) / placed, 4),
        "coats": [c[1] for c in rng.sample(groups[key], min(coats.PER_CATEGORY, len(groups[key])))],
    } for key, label in coats.CATEGORIES]

    model = {
        "meta": {"cats": data["cats"], "frontal": len(rows), "coatsSampled": len(data["coats"]), "coatsPlaced": placed},
        "regions": coats.REGIONS,
        "baseSlope": round(data["baseSlope"], 4),
        "sliders": sliders,
        "samples": np.round(pool[pick], 3).tolist(),
        "categories": categories,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(model, separators=(",", ":")))

    print(f"cats {data['cats']}  frontal {len(rows)}  random pool {len(pool)}  skipped {data['skipped']}")
    for s in sliders:
        print(f"{s['key']:11s} slider {s['min']:8.3f} .. {s['max']:8.3f}  real {s['realMin']:8.3f} .. {s['realMax']:8.3f}  default {s['def']:8.3f}")
    print(f"coats sampled {len(data['coats'])}  placed {placed}  unclear {unclear}")
    for c in categories:
        share = "hand-picked" if c["share"] is None else f"{c['share'] * 100:5.1f}%"
        print(f"{c['label']:16s} {len(groups[c['key']]):5d}  {share}")
    print(f"model {OUT.stat().st_size / 1024:.1f} KB  measurements {MEASURES.stat().st_size / 1024:.1f} KB")
    write_qc(groups)


if __name__ == "__main__":
    main()
