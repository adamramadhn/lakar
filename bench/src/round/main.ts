// Perintah `round --round <uji-k|n> [--dry-run] [--resume]`: satu putaran semua prompt protokol (`promptIds`, A–E),
// Lakar vs pen.dev, lalu juri buta 3× per prompt, lalu `bench/round-<round>.md|json` dan laporan skor (`scoreReportBase`: `bench/score-<id>` atau
// `bench/round-<n>/score-<id>` untuk putaran resmi ≥ 2).
import { constants, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { G0_RULES, LAKAR_VERSION, SCHEMA_VERSION, errorMessage } from '@lakar/schema';
import { buildArgs, buildEnv, shellQuote } from '../claude-runner.js';
import { assignLabels, buildJudgeArgs, buildJudgeBlocks, EMPTY_MCP, JUDGE_REPS, runJudgeRep, type Assignment, type DesignImages, type JudgeRepRecord, type Tool } from '../judge/run.js';
import { buildJudgeText, DESIGN_MD_PATH, JUDGE_CRITERIA, judgeC7Problems, judgeLeaks } from '../judge/prompt.js';
import { readRubricJson, rubricShaProblems, type RubricJson } from '../judge/rubric.js';
import { boardSizeProblems, sizeRuleFor, LAKAR_ALLOWED_TOOLS, LAKAR_MCP_CONFIG, LAKARD_UNIT, lakarPreflightProblems, mcpServerNames, runLakar } from '../lakar/run.js';
import { LakardClient, type LakardStatus, type PhotoSearchResult } from '../lakar/lakard-client.js';
import { Abort, log, sleep, stamp } from '../log.js';
import { emptyRecord, PENDEV_ALLOWED_TOOLS, PENDEV_MCP_CONFIG, penDesktopVersion, preflight, runOne, RUNS_ROOT, type Preflight } from '../pendev/run.js';
import { encodePngRgb } from '../png/codec.js';
import { buildStrip, judgeImages } from '../png/strip.js';
import { baselineProblems, claudeSemver, loadBaselines, type BaselineEntry, type BaselineIndex } from '../baselines.js';
import { BENCH_ROOT, GOLDEN_SET_PATH, PROTOCOL_DIR, PROTOCOL_FILES, REPO_ROOT, promptHashes, renderPrompt, type PromptId, type Protocol, type ProtocolConfig } from '../protocol.js';
import type { RunRecord } from '../report.js';
import type { TimedLine } from '../stream-metrics.js';
import {
  comparePenHashes,
  git,
  gitPorcelain,
  isActive,
  md5PenFiles,
  newestMtimeMs,
  PEN_DESKTOP_RESTART_TIMEOUT_MS,
  penDesktopRestartDeps,
  penDesktopRestartStep,
  restartPenDesktopAfterSeries,
  restartUserUnit,
  sha256,
  sha256Dir,
  systemdShow,
  type PenDesktopRestart,
  type SystemdInfo,
} from '../sys.js';
import { PencilClient } from '../pendev/pencil-client.js';
import { applyLakarArchive, benchLakarSources, describeLakarArchive, planLakarArchive } from '../lakar/archive.js';
import { countAgentEmoji, countLintEmoji } from './emoji.js';
import { lakarReconnect, pendevReconnect } from './reconnect.js';
import { isOfficialRound, OFFICIAL_CODE_PATHS, renderRoundJson, renderRoundMarkdown, renderScoreJson, renderScoreMarkdown, ROUND_ID, type FrozenVersions, type JudgeTextInfo, type PhotoProbe, type RoundPrompt, type RoundReport, type RoundRun } from './report.js';
import { aggregateScores, decide, decideG0, decideG1, G1_PROMPTS, lakarGate, NO_VALID_REPS, technicalScores, type G1PromptInput } from './score.js';

/** Urutan run putaran: per prompt protokol pen.dev lalu Lakar (A-pen.dev, A-Lakar, B-pen.dev, …). */
export function roundOrder(promptIds: readonly PromptId[]): [PromptId, Tool][] {
  return promptIds.flatMap((p): [PromptId, Tool][] => [
    [p, 'pendev'],
    [p, 'lakar'],
  ]);
}

/** Putaran G1 (R3/R7 mekanis + `decideG1`): protokol memuat semua prompt A–E. Putaran A/B lama tetap G0. */
export function isG1Protocol(promptIds: readonly string[]): boolean {
  return G1_PROMPTS.every((p) => promptIds.includes(p));
}
const SKILLS_DIR = join(REPO_ROOT, 'packages/skills/skills');
const MCP_SERVER_TS = join(REPO_ROOT, 'packages/mcp/src/server.ts');
const CHECK_DIST = join(REPO_ROOT, 'packages/check/dist');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');
const DAEMON_PKG = join(PACKAGES_DIR, 'daemon/package.json');
const PLAYWRIGHT_PKG = join(PACKAGES_DIR, 'daemon/node_modules/playwright-core/package.json');

export { claudeSemver };

export type OfficialFreezeInput = {
  /** `git status --porcelain -- <OFFICIAL_CODE_PATHS>`. */
  porcelainCode: string;
  /** Prompt putaran (`promptIds` protokol). */
  promptIds: readonly string[];
  /** Hash per prompt saat ini (`promptHashes(protocol)`). */
  promptHashes: Record<string, string>;
  model: string;
  claude: string;
  pendevDesktop: string | undefined;
  /** Baseline pen.dev per prompt (`loadBaselines`): prompt tanpa baseline sah = masalah. */
  baselines: BaselineIndex;
  /** `/status` lakard: startedAt, fonts, pool, schemaVersion (f), photos (g). */
  lakard: Pick<LakardStatus, 'startedAt' | 'fonts' | 'pool' | 'schemaVersion' | 'photos'> | undefined;
  /** mtime (ms) file terbaru di `packages/*\/dist`. */
  newestDistMtimeMs: number | undefined;
  /** (c) dicek hanya sesudah restart wajib (sebelum restart / dry-run: lakard memang boleh lebih tua dari build). */
  checkLakardFresh: boolean;
  /** (e) versi rubrik + sha256 teks juri saat ini, dibandingkan dengan `bench/rubric/rubric.json`. */
  judgeText: JudgeTextInfo;
  rubric: RubricJson | undefined;
};

/**
 * Cek pembekuan putaran resmi (murni). Setiap masalah → Abort sebelum run apa pun.
 * (a) kode bersih, (b) per prompt: baseline ada, hash prompt/model/claude/pen.dev = baseline yang mencakup prompt itu
 * (C9: tidak di-upgrade/downgrade; baseline tanpa `promptHashes` = masalah),
 * (c) lakard startedAt > mtime dist terbaru (sesudah restart), (d) font lengkap dan pool siap,
 * (e) sha256 teks juri dan versi rubrik = `bench/rubric/rubric.json` (snapshot tracked),
 * (f) `schemaVersion` lakard = `SCHEMA_VERSION` bench, (g) penyedia foto lakard = `unsplash` (key Unsplash terpasang, keputusan Adam plan 1.24).
 */
export function officialFreezeProblems(i: OfficialFreezeInput): string[] {
  const out: string[] = [];
  if (i.porcelainCode) out.push(`kode tidak beku: git status --porcelain -- ${OFFICIAL_CODE_PATHS.join(' ')} tidak kosong:\n${i.porcelainCode}`);
  out.push(...baselineProblems(i.baselines, { promptHashes: i.promptHashes, model: i.model, claude: i.claude, pendevDesktop: i.pendevDesktop ?? null }, i.promptIds));
  if (!i.lakard) out.push('lakard /status tidak terbaca');
  else {
    if (i.checkLakardFresh) {
      const started = Date.parse(i.lakard.startedAt);
      if (i.newestDistMtimeMs === undefined) out.push('packages/*/dist tidak ada: build belum dijalankan');
      else if (!(started > i.newestDistMtimeMs))
        out.push(`lakard basi: startedAt ${i.lakard.startedAt} tidak lebih baru dari file dist terbaru ${new Date(i.newestDistMtimeMs).toISOString()}`);
    }
    if (!i.lakard.fonts) out.push('fonts tidak ada di /status');
    else if (i.lakard.fonts.missing.length) out.push(`font hilang: ${i.lakard.fonts.missing.join(', ')}`);
    if (!((i.lakard.pool?.ready ?? 0) >= 1)) out.push(`pool render belum siap (ready=${i.lakard.pool?.ready ?? '?'})`);
    if (i.lakard.schemaVersion !== SCHEMA_VERSION) out.push(`schemaVersion lakard ${i.lakard.schemaVersion ?? '(tidak ada)'} ≠ ${SCHEMA_VERSION} (bench)`);
    if (i.lakard.photos?.provider !== EXPECTED_PHOTO_PROVIDER)
      out.push(`penyedia foto lakard ${i.lakard.photos?.provider ?? '(tidak ada di /status)'} ≠ ${EXPECTED_PHOTO_PROVIDER} (keputusan Adam plan 1.24: key Unsplash terpasang)`);
  }
  out.push(...rubricShaProblems({ version: i.judgeText.rubricVersion, sha: i.judgeText.textSha256 }, i.rubric).map((p) => `rubrik juri: ${p}`));
  return out;
}

/** Penyedia foto yang wajib aktif di putaran resmi (g). */
export const EXPECTED_PHOTO_PROVIDER = 'unsplash';
/** Probe rate limit foto sebelum run berbayar: kueri netral (tidak terkait prompt A/B). */
export const PHOTO_PROBE = { query: 'mountain lake landscape', limit: 3, preview: true } as const;

/**
 * Masalah hasil probe foto (murni). Lulus bila penyedia `unsplash`, ≥ 1 hasil, dan `fallbackReason` tidak diawali
 * `unsplash-`. Error → masalah. Tanpa retry otomatis (plan 1.18, penyedia plan 1.24).
 */
export function photoProbeProblems(r: { res: PhotoSearchResult } | { error: string }): string[] {
  if ('error' in r) return [`probe foto gagal: ${r.error}`];
  const out: string[] = [];
  const { res } = r;
  if (res.provider !== EXPECTED_PHOTO_PROVIDER) out.push(`probe foto: penyedia ${res.provider} ≠ ${EXPECTED_PHOTO_PROVIDER}${res.fallbackReason ? ` (fallbackReason ${res.fallbackReason})` : ''}`);
  else if (res.fallbackReason?.startsWith(`${EXPECTED_PHOTO_PROVIDER}-`)) out.push(`probe foto: fallbackReason ${res.fallbackReason}`);
  if (!res.results.length) out.push('probe foto: 0 hasil');
  return out;
}

/** Awal path laporan skor (relatif repo): putaran resmi ≥ 2 → `bench/round-<n>/score-`; putaran 1 dan uji → `bench/score-`. */
export function scoreReportBase(round: string): string {
  return isOfficialRound(round) && Number(round) >= 2 ? `bench/round-${round}/score-` : 'bench/score-';
}

/** Dir `packages/<nama>/dist` yang ada (nama terurut). */
export function distDirs(): [string, string][] {
  return readdirSync(PACKAGES_DIR)
    .sort()
    .map((n) => [n, join(PACKAGES_DIR, n, 'dist')] as [string, string])
    .filter(([, d]) => existsSync(d));
}

export function newestDistMtime(): number | undefined {
  const ms = distDirs().map(([, d]) => newestMtimeMs(d)).filter((x): x is number => x !== undefined);
  return ms.length ? Math.max(...ms) : undefined;
}

/**
 * Salin strip Lakar ke `bench/round-<n>/` secara eksklusif: tujuan sudah ada dengan isi sama → dilewati (resume);
 * isi beda → error (tidak pernah menimpa).
 */
export function copyPngExclusive(src: string, dest: string): 'disalin' | 'identik' {
  if (existsSync(dest)) {
    if (sha256(readFileSync(dest)) === sha256(readFileSync(src))) return 'identik';
    throw new Error(`${dest} sudah ada dengan isi berbeda; tidak ditimpa`);
  }
  mkdirSync(join(dest, '..'), { recursive: true });
  copyFileSync(src, dest, constants.COPYFILE_EXCL);
  return 'disalin';
}

export type RoundArgs = { round: string; dryRun: boolean; resume: boolean };

/** Argumen CLI (murni). `undefined` + pesan = pemakaian salah (exit 64). */
export function parseRoundArgs(args: readonly string[]): { ok: true; value: RoundArgs } | { ok: false; error: string } {
  let round: string | undefined;
  let dryRun = false;
  let resume = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--') continue; // `pnpm bench:round -- --round …` meneruskan `--` apa adanya
    if (a === '--round') round = args[++i];
    else if (a.startsWith('--round=')) round = a.slice('--round='.length);
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--resume') resume = true;
    else return { ok: false, error: `argumen tidak dikenal: ${a}` };
  }
  if (round === undefined) return { ok: false, error: '--round wajib (uji-<k> untuk putaran uji, angka untuk putaran resmi)' };
  if (!ROUND_ID.test(round)) return { ok: false, error: `ID putaran ${JSON.stringify(round)} tidak cocok ${ROUND_ID.source}` };
  return { ok: true, value: { round, dryRun, resume } };
}

