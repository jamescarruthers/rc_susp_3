import { useEffect } from 'react';
import { useSimStore } from '../store/simStore';
import { loadMujoco } from '../mujoco/loader';
import { Simulation } from '../mujoco/simulation';
import { generateCarMjcf } from '../model/generate';
import {
  applyAckermannSteering,
  applyWheelTorques,
  getWheelOmegas,
  getWheelTouch,
  WHEEL_NAMES,
  type WheelName,
} from '../mujoco/actuators';
import { ackermann } from '../control/ackermann';
import { runTorqueVectoring, type TVState } from '../control/torqueVectoring';
import { runTractionControl } from '../control/tractionControl';
import type { SimParams } from '../store/simStore';
import { telemetry } from '../telemetry/telemetry';

const tvState: TVState = { integral: 0 };

let sim: Simulation | null = null;
let rafHandle = 0;
let pendingMjcf: { xml: string; preserveState: boolean } | null = null;

export function getSim(): Simulation | null {
  return sim;
}

// Queue an MJCF reload. The sim loop picks it up between frames, disposes
// the previous Simulation, loads the new one, and (optionally) restores the
// root free-joint qpos/qvel so live tuning doesn't teleport the car.
export function requestModelReload(xml: string, preserveState = true) {
  pendingMjcf = { xml, preserveState };
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

      if (pendingMjcf && sim) {
        const pending = pendingMjcf;
        pendingMjcf = null;
        // Preserve the root body's world pose and linear / angular velocity
        // so a parameter change doesn't reset the car.
        let savedQpos: number[] | null = null;
        let savedQvel: number[] | null = null;
        if (pending.preserveState) {
          savedQpos = Array.from(sim.qpos.subarray(0, 7));
          savedQvel = Array.from(sim.qvel.subarray(0, 6));
        }
        try {
          const mujoco = sim.mujoco;
          sim.dispose();
          sim = Simulation.create(mujoco, pending.xml);
          if (savedQpos && savedQvel) {
            sim.qpos.set(savedQpos);
            sim.qvel.set(savedQvel);
            sim.forward();
          }
          store.getState().setMjcf(pending.xml);
          store.getState().setStatus('ready');
          accumulator = 0;
          telemetry.clear();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          store.getState().setStatus('error', msg);
        }
      }

      if (sim && !state.paused) {
        const tscale = state.timeScale;
        accumulator += dt * tscale;
        const step = sim.timestep;
        const maxSteps = 20;
        let stepsThisFrame = 0;
        while (accumulator >= step && stepsThisFrame < maxSteps) {
          applyControls(sim, state.input, state.params);
          sim.step();
          pushTelemetrySample(sim, state.input);
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
  params: SimParams,
) {
  const { left, right } = ackermann({
    steerNorm: input.steering,
    maxInnerAngle: 0.5,
    wheelbase: params.wheelbase,
    trackFront: params.trackFront,
    ackermann: params.ackermann,
  });
  applyAckermannSteering(sim, left, right);

  // Chassis forward speed in vehicle frame for TV + TC.
  const xq = sim.xquat;
  const id = sim.bodyId('chassis');
  const q = Math.max(id, 0) * 4;
  const qw = xq[q];
  const qz = xq[q + 3];
  const yaw = Math.atan2(2 * (qw * qz), 1 - 2 * qz * qz);
  const vxWorld = sim.qvel[0] ?? 0;
  const vyWorld = sim.qvel[1] ?? 0;
  const vx = vxWorld * Math.cos(yaw) + vyWorld * Math.sin(yaw);
  const yawRate = sim.qvel[5] ?? 0;
  const steerAngle = (left + right) * 0.5;

  const tv = runTorqueVectoring(
    { throttle: input.throttle, steerAngle, speed: vx, yawRate, params, dt: sim.timestep },
    tvState,
  );
  const sd = sim.sensordata;
  const omega = {
    fl: sd[sim.sensorAdr('omega_fl')] ?? 0,
    fr: sd[sim.sensorAdr('omega_fr')] ?? 0,
    rl: sd[sim.sensorAdr('omega_rl')] ?? 0,
    rr: sd[sim.sensorAdr('omega_rr')] ?? 0,
  };
  const tc = runTractionControl({ vx, omega, torques: tv.torques, params });
  let torques: Record<WheelName, number> = tc.torques;
  if (input.handbrake > 0) {
    torques = { ...torques, rl: 0, rr: 0 };
  }
  applyWheelTorques(sim, torques);
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

function pushTelemetrySample(sim: Simulation, input: { throttle: number; steering: number; handbrake: number }) {
  const qv = sim.qvel;
  const speed = Math.hypot(qv[0] ?? 0, qv[1] ?? 0);
  const yawRate = qv[5] ?? 0;
  // Ask the sensor adr table for tyre omegas/touch directly; cheaper than
  // the WHEEL_NAMES loop over object lookups inside the physics loop.
  const sd = sim.sensordata;
  const o = {
    fl: sd[sim.sensorAdr('omega_fl')] ?? 0,
    fr: sd[sim.sensorAdr('omega_fr')] ?? 0,
    rl: sd[sim.sensorAdr('omega_rl')] ?? 0,
    rr: sd[sim.sensorAdr('omega_rr')] ?? 0,
  };
  const t = {
    fl: sd[sim.sensorAdr('touch_fl')] ?? 0,
    fr: sd[sim.sensorAdr('touch_fr')] ?? 0,
    rl: sd[sim.sensorAdr('touch_rl')] ?? 0,
    rr: sd[sim.sensorAdr('touch_rr')] ?? 0,
  };
  const ctrl = sim.ctrl;
  const tq = {
    fl: ctrl[sim.actuatorId('drive_fl')] ?? 0,
    fr: ctrl[sim.actuatorId('drive_fr')] ?? 0,
    rl: ctrl[sim.actuatorId('drive_rl')] ?? 0,
    rr: ctrl[sim.actuatorId('drive_rr')] ?? 0,
  };
  telemetry.push({
    time: sim.time,
    speed,
    yawRate,
    latG: 0,
    longG: 0,
    steering: input.steering,
    throttle: input.throttle,
    omega_fl: o.fl,
    omega_fr: o.fr,
    omega_rl: o.rl,
    omega_rr: o.rr,
    torque_fl: tq.fl,
    torque_fr: tq.fr,
    torque_rl: tq.rl,
    torque_rr: tq.rr,
    touch_fl: t.fl,
    touch_fr: t.fr,
    touch_rl: t.rl,
    touch_rr: t.rr,
  });
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
