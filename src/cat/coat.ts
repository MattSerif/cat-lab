import * as THREE from "three";
import type { Coat } from "../model";
import { Slot } from "./geometry";

const PINK = new THREE.Color("#d58f8a");
const NOSE = new THREE.Color("#b5685f");
const PUPIL = new THREE.Color("#100e0c");
const INK = new THREE.Color("#1c1815");

function regionColour(regions: string, index: number) {
  return new THREE.Color(`#${regions.slice(index * 6, index * 6 + 6)}`);
}

/** Per-slot colours for one coat. Hex is sRGB, and THREE.Color stores it linear for the vertex buffer. */
export function palette(coat: Coat) {
  const out = Array.from({ length: 8 }, (_, i) => regionColour(coat.regions, i));
  out[Slot.innerL] = out[Slot.earL].clone().lerp(PINK, 0.6).multiplyScalar(0.8);
  out[Slot.innerR] = out[Slot.earR].clone().lerp(PINK, 0.6).multiplyScalar(0.8);
  out[Slot.eye] = new THREE.Color(coat.eye);
  out[Slot.pupil] = PUPIL;
  out[Slot.nose] = out[Slot.muzzle].clone().lerp(NOSE, 0.7);
  out[Slot.ink] = INK;
  out[Slot.mark] = out[Slot.forehead].clone().multiplyScalar(0.28);
  return (slot: number) => out[slot];
}