/**
 * Penjaga awal putaran (murni): round md sudah ada tanpa --resume → 64; masalah baseline per prompt (belum diukur,
 * hash prompt ≠ baseline, file tanpa `promptHashes`) → 1 untuk semua putaran non-dry-run (dry-run hanya mencetak).
 */
export function roundStartProblem(i: { mdExists: boolean; resume: boolean; dryRun: boolean; baselineProblems?: readonly string[] }): { exitCode: 64 | 1; message: string } | undefined {
  if (i.mdExists && !i.resume && !i.dryRun) return { exitCode: 64, message: 'round md sudah ada; pakai --resume untuk melanjutkan putaran ini' };
  if (!i.dryRun && i.baselineProblems?.length)
    return { exitCode: 1, message: `baseline pen.dev per prompt tidak sah (butuh pendev-baseline untuk prompt ini):\n  ${i.baselineProblems.join('\n  ')}` };
  return undefined;
}

/** Status akhir putaran (murni): fatal (run/juri invalid/aborted) atau .pen lama berubah/hilang → dibatalkan (exit 1). */
export function roundOutcome(i: {
  fatal: string | undefined;
  pen: { changed: string[]; removed: string[] };
  allRuns: boolean;
  /** Semua prompt yang bisa dinilai (kedua run punya strip) punya ulangan juri lengkap. Prompt tanpa strip diputuskan tanpa juri. */
  allReps: boolean;
  /** Run dengan PNG ≠ ukuran board/frame (bukan skala 1) → exit 3 seperti seri baseline. */
  pngScaleMismatch?: string[];
}): { status: RoundReport['status']; reasons: string[]; exitCode: number } {
  const reasons: string[] = [];
  if (i.fatal) reasons.push(`dihentikan: ${i.fatal}`);
  if (i.pen.changed.length || i.pen.removed.length) reasons.push(`.pen lama berubah/hilang: ${[...i.pen.changed, ...i.pen.removed].join(', ')}`);
  if (reasons.length) return { status: 'dibatalkan', reasons, exitCode: 1 };
  const mm = i.pngScaleMismatch ?? [];
  const mmReason = mm.length ? [`png_scale_mismatch: ${mm.join(', ')}`] : [];
  if (i.allRuns && i.allReps) return { status: 'lengkap', reasons: mmReason, exitCode: mm.length ? 3 : 0 };
  return { status: 'tidak lengkap', reasons: ['run atau ulangan juri belum lengkap', ...mmReason], exitCode: 2 };
}

/**
 * Run tersimpan yang dipakai apa adanya (C8): `success`/`failed`, dan `invalid` karena `dokumen lama`
 * (agen sudah bekerja penuh; tidak diulang untuk memilih hasil). Hanya gagal-setup sebelum agen bekerja
 * (`aborted`, init tidak valid) yang boleh dijalankan lagi lewat `--resume`.
 */
export function isFinalRun(rec: Pick<RunRecord, 'status' | 'reason'>): boolean {
  return rec.status === 'success' || rec.status === 'failed' || (rec.status === 'invalid' && /^dokumen lama/.test(rec.reason ?? ''));
}

/** Baseline md5 `.pen` putaran: snapshot `pen-before-*.json` paling awal (nama ber-stamp terurut), atau `current`. */
export function penBaseline(files: readonly string[], read: (f: string) => Record<string, string>, current: Record<string, string>): { baseline: Record<string, string>; from: string | undefined } {
  const first = [...files].filter((f) => /^pen-before-.*\.json$/.test(f)).sort()[0];
  return first ? { baseline: read(first), from: first } : { baseline: current, from: undefined };
}

/** Teks yang tidak boleh memuat frasa juri (C7): protokol, skill, server MCP, prompt agen hasil render. */
export function c7Targets(protocol: Protocol): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = [];
  for (const f of PROTOCOL_FILES) out.push({ name: `bench/protocol/${f}`, text: readFileSync(join(PROTOCOL_DIR, f), 'utf8') });
  if (existsSync(SKILLS_DIR)) for (const f of readdirSync(SKILLS_DIR).filter((x) => x.endsWith('.md')).sort()) out.push({ name: `packages/skills/skills/${f}`, text: readFileSync(join(SKILLS_DIR, f), 'utf8') });
  out.push({ name: 'packages/mcp/src/server.ts', text: readFileSync(MCP_SERVER_TS, 'utf8') });
  for (const id of protocol.config.promptIds) out.push({ name: `prompt agen ${id} (hasil render)`, text: renderPrompt(id, protocol) });
  return out;
}

export type JudgeTexts = Record<string, { text: string; secret: string; sha256: string; rubricVersion: string | undefined }>;

/** Versi rubrik + sha256 per prompt dari teks juri yang disiapkan. */
export function judgeTextInfo(texts: JudgeTexts): JudgeTextInfo {
  const versions = [...new Set(Object.values(texts).map((t) => t.rubricVersion))];
  return { rubricVersion: versions[0], textSha256: Object.fromEntries(Object.entries(texts).map(([id, t]) => [id, t.sha256])) };
}

