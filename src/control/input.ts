import { useEffect } from 'react';
import { useSimStore } from '../store/simStore';

// Keyboard-only milestone-1 input. Gamepad and smoothing are added later.
export function useKeyboardInput() {
  useEffect(() => {
    const keys = new Set<string>();

    const update = () => {
      let throttle = 0;
      let steering = 0;
      let handbrake = 0;
      if (keys.has('w') || keys.has('arrowup')) throttle += 1;
      if (keys.has('s') || keys.has('arrowdown')) throttle -= 1;
      if (keys.has('a') || keys.has('arrowleft')) steering -= 1;
      if (keys.has('d') || keys.has('arrowright')) steering += 1;
      if (keys.has(' ')) handbrake = 1;
      useSimStore.getState().setInput({ throttle, steering, handbrake });
    };

    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
      keys.add(k);
      update();
    };
    const up = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase());
      update();
    };
    const blur = () => {
      keys.clear();
      update();
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
}
