import * as THREE from 'three';
import { CARS, CAR_ORDER, type CarId, type ChapterState } from '../data/cars';
import { Stage } from './three/stage';
import { makeMaterials, clamp, lerp, smoothstep } from './three/kit';
import type { CarModel } from './three/model';
import type { Part } from './three/kit';
import { EngineAudio, Sim } from './sim';

type Mode = 'scroll' | 'explore';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const body = document.body;
const canvas = $<HTMLCanvasElement>('stage');
const isMobile = () => window.matchMedia('(max-width: 760px)').matches;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const MAT_COLORS: Record<CarId, { caliper: string; accent: string; twoTone: boolean }> = {
  gt3rs: { caliper: '#f0b81c', accent: '#ff5a1f', twoTone: false },
  tourbillon: { caliper: '#3d4f78', accent: '#3b82f6', twoTone: true },
};

const builders: Record<CarId, () => Promise<(lib: ReturnType<typeof makeMaterials>) => CarModel>> = {
  gt3rs: () => import('./three/gt3rs').then((m) => m.buildGT3RS),
  tourbillon: () => import('./three/tourbillon').then((m) => m.buildTourbillon),
};

// ------------------------------------------------------------------ state ---
const params = new URLSearchParams(location.search);
let carId: CarId = (CAR_ORDER as string[]).includes(params.get('car') ?? '') ? (params.get('car') as CarId) : 'gt3rs';
let mode: Mode = params.get('mode') === 'explore' ? 'explore' : 'scroll';

const models = new Map<CarId, CarModel>();
const sims = new Map<CarId, Sim>();
const paintIndex: Record<CarId, number> = { gt3rs: 0, tourbillon: 0 };

const explore = {
  explode: 0,
  xray: false,
  focus: null as string | null,
  aero: false,
  az: -38,
  el: 14,
  zoom: 1,
  pan: new THREE.Vector3(),
};
let throttleHeld = false;
let lastInput = performance.now();
let touring = false;
let tourIndex = 0;
let tourTimer = 0;
let aeroLevel = 0;
let wheelAngle = 0;
let floorOffset = 0;
let switching = false;

const stage = new Stage(canvas);
const audio = new EngineAudio();

// ------------------------------------------------------------- car setup ---
async function getModel(id: CarId) {
  let m = models.get(id);
  if (m) return m;
  const build = await builders[id]();
  const spec = CARS[id];
  const col = MAT_COLORS[id];
  const paint = spec.paints[paintIndex[id]].color;
  const lib = makeMaterials({ paint, paint2: paint, caliper: col.caliper, accent: col.accent });
  m = build(lib);
  models.set(id, m);
  sims.set(id, new Sim(spec.sim));
  applyPaint(m, paint);
  return m;
}

function applyPaint(m: CarModel, hex: string) {
  const c = new THREE.Color(hex);
  const c2 = MAT_COLORS[m.id].twoTone ? c.clone().multiplyScalar(0.32) : c;
  for (const p of m.parts)
    for (const mat of p.materials) {
      const key = (mat.userData as any).key;
      if (key === 'paint') (mat as THREE.MeshPhysicalMaterial).color.copy(c);
      if (key === 'paint2') (mat as THREE.MeshPhysicalMaterial).color.copy(c2);
    }
}

async function setCar(id: CarId, first = false) {
  if (switching) return;
  switching = true;
  const prev = carId;
  carId = id;
  body.dataset.car = id;
  const spec = CARS[id];
  body.style.setProperty('--accent', spec.accent);
  stage.setAccent(spec.accent);
  $('csMaker').textContent = spec.maker;
  $('csName').textContent = spec.name;
  document.querySelectorAll<HTMLElement>('[data-car-opt]').forEach((li) => li.setAttribute('aria-selected', String(li.dataset.carOpt === id)));
  if (!first && prev !== id) {
    // fade out
    await tween(250, (t) => (stage.carFade = 1 - t));
  }
  const model = await getModel(id);
  stage.setCar(model);
  stage.carFade = first ? 1 : 0;
  explore.focus = null;
  buildChips();
  buildRail();
  buildConsole();
  renderInfo();
  if (mode === 'scroll' && !first) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  syncUrl();
  if (!first) await tween(350, (t) => (stage.carFade = t));
  stage.carFade = 1;
  switching = false;
}

