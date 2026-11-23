// Uji paritas piksel ekspor kode (spec kode-4, R5, AD-6): keluaran @lakar/codegen (React + CSS modules dan React +
// Tailwind v4 yang dikompilasi compiler Tailwind asli) di-SSR dengan React, dimuat di Chromium Lakar, lalu
// dibandingkan dengan render acuan board/node yang sama (`renderBoard` dist, CHROMIUM_ARGS daemon). Ambang: piksel
// dengan selisih kanal > PARITY_TOLERANCE harus < 1% luas. Skip bersih bila chromium-headless-shell tidak terpasang.
// Diagnosis: LAKAR_PARITY_LOG=1 mencetak rasio tiap perbandingan; LAKAR_PARITY_KEEP=1 menyimpan berkas ekspor +
// index.html di tests/.parity/; kasus gagal menulis PNG acuan/ekspor/diff di packages/render/test/out/parity/.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Regresi sengaja di pemetaan (verify ticket): `frameDecls` milik @lakar/render, sebagaimana dipakai codegen, bisa
// dibuat membuang padding. Render acuan tidak terpengaruh: harness memuat dist render apa adanya di Chromium.
const regress = vi.hoisted(() => ({ dropFramePadding: false }));
vi.mock('../packages/render/dist/index.js', async (importOriginal) => {
  const m = await importOriginal<typeof import('../packages/render/dist/index.js')>();
  return {
    ...m,
    frameDecls: (...args: Parameters<typeof m.frameDecls>) => {
      const decls = m.frameDecls(...args);
      return regress.dropFramePadding ? decls.filter(([p]) => p !== 'padding') : decls;
    },
  };
});
import { compile } from 'tailwindcss';
import { Scanner } from '@tailwindcss/oxide';
import { parseDocument } from '../packages/core/src/index.ts';
import { IconCatalog } from '../packages/icons/src/index.ts';
import { expandInstances, resolveDocument, type IconGlyph, type LakarDocument } from '../packages/schema/src/index.ts';
import { generateCode, iconRefs, type CodegenFile, type CodegenTarget } from '../packages/codegen/src/index.ts';
import { boardViewport } from '../packages/render/src/index.ts';
import {
  addAsset,
  ASSET_BASE,
  browserInstalled,
  comparePngs,
  currentPage,
  freshPage,
  interFaces,
  OUT_DIR,
  render,
  start,
  stop,
} from '../packages/render/test/harness.ts';
import { DOC_CORPUS_ASSETS_DIR, loadDocCorpus } from './support/doc-corpus.ts';
import {
  cssModuleOrder,
  DEFAULT_INSTANCE_ID,
  dropPadding,
  exportPageHtml,
  fontFaceCss,
  PARITY_MAX_RATIO,
  PARITY_TOLERANCE,
  scopeCssModule,
  withinParity,
  withDefaultInstance,
  withoutMeshFills,
  withTokenValues,
} from './support/parity.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const React = require('react') as { createElement(type: unknown, props?: unknown): unknown };
const ReactServer = require('react-dom/server') as { renderToStaticMarkup(el: unknown): string };
const TW_DIR = dirname(fileURLToPath(import.meta.resolve('tailwindcss/index.css')));
/** Berkas ekspor ditulis di dalam repo agar `react` ter-resolve dan vitest mentransformasi TSX; dihapus afterAll. */
const WORK_DIR = join(root, 'tests', '.parity');
const PARITY_OUT = join(OUT_DIR, 'parity');

const TARGETS: readonly CodegenTarget[] = ['react-css', 'react-tailwind'];
const faces = [...[400, 500, 600, 700].flatMap((w) => interFaces(w, 'normal')), ...interFaces(400, 'italic')];
const catalog = IconCatalog.load();