/** Teks juri per prompt (default: semua `promptIds`) + penjaga kebocoran dan C7. Gagal → Abort sebelum spawn apa pun. */
export function prepareJudgeTexts(protocol: Protocol, ids: readonly string[] = protocol.config.promptIds): JudgeTexts {
  if (!existsSync(DESIGN_MD_PATH)) throw new Abort(`DESIGN.md tidak ada (${DESIGN_MD_PATH}); teks juri tidak bisa dibangun`);
  if (!existsSync(GOLDEN_SET_PATH)) throw new Abort(`golden-set.md tidak ada (${GOLDEN_SET_PATH})`);
  const design = readFileSync(DESIGN_MD_PATH, 'utf8');
  const golden = readFileSync(GOLDEN_SET_PATH, 'utf8');
  const out: JudgeTexts = {};
  const targets = c7Targets(protocol);
  for (const id of ids as readonly PromptId[]) {
    const t = buildJudgeText(design, golden, id, protocol.prompts[id]);
    const leaks = judgeLeaks(t.text);
    if (leaks.length) throw new Abort(`teks juri ${id} bocor: ${leaks.join('; ')}`);
    const c7 = judgeC7Problems(t.secret, targets);
    if (c7.length) throw new Abort(`C7 juri ${id} gagal:\n  ${c7.join('\n  ')}`);
    out[id] = { ...t, sha256: sha256(t.text) };
  }
  return out;
}

/** Transkrip + cap waktu dari dir run (stream.jsonl + timing.json). */
export function loadTimedLines(dir: string): TimedLine[] {
  const sf = join(dir, 'stream.jsonl');
  const tf = join(dir, 'timing.json');
  if (!existsSync(sf) || !existsSync(tf)) return [];
  const raw = readFileSync(sf, 'utf8').split('\n');
  if (raw.at(-1) === '') raw.pop();
  const timing = JSON.parse(readFileSync(tf, 'utf8')).lines as { i: number; t: number }[];
  return raw.map((line, i) => ({ t: timing[i]?.t ?? 0, line: line.replace(/\r$/, '') }));
}

/** Daftar prompt untuk teks: "A dan B", "A, B, C, D, dan E". */
export function promptList(ids: readonly string[]): string {
  return ids.length <= 2 ? ids.join(' dan ') : `${ids.slice(0, -1).join(', ')}, dan ${ids.at(-1)}`;
}

/** Konvensi putaran (dicatat di laporan); baris urutan dan pembekuan diturunkan dari prompt protokol. */
export function conventionFor(promptIds: readonly PromptId[]): string[] {
  const order = roundOrder(promptIds)
    .map(([p, t]) => `${p}-${t === 'pendev' ? 'pen.dev' : 'Lakar'}`)
    .join(', ');
  return [
    'ID putaran dicek dengan `^(uji-[1-9]\\d*|[1-9]\\d*)$`: `uji-<k>` = putaran uji, angka polos = putaran resmi (story 16).',
    `Satu putaran = ${promptList(promptIds)}, urutan run ${order}, lalu juri 3× per prompt. Satu run per alat per prompt; run tidak diulang untuk memilih hasil (C8).`,
    ...CONVENTION_REST,
    ...(isG1Protocol(promptIds)
      ? [
          'Baseline pen.dev per prompt (`bench/baseline-pendev.json` + `bench/baseline-pendev-<IDS>-<tanggal>.json`, baseline terbaru per prompt menang): hash per prompt (pembungkus + config tanpa `promptIds` + teks prompt) wajib sama untuk semua putaran non-dry-run; prompt tanpa baseline = abort sebelum run.',
          'Putaran G1 (A–E): gerbang Lakar menambah R3/R7 mekanis dari temuan layout_check final per ID aturan (R3 = 0 atau R7 = 0 → gerbang gagal); keputusan putaran `decideG1`.',
        ]
      : []),
  ];
}

const CONVENTION_REST = [
  'Putaran yang md-nya sudah ada ditolak kecuali `--resume`. `--resume` memakai ulang run `success`/`failed` dan ulangan juri yang sudah selesai; run `aborted`/`invalid` (gagal-setup) dipindah ke `<key>.prev-<stamp>` dan dijalankan lagi, dan dicatat sebagai percobaan sebelumnya.',
  'Sebelum run, dokumen Lakar yang dibuat/dibuka agen di putaran bench lain (`run.json` → `lakar.slug`/`lakar.opened`; run terhenti tanpa `run.json` lewat `docs-before.json` + `lakar-docs.jsonl`/`stream.jsonl`; slug di `docs-before.json` run itu tidak dihitung) dipindah dari dataDir lakard ke `bench/runs/lakar-archive/<round>-<stamp>/`, lalu lakard di-restart (salinan dokumen di memori), agar slug pilihan agen tidak bentrok (`dokumen lama`). Dokumen non-bench tidak disentuh; pembungkus dan prompt tidak berubah.',
  'Versi beku dicatat sekali di awal putaran (`frozen.json`); `--resume` memakainya dan melaporkan perbedaan.',
  'Artefak di `bench/runs/rounds/<round>/` (gitignored): dir run per `<prompt>-<alat>`, strip `<prompt>-<alat>.png`, dan `judge/<prompt>/rep-<k>/` (pemetaan X/Y, transkrip juri).',
  'Putaran resmi (ID angka) dibekukan ketat sebelum run: `git status --porcelain` kode produk + harness kosong; per prompt hash prompt, model, Claude Code, dan pen.dev desktop = baseline pen.dev yang mencakup prompt itu; lakard selalu di-restart dan `startedAt` harus lebih baru dari file `packages/*/dist` terbaru; font lengkap dan pool siap; sha256 teks juri = `bench/rubric/rubric.json`; `schemaVersion` lakard = bench; penyedia foto `unsplash`. Sesudah restart lakard, satu probe `POST /photos/search` (kueri netral, tanpa retry otomatis) wajib dijawab Unsplash dengan ≥ 1 hasil; gagal → abort sebelum `frozen.json` dan run. Strip Lakar disalin ke `bench/round-<n>/` (tracked); strip dan `.pen` pen.dev tetap lokal di `bench/runs/` (EULA). Putaran resmi ≥ 2 menulis skor ke `bench/round-<n>/score-<prompt>.md|json`; putaran 1 dan uji ke `bench/score-<prompt>.md|json`.',
];

const DEFINITIONS = [
  'Waktu (AD-13): `wall` = cap waktu monotonic saat baris event `result` diterima − cap waktu event stdout pertama, sama untuk kedua alat. Offset tool_use/tool_result dan spawn → event pertama hanya diagnostik.',
  'Gerbang waktu memakai median baseline pen.dev prompt itu (baseline terbaru yang mencakupnya, `bench/baseline-pendev*.json`): Lakar ≤ 1,5 × median baseline. Rasio Lakar/pen.dev putaran ini dilaporkan saja.',
  'Operasi harness setelah `result` di luar waktu: pen.dev `save` + salin `.pen` + Export `{scale:1}`; Lakar sesi HTTP sendiri → `/docs/open` → `/boards` → `/layout-check` → `/export {scale:1}` per board. Agen yang memanggil save/export sendiri ikut terhitung (alur normal alat).',
  'Reconnect Lakar: lakard restart (pid/startedAt/`NRestarts` systemd user berubah), halaman Chromium dibuat ulang (`pool.recreated` naik), atau tool_result `is_error` berisi `RENDER_FAILED`, `VERSION_MISMATCH`, "lakard tidak menjawab", atau pola putus transport. Reconnect pen.dev: `NRestarts`/`ActiveEnterTimestamp` pen-desktop berubah, atau tool_result `is_error` berpola putus transport (not connected, disconnect, connection closed, ECONNREFUSED/ECONNRESET/EPIPE, socket hang up, MCP error -32000). Error snippet biasa bukan reconnect. Dilaporkan terpisah, tidak dikurangkan dari waktu.',
  'Emoji: (a) di nilai string input tool_use agen (Emoji_Presentation, atau pictographic + VS16; © ® ™ dikecualikan; glyph LC-01b dihitung terpisah), (b) temuan LC-01a/LC-01b layout_check (Lakar saja; pen.dev tidak dilint, EULA), (c) emoji terlihat menurut juri (median).',
  'Normalisasi PNG: board/frame top-level (urutan dokumen) dikomposit di atas #808080, ditumpuk vertikal berjarak 48 px #808080, di-encode ulang RGB hanya IHDR/IDAT/IEND. Juri menerima tile lebar penuh (tinggi ≤ 1000 untuk lebar > 600, ≤ 1568 untuk lebih sempit) + satu overview sisi panjang ≤ 1568.',
  'Juri: `claude -p --input-format stream-json` tanpa tool/MCP (init wajib `tools=[]`, `mcp_servers=[]`), satu pesan berisi teks juri + gambar berlabel netral; label X/Y diacak per ulangan dengan `crypto` dan kedua penugasan wajib muncul. Jawaban JSON divalidasi ketat; tidak valid → 1 percobaan ulang, lalu `failed`.',
];