function tween(ms: number, fn: (t: number) => void) {
  return new Promise<void>((res) => {
    const t0 = performance.now();
    const step = () => {
      const t = clamp((performance.now() - t0) / ms);
      fn(t * t * (3 - 2 * t));
      if (t < 1) requestAnimationFrame(step);
      else res();
    };
    step();
  });
}

function syncUrl() {
  const u = new URL(location.href);
  u.searchParams.set('car', carId);
  u.searchParams.set('mode', mode);
  history.replaceState(null, '', u);
}

// ------------------------------------------------------------- top bar ---
const carBtn = $('carSelectBtn');
const carMenu = $('carMenu');
function openMenu(open: boolean) {
  carMenu.hidden = !open;
  carBtn.setAttribute('aria-expanded', String(open));
  if (open) (carMenu.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus();
}
carBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  openMenu(carMenu.hidden === true);
});
carMenu.querySelectorAll<HTMLElement>('[data-car-opt]').forEach((li) => {
  const pick = () => {
    openMenu(false);
    setCar(li.dataset.carOpt as CarId);
  };
  li.addEventListener('click', pick);
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = [...carMenu.querySelectorAll<HTMLElement>('[data-car-opt]')];
      const i = items.indexOf(li);
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
    } else if (e.key === 'Escape') {
      openMenu(false);
      carBtn.focus();
    }
  });
});
document.addEventListener('click', (e) => {
  if (!carMenu.hidden && !(e.target as HTMLElement).closest('#carSelect')) openMenu(false);
});

