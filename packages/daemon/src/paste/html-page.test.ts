// Halaman paste HTML terisolasi (epic paste-vektor story 4, follow-up story 5): snapshot yang macet melewati
// `timeoutMs` ditutup paksa. Browser palsu: `evaluate` tidak pernah selesai sampai context-nya ditutup (perilaku
// Playwright: operasi tertunda ditolak "Target closed"). Tanpa Chromium.
import { describe, expect, it } from 'vitest';
import type { Browser } from 'playwright-core';
import { snapshotHtml } from './html-page.js';

const noFonts = { families: () => [], entry: () => undefined, filePath: () => undefined } as never;

function hangingBrowser() {
  const calls = { close: 0, timeouts: [] as number[] };
  let rejectPending: ((e: Error) => void)[] = [];
  const hang = () =>
    new Promise<never>((_, reject) => {
      rejectPending.push(reject);
    });
  const context = {
    setDefaultTimeout: (ms: number) => calls.timeouts.push(ms),
    route: async () => {},
    newPage: async () => ({ goto: async () => null, evaluate: hang, screenshot: hang }),
    close: async () => {
      calls.close++;
      const pending = rejectPending;
      rejectPending = [];
      for (const r of pending) r(new Error('Target page, context or browser has been closed'));
    },
  };
  const browser = { newContext: async () => context } as unknown as Browser;
  return { browser, calls };
}

describe('snapshotHtml: batas waktu', () => {
  it('evaluate macet melewati timeoutMs → context ditutup paksa dan snapshot ditolak', async () => {
    const { browser, calls } = hangingBrowser();
    const t0 = Date.now();
    await expect(snapshotHtml(browser, '<p>x</p>', { width: 320, fonts: noFonts, timeoutMs: 50 })).rejects.toThrow(/closed/);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(calls.close).toBeGreaterThanOrEqual(1);
    expect(calls.timeouts).toEqual([50]);
  });
});
