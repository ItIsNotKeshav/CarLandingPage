import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type V3 = [number, number, number];
export type Axis = 'x' | 'y' | 'z';

export interface Xf {
  p?: V3;
  r?: V3;
  s?: V3 | number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

export function xf(g: THREE.BufferGeometry, t?: Xf): THREE.BufferGeometry {
  if (!t) return g;
  const s = t.s === undefined ? [1, 1, 1] : typeof t.s === 'number' ? [t.s, t.s, t.s] : t.s;
  _e.set(...(t.r ?? [0, 0, 0]));
  _q.setFromEuler(_e);
  _m.compose(_v.set(...(t.p ?? [0, 0, 0])), _q, _s.set(s[0], s[1], s[2]));
  g.applyMatrix4(_m);
  return g;
}

function toAxis(g: THREE.BufferGeometry, axis: Axis) {
  // geometries are authored along +Y
  if (axis === 'x') g.rotateZ(-Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  return g;
}

// ---------------------------------------------------------------- geometry ---

export const G = {
  box(w: number, h: number, d: number, radius = 0, seg = 2): THREE.BufferGeometry {
    if (radius > 0) {
      const r = Math.min(radius, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
      return new RoundedBoxGeometry(w, h, d, seg, Math.max(r, 1e-4));
    }
    return new THREE.BoxGeometry(w, h, d);
  },

  cyl(rTop: number, rBot: number, h: number, axis: Axis = 'y', seg = 24, open = false) {
    return toAxis(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open), axis);
  },

  sphere(r: number, s: V3 = [1, 1, 1], seg = 20) {
    const g = new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.6)));
    g.scale(...s);
    return g;
  },

  torus(R: number, r: number, axis: Axis = 'y', arc = Math.PI * 2, seg = 48, rad = 10) {
    // TorusGeometry lies in XY plane (axis Z)
    const g = new THREE.TorusGeometry(R, r, rad, seg, arc);
    if (axis === 'y') g.rotateX(Math.PI / 2);
    else if (axis === 'x') g.rotateY(Math.PI / 2);
    return g;
  },

  /** lathe from [radius, height] profile around +Y, then mapped to axis */
  lathe(profile: [number, number][], axis: Axis = 'y', seg = 40) {
    const g = new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      seg,
    );
    return toAxis(g, axis);
  },

  /** thick ring / tube section (disc with a hole), centred at origin */
  ring(rOut: number, rIn: number, thick: number, axis: Axis = 'y', seg = 40) {
    const h = thick / 2;
    return G.lathe(
      [
        [rIn, -h],
        [rOut, -h],
        [rOut, h],
        [rIn, h],
        [rIn, -h],
      ],
      axis,
      seg,
    );
  },

  tube(points: V3[], radius: number, closed = false, tubular = 48, radial = 10, tension = 0.5) {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...p)),
      closed,
      'catmullrom',
      tension,
    );
    return new THREE.TubeGeometry(curve, tubular, radius, radial, closed);
  },

  /** straight cylinder between two points */
  rod(a: V3, b: V3, r: number, radial = 10, rB?: number) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(rB ?? r, r, len, radial, 1, false);
    g.translate(0, len / 2, 0);
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    g.applyQuaternion(_q);
    g.translate(va.x, va.y, va.z);
    return g;
  },

  /** coil spring between two points */
  spring(a: V3, b: V3, R: number, wire: number, turns: number) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    const pts: THREE.Vector3[] = [];
    const n = Math.round(turns * 20);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const ang = t * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(ang) * R, t * len, Math.sin(ang) * R));
    }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, wire, 6, false);
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    g.applyQuaternion(_q);
    g.translate(va.x, va.y, va.z);
    return g;
  },

  /** spur gear, axis along given axis, centred */
  gear(teeth: number, r: number, thick: number, axis: Axis = 'x', toothDepth?: number, hole = 0) {
    const d = toothDepth ?? Math.max(0.004, r * 0.12);
    const shape = new THREE.Shape();
    const steps = teeth * 4;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const k = i % 4;
      const rr = k === 1 || k === 2 ? r : r - d;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    if (hole > 0) {
      const h = new THREE.Path();
      h.absarc(0, 0, hole, 0, Math.PI * 2, true);
      shape.holes.push(h);
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 4 });
    g.translate(0, 0, -thick / 2);
    // shape is in XY, extruded along Z
    if (axis === 'x') g.rotateY(Math.PI / 2);
    else if (axis === 'y') g.rotateX(Math.PI / 2);
    return g;
  },

  /** symmetric airfoil extruded along Z (span), chord along -X from leading edge at 0 */
  airfoil(chord: number, thick: number, span: number, camber = 0.04) {
    const shape = new THREE.Shape();
    const n = 24;
    const up: [number, number][] = [];
    const lo: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const xx = 1 - Math.cos((i / n) * Math.PI * 0.5); // cluster near LE
      const yt =
        5 * thick * (0.2969 * Math.sqrt(xx) - 0.126 * xx - 0.3516 * xx * xx + 0.2843 * xx ** 3 - 0.1036 * xx ** 4);
      const yc = camber * 4 * xx * (1 - xx);
      up.push([-xx * chord, (yc + yt) * chord]);
      lo.push([-xx * chord, (yc - yt) * chord]);
    }
    shape.moveTo(up[0][0], up[0][1]);
    for (const p of up) shape.lineTo(p[0], p[1]);
    for (let i = lo.length - 1; i >= 0; i--) shape.lineTo(lo[i][0], lo[i][1]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: span, bevelEnabled: false, curveSegments: 2 });
    g.translate(0, 0, -span / 2);
    return g;
  },

  /** extrude a 2D outline (in the XY plane) by depth along Z, centred */
  extrude(pts: [number, number][], depth: number, bevel = 0) {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 12,
    });
    g.translate(0, 0, -depth / 2);
    return g;
  },

  /**
   * Loft a surface through stations along X.
   * section(x, a) returns [y, z] for perimeter angle a.
   * a sweeps -PI/2 (bottom) -> 0 (right, +z) -> PI/2 (top) -> PI (left) -> 3PI/2 (bottom).
   */
  loft(
    xs: number[],
    section: (x: number, a: number) => [number, number],
    a0: number,
    a1: number,
    aSteps: number,
    caps: { start?: boolean; end?: boolean } = {},
  ) {
    const nx = xs.length;
    const na = aSteps + 1;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < na; j++) {
        const a = a0 + ((a1 - a0) * j) / aSteps;
        const [y, z] = section(xs[i], a);
        pos.push(xs[i], y, z);
        uv.push(j / aSteps, i / (nx - 1));
      }
    }
    for (let i = 0; i < nx - 1; i++) {
      for (let j = 0; j < na - 1; j++) {
        const p = i * na + j;
        const q = (i + 1) * na + j;
        idx.push(p, q, p + 1, q, q + 1, p + 1);
      }
    }
    const fan = (i: number, flip: boolean) => {
      let cy = 0;
      let cz = 0;
      for (let j = 0; j < na; j++) {
        cy += pos[(i * na + j) * 3 + 1];
        cz += pos[(i * na + j) * 3 + 2];
      }
      const c = pos.length / 3;
      pos.push(xs[i], cy / na, cz / na);
      uv.push(0.5, i / (nx - 1));
      for (let j = 0; j < na - 1; j++) {
        const p = i * na + j;
        if (flip) idx.push(c, p + 1, p);
        else idx.push(c, p, p + 1);
      }
    };
    if (caps.start) fan(0, false);
    if (caps.end) fan(nx - 1, true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  },
};

