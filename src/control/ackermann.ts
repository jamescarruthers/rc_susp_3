export interface AckermannInput {
  steerNorm: number; // -1 .. +1 from stick / keyboard
  maxInnerAngle: number; // rad
  wheelbase: number;
  trackFront: number;
  ackermann: number; // 0 parallel, 1 full Ackermann
}

export interface AckermannOutput {
  left: number; // rad, positive = left turn for that wheel
  right: number;
}

// Standard Ackermann: for a given inner-wheel angle δ_i, the outer-wheel
// angle δ_o satisfies cot(δ_o) − cot(δ_i) = track / wheelbase. The blend
// between parallel steering and Ackermann is controlled by `ackermann`.
export function ackermann(input: AckermannInput): AckermannOutput {
  const { steerNorm, maxInnerAngle, wheelbase, trackFront, ackermann: k } = input;
  const direction = Math.sign(steerNorm);
  const mag = Math.min(1, Math.abs(steerNorm));
  const inner = mag * maxInnerAngle;
  if (inner < 1e-4) {
    return { left: 0, right: 0 };
  }
  const cotInner = 1 / Math.tan(inner);
  const cotOuter = cotInner + trackFront / wheelbase;
  const outerAck = Math.atan(1 / cotOuter);
  const outer = k * outerAck + (1 - k) * inner;
  // Assign inner/outer based on turn direction. Positive steerNorm means a
  // left turn (MuJoCo convention: yaw rate about +Z). The left wheel is the
  // inner wheel on a left turn.
  if (direction > 0) {
    return { left: inner, right: outer };
  }
  return { left: -outer, right: -inner };
}
