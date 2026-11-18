// Perintah `practice [--series practice|effects] --iter <k> [--only P1,P3] [--reuse-pendev <j>] [--resume] [--dry-run]`
// (story 19): Lakar vs pen.dev pada prompt latihan beku (bukan A–E), runner + pembungkus + juri rubrik v2.1 yang sama
// dengan `round`. Latihan bukan gerbang G0: keluarannya `bench/practice-<k>.md|json` untuk mengiterasi skill, strip Lakar
// di `bench/practice/<k>/`. Seri `effects` (story 22): P5/P6 efek visual, `bench/effects-<k>.md|json`, strip Lakar di
// `bench/practice/effects/<k>/`, run di `bench/runs/practice-effects/<k>/`. Kedua seri (practice dan efek) me-restart pen-desktop
// sesudah run pen.dev terakhir iterasi.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { errorMessage } from '@lakar/schema';
import { buildArgs, shellQuote } from '../claude-runner.js';
import { buildJudgeArgs, EMPTY_MCP, JUDGE_REPS, type DesignImages, type JudgeRepRecord, type Tool } from '../judge/run.js';
import { buildJudgeTextWith, DESIGN_MD_PATH, JUDGE_CRITERIA, judgeC7Problems, judgeLeaks } from '../judge/prompt.js';
import { lampiranB, readRubricJson, rubricVersionOf, type RubricJson } from '../judge/rubric.js';
import { applyLakarArchive, benchLakarSources, describeLakarArchive, planLakarArchive } from '../lakar/archive.js';
import { LakardClient, type LakardStatus } from '../lakar/lakard-client.js';
import { boardSizeProblemsFor, LAKAR_ALLOWED_TOOLS, LAKAR_MCP_CONFIG, LAKARD_UNIT, lakarPreflightProblems, mcpServerNames, runLakar } from '../lakar/run.js';
import { Abort, log, stamp } from '../log.js';
import { emptyRecord, PENDEV_ALLOWED_TOOLS, PENDEV_MCP_CONFIG, penDesktopVersion, preflight, runOne, RUNS_ROOT } from '../pendev/run.js';
import { readPngSizeFile } from '../png/codec.js';
import { judgeImagesFromStripPng } from '../png/strip.js';
import { BENCH_ROOT, FORBIDDEN_TOKENS, forbiddenPhrases, forbiddenSources, GOLDEN_SET_PATH, REPO_ROOT, renderWith, words, type Protocol } from '../protocol.js';
import {
  c7Targets,
  copyPngExclusive,
  distDirs,
  harnessErrorStatus,
  isFinalRun,
  judgePrompt,
  newestDistMtime,
  roundRunFrom,
  runRecordPath,
  waitLakard,
  writeStrip,
  type StoredRun,
} from '../round/main.js';
import type { RoundRun } from '../round/report.js';
import { aggregateScores, appealAxis, decide, lakarGate, NO_VALID_REPS, TIME_GATE_FACTOR, TOOL_LABEL, TOOLS, type Agg, type DecisionResult, type GateResult, type PromptScore } from '../round/score.js';
import { PencilClient } from '../pendev/pencil-client.js';
import {
  comparePenHashes,
  git,
  gitPorcelain,
  isActive,
  md5PenFiles,
  PEN_DESKTOP_RESTART_TIMEOUT_MS,
  penDesktopRestartDeps,
  penDesktopRestartStep,
  restartPenDesktopAfterSeries,
  restartUserUnit,
  sha256,
  sha256Dir,
  systemdShow,
  type PenDesktopRestart,
} from '../sys.js';
import { EFFECT_ID, EFFECT_PROMPTS_PATH, EFFECT_PROMPTS_SHA256, loadPracticePrompts, PRACTICE_DIR, PRACTICE_ID, PRACTICE_PROMPTS_PATH, PRACTICE_PROMPTS_SHA256, type PracticePrompt } from './prompts.js';

export const PRACTICE_RUNS = join(RUNS_ROOT, 'practice');
export const ROUNDS_RUNS = join(RUNS_ROOT, 'rounds');
/** Run seri efek (story 22): artefak mentah + strip/.pen pen.dev lokal (EULA). */
export const EFFECTS_RUNS = join(RUNS_ROOT, 'practice-effects');
/** Iterasi maksimal (plan story 19, Plan Change Log 2026-11-18: iterasi 4–6, iterasi konfirmasi 7, lalu iterasi 8 = ulang penuh iterasi 7 yang batal karena cacat harness): tidak ada iterasi ke-9. */
export const MAX_ITER = 8;
/** Anggaran run berbayar kumulatif semua iterasi latihan (USD): $48,09 terpakai iterasi 1–7 + $10 iterasi 8. */
export const BUDGET_USD = 58.09;
/** Perkiraan biaya atas per prompt (USD, dari putaran 1 + kalibrasi juri): run pen.dev, run Lakar, juri 3×. */
export const COST_ESTIMATE = { pendev: 0.9, lakar: 1.1, judge: 0.8 } as const;
/** Versi rubrik juri yang wajib (rubrik v2.1, `bench/rubric/rubric.json`). */
export const PRACTICE_RUBRIC_VERSION = '2.1';
/** Lulus iterasi: Lakar Setara/Lebih baik di ≥ PASS_MIN dari semua prompt. */
export const PASS_MIN = 3;
const SKILLS_DIR = join(REPO_ROOT, 'packages/skills/skills');
const PEN_RESTART_LIMIT_S = PEN_DESKTOP_RESTART_TIMEOUT_MS / 1000;
const PASS_DECISIONS = ['Setara', 'Lebih baik'];
export const PRACTICE_USAGE = 'pakai: node bench/dist/cli.js practice [--series practice|effects] --iter <k> [--only P1,P3] [--reuse-pendev <j>] [--resume] [--dry-run]';

export type SeriesId = 'practice' | 'effects';

/**
 * Konfigurasi seri latihan. `practice` (default, story 19) = perilaku lama persis: P1–P4, maks 8 iterasi, $58,09, lulus
 * ≥ 3 dari 4, laporan `bench/practice-<k>`. `effects` (story 22) = P5/P6, maks 3 iterasi, $15, semua prompt wajib lulus,
 * laporan `bench/effects-<k>`. Seri practice dan efek me-restart pen-desktop sesudah iterasi yang menjalankan pen.dev.
 */
export type SeriesConfig = {
  id: SeriesId;
  /** Judul laporan. */
  title: string;
  promptsPath: string;
  sha: string;
  ids: RegExp;
  maxIter: number;
  budgetUsd: number;
  /** Lulus: Setara/Lebih baik di ≥ `min` prompt, atau di semua prompt (`all`). */
  passRule: { min: number } | 'all';
  /** Laporan `bench/<reportPrefix>-<k>.md|json`. */
  reportPrefix: string;
  /** Run per iterasi di `<runsRoot>/<k>/`. */
  runsRoot: string;
  /** Strip Lakar tracked di `<pngDir>/<k>/<P>-lakar.png`. */
  pngDir: string;
  /** Restart pen-desktop sesudah run pen.dev terakhir iterasi (izin Adam; seri practice dan efek). */
  restartPenDesktop: boolean;
  /** Laporan iterasi > 1 memuat perbandingan dengan iterasi 1 (sebelum perubahan). */
  compareWithFirst: boolean;
};

export const PRACTICE_SERIES: SeriesConfig = {
  id: 'practice',
  title: 'Latihan skill',
  promptsPath: PRACTICE_PROMPTS_PATH,
  sha: PRACTICE_PROMPTS_SHA256,
  ids: PRACTICE_ID,
  maxIter: MAX_ITER,
  budgetUsd: BUDGET_USD,
  passRule: { min: PASS_MIN },
  reportPrefix: 'practice',
  runsRoot: PRACTICE_RUNS,
  pngDir: PRACTICE_DIR,
  restartPenDesktop: true,
  compareWithFirst: false,
};

/** Seri efek (story 22): maks 3 iterasi, anggaran $15, P5 dan P6 wajib lulus. */
export const EFFECTS_SERIES: SeriesConfig = {
  id: 'effects',
  title: 'Seri efek',
  promptsPath: EFFECT_PROMPTS_PATH,
  sha: EFFECT_PROMPTS_SHA256,
  ids: EFFECT_ID,
  maxIter: 3,
  budgetUsd: 15,
  passRule: 'all',
  reportPrefix: 'effects',
  runsRoot: EFFECTS_RUNS,
  pngDir: join(PRACTICE_DIR, 'effects'),
  restartPenDesktop: true,
  compareWithFirst: true,
};

