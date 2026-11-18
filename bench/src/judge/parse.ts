// Parser jawaban juri yang ketat: satu objek JSON {X:{…}, Y:{…}} dengan 6 kriteria, slop, emoji, fokus.
import { errorMessage } from '@lakar/schema';
import { JUDGE_CRITERIA, type JudgeCriterion } from './prompt.js';

export type CriterionScore = { skor: 0 | 1 | 2; bukti: string };
export type DesignVerdict = Record<JudgeCriterion, CriterionScore> & {
  slop: { jumlah: number; butir: string[] };
  emoji: number;
  fokus: string;
};
export type JudgeVerdict = { X: DesignVerdict; Y: DesignVerdict };

export type ParseResult = { ok: true; verdict: JudgeVerdict } | { ok: false; problems: string[] };

const DESIGN_KEYS = [...JUDGE_CRITERIA, 'slop', 'emoji', 'fokus'];

/** Teks JSON dari jawaban: utuh, atau isi satu blok ```json``` (tidak ada teks lain yang diterima). */
function jsonText(text: string): string {
  const t = text.trim();
  const fence = t.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/);
  return fence ? fence[1]!.trim() : t;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isCount = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;
const nonEmpty = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;

function exactKeys(o: Record<string, unknown>, keys: readonly string[], where: string, out: string[]): void {
  const have = Object.keys(o);
  const missing = keys.filter((k) => !have.includes(k));
  const extra = have.filter((k) => !keys.includes(k));
  if (missing.length) out.push(`${where}: kunci hilang ${missing.join(', ')}`);
  if (extra.length) out.push(`${where}: kunci tambahan ${extra.join(', ')}`);
}

function checkDesign(d: unknown, label: string, out: string[]): void {
  if (!isObj(d)) {
    out.push(`${label}: bukan objek`);
    return;
  }
  exactKeys(d, DESIGN_KEYS, label, out);
  for (const r of JUDGE_CRITERIA) {
    const c = d[r];
    if (!isObj(c)) {
      if (c !== undefined) out.push(`${label}.${r}: bukan objek`);
      continue;
    }
    exactKeys(c, ['skor', 'bukti'], `${label}.${r}`, out);
    if (c.skor !== 0 && c.skor !== 1 && c.skor !== 2) out.push(`${label}.${r}.skor harus 0, 1, atau 2 (dapat ${JSON.stringify(c.skor)})`);
    if (!nonEmpty(c.bukti)) out.push(`${label}.${r}.bukti kosong`);
  }
  const s = d.slop;
  if (isObj(s)) {
    exactKeys(s, ['jumlah', 'butir'], `${label}.slop`, out);
    if (!isCount(s.jumlah)) out.push(`${label}.slop.jumlah harus bilangan bulat ≥ 0`);
    if (!Array.isArray(s.butir) || !s.butir.every(nonEmpty)) out.push(`${label}.slop.butir harus array string tidak kosong`);
    else if (isCount(s.jumlah) && s.butir.length !== s.jumlah) out.push(`${label}.slop.butir (${s.butir.length}) ≠ slop.jumlah (${s.jumlah})`);
  } else if (s !== undefined) out.push(`${label}.slop: bukan objek`);
  if (d.emoji !== undefined && !isCount(d.emoji)) out.push(`${label}.emoji harus bilangan bulat ≥ 0`);
  if (d.fokus !== undefined && !nonEmpty(d.fokus)) out.push(`${label}.fokus kosong`);
}

/** Validasi ketat jawaban juri (teks `result`). */
export function parseJudgeOutput(text: string | undefined): ParseResult {
  if (text === undefined || !text.trim()) return { ok: false, problems: ['jawaban kosong'] };
  let v: unknown;
  try {
    v = JSON.parse(jsonText(text));
  } catch (e) {
    return { ok: false, problems: [`bukan JSON: ${errorMessage(e)}`] };
  }
  const problems: string[] = [];
  if (!isObj(v)) return { ok: false, problems: ['akar JSON bukan objek'] };
  exactKeys(v, ['X', 'Y'], 'akar', problems);
  checkDesign(v.X, 'X', problems);
  checkDesign(v.Y, 'Y', problems);
  return problems.length ? { ok: false, problems } : { ok: true, verdict: v as JudgeVerdict };
}
