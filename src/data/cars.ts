// Shared content + simulation parameters for both cars.
// Used by the Astro page (static HTML for the scroll story) and by the 3D client.

export type CarId = 'gt3rs' | 'tourbillon';

export interface Subsystem {
  id: string;
  label: string;
  blurb: string;
  stats: [string, string][];
}

export interface ChapterState {
  /** 0 = assembled, 1 = fully exploded */
  explode: number;
  /** 0 = painted body, 1 = glass body */
  xray: number;
  /** subsystem id to isolate (others ghost and step aside) */
  focus: string | null;
  /** camera azimuth in degrees (0 = front, 90 = right side, 180 = rear) */
  az: number;
  /** camera elevation in degrees */
  el: number;
  /** distance multiplier on the auto-framed distance */
  zoom?: number;
}

export interface Chapter {
  kicker: string;
  title: string;
  body: string;
  stats?: [string, string][];
  state: ChapterState;
}

export interface SimSpec {
  cylinders: number;
  idleRpm: number;
  redlineRpm: number;
  /** combustion engine peak power */
  peakPowerKW: number;
  peakPowerRpm: number;
  massKg: number;
  topSpeedKmh: number;
  /** traction-limited acceleration, m/s^2 */
  maxAccel: number;
  gears: number;
  /** top speed of first gear at redline, km/h */
  firstGearKmh: number;
  electric?: { powerKW: number; batteryKWh: number };
}

export interface CarSpec {
  id: CarId;
  maker: string;
  name: string;
  short: string;
  tagline: string;
  layout: string;
  accent: string;
  paints: { name: string; color: string; accent?: string }[];
  heroStats: [string, string][];
  sim: SimSpec;
  subsystems: Subsystem[];
  chapters: Chapter[];
}

