// Route paste (epic paste-vektor story 3, AD-15): POST /viewer/docs/:slug/paste (viewer, guard Origin) dan
// POST /viewer/paste (sesi, tool MCP `paste`). Satu paste = satu rev + satu entri riwayat; undo lewat `inverse`;
// kedua route menghasilkan layer identik; posisi; parent salah; batas; Activity. RenderPort palsu.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SESSION_HEADER, type LakarDocument } from '@lakar/schema';
import { buildServer, loadConfig } from './index.js';
import type { DocChange } from './events.js';
import { PASTE_CONTENT_MAX, htmlViewportWidth } from './paste.js';
import { solidPng } from './assets.js';
import type { HtmlSnapshot } from './paste/html-page.js';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };
const fakeRender = {
  screenshot: async () => new Uint8Array(),
  measure: async () => ({ width: 1, height: 1, nodes: [], texts: [] }),
} as never;

const fixture = (name: string) => readFileSync(new URL(`../../../tests/fixtures/svg/ikon-vektor/${name}.svg`, import.meta.url), 'utf8');
const ICON = fixture('lonceng');

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-paste-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function setup(render: unknown = fakeRender) {
  const dataDir = await mkdtemp(join(root, 'data-'));
  const daemon = buildServer({ config: { ...baseConfig, port: 7466, dataDir }, render: render as never });
  const { app } = daemon;
  const docsDir = join(dataDir, 'docs');
  const post = (url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url, ...(payload !== undefined ? { payload: payload as object } : {}), headers });
  const doc = async (slug: string) => JSON.parse(await readFile(join(docsDir, `${slug}.lakar.json`), 'utf8')) as LakarDocument;
  const history = async (slug: string) =>
    (await readFile(join(docsDir, `${slug}.history.jsonl`), 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  const create = async (name: string) => {
    const r = await post('/viewer/docs', { name, board: { preset: 'mobile' } });
    expect(r.statusCode, r.body).toBe(200);
    const slug = r.json().data.slug as string;
    return { slug, board: (await doc(slug)).pages[0]!.children[0]!.id };
  };
  const changes: DocChange[] = [];
  daemon.activity.subscribeAll((e) => {
    if (e.type === 'change') changes.push(e.change);
  });
  return { ...daemon, dataDir, post, doc, history, create, changes };
}

const node = (d: LakarDocument, id: string): any => {
  const walk = (n: any): any => (n.id === id ? n : (n.children ?? []).map(walk).find(Boolean));
  for (const p of d.pages) for (const b of p.children) {
    const hit = walk(b);
    if (hit) return hit;
  }
  return undefined;
};
const strip = (n: any): any => {
  const { id: _id, children, ...rest } = n;
  return children ? { ...rest, children: children.map(strip) } : rest;
};
const content = (d: LakarDocument) => ({ pages: d.pages, tokens: d.tokens ?? {}, tokenModes: d.tokenModes });

describe('POST /viewer/docs/:slug/paste', () => {
  it('SVG ikon → frame berisi path di tengah board; satu rev + satu entri riwayat; event change; laporan', async () => {
    const t = await setup();
    try {
      const { slug, board } = await t.create('Paste Satu');
      const before = await t.doc(slug);
      const histBefore = await t.history(slug);
      const r = await t.post(`/viewer/docs/${slug}/paste`, { content: ICON, parentId: board, name: 'Bell' }, { 'x-lakar-origin': 'win-1' });
      expect(r.statusCode, r.body).toBe(200);
      const data = r.json().data;
      expect(data).toMatchObject({ slug, rev: before.rev + 1, report: { kind: 'svg', paths: 3, kept: ['stroke-linecap', 'stroke-linejoin'], dropped: [] } });
      expect(data.created).toHaveLength(4);
      expect(data.refs.paste).toBe(data.nodeId);
      const after = await t.doc(slug);
      const frame = node(after, data.nodeId);
      const b = node(after, board);
      expect(frame).toMatchObject({ type: 'frame', name: 'Bell', position: 'absolute', x: Math.round((b.width - 96) / 2), y: Math.round((b.height - 96) / 2), width: 96, height: 96 });
      expect(frame.children.map((c: any) => c.type)).toEqual(['path', 'path', 'path']);
      const hist = await t.history(slug);
      expect(hist.at(-1)).toMatchObject({ rev: after.rev, description: 'Paste SVG', client: 'lakar-viewer' });
      expect(hist.length).toBe(histBefore.length + 1);
      expect(t.changes.at(-1)).toMatchObject({ kind: 'edit', slug, rev: after.rev, boards: [board], origin: 'win-1' });

      // Undo: inverse ke route ops mengembalikan dokumen.
      const undo = await t.post(`/viewer/docs/${slug}/ops`, { ops: data.inverse });
      expect(undo.statusCode, undo.body).toBe(200);
      expect(content(await t.doc(slug))).toEqual(content(before));
    } finally {
      await t.app.close();
    }
  });

  it('parent flow → tanpa x/y; x/y body dipakai di board; satu path → node path', async () => {
    const t = await setup();
    try {
      const { slug, board } = await t.create('Paste Dua');
      const f = await t.post(`/viewer/docs/${slug}/ops`, { ops: [{ op: 'add', parentId: board, node: { type: 'frame', name: 'Row', layout: 'row' }, ref: 'r' }] });
      const rowId = f.json().data.refs.r;
      const svg = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24z" fill="#F00"/></svg>';
      const a = await t.post(`/viewer/docs/${slug}/paste`, { content: svg, parentId: rowId });
      expect(a.statusCode, a.body).toBe(200);
      const inRow = node(await t.doc(slug), a.json().data.nodeId);
      expect(inRow).toMatchObject({ type: 'path', name: 'SVG', d: 'M0 0h24v24z' });
      expect(inRow.x).toBeUndefined();
      expect(inRow.position).toBeUndefined();
      const b = await t.post(`/viewer/docs/${slug}/paste`, { content: svg, parentId: board, x: 5, y: 7, description: 'Paste logo' });
      expect(node(await t.doc(slug), b.json().data.nodeId)).toMatchObject({ position: 'absolute', x: 5, y: 7 });
      expect((await t.history(slug)).at(-1).description).toBe('Paste logo');
    } finally {
      await t.app.close();
    }
  });

  it('error: SVG rusak, parent bukan kontainer, parent tak ada, isi instance, body salah, terlalu besar, slug, dokumen, Origin', async () => {
    const t = await setup();
    try {
      const { slug, board } = await t.create('Paste Tiga');
      const tx = await t.post(`/viewer/docs/${slug}/ops`, { ops: [{ op: 'add', parentId: board, node: { type: 'text', name: 'T', content: 'x', size: 12 }, ref: 't' }] });
      const textId = tx.json().data.refs.t;
      const rev = (await t.doc(slug)).rev;
      const cases: [unknown, number, string, string?][] = [
        [{ content: 'hello', parentId: board }, 400, 'SCHEMA_INVALID', 'SVG tidak bisa diurai'],
        [{ content: '<svg><text>x</text></svg>', parentId: board }, 400, 'SCHEMA_INVALID', 'tidak berisi bentuk'],
        [{ content: ICON, parentId: textId }, 400, 'SCHEMA_INVALID', 'harus board atau frame'],
        [{ content: ICON, parentId: 'Zzzzzzzz' }, 404, 'NOT_FOUND'],
        [{ content: ICON, parentId: 'Aaaaaaaa/Bbbbbbbb' }, 400, 'SCHEMA_INVALID', 'isi instance'],
        [{ content: ICON }, 400, 'SCHEMA_INVALID'],
        [{ content: ICON, parentId: board, kind: 'png' }, 400, 'SCHEMA_INVALID'],
        [{ content: '<p>x</p>', parentId: board, kind: 'html', width: 0 }, 400, 'SCHEMA_INVALID'],
        // Renderer palsu tanpa snapshotHtml: paste HTML butuh Chromium daemon.
        [{ content: '<p>x</p>', parentId: board, kind: 'html' }, 503, 'RENDER_FAILED', 'butuh Chromium'],
        [{ content: ICON, parentId: board, extra: 1 }, 400, 'SCHEMA_INVALID'],
        [{ content: 'x'.repeat(PASTE_CONTENT_MAX + 1), parentId: board }, 400, 'SCHEMA_INVALID'],
      ];
      for (const [body, status, code, msg] of cases) {
        const r = await t.post(`/viewer/docs/${slug}/paste`, body);
        expect(r.statusCode, r.body.slice(0, 300)).toBe(status);
        expect(r.json().error.code).toBe(code);
        if (msg) expect(r.json().error.message).toContain(msg);
      }
      const many = `<svg viewBox="0 0 1 1">${'<path d="M0 0L1 1"/>'.repeat(1000)}</svg>`;
      const big = await t.post(`/viewer/docs/${slug}/paste`, { content: many, parentId: board });
      expect(big.statusCode).toBe(400);
      expect(big.json().error.message).toContain('maks 999');
      expect((await t.post('/viewer/docs/Bad_Slug/paste', { content: ICON, parentId: board })).statusCode).toBe(400);
      expect((await t.post('/viewer/docs/tidak-ada/paste', { content: ICON, parentId: board })).statusCode).toBe(404);
      const evil = await t.post(`/viewer/docs/${slug}/paste`, { content: ICON, parentId: board }, { origin: 'https://evil.example' });
      expect(evil.statusCode).toBe(403);
      expect((await t.doc(slug)).rev).toBe(rev);
    } finally {
      await t.app.close();
    }
  });
});

describe('POST /viewer/paste (tool MCP paste)', () => {
  it('sesi dengan dokumen aktif → layer identik dengan route viewer; riwayat sesi; Activity paste', async () => {
    const t = await setup();
    try {
      const { slug, board } = await t.create('Paste Agen');
      const s = await t.post('/sessions', { client: 'claude-code' });
      const session = s.json().data.sessionId as string;
      const h = { [SESSION_HEADER]: session };
      const none = await t.post('/viewer/paste', { content: ICON, parentId: board }, h);
      expect(none.statusCode).toBe(409);
      expect(none.json().error.code).toBe('NO_ACTIVE_DOC');
      expect((await t.post('/docs/open', { slug }, h)).statusCode).toBe(200);
      const r = await t.post('/viewer/paste', { content: ICON, parentId: board }, h);
      expect(r.statusCode, r.body).toBe(200);
      const data = r.json().data;
      expect(data).toMatchObject({ slug, report: { paths: 3 }, boards: [board] });
      expect(data.inverse).toBeUndefined();
      const v = await t.post(`/viewer/docs/${slug}/paste`, { content: ICON, parentId: board });
      const after = await t.doc(slug);
      expect(strip(node(after, data.nodeId))).toEqual(strip(node(after, v.json().data.nodeId)));
      // Semua ikon korpus + varian ber-transform: kedua pintu menghasilkan layer identik.
      const rotated = fixture('zigzag').replace(/(<svg[^>]*>)/, '$1<g transform="rotate(90 12 12)">').replace('</svg>', '</g></svg>');
      for (const content of [fixture('cincin'), fixture('zigzag'), rotated]) {
        const a = (await t.post('/viewer/paste', { content, parentId: board }, h)).json().data;
        const b = (await t.post(`/viewer/docs/${slug}/paste`, { content, parentId: board })).json().data;
        const d = await t.doc(slug);
        expect(strip(node(d, a.nodeId))).toEqual(strip(node(d, b.nodeId)));
        expect(a.report).toEqual(b.report);
      }
      expect((await t.post('/viewer/paste', { content: ICON, parentId: board }, { ...h, origin: 'https://evil.example' })).statusCode).toBe(403);
      const hist = await t.history(slug);
      expect(hist.find((e: any) => e.rev === data.rev)).toMatchObject({ description: 'Paste SVG', client: 'claude-code' });
      const calls = t.activity.recent().filter((e) => e.type === 'call' && e.call.tool === 'paste' && e.call.status !== 'running');
      expect(calls.find((e) => e.type === 'call' && e.call.rev === data.rev)).toMatchObject({ call: { tool: 'paste', status: 'done', slug, rev: data.rev, target: board, boards: [board], nodes: 4 } });
    } finally {
      await t.app.close();
    }
  });
});

describe('paste HTML (snapshot palsu; integrasi Chromium di paste-html.test.ts)', () => {
  const style = (s: Record<string, string>) => ({ display: 'block', 'background-color': 'rgba(0, 0, 0, 0)', 'background-image': 'none', 'box-shadow': 'none', color: 'rgb(0, 0, 0)', 'font-size': '16px', 'font-family': 'Inter', 'font-weight': '400', ...s });
  const png = solidPng(2, 2, [1, 2, 3]);
  const snapshot = (width: number): HtmlSnapshot => ({
    width,
    scripts: 1,
    requests: [],
    truncated: false,
    body: {
      k: 'el', tag: 'body', box: [0, 0, width, 100], style: style({}), spec: {},
      children: [
        {
          k: 'el', tag: 'nav', box: [0, 0, 200, 40], style: style({ display: 'flex', 'column-gap': '8px' }), spec: {},
          children: [
            { k: 'el', tag: 'div', box: [0, 0, 100, 40], style: style({ display: 'flex' }), spec: {}, children: [{ k: 'el', tag: 'img', box: [0, 0, 40, 40], style: style({}), spec: {}, children: [], img: { src: `data:image/png;base64,${png.toString('base64')}` } }] },
            { k: 'el', tag: 'a', box: [108, 10, 50, 20], style: style({}), spec: {}, children: [], text: { content: 'Docs', lines: 1, mixed: [] } },
          ],
        },
      ],
    },
  });

  it('kind html → snapshot dengan lebar tujuan, op bersarang, aset ditulis, deskripsi Paste HTML, laporan html', async () => {
    const widths: number[] = [];
    const render = { ...(fakeRender as object), snapshotHtml: async (_html: string, o: { width: number }) => (widths.push(o.width), snapshot(o.width)) };
    const t = await setup(render);
    try {
      const { slug, board } = await t.create('Paste Html');
      const beforeDoc = await t.doc(slug);
      const before = beforeDoc.rev;
      const r = await t.post(`/viewer/docs/${slug}/paste`, { kind: 'html', content: '<nav>…</nav>', parentId: board });
      expect(r.statusCode, r.body).toBe(200);
      const data = r.json().data;
      expect(widths).toEqual([375]);
      expect(data.rev).toBe(before + 1);
      expect(data.report).toEqual({ kind: 'html', layers: 4, autoLayout: 2, texts: 1, images: 1, vectors: 0, dropped: [{ kind: 'element', name: '<script>', count: 1 }] });
      expect(Object.keys(data.refs).sort()).toEqual(['paste', 'paste-1']);
      const d = await t.doc(slug);
      const nav = node(d, data.nodeId);
      expect(nav).toMatchObject({ type: 'frame', tag: 'nav', layout: 'row', gap: 8, position: 'absolute', width: 200 });
      const assetId = nav.children[0].children[0].fills[0].assetId as string;
      expect(readFileSync(join(t.dataDir, 'assets', assetId))).toEqual(png);
      expect((await t.history(slug)).at(-1)).toMatchObject({ description: 'Paste HTML', rev: data.rev });
      // Undo lewat inverse (op bersarang paste-N) mengembalikan isi dokumen.
      const undo = await t.post(`/viewer/docs/${slug}/ops`, { ops: data.inverse });
      expect(undo.statusCode, undo.body).toBe(200);
      expect(content(await t.doc(slug))).toEqual(content(beforeDoc));
      // Lebar eksplisit menang.
      await t.post(`/viewer/docs/${slug}/paste`, { kind: 'html', content: '<nav>…</nav>', parentId: board, width: 640 });
      expect(widths).toEqual([375, 640]);
      // Parent salah / dokumen tak ada: gagal sebelum render Chromium (tanpa panggilan snapshot).
      expect((await t.post(`/viewer/docs/${slug}/paste`, { kind: 'html', content: '<p>x</p>', parentId: 'Zzzzzzzz' })).statusCode).toBe(404);
      expect((await t.post('/viewer/docs/tidak-ada/paste', { kind: 'html', content: '<p>x</p>', parentId: board })).statusCode).toBe(404);
      expect(widths).toEqual([375, 640]);
    } finally {
      await t.app.close();
    }
  });

  it('HTML tanpa isi terlihat → 400 SCHEMA_INVALID dengan hint HTML; tidak ada commit', async () => {
    const empty = (width: number): HtmlSnapshot => ({ ...snapshot(width), scripts: 0, body: { ...snapshot(width).body, children: [] } });
    const t = await setup({ ...(fakeRender as object), snapshotHtml: async (_h: string, o: { width: number }) => empty(o.width) });
    try {
      const { slug, board } = await t.create('Paste Kosong');
      const rev = (await t.doc(slug)).rev;
      const r = await t.post(`/viewer/docs/${slug}/paste`, { kind: 'html', content: '<!-- x -->', parentId: board });
      expect(r.statusCode, r.body).toBe(400);
      expect(r.json().error).toMatchObject({ code: 'SCHEMA_INVALID', hint: expect.stringContaining('HTML') });
      expect((await t.doc(slug)).rev).toBe(rev);
    } finally {
      await t.app.close();
    }
  });

  it('lebar viewport default: board, frame dikurangi padding horizontal, selain itu 1280', () => {
    expect(htmlViewportWidth({ id: 'a', type: 'board', width: 1440 })).toBe(1440);
    expect(htmlViewportWidth({ id: 'a', type: 'frame', width: 400, padding: [8, 16] })).toBe(368);
    expect(htmlViewportWidth({ id: 'a', type: 'frame', width: 400, padding: [0, 10, 0, 30] })).toBe(360);
    expect(htmlViewportWidth({ id: 'a', type: 'frame', width: 'fill' })).toBe(1280);
    expect(htmlViewportWidth(undefined)).toBe(1280);
  });
});