/** Field versi beku yang dibandingkan saat `--resume` (tanggal dan pid/startedAt lakard boleh berbeda karena restart). */
export function frozenDrift(first: FrozenVersions, now: FrozenVersions): string[] {
  const pick = (f: FrozenVersions) => ({
    head: f.head,
    porcelain: f.porcelain,
    protocolHash: f.protocolHash,
    promptHashes: JSON.stringify(f.promptHashes),
    model: f.model,
    claude: f.claude,
    lakard: `${f.lakard.version}/${f.lakard.schemaVersion}/${f.lakard.browser ?? ''}`,
    icons: JSON.stringify(f.icons),
    skills: JSON.stringify(f.skills),
    g0Rules: f.g0Rules,
    checkDist: f.checkDist,
    pendevDesktop: f.pendevDesktop,
    judge: JSON.stringify(f.judge),
    porcelainCode: f.porcelainCode,
    lakardNode: f.lakard.node,
    playwright: f.playwright,
    fonts: JSON.stringify(f.fonts),
    distSha: JSON.stringify(f.distSha),
    photos: f.photos?.provider,
  });
  const a = pick(first);
  const b = pick(now);
  return (Object.keys(a) as (keyof typeof a)[]).filter((k) => a[k] !== b[k]).map((k) => `${k}: ${a[k] || '(kosong)'} → ${b[k] || '(kosong)'}`);
}

/**
 * Status run saat harness melempar error (C8): bila claude sudah dijalankan (transkrip ada), run final `failed`,
 * bukan `aborted` yang boleh diulang lewat `--resume`.
 */
export function harnessErrorStatus(agentRan: boolean): 'failed' | 'aborted' {
  return agentRan ? 'failed' : 'aborted';
}

/** Tunggu lakard hidup lagi setelah restart: pid baru dan pool render siap (≤ 90 dtk). */
export async function waitLakard(client: LakardClient, oldPid: number, timeoutMs = 90_000): Promise<LakardStatus> {
  const until = Date.now() + timeoutMs;
  let last = 'belum menjawab';
  while (Date.now() < until) {
    try {
      const st = await client.status();
      if (st.pid !== oldPid && (st.pool?.ready ?? 0) >= 1) return st;
      last = `pid ${st.pid}, pool ready ${st.pool?.ready ?? '?'}`;
    } catch (e) {
      last = errorMessage(e);
    }
    await sleep(500);
  }
  throw new Abort(`lakard tidak siap ${timeoutMs / 1000} dtk setelah restart (${last})`);
}

export function runRecordPath(dir: string): string {
  return join(dir, 'run.json');
}

export type StoredRun = RunRecord & { lakar?: RoundRun['record']['lakar']; pendevSystemd?: { before: SystemdInfo; after: SystemdInfo } };

/** Bangun RoundRun dari dir run (dipakai juga saat --resume). */
export function roundRunFrom(roundDir: string, key: string, prompt: string, tool: Tool, rec: StoredRun, previous: string[]): RoundRun {
  const dir = join(roundDir, key);
  const lines = loadTimedLines(dir);
  const lakar = rec.lakar;
  return {
    key,
    prompt,
    tool,
    dir: relative(REPO_ROOT, dir),
    record: rec,
    reconnect: lines.length || lakar || rec.pendevSystemd
      ? tool === 'lakar'
        ? lakarReconnect(lakar?.daemonBefore, lakar?.daemonAfter, lines)
        : pendevReconnect(rec.pendevSystemd?.before, rec.pendevSystemd?.after, lines)
      : undefined,
    agentEmoji: lines.length ? countAgentEmoji(lines) : undefined,
    lintEmoji: lakar?.layout ? countLintEmoji(lakar.layout.findings) : undefined,
    strip: undefined,
    previous,
  };
}

/** Strip PNG dari frame/board run (urutan dokumen). Ditulis ke `<roundDir>/<key>.png`. */
export function writeStrip(roundDir: string, run: RoundRun): DesignImages | undefined {
  const pngs = run.record.frames.flatMap((f) => (f.png ? [join(REPO_ROOT, f.png)] : []));
  if (!pngs.length || pngs.length !== run.record.frames.length) return undefined;
  const strip = buildStrip(pngs.map((p) => readFileSync(p)));
  const path = join(roundDir, `${run.key}.png`);
  writeFileSync(path, encodePngRgb(strip));
  run.strip = { path: relative(REPO_ROOT, path), width: strip.width, height: strip.height, boards: pngs.length };
  return judgeImages(strip);
}

/** Predikat pakai-ulang ulangan juri tersimpan di `round` (`--resume`): semua kecuali `invalid`. */
export const ROUND_JUDGE_REUSE = (old: JudgeRepRecord): boolean => old.status !== 'invalid';

/**
 * `judge/<P>/judge-text.md` tersimpan di dir putaran yang isinya berbeda dari teks juri saat ini (mis. rubrik naik
 * versi sejak putaran dimulai). Murni (hanya baca); path relatif terhadap `roundDir`.
 */
export function staleJudgeTexts(roundDir: string, judgeTexts: Readonly<Record<string, { text: string }>>): string[] {
  return Object.entries(judgeTexts)
    .map(([p, t]) => ({ rel: join('judge', p, 'judge-text.md'), text: t.text }))
    .filter(({ rel, text }) => existsSync(join(roundDir, rel)) && readFileSync(join(roundDir, rel), 'utf8') !== text)
    .map(({ rel }) => rel);
}

/**
 * Tulis teks juri ke `<jdir>/judge-text.md` (eksklusif): belum ada → ditulis; identik → dilewati (resume);
 * berbeda → error (teks juri berubah di tengah putaran).
 */
export function writeJudgeTextExclusive(jdir: string, text: string): 'ditulis' | 'identik' {
  const f = join(jdir, 'judge-text.md');
  mkdirSync(jdir, { recursive: true });
  if (existsSync(f)) {
    if (readFileSync(f, 'utf8') === text) return 'identik';
    throw new Error(`${relative(REPO_ROOT, f)} sudah ada dengan isi berbeda (teks juri berubah sejak awal); tidak ditimpa`);
  }
  writeFileSync(f, text, { flag: 'wx' });
  return 'ditulis';
}

export type JudgePromptInput = {
  prompt: string;
  /** Dir juri prompt ini (`…/judge/<P>`). */
  jdir: string;
  text: string;
  images: Record<Tool, DesignImages>;
  emptyMcpConfig: string;
  config: ProtocolConfig;
  forbiddenCwdRoot: string;
  /** Ulangan tersimpan yang dipakai ulang; selebihnya dipindah ke `rep-<k>.prev-<stamp>` dan dijalankan lagi. */
  reuse: (r: JudgeRepRecord) => boolean;
  /** Untuk tes: program pengganti `claude`. */
  command?: string;
  prefixArgs?: string[];
};

/**
 * Juri buta 3× untuk satu prompt (dipakai `round` dan `rejudge`): teks juri disalin ke `judge-text.md`, penugasan X/Y
 * acak `crypto` disimpan sekali (`assignments.json`), lalu ulangan dijalankan/dipakai ulang. Ulangan `invalid` → berhenti.
 */
export async function judgePrompt(i: JudgePromptInput): Promise<{ reps: JudgeRepRecord[]; fatal: string | undefined }> {
  writeJudgeTextExclusive(i.jdir, i.text);
  const assignFile = join(i.jdir, 'assignments.json');
  let assignments: Assignment[];
  if (existsSync(assignFile)) assignments = JSON.parse(readFileSync(assignFile, 'utf8'));
  else {
    assignments = assignLabels(JUDGE_REPS);
    writeFileSync(assignFile, `${JSON.stringify(assignments, null, 1)}\n`, { flag: 'wx' });
  }
  const reps: JudgeRepRecord[] = [];
  for (let k = 1; k <= JUDGE_REPS; k++) {
    const repDir = join(i.jdir, `rep-${k}`);
    const repFile = join(repDir, 'rep.json');
    if (existsSync(repFile)) {
      const old = JSON.parse(readFileSync(repFile, 'utf8')) as JudgeRepRecord;
      // Ulangan `ok` dari rubrik lama (kriteria kurang, mis. tanpa R9/R10) tidak dipakai ulang: dijalankan lagi dengan teks saat ini.
      const coversCriteria = old.status !== 'ok' || (['X', 'Y'] as const).every((l) => JUDGE_CRITERIA.every((c) => old.verdict?.[l]?.[c] !== undefined));
      if (i.reuse(old) && coversCriteria) {
        reps.push(old);
        continue;
      }
      renameSync(repDir, `${repDir}.prev-${stamp()}`);
    } else if (existsSync(repDir)) renameSync(repDir, `${repDir}.prev-${stamp()}`);
    const mapping = assignments[k - 1]!;
    const blocks = buildJudgeBlocks(i.text, { X: i.images[mapping.X], Y: i.images[mapping.Y] });
    log(`juri ${i.prompt} ulangan ${k}: mulai`);
    const rep = await runJudgeRep({
      prompt: i.prompt,
      rep: k,
      mapping,
      blocks,
      dir: repDir,
      emptyMcpConfig: i.emptyMcpConfig,
      config: i.config,
      forbiddenCwdRoot: i.forbiddenCwdRoot,
      ...(i.command ? { command: i.command } : {}),
      ...(i.prefixArgs ? { prefixArgs: i.prefixArgs } : {}),
    });
    log(`juri ${i.prompt} ulangan ${k}: ${rep.status}${rep.retried ? ' (diulang 1×)' : ''}, $${rep.costUsd.toFixed(3)}`);
    reps.push(rep);
    if (rep.status === 'invalid') return { reps, fatal: `juri ${i.prompt} ulangan ${k} invalid: ${rep.attempts.at(-1)?.problems.join('; ')}` };
  }
  return { reps, fatal: undefined };
}

