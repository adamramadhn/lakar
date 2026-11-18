import { describe, expect, it } from 'vitest';
import type { JudgeRepRecord } from '../judge/run.js';
import type { JudgeVerdict } from '../judge/parse.js';
import { emptyRecord } from '../pendev/run.js';
import type { TimedLine } from '../stream-metrics.js';
import { countAgentEmoji, countEmojiInText, countLintEmoji } from './emoji.js';
import { isFinalRun, parseRoundArgs, penBaseline, roundOutcome, roundStartProblem } from './main.js';
import { LAKAR_INIT_RULES } from '../lakar/run.js';
import { validateInit } from '../stream-metrics.js';
import { lakarReconnect, pendevReconnect } from './reconnect.js';
import { renderRoundMarkdown, renderScoreMarkdown, ROUND_ID, type RoundPrompt, type RoundReport } from './report.js';
import { aggregateScores, decide, lakarGate, type GateResult, type PromptScore } from './score.js';

const L = (evs: unknown[]): TimedLine[] => evs.map((e, i) => ({ t: i * 1000, line: JSON.stringify(e) }));

describe('argumen dan konvensi putaran', () => {
  it('ID putaran: uji-<k> atau angka polos', () => {
    for (const ok of ['uji-1', 'uji-12', '1', '16']) expect(ROUND_ID.test(ok), ok).toBe(true);
    for (const bad of ['round-1', '0', 'uji-0', 'uji-', '01', 'uji-1a', '']) expect(ROUND_ID.test(bad), bad).toBe(false);
  });

  it('parseRoundArgs', () => {
    expect(parseRoundArgs(['--round', 'uji-1', '--dry-run'])).toEqual({ ok: true, value: { round: 'uji-1', dryRun: true, resume: false } });
    expect(parseRoundArgs(['--', '--round', 'uji-1'])).toEqual({ ok: true, value: { round: 'uji-1', dryRun: false, resume: false } });
    expect(parseRoundArgs(['--round=uji-2', '--resume'])).toEqual({ ok: true, value: { round: 'uji-2', dryRun: false, resume: true } });
    expect(parseRoundArgs(['--round', 'round-1']).ok).toBe(false);
    expect(parseRoundArgs(['--round', '0']).ok).toBe(false);
    expect(parseRoundArgs([]).ok).toBe(false);
    expect(parseRoundArgs(['--round', 'uji-1', '--x']).ok).toBe(false);
  });
});

describe('emoji', () => {
  it('definisi LC-01a: Emoji_Presentation / pictographic + VS16; © ® ™ dikecualikan; glyph terpisah', () => {
    expect(countEmojiInText('Halo 👋 ❤️ ✨ © ® ™ ★ → x')).toMatchObject({ emoji: 3, glyphs: 2 });
    expect(countEmojiInText('❤ tanpa VS16').emoji).toBe(0);
  });

  it('(a) dari input tool_use agen saja, (b) dari temuan', () => {
    const lines = L([
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Saya akan 🎉' }, { type: 'tool_use', id: '1', name: 'x', input: { code: "text('🔥 Promo')", nested: ['✅'] } }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: '1', content: '😀' }] } },
    ]);
    expect(countAgentEmoji(lines)).toMatchObject({ emoji: 2, samples: ['🔥', '✅'] });
    expect(countLintEmoji([{ rule: 'LC-01a' }, { rule: 'LC-01a' }, { rule: 'LC-01b' }, { rule: 'LC-05' }])).toEqual({ lc01a: 2, lc01b: 1 });
  });
});