const fixture = (name: string) => parseDocument(JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'codegen', name), 'utf8'))) as LakarDocument;
const docs: { label: string; doc: LakarDocument }[] = [
  ...loadDocCorpus().map((d) => ({ label: `v${d.version}-${d.name}`, doc: parseDocument(d.raw) as LakarDocument })),
  { label: 'komponen', doc: fixture('komponen.lakar.json') },
  { label: 'landing', doc: fixture('landing.lakar.json') },
  { label: 'interaksi', doc: fixture('interaksi.lakar.json') },
];
const docOf = (label: string) => docs.find((d) => d.label === label)!.doc;
const hasInstances = (d: LakarDocument) => JSON.stringify(d).includes('"componentId"');

/** Semua ikon di dokumen ter-ekspansi + yang diminta ekspor (varian enum), glyph dari katalog asli. */
function glyphsFor(doc: LakarDocument, nodeId: string, components: boolean): IconGlyph[] {
  const refs = new Map<string, { lib: string; icon: string }>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (o.type === 'icon' && typeof o.lib === 'string' && typeof o.icon === 'string') refs.set(`${o.lib}:${o.icon}`, { lib: o.lib, icon: o.icon });
      Object.values(o).forEach(walk);
    }
  };
  walk(expandInstances(doc));
  for (const r of iconRefs(doc, { nodeId, components })) refs.set(`${r.lib}:${r.icon}`, r);
  return catalog.glyphs([...refs.values()]);
}

const boardOf = (doc: LakarDocument, nodeId: string) => {
  const ex = expandInstances(doc);
  const has = (n: unknown): boolean =>
    !!n && typeof n === 'object' && ((n as { id?: unknown }).id === nodeId || ((n as { children?: unknown[] }).children ?? []).some(has));
  return ex.pages.flatMap((p) => p.children).find((b) => b.id === nodeId || has(b))!;
};

let seq = 0;
let exportPage: Page;

/** Tulis berkas ekspor ke direktori kerja baru (modul vitest di-cache per path, jadi tiap ekspor dapat folder sendiri). */
function writeExport(files: readonly CodegenFile[]): string {
  const dir = join(WORK_DIR, String(++seq).padStart(4, '0'));
  for (const f of files) {
    mkdirSync(dirname(join(dir, f.path)), { recursive: true });
    writeFileSync(join(dir, f.path), f.contents);
  }
  return dir;
}

/** CSS aplikasi untuk target CSS modules: tokens.css, lalu modul CSS (ter-scope) dalam urutan evaluasi impor. */
async function cssModulesCss(dir: string, files: readonly CodegenFile[], entry: string): Promise<string> {
  const byPath = new Map(files.map((f) => [f.path, f.contents]));
  let css = byPath.get('tokens.css') ?? '';
  for (const p of cssModuleOrder(files, entry)) {
    // Nama kelas ter-scope diambil dari modul CSS yang diimpor komponen (vitest), jadi markup dan CSS selaras.
    const styles = ((await import(pathToFileURL(join(dir, p)).href)) as { default: Record<string, string> }).default;
    css += `\n${scopeCssModule(byPath.get(p)!, (n) => styles[n]!)}`;
  }
  return css;
}