// -------------------------------------------------------------- profiles ----

export type Curve = (x: number) => number;

/** smooth curve through [x, value] keys (cubic Hermite, Catmull-Rom tangents) */
export function curve(keys: [number, number][]): Curve {
  const k = [...keys].sort((a, b) => a[0] - b[0]);
  const n = k.length;
  const m: number[] = k.map((_, i) => {
    if (i === 0) return (k[1][1] - k[0][1]) / (k[1][0] - k[0][0]);
    if (i === n - 1) return (k[n - 1][1] - k[n - 2][1]) / (k[n - 1][0] - k[n - 2][0]);
    return (k[i + 1][1] - k[i - 1][1]) / (k[i + 1][0] - k[i - 1][0]);
  });
  return (x: number) => {
    if (x <= k[0][0]) return k[0][1];
    if (x >= k[n - 1][0]) return k[n - 1][1];
    let i = 0;
    while (i < n - 2 && x > k[i + 1][0]) i++;
    const [x0, y0] = k[i];
    const [x1, y1] = k[i + 1];
    const h = x1 - x0;
    const t = (x - x0) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m[i + 1]
    );
  };
}

export function stations(x0: number, x1: number, n: number, extra: number[] = []): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(x0 + ((x1 - x0) * i) / n);
  for (const e of extra) if (e > x0 && e < x1) out.push(e);
  out.sort((a, b) => a - b);
  return out.filter((v, i) => i === 0 || v - out[i - 1] > 1e-4);
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

