// Agregasi skor juri, gerbang G0 Lakar, dan keputusan sementara per prompt (DESIGN.md Lampiran B). Murni.
import { median } from '../stats.js';
import type { JudgeRepRecord, Tool } from '../judge/run.js';
import { JUDGE_CRITERIA, type JudgeCriterion } from '../judge/prompt.js';

export const TOOLS: readonly Tool[] = ['lakar', 'pendev'];
export const TOOL_LABEL: Record<Tool, string> = { lakar: 'Lakar', pendev: 'pen.dev' };
/** Rentang > 1 wajib diperiksa Adam. */
export const RANGE_FLAG = 1;
export const TIME_GATE_FACTOR = 1.5;

export type Agg = { values: number[]; median: number | undefined; range: number | undefined; flag: boolean };
export type CriterionAgg = Agg & { evidence: { rep: number; skor: number; bukti: string }[] };
export type ToolScore = {
  criteria: Record<JudgeCriterion, CriterionAgg>;
  /** Jumlah median 6 kriteria (undefined bila tidak ada ulangan valid). */
  total: number | undefined;
  slop: Agg & { items: { rep: number; butir: string[] }[] };
  emoji: Agg;
  focus: { rep: number; fokus: string }[];
};
export type PromptScore = { prompt: string; validReps: number; reps: JudgeRepRecord[]; tools: Record<Tool, ToolScore> };

function agg(values: number[]): Agg {
  const range = values.length ? Math.max(...values) - Math.min(...values) : undefined;
  return { values, median: median(values), range, flag: range !== undefined && range > RANGE_FLAG };
}

/** Agregasi per kriteria per alat dari ulangan `ok` (urut ulangan; label X/Y sudah dipetakan ke alat). */
export function aggregateScores(prompt: string, reps: readonly JudgeRepRecord[]): PromptScore {
  const ok = reps.filter((r) => r.status === 'ok' && r.verdict).sort((a, b) => a.rep - b.rep);
  const tools = {} as Record<Tool, ToolScore>;
  for (const tool of TOOLS) {
    const views = ok.map((r) => ({ rep: r.rep, v: r.verdict![r.mapping.X === tool ? 'X' : 'Y'] }));
    const criteria = {} as Record<JudgeCriterion, CriterionAgg>;
    for (const c of JUDGE_CRITERIA) {
      criteria[c] = { ...agg(views.map((x) => x.v[c].skor)), evidence: views.map((x) => ({ rep: x.rep, skor: x.v[c].skor, bukti: x.v[c].bukti })) };
    }
    const medians = JUDGE_CRITERIA.map((c) => criteria[c].median);
    tools[tool] = {
      criteria,
      total: medians.every((m) => m !== undefined) ? medians.reduce((s, m) => s! + m!, 0) : undefined,
      slop: { ...agg(views.map((x) => x.v.slop.jumlah)), items: views.map((x) => ({ rep: x.rep, butir: x.v.slop.butir })) },
      emoji: agg(views.map((x) => x.v.emoji)),
      focus: views.map((x) => ({ rep: x.rep, fokus: x.v.fokus })),
    };
  }
  return { prompt, validReps: ok.length, reps: [...reps], tools };
}

export type GateInput = {
  promptId: string;
  /** `summary.gate` layout_check harness (undefined = tidak ada hasil). */
  layoutGate: number | undefined;
  /** Masalah ukuran board (kosong = sesuai). */
  sizeProblems: string[];
  wallMs: number | undefined;
  baselineMedianMs: number | undefined;
};
export type GateResult = { ok: boolean; reasons: string[]; timeRatio: number | undefined };

/** Gerbang G0 Lakar (otomatis): layout_check gate = 0, ukuran board, waktu ≤ 1,5 × median baseline. R3/R7 tidak dihitung di G0. */
export function lakarGate(g: GateInput): GateResult {
  const reasons: string[] = [];
  if (g.layoutGate === undefined) reasons.push('layout_check tidak tersedia');
  else if (g.layoutGate > 0) reasons.push(`layout_check gate = ${g.layoutGate}`);
  reasons.push(...g.sizeProblems.map((p) => `ukuran: ${p}`));
  const timeRatio = g.wallMs !== undefined && g.baselineMedianMs ? g.wallMs / g.baselineMedianMs : undefined;
  if (timeRatio === undefined) reasons.push('waktu tidak terukur');
  else if (timeRatio > TIME_GATE_FACTOR) reasons.push(`waktu ${(g.wallMs! / 1000).toFixed(1)} dtk > ${TIME_GATE_FACTOR} × baseline ${(g.baselineMedianMs! / 1000).toFixed(1)} dtk (rasio ${timeRatio.toFixed(2)})`);
  return { ok: reasons.length === 0, reasons, timeRatio };
}

