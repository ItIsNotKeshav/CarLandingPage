import * as THREE from 'three';
import { G, Part, curve, smoothstep, stations, type Curve, type MatKey, type V3 } from './kit';

export interface Axle {
  x: number;
  r: number; // wheel radius (centre height)
}

export interface BodyProfile {
  front: number; // x of nose
  rear: number; // x of tail
  W: [number, number][];
  B: [number, number][];
  M: [number, number][];
  T: [number, number][];
  F: [number, number][];
  nb: number;
  nt: number;
  fc: number; // fender bump lateral centre (0..1)
  fw: number; // fender bump lateral width
  axles: Axle[];
  archGap: number;
  archMask: [number, number];
  // greenhouse
  gh: { x0: number; x1: number; Wg: [number, number][]; Roof: [number, number][]; ng: number; tumble: number; beltDrop?: number };
}

export interface BodyShape {
  section(x: number, a: number): [number, number];
  ghSection(x: number, a: number): [number, number];
  /** top surface y at (x, |z|) */
  topY(x: number, z: number): number;
  /** half width at x and height y (approx) */
  sideZ(x: number, y: number): number;
  W: Curve;
  T: Curve;
  B: Curve;
  roof: Curve;
  belt: Curve;
  wg: Curve;
  xs(x0: number, x1: number, n: number): number[];
}

export function makeShape(p: BodyProfile): BodyShape {
  const W = curve(p.W);
  const B = curve(p.B);
  const M = curve(p.M);
  const T = curve(p.T);
  const F = curve(p.F);
  const Wg = curve(p.gh.Wg);
  const Roof = curve(p.gh.Roof);

  const archTop = (x: number) => {
    let best = -Infinity;
    for (const ax of p.axles) {
      const R = ax.r + p.archGap;
      const dx = x - ax.x;
      if (Math.abs(dx) <= R) best = Math.max(best, ax.r + Math.sqrt(R * R - dx * dx));
    }
    return best;
  };

  const section = (x: number, a: number): [number, number] => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const sg = c >= 0 ? 1 : -1;
    const ac = Math.abs(c);
    const as = Math.abs(s);
    const w = W(x);
    const b = B(x);
    const m = M(x);
    const t = T(x);
    let z: number;
    let y: number;
    if (s < 0) {
      const e = 2 / p.nb;
      z = w * Math.pow(ac, e);
      y = m - (m - b) * Math.pow(as, e);
    } else {
      const e = 2 / p.nt;
      z = w * Math.pow(ac, e);
      y = m + (t - m) * Math.pow(as, e);
      const u = z / w;
      y += F(x) * Math.exp(-Math.pow((u - p.fc) / p.fw, 2));
    }
    const at = archTop(x);
    if (at > -Infinity) {
      const u = z / w;
      const mask = smoothstep(p.archMask[0], p.archMask[1], u);
      const target = b + (at + (s >= 0 ? 0.04 : 0) - b) * mask;
      if (y < target) y = target;
    }
    return [y, z * sg];
  };

  const beltCache = new Map<number, number>();
  const Belt = (x: number) => {
    const k = Math.round(x * 2000);
    let v = beltCache.get(k);
    if (v === undefined) {
      v = topY(x, Wg(x)) - (p.gh.beltDrop ?? 0.012);
      beltCache.set(k, v);
    }
    return v;
  };

  const ghSection = (x: number, a: number): [number, number] => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const sg = c >= 0 ? 1 : -1;
    const e = 2 / p.gh.ng;
    const z = Wg(x) * Math.pow(Math.abs(c), e) * (1 - p.gh.tumble * Math.max(0, s));
    const y = Belt(x) + Math.max(0, Roof(x) - Belt(x)) * Math.pow(Math.max(0, s), e);
    return [y, z * sg];
  };

  function topY(x: number, zAbs: number) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * (Math.PI / 2);
      const [y, z] = section(x, a);
      const d = Math.abs(z - zAbs);
      if (d < bestD) {
        bestD = d;
        best = y;
      }
    }
    return best;
  }
  const sideZ = (x: number, yy: number) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i <= 80; i++) {
      const a = -Math.PI / 2 + (i / 80) * Math.PI;
      const [y, z] = section(x, a);
      const d = Math.abs(y - yy);
      if (d < bestD && z > 0.2) {
        bestD = d;
        best = z;
      }
    }
    return best;
  };

  const extra: number[] = [];
  for (const ax of p.axles) {
    const R = ax.r + p.archGap;
    extra.push(ax.x - R - 0.003, ax.x - R, ax.x + R, ax.x + R + 0.003);
  }
  const xs = (x0: number, x1: number, n: number) => stations(x0, x1, n, extra);

  return { section, ghSection, topY, sideZ, W, T, B, roof: Roof, belt: Belt, wg: Wg, xs };
}

