import * as THREE from 'three';
import { G, Part, type MatKey, type V3 } from './kit';

type Lib = Record<MatKey, THREE.Material>;

const Y = new THREE.Vector3(0, 1, 0);
const v3 = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];

// ------------------------------------------------------------------ wheel ---

export interface WheelOpts {
  x: number;
  z: number; // centre of tyre in z (signed)
  r: number; // tyre outer radius
  rim: number; // rim radius
  width: number;
  spokes: number;
  style: 'split' | 'turbine';
  disc: number; // brake disc radius
  caliperArc: [number, number]; // degrees, around axle, 0 = forward (+x), 90 = up
}

export function buildWheel(p: Part, o: WheelOpts) {
  const side = Math.sign(o.z);
  const cy = o.r;
  const spin = p.sub([o.x, cy, o.z]);
  const w = o.width;
  const h = w / 2;
  const W = (dz: number) => o.z + side * dz; // offset toward outside
  // tyre (lathe around Z)
  const r = o.r;
  const ri = o.rim + 0.012;
  const tyre = G.lathe(
    [
      [ri, -h + 0.01],
      [r - 0.035, -h],
      [r - 0.01, -h + 0.014],
      [r, -h + 0.045],
      [r, h - 0.045],
      [r - 0.01, h - 0.014],
      [r - 0.035, h],
      [ri, h - 0.01],
    ],
    'z',
    64,
  );
  p.add(tyre, 'rubber', { p: [o.x, cy, o.z] }, spin);
  // tread grooves
  for (const dz of [-0.28, 0, 0.28]) {
    p.add(G.torus(r - 0.002, 0.0045, 'z', Math.PI * 2, 64, 4), 'black', { p: [o.x, cy, W(dz * w)] }, spin);
  }
  // rim barrel + lip
  p.add(G.cyl(o.rim, o.rim, w - 0.03, 'z', 48, true), 'dark', { p: [o.x, cy, o.z] }, spin);
  p.add(G.ring(o.rim + 0.012, o.rim - 0.012, 0.016, 'z', 48), 'alu', { p: [o.x, cy, W(h - 0.018)] }, spin);
  // spokes on outer face
  const face = W(h - 0.03);
  const hubR = 0.075;
  for (let i = 0; i < o.spokes; i++) {
    const a = (i / o.spokes) * Math.PI * 2;
    if (o.style === 'split') {
      for (const da of [-0.07, 0.07]) {
        const aa = a + da;
        const a1 = a + da * 0.35;
        p.add(
          G.rod(
            [o.x + Math.cos(a1) * hubR, cy + Math.sin(a1) * hubR, face],
            [o.x + Math.cos(aa) * (o.rim - 0.01), cy + Math.sin(aa) * (o.rim - 0.01), face - side * 0.012],
            0.011,
            6,
          ),
          'dark',
          undefined,
          spin,
        );
      }
    } else {
      const pts: V3[] = [];
      for (let k = 0; k <= 4; k++) {
        const t = k / 4;
        const rr = hubR + (o.rim - 0.012 - hubR) * t;
        const aa = a + t * 0.45;
        pts.push([o.x + Math.cos(aa) * rr, cy + Math.sin(aa) * rr, face - side * 0.02 * t]);
      }
      p.add(G.tube(pts, 0.008, false, 12, 6), 'alu', undefined, spin);
    }
  }
  p.add(G.cyl(hubR + 0.01, hubR + 0.01, 0.05, 'z', 24), 'alu', { p: [o.x, cy, W(h - 0.045)] }, spin);
  // centre lock nut
  p.add(G.cyl(0.04, 0.04, 0.03, 'z', 6), 'accent', { p: [o.x, cy, W(h - 0.01)] }, spin);
  // brake disc + hat
  const dz = W(h - 0.12);
  p.add(G.ring(o.disc, o.disc * 0.55, 0.034, 'z', 48), 'steel', { p: [o.x, cy, dz] }, spin);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    p.add(
      G.box(0.004, 0.035, 0.036),
      'dark',
      { p: [o.x + Math.cos(a) * o.disc * 0.8, cy + Math.sin(a) * o.disc * 0.8, dz], r: [0, 0, a + 0.4] },
      spin,
    );
  }
  p.add(G.cyl(o.disc * 0.56, o.disc * 0.56, 0.05, 'z', 32), 'alu', { p: [o.x, cy, W(h - 0.09)] }, spin);
  // caliper (static)
  const [d0, d1] = o.caliperArc.map((d) => (d * Math.PI) / 180);
  const R1 = o.disc + 0.022;
  const R0 = o.disc - 0.06;
  const pts: [number, number][] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = d0 + ((d1 - d0) * i) / n;
    pts.push([Math.cos(a) * R1, Math.sin(a) * R1]);
  }
  for (let i = n; i >= 0; i--) {
    const a = d0 + ((d1 - d0) * i) / n;
    pts.push([Math.cos(a) * R0, Math.sin(a) * R0]);
  }
  p.add(G.extrude(pts, 0.085, 0.008), 'caliper', { p: [o.x, cy, dz] });
  return { spin, radius: o.r, cy };
}

