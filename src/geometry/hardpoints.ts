import { v3, vdist, type Vec3 } from './vec';

// All points are in the chassis frame, ISO 8855 (X fwd, Y left, Z up),
// metres. Static positions — i.e. with the upright in its reference pose,
// no ride-height delta, no steer.
//
// The A-arms are modelled as V-linkages: each inboard pivot has TWO named
// chassis-side points (front + rear of the pivot axis) plus one outboard
// ball joint on the upright. This gives four rigid-length bars per corner,
// which together with the tie rod make up the 5 spherical-distance
// constraints the solver uses.
export interface Hardpoints {
  upperInboardFront: Vec3;
  upperInboardRear: Vec3;
  upperOutboard: Vec3;
  lowerInboardFront: Vec3;
  lowerInboardRear: Vec3;
  lowerOutboard: Vec3;
  tieRodInboard: Vec3;
  tieRodOutboard: Vec3;
  // Upright reference. wheelCentre doubles as the upright body origin:
  // outboard / contact-patch locals are measured relative to it.
  wheelCentre: Vec3;
  wheelRadius: number;
  wheelWidth: number;
}

// Reference point on the upright in upright-local coords. The upright's
// rest pose is (pos = wheelCentre, rot = 0).
export function toUprightLocal(p: Vec3, hp: Hardpoints): Vec3 {
  return [p[0] - hp.wheelCentre[0], p[1] - hp.wheelCentre[1], p[2] - hp.wheelCentre[2]];
}

// Static bar lengths, cached alongside Hardpoints so the solver doesn't
// recompute them every iteration.
export interface BarLengths {
  upperFront: number;
  upperRear: number;
  lowerFront: number;
  lowerRear: number;
  tieRod: number;
  // Ground-reference Z of the contact patch at rest. The sixth constraint
  // pins the contact patch to z = contactPatchZStatic + rideHeightDelta·(-1)
  // (i.e. chassis rising by Δh is equivalent to the patch sinking by Δh
  // in the chassis frame).
  contactPatchZStatic: number;
}

export function computeBars(hp: Hardpoints): BarLengths {
  return {
    upperFront: vdist(hp.upperOutboard, hp.upperInboardFront),
    upperRear: vdist(hp.upperOutboard, hp.upperInboardRear),
    lowerFront: vdist(hp.lowerOutboard, hp.lowerInboardFront),
    lowerRear: vdist(hp.lowerOutboard, hp.lowerInboardRear),
    tieRod: vdist(hp.tieRodOutboard, hp.tieRodInboard),
    contactPatchZStatic: hp.wheelCentre[2] - hp.wheelRadius,
  };
}

// Archetypal 1/10-scale touring-car front corner. Left side (+Y).
export const defaultFrontLeft: Hardpoints = {
  wheelCentre:       v3(0.130, 0.095, 0.055),
  upperInboardFront: v3(0.160, 0.035, 0.085),
  upperInboardRear:  v3(0.100, 0.035, 0.085),
  upperOutboard:     v3(0.130, 0.082, 0.090),
  lowerInboardFront: v3(0.170, 0.030, 0.022),
  lowerInboardRear:  v3(0.090, 0.030, 0.022),
  lowerOutboard:     v3(0.130, 0.088, 0.025),
  tieRodInboard:     v3(0.105, 0.035, 0.055),
  tieRodOutboard:    v3(0.105, 0.082, 0.055),
  wheelRadius: 0.055,
  wheelWidth: 0.035,
};

// Mirror a left-side corner to the right side.
export function mirrorY(hp: Hardpoints): Hardpoints {
  const m = (p: Vec3): Vec3 => [p[0], -p[1], p[2]];
  return {
    ...hp,
    wheelCentre: m(hp.wheelCentre),
    upperInboardFront: m(hp.upperInboardFront),
    upperInboardRear: m(hp.upperInboardRear),
    upperOutboard: m(hp.upperOutboard),
    lowerInboardFront: m(hp.lowerInboardFront),
    lowerInboardRear: m(hp.lowerInboardRear),
    lowerOutboard: m(hp.lowerOutboard),
    tieRodInboard: m(hp.tieRodInboard),
    tieRodOutboard: m(hp.tieRodOutboard),
  };
}
