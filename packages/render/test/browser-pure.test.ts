// Bukti AD-6: dist render berjalan di halaman browser biasa tanpa Node, tanpa daemon, tanpa bundler.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { browserInstalled, currentPage, RENDER_DIST, start, stop } from './harness.js';

describe('dist render murni browser', () => {
  it('dist/*.js tanpa specifier impor non-relatif', () => {
    const files = readdirSync(RENDER_DIST).filter((f) => f.endsWith('.js'));
    expect(files).toContain('index.js');
    for (const f of files) {
      const js = readFileSync(join(RENDER_DIST, f), 'utf8');
      expect(js, f).not.toMatch(/(?:from|import)\s*\(?\s*['"][^./'"][^'"]*['"]/);
      expect(js, f).not.toMatch(/\bprocess\./);
    }
  });

  describe.skipIf(!browserInstalled)('di Chromium', () => {
    beforeAll(start, 60_000);
    afterAll(stop);

    it('halaman tanpa process/require; import("/render/index.js") berhasil', async () => {
      const r = (await currentPage().evaluate(`(async () => {
        const env = typeof process === 'undefined' && typeof require === 'undefined';
        const m = await import('/render/index.js');
        return { env, renderBoard: typeof m.renderBoard, pkg: m.PACKAGE };
      })()`)) as { env: boolean; renderBoard: string; pkg: string };
      expect(r).toEqual({ env: true, renderBoard: 'function', pkg: '@lakar/render' });
    });
  });
});
