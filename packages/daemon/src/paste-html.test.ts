// Integrasi paste HTML (epic paste-vektor story 4, AD-15): daemon nyata + Chromium. Tiga sampel (kartu, navbar, grid
// harga) menjadi layer dengan struktur, auto layout, tag, dan gaya terjaga; render board berbeda < 2% piksel dari
// HTML sumber di halaman terisolasi yang sama. Skrip dan permintaan jaringan dalam HTML tidak pernah berjalan, dan
// dokumen/riwayat tidak menyimpan HTML/CSS mentah.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from 'playwright-core';
import { CHROMIUM_ARGS } from '@lakar/render';
import { loadConfig, startDaemon, type RunningDaemon } from './index.js';
import { snapshotHtml } from './paste/html-page.js';
import { decodePng, type DecodedPng } from './png.js';
import { chromiumInstalled } from '../../../tests/support/browser.ts';
import { postJson } from '../../../tests/support/http.ts';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };
const browsersPath = process.env.LAKAR_BROWSERS_PATH || baseConfig.browsersPath;
const browserInstalled = chromiumInstalled(browsersPath);
const sample = (name: string) => readFileSync(new URL(`../../../tests/fixtures/html/${name}.html`, import.meta.url), 'utf8');

/** Toleransi per kanal dan rasio piksel berbeda maksimum (render board vs HTML sumber). */
const PIXEL_TOLERANCE = 24;
const PIXEL_MAX_RATIO = 0.02;
const BOARD_WIDTH = 1200;

/** Rasio piksel yang berbeda > `tol` di salah satu kanal RGB (area tumpang tindih; selisih ukuran ≤ 1px). */
function diffRatio(a: DecodedPng, b: DecodedPng, tol = PIXEL_TOLERANCE): number {
  if (Math.abs(a.width - b.width) > 1 || Math.abs(a.height - b.height) > 1) return Number.POSITIVE_INFINITY;
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  let bad = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ia = (y * a.width + x) * a.channels;
      const ib = (y * b.width + x) * b.channels;
      for (let c = 0; c < 3; c++)
        if (Math.abs(a.pixels[ia + c]! - b.pixels[ib + c]!) > tol) {
          bad++;
          break;
        }
    }
  return bad / (w * h);
}

type Node = { id: string; type: string; name: string; tag?: string; layout?: string; children?: Node[] } & Record<string, unknown>;
const find = (n: Node, pred: (x: Node) => boolean): Node[] => [...(pred(n) ? [n] : []), ...(n.children ?? []).flatMap((c) => find(c, pred))];

