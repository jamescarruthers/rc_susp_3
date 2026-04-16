import { RingBuffer } from '../utils/ringBuffer';

// Channels captured per sim step. New channels should be appended, never
// reordered — the telemetry panel reads by name.
export const TELEMETRY_CHANNELS = [
  'time',
  'speed',
  'yawRate',
  'latG',
  'longG',
  'steering',
  'throttle',
  'omega_fl',
  'omega_fr',
  'omega_rl',
  'omega_rr',
  'torque_fl',
  'torque_fr',
  'torque_rl',
  'torque_rr',
  'touch_fl',
  'touch_fr',
  'touch_rl',
  'touch_rr',
] as const;

export type TelemetryChannel = (typeof TELEMETRY_CHANNELS)[number];

export class TelemetryBus {
  readonly channels: Map<TelemetryChannel, RingBuffer>;
  // Downsampling: sim runs at 500 Hz; the panel redraws at ~30 Hz. Keeping
  // ~5 s of data at sim rate is 2500 samples per channel.
  readonly capacity: number;

  constructor(capacity = 5000) {
    this.capacity = capacity;
    this.channels = new Map();
    for (const name of TELEMETRY_CHANNELS) {
      this.channels.set(name, new RingBuffer(capacity));
    }
  }

  push(sample: Record<TelemetryChannel, number>) {
    for (const name of TELEMETRY_CHANNELS) {
      this.channels.get(name)!.push(sample[name]);
    }
  }

  clear() {
    for (const ch of this.channels.values()) ch.clear();
  }
}

export const telemetry = new TelemetryBus();
