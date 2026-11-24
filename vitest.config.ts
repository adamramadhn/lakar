import { defineConfig } from 'vitest/config';

// Dua proyek: `node` (semua tes lama, environment Node) dan `viewer-dom` (tes komponen viewer `*.dom.test.tsx` di
// jsdom, config di packages/viewer/vitest.config.ts). Opsi CLI (mis. `--testTimeout`) berlaku untuk keduanya.
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['packages/*/src/**/*.test.ts', 'services/*/src/**/*.test.ts', 'packages/render/test/**/*.test.ts', 'bench/src/**/*.test.ts', 'tests/**/*.test.ts'],
        },
      },
      'packages/viewer/vitest.config.ts',
    ],
  },
});
