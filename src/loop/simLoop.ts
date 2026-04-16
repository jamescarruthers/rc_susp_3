import { useEffect } from 'react';
import { useSimStore } from '../store/simStore';

// Milestone-1 placeholder loop: no physics yet, just drives a render-time
// heartbeat into the store so the SimControls FPS/time readout is alive.
// Milestone 2 wires MuJoCo in.
export function useSimLoop() {
  useEffect(() => {
    let raf = 0;
    let lastFrame = performance.now();
    let fpsAccum = 0;
    let fpsFrames = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = (now - lastFrame) / 1000;
      lastFrame = now;
      fpsAccum += dt;
      fpsFrames += 1;
      if (fpsAccum >= 0.5) {
        const fps = fpsFrames / fpsAccum;
        useSimStore.getState().tick(useSimStore.getState().time, fps, 0);
        fpsAccum = 0;
        fpsFrames = 0;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
}