function setMode(m: Mode) {
  mode = m;
  body.dataset.mode = m;
  document.querySelectorAll<HTMLElement>('[data-mode-btn]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.modeBtn === m)));
  if (m === 'explore') {
    // carry the current scroll view over into explore
    explore.az = stage.az;
    explore.el = stage.el;
    explore.zoom = 1;
    explore.pan.set(0, 0, 0);
    explore.explode = stage.view.explode;
    explore.xray = stage.view.xray > 0.5;
    const top = Object.entries(stage.view.focus).sort((a, b) => b[1] - a[1])[0];
    explore.focus = top && top[1] > 0.5 ? top[0] : null;
    syncExploreUI();
    lastInput = performance.now();
  } else {
    stopTour();
    throttleHeld = false;
    requestAnimationFrame(() => updateChapter(true));
  }
  syncUrl();
}
document.querySelectorAll<HTMLElement>('[data-mode-btn]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.modeBtn as Mode)));
document.querySelectorAll<HTMLElement>('[data-goto-explore]').forEach((b) => b.addEventListener('click', () => setMode('explore')));
document.querySelectorAll<HTMLElement>('[data-switch-car]').forEach((b) =>
  b.addEventListener('click', () => setCar(CAR_ORDER.find((c) => c !== carId)!)),
);

// --------------------------------------------------------- scroll story ---
let chapterF = 0;
let activeChapter = -1;

function sections() {
  return [...document.querySelectorAll<HTMLElement>(`.story[data-story="${carId}"] .chapter`)];
}

function updateChapter(force = false) {
  const secs = sections();
  if (!secs.length) return;
  const mid = window.innerHeight * 0.5;
  const centers = secs.map((s) => {
    const r = s.getBoundingClientRect();
    return r.top + r.height / 2;
  });
  let f = 0;
  if (mid <= centers[0]) f = 0;
  else if (mid >= centers[centers.length - 1]) f = centers.length - 1;
  else {
    for (let i = 0; i < centers.length - 1; i++) {
      if (mid >= centers[i] && mid <= centers[i + 1]) {
        f = i + (mid - centers[i]) / (centers[i + 1] - centers[i]);
        break;
      }
    }
  }
  chapterF = f;
  const act = Math.round(f);
  if (act !== activeChapter || force) {
    activeChapter = act;
    secs.forEach((s, i) => s.classList.toggle('active', i === act));
    $('rail')
      .querySelectorAll('button')
      .forEach((b, i) => b.classList.toggle('on', i === act));
  }
}
window.addEventListener('scroll', () => updateChapter(), { passive: true });

function scrollTarget(): ChapterState {
  const chs = CARS[carId].chapters;
  const i = Math.min(chs.length - 1, Math.floor(chapterF));
  const j = Math.min(chs.length - 1, i + 1);
  const t = smoothstep(0.28, 0.78, chapterF - i);
  const A = chs[i].state;
  const B = chs[j].state;
  // shortest azimuth
  let daz = B.az - A.az;
  daz = ((((daz + 180) % 360) + 360) % 360) - 180;
  return {
    explode: lerp(A.explode, B.explode, t),
    xray: lerp(A.xray, B.xray, t),
    focus: t < 0.5 ? A.focus : B.focus,
    az: A.az + daz * t,
    el: lerp(A.el, B.el, t),
    zoom: lerp(A.zoom ?? 1, B.zoom ?? 1, t),
    // stash both for weights
    ...({ _fa: A.focus, _fb: B.focus, _t: t } as object),
  } as ChapterState;
}

function buildRail() {
  const rail = $('rail');
  rail.innerHTML = '';
  CARS[carId].chapters.forEach((ch, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', ch.title);
    b.innerHTML = `<span>${ch.title}</span>`;
    b.addEventListener('click', () => {
      const s = sections()[i];
      if (!s) return;
      const top = s.getBoundingClientRect().top + window.scrollY - (window.innerHeight - s.offsetHeight) / 2;
      window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
    rail.appendChild(b);
  });
  activeChapter = -1;
  updateChapter(true);
}

// --------------------------------------------------------- explore UI ---
const chipsEl = $('chips');
const explodeEl = $<HTMLInputElement>('explode');
const xrayBtn = $('xrayBtn');
const aeroBtn = $('aeroBtn');
const soundBtn = $('soundBtn');
const throttleBtn = $('throttleBtn');

function buildChips() {
  chipsEl.innerHTML = '';
  CARS[carId].subsystems.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.sys = s.id;
    b.setAttribute('aria-pressed', 'false');
    const key = i < 9 ? String(i + 1) : i === 9 ? '0' : '';
    b.innerHTML = `${key ? `<kbd>${key}</kbd>` : ''}${s.label}`;
    b.addEventListener('click', () => {
      userInput();
      setFocus(explore.focus === s.id ? null : s.id);
    });
    chipsEl.appendChild(b);
  });
  aeroBtn.textContent = carId === 'gt3rs' ? 'DRS' : 'Wing';
  syncExploreUI();
}

function setFocus(id: string | null) {
  explore.focus = id;
  explore.pan.set(0, 0, 0);
  syncExploreUI();
  renderInfo();
}

function syncExploreUI() {
  chipsEl.querySelectorAll<HTMLElement>('.chip').forEach((c) => {
    const on = c.dataset.sys === explore.focus;
    c.setAttribute('aria-pressed', String(on));
    if (on) c.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  });
  explodeEl.value = String(explore.explode);
  xrayBtn.setAttribute('aria-pressed', String(explore.xray));
  aeroBtn.setAttribute('aria-pressed', String(explore.aero));
  soundBtn.setAttribute('aria-pressed', String(audio.enabled));
}

function renderInfo() {
  const spec = CARS[carId];
  const sub = spec.subsystems.find((s) => s.id === explore.focus);
  const kicker = $('infoKicker');
  const title = $('infoTitle');
  const bodyEl = $('infoBody');
  const stats = $('infoStats');
  if (sub) {
    const idx = spec.subsystems.indexOf(sub) + 1;
    kicker.textContent = `${String(idx).padStart(2, '0')} / ${String(spec.subsystems.length).padStart(2, '0')} — ${spec.short}`;
    title.textContent = sub.label;
    bodyEl.textContent = sub.blurb;
    stats.innerHTML = sub.stats.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  } else {
    kicker.textContent = `${spec.maker} · ${spec.layout}`;
    title.textContent = spec.name;
    bodyEl.textContent = `${spec.tagline} Drag to orbit, scroll to zoom, click any part to isolate it.`;
    stats.innerHTML = spec.heroStats.map(([v, l]) => `<dt>${l}</dt><dd>${v}</dd>`).join('');
  }
  const paints = $('paints');
  paints.innerHTML = '<span>Paint</span>';
  spec.paints.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = p.name;
    b.setAttribute('aria-label', p.name);
    b.style.background = p.color;
    b.setAttribute('aria-pressed', String(i === paintIndex[carId]));
    b.addEventListener('click', () => {
      paintIndex[carId] = i;
      const m = models.get(carId);
      if (m) applyPaint(m, p.color);
      renderInfo();
    });
    paints.appendChild(b);
  });
  const n = document.createElement('span');
  n.className = 'pname';
  n.textContent = spec.paints[paintIndex[carId]].name;
  paints.appendChild(n);
}

