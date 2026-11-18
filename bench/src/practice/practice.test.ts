import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildJudgeText, buildJudgeTextWith, DESIGN_MD_PATH, judgeC7Problems, judgeLeaks, NO_CRITERIA_SENTENCE } from '../judge/prompt.js';
import { readRubricJson } from '../judge/rubric.js';
import { GOLDEN_SET_PATH, loadProtocol } from '../protocol.js';
import type { RoundRun } from '../round/report.js';
import { sha256 } from '../sys.js';
import {
  budgetProblem,
  emojiOf,
  estimateCost,
  BUDGET_USD,
  MAX_ITER,
  parsePracticeArgs,
  pendevReuseProblems,
  practiceDrift,
  practiceOutcome,
  practicePromptC7Problems,
  practiceRubricProblems,
  preparePracticeJudgeTexts,
  previousCosts,
  renderPractice,
  renderPracticeMarkdown,
  selectPrompts,
  type PracticeFrozen,
  type PracticePromptResult,
  type PracticeReport,
} from './main.js';
import { loadPracticePrompts } from './prompts.js';

const HAVE_SOURCES = existsSync(DESIGN_MD_PATH) && existsSync(GOLDEN_SET_PATH);
const { prompts } = loadPracticePrompts();

describe('practice: argumen', () => {
  it('iter wajib, maks 3; only, reuse-pendev (< iter), resume, dry-run', () => {
    expect(parsePracticeArgs(['--iter', '1'])).toEqual({ ok: true, value: { iter: 1, only: undefined, reusePendev: undefined, resume: false, dryRun: false } });
    expect(parsePracticeArgs(['--', '--iter=2', '--only', 'P1,P3,P1', '--reuse-pendev', '1', '--resume', '--dry-run'])).toEqual({
      ok: true,
      value: { iter: 2, only: ['P1', 'P3'], reusePendev: 1, resume: true, dryRun: true },
    });
    expect(parsePracticeArgs([]).ok).toBe(false);
    expect(parsePracticeArgs(['--iter', '0']).ok).toBe(false);
    expect(parsePracticeArgs(['--iter', String(MAX_ITER + 1)])).toMatchObject({ ok: false, error: expect.stringContaining('maksimal') });
    expect(parsePracticeArgs(['--iter', '2', '--reuse-pendev', '2']).ok).toBe(false);
    expect(parsePracticeArgs(['--iter', '1', '--only', 'A']).ok).toBe(false);
    expect(parsePracticeArgs(['--iter', '1', '--round', '1']).ok).toBe(false);
  });

  it('selectPrompts: subset --only, ID tak dikenal = masalah', () => {
    expect(selectPrompts(prompts, undefined).prompts.map((p) => p.id)).toEqual(['P1', 'P2', 'P3', 'P4']);
    expect(selectPrompts(prompts, ['P3', 'P1']).prompts.map((p) => p.id)).toEqual(['P1', 'P3']);
    expect(selectPrompts(prompts, ['P9']).problems).toEqual(['prompt P9 tidak ada di prompts.json']);
  });
});