export const SERIES: Record<SeriesId, SeriesConfig> = { practice: PRACTICE_SERIES, effects: EFFECTS_SERIES };

/** Jumlah minimum Setara/Lebih baik (murni). */
export const passMinOf = (series: Pick<SeriesConfig, 'passRule'>, total: number): number => (series.passRule === 'all' ? total : series.passRule.min);

export type PracticeArgs = { series: SeriesId; iter: number; only: string[] | undefined; reusePendev: number | undefined; resume: boolean; dryRun: boolean };

const posInt = (s: string | undefined) => (s !== undefined && /^[1-9]\d*$/.test(s) ? Number(s) : undefined);

/** Argumen CLI (murni). */
export function parsePracticeArgs(args: readonly string[]): { ok: true; value: PracticeArgs } | { ok: false; error: string } {
  let iterRaw: string | undefined;
  let seriesRaw: string | undefined;
  let onlyRaw: string | undefined;
  let reuseRaw: string | undefined;
  let resume = false;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--') continue;
    const eq = (name: string) => (a.startsWith(`${name}=`) ? a.slice(name.length + 1) : undefined);
    if (a === '--series') seriesRaw = args[++i];
    else if (eq('--series') !== undefined) seriesRaw = eq('--series');
    else if (a === '--iter') iterRaw = args[++i];
    else if (eq('--iter') !== undefined) iterRaw = eq('--iter');
    else if (a === '--only') onlyRaw = args[++i];
    else if (eq('--only') !== undefined) onlyRaw = eq('--only');
    else if (a === '--reuse-pendev') reuseRaw = args[++i];
    else if (eq('--reuse-pendev') !== undefined) reuseRaw = eq('--reuse-pendev');
    else if (a === '--resume') resume = true;
    else if (a === '--dry-run') dryRun = true;
    else return { ok: false, error: `argumen tidak dikenal: ${a}` };
  }
  if (seriesRaw !== undefined && !Object.hasOwn(SERIES, seriesRaw)) return { ok: false, error: `--series ${JSON.stringify(seriesRaw)}: pilih ${Object.keys(SERIES).join('|')}` };
  const series = SERIES[(seriesRaw ?? 'practice') as SeriesId];
  const iter = posInt(iterRaw);
  if (iter === undefined) return { ok: false, error: '--iter wajib (bilangan bulat ≥ 1)' };
  if (iter > series.maxIter)
    return { ok: false, error: series.id === 'practice' ? `--iter ${iter} > ${MAX_ITER}: iterasi latihan maksimal ${MAX_ITER}` : `--iter ${iter} > ${series.maxIter}: iterasi seri ${series.id} maksimal ${series.maxIter}` };
  let only: string[] | undefined;
  if (onlyRaw !== undefined) {
    only = onlyRaw.split(',').map((x) => x.trim()).filter(Boolean);
    if (!only.length || only.some((x) => !series.ids.test(x))) return { ok: false, error: `--only ${JSON.stringify(onlyRaw)}: daftar ID prompt latihan (mis. ${series.id === 'practice' ? 'P1,P3' : 'P5'})` };
    only = [...new Set(only)];
  }
  let reusePendev: number | undefined;
  if (reuseRaw !== undefined) {
    reusePendev = posInt(reuseRaw);
    if (reusePendev === undefined) return { ok: false, error: `--reuse-pendev ${JSON.stringify(reuseRaw)}: nomor iterasi sumber` };
    if (reusePendev >= iter) return { ok: false, error: `--reuse-pendev ${reusePendev} harus iterasi sebelum ${iter}` };
  }
  return { ok: true, value: { series: series.id, iter, only, reusePendev, resume, dryRun } };
}

/** Prompt yang dijalankan (murni): semua, atau subset `--only` (ID tak dikenal → masalah). */
export function selectPrompts(all: readonly PracticePrompt[], only: readonly string[] | undefined): { prompts: PracticePrompt[]; problems: string[] } {
  if (!only) return { prompts: [...all], problems: [] };
  const unknown = only.filter((id) => !all.some((p) => p.id === id));
  return { prompts: all.filter((p) => only.includes(p.id)), problems: unknown.map((id) => `prompt ${id} tidak ada di prompts.json`) };
}

export type PendevSource = { exists: boolean; status: string | undefined; wallMs: number | undefined; strip: boolean; reusedFrom?: number };

/**
 * Rencana pakai ulang pen.dev (murni): setiap prompt wajib punya run pen.dev `success` dengan wall dan strip di iterasi
 * sumber (bukan pakai ulang berantai). Masalah → Abort sebelum spawn apa pun.
 */
export function pendevReuseProblems(from: number, ids: readonly string[], read: (id: string) => PendevSource): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const s = read(id);
    if (!s.exists) out.push(`${id}: run pen.dev iterasi ${from} tidak ada${s.reusedFrom ? ` (iterasi ${from} memakai ulang iterasi ${s.reusedFrom}; pakai --reuse-pendev ${s.reusedFrom})` : ''}`);
    else if (s.status !== 'success') out.push(`${id}: run pen.dev iterasi ${from} berstatus ${s.status ?? '?'}, bukan success`);
    else {
      if (s.wallMs === undefined) out.push(`${id}: run pen.dev iterasi ${from} tanpa wall`);
      if (!s.strip) out.push(`${id}: strip pen.dev iterasi ${from} tidak ada`);
    }
  }
  return out;
}

/** Perkiraan biaya sisa iterasi (murni): run yang belum final + juri yang belum lengkap. */
export function estimateCost(i: { prompts: readonly string[]; reusePendev: boolean; doneRuns: ReadonlySet<string>; doneJudge: ReadonlySet<string> }): number {
  let usd = 0;
  for (const p of i.prompts) {
    if (!i.reusePendev && !i.doneRuns.has(`${p}-pendev`)) usd += COST_ESTIMATE.pendev;
    if (!i.doneRuns.has(`${p}-lakar`)) usd += COST_ESTIMATE.lakar;
    if (!i.doneJudge.has(p)) usd += COST_ESTIMATE.judge;
  }
  return Math.round(usd * 100) / 100;
}

/**
 * Biaya iterasi sebelumnya dari `bench/practice-<j>.json` (j < k). Iterasi tanpa laporan (mis. dihentikan sebelum juri)
 * memakai `fallback(j)` = jumlah biaya run/juri yang tersimpan; tanpa keduanya iterasi dilewati.
 */
export function previousCosts(
  iter: number,
  read: (j: number) => { cost?: { iteration?: number } } | undefined,
  fallback: (j: number) => number | undefined = () => undefined,
): { byIter: Record<number, number>; total: number } {
  const byIter: Record<number, number> = {};
  for (let j = 1; j < iter; j++) {
    const c = read(j)?.cost?.iteration ?? fallback(j);
    if (typeof c === 'number') byIter[j] = c;
  }
  return { byIter, total: Object.values(byIter).reduce((s, x) => s + x, 0) };
}

/** Anggaran (murni): sudah terpakai + perkiraan sisa > anggaran → masalah (iterasi tidak dimulai/dilanjutkan). */
export function budgetProblem(spent: number, estimate: number, budget = BUDGET_USD): string | undefined {
  return spent + estimate > budget ? `anggaran: terpakai $${spent.toFixed(2)} + perkiraan sisa $${estimate.toFixed(2)} > $${budget}` : undefined;
}

export type PracticeEmoji = { agent: number | undefined; glyphs: number | undefined; lint: number | undefined; judge: number | undefined };

export type PracticePromptResult = {
  id: string;
  name: string;
  kind: string;
  size: PracticePrompt['size'];
  judgeTextSha256: string | undefined;
  runs: Partial<Record<Tool, RoundRun>>;
  /** Iterasi asal run pen.dev bila dipakai ulang (`--reuse-pendev`). */
  pendevReusedFrom: number | undefined;
  gate: GateResult | undefined;
  sizeProblems: string[];
  pendevSizeProblems: string[];
  score: PromptScore | undefined;
  decision: DecisionResult;
  emoji: Record<Tool, PracticeEmoji>;
  pngs: Record<Tool, string | undefined>;
  cost: { lakar: number | undefined; pendev: number | undefined; pendevCounted: boolean; judge: number };
};

