import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// COOP/COEP headers enable SharedArrayBuffer, which is required if mujoco_wasm
// is built with pthreads. Harmless for the single-threaded build.
//
// BASE_PATH is set by the GitHub Pages workflow to "/<repo>/" so asset URLs
// resolve under the project-page subpath. Locally it defaults to "/".
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  assetsInclude: ['**/*.wasm'],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['mujoco_wasm'],
  },
});
