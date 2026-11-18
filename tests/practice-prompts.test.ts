// Prompt latihan beku (story 19): sha terkunci, bebas n-gram prompt golden A–E, bebas sumber terlarang C7, dan nama
// produknya tidak ada di golden-set. Prompt dibekukan sebelum skill diubah (anti-overfit).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CLOSING_SENTENCE,
  EFFECT_ID,
  EFFECT_PROMPTS_PATH,
  EFFECT_PROMPTS_SHA256,
  loadPracticePrompts,
  PRACTICE_PROMPTS_PATH,
  PRACTICE_PROMPTS_SHA256,
  practicePromptProblems,
  withoutClosing,
} from '../bench/src/practice/prompts.ts';
import { extractGoldenPrompt, FORBIDDEN_TOKENS, forbiddenPhrases, forbiddenSources, GOLDEN_SET_PATH, words } from '../bench/src/protocol.ts';
import { sha256 } from '../bench/src/sys.ts';

const ALLOW_MISSING = process.env.LAKAR_C7_ALLOW_MISSING_SOURCES === '1';
const hasGolden = existsSync(GOLDEN_SET_PATH);
const GOLDEN_IDS = ['A', 'B', 'C', 'D', 'E'];

const hits = (text: string, phrases: ReadonlySet<string>) => {
  const joined = ` ${words(text).join(' ')} `;
  return [...phrases].filter((p) => joined.includes(` ${p} `));
};

describe('prompt latihan beku', () => {
  const { prompts } = loadPracticePrompts();

  it('(a) sha256 prompts.json = konstanta beku; isi berbeda ditolak loader', () => {
    expect(sha256(readFileSync(PRACTICE_PROMPTS_PATH))).toBe(PRACTICE_PROMPTS_SHA256);
    expect(() => loadPracticePrompts(PRACTICE_PROMPTS_PATH, '0'.repeat(64))).toThrow(/prompt latihan berubah/);
    expect(prompts.map((p) => p.id)).toEqual(['P1', 'P2', 'P3', 'P4']);
    expect(practicePromptProblems(prompts)).toEqual([]);
    for (const p of prompts) expect(p.text.endsWith(` ${CLOSING_SENTENCE}`), p.id).toBe(true);
  });

  it('sumber golden-set ada (kecuali LAKAR_C7_ALLOW_MISSING_SOURCES=1)', () => {
    if (!ALLOW_MISSING) expect(hasGolden).toBe(true);
  });

  it.skipIf(!hasGolden)('(b) tanpa kalimat penutup baku: tidak ada n-gram 6 kata yang sama dengan prompt A–E', () => {
    const golden = readFileSync(GOLDEN_SET_PATH, 'utf8');
    const phrases = forbiddenPhrases(GOLDEN_IDS.map((id) => withoutClosing(extractGoldenPrompt(golden, id))));
    expect(phrases.size).toBeGreaterThan(100);
    for (const p of prompts) expect(hits(withoutClosing(p.text), phrases), p.id).toEqual([]);
    // Penjaga hidup: salinan sepotong prompt golden terdeteksi.
    const sample = withoutClosing(extractGoldenPrompt(golden, 'C')).split(' ').slice(3, 12).join(' ');
    expect(hits(`Pembuka ${sample} penutup`, phrases).length).toBeGreaterThan(0);
  });

  it.skipIf(!hasGolden)('(c) tanpa frasa Kriteria/Prosedur/Risiko golden dan tanpa token terlarang', () => {
    const golden = readFileSync(GOLDEN_SET_PATH, 'utf8');
    const phrases = forbiddenPhrases(forbiddenSources(golden, GOLDEN_IDS));
    expect(phrases.size).toBeGreaterThan(50);
    for (const p of prompts) {
      expect(hits(p.text, phrases), p.id).toEqual([]);
      for (const re of FORBIDDEN_TOKENS) expect(p.text.match(re)?.[0], `${p.id} ${re.source}`).toBeUndefined();
    }
  });

  it.skipIf(!hasGolden)('(d) nama produk latihan tidak ada di golden-set', () => {
    const golden = readFileSync(GOLDEN_SET_PATH, 'utf8').toLowerCase();
    for (const p of prompts) expect(golden.includes(p.name.toLowerCase()), p.name).toBe(false);
  });
});