describe.skipIf(!browserInstalled)('paste HTML: Chromium terisolasi → layer', () => {
  let d: RunningDaemon;
  let tmp: string;
  let s: string;
  let browser: Browser;
  let hits: string[];
  let server: Server;
  let port: number;
  let boards = 0;
  const call = (path: string, body: unknown) => postJson(d.url, path, body, s);

  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'lakar-paste-html-'));
    d = await startDaemon({ ...baseConfig, port: 0, dataDir: join(tmp, 'data'), browsersPath });
    await d.warmed;
    s = (await call('/sessions', {})).body.data.sessionId as string;
    await call('/docs/open', { slug: 'html-uji' });
    hits = [];
    server = createServer((req, res) => {
      hits.push(req.url ?? '');
      res.end('x');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.address() as { port: number }).port;
    process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ headless: true, args: [...CHROMIUM_ARGS] });
  }, 90_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise((r) => server?.close(r));
    await d?.close();
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  const boardIds = new Map<string, string>();
  const boardOf = (nodeId: string) => boardIds.get(nodeId)!;

  async function pasteSample(html: string, name: string) {
    const b = await call('/execute', { code: `add(null, {type:'board', name:${JSON.stringify(name)}, x:${1300 * boards++}, y:0, width:${BOARD_WIDTH}, height:900, screen:'landing'})`, description: `tambah board uji paste ${name}` });
    expect(b.status, JSON.stringify(b.body.error)).toBe(200);
    const boardId = b.body.data.created[0].id as string;
    const r = await call('/viewer/paste', { kind: 'html', content: html, parentId: boardId });
    expect(r.status, JSON.stringify(r.body.error)).toBe(200);
    const doc = JSON.parse(await readFile(join(tmp, 'data', 'docs', 'html-uji.lakar.json'), 'utf8')) as { pages: { children: Node[] }[] };
    const board = doc.pages[0]!.children.find((x) => x.id === boardId)!;
    const root = board.children!.find((x) => x.id === r.body.data.nodeId)!;
    boardIds.set(root.id, boardId);
    return { boardId, root, data: r.body.data };
  }

  async function pixelRatio(html: string, nodeId: string): Promise<number> {
    const shot = await call('/screenshot', { nodeId });
    expect(shot.status, JSON.stringify(shot.body.error)).toBe(200);
    const src = await snapshotHtml(browser, html, { width: BOARD_WIDTH, fonts: d.fonts, screenshot: true });
    const a = decodePng(Buffer.from(shot.body.data.png, 'base64'));
    const b = decodePng(src.png!);
    // Pembanding tidak boleh lolos karena dua gambar kosong: sumber punya cukup piksel non-putih.
    let ink = 0;
    for (let i = 0; i < b.pixels.length; i += b.channels) if (b.pixels[i]! < 240 || b.pixels[i + 1]! < 240 || b.pixels[i + 2]! < 240) ink++;
    expect(ink / (b.width * b.height)).toBeGreaterThan(0.05);
    const ratio = diffRatio(a, b);
    if (process.env.LAKAR_PASTE_DEBUG) console.log(`piksel ${nodeId}: ${a.width}×${a.height} vs ${b.width}×${b.height}, selisih ${(ratio * 100).toFixed(3)}%`);
    return ratio;
  }

  it('kartu: kolom flex, tag semantik, gambar data URI, tombol; piksel < 2%', async () => {
    const html = sample('kartu');
    const { root, data } = await pasteSample(html, 'Kartu');
    expect(root).toMatchObject({ type: 'frame', tag: 'article', name: 'Card', layout: 'column', clip: true, radius: 16, stroke: { color: '#E2E8F0', width: 1, align: 'inside' } });
    expect(find(root, (n) => n.tag === 'button')).toHaveLength(2);
    expect(find(root, (n) => n.type === 'text' && n.tag === 'p')).toHaveLength(1);
    expect(find(root, (n) => n.type === 'text' && n.tag === 'h3' && n.content === 'Make bold work, faster')).toHaveLength(1);
    expect(find(root, (n) => n.type === 'rect' && Array.isArray(n.fills) && (n.fills as { type: string }[]).some((f) => f.type === 'image'))).toHaveLength(1);
    expect(data.report).toMatchObject({ kind: 'html', images: 1, dropped: [] });
    expect(await pixelRatio(html, root.id)).toBeLessThan(PIXEL_MAX_RATIO);
    // Pintu viewer (/viewer/docs/:slug/paste) memakai importer yang sama: layer identik (kecuali id/posisi).
    const v = await postJson(d.url, '/viewer/docs/html-uji/paste', { kind: 'html', content: html, parentId: boardOf(root.id) });
    expect(v.status, JSON.stringify(v.body.error)).toBe(200);
    expect(v.body.data.report).toEqual(data.report);
    const doc = JSON.parse(await readFile(join(tmp, 'data', 'docs', 'html-uji.lakar.json'), 'utf8')) as { pages: { children: Node[] }[] };
    const all = doc.pages[0]!.children.flatMap((b) => b.children ?? []);
    const strip = (n: Node): unknown => {
      const { id: _i, x: _x, y: _y, children, ...rest } = n;
      return { ...rest, ...(children ? { children: children.map(strip) } : {}) };
    };
    expect(strip(all.find((n) => n.id === v.body.data.nodeId)!)).toEqual(strip(all.find((n) => n.id === root.id)!));
  }, 60_000);

  it('navbar: row space-between, SVG inline menjadi vektor, tautan; piksel < 2%', async () => {
    const html = sample('navbar');
    const { root, data } = await pasteSample(html, 'Navbar');
    expect(root).toMatchObject({ type: 'frame', tag: 'nav', name: 'Main navigation', layout: 'row', justify: 'space-between', align: 'center', width: BOARD_WIDTH });
    expect(find(root, (n) => n.type === 'path').length).toBe(2);
    expect(find(root, (n) => n.type === 'text').map((n) => n.content)).toEqual(['Halcyon', 'Work', 'Studio', 'Journal', 'Get in touch']);
    expect(data.report).toMatchObject({ kind: 'html', vectors: 2, dropped: [] });
    expect(await pixelRatio(html, root.id)).toBeLessThan(PIXEL_MAX_RATIO);
  }, 60_000);

  it('grid harga: grid repeat(3, 1fr), gradien, ul/li; piksel < 2%', async () => {
    const html = sample('grid-harga');
    const { root, data } = await pasteSample(html, 'Harga');
    expect(root).toMatchObject({ type: 'frame', tag: 'section', layout: 'grid', gridTemplateColumns: [{ fr: 1 }, { fr: 1 }, { fr: 1 }], columnGap: 24, rowGap: 24, padding: 32, width: 960 });
    expect(root.children).toHaveLength(3);
    expect(find(root, (n) => n.tag === 'ul' && n.layout === 'column')).toHaveLength(3);
    expect(find(root, (n) => n.tag === 'li')).toHaveLength(9);
    expect(find(root, (n) => Array.isArray(n.fills) && (n.fills as { type: string }[]).some((f) => f.type === 'linear'))).toHaveLength(1);
    expect(find(root, (n) => n.content === 'STUDIO')).toHaveLength(1);
    expect(data.report).toMatchObject({ kind: 'html', dropped: [] });
    expect(await pixelRatio(html, root.id)).toBeLessThan(PIXEL_MAX_RATIO);
  }, 60_000);

  it('skrip, handler, dan sumber eksternal tidak pernah berjalan; dilaporkan; dokumen tanpa HTML/CSS mentah', async () => {
    const at = `http://127.0.0.1:${port}`;
    const html = [
      `<link rel="stylesheet" href="${at}/s.css"><style>@import url(${at}/i.css); .box{width:120px;height:40px;background:#123456 url(${at}/bg.png)}</style>`,
      `<div class="box" onclick="document.title='ran'"><img src="${at}/a.png" width="20" height="20" onerror="document.body.innerHTML='<p>HACKED</p>'"></div>`,
      `<script>document.body.innerHTML = '<p>HACKED</p>'; fetch('${at}/fetch');</script>`,
      `<iframe src="${at}/frame" width="40" height="20"></iframe>`,
    ].join('\n');
    const { root, data } = await pasteSample(html, 'Aman');
    expect(hits).toEqual([]);
    expect(JSON.stringify(root)).not.toContain('HACKED');
    const dropped = data.report.dropped as { kind: string; name: string; count: number }[];
    expect(dropped).toEqual(
      expect.arrayContaining([
        { kind: 'element', name: '<script>', count: 1 },
        { kind: 'attribute', name: 'onclick', count: 1 },
        { kind: 'attribute', name: 'onerror', count: 1 },
        { kind: 'element', name: '<iframe>', count: 1 },
        expect.objectContaining({ kind: 'request', name: 'external image' }),
        expect.objectContaining({ kind: 'request', name: 'external stylesheet' }),
      ]),
    );
    const files = await Promise.all(['html-uji.lakar.json', 'html-uji.history.jsonl'].map((f) => readFile(join(tmp, 'data', 'docs', f), 'utf8')));
    for (const f of files) for (const raw of ['<div', '<style', '<script', 'class=', 'style=', 'onclick', '127.0.0.1']) expect(f).not.toContain(raw);
  }, 60_000);
});
