// Tes render korpus dokumen (spine model-dokumen AD-3): setiap board di setiap fixture `tests/fixtures/docs/v<n>`
// dirender di Chromium setelah migrasi + resolveDocument (ekspansi instance + token), dan wajib `ok: true`. Tanpa golden piksel.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveDocument, type ResolvedFrameNode } from '@lakar/schema';
import { vectorToSvg } from '../src/svg.js';
// Tes boleh memakai core lewat path relatif (manifest render TIDAK bergantung pada @lakar/core).
import { parseDocument } from '../../core/src/index.js';
import { boardsOf, DOC_CORPUS_ASSETS_DIR, loadDocCorpus } from '../../../tests/support/doc-corpus.ts';
import { addAsset, browserInstalled, comparePngs, currentPage, interFaces, render, start, stop } from './harness.js';

const SVG_FIXTURES = join(import.meta.dirname, '..', '..', '..', 'tests', 'fixtures', 'svg', 'ikon-vektor');

const faces = [...[400, 500, 600, 700].flatMap((w) => interFaces(w, 'normal')), ...interFaces(400, 'italic')];

const cases = loadDocCorpus().flatMap((d) => {
  const doc = resolveDocument(parseDocument(d.raw));
  return boardsOf(doc).map((b) => ({ label: `v${d.version}/${d.name} › ${b.page} › ${b.name} (${b.id})`, doc, boardId: b.id }));
});

describe.skipIf(!browserInstalled)('korpus dokumen: render setiap board', () => {
  beforeAll(async () => {
    await start();
    for (const f of readdirSync(DOC_CORPUS_ASSETS_DIR).filter((n) => n.endsWith('.png'))) {
      const id = addAsset(readFileSync(join(DOC_CORPUS_ASSETS_DIR, f)));
      // Nama file aset = sha256 isinya; fixture merujuknya lewat assetId.
      expect(`${id}.png`, `aset korpus ${f}`).toBe(f);
    }
  }, 60_000);
  afterAll(stop);

  it('korpus punya board untuk dirender', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases.map((c): [string, (typeof cases)[number]] => [c.label, c]))('%s', async (label, c) => {
    const { result } = await render(c.doc, c.boardId, faces);
    expect(result.ok, `${label}: ${JSON.stringify(result)}`).toBe(true);
  }, 30_000);

  it('v5 komponen: isi instance dirender dengan data-lakar-id alamat komposit (AD-12)', async () => {
    const c = cases.find((x) => x.label.startsWith('v5/komponen-kartu'))!;
    const { result } = await render(c.doc, c.boardId, faces);
    expect(result.ok).toBe(true);
    const ids = await currentPage().locator('[data-lakar-id]').evaluateAll((els, attr) => els.map((e) => e.getAttribute(attr)), 'data-lakar-id');
    expect(ids).toEqual(expect.arrayContaining(['InsCard1', 'InsCard1/TxtCard1', 'InsCard1/InsBadg0/TxtBadg1', 'TxtSlot1', 'InsBadg2/TxtBadg1']));
    expect(ids).not.toContain('InsCard2/InsBadg0');
  }, 30_000);

  // v6 vektor (AD-14): ikon dirender sama dengan SVG sumbernya, dan ekspor `vectorToSvg` dirender sama dengan Lakar.
  const v6 = () => cases.filter((x) => x.label.startsWith('v6/ikon-vektor'));
  /** Render SVG mentah di kotak putih ukuran board, screenshot elemennya. */
  const renderSvg = async (svg: string, w: number, h: number): Promise<Buffer> => {
    const p = currentPage();
    await p.setViewportSize({ width: w, height: h });
    await p.evaluate(
      ([markup, ww, hh]) => {
        const root = document.getElementById('root')!;
        root.innerHTML = `<div id="svg-ref" style="width:${ww}px;height:${hh}px;background:#FFFFFF;overflow:hidden">${markup}</div>`;
        const s = root.querySelector('svg');
        if (s) s.style.display = 'block';
      },
      [svg, w, h] as const,
    );
    return p.locator('#svg-ref').screenshot({ type: 'png', scale: 'css', animations: 'disabled' });
  };
  const PARITY_TOL = 24;
  const PARITY_MAX = 0.01;

  it.each([
    ['BrdBel01', 'lonceng'],
    ['BrdCin01', 'cincin'],
    ['BrdZig01', 'zigzag'],
  ])('v6 vektor: board %s dirender sama dengan SVG sumber %s.svg', async (boardId, file) => {
    const c = v6().find((x) => x.boardId === boardId)!;
    const { result, png } = await render(c.doc, c.boardId, faces);
    expect(result.ok).toBe(true);
    const source = readFileSync(join(SVG_FIXTURES, `${file}.svg`), 'utf8');
    const ref = await renderSvg(source, 96, 96);
    const r = await comparePngs(png!, ref, PARITY_TOL, PARITY_MAX);
    expect(r.ok, `${file}: ${r.reason ?? ''} rasio ${r.ratio}`).toBe(true);
  }, 30_000);

  it.each(['BrdBel01', 'BrdCin01', 'BrdZig01', 'BrdLen01'])('v6 vektor: ekspor vectorToSvg frame di board %s dirender sama dengan Lakar', async (boardId) => {
    const c = v6().find((x) => x.boardId === boardId)!;
    const { result, png } = await render(c.doc, c.boardId, faces);
    expect(result.ok).toBe(true);
    const board = c.doc.pages.flatMap((p) => p.children).find((b) => b.id === boardId)!;
    const frame = board.children[0] as ResolvedFrameNode;
    const out = vectorToSvg(frame);
    expect(out.dropped).toEqual([]);
    // Setiap atribut bertipe dan setiap entri `svg` fixture keluar lagi di SVG ekspor (AC story).
    const TYPED = { fillRule: 'fill-rule', strokeLinecap: 'stroke-linecap', strokeLinejoin: 'stroke-linejoin', strokeMiterlimit: 'stroke-miterlimit', strokeDasharray: 'stroke-dasharray' } as const;
    for (const p of frame.children as Record<string, unknown>[]) {
      for (const [prop, attr] of Object.entries(TYPED)) if (p[prop] !== undefined) expect(out.svg, `${String(p.id)} ${attr}`).toContain(` ${attr}="`);
      if (p.fillRule !== undefined) expect(out.svg).toContain(`fill-rule="${String(p.fillRule)}"`);
      if (p.strokeLinecap !== undefined) expect(out.svg).toContain(`stroke-linecap="${String(p.strokeLinecap)}"`);
      if (p.strokeLinejoin !== undefined) expect(out.svg).toContain(`stroke-linejoin="${String(p.strokeLinejoin)}"`);
      if (p.strokeMiterlimit !== undefined) expect(out.svg).toContain(`stroke-miterlimit="${String(p.strokeMiterlimit)}"`);
      for (const key of Object.keys((p.svg as object | undefined) ?? {})) expect(out.svg, `${String(p.id)} svg ${key}`).toContain(` ${key}="`);
    }
    const r = await comparePngs(png!, await renderSvg(out.svg, 96, 96), PARITY_TOL, PARITY_MAX);
    expect(r.ok, `${boardId}: ${r.reason ?? ''} rasio ${r.ratio}\n${out.svg}`).toBe(true);
  }, 30_000);
});