explodeEl.addEventListener('input', () => {
  userInput();
  explore.explode = Number(explodeEl.value);
});
xrayBtn.addEventListener('click', () => {
  userInput();
  explore.xray = !explore.xray;
  syncExploreUI();
});
aeroBtn.addEventListener('click', () => {
  userInput();
  explore.aero = !explore.aero;
  syncExploreUI();
});
soundBtn.addEventListener('click', () => {
  if (audio.enabled) audio.disable();
  else audio.enable();
  syncExploreUI();
});
$('resetBtn').addEventListener('click', resetView);
function resetView() {
  userInput();
  explore.az = -38;
  explore.el = 14;
  explore.zoom = 1;
  explore.pan.set(0, 0, 0);
  explore.explode = 0;
  explore.xray = false;
  setFocus(null);
}
const press = (on: boolean) => {
  throttleHeld = on;
  throttleBtn.classList.toggle('on', on);
  if (on) userInput();
};
throttleBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  throttleBtn.setPointerCapture(e.pointerId);
  press(true);
});
throttleBtn.addEventListener('pointerup', () => press(false));
throttleBtn.addEventListener('pointercancel', () => press(false));
throttleBtn.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') press(true);
});
throttleBtn.addEventListener('keyup', (e) => {
  if (e.key === 'Enter') press(false);
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
  if (mode !== 'explore') return;
  const subs = CARS[carId].subsystems;
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) press(true);
    return;
  }
  if (/^[0-9]$/.test(e.key)) {
    const i = e.key === '0' ? 9 : Number(e.key) - 1;
    if (subs[i]) {
      userInput();
      setFocus(explore.focus === subs[i].id ? null : subs[i].id);
    }
  } else if (e.key === 'x' || e.key === 'X') xrayBtn.click();
  else if (e.key === 'd' || e.key === 'D') aeroBtn.click();
  else if (e.key === 'e' || e.key === 'E') {
    userInput();
    explore.explode = explore.explode > 0.5 ? 0 : 1;
    syncExploreUI();
  } else if (e.key === 'r' || e.key === 'R') resetView();
  else if (e.key === 'Escape') {
    userInput();
    setFocus(null);
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') press(false);
});

// --------------------------------------------------- pointer controls ---
const pointers = new Map<number, { x: number; y: number }>();
let dragMoved = 0;
let pinchDist = 0;
let panning = false;
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tooltip = $('tooltip');
let hoverPart: Part | null = null;

function userInput() {
  lastInput = performance.now();
  if (touring) stopTour();
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'explore') return;
  userInput();
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  dragMoved = 0;
  panning = e.button === 2 || e.shiftKey;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
  }
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', (e) => {
  if (mode !== 'explore') return;
  const p = pointers.get(e.pointerId);
  if (!p) {
    hover(e.clientX, e.clientY);
    return;
  }
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  userInput();
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDist > 0) explore.zoom = clamp(explore.zoom * (pinchDist / d), 0.35, 2.5);
    pinchDist = d;
    return;
  }
  if (panning) {
    const right = new THREE.Vector3().setFromMatrixColumn(stage.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(stage.camera.matrixWorld, 1);
    const s = stage.dist * 0.0012;
    explore.pan.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
  } else {
    explore.az += dx * 0.32;
    explore.el = clamp(explore.el + dy * 0.22, -5, 85);
  }
  tooltip.hidden = true;
});
const endPointer = (e: PointerEvent) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size === 0) canvas.classList.remove('dragging');
  pinchDist = 0;
  if (e.type === 'pointerup' && dragMoved < 6 && pointers.size === 0) {
    const part = pick(e.clientX, e.clientY);
    if (part) setFocus(explore.focus === part.system ? null : part.system);
    else if (explore.focus) setFocus(null);
  }
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => {
  tooltip.hidden = true;
  canvas.classList.remove('hovering');
});
canvas.addEventListener(
  'wheel',
  (e) => {
    if (mode !== 'explore') return;
    e.preventDefault();
    userInput();
    explore.zoom = clamp(explore.zoom * Math.exp(e.deltaY * 0.0012), 0.35, 2.5);
  },
  { passive: false },
);

