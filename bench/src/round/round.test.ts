import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '@lakar/schema';
import { newestMtimeMs } from '../sys.js';
import { EMPTY_MCP, type JudgeRepRecord } from '../judge/run.js';
import { encodePngRgb } from '../png/codec.js';
import { judgeImagesFromStripPng } from '../png/strip.js';
import { loadProtocol } from '../protocol.js';
import type { JudgeVerdict } from '../judge/parse.js';
import { emptyRecord } from '../pendev/run.js';
import type { TimedLine } from '../stream-metrics.js';
import { timedLines, toolResultEvent, toolUseEvent } from '../../../tests/support/stream.ts';
import { countAgentEmoji, countEmojiInText, countLintEmoji } from './emoji.js';
import { claudeSemver, copyPngExclusive, photoProbeProblems, scoreReportBase, judgePrompt, ROUND_JUDGE_REUSE, staleJudgeTexts, frozenDrift, harnessErrorStatus, isFinalRun, officialFreezeProblems, parseRoundArgs, penBaseline, roundOutcome, roundStartProblem, type OfficialFreezeInput } from './main.js';
import { LAKAR_INIT_RULES } from '../lakar/run.js';
import { validateInit } from '../stream-metrics.js';
import { lakarReconnect, pendevReconnect } from './reconnect.js';
import { AWAITING_ADAM, frozenG0Rules, isOfficialRound, r3r7Missing, renderRoundMarkdown, renderScoreMarkdown, ROUND_ID, type RoundPrompt, type RoundReport } from './report.js';
import { aggregateScores, appealAxis, decide, decideG0, lakarGate, type Decision, type DecisionInput, type GateResult, type PromptScore } from './score.js';

