import * as THREE from "three";
import { model, type Params } from "../model";
import { Facets, Slot, lerp, mirror, type V } from "./facets";

export { Slot };

const EYE_RADIUS = 0.09;
const LIFT = 0.012;

const blend = (a: V, b: V, c: V, u: number, v: number, w: number, lift: number): V => [
  a[0] * u + b[0] * v + c[0] * w,
  a[1] * u + b[1] * v + c[1] * w,
  a[2] * u + b[2] * v + c[2] * w + lift,
];

/** The 9 dataset points from slider values, with y up and the eye midpoint at the origin. */
export function landmarks(p: Params) {
  const slope = Math.abs(model.baseSlope);
  const len = Math.hypot(1, slope);
  const bx = 1 / len;
  const by = -slope / len;
  const innerY = p.eyeHeight - (p.earWidth * by) / 2;
  const inner: V = [p.earGap / 2, innerY, 0];
  const outer: V = [inner[0] + p.earWidth * bx, innerY + p.earWidth * by, 0];
  const mid = lerp(inner, outer, 0.5);
  const a = THREE.MathUtils.degToRad(p.earSplay);
  const tip = (length: number): V => [mid[0] + length * Math.sin(a), mid[1] + length * Math.cos(a), 0];
  return {
    eye: [p.eyeSpacing / 2, 0, 0] as V,
    mouth: [0, -p.muzzle, 0] as V,
    inner,
    outer,
    tipL: mirror(tip(Math.max(0.02, p.earLength - p.wonky / 2))),
    tipR: tip(Math.max(0.02, p.earLength + p.wonky / 2)),
  };
}

export class CatMesh extends Facets {
  /** Where the neck enters the head, in head coordinates. */
  anchor: V = [0, 0, 0];

  constructor(start: Params) {
    super();
    this.init(start);
  }

