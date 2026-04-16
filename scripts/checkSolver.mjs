// Node smoke test for the kinematic solver. Bundles the TS geometry code
// with esbuild so we can hit it from Node without a browser.
//
// Checks:
//  1. At zero input the solver must return the rest pose (pos = wheelCentre,
//     rot ~ 0) with residual ≈ 0.
//  2. Sweeping ride-height smoothly produces converged poses.
//  3. Warm-starting the solver across a sweep keeps iterations low.
//  4. Symmetry: mirroring a left corner and running a mirrored input gives
//     mirrored upright poses, i.e. the solver isn't sign-biased.
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

mkdirSync('.tmp', { recursive: true });
writeFileSync(
  '.tmp/solverEntry.ts',
  `export { solveCorner } from '../src/geometry/solver';\n` +
    `export { defaultFrontLeft, mirrorY, computeBars } from '../src/geometry/hardpoints';\n`,
);
execSync(
  `npx esbuild .tmp/solverEntry.ts --bundle --format=esm --platform=node ` +
    `--outfile=.tmp/solver.mjs --log-level=warning`,
  { stdio: 'inherit' },
);

const mod = await import(resolve('.tmp/solver.mjs'));
const { solveCorner, defaultFrontLeft, mirrorY } = mod;

let failures = 0;
const check = (label, cond, detail = '') => {
  const ok = Boolean(cond);
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  if (!ok) failures += 1;
};

// --- 1. rest pose
{
  const s = solveCorner(defaultFrontLeft, { rideHeightDelta: 0, steerRack: 0, rollAngle: 0 });
  check('rest: converged', s.converged, `res=${s.residual.toExponential(2)}`);
  check('rest: iter <= 5', s.iterations <= 5, `iter=${s.iterations}`);
  check(
    'rest: pose at wheelCentre',
    Math.hypot(
      s.pose.pos[0] - defaultFrontLeft.wheelCentre[0],
      s.pose.pos[1] - defaultFrontLeft.wheelCentre[1],
      s.pose.pos[2] - defaultFrontLeft.wheelCentre[2],
    ) < 1e-6,
  );
  check(
    'rest: rotation ≈ 0',
    Math.hypot(s.pose.rot[0], s.pose.rot[1], s.pose.rot[2]) < 1e-6,
  );
}

// --- 2. ride-height sweep
{
  const samples = 41;
  const hMax = 0.02; // ±20 mm
  let worstIter = 0;
  let worstResid = 0;
  let warm;
  let firstIterAtRest = null;
  let warmIterAvg = 0;
  let warmCount = 0;
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const dh = -hMax + 2 * hMax * t;
    const cold = solveCorner(defaultFrontLeft, { rideHeightDelta: dh, steerRack: 0, rollAngle: 0 });
    const warmed = solveCorner(
      defaultFrontLeft,
      { rideHeightDelta: dh, steerRack: 0, rollAngle: 0 },
      warm,
    );
    if (!cold.converged || !warmed.converged) {
      check(`sweep dh=${dh.toFixed(3)} converged`, false, `res=${cold.residual.toExponential(2)}`);
    }
    worstIter = Math.max(worstIter, cold.iterations);
    worstResid = Math.max(worstResid, cold.residual);
    if (i > 0) {
      warmIterAvg += warmed.iterations;
      warmCount += 1;
    }
    if (i === Math.floor(samples / 2)) firstIterAtRest = cold.iterations;
    warm = warmed.pose;
  }
  check('sweep: worst residual < 1e-8', worstResid < 1e-8, `max=${worstResid.toExponential(2)}`);
  check('sweep: cold iter ≤ 15 anywhere', worstIter <= 15, `worst=${worstIter}`);
  const avg = warmCount > 0 ? warmIterAvg / warmCount : 0;
  check('sweep: warm-start avg iter ≤ 4', avg <= 4, `avg=${avg.toFixed(2)}`);
}

// --- 3. symmetry: mirror left corner, solve both, compare poses
{
  const left = defaultFrontLeft;
  const right = mirrorY(left);
  const sLeft = solveCorner(left, { rideHeightDelta: 0.01, steerRack: 0, rollAngle: 0 });
  const sRight = solveCorner(right, { rideHeightDelta: 0.01, steerRack: 0, rollAngle: 0 });
  check('sym: both converged', sLeft.converged && sRight.converged);
  // Mirroring Y should mirror pos.y and flip rot.x and rot.z signs
  // (rot.y is unchanged because Ry commutes with the mirror).
  const posYOk = Math.abs(sLeft.pose.pos[1] + sRight.pose.pos[1]) < 1e-8;
  check('sym: pos.y mirrored', posYOk,
    `L=${sLeft.pose.pos[1].toExponential(2)} R=${sRight.pose.pos[1].toExponential(2)}`);
  const posZOk = Math.abs(sLeft.pose.pos[2] - sRight.pose.pos[2]) < 1e-8;
  check('sym: pos.z equal', posZOk);
}

// --- 4. steering moves tie-rod-driven motion
{
  const s0 = solveCorner(defaultFrontLeft, { rideHeightDelta: 0, steerRack: 0, rollAngle: 0 });
  const sR = solveCorner(
    defaultFrontLeft,
    { rideHeightDelta: 0, steerRack: 0.003, rollAngle: 0 },
    s0.pose,
  );
  check('steer: converged', sR.converged);
  // Body should yaw about Z — rot.z magnitude noticeably non-zero.
  check('steer: rot.z responds', Math.abs(sR.pose.rot[2] - s0.pose.rot[2]) > 1e-3,
    `Δrot.z=${(sR.pose.rot[2] - s0.pose.rot[2]).toExponential(2)}`);
}

rmSync('.tmp', { recursive: true, force: true });
if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
