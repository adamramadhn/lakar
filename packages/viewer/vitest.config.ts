// Tes komponen/DOM viewer (spec-viewer-dom-harness): hanya `src/**/*.dom.test.tsx`, di jsdom, dengan stub global dari
// src/test/setup.ts. Tes logika murni viewer (`*.test.ts`) tetap di proyek `node` root.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'viewer-dom',
    include: ['src/**/*.dom.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
