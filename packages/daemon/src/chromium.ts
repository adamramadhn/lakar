// Adaptor RenderPort: satu chromium-headless-shell + pool halaman hangat sewa eksklusif (AD-18, `pool.ts`).
// Setiap screenshot/measure menyewa satu halaman sampai selesai; tidak ada mutex global.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BoardMeasure, IconCatalogPort, MeasureOptions, RenderPort, RenderStatus, ScreenshotOptions } from '@lakar/ports';
import { CHROMIUM_ARGS, NODE_ATTR, fontRequests, iconRefs, type FontFaceSource, type RenderResult } from '@lakar/render';
import { LakarError, findBoard, type IconGlyph, type ResolvedDocument } from '@lakar/schema';
import { notFound } from './errors.js';
import type { Browser, Page } from 'playwright-core';
import type { FontRegistry } from './fonts.js';
import { RenderPool, type Lease } from './pool.js';

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
// Glyph ikon (AD-9) di-resolve daemon dari katalog @lakar/icons dan dikirim sebagai data JSON.
// allowGlyphs (AD-8): code point temuan LC-01a/b yang boleh di luar cakupan font, hanya untuk ukur check.
window.__lakarRender = (doc, boardId, fonts, icons, allowGlyphs) =>
  renderBoard(doc, boardId, document.getElementById('root'), { fonts, icons, allowGlyphs, assetBase: '/assets/' });