describe('practice: pakai ulang pen.dev, biaya, anggaran', () => {
  it('iterasi sumber tidak lengkap → masalah per prompt (sebelum spawn)', () => {
    const ok = { exists: true, status: 'success', wallMs: 100_000, strip: true };
    expect(pendevReuseProblems(1, ['P1', 'P2'], () => ok)).toEqual([]);
    const bad = pendevReuseProblems(1, ['P1', 'P2', 'P3', 'P4'], (id) =>
      id === 'P1' ? { ...ok, exists: false } : id === 'P2' ? { ...ok, status: 'failed' } : id === 'P3' ? { ...ok, strip: false } : { ...ok, exists: false, reusedFrom: 1 },
    );
    expect(bad).toEqual([
      'P1: run pen.dev iterasi 1 tidak ada',
      'P2: run pen.dev iterasi 1 berstatus failed, bukan success',
      'P3: strip pen.dev iterasi 1 tidak ada',
      'P4: run pen.dev iterasi 1 tidak ada (iterasi 1 memakai ulang iterasi 1; pakai --reuse-pendev 1)',
    ]);
  });

  it('perkiraan biaya sisa: run final dan juri lengkap tidak dihitung; pakai ulang pen.dev = 0', () => {
    const ids = ['P1', 'P2', 'P3', 'P4'];
    expect(estimateCost({ prompts: ids, reusePendev: false, doneRuns: new Set(), doneJudge: new Set() })).toBe(11.2);
    expect(estimateCost({ prompts: ids, reusePendev: true, doneRuns: new Set(), doneJudge: new Set() })).toBe(7.6);
    expect(estimateCost({ prompts: ids, reusePendev: false, doneRuns: new Set(['P1-pendev', 'P1-lakar']), doneJudge: new Set(['P1']) })).toBe(8.4);
  });

  it('biaya kumulatif dari laporan sebelumnya; anggaran $57,80 (iterasi maks 6)', () => {
    expect(MAX_ITER).toBe(6);
    expect(BUDGET_USD).toBe(57.8);
    expect(parsePracticeArgs(['--iter', '6', '--reuse-pendev', '2'])).toMatchObject({ ok: true, value: { iter: 6, reusePendev: 2 } });
    expect(parsePracticeArgs(['--iter', '7'])).toMatchObject({ ok: false });
    const reports: Record<number, { cost: { iteration: number } }> = { 1: { cost: { iteration: 9.5 } }, 2: { cost: { iteration: 6.25 } } };
    expect(previousCosts(3, (j) => reports[j])).toEqual({ byIter: { 1: 9.5, 2: 6.25 }, total: 15.75 });
    expect(previousCosts(1, () => undefined)).toEqual({ byIter: {}, total: 0 });
    expect(budgetProblem(15.75, 7.6)).toBeUndefined();
    expect(budgetProblem(23, 7.6)).toBeUndefined();
    expect(budgetProblem(50.5, 7.6)).toMatch(/anggaran: terpakai \$50\.50 \+ perkiraan sisa \$7\.60 > \$57\.8/);
    expect(budgetProblem(23, 7.6, 30)).toMatch(/anggaran: terpakai \$23\.00 \+ perkiraan sisa \$7\.60 > \$30/);
  });
});

const run = (wallMs: number, extra: Partial<RoundRun> = {}, gate = 0): RoundRun =>
  ({
    key: 'k',
    prompt: 'P1',
    tool: 'lakar',
    dir: 'd',
    record: { wallMs, frames: [], lakar: { layout: { summary: { gate, error: 0, warning: 0 } } } },
    reconnect: undefined,
    agentEmoji: { emoji: 0, glyphs: 0, samples: [] },
    lintEmoji: { lc01a: 0, lc01b: 0 },
    strip: undefined,
    previous: [],
    ...extra,
  }) as unknown as RoundRun;

const result = (id: string, decision: string, o: { lakarMs?: number; pendevMs?: number; judgeEmoji?: number; gate?: number; agentEmoji?: number } = {}): Pick<PracticePromptResult, 'id' | 'decision' | 'runs' | 'emoji'> => {
  const lakar = run(o.lakarMs ?? 100_000, o.agentEmoji ? { agentEmoji: { emoji: o.agentEmoji, glyphs: 0, samples: ['x'] } } : {}, o.gate ?? 0);
  const pendev = run(o.pendevMs ?? 100_000);
  return {
    id,
    decision: { decision: decision as never, why: '' },
    runs: { lakar, pendev },
    emoji: { lakar: emojiOf(lakar, { values: [], median: o.judgeEmoji ?? 0, range: 0, flag: false }, 'lakar'), pendev: emojiOf(pendev, undefined, 'pendev') },
  };
};

