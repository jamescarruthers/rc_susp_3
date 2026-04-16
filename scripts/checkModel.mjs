// Headless validator for the MJCF generator. Bundles the TS generator with
// esbuild and loads its output into mujoco-js under Node. Exits non-zero if
// MuJoCo can't compile the model.
//
// Usage:  node scripts/checkModel.mjs
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

mkdirSync('.tmp', { recursive: true });
writeFileSync(
  '.tmp/entry.ts',
  `export { generateCarMjcf } from '../src/model/generate';\n` +
    `export { defaultParams } from '../src/model/defaults';\n`,
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

const { generateCarMjcf, defaultParams } = await import(genPath);
const xml = generateCarMjcf(defaultParams, { suspension: 'rigid-slider', steering: true });

const { default: loadMujoco } = await import('mujoco-js');
const mujoco = await loadMujoco();
mujoco.FS.mkdir('/working');
mujoco.FS.mount(mujoco.MEMFS, { root: '.' }, '/working');
mujoco.FS.writeFile('/working/check.xml', xml);

const model = mujoco.MjModel.loadFromXML('/working/check.xml');
const data = new mujoco.MjData(model);
mujoco.mj_forward(model, data);
for (let i = 0; i < 500; i++) {
  for (let k = 0; k < model.nu; k++) {
    const name = mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_ACTUATOR.value, k);
    if (name && name.startsWith('drive_')) data.ctrl[k] = 0.5;
  }
  mujoco.mj_step(model, data);
}

// Sanity asserts.
const expect = (cond, msg) => {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
};
const nbody = model.nbody;
const nu = model.nu;
expect(nbody >= 11, `expected >=11 bodies, got ${nbody}`);
expect(nu >= 4, `expected >=4 actuators, got ${nu}`);

data.delete();
model.delete();
rmSync('.tmp', { recursive: true, force: true });
console.log(`OK  nbody=${nbody} nu=${nu} xml_len=${xml.length}`);
