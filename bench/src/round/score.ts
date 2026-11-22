// Agregasi skor juri, gerbang Lakar (G0; G1 + R3/R7 mekanis), dan keputusan sementara per prompt dan per putaran
// (DESIGN.md Lampiran B). Murni.
import { isGateRule, type FindingLevel } from '@lakar/schema';
import { median } from '../stats.js';
import type { JudgeRepRecord, Tool } from '../judge/run.js';
import { APPEAL_CRITERIA, JUDGE_CRITERIA, type JudgeCriterion } from '../judge/prompt.js';

export const TOOLS: readonly Tool[] = ['lakar', 'pendev'];
export const TOOL_LABEL: Record<Tool, string> = { lakar: 'Lakar', pendev: 'pen.dev' };
/** Rentang > 1 wajib diperiksa Adam. */
export const RANGE_FLAG = 1;
export const TIME_GATE_FACTOR = 1.5;

export type Agg = { values: number[]; median: number | undefined; range: number | undefined; flag: boolean };
export type CriterionAgg = Agg & { evidence: { rep: number; skor: number; bukti: string }[] };
export type ToolScore = {
  criteria: Record<JudgeCriterion, CriterionAgg>;
  /** T: jumlah median semua kriteria juri (8 di rubrik v2, maks 16; undefined bila tidak ada ulangan valid). */
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
  /**
   * Hanya putaran G1 (A–E, `decideG1`): R3/R7 mekanis dari temuan layout_check final (`technicalScores`).
   * `null` = putaran G1 tanpa temuan layout_check (gagal). Tidak diisi (G0, latihan) = tidak dihitung.
   */
  technical?: TechnicalScores | null;
};
export type GateResult = { ok: boolean; reasons: string[]; timeRatio: number | undefined };

/** Aturan R3 (Lampiran B §Kualitas teknis): LC-07, LC-11, LC-06. */
export const R3_RULES = ['LC-07', 'LC-11', 'LC-06'] as const;
/** Warning struktural R7: LC-03/13/14/17/18/21. */
export const R7_STRUCTURAL_RULES = ['LC-03', 'LC-13', 'LC-14', 'LC-17', 'LC-18', 'LC-21'] as const;
export const R3_ONE_MAX = 5;
export const R7_TWO_MAX_WARNINGS = 3;
export const R7_ONE_MAX_WARNINGS = 8;
export const R7_ONE_MAX_ERRORS = 2;
export const ADAM_FALSE_POSITIVE_FLAG = 'periksa Adam: false positive?';

export type TechnicalScores = {
  R3: 0 | 1 | 2;
  R7: 0 | 1 | 2;
  /** Jumlah temuan per aturan R3 (aturan yang belum ada di katalog = 0). */
  r3Counts: Record<(typeof R3_RULES)[number], number>;
  /** Error dari aturan yang bukan gerbang menurut katalog `@lakar/schema` (`isGateRule`). */
  nonGateErrors: number;
  /** Warning dari aturan struktural R7. */
  structuralWarnings: number;
  /** Ditandai bila error non-gerbang > 0 (R7 skor 1 hanya sah bila Adam menganulirnya sebagai false positive). */
  flags: string[];
};

/**
 * R3/R7 mekanis (murni) dari temuan `layout_check` final board Lakar, per ID aturan (Lampiran B §Kualitas teknis).
 * R3 = 2 bila LC-07, LC-11, LC-06 semuanya 0; 1 bila total ketiganya ≤ 5; 0 bila > 5.
 * R7 = 2 bila 0 error non-gerbang dan ≤ 3 warning struktural; 1 bila ≤ 2 error non-gerbang dan ≤ 8 warning struktural
 * (error non-gerbang > 0 ditandai "periksa Adam: false positive?"); 0 selebihnya.
 */
export function technicalScores(findings: readonly { rule: string; level: FindingLevel }[]): TechnicalScores {
  const count = (rule: string) => findings.filter((f) => f.rule === rule).length;
  const r3Counts = Object.fromEntries(R3_RULES.map((r) => [r, count(r)])) as TechnicalScores['r3Counts'];
  const r3Total = R3_RULES.reduce((s, r) => s + r3Counts[r], 0);
  const R3 = r3Total === 0 ? 2 : r3Total <= R3_ONE_MAX ? 1 : 0;
  const nonGateErrors = findings.filter((f) => f.level === 'error' && !isGateRule(f.rule)).length;
  const structuralWarnings = findings.filter((f) => f.level === 'warning' && (R7_STRUCTURAL_RULES as readonly string[]).includes(f.rule)).length;
  const R7 =
    nonGateErrors === 0 && structuralWarnings <= R7_TWO_MAX_WARNINGS ? 2 : nonGateErrors <= R7_ONE_MAX_ERRORS && structuralWarnings <= R7_ONE_MAX_WARNINGS ? 1 : 0;
  const flags = nonGateErrors > 0 ? [`${ADAM_FALSE_POSITIVE_FLAG} (${nonGateErrors} error non-gerbang)`] : [];
  return { R3, R7, r3Counts, nonGateErrors, structuralWarnings, flags };
}

