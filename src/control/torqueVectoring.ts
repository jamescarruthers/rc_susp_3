import type { SimParams } from '../store/simStore';

export interface TVInput {
  throttle: number; // -1..1
  steerAngle: number; // rad, average front-wheel angle
  speed: number; // m/s (forward)
  yawRate: number; // rad/s, measured
  params: SimParams;
  dt: number;
}

export interface TVState {
  integral: number;
}

export interface TVOutput {
  // Per-wheel torque contributions in N·m, signed.
  fl: number;
  fr: number;
  rl: number;
  rr: number;
}

// Two-layer controller: base split (front/rear bias, left/right symmetric)
// plus a yaw-rate PI loop that biases left-right torque to match a bicycle
// model reference. Output is friction-ellipse-naive — pair with traction
// control to keep wheels from spinning up.
export function runTorqueVectoring(
  input: TVInput,
  state: TVState,
): { torques: TVOutput; target: number; error: number } {
  const { throttle, steerAngle, speed, yawRate, params, dt } = input;
  const total = throttle * params.maxMotorTorque;
  const frontShare = params.driveBias;
  const rearShare = 1 - params.driveBias;

  const base: TVOutput = {
    fl: total * frontShare * 0.5,
    fr: total * frontShare * 0.5,
    rl: total * rearShare * 0.5,
    rr: total * rearShare * 0.5,
  };

  if (!params.tvEnabled || Math.abs(speed) < 0.5) {
    return { torques: base, target: 0, error: 0 };
  }

  // Bicycle-model reference yaw rate, clamped to the friction-limited ceiling.
  const L = params.wheelbase;
  const K = params.understeerK;
  const refYaw = (speed / (L + K * speed * speed)) * steerAngle;
  const muG = params.friction[0] * 9.80665;
  const maxYaw = Math.abs(muG / Math.max(Math.abs(speed), 0.5));
  const target = clamp(refYaw, -maxYaw, maxYaw);
  const error = target - yawRate;

  state.integral = clamp(state.integral + error * dt, -0.5, 0.5);
  const Mz = params.tvPGain * error + params.tvIGain * state.integral;

  // Convert yaw-moment demand into a left-right torque delta on the rear
  // axle (simple, single-axle torque vectoring). Half the action on the
  // front axle would spread load; leaving rear-only is easy to reason about
  // when tuning.
  const track = params.trackRear;
  const dT = (Mz * track) / 2;
  const out: TVOutput = {
    fl: base.fl,
    fr: base.fr,
    rl: base.rl + dT * 0.5,
    rr: base.rr - dT * 0.5,
  };
  // Clamp per-wheel torques to the actuator range.
  const lim = params.maxMotorTorque;
  out.fl = clamp(out.fl, -lim, lim);
  out.fr = clamp(out.fr, -lim, lim);
  out.rl = clamp(out.rl, -lim, lim);
  out.rr = clamp(out.rr, -lim, lim);
  return { torques: out, target, error };
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
