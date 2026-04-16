import { useEffect } from 'react';
import { useSimStore } from '../store/simStore';
import { loadMujoco } from '../mujoco/loader';
import { Simulation } from '../mujoco/simulation';
import { generateCarMjcf } from '../model/generate';
import {
  applySteering,
  applyWheelTorques,
  getWheelOmegas,
  getWheelTouch,
  WHEEL_NAMES,
  type WheelName,
} from '../mujoco/actuators';

let sim: Simulation | null = null;
let rafHandle = 0;

export function getSim(): Simulation | null {
  return sim;
}

// Fixed-timestep accumulator-driven physics loop. All sim interaction (torque
// application, telemetry capture) happens here rather than in React render so
// physics timing can't stall behind component updates.
export function useSimLoop() {
  useEffect(() => {
    let cancelled = false;
    let lastFrame = performance.now();
    let fpsAccum = 0;
    let fpsFrames = 0;
    let physSteps = 0;
    let physAccum = 0;
    let accumulator = 0;
    let lastResetSeen = useSimStore.getState().triggerReset;
    let prevYawRate = 0;
    let prevVx = 0;
    let prevVy = 0;

    const store = useSimStore;
    store.getState().setStatus('loading');

    const bootstrap = async () => {
      try {
        const mujoco = await loadMujoco();
        if (cancelled) return;
        const params = store.getState().params;
        const mjcf = generateCarMjcf(params, { suspension: 'rigid-slider', steering: true });
        sim = Simulation.create(mujoco, mjcf);
        store.getState().setMjcf(mjcf);
        store.getState().setStatus('ready');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(msg);
        store.getState().setStatus('error', msg);
      }
    };

    const frame = (now: number) => {
      if (cancelled) return;
      rafHandle = requestAnimationFrame(frame);
      const dt = (now - lastFrame) / 1000;
      lastFrame = now;
      fpsAccum += dt;
      fpsFrames += 1;
      physAccum += dt;

      const state = store.getState();
      const resetCount = state.triggerReset;
      if (sim && resetCount !== lastResetSeen) {
        lastResetSeen = resetCount;
        sim.reset();
        accumulator = 0;
      }

      if (sim && !state.paused) {
        const tscale = state.timeScale;
        accumulator += dt * tscale;
        const step = sim.timestep;
        const maxSteps = 20;
        let stepsThisFrame = 0;
        while (accumulator >= step && stepsThisFrame < maxSteps) {
          applyControls(sim, state.input, state.params.maxMotorTorque);
          sim.step();
          accumulator -= step;
          stepsThisFrame += 1;
          physSteps += 1;
        }
        if (stepsThisFrame === maxSteps) accumulator = 0;
      } else if (sim) {
        accumulator = 0;
      }

      if (sim) {
        const chassis = readChassis(sim, prevYawRate, prevVx, prevVy, dt);
        prevYawRate = chassis.yawRate;
        prevVx = chassis.velocity[0];
        prevVy = chassis.velocity[1];
        useSimStore.getState().setChassis(chassis);
        pushWheels(sim);
      }

      if (fpsAccum >= 0.5) {
        const fps = fpsFrames / fpsAccum;
        const hz = physSteps / physAccum;
        store.getState().tick(sim ? sim.time : 0, fps, hz);
        fpsAccum = 0;
        fpsFrames = 0;
        physAccum = 0;
        physSteps = 0;
      }
    };

    bootstrap();
    rafHandle = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafHandle);
      if (sim) {
        sim.dispose();
        sim = null;
      }
    };
  }, []);
}

function applyControls(
  sim: Simulation,
  input: { throttle: number; steering: number; handbrake: number },
  maxTorque: number,
) {
  // Symmetric 50/50 front-rear split for milestone 3. Torque vectoring in m8.
  const tPerWheel = input.throttle * maxTorque * 0.5;
  const torques: Record<WheelName, number> = {
    fl: tPerWheel,
    fr: tPerWheel,
    rl: tPerWheel,
    rr: tPerWheel,
  };
  if (input.handbrake > 0) {
    // Crude: stall rear wheels when handbrake is engaged.
    torques.rl = 0;
    torques.rr = 0;
  }
  applyWheelTorques(sim, torques);
  // Max steering wheel angle about ±25° (0.436 rad). Scale keyboard.
  applySteering(sim, input.steering * 0.436);
}

function readChassis(
  sim: Simulation,
  prevYaw: number,
  prevVx: number,
  prevVy: number,
  dt: number,
) {
  const id = sim.bodyId('chassis');
  const xp = sim.xpos;
  const xq = sim.xquat;
  const qv = sim.qvel;
  const p = Math.max(id, 0) * 3;
  const q = Math.max(id, 0) * 4;
  const vx = qv[0] ?? 0;
  const vy = qv[1] ?? 0;
  const vz = qv[2] ?? 0;
  const yawRate = qv[5] ?? 0;
  // Finite-difference accelerations; not perfect but adequate for the HUD.
  const axWorld = dt > 0 ? (vx - prevVx) / dt : 0;
  const ayWorld = dt > 0 ? (vy - prevVy) / dt : 0;
  // Rotate world accelerations into vehicle frame using chassis yaw.
  // Chassis quaternion is (w, x, y, z) — extract yaw about Z.
  const qw = xq[q];
  const qz = xq[q + 3];
  const yaw = Math.atan2(2 * (qw * qz), 1 - 2 * qz * qz);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const longAcc = axWorld * c + ayWorld * s;
  const latAcc = -axWorld * s + ayWorld * c;
  return {
    position: [xp[p], xp[p + 1], xp[p + 2]] as [number, number, number],
    quaternion: [xq[q], xq[q + 1], xq[q + 2], xq[q + 3]] as [number, number, number, number],
    velocity: [vx, vy, vz] as [number, number, number],
    yawRate,
    longitudinalG: longAcc,
    lateralG: latAcc,
  };
}

function pushWheels(sim: Simulation) {
  const omegas = getWheelOmegas(sim);
  const touches = getWheelTouch(sim);
  // Current per-wheel ctrl lets us echo back the "torque applied" channel.
  const ctrl = sim.ctrl;
  for (let i = 0; i < WHEEL_NAMES.length; i++) {
    const name = WHEEL_NAMES[i];
    const driveId = sim.actuatorId(`drive_${name}`);
    useSimStore.getState().setWheel(i, {
      omega: omegas[name],
      slipRatio: 0,
      torque: driveId >= 0 ? ctrl[driveId] : 0,
      load: 0,
      contact: touches[name] > 0,
    });
  }
}
