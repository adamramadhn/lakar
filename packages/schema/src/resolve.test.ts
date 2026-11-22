// `resolveDocument` (spine model-dokumen AD-10): untuk dokumen tanpa instance, hasil dan error identik dengan
// `resolveTokens`. Korpus dibaca lewat loader bersama; `parseDocument` dari core lewat path relatif (khusus tes).
import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../core/src/index.ts';
import { loadDocCorpus } from '../../../tests/support/doc-corpus.ts';
import { LakarDocument, LakarError, SCHEMA_VERSION, resolveDocument, resolveTokens, type LakarDocument as Doc } from './index.js';

const corpus = loadDocCorpus();

/** Error yang dilempar `fn` (wajib LakarError). */
function thrown(fn: () => unknown): LakarError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(LakarError);
    return e as LakarError;
  }
  return expect.unreachable('seharusnya melempar') as never;
}

const errShape = (e: LakarError) => ({ code: e.code, message: e.message, hint: e.hint });

describe('resolveDocument setara resolveTokens', () => {
  it('korpus tidak kosong', () => {
    expect(corpus.length).toBeGreaterThan(0);
  });

  it.each(corpus.map((d) => [`v${d.version}/${d.name}`, d] as const))('%s: hasil deep-equal', (_label, d) => {
    const doc = parseDocument(d.raw);
    const before = structuredClone(doc);
    expect(resolveDocument(doc)).toEqual(resolveTokens(doc));
    expect(doc, 'input tidak dimutasi').toEqual(before);
  });

  it('paksa mode: fixture v3 tema-mode dengan {mode:"dark"} sama dengan resolveTokens', () => {
    const d = corpus.find((x) => x.version === 3 && x.name === 'tema-mode');
    expect(d, 'fixture v3/tema-mode').toBeDefined();
    const doc = parseDocument(d!.raw);
    const forced = resolveDocument(doc, { mode: 'dark' });
    expect(forced).toEqual(resolveTokens(doc, { mode: 'dark' }));
    expect(forced).not.toEqual(resolveDocument(doc, { mode: 'light' }));
  });

  it('mode tak dikenal → SCHEMA_INVALID dengan kode, pesan, dan hint yang sama', () => {
    const d = corpus.find((x) => x.version === 3 && x.name === 'tema-mode')!;
    const doc = parseDocument(d.raw);
    const a = thrown(() => resolveDocument(doc, { mode: 'sepia' }));
    const b = thrown(() => resolveTokens(doc, { mode: 'sepia' }));
    expect(a.code).toBe('SCHEMA_INVALID');
    expect(errShape(a)).toEqual(errShape(b));
  });

  it('token tak dikenal → TOKEN_UNKNOWN dengan kode, pesan, dan hint yang sama', () => {
    const doc: Doc = LakarDocument.parse({
      schemaVersion: SCHEMA_VERSION,
      id: 'Dddddddd',
      rev: 0,
      tokens: {},
      pages: [
        {
          id: 'Pppppppp',
          name: 'P',
          children: [
            {
              type: 'board',
              id: 'Bbbbbbb1',
              name: 'B',
              x: 0,
              y: 0,
              width: 200,
              height: 200,
              screen: 'mobile',
              fills: [{ type: 'solid', color: { $token: 'colors.missing' } }],
              children: [],
            },
          ],
        },
      ],
    });
    const a = thrown(() => resolveDocument(doc));
    const b = thrown(() => resolveTokens(doc));
    expect(a.code).toBe('TOKEN_UNKNOWN');
    expect(errShape(a)).toEqual(errShape(b));
  });
});