export const CARS: Record<CarId, CarSpec> = {
  gt3rs: {
    id: 'gt3rs',
    maker: 'Porsche',
    name: '911 GT3 RS',
    short: 'GT3 RS',
    tagline: 'A road car built around one number: downforce.',
    layout: 'Rear engine · rear-wheel drive',
    accent: '#ff5a1f',
    paints: [
      { name: 'Shark Blue', color: '#2f7fd6' },
      { name: 'Python Green', color: '#5fb04a' },
      { name: 'Guards Red', color: '#c8161d' },
      { name: 'GT Silver', color: '#a9adb1' },
    ],
    heroStats: [
      ['525 PS', 'at 8,500 rpm'],
      ['9,000', 'rpm redline'],
      ['3.2 s', '0–100 km/h'],
      ['860 kg', 'downforce at 285 km/h'],
    ],
    sim: {
      cylinders: 6,
      idleRpm: 950,
      redlineRpm: 9000,
      peakPowerKW: 386,
      peakPowerRpm: 8500,
      massKg: 1450,
      topSpeedKmh: 296,
      maxAccel: 9.6,
      gears: 7,
      firstGearKmh: 62,
    },
    subsystems: [
      {
        id: 'body',
        label: 'Body & Glass',
        blurb:
          'Steel-and-aluminium shell with carbon doors, roof, front lid and fenders. The wheel arches carry louvres that bleed high-pressure air out of the wells.',
        stats: [['Length', '4,572 mm'], ['Width', '1,900 mm'], ['Height', '1,322 mm']],
      },
      {
        id: 'engine',
        label: 'Flat-Six',
        blurb:
          '4.0-litre naturally aspirated boxer derived from the race car. Six individual throttle bodies, dry-sump lubrication and rigid valve drive let it rev to 9,000 rpm.',
        stats: [['Displacement', '3,996 cc'], ['Power', '525 PS @ 8,500'], ['Torque', '465 Nm @ 6,300'], ['Redline', '9,000 rpm']],
      },
      {
        id: 'transmission',
        label: 'PDK Gearbox',
        blurb:
          'Seven-speed dual-clutch transmission with short ratios. One clutch holds the odd gears, the other the even ones, so the next gear is always preselected.',
        stats: [['Gears', '7 + R'], ['Type', 'Dual-clutch'], ['Drive', 'Rear wheels']],
      },
      {
        id: 'suspension',
        label: 'Suspension',
        blurb:
          'Double wishbones at the front, multi-link at the rear, with aerodynamically shaped arms. Damping is adjustable from the steering wheel.',
        stats: [['Front', 'Double wishbone'], ['Rear', 'Multi-link'], ['Wheelbase', '2,457 mm']],
      },
      {
        id: 'wheels',
        label: 'Wheels & Brakes',
        blurb:
          'Centre-lock forged wheels in staggered sizes. Six-piston monobloc calipers clamp 408 mm discs at the front.',
        stats: [['Front tyre', '275/35 R20'], ['Rear tyre', '335/30 R21'], ['Front discs', '408 mm']],
      },
      {
        id: 'cooling',
        label: 'Cooling',
        blurb:
          'One large central radiator sits where the luggage compartment used to be. That freed the sides of the nose for active aero elements.',
        stats: [['Layout', 'Central radiator'], ['Exit', 'Hood vents']],
      },
      {
        id: 'aero',
        label: 'Aero & DRS',
        blurb:
          'A swan-neck rear wing, taller than the roof, with a hydraulic DRS flap. Together with the front flaps it makes 860 kg of downforce at 285 km/h.',
        stats: [['Downforce', '860 kg @ 285'], ['Rear wing', 'Swan-neck + DRS'], ['Top speed', '296 km/h']],
      },
      {
        id: 'exhaust',
        label: 'Exhaust',
        blurb: 'Titanium-tipped system with valve control. Twin centre tips sit inside the rear diffuser.',
        stats: [['Tips', 'Twin centre'], ['Valves', 'Electronically controlled']],
      },
      {
        id: 'chassis',
        label: 'Chassis',
        blurb:
          'Steel floor pan, sills and bulkheads, with bolt-on front and rear subframes that carry the suspension, engine and gearbox.',
        stats: [['Kerb weight', '1,450 kg'], ['Wheelbase', '2,457 mm']],
      },
      {
        id: 'interior',
        label: 'Cabin & Cage',
        blurb:
          'With the Clubsport package: a bolted-in steel roll cage and six-point harnesses. Carbon full bucket seats and a round wheel with four rotary dials.',
        stats: [['Seats', 'Carbon buckets'], ['Cage', 'Bolted-in steel'], ['Wheel', 'Round, 4 rotary dials']],
      },
      {
        id: 'fuel',
        label: 'Fuel Tank',
        blurb: 'Mounted ahead of the cabin between the front wheels, just like every 911 since 1963.',
        stats: [['Capacity', '64 L'], ['Position', 'Front axle']],
      },
    ],
    chapters: [
      {
        kicker: '01 — The machine',
        title: 'Porsche 911 GT3 RS',
        body: 'Engine behind the rear axle, wing above the roof. Scroll and the car comes apart one system at a time.',
        state: { explode: 0, xray: 0, focus: null, az: -38, el: 12, zoom: 1.28 },
      },
      {
        kicker: '02 — The skin',
        title: 'Glass it',
        body: 'Under the paint is a tight package: fuel up front, radiator in the nose, people in the middle, six cylinders hung out the back.',
        state: { explode: 0, xray: 1, focus: null, az: -70, el: 22, zoom: 1.12 },
      },
      {
        kicker: '03 — Teardown',
        title: 'Every part, in its place',
        body: 'Each subsystem lifts out along its own axis, so you can see how the car is assembled.',
        state: { explode: 1, xray: 0.3, focus: null, az: -40, el: 28, zoom: 1.12 },
      },
      {
        kicker: '04 — Flat-six',
        title: '4.0 litres, 9,000 rpm',
        body: 'Two banks of three cylinders face each other across the crankshaft. The liners are glass here, so you can watch the pistons move and see each charge light on its power stroke.',
        stats: [['525 PS', '@ 8,500 rpm'], ['465 Nm', '@ 6,300 rpm']],
        state: { explode: 0.35, xray: 1, focus: 'engine', az: -150, el: 30, zoom: 1 },
      },
      {
        kicker: '05 — PDK',
        title: 'Seven gears, two clutches',
        body: 'Odd gears on one shaft, even gears on the other, so the next shift is already engaged. The ratios are shorter than on the standard 911.',
        stats: [['7', 'forward gears'], ['< 100 ms', 'shift time']],
        state: { explode: 0.35, xray: 1, focus: 'transmission', az: -120, el: 26, zoom: 1 },
      },
      {
        kicker: '06 — Contact patch',
        title: 'Wishbones and big rubber',
        body: 'Double wishbones up front and multi-link at the rear hold 275 and 335 mm tyres flat on the road. Six-piston calipers bite on 408 mm discs.',
        stats: [['275 / 335', 'tyre width, mm'], ['408 mm', 'front discs']],
        state: { explode: 0.6, xray: 1, focus: 'suspension', az: 35, el: 24, zoom: 1 },
      },
      {
        kicker: '07 — Air',
        title: '860 kg of downforce',
        body: 'The central radiator vents through the hood. At the back, the swan-neck wing and its DRS flap trade drag for grip.',
        stats: [['860 kg', '@ 285 km/h'], ['DRS', 'at the press of a button']],
        state: { explode: 0.5, xray: 0.6, focus: 'aero', az: -150, el: 18, zoom: 1 },
      },
      {
        kicker: '08 — Inside',
        title: 'Cage, buckets, harnesses',
        body: 'A bolted-in roll cage, carbon bucket seats, and a round wheel with four rotary dials for damping, differential and traction control.',
        state: { explode: 0.4, xray: 1, focus: 'interior', az: -150, el: 30, zoom: 1 },
      },
      {
        kicker: '09 — Your turn',
        title: 'Take it apart yourself',
        body: 'Switch to Explore to orbit the car, isolate any part, rev the engine and launch it on the dyno.',
        state: { explode: 0, xray: 0, focus: null, az: 30, el: 10, zoom: 1.22 },
      },
    ],
  },

  tourbillon: {
    id: 'tourbillon',
    maker: 'Bugatti',
    name: 'Tourbillon',
    short: 'Tourbillon',
    tagline: 'A V16, three electric motors and a dashboard built by watchmakers.',
    layout: 'Mid engine · all-wheel drive hybrid',
    accent: '#3b82f6',
    paints: [
      { name: 'Bleu Royal', color: '#1f3f8f' },
      { name: 'Atlantic', color: '#6aa3d9' },
      { name: 'Noir Carbon', color: '#1b1d22' },
      { name: 'Argent', color: '#c7cbd1' },
    ],
    heroStats: [
      ['1,800 PS', 'system output'],
      ['8.3 L', 'naturally aspirated V16'],
      ['2.0 s', '0–100 km/h'],
      ['445 km/h', 'top speed'],
    ],
    sim: {
      cylinders: 16,
      idleRpm: 900,
      redlineRpm: 9000,
      peakPowerKW: 736,
      peakPowerRpm: 9000,
      massKg: 1995,
      topSpeedKmh: 445,
      maxAccel: 14.5,
      gears: 8,
      firstGearKmh: 96,
      electric: { powerKW: 588, batteryKWh: 25 },
    },
    subsystems: [
      {
        id: 'body',
        label: 'Body & Glass',
        blurb:
          'Carbon composite skin with Bugatti\'s horseshoe grille and the C-line running along each flank. The canopy is a narrow teardrop.',
        stats: [['Length', '4,671 mm'], ['Width', '2,048 mm'], ['Height', '1,189 mm']],
      },
      {
        id: 'engine',
        label: 'V16',
        blurb:
          '8.3-litre naturally aspirated V16, developed with Cosworth. It makes 1,000 PS without turbos, revs to 9,000 rpm and weighs 252 kg.',
        stats: [['Displacement', '8.3 L'], ['Engine power', '1,000 PS'], ['Redline', '9,000 rpm'], ['Mass', '252 kg']],
      },
      {
        id: 'hybrid',
        label: 'E-Motors',
        blurb:
          'Two electric motors on the front axle with torque vectoring, and one at the rear. Together they add 800 PS and give the car all-wheel drive.',
        stats: [['Motors', '3 (2 front, 1 rear)'], ['E-power', '800 PS'], ['System', '1,800 PS']],
      },
      {
        id: 'battery',
        label: 'Battery',
        blurb:
          '25 kWh, 800 V pack built into the central tunnel and behind the seats. It is part of the chassis structure and gives more than 60 km of electric range.',
        stats: [['Capacity', '25 kWh'], ['Voltage', '800 V'], ['EV range', '60+ km']],
      },
      {
        id: 'transmission',
        label: 'Gearbox',
        blurb: 'New eight-speed dual-clutch transmission, packaged tightly behind the V16 to leave room for the rear diffuser.',
        stats: [['Gears', '8'], ['Type', 'Dual-clutch']],
      },
      {
        id: 'chassis',
        label: 'Monocoque',
        blurb:
          'Carbon composite monocoque with the battery integrated into its tunnel. Front and rear structures bolt directly to the tub.',
        stats: [['Construction', 'Carbon composite'], ['Kerb weight', '1,995 kg']],
      },
      {
        id: 'suspension',
        label: 'Suspension',
        blurb: 'Double wishbones on all four corners. The rear arms are topology-optimised and 3D printed.',
        stats: [['Layout', 'Double wishbone'], ['Wheelbase', '2,731 mm']],
      },
      {
        id: 'wheels',
        label: 'Wheels & Brakes',
        blurb: 'Staggered 20/21-inch wheels with Michelin tyres, and carbon-ceramic brakes behind the open spokes.',
        stats: [['Front tyre', '285/35 R20'], ['Rear tyre', '345/30 R21']],
      },
      {
        id: 'cooling',
        label: 'Cooling',
        blurb: 'Radiators in the side pods ahead of the rear wheels, fed by large intakes in the flanks.',
        stats: [['Layout', 'Side radiators']],
      },
      {
        id: 'aero',
        label: 'Aero',
        blurb:
          'An active rear wing that rises and tilts to act as an air brake, above a large diffuser that starts behind the rear axle.',
        stats: [['Wing', 'Active'], ['Diffuser', 'Full width']],
      },
      {
        id: 'exhaust',
        label: 'Exhaust',
        blurb: 'Sixteen runners merge into a system that exits high, between the diffuser channels.',
        stats: [['Runners', '16'], ['Tips', 'Centre']],
      },
      {
        id: 'interior',
        label: 'Cockpit',
        blurb:
          'The instrument cluster was made with Swiss watchmakers: more than 600 parts in titanium and sapphire. The steering wheel rim turns around a fixed hub.',
        stats: [['Cluster', '600+ parts'], ['Materials', 'Titanium, sapphire']],
      },
    ],
    chapters: [
      {
        kicker: '01 — The machine',
        title: 'Bugatti Tourbillon',
        body: 'A hybrid hypercar with no turbos and no screens in the cluster. Scroll and it comes apart one system at a time.',
        state: { explode: 0, xray: 0, focus: null, az: -38, el: 12, zoom: 1.28 },
      },
      {
        kicker: '02 — The skin',
        title: 'Glass it',
        body: 'Under the carbon is a mid-engine layout: V16 behind the seats, electric motors at both axles, and a battery running down the spine.',
        state: { explode: 0, xray: 1, focus: null, az: -70, el: 22, zoom: 1.12 },
      },
      {
        kicker: '03 — Teardown',
        title: 'Every part, in its place',
        body: 'Each subsystem lifts out along its own axis, so you can see how the car is assembled.',
        state: { explode: 1, xray: 0.3, focus: null, az: -40, el: 28, zoom: 1.12 },
      },
      {
        kicker: '04 — V16',
        title: 'Sixteen cylinders, no turbos',
        body: 'Two banks of eight on one crankshaft, 8.3 litres, revving to 9,000 rpm. The liners are glass here, so you can follow each charge around the firing order.',
        stats: [['1,000 PS', 'from the engine'], ['252 kg', 'engine mass']],
        state: { explode: 0.35, xray: 1, focus: 'engine', az: -140, el: 32, zoom: 1 },
      },
      {
        kicker: '05 — Electric',
        title: 'Three motors, 800 PS',
        body: 'Two motors drive the front wheels and can vector torque between them. A third sits at the rear. Together they fill the gaps in the V16\'s torque curve.',
        stats: [['800 PS', 'electric'], ['1,800 PS', 'combined']],
        state: { explode: 0.45, xray: 1, focus: 'hybrid', az: 45, el: 34, zoom: 0.95 },
      },
      {
        kicker: '06 — Spine',
        title: 'A structural battery',
        body: 'The 25 kWh pack is T-shaped: down the tunnel and across behind the seats. It is part of the carbon monocoque, not just cargo.',
        stats: [['25 kWh', '800 V'], ['60+ km', 'electric range']],
        state: { explode: 0.5, xray: 1, focus: 'battery', az: -55, el: 48, zoom: 1 },
      },
      {
        kicker: '07 — Air',
        title: 'Active wing, giant diffuser',
        body: 'The wing rises at speed and tilts up under braking. Underneath, the diffuser starts right behind the rear axle.',
        stats: [['445 km/h', 'top speed'], ['< 25 s', '0–400 km/h']],
        state: { explode: 0.45, xray: 0.6, focus: 'aero', az: -155, el: 16, zoom: 1 },
      },
      {
        kicker: '08 — Haute horlogerie',
        title: 'A cockpit like a watch',
        body: 'The skeleton instrument cluster has more than 600 parts in titanium and sapphire. The steering wheel rim turns around a fixed hub.',
        state: { explode: 0.4, xray: 1, focus: 'interior', az: -150, el: 30, zoom: 1 },
      },
      {
        kicker: '09 — Your turn',
        title: 'Take it apart yourself',
        body: 'Switch to Explore to orbit the car, isolate any part, rev the V16 and launch it on the dyno.',
        state: { explode: 0, xray: 0, focus: null, az: 30, el: 10, zoom: 1.22 },
      },
    ],
  },
};

export const CAR_ORDER: CarId[] = ['gt3rs', 'tourbillon'];