/** Emoji per alat (murni): (a) input tool_use agen, glyph LC-01b terpisah, (b) LC-01a+LC-01b layout_check (Lakar), (c) juri. */
export function emojiOf(run: RoundRun | undefined, judge: Agg | undefined, tool: Tool): PracticeEmoji {
  return {
    agent: run?.agentEmoji?.emoji,
    glyphs: run?.agentEmoji?.glyphs,
    lint: tool === 'lakar' && run?.lintEmoji ? run.lintEmoji.lc01a + run.lintEmoji.lc01b : undefined,
    judge: judge?.median,
  };
}

export type PracticeOutcome = { pass: boolean; passCount: number; total: number; reasons: string[] };

/**
 * Lulus iterasi (murni, AC story 19): semua prompt latihan ada; Lakar Setara/Lebih baik di ≥ 3; di setiap prompt waktu
 * Lakar ≤ 1,5 × pen.dev, emoji Lakar (a)/(b)/(c) = 0, dan layout_check gate = 0.
 */
export function practiceOutcome(results: readonly Pick<PracticePromptResult, 'id' | 'decision' | 'runs' | 'emoji'>[], expectedIds: readonly string[], passMin = PASS_MIN): PracticeOutcome {
  const reasons: string[] = [];
  const missing = expectedIds.filter((id) => !results.some((r) => r.id === id));
  if (missing.length) reasons.push(`prompt tidak ada di iterasi ini: ${missing.join(', ')}`);
  const passCount = results.filter((r) => PASS_DECISIONS.includes(r.decision.decision)).length;
  if (passCount < passMin) reasons.push(`Setara/Lebih baik ${passCount} dari ${results.length} (< ${passMin})`);
  for (const r of results) {
    const l = r.runs.lakar?.record;
    const p = r.runs.pendev?.record;
    if (l?.wallMs === undefined || p?.wallMs === undefined) reasons.push(`${r.id}: waktu tidak terukur`);
    else if (l.wallMs > TIME_GATE_FACTOR * p.wallMs) reasons.push(`${r.id}: waktu Lakar ${(l.wallMs / 1000).toFixed(1)} dtk > ${TIME_GATE_FACTOR} × pen.dev ${(p.wallMs / 1000).toFixed(1)} dtk`);
    const e = r.emoji.lakar;
    if (e.agent !== 0 || e.lint !== 0 || e.judge !== 0) reasons.push(`${r.id}: emoji Lakar (a) ${e.agent ?? '–'} / (b) ${e.lint ?? '–'} / (c) ${e.judge ?? '–'}`);
    const g = l?.lakar?.layout?.summary.gate;
    if (g !== 0) reasons.push(`${r.id}: layout_check gate ${g ?? '–'}`);
  }
  return { pass: reasons.length === 0, passCount, total: results.length, reasons };
}

export type PracticeFrozen = {
  head: string;
  porcelain: string;
  protocolHash: string;
  wrapperSha256: string;
  promptsSha256: string;
  model: string;
  claude: string;
  pendevDesktop: string | undefined;
  lakard: { version?: string; schemaVersion?: number; pid?: number; startedAt?: string; browser?: string; node?: string };
  skills: Record<string, string>;
  distSha: Record<string, string>;
  rubric: { version: string | undefined; lampiranBSha256: string };
  judge: { model: string; argv: string; textSha256: Record<string, string> };
  reusePendev: number | undefined;
};

/** Field beku yang dibandingkan saat --resume (pid/startedAt lakard boleh berbeda karena restart). */
export function practiceDrift(first: PracticeFrozen, now: PracticeFrozen): string[] {
  const pick = (f: PracticeFrozen) => ({
    head: f.head,
    porcelain: f.porcelain,
    protocolHash: f.protocolHash,
    wrapperSha256: f.wrapperSha256,
    promptsSha256: f.promptsSha256,
    model: f.model,
    claude: f.claude,
    pendevDesktop: f.pendevDesktop ?? '',
    skills: JSON.stringify(f.skills),
    distSha: JSON.stringify(f.distSha),
    rubric: JSON.stringify(f.rubric),
    judge: JSON.stringify(f.judge.textSha256),
    reusePendev: String(f.reusePendev ?? ''),
  });
  const a = pick(first);
  const b = pick(now);
  return (Object.keys(a) as (keyof typeof a)[]).filter((k) => a[k] !== b[k]).map((k) => `${k}: ${a[k] || '(kosong)'} → ${b[k] || '(kosong)'}`);
}

/** Ringkasan Lakar satu prompt untuk perbandingan sebelum/sesudah. */
export type LakarSnapshot = { decision: string; t: number | undefined; d: number | undefined; wallMs: number | undefined; ratio: number | undefined };
export type BeforeAfter = { id: string; before: LakarSnapshot | undefined; after: LakarSnapshot };

type SnapshotSource = Pick<PracticePromptResult, 'id' | 'decision' | 'score' | 'runs'>;

/** Ringkasan Lakar dari hasil prompt (murni). */
export function lakarSnapshot(r: Omit<SnapshotSource, 'id'>): LakarSnapshot {
  const l = r.runs.lakar?.record.wallMs;
  const p = r.runs.pendev?.record.wallMs;
  const tl = r.score?.tools.lakar;
  return { decision: r.decision.decision, t: tl?.total, d: tl ? appealAxis(tl) : undefined, wallMs: l, ratio: l !== undefined && p ? l / p : undefined };
}

/** Perbandingan iterasi 1 (sebelum perubahan) dengan iterasi ini (murni). */
export function beforeAfter(first: readonly SnapshotSource[] | undefined, now: readonly SnapshotSource[]): BeforeAfter[] {
  return now.map((r) => {
    const b = first?.find((x) => x.id === r.id);
    return { id: r.id, before: b ? lakarSnapshot(b) : undefined, after: lakarSnapshot(r) };
  });
}

export type PracticeReport = {
  /** Seri (dihilangkan untuk seri `practice` default agar laporan lama tidak berubah). */
  series?: SeriesId;
  iter: number;
  date: string;
  status: 'lengkap' | 'tidak lengkap' | 'dibatalkan';
  statusReasons: string[];
  frozen: PracticeFrozen;
  wrapper: string;
  argv: { lakar: string; pendev: string; judge: string };
  results: PracticePromptResult[];
  outcome: PracticeOutcome;
  cost: { pendev: number; lakar: number; judge: number; iteration: number; previous: Record<number, number>; cumulative: number; budget: number };
  penGuard: { files: number; changed: string[]; removed: string[]; added: string[] };
  lakardActiveAfter: string;
  notes: string[];
  /** Seri practice dan efek: hasil restart pen-desktop sesudah run pen.dev terakhir; string = alasan tidak dijalankan. */
  penDesktopRestart?: PenDesktopRestart | string;
  /** Seri efek iterasi > 1: Lakar iterasi 1 vs iterasi ini. */
  comparison?: BeforeAfter[];
};

const sec = (ms: number | undefined) => (ms === undefined ? '–' : (ms / 1000).toFixed(1));
const usd = (x: number | undefined) => (x === undefined ? '–' : `$${x.toFixed(2)}`);
const num = (x: number | undefined) => (x === undefined ? '–' : Number.isInteger(x) ? String(x) : x.toFixed(1));
const ratio = (a: number | undefined, b: number | undefined) => (a === undefined || !b ? '–' : (a / b).toFixed(2));
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const aggText = (a: Agg | undefined) => (a ? `${num(a.median)} (rentang ${num(a.range)})${a.flag ? ' **periksa**' : ''}` : '–');
const sizeText = (s: PracticePrompt['size']) => `${s.width}×${s.height ?? 'bebas'}`;
const boardsText = (r: RoundRun | undefined) => (r?.record.frames.length ? r.record.frames.map((f) => `${f.width}×${f.height}`).join(', ') : '–');