/**
 * Gerbang Lakar (otomatis): layout_check gate = 0, ukuran board, waktu ≤ 1,5 × median baseline. R3/R7 hanya bila
 * `technical` diisi (putaran G1): R3 = 0 atau R7 = 0 → gagal. G0 dan latihan tidak menghitung R3/R7.
 */
export function lakarGate(g: GateInput): GateResult {
  const reasons: string[] = [];
  if (g.layoutGate === undefined) reasons.push('layout_check tidak tersedia');
  else if (g.layoutGate > 0) reasons.push(`layout_check gate = ${g.layoutGate}`);
  reasons.push(...g.sizeProblems.map((p) => `ukuran: ${p}`));
  if (g.technical === null) reasons.push('R3/R7 tidak terukur (temuan layout_check tidak ada)');
  else if (g.technical) {
    const t = g.technical;
    if (t.R3 === 0) reasons.push(`R3 = 0 (${R3_RULES.map((r) => `${r} ${t.r3Counts[r]}`).join(', ')}; > ${R3_ONE_MAX})`);
    if (t.R7 === 0) reasons.push(`R7 = 0 (${t.nonGateErrors} error non-gerbang, ${t.structuralWarnings} warning struktural)`);
  }
  const timeRatio = g.wallMs !== undefined && g.baselineMedianMs ? g.wallMs / g.baselineMedianMs : undefined;
  if (timeRatio === undefined) reasons.push('waktu tidak terukur');
  else if (timeRatio > TIME_GATE_FACTOR) reasons.push(`waktu ${(g.wallMs! / 1000).toFixed(1)} dtk > ${TIME_GATE_FACTOR} × baseline ${(g.baselineMedianMs! / 1000).toFixed(1)} dtk (rasio ${timeRatio.toFixed(2)})`);
  return { ok: reasons.length === 0, reasons, timeRatio };
}

export const NO_VALID_REPS = 'tidak ada ulangan juri yang valid';

export type Decision = 'Setara' | 'Lebih baik' | 'Kalah' | 'tidak dapat dinilai';

/** Ambang aturan keputusan v2 (Lampiran B §Keputusan per prompt; dibekukan, tidak disetel setelah melihat skor). */
export const BETTER_MARGIN = 3;
export const EQUAL_TOLERANCE = 1;
export const APPEAL_VETO_GAP = 2;

export type DecisionInput = {
  gate: GateResult;
  lakarRunOk: boolean;
  pendevRunOk: boolean;
  score: Pick<PromptScore, 'validReps' | 'tools'> | undefined;
  /** Kepatuhan brief mengikat pen.dev: `boardSizeProblems` frame pen.dev (kosong = sesuai). */
  pendevBrief: { sizeProblems: string[] };
};

/** Hasil cek terstruktur di balik keputusan (dipakai laporan; tidak dihitung ulang di sana). */
export type DecisionChecks = {
  total: { lakar: number; pendev: number };
  /** D = R9 + R10 (median). */
  appeal: { lakar: number | undefined; pendev: number | undefined };
  /** Alasan Kalah-daya-tarik (D_L ≤ D_P − 2, atau R9/R10 Lakar 0 vs pen.dev 2). */
  appealLoss: string[];
  /** Alasan Kalah-lain (T_L < T_P − 1, atau R1–R8 Lakar 0 vs pen.dev 2). */
  otherLoss: string[];
  /** Semua kriteria dengan median Lakar 0 sementara pen.dev 2. */
  zeroVsTwo: JudgeCriterion[];
  /** Pelanggaran brief mengikat pen.dev (ukuran frame, median R1 = 0). */
  pendevBriefViolations: string[];
};

export type DecisionResult = { decision: Decision; why: string; checks?: DecisionChecks };

/** D = R9 + R10 (median); undefined bila salah satu median tidak ada. */
export function appealAxis(t: Pick<ToolScore, 'criteria'>): number | undefined {
  const m = APPEAL_CRITERIA.map((c) => t.criteria[c]?.median);
  return m.every((x) => x !== undefined) ? m.reduce((s, x) => s! + x!, 0) : undefined;
}

