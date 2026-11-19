import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodePngRgb } from './png/codec.js';
import { LEGACY_G0_DIR, loadProtocol, promptHashes, protocolHash } from './protocol.js';
import { adamDecisions, calibrationCheck, loadRejudgeSources, parseRejudgeArgs, runRejudge, sourceJudgeTexts, type RejudgeOptions, type RejudgePrompt } from './rejudge.js';
import { aggregateScores, decide } from './round/score.js';
import { sha256 } from './sys.js';
import type { JudgeRepRecord } from './judge/run.js';

const protocol = loadProtocol();

describe('protokol beku', () => {
  it('(g) protokol G0 beku 907cb36f… (snapshot legacy) dan hash per prompt A/B tidak bergeser', () => {
    expect(protocolHash(LEGACY_G0_DIR)).toBe('907cb36f4674d422feded4506851b6391082b40b918dd46841edae607bedb85d');
    expect(promptHashes(protocol, ['A', 'B'])).toEqual(promptHashes(loadProtocol(LEGACY_G0_DIR)));
  });
});

describe('argumen rejudge', () => {
  it('--from ID putaran, --label slug, --resume, --dry-run', () => {
    expect(parseRejudgeArgs(['--from', '1', '--label', 'r1-v2-1'])).toEqual({ ok: true, value: { from: '1', label: 'r1-v2-1', resume: false, dryRun: false } });
    expect(parseRejudgeArgs(['--', '--from=uji-1', '--label=x', '--resume', '--dry-run'])).toEqual({ ok: true, value: { from: 'uji-1', label: 'x', resume: true, dryRun: true } });
    expect(parseRejudgeArgs(['--label', 'x']).ok).toBe(false);
    expect(parseRejudgeArgs(['--from', 'round-1', '--label', 'x']).ok).toBe(false);
    expect(parseRejudgeArgs(['--from', '1', '--label', '../x']).ok).toBe(false);
    expect(parseRejudgeArgs(['--from', '1']).ok).toBe(false);
  });

  it('keputusan Adam dari tabel Konfirmasi Adam (belum diisi → tidak ada)', () => {
    const md = '## Konfirmasi Adam\n\n| Prompt | S | R | Adam | Koreksi |\n|---|---|---|---|---|\n| A | Lebih baik | tidak ada | **Kalah** | skor a \\| b |\n| B | Setara | – | menunggu konfirmasi Adam | x |\n\n## Versi beku\n| C | x | x | Kalah | x |\n';
    expect(adamDecisions(md)).toEqual({ A: 'Kalah' });
    expect(adamDecisions('# tanpa bagian')).toEqual({});
  });
});

// ---------- (f) rejudge dengan claude palsu ----------

const tool = (t: 'lakar' | 'pendev') => t;
const png = (w: number, h: number, v: number) => encodePngRgb({ width: w, height: h, data: new Uint8Array(w * h * 3).fill(v) });
const verdict = (s: number) =>
  Object.fromEntries([
    ...['R1', 'R2', 'R4', 'R5', 'R6', 'R8', 'R9', 'R10'].map((r) => [r, { skor: s, bukti: `${r} bukti elemen kiri atas` }]),
    ['slop', { jumlah: 0, butir: [] }],
    ['emoji', 0],
    ['fokus', 'judul atas'],
  ]);
/** claude palsu: init tanpa tool/MCP; X selalu 2, Y selalu 1; setiap spawn dicatat ke $SPAWNS. */
const FAKE = `import fs from 'node:fs';let s='';process.stdin.on('data',(d)=>(s+=d));process.stdin.on('end',()=>{
fs.appendFileSync(process.env.SPAWNS,'1\\n');
const w=(e)=>process.stdout.write(JSON.stringify(e)+'\\n');w({type:'system',subtype:'init',cwd:process.cwd(),tools:[],mcp_servers:[]});
w({type:'result',subtype:'success',is_error:false,result:${JSON.stringify(JSON.stringify({ X: verdict(2), Y: verdict(1) }))},total_cost_usd:0.01});});`;

