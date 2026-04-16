import { useEffect, useState } from 'react';
import {
  applyPreset,
  deletePreset,
  loadPresets,
  resetToDefaults,
  savePreset,
  type Preset,
} from '../control/presets';
import { generateCarMjcf } from '../model/generate';
import { requestModelReload } from '../loop/simLoop';
import { useSimStore } from '../store/simStore';

export function PresetBar() {
  const [presets, setPresets] = useState<Preset[]>([]);

  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  const reload = () => {
    const params = useSimStore.getState().params;
    const xml = generateCarMjcf(params, { suspension: 'rigid-slider', steering: true });
    requestModelReload(xml);
  };

  const onSave = () => {
    const name = window.prompt('Preset name?');
    if (!name) return;
    setPresets(savePreset(name));
  };

  const onApply = (p: Preset) => {
    applyPreset(p);
    reload();
  };

  const onDelete = (p: Preset) => {
    if (!window.confirm(`Delete preset "${p.name}"?`)) return;
    setPresets(deletePreset(p.name));
  };

  const onReset = () => {
    resetToDefaults();
    reload();
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-neutral-800 text-xs font-mono">
      <button className="px-2 py-0.5 rounded bg-neutral-700 hover:bg-neutral-600" onClick={onSave}>
        Save preset
      </button>
      <button
        className="px-2 py-0.5 rounded bg-neutral-700 hover:bg-neutral-600"
        onClick={onReset}
      >
        Defaults
      </button>
      <span className="text-neutral-500">Presets:</span>
      {presets.length === 0 && <span className="text-neutral-600">(none)</span>}
      {presets.map((p) => (
        <span key={p.name} className="flex items-center gap-1 bg-neutral-800 rounded px-1.5 py-0.5">
          <button className="hover:text-sky-300" onClick={() => onApply(p)}>
            {p.name}
          </button>
          <button className="text-rose-400 hover:text-rose-300" onClick={() => onDelete(p)}>
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
