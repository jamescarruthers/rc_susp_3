import { useEffect } from 'react';
import { useSimStore } from '../store/simStore';
import { loadMujoco } from '../mujoco/loader';
import { Simulation } from '../mujoco/simulation';
import { BOX_DROP_MJCF } from '../model/boxDrop';

// Shared state the loop reaches for. Kept outside React so hook re-renders
// can't stall the physics clock.
let sim: Simulation | null = null;
let rafHandle = 0;

export function getSim(): Simulation | null {
  return sim;
}

// Fixed-timestep accumulator pattern. Physics steps at the model's timestep
// (default 500 Hz), rendering ticks at display refresh via R3F's useFrame.
// This hook owns the RAF loop for physics + per-frame store updates.
export function useSimLoop() {
  useEffect(() => {
    let cancelled = false;
    let lastFrame = performance.now();
    let fpsAccum = 0;
    let fpsFrames = 0;
    let physSteps = 0;
    let physAccum = 0;
    let accumulator = 0;

    const store = useSimStore;
    store.getState().setStatus('loading');

    const bootstrap = async () => {
      try {
        const mujoco = await loadMujoco();
        if (cancelled) return;
        sim = Simulation.create(mujoco, BOX_DROP_MJCF);
        store.getState().setMjcf(BOX_DROP_MJCF);
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
      if (sim && !state.paused) {
        const tscale = state.timeScale;
        accumulator += dt * tscale;
        const step = sim.timestep;
        // Cap steps per frame so a tab refocus can't trigger a spiral of death.
        const maxSteps = 20;
        let stepsThisFrame = 0;
        while (accumulator >= step && stepsThisFrame < maxSteps) {
          sim.step();
          accumulator -= step;
          stepsThisFrame += 1;
          physSteps += 1;
        }
        if (stepsThisFrame === maxSteps) accumulator = 0;
      } else if (sim) {
        accumulator = 0;
      }

      // Handle reset trigger.
      const resetCount = store.getState().triggerReset;
      if (sim && resetCount !== lastResetSeen) {
        lastResetSeen = resetCount;
        sim.reset();
      }

      if (sim) pushChassisToStore();

      if (fpsAccum >= 0.5) {
        const fps = fpsFrames / fpsAccum;
        const hz = physSteps / physAccum;
        store
          .getState()
          .tick(sim ? sim.time : 0, fps, hz);
        fpsAccum = 0;
        fpsFrames = 0;
        physAccum = 0;
        physSteps = 0;
      }
    };

    let lastResetSeen = store.getState().triggerReset;

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

function pushChassisToStore() {
  if (!sim) return;
  const id = sim.bodyId('chassis');
  if (id < 0) return;
  const xp = sim.xpos;
  const xq = sim.xquat;
  const p = id * 3;
  const q = id * 4;
  // cheap: reuse array slots each frame
  const qv = sim.qvel;
  // Free-joint qvel layout: [vx, vy, vz, wx, wy, wz] for the root. We only
  // support a single free joint at the root in milestones 2–3; refine later.
  const vx = qv[0] ?? 0;
  const vy = qv[1] ?? 0;
  const vz = qv[2] ?? 0;
  const yawRate = qv[5] ?? 0;
  useSimStore.getState().setChassis({
    position: [xp[p], xp[p + 1], xp[p + 2]],
    quaternion: [xq[q], xq[q + 1], xq[q + 2], xq[q + 3]],
    velocity: [vx, vy, vz],
    yawRate,
    lateralG: 0,
    longitudinalG: 0,
  });
}