/**
 * Probe rate limit foto (putaran resmi, bukan dry-run): satu `POST /photos/search` lewat sesi `LakardClient` baru.
 * Masalah → Abort (tanpa retry otomatis; percobaan ulang manual hanya sebelum run, plan 1.21).
 */
export async function runPhotoProbe(client = new LakardClient()): Promise<PhotoProbe> {
  const t0 = Date.now();
  let r: { res: PhotoSearchResult } | { error: string };
  try {
    await client.createSession(LAKAR_VERSION, SCHEMA_VERSION);
    r = { res: await client.photoSearch({ ...PHOTO_PROBE }) };
  } catch (e) {
    r = { error: errorMessage(e) };
  }
  const ms = Date.now() - t0;
  const problems = photoProbeProblems(r);
  if (problems.length) throw new Abort(`probe foto sebelum run gagal (${ms} ms; tanpa retry otomatis, belum ada run): ${problems.join('; ')}`);
  const res = (r as { res: PhotoSearchResult }).res;
  return { query: PHOTO_PROBE.query, provider: res.provider, ...(res.fallbackReason ? { fallbackReason: res.fallbackReason } : {}), results: res.results.length, ms };
}

/** Masukan `decideG1` per prompt dari hasil putaran (murni): keputusan, rasio waktu gerbang, emoji Lakar (a)/(b)/(c). */
export function g1Input(p: RoundPrompt): G1PromptInput {
  const lakar = p.runs.lakar;
  return {
    prompt: p.prompt,
    decision: p.decision,
    timeRatio: p.gate?.timeRatio,
    emoji: {
      agent: lakar?.agentEmoji?.emoji,
      lint: lakar?.lintEmoji ? lakar.lintEmoji.lc01a + lakar.lintEmoji.lc01b : undefined,
      judge: p.score?.tools.lakar.emoji.median,
    },
  };
}

