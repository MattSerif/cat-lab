import raw from "./data/model.json";

export interface SliderDef {
  key: string;
  group: string;
  label: string;
  min: number;
  max: number;
  def: number;
  realMin: number;
  realMax: number;
  hist: number[];
  /** True when the range comes from general cat anatomy rather than the dataset. */
  estimate?: boolean;
}

export interface Category {
  key: string;
  label: string;
  /** Share of rule-sorted cats, or null for a hand-picked category. */
  share: number | null;
  coats: string[];
}

export interface Model {
  meta: { cats: number; frontal: number; coatsSampled: number; coatsPlaced: number };
  regions: string[];
  baseSlope: number;
  sliders: SliderDef[];
  samples: number[][];
  categories: Category[];
}

export const model = raw as unknown as Model;
export type Params = Record<string, number>;

/**
 * The dataset only annotates heads, so body ranges are typical domestic cat proportions
 * from general anatomy, in head widths. realMin..realMax is the typical band, min..max allows silly.
 */
const estimate = (key: string, group: string, label: string, min: number, max: number, def: number, realMin: number, realMax: number): SliderDef =>
  ({ key, group, label, min, max, def, realMin, realMax, hist: [], estimate: true });

const BODY_SLIDERS: SliderDef[] = [
  estimate("neckLength", "BODY", "Neck length", 0, 1.4, 0.3, 0.15, 0.55),
  estimate("neckThickness", "BODY", "Neck thickness", 0.3, 1.2, 0.62, 0.5, 0.8),
  estimate("bodyLength", "BODY", "Body length", 1.5, 7, 3.4, 3, 4.3),
  estimate("chestDepth", "BODY", "Chest depth", 0.7, 3, 1.65, 1.35, 1.95),
  estimate("bodyWidth", "BODY", "Body width", 0.6, 3, 1.4, 1.15, 1.7),
  estimate("belly", "BODY", "Belly", -0.15, 1, 0.1, 0, 0.3),
  estimate("arch", "BODY", "Back arch", -0.6, 1.4, 0.05, -0.1, 0.25),
  estimate("legLength", "LEGS", "Leg length", 0.3, 4, 1.5, 1.25, 1.9),
  estimate("legThickness", "LEGS", "Leg thickness", 0.12, 0.9, 0.4, 0.32, 0.48),
  estimate("pawSize", "LEGS", "Paw size", 0.2, 1, 0.5, 0.42, 0.58),
  estimate("tailLength", "TAIL", "Tail length", 0, 7, 3.5, 3, 4.2),
  estimate("tailThickness", "TAIL", "Tail thickness", 0.08, 0.8, 0.28, 0.2, 0.36),
  estimate("tailAngle", "TAIL", "Tail angle", -80, 130, 55, -30, 90),
  estimate("tailCurl", "TAIL", "Tail curl", -1, 1.6, 0.35, 0, 0.7),
];

export const sliders = [...model.sliders, ...BODY_SLIDERS];

/** 8 region colours as 48 hex digits, in `model.regions` order. */
export interface Coat {
  category: string;
  regions: string;
  eye: string;
}

const HAND_PICKED_WEIGHT = 0.015;
const EYES = ["#c9a227", "#d9a441", "#8fae45", "#a8b94a"];
const BLUE_EYES = "#5b9bd5";

export function mulberry(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(list: T[], r: () => number) => list[Math.floor(r() * list.length)];

export function defaults(): Params {
  return Object.fromEntries(sliders.map((s) => [s.key, s.def]));
}

/**
 * A random cat. At normal = 1 the head is a real cat's measurements, so they keep their natural
 * correlations, and the body is drawn inside the typical band, favouring the middle.
 * Lower values stretch each draw's place in the real band out toward the slider's full range,
 * reaching min..max at normal = 0.
 */
export function randomCat(r: () => number, normal = 1): Params {
  const row = pick(model.samples, r);
  const place = (s: SliderDef, u: number) => {
    const lo = s.min + (s.realMin - s.min) * normal;
    const hi = s.max + (s.realMax - s.max) * normal;
    return [s.key, lo + (hi - lo) * u];
  };
  const head = model.sliders.map((s, i) => place(s, (row[i] - s.realMin) / (s.realMax - s.realMin)));
  const body = BODY_SLIDERS.map((s) => place(s, (r() + r()) / 2));
  return Object.fromEntries([...head, ...body]);
}

function randomCategory(r: () => number) {
  const weights = model.categories.map((c) => c.share ?? HAND_PICKED_WEIGHT);
  let left = r() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    left -= weights[i];
    if (left <= 0) return model.categories[i];
  }
  return model.categories[0];
}

export function randomCoat(key: string | null, r: () => number): Coat {
  const category = model.categories.find((c) => c.key === key) ?? randomCategory(r);
  return {
    category: category.key,
    regions: pick(category.coats, r),
    eye: category.key === "point" ? BLUE_EYES : pick(EYES, r),
  };
}

export function defaultCoat(): Coat {
  const coats = [...model.categories.find((c) => c.key === "tabby")!.coats];
  const bright = (hex: string) => [...hex].reduce((sum, digit) => sum + parseInt(digit, 16), 0);
  coats.sort((a, b) => bright(a) - bright(b));
  return { category: "tabby", regions: coats[Math.floor(coats.length * 0.75)], eye: EYES[0] };
}

export function solidCoat(hex: string, eye: string): Coat {
  return { category: "custom", regions: hex.slice(1).repeat(8), eye };
}