// ------------------------------------------------------------- suspension ---

export interface CornerOpts {
  x: number;
  side: 1 | -1;
  wheelZ: number; // abs
  cy: number;
  inner: number; // abs z of inner pickup points
  multilink?: boolean;
  springMat?: MatKey;
}

export function buildCorner(p: Part, o: CornerOpts) {
  const s = o.side;
  const zo = s * (o.wheelZ - 0.12);
  const zi = s * o.inner;
  const lowBJ: V3 = [o.x, o.cy - 0.15, zo];
  const upBJ: V3 = [o.x, o.cy + 0.16, s * (o.wheelZ - 0.14)];
  const arm = 0.014;
  // lower wishbone
  p.add(G.rod([o.x + 0.2, o.cy - 0.19, zi], lowBJ, arm, 8), 'dark');
  p.add(G.rod([o.x - 0.2, o.cy - 0.19, zi], lowBJ, arm, 8), 'dark');
  // upper wishbone
  p.add(G.rod([o.x + 0.15, o.cy + 0.13, s * (o.inner + 0.06)], upBJ, arm * 0.85, 8), 'dark');
  p.add(G.rod([o.x - 0.15, o.cy + 0.13, s * (o.inner + 0.06)], upBJ, arm * 0.85, 8), 'dark');
  if (o.multilink) {
    p.add(G.rod([o.x - 0.32, o.cy - 0.07, zi], [o.x - 0.07, o.cy - 0.06, zo], 0.009, 6), 'steel');
    p.add(G.rod([o.x + 0.25, o.cy + 0.0, zi], [o.x + 0.08, o.cy - 0.02, zo], 0.009, 6), 'steel');
  }
  // pickup bushes
  for (const q of [
    [o.x + 0.2, o.cy - 0.19, zi],
    [o.x - 0.2, o.cy - 0.19, zi],
    [o.x + 0.15, o.cy + 0.13, s * (o.inner + 0.06)],
    [o.x - 0.15, o.cy + 0.13, s * (o.inner + 0.06)],
  ] as V3[])
    p.add(G.cyl(0.022, 0.022, 0.04, 'x', 12), 'black', { p: q });
  // ball joints
  p.add(G.sphere(0.022), 'steel', { p: lowBJ });
  p.add(G.sphere(0.02), 'steel', { p: upBJ });
  // upright + hub
  p.add(G.rod(lowBJ, upBJ, 0.028, 8), 'alu');
  p.add(G.cyl(0.05, 0.05, 0.06, 'z', 20), 'alu', { p: [o.x, o.cy, s * (o.wheelZ - 0.14)] });
  // coilover
  const bot: V3 = [o.x - 0.02, o.cy - 0.12, s * (o.wheelZ - 0.24)];
  const top: V3 = [o.x - 0.02, o.cy + 0.36, s * (o.inner + 0.08)];
  p.add(G.rod(bot, top, 0.022, 12), 'chrome');
  const a = new THREE.Vector3(...bot);
  const b = new THREE.Vector3(...top);
  const sp0 = a.clone().lerp(b, 0.28);
  const sp1 = a.clone().lerp(b, 0.82);
  p.add(G.spring(v3(sp0), v3(sp1), 0.045, 0.007, 7), o.springMat ?? 'accent');
  p.add(G.rod(v3(a.clone().lerp(b, 0.25)), v3(a.clone().lerp(b, 0.28)), 0.055, 16), 'dark');
  p.add(G.rod(v3(a.clone().lerp(b, 0.82)), v3(a.clone().lerp(b, 0.85)), 0.055, 16), 'dark');
}

