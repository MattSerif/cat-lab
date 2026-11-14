import * as THREE from "three";
import type { Params } from "../model";
import { Facets, Slot, add, lerp, type V } from "./facets";

/** Torso and neck cross-section, from the top clockwise as seen from the head. */
const HEX = [90, 30, -30, -90, -150, 150].map((d) => THREE.MathUtils.degToRad(d));
/** Slot for the face between HEX[k] and HEX[k + 1]: back, sides and belly take forehead, cheek and chin colours. */
const RING_SLOTS = [Slot.forehead, Slot.cheekR, Slot.chin, Slot.chin, Slot.cheekL, Slot.forehead];

/** Torso stations from chest (0) to rump (1), with relative width and height at each. */
const STATIONS = [0, 0.18, 0.5, 0.82, 1];
const WIDTH = [0.78, 1, 0.96, 1, 0.82];
const HEIGHT = [0.82, 1, 0.94, 1, 0.84];

const NECK_RISE = THREE.MathUtils.degToRad(55);
const NECK_MIN = 0.48;
const TAIL_SEGMENTS = 6;
const TAIL_TIP_SEGMENTS = 2;
const CURL_PER_SEGMENT = 0.45;
const STRIPES = [0.3, 0.42, 0.54, 0.66, 0.78];
const TAIL_RINGS = [1, 3, 5];
const MARK_GROW = 1.03;

function station(values: number[], t: number) {
  for (let i = 1; i < STATIONS.length; i++) {
    if (t <= STATIONS[i]) return values[i - 1] + ((values[i] - values[i - 1]) * (t - STATIONS[i - 1])) / (STATIONS[i] - STATIONS[i - 1]);
  }
  return values[values.length - 1];
}

/** Standing body in head widths. Paws rest on y = 0, the chest faces +z and the rump is at z = -bodyLength. */
export class BodyMesh extends Facets {
  readonly neckTop = new THREE.Vector3();

  constructor(start: Params) {
    super();
    this.init(start);
  }

