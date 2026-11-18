// Adaptor RenderPort: satu chromium-headless-shell + SATU halaman, dibuat malas, diserialkan mutex.
// Story 12 menggantinya dengan pool sewa eksklusif di balik RenderPort yang sama (AD-18).
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RenderPort } from '@lakar/ports';
import { CHROMIUM_ARGS, findBoard, fontRequests, type FontFaceSource, type RenderResult } from '@lakar/render';
import { LakarError, type ResolvedDocument } from '@lakar/schema';
import type { Browser, Page } from 'playwright-core';
import type { FontRegistry } from './fonts.js';
import { Mutex } from './mutex.js';

/** Lokasi dist render (entry) yang disajikan apa adanya ke halaman Chromium. */
export const RENDER_MODULE_PATH = fileURLToPath(import.meta.resolve('@lakar/render'));
/** Direktori dist render: semua modul `./x.js` disajikan dari sini. */
export const RENDER_DIST_DIR = dirname(RENDER_MODULE_PATH);
const RENDER_FILE = /^[a-z0-9-]+\.js$/;

export const RENDER_PAGE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>lakar render</title>
<style>html,body{margin:0;padding:0;background:transparent}</style></head>
<body><div id="root"></div>
<script type="module">
import { renderBoard } from '/render/index.js';
// AD-5/AD-6: render memuat face yang diberikan, ukur setelah fonts.ready + dua rAF.
// Aset gambar disajikan daemon di /assets/<sha256> (store aset <dataDir>/assets).
window.__lakarRender = (doc, boardId, fonts) => renderBoard(doc, boardId, document.getElementById('root'), { fonts, assetBase: '/assets/' });
window.__lakarReady = true;
</script></body></html>
`;

/** Isi modul dist render `file` (hanya `^[a-z0-9-]+\.js$`), atau undefined. */
export async function readRenderModule(file: string): Promise<string | undefined> {
  if (!RENDER_FILE.test(file)) return undefined;
  return readFile(join(RENDER_DIST_DIR, file), 'utf8').catch(() => undefined);
}

export const ASSET_HINT = 'assetId adalah sha256 file gambar di store aset daemon; impor gambar dulu (aset harus ada di store)';

export type ChromiumOptions = {
  browsersPath: string;
  /** URL halaman render (GET /render/page), diketahui setelah daemon listen. */
  pageUrl: () => string;
  timeoutMs: number;
  /** Registry font lokal: face board di-resolve sebelum render (AD-10). */
  fonts: FontRegistry;
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
    this.#browser = await chromium.launch({ headless: true, timeout: this.#opts.timeoutMs, args: [...CHROMIUM_ARGS] });
    const page = await this.#browser.newPage({ deviceScaleFactor: 1 });
    page.setDefaultTimeout(this.#opts.timeoutMs);
    await page.goto(this.#opts.pageUrl());
    await page.waitForFunction('window.__lakarReady === true');
    this.#page = page;
    return page;
  }

  screenshot(doc: ResolvedDocument, boardId: string): Promise<Uint8Array> {
    return this.#mutex.run(async () => {
      // FONT_MISSING di luar pembungkus RENDER_FAILED: kesalahan dokumen, bukan kerusakan halaman.
      const board = findBoard(doc, boardId);
      const fonts: FontFaceSource[] = board ? this.#opts.fonts.resolveFaces(fontRequests(board)) : [];
      let result: RenderResult;
      let page: Page;
      try {
        page = await this.#ensurePage();
        // Viewport = ukuran board SEBELUM mount (stabilitas layout dan golden).
        if (board) await page.setViewportSize({ width: Math.max(1, Math.ceil(board.width)), height: Math.max(1, Math.ceil(board.height)) });
        // Fungsi ini berjalan di halaman Chromium (lihat RENDER_PAGE_HTML), bukan di Node.
        result = await page.evaluate(
          ({ doc, boardId, fonts }) =>
            (globalThis as unknown as { __lakarRender(d: unknown, id: string, f: unknown): Promise<RenderResult> }).__lakarRender(doc, boardId, fonts),
          { doc, boardId, fonts },
        );
      } catch (e) {
        throw await this.#failed(e);
      }
      // Halaman tetap dipakai: hanya dokumen yang salah.
      if (!result.ok && result.code === 'NOT_FOUND') {
        throw new LakarError('NOT_FOUND', result.message, { hint: ASSET_HINT, retryable: false });
      }
      if (!result.ok) {
        throw new LakarError('FONT_MISSING', result.message, {
          hint:
            `keluarga terdaftar: ${this.#opts.fonts.families().join(', ')}. ` +
            'Font hanya mencakup subset latin + latin-ext; untuk simbol/panah/emoji pakai node icon (AD-9).',
          retryable: false,
        });
      }
      try {
        const buf = await page.locator(`[data-lakar-id="${boardId}"]`).screenshot({ type: 'png', scale: 'css', animations: 'disabled', caret: 'hide' });
        return new Uint8Array(buf);
      } catch (e) {
        throw await this.#failed(e);
      }
    });
  }

  /** Halaman/browser mungkin rusak: buang, permintaan berikutnya membuat ulang. */
  async #failed(e: unknown): Promise<LakarError> {
    await this.close().catch(() => {});
    return new LakarError('RENDER_FAILED', `render Chromium gagal: ${(e as Error).message.split('\n')[0]}`, {
      hint: 'coba lagi; bila terus gagal jalankan scripts/install-browser.sh',
      retryable: true,
    });
  }

  async close(): Promise<void> {
    const b = this.#browser;
    this.#browser = undefined;
    this.#page = undefined;
    if (b) await b.close().catch(() => {});
  }
}
