// Headless validator for the MJCF generators. Bundles the TS sources with
// esbuild and loads their output into mujoco-js under Node. Exits non-zero
// if MuJoCo can't compile either model.
//
// Usage:  node scripts/checkModel.mjs
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

mkdirSync('.tmp', { recursive: true });
writeFileSync(
  '.tmp/entry.ts',
  `export { generateCarMjcf } from '../src/model/generate';\n` +
    `export { defaultParams } from '../src/model/defaults';\n` +
    `export { mjcfFromGeometry, defaultDynamics } from '../src/model/fromGeometry';\n` +
    `export { defaultFrontLeft } from '../src/geometry/hardpoints';\n`,
);
writeFileSync(
  '.tmp/zustand.mjs',
  // Minimal zustand shim so the generator's indirect import of simStore
  // doesn't drag in the real zustand dependency during this check.
  'export function create(fn){ const set=()=>{}; const get=()=>({}); const api={subscribe:()=>()=>{},getState:()=>({}),setState:set}; const state=fn(set,get,api); return ()=>state; }\n',
);

execSync(
  `npx esbuild .tmp/entry.ts --bundle --format=esm --platform=node ` +
    `--external:zustand --outfile=.tmp/gen.mjs --log-level=warning`,
  { stdio: 'inherit' },
);

// Redirect the zustand import in the bundle to our shim.
const genPath = resolve('.tmp/gen.mjs');
writeFileSync(genPath, readFileSync(genPath, 'utf8').replace(/from\s+"zustand"/g, 'from "./zustand.mjs"'));

const {
  generateCarMjcf,
  defaultParams,
  mjcfFromGeometry,
  defaultDynamics,
  defaultFrontLeft,
} = await import(genPath);

const { default: loadMujoco } = await import('mujoco-js');
const mujoco = await loadMujoco();
mujoco.FS.mkdir('/working');
mujoco.FS.mount(mujoco.MEMFS, { root: '.' }, '/working');

function loadAndStep(label, xml, opts = {}) {
  const path = `/working/${label}.xml`;
  try {
    mujoco.FS.unlink(path);
  } catch {
    // ok
  }
  mujoco.FS.writeFile(path, xml);
  const model = mujoco.MjModel.loadFromXML(path);
  const data = new mujoco.MjData(model);
  mujoco.mj_forward(model, data);
  for (let i = 0; i < 500; i++) {
    for (let k = 0; k < model.nu; k++) {
      const name = mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_ACTUATOR.value, k);
      if (name && name.startsWith('drive_')) data.ctrl[k] = 0.5;
    }
    mujoco.mj_step(model, data);
  }
  const nbody = model.nbody;
  const nu = model.nu;
  data.delete();
  model.delete();
  if (opts.minBodies && nbody < opts.minBodies) {
    throw new Error(`${label}: expected >= ${opts.minBodies} bodies, got ${nbody}`);
  }
  if (opts.minActuators && nu < opts.minActuators) {
    throw new Error(`${label}: expected >= ${opts.minActuators} actuators, got ${nu}`);
  }
  console.log(`OK  ${label}  nbody=${nbody} nu=${nu} xml_len=${xml.length}`);
}

loadAndStep('legacy', generateCarMjcf(defaultParams, { suspension: 'rigid-slider', steering: true }), {
  minBodies: 11,
  minActuators: 4,
});

// Use the default left-side archetype for both axles.
loadAndStep(
  'fromGeometry',
  mjcfFromGeometry(defaultFrontLeft, defaultFrontLeft, defaultDynamics),
  { minBodies: 11, minActuators: 4 },
);

rmSync('.tmp', { recursive: true, force: true });
