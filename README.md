# Anatomy: 3D car teardown

An interactive, procedurally generated 3D teardown of the **Porsche 911 GT3 RS** and the **Bugatti Tourbillon**, built with Astro and three.js.

It follows the "machine you can take apart" format: one page, every subsystem has a button, the selected part comes apart while everything else ghosts and moves aside, and live gauges are driven by the same model that moves the parts.

## Features

- **Car selector** (top right): switch between the GT3 RS and the Tourbillon. The other car is pre-built in the background.
- **Two modes** (top right):
  - **Scroll**: a scroll-driven story. The camera, explode amount, x-ray and focused subsystem are all scrubbed by scroll position.
  - **Explore**: free orbit, pan and zoom; a button per subsystem; an explode slider; x-ray; DRS / active wing; dyno launch; synthesized engine sound; paint swatches. Click any part to isolate it. After 25 s idle, an auto tour starts.
- **Working internals**: a flat-six and a V16 with real crank/rod/piston kinematics, glass cylinder liners and a combustion glow on each power stroke in firing order; spinning gearbox shafts; e-motor rotors; wheels and floor driven by a small longitudinal dyno sim.
- **Live console**: tachometer, speed, gear, power, a power-vs-rpm curve with a live marker, a firing-order strip, a 0–100 timer, and battery state of charge (Tourbillon).
- **No model files**: every part is generated in code (lofted body panels, lathe tyres, extruded gears, tube runners). The whole site is about 0.7 MB.

## Keyboard (Explore mode)

| Key | Action |
| --- | --- |
| `1`–`9`, `0` | Isolate a subsystem |
| `Space` (hold) | Launch on the dyno |
| `E` | Toggle assembled / exploded |
| `X` | X-ray |
| `D` | DRS / active wing |
| `R` | Reset view |
| `Esc` | Clear selection |

URL parameters: `?car=gt3rs|tourbillon&mode=scroll|explore`.

## Development

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
npm run preview
```

## Structure

```
src/
  data/cars.ts              specs, subsystems, scroll chapters, sim parameters
  pages/index.astro         page shell, scroll story (static HTML), UI
  styles/global.css
  scripts/
    app.ts                  UI, modes, scroll timeline, camera, input, console
    sim.ts                  dyno model + WebAudio engine note
    three/
      kit.ts                geometry helpers, materials, Part (merge, explode, fade)
      body.ts               lofted body shell split into panels
      components.ts         wheels, suspension, engine rig, gearbox, seats, motors…
      gt3rs.ts              Porsche 911 GT3 RS assembly
      tourbillon.ts         Bugatti Tourbillon assembly
      stage.ts              renderer, lighting, floor shader, explode/focus, camera rig
```

To add a car: add an entry to `src/data/cars.ts`, write a builder like `gt3rs.ts`, and register it in `builders` in `app.ts`.

---

This is a fan-made illustration. It is not affiliated with or endorsed by Porsche AG or Bugatti Automobiles. Figures are published manufacturer data; internal layouts are simplified.