// Seri efek (story 22): P5/P6 dibekukan dengan commit tersendiri sebelum mesin/skill/DESIGN.md diubah.
describe('prompt efek beku (P5/P6)', () => {
  const { prompts } = loadPracticePrompts(EFFECT_PROMPTS_PATH, EFFECT_PROMPTS_SHA256);
  const earlier = loadPracticePrompts().prompts;

  it('(a) sha256 effects/prompts.json = konstanta beku; id P5/P6; kalimat penutup baku', () => {
    expect(sha256(readFileSync(EFFECT_PROMPTS_PATH))).toBe(EFFECT_PROMPTS_SHA256);
    expect(() => loadPracticePrompts(EFFECT_PROMPTS_PATH, '0'.repeat(64))).toThrow(/prompt latihan berubah/);
    expect(() => loadPracticePrompts(EFFECT_PROMPTS_PATH)).toThrow(/prompt latihan berubah/);
    expect(prompts.map((p) => p.id)).toEqual(['P5', 'P6']);
    for (const p of prompts) expect(EFFECT_ID.test(p.id), p.id).toBe(true);
    expect(practicePromptProblems(prompts)).toEqual([]);
    for (const p of prompts) expect(p.text.endsWith(` ${CLOSING_SENTENCE}`), p.id).toBe(true);
    expect(prompts.map((p) => [p.kind, p.size])).toEqual([
      ['landing', { width: 1440, height: null }],
      ['mobile', { width: 390, height: 844 }],
    ]);
  });

  it('(b0) tanpa kalimat penutup baku: tidak ada n-gram 6 kata yang sama dengan P1–P4', () => {
    const phrases = forbiddenPhrases(earlier.map((p) => withoutClosing(p.text)));
    expect(phrases.size).toBeGreaterThan(100);
    for (const p of prompts) expect(hits(withoutClosing(p.text), phrases), p.id).toEqual([]);
    for (const p of prompts) expect(earlier.some((q) => q.name.toLowerCase() === p.name.toLowerCase()), p.name).toBe(false);
  });

  it.skipIf(!hasGolden)('(b) tanpa kalimat penutup baku: tidak ada n-gram 6 kata yang sama dengan prompt A–E', () => {
    const golden = readFileSync(GOLDEN_SET_PATH, 'utf8');
    const phrases = forbiddenPhrases(GOLDEN_IDS.map((id) => withoutClosing(extractGoldenPrompt(golden, id))));
    for (const p of prompts) expect(hits(withoutClosing(p.text), phrases), p.id).toEqual([]);
  });

  it.skipIf(!hasGolden)('(c) tanpa frasa Kriteria/Prosedur/Risiko golden dan tanpa token terlarang', () => {
    const golden = readFileSync(GOLDEN_SET_PATH, 'utf8');
    const phrases = forbiddenPhrases(forbiddenSources(golden, GOLDEN_IDS));
    for (const p of prompts) {
      expect(hits(p.text, phrases), p.id).toEqual([]);
      for (const re of FORBIDDEN_TOKENS) expect(p.text.match(re)?.[0], `${p.id} ${re.source}`).toBeUndefined();
    }
  });

  it.skipIf(!hasGolden)('(d) nama produk efek tidak ada di golden-set', () => {
    const golden = readFileSync(GOLDEN_SET_PATH, 'utf8').toLowerCase();
    for (const p of prompts) expect(golden.includes(p.name.toLowerCase()), p.name).toBe(false);
  });
});
