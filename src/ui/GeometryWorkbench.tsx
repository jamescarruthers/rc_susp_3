import { useGeometryStore } from '../store/geometryStore';
import { useSolve } from '../geometry/useSolve';
import { HardpointPanel } from './HardpointPanel';
import { PivotEditor2D } from './PivotEditor2D';
import { GeometryCurves } from './GeometryCurves';

// Top-level layout for the geometry tab: hardpoint list + numeric inputs
// on the left, 2D pivot views in the centre, curves on the right. A
// static-readout strip at the bottom reports the solved metrics at rest.
export function GeometryWorkbench() {
  return (
    <div className="flex flex-1 min-h-0">
      <aside className="w-56 shrink-0 border-r border-neutral-800 bg-neutral-950 overflow-auto">
        <HardpointPanel />
      </aside>
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-auto">
          <PivotEditor2D />
        </div>
        <StaticReadout />
      </main>
      <aside className="w-80 shrink-0 border-l border-neutral-800 bg-neutral-950 overflow-hidden flex flex-col">
        <GeometryCurves />
      </aside>
    </div>
  );
}

function StaticReadout() {
  const { state, metrics } = useSolve();
  const active = useGeometryStore((s) => s.active);
  const deg = (r: number) => ((r * 180) / Math.PI).toFixed(2);
  const mm = (m: number) => (m * 1000).toFixed(1);
  return (
    <div className="border-t border-neutral-800 bg-neutral-950 px-3 py-1.5 text-[11px] font-mono text-neutral-300 flex flex-wrap gap-x-4 gap-y-0.5">
      <span className="text-neutral-500">{active} · rest</span>
      <span>camber {deg(metrics.camber)}°</span>
      <span>caster {deg(metrics.caster)}°</span>
      <span>KPI {deg(metrics.kpi)}°</span>
      <span>toe {deg(metrics.toe)}°</span>
      <span>scrub {mm(metrics.scrubRadius)} mm</span>
      <span>trail {mm(metrics.mechanicalTrail)} mm</span>
      <span>RC h {mm(metrics.rollCentreHeight)} mm</span>
      <span>SAL {mm(metrics.swingAxleLength)} mm</span>
      <span
        className={state.converged ? 'text-emerald-400 ml-auto' : 'text-rose-400 ml-auto'}
      >
        solve {state.converged ? 'OK' : 'DIVERGED'} · res {state.residual.toExponential(1)} · {state.iterations} iter
      </span>
    </div>
  );
}
