import * as THREE from "three";
import type { Params } from "../model";

export type V = readonly [number, number, number];

export const Slot = {
  forehead: 0, bridge: 1, cheekL: 2, cheekR: 3, muzzle: 4, chin: 5, earL: 6, earR: 7,
  innerL: 8, innerR: 9, eye: 10, pupil: 11, nose: 12, ink: 13, mark: 14,
} as const;

const MAX_TRIANGLES = 512;

export const lerp = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mirror = (a: V): V => [-a[0], a[1], a[2]];
export const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/**
 * One non-indexed buffer of flat facets. Triangle order is fixed, so colours survive shape changes.
 * Subclasses call `init` once their own fields exist.
 */
export abstract class Facets {
  readonly geometry = new THREE.BufferGeometry();
  triangles = 0;
  marks = 0;
  private slots: number[] = [];
  private positions = new Float32Array(9 * MAX_TRIANGLES);
  private normals = new Float32Array(9 * MAX_TRIANGLES);
  private colors = new Float32Array(0);
  private cursor = 0;

  protected abstract write(p: Params): void;

  protected init(start: Params) {
    this.write(start);
    this.triangles = this.slots.length;
    this.marks = this.slots.filter((s) => s === Slot.mark).length;
    this.colors = new Float32Array(this.triangles * 9);
    this.positions = this.positions.slice(0, this.triangles * 9);
    this.normals = this.normals.slice(0, this.triangles * 9);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("normal", new THREE.BufferAttribute(this.normals, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
  }

  update(p: Params) {
    this.cursor = 0;
    this.write(p);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.geometry.computeBoundingBox();
  }

  /** Tabby marks sit last in the buffer, so turning them off only shortens the draw. */
  paint(colourOf: (slot: number) => THREE.Color, marks: boolean) {
    for (let t = 0; t < this.triangles; t++) {
      const c = colourOf(this.slots[t]);
      for (let v = 0; v < 3; v++) this.colors.set([c.r, c.g, c.b], t * 9 + v * 3);
    }
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.setDrawRange(0, (this.triangles - (marks ? 0 : this.marks)) * 3);
  }

  /** Winding comes from `from`, so faces stay outward at every slider extreme. */
  protected tri(a: V, b: V, c: V, slot: number, from: V) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0] + c[0]) / 3 - from[0];
    const my = (a[1] + b[1] + c[1]) / 3 - from[1];
    const mz = (a[2] + b[2] + c[2]) / 3 - from[2];
    const flip = nx * mx + ny * my + nz * mz < 0;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= flip ? -len : len;
    ny /= flip ? -len : len;
    nz /= flip ? -len : len;
    const order = flip ? [a, c, b] : [a, b, c];
    const i = this.cursor * 9;
    order.forEach((point, k) => {
      this.positions.set(point, i + k * 3);
      this.normals.set([nx, ny, nz], i + k * 3);
    });
    this.slots[this.cursor++] = slot;
  }

  protected quad(a: V, b: V, c: V, d: V, slot: number, from: V) {
    this.tri(a, b, c, slot, from);
    this.tri(a, c, d, slot, from);
  }

  /** A four-sided tapered tube from a to b, for legs and tail segments. */
  protected tube(a: V, b: V, ra: number, rb: number, slot: number) {
    let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) [dx, dy, dz] = [0, 1, 0];
    else [dx, dy, dz] = [dx / len, dy / len, dz / len];
    // side axis stays horizontal, so legs and tail keep their faces square to the viewer
    let u: V = [1 - dx * dx, -dx * dy, -dx * dz];
    const ul = Math.hypot(...u);
    u = ul < 1e-6 ? [0, 0, 1] : [u[0] / ul, u[1] / ul, u[2] / ul];
    const v: V = [dy * u[2] - dz * u[1], dz * u[0] - dx * u[2], dx * u[1] - dy * u[0]];
    const ring = (c: V, r: number) => [add(c, u, r), add(c, v, r), add(c, u, -r), add(c, v, -r)];
    const A = ring(a, ra), B = ring(b, rb);
    const mid = lerp(a, b, 0.5);
    for (let k = 0; k < 4; k++) this.quad(A[k], A[(k + 1) % 4], B[(k + 1) % 4], B[k], slot, mid);
  }
}