// -------------------------------------------------------------- textures ----

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat: [number, number]) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  draw(c);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let _carbon: THREE.Texture | null = null;
export function carbonTexture() {
  if (_carbon) return _carbon;
  _carbon = canvasTex(
    64,
    64,
    (c) => {
      c.fillStyle = '#16171a';
      c.fillRect(0, 0, 64, 64);
      const s = 8;
      for (let y = 0; y < 64; y += s) {
        for (let x = 0; x < 64; x += s) {
          const k = ((x / s + y / s) & 3) < 2;
          const g = c.createLinearGradient(x, y, k ? x + s : x, k ? y : y + s);
          g.addColorStop(0, k ? '#2c2f35' : '#1d1f23');
          g.addColorStop(0.5, k ? '#40444c' : '#25282d');
          g.addColorStop(1, k ? '#2a2c31' : '#1b1c20');
          c.fillStyle = g;
          c.fillRect(x + 0.5, y + 0.5, s - 1, s - 1);
        }
      }
    },
    [6, 6],
  );
  return _carbon;
}

let _fins: THREE.Texture | null = null;
export function finTexture() {
  if (_fins) return _fins;
  _fins = canvasTex(
    64,
    64,
    (c) => {
      c.fillStyle = '#2b2e33';
      c.fillRect(0, 0, 64, 64);
      c.strokeStyle = '#7d828a';
      c.lineWidth = 1;
      for (let x = 0; x < 64; x += 4) {
        c.beginPath();
        c.moveTo(x + 0.5, 0);
        c.lineTo(x + 0.5, 64);
        c.stroke();
      }
      c.strokeStyle = '#4b4f56';
      for (let y = 0; y < 64; y += 16) {
        c.beginPath();
        c.moveTo(0, y + 0.5);
        c.lineTo(64, y + 0.5);
        c.stroke();
      }
    },
    [4, 2],
  );
  return _fins;
}

let _cells: THREE.Texture | null = null;
export function cellTexture() {
  if (_cells) return _cells;
  _cells = canvasTex(
    64,
    64,
    (c) => {
      c.fillStyle = '#1f2a33';
      c.fillRect(0, 0, 64, 64);
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          c.fillStyle = '#2f4656';
          c.fillRect(x * 16 + 1.5, y * 16 + 1.5, 13, 13);
          c.fillStyle = '#5ad1c8';
          c.fillRect(x * 16 + 5, y * 16 + 5, 6, 2);
        }
    },
    [1.5, 1.5],
  );
  return _cells;
}

// ------------------------------------------------------------- materials ----

export type MatKey =
  | 'paint'
  | 'paint2'
  | 'carbon'
  | 'glass'
  | 'chrome'
  | 'alu'
  | 'steel'
  | 'dark'
  | 'black'
  | 'rubber'
  | 'caliper'
  | 'block'
  | 'liner'
  | 'piston'
  | 'glow'
  | 'copper'
  | 'hv'
  | 'battery'
  | 'radiator'
  | 'seat'
  | 'accent'
  | 'headlight'
  | 'taillight'
  | 'titanium'
  | 'brass';

export interface MatOptions {
  paint: string;
  paint2?: string;
  caliper: string;
  accent: string;
}