export function antiRollBar(p: Part, x: number, y: number, half: number) {
  p.add(G.tube([[x - 0.12, y + 0.02, -half], [x, y, -half + 0.12], [x, y, half - 0.12], [x - 0.12, y + 0.02, half]], 0.012, false, 30, 8), 'accent');
}

// ----------------------------------------------------------------- engine ---

export interface EngineOpts {
  center: V3; // crank axis centre
  perBank: number;
  spacing: number;
  bankAngles: [number, number]; // radians, measured in YZ plane from +Y toward +Z
  stagger: number;
  bore: number;
  r: number; // crank throw
  L: number; // rod length
  block: [number, number, number]; // crankcase size (x, y, z)
  firing: number[]; // cylinder ids in firing order (0..perBank-1 = bank A)
  intake: 'boxer' | 'v';
  head: { h: number; w: number };
  camMat: MatKey;
  blockMat?: MatKey;
  explode: { bank: number; intake: V3; front: V3 };
}

export interface EngineRig {
  parts: Part[];
  ports: { pos: THREE.Vector3; dir: THREE.Vector3; bank: number; i: number }[];
  update(crankDeg: number): void;
  cylinders: number;
  length: number;
  /** combustion intensity per cylinder in firing order (0..1) */
  levels: Float32Array;
}

