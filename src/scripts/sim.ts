import type { SimSpec } from '../data/cars';

/**
 * A tiny longitudinal "dyno" model: one throttle input drives everything
 * the panels show (rpm, speed, gear, power, battery).
 */
export class Sim {
  rpm: number;
  speed = 0; // m/s
  gear = 1;
  throttle = 0;
  /** smoothed throttle (pedal travel) */
  pedal = 0;
  crankDeg = 0;
  wheelAngle = 0;
  distance = 0;
  powerKW = 0;
  ePowerKW = 0;
  soc = 0.82;
  shiftFlash = 0;
  /** free-rev in neutral (no drive to the wheels) */
  neutral = false;
  launchTime: number | null = null;
  private timing = false;
  private t0 = 0;
  private clock = 0;
  readonly cdA: number;
  readonly speedPer1k: number[]; // m/s per 1000 rpm per gear

  constructor(public spec: SimSpec) {
    this.rpm = spec.idleRpm;
    const total = spec.peakPowerKW + (spec.electric?.powerKW ?? 0);
    const vmax = spec.topSpeedKmh / 3.6;
    this.cdA = (total * 1000) / (0.6 * vmax ** 3);
    const v1 = spec.firstGearKmh / 3.6;
    const vTop = vmax * 1.04;
    const n = spec.gears;
    this.speedPer1k = Array.from({ length: n }, (_, i) => {
      const v = v1 * Math.pow(vTop / v1, i / (n - 1));
      return v / (spec.redlineRpm / 1000);
    });
  }

  /** combustion power at rpm (normalised cubic) */
  icePower(rpm: number) {
    const x = rpm / this.spec.peakPowerRpm;
    const p = x + x * x - x * x * x;
    return Math.max(0, this.spec.peakPowerKW * p);
  }

  torqueNm(rpm: number) {
    return (this.icePower(rpm) * 1000) / Math.max(1, (rpm * 2 * Math.PI) / 60);
  }

  step(dt: number) {
    const s = this.spec;
    this.clock += dt;
    this.pedal += (this.throttle - this.pedal) * (1 - Math.exp(-dt * 10));
    const m = s.massKg;
    const v = this.speed;
    const ratio = this.speedPer1k[this.gear - 1];
    // engine speed follows road speed (clutch slips below idle-ish)
    const wheelRpm = (v / ratio) * 1000;
    const launchRpm = s.idleRpm + this.pedal * (s.redlineRpm * 0.55 - s.idleRpm);
    let targetRpm = this.gear === 1 && wheelRpm < launchRpm ? launchRpm : wheelRpm;
    if (this.neutral) targetRpm = s.idleRpm + this.pedal * (s.redlineRpm * 0.96 - s.idleRpm);
    this.rpm += (Math.max(s.idleRpm, targetRpm) - this.rpm) * (1 - Math.exp(-dt * (this.neutral ? 5 : 14)));
    this.rpm = Math.min(this.rpm, s.redlineRpm);

    const ice = this.icePower(this.rpm) * this.pedal;
    let e = 0;
    if (s.electric) {
      // e-motors fill in at low speed, fade toward top speed, regen on lift
      const share = this.pedal > 0.05 && this.soc > 0.05 && !this.neutral ? this.pedal : 0;
      e = s.electric.powerKW * share;
      if (this.pedal < 0.05 && v > 2 && !this.neutral) e = -Math.min(120, v * 4);
      this.soc -= ((e / 3600) * dt) / s.electric.batteryKWh;
      this.soc = Math.min(0.98, Math.max(0.02, this.soc));
    }
    this.powerKW = ice;
    this.ePowerKW = e;
    const P = (ice + Math.max(0, e)) * 1000;
    const drive = this.pedal > 0.01 && !this.neutral ? Math.min(s.maxAccel * this.pedal * m, P / Math.max(v, 1.5)) : 0;
    const drag = 0.5 * 1.2 * this.cdA * v * v + 0.015 * m * 9.81;
    const brake = this.pedal < 0.05 ? m * (v > 0.5 ? 3.2 : 0) : 0;
    let a = (drive - drag - brake) / m;
    this.speed = Math.max(0, v + a * dt);
    if (this.speed < 0.05 && this.pedal < 0.05) this.speed = 0;
    this.distance += this.speed * dt;

    // shifting
    if (this.neutral) {
      /* no shifting while free-revving */
    } else if (this.rpm > s.redlineRpm * 0.975 && this.gear < s.gears && this.pedal > 0.3) {
      this.gear++;
      this.shiftFlash = 1;
    } else if (this.gear > 1) {
      const down = (this.speed / this.speedPer1k[this.gear - 2]) * 1000;
      if (down < s.redlineRpm * 0.6) {
        this.gear--;
        this.shiftFlash = 0.6;
      }
    }
    this.shiftFlash = Math.max(0, this.shiftFlash - dt * 3);

    // 0-100 timing
    if (!this.timing && !this.neutral && this.speed < 0.3 && this.pedal > 0.6) {
      this.timing = true;
      this.t0 = this.clock;
      this.launchTime = null;
    }
    if (this.timing) {
      if (this.speed * 3.6 >= 100) {
        this.launchTime = this.clock - this.t0;
        this.timing = false;
      } else if (this.pedal < 0.3) this.timing = false;
    }
    void a;
  }

  /** advance visual crank angle (slowed down so motion stays readable) */
  animate(dt: number, slow = 0.06) {
    this.crankDeg = (this.crankDeg + (this.rpm / 60) * 360 * slow * dt) % 1440;
  }

  get kmh() {
    return this.speed * 3.6;
  }
}

/** Synthesised engine note: firing frequency drives two detuned oscillators */
export class EngineAudio {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode[] = [];
  private gain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  enabled = false;

  enable() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.Q.value = 4;
      const shaper = this.ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = (i / 1023) * 2 - 1;
        curve[i] = Math.tanh(x * 2.2);
      }
      shaper.curve = curve;
      for (const [type, det] of [
        ['sawtooth', 0],
        ['square', 0.5],
        ['sawtooth', 7],
      ] as [OscillatorType, number][]) {
        const o = this.ctx.createOscillator();
        o.type = type;
        o.detune.value = det;
        o.connect(shaper);
        o.start();
        this.osc.push(o);
      }
      shaper.connect(this.filter);
      this.filter.connect(this.gain);
      this.gain.connect(this.ctx.destination);
    }
    this.ctx.resume();
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
    if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  update(rpm: number, pedal: number, cylinders: number) {
    if (!this.ctx || !this.enabled || !this.gain || !this.filter) return;
    const t = this.ctx.currentTime;
    const fire = (rpm / 60) * (cylinders / 2);
    const base = cylinders > 8 ? fire / 4 : fire / 2;
    this.osc[0].frequency.setTargetAtTime(base, t, 0.02);
    this.osc[1].frequency.setTargetAtTime(base / 2, t, 0.02);
    this.osc[2].frequency.setTargetAtTime(base * 1.5, t, 0.02);
    this.filter.frequency.setTargetAtTime(300 + pedal * 2600 + rpm * 0.12, t, 0.03);
    this.gain.gain.setTargetAtTime(0.035 + pedal * 0.07, t, 0.05);
  }
}
