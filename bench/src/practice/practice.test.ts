import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildJudgeText, buildJudgeTextWith, DESIGN_MD_PATH, judgeC7Problems, judgeLeaks, NO_CRITERIA_SENTENCE } from '../judge/prompt.js';
import { readRubricJson } from '../judge/rubric.js';
import { GOLDEN_SET_PATH, loadProtocol } from '../protocol.js';
import type { RoundRun } from '../round/report.js';
import { boardSizeProblems, boardSizeProblemsFor, sizeRuleFor } from '../lakar/run.js';
import { BENCH_ROOT } from '../protocol.js';
import { penDesktopRestartStep, restartPenDesktopAfterSeries, sha256, type PenDesktopRestartDeps } from '../sys.js';
import {
  beforeAfter,
  budgetProblem,
  comparisonMeta,
  reuseFor,
  reuseText,
  EFFECTS_SERIES,
  POLISH_RUNS,
  POLISH_SERIES,
  EFFECTS_RUNS,
  passMinOf,
  PRACTICE_RUNS,
  PRACTICE_SERIES,
  SERIES,
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
import { EFFECT_PROMPTS_PATH, EFFECT_PROMPTS_SHA256, loadPracticePrompts, POLISH_PROMPTS_PATH, POLISH_PROMPTS_SHA256, PRACTICE_DIR, PRACTICE_ID, PRACTICE_PROMPTS_PATH, PRACTICE_PROMPTS_SHA256 } from './prompts.js';

const HAVE_SOURCES = existsSync(DESIGN_MD_PATH) && existsSync(GOLDEN_SET_PATH);
const { prompts } = loadPracticePrompts();

describe('practice: argumen', () => {
  it('iter wajib, maks 7; only, reuse-pendev (< iter), resume, dry-run', () => {
    expect(parsePracticeArgs(['--iter', '1'])).toEqual({ ok: true, value: { series: 'practice', iter: 1, only: undefined, reusePendev: undefined, resume: false, dryRun: false } });
    expect(parsePracticeArgs(['--', '--iter=2', '--only', 'P1,P3,P1', '--reuse-pendev', '1', '--resume', '--dry-run'])).toEqual({
      ok: true,
      value: { series: 'practice', iter: 2, only: ['P1', 'P3'], reusePendev: 1, resume: true, dryRun: true },
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

  it('biaya kumulatif dari laporan sebelumnya; anggaran $58,09 (iterasi maks 8)', () => {
    expect(MAX_ITER).toBe(8);
    expect(BUDGET_USD).toBe(58.09);
    expect(parsePracticeArgs(['--iter', '8', '--reuse-pendev', '2'])).toMatchObject({ ok: true, value: { iter: 8, reusePendev: 2 } });
    expect(parsePracticeArgs(['--iter', '9'])).toMatchObject({ ok: false });
    const reports: Record<number, { cost: { iteration: number } }> = { 1: { cost: { iteration: 9.5 } }, 2: { cost: { iteration: 6.25 } } };
    expect(previousCosts(3, (j) => reports[j])).toEqual({ byIter: { 1: 9.5, 2: 6.25 }, total: 15.75 });
    expect(previousCosts(1, () => undefined)).toEqual({ byIter: {}, total: 0 });
    // iterasi tanpa laporan (dihentikan) memakai biaya run tersimpan; laporan tetap didahulukan
    expect(previousCosts(4, (j) => reports[j], (j) => (j === 3 ? 2.66 : j === 1 ? 99 : undefined))).toEqual({ byIter: { 1: 9.5, 2: 6.25, 3: 2.66 }, total: 18.41 });
    expect(budgetProblem(15.75, 7.6)).toBeUndefined();
    expect(budgetProblem(23, 7.6)).toBeUndefined();
    expect(budgetProblem(45.18, 7.6)).toBeUndefined();
    expect(budgetProblem(48.09, 7.6)).toBeUndefined();
    expect(budgetProblem(50.5, 7.6)).toMatch(/anggaran: terpakai \$50\.50 \+ perkiraan sisa \$7\.60 > \$58\.09/);
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

  it.skipIf(!HAVE_SOURCES)('rubrik bergeser → masalah; rubrik saat ini (= rubric.json = Lampiran B, ≥ 2.1) lulus', () => {
    const design = readFileSync(DESIGN_MD_PATH, 'utf8');
    const rj = readRubricJson()!;
    expect(practiceRubricProblems(design, rj)).toEqual([]);
    expect(practiceRubricProblems(design, { ...rj, version: '2' })).toEqual(expect.arrayContaining([expect.stringContaining('rubric.json versi 2 < 2.1')]));
    expect(practiceRubricProblems(design.replace(`Versi rubrik: ${rj.version}`, 'Versi rubrik: 9.9'), rj).length).toBeGreaterThan(0);
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
      expect(t.rubricVersion).toBe(readRubricJson()!.version);
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

describe('practice: seri (story 22)', () => {
  it('--series: default practice; effects; tak dikenal ditolak', () => {
    expect(parsePracticeArgs(['--series', 'effects', '--iter', '2', '--reuse-pendev', '1'])).toEqual({
      ok: true,
      value: { series: 'effects', iter: 2, only: undefined, reusePendev: 1, resume: false, dryRun: false },
    });
    expect(parsePracticeArgs(['--series=effects', '--iter', '1', '--only', 'P6'])).toMatchObject({ ok: true, value: { series: 'effects', only: ['P6'] } });
    expect(parsePracticeArgs(['--series', 'effects', '--iter', '1', '--only', 'P1']).ok).toBe(false);
    expect(parsePracticeArgs(['--series', 'round', '--iter', '1'])).toMatchObject({ ok: false, error: expect.stringContaining('--series') });
  });

  it('seri efek: maks 3 iterasi (iterasi ke-4 ditolak), praktik tetap maks 8', () => {
    expect(parsePracticeArgs(['--series', 'effects', '--iter', '3', '--reuse-pendev', '1']).ok).toBe(true);
    expect(parsePracticeArgs(['--series', 'effects', '--iter', '4'])).toMatchObject({ ok: false, error: '--iter 4 > 3: iterasi seri effects maksimal 3' });
    expect(parsePracticeArgs(['--iter', '9'])).toMatchObject({ ok: false, error: '--iter 9 > 8: iterasi latihan maksimal 8' });
  });

  it('config default identik dengan perilaku lama', () => {
    expect(PRACTICE_SERIES).toEqual({
      id: 'practice',
      title: 'Latihan skill',
      promptsPath: PRACTICE_PROMPTS_PATH,
      sha: PRACTICE_PROMPTS_SHA256,
      ids: PRACTICE_ID,
      maxIter: 8,
      budgetUsd: 58.09,
      passRule: { min: 3 },
      reportPrefix: 'practice',
      runsRoot: PRACTICE_RUNS,
      pngDir: PRACTICE_DIR,
      // Satu-satunya perubahan sengaja (story 20): restart pen-desktop sesudah seri pen.dev juga di seri practice.
      restartPenDesktop: true,
      compareWithFirst: false,
    });
    expect(SERIES.practice).toBe(PRACTICE_SERIES);
    expect(passMinOf(PRACTICE_SERIES, 4)).toBe(3);
  });

  it('config efek: P5/P6 beku, $15, semua prompt wajib lulus, laporan/run/PNG terpisah', () => {
    expect(EFFECTS_SERIES).toMatchObject({ id: 'effects', promptsPath: EFFECT_PROMPTS_PATH, sha: EFFECT_PROMPTS_SHA256, maxIter: 3, budgetUsd: 15, passRule: 'all', reportPrefix: 'effects', runsRoot: EFFECTS_RUNS, restartPenDesktop: true });
    expect(EFFECTS_SERIES.runsRoot.endsWith('bench/runs/practice-effects')).toBe(true);
    expect(EFFECTS_SERIES.pngDir.endsWith('bench/practice/effects')).toBe(true);
    expect(loadPracticePrompts(EFFECTS_SERIES.promptsPath, EFFECTS_SERIES.sha).prompts.map((p) => p.id)).toEqual(['P5', 'P6']);
    expect(passMinOf(EFFECTS_SERIES, 2)).toBe(2);
  });

  it('config polish: P7–P9 beku, maks 6 iterasi, $34,58 kumulatif, perkiraan biaya sendiri, semua prompt wajib lulus, banding iterasi 1, laporan/run/PNG terpisah', () => {
    expect(POLISH_SERIES).toMatchObject({ id: 'polish', promptsPath: POLISH_PROMPTS_PATH, sha: POLISH_PROMPTS_SHA256, maxIter: 6, budgetUsd: 34.58, passRule: 'all', reportPrefix: 'polish', runsRoot: POLISH_RUNS, restartPenDesktop: true, compareWithFirst: true });
    expect(POLISH_SERIES.costEstimate).toEqual({ pendev: 0.6, lakar: 1.15, judge: 0.8 });
    expect(parsePracticeArgs(['--series', 'polish', '--iter', '6', '--reuse-pendev', '1'])).toMatchObject({ ok: true, value: { series: 'polish', iter: 6, reusePendev: 1 } });
    expect(parsePracticeArgs(['--series', 'polish', '--iter', '7'])).toMatchObject({ ok: false, error: '--iter 7 > 6: iterasi seri polish maksimal 6' });
    expect(POLISH_SERIES.runsRoot.endsWith('bench/runs/practice-polish')).toBe(true);
    expect(POLISH_SERIES.pngDir.endsWith('bench/practice/polish')).toBe(true);
    expect(SERIES.polish).toBe(POLISH_SERIES);
    expect(loadPracticePrompts(POLISH_SERIES.promptsPath, POLISH_SERIES.sha).prompts.map((p) => p.id)).toEqual(['P7', 'P8', 'P9']);
    expect(parsePracticeArgs(['--series', 'polish', '--iter', '2', '--reuse-pendev', '1', '--only', 'P8'])).toMatchObject({ ok: true, value: { series: 'polish', only: ['P8'], reusePendev: 1 } });
    expect(parsePracticeArgs(['--series', 'polish', '--iter', '1', '--only', 'P5']).ok).toBe(false);
  });

  it('practiceOutcome semua-lulus: satu prompt Kalah → belum lulus', () => {
    const ids = ['P5', 'P6'];
    expect(practiceOutcome([result('P5', 'Setara'), result('P6', 'Lebih baik')], ids, passMinOf(EFFECTS_SERIES, 2))).toEqual({ pass: true, passCount: 2, total: 2, reasons: [] });
    const r = practiceOutcome([result('P5', 'Setara'), result('P6', 'Kalah')], ids, passMinOf(EFFECTS_SERIES, 2));
    expect(r.pass).toBe(false);
    expect(r.reasons).toEqual(['Setara/Lebih baik 1 dari 2 (< 2)']);
  });

  it('anggaran $15: iterasi 1 penuh + iterasi 2 reuse muat; melewati sisa → Abort', () => {
    const iter1 = estimateCost({ prompts: ['P5', 'P6'], reusePendev: false, doneRuns: new Set(), doneJudge: new Set() });
    const iter2 = estimateCost({ prompts: ['P5', 'P6'], reusePendev: true, doneRuns: new Set(), doneJudge: new Set() });
    expect(iter1).toBe(5.6);
    expect(iter2).toBe(3.8);
    expect(budgetProblem(0, iter1, EFFECTS_SERIES.budgetUsd)).toBeUndefined();
    expect(budgetProblem(9.5, iter2, EFFECTS_SERIES.budgetUsd)).toBeUndefined();
    expect(budgetProblem(11.5, iter2, EFFECTS_SERIES.budgetUsd)).toMatch(/anggaran: terpakai \$11\.50 \+ perkiraan sisa \$3\.80 > \$15/);
  });

  it('perbandingan sebelum (iterasi 1) / sesudah', () => {
    const before = [{ ...result('P5', 'Kalah', { lakarMs: 200_000 }), score: undefined }];
    const now = [{ ...result('P5', 'Setara', { lakarMs: 120_000 }), score: undefined }, { ...result('P6', 'Setara'), score: undefined }];
    const c = beforeAfter(before, now);
    expect(c.map((x) => [x.id, x.before?.decision, x.after.decision, x.before?.ratio, x.after.ratio])).toEqual([
      ['P5', 'Kalah', 'Setara', 2, 1.2],
      ['P6', undefined, 'Setara', undefined, 1],
    ]);
  });
});

describe('story 24: pakai ulang pen.dev per prompt, biaya seri, perbandingan iterasi ≥ 3', () => {
  it('--reuse-pendev: angka (semua prompt) atau peta per prompt; ID/iterasi tidak valid ditolak', () => {
    expect(parsePracticeArgs(['--series', 'polish', '--iter', '3', '--reuse-pendev', 'P8=1,P9=1'])).toMatchObject({ ok: true, value: { reusePendev: { P8: 1, P9: 1 } } });
    expect(parsePracticeArgs(['--series', 'polish', '--iter', '4', '--reuse-pendev', 'P7=3,P8=1,P9=1'])).toMatchObject({ ok: true, value: { reusePendev: { P7: 3, P8: 1, P9: 1 } } });
    expect(parsePracticeArgs(['--series', 'polish', '--iter', '3', '--reuse-pendev=2'])).toMatchObject({ ok: true, value: { reusePendev: 2 } });
    for (const bad of ['P8=3', 'P1=1', 'P8=1,P8=1', 'P8', 'P8=0', 'P8=x', ',']) expect(parsePracticeArgs(['--series', 'polish', '--iter', '3', '--reuse-pendev', bad]).ok, bad).toBe(false);
    expect(reuseFor(1, 'P7')).toBe(1);
    expect(reuseFor({ P8: 1 }, 'P7')).toBeUndefined();
    expect(reuseFor({ P8: 1 }, 'P8')).toBe(1);
    expect(reuseFor(undefined, 'P8')).toBeUndefined();
    expect(reuseText(1)).toBe('iterasi 1');
    expect(reuseText(undefined)).toBe('tidak');
    expect(reuseText({ P8: 1, P9: 1 })).toBe('P8 ← iterasi 1, P9 ← iterasi 1; prompt lain pen.dev baru');
  });

  it('perkiraan biaya: pen.dev dihitung hanya untuk prompt tanpa sumber; perkiraan seri polish', () => {
    const ids = ['P7', 'P8', 'P9'];
    const est = POLISH_SERIES.costEstimate!;
    // Iterasi 3 polish: P7 pen.dev baru + Lakar P7–P9 + juri = 0,6 + 3 × 1,15 + 3 × 0,8 = 6,45.
    expect(estimateCost({ prompts: ids, reusePendev: new Set(['P8', 'P9']), doneRuns: new Set(), doneJudge: new Set(), estimate: est })).toBe(6.45);
    expect(estimateCost({ prompts: ids, reusePendev: new Set(ids), doneRuns: new Set(), doneJudge: new Set(), estimate: est })).toBe(5.85);
    expect(budgetProblem(12.74, 6.45, POLISH_SERIES.budgetUsd)).toBeUndefined();
    // Story 2.16: iterasi 5 (reuse penuh) dari $22,58 terpakai = $28,43 ≤ $34,58; iterasi 6 sesudahnya pun muat.
    expect(budgetProblem(22.58, 5.85, POLISH_SERIES.budgetUsd)).toBeUndefined();
    expect(budgetProblem(28.43, 5.85, POLISH_SERIES.budgetUsd)).toBeUndefined();
    expect(budgetProblem(30, 5.85, POLISH_SERIES.budgetUsd)).toMatch(/> \$34\.58/);
  });

  it('frozen.reusePendev peta: drift terbaca; Versi beku menyebut sumber per prompt', () => {
    const f = { reusePendev: { P8: 1, P9: 1 } } as unknown as PracticeFrozen;
    const base = { head: 'h', porcelain: '', protocolHash: 'p', wrapperSha256: 'w', promptsSha256: 's', model: 'm', claude: 'c', pendevDesktop: '1', lakard: {}, skills: {}, distSha: {}, rubric: { version: '2.2', lampiranBSha256: 'l' }, judge: { model: 'm', argv: 'x', textSha256: {} } };
    expect(practiceDrift({ ...base, ...f }, { ...base, reusePendev: { P8: 1 } })).toEqual(['reusePendev: {"P8":1,"P9":1} → {"P8":1}']);
  });

  it('comparisonMeta: versi rubrik iterasi 1 vs sekarang + wall pen.dev lama vs baru per prompt; tabel diperluas hanya bila ada', () => {
    const first = { frozen: { rubric: { version: '2.1' } }, results: [result('P7', 'Kalah', { pendevMs: 97_500 })] } as unknown as PracticeReport;
    const now = [result('P7', 'Setara', { pendevMs: 140_000 }), result('P8', 'Setara', { pendevMs: 200_000 })];
    const m = comparisonMeta(first, { rubricVersion: '2.2', results: now });
    expect(m).toEqual({ rubricFirst: '2.1', rubricNow: '2.2', pendevWall: { P7: { first: 97_500, now: 140_000 }, P8: { first: undefined, now: 200_000 } } });
  });
});

describe('story 24: aturan ukuran simetris (rubrik ≥ 2.2)', () => {
  const b = (id: string, width: number, height: number) => ({ id, width, height });
  it('sizeRuleFor: < 2.2 atau tak diketahui → persis; ≥ 2.2 → mobile tinggi ≥ yang diminta', () => {
    expect(sizeRuleFor(undefined)).toBe('exact');
    expect(sizeRuleFor('2')).toBe('exact');
    expect(sizeRuleFor('2.1')).toBe('exact');
    expect(sizeRuleFor('2.2')).toBe('mobile-min-height');
    expect(sizeRuleFor('2.10')).toBe('mobile-min-height');
    expect(sizeRuleFor('3')).toBe('mobile-min-height');
  });

  it('P7 390×844: pen.dev 390×1177 dan Lakar 390×1320 sah di 2.2, masalah di 2.1; lebar lain atau tinggi < 844 tetap masalah; landing/app tidak berubah', () => {
    const p7 = { width: 390, height: 844 };
    const r22 = sizeRuleFor('2.2');
    const r21 = sizeRuleFor('2.1');
    expect(boardSizeProblemsFor(p7, [b('pen', 390, 1177)], r22)).toEqual([]);
    expect(boardSizeProblemsFor(p7, [b('lak', 390, 1320)], r22)).toEqual([]);
    expect(boardSizeProblemsFor(p7, [b('pen', 390, 1177)], r21)).toEqual(['board pen 390×1177 ≠ 390×844']);
    expect(boardSizeProblemsFor(p7, [b('x', 390, 800)], r22)).toEqual(['board x 390×800 ≠ 390×≥844']);
    expect(boardSizeProblemsFor(p7, [b('x', 400, 1000)], r22)).toEqual(['board x 400×1000 ≠ 390×≥844']);
    expect(boardSizeProblemsFor({ width: 1440, height: 900 }, [b('d', 1440, 1000)], r22)).toEqual(['board d 1440×1000 ≠ 1440×900']);
    expect(boardSizeProblemsFor({ width: 1440, height: null }, [b('l', 1440, 5000)], r22)).toEqual([]);
    expect(boardSizeProblemsFor(p7, [], r22)).toEqual(['tidak ada board']);
  });

  it('putaran round-1/2 (rubrik beku < 2.2): pelanggaran ukuran pen.dev B tetap sama persis dengan laporan tersimpan', () => {
    for (const r of ['round-1', 'round-2']) {
      const j = JSON.parse(readFileSync(join(BENCH_ROOT, `${r}.json`), 'utf8')) as {
        frozen?: { judge?: { rubricVersion?: string } };
        results: { prompt: string; pendevSizeProblems?: string[]; runs: { pendev?: { record?: { frames?: { id: string; width: number; height: number }[] } } } }[];
      };
      const rule = sizeRuleFor(j.frozen?.judge?.rubricVersion);
      expect(rule, r).toBe('exact');
      for (const x of j.results) {
        if (!x.pendevSizeProblems) continue;
        expect(boardSizeProblems(x.prompt, x.runs.pendev?.record?.frames ?? [], rule), `${r} ${x.prompt}`).toEqual(x.pendevSizeProblems);
      }
    }
    const r2 = JSON.parse(readFileSync(join(BENCH_ROOT, 'round-2.json'), 'utf8'));
    expect(r2.results.find((x: { prompt: string }) => x.prompt === 'B').pendevSizeProblems).toEqual(['board rgCT3 390×1044 ≠ 390×844']);
  });

  it('laporan latihan/efek/polish tersimpan di-render ulang tanpa perubahan byte', () => {
    for (const prefix of ['practice', 'effects', 'polish'])
      for (let k = 1; k <= 8; k++) {
        const json = join(BENCH_ROOT, `${prefix}-${k}.json`);
        if (!existsSync(json)) continue;
        const md = readFileSync(join(BENCH_ROOT, `${prefix}-${k}.md`), 'utf8');
        expect(renderPracticeMarkdown(JSON.parse(readFileSync(json, 'utf8'))) === md, `${prefix}-${k}`).toBe(true);
      }
  });
});

describe('restart pen-desktop sesudah seri pen.dev', () => {
  const fake = (o: { active?: string[]; probeFails?: number; restartThrows?: boolean; timeoutMs?: number }) => {
    let t = 0;
    let probes = 0;
    const calls: string[] = [];
    const states = [...(o.active ?? ['active'])];
    const deps: PenDesktopRestartDeps = {
      restart: () => {
        calls.push('restart');
        if (o.restartThrows) throw new Error('izin ditolak');
      },
      isActive: () => (states.length > 1 ? states.shift()! : states[0]!),
      probe: async () => {
        calls.push('probe');
        if (probes++ < (o.probeFails ?? 0)) throw new Error('not connected');
      },
      sleep: async (ms) => {
        t += ms;
      },
      now: () => t,
      ...(o.timeoutMs ? { timeoutMs: o.timeoutMs } : {}),
    };
    return { deps, calls };
  };

  it('berhasil: restart → tunggu active → probe MCP berhasil', async () => {
    const { deps, calls } = fake({ active: ['activating', 'activating', 'active'], probeFails: 1 });
    const r = await restartPenDesktopAfterSeries(deps);
    expect(r).toEqual({ ok: true, ms: 6_000, detail: 'pen-desktop active; MCP pencil menjawab panggilan baca' });
    expect(calls).toEqual(['restart', 'probe', 'probe']);
  });

  it('gagal: batas 120 dtk terlewati atau restart error (tidak throw)', async () => {
    const t1 = await restartPenDesktopAfterSeries(fake({ active: ['failed'] }).deps);
    expect(t1.ok).toBe(false);
    expect(t1.detail).toMatch(/batas 120 dtk terlewati: is-active failed/);
    expect(t1.ms).toBeGreaterThan(120_000);
    const t2 = await restartPenDesktopAfterSeries(fake({ restartThrows: true }).deps);
    expect(t2).toMatchObject({ ok: false, detail: expect.stringContaining('izin ditolak') });
    const t3 = await restartPenDesktopAfterSeries(fake({ probeFails: 1000, timeoutMs: 10_000 }).deps);
    expect(t3.detail).toMatch(/MCP pencil: not connected/);
  });

  it('(P4) probe MCP menggantung → selesai ≤ batas (+ satu interval) dengan ok:false, tidak throw', async () => {
    const t0 = Date.now();
    let probes = 0;
    const r = await restartPenDesktopAfterSeries({
      restart: () => undefined,
      isActive: () => 'active',
      probe: () => {
        probes++;
        return new Promise<void>(() => undefined);
      },
      sleep: (ms) => new Promise((res) => setTimeout(res, Math.min(ms, 20))),
      now: () => Date.now(),
      timeoutMs: 150,
    });
    const took = Date.now() - t0;
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/batas 0 dtk terlewati: is-active active; MCP pencil: probe tidak menjawab/);
    expect(probes).toBeGreaterThanOrEqual(1);
    expect(took).toBeLessThan(150 + 2_000);
  });
});

describe('langkah restart pen-desktop sesudah seri (practice, efek, round)', () => {
  it('(P1/P2) ada run pen.dev → restart sekali, hasil ditulis; (P3) dipakai ulang / tanpa run → tanpa restart, hasil tersimpan atau alasan', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bench-pen-restart-'));
    try {
      const file = join(dir, 'pen-desktop-restart.json');
      let calls = 0;
      const restart = async () => {
        calls++;
        return { ok: true, ms: 15_000, detail: 'pen-desktop active; MCP pencil menjawab panggilan baca' };
      };
      expect(await penDesktopRestartStep({ pendevRan: 0, file, restart })).toEqual({ result: 'tidak ada run pen.dev di pemanggilan ini', ran: false });
      expect(await penDesktopRestartStep({ pendevRan: 2, reusedFrom: 'iterasi 3', file, restart })).toEqual({ result: 'pen.dev dipakai ulang dari iterasi 3', ran: false });
      expect(calls).toBe(0);
      const r = await penDesktopRestartStep({ pendevRan: 2, file, restart });
      expect(calls).toBe(1);
      expect(r).toEqual({ result: { ok: true, ms: 15_000, detail: 'pen-desktop active; MCP pencil menjawab panggilan baca' }, ran: true });
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(r.result);
      // --resume tanpa run pen.dev baru: hasil pemanggilan sebelumnya dipakai, tanpa restart lagi.
      expect(await penDesktopRestartStep({ pendevRan: 0, file, restart })).toEqual({ result: r.result, ran: false });
      writeFileSync(file, '{rusak');
      expect((await penDesktopRestartStep({ pendevRan: 0, file, restart })).result).toBe('tidak ada run pen.dev di pemanggilan ini');
      expect(calls).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