describe('reconnect', () => {
  const st = (pid: number, recreated: number, NRestarts = '0') => ({ pid, startedAt: `s${pid}`, recreated, systemd: { NRestarts } });
  const errLines = L([
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'a', name: 'mcp__lakar__execute', input: {} }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'a', is_error: true, content: [{ type: 'text', text: 'RENDER_FAILED: halaman mati' }] }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'b', name: 'mcp__lakar__execute', input: {} }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'b', is_error: true, content: 'EXEC_ERROR biasa' }] } },
  ]);

  it('Lakar: pid berubah, recreated +1, tool_result RENDER_FAILED dihitung terpisah', () => {
    const r = lakarReconnect(st(1, 0), st(2, 1, '1'), errLines);
    expect(r.events.map((e) => e.kind)).toEqual(['lakard pid', 'lakard startedAt', 'lakard NRestarts', 'halaman Chromium dibuat ulang']);
    expect(r.toolErrors).toEqual([{ tool: 'mcp__lakar__execute', ms: 1000, snippet: 'RENDER_FAILED: halaman mati' }]);
    expect(r.count).toBe(5);
    expect(r.affectedMs).toBe(1000);
    expect(lakarReconnect(st(1, 0), st(1, 0), []).count).toBe(0);
  });

  it('pen.dev: NRestarts/ActiveEnterTimestamp berubah dan tool_result is_error', () => {
    const r = pendevReconnect({ NRestarts: '0', ActiveEnterTimestamp: 'a' }, { NRestarts: '1', ActiveEnterTimestamp: 'b' }, errLines);
    expect(r.events).toHaveLength(2);
    // Error snippet biasa (RENDER_FAILED milik Lakar, EXEC_ERROR) bukan reconnect pen.dev.
    expect(r.toolErrors).toHaveLength(0);
    const tr = L([
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'p', name: 'mcp__pencil__execute', input: {} }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'p', is_error: true, content: "Error: Node 'x' not found!" }] } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'q', name: 'mcp__pencil__execute', input: {} }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'q', is_error: true, content: 'MCP error -32000: Connection closed' }] } },
    ]);
    const r2 = pendevReconnect(undefined, undefined, tr);
    expect(r2.toolErrors.map((h) => h.tool)).toEqual(['mcp__pencil__execute']);
    expect(r2.affectedMs).toBe(1000);
  });

  it('Lakar: tool_result sukses yang menyebut RENDER_FAILED (mis. read_skill api) bukan reconnect', () => {
    const ok = L([
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 's', name: 'mcp__lakar__read_skill', input: { name: 'api' } }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 's', content: 'kode error: RENDER_FAILED, VERSION_MISMATCH' }] } },
    ]);
    expect(lakarReconnect(undefined, undefined, ok).count).toBe(0);
  });
});

const verdictFor = (s: number): JudgeVerdict['X'] => ({
  R1: { skor: s as 0 | 1 | 2, bukti: `R1 ${s}` },
  R2: { skor: s as 0 | 1 | 2, bukti: 'b' },
  R4: { skor: s as 0 | 1 | 2, bukti: 'b' },
  R5: { skor: s as 0 | 1 | 2, bukti: 'b' },
  R6: { skor: s as 0 | 1 | 2, bukti: 'b' },
  R8: { skor: s as 0 | 1 | 2, bukti: 'b' },
  slop: { jumlah: s, butir: Array.from({ length: s }, (_, i) => `${i + 1}: x`) },
  emoji: 0,
  fokus: 'hero',
});
const rep = (k: number, X: 'lakar' | 'pendev', lakar: number, pendev: number): JudgeRepRecord => ({
  prompt: 'A',
  rep: k,
  mapping: X === 'lakar' ? { X: 'lakar', Y: 'pendev' } : { X: 'pendev', Y: 'lakar' },
  status: 'ok',
  verdict: X === 'lakar' ? { X: verdictFor(lakar), Y: verdictFor(pendev) } : { X: verdictFor(pendev), Y: verdictFor(lakar) },
  attempts: [],
  retried: false,
  costUsd: 0.1,
});

describe('agregasi skor', () => {
  it('label X/Y dipetakan ke alat; median, rentang, flag > 1', () => {
    const s = aggregateScores('A', [rep(1, 'lakar', 2, 1), rep(2, 'pendev', 0, 1), rep(3, 'lakar', 2, 1)]);
    expect(s.tools.lakar.criteria.R1).toMatchObject({ values: [2, 0, 2], median: 2, range: 2, flag: true });
    expect(s.tools.pendev.criteria.R1).toMatchObject({ values: [1, 1, 1], median: 1, range: 0, flag: false });
    expect(s.tools.lakar.total).toBe(12);
    expect(s.tools.pendev.total).toBe(6);
    expect(s.tools.lakar.criteria.R1.evidence.map((e) => e.bukti)).toEqual(['R1 2', 'R1 0', 'R1 2']);
  });

  it('ulangan failed tidak masuk median', () => {
    const failed: JudgeRepRecord = { ...rep(3, 'lakar', 0, 0), status: 'failed', verdict: undefined };
    const s = aggregateScores('A', [rep(1, 'lakar', 2, 1), rep(2, 'pendev', 2, 1), failed]);
    expect(s.validReps).toBe(2);
    expect(s.tools.lakar.criteria.R1.values).toEqual([2, 2]);
  });
});

