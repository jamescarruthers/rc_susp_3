import { create } from 'zustand';

export type SimStatus = 'uninitialised' | 'loading' | 'ready' | 'error';

export interface WheelState {
  omega: number;
  slipRatio: number;
  torque: number;
  load: number;
  contact: boolean;
}

export interface ChassisState {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  velocity: [number, number, number];
  yawRate: number;
  lateralG: number;
  longitudinalG: number;
}

export interface SimParams {
  chassisMass: number;
  cogHeight: number;
  wheelbase: number;
  trackFront: number;
  trackRear: number;
  wheelRadius: number;
  wheelMass: number;
  springRate: number;
  damping: number;
  rideHeight: number;
  caster: number;
  kpi: number;
  camber: number;
  toe: number;
  friction: [number, number, number];
  maxMotorTorque: number;
  driveBias: number; // 0 = full RWD, 1 = full FWD
  tvEnabled: boolean;
  tcEnabled: boolean;
  tvPGain: number;
  tvIGain: number;
  understeerK: number;
  slipThreshold: number;
}

export interface ControlInput {
  throttle: number; // -1 .. 1
  steering: number; // -1 .. 1
  handbrake: number; // 0 .. 1
}

interface SimStore {
  status: SimStatus;
  error: string | null;
  time: number;
  paused: boolean;
  timeScale: number;
  fps: number;
  physicsHz: number;

  chassis: ChassisState;
  wheels: WheelState[];

  input: ControlInput;
  params: SimParams;

  mjcf: string;
  customMjcf: string | null;

  // actions
  setStatus: (s: SimStatus, error?: string | null) => void;
  setPaused: (paused: boolean) => void;
  setTimeScale: (s: number) => void;
  setInput: (i: Partial<ControlInput>) => void;
  setParams: (p: Partial<SimParams>) => void;
  setChassis: (c: ChassisState) => void;
  setWheel: (i: number, w: WheelState) => void;
  tick: (time: number, fps: number, physicsHz: number) => void;
  setMjcf: (xml: string) => void;
  setCustomMjcf: (xml: string | null) => void;
  reset: () => void;
  triggerReset: number;
}

export const defaultParams: SimParams = {
  chassisMass: 1.8,
  cogHeight: 0.06,
  wheelbase: 0.26,
  trackFront: 0.19,
  trackRear: 0.19,
  wheelRadius: 0.055,
  wheelMass: 0.1,
  springRate: 4000,
  damping: 80,
  rideHeight: 0.04,
  caster: 6,
  kpi: 8,
  camber: -1,
  toe: 0,
  friction: [1.0, 0.05, 0.001],
  maxMotorTorque: 1.2,
  driveBias: 0.5,
  tvEnabled: false,
  tcEnabled: false,
  tvPGain: 2.0,
  tvIGain: 0.5,
  understeerK: 0.002,
  slipThreshold: 0.15,
};

const emptyWheel: WheelState = {
  omega: 0,
  slipRatio: 0,
  torque: 0,
  load: 0,
  contact: false,
};

export const useSimStore = create<SimStore>((set) => ({
  status: 'uninitialised',
  error: null,
  time: 0,
  paused: false,
  timeScale: 1.0,
  fps: 0,
  physicsHz: 0,
  chassis: {
    position: [0, 0, 0.1],
    quaternion: [1, 0, 0, 0],
    velocity: [0, 0, 0],
    yawRate: 0,
    lateralG: 0,
    longitudinalG: 0,
  },
  wheels: [emptyWheel, emptyWheel, emptyWheel, emptyWheel],
  input: { throttle: 0, steering: 0, handbrake: 0 },
  params: { ...defaultParams },
  mjcf: '',
  customMjcf: null,
  triggerReset: 0,

  setStatus: (s, error = null) => set({ status: s, error }),
  setPaused: (paused) => set({ paused }),
  setTimeScale: (timeScale) => set({ timeScale }),
  setInput: (i) => set((s) => ({ input: { ...s.input, ...i } })),
  setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),
  setChassis: (chassis) => set({ chassis }),
  setWheel: (i, w) =>
    set((s) => {
      const wheels = s.wheels.slice();
      wheels[i] = w;
      return { wheels };
    }),
  tick: (time, fps, physicsHz) => set({ time, fps, physicsHz }),
  setMjcf: (mjcf) => set({ mjcf }),
  setCustomMjcf: (customMjcf) => set({ customMjcf }),
  reset: () => set((s) => ({ triggerReset: s.triggerReset + 1 })),
}));