  protected write(p: Params) {
    const L = p.bodyLength, W = p.bodyWidth, D = p.chestDepth;
    const y0 = p.legLength + D / 2;
    const centreY = (t: number) => y0 + p.arch * D * 0.5 * Math.sin(Math.PI * t);
    const axis = (t: number): V => [0, centreY(t), -t * L];
    const ring = (t: number, grow = 1): V[] => {
      const w = (W / 2) * station(WIDTH, t) * grow;
      const h = (D / 2) * station(HEIGHT, t) * grow;
      const sag = p.belly * D * Math.sin(Math.PI * t) ** 2;
      return HEX.map((a) => {
        const s = Math.sin(a);
        return [Math.cos(a) * w, centreY(t) + s * h - (s < 0 ? sag * -s : 0), -t * L] as V;
      });
    };

    const rings = STATIONS.map((t) => ring(t));
    for (let i = 0; i < rings.length - 1; i++) {
      const from = axis((STATIONS[i] + STATIONS[i + 1]) / 2);
      for (let k = 0; k < 6; k++) this.quad(rings[i][k], rings[i][(k + 1) % 6], rings[i + 1][(k + 1) % 6], rings[i + 1][k], RING_SLOTS[k], from);
    }
    const chest: V = [0, centreY(0), D * 0.28];
    const rump: V = [0, centreY(1), -L - D * 0.22];
    for (let k = 0; k < 6; k++) {
      this.tri(rings[0][k], rings[0][(k + 1) % 6], chest, RING_SLOTS[k], add(axis(0), [0, 0, -0.1]));
      this.tri(rings[4][k], rings[4][(k + 1) % 6], rump, RING_SLOTS[k], add(axis(1), [0, 0, 0.1]));
    }

    // neck rises forward from the top of the chest, and its top is where the head attaches
    const dir: V = [0, Math.sin(NECK_RISE), Math.cos(NECK_RISE)];
    const up: V = [0, Math.cos(NECK_RISE), -Math.sin(NECK_RISE)];
    const base: V = [0, y0 + D * 0.2, D * 0.02];
    const top = add(base, dir, p.neckLength + NECK_MIN);
    const neckRing = (c: V, r: number) => HEX.map((a) => add(add(c, [Math.cos(a) * r, 0, 0]), up, Math.sin(a) * r));
    const nb = neckRing(base, p.neckThickness * 0.6 + 0.1);
    const nt = neckRing(top, p.neckThickness * 0.5);
    const neckMid = lerp(base, top, 0.5);
    for (let k = 0; k < 6; k++) this.quad(nb[k], nb[(k + 1) % 6], nt[(k + 1) % 6], nt[k], RING_SLOTS[k], neckMid);
    this.neckTop.set(...top);

    // upper legs take the side colour, lower legs and paws the muzzle colour, so white muzzles give white socks
    const ph = p.pawSize * 0.45;
    const r = p.legThickness / 2;
    for (const front of [true, false]) {
      const z = front ? -L * 0.16 : -L * 0.84;
      for (const s of [1, -1]) {
        const x = s * W * 0.28;
        const hip: V = [x, y0 - D * 0.05, z];
        const joints: V[] = front
          ? [hip, [x, y0 - D * 0.5 - p.legLength * 0.15, z - 0.05], [x, ph + p.legLength * 0.18, z + 0.03], [x, ph * 0.8, z + 0.05]]
          : [hip, [x, p.legLength * 0.62, z + p.legLength * 0.16], [x, ph + p.legLength * 0.26, z - p.legLength * 0.16], [x, ph * 0.8, z - p.legLength * 0.06]];
        const radii = front ? [r * 1.3, r * 1.05, r * 0.9, r * 0.85] : [r * 1.6, r * 1.15, r * 0.85, r * 0.85];
        for (let j = 0; j < 3; j++) this.tube(joints[j], joints[j + 1], radii[j], radii[j + 1], j === 0 ? (s > 0 ? Slot.cheekR : Slot.cheekL) : Slot.muzzle);
        this.paw(joints[3], p.pawSize, ph);
      }
    }

    // tail bends a little more at each segment, so curl turns it into a hook or a question mark
    let angle = THREE.MathUtils.degToRad(p.tailAngle);
    const step = p.tailLength / TAIL_SEGMENTS;
    const tail: V[] = [[0, centreY(1) + (D / 2) * HEIGHT[4] * 0.55, -L - D * 0.08]];
    for (let i = 0; i < TAIL_SEGMENTS; i++) {
      tail.push(add(tail[i], [0, Math.sin(angle), -Math.cos(angle)], step));
      angle += p.tailCurl * CURL_PER_SEGMENT;
    }
    const tailR = (i: number) => (p.tailThickness / 2) * (1 - 0.6 * (i / TAIL_SEGMENTS));
    for (let i = 0; i < TAIL_SEGMENTS; i++) {
      this.tube(tail[i], tail[i + 1], tailR(i), tailR(i + 1), i >= TAIL_SEGMENTS - TAIL_TIP_SEGMENTS ? Slot.earR : Slot.forehead);
    }
    const end = tail[TAIL_SEGMENTS];
    const tip = add(end, [0, Math.sin(angle - p.tailCurl * CURL_PER_SEGMENT), -Math.cos(angle - p.tailCurl * CURL_PER_SEGMENT)], tailR(TAIL_SEGMENTS) * 1.6);
    this.tube(end, tip, tailR(TAIL_SEGMENTS), 0, Slot.earR);

    // tabby marks: stripes over the back and rings on the tail, drawn only for tabby coats
    for (const t of STRIPES) {
      const a = ring(t, MARK_GROW), b = ring(t + 0.035, MARK_GROW);
      const from = axis(t);
      for (const k of [5, 0]) this.quad(a[k], a[(k + 1) % 6], b[(k + 1) % 6], b[k], Slot.mark, from);
    }
    for (const i of TAIL_RINGS) {
      this.tube(lerp(tail[i], tail[i + 1], 0.35), lerp(tail[i], tail[i + 1], 0.6), tailR(i + 0.35) * 1.12, tailR(i + 0.6) * 1.12, Slot.mark);
    }
  }

  /** A low wedge, wider than tall and longer in front, sitting on the ground. */
  private paw(foot: V, size: number, height: number) {
    const [x, , z] = foot;
    const w = size * 0.5, f = size * 0.6, b = size * 0.3;
    const box: V[] = [
      [x - w, 0, z - b], [x + w, 0, z - b], [x + w, 0, z + f], [x - w, 0, z + f],
      [x - w * 0.75, height, z - b * 0.8], [x + w * 0.75, height, z - b * 0.8], [x + w * 0.75, height, z + f * 0.55], [x - w * 0.75, height, z + f * 0.55],
    ];
    const c: V = [x, height / 2, z + (f - b) / 2];
    const faces = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
    for (const [a, bb, cc, d] of faces) this.quad(box[a], box[bb], box[cc], box[d], Slot.muzzle, c);
  }
}