window.__lakarReady = true;
</script></body></html>
`;

/** Isi modul dist render `file` (hanya `^[a-z0-9-]+\.js$`), atau undefined. */
export async function readRenderModule(file: string): Promise<string | undefined> {
  if (!RENDER_FILE.test(file)) return undefined;
  return readFile(join(RENDER_DIST_DIR, file), 'utf8').catch(() => undefined);
}

const ASSET_HINT = 'assetId adalah sha256 file gambar di store aset daemon; impor gambar dulu (aset harus ada di store)';

export type ChromiumOptions = {
  browsersPath: string;
  /** URL halaman render (GET /render/page), diketahui setelah daemon listen. */
  pageUrl: () => string;
  /** Batas waktu host per sewa (render + screenshot); antrean dibatasi 2× nilai ini. */
  timeoutMs: number;
  /** Jumlah halaman pool (default 2). */
  pages?: number;
  /** Registry font lokal: face board di-resolve sebelum render (AD-10). */
  fonts: FontRegistry;
  /** Katalog ikon: glyph node icon board di-resolve sebelum render (AD-9). */
  icons: IconCatalogPort<string, IconGlyph>;
  /** Hook tes: dipanggil di awal setiap sewa (di dalam batas waktu) dengan halaman yang disewa. */
  onLease?: (page: Page) => Promise<void> | void;
};

export class ChromiumRenderer implements RenderPort<ResolvedDocument> {
  readonly #opts: ChromiumOptions;
  readonly #pool: RenderPool;

  constructor(opts: ChromiumOptions) {
    this.#opts = opts;
    this.#pool = new RenderPool({
      size: opts.pages ?? 2,
      timeoutMs: opts.timeoutMs,
      launch: async () => {
        // C9 (a): browser Lakar di cache khusus Lakar. Wajib di-set sebelum playwright-core dimuat.
        process.env.PLAYWRIGHT_BROWSERS_PATH = this.#opts.browsersPath;
        const { chromium } = await import('playwright-core');
        return chromium.launch({ headless: true, timeout: this.#opts.timeoutMs, args: [...CHROMIUM_ARGS] });
      },
      openPage: async (browser: Browser, dpr) => {
        const page = await browser.newPage({ deviceScaleFactor: dpr });
        try {
          page.setDefaultTimeout(this.#opts.timeoutMs);
          await page.goto(this.#opts.pageUrl());
          await page.waitForFunction('window.__lakarReady === true');
          return page;
        } catch (e) {
          await page.context().close().catch(() => {});
          throw e;
        }
      },
    });
  }

  /** Siapkan semua halaman hangat (tidak melempar; gagal → `status().lastError`). */
  warm(): Promise<void> {
    return this.#pool.warm();
  }

  status(): RenderStatus {
    return this.#pool.status();
  }

  /**
   * Render board di halaman sewaan. Error dokumen → LakarError non-retryable (FONT_MISSING / NOT_FOUND /
   * ICON_UNKNOWN; halaman tetap dipakai); kegagalan Playwright dilempar mentah → pool membuang halaman itu.
   */
  async #renderOnPage(page: Page, doc: ResolvedDocument, boardId: string, allowGlyphs: readonly number[]): Promise<BoardMeasure> {
    const board = findBoard(doc, boardId);
    const fonts: FontFaceSource[] = board ? this.#opts.fonts.resolveFaces(fontRequests(board)) : [];
    const icons: IconGlyph[] = board ? iconRefs(board).flatMap((r) => this.#opts.icons.glyph(r.lib, r.icon) ?? []) : [];
    // Viewport = ukuran board SEBELUM mount (stabilitas layout dan golden).
    if (board) await page.setViewportSize({ width: Math.max(1, Math.ceil(board.width)), height: Math.max(1, Math.ceil(board.height)) });
    // Fungsi ini berjalan di halaman Chromium (lihat RENDER_PAGE_HTML), bukan di Node.
    const result: RenderResult = await page.evaluate(
      ({ doc, boardId, fonts, icons, allowGlyphs }) =>
        (
          globalThis as unknown as { __lakarRender(d: unknown, id: string, f: unknown, i: unknown, a: unknown): Promise<RenderResult> }
        ).__lakarRender(doc, boardId, fonts, icons, allowGlyphs),
      { doc, boardId, fonts, icons, allowGlyphs: [...allowGlyphs] },
    );
    if (!result.ok && result.code === 'NOT_FOUND') {
      throw notFound(result.message, ASSET_HINT);
    }
    if (!result.ok && result.code === 'ICON_UNKNOWN') {
      throw new LakarError('ICON_UNKNOWN', result.message, {
        hint: 'perbaiki node icon lewat execute (update(id, {icon})) dengan nama kanonik; cari dengan iconSearch / icon_search',
        retryable: false,
      });
    }
    if (!result.ok) {
      throw new LakarError('FONT_MISSING', result.message, {
        hint:
          `keluarga terdaftar: ${this.#opts.fonts.families().join(', ')}. ` +
          'Font hanya mencakup subset latin + latin-ext; untuk simbol/panah/emoji pakai node icon (AD-9).',
        retryable: false,
      });
    }
    return result.measure;
  }

  async #hook(lease: Lease): Promise<void> {
    if (this.#opts.onLease) await this.#opts.onLease(lease.page);
  }

  screenshot(doc: ResolvedDocument, boardId: string, opts: ScreenshotOptions = {}): Promise<Uint8Array> {
    const scale = opts.scale ?? 1;
    const target = opts.nodeId ?? boardId;
    return this.#pool.lease(async (lease) => {
      await this.#hook(lease);
      const page = scale === 2 ? await lease.page2() : lease.page;
      // Screenshot tidak pernah memakai allowGlyphs: glyph di luar font tetap FONT_MISSING (AD-6).
      await this.#renderOnPage(page, doc, boardId, []);
      const el = page.locator(`[${NODE_ATTR}="${target}"]`);
      // Elemen tidak ada / tanpa luas: kesalahan permintaan, bukan kerusakan halaman (locator akan menunggu sampai timeout).
      const box = (await el.count()) === 1 ? await el.boundingBox() : null;
      if (!box) throw notFound(`node ${target} tidak ada di board ${boardId}`, 'pakai ID dari created[] execute atau inspect');
      if (box.width < 0.5 || box.height < 0.5) {
        throw new LakarError('SCHEMA_INVALID', `node ${target} berukuran ${box.width}×${box.height}, tidak bisa dipotret`, { hint: 'potret parent-nya atau board' });
      }
      const buf = await el.screenshot({ type: 'png', scale: scale === 2 ? 'device' : 'css', animations: 'disabled', caret: 'hide' });
      return new Uint8Array(buf);
    });
  }

  measure(doc: ResolvedDocument, boardId: string, opts: MeasureOptions = {}): Promise<BoardMeasure> {
    return this.#pool.lease(async (lease) => {
      await this.#hook(lease);
      return this.#renderOnPage(lease.page, doc, boardId, opts.allowGlyphs ?? []);
    });
  }

  async close(): Promise<void> {
    await this.#pool.close();
  }
}
