import type { Simulation } from './simulation';

const WHEEL_NAMES = ['fl', 'fr', 'rl', 'rr'] as const;
export type WheelName = (typeof WHEEL_NAMES)[number];

export function applyWheelTorques(
  sim: Simulation,
  t: Record<WheelName, number>,
): void {
  for (const name of WHEEL_NAMES) {
    sim.setCtrl(`drive_${name}`, t[name]);
  }
}

// Symmetric (parallel) steering — for testing before Ackermann is wired up.
export function applySteering(sim: Simulation, angle: number) {
  sim.setCtrl('steer_fl', angle);
  sim.setCtrl('steer_fr', angle);
}

export function applyAckermannSteering(sim: Simulation, left: number, right: number) {
  sim.setCtrl('steer_fl', left);
  sim.setCtrl('steer_fr', right);
}

export function getWheelOmegas(sim: Simulation): Record<WheelName, number> {
  const out: Record<WheelName, number> = { fl: 0, fr: 0, rl: 0, rr: 0 };
  const sd = sim.sensordata;
  for (const name of WHEEL_NAMES) {
    const adr = sim.sensorAdr(`omega_${name}`);
    if (adr >= 0) out[name] = sd[adr];
  }
  return out;
}

export function getWheelTouch(sim: Simulation): Record<WheelName, number> {
  const out: Record<WheelName, number> = { fl: 0, fr: 0, rl: 0, rr: 0 };
  const sd = sim.sensordata;
  for (const name of WHEEL_NAMES) {
    const adr = sim.sensorAdr(`touch_${name}`);
    if (adr >= 0) out[name] = sd[adr];
  }
  return out;
}

export { WHEEL_NAMES };