describe('rejudge (claude palsu)', () => {
  let root: string;
  let opts: RejudgeOptions;
  const spawns = () => (existsSync(join(root, 'spawns')) ? readFileSync(join(root, 'spawns'), 'utf8').split('\n').filter(Boolean).length : 0);
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'bench-rejudge-test-'));
    const bench = join(root, 'bench');
    mkdirSync(join(bench, 'runs', 'rounds', 'uji-9'), { recursive: true });
    writeFileSync(join(bench, 'runs/rounds/uji-9/B-lakar.png'), png(4, 6, 200));
    writeFileSync(join(bench, 'runs/rounds/uji-9/B-pendev.png'), png(4, 8, 30));
    writeFileSync(join(root, 'fake.mjs'), FAKE);
    const src = {
      results: [
        {
          prompt: 'B',
          gate: { ok: true, reasons: [], timeRatio: 0.7 },
          decision: { decision: 'Lebih baik', why: 'lolos gerbang, total 10 ≥ 6 + 2' },
          score: { tools: { lakar: { total: 10 }, pendev: { total: 6 } } },
          runs: {
            lakar: { record: { status: 'success', frames: [{ id: 'b1', width: 390, height: 844 }] }, strip: { path: 'bench/runs/rounds/uji-9/B-lakar.png' } },
            pendev: { record: { status: 'success', frames: [{ id: 'z', width: 390, height: 1109 }] }, strip: { path: 'bench/runs/rounds/uji-9/B-pendev.png' } },
          },
        },
      ],
    };
    writeFileSync(join(bench, 'round-uji-9.json'), JSON.stringify(src));
    writeFileSync(join(bench, 'round-uji-9.md'), '## Konfirmasi Adam\n\n| Prompt | S | R | Adam | K |\n|---|---|---|---|---|\n| B | Lebih baik | – | **Setara** | x |\n');
    const text = 'teks juri B (uji)';
    process.env.SPAWNS = join(root, 'spawns');
    opts = {
      args: { from: 'uji-9', label: 'uji9-v2-1', resume: false, dryRun: false },
      config: { ...protocol.config, timeoutMs: 10_000 },
      judgeTexts: { B: { text, secret: '', sha256: sha256(text), rubricVersion: '2' } },
      rubric: { version: '2', date: '2026-11-18', judgeTextSha256: { B: sha256(text) }, sourceSha256: {} },
      claudeVersion: '2.1.325 (Claude Code)',
      head: 'abc123',
      benchRoot: bench,
      repoRoot: root,
      runsRoot: join(bench, 'runs'),
      command: process.execPath,
      prefixArgs: [join(root, 'fake.mjs')],
    };
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.SPAWNS;
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it('3 ulangan, label acak (kedua penugasan), laporan memuat versi + sha + keputusan v2/sumber/Adam + pelanggaran brief', async () => {
    expect(await runRejudge(opts)).toBe(0);
    expect(spawns()).toBe(3);
    const out = join(root, 'bench/runs/rejudge/uji9-v2-1/B');
    expect(readFileSync(join(out, 'judge-text.md'), 'utf8')).toBe('teks juri B (uji)');
    const assignments = JSON.parse(readFileSync(join(out, 'assignments.json'), 'utf8')) as { X: string }[];
    expect(new Set(assignments.map((a) => a.X)).size).toBe(2);
    for (let k = 1; k <= 3; k++) expect(JSON.parse(readFileSync(join(out, `rep-${k}`, 'mapping.json'), 'utf8'))).toEqual(assignments[k - 1]);
    const md = readFileSync(join(root, 'bench/rejudge-uji9-v2-1.md'), 'utf8');
    const json = JSON.parse(readFileSync(join(root, 'bench/rejudge-uji9-v2-1.json'), 'utf8'));
    expect(md).toContain('Versi rubrik: 2');
    expect(md).toContain(`sha256 teks juri B: \`${sha256('teks juri B (uji)')}\``);
    expect(md).toContain('Claude Code: 2.1.325');
    expect(md).toContain('git HEAD: `abc123`');
    expect(md).toMatch(/\| Lebih baik \(T 10 vs 6\) \| Setara \|/); // keputusan sumber + Adam berdampingan
    expect(md).toContain('Lebih baik (T 10 vs 6)'); // keputusan sumber
    expect(md).toContain('ukuran: board z 390×1109 ≠ 390×844');
    expect(md).toContain('**R9 Lakar**');
    expect(md).toContain('R10 bukti elemen kiri atas');
    expect(md).toContain('hold-out');
    expect(json).toMatchObject({ status: 'lengkap', from: 'uji-9', judge: { rubricVersion: '2', matchesRubricJson: true }, prompts: [{ prompt: 'B', adamDecision: 'Setara' }] });
    expect(json.judgeCostUsd).toBeCloseTo(0.03);
    expect(json.prompts[0].score.validReps).toBe(3);
  });

  it('teks juri prompt di luar putaran sumber (C–E belum di-snapshot) tidak memblokir dan tidak tercatat', async () => {
    const c = 'teks juri C (belum di-snapshot)';
    const withC = { ...opts, judgeTexts: { ...opts.judgeTexts, C: { text: c, secret: '', sha256: sha256(c), rubricVersion: '2' } } };
    expect(sourceJudgeTexts(withC.judgeTexts, ['B'])).toEqual(opts.judgeTexts);
    expect(await runRejudge(withC)).toBe(0);
    const json = JSON.parse(readFileSync(join(root, 'bench/rejudge-uji9-v2-1.json'), 'utf8'));
    expect(Object.keys(json.judge.textSha256)).toEqual(['B']);
    expect(json.judge.matchesRubricJson).toBe(true);
  });

  it('label sudah ada → 64 tanpa menimpa; --resume memakai ulang ulangan ok tanpa spawn', async () => {
    expect(await runRejudge(opts)).toBe(0);
    const before = readFileSync(join(root, 'bench/runs/rejudge/uji9-v2-1/B/assignments.json'), 'utf8');
    expect(await runRejudge(opts)).toBe(64);
    expect(spawns()).toBe(3);
    expect(await runRejudge({ ...opts, args: { ...opts.args, resume: true } })).toBe(0);
    expect(spawns()).toBe(3);
    expect(readFileSync(join(root, 'bench/runs/rejudge/uji9-v2-1/B/assignments.json'), 'utf8')).toBe(before);
  });

  it('--resume dengan teks juri berubah (rubrik naik versi) → 1 tanpa spawn, laporan lama tidak ditimpa', async () => {
    expect(await runRejudge(opts)).toBe(0);
    const md = readFileSync(join(root, 'bench/rejudge-uji9-v2-1.md'), 'utf8');
    const text = 'teks juri B (uji) v2.1';
    const bumped = { ...opts, args: { ...opts.args, resume: true }, judgeTexts: { B: { text, secret: '', sha256: sha256(text), rubricVersion: '2.1' } }, rubric: { ...opts.rubric!, version: '2.1', judgeTextSha256: { B: sha256(text) } } };
    expect(await runRejudge(bumped)).toBe(1);
    expect(spawns()).toBe(3);
    expect(readFileSync(join(root, 'bench/rejudge-uji9-v2-1.md'), 'utf8')).toBe(md);
  });

  it('ulangan ok tersimpan tanpa R9/R10 (rubrik lama) tidak dipakai ulang saat --resume', async () => {
    expect(await runRejudge(opts)).toBe(0);
    const repFile = join(root, 'bench/runs/rejudge/uji9-v2-1/B/rep-1/rep.json');
    const rep = JSON.parse(readFileSync(repFile, 'utf8'));
    for (const l of ['X', 'Y']) { delete rep.verdict[l].R9; delete rep.verdict[l].R10; }
    writeFileSync(repFile, JSON.stringify(rep));
    expect(await runRejudge({ ...opts, args: { ...opts.args, resume: true } })).toBe(0);
    expect(spawns()).toBe(4);
  });

  it('sumber tidak lengkap → exit ≠ 0 sebelum spawn, pesan menyebut path', async () => {
    rmSync(join(root, 'bench/runs/rounds/uji-9/B-pendev.png'));
    const errors: string[] = [];
    vi.mocked(console.error).mockImplementation((m: string) => void errors.push(m));
    expect(await runRejudge(opts)).toBe(1);
    expect(errors.join('\n')).toContain('bench/runs/rounds/uji-9/B-pendev.png');
    expect(spawns()).toBe(0);
    expect(loadRejudgeSources('uji-404', join(root, 'bench'), root).problems[0]).toContain('bench/round-uji-404.json');
  });

  it('sha teks juri ≠ rubric.json → abort sebelum spawn; --dry-run tanpa spawn', async () => {
    expect(await runRejudge({ ...opts, rubric: { ...opts.rubric!, judgeTextSha256: { B: 'lama' } } })).toBe(1);
    expect(spawns()).toBe(0);
    expect(await runRejudge({ ...opts, args: { ...opts.args, dryRun: true } })).toBe(0);
    expect(spawns()).toBe(0);
    expect(readdirSync(join(root, 'bench')).some((f) => f.startsWith('rejudge-'))).toBe(false);
  });
});

