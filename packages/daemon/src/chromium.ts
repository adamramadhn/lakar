// Adaptor RenderPort: satu chromium-headless-shell + SATU halaman, dibuat malas, diserialkan mutex.
// Story 12 menggantinya dengan pool sewa eksklusif di balik RenderPort yang sama (AD-18).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { RenderPort } from '@lakar/ports';
import { LakarError, type ResolvedDocument } from '@lakar/schema';
import type { Browser, Page } from 'playwright-core';
import { Mutex } from './mutex.js';

/** Lokasi dist render yang disajikan apa adanya ke halaman Chromium. */
export const RENDER_MODULE_PATH = fileURLToPath(import.meta.resolve('@lakar/render'));

export const RENDER_PAGE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>lakar render</title>
<style>html,body{margin:0;padding:0;background:transparent}</style></head>
<body><div id="root"></div>
<script type="module">
import { mountBoard } from '/render/index.js';
// AD-5: ukur setelah font siap + dua frame animasi.
window.__lakarMount = async (doc, boardId) => {
  const el = mountBoard(doc, boardId, document.getElementById('root'));
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const rect = el.getBoundingClientRect();
  return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
};
window.__lakarReady = true;
</script></body></html>
`;

export function readRenderModule(): Promise<string> {
  return readFile(RENDER_MODULE_PATH, 'utf8');
}

export type ChromiumOptions = {
  browsersPath: string;
  /** URL halaman render (GET /render/page), diketahui setelah daemon listen. */
  pageUrl: () => string;
  timeoutMs: number;
};

export class ChromiumRenderer implements RenderPort<ResolvedDocument> {
  readonly #opts: ChromiumOptions;
  readonly #mutex = new Mutex();
  #browser: Browser | undefined;
  #page: Page | undefined;

  constructor(opts: ChromiumOptions) {
    this.#opts = opts;
  }

  async #ensurePage(): Promise<Page> {
    if (this.#page && !this.#page.isClosed() && this.#browser?.isConnected()) return this.#page;
    await this.close();
    // C9 (a): browser Lakar di cache khusus Lakar. Wajib di-set sebelum playwright-core dimuat.
    process.env.PLAYWRIGHT_BROWSERS_PATH = this.#opts.browsersPath;
    const { chromium } = await import('playwright-core');
    this.#browser = await chromium.launch({ headless: true, timeout: this.#opts.timeoutMs });
    const page = await this.#browser.newPage({ deviceScaleFactor: 1 });
    page.setDefaultTimeout(this.#opts.timeoutMs);
    await page.goto(this.#opts.pageUrl());
    await page.waitForFunction('window.__lakarReady === true');
    this.#page = page;
    return page;
  }

  screenshot(doc: ResolvedDocument, boardId: string): Promise<Uint8Array> {
    return this.#mutex.run(async () => {
      try {
        const page = await this.#ensurePage();
        // Fungsi ini berjalan di halaman Chromium (lihat RENDER_PAGE_HTML), bukan di Node.
        const size = await page.evaluate(
          ({ doc, boardId }) =>
            (globalThis as unknown as { __lakarMount(d: unknown, id: string): Promise<{ width: number; height: number }> }).__lakarMount(doc, boardId),
          { doc, boardId },
        );
        await page.setViewportSize({ width: Math.max(1, size.width), height: Math.max(1, size.height) });
        const buf = await page.locator(`[data-lakar-id="${boardId}"]`).screenshot({ type: 'png', scale: 'css', animations: 'disabled' });
        return new Uint8Array(buf);
      } catch (e) {
        // Halaman/browser mungkin rusak: buang, permintaan berikutnya membuat ulang.
        await this.close().catch(() => {});
        throw new LakarError('RENDER_FAILED', `render Chromium gagal: ${(e as Error).message.split('\n')[0]}`, {
          hint: 'coba lagi; bila terus gagal jalankan scripts/install-browser.sh',
          retryable: true,
        });
      }
    });
  }

  async close(): Promise<void> {
    const b = this.#browser;
    this.#browser = undefined;
    this.#page = undefined;
    if (b) await b.close().catch(() => {});
  }
}
