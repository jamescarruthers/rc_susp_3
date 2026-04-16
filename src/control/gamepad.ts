import { useEffect } from 'react';
import { useSimStore } from '../store/simStore';

// Polls the Gamepad API each RAF tick. Standard mapping: axis 0 = steering,
// axis 1 = throttle (left stick Y), trigger axes 6/7 if available for
// throttle/brake. Keyboard still works — whichever last moved wins.
export function useGamepadInput() {
  useEffect(() => {
    let raf = 0;
    let lastNonzero = 0;
    const dead = 0.08;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const pad of pads) {
        if (!pad) continue;
        const rawSteer = pad.axes[0] ?? 0;
        let throttle = 0;
        // Xbox-style triggers: axes[6]/[7] = -1..1 when supported; else
        // buttons[6]/[7] are analog.
        const rt = pad.buttons[7]?.value ?? 0;
        const lt = pad.buttons[6]?.value ?? 0;
        throttle = rt - lt;
        if (throttle === 0) {
          const ly = pad.axes[1] ?? 0;
          if (Math.abs(ly) > dead) throttle = -ly;
        }
        const steer = Math.abs(rawSteer) > dead ? rawSteer : 0;
        const handbrake = pad.buttons[0]?.pressed ? 1 : 0;
        if (steer !== 0 || throttle !== 0 || handbrake !== 0) {
          lastNonzero = performance.now();
          useSimStore.getState().setInput({ throttle, steering: steer, handbrake });
        } else if (performance.now() - lastNonzero < 50) {
          useSimStore.getState().setInput({ throttle: 0, steering: 0, handbrake: 0 });
        }
        break; // first connected pad only
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
}
