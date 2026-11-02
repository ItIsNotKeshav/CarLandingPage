import * as THREE from 'three';
import { G, Part, type MatKey, type V3 } from './kit';
import { buildBodyPanels, makeShape, type BodyProfile } from './body';
import { antiRollBar, buildCorner, buildEngine, buildGearbox, buildMotor, buildRadiator, buildSeat, buildSteering, buildWheel, pipe } from './components';
import { assemble, type CarModel } from './model';

type Lib = Record<MatKey, THREE.Material>;

const FX = 1.3655;
const RX = -1.3655;
const FR = 0.354;
const RR = 0.37;
const FZ = 0.85;
const RZ = 0.84;

const profile: BodyProfile = {
  front: 2.37,
  rear: -2.3,
  W: [[-2.3, 0.84], [-2.15, 0.96], [-1.8, 1.015], [-1.37, 1.024], [-0.9, 0.99], [-0.5, 0.92], [0, 0.89], [0.5, 0.9], [0.9, 0.95], [1.37, 1.0], [1.85, 0.96], [2.2, 0.84], [2.37, 0.6]],
  B: [[-2.3, 0.42], [-2.0, 0.28], [-1.75, 0.14], [-1.45, 0.1], [1.9, 0.1], [2.25, 0.14], [2.37, 0.2]],
  M: [[-2.3, 0.62], [-1.8, 0.55], [-1.0, 0.48], [0, 0.45], [1.0, 0.43], [1.9, 0.4], [2.37, 0.36]],
  T: [[-2.3, 0.82], [-2.2, 0.9], [-1.9, 0.93], [-1.4, 0.92], [-0.9, 0.88], [-0.4, 0.84], [0.2, 0.8], [0.8, 0.76], [1.4, 0.68], [1.9, 0.6], [2.2, 0.54], [2.37, 0.42]],
  F: [[-2.3, 0], [-1.9, 0.04], [-1.4, 0.11], [-0.8, 0.02], [0.4, 0], [0.9, 0.07], [1.4, 0.14], [1.9, 0.08], [2.37, 0]],
  nb: 7,
  nt: 2.4,
  fc: 0.8,
  fw: 0.18,
  axles: [
    { x: FX, r: FR },
    { x: RX, r: RR },
  ],
  archGap: 0.04,
  archMask: [0.55, 0.7],
  gh: {
    x0: 1.02,
    x1: -1.5,
    Wg: [[-1.5, 0.38], [-0.9, 0.55], [-0.2, 0.63], [0.5, 0.63], [1.02, 0.6]],
    Roof: [[-1.5, 0.84], [-1.05, 1.03], [-0.5, 1.16], [-0.1, 1.189], [0.3, 1.16], [0.65, 1.03], [1.02, 0.74]],
    ng: 2.2,
    tumble: 0.22,
  },
};

