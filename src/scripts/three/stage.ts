import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { CarModel } from './model';
import { clamp, lerp } from './kit';

export interface ViewState {
  explode: number;
  xray: number;
  focus: Record<string, number>;
  az: number; // degrees
  el: number;
  zoom: number;
}

const DEG = Math.PI / 180;

const floorVert = /* glsl */ `
varying vec2 vXZ;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vXZ = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const floorFrag = /* glsl */ `
uniform vec3 uBg;
uniform vec3 uLine;
uniform vec3 uAccent;
uniform float uOffset;
uniform vec2 uHalf;
uniform float uShadow;
uniform vec4 uWheels[4];
varying vec2 vXZ;

float grid(vec2 p, float size, float width) {
  vec2 g = abs(fract(p / size - 0.5) - 0.5) / fwidth(p / size);
  float l = min(g.x, g.y);
  return 1.0 - min(l / width, 1.0);
}
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  vec2 p = vXZ;
  vec2 gp = vec2(p.x + uOffset, p.y);
  float d = length(p);
  float fade = 1.0 - smoothstep(4.0, 16.0, d);
  float minor = grid(gp, 0.25, 1.0) * 0.18;
  float major = grid(gp, 1.0, 1.2) * 0.35;
  vec3 col = uBg;
  col = mix(col, uLine, max(minor, major) * fade);
  // centre axis lines
  float axis = (1.0 - smoothstep(0.0, 0.012, abs(p.y))) * 0.25 * fade;
  col = mix(col, uAccent, axis);
  // soft contact shadow under the car
  float sd = sdRoundBox(p, uHalf, 0.5);
  float sh = (1.0 - smoothstep(-0.4, 0.55, sd)) * 0.32 * uShadow;
  for (int i = 0; i < 4; i++) {
    vec2 q = (p - uWheels[i].xy) / uWheels[i].zw;
    sh += (1.0 - smoothstep(0.0, 1.0, length(q))) * 0.45 * uShadow;
  }
  col *= 1.0 - clamp(sh, 0.0, 0.7);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly floorMat: THREE.ShaderMaterial;
  car: CarModel | null = null;

  // camera rig (current values)
  az = -38;
  el = 12;
  dist = 7;
  target = new THREE.Vector3(0, 0.5, 0);
  /** horizontal/vertical projection shift (fraction of viewport) */
  shiftX = 0;
  shiftY = 0;
  wantShiftX = 0;
  wantShiftY = 0;

  /** live applied view state */
  view: ViewState = { explode: 0, xray: 0, focus: {}, az: -38, el: 12, zoom: 1 };
  /** user adjustments (explore mode) */
  userPan = new THREE.Vector3();
  carFade = 1;

  private groupBoxes = new Map<string, THREE.Box3>();
  private tmpBox = new THREE.Box3();
  private tmpV = new THREE.Vector3();
  private dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  private frameTimes: number[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const bg = new THREE.Color('#ece8df');
    this.scene.background = bg;
    this.scene.fog = new THREE.Fog(bg, 14, 34);

    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture;
    this.scene.environmentIntensity = 0.85;
    pm.dispose();

    const key = new THREE.DirectionalLight('#ffffff', 1.5);
    key.position.set(4, 8, -3);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#dfe8ff', 0.7);
    rim.position.set(-5, 3, 5);
    this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#c9c1b0', 0.55));

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 80);

    this.floorMat = new THREE.ShaderMaterial({
      vertexShader: floorVert,
      fragmentShader: floorFrag,
      uniforms: {
        uBg: { value: bg.clone() },
        uLine: { value: new THREE.Color('#8f8a80') },
        uAccent: { value: new THREE.Color('#ff5a1f') },
        uOffset: { value: 0 },
        uHalf: { value: new THREE.Vector2(2.2, 0.85) },
        uShadow: { value: 1 },
        uWheels: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      },
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.renderOrder = -1;
    this.scene.add(floor);
  }

  setAccent(hex: string) {
    (this.floorMat.uniforms.uAccent.value as THREE.Color).set(hex);
  }

  setCar(car: CarModel) {
    if (this.car) this.scene.remove(this.car.root);
    this.car = car;
    this.scene.add(car.root);
    // group home boxes
    this.groupBoxes.clear();
    for (const p of car.parts) {
      let b = this.groupBoxes.get(p.system);
      if (!b) this.groupBoxes.set(p.system, (b = new THREE.Box3()));
      b.union(p.box);
    }
    // floor shadow footprint from body
    const all = new THREE.Box3();
    for (const p of car.parts) if (p.system === 'body') all.union(p.box);
    const size = all.getSize(new THREE.Vector3());
    const c = all.getCenter(new THREE.Vector3());
    (this.floorMat.uniforms.uHalf.value as THREE.Vector2).set(size.x / 2 - 0.25, size.z / 2 - 0.2);
    void c;
    const ws = this.floorMat.uniforms.uWheels.value as THREE.Vector4[];
    car.wheels.forEach((w, i) => {
      if (i < 4) {
        const wp = w.spin.getWorldPosition(new THREE.Vector3());
        ws[i].set(wp.x, wp.z, w.radius * 0.9, 0.22);
      }
    });
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** framing box for a given explode / focus state */
  frameFor(explode: number, focus: Record<string, number>, out: THREE.Box3) {
    out.makeEmpty();
    const car = this.car!;
    let total = 0;
    for (const k in focus) total += focus[k];
    const pick = total > 0.001 ? Object.entries(focus).sort((a, b) => b[1] - a[1])[0][0] : null;
    for (const p of car.parts) {
      if (pick && p.system !== pick) continue;
      const g = car.groupOffsets[p.system];
      const eP = pick ? Math.max(explode, 1) : explode;
      this.tmpV.copy(p.offset).multiplyScalar(eP);
      if (g) this.tmpV.addScaledVector(g, explode);
      this.tmpBox.copy(p.box).translate(this.tmpV);
      out.union(this.tmpBox);
    }
    if (out.isEmpty()) out.set(new THREE.Vector3(-2, 0, -1), new THREE.Vector3(2, 1.3, 1));
    return out;
  }

  /** apply explode/focus/xray to the parts */
  applyView() {
    const car = this.car;
    if (!car) return;
    const v = this.view;
    let total = 0;
    for (const k in v.focus) total += v.focus[k];
    total = clamp(total);
    // focus centre
    const fc = new THREE.Vector3();
    let fw = 0;
    for (const [sys, w] of Object.entries(v.focus)) {
      if (w <= 0) continue;
      const b = this.groupBoxes.get(sys);
      if (!b) continue;
      const c = b.getCenter(new THREE.Vector3());
      const g = car.groupOffsets[sys];
      if (g) c.addScaledVector(g, v.explode);
      fc.addScaledVector(c, w);
      fw += w;
    }
    if (fw > 0) fc.multiplyScalar(1 / fw);
    const center = new THREE.Vector3();
    for (const p of car.parts) {
      const self = v.focus[p.system] ?? 0;
      const other = clamp(total - self);
      const g = car.groupOffsets[p.system];
      const eP = Math.max(v.explode, self);
      const pos = p.root.position.copy(p.home);
      if (g) pos.addScaledVector(g, v.explode);
      pos.addScaledVector(p.offset, eP);
      if (other > 0.001) {
        p.box.getCenter(center);
        const dir = center.sub(fc);
        dir.y = Math.max(0, dir.y) * 0.4;
        const len = dir.length() || 1;
        pos.addScaledVector(dir, (0.85 * other) / len);
        pos.y += 0.0;
      }
      const alpha = (1 - 0.94 * other) * this.carFade;
      p.fade = alpha;
      p.applyOpacity(alpha, p.system === 'body' ? v.xray : 0);
    }
  }

  updateCamera(dt: number, desired: { target: THREE.Vector3; az: number; el: number; dist: number }, snap = false) {
    const k = snap ? 1 : 1 - Math.exp(-dt * 4.5);
    // shortest path for azimuth
    let daz = desired.az - this.az;
    daz = ((((daz + 180) % 360) + 360) % 360) - 180;
    this.az += daz * k;
    this.el = lerp(this.el, desired.el, k);
    this.dist = lerp(this.dist, desired.dist, k);
    this.target.lerp(desired.target, k);
    this.shiftX = lerp(this.shiftX, this.wantShiftX, snap ? 1 : 1 - Math.exp(-dt * 3));
    this.shiftY = lerp(this.shiftY, this.wantShiftY, snap ? 1 : 1 - Math.exp(-dt * 3));

    const a = this.az * DEG;
    const e = this.el * DEG;
    this.camera.position.set(
      this.target.x + this.dist * Math.cos(e) * Math.cos(a),
      this.target.y + this.dist * Math.sin(e),
      this.target.z + this.dist * Math.cos(e) * Math.sin(a),
    );
    if (this.camera.position.y < 0.15) this.camera.position.y = 0.15;
    this.camera.lookAt(this.target);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (Math.abs(this.shiftX) > 1e-4 || Math.abs(this.shiftY) > 1e-4) {
      this.camera.setViewOffset(w, h, -this.shiftX * w, -this.shiftY * h, w, h);
    } else if (this.camera.view) {
      this.camera.clearViewOffset();
    }
  }

  /** distance that fits a box of given radius into the view */
  fitDistance(radius: number) {
    const vf = (this.camera.fov * DEG) / 2;
    const hf = Math.atan(Math.tan(vf) * this.camera.aspect);
    return radius / Math.sin(Math.min(vf, hf));
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** crude adaptive resolution */
  trackPerf(dt: number) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 1 / 40 && this.dpr > 0.9) {
      this.dpr = Math.max(0.85, this.dpr - 0.25);
      this.renderer.setPixelRatio(this.dpr);
      this.resize();
    } else if (avg < 1 / 58 && this.dpr < Math.min(window.devicePixelRatio || 1, 1.75)) {
      this.dpr = Math.min(Math.min(window.devicePixelRatio || 1, 1.75), this.dpr + 0.25);
      this.renderer.setPixelRatio(this.dpr);
      this.resize();
    }
  }
}
