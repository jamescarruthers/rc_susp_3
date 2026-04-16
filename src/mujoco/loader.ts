import type { Mujoco } from './types';

// Cached across reloads of the same page. Loading mujoco-js downloads ~11 MB
// of JS+WASM, so we share a single module instance. Dynamic import keeps the
// main app bundle slim.
let loadPromise: Promise<Mujoco> | null = null;

export function loadMujoco(): Promise<Mujoco> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const mod = await import('mujoco-js');
    const factory = mod.default as unknown as (opts?: object) => Promise<Mujoco>;
    const mujoco = await factory();
    const fs = (mujoco as unknown as { FS: MujocoFS }).FS;
    if (!hasDir(fs, '/working')) {
      fs.mkdir('/working');
      fs.mount((mujoco as unknown as { MEMFS: unknown }).MEMFS, { root: '.' }, '/working');
    }
    return mujoco;
  })();
  return loadPromise;
}

interface MujocoFS {
  mkdir(path: string): void;
  mount(type: unknown, opts: { root: string }, mountpoint: string): void;
  writeFile(path: string, data: string): void;
  unlink(path: string): void;
  analyzePath(path: string): { exists: boolean };
}

function hasDir(fs: MujocoFS, path: string): boolean {
  try {
    return fs.analyzePath(path).exists;
  } catch {
    return false;
  }
}

export function writeModelXml(mujoco: Mujoco, path: string, xml: string) {
  const fs = (mujoco as unknown as { FS: MujocoFS }).FS;
  try {
    fs.unlink(path);
  } catch {
    // ok if it didn't exist
  }
  fs.writeFile(path, xml);
}
