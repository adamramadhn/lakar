// Penjaga C7 untuk isi skill (`packages/skills/skills/*.md`): tidak boleh memuat frasa dari sumber terlarang
// (Kriteria target/§Prosedur/§Risiko golden-set, DESIGN.md §Lampiran B, prompt bench) maupun token terlarang.
// Tes ini satu-satunya yang membaca sumber terlarang; isinya tidak dicetak kecuali frasa yang bocor.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GOLDEN_SET_PATH, PROTOCOL_DIR, forbiddenPhrases, forbiddenSources, loadProtocol, words } from '../bench/src/protocol.ts';

const ROOT = join(import.meta.dirname, '..');
const SKILLS = join(ROOT, 'packages/skills/skills');
const DESIGN_PATH = join(ROOT, '_bmad-output/initiative-lakar/ux-lakar/DESIGN.md');
const ALLOW_MISSING = process.env.LAKAR_C7_ALLOW_MISSING_SOURCES === '1';

/** Token terlarang di skill (bahasa penilaian, nama produk prompt, label rubrik). */
export const SKILL_FORBIDDEN_TOKENS: readonly RegExp[] = [
  /rubrik|\bjuri\b|kriteria|golden|\bskor|benchmark|pen\.dev|pencil|Lampiran B/i,
  /\bR[1-8]\b/,
  /\bKasku\b|\bGerak\b/,
];

type Sources = { texts: string[]; missing: string[] };

function loadSources(): Sources {
  const texts: string[] = [];
  const missing: string[] = [];
  if (existsSync(GOLDEN_SET_PATH)) texts.push(...forbiddenSources(readFileSync(GOLDEN_SET_PATH, 'utf8'), ['A', 'B']));
  else missing.push(GOLDEN_SET_PATH);
  if (existsSync(DESIGN_PATH)) {
    const lines = readFileSync(DESIGN_PATH, 'utf8').split('\n');
    const i = lines.findIndex((l) => l.startsWith('## Lampiran B'));
    if (i < 0) missing.push(`${DESIGN_PATH} (## Lampiran B)`);
    else texts.push(...lines.slice(i).filter((l) => l.trim()));
  } else missing.push(DESIGN_PATH);
  const promptsPath = join(PROTOCOL_DIR, 'prompts.json');
  if (existsSync(promptsPath)) texts.push(...Object.values(loadProtocol().prompts).filter((p): p is string => typeof p === 'string'));
  else missing.push(promptsPath);
  return { texts, missing };
}

/** Masalah C7 pada `text`: frasa sumber yang muncul + token terlarang. */
export function skillC7Problems(text: string, phrases: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const joined = ` ${words(text).join(' ')} `;
  for (const p of phrases) if (joined.includes(` ${p} `)) problems.push(`frasa sumber terlarang: "${p}"`);
  for (const re of SKILL_FORBIDDEN_TOKENS) {
    const m = text.match(re);
    if (m) problems.push(`token terlarang: "${m[0]}"`);
  }
  return problems;
}

const sources = loadSources();
if (sources.missing.length && ALLOW_MISSING) {
  console.warn(`[skills-c7] LAKAR_C7_ALLOW_MISSING_SOURCES=1: sumber C7 tidak ada, cek frasa dilewati untuk: ${sources.missing.join(', ')}`);
}
const phrases = forbiddenPhrases(sources.texts);
const skillFiles = existsSync(SKILLS) ? readdirSync(SKILLS).filter((f) => f.endsWith('.md')).sort() : [];

describe('C7: isi skill bebas sumber terlarang', () => {
  it('semua sumber terlarang ada (kecuali LAKAR_C7_ALLOW_MISSING_SOURCES=1)', () => {
    if (!ALLOW_MISSING) expect(sources.missing).toEqual([]);
    if (!sources.missing.length) expect(phrases.size).toBeGreaterThan(50);
  });

  it('kelima file skill ada', () => {
    expect(skillFiles).toEqual(['api.md', 'core.md', 'icons.md', 'landing.md', 'mobile.md']);
  });

  it.each(skillFiles)('%s tanpa frasa sumber dan token terlarang', (f) => {
    const problems = skillC7Problems(readFileSync(join(SKILLS, f), 'utf8'), phrases);
    expect(problems.map((p) => `${f}: ${p}`)).toEqual([]);
  });

  it('penjaga hidup: n-gram sumber dan token terlarang di teks sintetis terdeteksi', () => {
    // Tanpa sumber sama sekali (hanya mungkin dengan LAKAR_C7_ALLOW_MISSING_SOURCES=1) cek frasa tidak bisa dibuktikan; token tetap dicek.
    if (phrases.size > 0) {
      const [sample] = [...phrases].filter((p) => p.split(' ').length >= 6);
      expect(sample).toBeDefined();
      const synthetic = `Pembuka biasa. ${sample!.toUpperCase()}. Penutup biasa.`;
      expect(skillC7Problems(synthetic, phrases)).toContain(`frasa sumber terlarang: "${sample}"`);
    } else expect(ALLOW_MISSING).toBe(true);
    expect(skillC7Problems('teks netral tentang kopi', phrases)).toEqual([]);
    for (const t of ['skor akhir', 'lolos R3', 'nilai juri', 'Kasku', 'lihat pen.dev']) expect(skillC7Problems(t, phrases).length, t).toBeGreaterThan(0);
  });
});