export const NO_VALID_REPS = 'tidak ada ulangan juri yang valid';

export type Decision = 'Setara' | 'Lebih baik' | 'Kalah' | 'tidak dapat dinilai';

export type DecisionInput = {
  gate: GateResult;
  lakarRunOk: boolean;
  pendevRunOk: boolean;
  score: Pick<PromptScore, 'validReps' | 'tools'> | undefined;
};

/** Keputusan sementara (Lampiran B). Run Lakar gagal → Kalah; run pen.dev gagal → tidak dapat dinilai. */
export function decide(d: DecisionInput): { decision: Decision; why: string } {
  if (!d.lakarRunOk) return { decision: 'Kalah', why: 'run Lakar gagal' };
  // Gerbang Lakar tidak bergantung pada pen.dev: gerbang gagal → Kalah walau run pen.dev juga gagal.
  if (!d.gate.ok) return { decision: 'Kalah', why: `gerbang gagal: ${d.gate.reasons.join('; ')}` };
  if (!d.pendevRunOk) return { decision: 'tidak dapat dinilai', why: 'run pen.dev gagal' };
  if (!d.score || d.score.validReps === 0) return { decision: 'tidak dapat dinilai', why: NO_VALID_REPS };
  const L = d.score.tools.lakar;
  const P = d.score.tools.pendev;
  if (L.total === undefined || P.total === undefined) return { decision: 'tidak dapat dinilai', why: 'total skor tidak lengkap' };
  const zeroVsTwo = JUDGE_CRITERIA.filter((c) => L.criteria[c].median === 0 && P.criteria[c].median === 2);
  if (L.total >= P.total + 2) return { decision: 'Lebih baik', why: `lolos gerbang, total ${L.total} ≥ ${P.total} + 2` };
  if (L.total >= P.total - 1 && zeroVsTwo.length === 0) return { decision: 'Setara', why: `lolos gerbang, total ${L.total} ≥ ${P.total} − 1, tanpa R Lakar 0 vs pen.dev 2` };
  return {
    decision: 'Kalah',
    why: zeroVsTwo.length ? `${zeroVsTwo.join(', ')}: Lakar 0 sementara pen.dev 2` : `total ${L.total} < ${P.total} − 1`,
  };
}

export type G0Decision = 'lolos' | 'gagal' | 'tidak dapat diputuskan';
/** Prompt yang wajib ada di putaran G0 (Notes epic: hanya A dan B). */
export const G0_PROMPTS: readonly string[] = ['A', 'B'];
const G0_PASS: readonly Decision[] = ['Setara', 'Lebih baik'];

/**
 * Keputusan G0 sementara (murni), sampai Adam mengonfirmasi: putaran `dibatalkan` → tidak dapat diputuskan;
 * ada prompt Kalah → gagal; A dan B sama-sama Setara/Lebih baik → lolos; selebihnya → tidak dapat diputuskan.
 */
export function decideG0(
  results: readonly { prompt: string; decision: { decision: Decision; why: string } }[],
  roundStatus: 'lengkap' | 'tidak lengkap' | 'dibatalkan',
): { decision: G0Decision; why: string } {
  if (roundStatus === 'dibatalkan') return { decision: 'tidak dapat diputuskan', why: 'putaran dibatalkan' };
  const lost = results.filter((r) => r.decision.decision === 'Kalah');
  if (lost.length) return { decision: 'gagal', why: `Kalah di prompt ${lost.map((r) => r.prompt).join(', ')}` };
  const byPrompt = new Map(results.map((r) => [r.prompt, r.decision.decision]));
  const missing = G0_PROMPTS.filter((p) => !byPrompt.has(p));
  if (missing.length) return { decision: 'tidak dapat diputuskan', why: `prompt ${missing.join(', ')} tidak ada di putaran` };
  const notPass = G0_PROMPTS.filter((p) => !G0_PASS.includes(byPrompt.get(p)!));
  if (notPass.length === 0) return { decision: 'lolos', why: `${G0_PROMPTS.map((p) => `${p} ${byPrompt.get(p)}`).join(', ')}` };
  return { decision: 'tidak dapat diputuskan', why: notPass.map((p) => `${p} ${byPrompt.get(p)}`).join(', ') };
}
