// Viewer dibangun terpisah dari `tsc -b` dan disajikan lakard di `/app/` (packages/daemon/src/viewer.ts).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** lakard lokal untuk `pnpm --filter @lakar/viewer dev` (AD-14: hanya loopback). */
const LAKARD = process.env.LAKARD_URL ?? 'http://127.0.0.1:7466';
const proxied = ['/status', '/sessions', '/docs', '/viewer', '/screenshot', '/inspect', '/layout-check', '/boards', '/fonts'];

export default defineConfig({
  base: '/app/',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  server: { host: '127.0.0.1', proxy: Object.fromEntries(proxied.map((p) => [p, LAKARD])) },
});