export function renderPracticeMarkdown(r: PracticeReport): string {
  const series = SERIES[r.series ?? 'practice'];
  const L: string[] = [];
  L.push(`# ${series.title}, iterasi ${r.iter}: Lakar vs pen.dev`, '');
  L.push(`Status: **${r.status}**${r.statusReasons.length ? ` (${r.statusReasons.join('; ')})` : ''}. Tanggal: ${r.date}.`, '');
  L.push('Latihan bukan gerbang G0. Prompt latihan beku (bukan A–E), runner, pembungkus, dan juri rubrik yang sama dengan putaran; keputusan memakai aturan v2 dengan baseline waktu = wall pen.dev prompt yang sama.', '');
  L.push(`## Hasil iterasi: **${r.outcome.pass ? 'lulus' : 'belum lulus'}**`, '');
  const expected = series.id === 'practice' ? 4 : 2; // jumlah prompt beku seri (P1–P4 / P5–P6), bukan jumlah yang dijalankan (--only)
  const rule = series.passRule === 'all' ? `semua ${expected} prompt` : `≥ ${series.passRule.min} dari ${expected}`;
  L.push(`- Lakar Setara/Lebih baik: ${r.outcome.passCount} dari ${r.outcome.total} (syarat ${rule}; di setiap prompt waktu ≤ ${TIME_GATE_FACTOR} × pen.dev, emoji Lakar 0, layout_check gate 0).`);
  for (const x of r.outcome.reasons) L.push(`- Belum terpenuhi: ${x}`);
  L.push('');
  L.push('## Ringkasan', '');
  L.push('| Prompt | Jenis (ukuran) | Waktu Lakar (dtk) | Waktu pen.dev (dtk) | Rasio | Biaya Lakar | Biaya pen.dev | Gerbang Lakar | T Lakar | T pen.dev | D Lakar | D pen.dev | Emoji Lakar (a/b/c) | Keputusan |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const p of r.results) {
    const l = p.runs.lakar?.record;
    const d = p.runs.pendev?.record;
    const tl = p.score?.tools.lakar;
    const tp = p.score?.tools.pendev;
    const e = p.emoji.lakar;
    L.push(
      `| ${p.id} ${p.name} | ${p.kind} (${sizeText(p.size)}) | ${sec(l?.wallMs)} | ${sec(d?.wallMs)}${p.pendevReusedFrom ? ` (iter ${p.pendevReusedFrom})` : ''} | ${ratio(l?.wallMs, d?.wallMs)} | ${usd(l?.costUsd)} | ${usd(d?.costUsd)} | ${p.gate ? (p.gate.ok ? 'lolos' : 'gagal') : '–'} | ${num(tl?.total)} | ${num(tp?.total)} | ${num(tl && appealAxis(tl))} | ${num(tp && appealAxis(tp))} | ${num(e.agent)}/${num(e.lint)}/${num(e.judge)} | **${p.decision.decision}** |`,
    );
  }
  L.push('');
  L.push('## Biaya', '');
  L.push(`- Iterasi ini: pen.dev ${usd(r.cost.pendev)} (run dipakai ulang tidak dihitung lagi), Lakar ${usd(r.cost.lakar)}, juri ${usd(r.cost.judge)}; total **${usd(r.cost.iteration)}**.`);
  L.push(`- Iterasi sebelumnya: ${Object.entries(r.cost.previous).map(([j, c]) => `iter ${j} ${usd(c)}`).join(', ') || '–'}; kumulatif **${usd(r.cost.cumulative)}** dari anggaran $${r.cost.budget}.`, '');
  if (r.penDesktopRestart !== undefined) {
    const x = r.penDesktopRestart;
    L.push('## Restart pen-desktop', '');
    L.push(typeof x === 'string' ? `- Tidak dijalankan: ${x}.` : `- Restart pen-desktop sesudah run pen.dev terakhir: **${x.ok ? 'berhasil' : 'GAGAL'}**, durasi ${sec(x.ms)} dtk (${cell(x.detail)}).`, '');
  }
  if (r.comparison) {
    L.push('## Sebelum (iterasi 1) vs sesudah (Lakar)', '');
    L.push('| Prompt | Keputusan iter 1 | Keputusan sekarang | T iter 1 → sekarang | D iter 1 → sekarang | Rasio waktu iter 1 → sekarang |');
    L.push('|---|---|---|---|---|---|');
    const rt = (x: number | undefined) => (x === undefined ? '–' : x.toFixed(2));
    for (const c of r.comparison)
      L.push(`| ${c.id} | ${c.before?.decision ?? '–'} | ${c.after.decision} | ${num(c.before?.t)} → ${num(c.after.t)} | ${num(c.before?.d)} → ${num(c.after.d)} | ${rt(c.before?.ratio)} → ${rt(c.after.ratio)} |`);
    L.push('');
  }
  for (const p of r.results) {
    L.push(`## ${p.id}: ${p.name} (${p.kind}, ${sizeText(p.size)})`, '');
    L.push('| Alat | Status | Wall (dtk) | Biaya | Turns | Tool call | Board/frame | Run | PNG |');
    L.push('|---|---|---|---|---|---|---|---|---|');
    for (const t of TOOLS) {
      const run = p.runs[t];
      const rec = run?.record;
      L.push(
        `| ${TOOL_LABEL[t]} | ${rec ? `${rec.status}${rec.reason ? ` (${cell(rec.reason)})` : ''}` : 'tidak dijalankan'} | ${sec(rec?.wallMs)} | ${usd(rec?.costUsd)}${t === 'pendev' && p.pendevReusedFrom ? ` (iter ${p.pendevReusedFrom}, dipakai ulang)` : ''} | ${rec?.numTurns ?? '–'} | ${rec?.toolCalls ?? '–'} | ${boardsText(run)} | ${run ? `\`${run.dir}\`` : '–'} | ${p.pngs[t] ? `\`${p.pngs[t]}\`` : '–'} |`,
      );
    }
    L.push('');
    const g = p.gate;
    L.push(`- Gerbang Lakar: ${g ? (g.ok ? 'lolos' : `gagal (${g.reasons.join('; ')})`) : '–'}; rasio waktu Lakar/pen.dev ${num(g?.timeRatio)}; layout_check gate ${p.runs.lakar?.record.lakar?.layout?.summary.gate ?? '–'} (error ${p.runs.lakar?.record.lakar?.layout?.summary.error ?? '–'}, warning ${p.runs.lakar?.record.lakar?.layout?.summary.warning ?? '–'})`);
    L.push(`- Ukuran: Lakar ${p.sizeProblems.length ? p.sizeProblems.join('; ') : 'sesuai'}; pen.dev ${p.pendevSizeProblems.length ? p.pendevSizeProblems.join('; ') : 'sesuai'}`);
    L.push(`- Emoji: ${TOOLS.map((t) => `${TOOL_LABEL[t]} (a) ${num(p.emoji[t].agent)}, glyph ${num(p.emoji[t].glyphs)}, (b) ${t === 'lakar' ? num(p.emoji[t].lint) : 'tidak dilint (EULA)'}, (c) ${num(p.emoji[t].judge)}`).join('; ')}`);
    L.push(`- Teks juri sha256: \`${p.judgeTextSha256 ?? '–'}\`; biaya juri ${usd(p.cost.judge)}`);
    L.push(`- Keputusan: **${p.decision.decision}**. Alasan: ${p.decision.why}.`, '');
    const s = p.score;
    if (s) {
      L.push(`Skor juri (median ${s.validReps} ulangan valid dari ${s.reps.length}):`, '');
      L.push('| Kriteria | Lakar | pen.dev |');
      L.push('|---|---|---|');
      for (const c of JUDGE_CRITERIA) L.push(`| ${c} | ${aggText(s.tools.lakar.criteria[c])} | ${aggText(s.tools.pendev.criteria[c])} |`);
      L.push(`| **T** | **${num(s.tools.lakar.total)}** | **${num(s.tools.pendev.total)}** |`);
      L.push(`| **D = R9 + R10** | **${num(appealAxis(s.tools.lakar))}** | **${num(appealAxis(s.tools.pendev))}** |`);
      L.push(`| Slop | ${aggText(s.tools.lakar.slop)} | ${aggText(s.tools.pendev.slop)} |`, '');
      L.push('Bukti R9/R10 per ulangan:', '');
      for (const t of TOOLS)
        for (const c of ['R9', 'R10'] as const)
          for (const e of s.tools[t].criteria[c].evidence) L.push(`- ${TOOL_LABEL[t]} ${c} ulangan ${e.rep} (${e.skor}): ${cell(e.bukti)}`);
      L.push('');
    }
  }
  L.push('## Versi beku', '');
  const f = r.frozen;
  L.push(`- git HEAD \`${f.head}\`; porcelain packages/tools/bench/src: ${f.porcelain ? `\n\n\`\`\`\n${f.porcelain}\n\`\`\`\n` : 'kosong'}`);
  L.push(`- prompts.json sha256 \`${f.promptsSha256}\` (beku \`${series.sha}\`, ${f.promptsSha256 === series.sha ? 'sama' : '**berbeda**'})`);
  L.push(`- protocolHash \`${f.protocolHash}\`; pembungkus sha256 \`${f.wrapperSha256}\``);
  L.push(`- Model agen dan juri \`${f.model}\`; Claude Code ${f.claude}; pen.dev desktop ${f.pendevDesktop ?? '?'}`);
  L.push(`- lakard ${f.lakard.version ?? '?'} (schema ${f.lakard.schemaVersion ?? '?'}), pid ${f.lakard.pid ?? '?'}, startedAt ${f.lakard.startedAt ?? '?'}, Chromium ${f.lakard.browser ?? '?'}`);
  for (const [k, v] of Object.entries(f.skills)) L.push(`- skill \`${k}\` sha256 \`${v}\``);
  for (const [k, v] of Object.entries(f.distSha)) L.push(`- sha256 \`packages/${k}/dist\`: \`${v}\``);
  L.push(`- Rubrik juri: versi ${f.rubric.version ?? '?'}; sha256 Lampiran B \`${f.rubric.lampiranBSha256}\``);
  L.push(`- Pakai ulang pen.dev: ${f.reusePendev ? `iterasi ${f.reusePendev}` : 'tidak'}`);
  L.push(`- Argv Lakar: \`${r.argv.lakar}\``);
  L.push(`- Argv pen.dev: \`${r.argv.pendev}\``);
  L.push(`- Argv juri: \`${r.argv.judge}\``, '');
  L.push('### Pembungkus (bench/protocol/wrapper.txt)', '', '```', r.wrapper.trimEnd(), '```', '');
  L.push('## Penjaga .pen lama', '');
  L.push(`- ${r.penGuard.files} file \`.pen\` di-md5 sebelum iterasi. Berubah: ${r.penGuard.changed.join(', ') || 'tidak ada'}; hilang: ${r.penGuard.removed.join(', ') || 'tidak ada'}; baru: ${r.penGuard.added.length}.`);
  L.push(`- \`systemctl --user is-active lakard\` sesudah iterasi: ${r.lakardActiveAfter}`, '');
  if (r.notes.length) {
    L.push('## Catatan', '');
    for (const n of r.notes) L.push(`- ${n}`);
    L.push('');
  }
  return `${L.join('\n').trimEnd()}\n`;
}

