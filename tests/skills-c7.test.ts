// Penjaga C7 untuk isi skill (`packages/skills/skills/*.md`): tidak boleh memuat frasa dari sumber terlarang
// (Kriteria target/§Prosedur/§Risiko golden-set, DESIGN.md §Lampiran B, prompt bench) maupun token terlarang.
// Tes ini satu-satunya yang membaca sumber terlarang; isinya tidak dicetak kecuali frasa yang bocor.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { C7_CRITERIA_IDS, GOLDEN_SET_PATH, PROTOCOL_DIR, forbiddenPhrases, forbiddenSources, loadProtocol, words } from '../bench/src/protocol.ts';
import { EFFECT_PROMPTS_PATH, EFFECT_PROMPTS_SHA256, loadPracticePrompts, POLISH_PROMPTS_PATH, POLISH_PROMPTS_SHA256 } from '../bench/src/practice/prompts.ts';

const ROOT = join(import.meta.dirname, '..');
const SKILLS = join(ROOT, 'packages/skills/skills');
const DESIGN_PATH = join(ROOT, '_bmad-output/initiative-lakar/ux-lakar/DESIGN.md');
const ALLOW_MISSING = process.env.LAKAR_C7_ALLOW_MISSING_SOURCES === '1';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Prompt latihan beku (story 19: P1–P4; story 22: seri efek P5/P6; story 23: seri polish P7–P9): teksnya sumber terlarang, nama produknya token terlarang. */
const practice = [...loadPracticePrompts().prompts, ...loadPracticePrompts(EFFECT_PROMPTS_PATH, EFFECT_PROMPTS_SHA256).prompts, ...loadPracticePrompts(POLISH_PROMPTS_PATH, POLISH_PROMPTS_SHA256).prompts];

/** Token terlarang di skill (bahasa penilaian, nama produk prompt golden A–E dan latihan, label rubrik R1–R10). */
export const SKILL_FORBIDDEN_TOKENS: readonly RegExp[] = [
  /rubrik|\bjuri\b|kriteria|golden|\bskor|benchmark|pen\.dev|pencil|Lampiran B/i,
  /\bR(?:[1-9]|10)\b/,
  /\bKasku\b|\bGerak\b|\bArus\b|\bSinggah\b|\bGudangku\b/,
  new RegExp(practice.map((p) => `\\b${escapeRe(p.name)}\\b`).join('|'), 'i'),
];

type Sources = { texts: string[]; missing: string[] };

function loadSources(): Sources {
  const texts: string[] = [];
  const missing: string[] = [];
  if (existsSync(GOLDEN_SET_PATH)) texts.push(...forbiddenSources(readFileSync(GOLDEN_SET_PATH, 'utf8'), C7_CRITERIA_IDS));
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
  texts.push(...practice.map((p) => p.text));
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

  it('kedelapan belas file skill ada (8 domain + selection + opsional, tanpa polish)', () => {
    expect(skillFiles).toEqual(['accessibility.md', 'api.md', 'break-ui.md', 'color.md', 'core.md', 'export-code.md', 'icons.md', 'interface.md', 'landing.md', 'layout.md', 'mobile.md', 'review.md', 'selection.md', 'typography.md', 'ui.md', 'variants.md', 'webapp.md', 'writing.md']);
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
    for (const p of practice) {
      const practicePhrase = words(p.text).slice(4, 10).join(' ');
      expect(skillC7Problems(`Catatan: ${practicePhrase}.`, phrases), p.id).toContain(`frasa sumber terlarang: "${practicePhrase}"`);
    }
    expect(practice.map((p) => p.id)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9']);
    for (const t of ['skor akhir', 'lolos R3', 'naik di R9', 'R10 penuh', 'nilai juri', 'Kasku', 'Arus', 'Singgah', 'Gudangku', 'lihat pen.dev', ...practice.map((p) => `contoh ${p.name}`)]) expect(skillC7Problems(t, phrases).length, t).toBeGreaterThan(0);
    // Sumber terlarang mencakup kriteria dan prompt C–E (C7_CRITERIA_IDS = A–E).
    expect([...C7_CRITERIA_IDS]).toEqual(['A', 'B', 'C', 'D', 'E']);
    if (!sources.missing.length) {
      const protocol = loadProtocol();
      for (const id of ['C', 'D', 'E'] as const) {
        const promptPhrase = words(protocol.prompts[id]).slice(3, 9).join(' ');
        expect(skillC7Problems(`Catatan: ${promptPhrase}.`, phrases), id).toContain(`frasa sumber terlarang: "${promptPhrase}"`);
      }
      expect(skillC7Problems('Catatan: sidebar 248 dengan 6 8 item ikon satu aktif.', phrases).length).toBeGreaterThan(0);
    }
  });
});
