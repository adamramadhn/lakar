import { describe, expect, it } from 'vitest';
import { renderJson, renderMarkdown, summarizeRuns, type BaselineReport, type RunRecord } from './report.js';

const run = (runId: string, prompt: string, status: RunRecord['status'], wallMs?: number, costUsd?: number, reason?: string): RunRecord => ({
  runId,
  prompt,
  attempt: Number(runId.slice(-1)),
  status,
  reason,
  uri: `file:///docs/${runId}/untitled.pen`,
  uriSource: 'pen-newdoc.sh',
  wallMs,
  durationMs: wallMs ? wallMs - 500 : undefined,
  durationApiMs: undefined,
  costUsd,
  numTurns: 6,
  toolCalls: 5,
  firstToolUseMs: 4000,
  lastToolResultMs: wallMs ? wallMs - 3000 : undefined,
  spawnToFirstEventMs: 1500,
  frames: status === 'success' ? [{ id: 'F1', name: 'Board', width: 1440, height: 4000, png: `bench/runs/pendev/${runId}/png/F1.png`, pngWidth: 1440, pngHeight: 4000 }] : [],
  transcriptBytes: 204800,
  penPath: `bench/runs/pendev/${runId}/design.pen`,
  pngScaleMismatch: false,
  model: 'claude-opus-5-5',
  modelUsageKeys: ['claude-opus-5-5'],
  claudeCodeVersion: '2.1.325',
  startedAt: '2026-11-17T12:00:00.000Z',
});

const runs = [
  run('S-A1', 'A', 'success', 90000, 0.9),
  run('S-B1', 'B', 'success', 60000, 0.5),
  run('S-A2', 'A', 'success', 120000, 1.1),
  run('S-B2', 'B', 'failed', undefined, 0.2, 'no_result'),
  run('S-A3', 'A', 'success', 100000, 1.0),
  run('S-B3', 'B', 'success', 70000, 0.6),
];

const report: BaselineReport = {
  tool: 'pen.dev',
  date: '2026-11-17T12:30:00.000Z',
  status: 'tidak lengkap',
  protocolHash: 'abc123',
  model: 'claude-opus-5-5',
  modelUsageKeys: ['claude-opus-5-5'],
  claudeVersion: '2.1.325',
  toolVersions: { 'pen.dev desktop': '1.2.23' },
  effort: 'default',
  wrapper: 'Mode benchmark.\n\n{{PROMPT}}\n',
  prompts: { A: 'Prompt A', B: 'Prompt B' },
  argv: 'claude -p \'<prompt>\' --model claude-opus-5-5',
  env: { set: { ENABLE_TOOL_SEARCH: 'false' }, scrubbed: ['CLAUDE_EFFORT'] },
  runsPerPrompt: 3,
  runs,
  notes: ['AD-13'],
};

describe('report', () => {
  it('median dan rentang per prompt; run gagal tidak masuk median', () => {
    const [a, b] = summarizeRuns(runs, ['A', 'B']);
    expect(a!.wallMs).toEqual({ n: 3, median: 100000, min: 90000, max: 120000 });
    expect(a!.costUsd.median).toBe(1.0);
    expect(b!.successes).toBe(2);
    expect(b!.wallMs.median).toBe(65000);
    expect(b!.failed).toEqual(['S-B2 (failed: no_result)']);
  });

  it('markdown memuat versi, pembungkus, argv, tabel run (snapshot)', () => {
    const md = renderMarkdown(report);
    expect(md).toContain('Status: **tidak lengkap**');
    expect(md).toContain('| A | 3 / 3 | 100.0 | 90.0–120.0 | $1.00 | $0.90–$1.10 |');
    expect(md).toContain('Mode benchmark.\n\n{{PROMPT}}');
    expect(md).toMatchSnapshot();
  });

  it('run dengan png_scale_mismatch dicatat di md', () => {
    const md = renderMarkdown({ ...report, runs: [{ ...runs[0]!, pngScaleMismatch: true }] });
    expect(md).toMatch(/\| S-A1 \| A \| success png_scale_mismatch \|/);
  });

  it('json berisi ringkasan', () => {
    const j = JSON.parse(renderJson(report));
    expect(j.summary[0].wallMs.median).toBe(100000);
    expect(j.runs).toHaveLength(6);
  });
});
