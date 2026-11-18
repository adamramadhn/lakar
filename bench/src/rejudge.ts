// Perintah `rejudge --from <uji-k|n> --label <slug> [--resume] [--dry-run]`: menilai ulang strip PNG putaran yang sudah
// ada dengan rubrik juri saat ini, tanpa agen desain (tanpa lakard, tanpa pen.dev, tanpa menyentuh `.pen`). Hanya
// `claude -p` juri yang di-spawn (3 ulangan per prompt, label X/Y acak `crypto`). Keluaran mentah di
// `bench/runs/rejudge/<label>/` (gitignored); laporan tracked `bench/rejudge-<label>.md|json`.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { errorMessage } from '@lakar/schema';
import { shellQuote } from './claude-runner.js';
import { buildJudgeArgs, EMPTY_MCP, JUDGE_REPS, type DesignImages, type JudgeRepRecord, type Tool } from './judge/run.js';
import { APPEAL_CRITERIA, JUDGE_CRITERIA } from './judge/prompt.js';
import { readRubricJson, rubricShaProblems, type RubricJson } from './judge/rubric.js';
import { boardSizeProblems } from './lakar/run.js';
import { Abort, log } from './log.js';
import { RUNS_ROOT } from './pendev/run.js';
import { judgeImagesFromStripPng } from './png/strip.js';
import { BENCH_ROOT, loadProtocol, REPO_ROOT, type ProtocolConfig } from './protocol.js';
import { judgePrompt, judgeTextInfo, prepareJudgeTexts, type JudgeTexts } from './round/main.js';
import { AWAITING_ADAM, MAX_TOTAL, ROUND_ID, type JudgeTextInfo } from './round/report.js';
import { aggregateScores, appealAxis, decide, TOOL_LABEL, TOOLS, type Agg, type DecisionResult, type GateResult, type PromptScore } from './round/score.js';
import { git, gitPorcelain } from './sys.js';

export const REJUDGE_LABEL = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const REJUDGE_USAGE = 'pakai: node bench/dist/cli.js rejudge --from <uji-k|n> --label <slug> [--resume] [--dry-run]';

export type RejudgeArgs = { from: string; label: string; resume: boolean; dryRun: boolean };

/** Argumen CLI (murni). */
export function parseRejudgeArgs(args: readonly string[]): { ok: true; value: RejudgeArgs } | { ok: false; error: string } {
  let from: string | undefined;
  let label: string | undefined;
  let resume = false;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--') continue;
    if (a === '--from') from = args[++i];
    else if (a.startsWith('--from=')) from = a.slice('--from='.length);
    else if (a === '--label') label = args[++i];
    else if (a.startsWith('--label=')) label = a.slice('--label='.length);
    else if (a === '--resume') resume = true;
    else if (a === '--dry-run') dryRun = true;
    else return { ok: false, error: `argumen tidak dikenal: ${a}` };
  }
  if (from === undefined) return { ok: false, error: '--from wajib (ID putaran sumber: uji-<k> atau angka)' };
  if (!ROUND_ID.test(from)) return { ok: false, error: `--from ${JSON.stringify(from)} tidak cocok ${ROUND_ID.source}` };
  if (label === undefined) return { ok: false, error: '--label wajib' };
  if (!REJUDGE_LABEL.test(label)) return { ok: false, error: `--label ${JSON.stringify(label)} tidak cocok ${REJUDGE_LABEL.source}` };
  return { ok: true, value: { from, label, resume, dryRun } };
}

/** Satu prompt dari laporan putaran sumber (`bench/round-<from>.json`), hanya dibaca. */
export type RejudgeSource = {
  prompt: string;
  lakarRunOk: boolean;
  pendevRunOk: boolean;
  gate: GateResult | undefined;
  pendevFrames: { id: string; width: number; height: number }[];
  strips: Record<Tool, string>;
  sourceDecision: { decision: string; why: string } | undefined;
  sourceTotals: Record<Tool, number | undefined>;
};

type SourceJson = {
  results?: {
    prompt: string;
    gate?: GateResult;
    decision?: { decision: string; why: string };
    score?: { tools?: Record<Tool, { total?: number }> };
    runs?: Partial<Record<Tool, { record?: { status?: string; frames?: { id: string; width: number; height: number }[] }; strip?: { path?: string } }>>;
  }[];
};

