// Tool export_code (epic kode story 5): POST /viewer/export-code (sesi). Kesalahan matriks, bentuk respons, dan
// kesamaan dengan generateCode + glyph katalog (viewer memakai jalur yang sama; uji ujung ke ujung di tests/code-export.test.ts).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dtcgTokensJson, generateCode } from '@lakar/codegen';
import { buildServer, loadConfig } from './index.js';
import { exportGlyphs } from './code-export.js';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };
const fakeRender = { screenshot: async () => new Uint8Array(), measure: async () => ({ width: 1, height: 1, nodes: [], texts: [] }) } as never;

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-code-export-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function setup() {
  const dir = await mkdtemp(join(root, 'data-'));
  const daemon = buildServer({ config: { ...baseConfig, port: 7466, dataDir: dir }, render: fakeRender });
  const inject = (url: string, payload: unknown, headers: Record<string, string> = {}) => daemon.app.inject({ method: 'POST', url, payload: payload as object, headers });
  const created = await inject('/viewer/docs', { name: 'Kode', board: { preset: 'mobile' } });
  const slug = created.json().data.slug as string;
  const docGet = async () => (await daemon.app.inject({ method: 'GET', url: `/viewer/docs/${slug}` })).json().data.doc;
  const board = (await docGet()).pages[0].children[0].id as string;
  const ops = await inject(`/viewer/docs/${slug}/ops`, {
    ops: [
      { op: 'setTokens', tokens: { 'colors.brand': { type: 'color', value: '#0E7490' } } },
      { op: 'add', parentId: board, node: { type: 'frame', name: 'Hero', layout: 'row', gap: 8, padding: 16, fills: [{ type: 'solid', color: { $token: 'colors.brand' } }] }, ref: 'hero' },
    ],
  });
  expect(ops.statusCode, ops.body).toBe(200);
  const hero = ops.json().data.refs.hero as string;
  const icon = await inject(`/viewer/docs/${slug}/ops`, { ops: [{ op: 'add', parentId: hero, node: { type: 'icon', name: 'Star', lib: 'lucide', icon: 'star', size: 16 }, ref: 'star' }] });
  expect(icon.statusCode, icon.body).toBe(200);
  const star = icon.json().data.refs.star as string;
  const sid = (await inject('/sessions', { client: 'test-agent' })).json().data.sessionId as string;
  const call = (body: unknown, s = sid) => inject('/viewer/export-code', body, { 'x-lakar-session': s });
  return { daemon, slug, board, hero, star, sid, call, inject, docGet };
}

