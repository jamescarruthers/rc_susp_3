import { defaultParams, type SimParams, useSimStore } from '../store/simStore';

const KEY = 'rc-mujoco-sim:presets';
const MAX_PRESETS = 16;

export interface Preset {
  name: string;
  savedAt: number;
  params: SimParams;
}

export function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Preset[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_PRESETS);
  } catch {
    return [];
  }
}

export function savePreset(name: string): Preset[] {
  const params = useSimStore.getState().params;
  const list = loadPresets().filter((p) => p.name !== name);
  const next: Preset = { name, savedAt: Date.now(), params: JSON.parse(JSON.stringify(params)) };
  list.unshift(next);
  const trimmed = list.slice(0, MAX_PRESETS);
  localStorage.setItem(KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function deletePreset(name: string): Preset[] {
  const list = loadPresets().filter((p) => p.name !== name);
  localStorage.setItem(KEY, JSON.stringify(list));
  return list;
}

export function applyPreset(preset: Preset) {
  useSimStore.getState().setParams(preset.params);
}

export function resetToDefaults() {
  useSimStore.getState().setParams(defaultParams);
}