function pick(x: number, y: number): Part | null {
  const m = models.get(carId);
  if (!m) return null;
  const r = canvas.getBoundingClientRect();
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, stage.camera);
  const hits = raycaster.intersectObject(m.root, true);
  for (const h of hits) {
    const part = h.object.userData.part as Part | undefined;
    if (!part || !(h.object as THREE.Mesh).isMesh) continue;
    const mat = (h.object as THREE.Mesh).material as THREE.Material & { opacity: number };
    if (!mat.visible || mat.opacity < 0.3) continue;
    return part;
  }
  return null;
}

let hoverRaf = 0;
function hover(x: number, y: number) {
  if (hoverRaf) return;
  hoverRaf = requestAnimationFrame(() => {
    hoverRaf = 0;
    const part = pick(x, y);
    hoverPart = part;
    if (!part) {
      tooltip.hidden = true;
      canvas.classList.remove('hovering');
      return;
    }
    const sub = CARS[carId].subsystems.find((s) => s.id === part.system);
    tooltip.innerHTML = `${sub?.label ?? part.system}<small>${part.name.replace(/-/g, ' ')}</small>`;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.hidden = false;
    canvas.classList.add('hovering');
  });
}
void hoverPart;

// -------------------------------------------------------------- tour ---
function startTour() {
  touring = true;
  tourTimer = 0;
  $('tourBadge').hidden = false;
}
function stopTour() {
  touring = false;
  $('tourBadge').hidden = true;
}

