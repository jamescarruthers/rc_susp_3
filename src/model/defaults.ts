import { defaultParams, type SimParams } from '../store/simStore';

export { defaultParams };
export type { SimParams };

export interface CornerLayout {
  // XY position of the wheel centre in the chassis frame (ISO 8855).
  name: string;
  x: number;
  y: number;
  steered: boolean;
  driven: boolean;
  // Side multiplier: +1 for left, -1 for right (MuJoCo Y left-positive).
  side: 1 | -1;
}

export function cornerLayout(params: SimParams): CornerLayout[] {
  const halfWb = params.wheelbase / 2;
  const halfTrackF = params.trackFront / 2;
  const halfTrackR = params.trackRear / 2;
  return [
    { name: 'fl', x: +halfWb, y: +halfTrackF, steered: true, driven: true, side: +1 },
    { name: 'fr', x: +halfWb, y: -halfTrackF, steered: true, driven: true, side: -1 },
    { name: 'rl', x: -halfWb, y: +halfTrackR, steered: false, driven: true, side: +1 },
    { name: 'rr', x: -halfWb, y: -halfTrackR, steered: false, driven: true, side: -1 },
  ];
}
