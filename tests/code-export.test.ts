// Epic kode story 5 ujung ke ujung (Done-when epic kode): ekspor board yang sama lewat jalur viewer (codeExport.ts +
// GET /viewer/render-deps) dan lewat tool MCP `export_code` (POST /viewer/export-code) menghasilkan berkas identik;
// mengubah token / master lalu mengekspor ulang hanya mengubah berkas token / komponen (pemakai tetap var() dan
// <Komponen/>); token dari Copy tokens as CSS yang diimpor lewat dialog Import CSS variables (cssImport.ts → op core)
// membuat token, tipe, nilai, mode, dan tokenModes yang sama.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IconGlyph, LakarDocument } from '../packages/schema/src/index.ts';
import { applyOps, beginTransaction, createDocument } from '../packages/core/src/index.ts';
import { tailwindThemeCss, tokensCss } from '../packages/codegen/src/index.ts';
import { buildServer, loadConfig } from '../packages/daemon/src/index.ts';
import { DEFAULT_SETTINGS, exportCode, type CodeExportSettings } from '../packages/viewer/src/codeExport.ts';
import { importPlan } from '../packages/viewer/src/cssImport.ts';
import { formatExportCode } from '../packages/mcp/src/server.ts';

const FIXTURE = fileURLToPath(new URL('./fixtures/codegen/landing.lakar.json', import.meta.url));
const SLUG = 'landing';
const BOARD = 'BrdLnd01';
const MASTER = 'MstLBtn1';
const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };
const fakeRender = { screenshot: async () => new Uint8Array(), measure: async () => ({ width: 1, height: 1, nodes: [], texts: [] }) } as never;

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-code-export-e2e-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

type Files = { path: string; contents: string }[];

async function setup() {
  const dir = await mkdtemp(join(root, 'data-'));
  await mkdir(join(dir, 'docs'), { recursive: true });
  await copyFile(FIXTURE, join(dir, 'docs', `${SLUG}.lakar.json`));
  const { app } = buildServer({ config: { ...baseConfig, port: 7466, dataDir: dir }, render: fakeRender });
  const post = (url: string, payload: unknown, headers: Record<string, string> = {}) => app.inject({ method: 'POST', url, payload: payload as object, headers });
  const sid = (await post('/sessions', { client: 'test-agent' })).json().data.sessionId as string;
  expect((await post('/docs/open', { slug: SLUG }, { 'x-lakar-session': sid })).statusCode).toBe(200);
  const doc = async () => (await app.inject({ method: 'GET', url: `/viewer/docs/${SLUG}` })).json().data.doc as LakarDocument;
  /** Pengambil glyph viewer: GET /viewer/render-deps (sama dengan api.renderDeps). */
  const fetchGlyphs = async (keys: string[]): Promise<IconGlyph[]> => {
    const qs = new URLSearchParams(keys.map((k) => ['icon', k]));
    const r = await app.inject({ method: 'GET', url: `/viewer/render-deps?${qs}` });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data.icons;
  };
  const viaViewer = async (s: CodeExportSettings, id = BOARD): Promise<Files> => (await exportCode(await doc(), id, s, fetchGlyphs)).files;
  /** Jalur agen: respons daemon asli diformat seperti tool MCP (ringkasan JSON + satu blok `----- path -----` per berkas). */
  const viaMcp = async (s: CodeExportSettings, id = BOARD): Promise<Files> => {
    const r = await post('/viewer/export-code', { id, ...s }, { 'x-lakar-session': sid });
    expect(r.statusCode, r.body).toBe(200);
    const [head, ...blocks] = formatExportCode(r.json().data) as { type: 'text'; text: string }[];
    expect(JSON.parse(head!.text).files).toHaveLength(blocks.length);
    return blocks.map((b) => {
      const nl = b.text.indexOf('\n');
      return { path: b.text.slice(6, nl - 6), contents: b.text.slice(nl + 1) };
    });
  };
  const ops = async (list: unknown[]) => {
    const r = await post(`/viewer/docs/${SLUG}/ops`, { ops: list });
    expect(r.statusCode, r.body).toBe(200);
  };
  return { doc, viaViewer, viaMcp, ops };
}

const changed = (a: Files, b: Files) => {
  expect(b.map((f) => f.path)).toEqual(a.map((f) => f.path));
  return a.filter((f, i) => f.contents !== b[i]!.contents).map((f) => f.path);
};