export interface PanelSplit {
  frontSplit: number; // x where front clip meets doors
  rearSplit: number; // x where rear clip meets doors
  roofCap: [number, number]; // x range of painted roof
  explode: { front: V3; rear: V3; side: number; top: V3 };
  roofMat?: MatKey;
}

export function buildBodyPanels(lib: Record<MatKey, THREE.Material>, p: BodyProfile, shape: BodyShape, sp: PanelSplit) {
  const H = Math.PI / 2;
  const STEPS = 72;
  const mk = (name: string, origin: V3, off: V3) => new Part(lib, 'body', name, origin, off);
  const front = mk('front-clip', [(sp.frontSplit + p.front) / 2, 0.5, 0], sp.explode.front);
  const rear = mk('rear-clip', [(sp.rearSplit + p.rear) / 2, 0.55, 0], sp.explode.rear);
  const left = mk('door-left', [(sp.frontSplit + sp.rearSplit) / 2, 0.5, -0.7], [0, 0.05, -sp.explode.side]);
  const right = mk('door-right', [(sp.frontSplit + sp.rearSplit) / 2, 0.5, 0.7], [0, 0.05, sp.explode.side]);
  const top = mk('greenhouse', [(p.gh.x0 + p.gh.x1) / 2, 1.05, 0], sp.explode.top);

  front.add(G.loft(shape.xs(sp.frontSplit, p.front, 70), shape.section, -H, 3 * H, STEPS * 2, { end: true }), 'paint');
  rear.add(G.loft(shape.xs(p.rear, sp.rearSplit, 70), shape.section, -H, 3 * H, STEPS * 2, { start: true }), 'paint');
  right.add(G.loft(shape.xs(sp.rearSplit, sp.frontSplit, 60), shape.section, -H, H, STEPS), 'paint');
  left.add(G.loft(shape.xs(sp.rearSplit, sp.frontSplit, 60), shape.section, H, 3 * H, STEPS), 'paint');

  const ghx = shape.xs(p.gh.x1, p.gh.x0, 70);
  top.add(G.loft(ghx, shape.ghSection, 0, Math.PI, 56), 'glass');
  // painted roof cap
  const capSection = (x: number, a: number): [number, number] => {
    const [y, z] = shape.ghSection(x, a);
    return [y + 0.004, z * 1.004];
  };
  const [c0, c1] = sp.roofCap;
  top.add(G.loft(shape.xs(c0, c1, 40), capSection, H - 0.95, H + 0.95, 30), sp.roofMat ?? 'paint');
  // A pillars + C pillars as painted strips
  for (const [a0, a1] of [
    [0.2, 0.62],
    [Math.PI - 0.62, Math.PI - 0.2],
  ]) {
    top.add(G.loft(shape.xs(c1, p.gh.x0 - 0.02, 24), capSection, a0, a1, 6), sp.roofMat ?? 'paint');
    top.add(G.loft(shape.xs(p.gh.x1 + 0.02, c0, 24), capSection, a0, a1, 6), sp.roofMat ?? 'paint');
  }
  // window frame line along the belt
  for (const s of [-1, 1]) {
    const pts: V3[] = [];
    for (let i = 0; i <= 24; i++) {
      const x = p.gh.x1 + 0.05 + ((p.gh.x0 - p.gh.x1 - 0.1) * i) / 24;
      const [y, z] = shape.ghSection(x, s > 0 ? 0.02 : Math.PI - 0.02);
      pts.push([x, y + 0.006, z * 1.01]);
    }
    top.add(G.tube(pts, 0.008, false, 48, 6), 'black');
  }
  return { front, rear, left, right, top };
}