export function buildEngine(lib: Lib, o: EngineOpts): EngineRig {
  const [cx, cy, cz] = o.center;
  const n = o.perBank;
  const N = n * 2;
  const len = (n - 1) * o.spacing + o.stagger + o.bore * 1.4;
  const pistonH = o.bore * 0.62;
  const deck = o.r + o.L + pistonH * 0.5 + 0.012; // crank axis to top of liner
  const linerLen = 2 * o.r + pistonH + 0.03;
  const axes = o.bankAngles.map((a) => new THREE.Vector3(0, Math.cos(a), Math.sin(a)));

  const crankcase = new Part(lib, 'engine', 'crankcase', [cx, cy, cz]);
  const banks = [0, 1].map(
    (b) =>
      new Part(
        lib,
        'engine',
        `bank${b}`,
        v3(new THREE.Vector3(cx, cy, cz).addScaledVector(axes[b], deck)),
        v3(axes[b].clone().multiplyScalar(o.explode.bank)),
      ),
  );
  const intake = new Part(lib, 'engine', 'intake', [cx, cy + 0.2, cz], o.explode.intake);
  const front = new Part(lib, 'engine', 'ancillaries', [cx - len / 2, cy, cz], o.explode.front);

  // crankcase block
  const [bx, by, bz] = o.block;
  crankcase.add(G.box(bx, by, bz, 0.03), o.blockMat ?? 'block', { p: [cx, cy, cz] });
  crankcase.add(G.box(bx * 0.92, 0.06, bz * 0.85, 0.02), 'dark', { p: [cx, cy - by / 2 - 0.02, cz] }); // sump
  // ribs
  for (let i = 0; i < n + 1; i++) {
    const x = cx - ((n - 1) * o.spacing) / 2 - o.spacing / 2 + i * o.spacing + o.stagger / 2;
    crankcase.add(G.box(0.012, by * 1.02, bz * 1.03), 'block', { p: [x, cy, cz] });
  }
  // crankshaft spinner
  const crank = crankcase.sub([cx, cy, cz]);
  crankcase.add(G.cyl(0.022, 0.022, len + 0.12, 'x', 16), 'steel', { p: [cx, cy, cz] }, crank);

  const cylX = (b: number, k: number) => cx - ((n - 1) * o.spacing) / 2 + k * o.spacing + (b === 1 ? o.stagger : 0) - o.stagger / 2;
  const fireOf = new Map<number, number>();
  o.firing.forEach((cyl, i) => fireOf.set(cyl, (720 / N) * i));

  type Cyl = {
    b: number;
    x: number;
    alpha: number;
    f: number;
    piston: THREE.Mesh;
    rod: THREE.Mesh;
    glow: THREE.Mesh;
    glowMat: THREE.MeshBasicMaterial;
  };
  const cyls: Cyl[] = [];
  const ports: EngineRig['ports'] = [];

  const pistonGeoBase = G.cyl(o.bore * 0.48, o.bore * 0.48, pistonH, 'y', 20);
  const rodGeo = G.box(0.018, 1, 0.028);
  rodGeo.translate(0, 0.5, 0);

  for (let b = 0; b < 2; b++) {
    const a = axes[b];
    const alpha = o.bankAngles[b];
    const bank = banks[b];
    const xs = Array.from({ length: n }, (_, k) => cylX(b, k));
    const bankLen = (n - 1) * o.spacing + o.bore * 1.35;
    const bankMid = (xs[0] + xs[n - 1]) / 2;
    const at = (d: number, x: number) => new THREE.Vector3(x, cy, cz).addScaledVector(a, d);
    // deck plate between liners and head (the barrels themselves are glass)
    bank.add(G.box(bankLen, 0.012, o.head.w * 0.9, 0.004), o.blockMat ?? 'block', { p: v3(at(deck + 0.006, bankMid)), r: [alpha, 0, 0] });
    bank.add(G.box(bankLen, 0.012, o.head.w * 0.9, 0.004), o.blockMat ?? 'block', { p: v3(at(deck - linerLen + 0.01, bankMid)), r: [alpha, 0, 0] });
    // head
    const headC = at(deck + o.head.h / 2, bankMid);
    bank.add(G.box(bankLen, o.head.h, o.head.w, 0.02), o.blockMat ?? 'block', { p: v3(headC), r: [alpha, 0, 0] });
    // cam covers
    for (const side of [-1, 1]) {
      const perp = new THREE.Vector3(0, -a.z, a.y).multiplyScalar(side * o.head.w * 0.24);
      const camC = at(deck + o.head.h + 0.02, bankMid).add(perp);
      bank.add(G.box(bankLen * 0.96, 0.04, o.head.w * 0.42, 0.015), o.camMat, { p: v3(camC), r: [alpha, 0, 0] });
    }
    for (let k = 0; k < n; k++) {
      const x = xs[k];
      const id = b * n + k;
      // glass liner
      const lc = at(deck - linerLen / 2, x);
      bank.add(G.cyl(o.bore / 2, o.bore / 2, linerLen, 'y', 22, true), 'liner', { p: v3(lc), r: [alpha, 0, 0] });
      // spark plug
      const sp = at(deck + o.head.h + 0.035, x);
      bank.add(G.cyl(0.008, 0.008, 0.05, 'y', 8), 'black', { p: v3(sp), r: [alpha, 0, 0] });
      // piston (dynamic)
      const piston = bank.mesh(pistonGeoBase.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, a)), 'piston');
      // glow
      const glowMat = (lib.glow as THREE.MeshBasicMaterial).clone();
      glowMat.opacity = 0;
      const glow = new THREE.Mesh(new THREE.SphereGeometry(o.bore * 0.46, 16, 10), glowMat);
      glow.scale.set(1, 1, 1);
      glow.position.copy(bank.local(v3(at(deck - pistonH * 0.25, x))));
      bank.root.add(glow);
      // connecting rod (lives in crankcase part)
      const rod = crankcase.mesh(rodGeo.clone(), 'steel');
      cyls.push({ b, x, alpha, f: fireOf.get(id) ?? 0, piston, rod, glow, glowMat });
      // crank pin + web on the crank spinner
      const pinA = alpha - ((fireOf.get(id) ?? 0) * Math.PI) / 180;
      const pin: V3 = [x, cy + Math.cos(pinA) * o.r, cz + Math.sin(pinA) * o.r];
      crankcase.add(G.cyl(0.016, 0.016, 0.03, 'x', 12), 'steel', { p: pin }, crank);
      crankcase.add(G.box(0.012, o.r * 2.4, o.r * 1.4, 0.004), 'dark', {
        p: [x - 0.018, cy + Math.cos(pinA) * o.r * 0.4, cz + Math.sin(pinA) * o.r * 0.4],
        r: [pinA, 0, 0],
      }, crank);
      // exhaust port
      const portDir = o.intake === 'boxer' ? new THREE.Vector3(0, -1, 0) : a.clone().add(new THREE.Vector3(0, -0.3, Math.sign(a.z) * 0.6)).normalize();
      const portPos =
        o.intake === 'boxer'
          ? at(deck + o.head.h * 0.45, x).add(new THREE.Vector3(0, -o.head.w * 0.5, 0))
          : at(deck + o.head.h * 0.4, x).add(new THREE.Vector3(0, -a.z * o.head.w * 0.5, a.y * o.head.w * 0.5).multiplyScalar(Math.sign(a.z)));
      ports.push({ pos: portPos, dir: portDir, bank: b, i: k });
    }
  }

  // intake
  const allX = cyls.map((c) => c.x);
  const xMin = Math.min(...allX);
  const xMax = Math.max(...allX);
  if (o.intake === 'boxer') {
    const py = cy + 0.25;
    intake.add(G.box(xMax - xMin + 0.16, 0.08, 0.2, 0.035), 'carbon', { p: [cx, py, cz] });
    intake.add(G.cyl(0.05, 0.06, 0.12, 'x', 20), 'alu', { p: [xMax + 0.12, py, cz] }); // throttle inlet
    for (const c of cyls) {
      const s = Math.sign(Math.sin(c.alpha));
      const head = deck + o.head.h * 0.6;
      const tgt: V3 = [c.x, cy + o.head.w * 0.42, cz + s * head];
      intake.add(G.tube([[c.x, py - 0.02, cz + s * 0.07], [c.x, py - 0.03, cz + s * 0.17], [c.x, cy + 0.12, cz + s * (head - 0.03)], tgt], 0.021, false, 24, 10), 'alu');
      intake.add(G.cyl(0.028, 0.028, 0.04, 'z', 14), 'dark', { p: [c.x, py - 0.03, cz + s * 0.13] });
    }
  } else {
    const py = cy + deck * Math.cos(o.bankAngles[1]) + 0.12;
    intake.add(G.box(xMax - xMin + 0.18, 0.1, 0.16, 0.04), 'carbon', { p: [cx, py, cz] });
    intake.add(G.cyl(0.07, 0.08, 0.14, 'x', 20), 'alu', { p: [xMax + 0.14, py, cz] });
    for (const c of cyls) {
      const a = axes[c.b];
      const head = new THREE.Vector3(c.x, cy, cz).addScaledVector(a, deck + o.head.h * 0.5);
      const inward = new THREE.Vector3(0, a.z, -a.y).multiplyScalar(Math.sign(a.z) * o.head.w * 0.5);
      const tgt = head.clone().add(inward);
      intake.add(G.tube([[c.x, py - 0.04, cz + Math.sign(a.z) * 0.04], [c.x, (py + tgt.y) / 2 + 0.02, cz + Math.sign(a.z) * 0.06], v3(tgt)], 0.017, false, 16, 8), 'alu');
    }
  }

  // ancillaries at the front end of the engine (pulleys + belt)
  const fx = xMin - o.bore * 0.9 - o.stagger;
  front.add(G.cyl(0.09, 0.09, 0.03, 'x', 32), 'dark', { p: [fx, cy, cz] });
  front.add(G.cyl(0.05, 0.05, 0.03, 'x', 24), 'alu', { p: [fx, cy + 0.2, cz + 0.12] });
  front.add(G.cyl(0.045, 0.045, 0.03, 'x', 24), 'alu', { p: [fx, cy + 0.17, cz - 0.14] });
  front.add(G.cyl(0.07, 0.07, 0.12, 'x', 24), 'steel', { p: [fx + 0.06, cy + 0.2, cz + 0.12] }); // alternator
  front.add(G.tube([[fx, cy - 0.09, cz], [fx, cy + 0.05, cz + 0.17], [fx, cy + 0.25, cz + 0.12], [fx, cy + 0.21, cz - 0.17], [fx, cy + 0.02, cz - 0.1]], 0.008, true, 60, 6), 'black');

  for (const p of [crankcase, ...banks, intake, front]) p.finalize();

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const q = new THREE.Quaternion();

  const levels = new Float32Array(N);
  const order = [...cyls].sort((a, b) => a.f - b.f);
  function update(crankDeg: number) {
    crank.rotation.x = (crankDeg * Math.PI) / 180;
    for (const c of cyls) {
      const phi = ((crankDeg - c.f) * Math.PI) / 180;
      const a = axes[c.b];
      const s = Math.sin(phi);
      const d = o.r * Math.cos(phi) + Math.sqrt(o.L * o.L - o.r * o.r * s * s);
      // piston world
      tmpA.set(c.x, cy, cz).addScaledVector(a, d + pistonH * 0.25);
      c.piston.position.copy(tmpA).sub(banks[c.b].home);
      // pin in car space (pin rotates with crank around x)
      const th = c.alpha + phi;
      tmpB.set(c.x, cy + Math.cos(th) * o.r, cz + Math.sin(th) * o.r);
      // account for explode offsets of parts (their root positions)
      const pinCar = tmpB.clone().sub(crankcase.home).add(crankcase.root.position);
      const pistonPin = tmpA.clone().sub(banks[c.b].home).add(banks[c.b].root.position).addScaledVector(a, -pistonH * 0.25);
      dir.copy(pistonPin).sub(pinCar);
      const L = dir.length();
      c.rod.position.copy(pinCar).sub(crankcase.root.position);
      c.rod.quaternion.copy(q.setFromUnitVectors(Y, dir.normalize()));
      c.rod.scale.set(1, L, 1);
      // combustion glow (power stroke)
      const cyc = (((crankDeg - c.f) % 720) + 720) % 720;
      const g = cyc < 130 ? Math.pow(1 - cyc / 130, 1.4) : 0;
      c.glowMat.opacity = g * 0.95 * banks[c.b].fade;
      c.glow.visible = g > 0.01 && banks[c.b].fade > 0.05;
      c.glow.scale.setScalar(0.7 + g * 0.5);
      levels[order.indexOf(c)] = g;
    }
  }
  update(0);

  return { parts: [crankcase, ...banks, intake, front], ports, update, cylinders: N, length: len, levels };
}