export async function roundMain(argv: string[]): Promise<number> {
  const parsed = parseRoundArgs(argv);
  if (!parsed.ok) {
    console.error(`round: ${parsed.error}\npakai: node bench/dist/cli.js round --round <uji-k|n> [--dry-run] [--resume]`);
    return 64;
  }
  const { round, dryRun, resume } = parsed.value;
  const mdPath = join(BENCH_ROOT, `round-${round}.md`);
  const early = roundStartProblem({ mdExists: existsSync(mdPath), resume, dryRun });
  if (early) {
    console.error(`round: ${relative(REPO_ROOT, mdPath)}: ${early.message}`);
    return early.exitCode;
  }

  // ---------- preflight gabungan ----------
  const pre: Preflight = preflight();
  const { protocol } = pre;
  const cfg = protocol.config;
  const g1 = isG1Protocol(cfg.promptIds);
  const hashes = promptHashes(protocol);
  const baselines = loadBaselines();
  const baseOf = (p: string): BaselineEntry | undefined => baselines.byPrompt[p];
  const startBaselineProblems = baselineProblems(baselines, { promptHashes: hashes }, cfg.promptIds);
  const hashProblem = roundStartProblem({ mdExists: false, resume, dryRun, baselineProblems: startBaselineProblems });
  if (hashProblem) throw new Abort(hashProblem.message);
  log(startBaselineProblems.length ? `baseline per prompt: ${startBaselineProblems.join('; ')} (dry-run: hanya dicetak)` : `hash per prompt = baseline (${cfg.promptIds.join(', ')})`);
  const client = new LakardClient();
  let status: LakardStatus | undefined;
  try {
    status = await client.status();
  } catch (e) {
    throw new Abort(`lakard: ${errorMessage(e)}`);
  }
  const lp = lakarPreflightProblems(status, mcpServerNames());
  if (lp.length) throw new Abort(`preflight Lakar: ${lp.join('; ')}`);
  log(`lakard ${status.version} (schema ${status.schemaVersion}), pool ready ${status.pool?.ready}; .mcp.json = [lakar]`);
  const judgeTexts = prepareJudgeTexts(protocol);
  const judgeInfo = judgeTextInfo(judgeTexts);
  const rubric = readRubricJson();
  const roundDir = join(RUNS_ROOT, 'rounds', round);
  const stale = staleJudgeTexts(roundDir, judgeTexts);
  const staleMessage = stale.length
    ? `teks juri berbeda dari yang tersimpan di putaran ${round} (${stale.map((f) => relative(REPO_ROOT, join(roundDir, f))).join(', ')}): ulangan juri lama tidak bisa dilanjutkan dengan teks ini; mulai putaran baru, atau nilai ulang strip putaran ini dengan \`rejudge --from ${round} --label <label>\``
    : undefined;
  log('teks juri: tanpa nama alat/path; C7 juri lulus (protokol, skill, server MCP, prompt agen)');
  log(`rubrik juri: versi ${judgeInfo.rubricVersion ?? '1 (tanpa baris versi)'}; ${Object.entries(judgeInfo.textSha256).map(([id, x]) => `sha256 ${id} ${x.slice(0, 12)}…`).join(', ')}`);
  const head = git(REPO_ROOT, ['rev-parse', 'HEAD']);
  const porcelain = gitPorcelain(REPO_ROOT, ['packages', 'tools', '.mcp.json']);
  const official = isOfficialRound(round);
  const porcelainCode = official ? gitPorcelain(REPO_ROOT, OFFICIAL_CODE_PATHS) : undefined;
  const porcelainAll = official ? gitPorcelain(REPO_ROOT) : undefined;
  const freezeInput = (st: LakardStatus, checkLakardFresh: boolean): OfficialFreezeInput => ({
    porcelainCode: porcelainCode ?? '',
    promptIds: cfg.promptIds,
    promptHashes: hashes,
    model: protocol.config.model,
    claude: pre.claudeVersion,
    pendevDesktop: penDesktopVersion(),
    baselines,
    lakard: st,
    newestDistMtimeMs: newestDistMtime(),
    checkLakardFresh,
    judgeText: judgeInfo,
    rubric,
  });

  const emptyMcpPath = join(RUNS_ROOT, 'rounds', round, 'judge', 'mcp-empty.json');
  const argvFor = (mcp: string, allowed: string, prompt = '<prompt hasil render>') => shellQuote(['claude', ...buildArgs({ prompt, config: cfg, mcpConfig: mcp, allowedTools: allowed })]);
  const judgeArgv = shellQuote(['claude', ...buildJudgeArgs(cfg.model, relative(REPO_ROOT, emptyMcpPath))]);
  const order = roundOrder(cfg.promptIds);
  console.log(`round ${round}\nprotocolHash ${protocol.hash} (info; penjaga = hash per prompt)`);
  console.log(`rencana: ${cfg.promptIds.length} prompt (${cfg.promptIds.join(', ')}), ${order.length} run (${order.map(([p, t]) => `${p}-${t}`).join(', ')}) + juri ${JUDGE_REPS}× per prompt; keputusan ${g1 ? 'G1 (`decideG1`, gerbang + R3/R7 mekanis)' : 'G0 (`decideG0`)'}`);
  for (const p of cfg.promptIds) {
    const b = baseOf(p);
    console.log(`hash prompt ${p} ${hashes[p]}: ${b ? `baseline ${b.source} (${b.date}) ${b.promptHash === hashes[p] ? '= baseline' : `≠ baseline ${b.promptHash}`}; median ${b.medianWallMs === undefined ? '–' : (b.medianWallMs / 1000).toFixed(1)} dtk` : 'baseline belum diukur'}`);
  }
  for (const b of baselines.superseded) console.log(`baseline tergantikan: ${b.prompt} di ${b.source} (${b.date})`);
  for (const x of baselines.incomplete) console.log(`baseline tidak lengkap (tidak dipakai): ${x}`);
  if (startBaselineProblems.length) console.log(`MASALAH baseline per prompt (non-dry-run → abort sebelum run):\n  ${startBaselineProblems.join('\n  ')}`);
  console.log(`C7 agen: lulus; C7 juri: lulus\ngit HEAD ${head}; porcelain packages/tools/.mcp.json: ${porcelain ? `TIDAK KOSONG\n${porcelain}` : 'kosong'}`);
  for (const p of cfg.promptIds) {
    const rendered = renderPrompt(p, protocol);
    console.log(`\n=== ${p}: argv Lakar ===\n${argvFor(LAKAR_MCP_CONFIG, LAKAR_ALLOWED_TOOLS, rendered)}`);
    console.log(`=== ${p}: argv pen.dev ===\n${argvFor(PENDEV_MCP_CONFIG, PENDEV_ALLOWED_TOOLS, rendered)}`);
  }
  console.log(`\n=== argv juri (stdin: satu pesan stream-json teks + gambar) ===\n${judgeArgv}`);
  const shaProblems = rubricShaProblems({ version: judgeInfo.rubricVersion, sha: judgeInfo.textSha256 }, rubric);
  console.log(`\nrubrik juri: versi ${judgeInfo.rubricVersion ?? '1 (tanpa baris versi)'}; ${Object.entries(judgeInfo.textSha256).map(([id, x]) => `sha256 ${id} ${x}`).join('; ')}; bench/rubric/rubric.json: ${shaProblems.length ? `BERBEDA (${shaProblems.join('; ')})` : 'sama'}`);
  console.log(`\nenv tambahan: ${JSON.stringify(cfg.env)}; dibuang: ${buildEnv(process.env, cfg).scrubbed.join(', ') || '-'}`);
  console.log(`\nkonvensi putaran:\n${conventionFor(cfg.promptIds).map((c) => `- ${c}`).join('\n')}`);
  // Dokumen Lakar buatan putaran bench lain: dipindah ke arsip bench sebelum run agar slug pilihan agen tidak bentrok
  // (`dokumen lama` → invalid). Dokumen non-bench tidak disentuh.
  const archiveDir = join(RUNS_ROOT, 'lakar-archive', `${round}-${stamp()}`);
  const archiveSources = benchLakarSources([join(RUNS_ROOT, 'rounds'), join(RUNS_ROOT, 'practice'), join(RUNS_ROOT, 'practice-effects'), join(RUNS_ROOT, 'practice-polish')], { root: join(RUNS_ROOT, 'rounds'), id: round });
  const archivePlan = planLakarArchive(status.dataDir, [...new Set(archiveSources.map((x) => x.slug))], archiveDir);
  console.log(`\narsip dokumen Lakar bench lama (sebelum run, lalu restart lakard): ${describeLakarArchive(status!.dataDir, archivePlan, archiveSources)}`);
  const preFreeze = official ? officialFreezeProblems(freezeInput(status, false)) : [];
  if (official) {
    const distMs = newestDistMtime();
    const fresh = distMs !== undefined && Date.parse(status.startedAt) > distMs;
    console.log(
      `\nputaran resmi: cek pembekuan\n` +
        `- git status --porcelain -- ${OFFICIAL_CODE_PATHS.join(' ')}: ${porcelainCode ? `TIDAK KOSONG\n${porcelainCode}` : 'kosong'}\n` +
        `- claude ${claudeSemver(pre.claudeVersion)}; pen.dev desktop ${penDesktopVersion() ?? '?'}; model ${cfg.model}; baseline per prompt: ${cfg.promptIds.map((p) => { const b = baseOf(p); return b ? `${p} claude ${b.claude ?? '?'}/pen.dev ${b.pendevDesktop ?? '?'}/model ${b.model ?? '?'}/hash ${b.promptHash === hashes[p] ? '=' : '≠'}` : `${p} belum diukur`; }).join('; ')}\n` +
        `- font missing: ${JSON.stringify(status.fonts?.missing ?? null)}; pool ready ${status.pool?.ready ?? '?'}\n` +
        `- schemaVersion lakard ${status.schemaVersion} (bench ${SCHEMA_VERSION}); penyedia foto ${status.photos?.provider ?? '(tidak ada di /status)'} (wajib ${EXPECTED_PHOTO_PROVIDER}), key ${status.photos?.keyFile ?? '?'}\n` +
        `- rencana: restart lakard (wajib untuk putaran resmi${archivePlan.length ? ', sesudah arsip' : ''}), lalu startedAt harus > mtime dist terbaru ${distMs === undefined ? '(dist tidak ada)' : new Date(distMs).toISOString()} (lakard sekarang: startedAt ${status.startedAt}, ${fresh ? 'sudah lebih baru' : 'lebih tua; restart akan memuat build ini'})\n` +
        `- rencana probe foto (sesudah restart lakard, sebelum frozen.json/run): satu POST /photos/search ${JSON.stringify(PHOTO_PROBE)} lewat sesi baru; wajib penyedia ${EXPECTED_PHOTO_PROVIDER}, ≥ 1 hasil, fallbackReason bukan ${EXPECTED_PHOTO_PROVIDER}-*; gagal → abort tanpa retry${dryRun ? ' (dry-run: tidak dijalankan)' : ''}\n` +
        `- masalah: ${preFreeze.length ? `\n  ${preFreeze.join('\n  ')}` : 'tidak ada'}`,
    );
  }
  // Restart pen-desktop: sekali sesudah run pen.dev terakhir pemanggilan ini, sebelum strip/juri.
  console.log(`\nrestart pen-desktop: sekali sesudah run pen.dev terakhir pemanggilan ini (bila ada run pen.dev yang dijalankan), sebelum strip/juri; tunggu active + MCP pencil menjawab (maks ${PEN_DESKTOP_RESTART_TIMEOUT_MS / 1000} dtk); hasil dicatat di laporan${dryRun ? ' (dry-run: tidak dijalankan)' : ''}`);
  if (staleMessage) console.log(`\nMASALAH: ${staleMessage}`);
  if (dryRun) return 0;
  if (staleMessage) throw new Abort(staleMessage);
  if (preFreeze.length) throw new Abort(`putaran resmi tidak beku:\n  ${preFreeze.join('\n  ')}`);
  if (porcelain) throw new Abort(`produk tidak beku: git status --porcelain -- packages tools .mcp.json tidak kosong:\n${porcelain}`);
  const archiveNotes: string[] = [];
  let photoProbe: PhotoProbe | undefined;
  // Putaran resmi: restart lakard wajib (juga saat rencana arsip kosong), agar lakard memuat build saat ini. Satu restart saja.
  if (archivePlan.length || official) {
    if (archivePlan.length) {
      applyLakarArchive(archivePlan);
      log(`arsip: ${archivePlan.length} entri dokumen bench lama dipindah ke ${relative(REPO_ROOT, archiveDir)}`);
    }
    log('restart lakard');
    const oldPid = status.pid;
    restartUserUnit(LAKARD_UNIT);
    status = await waitLakard(client, oldPid);
    const lp2 = lakarPreflightProblems(status, mcpServerNames());
    if (lp2.length) throw new Abort(`preflight Lakar sesudah restart: ${lp2.join('; ')}`);
    if (official) {
      const post = officialFreezeProblems(freezeInput(status, true));
      if (post.length) throw new Abort(`putaran resmi tidak beku sesudah restart lakard:\n  ${post.join('\n  ')}`);
      log(`lakard di-restart dari build saat ini (startedAt ${status.startedAt}); cek pembekuan resmi lulus`);
      photoProbe = await runPhotoProbe();
      log(`probe foto: ${photoProbe.provider}, ${photoProbe.results} hasil, ${photoProbe.ms} ms${photoProbe.fallbackReason ? `, fallbackReason ${photoProbe.fallbackReason}` : ''}`);
    }
    archiveNotes.push(
      archivePlan.length
        ? `Sebelum run: dokumen Lakar buatan putaran bench lain dipindah ke \`${relative(REPO_ROOT, archiveDir)}\` (${[...new Set(archivePlan.map((x) => x.slug))].join(', ')}), lalu lakard di-restart (pid ${oldPid} → ${status.pid}) agar slug agen tidak bentrok dengan dokumen lama. Restart ini sebelum run, jadi bukan reconnect.`
        : `Sebelum run: lakard di-restart (pid ${oldPid} → ${status.pid}, wajib untuk putaran resmi) agar memuat build saat ini; arsip dokumen kosong. Restart ini sebelum run, jadi bukan reconnect.`,
    );
  }

  // ---------- putaran ----------
  mkdirSync(join(roundDir, 'judge'), { recursive: true });
  if (!existsSync(emptyMcpPath)) writeFileSync(emptyMcpPath, EMPTY_MCP);
  // Resume: baseline .pen = snapshot paling awal putaran ini, agar perubahan di pemanggilan sebelumnya tetap terdeteksi.
  const penNow = md5PenFiles();
  const pb = penBaseline(readdirSync(roundDir), (f) => JSON.parse(readFileSync(join(roundDir, f), 'utf8')), penNow);
  const penBefore = pb.baseline;
  writeFileSync(join(roundDir, `pen-before-${stamp()}.json`), `${JSON.stringify(penNow, null, 1)}\n`);
  log(`md5 ${Object.keys(penBefore).length} file .pen lama dicatat${pb.from ? ` (baseline dari ${pb.from})` : ''}`);
  const notes: string[] = [...archiveNotes];
  const mcpVersionFile = join(roundDir, 'pendev-mcp-version.txt');
  const serverVersion: { v?: string } = existsSync(mcpVersionFile) ? { v: readFileSync(mcpVersionFile, 'utf8').trim() } : {};
  // Versi beku dicatat sekali di awal putaran (sebelum run); --resume memakai catatan itu dan melaporkan perbedaannya.
  const frozenNow: FrozenVersions = {
    head,
    porcelain,
    protocolHash: protocol.hash,
    promptHashes: hashes,
    promptBaselines: Object.fromEntries(cfg.promptIds.map((p) => [p, baseOf(p) ? { promptHash: baseOf(p)!.promptHash, source: baseOf(p)!.source, date: baseOf(p)!.date } : null])),
    model: cfg.model,
    claude: pre.claudeVersion,
    ...(official ? { porcelainCode: porcelainCode ?? '', porcelainAll: porcelainAll ?? '' } : {}),
    lakard: { version: status.version, schemaVersion: status.schemaVersion, pid: status.pid, startedAt: status.startedAt, browser: status.pool?.browserVersion, node: status.node },
    playwright: existsSync(PLAYWRIGHT_PKG) ? JSON.parse(readFileSync(PLAYWRIGHT_PKG, 'utf8')).version : undefined,
    fonts: {
      families: status.fonts?.families ?? [],
      missing: status.fonts?.missing ?? [],
      packages: Object.fromEntries(Object.entries((JSON.parse(readFileSync(DAEMON_PKG, 'utf8')).dependencies ?? {}) as Record<string, string>).filter(([k]) => k.startsWith('@fontsource/')).sort(([a], [b]) => a.localeCompare(b))),
    },
    distSha: Object.fromEntries(distDirs().map(([n, d]) => [n, sha256Dir(d)])),
    ...(status.photos ? { photos: { provider: status.photos.provider, keyFile: status.photos.keyFile, ...(photoProbe ? { probe: photoProbe } : {}) } } : {}),
    baselinesByPrompt: Object.fromEntries(cfg.promptIds.map((p) => [p, baseOf(p) ? { model: baseOf(p)!.model, claude: baseOf(p)!.claude, pendevDesktop: baseOf(p)!.pendevDesktop } : null])),
    icons: status.icons ?? {},
    skills: Object.fromEntries(readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.md')).sort().map((f) => [f, sha256(readFileSync(join(SKILLS_DIR, f)))])),
    g0Rules: JSON.stringify(G0_RULES),
    checkDist: existsSync(CHECK_DIST) ? sha256Dir(CHECK_DIST) : 'tidak ada',
    pendevDesktop: penDesktopVersion(),
    pendevMcp: undefined,
    judge: { model: cfg.model, argv: judgeArgv, rubricVersion: judgeInfo.rubricVersion, textSha256: judgeInfo.textSha256 },
  };
  const frozenFile = join(roundDir, 'frozen.json');
  const startedIso = new Date().toISOString();
  let frozenFirst: { date: string; frozen: FrozenVersions };
  if (existsSync(frozenFile)) {
    frozenFirst = JSON.parse(readFileSync(frozenFile, 'utf8'));
    const drift = frozenDrift(frozenFirst.frozen, frozenNow);
    notes.push(`Laporan dibuat ulang ${startedIso} (--resume); versi beku dan tanggal dari awal putaran ${frozenFirst.date}.${drift.length ? ` Berbeda saat --resume: ${drift.join('; ')}.` : ' Tidak ada perbedaan versi saat --resume.'}`);
  } else {
    frozenFirst = { date: startedIso, frozen: frozenNow };
    writeFileSync(frozenFile, `${JSON.stringify(frozenFirst, null, 1)}\n`, { flag: 'wx' });
  }
  const prevUris: string[] = [];
  const runs = new Map<string, RoundRun>();
  let fatal: string | undefined;
  let pendevRan = 0;

  for (const [p, tool] of order) {
    const key = `${p}-${tool}`;
    const dir = join(roundDir, key);
    const previous: string[] = readdirSync(roundDir)
      .filter((x) => x.startsWith(`${key}.prev-`))
      .sort()
      .map((d) => relative(REPO_ROOT, join(roundDir, d)));
    if (existsSync(runRecordPath(dir))) {
      const rec = JSON.parse(readFileSync(runRecordPath(dir), 'utf8')) as StoredRun;
      if (isFinalRun(rec)) {
        log(`${key}: dipakai ulang (${rec.status})`);
        if (rec.uri) prevUris.push(rec.uri);
        runs.set(key, roundRunFrom(roundDir, key, p, tool, rec, previous));
        if (rec.status === 'invalid') {
          fatal = `${key} ${rec.status}: ${rec.reason}`;
          break;
        }
        continue;
      }
    }
    if (existsSync(dir)) {
      if (!resume) throw new Abort(`${relative(REPO_ROOT, dir)} sudah ada tanpa hasil selesai; pakai --resume`);
      const moved = `${dir}.prev-${stamp()}`;
      renameSync(dir, moved);
      previous.push(relative(REPO_ROOT, moved));
      log(`${key}: percobaan sebelumnya dipindah ke ${relative(REPO_ROOT, moved)}`);
    }
    const runId = `${round}-${key}`;
    const prompt = renderPrompt(p, protocol);
    let rec: StoredRun;
    log(`${key}: mulai`);
    if (tool === 'pendev') {
      const before = systemdShow('pen-desktop', false);
      pendevRan++;
      try {
        rec = await runOne({ pre, runId, prompt, promptId: p, attempt: 1, outDir: dir, prevUris }, serverVersion);
      } catch (e) {
        mkdirSync(dir, { recursive: true });
        rec = { ...emptyRecord({ runId, promptId: p, attempt: 1 }), status: harnessErrorStatus(existsSync(join(dir, 'stream.jsonl'))), reason: `harness: ${errorMessage(e)}` };
      }
      rec.pendevSystemd = { before, after: systemdShow('pen-desktop', false) };
      if (serverVersion.v) writeFileSync(mcpVersionFile, `${serverVersion.v}\n`);
    } else {
      try {
        rec = await runLakar({ runId, prompt, promptId: p, outDir: dir, config: cfg, client });
      } catch (e) {
        mkdirSync(dir, { recursive: true });
        rec = { ...emptyRecord({ runId, promptId: p, attempt: 1 }), status: harnessErrorStatus(existsSync(join(dir, 'stream.jsonl'))), reason: `harness: ${errorMessage(e)}` };
      }
    }
    writeFileSync(runRecordPath(dir), `${JSON.stringify(rec, null, 1)}\n`);
    runs.set(key, roundRunFrom(roundDir, key, p, tool, rec, previous));
    if (rec.status === 'aborted' || rec.status === 'invalid') {
      fatal = `${key} ${rec.status}: ${rec.reason}`;
      log(`putaran berhenti: ${fatal}`);
      break;
    }
  }

  // ---------- restart pen-desktop: sesudah run pen.dev terakhir, sebelum strip/juri ----------
  const step = await penDesktopRestartStep({
    pendevRan,
    file: join(roundDir, 'pen-desktop-restart.json'),
    restart: () => {
      log('restart pen-desktop (sesudah run pen.dev terakhir)');
      return restartPenDesktopAfterSeries(
        penDesktopRestartDeps(async () => {
          const c = await PencilClient.connect(pre.server);
          try {
            await c.appState();
          } finally {
            await c.close().catch(() => undefined);
          }
        }),
      );
    },
  });
  const penDesktopRestart: PenDesktopRestart | string = step.result;
  if (step.ran && typeof penDesktopRestart !== 'string') {
    log(`restart pen-desktop: ${penDesktopRestart.ok ? 'berhasil' : 'GAGAL'} (${(penDesktopRestart.ms / 1000).toFixed(1)} dtk; ${penDesktopRestart.detail})`);
    if (!penDesktopRestart.ok) notes.push(`Restart pen-desktop GAGAL: ${penDesktopRestart.detail}. Juri tetap dijalankan.`);
  }

  // ---------- strip + juri ----------
  const results: RoundPrompt[] = [];
  const judgeablePrompts = new Set<string>();
  const pngCopies = new Map<string, string>();
  let judgeCost = 0;
  // Aturan ukuran mengikat dari versi rubrik yang dibekukan putaran ini (laporan lama yang di-render ulang tetap persis).
  const sizeRule = sizeRuleFor(frozenFirst.frozen.judge?.rubricVersion);
  for (const p of cfg.promptIds) {
    const r: Partial<Record<Tool, RoundRun>> = { lakar: runs.get(`${p}-lakar`), pendev: runs.get(`${p}-pendev`) };
    const images: Partial<Record<Tool, DesignImages>> = {};
    for (const t of ['lakar', 'pendev'] as const) {
      const run = r[t];
      if (!run) continue;
      try {
        const im = writeStrip(roundDir, run);
        if (im) images[t] = im;
      } catch (e) {
        notes.push(`strip ${run.key} gagal: ${errorMessage(e)}`);
      }
      // Putaran resmi: strip Lakar disalin ke bench/round-<n>/ (tracked). Strip/.pen pen.dev tetap lokal (EULA).
      if (official && t === 'lakar' && run.strip) {
        const dest = join(BENCH_ROOT, `round-${round}`, `${run.key}.png`);
        try {
          const how = copyPngExclusive(join(REPO_ROOT, run.strip.path), dest);
          log(`PNG ${relative(REPO_ROOT, dest)}: ${how}`);
          pngCopies.set(run.key, relative(REPO_ROOT, dest));
        } catch (e) {
          // Tidak menimpa: putaran dibatalkan (juri tidak dijalankan), laporan dan penjaga .pen tetap ditulis.
          fatal ??= `PNG Lakar ${run.key}: ${errorMessage(e)}`;
          log(`putaran berhenti: ${fatal}`);
        }
      }
    }
    const lakarRec = r.lakar?.record;
    const sizeProblems = lakarRec?.lakar ? boardSizeProblems(p, lakarRec.lakar.boards, sizeRule) : [];
    // Putaran G1: R3/R7 mekanis dari temuan layout_check final board Lakar (G0/latihan tidak menghitungnya).
    const technical = g1 && lakarRec ? (lakarRec.lakar?.layout ? technicalScores(lakarRec.lakar.layout.findings) : null) : undefined;
    const gate = lakarRec
      ? lakarGate({ promptId: p, layoutGate: lakarRec.lakar?.layout?.summary.gate, sizeProblems, wallMs: lakarRec.wallMs, baselineMedianMs: baseOf(p)?.medianWallMs, ...(technical !== undefined ? { technical } : {}) })
      : undefined;

    const pendevRec = r.pendev?.record;
    const pendevSizeProblems = pendevRec ? boardSizeProblems(p, pendevRec.frames, sizeRule) : [];
    let reps: JudgeRepRecord[] = [];
    const judgeable = Boolean(images.lakar && images.pendev);
    if (judgeable) judgeablePrompts.add(p);
    const judgeSkipped = Boolean(fatal) && judgeable;
    if (!fatal && judgeable) try {
      const j = await judgePrompt({
        prompt: p,
        jdir: join(roundDir, 'judge', p),
        text: judgeTexts[p]!.text,
        images: { lakar: images.lakar!, pendev: images.pendev! },
        emptyMcpConfig: emptyMcpPath,
        config: cfg,
        forbiddenCwdRoot: REPO_ROOT,
        reuse: ROUND_JUDGE_REUSE,
      });
      reps = j.reps;
      fatal ??= j.fatal;
    } catch (e) {
      // Laporan dan penjaga .pen tetap jalan walau tahap juri gagal (run desain berbayar sudah selesai).
      fatal = `juri ${p}: harness: ${errorMessage(e)}`;
      log(`putaran berhenti: ${fatal}`);
    }
    // Ulangan juri yang tidak dipakai (init tidak valid, atau terputus sebelum rep.json) tetap tercatat di laporan.
    const jdirAll = join(roundDir, 'judge', p);
    const prevReps = existsSync(jdirAll) ? readdirSync(jdirAll).filter((d) => /^rep-\d+\.prev-/.test(d)).sort() : [];
    if (prevReps.length) notes.push(`Juri ${p}: percobaan ulangan sebelumnya tidak dipakai (init tidak valid atau terputus sebelum rep.json): ${prevReps.map((d) => `\`${relative(REPO_ROOT, join(jdirAll, d))}\``).join(', ')}.`);
    judgeCost += reps.reduce((s, x) => s + x.costUsd, 0);
    const score = reps.length ? aggregateScores(p, reps) : undefined;
    const decided = !r.lakar
      ? { decision: 'tidak dapat dinilai' as const, why: 'run Lakar tidak dijalankan (putaran berhenti lebih awal)' }
      : decide({
          gate: gate ?? { ok: false, reasons: ['run Lakar tidak ada'], timeRatio: undefined },
          lakarRunOk: lakarRec?.status === 'success',
          pendevRunOk: r.pendev?.record.status === 'success',
          score,
          pendevBrief: { sizeProblems: pendevSizeProblems },
        });
    // Juri dilewati karena putaran berhenti: alasannya itu, bukan "tidak ada ulangan juri yang valid".
    const decision = judgeSkipped && !reps.length && decided.why === NO_VALID_REPS ? { ...decided, why: `juri tidak dijalankan: putaran dihentikan (${fatal})` } : decided;
    results.push({
      prompt: p,
      scoreReport: `${scoreReportBase(round)}${p}.md`,
      baselineMedianMs: baseOf(p)?.medianWallMs,
      baselineCostUsd: baseOf(p)?.medianCostUsd,
      ...(g1 ? { baselineSource: baseOf(p)?.source, technical: technical ?? null } : {}),
      runs: r,
      gate,
      sizeProblems,
      score,
      decision,
      pendevSizeProblems,
    });
  }

  // ---------- penjaga .pen + status ----------
  const penAfter = md5PenFiles();
  const cmp = comparePenHashes(penBefore, penAfter);
  const allRuns = order.every(([p, t]) => runs.has(`${p}-${t}`));
  const allReps = results.filter((x) => judgeablePrompts.has(x.prompt)).every((x) => x.score && x.score.reps.length === JUDGE_REPS);
  const mismatch = [...runs.values()].filter((x) => x.record.pngScaleMismatch).map((x) => x.key);
  const outcome = roundOutcome({ fatal, pen: cmp, allRuns, allReps, pngScaleMismatch: mismatch });
  const roundStatus = outcome.status;
  const statusReasons = outcome.reasons;
  const failedReps = results.flatMap((x) => x.score?.reps.filter((y) => y.status !== 'ok').map((y) => `${x.prompt} ulangan ${y.rep} ${y.status}`) ?? []);
  if (failedReps.length) notes.push(`Ulangan juri tidak valid (tidak diganti): ${failedReps.join(', ')}.`);

  const frozen: FrozenVersions = { ...frozenFirst.frozen, pendevMcp: serverVersion.v };
  if (status.version !== LAKAR_VERSION || status.schemaVersion !== SCHEMA_VERSION) notes.push(`lakard ${status.version}/${status.schemaVersion} ≠ bench ${LAKAR_VERSION}/${SCHEMA_VERSION}`);
  const report: RoundReport = {
    round,
    date: frozenFirst.date,
    status: roundStatus,
    statusReasons,
    frozen,
    wrapper: protocol.wrapper,
    prompts: Object.fromEntries(cfg.promptIds.map((p) => [p, protocol.prompts[p]])),
    argv: { lakar: argvFor(relative(REPO_ROOT, LAKAR_MCP_CONFIG), LAKAR_ALLOWED_TOOLS), pendev: argvFor(relative(REPO_ROOT, PENDEV_MCP_CONFIG), PENDEV_ALLOWED_TOOLS), judge: judgeArgv },
    env: { set: cfg.env, scrubbed: buildEnv(process.env, cfg).scrubbed },
    convention: conventionFor(cfg.promptIds),
    definitions: DEFINITIONS,
    penGuard: { files: Object.keys(penBefore).length, changed: cmp.changed, removed: cmp.removed, added: cmp.added },
    lakardActiveAfter: isActive(LAKARD_UNIT, true),
    penDesktopRestart,
    results,
    g0: decideG0(results, roundStatus),
    ...(g1 ? { g1: decideG1(results.map(g1Input), roundStatus) } : {}),
    pngs: results.flatMap((x) =>
      (['lakar', 'pendev'] as const).map((t) => {
        const run = x.runs[t];
        const key = `${x.prompt}-${t}`;
        if (!run?.strip) return { prompt: x.prompt, tool: t, path: undefined, status: run ? 'strip tidak ada' : 'run tidak dijalankan' };
        if (t === 'pendev') return { prompt: x.prompt, tool: t, path: run.strip.path, status: `lokal, tidak di-commit (EULA); \`.pen\` di \`${run.dir}/\`` };
        const copy = pngCopies.get(key);
        return copy
          ? { prompt: x.prompt, tool: t, path: copy, status: `tracked, di-commit bersama laporan (salinan \`${run.strip.path}\`)` }
          : { prompt: x.prompt, tool: t, path: run.strip.path, status: official ? 'lokal; salinan ke bench/round-<n>/ gagal' : 'lokal (putaran uji, gitignored)' };
      }),
    ),
    judgeCostUsd: judgeCost,
    judge: judgeInfo,
    notes,
  };
  writeFileSync(mdPath, renderRoundMarkdown(report));
  writeFileSync(join(BENCH_ROOT, `round-${round}.json`), renderRoundJson(report));
  const scoreBase = join(REPO_ROOT, scoreReportBase(round));
  mkdirSync(join(scoreBase, '..'), { recursive: true });
  for (const p of results) {
    writeFileSync(`${scoreBase}${p.prompt}.md`, renderScoreMarkdown(round, p));
    writeFileSync(`${scoreBase}${p.prompt}.json`, renderScoreJson(round, p));
    log(`${p.prompt}: ${p.decision.decision} (${p.decision.why})`);
  }
  log(`laporan: ${relative(REPO_ROOT, mdPath)} (${roundStatus})`);
  return outcome.exitCode;
}