export function renderPracticeJson(r: PracticeReport): string {
  return `${JSON.stringify(r, null, 1)}\n`;
}

/** Teks prompt hasil render (pembungkus beku + prompt latihan). */
export const renderPractice = (protocol: Protocol, p: PracticePrompt): string => renderWith(protocol.wrapper, p.text);

/** C7 prompt latihan hasil render (murni): frasa Kriteria/Prosedur/Risiko golden A–E dan token terlarang. */
export function practicePromptC7Problems(rendered: string, goldenMd: string): string[] {
  const phrases = forbiddenPhrases(forbiddenSources(goldenMd, ['A', 'B', 'C', 'D', 'E']));
  if (!phrases.size) return ['sumber terlarang golden-set tidak ditemukan'];
  const joined = ` ${words(rendered).join(' ')} `;
  const out = [...phrases].filter((p) => joined.includes(` ${p} `)).map((p) => `frasa terlarang "${p}"`);
  for (const re of FORBIDDEN_TOKENS) {
    const m = rendered.match(re);
    if (m) out.push(`token terlarang "${m[0]}"`);
  }
  return out;
}

/** Penjaga rubrik (murni): versi Lampiran B = rubric.json = 2.1 dan sha Lampiran B = snapshot. */
export function practiceRubricProblems(designMd: string, rubric: RubricJson | undefined): string[] {
  const out: string[] = [];
  const v = rubricVersionOf(designMd)?.version;
  if (!rubric) return ['bench/rubric/rubric.json tidak ada'];
  if (rubric.version !== PRACTICE_RUBRIC_VERSION) out.push(`rubric.json versi ${rubric.version} ≠ ${PRACTICE_RUBRIC_VERSION}`);
  if (v !== rubric.version) out.push(`versi Lampiran B ${v ?? '(tanpa baris versi)'} ≠ rubric.json ${rubric.version}`);
  const s = sha256(lampiranB(designMd));
  if (s !== rubric.sourceSha256['lampiran-b.md']) out.push(`sha256 Lampiran B ${s} ≠ rubric.json ${rubric.sourceSha256['lampiran-b.md'] ?? '(tidak ada)'}`);
  return out;
}

export type PracticeJudgeTexts = Record<string, { text: string; secret: string; sha256: string; rubricVersion: string | undefined }>;

/** Teks juri per prompt latihan (tanpa kriteria golden) + penjaga bocor dan C7. Gagal → Abort. */
export function preparePracticeJudgeTexts(protocol: Protocol, prompts: readonly PracticePrompt[], designMd: string): PracticeJudgeTexts {
  const targets = [...c7Targets(protocol), ...prompts.map((p) => ({ name: `prompt latihan ${p.id} (hasil render)`, text: renderPractice(protocol, p) }))];
  const out: PracticeJudgeTexts = {};
  for (const p of prompts) {
    const t = buildJudgeTextWith(designMd, undefined, p.text);
    const leaks = judgeLeaks(t.text);
    if (leaks.length) throw new Abort(`teks juri ${p.id} bocor: ${leaks.join('; ')}`);
    const c7 = judgeC7Problems(t.secret, targets);
    if (c7.length) throw new Abort(`C7 juri ${p.id} gagal:\n  ${c7.join('\n  ')}`);
    out[p.id] = { ...t, sha256: sha256(t.text) };
  }
  return out;
}

/** Jumlah biaya run (`<P>-<alat>/run.json`) + juri (`judge/<P>/rep-k/rep.json`) yang tersimpan di satu iterasi; tanpa apa pun → undefined. */
function storedIterationCost(dir: string): number | undefined {
  if (!existsSync(dir)) return undefined;
  let usd = 0;
  let found = false;
  for (const d of readdirSync(dir)) {
    const rec = readJson<StoredRun>(runRecordPath(join(dir, d)));
    if (typeof rec?.costUsd === 'number') ((usd += rec.costUsd), (found = true));
  }
  const judgeDir = join(dir, 'judge');
  if (existsSync(judgeDir))
    for (const p of readdirSync(judgeDir))
      for (const k of [1, 2, 3]) {
        const rep = readJson<JudgeRepRecord>(join(judgeDir, p, `rep-${k}`, 'rep.json'));
        if (typeof rep?.costUsd === 'number') ((usd += rep.costUsd), (found = true));
      }
  return found ? Math.round(usd * 100) / 100 : undefined;
}

function readJson<T>(f: string): T | undefined {
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as T) : undefined;
}