describe('ambang lulus kalibrasi (putaran 1)', () => {
  const rep = (k: number, X: 'lakar' | 'pendev', l: number[], p: number[]): JudgeRepRecord => {
    const v = (s: number[]) => ({
      ...Object.fromEntries(['R1', 'R2', 'R4', 'R5', 'R6', 'R8', 'R9', 'R10'].map((r, i) => [r, { skor: s[i] as 0 | 1 | 2, bukti: 'b' }])),
      slop: { jumlah: 0, butir: [] },
      emoji: 0,
      fokus: 'f',
    });
    const [vx, vy] = X === 'lakar' ? [v(l), v(p)] : [v(p), v(l)];
    return { prompt: 'A', rep: k, mapping: X === 'lakar' ? { X: tool('lakar'), Y: tool('pendev') } : { X: tool('pendev'), Y: tool('lakar') }, status: 'ok', verdict: { X: vx as never, Y: vy as never }, attempts: [], retried: false, costUsd: 0.2 };
  };
  const mk = (prompt: string, l: number[], p: number[], sizeProblems: string[]): RejudgePrompt => {
    const score = aggregateScores(prompt, [rep(1, 'lakar', l, p), rep(2, 'pendev', l, p), rep(3, 'lakar', l, p)]);
    return {
      prompt,
      strips: { lakar: 'a', pendev: 'b' },
      gate: { ok: true, reasons: [], timeRatio: 1 },
      pendevSizeProblems: sizeProblems,
      score,
      decision: decide({ gate: { ok: true, reasons: [], timeRatio: 1 }, lakarRunOk: true, pendevRunOk: true, score, pendevBrief: { sizeProblems } }),
      sourceDecision: undefined,
      sourceTotals: { lakar: undefined, pendev: undefined },
      adamDecision: undefined,
      costUsd: 0.6,
    };
  };
  it('A Kalah (D_P > D_L) + B Setara karena pelanggaran brief → lulus; A Lebih baik → tidak lulus; hold-out tidak dinilai', () => {
    const A = mk('A', [2, 1, 2, 2, 1, 2, 0, 1], [2, 1, 1, 1, 1, 1, 2, 2], []);
    const B = mk('B', [2, 1, 2, 2, 2, 1, 1, 0], [0, 1, 1, 1, 2, 1, 2, 2], ['board z 390×1109 ≠ 390×844']);
    expect(A.decision.decision).toBe('Kalah');
    expect(B.decision.decision).toBe('Setara');
    expect(calibrationCheck('1', [A, B])).toEqual({ applies: true, pass: true, reasons: [], flags: [] });
    const A2 = mk('A', [2, 2, 2, 2, 2, 2, 2, 2], [1, 1, 1, 1, 1, 1, 1, 1], []);
    const c = calibrationCheck('1', [A2, B]);
    expect(c.pass).toBe(false);
    expect(c.reasons.join(' ')).toMatch(/A: keputusan Lebih baik/);
    expect(calibrationCheck('uji-1', [A, B])).toMatchObject({ applies: false, pass: false });
  });
});