const okGate: GateResult = { ok: true, reasons: [], timeRatio: 1 };
/** Skor sintetis: total diatur lewat R1..R8 (median langsung). */
function score(lakar: number[], pendev: number[]): PromptScore {
  const mk = (v: number[]) => {
    const keys = ['R1', 'R2', 'R4', 'R5', 'R6', 'R8'] as const;
    const criteria = Object.fromEntries(keys.map((k, i) => [k, { values: [v[i]!], median: v[i]!, range: 0, flag: false, evidence: [] }])) as any;
    return { criteria, total: v.reduce((a, b) => a + b, 0), slop: { values: [], median: undefined, range: undefined, flag: false, items: [] }, emoji: { values: [], median: undefined, range: undefined, flag: false }, focus: [] };
  };
  return { prompt: 'A', validReps: 3, reps: [], tools: { lakar: mk(lakar), pendev: mk(pendev) } };
}

describe('gerbang dan keputusan sementara', () => {
  it('gerbang: gate 1 / board B 390×900 / wall > 1,5× → gagal dengan alasan', () => {
    expect(lakarGate({ promptId: 'B', layoutGate: 0, sizeProblems: [], wallMs: 150_000, baselineMedianMs: 131_343 }).ok).toBe(true);
    expect(lakarGate({ promptId: 'B', layoutGate: 1, sizeProblems: [], wallMs: 100_000, baselineMedianMs: 131_343 }).reasons).toEqual(['layout_check gate = 1']);
    expect(lakarGate({ promptId: 'B', layoutGate: 0, sizeProblems: ['board b 390×900 ≠ 390×844'], wallMs: 100_000, baselineMedianMs: 131_343 }).reasons).toEqual(['ukuran: board b 390×900 ≠ 390×844']);
    const slow = lakarGate({ promptId: 'A', layoutGate: 0, sizeProblems: [], wallMs: 251_000, baselineMedianMs: 167_296 });
    expect(slow.ok).toBe(false);
    expect(slow.timeRatio).toBeCloseTo(1.5003, 3);
  });

  it('L 9 vs P 10 → Setara; L 8 vs P 10 → Kalah; L 12 vs P 9 → Lebih baik; gerbang gagal → Kalah', () => {
    const d = (l: number[], p: number[], gate = okGate) => decide({ gate, lakarRunOk: true, pendevRunOk: true, score: score(l, p) }).decision;
    expect(d([2, 2, 2, 1, 1, 1], [2, 2, 2, 2, 1, 1])).toBe('Setara');
    expect(d([2, 2, 1, 1, 1, 1], [2, 2, 2, 2, 1, 1])).toBe('Kalah');
    expect(d([2, 2, 2, 2, 2, 2], [2, 2, 2, 1, 1, 1])).toBe('Lebih baik');
    expect(d([2, 2, 2, 2, 2, 2], [2, 2, 2, 1, 1, 1], { ok: false, reasons: ['layout_check gate = 1'], timeRatio: 1 })).toBe('Kalah');
  });

  it('R Lakar 0 sementara pen.dev 2 → bukan Setara', () => {
    const r = decide({ gate: okGate, lakarRunOk: true, pendevRunOk: true, score: score([0, 2, 2, 2, 2, 2], [2, 2, 2, 2, 1, 1]) });
    expect(r).toMatchObject({ decision: 'Kalah', why: expect.stringMatching(/R1/) });
  });

  it('run Lakar gagal → Kalah; run pen.dev gagal → tidak dapat dinilai', () => {
    expect(decide({ gate: okGate, lakarRunOk: false, pendevRunOk: true, score: score([2, 2, 2, 2, 2, 2], [0, 0, 0, 0, 0, 0]) }).decision).toBe('Kalah');
    expect(decide({ gate: okGate, lakarRunOk: true, pendevRunOk: false, score: undefined }).decision).toBe('tidak dapat dinilai');
  });
});

