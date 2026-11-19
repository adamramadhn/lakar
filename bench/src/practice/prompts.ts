// Prompt latihan (story 19): empat prompt non-A–E untuk mengiterasi skill tanpa menyentuh prompt golden (C7).
// Dibekukan sebelum skill diubah dan sebelum run apa pun: sha256 `bench/practice/prompts.json` dikunci di kode, dan loader
// menolak isi yang berbeda (anti-overfit: prompt tidak diubah setelah melihat hasil).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BENCH_ROOT } from '../protocol.js';
import type { BoardSpec } from '../lakar/run.js';
import { sha256 } from '../sys.js';

export const PRACTICE_DIR = join(BENCH_ROOT, 'practice');
export const PRACTICE_PROMPTS_PATH = join(PRACTICE_DIR, 'prompts.json');
/** sha256 `bench/practice/prompts.json` yang dibekukan (jangan diubah setelah iterasi 1 dimulai). */
export const PRACTICE_PROMPTS_SHA256 = '582c5d117b05c93dff3b2335d0eb55f24b499e261ebc453c65eaaf32a453a1da';
/** Kalimat penutup baku prompt golden; semua prompt latihan diakhiri kalimat ini. */
export const CLOSING_SENTENCE =
  'Bahasa Indonesia. Kualitas setara desainer produk senior: hierarki tipografi jelas, spacing konsisten (grid 8px), kontras baik, auto/flex layout.';
export const PRACTICE_ID = /^P[1-9]$/;

// Seri efek (story 22): dua prompt efek visual (P5 landing, P6 mobile), dibekukan dengan commit tersendiri sebelum mesin,
// skill, atau DESIGN.md diubah. Loader yang sama (`loadPracticePrompts(path, sha)`) menolak isi lain.
export const EFFECT_PROMPTS_PATH = join(PRACTICE_DIR, 'effects', 'prompts.json');
/** sha256 `bench/practice/effects/prompts.json` yang dibekukan (jangan diubah setelah iterasi 1 seri efek dimulai). */
export const EFFECT_PROMPTS_SHA256 = '5f0c23a7fb411f4fcf15e3f88f2e2f7b0f0f6b64f54d955e15fe22ecc834e441';
/** Id prompt seri efek. */
export const EFFECT_ID = /^P[56]$/;

// Seri polish (story 23): tiga prompt hold-out (P7 mobile, P8 dashboard, P9 landing) dengan baris daftar berstatus,
// dibekukan dengan commit tersendiri sebelum skill, check, atau render diubah (iterasi 1 = baseline skill lama).
export const POLISH_PROMPTS_PATH = join(PRACTICE_DIR, 'polish', 'prompts.json');
/** sha256 `bench/practice/polish/prompts.json` yang dibekukan (jangan diubah setelah iterasi 1 seri polish dimulai). */
export const POLISH_PROMPTS_SHA256 = 'b41ba79e9ca6818f388da5bd9a1718f6899a631c95ca360a8f60e48a7a2dd036';
/** Id prompt seri polish. */
export const POLISH_ID = /^P[789]$/;

export type PracticeKind = 'landing' | 'mobile' | 'dashboard';
export type PracticePrompt = { id: string; name: string; kind: PracticeKind; text: string; size: BoardSpec };

/** Validasi bentuk (murni). */
export function practicePromptProblems(list: unknown): string[] {
  if (!Array.isArray(list) || !list.length) return ['prompts.json harus array tidak kosong'];
  const out: string[] = [];
  const ids = new Set<string>();
  for (const [i, p] of list.entries()) {
    const at = `prompt[${i}]`;
    if (!p || typeof p !== 'object') {
      out.push(`${at}: bukan objek`);
      continue;
    }
    const x = p as Record<string, unknown>;
    if (typeof x.id !== 'string' || !PRACTICE_ID.test(x.id)) out.push(`${at}: id ${JSON.stringify(x.id)} tidak cocok ${PRACTICE_ID.source}`);
    else if (ids.has(x.id)) out.push(`${at}: id ${x.id} ganda`);
    else ids.add(x.id);
    if (typeof x.name !== 'string' || !x.name.trim()) out.push(`${at}: name kosong`);
    if (!['landing', 'mobile', 'dashboard'].includes(x.kind as string)) out.push(`${at}: kind ${JSON.stringify(x.kind)} tidak dikenal`);
    if (typeof x.text !== 'string' || !x.text.endsWith(` ${CLOSING_SENTENCE}`)) out.push(`${at}: text harus diakhiri kalimat penutup baku`);
    const s = x.size as Record<string, unknown> | undefined;
    if (!s || typeof s.width !== 'number' || !(s.height === null || typeof s.height === 'number')) out.push(`${at}: size {width, height|null} tidak valid`);
    if (typeof x.name === 'string' && typeof x.text === 'string' && !x.text.includes(`"${x.name}"`)) out.push(`${at}: nama produk tidak ada di text`);
  }
  return out;
}

/** Muat prompt latihan; sha ≠ beku atau bentuk salah → throw (sebelum spawn apa pun). */
export function loadPracticePrompts(path = PRACTICE_PROMPTS_PATH, frozenSha = PRACTICE_PROMPTS_SHA256): { prompts: PracticePrompt[]; sha256: string } {
  const raw = readFileSync(path);
  const sha = sha256(raw);
  if (sha !== frozenSha) throw new Error(`prompt latihan berubah: sha256 ${path} ${sha} ≠ beku ${frozenSha}`);
  const list = JSON.parse(raw.toString('utf8')) as unknown;
  const problems = practicePromptProblems(list);
  if (problems.length) throw new Error(`prompt latihan tidak valid: ${problems.join('; ')}`);
  return { prompts: list as PracticePrompt[], sha256: sha };
}

/** Teks prompt tanpa kalimat penutup baku (untuk penjaga n-gram terhadap prompt golden). */
export function withoutClosing(text: string): string {
  return text.endsWith(CLOSING_SENTENCE) ? text.slice(0, -CLOSING_SENTENCE.length).trimEnd() : text;
}
