import * as THREE from 'three';
import { G, Part, type MatKey, type V3 } from './kit';
import { buildBodyPanels, makeShape, type BodyProfile } from './body';
import { antiRollBar, buildCorner, buildEngine, buildGearbox, buildRadiator, buildSeat, buildSteering, buildWheel, pipe } from './components';
import { assemble, type CarModel } from './model';

type Lib = Record<MatKey, THREE.Material>;

const FX = 1.2285;
const RX = -1.2285;
const FR = 0.35;
const RR = 0.367;
const FZ = 0.808;
const RZ = 0.79;

const profile: BodyProfile = {
  front: 2.25,
  rear: -2.32,
  W: [[-2.32, 0.78], [-2.2, 0.9], [-1.9, 0.95], [-1.25, 0.962], [-0.7, 0.93], [-0.2, 0.885], [0.4, 0.885], [0.9, 0.92], [1.25, 0.94], [1.75, 0.905], [2.1, 0.8], [2.25, 0.62]],
  B: [[-2.32, 0.3], [-2.05, 0.18], [-1.7, 0.12], [1.85, 0.12], [2.25, 0.16]],
  M: [[-2.32, 0.55], [-1.8, 0.56], [-1.2, 0.56], [0, 0.52], [1.2, 0.5], [2.0, 0.42], [2.25, 0.36]],
  T: [[-2.32, 0.84], [-2.22, 0.93], [-1.9, 0.975], [-1.4, 0.99], [-0.9, 0.96], [-0.4, 0.9], [0.3, 0.87], [0.8, 0.8], [1.2, 0.7], [1.7, 0.625], [2.05, 0.57], [2.2, 0.5], [2.25, 0.43]],
  F: [[-2.32, 0], [-1.9, 0.03], [-1.3, 0.07], [-0.7, 0], [0.6, 0.01], [1.0, 0.11], [1.45, 0.16], [1.95, 0.13], [2.25, 0.0]],
  nb: 7,
  nt: 2.6,
  fc: 0.8,
  fw: 0.17,
  axles: [
    { x: FX, r: FR },
    { x: RX, r: RR },
  ],
  archGap: 0.04,
  archMask: [0.55, 0.7],
  gh: {
    x0: 0.95,
    x1: -1.62,
    Wg: [[-1.62, 0.52], [-1.0, 0.66], [0, 0.72], [0.6, 0.72], [0.95, 0.7]],
    Roof: [[-1.62, 0.9], [-1.25, 1.07], [-0.8, 1.2], [-0.35, 1.29], [0, 1.315], [0.25, 1.3], [0.55, 1.15], [0.95, 0.78]],
    ng: 2.4,
    tumble: 0.18,
  },
};

