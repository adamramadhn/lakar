import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BASELINE_FILE, baselineBaseName, baselineOutputPaths, existingOutputs, baselineProblems, indexBaselines, loadBaselines, parsePendevBaselineArgs, promptsWithoutValidBaseline } from './baselines.js';
import { loadProtocol, promptHashes } from './protocol.js';
import { seriesOutcome } from './series.js';
import type { RunRecord } from './report.js';

const json = (hashes: Record<string, string> | undefined, date: string, extra: Record<string, unknown> = {}) => ({
  date,
  model: 'claude-opus-5-5',
  claudeVersion: '2.1.325',
  toolVersions: { 'pen.dev desktop (X-AppImage-Version)': '1.2.23' },
  ...(hashes ? { promptHashes: hashes } : {}),
  runsPerPrompt: 3,
  summary: Object.keys(hashes ?? { A: '' }).map((prompt) => ({ prompt, successes: 3, wallMs: { median: 1000 * prompt.charCodeAt(0) }, costUsd: { median: 0.5 } })),
  ...extra,
});

describe('indeks baseline per prompt', () => {
  it('baseline G0 termigrasi di repo: A/B = hash per prompt protokol saat ini; C–E belum diukur', () => {
    const protocol = loadProtocol();
    const idx = loadBaselines();
    expect(idx.fileProblems).toEqual([]);
    expect(idx.byPrompt.A).toMatchObject({ source: 'bench/baseline-pendev.json', model: 'claude-opus-5-5', claude: '2.1.325', pendevDesktop: '1.2.23' });
    expect(idx.byPrompt.A!.medianWallMs).toBeCloseTo(167296.132408);
    const now = { promptHashes: promptHashes(protocol) };
    expect(baselineProblems(idx, now, ['A', 'B'])).toEqual([]);
    expect(baselineProblems(idx, now, protocol.config.promptIds)).toEqual(['baseline C, D, E belum diukur']);
    expect(promptsWithoutValidBaseline(idx, { ...now, model: 'claude-opus-5-5', claude: '2.1.325 (Claude Code)', pendevDesktop: '1.2.23' }, protocol.config.promptIds)).toEqual(['C', 'D', 'E']);
  });

  it('dua baseline mencakup prompt: date terbaru dipakai, yang lain tercatat tergantikan', () => {
    const idx = indexBaselines([
      { source: 'bench/baseline-pendev-ACDE-2026-11-21.json', json: json({ A: 'a2', C: 'c' }, '2026-11-21T00:00:00.000Z') },
      { source: 'bench/baseline-pendev.json', json: json({ A: 'a1', B: 'b' }, '2026-11-17T00:00:00.000Z') },
    ]);
    expect(idx.byPrompt.A!.source).toBe('bench/baseline-pendev-ACDE-2026-11-21.json');
    expect(idx.byPrompt.B!.source).toBe('bench/baseline-pendev.json');
    expect(idx.superseded.map((x) => `${x.prompt}:${x.source}`)).toEqual(['A:bench/baseline-pendev.json']);
    expect(baselineProblems(idx, { promptHashes: { A: 'a1', B: 'b', C: 'c' } }, ['A', 'B', 'C'])).toEqual(['hash prompt A a1 ≠ baseline a2 (bench/baseline-pendev-ACDE-2026-11-21.json)']);
  });

  it('tanpa promptHashes = masalah file (tanpa fallback); prompt tidak lengkap tidak dipakai; file rusak = masalah', () => {
    const idx = indexBaselines([
      { source: 'bench/baseline-pendev.json', json: json(undefined, '2026-11-17T00:00:00.000Z', { protocolHash: 'x' }) },
      { source: 'bench/baseline-pendev-CD-2026-11-20.json', json: json({ C: 'c', D: 'd' }, '2026-11-20', { summary: [{ prompt: 'C', successes: 3 }, { prompt: 'D', successes: 2 }] }) },
      { source: 'bench/baseline-pendev-E-2026-11-20.json', error: 'Unexpected token' },
    ]);
    expect(idx.fileProblems).toEqual([
      'bench/baseline-pendev.json: tanpa promptHashes (hash protokol utuh tidak dipakai sebagai penjaga; migrasikan atau ukur ulang)',
      'bench/baseline-pendev-E-2026-11-20.json: tidak terbaca (Unexpected token)',
    ]);
    expect(Object.keys(idx.byPrompt)).toEqual(['C']);
    expect(idx.incomplete).toEqual(['bench/baseline-pendev-CD-2026-11-20.json: prompt D sukses 2 < 3']);
    expect(baselineProblems(idx, { promptHashes: { C: 'c', D: 'd' } }, ['C', 'D'])).toHaveLength(3);
    // Masalah file tidak membuat prompt lain dianggap tanpa baseline sah.
    expect(promptsWithoutValidBaseline(idx, { promptHashes: { C: 'c', D: 'd' } }, ['C', 'D'])).toEqual(['D']);
  });

  it('versi diperiksa per prompt bila diberikan', () => {
    const idx = indexBaselines([{ source: 'bench/b.json', json: json({ A: 'a' }, '2026-11-17') }]);
    const now = { promptHashes: { A: 'a' } };
    expect(baselineProblems(idx, { ...now, model: 'claude-opus-5-5', claude: '2.1.325 (Claude Code)', pendevDesktop: '1.2.23' }, ['A'])).toEqual([]);
    expect(baselineProblems(idx, { ...now, claude: '2.1.326' }, ['A'])).toEqual(['claude A: 2.1.326 ≠ baseline 2.1.325 (bench/b.json); baseline pen.dev tidak sebanding']);
    expect(baselineProblems(idx, { ...now, pendevDesktop: null }, ['A'])).toEqual(['pen.dev desktop A: (tidak terbaca) ≠ baseline 1.2.23 (bench/b.json); baseline pen.dev tidak sebanding']);
  });

  it('nama file baseline per prompt dan pola indeks', () => {
    expect(baselineBaseName(['C', 'D', 'E'], '2026-11-19')).toBe('baseline-pendev-CDE-2026-11-19');
    for (const ok of ['baseline-pendev.json', 'baseline-pendev-CDE-2026-11-19.json', 'baseline-pendev-A-2026-11-30.json']) expect(BASELINE_FILE.test(ok), ok).toBe(true);
    for (const bad of ['baseline-pendev.md', 'baseline-pendev-cde-2026-11-19.json', 'baseline-pendev-CDE.json']) expect(BASELINE_FILE.test(bad), bad).toBe(false);
    const dir = mkdtempSync(join(tmpdir(), 'bench-baselines-'));
    try {
      writeFileSync(join(dir, 'baseline-pendev.json'), JSON.stringify(json({ A: 'a' }, '2026-11-17')));
      writeFileSync(join(dir, 'baseline-pendev-C-2026-11-20.json'), JSON.stringify(json({ C: 'c' }, '2026-11-20')));
      writeFileSync(join(dir, 'baseline-pendev-C-2026-11-20.md'), '# bukan json');
      writeFileSync(join(dir, 'baseline-pendev-D-2026-11-20.json'), '{rusak');
      const idx = loadBaselines(dir);
      expect(idx.files).toEqual(['bench/baseline-pendev-C-2026-11-20.json', 'bench/baseline-pendev-D-2026-11-20.json', 'bench/baseline-pendev.json']);
      expect(Object.keys(idx.byPrompt).sort()).toEqual(['A', 'C']);
      expect(idx.fileProblems).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('pendev-baseline per prompt', () => {
  const ids = ['A', 'B', 'C', 'D', 'E'];
  it('argumen --prompts (urut protokol) dan --dry-run', () => {
    expect(parsePendevBaselineArgs([], ids)).toEqual({ ok: true, value: { prompts: undefined, dryRun: false } });
    expect(parsePendevBaselineArgs(['--prompts', 'E,C,D', '--dry-run'], ids)).toEqual({ ok: true, value: { prompts: ['C', 'D', 'E'], dryRun: true } });
    expect(parsePendevBaselineArgs(['--', '--prompts=C'], ids)).toEqual({ ok: true, value: { prompts: ['C'], dryRun: false } });
    expect(parsePendevBaselineArgs(['--prompts', 'C,F'], ids).ok).toBe(false);
    expect(parsePendevBaselineArgs(['--prompts', 'C,C'], ids).ok).toBe(false);
    expect(parsePendevBaselineArgs(['--prompts'], ids).ok).toBe(false);
    expect(parsePendevBaselineArgs(['--x'], ids).ok).toBe(false);
  });

  it('seri hanya prompt terpilih: kelengkapan dari promptIds terpilih', () => {
    const run = (prompt: string): RunRecord => ({ prompt, status: 'success', pngScaleMismatch: false }) as RunRecord;
    const runs = ['C', 'D', 'E', 'C', 'D', 'E', 'C', 'D', 'E'].map(run);
    expect(seriesOutcome(runs, { promptIds: ['C', 'D', 'E'], runsPerPrompt: 3, maxAttemptsPerPrompt: 4 }, undefined)).toEqual({ status: 'lengkap', exitCode: 0 });
    expect(seriesOutcome(runs, { promptIds: ids, runsPerPrompt: 3, maxAttemptsPerPrompt: 4 }, undefined)).toEqual({ status: 'tidak lengkap', exitCode: 2 });
  });
});

describe('keluaran pendev-baseline eksklusif', () => {
  it('file keluaran sudah ada → terdaftar (CLI exit 64, tidak menimpa); belum ada → kosong', () => {
    const out = baselineOutputPaths('/x/bench', ['C', 'D', 'E'], '2026-11-19');
    expect(out).toEqual({ md: '/x/bench/baseline-pendev-CDE-2026-11-19.md', json: '/x/bench/baseline-pendev-CDE-2026-11-19.json' });
    expect(existingOutputs(out, () => false)).toEqual([]);
    expect(existingOutputs(out, (f) => f.endsWith('.json'))).toEqual([out.json]);
    expect(BASELINE_FILE.test('baseline-pendev-CDE-2026-11-19.json')).toBe(true);
  });
});