export function buildTourbillon(lib: Lib): CarModel {
  const shape = makeShape(profile);
  const parts: Part[] = [];
  const P = (system: string, name: string, origin: V3, offset: V3 = [0, 0, 0]) => {
    const p = new Part(lib, system, name, origin, offset);
    parts.push(p);
    return p;
  };

  // ------------------------------------------------------------- body ----
  // sides use the darker second tone (Bugatti two-tone split)
  const body = buildBodyPanels(lib, profile, shape, {
    frontSplit: 0.86,
    rearSplit: -0.9,
    roofCap: [-0.95, 0.38],
    explode: { front: [1.15, 0.2, 0], rear: [-1.15, 0.2, 0], side: 1.1, top: [0, 0.8, 0] },
  });
  parts.push(body.front, body.rear, body.left, body.right, body.top);

  // horseshoe grille
  const hx = 2.355;
  const hs = new THREE.TorusGeometry(0.16, 0.02, 10, 48, (280 * Math.PI) / 180);
  hs.rotateZ((-50 * Math.PI) / 180);
  hs.rotateY(Math.PI / 2);
  body.front.add(hs, 'chrome', { p: [hx, 0.34, 0], s: [1, 1.05, 0.95] });
  body.front.add(G.cyl(0.15, 0.15, 0.03, 'x', 32), 'black', { p: [hx - 0.02, 0.34, 0], s: [1, 1.05, 0.95] });
  for (let i = -3; i <= 3; i++) body.front.add(G.box(0.01, 0.01, 0.26), 'chrome', { p: [hx - 0.003, 0.34 + i * 0.04, 0] });
  // side intakes in the nose
  for (const s of [-1, 1]) body.front.add(G.box(0.08, 0.16, 0.4, 0.04), 'black', { p: [2.27, 0.27, s * 0.52] });
  // headlights: slim light bars on the fender tops
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const x = 2.12 - k * 0.012;
      const z = s * (0.5 + k * 0.06);
      const y = shape.topY(x, Math.abs(z)) - 0.012;
      body.front.add(G.box(0.17, 0.018, 0.022, 0.006), 'headlight', { p: [x, y, z], r: [0, 0, -0.38] });
    }
  }
  // C-line on each flank (on the door panels)
  for (const s of [-1, 1]) {
    const door = s > 0 ? body.right : body.left;
    const cpts: [number, number][] = [
      [0.55, 0.72],
      [0.05, 0.77],
      [-0.42, 0.72],
      [-0.66, 0.56],
      [-0.66, 0.36],
      [-0.42, 0.22],
      [0.05, 0.2],
    ];
    const pts: V3[] = cpts.map(([x, y]) => [x, y, s * (shape.sideZ(x, y) + 0.012)]);
    door.add(G.tube(pts, 0.016, false, 80, 8), 'chrome');
    // dark intake inside the C
    door.add(G.sphere(0.2, [1.5, 0.9, 0.35], 24), 'black', { p: [-0.32, 0.46, s * (shape.sideZ(-0.32, 0.46) - 0.04)] });
    const my = shape.topY(0.72, 0.8);
    door.add(G.rod([0.72, my - 0.02, s * 0.8], [0.66, my + 0.07, s * 0.93], 0.011, 6), 'black');
    door.add(G.sphere(0.06, [1.1, 0.6, 1.3], 16), 'paint', { p: [0.64, my + 0.08, s * 0.95] });
  }
  // rear: full-width light + engine cover slats
  body.rear.add(G.box(0.02, 0.025, 1.55, 0.01), 'taillight', { p: [-2.298, 0.8, 0] });
  body.rear.add(G.box(0.02, 0.012, 1.3, 0.005), 'taillight', { p: [-2.29, 0.74, 0] });
  for (let i = 0; i < 7; i++) {
    const x = -1.6 - i * 0.07;
    body.rear.add(G.box(0.02, 0.012, 0.8), 'black', { p: [x, shape.topY(x, 0.2) + 0.004, 0] });
  }
  for (const p of Object.values(body)) p.finalize();
  // two-tone: door panels use the secondary paint
  for (const p of [body.left, body.right]) {
    for (const m of p.materials) {
      const ud = m.userData as any;
      if (ud.key === 'paint') ud.key = 'paint2';
    }
  }

  // --------------------------------------------------- monocoque ----
  const tub = P('chassis', 'monocoque', [0.05, 0.35, 0]);
  tub.add(G.box(1.95, 0.05, 1.5, 0.02), 'carbon', { p: [0.05, 0.12, 0] });
  for (const s of [-1, 1]) tub.add(G.box(1.9, 0.36, 0.2, 0.06), 'carbon', { p: [0.05, 0.3, s * 0.72] });
  tub.add(G.box(0.08, 0.5, 1.42, 0.03), 'carbon', { p: [1.0, 0.38, 0] });
  tub.add(G.box(0.42, 0.08, 1.42, 0.03), 'carbon', { p: [0.82, 0.66, 0] });
  tub.add(G.box(0.07, 0.72, 1.5, 0.03), 'carbon', { p: [-0.6, 0.48, 0] });
  // roll-over structure behind the seats
  tub.add(G.tube([[-0.6, 0.8, -0.6], [-0.58, 0.98, -0.38], [-0.57, 1.04, 0], [-0.58, 0.98, 0.38], [-0.6, 0.8, 0.6]], 0.028, false, 40, 8), 'carbon');
  tub.finalize();
  const sub = P('chassis', 'subframes', [0, 0.35, 0], [0, -0.02, 0]);
  for (const s of [-1, 1]) {
    // front crash structure
    sub.add(G.rod([1.02, 0.2, s * 0.3], [2.15, 0.2, s * 0.3], 0.03, 8), 'alu');
    sub.add(G.rod([1.02, 0.55, s * 0.4], [FX, 0.72, s * 0.58], 0.03, 8), 'alu');
    sub.add(G.cyl(0.07, 0.07, 0.03, 'y', 18), 'alu', { p: [FX, 0.74, s * 0.6] });
    // rear frame around the engine
    sub.add(G.rod([-0.62, 0.2, s * 0.42], [-2.1, 0.2, s * 0.42], 0.03, 8), 'alu');
    sub.add(G.rod([-0.62, 0.78, s * 0.55], [-1.6, 0.74, s * 0.55], 0.028, 8), 'alu');
    sub.add(G.rod([-1.6, 0.74, s * 0.55], [-2.15, 0.45, s * 0.45], 0.028, 8), 'alu');
    sub.add(G.rod([-1.1, 0.2, s * 0.42], [-1.1, 0.76, s * 0.55], 0.025, 8), 'alu');
    sub.add(G.cyl(0.07, 0.07, 0.03, 'y', 18), 'alu', { p: [RX, 0.76, s * 0.58] });
  }
  sub.add(G.rod([2.15, 0.2, -0.3], [2.15, 0.2, 0.3], 0.03, 8), 'alu');
  sub.add(G.rod([-2.1, 0.2, -0.42], [-2.1, 0.2, 0.42], 0.03, 8), 'alu');
  sub.finalize();

  // --------------------------------------------------------- V16 ----
  const engine = buildEngine(lib, {
    center: [-1.0, 0.36, 0],
    perBank: 8,
    spacing: 0.092,
    bankAngles: [Math.PI / 4, -Math.PI / 4],
    stagger: 0.03,
    bore: 0.088,
    r: 0.042,
    L: 0.14,
    block: [0.78, 0.22, 0.24],
    firing: [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15],
    intake: 'v',
    head: { h: 0.075, w: 0.17 },
    camMat: 'dark',
    explode: { bank: 0.22, intake: [0, 0.35, 0], front: [0.25, 0, 0] },
  });
  parts.push(...engine.parts);

  // ------------------------------------------------------ gearbox ----
  const gb = buildGearbox(lib, { x0: -1.44, x1: -1.98, y: 0.38, gears: 8, axleX: RX, axleY: RR, wheelZ: RZ, explode: [0, 0.18, 0] });
  parts.push(...gb.parts);

  // ------------------------------------------------- hybrid drive ----
  const motors: THREE.Object3D[] = [];
  const front = P('hybrid', 'front-e-axle', [FX, 0.36, 0], [0.3, 0.25, 0]);
  for (const s of [-1, 1]) {
    motors.push(buildMotor(front, [FX, 0.36, s * 0.2], 0.12, 0.2, 'z'));
    front.add(G.rod([FX, FR, s * 0.31], [FX, FR, s * (FZ - 0.16)], 0.018, 10), 'steel');
    front.add(G.cyl(0.04, 0.03, 0.08, 'z', 14), 'rubber', { p: [FX, FR, s * 0.36] });
  }
  front.add(G.box(0.28, 0.12, 0.46, 0.03), 'dark', { p: [1.72, 0.4, 0] });
  front.add(G.box(0.03, 0.04, 0.3), 'hv', { p: [1.58, 0.42, 0] });
  front.finalize();
  const rearM = P('hybrid', 'rear-e-motor', [-1.75, 0.66, 0], [-0.15, 0.4, 0]);
  motors.push(buildMotor(rearM, [-1.75, 0.66, 0], 0.11, 0.24, 'x'));
  rearM.finalize();
  const cables = P('hybrid', 'hv-cables', [0, 0.3, 0], [0, 0.05, 0]);
  for (const s of [-1, 1]) {
    pipe(cables, [[0.92, 0.3, s * 0.06], [1.15, 0.3, s * 0.12], [FX - 0.06, 0.36, s * 0.14]], 0.014, 'hv', 20);
    pipe(cables, [[-0.55, 0.22, s * 0.62], [-1.1, 0.24, s * 0.56], [-1.55, 0.5, s * 0.3], [-1.66, 0.66, s * 0.1]], 0.014, 'hv', 40);
  }
  cables.finalize();

  // ------------------------------------------------------ battery ----
  const batt = P('battery', 'battery-pack', [0.1, 0.35, 0], [0, 0.85, 0]);
  batt.add(G.box(1.5, 0.28, 0.27, 0.03), 'liner', { p: [0.17, 0.29, 0] });
  for (let i = 0; i < 6; i++) batt.add(G.box(0.22, 0.22, 0.22, 0.01), 'battery', { p: [-0.42 + 0.2 + i * 0.235, 0.29, 0] });
  batt.add(G.box(0.18, 0.5, 1.36, 0.03), 'liner', { p: [-0.49, 0.4, 0] });
  for (let i = 0; i < 5; i++) batt.add(G.box(0.14, 0.44, 0.24, 0.01), 'battery', { p: [-0.49, 0.4, -0.54 + i * 0.27] });
  batt.add(G.box(0.12, 0.08, 0.2, 0.02), 'hv', { p: [0.95, 0.3, 0] });
  batt.finalize();

  // ------------------------------------------------------ exhaust ----
  const ex = P('exhaust', 'exhaust', [-1.7, 0.4, 0]);
  for (const port of engine.ports) {
    const s = port.bank === 0 ? 1 : -1;
    const p0 = port.pos;
    pipe(ex, [[p0.x, p0.y, p0.z], [p0.x - 0.02, p0.y - 0.06, p0.z + s * 0.06], [p0.x - 0.12, 0.34, s * 0.4], [-1.55, 0.3, s * 0.36]], 0.013, 'steel', 24);
  }
  for (const s of [-1, 1]) {
    ex.add(G.cyl(0.07, 0.07, 0.3, 'x', 20), 'steel', { p: [-1.72, 0.3, s * 0.36] });
    pipe(ex, [[-1.87, 0.3, s * 0.36], [-2.02, 0.36, s * 0.32], [-2.1, 0.48, s * 0.2]], 0.035, 'steel', 24);
    pipe(ex, [[-2.18, 0.52, s * 0.08], [-2.26, 0.54, s * 0.08], [-2.335, 0.55, s * 0.08]], 0.05, 'titanium', 12);
  }
  ex.add(G.box(0.18, 0.2, 0.62, 0.06), 'steel', { p: [-2.14, 0.5, 0] });
  ex.finalize();

  // ------------------------------------------------------ cooling ----
  const sideRad = P('cooling', 'side-radiators', [-0.82, 0.42, 0], [0, 0.1, 0]);
  for (const s of [-1, 1]) {
    sideRad.add(G.box(0.48, 0.34, 0.045), 'radiator', { p: [-0.82, 0.42, s * 0.82], r: [s * 0.25, 0, 0] });
    sideRad.add(G.box(0.5, 0.04, 0.06, 0.01), 'alu', { p: [-0.82, 0.6, s * 0.79] });
    pipe(sideRad, [[-0.82, 0.3, s * 0.78], [-0.9, 0.24, s * 0.55], [-1.05, 0.26, s * 0.3]], 0.016, 'alu', 16);
  }
  sideRad.finalize();
  const frontRad = P('cooling', 'front-radiators', [2.0, 0.36, 0], [0.5, 0.2, 0]);
  for (const s of [-1, 1]) buildRadiator(frontRad, [2.02, 0.36, s * 0.48], 0.34, 0.26, 0.55);
  frontRad.finalize();

  // ---------------------------------------- wheels & suspension ----
  const wheels: CarModel['wheels'] = [];
  for (const [x, z, r, rim, w, disc, arc] of [
    [FX, FZ, FR, 0.254, 0.285, 0.205, [105, 155]],
    [RX, RZ, RR, 0.2667, 0.345, 0.195, [25, 75]],
  ] as [number, number, number, number, number, number, [number, number]][]) {
    for (const s of [-1, 1] as const) {
      const wp = P('wheels', `wheel${x > 0 ? 'F' : 'R'}${s > 0 ? 'R' : 'L'}`, [x, r, s * z], [0, 0, s * 0.8]);
      wheels.push(buildWheel(wp, { x, z: s * z, r, rim, width: w, spokes: 14, style: 'turbine', disc, caliperArc: arc }));
      wp.finalize();
      const cp = P('suspension', `corner${x > 0 ? 'F' : 'R'}${s > 0 ? 'R' : 'L'}`, [x, r, s * (z - 0.25)], [0, 0, s * 0.42]);
      buildCorner(cp, { x, side: s, wheelZ: z, cy: r, inner: 0.42, springMat: 'accent' });
      cp.finalize();
    }
  }
  const bars = P('suspension', 'anti-roll-bars', [0, 0.25, 0], [0, -0.04, 0]);
  antiRollBar(bars, FX - 0.26, 0.2, 0.64);
  antiRollBar(bars, RX + 0.28, 0.22, 0.62);
  bars.add(G.cyl(0.03, 0.03, 0.8, 'z', 14), 'alu', { p: [FX + 0.2, 0.26, 0] });
  for (const s of [-1, 1]) bars.add(G.rod([FX + 0.2, 0.26, s * 0.4], [FX + 0.12, 0.3, s * (FZ - 0.14)], 0.01, 6), 'steel');
  bars.finalize();

  // ------------------------------------------------------ cockpit ----
  const seats = P('interior', 'seats', [0.05, 0.4, 0], [0, 0.55, 0]);
  for (const s of [-1, 1]) buildSeat(seats, 0.08, 0.14, s * 0.42, false);
  seats.finalize();
  const dash = P('interior', 'dashboard', [0.6, 0.7, -0.2], [0.3, 0.6, 0]);
  dash.add(G.box(0.22, 0.12, 1.36, 0.05), 'carbon', { p: [0.78, 0.72, 0] });
  // centre console blade (aluminium + crystal)
  dash.add(G.box(0.5, 0.035, 0.07, 0.015), 'alu', { p: [0.55, 0.52, 0], r: [0, 0, 0.55] });
  dash.add(G.box(0.36, 0.02, 0.05, 0.01), 'glass', { p: [0.55, 0.555, 0], r: [0, 0, 0.55] });
  buildSteering(dash, [0.75, 0.6, -0.42], [0.38, 0.72, -0.42], 0.17);
  // skeleton instrument cluster: three dials with visible gearwork
  for (const [dz, R] of [
    [-0.09, 0.045],
    [0, 0.06],
    [0.09, 0.045],
  ] as [number, number][]) {
    const c: V3 = [0.5, 0.8, -0.42 + dz];
    dash.add(G.torus(R, 0.006, 'x', Math.PI * 2, 32, 6), 'alu', { p: c });
    dash.add(G.cyl(R, R, 0.004, 'x', 32), 'glass', { p: [c[0] - 0.01, c[1], c[2]] });
    dash.add(G.gear(12, R * 0.55, 0.004, 'x'), 'brass', { p: [c[0] + 0.006, c[1] + R * 0.2, c[2] - R * 0.15] });
    dash.add(G.gear(9, R * 0.35, 0.004, 'x'), 'brass', { p: [c[0] + 0.01, c[1] - R * 0.3, c[2] + R * 0.25] });
    dash.add(G.box(0.003, R * 0.85, 0.004), 'accent', { p: [c[0] - 0.012, c[1] + R * 0.3, c[2]], r: [0.6, 0, 0] });
  }
  dash.add(G.box(0.05, 0.18, 0.34, 0.02), 'black', { p: [0.54, 0.8, -0.42] });
  dash.finalize();

  // ---------------------------------------------------------- aero ----
  const wing = P('aero', 'active-wing', [-1.98, 0.98, 0], [-0.3, 0.7, 0]);
  const wingPivot = wing.sub([-1.9, 0.95, 0]);
  const foil = G.airfoil(0.34, 0.07, 1.62, 0.05);
  foil.scale(1, -1, 1);
  wing.add(foil, 'carbon', { p: [-1.86, 0.955, 0] }, wingPivot);
  for (const s of [-1, 1]) wing.add(G.box(0.05, 0.22, 0.02, 0.01), 'dark', { p: [-1.98, 0.85, s * 0.55] }, wingPivot);
  wing.finalize();
  const splitter = P('aero', 'splitter', [2.2, 0.1, 0], [0.45, -0.02, 0]);
  splitter.add(G.box(0.32, 0.018, 1.62, 0.006), 'black', { p: [2.24, 0.1, 0] });
  splitter.finalize();
  const diff = P('aero', 'diffuser', [-2.0, 0.25, 0], [-0.55, -0.02, 0]);
  diff.add(G.box(0.85, 0.012, 1.6), 'carbon', { p: [-1.92, 0.26, 0], r: [0, 0, -0.34] });
  for (let i = -3; i <= 3; i++) {
    if (Math.abs(i) === 0) continue;
    diff.add(G.extrude([[0, 0], [-0.85, 0.32], [-0.85, -0.02], [0, -0.02]], 0.012), 'carbon', { p: [-1.5, 0.1, i * 0.21] });
  }
  diff.finalize();

  return assemble(
    'tourbillon',
    lib,
    parts,
    {
      body: [0, 1.6, 0],
      chassis: [0, 0, 0],
      engine: [-0.6, 0.75, 0],
      transmission: [-1.35, 0.35, 0],
      hybrid: [0, 0.15, 0],
      battery: [0, 0.0, 0],
      exhaust: [-1.5, -0.04, 0],
      cooling: [0, 0.15, 0],
      wheels: [0, 0, 0],
      suspension: [0, 0, 0],
      interior: [0.25, 0.5, 0],
      aero: [0, 0.2, 0],
    },
    {
      engine,
      gearbox: gb,
      wheels,
      motors,
      setAero(t: number) {
        wingPivot.position.y = wing.local([-1.9, 0.95, 0]).y + t * 0.22;
        wingPivot.rotation.z = -t * 0.18;
      },
    },
  );
}