/** Sumber per prompt + masalah (path yang tidak ada). Masalah ≠ [] → exit ≠ 0 sebelum spawn apa pun. */
export function loadRejudgeSources(from: string, benchRoot: string, repoRoot: string): { sources: RejudgeSource[]; problems: string[] } {
  const jsonPath = join(benchRoot, `round-${from}.json`);
  if (!existsSync(jsonPath)) return { sources: [], problems: [`laporan putaran sumber tidak ada: ${relative(repoRoot, jsonPath)}`] };
  const src = JSON.parse(readFileSync(jsonPath, 'utf8')) as SourceJson;
  const problems: string[] = [];
  const sources: RejudgeSource[] = [];
  if (!src.results?.length) problems.push(`${relative(repoRoot, jsonPath)}: results kosong`);
  for (const r of src.results ?? []) {
    const strips = {} as Record<Tool, string>;
    for (const t of TOOLS) {
      const p = r.runs?.[t]?.strip?.path;
      if (!p) problems.push(`${r.prompt}-${t}: strip tidak tercatat di ${relative(repoRoot, jsonPath)}`);
      else if (!existsSync(join(repoRoot, p))) problems.push(`${r.prompt}-${t}: strip PNG tidak ada: ${p}`);
      else strips[t] = p;
    }
    sources.push({
      prompt: r.prompt,
      lakarRunOk: r.runs?.lakar?.record?.status === 'success',
      pendevRunOk: r.runs?.pendev?.record?.status === 'success',
      gate: r.gate,
      pendevFrames: r.runs?.pendev?.record?.frames ?? [],
      strips,
      sourceDecision: r.decision,
      sourceTotals: { lakar: r.score?.tools?.lakar?.total, pendev: r.score?.tools?.pendev?.total },
    });
  }
  return { sources, problems };
}

/** Keputusan Adam per prompt dari tabel "## Konfirmasi Adam" laporan putaran (kolom ke-4); belum diisi → tidak ada. */
export function adamDecisions(md: string): Record<string, string> {
  const lines = md.split('\n');
  const i = lines.findIndex((l) => l.startsWith('## Konfirmasi Adam'));
  if (i < 0) return {};
  const out: Record<string, string> = {};
  for (let j = i + 1; j < lines.length && !/^## /.test(lines[j]!); j++) {
    const l = lines[j]!;
    if (!/^\| [A-Z] \|/.test(l)) continue;
    const cells = l.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
    const v = cells[3]?.replace(/\*\*/g, '').trim();
    if (cells[0] && v && v !== AWAITING_ADAM) out[cells[0]] = v;
  }
  return out;
}

export type RejudgePrompt = {
  prompt: string;
  strips: Record<Tool, string>;
  gate: GateResult | undefined;
  pendevSizeProblems: string[];
  score: PromptScore | undefined;
  decision: DecisionResult;
  sourceDecision: { decision: string; why: string } | undefined;
  sourceTotals: Record<Tool, number | undefined>;
  adamDecision: string | undefined;
  costUsd: number;
};

export type Calibration = { applies: boolean; pass: boolean; reasons: string[]; flags: string[] };

export type RejudgeReport = {
  label: string;
  from: string;
  date: string;
  status: 'lengkap' | 'tidak lengkap' | 'dibatalkan';
  statusReasons: string[];
  source: { roundJson: string; roundMd: string | undefined };
  model: string;
  claude: string;
  head: string;
  judge: JudgeTextInfo & { rubricJsonVersion: string | undefined; matchesRubricJson: boolean; argv: string };
  prompts: RejudgePrompt[];
  calibration: Calibration;
  judgeCostUsd: number;
  outDir: string;
  notes: string[];
};

/** Putaran yang menjadi bahan kalibrasi (ambang lulus ditetapkan sebelum run; uji-1 = hold-out, hanya dilaporkan). */
export const CALIBRATION_FROM = '1';

/**
 * Ambang lulus kalibrasi (murni, plan story 17): putaran 1, 6/6 ulangan valid; A ∈ {Kalah, Setara} dengan D_P > D_L;
 * B = Setara dengan D_P ≥ D_L dan pelanggaran brief pen.dev terdeteksi; bukti R9/R10 tidak kosong.
 * Rentang > 1 pada R9/R10 hanya ditandai untuk Adam.
 */
