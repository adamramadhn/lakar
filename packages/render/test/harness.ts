// Harness tes render di Chromium Lakar TANPA daemon (bukti AD-6): server statis node:http di
// 127.0.0.1:0 menyajikan halaman kosong (tanpa import map), dist render apa adanya, font Inter, dan
// aset gambar in-memory di `/assets/<sha256>` (sama dengan daemon).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'playwright-core';
import type { IconGlyph, ResolvedDocument } from '@lakar/schema';
import { CHROMIUM_ARGS, type FontFaceSource, type RenderResult } from '../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const RENDER_DIST = join(HERE, '..', 'dist');
export const GOLDEN_DIR = join(HERE, 'golden');
export const OUT_DIR = join(HERE, 'out');
const INTER_FILES = join(dirname(fileURLToPath(import.meta.resolve('@fontsource/inter/unicode.json'))), 'files');
const INTER_UNICODE = JSON.parse(await readFile(join(INTER_FILES, '..', 'unicode.json'), 'utf8')) as Record<string, string>;

/** Default sama dengan daemon `config.ts` (C9: cache browser khusus Lakar). */
export const browsersPath = process.env.LAKAR_BROWSERS_PATH || join(homedir(), '.cache', 'lakar', 'ms-playwright');
export const browserInstalled =
  existsSync(browsersPath) &&
  readdirSync(browsersPath).some((d) => d.startsWith('chromium_headless_shell-') && existsSync(join(browsersPath, d, 'INSTALLATION_COMPLETE')));

const PAGE_HTML = '<!doctype html><html><head><meta charset="utf-8"><title>render harness</title>' +
  '<style>html,body{margin:0;padding:0;background:transparent}</style></head><body><div id="root"></div></body></html>';

/** Face Inter (latin + latin-ext) untuk weight/style tertentu, URL harness. */
export function interFaces(weight = 400, style: 'normal' | 'italic' = 'normal', family = 'Inter'): FontFaceSource[] {
  return (['latin', 'latin-ext'] as const).map((subset) => ({
    family,
    weight,
    style,
    url: `/fonts/inter/inter-${subset}-${weight}-${style}.woff2`,
    unicodeRange: INTER_UNICODE[subset],
  }));
}

/** Aset in-memory: sha256 → bytes (disajikan di `/assets/<sha256>`). */
const assets = new Map<string, Buffer>();
/** Daftarkan bytes gambar; mengembalikan assetId (sha256 hex). */
export function addAsset(bytes: Buffer): string {
  const hash = createHash('sha256').update(bytes).digest('hex');
  assets.set(hash, bytes);
  return hash;
}
export const ASSET_BASE = '/assets/';

let server: Server | undefined;
let browser: Browser | undefined;
let page: Page | undefined;
export let baseUrl = '';

export async function start(): Promise<void> {
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const send = (status: number, type: string, body: string | Buffer) => {
      res.writeHead(status, { 'content-type': type });
      res.end(body);
    };
    try {
      if (url.pathname === '/' || url.pathname === '/blank') return send(200, 'text/html; charset=utf-8', PAGE_HTML);
      let m = /^\/render\/([a-z0-9-]+\.js)$/.exec(url.pathname);
      if (m) return send(200, 'text/javascript; charset=utf-8', await readFile(join(RENDER_DIST, m[1]!)));
      m = /^\/fonts\/inter\/(inter-[a-z0-9-]+\.woff2)$/.exec(url.pathname);
      if (m) return send(200, 'font/woff2', await readFile(join(INTER_FILES, m[1]!)));
      m = /^\/assets\/([a-f0-9]{64})$/.exec(url.pathname);
      if (m && assets.has(m[1]!)) return send(200, 'image/png', assets.get(m[1]!)!);
    } catch {
      /* jatuh ke 404 */
    }
    send(404, 'text/plain', 'not found');
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('alamat tidak diketahui');
  baseUrl = `http://127.0.0.1:${addr.port}`;
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
  const { chromium } = await import('playwright-core');
  browser = await chromium.launch({ headless: true, args: [...CHROMIUM_ARGS] });
  page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.goto(`${baseUrl}/`);
}

export async function stop(): Promise<void> {
  await browser?.close().catch(() => {});
  browser = undefined;
  page = undefined;
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = undefined;
}

export function currentPage(): Page {
  if (!page) throw new Error('harness belum start()');
  return page;
}

/** Halaman baru yang bersih (font belum terdaftar). Pemanggil wajib menutupnya. */
export async function freshPage(): Promise<Page> {
  const p = await browser!.newPage({ deviceScaleFactor: 1 });
  await p.goto(`${baseUrl}/`);
  return p;
}

// Kode yang dievaluasi di halaman ditulis sebagai string: transform vitest tidak boleh menyentuh `import()`.
const RENDER_IN_PAGE = `async ([doc, boardId, fonts, assetBase, icons]) => {
  const m = await import('/render/index.js');
  return m.renderBoard(doc, boardId, document.getElementById('root'), { fonts, assetBase, icons });
}`;