describe('POST /viewer/export-code (export_code)', () => {
  it('tanpa dokumen aktif → NO_ACTIVE_DOC; sesi tidak dikenal → 401', async () => {
    const t = await setup();
    const r = await t.call({});
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe('NO_ACTIVE_DOC');
    expect((await t.call({}, 'nope')).statusCode).toBe(401);
  });

  it('board pertama default; respons {docId, slug, rev, id, name, target, files, warnings}; sama dengan generateCode + glyph katalog', async () => {
    const t = await setup();
    expect((await t.inject('/docs/open', { slug: t.slug }, { 'x-lakar-session': t.sid })).statusCode).toBe(200);
    const r = await t.call({});
    expect(r.statusCode, r.body).toBe(200);
    const data = r.json().data;
    const doc = await t.docGet();
    expect(data).toMatchObject({ docId: doc.id, slug: t.slug, rev: doc.rev, id: t.board, target: 'react-tailwind' });
    const opts = { nodeId: t.board, target: 'react-tailwind' as const };
    const expected = generateCode(doc, { ...opts, icons: exportGlyphs(doc, opts, t.daemon.icons) });
    expect(data.files.map((f: { path: string; contents: string }) => ({ path: f.path, contents: f.contents }))).toEqual(expected.files);
    expect(data.files.every((f: { contents: string; bytes: number }) => f.bytes === Buffer.byteLength(f.contents))).toBe(true);
    // Glyph dari katalog → SVG tanpa warning.
    expect(data.files[0].contents).toContain('<svg');
    expect(data.warnings).toEqual([]);
    expect(data.files.find((f: { path: string }) => f.path === 'tokens.css').contents).toContain('--colors-brand: #0E7490;');
  });

  it('opsi diteruskan: id node, react-css, tokens:false, typescript:false', async () => {
    const t = await setup();
    await t.inject('/docs/open', { slug: t.slug }, { 'x-lakar-session': t.sid });
    const r = await t.call({ id: t.hero, target: 'react-css', tokens: false, typescript: false, components: false });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toMatchObject({ id: t.hero, name: 'Hero', target: 'react-css' });
    expect(r.json().data.files.map((f: { path: string }) => f.path)).toEqual(['Hero.jsx', 'Hero.module.css']);
  });

  it('exportGlyphs: ikon yang tidak dikenal katalog dilewati → codegen menulis icon-glyph-missing', async () => {
    const t = await setup();
    const doc = await t.docGet();
    const opts = { nodeId: t.board, target: 'react-css' as const };
    const none = exportGlyphs(doc, opts, { glyph: () => undefined });
    expect(none).toEqual([]);
    expect(generateCode(doc, { ...opts, icons: none }).warnings.map((w) => w.code)).toEqual(['icon-glyph-missing']);
    expect(exportGlyphs(doc, opts, t.daemon.icons).map((g) => `${g.lib}/${g.icon}`)).toEqual(['lucide/star']);
  });

  it("target 'dtcg': satu berkas tokens.json W3C DTCG (tanpa id/board), isi = dtcgTokensJson", async () => {
    const t = await setup();
    await t.inject('/docs/open', { slug: t.slug }, { 'x-lakar-session': t.sid });
    const r = await t.call({ target: 'dtcg' });
    expect(r.statusCode, r.body).toBe(200);
    const data = r.json().data;
    const doc = await t.docGet();
    expect(data).toMatchObject({ docId: doc.id, slug: t.slug, rev: doc.rev, id: null, name: null, target: 'dtcg' });
    expect(data.files).toEqual([{ path: 'tokens.json', contents: dtcgTokensJson(doc), bytes: Buffer.byteLength(dtcgTokensJson(doc), 'utf8') }]);
    const parsed = JSON.parse(data.files[0].contents);
    expect(parsed.colors.brand).toMatchObject({ $type: 'color', $value: '#0E7490' });
    expect(data.warnings).toEqual([]);
  });

  it('target tak dikenal / kunci asing → SCHEMA_INVALID; id asing → NOT_FOUND', async () => {
    const t = await setup();
    await t.inject('/docs/open', { slug: t.slug }, { 'x-lakar-session': t.sid });
    const bad = await t.call({ target: 'vue' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('SCHEMA_INVALID');
    expect(bad.json().error.hint).toContain('react-tailwind');
    expect((await t.call({ scale: 2 })).json().error.code).toBe('SCHEMA_INVALID');
    const gone = await t.call({ id: 'Nope0000' });
    expect(gone.statusCode).toBe(404);
    expect(gone.json().error.message).toContain('node Nope0000 tidak ada');
  });

  it('alamat komposit (isi instance) → 200 sama dengan generateCode; komposit asing → 404 NOT_FOUND', async () => {
    const t = await setup();
    const r0 = await t.inject(`/viewer/docs/${t.slug}/ops`, {
      ops: [
        { op: 'setComponent', id: t.hero, component: { props: [], slots: [] } },
        { op: 'add', parentId: t.board, node: { type: 'instance', name: 'Hero 2', componentId: t.hero }, ref: 'inst' },
      ],
    });
    expect(r0.statusCode, r0.body).toBe(200);
    const address = `${r0.json().data.refs.inst}/${t.star}`;
    await t.inject('/docs/open', { slug: t.slug }, { 'x-lakar-session': t.sid });
    const r = await t.call({ id: address, target: 'react-css' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toMatchObject({ id: address, name: address });
    const doc = await t.docGet();
    const opts = { nodeId: address, target: 'react-css' as const };
    expect(r.json().data.files.map((f: { path: string; contents: string }) => ({ path: f.path, contents: f.contents }))).toEqual(generateCode(doc, { ...opts, icons: exportGlyphs(doc, opts, t.daemon.icons) }).files);
    const gone = await t.call({ id: `${r0.json().data.refs.inst}/Nope0000` });
    expect(gone.statusCode).toBe(404);
    expect(gone.json().error.code).toBe('NOT_FOUND');
  });

  it('guard Origin: lintas origin → 403; tanpa Origin (klien MCP) diterima', async () => {
    const t = await setup();
    await t.inject('/docs/open', { slug: t.slug }, { 'x-lakar-session': t.sid });
    const cross = await t.inject('/viewer/export-code', {}, { 'x-lakar-session': t.sid, origin: 'http://evil.example' });
    expect(cross.statusCode).toBe(403);
    expect((await t.call({})).statusCode).toBe(200);
  });

  it('tercatat di Activity sebagai export_code dengan target id', async () => {
    const t = await setup();
    await t.inject('/docs/open', { slug: t.slug }, { 'x-lakar-session': t.sid });
    await t.call({ id: t.hero });
    const calls = t.daemon.activity.recent().filter((e) => e.type === 'call' && e.call.tool === 'export_code');
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((e) => e.type === 'call' && e.call.target === t.hero)).toBe(true);
  });
});

describe('POST /viewer/export-svg (export_svg)', () => {
  const callSvg = (t: Awaited<ReturnType<typeof setup>>, body: unknown, s = t.sid) => t.inject('/viewer/export-svg', body, { 'x-lakar-session': s });

  it('tanpa dokumen aktif → NO_ACTIVE_DOC; sesi tidak dikenal → 401; kunci asing → SCHEMA_INVALID', async () => {
    const t = await setup();
    const r = await callSvg(t, {});
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe('NO_ACTIVE_DOC');
    expect((await callSvg(t, {}, 'nope')).statusCode).toBe(401);
    await t.inject('/docs/open', { slug: t.slug }, { 'x-lakar-session': t.sid });
    expect((await callSvg(t, { foo: 1 })).statusCode).toBe(400);
  });

  it('board default → 200 SVG; anak non-vektor dilaporkan di dropped ("<nodeId>.<prop>")', async () => {
    const t = await setup();
    await t.inject('/docs/open', { slug: t.slug }, { 'x-lakar-session': t.sid });
    const r = await callSvg(t, {});
    expect(r.statusCode, r.body).toBe(200);
    const data = r.json().data;
    expect(data).toMatchObject({ slug: t.slug, id: t.board, type: 'board' });
    expect(data.svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(data.bytes).toBe(Buffer.byteLength(data.svg, 'utf8'));
    // Hero = frame (lolos), ikon Star di dalamnya tidak punya padanan → dropped.
    expect(data.dropped).toContain(`${t.star}.type`);
  });

  it('path node → SVG utuh berisi <path d>; text → EXPORT_FAILED; id asing → NOT_FOUND', async () => {
    const t = await setup();
    const ops = await t.inject(`/viewer/docs/${t.slug}/ops`, {
      ops: [
        { op: 'add', parentId: t.board, node: { type: 'path', name: 'V', position: 'absolute', x: 0, y: 0, width: 24, height: 24, d: 'M0 0h24v24z', viewBox: [0, 0, 24, 24], fills: [{ type: 'solid', color: '#000000' }] }, ref: 'v' },
        { op: 'add', parentId: t.board, node: { type: 'text', name: 'T', content: 'halo', size: 16 }, ref: 'tx' },
      ],
    });
    expect(ops.statusCode, ops.body).toBe(200);
    const { v, tx } = ops.json().data.refs;
    await t.inject('/docs/open', { slug: t.slug }, { 'x-lakar-session': t.sid });
    const r = await callSvg(t, { id: v });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data.svg).toContain('d="M0 0h24v24z"');
    expect(r.json().data.dropped).toEqual([]);
    const bad = await callSvg(t, { id: tx });
    expect(bad.statusCode).toBe(500);
    expect(bad.json().error.code).toBe('EXPORT_FAILED');
    expect((await callSvg(t, { id: 'Zzzzzzzz' })).json().error.code).toBe('NOT_FOUND');
  });

  it('root instance (alamat di dokumen ter-resolve) → 200 sebagai frame; tercatat export_svg di Activity', async () => {
    const t = await setup();
    const r0 = await t.inject(`/viewer/docs/${t.slug}/ops`, {
      ops: [
        { op: 'setComponent', id: t.hero, component: { props: [], slots: [] } },
        { op: 'add', parentId: t.board, node: { type: 'instance', name: 'Hero 2', componentId: t.hero }, ref: 'inst' },
      ],
    });
    expect(r0.statusCode, r0.body).toBe(200);
    const inst = r0.json().data.refs.inst as string;
    await t.inject('/docs/open', { slug: t.slug }, { 'x-lakar-session': t.sid });
    const r = await callSvg(t, { id: inst });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data.type).toBe('frame');
    const calls = t.daemon.activity.recent().filter((e) => e.type === 'call' && e.call.tool === 'export_svg' && e.call.status === 'done');
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((e) => e.type === 'call' && e.call.target === inst)).toBe(true);
  });
});