/**
 * Keputusan sementara, aturan v2 (Lampiran B): run/gerbang Lakar gagal → Kalah; run pen.dev gagal → tidak dapat dinilai;
 * alasan Kalah → Kalah, kecuali hanya Kalah-daya-tarik dan pen.dev melanggar brief → Setara;
 * T_L ≥ T_P + 3 dan D_L ≥ D_P → Lebih baik; selebihnya Setara.
 */
export function decide(d: DecisionInput): DecisionResult {
  if (!d.lakarRunOk) return { decision: 'Kalah', why: 'run Lakar gagal' };
  // Gerbang Lakar tidak bergantung pada pen.dev: gerbang gagal → Kalah walau run pen.dev juga gagal.
  if (!d.gate.ok) return { decision: 'Kalah', why: `gerbang gagal: ${d.gate.reasons.join('; ')}` };
  if (!d.pendevRunOk) return { decision: 'tidak dapat dinilai', why: 'run pen.dev gagal' };
  if (!d.score || d.score.validReps === 0) return { decision: 'tidak dapat dinilai', why: NO_VALID_REPS };
  const L = d.score.tools.lakar;
  const P = d.score.tools.pendev;
  const DL = appealAxis(L);
  const DP = appealAxis(P);
  if (L.total === undefined || P.total === undefined || DL === undefined || DP === undefined) return { decision: 'tidak dapat dinilai', why: 'total skor tidak lengkap' };
  const zeroVsTwo = JUDGE_CRITERIA.filter((c) => L.criteria[c].median === 0 && P.criteria[c].median === 2);
  const isAppeal = (c: JudgeCriterion) => (APPEAL_CRITERIA as readonly JudgeCriterion[]).includes(c);
  const appealLoss: string[] = [];
  if (DL <= DP - APPEAL_VETO_GAP) appealLoss.push(`daya tarik D ${DL} ≤ ${DP} − ${APPEAL_VETO_GAP}`);
  const appealZero = zeroVsTwo.filter(isAppeal);
  if (appealZero.length) appealLoss.push(`daya tarik ${appealZero.join(', ')}: Lakar 0 sementara pen.dev 2`);
  const otherLoss: string[] = [];
  if (L.total < P.total - EQUAL_TOLERANCE) otherLoss.push(`total ${L.total} < ${P.total} − ${EQUAL_TOLERANCE}`);
  const otherZero = zeroVsTwo.filter((c) => !isAppeal(c));
  if (otherZero.length) otherLoss.push(`${otherZero.join(', ')}: Lakar 0 sementara pen.dev 2`);
  const pendevBriefViolations = [...d.pendevBrief.sizeProblems.map((p) => `ukuran: ${p}`), ...(P.criteria.R1?.median === 0 ? ['median R1 pen.dev = 0'] : [])];
  const checks: DecisionChecks = { total: { lakar: L.total, pendev: P.total }, appeal: { lakar: DL, pendev: DP }, appealLoss, otherLoss, zeroVsTwo, pendevBriefViolations };
  const td = `total ${L.total} vs ${P.total}, daya tarik ${DL} vs ${DP}`;
  if (otherLoss.length) return { decision: 'Kalah', why: [...otherLoss, ...appealLoss].join('; '), checks };
  if (appealLoss.length) {
    if (pendevBriefViolations.length)
      return { decision: 'Setara', why: `${appealLoss.join('; ')}, tetapi pen.dev melanggar brief mengikat (${pendevBriefViolations.join('; ')}); veto daya tarik dinetralkan, tidak naik ke Lebih baik`, checks };
    return { decision: 'Kalah', why: appealLoss.join('; '), checks };
  }
  if (L.total >= P.total + BETTER_MARGIN && DL >= DP) return { decision: 'Lebih baik', why: `lolos gerbang, total ${L.total} ≥ ${P.total} + ${BETTER_MARGIN}, daya tarik ${DL} ≥ ${DP}`, checks };
  if (L.total >= P.total + BETTER_MARGIN) return { decision: 'Setara', why: `lolos gerbang, total ${L.total} ≥ ${P.total} + ${BETTER_MARGIN} tetapi daya tarik ${DL} < ${DP}`, checks };
  return { decision: 'Setara', why: `lolos gerbang, ${td}, tanpa alasan Kalah`, checks };
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
  results: readonly { prompt: string; decision: Pick<DecisionResult, 'decision' | 'why'> }[],
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

export type G1Decision = G0Decision;
/** Prompt putaran G1 (Lampiran B: G1 lulus inti A). */
export const G1_PROMPTS: readonly string[] = ['A', 'B', 'C', 'D', 'E'];
/** G1: ≥ 4 dari 5 prompt Setara/Lebih baik dan ≥ 1 Lebih baik. */
export const G1_MIN_PASS = 4;
export const G1_MIN_BETTER = 1;

export type G1PromptInput = {
  prompt: string;
  decision: Pick<DecisionResult, 'decision' | 'why'>;
  /** Rasio wall Lakar / median baseline pen.dev (gerbang waktu); undefined = tidak terukur. */
  timeRatio: number | undefined;
  /** Emoji Lakar: (a) input tool_use agen, (b) LC-01a + LC-01b, (c) median juri. undefined = tidak terukur. */
  emoji: { agent: number | undefined; lint: number | undefined; judge: number | undefined };
};

/**
 * Keputusan G1 sementara (murni), sampai Adam mengonfirmasi. Putaran `dibatalkan` → tidak dapat diputuskan.
 * Lolos: ≥ 4 dari A–E Setara/Lebih baik, ≥ 1 Lebih baik, emoji Lakar (a)/(b)/(c) = 0 dan rasio waktu ≤ 1,5 di semua prompt.
 * Gagal: ada emoji > 0 atau rasio > 1,5, atau syarat jumlah tidak bisa tercapai lagi walau prompt yang belum pasti
 * (hilang/tidak dapat dinilai) berakhir Lebih baik. Selebihnya (yang belum pasti masih bisa mengubah hasil, atau
 * waktu/emoji tidak terukur) → tidak dapat diputuskan.
 */
export function decideG1(results: readonly G1PromptInput[], roundStatus: 'lengkap' | 'tidak lengkap' | 'dibatalkan'): { decision: G1Decision; why: string } {
  if (roundStatus === 'dibatalkan') return { decision: 'tidak dapat diputuskan', why: 'putaran dibatalkan' };
  const by = new Map(results.map((r) => [r.prompt, r]));
  const fail: string[] = [];
  const unknown: string[] = [];
  let pass = 0;
  let better = 0;
  let open = 0;
  for (const p of G1_PROMPTS) {
    const r = by.get(p);
    if (!r) {
      open++;
      unknown.push(`prompt ${p} tidak ada di putaran`);
      continue;
    }
    const d = r.decision.decision;
    if (d === 'Setara' || d === 'Lebih baik') pass++;
    if (d === 'Lebih baik') better++;
    if (d === 'tidak dapat dinilai') {
      open++;
      unknown.push(`${p} tidak dapat dinilai`);
    }
    if (r.timeRatio === undefined) unknown.push(`${p} waktu tidak terukur`);
    else if (r.timeRatio > TIME_GATE_FACTOR) fail.push(`${p} rasio waktu ${r.timeRatio.toFixed(2)} > ${TIME_GATE_FACTOR}`);
    const e = r.emoji;
    const parts = [
      ['(a)', e.agent],
      ['(b)', e.lint],
      ['(c)', e.judge],
    ] as const;
    const pos = parts.filter(([, v]) => v !== undefined && v > 0);
    if (pos.length) fail.push(`${p} emoji Lakar ${pos.map(([k, v]) => `${k} ${v}`).join(', ')}`);
    const miss = parts.filter(([, v]) => v === undefined);
    if (miss.length) unknown.push(`${p} emoji ${miss.map(([k]) => k).join('/')} tidak terukur`);
  }
  const lost = G1_PROMPTS.filter((p) => by.get(p)?.decision.decision === 'Kalah');
  if (pass + open < G1_MIN_PASS) fail.push(`Setara/Lebih baik paling banyak ${pass + open} dari ${G1_PROMPTS.length} < ${G1_MIN_PASS}${lost.length ? ` (Kalah di ${lost.join(', ')})` : ''}`);
  if (better + open < G1_MIN_BETTER) fail.push(`tidak ada prompt Lebih baik`);
  if (fail.length) return { decision: 'gagal', why: fail.join('; ') };
  if (unknown.length) return { decision: 'tidak dapat diputuskan', why: unknown.join('; ') };
  return { decision: 'lolos', why: `${pass} dari ${G1_PROMPTS.length} Setara/Lebih baik (${better} Lebih baik), emoji 0, rasio waktu ≤ ${TIME_GATE_FACTOR} di semua prompt` };
}