// ----------------------------------------------------------- console ---
const tach = $('tach') as unknown as SVGSVGElement;
const chart = $('chart') as unknown as SVGSVGElement;
let needle: SVGLineElement | null = null;
let rpmArc: SVGPathElement | null = null;
let chartDot: SVGCircleElement | null = null;
let chartLine: SVGLineElement | null = null;
let cylCells: HTMLElement[] = [];
const ARC0 = -225;
const ARC1 = 45;

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}
function arcPath(r: number, d0: number, d1: number) {
  const [x0, y0] = polar(60, 60, r, d0);
  const [x1, y1] = polar(60, 60, r, d1);
  const large = d1 - d0 > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function buildConsole() {
  const spec = CARS[carId];
  const red = spec.sim.redlineRpm;
  const max = Math.ceil(red / 1000) + 1;
  let s = `<circle cx="60" cy="60" r="54" fill="none" stroke="rgba(21,23,27,.08)" stroke-width="1"/>`;
  s += `<path d="${arcPath(48, ARC0, ARC1)}" fill="none" stroke="rgba(21,23,27,.1)" stroke-width="6" stroke-linecap="round"/>`;
  const degOf = (rpm: number) => ARC0 + (rpm / (max * 1000)) * (ARC1 - ARC0);
  s += `<path d="${arcPath(48, degOf(red * 0.92), degOf(max * 1000))}" fill="none" stroke="${spec.accent}" stroke-width="6" opacity=".45"/>`;
  s += `<path id="rpmArc" d="" fill="none" stroke="#15171b" stroke-width="6" stroke-linecap="round"/>`;
  for (let k = 0; k <= max; k++) {
    const d = degOf(k * 1000);
    const [x0, y0] = polar(60, 60, 42, d);
    const [x1, y1] = polar(60, 60, 37, d);
    const [tx, ty] = polar(60, 60, 30, d);
    s += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#15171b" stroke-width="1.4"/>`;
    s += `<text x="${tx}" y="${ty + 3}" font-size="8" text-anchor="middle" fill="#4a4d55" font-family="JetBrains Mono, monospace">${k}</text>`;
  }
  s += `<line id="needle" x1="60" y1="60" x2="60" y2="16" stroke="${spec.accent}" stroke-width="2.2" stroke-linecap="round"/>`;
  s += `<circle cx="60" cy="60" r="4" fill="#15171b"/>`;
  s += `<text id="rpmTxt" x="60" y="101" font-size="11" font-weight="600" text-anchor="middle" fill="#15171b" font-family="JetBrains Mono, monospace">0</text>`;
  s += `<text x="60" y="111" font-size="6.5" letter-spacing=".6" text-anchor="middle" fill="#7a776f" font-family="JetBrains Mono, monospace">RPM</text>`;
  tach.innerHTML = s;
  needle = tach.querySelector('#needle');
  rpmArc = tach.querySelector('#rpmArc');

  // power chart
  const sim = sims.get(carId)!;
  const e = spec.sim.electric?.powerKW ?? 0;
  const pMax = (spec.sim.peakPowerKW + e) * 1.05;
  const X = (rpm: number) => 8 + (rpm / red) * 186;
  const Yp = (kw: number) => 58 - (kw / pMax) * 50;
  let d = '';
  let d2 = '';
  for (let i = 0; i <= 60; i++) {
    const rpm = spec.sim.idleRpm + ((red - spec.sim.idleRpm) * i) / 60;
    d += `${i ? 'L' : 'M'}${X(rpm).toFixed(1)} ${Yp(sim.icePower(rpm)).toFixed(1)}`;
    if (e) d2 += `${i ? 'L' : 'M'}${X(rpm).toFixed(1)} ${Yp(sim.icePower(rpm) + e).toFixed(1)}`;
  }
  let c = `<line x1="8" y1="58" x2="194" y2="58" stroke="rgba(21,23,27,.2)"/>`;
  for (let k = 0; k <= red; k += 1000) c += `<line x1="${X(k)}" y1="58" x2="${X(k)}" y2="60" stroke="rgba(21,23,27,.35)"/>`;
  if (d2) c += `<path d="${d2}" fill="none" stroke="#22b59a" stroke-width="1.4" stroke-dasharray="3 2"/>`;
  c += `<path d="${d} L${X(red)} 58 L${X(spec.sim.idleRpm)} 58 Z" fill="${spec.accent}" opacity=".12"/>`;
  c += `<path d="${d}" fill="none" stroke="#15171b" stroke-width="1.5"/>`;
  c += `<line id="cLine" x1="0" y1="8" x2="0" y2="58" stroke="${spec.accent}" stroke-width="1"/>`;
  c += `<circle id="cDot" r="3.2" cx="0" cy="0" fill="${spec.accent}" stroke="#fff" stroke-width="1.2"/>`;
  c += `<text x="8" y="7" font-size="7" fill="#4a4d55" font-family="JetBrains Mono, monospace">POWER vs RPM${e ? ' · dashed = +e-motors' : ''}</text>`;
  chart.innerHTML = c;
  chartDot = chart.querySelector('#cDot');
  chartLine = chart.querySelector('#cLine');
  (chart as any)._X = X;
  (chart as any)._Y = Yp;

  // cylinder strip
  const cyl = $('cyl');
  const N = spec.sim.cylinders;
  cyl.style.gridTemplateColumns = `repeat(${N > 8 ? 8 : N}, 1fr)`;
  cyl.innerHTML = Array.from({ length: N }, () => '<i></i>').join('');
  cylCells = [...cyl.querySelectorAll<HTMLElement>('i')];
  $('batt').hidden = !spec.sim.electric;
  $('launch').textContent = '—';
}

let uiClock = 0;
function updateConsole(dt: number) {
  uiClock += dt;
  const model = models.get(carId);
  const sim = sims.get(carId);
  if (!model || !sim) return;
  // cylinder cells every frame (cheap)
  const lv = model.engine.levels;
  for (let i = 0; i < cylCells.length; i++) {
    const g = lv[i] ?? 0;
    cylCells[i].style.background = g > 0.02 ? `rgba(255,${Math.round(150 - g * 60)},30,${0.25 + g * 0.75})` : '';
  }
  if (uiClock < 1 / 24) return;
  uiClock = 0;
  const spec = CARS[carId];
  const max = (Math.ceil(spec.sim.redlineRpm / 1000) + 1) * 1000;
  const deg = ARC0 + (sim.rpm / max) * (ARC1 - ARC0);
  needle?.setAttribute('transform', `rotate(${deg + 90} 60 60)`);
  rpmArc?.setAttribute('d', arcPath(48, ARC0, Math.max(ARC0 + 0.5, deg)));
  const rpmTxt = tach.querySelector('#rpmTxt');
  if (rpmTxt) rpmTxt.textContent = String(Math.round(sim.rpm / 10) * 10);
  $('kmh').textContent = String(Math.round(sim.kmh));
  const gearEl = $('gear');
  gearEl.textContent = sim.neutral ? 'N' : String(sim.gear);
  gearEl.classList.toggle('flash', sim.shiftFlash > 0.2);
  $('ps').textContent = String(Math.round((sim.powerKW + Math.max(0, sim.ePowerKW)) * 1.3596));
  const X = (chart as any)._X as (r: number) => number;
  const Y = (chart as any)._Y as (k: number) => number;
  if (chartDot && X) {
    const x = X(sim.rpm);
    chartDot.setAttribute('cx', x.toFixed(1));
    chartDot.setAttribute('cy', Y(sim.powerKW + Math.max(0, sim.ePowerKW)).toFixed(1));
    chartLine?.setAttribute('x1', x.toFixed(1));
    chartLine?.setAttribute('x2', x.toFixed(1));
  }
  if (spec.sim.electric) {
    $('battFill').style.width = `${Math.round(sim.soc * 100)}%`;
    $('battPct').textContent = `${Math.round(sim.soc * 100)}%`;
    $('ePs').textContent = String(Math.round(sim.ePowerKW * 1.3596));
  }
  if (sim.launchTime) $('launch').textContent = `${sim.launchTime.toFixed(1)} s`;
}

// ------------------------------------------------------------- frame ---
const focusW: Record<string, number> = {};
const tmpBoxA = new THREE.Box3();
const tmpBoxB = new THREE.Box3();
const desired = { target: new THREE.Vector3(), az: 0, el: 0, dist: 7 };
let last = performance.now();
let first = true;
let tClock = 0;

function frame(now: number) {
  requestAnimationFrame(frame);
  const rawDt = Math.max(0, (now - last) / 1000);
  const dt = Math.min(0.05, rawDt);
  last = now;
  tClock += dt;
  const model = models.get(carId);
  const sim = sims.get(carId);
  if (!model || !sim || stage.car !== model) {
    stage.render();
    return;
  }

  // ---- target state
  let tgt: ChapterState;
  let fa: string | null = null;
  let fb: string | null = null;
  let ft = 0;
  if (mode === 'scroll') {
    tgt = scrollTarget();
    fa = (tgt as any)._fa;
    fb = (tgt as any)._fb;
    ft = (tgt as any)._t;
  } else {
    if (!touring && now - lastInput > 25000) startTour();
    if (touring) {
      tourTimer -= dt;
      explore.az += dt * 9;
      if (tourTimer <= 0) {
        const subs = CARS[carId].subsystems;
        tourIndex = (tourIndex + 1) % (subs.length + 1);
        const id = tourIndex === subs.length ? null : subs[tourIndex].id;
        explore.focus = id;
        explore.explode = id ? 0.35 : 1;
        explore.xray = !!id;
        syncExploreUI();
        renderInfo();
        tourTimer = 5;
      }
    } else if (now - lastInput > 6000) {
      explore.az += dt * 4; // gentle idle drift
    }
    tgt = { explode: explore.explode, xray: explore.xray ? 1 : 0, focus: explore.focus, az: explore.az, el: explore.el, zoom: explore.zoom };
    fa = explore.focus;
  }

  // ---- damp view state
  const k = first ? 1 : 1 - Math.exp(-dt * (mode === 'scroll' ? 7 : 5));
  const v = stage.view;
  v.explode = lerp(v.explode, tgt.explode, k);
  v.xray = lerp(v.xray, tgt.xray, k);
  const want: Record<string, number> = {};
  if (mode === 'scroll') {
    if (fa) want[fa] = (want[fa] ?? 0) + (1 - ft);
    if (fb) want[fb] = (want[fb] ?? 0) + ft;
  } else if (fa) want[fa] = 1;
  for (const s of new Set([...Object.keys(focusW), ...Object.keys(want)])) {
    focusW[s] = lerp(focusW[s] ?? 0, want[s] ?? 0, k);
    if (focusW[s] < 0.001 && !want[s]) delete focusW[s];
  }
  v.focus = focusW;
  stage.applyView();

  // ---- camera framing
  let total = 0;
  for (const s in focusW) total += focusW[s];
  total = clamp(total);
  stage.frameFor(v.explode, {}, tmpBoxA);
  const cA = tmpBoxA.getCenter(new THREE.Vector3());
  const rA = tmpBoxA.getSize(new THREE.Vector3()).length() / 2;
  let c = cA;
  let r = rA;
  if (total > 0.001) {
    stage.frameFor(v.explode, focusW, tmpBoxB);
    const cB = tmpBoxB.getCenter(new THREE.Vector3());
    const rB = Math.max(0.95, tmpBoxB.getSize(new THREE.Vector3()).length() / 2);
    const tt = smoothstep(0, 1, total);
    c = cA.lerp(cB, tt);
    r = lerp(rA, rB, tt);
  }
  desired.target.copy(c);
  if (mode === 'explore') desired.target.add(explore.pan);
  desired.az = tgt.az;
  desired.el = tgt.el;
  desired.dist = stage.fitDistance(r) * (tgt.zoom ?? 1) * 0.9;
  const mobile = isMobile();
  if (mode === 'scroll') {
    stage.wantShiftX = mobile ? 0 : 0.13;
    stage.wantShiftY = mobile ? -0.13 : 0;
    if (mobile) desired.dist *= 0.86;
  } else {
    stage.wantShiftX = 0;
    stage.wantShiftY = mobile ? -0.12 : 0.02;
  }
  stage.updateCamera(dt, desired, first);

  // ---- simulation
  const inEngine = (focusW['engine'] ?? 0) > 0.5 || (focusW['transmission'] ?? 0) > 0.5;
  if (mode === 'scroll') {
    sim.neutral = true;
    const blip = inEngine && !reduceMotion ? (Math.sin(tClock * 1.6) > 0.55 ? 0.8 : 0) : 0;
    sim.throttle = blip;
  } else {
    sim.neutral = false;
    sim.throttle = throttleHeld ? 1 : 0;
  }
  // physics runs on real elapsed time (sub-stepped) so slow frames don't slow the car down
  let simLeft = Math.min(0.25, rawDt);
  while (simLeft > 1e-4) {
    const h = Math.min(1 / 60, simLeft);
    sim.step(h);
    simLeft -= h;
  }
  sim.animate(dt, reduceMotion ? 0.02 : 0.0625);
  model.engine.update(sim.crankDeg);
  const cr = (sim.crankDeg * Math.PI) / 180;
  const ratio = model.gearbox.ratios[Math.min(sim.gear, model.gearbox.ratios.length) - 1] ?? 1;
  model.gearbox.inSpin.rotation.x = cr;
  model.gearbox.outSpin.rotation.x = -cr / ratio;
  const visual = 0.1;
  wheelAngle += (sim.speed / 0.36) * dt * visual;
  for (const w of model.wheels) w.spin.rotation.z = -wheelAngle;
  for (const m of model.motors) m.rotation.x = wheelAngle * 3;
  floorOffset += sim.speed * dt * visual;
  stage.floorMat.uniforms.uOffset.value = floorOffset % 1000;

  // aero actuator
  const aeroWant =
    mode === 'scroll'
      ? (focusW['aero'] ?? 0) > 0.5
        ? 1
        : 0
      : explore.aero
        ? 1
        : sim.kmh > 180 && carId === 'tourbillon'
          ? 1
          : 0;
  aeroLevel = lerp(aeroLevel, aeroWant, 1 - Math.exp(-dt * 3));
  model.setAero(aeroLevel);

  audio.update(sim.rpm, sim.pedal, model.engine.cylinders);
  updateConsole(dt);
  stage.trackPerf(dt);
  stage.render();
  first = false;
}

// -------------------------------------------------------------- boot ---
function onResize() {
  stage.resize();
}
window.addEventListener('resize', onResize);

async function boot() {
  body.dataset.mode = mode;
  document.querySelectorAll<HTMLElement>('[data-mode-btn]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.modeBtn === mode)));
  stage.resize();
  await setCar(carId, true);
  if (mode === 'explore') setMode('explore');
  updateChapter(true);
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });
  setTimeout(() => $('veil').classList.add('gone'), 150);
  // warm the other car in the background
  const other = CAR_ORDER.find((c) => c !== carId)!;
  const idle = (window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1200));
  idle(() => getModel(other));
}

boot().catch((err) => {
  console.error(err);
  const v = $('veil');
  v.querySelector('span')!.textContent = 'Could not start WebGL. Try a different browser.';
});
