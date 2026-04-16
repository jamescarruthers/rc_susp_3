import {
  computeBars,
  toUprightLocal,
  type BarLengths,
  type Hardpoints,
} from './hardpoints';
import {
  eulerToMat3,
  m3mulv,
  v3,
  vadd,
  vdot,
  vsub,
  type Vec3,
} from './vec';

export interface Pose {
  pos: Vec3; // upright origin in chassis frame
  rot: Vec3; // Euler XYZ, rad
}

export interface KinematicInput {
  rideHeightDelta: number; // +up, m. Chassis rising sinks the contact patch in chassis frame.
  steerRack: number; // lateral rack displacement, m (+ = tie-rod inner moves outboard on left side).
  rollAngle: number; // rad about X, reserved for later; zero for now
}

export interface KinematicState {
  pose: Pose;
  residual: number;
  iterations: number;
  converged: boolean;
}

export const zeroInput: KinematicInput = {
  rideHeightDelta: 0,
  steerRack: 0,
  rollAngle: 0,
};

const DEFAULT_MAX_ITER = 40;
const DEFAULT_TOL = 1e-9;
const FD_EPS = 1e-6;

// Main entry point. Solves for the upright pose such that the five bar-length
// constraints and the sixth "contact-patch Z equals requested ride height"
// constraint are all satisfied. 6 equations × 6 unknowns → Newton-Raphson
// with a finite-difference Jacobian and a simple backtracking line search.
//
// warmStart lets a sweep pass the previous sample's pose as the seed,
// typically converging in 1–3 iterations.
export function solveCorner(
  hp: Hardpoints,
  input: KinematicInput,
  warmStart?: Pose,
  opts: { maxIter?: number; tol?: number } = {},
): KinematicState {
  const bars = computeBars(hp);
  const uprightLocal = {
    upperOutboard: toUprightLocal(hp.upperOutboard, hp),
    lowerOutboard: toUprightLocal(hp.lowerOutboard, hp),
    tieRodOutboard: toUprightLocal(hp.tieRodOutboard, hp),
    contactPatch: toUprightLocal(
      v3(hp.wheelCentre[0], hp.wheelCentre[1], hp.wheelCentre[2] - hp.wheelRadius),
      hp,
    ),
  };

  const seed: Pose = warmStart ?? {
    pos: [hp.wheelCentre[0], hp.wheelCentre[1], hp.wheelCentre[2]],
    rot: [0, 0, 0],
  };
  let x: number[] = [seed.pos[0], seed.pos[1], seed.pos[2], seed.rot[0], seed.rot[1], seed.rot[2]];

  const maxIter = opts.maxIter ?? DEFAULT_MAX_ITER;
  const tol = opts.tol ?? DEFAULT_TOL;

  const r = new Array<number>(6);
  const J = new Array<number>(36);

  let iter = 0;
  let resNorm = evalResiduals(x, hp, bars, input, uprightLocal, r);

  for (; iter < maxIter && resNorm > tol; iter++) {
    // Finite-difference Jacobian: columns via one residual eval each.
    const rPerturb = new Array<number>(6);
    for (let j = 0; j < 6; j++) {
      const save = x[j];
      x[j] = save + FD_EPS;
      evalResiduals(x, hp, bars, input, uprightLocal, rPerturb);
      x[j] = save;
      for (let i = 0; i < 6; i++) {
        J[i * 6 + j] = (rPerturb[i] - r[i]) / FD_EPS;
      }
    }
    const rhs = r.map((v) => -v);
    const dx = solve6(J, rhs);
    // Backtracking line search so a wild Newton step can't diverge when
    // we're far from a solution (happens with aggressive ride-height sweeps).
    let alpha = 1;
    const xTrial = x.slice();
    for (let k = 0; k < 20; k++) {
      for (let i = 0; i < 6; i++) xTrial[i] = x[i] + alpha * dx[i];
      const newNorm = evalResiduals(xTrial, hp, bars, input, uprightLocal, rPerturb);
      if (newNorm < resNorm) {
        x = xTrial.slice();
        for (let i = 0; i < 6; i++) r[i] = rPerturb[i];
        resNorm = newNorm;
        break;
      }
      alpha *= 0.5;
    }
  }

  return {
    pose: {
      pos: [x[0], x[1], x[2]],
      rot: [x[3], x[4], x[5]],
    },
    residual: resNorm,
    iterations: iter,
    converged: resNorm <= tol,
  };
}

