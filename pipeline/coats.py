"""Coat sampling and categories. Photos are only read here, and only with --scan."""
import colorsys
import hashlib

import numpy as np
from PIL import Image

REGIONS = ["forehead", "bridge", "cheekL", "cheekR", "muzzle", "chin", "earL", "earR"]
FOREHEAD, BRIDGE, CHEEK_L, CHEEK_R, MUZZLE, CHIN, EAR_L, EAR_R = range(8)

MIN_EYE_PX = 40
MIN_REGIONS = 6
PER_CATEGORY = 60

CATEGORIES = [
    ("black", "BLACK"),
    ("white", "WHITE"),
    ("grey", "GREY"),
    ("ginger", "GINGER"),
    ("cream", "CREAM"),
    ("tabby", "BROWN TABBY"),
    ("tuxedo", "TUXEDO"),
    ("bicolour", "BICOLOUR"),
    ("calico", "CALICO/TORTIE"),
    ("point", "COLOURPOINT"),
]
# colour rules cannot tell these from tabby stripes in shadow, so they come from pipeline/curated.json
CURATED = {"calico", "point"}


def region_points(p):
    """Patch centres for one cat, as (centre list per region, patch radius)."""
    e = (p[0] + p[1]) / 2
    d = float(np.hypot(*(p[1] - p[0])))
    u = (p[1] - p[0]) / d
    v = np.array([-u[1], u[0]])
    if v @ (p[2] - e) < 0:
        v = -v
    rim = lambda o, t, i: 0.45 * t + 0.45 * o + 0.1 * i
    return [
        [e - v * d * 0.6],
        [e + v * d * 0.32],
        [e - u * d * 0.75 + v * d * 0.25],
        [e + u * d * 0.75 + v * d * 0.25],
        [p[2] - u * d * 0.3 - v * d * 0.1, p[2] + u * d * 0.3 - v * d * 0.1],
        [p[2] + v * d * 0.24],
        [rim(p[3], p[4], p[5])],
        [rim(p[8], p[7], p[6])],
    ], max(2, int(d * 0.1)), d


def sample(path, p):
    """Median colour per region, or None when the face is unusable."""
    centres, r, d = region_points(p)
    if d < MIN_EYE_PX:
        return None
    im = np.asarray(Image.open(path).convert("RGB"))
    h, w, _ = im.shape
    out = []
    for points in centres:
        got = [
            im[int(y) - r : int(y) + r + 1, int(x) - r : int(x) + r + 1].reshape(-1, 3)
            for x, y in points
            if r <= x < w - r and r <= y < h - r
        ]
        out.append(np.median(np.concatenate(got), 0).round().astype(int).tolist() if got else None)
    if sum(c is not None for c in out) < MIN_REGIONS:
        return None
    # regions off the photo borrow the nearest one that was seen
    near = {EAR_L: [FOREHEAD, CHEEK_L], EAR_R: [FOREHEAD, CHEEK_R], FOREHEAD: [BRIDGE], CHIN: [MUZZLE], MUZZLE: [BRIDGE],
            CHEEK_L: [CHEEK_R, BRIDGE], CHEEK_R: [CHEEK_L, BRIDGE], BRIDGE: [MUZZLE, FOREHEAD]}
    for i, c in enumerate(out):
        if c is None:
            out[i] = next(out[j] for j in near[i] + list(range(8)) if out[j] is not None)
    return out


def file_hash(path):
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()


def hsv(rgb):
    h, s, v = colorsys.rgb_to_hsv(*(np.array(rgb) / 255))
    return h * 360, s, v


def tone(rgb):
    """Coarse name for one sampled patch."""
    h, s, v = hsv(rgb)
    warm = 8 <= h <= 48
    if v < 0.3:
        return "dark"
    if s < 0.17:
        return "white" if v > 0.66 else "grey"
    if warm and s >= 0.42 and v >= 0.5:
        return "orange"
    if warm and v >= 0.66:
        return "cream"
    if warm:
        return "brown"
    return "odd"


def classify(coat):
    """Rule-based category for 8 sampled regions, or None when nothing fits clearly."""
    t = [tone(c) for c in coat]
    n = {k: t.count(k) for k in set(t)}
    if n.get("odd", 0) >= 2:
        return None
    white, dark, orange = n.get("white", 0), n.get("dark", 0), n.get("orange", 0)
    brown, cream, grey = n.get("brown", 0), n.get("cream", 0), n.get("grey", 0)
    h = [hsv(c) for c in coat]
    v = [x[2] for x in h]
    # stripes and patches show up as contrast between regions, solid coats do not
    spread = float(np.std(v))
    clean_white = sum(1 for x in h if x[2] > 0.72 and x[1] < 0.15)
    cheeks = [v[CHEEK_L], v[CHEEK_R]]

    upper = [t[i] for i in (FOREHEAD, CHEEK_L, CHEEK_R, EAR_L, EAR_R)]
    if upper.count("dark") >= 3 and orange == 0 and (t[MUZZLE] == "white" or t[CHIN] == "white"):
        return "tuxedo"
    if clean_white >= 3 and dark + orange + brown + grey >= 3 and spread > 0.18:
        return "bicolour"
    if dark >= 6 and orange == 0 and max(cheeks + [v[FOREHEAD], v[BRIDGE]]) < 0.36:
        return "black"
    if white >= 7 and min(v) > 0.6 and spread < 0.1:
        return "white"
    if grey >= 5 and spread < 0.16:
        return "grey"
    if orange >= 4 and dark <= 1:
        return "ginger"
    if cream >= 5 and spread < 0.1:
        return "cream"
    if brown >= 3 and brown + cream + orange + dark >= 6:
        return "tabby"
    return None


def pack(coat):
    return "".join(f"{v:02x}" for c in coat for v in c)