const L = (evs: unknown[]): TimedLine[] => timedLines(evs, 1000);

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
    toolUseEvent('a', 'mcp__lakar__execute', {}),
    toolResultEvent('a', [{ type: 'text', text: 'RENDER_FAILED: halaman mati' }], true),
    toolUseEvent('b', 'mcp__lakar__execute', {}),
    toolResultEvent('b', 'EXEC_ERROR biasa', true),
  ]);

  it('Lakar: pid berubah, recreated +1, tool_result RENDER_FAILED dihitung terpisah', () => {
    const r = lakarReconnect(st(1, 0), st(2, 1, '1'), errLines);
    expect(r.events.map((e) => e.kind)).toEqual(['lakard pid', 'lakard startedAt', 'lakard NRestarts', 'halaman Chromium dibuat ulang']);
    expect(r.toolErrors).toEqual([{ tool: 'mcp__lakar__execute', ms: 1000, snippet: 'RENDER_FAILED: halaman mati' }]);
    // Satu restart lakard (3 sinyal) = 1, halaman dibuat ulang = 1, satu tool_result = 1.
    expect(r.count).toBe(3);
    expect(r.affectedMs).toBe(1000);
    expect(lakarReconnect(st(1, 0), st(1, 0), []).count).toBe(0);
  });

  it('pen.dev: NRestarts/ActiveEnterTimestamp berubah dan tool_result is_error', () => {
    const r = pendevReconnect({ NRestarts: '0', ActiveEnterTimestamp: 'a' }, { NRestarts: '1', ActiveEnterTimestamp: 'b' }, errLines);
    expect(r.events).toHaveLength(2);
    expect(r.count).toBe(1); // satu restart pen-desktop (NRestarts + ActiveEnterTimestamp)
    // Error snippet biasa (RENDER_FAILED milik Lakar, EXEC_ERROR) bukan reconnect pen.dev.
    expect(r.toolErrors).toHaveLength(0);
    const tr = L([
      toolUseEvent('p', 'mcp__pencil__execute', {}),
      toolResultEvent('p', "Error: Node 'x' not found!", true),
      toolUseEvent('q', 'mcp__pencil__execute', {}),
      toolResultEvent('q', 'MCP error -32000: Connection closed', true),
    ]);
    const r2 = pendevReconnect(undefined, undefined, tr);
    expect(r2.toolErrors.map((h) => h.tool)).toEqual(['mcp__pencil__execute']);
    expect(r2.affectedMs).toBe(1000);
  });

  it('Lakar: tool_result sukses yang menyebut RENDER_FAILED (mis. read_skill api) bukan reconnect', () => {
    const ok = L([
      toolUseEvent('s', 'mcp__lakar__read_skill', { name: 'api' }),
      toolResultEvent('s', 'kode error: RENDER_FAILED, VERSION_MISMATCH'),
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
  R9: { skor: s as 0 | 1 | 2, bukti: `R9 ${s}` },
  R10: { skor: s as 0 | 1 | 2, bukti: 'b' },
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
    expect(s.tools.lakar.total).toBe(16);
    expect(s.tools.pendev.total).toBe(8);
    expect(appealAxis(s.tools.lakar)).toBe(4);
    expect(appealAxis(s.tools.pendev)).toBe(2);
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
/** Skor sintetis: median langsung untuk R1, R2, R4, R5, R6, R8, R9, R10 (urut). */
function score(lakar: number[], pendev: number[]): PromptScore {
  const mk = (v: number[]) => {
    const keys = ['R1', 'R2', 'R4', 'R5', 'R6', 'R8', 'R9', 'R10'] as const;
    if (v.length !== keys.length) throw new Error('fixture skor harus 8 nilai');
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

  const noBrief = { sizeProblems: [] as string[] };
  const dec = (l: number[], p: number[], extra: Partial<DecisionInput> = {}) => decide({ gate: okGate, lakarRunOk: true, pendevRunOk: true, score: score(l, p), pendevBrief: noBrief, ...extra });

  // (a) matriks I/O aturan keputusan v2. Urutan nilai: R1 R2 R4 R5 R6 R8 | R9 R10.
  it('Kalah karena daya tarik: D_L ≤ D_P − 2, pen.dev patuh brief → Kalah, alasan "daya tarik"', () => {
    const r = dec([2, 2, 2, 2, 2, 2, 1, 0], [2, 1, 1, 1, 1, 1, 2, 1]);
    expect(r.checks).toMatchObject({ total: { lakar: 13, pendev: 10 }, appeal: { lakar: 1, pendev: 3 }, otherLoss: [], pendevBriefViolations: [] });
    expect(r).toMatchObject({ decision: 'Kalah', why: expect.stringMatching(/^daya tarik D 1 ≤ 3 − 2/) });
    // R9/R10 Lakar 0 vs pen.dev 2 juga Kalah-daya-tarik walau gap D hanya 1.
    expect(dec([2, 2, 2, 2, 2, 2, 0, 2], [2, 2, 2, 2, 2, 2, 2, 1])).toMatchObject({ decision: 'Kalah', why: expect.stringMatching(/daya tarik R9: Lakar 0 sementara pen.dev 2/) });
  });

  it('pembanding melanggar brief (ukuran frame / median R1 = 0) dan hanya Kalah-daya-tarik → Setara, tidak pernah Lebih baik', () => {
    const size = dec([2, 2, 2, 2, 2, 2, 1, 0], [2, 1, 1, 1, 1, 1, 2, 1], { pendevBrief: { sizeProblems: ['board z 390×1109 ≠ 390×844'] } });
    expect(size).toMatchObject({ decision: 'Setara', why: expect.stringMatching(/pen\.dev melanggar brief mengikat \(ukuran: board z 390×1109/) });
    expect(size.checks!.pendevBriefViolations).toEqual(['ukuran: board z 390×1109 ≠ 390×844']);
    const r1 = dec([2, 2, 2, 2, 2, 2, 0, 0], [0, 1, 1, 1, 1, 1, 2, 2]);
    expect(r1).toMatchObject({ decision: 'Setara', why: expect.stringMatching(/median R1 pen\.dev = 0/) });
    // Total Lakar jauh di atas (≥ +3) tetap Setara, bukan Lebih baik.
    expect(r1.checks!.total.lakar - r1.checks!.total.pendev).toBeGreaterThanOrEqual(3);
  });

  it('Kalah lain + pelanggaran pembanding → tetap Kalah', () => {
    const viol = { pendevBrief: { sizeProblems: ['frame x 390×1109 ≠ 390×844'] } };
    expect(dec([1, 1, 1, 1, 1, 1, 0, 0], [2, 2, 2, 1, 1, 1, 2, 2], viol)).toMatchObject({ decision: 'Kalah', why: expect.stringMatching(/^total 6 < 13 − 1/) });
    expect(dec([0, 2, 2, 2, 2, 2, 0, 0], [2, 1, 1, 1, 1, 1, 2, 2], viol)).toMatchObject({ decision: 'Kalah', why: expect.stringMatching(/^R1: Lakar 0 sementara pen\.dev 2/) });
  });

  it('Lebih baik butuh T_L ≥ T_P + 3 dan D_L ≥ D_P; tanpa daya tarik → Setara', () => {
    expect(dec([2, 2, 2, 2, 2, 2, 1, 1], [1, 1, 1, 1, 1, 2, 1, 1]).decision).toBe('Lebih baik');
    expect(dec([2, 2, 2, 2, 2, 2, 1, 1], [1, 1, 2, 2, 2, 2, 1, 1]).decision).toBe('Setara'); // +2 saja
    expect(dec([2, 2, 2, 2, 2, 2, 1, 0], [1, 1, 1, 1, 1, 1, 1, 1])).toMatchObject({ decision: 'Setara', why: expect.stringMatching(/daya tarik 1 < 2/) });
    expect(dec([2, 2, 2, 1, 1, 1, 1, 1], [2, 2, 2, 2, 1, 1, 1, 1]).decision).toBe('Setara'); // T −1
    expect(dec([2, 2, 1, 1, 1, 1, 1, 1], [2, 2, 2, 2, 1, 1, 1, 1]).decision).toBe('Kalah'); // T −2
  });

  it('gerbang Lakar gagal → Kalah (tidak berubah); run Lakar gagal → Kalah; run pen.dev gagal → tidak dapat dinilai', () => {
    const failGate = { ok: false, reasons: ['layout_check gate = 1'], timeRatio: 1 };
    expect(dec([2, 2, 2, 2, 2, 2, 2, 2], [0, 0, 0, 0, 0, 0, 0, 0], { gate: failGate })).toMatchObject({ decision: 'Kalah', why: expect.stringMatching(/gerbang gagal/) });
    expect(dec([2, 2, 2, 2, 2, 2, 2, 2], [0, 0, 0, 0, 0, 0, 0, 0], { lakarRunOk: false }).decision).toBe('Kalah');
    expect(decide({ gate: okGate, lakarRunOk: true, pendevRunOk: false, score: undefined, pendevBrief: noBrief }).decision).toBe('tidak dapat dinilai');
    // Gerbang Lakar gagal tetap Kalah walau run pen.dev juga gagal.
    expect(decide({ gate: failGate, lakarRunOk: true, pendevRunOk: false, score: undefined, pendevBrief: noBrief })).toMatchObject({ decision: 'Kalah', why: expect.stringMatching(/gerbang gagal/) });
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
    decision: decide({ gate, lakarRunOk: true, pendevRunOk: true, score: sc, pendevBrief: { sizeProblems: [] } }),
    pendevSizeProblems: [],
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
      lakard: { version: '0.1.0', schemaVersion: SCHEMA_VERSION },
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
    g0: decideG0([p], 'lengkap'),
    pngs: [
      { prompt: 'B', tool: 'lakar', path: 'bench/runs/rounds/uji-1/B-lakar.png', status: 'lokal (putaran uji, gitignored)' },
      { prompt: 'B', tool: 'pendev', path: undefined, status: 'strip tidak ada' },
    ],
    judgeCostUsd: 0.5,
    judge: { rubricVersion: '2', textSha256: { B: 'b2' } },
    notes: [],
  };

  it('round md memuat semua bagian AC', () => {
    const md = renderRoundMarkdown(report);
    for (const s of ['Lakar/pen.dev', 'Lakar/baseline', 'Gerbang G0 Lakar', '### Emoji', '### Reconnect', 'Total (jumlah median, maks 16)', 'Daya tarik D = R9 + R10', 'sementara, menunggu konfirmasi Adam', '## Versi beku', 'R3/R7 tidak dihitung', 'Versi rubrik: 2', 'sha256 teks juri B: `b2`']) expect(md).toContain(s);
    expect(renderRoundMarkdown({ ...report, judge: undefined })).toContain('Versi rubrik: tidak tercatat');
    expect(md).toMatchSnapshot();
  });

  it('restart pen-desktop sesudah run pen.dev tercatat di laporan (hasil atau alasan tidak dijalankan)', () => {
    expect(renderRoundMarkdown({ ...report, penDesktopRestart: { ok: true, ms: 14_200, detail: 'pen-desktop active; MCP pencil menjawab panggilan baca' } })).toContain(
      '- Restart pen-desktop sesudah run pen.dev terakhir: **berhasil**, durasi 14.2 dtk (pen-desktop active; MCP pencil menjawab panggilan baca).',
    );
    expect(renderRoundMarkdown({ ...report, penDesktopRestart: 'tidak ada run pen.dev di pemanggilan ini' })).toContain('- Restart pen-desktop: tidak dijalankan (tidak ada run pen.dev di pemanggilan ini).');
    expect(renderRoundMarkdown(report)).not.toContain('Restart pen-desktop');
  });

  it('putaran resmi: Keputusan G0 setelah Ringkasan; Evaluasi arah/PNG/Konfirmasi Adam sebelum Versi beku; Konfirmasi tidak diisi', () => {
    const official: RoundReport = {
      ...report,
      round: '1',
      frozen: {
        ...report.frozen,
        porcelainCode: '',
        porcelainAll: '?? plan.md',
        lakard: { ...report.frozen.lakard, node: 'v26.13.1' },
        playwright: '1.65.1',
        fonts: { families: ['Inter'], missing: [], packages: { '@fontsource/inter': '5.3.0' } },
        distSha: { check: 'c1', daemon: 'd1' },
        baseline: { model: 'claude-opus-5-5', claude: '2.1.325', pendevDesktop: '1.2.23' },
      },
      results: [{ ...p, prompt: 'A', baselineCostUsd: 0.84 }, { ...p, decision: { decision: 'Kalah', why: 'total 6 < 9 − 1' } }],
      g0: { decision: 'gagal', why: 'Kalah di prompt B' },
      pngs: [{ prompt: 'A', tool: 'lakar', path: 'bench/round-1/A-lakar.png', status: 'tracked, di-commit bersama laporan' }],
    };
    const md = renderRoundMarkdown(official);
    const at = (h: string) => {
      const i = md.indexOf(h);
      expect(i, h).toBeGreaterThan(-1);
      return i;
    };
    expect(at('## Ringkasan')).toBeLessThan(at('## Keputusan G0 (sementara, menunggu konfirmasi Adam)'));
    expect(at('## Keputusan G0')).toBeLessThan(at('## Prompt A'));
    expect(at('## Prompt B')).toBeLessThan(at('## Evaluasi arah'));
    expect(at('## Evaluasi arah')).toBeLessThan(at('## PNG untuk Adam'));
    expect(at('## PNG untuk Adam')).toBeLessThan(at('## Konfirmasi Adam'));
    expect(at('## Konfirmasi Adam')).toBeLessThan(at('## Versi beku'));
    expect(md).toContain('G1 tidak dimulai sebelum G0 lolos dan dikonfirmasi Adam');
    expect(md).toContain('`--round 2`');
    expect(md).toContain('$0.84');
    const konf = md.slice(at('## Konfirmasi Adam'), at('## Versi beku'));
    expect(konf).toContain(`Status: **${AWAITING_ADAM}**`);
    expect(konf).toContain(`Keputusan G0 final: ${AWAITING_ADAM}`);
    for (const row of konf.split('\n').filter((l) => /^\| [AB] \|/.test(l))) expect(row.endsWith(`| ${AWAITING_ADAM} | ${AWAITING_ADAM} |`), row).toBe(true);
    expect(konf).toContain('R1 Lakar'); // rentang > 1 (fixture: R1 Lakar 2 dan 0)
    for (const s of ['playwright-core: 1.65.1', 'missing: []', '@fontsource/inter 5.3.0', 'packages/daemon/dist', 'Node v26.13.1', 'Baseline pen.dev', '?? plan.md']) expect(md).toContain(s);
    expect(md).toMatchSnapshot();
    // G0 lolos → tanpa Evaluasi arah.
    expect(renderRoundMarkdown({ ...official, g0: { decision: 'lolos', why: 'A Lebih baik, B Setara' } })).not.toContain('## Evaluasi arah');
  });

  it('putaran resmi 2: baris foto + probe di Versi beku, rasio pen.dev/baseline, path skor per putaran', () => {
    const r2: RoundReport = {
      ...report,
      round: '2',
      frozen: { ...report.frozen, lakard: { ...report.frozen.lakard, schemaVersion: 2 }, photos: { provider: 'wikimedia', keyFile: 'absent', probe: { query: 'mountain lake landscape', provider: 'wikimedia', fallbackReason: 'no-key', results: 3, ms: 812 } } },
      results: [{ ...p, scoreReport: 'bench/round-2/score-B.md' }],
    };
    const md = renderRoundMarkdown(r2);
    expect(md).toContain('- Foto: penyedia wikimedia, key absent, probe `mountain lake landscape` → wikimedia, 3 hasil, 812 ms, fallbackReason no-key');
    expect(md).toContain('schemaVersion 2');
    expect(md).toContain('Detail dan bukti: `bench/round-2/score-B.md`.');
    expect(md).toContain('- Rasio pen.dev putaran ini/median baseline pen.dev: 0.99 (indikator drift, bukan gerbang)');
    expect(renderRoundMarkdown(report)).toContain('Detail dan bukti: `bench/score-B.md`.');
    expect(renderRoundMarkdown(report)).not.toContain('- Foto:');
  });

  it('score md: 8 kriteria × 2 alat, bukti per ulangan, pemetaan X/Y setelah penilaian, ulangan failed dicatat', () => {
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
  it('PNG bukan skala 1 → exit 3 dengan alasan; juga dilaporkan saat putaran belum lengkap', () => {
    expect(roundOutcome({ fatal: undefined, pen: { changed: [], removed: [] }, allRuns: true, allReps: true, pngScaleMismatch: ['A-lakar'] })).toMatchObject({ status: 'lengkap', exitCode: 3, reasons: ['png_scale_mismatch: A-lakar'] });
    expect(roundOutcome({ fatal: undefined, pen: { changed: [], removed: [] }, allRuns: true, allReps: false, pngScaleMismatch: ['B-pendev'] })).toMatchObject({ status: 'tidak lengkap', exitCode: 2, reasons: ['run atau ulangan juri belum lengkap', 'png_scale_mismatch: B-pendev'] });
  });
  it('error harness sesudah agen berjalan → failed (final, C8); sebelum agen → aborted (boleh diulang)', () => {
    expect(harnessErrorStatus(true)).toBe('failed');
    expect(isFinalRun({ status: harnessErrorStatus(true), reason: 'harness: ENOSPC' })).toBe(true);
    expect(harnessErrorStatus(false)).toBe('aborted');
    expect(isFinalRun({ status: harnessErrorStatus(false), reason: 'harness: x' })).toBe(false);
  });
  it('--resume: versi beku dari awal putaran; perbedaan dilaporkan, pid/startedAt lakard diabaikan', () => {
    const f = {
      head: 'aaa', porcelain: '', protocolHash: 'h', baselineProtocolHash: 'h', model: 'm', claude: 'c1',
      lakard: { version: '0.1', schemaVersion: SCHEMA_VERSION, pid: 1, startedAt: 's1', browser: 'b' }, icons: { lucide: '1' }, skills: { 'core.md': 'x' },
      g0Rules: '[]', checkDist: 'd', pendevDesktop: 'p', pendevMcp: undefined, judge: { model: 'm', argv: 'claude -p' },
    };
    expect(frozenDrift(f, { ...f, lakard: { ...f.lakard, pid: 2, startedAt: 's2' } })).toEqual([]);
    expect(frozenDrift(f, { ...f, head: 'bbb', skills: { 'core.md': 'y' } })).toEqual(['head: aaa → bbb', 'skills: {"core.md":"x"} → {"core.md":"y"}']);
    const fp = { ...f, photos: { provider: 'wikimedia', keyFile: 'absent', probe: { query: 'q', provider: 'wikimedia', results: 3, ms: 900 } } };
    expect(frozenDrift(fp, { ...fp, photos: { ...fp.photos, probe: { ...fp.photos.probe, ms: 1200 } } })).toEqual([]);
    expect(frozenDrift(fp, { ...fp, photos: { ...fp.photos, provider: 'openverse' } })).toEqual(['photos: wikimedia → openverse']);
  });
});

describe('keputusan G0 (sementara)', () => {
  const r = (prompt: string, decision: Decision) => ({ prompt, decision: { decision, why: 'x' } });
  it('lolos / gagal / tidak dapat diputuskan', () => {
    expect(decideG0([r('A', 'Lebih baik'), r('B', 'Setara')], 'lengkap').decision).toBe('lolos');
    expect(decideG0([r('A', 'Lebih baik'), r('B', 'Kalah')], 'lengkap')).toEqual({ decision: 'gagal', why: 'Kalah di prompt B' });
    expect(decideG0([r('A', 'Setara'), r('B', 'tidak dapat dinilai')], 'lengkap').decision).toBe('tidak dapat diputuskan');
    expect(decideG0([r('A', 'Setara'), r('B', 'Setara')], 'dibatalkan')).toEqual({ decision: 'tidak dapat diputuskan', why: 'putaran dibatalkan' });
    expect(decideG0([r('A', 'Kalah'), r('B', 'Setara')], 'dibatalkan').decision).toBe('tidak dapat diputuskan');
    expect(decideG0([r('A', 'Setara')], 'tidak lengkap').decision).toBe('tidak dapat diputuskan');
  });
});

describe('pembekuan putaran resmi', () => {
  const base: OfficialFreezeInput = {
    porcelainCode: '',
    protocolHash: 'h',
    model: 'claude-opus-5-5',
    claude: '2.1.325 (Claude Code)',
    pendevDesktop: '1.2.23',
    baseline: { protocolHash: 'h', model: 'claude-opus-5-5', claude: '2.1.325', pendevDesktop: '1.2.23' },
    lakard: { startedAt: '2026-11-18T06:00:00.000Z', fonts: { families: ['Inter'], missing: [] }, pool: { size: 2, ready: 2, recreated: 0 }, schemaVersion: SCHEMA_VERSION, photos: { provider: 'unsplash', keyFile: 'present', imported: 0 } },
    newestDistMtimeMs: Date.parse('2026-11-18T05:00:00.000Z'),
    checkLakardFresh: true,
    judgeText: { rubricVersion: '2', textSha256: { A: 'aa', B: 'bb' } },
    rubric: { version: '2', date: '2026-11-18', judgeTextSha256: { A: 'aa', B: 'bb' }, sourceSha256: {} },
  };
  it('ID angka = resmi; uji-<k> bukan', () => {
    expect(isOfficialRound('1')).toBe(true);
    expect(isOfficialRound('uji-2')).toBe(false);
    expect(claudeSemver('2.1.325 (Claude Code)')).toBe('2.1.325');
  });
  it('bersih → tanpa masalah', () => expect(officialFreezeProblems(base)).toEqual([]));
  it('kode kotor / claude / pen / model / hash berubah → masalah', () => {
    expect(officialFreezeProblems({ ...base, porcelainCode: ' M bench/src/x.ts' })[0]).toContain('kode tidak beku');
    expect(officialFreezeProblems({ ...base, claude: '2.1.326 (Claude Code)' })[0]).toContain('claude 2.1.326 ≠ baseline 2.1.325');
    expect(officialFreezeProblems({ ...base, pendevDesktop: '1.2.24' })[0]).toContain('pen.dev desktop');
    expect(officialFreezeProblems({ ...base, pendevDesktop: undefined })[0]).toContain('pen.dev desktop');
    expect(officialFreezeProblems({ ...base, model: 'm' })[0]).toContain('model');
    expect(officialFreezeProblems({ ...base, protocolHash: 'x' })[0]).toContain('protocolHash');
  });
  it('lakard basi (startedAt ≤ mtime dist) → masalah hanya bila dicek sesudah restart', () => {
    const stale = { ...base, newestDistMtimeMs: Date.parse('2026-11-18T07:00:00.000Z') };
    expect(officialFreezeProblems(stale)[0]).toContain('lakard basi');
    expect(officialFreezeProblems({ ...stale, checkLakardFresh: false })).toEqual([]);
    expect(officialFreezeProblems({ ...base, newestDistMtimeMs: undefined })[0]).toContain('dist tidak ada');
  });
  it('sha teks juri ≠ bench/rubric/rubric.json (DESIGN.md diubah setelah snapshot) → masalah', () => {
    expect(officialFreezeProblems({ ...base, judgeText: { rubricVersion: '2', textSha256: { A: 'aa', B: 'b-baru' } } })).toEqual(['rubrik juri: sha256 teks juri B b-baru ≠ rubric.json bb']);
    expect(officialFreezeProblems({ ...base, rubric: undefined })[0]).toContain('rubric.json tidak ada');
  });
  it('font hilang / pool belum siap → masalah', () => {
    expect(officialFreezeProblems({ ...base, lakard: { ...base.lakard!, fonts: { families: [], missing: ['Inter'] } } })).toEqual(['font hilang: Inter']);
    expect(officialFreezeProblems({ ...base, lakard: { ...base.lakard!, pool: { size: 2, ready: 0, recreated: 0 } } })[0]).toContain('pool');
    expect(officialFreezeProblems({ ...base, lakard: undefined })[0]).toContain('lakard');
  });
  it('(f) schemaVersion lakard ≠ bench / (g) penyedia foto bukan unsplash → masalah', () => {
    expect(officialFreezeProblems({ ...base, lakard: { ...base.lakard!, schemaVersion: 1 } })).toEqual([`schemaVersion lakard 1 ≠ ${SCHEMA_VERSION} (bench)`]);
    expect(SCHEMA_VERSION).toBe(3);
    const g = (photos: NonNullable<OfficialFreezeInput['lakard']>['photos']) => officialFreezeProblems({ ...base, lakard: { ...base.lakard!, photos } });
    expect(g({ provider: 'wikimedia', keyFile: 'absent', imported: 0 })[0]).toContain('penyedia foto lakard wikimedia ≠ unsplash');
    expect(g(undefined)[0]).toContain('penyedia foto lakard (tidak ada di /status) ≠ unsplash');
  });
  it('probe foto: unsplash ok; wikimedia (unsplash-429), fallbackReason unsplash-*, 0 hasil, error → masalah', () => {
    const res = (x: Partial<{ provider: string; fallbackReason: string; n: number }>) => ({
      res: { provider: x.provider ?? 'unsplash', ...(x.fallbackReason ? { fallbackReason: x.fallbackReason } : {}), query: 'q', results: Array.from({ length: x.n ?? 3 }, (_, i) => ({ ref: `unsplash:abcdef${i}` })), thumbnails: [] },
    });
    expect(photoProbeProblems(res({}))).toEqual([]);
    expect(photoProbeProblems(res({ provider: 'wikimedia', fallbackReason: 'unsplash-429' }))).toEqual(['probe foto: penyedia wikimedia ≠ unsplash (fallbackReason unsplash-429)']);
    expect(photoProbeProblems(res({ fallbackReason: 'unsplash-empty' }))).toEqual(['probe foto: fallbackReason unsplash-empty']);
    expect(photoProbeProblems(res({ n: 0 }))).toEqual(['probe foto: 0 hasil']);
    expect(photoProbeProblems({ error: 'EXEC_ERROR: pencarian foto gagal' })).toEqual(['probe foto gagal: EXEC_ERROR: pencarian foto gagal']);
  });
  it('path skor: putaran resmi ≥ 2 → bench/round-<n>/; putaran 1 dan uji → bench/score-', () => {
    expect(scoreReportBase('2')).toBe('bench/round-2/score-');
    expect(scoreReportBase('10')).toBe('bench/round-10/score-');
    expect(scoreReportBase('1')).toBe('bench/score-');
    expect(scoreReportBase('uji-3')).toBe('bench/score-');
  });
  it('mtime terbaru dir (rekursif)', () => {
    const d = mkdtempSync(join(tmpdir(), 'mtime-'));
    expect(newestMtimeMs(d)).toBeUndefined();
    writeFileSync(join(d, 'a.js'), 'a');
    utimesSync(join(d, 'a.js'), 1000, 1000);
    writeFileSync(join(d, 'b.js'), 'b');
    utimesSync(join(d, 'b.js'), 3000, 3000);
    expect(newestMtimeMs(d)).toBe(3_000_000);
  });
  it('salin PNG Lakar eksklusif: baru → disalin; identik → dilewati; beda → error tanpa menimpa', () => {
    const d = mkdtempSync(join(tmpdir(), 'png-'));
    writeFileSync(join(d, 'src.png'), 'A');
    const dest = join(d, 'round-1', 'A-lakar.png');
    expect(copyPngExclusive(join(d, 'src.png'), dest)).toBe('disalin');
    expect(copyPngExclusive(join(d, 'src.png'), dest)).toBe('identik');
    writeFileSync(join(d, 'src2.png'), 'B');
    expect(() => copyPngExclusive(join(d, 'src2.png'), dest)).toThrow('tidak ditimpa');
  });
});

// ---------- resume dengan hasil juri rubrik lama (R1/R2) ----------

const verdictAll = (sc: number) =>
  Object.fromEntries([
    ...['R1', 'R2', 'R4', 'R5', 'R6', 'R8', 'R9', 'R10'].map((r) => [r, { skor: sc, bukti: `${r} bukti elemen kiri atas` }]),
    ['slop', { jumlah: 0, butir: [] }],
    ['emoji', 0],
    ['fokus', 'judul atas'],
  ]);
/** claude palsu juri: init tanpa tool/MCP; X 2, Y 1; setiap spawn dicatat ke $SPAWNS. */
const FAKE_JUDGE = `import fs from 'node:fs';let s='';process.stdin.on('data',(d)=>(s+=d));process.stdin.on('end',()=>{
fs.appendFileSync(process.env.SPAWNS,'1\\n');
const w=(e)=>process.stdout.write(JSON.stringify(e)+'\\n');w({type:'system',subtype:'init',cwd:process.cwd(),tools:[],mcp_servers:[]});
w({type:'result',subtype:'success',is_error:false,result:${JSON.stringify(JSON.stringify({ X: verdictAll(2), Y: verdictAll(1) }))},total_cost_usd:0.01});});`;

describe('round --resume dengan hasil juri rubrik lama', () => {
  const roots: string[] = [];
  afterEach(() => {
    delete process.env.SPAWNS;
    for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
  });
  const tmp = () => {
    const r = mkdtempSync(join(tmpdir(), 'bench-round-resume-'));
    roots.push(r);
    return r;
  };

  it('(R1) judge-text.md tersimpan berbeda dari teks juri saat ini → terdaftar (fungsi murni); sama/tidak ada → kosong', () => {
    const roundDir = tmp();
    mkdirSync(join(roundDir, 'judge', 'A'), { recursive: true });
    mkdirSync(join(roundDir, 'judge', 'B'), { recursive: true });
    writeFileSync(join(roundDir, 'judge', 'A', 'judge-text.md'), 'teks juri A v2');
    writeFileSync(join(roundDir, 'judge', 'B', 'judge-text.md'), 'teks juri B v2.1');
    const texts = { A: { text: 'teks juri A v2.1' }, B: { text: 'teks juri B v2.1' }, C: { text: 'teks juri C v2.1' } };
    expect(staleJudgeTexts(roundDir, texts)).toEqual([join('judge', 'A', 'judge-text.md')]);
    expect(staleJudgeTexts(roundDir, { B: texts.B, C: texts.C })).toEqual([]);
    expect(staleJudgeTexts(join(roundDir, 'tidak-ada'), texts)).toEqual([]);
  });

  it('(R2) teks sama: ulangan ok tanpa R9/R10 dijalankan ulang (spawn +1), ulangan lengkap dipakai ulang', async () => {
    const root = tmp();
    const protocol = loadProtocol();
    writeFileSync(join(root, 'fake.mjs'), FAKE_JUDGE);
    writeFileSync(join(root, 'mcp-empty.json'), EMPTY_MCP);
    process.env.SPAWNS = join(root, 'spawns');
    const spawns = () => (existsSync(join(root, 'spawns')) ? readFileSync(join(root, 'spawns'), 'utf8').split('\n').filter(Boolean).length : 0);
    const png = (w: number, h: number, v: number) => encodePngRgb({ width: w, height: h, data: new Uint8Array(w * h * 3).fill(v) });
    const input = {
      prompt: 'B',
      jdir: join(root, 'judge', 'B'),
      text: 'teks juri B (uji)',
      images: { lakar: judgeImagesFromStripPng(png(4, 6, 200)), pendev: judgeImagesFromStripPng(png(4, 8, 30)) },
      emptyMcpConfig: join(root, 'mcp-empty.json'),
      config: { ...protocol.config, timeoutMs: 10_000 },
      forbiddenCwdRoot: join(root, 'terlarang'),
      reuse: ROUND_JUDGE_REUSE,
      command: process.execPath,
      prefixArgs: [join(root, 'fake.mjs')],
    };
    const first = await judgePrompt(input);
    expect(first.fatal).toBeUndefined();
    expect(spawns()).toBe(3);
    // Ulangan 2 dari rubrik lama: ok tanpa R9/R10.
    const repFile = join(root, 'judge', 'B', 'rep-2', 'rep.json');
    const old = JSON.parse(readFileSync(repFile, 'utf8')) as JudgeRepRecord & { verdict: Record<string, Record<string, unknown>> };
    expect(old.status).toBe('ok');
    for (const l of ['X', 'Y']) {
      delete old.verdict[l]!.R9;
      delete old.verdict[l]!.R10;
    }
    writeFileSync(repFile, JSON.stringify(old));
    const again = await judgePrompt(input);
    expect(spawns()).toBe(4);
    expect(again.reps.map((r) => r.status)).toEqual(['ok', 'ok', 'ok']);
    expect(again.reps[1]!.verdict?.X?.R9).toBeDefined();
    // Ketiga ulangan kini lengkap: dipakai ulang tanpa spawn.
    await judgePrompt(input);
    expect(spawns()).toBe(4);
    expect(ROUND_JUDGE_REUSE({ ...old, status: 'invalid' })).toBe(false);
    expect(ROUND_JUDGE_REUSE({ ...old, status: 'failed' })).toBe(true);
  }, 30_000);
});

describe('daftar aturan R3/R7 yang belum dihitung diturunkan dari G0_RULES', () => {
  it('G0_RULES saat ini: LC-11 dan LC-18 sudah ada', () => {
    expect(r3r7Missing()).toBe('aturan LC-03/06/07/13/14/17/21 belum ada di `G0_RULES`.');
  });
  it('laporan memakai G0_RULES beku putaran (pra-1.23 tanpa LC-11/LC-18); tidak terbaca → aturan saat ini', () => {
    const pre = JSON.stringify({ 'LC-01a': {}, 'LC-02a': {}, 'LC-05': {}, 'LC-12': {}, 'LC-20': {} });
    expect(r3r7Missing(frozenG0Rules(pre))).toBe('aturan LC-03/06/07/11/13/14/17/18/21 belum ada di `G0_RULES`.');
    for (const bad of [undefined, '[]', 'bukan json']) expect(r3r7Missing(frozenG0Rules(bad))).toBe('aturan LC-03/06/07/13/14/17/21 belum ada di `G0_RULES`.');
  });
  it('tanpa aturan katalog / semua ada', () => {
    expect(r3r7Missing({})).toBe('aturan LC-03/06/07/11/13/14/17/18/21 belum ada di `G0_RULES`.');
    const all = Object.fromEntries(['LC-03', 'LC-06', 'LC-07', 'LC-11', 'LC-13', 'LC-14', 'LC-17', 'LC-18', 'LC-21'].map((r) => [r, 1]));
    expect(r3r7Missing(all)).toContain('semua aturan katalog');
  });
});