export async function practiceMain(argv: string[]): Promise<number> {
  const parsed = parsePracticeArgs(argv);
  if (!parsed.ok) {
    console.error(`practice: ${parsed.error}\n${PRACTICE_USAGE}`);
    return 64;
  }
  const { iter, only, reusePendev, resume, dryRun } = parsed.value;
  const series = SERIES[parsed.value.series];
  const mdPath = join(BENCH_ROOT, `${series.reportPrefix}-${iter}.md`);
  const iterDir = join(series.runsRoot, String(iter));
  if ((existsSync(mdPath) || existsSync(join(iterDir, 'frozen.json'))) && !resume && !dryRun) {
    console.error(`practice: ${relative(REPO_ROOT, mdPath)} atau ${relative(REPO_ROOT, iterDir)} sudah ada; pakai --resume (hanya run aborted/invalid yang diulang)`);
    return 64;
  }

  // ---------- preflight ----------
  let all: PracticePrompt[];
  let promptsSha: string;
  try {
    ({ prompts: all, sha256: promptsSha } = loadPracticePrompts(series.promptsPath, series.sha));
  } catch (e) {
    throw new Abort(errorMessage(e));
  }
  const sel = selectPrompts(all, only);
  if (sel.problems.length) throw new Abort(sel.problems.join('; '));
  const prompts = sel.prompts;
  log(`prompt latihan beku: sha256 ${promptsSha.slice(0, 12)}… = konstanta; ${prompts.map((p) => p.id).join(', ')}`);
  // Mode pakai ulang: pen.dev tidak dijalankan atau disentuh, jadi pen-desktop tidak wajib hidup (penjaga md5 .pen tetap).
  const pre = preflight({ requirePenDesktop: reusePendev === undefined });
  const { protocol } = pre;
  const cfg = protocol.config;
  if (!existsSync(DESIGN_MD_PATH)) throw new Abort(`DESIGN.md tidak ada (${DESIGN_MD_PATH})`);
  if (!existsSync(GOLDEN_SET_PATH)) throw new Abort(`golden-set.md tidak ada (${GOLDEN_SET_PATH})`);
  const designMd = readFileSync(DESIGN_MD_PATH, 'utf8');
  const goldenMd = readFileSync(GOLDEN_SET_PATH, 'utf8');
  const rubric = readRubricJson();
  const rp = practiceRubricProblems(designMd, rubric);
  if (rp.length) throw new Abort(`rubrik juri bergeser: ${rp.join('; ')}`);
  log(`rubrik juri ${rubric!.version}; Lampiran B = snapshot`);
  for (const p of prompts) {
    const c7 = practicePromptC7Problems(renderPractice(protocol, p), goldenMd);
    if (c7.length) throw new Abort(`C7 prompt latihan ${p.id}: ${c7.join('; ')}`);
  }
  const judgeTexts = preparePracticeJudgeTexts(protocol, prompts, designMd);
  log('teks juri latihan: tanpa nama alat/path; C7 juri lulus (protokol, skill, server MCP, prompt A/B dan latihan)');
  const client = new LakardClient();
  let status: LakardStatus;
  try {
    status = await client.status();
  } catch (e) {
    throw new Abort(`lakard: ${errorMessage(e)}`);
  }
  const lp = lakarPreflightProblems(status, mcpServerNames());
  if (lp.length) throw new Abort(`preflight Lakar: ${lp.join('; ')}`);

  // Pakai ulang pen.dev: iterasi sumber lengkap atau Abort sebelum spawn.
  const reuseDir = reusePendev ? join(series.runsRoot, String(reusePendev)) : undefined;
  if (reuseDir) {
    const srcFrozen = readJson<{ frozen: PracticeFrozen }>(join(reuseDir, 'frozen.json'));
    const problems = pendevReuseProblems(reusePendev!, prompts.map((p) => p.id), (id) => {
      const rec = readJson<StoredRun>(join(reuseDir, `${id}-pendev`, 'run.json'));
      return { exists: Boolean(rec), status: rec?.status, wallMs: rec?.wallMs, strip: existsSync(join(reuseDir, `${id}-pendev.png`)), ...(srcFrozen?.frozen.reusePendev ? { reusedFrom: srcFrozen.frozen.reusePendev } : {}) };
    });
    if (problems.length) throw new Abort(`iterasi sumber pen.dev tidak lengkap:\n  ${problems.join('\n  ')}`);
  }

  // Biaya: iterasi sebelumnya + yang sudah terpakai di iterasi ini (resume) + perkiraan sisa ≤ anggaran.
  const prev = previousCosts(iter, (j) => readJson(join(BENCH_ROOT, `${series.reportPrefix}-${j}.json`)), (j) => storedIterationCost(join(series.runsRoot, String(j))));
  const doneRuns = new Set<string>();
  let spentHere = 0;
  for (const p of prompts)
    for (const t of TOOLS) {
      if (t === 'pendev' && reuseDir) continue;
      const rec = readJson<StoredRun>(runRecordPath(join(iterDir, `${p.id}-${t}`)));
      if (rec && isFinalRun(rec)) {
        doneRuns.add(`${p.id}-${t}`);
        spentHere += rec.costUsd ?? 0;
      }
    }
  const doneJudge = new Set<string>();
  for (const p of prompts) {
    const reps = [1, 2, 3].map((k) => readJson<JudgeRepRecord>(join(iterDir, 'judge', p.id, `rep-${k}`, 'rep.json')));
    spentHere += reps.reduce((s, x) => s + (x?.costUsd ?? 0), 0);
    if (reps.every((x) => x && x.status !== 'invalid')) doneJudge.add(p.id);
  }
  const estimate = estimateCost({ prompts: prompts.map((p) => p.id), reusePendev: Boolean(reuseDir), doneRuns, doneJudge });
  const budget = budgetProblem(prev.total + spentHere, estimate, series.budgetUsd);

  const head = git(REPO_ROOT, ['rev-parse', 'HEAD']);
  const porcelain = gitPorcelain(REPO_ROOT, ['packages', 'tools', 'bench/src', 'bench/protocol', '.mcp.json']);
  const emptyMcpPath = join(iterDir, 'judge', 'mcp-empty.json');
  const argvFor = (mcp: string, allowed: string, prompt = '<prompt hasil render>') => shellQuote(['claude', ...buildArgs({ prompt, config: cfg, mcpConfig: mcp, allowedTools: allowed })]);
  const judgeArgv = shellQuote(['claude', ...buildJudgeArgs(cfg.model, relative(REPO_ROOT, emptyMcpPath))]);
  const archiveDir = join(RUNS_ROOT, 'lakar-archive', `${series.reportPrefix}-${iter}-${stamp()}`);
  const archiveSources = benchLakarSources([ROUNDS_RUNS, PRACTICE_RUNS, EFFECTS_RUNS], { root: series.runsRoot, id: String(iter) });
  const archivePlan = planLakarArchive(status.dataDir, [...new Set(archiveSources.map((x) => x.slug))], archiveDir);

  console.log(`${series.id === 'practice' ? 'practice' : `practice seri ${series.id}`} iterasi ${iter}${reusePendev ? ` (pen.dev dipakai ulang dari iterasi ${reusePendev})` : ''}`);
  console.log(`prompts.json sha256 ${promptsSha} (beku: sama); protocolHash ${protocol.hash}; rubrik ${rubric!.version} (Lampiran B = snapshot)`);
  console.log(`C7 prompt latihan: lulus; C7 juri: lulus\ngit HEAD ${head}; porcelain packages/tools/bench: ${porcelain ? `TIDAK KOSONG\n${porcelain}` : 'kosong'}`);
  for (const p of prompts) {
    const rendered = renderPractice(protocol, p);
    console.log(`\n=== ${p.id} ${p.name} (${p.kind}, ${sizeText(p.size)}) ===`);
    console.log(`teks juri sha256 ${judgeTexts[p.id]!.sha256}`);
    console.log(`argv Lakar:\n${argvFor(LAKAR_MCP_CONFIG, LAKAR_ALLOWED_TOOLS, rendered)}`);
    console.log(reuseDir ? `pen.dev: dipakai ulang dari ${relative(REPO_ROOT, join(reuseDir, `${p.id}-pendev`))}` : `argv pen.dev:\n${argvFor(PENDEV_MCP_CONFIG, PENDEV_ALLOWED_TOOLS, rendered)}`);
  }
  console.log(`\n=== argv juri (stdin: satu pesan stream-json teks + gambar) ===\n${judgeArgv}`);
  console.log(
    `\nbiaya: iterasi sebelumnya ${Object.entries(prev.byIter).map(([j, c]) => `${j}: $${c.toFixed(2)}`).join(', ') || '–'}; terpakai di iterasi ini $${spentHere.toFixed(2)}; perkiraan sisa $${estimate.toFixed(2)} (per prompt: pen.dev $${COST_ESTIMATE.pendev}, Lakar $${COST_ESTIMATE.lakar}, juri $${COST_ESTIMATE.judge}); anggaran $${series.budgetUsd}: ${budget ?? 'cukup'}`,
  );
  if (series.restartPenDesktop)
    console.log(
      reuseDir
        ? '\nrestart pen-desktop: tidak (pen.dev dipakai ulang)'
        : `\nrestart pen-desktop: sekali sesudah run pen.dev terakhir iterasi ini, sebelum juri; tunggu active + MCP pencil menjawab (maks ${PEN_RESTART_LIMIT_S} dtk); hasil dicatat di laporan${dryRun ? ' (dry-run: tidak dijalankan)' : ''}`,
    );
  console.log(`\narsip dokumen Lakar bench lama (lalu restart lakard, wajib): ${describeLakarArchive(status.dataDir, archivePlan, archiveSources)}`);
  if (dryRun) return 0;
  if (budget) throw new Abort(budget);

  // ---------- arsip + restart lakard (wajib) ----------
  if (archivePlan.length) {
    applyLakarArchive(archivePlan);
    log(`arsip: ${archivePlan.length} entri dokumen bench lama dipindah ke ${relative(REPO_ROOT, archiveDir)}`);
  }
  const oldPid = status.pid;
  log('restart lakard');
  restartUserUnit(LAKARD_UNIT);
  status = await waitLakard(client, oldPid);
  const lp2 = lakarPreflightProblems(status, mcpServerNames());
  if (lp2.length) throw new Abort(`preflight Lakar sesudah restart: ${lp2.join('; ')}`);
  const distMs = newestDistMtime();
  if (distMs === undefined || !(Date.parse(status.startedAt) > distMs))
    throw new Abort(`lakard basi: startedAt ${status.startedAt} tidak lebih baru dari file dist terbaru ${distMs === undefined ? '(dist tidak ada)' : new Date(distMs).toISOString()}`);
  log(`lakard di-restart (pid ${oldPid} → ${status.pid}), startedAt ${status.startedAt} > dist terbaru`);
  const notes: string[] = [
    archivePlan.length
      ? `Sebelum run: dokumen Lakar bench lain dipindah ke \`${relative(REPO_ROOT, archiveDir)}\` (${[...new Set(archivePlan.map((x) => x.slug))].join(', ')}), lalu lakard di-restart (pid ${oldPid} → ${status.pid}).`
      : `Sebelum run: lakard di-restart (pid ${oldPid} → ${status.pid}); arsip dokumen kosong.`,
  ];

  // ---------- frozen ----------
  mkdirSync(join(iterDir, 'judge'), { recursive: true });
  if (!existsSync(emptyMcpPath)) writeFileSync(emptyMcpPath, EMPTY_MCP);
  const frozenNow: PracticeFrozen = {
    head,
    porcelain,
    protocolHash: protocol.hash,
    wrapperSha256: sha256(protocol.wrapper),
    promptsSha256: promptsSha,
    model: cfg.model,
    claude: pre.claudeVersion,
    pendevDesktop: penDesktopVersion(),
    lakard: { version: status.version, schemaVersion: status.schemaVersion, pid: status.pid, startedAt: status.startedAt, browser: status.pool?.browserVersion, node: status.node },
    skills: Object.fromEntries(readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.md')).sort().map((f) => [f, sha256(readFileSync(join(SKILLS_DIR, f)))])),
    distSha: Object.fromEntries(distDirs().map(([n, d]) => [n, sha256Dir(d)])),
    rubric: { version: rubric!.version, lampiranBSha256: sha256(lampiranB(designMd)) },
    judge: { model: cfg.model, argv: judgeArgv, textSha256: Object.fromEntries(Object.entries(judgeTexts).map(([id, t]) => [id, t.sha256])) },
    reusePendev,
  };
  const frozenFile = join(iterDir, 'frozen.json');
  let frozenFirst: { date: string; frozen: PracticeFrozen };
  const startedIso = new Date().toISOString();
  if (existsSync(frozenFile)) {
    frozenFirst = JSON.parse(readFileSync(frozenFile, 'utf8'));
    const drift = practiceDrift(frozenFirst.frozen, frozenNow);
    notes.push(`Laporan dibuat ulang ${startedIso} (--resume); versi beku dari awal iterasi ${frozenFirst.date}.${drift.length ? ` Berbeda saat --resume: ${drift.join('; ')}.` : ' Tidak ada perbedaan versi.'}`);
  } else {
    frozenFirst = { date: startedIso, frozen: frozenNow };
    writeFileSync(frozenFile, `${JSON.stringify(frozenFirst, null, 1)}\n`, { flag: 'wx' });
  }
  if (frozenFirst.frozen.promptsSha256 !== series.sha) throw new Abort(`frozen.json: prompts sha ${frozenFirst.frozen.promptsSha256} ≠ beku`);

  const penBefore = md5PenFiles();
  writeFileSync(join(iterDir, `pen-before-${stamp()}.json`), `${JSON.stringify(penBefore, null, 1)}\n`);
  log(`md5 ${Object.keys(penBefore).length} file .pen lama dicatat`);

  // ---------- run: per prompt pen.dev lalu Lakar ----------
  const prevUris: string[] = [];
  const runs = new Map<string, RoundRun>();
  const mcpVersion: { v?: string } = {};
  let fatal: string | undefined;
  let pendevRan = 0;
  outer: for (const p of prompts) {
    for (const tool of ['pendev', 'lakar'] as const) {
      const key = `${p.id}-${tool}`;
      if (tool === 'pendev' && reuseDir) {
        const rec = readJson<StoredRun>(runRecordPath(join(reuseDir, key)))!;
        if (rec.uri) prevUris.push(rec.uri);
        runs.set(key, roundRunFrom(reuseDir, key, p.id, tool, rec, []));
        continue;
      }
      const dir = join(iterDir, key);
      const previous = readdirSync(iterDir).filter((x) => x.startsWith(`${key}.prev-`)).sort().map((d) => relative(REPO_ROOT, join(iterDir, d)));
      const stored = readJson<StoredRun>(runRecordPath(dir));
      if (stored && isFinalRun(stored)) {
        log(`${key}: dipakai ulang (${stored.status})`);
        if (stored.uri) prevUris.push(stored.uri);
        runs.set(key, roundRunFrom(iterDir, key, p.id, tool, stored, previous));
        if (stored.status === 'invalid') {
          fatal = `${key} invalid: ${stored.reason}`;
          break outer;
        }
        continue;
      }
      if (existsSync(dir)) {
        const moved = `${dir}.prev-${stamp()}`;
        renameSync(dir, moved);
        previous.push(relative(REPO_ROOT, moved));
        log(`${key}: percobaan sebelumnya dipindah ke ${relative(REPO_ROOT, moved)}`);
      }
      const runId = `${series.reportPrefix}-${iter}-${key}`;
      const rendered = renderPractice(protocol, p);
      let rec: StoredRun;
      log(`${key}: mulai`);
      if (tool === 'pendev') {
        pendevRan++;
        const before = systemdShow('pen-desktop', false);
        try {
          rec = await runOne({ pre, runId, prompt: rendered, promptId: p.id, attempt: 1, outDir: dir, prevUris }, mcpVersion);
        } catch (e) {
          mkdirSync(dir, { recursive: true });
          rec = { ...emptyRecord({ runId, promptId: p.id, attempt: 1 }), status: harnessErrorStatus(existsSync(join(dir, 'stream.jsonl'))), reason: `harness: ${errorMessage(e)}` };
        }
        rec.pendevSystemd = { before, after: systemdShow('pen-desktop', false) };
      } else {
        try {
          rec = await runLakar({ runId, prompt: rendered, promptId: p.id, outDir: dir, config: cfg, client });
        } catch (e) {
          mkdirSync(dir, { recursive: true });
          rec = { ...emptyRecord({ runId, promptId: p.id, attempt: 1 }), status: harnessErrorStatus(existsSync(join(dir, 'stream.jsonl'))), reason: `harness: ${errorMessage(e)}` };
        }
      }
      writeFileSync(runRecordPath(dir), `${JSON.stringify(rec, null, 1)}\n`);
      runs.set(key, roundRunFrom(iterDir, key, p.id, tool, rec, previous));
      if (rec.status === 'aborted' || rec.status === 'invalid') {
        fatal = `${key} ${rec.status}: ${rec.reason}`;
        log(`iterasi berhenti: ${fatal}`);
        break outer;
      }
    }
  }

  // ---------- restart pen-desktop (seri practice dan efek): sesudah run pen.dev terakhir, sebelum juri ----------
  let penDesktopRestart: PenDesktopRestart | string | undefined;
  if (series.restartPenDesktop) {
    const step = await penDesktopRestartStep({
      pendevRan,
      reusedFrom: reuseDir ? `iterasi ${reusePendev}` : undefined,
      file: join(iterDir, 'pen-desktop-restart.json'),
      restart: () => {
        log('restart pen-desktop (sesudah run pen.dev terakhir)');
        return restartPenDesktopAfterSeries(
          penDesktopRestartDeps(async () => {
            const c = await PencilClient.connect(pre.server);
            try {
              await c.appState();
            } finally {
              await c.close().catch(() => undefined);
            }
          }),
        );
      },
    });
    penDesktopRestart = step.result;
    if (step.ran && typeof penDesktopRestart !== 'string') {
      log(`restart pen-desktop: ${penDesktopRestart.ok ? 'berhasil' : 'GAGAL'} (${(penDesktopRestart.ms / 1000).toFixed(1)} dtk; ${penDesktopRestart.detail})`);
      if (!penDesktopRestart.ok) notes.push(`Restart pen-desktop GAGAL: ${penDesktopRestart.detail}. Juri tetap dijalankan.`);
    }
  }

  // ---------- strip + juri + keputusan ----------
  const results: PracticePromptResult[] = [];
  let judgeCost = 0;
  for (const p of prompts) {
    const r: Partial<Record<Tool, RoundRun>> = { lakar: runs.get(`${p.id}-lakar`), pendev: runs.get(`${p.id}-pendev`) };
    const images: Partial<Record<Tool, DesignImages>> = {};
    const pngs: Record<Tool, string | undefined> = { lakar: undefined, pendev: undefined };
    for (const t of TOOLS) {
      const run = r[t];
      if (!run) continue;
      try {
        if (t === 'pendev' && reuseDir) {
          const path = join(reuseDir, `${run.key}.png`);
          images.pendev = judgeImagesFromStripPng(readFileSync(path));
          const sz = readPngSizeFile(path);
          run.strip = { path: relative(REPO_ROOT, path), width: sz.width, height: sz.height, boards: run.record.frames.length };
        } else {
          const im = writeStrip(iterDir, run);
          if (im) images[t] = im;
        }
      } catch (e) {
        notes.push(`strip ${run.key} gagal: ${errorMessage(e)}`);
      }
      if (t === 'pendev') pngs.pendev = run.strip?.path;
      if (t === 'lakar' && run.strip) {
        const dest = join(series.pngDir, String(iter), `${p.id}-lakar.png`);
        try {
          log(`PNG ${relative(REPO_ROOT, dest)}: ${copyPngExclusive(join(REPO_ROOT, run.strip.path), dest)}`);
          pngs.lakar = relative(REPO_ROOT, dest);
        } catch (e) {
          fatal ??= `PNG Lakar ${run.key}: ${errorMessage(e)}`;
        }
      }
    }
    const lakarRec = r.lakar?.record;
    const pendevRec = r.pendev?.record;
    const sizeProblems = lakarRec?.lakar ? boardSizeProblemsFor(p.size, lakarRec.lakar.boards) : [];
    const pendevSizeProblems = pendevRec ? boardSizeProblemsFor(p.size, pendevRec.frames) : [];
    const gate = lakarRec ? lakarGate({ promptId: p.id, layoutGate: lakarRec.lakar?.layout?.summary.gate, sizeProblems, wallMs: lakarRec.wallMs, baselineMedianMs: pendevRec?.wallMs }) : undefined;
    let reps: JudgeRepRecord[] = [];
    if (!fatal && images.lakar && images.pendev)
      try {
        const j = await judgePrompt({
          prompt: p.id,
          jdir: join(iterDir, 'judge', p.id),
          text: judgeTexts[p.id]!.text,
          images: { lakar: images.lakar, pendev: images.pendev },
          emptyMcpConfig: emptyMcpPath,
          config: cfg,
          forbiddenCwdRoot: REPO_ROOT,
          reuse: (old) => old.status !== 'invalid',
        });
        reps = j.reps;
        fatal ??= j.fatal;
      } catch (e) {
        fatal = `juri ${p.id}: harness: ${errorMessage(e)}`;
        log(`iterasi berhenti: ${fatal}`);
      }
    const jc = reps.reduce((s, x) => s + x.costUsd, 0);
    judgeCost += jc;
    const score = reps.length ? aggregateScores(p.id, reps) : undefined;
    const decided: DecisionResult = !r.lakar
      ? { decision: 'tidak dapat dinilai', why: 'run Lakar tidak dijalankan (iterasi berhenti lebih awal)' }
      : decide({ gate: gate!, lakarRunOk: lakarRec?.status === 'success', pendevRunOk: pendevRec?.status === 'success', score, pendevBrief: { sizeProblems: pendevSizeProblems } });
    const decision = !reps.length && fatal && decided.why === NO_VALID_REPS ? { ...decided, why: `juri tidak dijalankan: iterasi dihentikan (${fatal})` } : decided;
    results.push({
      id: p.id,
      name: p.name,
      kind: p.kind,
      size: p.size,
      judgeTextSha256: judgeTexts[p.id]?.sha256,
      runs: r,
      pendevReusedFrom: reusePendev,
      gate,
      sizeProblems,
      pendevSizeProblems,
      score,
      decision,
      emoji: { lakar: emojiOf(r.lakar, score?.tools.lakar.emoji, 'lakar'), pendev: emojiOf(r.pendev, score?.tools.pendev.emoji, 'pendev') },
      pngs,
      cost: { lakar: lakarRec?.costUsd, pendev: pendevRec?.costUsd, pendevCounted: !reuseDir, judge: jc },
    });
  }

  // ---------- penjaga .pen + laporan ----------
  const cmp = comparePenHashes(penBefore, md5PenFiles());
  const outcome = practiceOutcome(results, all.map((p) => p.id), passMinOf(series, all.length));
  const sum = (f: (x: PracticePromptResult) => number | undefined) => results.reduce((s, x) => s + (f(x) ?? 0), 0);
  const cost = { pendev: sum((x) => (x.cost.pendevCounted ? x.cost.pendev : 0)), lakar: sum((x) => x.cost.lakar), judge: judgeCost };
  const iterationCost = cost.pendev + cost.lakar + cost.judge;
  const statusReasons: string[] = [];
  if (fatal) statusReasons.push(`dihentikan: ${fatal}`);
  if (cmp.changed.length || cmp.removed.length) statusReasons.push(`.pen lama berubah/hilang: ${[...cmp.changed, ...cmp.removed].join(', ')}`);
  const complete = results.every((x) => x.score?.reps.length === JUDGE_REPS) && prompts.length === all.length;
  if (!statusReasons.length && !complete) {
    if (prompts.length !== all.length) statusReasons.push(`--only ${prompts.map((p) => p.id).join(',')}: bukan semua prompt`);
    for (const x of results) if (x.score?.reps.length !== JUDGE_REPS) statusReasons.push(`${x.id} tanpa juri lengkap: ${x.decision.decision} (${x.decision.why})`);
  }
  const firstReport = series.compareWithFirst && iter > 1 ? readJson<PracticeReport>(join(BENCH_ROOT, `${series.reportPrefix}-1.json`)) : undefined;
  const report: PracticeReport = {
    ...(series.id === 'practice' ? {} : { series: series.id }),
    iter,
    date: frozenFirst.date,
    status: fatal || cmp.changed.length || cmp.removed.length ? 'dibatalkan' : complete ? 'lengkap' : 'tidak lengkap',
    statusReasons,
    frozen: frozenFirst.frozen,
    wrapper: protocol.wrapper,
    argv: { lakar: argvFor(relative(REPO_ROOT, LAKAR_MCP_CONFIG), LAKAR_ALLOWED_TOOLS), pendev: argvFor(relative(REPO_ROOT, PENDEV_MCP_CONFIG), PENDEV_ALLOWED_TOOLS), judge: judgeArgv },
    results,
    outcome,
    cost: { ...cost, iteration: iterationCost, previous: prev.byIter, cumulative: prev.total + iterationCost, budget: series.budgetUsd },
    penGuard: { files: Object.keys(penBefore).length, changed: cmp.changed, removed: cmp.removed, added: cmp.added },
    lakardActiveAfter: isActive(LAKARD_UNIT, true),
    notes,
    ...(penDesktopRestart !== undefined ? { penDesktopRestart } : {}),
    ...(series.compareWithFirst && iter > 1 ? { comparison: beforeAfter(firstReport?.results, results) } : {}),
  };
  writeFileSync(mdPath, renderPracticeMarkdown(report));
  writeFileSync(join(BENCH_ROOT, `${series.reportPrefix}-${iter}.json`), renderPracticeJson(report));
  for (const x of results) log(`${x.id}: ${x.decision.decision} (${x.decision.why})`);
  log(`laporan: ${relative(REPO_ROOT, mdPath)} (${report.status}; ${outcome.pass ? 'lulus' : 'belum lulus'}; biaya $${iterationCost.toFixed(2)}, kumulatif $${report.cost.cumulative.toFixed(2)})`);
  if (report.status === 'dibatalkan') return 1;
  if (report.status !== 'lengkap') return 2;
  return 0;
}