  protected write(p: Params) {
    const m = landmarks(p);
    const E = m.eye;
    // head shell stays a closed volume when the sliders pull the real points somewhere odd
    const hw = Math.max(m.outer[0], E[0] + 0.14, 0.3);
    const D = hw * 2;
    const jaw = Math.max(p.muzzle, 0.1);
    const top = Math.max(m.inner[1], 0.14);

    const CT: V = [0, top + 0.03, 0.26 * D];
    const FH: V = [0, top * 0.5, 0.46 * D];
    const BR: V = [0, -jaw * 0.12, 0.5 * D];
    const NT: V = [0, -jaw * 0.5, 0.6 * D];
    const MO: V = [0, -jaw, 0.58 * D];
    const CH: V = [0, -jaw - 0.13, 0.42 * D];
    const UJ: V = [0, -jaw - 0.16, 0.02 * D];
    const TP: V = [0, top - 0.02, -0.2 * D];
    const BK: V = [0, top * 0.2 - jaw * 0.3, -0.46 * D];

    const a: V = [Math.min(m.inner[0], hw * 0.8), Math.max(m.inner[1], 0.12), 0.2 * D];
    const b: V = [m.outer[0], Math.max(m.outer[1], 0.08), 0.06 * D];
    const c: V = [hw * 0.98, Math.max(b[1] * 0.5, 0.05), 0.25 * D];
    const d: V = [hw * 1.06, -jaw * 0.35, 0.14 * D];
    const e: V = [hw * 0.62, -jaw - 0.04, 0.26 * D];
    const f: V = [Math.max(Math.min(E[0] * 0.9, hw * 0.55), 0.08), -jaw * 0.62, 0.5 * D];
    const g: V = [E[0] + 0.12, 0.1, 0.33 * D];
    const h: V = [E[0], 0, 0.4 * D];
    const i: V = [hw * 0.86, top * 0.4, -0.24 * D];
    const j: V = [hw * 0.72, -jaw * 0.6, -0.22 * D];

    this.anchor = [0, -jaw * 0.75, -0.18 * D];

    const O: V = [0, (top - jaw) * 0.45, 0];
    const side = (s: 1 | -1, cheek: number) => {
      const v = (q: V) => (s > 0 ? q : mirror(q));
      const [A, B, C, Dd, Ee, Ff, G, H, I, J] = [a, b, c, d, e, f, g, h, i, j].map(v);
      const face = (x: V, y: V, z: V, slot: number) => this.tri(x, y, z, slot, O);
      const { forehead, bridge, muzzle, chin } = Slot;
      face(CT, FH, A, forehead); face(FH, G, A, forehead); face(A, G, C, forehead); face(A, C, B, forehead);
      face(FH, H, G, forehead); face(FH, BR, H, bridge); face(BR, Ff, H, bridge); face(BR, NT, Ff, bridge);
      face(NT, MO, Ff, muzzle); face(Ff, MO, Ee, muzzle); face(MO, CH, Ee, chin);
      face(H, Ff, Dd, cheek); face(H, Dd, G, cheek); face(G, Dd, C, cheek); face(Ff, Ee, Dd, cheek);
      face(CT, A, TP, forehead); face(A, B, I, forehead); face(A, I, TP, forehead); face(TP, I, BK, forehead);
      face(B, C, I, cheek); face(C, Dd, I, cheek); face(Dd, J, I, cheek); face(Dd, Ee, J, cheek);
      face(I, J, BK, cheek); face(J, UJ, BK, chin); face(Ee, UJ, J, chin); face(Ee, CH, UJ, chin);
    };
    side(1, Slot.cheekR);
    side(-1, Slot.cheekL);

    const ear = (base1: V, base2: V, tip: V, skin: number, inner: number) => {
      const O1: V = [base1[0], base1[1], b[2]];
      const I1: V = [base2[0], base2[1], a[2]];
      const T: V = [tip[0], tip[1], (O1[2] + I1[2]) / 2 - 0.03];
      const inset = (q: V): V => {
        const k = 0.3;
        const cx = (O1[0] + I1[0] + T[0]) / 3, cy = (O1[1] + I1[1] + T[1]) / 3, cz = (O1[2] + I1[2] + T[2]) / 3;
        return [q[0] + (cx - q[0]) * k, q[1] + (cy - q[1]) * k, q[2] + (cz - q[2]) * k - 0.012];
      };
      const [Oi, Ii, Ti] = [inset(O1), inset(I1), inset(T)];
      const behind: V = [(O1[0] + I1[0]) / 2, (O1[1] + I1[1]) / 2, -1];
      const ahead: V = [behind[0], behind[1], 2];
      const back = lerp(O1, I1, 0.5);
      const A: V = [back[0], back[1] + (T[1] - back[1]) * 0.12, Math.min(O1[2], I1[2]) - 0.1];
      this.quad(O1, T, Ti, Oi, skin, behind);
      this.quad(T, I1, Ii, Ti, skin, behind);
      this.quad(I1, O1, Oi, Ii, skin, behind);
      this.tri(Oi, Ti, Ii, inner, behind);
      this.tri(O1, A, T, skin, ahead);
      this.tri(T, A, I1, skin, ahead);
      this.tri(O1, I1, A, skin, ahead);
    };
    ear(m.outer, m.inner, m.tipR, Slot.earR, Slot.innerR);
    ear(mirror(m.outer), mirror(m.inner), m.tipL, Slot.earL, Slot.innerL);

    const face: V = [0, 0, -1];
    const slopeZ = (g[2] - BR[2]) / (g[0] || 1);
    const eye = (s: 1 | -1) => {
      const cx = s * E[0];
      const at = (x: number, y: number): V => [cx + x, y, h[2] + LIFT * 2 + s * x * slopeZ];
      const c0 = at(0, 0);
      for (let n = 0; n < 6; n++) {
        const a0 = (n / 6) * Math.PI * 2, a1 = ((n + 1) / 6) * Math.PI * 2;
        this.tri(c0, at(EYE_RADIUS * Math.cos(a0), EYE_RADIUS * Math.sin(a0)), at(EYE_RADIUS * Math.cos(a1), EYE_RADIUS * Math.sin(a1)), Slot.eye, face);
      }
      const lift = (q: V): V => [q[0], q[1], q[2] + LIFT / 2];
      this.quad(lift(at(0, 0.075)), lift(at(0.024, 0)), lift(at(0, -0.075)), lift(at(-0.024, 0)), Slot.pupil, face);
    };
    eye(1);
    eye(-1);

    const noseH = Math.min(0.055, jaw * 0.25);
    const noseY = -jaw * 0.5 + noseH * 0.4;
    const z = NT[2] + LIFT;
    this.tri([-0.06, noseY, z], [0.06, noseY, z], [0, noseY - noseH, z + 0.01], Slot.nose, face);

    const w = 0.008;
    const stem: V = [0, noseY - noseH, z];
    const lip: V = [0, -jaw + 0.02, MO[2] + LIFT];
    this.quad([stem[0] - w, stem[1], stem[2]], [stem[0] + w, stem[1], stem[2]], [lip[0] + w, lip[1], lip[2]], [lip[0] - w, lip[1], lip[2]], Slot.ink, face);
    for (const s of [1, -1]) {
      const end: V = [s * 0.1, -jaw + 0.06, MO[2] - 0.03 + LIFT];
      this.quad([lip[0], lip[1] + w, lip[2]], [end[0], end[1] + w, end[2]], [end[0], end[1] - w, end[2]], [lip[0], lip[1] - w, lip[2]], Slot.ink, face);
    }

    for (const s of [1, -1]) {
      for (const k of [-1, 0, 1]) {
        const y = -jaw * 0.68 + k * 0.035;
        const x = s * f[0] * 0.8;
        const zw = f[2] + LIFT;
        this.tri([x, y + 0.005, zw], [x, y - 0.005, zw], [s * (hw * 1.42), y + k * 0.09 - 0.01, zw - 0.12], Slot.ink, face);
      }
    }

    for (const s of [1, -1]) {
      const v = (q: V) => (s > 0 ? q : mirror(q));
      const A = v(a), G = v(g);
      this.tri(blend(CT, FH, A, 0.62, 0.3, 0.08, LIFT), blend(CT, FH, A, 0.14, 0.78, 0.08, LIFT), blend(CT, FH, A, 0.46, 0.3, 0.24, LIFT), Slot.mark, O);
      this.tri(blend(FH, G, A, 0.6, 0.1, 0.3, LIFT), blend(FH, G, A, 0.46, 0.46, 0.08, LIFT), blend(FH, G, A, 0.34, 0.26, 0.4, LIFT), Slot.mark, O);
    }
  }
}