export function buildGT3RS(lib: Lib): CarModel {
  const shape = makeShape(profile);
  const parts: Part[] = [];
  const P = (system: string, name: string, origin: V3, offset: V3 = [0, 0, 0]) => {
    const p = new Part(lib, system, name, origin, offset);
    parts.push(p);
    return p;
  };

  // ------------------------------------------------------------- body ----
  const body = buildBodyPanels(lib, profile, shape, {
    frontSplit: 0.75,
    rearSplit: -0.78,
    roofCap: [-1.0, 0.28],
    explode: { front: [1.15, 0.2, 0], rear: [-1.15, 0.2, 0], side: 1.1, top: [0, 0.8, 0] },
  });
  parts.push(body.front, body.rear, body.left, body.right, body.top);

  // headlights (ellipsoids on the fender tops)
  for (const s of [-1, 1]) {
    const x = 1.93;
    const z = 0.64 * s;
    const y = shape.topY(x, Math.abs(z)) - 0.035;
    body.front.add(G.sphere(0.1, [1.35, 0.7, 1.0], 24), 'headlight', { p: [x, y, z], r: [0, 0, -0.42] });
    body.front.add(G.torus(0.1, 0.012, 'y', Math.PI * 2, 32, 6), 'black', { p: [x, y + 0.012, z], s: [1.35, 1, 1], r: [0, 0, -0.42] });
    // DRL strip inside
    body.front.add(G.box(0.12, 0.012, 0.025), 'headlight', { p: [x + 0.04, y + 0.05, z], r: [0, 0, -0.42] });
  }
  // front intakes
  body.front.add(G.box(0.08, 0.13, 0.72, 0.03), 'black', { p: [2.205, 0.3, 0] });
  for (const s of [-1, 1]) body.front.add(G.box(0.06, 0.12, 0.2, 0.03), 'black', { p: [2.19, 0.29, s * 0.48] });
  // hood vent (radiator outlet) with slats
  for (let i = 0; i < 6; i++) {
    const x = 1.58 + i * 0.05;
    const y = shape.topY(x, 0.1) - 0.006;
    body.front.add(G.box(0.012, 0.012, 0.62), 'black', { p: [x, y, 0], r: [0, 0, -0.3] });
  }
  body.front.add(G.box(0.32, 0.01, 0.66), 'black', { p: [1.705, shape.topY(1.7, 0.1) - 0.012, 0], r: [0, 0, -0.18] });
  // fender louvres
  for (const s of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const x = 0.98 + i * 0.065;
      const z = 0.76 * s;
      const y = shape.topY(x, 0.76) + 0.004;
      body.front.add(G.box(0.012, 0.016, 0.22), 'black', { p: [x, y, z], r: [0, 0, -0.5] });
    }
  }
  // tail light bar + rear grille slats
  body.rear.add(G.box(0.02, 0.032, 1.42, 0.01), 'taillight', { p: [-2.318, 0.8, 0] });
  body.rear.add(G.box(0.03, 0.06, 0.6, 0.02), 'black', { p: [-2.31, 0.5, 0] });
  for (let i = 0; i < 9; i++) {
    const x = -1.62 - i * 0.055;
    const y = shape.topY(x, 0.1) + 0.003;
    body.rear.add(G.box(0.014, 0.012, 0.56), 'black', { p: [x, y, 0] });
  }
  // mirrors on the doors
  for (const s of [-1, 1]) {
    const door = s > 0 ? body.right : body.left;
    const my = shape.topY(0.6, 0.8);
    door.add(G.rod([0.6, my - 0.02, s * 0.8], [0.54, my + 0.07, s * 0.93], 0.012, 6), 'black');
    door.add(G.sphere(0.07, [1.0, 0.62, 1.25], 16), 'paint', { p: [0.52, my + 0.08, s * 0.96] });
    door.add(G.box(0.01, 0.055, 0.13, 0.005), 'glass', { p: [0.46, my + 0.08, s * 0.96] });
    // door handle
    door.add(G.box(0.12, 0.018, 0.012, 0.006), 'black', { p: [-0.35, 0.82, s * shape.sideZ(-0.35, 0.82)] });
  }
  for (const p of Object.values(body)) p.finalize();

  // ------------------------------------------------------- chassis ----
  const floor = P('chassis', 'floor', [0, 0.25, 0]);
  floor.add(G.box(3.4, 0.02, 1.48, 0.008), 'dark', { p: [0.0, 0.13, 0] });
  for (const s of [-1, 1]) floor.add(G.box(1.55, 0.16, 0.11, 0.02), 'steel', { p: [-0.02, 0.22, s * 0.8] });
  floor.add(G.box(0.025, 0.55, 1.4, 0.01), 'steel', { p: [0.78, 0.42, 0] });
  floor.add(G.box(0.025, 0.6, 1.45, 0.01), 'steel', { p: [-0.84, 0.45, 0] });
  floor.add(G.box(0.35, 0.03, 1.3, 0.01), 'steel', { p: [0.65, 0.69, 0] });
  // subframes
  for (const [x0, x1] of [[0.92, 1.58], [-0.92, -1.62]]) {
    for (const s of [-1, 1]) {
      floor.add(G.rod([x0, 0.2, s * 0.36], [x1, 0.2, s * 0.36], 0.028, 8), 'steel');
      floor.add(G.rod([(x0 + x1) / 2, 0.2, s * 0.36], [(x0 + x1) / 2, 0.68, s * 0.5], 0.03, 8), 'steel');
      floor.add(G.cyl(0.07, 0.07, 0.03, 'y', 20), 'steel', { p: [(x0 + x1) / 2 - 0.02, 0.72, s * 0.52] });
    }
    floor.add(G.rod([x0, 0.2, -0.36], [x0, 0.2, 0.36], 0.026, 8), 'steel');
    floor.add(G.rod([x1, 0.2, -0.36], [x1, 0.2, 0.36], 0.026, 8), 'steel');
  }
  floor.finalize();

  const cage = P('interior', 'roll-cage', [-0.3, 0.8, 0], [0, 0.35, 0]);
  const cr = 0.02;
  const cagePts = (s: number): V3[] => [
    [-0.8, 0.2, s * 0.67],
    [-0.8, 1.0, s * 0.62],
    [-0.82, 1.17, s * 0.42],
  ];
  for (const s of [-1, 1]) {
    cage.add(G.tube(cagePts(s), cr, false, 24, 8), 'dark');
    cage.add(G.tube([[0.6, 0.35, s * 0.72], [0.4, 0.82, s * 0.68], [0.2, 1.14, s * 0.56], [-0.3, 1.24, s * 0.45], [-0.82, 1.17, s * 0.42]], cr, false, 40, 8), 'dark');
    cage.add(G.rod([-0.82, 1.17, s * 0.42], [-1.3, 0.78, s * 0.55], cr, 8), 'dark');
    cage.add(G.rod([0.55, 0.42, s * 0.72], [-0.78, 0.48, s * 0.68], cr, 8), 'dark');
    cage.add(G.rod([0.45, 0.62, s * 0.71], [-0.78, 0.3, s * 0.68], cr, 8), 'dark');
  }
  cage.add(G.rod([-0.82, 1.17, -0.42], [-0.82, 1.17, 0.42], cr, 8), 'dark');
  cage.add(G.rod([-0.8, 0.22, -0.66], [-0.82, 1.15, 0.43], cr, 8), 'dark');
  cage.add(G.rod([-0.8, 0.85, -0.63], [-0.8, 0.85, 0.63], cr, 8), 'dark');
  cage.finalize();

  // -------------------------------------------------------- engine ----
  const engine = buildEngine(lib, {
    center: [-1.79, 0.43, 0],
    perBank: 3,
    spacing: 0.118,
    bankAngles: [Math.PI / 2, -Math.PI / 2],
    stagger: 0.05,
    bore: 0.102,
    r: 0.0408,
    L: 0.135,
    block: [0.46, 0.25, 0.2],
    firing: [0, 5, 1, 3, 2, 4],
    intake: 'boxer',
    head: { h: 0.08, w: 0.2 },
    camMat: 'black',
    explode: { bank: 0.2, intake: [0, 0.32, 0], front: [-0.3, 0, 0] },
  });
  parts.push(...engine.parts);
  // dry sump tank
  const sump = P('engine', 'oil-tank', [-1.5, 0.45, 0.5], [0, 0.15, 0.25]);
  sump.add(G.cyl(0.07, 0.07, 0.3, 'y', 20), 'alu', { p: [-1.52, 0.45, 0.48] });
  sump.add(G.cyl(0.03, 0.03, 0.04, 'y', 12), 'black', { p: [-1.52, 0.62, 0.48] });
  sump.finalize();

  // --------------------------------------------------- transmission ----
  const gb = buildGearbox(lib, { x0: -1.52, x1: -0.92, y: 0.38, gears: 7, axleX: RX, axleY: RR, wheelZ: RZ, explode: [0, 0.18, 0] });
  parts.push(...gb.parts);

  // -------------------------------------------------------- exhaust ----
  const ex = P('exhaust', 'exhaust', [-2.05, 0.28, 0]);
  for (const port of engine.ports) {
    const s = port.bank === 0 ? 1 : -1;
    const p0 = port.pos;
    pipe(ex, [[p0.x, p0.y, p0.z], [p0.x, p0.y - 0.08, p0.z], [p0.x - 0.06, 0.2, s * 0.27], [-2.02, 0.2, s * 0.25]], 0.017, 'steel', 30);
  }
  for (const s of [-1, 1]) {
    ex.add(G.cyl(0.06, 0.06, 0.16, 'x', 20), 'steel', { p: [-2.06, 0.2, s * 0.25] });
    pipe(ex, [[-2.14, 0.2, s * 0.25], [-2.18, 0.22, s * 0.25], [-2.2, 0.27, s * 0.2]], 0.03);
    pipe(ex, [[-2.24, 0.3, s * 0.08], [-2.3, 0.33, s * 0.085], [-2.355, 0.34, s * 0.09]], 0.045, 'titanium', 12);
  }
  ex.add(G.box(0.16, 0.18, 0.86, 0.06), 'steel', { p: [-2.2, 0.28, 0] });
  ex.finalize();

  // -------------------------------------------------------- cooling ----
  const rad = P('cooling', 'radiator', [1.95, 0.4, 0], [0.55, 0.2, 0]);
  buildRadiator(rad, [1.95, 0.4, 0], 0.72, 0.36, 0.85);
  rad.add(G.box(0.22, 0.05, 0.6, 0.02), 'black', { p: [1.82, 0.56, 0], r: [0, 0, 0.6] });
  rad.finalize();
  const lines = P('cooling', 'coolant-lines', [0.2, 0.2, 0], [0, -0.03, 0]);
  for (const s of [-1, 1]) pipe(lines, [[1.85, 0.25, s * 0.12], [1.5, 0.17, s * 0.12], [0, 0.165, s * 0.18], [-1.4, 0.18, s * 0.12], [-1.65, 0.3, s * 0.1]], 0.016, 'alu', 60);
  lines.finalize();

  // ----------------------------------------------------------- fuel ----
  const fuel = P('fuel', 'tank', [1.02, 0.4, 0]);
  fuel.add(G.box(0.42, 0.22, 0.66, 0.08), 'black', { p: [1.02, 0.4, 0] });
  fuel.add(G.box(0.36, 0.02, 0.58, 0.01), 'dark', { p: [1.02, 0.52, 0] });
  fuel.add(G.cyl(0.04, 0.04, 0.06, 'y', 16), 'alu', { p: [1.12, 0.55, 0.22] });
  pipe(fuel, [[1.12, 0.58, 0.22], [1.2, 0.62, 0.35], [1.35, 0.7, 0.52]], 0.018, 'black', 12);
  fuel.finalize();

  // ----------------------------------------------- wheels & suspension ----
  const wheels: CarModel['wheels'] = [];
  for (const [x, z, r, rim, w, disc, arc] of [
    [FX, FZ, FR, 0.254, 0.275, 0.204, [105, 155]],
    [RX, RZ, RR, 0.2667, 0.335, 0.19, [25, 75]],
  ] as [number, number, number, number, number, number, [number, number]][]) {
    for (const s of [-1, 1] as const) {
      const wp = P('wheels', `wheel${x > 0 ? 'F' : 'R'}${s > 0 ? 'R' : 'L'}`, [x, r, s * z], [0, 0, s * 0.8]);
      wheels.push(buildWheel(wp, { x, z: s * z, r, rim, width: w, spokes: 10, style: 'split', disc, caliperArc: arc }));
      wp.finalize();
      const cp = P('suspension', `corner${x > 0 ? 'F' : 'R'}${s > 0 ? 'R' : 'L'}`, [x, r, s * (z - 0.25)], [0, 0, s * 0.42]);
      buildCorner(cp, { x, side: s, wheelZ: z, cy: r, inner: 0.36, multilink: x < 0 });
      cp.finalize();
    }
  }
  const bars = P('suspension', 'anti-roll-bars', [0, 0.25, 0], [0, -0.04, 0]);
  antiRollBar(bars, FX - 0.22, 0.2, 0.62);
  antiRollBar(bars, RX + 0.25, 0.24, 0.6);
  // steering rack + tie rods
  bars.add(G.cyl(0.03, 0.03, 0.75, 'z', 14), 'alu', { p: [FX + 0.16, 0.28, 0] });
  for (const s of [-1, 1]) bars.add(G.rod([FX + 0.16, 0.28, s * 0.37], [FX + 0.12, 0.3, s * (FZ - 0.14)], 0.01, 6), 'steel');
  bars.finalize();

  // --------------------------------------------------------- interior ----
  const cabin = P('interior', 'seats', [-0.25, 0.4, 0], [0, 0.5, 0]);
  for (const s of [-1, 1]) buildSeat(cabin, -0.22, 0.14, s * 0.37);
  cabin.finalize();
  const dash = P('interior', 'dashboard', [0.5, 0.7, -0.2], [0.25, 0.55, 0]);
  dash.add(G.box(0.26, 0.13, 1.42, 0.04), 'black', { p: [0.56, 0.74, 0] });
  dash.add(G.box(0.12, 0.08, 0.36, 0.03), 'carbon', { p: [0.42, 0.84, -0.37] });
  dash.add(G.box(0.02, 0.06, 0.3, 0.01), 'glass', { p: [0.36, 0.84, -0.37] });
  dash.add(G.box(0.3, 0.28, 0.16, 0.04), 'black', { p: [0.35, 0.45, 0] });
  dash.add(G.cyl(0.02, 0.025, 0.12, 'y', 10), 'alu', { p: [0.25, 0.62, 0] });
  buildSteering(dash, [0.66, 0.6, -0.37], [0.2, 0.77, -0.37], 0.175);
  for (const dz of [-0.07, 0, 0.07]) dash.add(G.box(0.08, 0.02, 0.05, 0.008), 'alu', { p: [0.6, 0.26, -0.37 + dz], r: [0, 0, 0.6] });
  dash.finalize();

  // ------------------------------------------------------------- aero ----
  const wing = P('aero', 'rear-wing', [-1.98, 1.25, 0], [-0.45, 0.95, 0]);
  const wingG = G.airfoil(0.36, 0.11, 1.74, 0.06);
  wingG.scale(1, -1, 1);
  wing.add(wingG, 'carbon', { p: [-1.78, 1.33, 0], r: [0, 0, -0.14] });
  for (const s of [-1, 1]) {
    wing.add(G.extrude([[0, 0], [-0.5, 0.03], [-0.52, 0.27], [-0.1, 0.25], [0.02, 0.12]], 0.012, 0.002), 'carbon', { p: [-1.7, 1.17, s * 0.875] });
    // swan neck
    const x0 = -1.84;
    const y0 = shape.topY(x0, 0.33);
    wing.add(G.tube([[x0, y0 - 0.02, s * 0.33], [-1.86, 1.12, s * 0.33], [-1.92, 1.42, s * 0.33], [-1.99, 1.455, s * 0.33], [-2.02, 1.4, s * 0.33]], 0.02, false, 40, 8), 'black');
  }
  const drs = wing.sub([-2.06, 1.4, 0]);
  const flap = G.airfoil(0.17, 0.12, 1.7, 0.08);
  flap.scale(1, -1, 1);
  wing.add(flap, 'carbon', { p: [-2.06, 1.4, 0], r: [0, 0, -0.55] }, drs);
  wing.finalize();

  const splitter = P('aero', 'splitter', [2.1, 0.1, 0], [0.45, -0.02, 0]);
  splitter.add(G.box(0.4, 0.018, 1.7, 0.006), 'black', { p: [2.1, 0.1, 0] });
  for (const s of [-1, 1]) splitter.add(G.box(0.2, 0.08, 0.012), 'carbon', { p: [2.12, 0.14, s * 0.5] });
  splitter.finalize();

  const diff = P('aero', 'diffuser', [-2.1, 0.2, 0], [-0.5, -0.02, 0]);
  diff.add(G.box(0.55, 0.012, 1.3), 'carbon', { p: [-2.06, 0.2, 0], r: [0, 0, -0.3] });
  for (let i = -2; i <= 2; i++) diff.add(G.extrude([[0, 0], [-0.5, 0.17], [-0.5, 0], [0, -0.02]], 0.01), 'carbon', { p: [-1.84, 0.12, i * 0.26] });
  diff.finalize();

  return assemble(
    'gt3rs',
    lib,
    parts,
    {
      body: [0, 1.6, 0],
      chassis: [0, 0, 0],
      engine: [-1.3, 0.45, 0],
      transmission: [-0.2, 0.75, 0],
      exhaust: [-2.0, -0.04, 0],
      cooling: [1.0, 0.35, 0],
      fuel: [0.45, 0.9, 0],
      wheels: [0, 0, 0],
      suspension: [0, 0, 0],
      interior: [0.1, 0.45, 0],
      aero: [0, 0.2, 0],
    },
    {
      engine,
      gearbox: gb,
      wheels,
      motors: [],
      setAero(t: number) {
        drs.rotation.z = t * 0.55;
      },
    },
  );
}
