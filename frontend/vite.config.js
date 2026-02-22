import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Post-build plugin: stamps sw.js with a unique build hash so
// browsers detect the new service worker and refresh caches.
function swVersionPlugin() {
  return {
    name: 'sw-version-stamp',
    closeBundle() {
      const swPath = resolve(__dirname, '../backend/static/sw.js');
      try {
        let sw = readFileSync(swPath, 'utf-8');
        const hash = crypto.randomBytes(4).toString('hex');
        sw = sw.replace(/__BUILD_HASH__/g, hash);
        writeFileSync(swPath, sw);
      } catch { /* sw.js not found — skip */ }
    },
  };
}

export default defineConfig({
  plugins: [react(), swVersionPlugin()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
  build: {
    outDir: '../backend/static',
    emptyOutDir: true,
  },
});
