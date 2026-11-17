// Keputusan seri yang murni (tanpa IO): run berikutnya, status laporan + exit code CLI, dan cek skala PNG.
import type { BaselineReport, RunRecord } from './report.js';

export type SeriesRules = { promptIds: readonly string[]; runsPerPrompt: number; maxAttemptsPerPrompt: number };

const successes = (runs: readonly RunRecord[], p: string) => runs.filter((r) => r.prompt === p && r.status === 'success').length;
const attempts = (runs: readonly RunRecord[], p: string) => runs.filter((r) => r.prompt === p).length;

/** Prompt yang masih perlu dijalankan: < runsPerPrompt sukses dan < maxAttemptsPerPrompt percobaan. */
export function needsRun(runs: readonly RunRecord[], p: string, rules: SeriesRules): boolean {
  return successes(runs, p) < rules.runsPerPrompt && attempts(runs, p) < rules.maxAttemptsPerPrompt;
}

/** Run `aborted`/`invalid` menghentikan seri (gagal-setup, tidak dihitung). */
export function isFatal(rec: RunRecord): boolean {
  return rec.status === 'aborted' || rec.status === 'invalid';
}

/**
 * Status laporan dan exit code CLI.
 * 1 = seri dihentikan (aborted/invalid), 2 = sukses < runsPerPrompt untuk salah satu prompt, 3 = ada png_scale_mismatch, 0 = lengkap.
 */
export function seriesOutcome(runs: readonly RunRecord[], rules: SeriesRules, fatal: string | undefined): { status: BaselineReport['status']; exitCode: number } {
  const complete = rules.promptIds.every((p) => successes(runs, p) >= rules.runsPerPrompt);
  if (fatal) return { status: 'dibatalkan', exitCode: 1 };
  if (!complete) return { status: 'tidak lengkap', exitCode: 2 };
  if (runs.some((r) => r.pngScaleMismatch)) return { status: 'lengkap', exitCode: 3 };
  return { status: 'lengkap', exitCode: 0 };
}

/** true bila PNG tidak ada atau IHDR ≠ ukuran frame (skala 1). */
export function pngScaleMismatch(frame: { width: number; height: number }, png: { width: number; height: number } | undefined): boolean {
  return !png || png.width !== Math.round(frame.width) || png.height !== Math.round(frame.height);
}