export function calibrationCheck(from: string, prompts: readonly RejudgePrompt[]): Calibration {
  if (from !== CALIBRATION_FROM) return { applies: false, pass: false, reasons: [`putaran ${from} = hold-out; hanya dilaporkan (tanpa ambang lulus)`], flags: [] };
  const reasons: string[] = [];
  const flags: string[] = [];
  const by = new Map(prompts.map((p) => [p.prompt, p]));
  for (const id of ['A', 'B']) {
    const p = by.get(id);
    if (!p?.score) {
      reasons.push(`${id}: tidak ada skor`);
      continue;
    }
    if (p.score.validReps !== JUDGE_REPS) reasons.push(`${id}: ulangan valid ${p.score.validReps} dari ${JUDGE_REPS}`);
    const DL = appealAxis(p.score.tools.lakar);
    const DP = appealAxis(p.score.tools.pendev);
    const d = p.decision.decision;
    if (id === 'A') {
      if (d !== 'Kalah' && d !== 'Setara') reasons.push(`A: keputusan ${d} ∉ {Kalah, Setara}`);
      if (!(DL !== undefined && DP !== undefined && DP > DL)) reasons.push(`A: D pen.dev ${DP ?? '–'} tidak > D Lakar ${DL ?? '–'}`);
    } else {
      if (d !== 'Setara') reasons.push(`B: keputusan ${d} ≠ Setara`);
      if (!(DL !== undefined && DP !== undefined && DP >= DL)) reasons.push(`B: D pen.dev ${DP ?? '–'} tidak ≥ D Lakar ${DL ?? '–'}`);
      if (!p.decision.checks?.pendevBriefViolations.length) reasons.push('B: pelanggaran brief pen.dev tidak terdeteksi');
    }
    for (const t of TOOLS)
      for (const c of APPEAL_CRITERIA) {
        const a = p.score.tools[t].criteria[c];
        if (a.evidence.length !== p.score.validReps || a.evidence.some((e) => !e.bukti.trim())) reasons.push(`${id}: bukti ${c} ${TOOL_LABEL[t]} kosong`);
        if (a.flag) flags.push(`${id} ${c} ${TOOL_LABEL[t]} rentang ${a.range}`);
      }
  }
  return { applies: true, pass: reasons.length === 0, reasons, flags };
}

const usd = (x: number | undefined) => (x === undefined ? '–' : `$${x.toFixed(2)}`);
const num = (x: number | undefined) => (x === undefined ? '–' : Number.isInteger(x) ? String(x) : x.toFixed(1));
const aggText = (a: Agg | undefined) => (a ? `${num(a.median)} (rentang ${num(a.range)})${a.flag ? ' **periksa Adam**' : ''}` : '–');
const one = (s: string) => s.replace(/\n/g, ' ').replace(/\|/g, '\\|');