export function makeMaterials(o: MatOptions): Record<MatKey, THREE.Material> {
  const P = (p: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(p);
  const S = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
  const m: Record<MatKey, THREE.Material> = {
    paint: P({ color: o.paint, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide }),
    paint2: P({ color: o.paint2 ?? o.paint, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide }),
    carbon: P({ map: carbonTexture(), color: '#9a9ca3', metalness: 0.35, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.18, envMapIntensity: 0.45, side: THREE.DoubleSide }),
    glass: P({ color: '#1b2430', metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
    chrome: S({ color: '#f0f0f0', metalness: 1, roughness: 0.12 }),
    alu: S({ color: '#c8ccd2', metalness: 0.9, roughness: 0.32 }),
    steel: S({ color: '#8d9198', metalness: 0.85, roughness: 0.42 }),
    dark: S({ color: '#3a3d43', metalness: 0.75, roughness: 0.5 }),
    black: S({ color: '#17181b', metalness: 0.2, roughness: 0.6, side: THREE.DoubleSide }),
    rubber: S({ color: '#141416', metalness: 0, roughness: 0.92 }),
    caliper: P({ color: o.caliper, metalness: 0.2, roughness: 0.35, clearcoat: 0.8 }),
    block: S({ color: '#b8b2a6', metalness: 0.65, roughness: 0.48 }),
    liner: P({ color: '#9fd4ff', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
    piston: S({ color: '#dfe3e8', metalness: 0.95, roughness: 0.2 }),
    glow: new THREE.MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    copper: S({ color: '#c47a45', metalness: 0.9, roughness: 0.35 }),
    hv: S({ color: '#ff6a13', metalness: 0.1, roughness: 0.5 }),
    battery: S({ map: cellTexture(), metalness: 0.4, roughness: 0.55 }),
    radiator: S({ map: finTexture(), metalness: 0.7, roughness: 0.45, side: THREE.DoubleSide }),
    seat: S({ color: '#1d1e22', metalness: 0.05, roughness: 0.85 }),
    accent: S({ color: o.accent, metalness: 0.1, roughness: 0.5 }),
    headlight: P({ color: '#f4f7ff', emissive: '#dfe9ff', emissiveIntensity: 0.6, roughness: 0.05, metalness: 0.2, clearcoat: 1 }),
    taillight: P({ color: '#ff2a2a', emissive: '#ff1a1a', emissiveIntensity: 0.9, roughness: 0.1, clearcoat: 1 }),
    titanium: P({ color: '#9c8f86', metalness: 1, roughness: 0.28, iridescence: 1, iridescenceIOR: 1.6 }),
    brass: S({ color: '#c9a35a', metalness: 1, roughness: 0.25 }),
  };
  (m.paint.userData as any).paint = true;
  (m.paint2.userData as any).paint = true;
  (m.glass.userData as any).glassy = true;
  (m.liner.userData as any).always = true;
  (m.glow.userData as any).always = true;
  (m.glow.userData as any).noFade = false;
  (m.carbon.userData as any).skin = false;
  for (const k of Object.keys(m) as MatKey[]) {
    const ud = m[k].userData as any;
    ud.baseOpacity = (m[k] as any).opacity ?? 1;
    ud.key = k;
  }
  return m;
}

const NO_EDGES: Set<MatKey> = new Set(['rubber', 'glow', 'liner', 'glass', 'headlight', 'taillight', 'copper', 'radiator']);

// ------------------------------------------------------------------ Part ----

const ATTRS = ['position', 'normal', 'uv'];

function normalise(g: THREE.BufferGeometry) {
  let out = g.index ? g.toNonIndexed() : g;
  if (!out.getAttribute('normal')) out.computeVertexNormals();
  if (!out.getAttribute('uv')) {
    const n = out.getAttribute('position').count;
    out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  }
  for (const name of Object.keys(out.attributes)) if (!ATTRS.includes(name)) out.deleteAttribute(name);
  out.morphAttributes = {};
  return out;
}

export class Part {
  readonly root = new THREE.Group();
  readonly system: string;
  readonly name: string;
  /** assembled position of root in car space */
  readonly home: THREE.Vector3;
  /** internal explode offset (applied with explode / focus) */
  readonly offset: THREE.Vector3;
  readonly materials: THREE.Material[] = [];
  readonly lines: THREE.LineSegments[] = [];
  readonly box = new THREE.Box3();
  /** extra per-frame opacity driven by car logic (e.g. hidden spare parts) */
  private matCache = new Map<string, THREE.Material>();
  private batches = new Map<THREE.Object3D, Map<MatKey, THREE.BufferGeometry[]>>();
  private pivots = new Map<THREE.Object3D, THREE.Vector3>();
  private lineMat: THREE.LineBasicMaterial;
  fade = 1;
  edges: boolean;

  constructor(
    private lib: Record<MatKey, THREE.Material>,
    system: string,
    name: string,
    origin: V3,
    offset: V3 = [0, 0, 0],
    edges = true,
  ) {
    this.system = system;
    this.name = name;
    this.home = new THREE.Vector3(...origin);
    this.offset = new THREE.Vector3(...offset);
    this.root.position.copy(this.home);
    this.root.name = name;
    this.edges = edges;
    this.pivots.set(this.root, this.home.clone());
    this.lineMat = new THREE.LineBasicMaterial({ color: '#1c1e23', transparent: true, opacity: 0.38, depthWrite: false });
    (this.lineMat.userData as any).baseOpacity = 0.38;
    (this.lineMat.userData as any).line = true;
    this.materials.push(this.lineMat);
  }

  mat(key: MatKey): THREE.Material {
    let m = this.matCache.get(key);
    if (!m) {
      m = this.lib[key].clone();
      m.userData = { ...this.lib[key].userData };
      this.matCache.set(key, m);
      this.materials.push(m);
    }
    return m;
  }

  /** create a child pivot (for spinning/moving sub-assemblies); position in car space */
  sub(pivot: V3, parent: THREE.Object3D = this.root): THREE.Object3D {
    const o = new THREE.Object3D();
    const pp = this.pivots.get(parent)!;
    o.position.set(pivot[0] - pp.x, pivot[1] - pp.y, pivot[2] - pp.z);
    parent.add(o);
    const world = new THREE.Vector3(...pivot);
    this.pivots.set(o, world);
    return o;
  }

  /** add geometry authored in car space */
  add(g: THREE.BufferGeometry, key: MatKey, t?: Xf, target: THREE.Object3D = this.root) {
    xf(g, t);
    const pv = this.pivots.get(target)!;
    g.translate(-pv.x, -pv.y, -pv.z);
    let b = this.batches.get(target);
    if (!b) this.batches.set(target, (b = new Map()));
    let list = b.get(key);
    if (!list) b.set(key, (list = []));
    list.push(normalise(g));
    return this;
  }

  /** standalone mesh (not merged) for per-frame animation; geometry in local mesh space */
  mesh(g: THREE.BufferGeometry, key: MatKey, target: THREE.Object3D = this.root) {
    const m = new THREE.Mesh(g, this.mat(key));
    m.userData.part = this;
    target.add(m);
    return m;
  }

  /** convert car-space point to target-local */
  local(p: V3, target: THREE.Object3D = this.root): THREE.Vector3 {
    const pv = this.pivots.get(target)!;
    return new THREE.Vector3(p[0] - pv.x, p[1] - pv.y, p[2] - pv.z);
  }

  finalize() {
    for (const [target, map] of this.batches) {
      for (const [key, list] of map) {
        const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
        if (!merged) continue;
        merged.computeBoundingBox();
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, this.mat(key));
        mesh.userData.part = this;
        target.add(mesh);
        if (this.edges && !NO_EDGES.has(key)) {
          const eg = new THREE.EdgesGeometry(merged, 32);
          const ls = new THREE.LineSegments(eg, this.lineMat);
          target.add(ls);
          this.lines.push(ls);
        }
        const pv = this.pivots.get(target)!;
        const bb = merged.boundingBox!.clone().translate(pv);
        this.box.union(bb);
      }
    }
    this.batches.clear();
    return this;
  }

  /** opacity scale for the whole part, xray is applied to paint/glass */
  applyOpacity(alpha: number, xray: number) {
    for (const m of this.materials) {
      const ud = m.userData as any;
      let o = ud.baseOpacity ?? 1;
      if (ud.paint) o = lerp(1, 0.08, xray);
      else if (ud.glassy) o = lerp(o, 0.06, xray);
      else if (ud.line && this.system === 'body') o = lerp(o, 0.55, xray);
      o *= ud.line ? alpha * alpha : alpha;
      const wantTransparent = !!ud.always || o < 0.995;
      const mat = m as THREE.Material & { opacity: number };
      if (mat.transparent !== wantTransparent) {
        mat.transparent = wantTransparent;
        mat.needsUpdate = true;
      }
      mat.opacity = o;
      if (!ud.line && !ud.always) mat.depthWrite = o > 0.6;
      mat.visible = o > 0.005;
    }
  }
}