describe('laporan (snapshot)', () => {
  const sc = aggregateScores('B', [rep(1, 'lakar', 2, 1), rep(2, 'pendev', 0, 2), { ...rep(3, 'lakar', 0, 0), status: 'failed', verdict: undefined, retried: true, attempts: [{ dir: 'x', status: 'invalid_output', problems: ['bukan JSON'], costUsd: 0.1, wallMs: 1 }, { dir: 'y', status: 'invalid_output', problems: ['X.R1.skor harus 0, 1, atau 2 (dapat 3)'], costUsd: 0.1, wallMs: 1 }] }]);
  const lakarRec = {
    ...emptyRecord({ runId: 'uji-1-B-lakar', promptId: 'B', attempt: 1 }),
    status: 'success' as const,
    wallMs: 120_000,
    costUsd: 0.7,
    numTurns: 9,
    toolCalls: 8,
    frames: [{ id: 'b1', name: 'Beranda', width: 390, height: 844, png: 'bench/runs/rounds/uji-1/B-lakar/png/b1.png', pngWidth: 390, pngHeight: 844 }],
    lakar: {
      slug: 'gerak-beranda',
      opened: ['gerak-beranda'],
      boards: [{ id: 'b1', name: 'Beranda', page: 'P', width: 390, height: 844, x: 0, y: 0, wip: false }],
      layout: { rev: 4, summary: { error: 0, warning: 1, gate: 0 }, findings: [], boards: [] },
      docPath: 'bench/runs/rounds/uji-1/B-lakar/doc/gerak-beranda.lakar.json',
      historyPath: undefined,
      daemonBefore: undefined,
      daemonAfter: undefined,
      docsBefore: 10,
    },
  };
  const pendevRec = { ...emptyRecord({ runId: 'uji-1-B-pendev', promptId: 'B', attempt: 1 }), status: 'success' as const, wallMs: 130_000, costUsd: 0.6, frames: [{ id: 'F', name: 'Home', width: 390, height: 844 }] };
  const gate = lakarGate({ promptId: 'B', layoutGate: 0, sizeProblems: [], wallMs: 120_000, baselineMedianMs: 131_343 });
  const p: RoundPrompt = {
    prompt: 'B',
    baselineMedianMs: 131_343,
    runs: {
      lakar: { key: 'B-lakar', prompt: 'B', tool: 'lakar', dir: 'bench/runs/rounds/uji-1/B-lakar', record: lakarRec, reconnect: { count: 0, affectedMs: 0, events: [], toolErrors: [] }, agentEmoji: { emoji: 0, glyphs: 1, samples: [] }, lintEmoji: { lc01a: 0, lc01b: 0 }, strip: { path: 'bench/runs/rounds/uji-1/B-lakar.png', width: 390, height: 844, boards: 1 }, previous: [] },
      pendev: { key: 'B-pendev', prompt: 'B', tool: 'pendev', dir: 'bench/runs/rounds/uji-1/B-pendev', record: pendevRec, reconnect: { count: 1, affectedMs: 900, events: [], toolErrors: [{ tool: 'mcp__pencil__execute', ms: 900, snippet: 'error' }] }, agentEmoji: { emoji: 2, glyphs: 0, samples: ['🔥'] }, lintEmoji: undefined, strip: undefined, previous: [] },
    },
    gate,
    sizeProblems: [],
    score: sc,
    decision: decide({ gate, lakarRunOk: true, pendevRunOk: true, score: sc }),
  };
  const report: RoundReport = {
    round: 'uji-1',
    date: '2026-11-18T00:00:00.000Z',
    status: 'lengkap',
    statusReasons: [],
    frozen: {
      head: 'abc',
      porcelain: '',
      protocolHash: 'h',
      baselineProtocolHash: 'h',
      model: 'claude-opus-5-5',
      claude: '2.1.325',
      lakard: { version: '0.1.0', schemaVersion: 1 },
      icons: { lucide: '1.74.0' },
      skills: { 'core.md': 'aa' },
      g0Rules: '{}',
      checkDist: 'cc',
      pendevDesktop: '1.2.23',
      pendevMcp: 'pencil 1.0.0',
      judge: { model: 'claude-opus-5-5', argv: 'claude -p' },
    },
    wrapper: 'W {{PROMPT}}',
    prompts: { B: 'prompt B' },
    argv: { lakar: 'a', pendev: 'b', judge: 'c' },
    env: { set: { ENABLE_TOOL_SEARCH: 'false' }, scrubbed: ['CLAUDE_EFFORT'] },
    convention: ['k'],
    definitions: ['d'],
    penGuard: { files: 3, changed: [], removed: [], added: ['/x.pen'] },
    lakardActiveAfter: 'active',
    results: [p],
    judgeCostUsd: 0.5,
    notes: [],
  };

  it('round md memuat semua bagian AC', () => {
    const md = renderRoundMarkdown(report);
    for (const s of ['Lakar/pen.dev', 'Lakar/baseline', 'Gerbang G0 Lakar', '### Emoji', '### Reconnect', 'Total (jumlah median)', 'sementara, menunggu konfirmasi Adam', '## Versi beku', 'R3/R7 tidak dihitung']) expect(md).toContain(s);
    expect(md).toMatchSnapshot();
  });

  it('score md: 6 kriteria × 2 alat, bukti per ulangan, pemetaan X/Y setelah penilaian, ulangan failed dicatat', () => {
    const md = renderScoreMarkdown('uji-1', p);
    expect(md).toContain('putaran uji-1');
    expect(md.indexOf('Pemetaan X/Y')).toBeGreaterThan(md.indexOf('Bukti per ulangan'));
    expect(md).toContain('periksa Adam');
    expect(md).toContain('failed (1 percobaan ulang)');
    expect(md).toMatchSnapshot();
  });
});

