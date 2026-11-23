// Regresi check atas korpus dokumen (story LC-34/LC-35): setiap board di `tests/fixtures/docs/v<n>` dirender di
// Chromium (harness render, tanpa daemon), lalu `checkBoard` dijalankan atas hasil ukurnya. LC-34/LC-35 (warning)
// tidak boleh menambah error gerbang pada dokumen korpus.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findBoard, resolveDocument } from '../packages/schema/src/index.ts';
// Tes boleh memakai paket lewat path relatif (tests/ di luar arah dependensi paket).
import { parseDocument } from '../packages/core/src/index.ts';
import { checkBoard, glyphScan } from '../packages/check/src/index.ts';
import { addAsset, browserInstalled, interFaces, render, start, stop } from '../packages/render/test/harness.ts';
import { boardsOf, DOC_CORPUS_ASSETS_DIR, loadDocCorpus } from './support/doc-corpus.ts';
import { testLog } from './support/log.ts';

const faces = [...[400, 500, 600, 700].flatMap((w) => interFaces(w, 'normal')), ...interFaces(400, 'italic')];

const cases = loadDocCorpus().flatMap((d) => {
  const doc = resolveDocument(parseDocument(d.raw));
  return boardsOf(doc).map((b) => ({ label: `v${d.version}/${d.name} › ${b.page} › ${b.name} (${b.id})`, doc, boardId: b.id }));
});

describe.skipIf(!browserInstalled)('korpus dokumen: check setiap board (0 error LC-34/LC-35)', () => {
  beforeAll(async () => {
    await start();
    for (const f of readdirSync(DOC_CORPUS_ASSETS_DIR).filter((n) => n.endsWith('.png'))) addAsset(readFileSync(join(DOC_CORPUS_ASSETS_DIR, f)));
  }, 60_000);
  afterAll(stop);

  it('korpus punya board untuk dicek', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases.map((c): [string, (typeof cases)[number]] => [c.label, c]))('%s', async (label, c) => {
    const board = findBoard(c.doc, c.boardId)!;
    const { result } = await render(c.doc, c.boardId, faces, undefined, { allowGlyphs: glyphScan(board).allowGlyphs });
    expect(result.ok, `${label}: ${JSON.stringify(result)}`).toBe(true);
    if (!result.ok) return;
    const findings = checkBoard({ doc: c.doc, boardId: c.boardId, measure: result.measure, cap: false });
    const fresh = findings.filter((f) => f.rule === 'LC-34' || f.rule === 'LC-35');
    if (fresh.length) testLog(`[check-corpus] ${label}: ${fresh.map((f) => `${f.rule} ${f.nodeName} · ${f.detail}`).join(' | ')}`);
    // Korpus adalah fixture skema/render, bukan desain bersih: beberapa board sudah punya error aturan lama (LC-02a,
    // LC-02b, LC-04, LC-16; dicatat di Implementation Notes story). Yang ditegaskan: 0 error dari LC-34/LC-35.
    const errors = findings.filter((f) => f.level === 'error');
    const old = errors.filter((f) => f.rule !== 'LC-34' && f.rule !== 'LC-35');
    if (old.length) testLog(`[check-corpus] ${label}: error aturan lama ${old.map((f) => `${f.rule} ${f.nodeId}`).join(', ')}`);
    expect(errors.filter((f) => !old.includes(f)).map((f) => `${f.rule} ${f.nodeName} (${f.nodeId}) · ${f.detail}`), label).toEqual([]);
    // Penjaga false positive: korpus saat ini tanpa temuan LC-34/LC-35 sama sekali. Temuan baru di sini harus ditinjau
    // (cacat nyata di fixture → catat; false positive → perbaiki aturan), bukan langsung diterima.
    expect(fresh.map((f) => `${f.rule} ${f.nodeName} (${f.nodeId}) · ${f.detail}`), label).toEqual([]);
  }, 30_000);
});
