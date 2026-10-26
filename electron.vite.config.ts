import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    build: { externalizeDeps: true },
  },
  preload: {
    build: { externalizeDeps: true },
  },
  renderer: {
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') },
    },
    plugins: [react()],
  },
});
