import type { Hardpoints } from './hardpoints';
import {
  cornerMetrics,
  METRIC_KEYS,
  type CornerMetrics,
  type MetricKey,
  type MetricsOpts,
} from './metrics';
import {
  solveCorner,
  zeroInput,
  type KinematicInput,
  type KinematicState,
  type Pose,
} from './solver';

export type SweepAxis = 'rideHeight' | 'steerRack' | 'rollAngle';

// Map friendly axis names to the KinematicInput field they drive. Keeping
// these names separate lets the UI label controls naturally while the
// solver's field names stay precise.
const AXIS_FIELD: Record<SweepAxis, keyof KinematicInput> = {
  rideHeight: 'rideHeightDelta',
  steerRack: 'steerRack',
  rollAngle: 'rollAngle',
};

export interface SweepRequest {
  axis: SweepAxis;
  from: number;
  to: number;
  samples: number;
  // Inputs held constant during the sweep; the axis value overwrites one.
  base?: KinematicInput;
  side?: 'left' | 'right';
}

export interface SweepResult {
  axis: SweepAxis;
  x: Float32Array;
  // One array per metric key.
  series: Record<MetricKey, Float32Array>;
  // Finite-difference derivatives of selected metrics. `camberGain` is
  // d(camber)/d(rideHeight) and `bumpSteer` is d(toe)/d(rideHeight) when
  // the sweep axis is rideHeight; for other axes they're just the general
  // derivative with respect to the swept variable.
  derivatives: {
    camberGain: Float32Array;
    bumpSteer: Float32Array;
  };
  states: KinematicState[];
  // Non-converged sample indices — UI can flag these on the plots.
  nonConverged: number[];
}

// Run `samples` equally spaced points between from and to. Warm-starts
// each sample from the previous pose so convergence stays cheap.
export function sweep(hp: Hardpoints, req: SweepRequest): SweepResult {
  const n = Math.max(2, req.samples | 0);
  const opts: MetricsOpts = { side: req.side ?? 'left' };
  const base = { ...zeroInput, ...(req.base ?? {}) };

  const x = new Float32Array(n);
  const series: Record<MetricKey, Float32Array> = {} as Record<MetricKey, Float32Array>;
  for (const k of METRIC_KEYS) series[k] = new Float32Array(n);
  const states: KinematicState[] = new Array(n);
  const nonConverged: number[] = [];

  let warm: Pose | undefined = undefined;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const v = req.from + (req.to - req.from) * t;
    const field = AXIS_FIELD[req.axis];
    const input: KinematicInput = { ...base, [field]: v };
    const state = solveCorner(hp, input, warm);
    if (!state.converged) nonConverged.push(i);
    warm = state.pose;
    states[i] = state;
    x[i] = v;

    const m = cornerMetrics(hp, state, opts);
    for (const k of METRIC_KEYS) series[k][i] = (m as unknown as Record<MetricKey, number>)[k];
  }

  // Central-difference derivatives. Endpoints use forward/backward.
  const camberGain = derivative(x, series.camber);
  const bumpSteer = derivative(x, series.toe);

  return { axis: req.axis, x, series, derivatives: { camberGain, bumpSteer }, states, nonConverged };
}

function derivative(x: Float32Array, y: Float32Array): Float32Array {
  const n = x.length;
  const out = new Float32Array(n);
  if (n < 2) return out;
  out[0] = (y[1] - y[0]) / (x[1] - x[0] || 1);
  out[n - 1] = (y[n - 1] - y[n - 2]) / (x[n - 1] - x[n - 2] || 1);
  for (let i = 1; i < n - 1; i++) {
    const dx = x[i + 1] - x[i - 1] || 1;
    out[i] = (y[i + 1] - y[i - 1]) / dx;
  }
  return out;
}

// Convenience: one-shot single-point evaluation used by static readouts.
export function evaluate(
  hp: Hardpoints,
  input: KinematicInput,
  opts: MetricsOpts = { side: 'left' },
): { state: KinematicState; metrics: CornerMetrics } {
  const state = solveCorner(hp, input);
  return { state, metrics: cornerMetrics(hp, state, opts) };
}