/**
 * Glyph ikon asli (lucide-static 1.74.0 + simple-icons 16.38.0) dari fixture yang dibuat sekali oleh
 * `test/fixtures/gen-icon-glyphs.mjs` (sumber: katalog @lakar/icons). Render sendiri tidak bergantung pada icons.
 */
export const ICON_GLYPHS: readonly IconGlyph[] = (
  JSON.parse(await readFile(join(HERE, 'fixtures', 'icon-glyphs.json'), 'utf8')) as { glyphs: IconGlyph[] }
).glyphs;

/** Render board di halaman harness: viewport = ukuran board sebelum mount, lalu screenshot elemen board. */
export async function render(
  doc: ResolvedDocument,
  boardId: string,
  fonts: readonly FontFaceSource[],
  p: Page = currentPage(),
  opts: { assetBase?: string; icons?: readonly IconGlyph[] } = {},
): Promise<{ result: RenderResult; png: Buffer | undefined }> {
  const board = doc.pages.flatMap((pg) => pg.children).find((b) => b.id === boardId);
  if (board) await p.setViewportSize({ width: Math.max(1, Math.ceil(board.width)), height: Math.max(1, Math.ceil(board.height)) });
  const args = [doc, boardId, fonts, opts.assetBase ?? ASSET_BASE, opts.icons ?? ICON_GLYPHS];
  const result = (await p.evaluate(`(${RENDER_IN_PAGE})(${JSON.stringify(args)})`)) as RenderResult;
  if (!result.ok) return { result, png: undefined };
  const png = await p.locator(`[data-lakar-id="${boardId}"]`).screenshot({ type: 'png', scale: 'css', animations: 'disabled', caret: 'hide' });
  return { result, png };
}

const TEST_IMAGE_IN_PAGE = `async () => {
  const c = new OffscreenCanvas(64, 48);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#E53935'; ctx.fillRect(0, 0, 32, 24);
  ctx.fillStyle = '#43A047'; ctx.fillRect(32, 0, 32, 24);
  ctx.fillStyle = '#1E88E5'; ctx.fillRect(0, 24, 32, 24);
  ctx.fillStyle = '#FDD835'; ctx.fillRect(32, 24, 32, 24);
  ctx.strokeStyle = '#000000'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(64, 48); ctx.stroke();
  const buf = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}`;

/**
 * Gambar uji deterministik dibuat di halaman (tanpa fixture biner): 64×48, kuadran merah/hijau/biru/kuning
 * + diagonal hitam dari kiri atas. Didaftarkan sebagai aset; mengembalikan assetId.
 */
export async function testImageAsset(): Promise<string> {
  const b64 = (await currentPage().evaluate(`(${TEST_IMAGE_IN_PAGE})()`)) as string;
  return addAsset(Buffer.from(b64, 'base64'));
}

/** Piksel RGBA dari PNG pada titik (x,y), di-decode di halaman. */
export async function pixels(png: Buffer, points: readonly (readonly [number, number])[]): Promise<[number, number, number, number][]> {
  return (await currentPage().evaluate(
    `(${PIXELS_IN_PAGE})(${JSON.stringify([png.toString('base64'), points])})`,
  )) as [number, number, number, number][];
}

const PIXELS_IN_PAGE = `async ([b64, points]) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d', { colorSpace: 'srgb' });
  ctx.drawImage(bmp, 0, 0);
  const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  return points.map(([x, y]) => { const i = (y * bmp.width + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; });
}`;

const COMPARE_IN_PAGE = `async ([a, b, tol, maxRatio]) => {
  const decode = async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d', { colorSpace: 'srgb' });
    ctx.drawImage(bmp, 0, 0);
    return { w: bmp.width, h: bmp.height, data: ctx.getImageData(0, 0, bmp.width, bmp.height).data };
  };
  const A = await decode(a), B = await decode(b);
  if (A.w !== B.w || A.h !== B.h) return { ok: false, reason: 'dimensi ' + A.w + 'x' + A.h + ' vs golden ' + B.w + 'x' + B.h };
  const out = new OffscreenCanvas(A.w, A.h);
  const octx = out.getContext('2d');
  const diff = octx.createImageData(A.w, A.h);
  let bad = 0;
  for (let i = 0; i < A.data.length; i += 4) {
    let m = 0;
    for (let k = 0; k < 4; k++) m = Math.max(m, Math.abs(A.data[i + k] - B.data[i + k]));
    if (m > tol) { bad++; diff.data[i] = 255; diff.data[i + 3] = 255; }
    else { diff.data[i] = diff.data[i + 1] = diff.data[i + 2] = 255 - Math.round((255 - A.data[i]) / 4); diff.data[i + 3] = 255; }
  }
  const ratio = bad / (A.w * A.h);
  if (ratio <= maxRatio) return { ok: true, ratio };
  octx.putImageData(diff, 0, 0);
  const blob = await out.convertToBlob({ type: 'image/png' });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { ok: false, ratio, reason: (ratio * 100).toFixed(3) + '% piksel berbeda > ' + tol, diff: btoa(s) };
}`;