// ---------------------------------------------------------------- gearbox ---

export interface GearboxOpts {
  x0: number; // engine side (front of gearbox)
  x1: number;
  y: number;
  gears: number;
  axleX: number;
  axleY: number;
  wheelZ: number;
  explode: V3;
}

export function buildGearbox(lib: Lib, o: GearboxOpts) {
  const mid = (o.x0 + o.x1) / 2;
  const len = Math.abs(o.x1 - o.x0);
  const dirX = Math.sign(o.x1 - o.x0);
  const box = new Part(lib, 'transmission', 'gearbox', [mid, o.y, 0], o.explode);
  const shafts = new Part(lib, 'transmission', 'driveshafts', [o.axleX, o.axleY, 0], [0, -0.1, 0]);
  const yIn = o.y + 0.065;
  const yOut = o.y - 0.065;
  const inSpin = box.sub([mid, yIn, 0]);
  const outSpin = box.sub([mid, yOut, 0]);
  // casing: glass with alu end plates
  box.add(G.box(len, 0.3, 0.26, 0.06), 'liner', { p: [mid, o.y, 0] });
  box.add(G.box(0.02, 0.32, 0.28, 0.01), 'alu', { p: [o.x0, o.y, 0] });
  box.add(G.box(0.02, 0.32, 0.28, 0.01), 'alu', { p: [o.x1, o.y, 0] });
  // clutch drums at engine side
  box.add(G.cyl(0.13, 0.13, 0.08, 'x', 32), 'alu', { p: [o.x0 - dirX * 0.05, yIn, 0] });
  box.add(G.cyl(0.1, 0.1, 0.05, 'x', 32), 'copper', { p: [o.x0 - dirX * 0.11, yIn, 0] });
  // shafts
  box.add(G.cyl(0.012, 0.012, len, 'x', 10), 'steel', { p: [mid, yIn, 0] }, inSpin);
  box.add(G.cyl(0.015, 0.015, len, 'x', 10), 'steel', { p: [mid, yOut, 0] }, outSpin);
  const ratios: number[] = [];
  const C = 0.13;
  for (let i = 0; i < o.gears; i++) {
    const t = i / Math.max(1, o.gears - 1);
    const rIn = 0.03 + t * 0.035;
    const rOut = C - rIn;
    ratios.push(rOut / rIn);
    const x = o.x0 + dirX * (0.04 + (len - 0.08) * ((i + 0.5) / o.gears));
    const th = Math.min(0.022, (len - 0.1) / o.gears - 0.006);
    box.add(G.gear(Math.round(rIn * 330), rIn, th, 'x'), 'brass', { p: [x, yIn, 0] }, inSpin);
    box.add(G.gear(Math.round(rOut * 330), rOut, th, 'x'), 'steel', { p: [x, yOut, 0] }, outSpin);
  }
  // differential
  box.add(G.cyl(0.11, 0.11, 0.16, 'z', 28), 'alu', { p: [o.axleX, o.axleY, 0] });
  box.add(G.gear(40, 0.12, 0.02, 'z'), 'brass', { p: [o.axleX, o.axleY, 0.09] });
  // drive shafts with CV joints
  for (const s of [-1, 1]) {
    const a: V3 = [o.axleX, o.axleY, s * 0.12];
    const b: V3 = [o.axleX, o.axleY, s * (o.wheelZ - 0.16)];
    shafts.add(G.rod(a, b, 0.018, 10), 'steel');
    shafts.add(G.cyl(0.045, 0.03, 0.09, 'z', 16), 'rubber', { p: [o.axleX, o.axleY, s * 0.17], r: [0, 0, 0], s: [1, 1, 1] });
    shafts.add(G.cyl(0.03, 0.045, 0.09, 'z', 16), 'rubber', { p: [o.axleX, o.axleY, s * (o.wheelZ - 0.2)] });
  }
  box.finalize();
  shafts.finalize();
  return { parts: [box, shafts], inSpin, outSpin, ratios };
}

