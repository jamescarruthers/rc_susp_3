import { useSimStore } from '../store/simStore';

export function HUD() {
  const chassis = useSimStore((s) => s.chassis);
  const input = useSimStore((s) => s.input);

  const speed = Math.hypot(chassis.velocity[0], chassis.velocity[1]);
  const speedKmh = speed * 3.6;
  const yawDeg = (chassis.yawRate * 180) / Math.PI;
  const latG = chassis.lateralG / 9.80665;

  return (
    <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur px-3 py-2 rounded-md text-neutral-100 font-mono text-xs space-y-0.5 pointer-events-none">
      <div>
        speed <span className="text-sky-300">{speed.toFixed(2)} m/s</span>{' '}
        <span className="text-neutral-400">({speedKmh.toFixed(1)} km/h)</span>
      </div>
      <div>
        yaw rate <span className="text-emerald-300">{yawDeg.toFixed(1)} °/s</span>
      </div>
      <div>
        lat g <span className="text-amber-300">{latG.toFixed(2)} g</span>
      </div>
      <div>
        steer <span className="text-fuchsia-300">{(input.steering * 100).toFixed(0)} %</span>
        {'  '}
        throttle <span className="text-lime-300">{(input.throttle * 100).toFixed(0)} %</span>
      </div>
    </div>
  );
}
