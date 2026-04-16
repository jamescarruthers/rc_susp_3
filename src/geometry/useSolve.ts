import { useMemo } from 'react';
import { useGeometryStore } from '../store/geometryStore';
import { cornerMetrics } from './metrics';
import { evaluate } from './sweep';
import { solveCorner, zeroInput, type KinematicInput } from './solver';

// Convenience hook: solve the active archetype at `input` and return the
// state + derived metrics. Defaults to rest (zero input) for static views.
export function useSolve(input: KinematicInput = zeroInput) {
  const active = useGeometryStore((s) => s.active);
  const hp = useGeometryStore((s) => s[s.active]);
  // Cheap: the solver runs in microseconds on a warm-started single call.
  // We re-run every render; memo keyed by inputs + hardpoints keeps the
  // result stable when nothing relevant changed.
  return useMemo(() => {
    const state = solveCorner(hp, input);
    const metrics = cornerMetrics(hp, state, { side: active === 'front' ? 'left' : 'left' });
    return { state, metrics };
  }, [hp, input.rideHeightDelta, input.steerRack, input.rollAngle, active]);
}

// Non-hook variant for use in handlers.
export function solveActive(input: KinematicInput = zeroInput) {
  const s = useGeometryStore.getState();
  return evaluate(s[s.active], input);
}