// ------------------------------------------------------------------ misc. ---

export function buildSeat(p: Part, x: number, y: number, z: number, harness = true) {
  p.add(G.box(0.46, 0.08, 0.46, 0.035), 'seat', { p: [x, y + 0.05, z] });
  p.add(G.box(0.08, 0.68, 0.48, 0.035), 'carbon', { p: [x - 0.27, y + 0.38, z], r: [0, 0, -0.22] });
  for (const s of [-1, 1]) {
    p.add(G.box(0.4, 0.1, 0.06, 0.025), 'seat', { p: [x - 0.02, y + 0.12, z + s * 0.22] });
    p.add(G.box(0.1, 0.5, 0.07, 0.03), 'carbon', { p: [x - 0.22, y + 0.38, z + s * 0.24], r: [0, 0, -0.22] });
  }
  p.add(G.box(0.07, 0.42, 0.34, 0.03), 'seat', { p: [x - 0.215, y + 0.36, z], r: [0, 0, -0.22] });
  if (harness) {
    for (const s of [-1, 1]) {
      p.add(G.tube([[x - 0.29, y + 0.66, z + s * 0.08], [x - 0.15, y + 0.48, z + s * 0.09], [x - 0.02, y + 0.24, z + s * 0.07], [x + 0.08, y + 0.1, z + s * 0.02]], 0.012, false, 16, 4), 'accent');
      p.add(G.tube([[x - 0.05, y + 0.1, z + s * 0.22], [x + 0.02, y + 0.2, z + s * 0.12], [x + 0.08, y + 0.12, z]], 0.01, false, 12, 4), 'accent');
    }
    p.add(G.cyl(0.035, 0.035, 0.015, 'y', 16), 'alu', { p: [x + 0.08, y + 0.13, z] });
  }
}

