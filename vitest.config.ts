import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'bench/src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
