import { describe, expect, it } from 'vitest';
import type { RunRecord } from './report.js';
import { isFatal, needsRun, pngScaleMismatch, seriesOutcome } from './series.js';

const RULES = { promptIds: ['A', 'B'], runsPerPrompt: 3, maxAttemptsPerPrompt: 4 };

const rec = (prompt: string, status: RunRecord['status'], pngScaleMismatch = false): RunRecord => ({
  runId: `${prompt}-${status}`,
  prompt,
  attempt: 1,
  status,
  reason: undefined,
  uri: undefined,
  uriSource: undefined,
  wallMs: undefined,
  durationMs: undefined,
  durationApiMs: undefined,
  costUsd: undefined,
  numTurns: undefined,
  toolCalls: undefined,
  firstToolUseMs: undefined,
  lastToolResultMs: undefined,
  spawnToFirstEventMs: undefined,
  frames: [],
  transcriptBytes: undefined,
  penPath: undefined,
  pngScaleMismatch,
  model: undefined,
  modelUsageKeys: [],
  claudeCodeVersion: undefined,
  startedAt: undefined,
});

const three = (p: string) => [rec(p, 'success'), rec(p, 'success'), rec(p, 'success')];

describe('seriesOutcome', () => {
  it('3 sukses per prompt → lengkap, exit 0', () => {
    expect(seriesOutcome([...three('A'), ...three('B')], RULES, undefined)).toEqual({ status: 'lengkap', exitCode: 0 });
  });

  it('dua sukses saja untuk B (setelah 4 percobaan) → tidak lengkap, exit 2', () => {
    const runs = [...three('A'), rec('B', 'success'), rec('B', 'failed'), rec('B', 'success'), rec('B', 'failed')];
    expect(needsRun(runs, 'B', RULES)).toBe(false);
    expect(seriesOutcome(runs, RULES, undefined)).toEqual({ status: 'tidak lengkap', exitCode: 2 });
  });

  it('run invalid/aborted → seri berhenti, dibatalkan, exit 1', () => {
    expect(isFatal(rec('A', 'invalid'))).toBe(true);
    expect(isFatal(rec('A', 'aborted'))).toBe(true);
    expect(isFatal(rec('A', 'failed'))).toBe(false);
    expect(seriesOutcome([rec('A', 'invalid')], RULES, 'A1 invalid: init')).toEqual({ status: 'dibatalkan', exitCode: 1 });
  });

  it('png_scale_mismatch → exit 3 (md tetap lengkap, perlu perbaikan)', () => {
    const runs = [...three('A'), rec('B', 'success'), rec('B', 'success'), rec('B', 'success', true)];
    expect(seriesOutcome(runs, RULES, undefined)).toEqual({ status: 'lengkap', exitCode: 3 });
  });
});

describe('needsRun', () => {
  it('berhenti pada 3 sukses atau 4 percobaan', () => {
    expect(needsRun([], 'A', RULES)).toBe(true);
    expect(needsRun(three('A'), 'A', RULES)).toBe(false);
    expect(needsRun([rec('A', 'failed'), rec('A', 'success'), rec('A', 'success')], 'A', RULES)).toBe(true);
  });
});

describe('pngScaleMismatch', () => {
  it('IHDR 2880 untuk frame 1440 → mismatch; ukuran sama → tidak; PNG hilang → mismatch', () => {
    expect(pngScaleMismatch({ width: 1440, height: 900 }, { width: 2880, height: 1800 })).toBe(true);
    expect(pngScaleMismatch({ width: 1440, height: 4255 }, { width: 1440, height: 4255 })).toBe(false);
    expect(pngScaleMismatch({ width: 390, height: 844.4 }, { width: 390, height: 844 })).toBe(false);
    expect(pngScaleMismatch({ width: 390, height: 844 }, undefined)).toBe(true);
  });
});