export function buildSteering(p: Part, from: V3, to: V3, R: number, flat = false) {
  p.add(G.rod(from, to, 0.02, 10), 'steel');
  const dir = new THREE.Vector3(...to).sub(new THREE.Vector3(...from)).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  const rim = G.torus(R, 0.017, 'z', Math.PI * 2, 48, 10);
  if (flat) rim.scale(1, 0.92, 1);
  rim.applyQuaternion(q).translate(...to);
  p.add(rim, 'seat');
  for (const ang of [0, Math.PI, -Math.PI / 2]) {
    const a = new THREE.Vector3(Math.cos(ang) * R, Math.sin(ang) * R, 0).applyQuaternion(q).add(new THREE.Vector3(...to));
    p.add(G.rod(to, v3(a), 0.012, 6), 'dark');
  }
  p.add(G.cyl(0.055, 0.055, 0.04, 'z', 20).applyQuaternion(q).translate(...to), 'dark');
  // top marker
  const m = new THREE.Vector3(0, R, 0).applyQuaternion(q).add(new THREE.Vector3(...to));
  p.add(G.sphere(0.015, [1, 1, 1], 8), 'accent', { p: v3(m) });
}

export function buildRadiator(p: Part, c: V3, w: number, h: number, tiltZ: number, tiltX = 0) {
  const rot: V3 = [tiltX, 0, tiltZ];
  p.add(G.box(0.045, h, w), 'radiator', { p: c, r: rot });
  // frame
  const grp = new THREE.Group();
  void grp;
  for (const s of [-1, 1]) {
    const off = new THREE.Vector3(0, 0, s * (w / 2 + 0.02)).applyEuler(new THREE.Euler(...rot));
    p.add(G.box(0.06, h + 0.04, 0.04, 0.01), 'alu', { p: [c[0] + off.x, c[1] + off.y, c[2] + off.z], r: rot });
  }
}