/** Selisih kanal maksimum per piksel yang masih ditoleransi, dan rasio piksel buruk maksimum. */
export const GOLDEN_TOLERANCE = 24;
export const GOLDEN_MAX_RATIO = 0.005;

/** Rasio piksel yang selisih kanal maksimumnya > `tol` antara dua PNG berdimensi sama. */
export async function pixelDiffRatio(a: Buffer, b: Buffer, tol = GOLDEN_TOLERANCE): Promise<number> {
  const r = (await currentPage().evaluate(`(${COMPARE_IN_PAGE})(${JSON.stringify([a.toString('base64'), b.toString('base64'), tol, 1])})`)) as {
    ok: boolean;
    ratio?: number;
    reason?: string;
  };
  if (r.ratio === undefined) throw new Error(`pixelDiffRatio: ${r.reason}`);
  return r.ratio;
}

/**
 * Tulis `test/out/<name>.png`, bandingkan dengan `test/golden/<name>.png` di halaman.
 * Golden tidak ada → gagal (kecuali LAKAR_UPDATE_GOLDEN=1, yang menulis golden).
 */
export async function compareGolden(name: string, png: Buffer): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, `${name}.png`), png);
  // Diff lama dari run gagal sebelumnya tidak boleh tertinggal saat golden kini lulus.
  await rm(join(OUT_DIR, `${name}.diff.png`), { force: true });
  const goldenPath = join(GOLDEN_DIR, `${name}.png`);
  if (process.env.LAKAR_UPDATE_GOLDEN === '1') {
    await mkdir(GOLDEN_DIR, { recursive: true });
    await writeFile(goldenPath, png);
    return;
  }
  if (!existsSync(goldenPath)) throw new Error(`golden ${goldenPath} tidak ada (buat dengan LAKAR_UPDATE_GOLDEN=1, periksa visual, commit)`);
  const golden = await readFile(goldenPath);
  const r = (await currentPage().evaluate(
    `(${COMPARE_IN_PAGE})(${JSON.stringify([png.toString('base64'), golden.toString('base64'), GOLDEN_TOLERANCE, GOLDEN_MAX_RATIO])})`,
  )) as { ok: boolean; ratio?: number; reason?: string; diff?: string };
  if (!r.ok) {
    if (r.diff) await writeFile(join(OUT_DIR, `${name}.diff.png`), Buffer.from(r.diff, 'base64'));
    throw new Error(`golden ${name}: ${r.reason}`);
  }
}

// ---------------------------------------------------------------------------
// Pembangun dokumen uji
// ---------------------------------------------------------------------------

type Loose = Record<string, unknown>;
let seq = 0;
/** ID 8 karakter [A-Za-z0-9] yang unik per proses. */
export const nid = () => `Node${String(++seq).padStart(4, '0')}`;

/** Frame/text dengan id otomatis. `children` boleh berisi node lain. */
export const frame = (props: Loose, children: Loose[] = []): Loose => ({ type: 'frame', name: 'Frame', id: nid(), ...props, children });
export const text = (content: string, props: Loose = {}): Loose => ({ type: 'text', name: 'Teks', id: nid(), content, size: 16, lineHeight: 20, ...props });
export const rect = (props: Loose = {}): Loose => ({ type: 'rect', name: 'Rect', id: nid(), ...props });
export const ellipse = (props: Loose = {}): Loose => ({ type: 'ellipse', name: 'Ellipse', id: nid(), ...props });
export const path = (d: string, viewBox: [number, number, number, number], props: Loose = {}): Loose => ({ type: 'path', name: 'Path', id: nid(), d, viewBox, ...props });
export const icon = (lib: string, name: string, props: Loose = {}): Loose => ({ type: 'icon', name: `Icon / ${lib} / ${name}`, id: nid(), lib, icon: name, size: 24, ...props });

/** Dokumen satu board (latar putih). */
export function boardDoc(
  children: Loose[],
  size: { width: number; height: number } = { width: 440, height: 160 },
  fills: Loose[] = [{ type: 'solid', color: '#FFFFFF' }],
): { doc: ResolvedDocument; boardId: string } {
  const boardId = nid();
  const doc = {
    schemaVersion: 1,
    id: 'Docu0001',
    rev: 0,
    pages: [
      {
        id: 'Page0001',
        name: 'Page 1',
        children: [{ type: 'board', name: 'Uji', id: boardId, x: 0, y: 0, ...size, screen: 'app', fills, children }],
      },
    ],
  };
  return { doc: doc as unknown as ResolvedDocument, boardId };
}
