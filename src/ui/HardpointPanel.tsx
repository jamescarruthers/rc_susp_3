import { useGeometryStore, type HardpointKey } from '../store/geometryStore';
import type { Vec3 } from '../geometry/vec';

const LABEL: Record<HardpointKey, string> = {
  upperInboardFront: 'Upper inboard front',
  upperInboardRear: 'Upper inboard rear',
  upperOutboard: 'Upper outboard',
  lowerInboardFront: 'Lower inboard front',
  lowerInboardRear: 'Lower inboard rear',
  lowerOutboard: 'Lower outboard',
  tieRodInboard: 'Tie rod inboard',
  tieRodOutboard: 'Tie rod outboard',
  wheelCentre: 'Wheel centre',
};

// Numeric inputs for the selected hardpoint's X/Y/Z in mm. Keeps the typed
// Vec3 in the store while presenting metres-to-mm readouts for user input.
export function HardpointPanel() {
  const active = useGeometryStore((s) => s.active);
  const hp = useGeometryStore((s) => s[s.active]);
  const selected = useGeometryStore((s) => s.selected);
  const setHardpoint = useGeometryStore((s) => s.setHardpoint);
  const setActive = useGeometryStore((s) => s.setActive);

  const p: Vec3 | null = selected
    ? selected === 'wheelCentre'
      ? hp.wheelCentre
      : ((hp as unknown as Record<string, Vec3>)[selected] ?? null)
    : null;

  const setAxis = (axis: 0 | 1 | 2, mm: number) => {
    if (!selected || !p) return;
    const next: [number, number, number] = [p[0], p[1], p[2]];
    next[axis] = mm / 1000;
    setHardpoint(selected, next);
  };

  return (
    <div className="p-2 space-y-2 text-xs font-mono">
      <div className="flex gap-1">
        {(['front', 'rear'] as const).map((a) => (
          <button
            key={a}
            onClick={() => setActive(a)}
            className={`px-2 py-0.5 rounded ${
              active === a ? 'bg-sky-600 text-white' : 'bg-neutral-800 text-neutral-300'
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      {selected && p ? (
        <div className="space-y-1">
          <div className="text-neutral-300">{LABEL[selected]}</div>
          {(['X (fwd)', 'Y (left)', 'Z (up)'] as const).map((label, i) => (
            <label key={label} className="flex items-center gap-2">
              <span className="w-14 text-neutral-400">{label}</span>
              <input
                type="number"
                step={0.5}
                value={(p[i] * 1000).toFixed(1)}
                onChange={(e) => setAxis(i as 0 | 1 | 2, parseFloat(e.target.value) || 0)}
                className="w-20 bg-neutral-900 border border-neutral-700 px-1 py-0.5 rounded text-right"
              />
              <span className="text-neutral-500">mm</span>
            </label>
          ))}
        </div>
      ) : (
        <div className="text-neutral-500">Click a hardpoint to edit coordinates.</div>
      )}
    </div>
  );
}