describe('penjaga awal dan status putaran', () => {
  it('round md sudah ada tanpa --resume → 64; dengan --resume / --dry-run → lanjut', () => {
    expect(roundStartProblem({ mdExists: true, resume: false, dryRun: false })?.exitCode).toBe(64);
    expect(roundStartProblem({ mdExists: true, resume: true, dryRun: false })).toBeUndefined();
    expect(roundStartProblem({ mdExists: true, resume: false, dryRun: true })).toBeUndefined();
  });
  it('hash protokol beda dari baseline → abort (exit 1) sebelum run', () => {
    const r = roundStartProblem({ mdExists: false, resume: false, dryRun: false, protocolHash: 'aa', baselineHash: 'bb' });
    expect(r).toMatchObject({ exitCode: 1 });
    expect(r!.message).toContain('aa');
    expect(roundStartProblem({ mdExists: false, resume: false, dryRun: false, protocolHash: 'aa', baselineHash: 'aa' })).toBeUndefined();
  });
  it('.pen lama berubah → dibatalkan exit 1; juri/run invalid → dibatalkan; lengkap → 0; kurang → 2', () => {
    const none = { changed: [], removed: [] };
    expect(roundOutcome({ fatal: undefined, pen: { changed: ['/x.pen'], removed: [] }, allRuns: true, allReps: true })).toMatchObject({ status: 'dibatalkan', exitCode: 1 });
    expect(roundOutcome({ fatal: 'juri A ulangan 1 invalid', pen: none, allRuns: true, allReps: false })).toMatchObject({ status: 'dibatalkan', exitCode: 1 });
    expect(roundOutcome({ fatal: undefined, pen: none, allRuns: true, allReps: true })).toMatchObject({ status: 'lengkap', exitCode: 0 });
    expect(roundOutcome({ fatal: undefined, pen: none, allRuns: true, allReps: false })).toMatchObject({ status: 'tidak lengkap', exitCode: 2 });
  });
  it('init Lakar berisi server pencil / tool Read → invalid', () => {
    const init = (servers: string[], tools: string[]) => ({ model: 'm', claudeCodeVersion: 'v', cwd: '/tmp/x', mcpServers: servers.map((name) => ({ name, status: 'connected' })), tools });
    expect(validateInit(init(['lakar'], ['mcp__lakar__execute']), LAKAR_INIT_RULES)).toEqual([]);
    expect(validateInit(init(['lakar', 'pencil'], ['mcp__lakar__execute']), LAKAR_INIT_RULES).length).toBeGreaterThan(0);
    expect(validateInit(init(['lakar'], ['mcp__lakar__execute', 'Read']), LAKAR_INIT_RULES).length).toBeGreaterThan(0);
  });
});

describe('resume (C8) dan baseline .pen', () => {
  it('run final dipakai apa adanya; hanya gagal-setup yang boleh diulang', () => {
    expect(isFinalRun({ status: 'success', reason: undefined })).toBe(true);
    expect(isFinalRun({ status: 'failed', reason: 'no_frames' })).toBe(true);
    expect(isFinalRun({ status: 'invalid', reason: 'dokumen lama: kasku sudah ada sebelum run' })).toBe(true);
    expect(isFinalRun({ status: 'invalid', reason: 'init: tool di luar mcp__lakar__*' })).toBe(false);
    expect(isFinalRun({ status: 'aborted', reason: 'newdoc: ...' })).toBe(false);
  });
  it('baseline .pen = snapshot pen-before paling awal; tanpa snapshot = sekarang', () => {
    const snaps: Record<string, Record<string, string>> = { 'pen-before-20261118T040000Z.json': { a: '1' }, 'pen-before-20261118T050000Z.json': { a: '2' } };
    const r = penBaseline(['A-lakar', ...Object.keys(snaps).reverse()], (f) => snaps[f]!, { a: '3' });
    expect(r).toEqual({ baseline: { a: '1' }, from: 'pen-before-20261118T040000Z.json' });
    expect(penBaseline(['A-lakar'], () => ({}), { a: '3' })).toEqual({ baseline: { a: '3' }, from: undefined });
  });
  it('PNG bukan skala 1 → exit 3 dengan alasan', () => {
    expect(roundOutcome({ fatal: undefined, pen: { changed: [], removed: [] }, allRuns: true, allReps: true, pngScaleMismatch: ['A-lakar'] })).toMatchObject({ status: 'lengkap', exitCode: 3, reasons: ['png_scale_mismatch: A-lakar'] });
  });
});
