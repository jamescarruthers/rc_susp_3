import { create } from 'zustand';
import { defaultFrontLeft, type Hardpoints } from '../geometry/hardpoints';

// One archetypal corner at a time (front + rear variants). The solver runs
// on the selected archetype; a future "full car" view can apply mirror + the
// other axle. Keeping selection off the Hardpoints type so undo / presets
// don't have to track UI state.
export type CornerArchetype = 'front' | 'rear';

export type HardpointKey =
  | 'upperInboardFront'
  | 'upperInboardRear'
  | 'upperOutboard'
  | 'lowerInboardFront'
  | 'lowerInboardRear'
  | 'lowerOutboard'
  | 'tieRodInboard'
  | 'tieRodOutboard'
  | 'wheelCentre';

export interface GeometryState {
  front: Hardpoints;
  rear: Hardpoints;
  active: CornerArchetype;
  selected: HardpointKey | null;
  setHardpoint: (key: HardpointKey, value: [number, number, number]) => void;
  setWheelSize: (radius: number, width: number) => void;
  setActive: (a: CornerArchetype) => void;
  select: (k: HardpointKey | null) => void;
  replace: (archetype: CornerArchetype, hp: Hardpoints) => void;
}

export const useGeometryStore = create<GeometryState>((set) => ({
  front: defaultFrontLeft,
  rear: defaultFrontLeft, // identical archetype to start; user tunes rear separately
  active: 'front',
  selected: null,
  setHardpoint: (key, value) =>
    set((s) => {
      const curr = s[s.active];
      if (key === 'wheelCentre') {
        return { [s.active]: { ...curr, wheelCentre: value } } as Partial<GeometryState>;
      }
      return { [s.active]: { ...curr, [key]: value } } as Partial<GeometryState>;
    }),
  setWheelSize: (radius, width) =>
    set((s) => ({ [s.active]: { ...s[s.active], wheelRadius: radius, wheelWidth: width } }) as Partial<GeometryState>),
  setActive: (active) => set({ active }),
  select: (selected) => set({ selected }),
  replace: (archetype, hp) => set({ [archetype]: hp } as Partial<GeometryState>),
}));