export function buildMotor(p: Part, c: V3, r: number, len: number, axis: 'x' | 'z') {
  const spin = p.sub(c);
  p.add(G.cyl(r, r, len, axis, 32, true), 'alu', { p: c });
  p.add(G.ring(r + 0.008, r - 0.02, 0.025, axis, 32), 'hv', { p: c });
  // stator windings visible behind glass caps
  p.add(G.torus(r * 0.7, r * 0.18, axis, Math.PI * 2, 32, 8), 'copper', { p: c });
  for (const s of [-1, 1]) {
    const off: V3 = axis === 'x' ? [s * len / 2, 0, 0] : [0, 0, s * len / 2];
    p.add(G.cyl(r, r, 0.01, axis, 32), 'liner', { p: [c[0] + off[0], c[1] + off[1], c[2] + off[2]] });
  }
  // rotor
  p.add(G.cyl(r * 0.45, r * 0.45, len * 0.9, axis, 16), 'steel', { p: c }, spin);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const off: V3 = axis === 'x' ? [0, Math.cos(a) * r * 0.47, Math.sin(a) * r * 0.47] : [Math.cos(a) * r * 0.47, Math.sin(a) * r * 0.47, 0];
    p.add(G.box(axis === 'x' ? len * 0.85 : 0.02, axis === 'x' ? 0.02 : 0.02, axis === 'x' ? 0.02 : len * 0.85), 'dark', { p: [c[0] + off[0], c[1] + off[1], c[2] + off[2]], r: axis === 'x' ? [a, 0, 0] : [0, 0, a] }, spin);
  }
  return spin;
}

export function pipe(p: Part, pts: V3[], r: number, mat: MatKey = 'steel', seg = 40) {
  p.add(G.tube(pts, r, false, seg, 10), mat);
}
