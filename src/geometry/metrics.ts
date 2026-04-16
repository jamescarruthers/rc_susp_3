import {
  type Hardpoints,
  toUprightLocal,
} from './hardpoints';
import { type KinematicState } from './solver';
import {
  eulerToMat3,
  m3mulv,
  v3,
  vadd,
  vsub,
  vlen,
  vnorm,
  vcross,
  vdot,
  type Vec3,
} from './vec';

export interface CornerMetrics {
  camber: number;            // rad, +ve = top out (away from centreline)
  caster: number;            // rad, +ve = top of steering axis leans back
  toe: number;               // rad, +ve = toe-in
  kpi: number;               // rad, +ve = top of steering axis leans inward
  scrubRadius: number;       // m, +ve = axis ground-intercept outboard of CP
  mechanicalTrail: number;   // m, +ve = axis intercept behind CP
  rollCentreHeight: number;  // m, above ground at Y=0
  swingAxleLength: number;   // m, half-horizontal of instant centre (front view)
  instantCentre: Vec3;       // front-view instant centre (x=0 for single-corner view)
  wheelCentre: Vec3;         // world pos of the wheel centre after solve
  contactPatch: Vec3;        // world pos of the contact patch after solve
  spinAxis: Vec3;            // unit vector, in chassis frame
  steerAxis: Vec3;           // unit vector, LO→UO, in chassis frame
}

export type MetricKey = keyof Omit<
  CornerMetrics,
  'instantCentre' | 'wheelCentre' | 'contactPatch' | 'spinAxis' | 'steerAxis'
>;

export const METRIC_KEYS: MetricKey[] = [
  'camber',
  'caster',
  'toe',
  'kpi',
  'scrubRadius',
  'mechanicalTrail',
  'rollCentreHeight',
  'swingAxleLength',
];

// `side` tells us which side of the car the corner is on so we can report
// the usual signed conventions (camber, KPI, toe) consistently.
export interface MetricsOpts {
  side: 'left' | 'right';
}

