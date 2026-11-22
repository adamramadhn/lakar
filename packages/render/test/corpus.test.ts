// Tes render korpus dokumen (spine model-dokumen AD-3): setiap board di setiap fixture `tests/fixtures/docs/v<n>`
// dirender di Chromium setelah migrasi + resolve token, dan wajib `ok: true`. Tanpa golden piksel.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveTokens } from '@lakar/schema';
// Tes boleh memakai core lewat path relatif (manifest render TIDAK bergantung pada @lakar/core).
import { parseDocument } from '../../core/src/index.js';
import { boardsOf, DOC_CORPUS_ASSETS_DIR, loadDocCorpus } from '../../../tests/support/doc-corpus.ts';
import { addAsset, browserInstalled, interFaces, render, start, stop } from './harness.js';

const faces = [...[400, 500, 600, 700].flatMap((w) => interFaces(w, 'normal')), ...interFaces(400, 'italic')];

const cases = loadDocCorpus().flatMap((d) => {
  const doc = resolveTokens(parseDocument(d.raw));
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
});
