# RC Car MuJoCo Sim

Browser-based 4WD RC car simulator built on MuJoCo compiled to WebAssembly.
React + TypeScript + Vite for the app, Three.js (via @react-three/fiber)
for rendering, [mujoco-js](https://www.npmjs.com/package/mujoco-js) (the
official Google DeepMind build) for the physics.

## Quick start

```sh
npm install
npm run dev                     # dev server at http://localhost:5173
npm run build                   # production bundle to dist/
node scripts/checkModel.mjs     # headless MJCF regression check
```

The Vite dev server sets COOP/COEP headers so SharedArrayBuffer (used by
threaded mujoco-js builds) is available. Single-threaded builds work too.

## Controls

- **WASD / arrows** — throttle + steering
- **Space** — handbrake (cuts rear torque)
- **Gamepad** — left stick steering, triggers throttle/brake (auto-detected)
- **Top bar** — play/pause/reset/step, time scale, overlay toggle,
  follow-cam toggle
- **MJCF editor** — Show MJCF button on the viewport. Apply validates the
  XML, reloads the model, and preserves runtime state where possible.

## Features

- 500 Hz physics decoupled from render via fixed-timestep accumulator
  (capped to 20 steps per render frame)
- Programmatic MJCF generation from tuning parameters (chassis, tyre,
  suspension, drivetrain, Ackermann blend) with live reload
- Leva tuning panel with automatic structural-change detection — only
  geometry/mass changes trigger an MJCF regeneration; control gains update
  in place
- Double-wishbone geometry parameters with visual wireframe overlay
  (physics uses a prismatic-slider-per-corner model for stability; the
  overlay reflects the kinematic layout)
- Telemetry ring buffer (10 s at sim rate) rendered in 4 stacked uPlot
  charts at 30 Hz
- Two-layer torque vectoring: base bias + bicycle-model yaw PI
- Per-wheel slip-ratio traction control
- CodeMirror 6 MJCF editor with DOMParser syntax pre-validation,
  drag-to-import / click-to-export
- localStorage presets

## Repo layout

```
src/
├── App.tsx
├── main.tsx
├── mujoco/            # mujoco-js loader + Simulation wrapper + actuator helpers
├── model/             # MJCF generator, defaults, DOMParser validation
├── control/           # keyboard + gamepad input, ackermann, TV, TC, presets
├── loop/simLoop.ts    # fixed-timestep RAF loop + reload queue
├── render/            # R3F Scene, CarMesh, Ground, SuspensionOverlay, FollowCam
├── store/             # zustand simStore
├── telemetry/         # ring-buffered telemetry bus
├── ui/                # SimControls, HUD, Tuning/Telemetry/Preset panels, MJCF editor
└── utils/             # iso8855 frame mapping, ringBuffer
scripts/
└── checkModel.mjs     # node smoke test: bundle generator + load with mujoco-js
```

## Implementation notes

- **Coordinate frames**: MuJoCo uses ISO 8855 (X fwd, Y left, Z up); Three
  is Y-up. Conversion is per-body in `utils/iso8855.ts`; the R3F scene is
  plain Y-up so drei utilities behave.
- **MJCF generator pitfalls** (learned the hard way with mujoco-js's
  stripped error strings): every body needs an `<inertial>` element. If the
  body has no geoms, the inertial must be explicit or compilation silently
  fails with `mjCError`.
- **Reload state preservation**: on a structural parameter change the
  simulation is disposed and rebuilt; the root free-joint qpos[0..6] and
  qvel[0..5] are saved and restored so live tuning feels continuous.
- **Double-wishbone physics**: simulated as a prismatic slider per corner
  with the spring rate / damping from the tuning panel. The
  SuspensionOverlay draws visualised arms from the wishbone geometry
  params; this is pedagogical, not physical. Upgrading to a full kinematic
  chain with `equality/connect` constraints is the natural next step.

## Stretch goals (not yet wired up)

- Pacejka tyre model applied as external force corrections
- Record / replay via serialised qpos/qvel
- Share link via URL-hashed MJCF + params
- Multi-car parallel sweeps