describe('export code viewer = export_code', () => {
  it('kedua target, dengan/tanpa komponen, TS/JS, dengan/tanpa token: berkas identik byte', async () => {
    const t = await setup();
    const variants: CodeExportSettings[] = [
      DEFAULT_SETTINGS,
      { ...DEFAULT_SETTINGS, target: 'react-css' },
      { ...DEFAULT_SETTINGS, components: false },
      { target: 'react-css', components: true, tokens: false, typescript: false },
    ];
    for (const s of variants) {
      const viewer = await t.viaViewer(s);
      expect(await t.viaMcp(s), JSON.stringify(s)).toEqual(viewer);
      expect(viewer.some((f) => f.contents.includes('<svg')), 'glyph ikon ikut').toBe(true);
    }
    // Node master sebagai berkas utama juga sama.
    expect(await t.viaMcp(DEFAULT_SETTINGS, MASTER)).toEqual(await t.viaViewer(DEFAULT_SETTINGS, MASTER));
  });

  it('ubah token → hanya tokens.css; ubah master → berkas komponen master berubah, pemanggilan <Tombol …/> tetap', async () => {
    const t = await setup();
    for (const target of ['react-css', 'react-tailwind'] as const) {
      const s = { ...DEFAULT_SETTINGS, target };
      const before = await t.viaMcp(s);
      const doc = await t.doc();
      const [name, def] = Object.entries(doc.tokens ?? {}).find(([, d]) => d.type === 'color')!;
      await t.ops([{ op: 'setTokens', tokens: { [name]: { ...def, value: def.value === '#123456' ? '#654321' : '#123456' } } }]);
      const afterToken = await t.viaMcp(s);
      expect(changed(before, afterToken)).toEqual(['tokens.css']);
      await t.ops([{ op: 'update', id: MASTER, patch: { padding: target === 'react-css' ? [14, 22] : [10, 18] } }]);
      const afterMaster = await t.viaMcp(s);
      const diff = changed(afterToken, afterMaster);
      expect(diff).toContain('components/Tombol.tsx'.replace('.tsx', target === 'react-css' ? '.module.css' : '.tsx'));
      // Selain komponen, hanya berkas utama yang boleh berubah: salinan inline instance yang override-nya tidak bisa
      // dinyatakan sebagai prop (warning instance-inlined, story 3) ikut memakai nilai master baru.
      expect(diff.every((p) => p.startsWith('components/Tombol.') || !p.includes('/')), diff.join(', ')).toBe(true);
      const calls = (f: Files) => f[0]!.contents.split('\n').filter((l) => l.includes('<Tombol'));
      expect(calls(afterMaster).length).toBeGreaterThan(0);
      expect(calls(afterMaster)).toEqual(calls(afterToken));
    }
  });
});

describe('Copy tokens as CSS → Import CSS variables', () => {
  const importInto = (doc: LakarDocument, css: string) => {
    const plan = importPlan(doc, css);
    const tx = beginTransaction(doc, { sessionId: 'lakar-viewer' });
    applyOps(tx, plan.ops);
    return { plan, doc: tx.commit(plan.label).doc };
  };

  it('impor ulang tokens.css ke dokumen asal (op dialog lewat core) → semua Update, token dan mode identik', async () => {
    const t = await setup();
    const source = await t.doc();
    const { plan, doc } = importInto(source, tokensCss(source));
    expect(plan.counts).toEqual({ new: 0, update: Object.keys(source.tokens ?? {}).length, skipped: 0 });
    expect(doc.tokens).toEqual(source.tokens);
    expect(doc.tokenModes).toEqual(source.tokenModes);
  });

  it('impor ke dokumen kosong → mode, variabel, nilai per mode sama; tokens.css/theme.css hasil ekspor ulang identik', async () => {
    const t = await setup();
    const source = await t.doc();
    const css = tokensCss(source);
    const { plan, doc } = importInto(createDocument(), css);
    expect(plan.counts.skipped).toBe(0);
    expect(doc.tokenModes).toEqual(source.tokenModes);
    expect(tokensCss(doc)).toBe(css);
    // Nama tanpa '-' di segmen dan tipe yang bisa disimpulkan dari nilai/nama → definisi identik.
    for (const [name, def] of Object.entries(source.tokens ?? {})) {
      if (name.includes('-')) continue;
      expect(doc.tokens?.[name], name).toEqual(def);
    }
    expect(tailwindThemeCss(importInto(createDocument(), css).doc)).toBe(tailwindThemeCss(doc));
  });
});
