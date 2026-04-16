import { useGeometryStore } from '../store/geometryStore';
import { defaultDynamics, mjcfFromGeometry } from '../model/fromGeometry';
import { requestModelReload } from '../loop/simLoop';
import { useSimStore } from '../store/simStore';

export type AppTab = 'geometry' | 'dynamic';

interface TopBarProps {
  tab: AppTab;
  setTab: (t: AppTab) => void;
}

export function TopBar({ tab, setTab }: TopBarProps) {
  const status = useSimStore((s) => s.status);

  const loadFromGeometry = () => {
    const g = useGeometryStore.getState();
    const params = useSimStore.getState().params;
    // Splice in the dynamic params from the existing SimParams so mass,
    // spring rate, friction etc. keep whatever the dynamic-tab Leva panel
    // has set.
    const dyn = {
      ...defaultDynamics,
      chassisMass: params.chassisMass,
      wheelMass: params.wheelMass,
      springRate: params.springRate,
      damping: params.damping,
      friction: params.friction,
      maxMotorTorque: params.maxMotorTorque,
    };
    const xml = mjcfFromGeometry(g.front, g.rear, dyn);
    requestModelReload(xml, true);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 border-b border-neutral-800 text-xs font-mono">
      <div className="flex rounded overflow-hidden border border-neutral-700">
        {(['geometry', 'dynamic'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 ${
              tab === t ? 'bg-sky-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
          >
            {t === 'geometry' ? 'Geometry' : 'Dynamic sim'}
          </button>
        ))}
      </div>
      {tab === 'dynamic' && (
        <button
          className="px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50"
          onClick={loadFromGeometry}
          disabled={status !== 'ready'}
          title="Rebuild the MJCF from the current hardpoints"
        >
          Load from geometry
        </button>
      )}
      <span className="ml-auto text-neutral-500">
        {status === 'ready' ? '' : status}
      </span>
    </div>
  );
}
