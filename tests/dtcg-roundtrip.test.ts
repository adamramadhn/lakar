// Round-trip token ↔ JSON W3C DTCG (epic adopsi-open-pencil story 9): untuk setiap dokumen korpus bertoken,
// `dtcgTokensJson` → `parseDtcgTokens` mengembalikan token, tipe, nilai, modes, dan `tokenModes` yang identik
// (lossless). Juga skenario impor file asing: mode + alias + entri tak didukung.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '../packages/core/src/index.ts';
import type { LakarDocument } from '../packages/schema/src/index.ts';
import { dtcgTokensJson, parseDtcgTokens } from '../packages/codegen/src/index.ts';
import { DOC_CORPUS_DIR, loadDocCorpus } from './support/doc-corpus.ts';

const corpus = loadDocCorpus().map((d) => ({ label: `v${d.version}-${d.name}`, doc: parseDocument(d.raw) as LakarDocument }));
const tokenized = corpus.filter((c) => Object.keys(c.doc.tokens ?? {}).length > 0);

const DTCG_FIXTURES = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'dtcg');

describe('dtcgTokensJson → parseDtcgTokens (round-trip lossless)', () => {
  it('korpus punya dokumen bertoken', () => {
    expect(tokenized.length).toBeGreaterThan(0);
  });

  it.each(tokenized.map((c) => [c.label, c.doc] as const))('%s: token + tokenModes identik, byte deterministik', (_label, doc) => {
    const json = dtcgTokensJson(doc);
    expect(dtcgTokensJson(doc)).toBe(json);
    const parsed = parseDtcgTokens(json);
    expect(parsed.skipped).toEqual([]);
    const rebuilt = Object.fromEntries(parsed.entries.map((e) => [e.token, { type: e.type, value: e.value, ...(e.modes ? { modes: e.modes } : {}) }]));
    expect(rebuilt).toEqual(doc.tokens ?? {});
    expect(parsed.tokenModes ?? doc.tokenModes ?? null).toEqual(doc.tokenModes ?? null);
    // Round-trip kedua: JSON impor → ekspor ulang = byte sama.
    const doc2 = { ...doc, tokens: rebuilt, ...(parsed.tokenModes ? { tokenModes: parsed.tokenModes } : {}) } as LakarDocument;
    expect(dtcgTokensJson(doc2)).toBe(json);
  });

  it('fixture modes-alias-unsupported: mode, alias ter-resolve, kolom alias, dan skipped tak dibuang', () => {
    const parsed = parseDtcgTokens(readFileSync(join(DTCG_FIXTURES, 'modes-alias-unsupported.json'), 'utf8'));
    expect(parsed.tokenModes).toEqual(['light', 'dark']);
    const byToken = new Map(parsed.entries.map((e) => [e.token, e]));
    expect(byToken.get('colors.bg')).toMatchObject({ type: 'color', value: '#ffffff', modes: { dark: '#0f0f0f' } });
    expect(byToken.get('colors.link')).toMatchObject({ type: 'color', value: '#ffffff', alias: '{colors.bg}', modes: { dark: '#0f0f0f' } });
    expect(byToken.get('radius.card')).toMatchObject({ type: 'radius', value: 16 });
    expect(byToken.get('type.weight-strong')).toMatchObject({ type: 'fontWeight', value: 800 });
    expect(parsed.skipped.map((s) => s.reason)).toEqual(['unknown-alias', 'unsupported-type']);
    expect(parsed.entries.length + parsed.skipped.length).toBeGreaterThan(0);
  });
});