export function renderRejudgeMarkdown(r: RejudgeReport): string {
  const L: string[] = [];
  L.push(`# Penilaian ulang juri \`${r.label}\` (sumber: putaran ${r.from})`, '');
  L.push(`Status: **${r.status}**${r.statusReasons.length ? ` (${r.statusReasons.join('; ')})` : ''}. Tanggal: ${r.date}.`, '');
  L.push('Strip PNG putaran sumber dinilai ulang dengan rubrik juri saat ini. Tidak ada agen desain yang dijalankan: status run dan gerbang Lakar diambil dari laporan sumber. Keputusan di bawah adalah keluaran juri dan aturan keputusan, menunggu tinjauan Adam.', '');
  L.push('## Sumber dan versi', '');
  L.push(`- Sumber: \`${r.source.roundJson}\`${r.source.roundMd ? ` (keputusan Adam dari \`${r.source.roundMd}\`)` : ''}`);
  for (const p of r.prompts) L.push(`- Strip ${p.prompt}: ${TOOLS.map((t) => `${TOOL_LABEL[t]} \`${p.strips[t]}\``).join(', ')}`);
  L.push(`- Model juri: \`${r.model}\`; Claude Code: ${r.claude}; git HEAD: \`${r.head}\``);
  L.push(`- Versi rubrik: ${r.judge.rubricVersion ?? '1 (tanpa baris versi)'} (\`bench/rubric/rubric.json\`: versi ${r.judge.rubricJsonVersion ?? '–'}, ${r.judge.matchesRubricJson ? 'sama' : '**berbeda**'})`);
  for (const [id, s] of Object.entries(r.judge.textSha256)) L.push(`- sha256 teks juri ${id}: \`${s}\``);
  L.push(`- Argv juri: \`${r.judge.argv}\``);
  L.push(`- Artefak mentah (gitignored): \`${r.outDir}/\` (teks juri, pemetaan X/Y, transkrip per ulangan)`, '');
  L.push('## Ringkasan', '');
  L.push(`| Prompt | T Lakar (maks ${MAX_TOTAL}) | T pen.dev | D Lakar (maks 4) | D pen.dev | Keputusan v${r.judge.rubricVersion ?? '1'} | Keputusan sumber | Keputusan Adam | Pelanggaran brief pen.dev |`);
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const p of r.prompts) {
    const t = p.score?.tools;
    L.push(
      `| ${p.prompt} | ${num(t?.lakar.total)} | ${num(t?.pendev.total)} | ${num(t && appealAxis(t.lakar))} | ${num(t && appealAxis(t.pendev))} | **${p.decision.decision}** | ${p.sourceDecision ? `${p.sourceDecision.decision} (T ${num(p.sourceTotals.lakar)} vs ${num(p.sourceTotals.pendev)})` : '–'} | ${p.adamDecision ?? '–'} | ${one(p.decision.checks?.pendevBriefViolations.join('; ') || (p.pendevSizeProblems.join('; ') || 'tidak ada'))} |`,
    );
  }
  L.push('');
  L.push('## Kalibrasi', '');
  if (r.calibration.applies) {
    L.push(`Ambang lulus (ditetapkan sebelum run): **${r.calibration.pass ? 'lulus' : 'tidak lulus'}**.`, '');
    L.push('- Syarat: 6/6 ulangan valid; A ∈ {Kalah, Setara} dengan D pen.dev > D Lakar; B = Setara dengan D pen.dev ≥ D Lakar dan pelanggaran brief pen.dev terdeteksi; bukti R9/R10 tidak kosong.');
    if (r.calibration.reasons.length) for (const x of r.calibration.reasons) L.push(`- Tidak terpenuhi: ${x}`);
  } else L.push(`${r.calibration.reasons.join('; ')}.`);
  L.push(`- R9/R10 dengan rentang > 1 (ditandai untuk Adam, tidak menggagalkan): ${r.calibration.flags.join(', ') || 'tidak ada'}`, '');
  for (const p of r.prompts) {
    L.push(`## Prompt ${p.prompt}`, '');
    L.push(`- Gerbang Lakar (dari sumber): ${p.gate ? (p.gate.ok ? 'lolos' : `gagal (${p.gate.reasons.join('; ')})`) : '–'}`);
    L.push(`- Brief mengikat pen.dev (ukuran frame): ${p.pendevSizeProblems.length ? p.pendevSizeProblems.join('; ') : 'sesuai'}`);
    L.push(`- Keputusan v${r.judge.rubricVersion ?? '1'}: **${p.decision.decision}**. Alasan: ${p.decision.why}.`);
    const ch = p.decision.checks;
    if (ch) {
      L.push(`- Kalah-daya-tarik: ${ch.appealLoss.join('; ') || 'tidak ada'}; Kalah-lain: ${ch.otherLoss.join('; ') || 'tidak ada'}; R Lakar 0 vs pen.dev 2: ${ch.zeroVsTwo.join(', ') || 'tidak ada'}`);
      L.push(`- Pelanggaran brief pen.dev: ${ch.pendevBriefViolations.join('; ') || 'tidak ada'}`);
    }
    L.push(`- Keputusan sumber: ${p.sourceDecision ? `${p.sourceDecision.decision} (${p.sourceDecision.why})` : '–'}; keputusan Adam: ${p.adamDecision ?? '–'}`, '');
    const s = p.score;
    if (!s) {
      L.push('Juri tidak dijalankan untuk prompt ini.', '');
      continue;
    }
    const reps = [...s.reps].sort((a, b) => a.rep - b.rep);
    L.push(`### Skor (ulangan valid ${s.validReps} dari ${s.reps.length})`, '');
    L.push(`| Kriteria | Alat | ${reps.map((x) => `Ulangan ${x.rep}`).join(' | ')} | Median (rentang) |`);
    L.push(`|---|---|${reps.map(() => '---|').join('')}---|`);
    for (const c of JUDGE_CRITERIA)
      for (const t of TOOLS) {
        const a = s.tools[t].criteria[c];
        L.push(`| ${c} | ${TOOL_LABEL[t]} | ${reps.map((x) => a.evidence.find((e) => e.rep === x.rep)?.skor ?? '–').join(' | ')} | ${aggText(a)} |`);
      }
    for (const t of TOOLS) L.push(`| **T** | ${TOOL_LABEL[t]} | ${reps.map(() => '').join(' | ')} | **${num(s.tools[t].total)}** |`);
    for (const t of TOOLS) L.push(`| **D = R9 + R10** | ${TOOL_LABEL[t]} | ${reps.map(() => '').join(' | ')} | **${num(appealAxis(s.tools[t]))}** |`);
    for (const t of TOOLS) L.push(`| Slop | ${TOOL_LABEL[t]} | ${reps.map(() => '').join(' | ')} | ${aggText(s.tools[t].slop)} |`);
    L.push('');
    L.push('### Bukti R9/R10 per ulangan', '');
    for (const t of TOOLS)
      for (const c of APPEAL_CRITERIA) {
        L.push(`**${c} ${TOOL_LABEL[t]}**`, '');
        for (const e of s.tools[t].criteria[c].evidence) L.push(`- Ulangan ${e.rep} (skor ${e.skor}): ${e.bukti.replace(/\n/g, ' ')}`);
        L.push('');
      }
    L.push('### Bukti kriteria lain per ulangan', '');
    for (const t of TOOLS) {
      L.push(`**${TOOL_LABEL[t]}**`, '');
      for (const c of JUDGE_CRITERIA.filter((x) => !(APPEAL_CRITERIA as readonly string[]).includes(x)))
        for (const e of s.tools[t].criteria[c].evidence) L.push(`- ${c}, ulangan ${e.rep} (skor ${e.skor}): ${e.bukti.replace(/\n/g, ' ')}`);
      L.push('');
    }
    L.push('### Pemetaan X/Y per ulangan (dibuka setelah penilaian)', '');
    L.push('| Ulangan | Desain X | Desain Y | Status | Biaya |');
    L.push('|---|---|---|---|---|');
    for (const x of reps) L.push(`| ${x.rep} | ${TOOL_LABEL[x.mapping.X]} | ${TOOL_LABEL[x.mapping.Y]} | ${x.status}${x.retried ? ' (1 percobaan ulang)' : ''} | ${usd(x.costUsd)} |`);
    L.push('');
  }
  L.push('## Biaya', '');
  L.push(`Biaya juri total: ${usd(r.judgeCostUsd)} (${r.prompts.map((p) => `${p.prompt} ${usd(p.costUsd)}`).join(', ')}). Tidak ada biaya agen desain.`, '');
  if (r.notes.length) {
    L.push('## Catatan', '');
    for (const n of r.notes) L.push(`- ${n}`);
    L.push('');
  }
  return L.join('\n');
}

