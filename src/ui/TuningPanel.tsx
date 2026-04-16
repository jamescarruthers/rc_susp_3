import { useEffect } from 'react';
import { useControls, folder, Leva } from 'leva';
import { useSimStore, type SimParams, type WishboneGeometry } from '../store/simStore';
import { generateCarMjcf } from '../model/generate';
import { requestModelReload } from '../loop/simLoop';

// Subset of SimParams that requires rebuilding the MJCF. Changes to these
// fields regenerate the XML and queue a reload. Pure-runtime fields
// (torque vectoring gains, etc.) update in place.
const STRUCTURAL_KEYS: Array<keyof SimParams> = [
  'chassisMass',
  'cogHeight',
  'wheelbase',
  'trackFront',
  'trackRear',
  'wheelRadius',
  'wheelMass',
  'springRate',
  'damping',
  'rideHeight',
  'friction',
  'maxMotorTorque',
];

export function TuningPanel() {
  const params = useSimStore((s) => s.params);

  const [vals] = useControls(() => ({
    chassis: folder({
      chassisMass: { value: params.chassisMass, min: 0.5, max: 10, step: 0.05 },
      cogHeight: { value: params.cogHeight, min: 0.02, max: 0.12, step: 0.005 },
      wheelbase: { value: params.wheelbase, min: 0.15, max: 0.5, step: 0.005 },
      trackFront: { value: params.trackFront, min: 0.1, max: 0.4, step: 0.005 },
      trackRear: { value: params.trackRear, min: 0.1, max: 0.4, step: 0.005 },
    }),
    tyre: folder({
      wheelRadius: { value: params.wheelRadius, min: 0.02, max: 0.12, step: 0.001 },
      wheelMass: { value: params.wheelMass, min: 0.02, max: 0.5, step: 0.01 },
      frictionMu: { value: params.friction[0], min: 0.3, max: 2.0, step: 0.05 },
      frictionTorsional: { value: params.friction[1], min: 0.0, max: 0.2, step: 0.01 },
      frictionRolling: { value: params.friction[2], min: 0.0, max: 0.01, step: 0.0005 },
    }),
    suspension: folder({
      springRate: { value: params.springRate, min: 500, max: 20000, step: 100 },
      damping: { value: params.damping, min: 5, max: 300, step: 5 },
      rideHeight: { value: params.rideHeight, min: 0.005, max: 0.08, step: 0.001 },
    }),
    steering: folder({
      ackermann: { value: params.ackermann, min: 0, max: 1.5, step: 0.05 },
    }),
    drivetrain: folder({
      maxMotorTorque: { value: params.maxMotorTorque, min: 0.1, max: 10, step: 0.1 },
      driveBias: { value: params.driveBias, min: 0, max: 1, step: 0.05 },
    }),
    control: folder({
      tvEnabled: { value: params.tvEnabled },
      tvPGain: { value: params.tvPGain, min: 0, max: 10, step: 0.1 },
      tvIGain: { value: params.tvIGain, min: 0, max: 5, step: 0.05 },
      understeerK: { value: params.understeerK, min: 0, max: 0.02, step: 0.0005 },
      tcEnabled: { value: params.tcEnabled },
      slipThreshold: { value: params.slipThreshold, min: 0.05, max: 0.4, step: 0.01 },
    }),
  }));

  useEffect(() => {
    const next: SimParams = {
      ...params,
      chassisMass: vals.chassisMass,
      cogHeight: vals.cogHeight,
      wheelbase: vals.wheelbase,
      trackFront: vals.trackFront,
      trackRear: vals.trackRear,
      wheelRadius: vals.wheelRadius,
      wheelMass: vals.wheelMass,
      friction: [vals.frictionMu, vals.frictionTorsional, vals.frictionRolling],
      springRate: vals.springRate,
      damping: vals.damping,
      rideHeight: vals.rideHeight,
      ackermann: vals.ackermann,
      maxMotorTorque: vals.maxMotorTorque,
      driveBias: vals.driveBias,
      tvEnabled: vals.tvEnabled,
      tvPGain: vals.tvPGain,
      tvIGain: vals.tvIGain,
      understeerK: vals.understeerK,
      tcEnabled: vals.tcEnabled,
      slipThreshold: vals.slipThreshold,
    };
    // Detect structural changes — only those require regenerating MJCF.
    const structuralChanged = STRUCTURAL_KEYS.some((k) => !shallowEqual(next[k], params[k]));
    useSimStore.getState().setParams(next);
    if (structuralChanged) {
      const xml = generateCarMjcf(next, { suspension: 'rigid-slider', steering: true });
      requestModelReload(xml);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    vals.chassisMass,
    vals.cogHeight,
    vals.wheelbase,
    vals.trackFront,
    vals.trackRear,
    vals.wheelRadius,
    vals.wheelMass,
    vals.frictionMu,
    vals.frictionTorsional,
    vals.frictionRolling,
    vals.springRate,
    vals.damping,
    vals.rideHeight,
    vals.ackermann,
    vals.maxMotorTorque,
    vals.driveBias,
    vals.tvEnabled,
    vals.tvPGain,
    vals.tvIGain,
    vals.understeerK,
    vals.tcEnabled,
    vals.slipThreshold,
  ]);

  return (
    <div className="h-full overflow-y-auto">
      <Leva fill titleBar={false} theme={levaTheme} collapsed={false} />
    </div>
  );
}

const levaTheme = {
  colors: {
    elevation1: '#0b0f19',
    elevation2: '#0f172a',
    elevation3: '#111827',
    accent1: '#38bdf8',
    accent2: '#0ea5e9',
    accent3: '#0284c7',
    highlight1: '#cbd5e1',
    highlight2: '#e2e8f0',
    highlight3: '#f1f5f9',
  },
};

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as Record<string, unknown>);
    const kb = Object.keys(b as Record<string, unknown>);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false;
    }
    return true;
  }
  return false;
}

// Kept to satisfy lint; WishboneGeometry exposed for future geometry panel.
export type { WishboneGeometry };