export function cornerMetrics(
  hp: Hardpoints,
  state: KinematicState,
  opts: MetricsOpts = { side: 'left' },
): CornerMetrics {
  const R = eulerToMat3(state.pose.rot);
  const pos = state.pose.pos;

  const UO_local = toUprightLocal(hp.upperOutboard, hp);
  const LO_local = toUprightLocal(hp.lowerOutboard, hp);
  const CP_local = toUprightLocal(
    v3(hp.wheelCentre[0], hp.wheelCentre[1], hp.wheelCentre[2] - hp.wheelRadius),
    hp,
  );
  // Spin axis is defined in the MJCF as the upright's local Y axis; the
  // geometry tool should stay consistent with that.
  const spinLocal: Vec3 = [0, 1, 0];

  const UO = vadd(m3mulv(R, UO_local), pos);
  const LO = vadd(m3mulv(R, LO_local), pos);
  const CP = vadd(m3mulv(R, CP_local), pos);
  const spinAxisRaw = vnorm(m3mulv(R, spinLocal));
  const steerAxisRaw = vnorm(vsub(UO, LO));
  const sideSign = opts.side === 'left' ? 1 : -1;

  // --- Camber: front view, angle of wheel plane from vertical.
  // Wheel plane normal = spin axis. In the Y-Z projection, the spin axis
  // direction on the +Y hemisphere tells us how the wheel tilts. Flipping
  // the sign for the right side keeps "negative camber = top in".
  const spinYZ = vnorm([0, spinAxisRaw[1] * sideSign, spinAxisRaw[2]]);
  // +ve sy with sz=0 means spin axis along +Y → wheel vertical → 0 camber.
  // +ve sz means the spin axis tips up on the outboard side, i.e. top of
  // wheel goes outward → positive camber.
  const camber = -Math.asin(clamp(spinYZ[2], -1, 1));

  // --- Toe: top-down view, rotation of the wheel's forward direction
  // relative to chassis X. Forward = spin × Z_up. For the left wheel,
  // toe-in pulls the front toward -Y, so +toe corresponds to atan2 with
  // a flipped Y component.
  const fwd = vnorm(vcross(spinAxisRaw, [0, 0, 1]));
  const toe = sideSign * Math.atan2(-fwd[1], fwd[0]);

  // --- Caster: side view (X-Z), angle of steering axis from vertical,
  // positive = top leans back (-X).
  const axisXZ = vnorm([steerAxisRaw[0], 0, steerAxisRaw[2]]);
  const caster = Math.atan2(-axisXZ[0], axisXZ[2]);

  // --- KPI: front view (Y-Z), angle from vertical, positive = top leans
  // toward centreline (i.e. +Y on the right side, -Y on the left).
  const axisYZ = vnorm([0, steerAxisRaw[1] * sideSign, steerAxisRaw[2]]);
  const kpi = -Math.atan2(axisYZ[1], axisYZ[2]);

  // --- Steering axis ground intercept: extend LO + t·(UO-LO) until z=0.
  const diffZ = UO[2] - LO[2];
  const t = Math.abs(diffZ) > 1e-9 ? -LO[2] / diffZ : 0;
  const groundIntercept: Vec3 = [
    LO[0] + t * (UO[0] - LO[0]),
    LO[1] + t * (UO[1] - LO[1]),
    0,
  ];
  // Scrub radius: signed Y-distance from CP to ground intercept. For the
  // left wheel, +Y of intercept relative to CP means the intercept is
  // outboard of the tyre, i.e. positive scrub.
  const scrubRadius = sideSign * (groundIntercept[1] - CP[1]);
  // Mechanical trail: +ve = axis intercept behind CP along -X.
  const mechanicalTrail = CP[0] - groundIntercept[0];

  // --- Front-view instant centre: intersect upper and lower A-arm lines
  // projected onto Y-Z. Use the midpoint of the inboard pivot pair as the
  // arm's inboard YZ point (projecting the inboard axis onto Y-Z).
  const upperInYZ = midYZ(hp.upperInboardFront, hp.upperInboardRear);
  const lowerInYZ = midYZ(hp.lowerInboardFront, hp.lowerInboardRear);
  const upperOutYZ: [number, number] = [UO[1], UO[2]];
  const lowerOutYZ: [number, number] = [LO[1], LO[2]];
  const ic = intersectLines2D(upperInYZ, upperOutYZ, lowerInYZ, lowerOutYZ);
  // Swing axle length: horizontal distance from contact patch to IC.
  // "Length" is signed via the side — toward the centreline is positive.
  const swingAxleLength = ic
    ? Math.hypot(ic[0] - CP[1], ic[1] - 0)
    : Number.POSITIVE_INFINITY;

  // --- Roll-centre height: in the front view, RC lies on the line from
  // contact patch to instant centre, at Y=0 (vehicle centreline).
  const cpYZ: [number, number] = [CP[1], 0];
  let rollCentreHeight = 0;
  if (ic) {
    const dy = ic[0] - cpYZ[0];
    const dz = ic[1] - cpYZ[1];
    if (Math.abs(dy) > 1e-9) {
      const tRC = (0 - cpYZ[0]) / dy;
      rollCentreHeight = cpYZ[1] + tRC * dz;
    }
  }

  return {
    camber,
    caster,
    toe,
    kpi,
    scrubRadius,
    mechanicalTrail,
    rollCentreHeight,
    swingAxleLength,
    instantCentre: ic ? [0, ic[0], ic[1]] : [0, 0, 0],
    wheelCentre: pos,
    contactPatch: CP,
    spinAxis: spinAxisRaw,
    steerAxis: steerAxisRaw,
  };
}

function midYZ(a: Vec3, b: Vec3): [number, number] {
  return [(a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5];
}

// Intersect two infinite lines in 2D, each defined by two points. Returns
// null if they're parallel (within tolerance).
function intersectLines2D(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number],
): [number, number] | null {
  const denom = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
  if (Math.abs(denom) < 1e-12) return null;
  const t =
    ((p1[0] - p3[0]) * (p3[1] - p4[1]) - (p1[1] - p3[1]) * (p3[0] - p4[0])) / denom;
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

void vlen;
void vdot;