describe('practice: hasil iterasi (AC)', () => {
  const ids = ['P1', 'P2', 'P3', 'P4'];
  it('lulus: ≥ 3 dari 4 Setara/Lebih baik, waktu ≤ 1,5×, emoji 0, gate 0', () => {
    const r = practiceOutcome([result('P1', 'Setara'), result('P2', 'Lebih baik'), result('P3', 'Kalah'), result('P4', 'Setara', { lakarMs: 150_000 })], ids);
    expect(r).toEqual({ pass: true, passCount: 3, total: 4, reasons: [] });
  });

  it('gagal: 2 dari 4, waktu > 1,5×, emoji (a)/(c), gate, prompt hilang', () => {
    const r = practiceOutcome(
      [result('P1', 'Setara', { lakarMs: 151_000 }), result('P2', 'Kalah', { agentEmoji: 1 }), result('P3', 'Kalah', { judgeEmoji: 1, gate: 2 })],
      ids,
    );
    expect(r.pass).toBe(false);
    expect(r.reasons).toEqual([
      'prompt tidak ada di iterasi ini: P4',
      'Setara/Lebih baik 1 dari 3 (< 3)',
      'P1: waktu Lakar 151.0 dtk > 1.5 × pen.dev 100.0 dtk',
      'P2: emoji Lakar (a) 1 / (b) 0 / (c) 0',
      'P3: emoji Lakar (a) 0 / (b) 0 / (c) 1',
      'P3: layout_check gate 2',
    ]);
  });
});

describe('practice: penjaga', () => {
  const frozen: PracticeFrozen = {
    head: 'h',
    porcelain: '',
    protocolHash: 'p',
    wrapperSha256: 'w',
    promptsSha256: 's',
    model: 'm',
    claude: 'c',
    pendevDesktop: '1',
    lakard: { pid: 1 },
    skills: { 'core.md': 'a' },
    distSha: {},
    rubric: { version: '2.1', lampiranBSha256: 'l' },
    judge: { model: 'm', argv: 'x', textSha256: { P1: 'j' } },
    reusePendev: undefined,
  };
  it('drift saat --resume: skill/prompt berubah tercatat, pid lakard tidak', () => {
    expect(practiceDrift(frozen, { ...frozen, lakard: { pid: 2 } })).toEqual([]);
    expect(practiceDrift(frozen, { ...frozen, skills: { 'core.md': 'b' }, promptsSha256: 't' })).toEqual(['promptsSha256: s → t', 'skills: {"core.md":"a"} → {"core.md":"b"}']);
  });

  it.skipIf(!HAVE_SOURCES)('rubrik bergeser → masalah; rubrik saat ini (2.1) lulus', () => {
    const design = readFileSync(DESIGN_MD_PATH, 'utf8');
    const rj = readRubricJson()!;
    expect(practiceRubricProblems(design, rj)).toEqual([]);
    expect(practiceRubricProblems(design, { ...rj, version: '2' })).toEqual(expect.arrayContaining([expect.stringContaining('rubric.json versi 2 ≠ 2.1')]));
    expect(practiceRubricProblems(design.replace('Versi rubrik: 2.1', 'Versi rubrik: 2.2'), rj).length).toBeGreaterThan(0);
    expect(practiceRubricProblems(design, undefined)).toEqual(['bench/rubric/rubric.json tidak ada']);
  });

  it.skipIf(!HAVE_SOURCES)('teks juri latihan: tanpa kriteria golden, kalimat netral, lulus bocor + C7; teks A/B tetap = rubric.json', () => {
    const design = readFileSync(DESIGN_MD_PATH, 'utf8');
    const golden = readFileSync(GOLDEN_SET_PATH, 'utf8');
    const protocol = loadProtocol();
    const texts = preparePracticeJudgeTexts(protocol, prompts, design);
    for (const p of prompts) {
      const t = texts[p.id]!;
      expect(t.text).toContain(p.text);
      expect(t.text).toContain(NO_CRITERIA_SENTENCE);
      expect(t.text).not.toContain('## Kriteria golden untuk prompt ini');
      expect(t.text).toContain('| R10 |');
      expect(judgeLeaks(t.text)).toEqual([]);
      expect(t.rubricVersion).toBe('2.1');
      expect(practicePromptC7Problems(renderPractice(protocol, p), golden)).toEqual([]);
    }
    // Penjaga hidup: kalimat rahasia di skill palsu terdeteksi.
    const secretLine = texts.P1!.secret.split('\n').find((l) => l.startsWith('| R9 |'))!;
    expect(judgeC7Problems(texts.P1!.secret, [{ name: 'skill palsu', text: secretLine }]).length).toBeGreaterThan(0);
    // A/B byte-identik dengan snapshot rubrik (buildJudgeText = buildJudgeTextWith + kriteria golden).
    const rj = readRubricJson()!;
    for (const id of ['A', 'B'] as const) expect(sha256(buildJudgeText(design, golden, id, protocol.prompts[id]).text), id).toBe(rj.judgeTextSha256[id]);
    expect(buildJudgeTextWith(design, ['1. contoh'], 'x').text).toContain('## Kriteria golden untuk prompt ini\n\n1. contoh');
  });

  it.skipIf(!HAVE_SOURCES)('C7 prompt latihan: frasa kriteria golden dan token terlarang terdeteksi', () => {
    const golden = readFileSync(GOLDEN_SET_PATH, 'utf8');
    expect(practicePromptC7Problems('Desain sesuai rubrik juri.', golden)).toEqual(expect.arrayContaining([expect.stringContaining('token terlarang')]));
  });
});