interface UprightLocal {
  upperOutboard: Vec3;
  lowerOutboard: Vec3;
  tieRodOutboard: Vec3;
  contactPatch: Vec3;
}

function evalResiduals(
  x: number[],
  hp: Hardpoints,
  bars: BarLengths,
  input: KinematicInput,
  ul: UprightLocal,
  out: number[],
): number {
  const pos: Vec3 = [x[0], x[1], x[2]];
  const R = eulerToMat3([x[3], x[4], x[5]]);
  const UO = vadd(m3mulv(R, ul.upperOutboard), pos);
  const LO = vadd(m3mulv(R, ul.lowerOutboard), pos);
  const TO = vadd(m3mulv(R, ul.tieRodOutboard), pos);
  const CP = vadd(m3mulv(R, ul.contactPatch), pos);

  // Steering: translate the tie-rod inner by the rack displacement along Y.
  // Sign convention: +steerRack → tie rod inner moves outboard on the left
  // side, which is the standard "rack pushes out" direction.
  const TI: Vec3 = [
    hp.tieRodInboard[0],
    hp.tieRodInboard[1] + Math.sign(hp.tieRodInboard[1] || 1) * input.steerRack,
    hp.tieRodInboard[2],
  ];

  // Using squared-distance residuals avoids a sqrt per row and keeps the
  // residuals smooth through zero.
  out[0] = sqDist(UO, hp.upperInboardFront) - bars.upperFront * bars.upperFront;
  out[1] = sqDist(UO, hp.upperInboardRear) - bars.upperRear * bars.upperRear;
  out[2] = sqDist(LO, hp.lowerInboardFront) - bars.lowerFront * bars.lowerFront;
  out[3] = sqDist(LO, hp.lowerInboardRear) - bars.lowerRear * bars.lowerRear;
  out[4] = sqDist(TO, TI) - bars.tieRod * bars.tieRod;
  // Chassis rises by Δh ⇒ patch Z in chassis frame drops by Δh.
  out[5] = CP[2] - (bars.contactPatchZStatic - input.rideHeightDelta);

  let n2 = 0;
  for (let i = 0; i < 6; i++) n2 += out[i] * out[i];
  return Math.sqrt(n2);
}

function sqDist(a: Vec3, b: Vec3): number {
  const d = vsub(a, b);
  return vdot(d, d);
}

// Solve Jx = b for a 6×6 dense J (row-major). Gauss elimination with
// partial pivoting — 6×6 is small enough that a library is overkill.
function solve6(J: number[], b: number[]): number[] {
  const n = 6;
  // Copy into augmented matrix.
  const A = new Array<number>(n * (n + 1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) A[i * (n + 1) + j] = J[i * n + j];
    A[i * (n + 1) + n] = b[i];
  }
  for (let k = 0; k < n; k++) {
    // Pivot
    let piv = k;
    let best = Math.abs(A[k * (n + 1) + k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(A[i * (n + 1) + k]);
      if (v > best) {
        best = v;
        piv = i;
      }
    }
    if (best < 1e-14) return new Array<number>(n).fill(0);
    if (piv !== k) {
      for (let j = 0; j <= n; j++) {
        const tmp = A[k * (n + 1) + j];
        A[k * (n + 1) + j] = A[piv * (n + 1) + j];
        A[piv * (n + 1) + j] = tmp;
      }
    }
    // Eliminate
    for (let i = k + 1; i < n; i++) {
      const f = A[i * (n + 1) + k] / A[k * (n + 1) + k];
      if (f === 0) continue;
      for (let j = k; j <= n; j++) {
        A[i * (n + 1) + j] -= f * A[k * (n + 1) + j];
      }
    }
  }
  // Back-substitute
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = A[i * (n + 1) + n];
    for (let j = i + 1; j < n; j++) s -= A[i * (n + 1) + j] * x[j];
    x[i] = s / A[i * (n + 1) + i];
  }
  return x;
}