export type RejudgeOptions = {
  args: RejudgeArgs;
  config: ProtocolConfig;
  judgeTexts: JudgeTexts;
  rubric: RubricJson | undefined;
  claudeVersion: string;
  head: string;
  /** Default: `bench/`, repo, dan `bench/runs` asli. Diganti di tes. */
  benchRoot?: string;
  repoRoot?: string;
  runsRoot?: string;
  /** Untuk tes: program pengganti `claude`. */
  command?: string;
  prefixArgs?: string[];
};

/** Inti `rejudge` (bisa dites dengan `claude` palsu). Mengembalikan exit code. */
export async function runRejudge(o: RejudgeOptions): Promise<number> {
  const { from, label, resume, dryRun } = o.args;
  const benchRoot = o.benchRoot ?? BENCH_ROOT;
  const repoRoot = o.repoRoot ?? REPO_ROOT;
  const outDir = join(o.runsRoot ?? RUNS_ROOT, 'rejudge', label);
  const mdPath = join(benchRoot, `rejudge-${label}.md`);
  const jsonPath = join(benchRoot, `rejudge-${label}.json`);

  const { sources, problems } = loadRejudgeSources(from, benchRoot, repoRoot);
  if (problems.length) {
    console.error(`rejudge: sumber tidak lengkap:\n  ${problems.join('\n  ')}`);
    return 1;
  }
  const info = judgeTextInfo(o.judgeTexts);
  const shaProblems = rubricShaProblems({ version: info.rubricVersion, sha: info.textSha256 }, o.rubric);
  const missing = sources.filter((s) => !o.judgeTexts[s.prompt]).map((s) => s.prompt);
  if (missing.length) {
    console.error(`rejudge: teks juri tidak ada untuk prompt ${missing.join(', ')}`);
    return 1;
  }
  const emptyMcp = join(outDir, 'mcp-empty.json');
  const judgeArgv = shellQuote(['claude', ...buildJudgeArgs(o.config.model, relative(repoRoot, emptyMcp))]);
  console.log(`rejudge ${label} (sumber: putaran ${from})`);
  console.log(`rubrik juri: versi ${info.rubricVersion ?? '1 (tanpa baris versi)'}; bench/rubric/rubric.json: ${shaProblems.length ? `BERBEDA (${shaProblems.join('; ')})` : `sama (versi ${o.rubric?.version})`}`);
  console.log('preflight teks juri: penjaga bocor + C7 juri lulus');
  for (const s of sources) console.log(`${s.prompt}: strip ${TOOLS.map((t) => `${TOOL_LABEL[t]} ${s.strips[t]}`).join(', ')}; sha256 teks juri ${info.textSha256[s.prompt]}`);
  console.log(`\n=== argv juri (stdin: satu pesan stream-json teks + gambar; ${JUDGE_REPS} ulangan per prompt) ===\n${judgeArgv}`);
  if (dryRun) {
    for (const s of sources) console.log(`\n=== teks juri ${s.prompt} ===\n${o.judgeTexts[s.prompt]!.text}`);
    if (existsSync(outDir) || existsSync(mdPath)) console.log(`\ncatatan: label ${label} sudah ada (${relative(repoRoot, existsSync(outDir) ? outDir : mdPath)}); run tanpa --resume akan ditolak`);
    return shaProblems.length ? 1 : 0;
  }
  if (shaProblems.length) {
    console.error(`rejudge: teks juri ≠ bench/rubric/rubric.json; jalankan rubric-snapshot dulu:\n  ${shaProblems.join('\n  ')}`);
    return 1;
  }
  if ((existsSync(outDir) || existsSync(mdPath)) && !resume) {
    console.error(`rejudge: label ${label} sudah ada (${relative(repoRoot, existsSync(outDir) ? outDir : mdPath)}); pakai --resume atau label baru`);
    return 64;
  }
  // --resume dengan teks juri yang berubah (mis. rubrik naik versi) ditolak sebelum menulis apa pun: laporan lama tidak ditimpa.
  const changed = sources
    .map((s) => ({ f: join(outDir, s.prompt, 'judge-text.md'), text: o.judgeTexts[s.prompt]!.text }))
    .filter(({ f, text }) => existsSync(f) && readFileSync(f, 'utf8') !== text)
    .map(({ f }) => f);
  if (changed.length) {
    console.error(`rejudge: teks juri berbeda dari run label ${label} (${changed.map((f) => relative(repoRoot, f)).join(', ')}); pakai label baru`);
    return 1;
  }
  mkdirSync(outDir, { recursive: true });
  if (!existsSync(emptyMcp)) writeFileSync(emptyMcp, EMPTY_MCP);

  const mdSource = join(benchRoot, `round-${from}.md`);
  const adam = existsSync(mdSource) ? adamDecisions(readFileSync(mdSource, 'utf8')) : {};
  const prompts: RejudgePrompt[] = [];
  const notes: string[] = [];
  let fatal: string | undefined;
  for (const s of sources) {
    const pendevSizeProblems = boardSizeProblems(s.prompt, s.pendevFrames);
    let reps: JudgeRepRecord[] = [];
    if (!fatal) {
      try {
        const images = {} as Record<Tool, DesignImages>;
        for (const t of TOOLS) images[t] = judgeImagesFromStripPng(readFileSync(join(repoRoot, s.strips[t])));
        const j = await judgePrompt({
          prompt: s.prompt,
          jdir: join(outDir, s.prompt),
          text: o.judgeTexts[s.prompt]!.text,
          images,
          emptyMcpConfig: emptyMcp,
          config: o.config,
          forbiddenCwdRoot: REPO_ROOT,
          reuse: (r) => r.status === 'ok',
          ...(o.command ? { command: o.command } : {}),
          ...(o.prefixArgs ? { prefixArgs: o.prefixArgs } : {}),
        });
        reps = j.reps;
        fatal = j.fatal;
      } catch (e) {
        fatal = `juri ${s.prompt}: harness: ${errorMessage(e)}`;
      }
    }
    const score = reps.length ? aggregateScores(s.prompt, reps) : undefined;
    const decision = decide({
      gate: s.gate ?? { ok: false, reasons: ['gerbang Lakar tidak ada di sumber'], timeRatio: undefined },
      lakarRunOk: s.lakarRunOk,
      pendevRunOk: s.pendevRunOk,
      score,
      pendevBrief: { sizeProblems: pendevSizeProblems },
    });
    prompts.push({
      prompt: s.prompt,
      strips: s.strips,
      gate: s.gate,
      pendevSizeProblems,
      score,
      decision,
      sourceDecision: s.sourceDecision,
      sourceTotals: s.sourceTotals,
      adamDecision: adam[s.prompt],
      costUsd: reps.reduce((x, r) => x + r.costUsd, 0),
    });
  }
  const failed = prompts.flatMap((p) => p.score?.reps.filter((r) => r.status !== 'ok').map((r) => `${p.prompt} ulangan ${r.rep} ${r.status}`) ?? []);
  if (failed.length) notes.push(`Ulangan juri tidak valid (tidak dihitung): ${failed.join(', ')}. \`--resume\` menjalankan ulang ulangan yang bukan \`ok\`.`);
  const complete = prompts.every((p) => p.score?.validReps === JUDGE_REPS);
  const status: RejudgeReport['status'] = fatal ? 'dibatalkan' : complete ? 'lengkap' : 'tidak lengkap';
  const report: RejudgeReport = {
    label,
    from,
    date: new Date().toISOString(),
    status,
    statusReasons: fatal ? [`dihentikan: ${fatal}`] : complete ? [] : ['ulangan juri belum lengkap'],
    source: { roundJson: relative(repoRoot, join(benchRoot, `round-${from}.json`)), roundMd: existsSync(mdSource) ? relative(repoRoot, mdSource) : undefined },
    model: o.config.model,
    claude: o.claudeVersion,
    head: o.head,
    judge: { ...info, rubricJsonVersion: o.rubric?.version, matchesRubricJson: shaProblems.length === 0, argv: judgeArgv },
    prompts,
    calibration: calibrationCheck(from, prompts),
    judgeCostUsd: prompts.reduce((x, p) => x + p.costUsd, 0),
    outDir: relative(repoRoot, outDir),
    notes,
  };
  writeFileSync(mdPath, renderRejudgeMarkdown(report));
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  for (const p of prompts) log(`${p.prompt}: ${p.decision.decision} (${p.decision.why})`);
  log(`laporan: ${relative(repoRoot, mdPath)} (${status}${report.calibration.applies ? `; kalibrasi ${report.calibration.pass ? 'lulus' : 'tidak lulus'}` : ''})`);
  return fatal ? 1 : complete ? 0 : 2;
}

/** CLI: preflight tanpa lakard/pen.dev (protokol, teks juri + bocor + C7, rubric.json, claude --version), lalu `runRejudge`. */
export async function rejudgeMain(argv: string[]): Promise<number> {
  const parsed = parseRejudgeArgs(argv);
  if (!parsed.ok) {
    console.error(`rejudge: ${parsed.error}\n${REJUDGE_USAGE}`);
    return 64;
  }
  const protocol = loadProtocol();
  const judgeTexts = prepareJudgeTexts(protocol);
  let claudeVersion: string;
  try {
    claudeVersion = execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Abort('claude tidak ada di PATH');
  }
  return runRejudge({ args: parsed.value, config: protocol.config, judgeTexts, rubric: readRubricJson(), claudeVersion, head: `${git(REPO_ROOT, ['rev-parse', 'HEAD'])}${gitPorcelain(REPO_ROOT, ['bench/src', 'packages']) ? ' (+ perubahan bench/src atau packages belum di-commit)' : ''}` });
}
