import { model, sliders, type Coat, type SliderDef } from "../model";

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

const DEGREES = new Set(["tilt", "earSplay", "tailAngle"]);
const ESTIMATE_NOTE = "Typical range from general cat anatomy. The dataset has no body measurements.";

const fmt = (s: SliderDef, v: number) => (DEGREES.has(s.key) ? `${v.toFixed(0)}°` : v.toFixed(2));

export interface RackEvents {
  slide(key: string, value: number): void;
  category(key: string | null): void;
  coatColour(hex: string): void;
  eyeColour(hex: string): void;
  /** `normal` is 1 for typical cats and 0 for the full slider range. */
  random(normal: number): void;
  randomCoat(): void;
  reset(): void;
  save(): void;
}

function histogramStrip(s: SliderDef) {
  const strip = el("div", "hist");
  strip.setAttribute("aria-hidden", "true");
  for (const h of s.hist) {
    const bar = el("i");
    bar.style.height = `${Math.round(h * 100)}%`;
    strip.append(bar);
  }
  return strip;
}

/** Everything inside this band was measured on real cats, or is typical for estimated sliders. Past it is silly. */
function realBand(s: SliderDef) {
  const band = el("div", s.estimate ? "real estimate" : "real");
  band.setAttribute("aria-hidden", "true");
  const at = (v: number) => ((v - s.min) / (s.max - s.min)) * 100;
  band.style.left = `${at(s.realMin)}%`;
  band.style.right = `${100 - at(s.realMax)}%`;
  return band;
}

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const DICE_ICON = svg(
  `<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/>` +
    [[8, 8], [16, 8], [12, 12], [8, 16], [16, 16]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.5" fill="currentColor" stroke="none"/>`).join(""),
);
const SPIKY_ICON = svg(`<path d="M12 2 L13.6 9 L21 5.5 L15.2 11.4 L22 14.5 L14.4 14.6 L16.5 22 L11.8 16.2 L6 21 L8.4 14.2 L2 12.6 L8.6 9.9 L4.5 3.5 L10.4 8.2 Z"/>`);
const CIRCLE_ICON = svg(`<circle cx="12" cy="12" r="9"/>`);

export class Rack {
  private inputs = new Map<string, { input: HTMLInputElement; value: HTMLElement; def: SliderDef }>();
  private coatButtons = new Map<string, HTMLButtonElement>();
  private coatPicker = el("input");
  private normal = el("input");
  private eyePicker = el("input");

  constructor(root: HTMLElement, private on: RackEvents) {
    root.append(this.head());
    for (const group of new Set(sliders.map((s) => s.group))) {
      const box = el("fieldset", "group");
      const members = sliders.filter((x) => x.group === group);
      const estimated = members.every((s) => s.estimate);
      box.append(el("legend", "", estimated ? `${group} · ESTIMATED` : group));
      if (estimated) box.title = ESTIMATE_NOTE;
      for (const s of members) box.append(this.slider(s));
      root.append(box);
    }
    root.append(this.coats(), this.actions());
  }

  private button(label: string, click: () => void, title = "") {
    const b = el("button", "btn", label);
    b.type = "button";
    if (title) b.title = title;
    b.addEventListener("click", click);
    return b;
  }

  private head() {
    const h = el("header", "head");
    h.append(el("h1", "", "CAT LAB"), el("p", "", "DRAG TO TURN  ·  SCROLL TO ZOOM"));
    return h;
  }

  private slider(s: SliderDef) {
    const row = el("div", "slider");
    const id = `s-${s.key}`;
    const label = el("label", "", s.label);
    label.htmlFor = id;
    if (s.estimate) label.title = ESTIMATE_NOTE;
    const value = el("output");
    value.htmlFor.add(id);
    const track = el("div", "track");
    const input = el("input");
    input.id = id;
    input.type = "range";
    input.min = String(s.min);
    input.max = String(s.max);
    input.step = String((s.max - s.min) / 400);
    input.addEventListener("input", () => this.on.slide(s.key, Number(input.value)));
    track.append(realBand(s), histogramStrip(s), input);
    const top = el("div", "slider-top");
    top.append(label, value);
    row.append(top, track);
    this.inputs.set(s.key, { input, value, def: s });
    return row;
  }

  private coats() {
    const box = el("fieldset", "group");
    box.append(el("legend", "", "COAT"));
    const dice = this.button("RANDOM", () => this.on.randomCoat(), "Pick another real coat");
    dice.classList.add("dice");
    box.append(dice);
    const grid = el("div", "coat-grid");
    for (const c of model.categories) {
      const b = this.button("", () => this.on.category(c.key), c.share === null ? "Checked by eye" : "Share of sorted cats");
      b.append(el("span", "", c.label), el("span", "share", c.share === null ? "PICKED" : `${(c.share * 100).toFixed(1)}%`));
      this.coatButtons.set(c.key, b);
      grid.append(b);
    }
    const colours = el("div", "colours");
    colours.append(this.picker("COAT", this.coatPicker, (hex) => this.on.coatColour(hex)), this.picker("EYES", this.eyePicker, (hex) => this.on.eyeColour(hex)));
    box.append(grid, colours);
    return box;
  }

  private picker(text: string, input: HTMLInputElement, change: (hex: string) => void) {
    const label = el("label", "swatch", text);
    input.type = "color";
    input.addEventListener("input", () => change(input.value));
    label.append(input);
    return label;
  }

  private actions() {
    const box = el("div", "actions");

    const dice = this.button("", () => this.on.random(Number(this.normal.value) / 100), "Random cat");
    dice.classList.add("dice-btn");
    dice.setAttribute("aria-label", "Random cat");
    dice.innerHTML = DICE_ICON;

    // 100% keeps random cats in the normal range, 0% lets them use every slider's full range
    const range = el("div", "range-row");
    const icon = (markup: string, title: string) => {
      const i = el("span", "range-icon");
      i.innerHTML = markup;
      i.title = title;
      return i;
    };
    const track = el("div", "track");
    this.normal.type = "range";
    this.normal.min = "0";
    this.normal.max = "100";
    this.normal.step = "1";
    this.normal.value = "100";
    const describe = () => {
      const text = `${this.normal.value}% normal`;
      this.normal.setAttribute("aria-valuetext", text);
      this.normal.title = `${text}: how close the dice keeps cats to the normal range`;
    };
    this.normal.setAttribute("aria-label", "Dice range, from full slider range to normal cats");
    this.normal.addEventListener("input", describe);
    describe();
    track.append(this.normal);
    range.append(icon(SPIKY_ICON, "Full slider range"), track, icon(CIRCLE_ICON, "Normal cats"));

    const top = el("div", "dice-row");
    top.append(dice, range);
    const bottom = el("div", "btn-row");
    bottom.append(this.button("RESET", () => this.on.reset()), this.button("SAVE", () => this.on.save(), "Save this view as a 2048 px PNG"));
    box.append(top, bottom);
    return box;
  }

  sync(p: Record<string, number>, coat: Coat) {
    for (const [key, { input, value, def }] of this.inputs) {
      if (document.activeElement !== input || Number(input.value) !== p[key]) input.value = String(p[key]);
      value.textContent = fmt(def, p[key]);
    }
    for (const [key, b] of this.coatButtons) b.setAttribute("aria-pressed", String(key === coat.category));
    this.coatPicker.value = `#${coat.regions.slice(0, 6)}`;
    this.eyePicker.value = coat.eye;
  }
}