describe('practice: laporan', () => {
  it('markdown memuat status lulus, tabel, biaya kumulatif, penjaga .pen', () => {
    const r = result('P1', 'Setara');
    const res = {
      ...r,
      name: 'Rakit Kode',
      kind: 'landing',
      size: { width: 1440, height: null },
      judgeTextSha256: 'abc',
      pendevReusedFrom: 1,
      gate: { ok: true, reasons: [], timeRatio: 1 },
      sizeProblems: [],
      pendevSizeProblems: ['board x 1440×900 ≠ 1440×800'],
      score: undefined,
      pngs: { lakar: 'bench/practice/1/P1-lakar.png', pendev: 'bench/runs/practice/1/P1-pendev.png' },
      cost: { lakar: 1, pendev: 0.8, pendevCounted: false, judge: 0.7 },
    } as PracticePromptResult;
    const rep = {
      iter: 2,
      date: 'd',
      status: 'lengkap',
      statusReasons: [],
      frozen: {
        head: 'h',
        porcelain: '',
        protocolHash: 'p',
        wrapperSha256: 'w',
        promptsSha256: 's',
        model: 'm',
        claude: 'c',
        pendevDesktop: '1',
        lakard: {},
        skills: {},
        distSha: {},
        rubric: { version: '2.1', lampiranBSha256: 'l' },
        judge: { model: 'm', argv: 'x', textSha256: {} },
        reusePendev: 1,
      },
      wrapper: 'W {{PROMPT}}',
      argv: { lakar: 'a', pendev: 'b', judge: 'c' },
      results: [res],
      outcome: { pass: false, passCount: 1, total: 1, reasons: ['prompt tidak ada di iterasi ini: P2'] },
      cost: { pendev: 0, lakar: 1, judge: 0.7, iteration: 1.7, previous: { 1: 9 }, cumulative: 10.7, budget: 30 },
      penGuard: { files: 31, changed: [], removed: [], added: [] },
      lakardActiveAfter: 'active',
      notes: ['n'],
    } satisfies PracticeReport;
    const md = renderPracticeMarkdown(rep);
    expect(md).toContain('## Hasil iterasi: **belum lulus**');
    expect(md).toContain('| P1 Rakit Kode | landing (1440×bebas) |');
    expect(md).toContain('(iter 1)');
    expect(md).toContain('kumulatif **$10.70** dari anggaran $30');
    expect(md).toContain('`bench/practice/1/P1-lakar.png`');
    expect(md).toContain('31 file `.pen`');
  });
});
