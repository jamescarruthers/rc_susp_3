// Re-export the subset of the mujoco-js .d.ts we actually use, so callers
// don't have to wrestle with the enormous auto-generated namespace.
import type { MainModule, MjData, MjModel } from 'mujoco-js';

export type Mujoco = MainModule;
export type Model = MjModel;
export type Data = MjData;

export type WheelIndex = 0 | 1 | 2 | 3; // FL, FR, RL, RR
