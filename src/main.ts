import "./style.css";
import { defaultCoat, defaults, model, mulberry, randomCat, randomCoat, sliders, solidCoat, type Coat, type Params } from "./model";
import { CatScene } from "./scene";
import { Rack } from "./ui/rack";

const canvas = document.querySelector<HTMLCanvasElement>("#view")!;

let params: Params = defaults();
let coat: Coat = defaultCoat();
let queued = false;
const random = mulberry(Math.floor(Math.random() * 2 ** 31));

const scene = new CatScene(canvas, params);

const rack = new Rack(document.querySelector<HTMLElement>("#rack")!, {
  slide(key, value) {
    params[key] = value;
    refresh();
  },
  category(key) {
    coat = randomCoat(key, random);
    refresh();
  },
  coatColour(hex) {
    coat = solidCoat(hex, coat.eye);
    refresh();
  },
  eyeColour(hex) {
    coat = { ...coat, eye: hex };
    refresh();
  },
  random(normal) {
    params = randomCat(random, normal);
    coat = randomCoat(null, random);
    apply();
    scene.frame();
  },
  randomCoat() {
    coat = randomCoat(null, random);
    refresh();
  },
  reset() {
    params = defaults();
    coat = defaultCoat();
    apply();
    scene.home();
  },
  async save() {
    const png = await scene.exportPng();
    if (!png) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(png);
    link.download = `cat-${coat.category}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  },
});

function apply() {
  scene.update(params);
  scene.setCoat(coat);
  rack.sync(params, coat);
}

function refresh() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    apply();
  });
}

refresh();
scene.start();

if (import.meta.env.DEV) {
  Object.assign(window, {
    cat: {
      get params() { return params; },
      get coat() { return coat; },
      set(p: Partial<Params>) {
        Object.assign(params, p);
        apply();
      },
      reset() {
        params = defaults();
        coat = defaultCoat();
        apply();
      },
      category(key: string, s: number) {
        coat = randomCoat(key, mulberry(s));
        apply();
      },
      view: (yaw: number, pitch: number, distance?: number) => scene.view(yaw, pitch, distance),
      frame: () => scene.frame(),
      triangles: () => ({ head: scene.mesh.triangles, body: scene.body.triangles }),
      positions: () => [...scene.mesh.geometry.attributes.position.array, ...scene.body.geometry.attributes.position.array],
      exportPng: () => scene.exportPng(),
      sliders,
      categories: model.categories.map((c) => c.key),
    },
  });
}