/** CSS aplikasi untuk target Tailwind: `@import "tailwindcss"` + theme.css, dikompilasi Tailwind v4 dengan kandidat dari pemindai oxide. */
async function tailwindCss(dir: string, files: readonly CodegenFile[]): Promise<string> {
  const byPath = new Map(files.map((f) => [f.path, f.contents]));
  const compiler = await compile('@import "tailwindcss";\n@import "./theme.css";\n', {
    base: dir,
    loadStylesheet: async (id, base) => {
      if (id === 'tailwindcss') return { path: join(TW_DIR, 'index.css'), base: TW_DIR, content: await readFile(join(TW_DIR, 'index.css'), 'utf8') };
      if (base === TW_DIR) return { path: join(TW_DIR, id), base: TW_DIR, content: await readFile(join(TW_DIR, id), 'utf8') };
      const rel = id.replace(/^\.\//, '');
      const content = byPath.get(rel);
      if (content === undefined) throw new Error(`stylesheet ${id} tidak ada di ekspor`);
      return { path: join(dir, rel), base: dir, content };
    },
  });
  const scanner = new Scanner({});
  const candidates = scanner.scanFiles(files.filter((f) => f.path.endsWith('.tsx')).map((f) => ({ content: f.contents, extension: 'tsx' })));
  return compiler.build(candidates);
}

const SETTLE_IN_PAGE = `async (faces) => {
  document.body.offsetHeight;
  await Promise.all(faces.map((f) => document.fonts.load(f.style + ' ' + f.weight + ' 16px ' + JSON.stringify(f.family)).catch(() => [])));
  const urls = new Set();
  for (const el of document.querySelectorAll('*')) {
    for (const m of getComputedStyle(el).backgroundImage.matchAll(/url\\("([^"]+)"\\)/g)) urls.add(m[1]);
    for (const m of getComputedStyle(el).maskImage.matchAll(/url\\("([^"]+)"\\)/g)) urls.add(m[1]);
  }
  const held = [...urls].map((u) => { const i = new Image(); i.src = u; return i; });
  await Promise.all([...held, ...document.images].map((i) => i.decode().catch(() => {})));
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => r()));
  await new Promise((r) => requestAnimationFrame(() => r()));
  window.__held = held;
  return [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family + ' ' + f.weight);
}`;

/** Render ekspor: CSS aplikasi + SSR komponen utama di halaman Chromium terpisah, screenshot elemen akar. */
async function renderExport(
  files: readonly CodegenFile[],
  target: CodegenTarget,
  viewport: { width: number; height: number },
  wrapperStyle?: string,
): Promise<Buffer> {
  const dir = writeExport(files);
  const entry = files[0]!.path;
  const css = target === 'react-css' ? await cssModulesCss(dir, files, entry) : await tailwindCss(dir, files);
  const mod = (await import(pathToFileURL(join(dir, entry)).href)) as { default: unknown };
  const body = ReactServer.renderToStaticMarkup(React.createElement(mod.default));
  const html = exportPageHtml({ css, fonts: fontFaceCss(faces), body, wrapperStyle });
  // Halaman lengkap disimpan di samping berkas ekspor untuk diagnosis (LAKAR_PARITY_KEEP=1 menyimpan folder kerja).
  writeFileSync(join(dir, 'index.html'), html);
  await exportPage.setViewportSize(viewport);
  await exportPage.setContent(html, { waitUntil: 'load' });
  const errors = (await exportPage.evaluate(`(${SETTLE_IN_PAGE})(${JSON.stringify(faces)})`)) as string[];
  expect(errors, 'font ekspor gagal dimuat').toEqual([]);
  const sel = wrapperStyle === undefined ? '#root > *' : '#wrap > *';
  return exportPage.locator(sel).first().screenshot({ type: 'png', scale: 'css', animations: 'disabled', caret: 'hide' });
}

/** True bila `nodeId` adalah master tersimpan (node dengan kunci `component`). */
function isMaster(doc: LakarDocument, nodeId: string): boolean {
  let hit = false;
  const walk = (v: unknown) => {
    if (hit || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(walk);
    const o = v as Record<string, unknown>;
    if (o.id === nodeId && o.component !== undefined) hit = true;
    else walk(o.children);
  };
  doc.pages.forEach((p) => walk(p.children));
  return hit;
}

/**
 * Render acuan (AD-6): board yang memuat `nodeId` lewat `renderBoard`; screenshot board atau node. Ekspor master
 * = komponen dengan props default, jadi acuannya instance default master itu (`withDefaultInstance`).
 */
async function renderReference(doc: LakarDocument, nodeId: string, icons: readonly IconGlyph[]): Promise<Buffer> {
  const board = boardOf(doc, nodeId);
  const master = isMaster(doc, nodeId);
  const ref = resolveDocument(withoutMeshFills(master ? withDefaultInstance(doc, nodeId) : doc));
  const { result, png } = await render(ref, board.id, faces, currentPage(), { icons });
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (board.id === nodeId) return png!;
  const target = master ? DEFAULT_INSTANCE_ID : nodeId;
  return currentPage().locator(`[data-lakar-id="${target}"]`).first().screenshot({ type: 'png', scale: 'css', animations: 'disabled', caret: 'hide' });
}

type Parity = { ratio: number; ok: boolean; reason?: string | undefined };

/** Bandingkan; gagal (kecuali regresi sengaja, `artifacts` false) → PNG acuan/ekspor/diff di `packages/render/test/out/parity/`. */
async function parity(label: string, ref: Buffer, exp: Buffer, artifacts = true): Promise<Parity> {
  // maxRatio 0: diff selalu dibuat bila ada piksel berbeda; lulus/gagal hanya ditentukan `withinParity` (< 1%).
  const r = await comparePngs(exp, ref, PARITY_TOLERANCE, 0);
  const ratio = r.ratio ?? 1;
  const ok = r.ratio !== undefined && withinParity(r.ratio);
  if (process.env.LAKAR_PARITY_LOG === '1') console.info(`paritas ${label}: ${((r.ratio ?? 1) * 100).toFixed(4)}%`);
  if (!ok && artifacts) {
    mkdirSync(PARITY_OUT, { recursive: true });
    const safe = label.replace(/[^A-Za-z0-9.-]+/g, '_');
    writeFileSync(join(PARITY_OUT, `${safe}.ref.png`), ref);
    writeFileSync(join(PARITY_OUT, `${safe}.export.png`), exp);
    if (r.diff) writeFileSync(join(PARITY_OUT, `${safe}.diff.png`), Buffer.from(r.diff, 'base64'));
  }
  return { ratio, ok, reason: r.reason };
}

type Case = { label: string; doc: LakarDocument; nodeId: string; target: CodegenTarget; components: boolean; wrapperStyle?: string };

type CaseResult = { parity: Parity; warnings: string[]; files: CodegenFile[]; ref: Buffer };

/** Satu kasus: render acuan, ekspor, render ekspor, bandingkan. `mutate` mengubah berkas ekspor sebelum dirender (regresi sengaja). */
async function runCase(c: Case, mutate?: (files: CodegenFile[]) => CodegenFile[]): Promise<CaseResult> {
  const icons = glyphsFor(c.doc, c.nodeId, c.components);
  const board = boardOf(c.doc, c.nodeId);
  const ref = await renderReference(c.doc, c.nodeId, icons);
  const out = generateCode(c.doc, { nodeId: c.nodeId, target: c.target, icons, assetBase: ASSET_BASE, components: c.components });
  const files = mutate ? mutate(out.files) : out.files;
  // Board hug: viewport awal sama dengan render acuan (tinggi akhir mengikuti isi).
  const exp = await renderExport(files, c.target, boardViewport(board), c.wrapperStyle);
  return { parity: await parity(c.label, ref, exp, !mutate && !regress.dropFramePadding), warnings: out.warnings.map((w) => `${w.code} ${w.nodeId ?? '-'}`), files: out.files, ref };
}

const failMessage = (c: Case, r: CaseResult) => `${c.label}: ${(r.parity.ratio * 100).toFixed(3)}% piksel berbeda (ambang < ${PARITY_MAX_RATIO * 100}%) ${r.parity.reason ?? ''}`;

/**
 * Ekspor node (master dan instance sebagai berkas utama): akar adalah anak flow, jadi dibungkus elemen yang meniru
 * parent-nya di board (arah flex, align, lebar konten). Acuan = screenshot node itu di render board.
 */
const PUSTAKA = 'display:flex;flex-direction:column;width:320px';
const BARIS_ATAS = 'display:flex;flex-direction:row;align-items:flex-start';
const nodeCases: Case[] = [
  { doc: 'landing', nodeId: 'MstLBtn1', wrapperStyle: PUSTAKA },
  { doc: 'landing', nodeId: 'MstLFea1', wrapperStyle: PUSTAKA },
  { doc: 'landing', nodeId: 'InsLDxB1', wrapperStyle: 'display:flex;flex-direction:row;align-items:center' },
  { doc: 'interaksi', nodeId: 'MstIntC1', wrapperStyle: BARIS_ATAS },
  { doc: 'interaksi', nodeId: 'MstIntR1', wrapperStyle: BARIS_ATAS },
  { doc: 'komponen', nodeId: 'MstKrt01', wrapperStyle: 'display:flex;flex-direction:column;width:928px' },
].flatMap((n) =>
  TARGETS.map((target) => ({ label: `${n.doc} node ${n.nodeId} ${target}`, doc: docOf(n.doc), nodeId: n.nodeId, target, components: true, wrapperStyle: n.wrapperStyle })),
);

/** Nilai token pengganti untuk uji "ubah token lalu ekspor ulang" (warna, spacing, radius, ukuran teks, per mode). */
const TOKEN_CHANGES = {
  'colors.brand': { value: '#DC2626', modes: { dark: '#F87171' } },
  'colors.card': { value: '#FFF7ED', modes: { dark: '#1C1917' } },
  'space.gap': { value: 40 },
  'space.section': { value: 96, modes: { dark: 40 } },
  'radius.card': { value: 4 },
  'font.size-hero': { value: 44, modes: { dark: 32 } },
};

const boardCases: Case[] = docs.flatMap(({ label, doc }) =>
  doc.pages
    .flatMap((p) => p.children)
    .flatMap((b) =>
      TARGETS.flatMap((target) =>
        (hasInstances(doc) ? [true, false] : [true]).map((components) => ({
          label: `${label} ${b.name} (${b.id}) ${target}${components ? '' : ' components:false'}`,
          doc,
          nodeId: b.id,
          target,
          components,
        })),
      ),
    ),
);

describe.skipIf(!browserInstalled)('codegen: paritas piksel ekspor terhadap render Chromium (R5)', () => {
  beforeAll(async () => {
    rmSync(WORK_DIR, { recursive: true, force: true });
    await start();
    for (const f of readdirSync(DOC_CORPUS_ASSETS_DIR).filter((n) => n.endsWith('.png'))) addAsset(readFileSync(join(DOC_CORPUS_ASSETS_DIR, f)));
    exportPage = await freshPage();
  }, 60_000);
  afterAll(async () => {
    await exportPage?.close().catch(() => {});
    await stop();
    if (process.env.LAKAR_PARITY_KEEP !== '1') rmSync(WORK_DIR, { recursive: true, force: true });
  });

  it.each(boardCases.map((c): [string, Case] => [c.label, c]))('board %s', async (_label, c) => {
    const r = await runCase(c);
    expect(r.parity.ok, failMessage(c, r)).toBe(true);
  }, 60_000);

  it.each(nodeCases.map((c): [string, Case] => [c.label, c]))('%s', async (_label, c) => {
    const r = await runCase(c);
    expect(r.parity.ok, failMessage(c, r)).toBe(true);
    expect(r.files[0]!.contents).toMatch(/^export function /m);
  }, 60_000);

  it.each(TARGETS)('interaksi prop (%s): setiap kombinasi open × detail × tone × arah × rata adalah pemakaian <Chip …/> dan lulus ambang', async (target) => {
    const c: Case = { label: `interaksi kombinasi ${target}`, doc: docOf('interaksi'), nodeId: 'BrdInt01', target, components: true };
    const r = await runCase(c);
    // Hanya master di canvas yang di-inline (tampil sebagai node tersimpan, bukan props default); semua instance
    // kombinasi, instance Baris, dan Chip bersarang di master Baris adalah pemakaian komponen.
    expect(r.warnings).toEqual(['instance-inlined MstIntC1', 'instance-inlined MstIntR1']);
    const main = r.files[0]!.contents;
    expect(main.match(/<Chip\b/g)?.length).toBe(25);
    expect(main.match(/<Baris\b/g)?.length).toBe(4);
    const chip = r.files.find((f) => f.path === 'components/Chip.tsx')!.contents;
    expect(chip).toContain('{open && (');
    expect(chip).toContain('{detail && (');
    expect(r.files.map((f) => f.path)).toEqual(
      target === 'react-css'
        ? ['Kombinasi.tsx', 'Kombinasi.module.css', 'components/Chip.tsx', 'components/Chip.module.css', 'components/Baris.tsx', 'components/Baris.module.css', 'tokens.css']
        : ['Kombinasi.tsx', 'components/Chip.tsx', 'components/Baris.tsx', 'tokens.css', 'theme.css'],
    );
    expect(r.parity.ok, failMessage(c, r)).toBe(true);
  }, 60_000);

  it.each(TARGETS.flatMap((t) => ['BrdLnd01', 'BrdLnd02'].map((b): [CodegenTarget, string] => [t, b])))(
    'landing (%s, %s): ubah nilai token lalu ekspor ulang tetap lulus; hanya berkas token yang berubah',
    async (target, nodeId) => {
      const base: Case = { label: `landing token asli ${nodeId} ${target}`, doc: docOf('landing'), nodeId, target, components: true };
      const changed: Case = { ...base, label: `landing token diubah ${nodeId} ${target}`, doc: withTokenValues(docOf('landing'), TOKEN_CHANGES) };
      const a = await runCase(base);
      const b = await runCase(changed);
      expect(a.parity.ok, failMessage(base, a)).toBe(true);
      expect(b.parity.ok, failMessage(changed, b)).toBe(true);
      // Perubahan token memang terlihat di acuan (bukan lulus karena tidak ada yang berubah).
      const seen = await comparePngs(a.ref, b.ref, PARITY_TOLERANCE, 0);
      expect(seen.ratio ?? 1).toBeGreaterThan(PARITY_MAX_RATIO);
      const tokenFiles = new Set(['tokens.css', 'theme.css']);
      const byPath = new Map(a.files.map((f) => [f.path, f.contents]));
      expect(b.files.map((f) => f.path)).toEqual(a.files.map((f) => f.path));
      for (const f of b.files) {
        if (tokenFiles.has(f.path)) continue;
        expect(f.contents, f.path).toBe(byPath.get(f.path));
      }
      expect(b.files.find((f) => f.path === 'tokens.css')!.contents).not.toBe(byPath.get('tokens.css'));
    },
    120_000,
  );

  it.each(TARGETS)('regresi sengaja di pemetaan css.ts yang dipakai codegen (%s: frameDecls tanpa padding) membuat paritas gagal', async (target) => {
    const c: Case = { label: `landing regresi pemetaan ${target}`, doc: docOf('landing'), nodeId: 'BrdLnd01', target, components: true };
    regress.dropFramePadding = true;
    try {
      const r = await runCase(c);
      expect(r.files.some((f) => /padding|\bp-\[/.test(f.contents))).toBe(false);
      expect(r.parity.ok).toBe(false);
      expect(r.parity.ratio).toBeGreaterThan(PARITY_MAX_RATIO);
    } finally {
      regress.dropFramePadding = false;
    }
  }, 60_000);

  it.each(TARGETS)('regresi sengaja di keluaran (%s: padding dibuang dari berkas) membuat paritas gagal', async (target) => {
    const c: Case = { label: `landing regresi padding ${target}`, doc: docOf('landing'), nodeId: 'BrdLnd01', target, components: true };
    let removed = 0;
    const r = await runCase(c, (files) => {
      const d = dropPadding(files);
      removed = d.removed;
      return d.files;
    });
    expect(removed).toBeGreaterThan(0);
    expect(r.parity.ok).toBe(false);
    expect(r.parity.ratio).toBeGreaterThan(PARITY_MAX_RATIO);
  }, 60_000);
});
