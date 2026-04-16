import type { SimParams } from '../store/simStore';

export interface TCInput {
  vx: number; // chassis forward speed in vehicle frame (m/s)
  omega: { fl: number; fr: number; rl: number; rr: number };
  torques: { fl: number; fr: number; rl: number; rr: number };
  params: SimParams;
}

// Per-wheel slip-ratio limiter. Slip ratio κ = (ω·r − v_x) / max(|v_x|, ε).
// When |κ| > threshold we scale the wheel's torque linearly down by the
// ratio of excess-over-threshold to (2 × threshold) so the cut is smooth.
export function runTractionControl(input: TCInput): {
  torques: TCInput['torques'];
  slip: { fl: number; fr: number; rl: number; rr: number };
} {
  const { vx, omega, torques, params } = input;
  if (!params.tcEnabled) {
    return {
      torques,
      slip: { fl: 0, fr: 0, rl: 0, rr: 0 },
    };
  }
  const r = params.wheelRadius;
  const eps = 0.2;
  const out = { ...torques };
  const slip = { fl: 0, fr: 0, rl: 0, rr: 0 } as { fl: number; fr: number; rl: number; rr: number };
  for (const name of ['fl', 'fr', 'rl', 'rr'] as const) {
    const w = omega[name] * r;
    const s = (w - vx) / Math.max(Math.abs(vx), eps);
    slip[name] = s;
    const abs = Math.abs(s);
    if (abs > params.slipThreshold) {
      const excess = abs - params.slipThreshold;
      const scale = Math.max(0, 1 - excess / params.slipThreshold);
      out[name] *= scale;
    }
  }
  return { torques: out, slip };
}
