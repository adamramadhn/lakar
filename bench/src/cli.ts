#!/opt/node-26/bin/node
// CLI bench. `pendev-baseline [--prompts X,Y] [--dry-run]`: preflight → seri berselang (mis. C1 D1 E1 C2 …) hanya untuk prompt
// terpilih (default: prompt tanpa baseline sah) → bench/baseline-pendev-<IDS>-<tanggal>.{md,json} (eksklusif, dengan promptHashes).
// `pendev-smoke`: satu run uji murah (prompt netral pendek) untuk membuktikan init memuat tool mcp__pencil__*; tidak masuk baseline.
// `round --round <uji-k|n> [--dry-run] [--resume]`: putaran Lakar vs pen.dev + juri buta (lihat round/main.ts).
// `rejudge --from <uji-k|n> --label <slug> [--resume] [--dry-run]`: nilai ulang strip putaran yang ada, tanpa agen (rejudge.ts).
// `rubric-snapshot [--version <v>]`: snapshot rubrik juri tracked di bench/rubric/ (judge/rubric.ts).
// `practice [--series practice|effects|polish] --iter <k> [--only P1,P3] [--reuse-pendev <j>] [--resume] [--dry-run]`: latihan skill pada prompt latihan beku
// (practice/main.ts; seri `effects` = P5/P6 efek visual, story 22); bukan gerbang G0.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { errorMessage } from '@lakar/schema';
import { buildArgs, buildEnv, shellQuote } from './claude-runner.js';
import { Abort, log, stamp } from './log.js';
import { baselineOutputPaths, existingOutputs, baselineProblems, loadBaselines, parsePendevBaselineArgs, promptsWithoutValidBaseline } from './baselines.js';
import { BENCH_ROOT, GOLDEN_SET_PATH, loadProtocol, promptHashes, REPO_ROOT, renderPrompt, type PromptId } from './protocol.js';
import { renderJson, renderMarkdown, summarizeRuns, type BaselineReport, type RunRecord } from './report.js';
import { isFatal, needsRun, seriesOutcome } from './series.js';
import {
  PENDEV_ALLOWED_TOOLS as ALLOWED_TOOLS,
  PENDEV_MCP_CONFIG as MCP_CONFIG,
  RUNS_ROOT,
  emptyRecord,
  penDesktopVersion,
  preflight,
  runOne,
  userEffortLevel,
  type Preflight,
} from './pendev/run.js';
import { prepareJudgeTexts, roundMain } from './round/main.js';
import { planSnapshot, writeSnapshot } from './judge/rubric.js';
import { DESIGN_MD_PATH } from './judge/prompt.js';
import { rejudgeMain } from './rejudge.js';
import { practiceMain } from './practice/main.js';

const SMOKE_PROMPT = 'Panggil tool get_app_state satu kali, lalu jawab satu kata: selesai.';

const NOTES = [
  'Waktu gerbang (AD-13): `wall` = cap waktu monotonic saat baris event `result` diterima − cap waktu event stdout pertama. Setiap baris diberi cap waktu saat tiba; transkrip mentah byte-identik di `stream.jsonl`, cap waktu di `timing.json`.',
  'Offset `tool_use` pertama → `tool_result` terakhir dan spawn → event pertama hanya diagnostik, bukan waktu gerbang.',
  'Run gagal (is_error, subtype ≠ success, tanpa result, timeout, exit ≠ 0, 0 frame) tidak masuk median. Run tidak dipilih-pilih (C8): urutan berselang hanya prompt yang diukur (mis. C1 D1 E1 C2 D2 E2 …), maksimal percobaan per prompt dari protocol.json.',
  '`save`, salinan `.pen` (COPYFILE_EXCL), daftar frame, dan Export PNG dilakukan harness setelah `result`, di luar waktu. pen.dev menahan dokumen di app, sedangkan Lakar menulis file di setiap execute; bias ini membuat baseline pen.dev sedikit lebih cepat, jadi konservatif bagi gerbang 1,5×.',
  'Export memakai `{scale:1}` (default pen.dev = 2, lihat `ExportOptions.scale` di execute.md dari read_skill). Ukuran frame diambil dari `ctx.bounds` karena `height` frame bisa null (fit content).',
  'Setiap run memakai dokumen baru (`pen-newdoc.sh`) yang diverifikasi klien MCP harness: URI sama dengan get_app_state, berbeda dari run sebelumnya, tidak ada sebelum newdoc, bukan dokumen golden, 0 node top-level.',
  'cwd claude = direktori tmp kosong baru di luar repo (dihapus setelah run). Env proses claude: variabel berawalan CLAUDE*/AI_AGENT* dari sesi pemanggil dibuang (mis. CLAUDE_EFFORT), lalu `ENABLE_TOOL_SEARCH=false` ditambahkan agar tool MCP dimuat langsung walau `--tools ""` (simetris untuk semua alat).',
  'Event init divalidasi per run: hanya server MCP `pencil` (connected), semua tool berawalan `mcp__pencil__`, `mcp__pencil__execute` ada, cwd di luar repo. Pelanggaran = `invalid`, seri berhenti.',
];

async function series(pre: Preflight, ids: readonly PromptId[], out: { md: string; json: string }): Promise<number> {
  const { protocol } = pre;
  // Seri hanya prompt terpilih: urutan berselang, kelengkapan (`seriesOutcome`) dan laporan memakai `promptIds` terpilih.
  const cfg = { ...protocol.config, promptIds: [...ids] };
  const seriesId = stamp();
  const dir = join(RUNS_ROOT, 'pendev');
  mkdirSync(dir, { recursive: true });
  const runs: RunRecord[] = [];
  const prevUris: string[] = [];
  const serverVersion: { v?: string } = {};
  const attempts = (p: string) => runs.filter((r) => r.prompt === p).length;
  const need = (p: string) => needsRun(runs, p, cfg);
  let fatal: string | undefined;

  outer: while (cfg.promptIds.some(need)) {
    for (const p of cfg.promptIds) {
      if (!need(p)) continue;
      const attempt = attempts(p) + 1;
      const runId = `${seriesId}-${p}${attempt}`;
      let rec: RunRecord;
      try {
        rec = await runOne({ pre, runId, prompt: renderPrompt(p as PromptId, protocol), promptId: p, attempt, outDir: join(dir, runId), prevUris }, serverVersion);
      } catch (e) {
        mkdirSync(join(dir, runId), { recursive: true });
        rec = { ...emptyRecord({ runId, promptId: p, attempt }), reason: `harness: ${errorMessage(e)}` };
      }
      runs.push(rec);
      writeFileSync(join(dir, runId, 'run.json'), `${JSON.stringify(rec, null, 1)}\n`);
      if (isFatal(rec)) {
        fatal = `${runId} ${rec.status}: ${rec.reason}`;
        break outer;
      }
    }
  }

  const outcome = seriesOutcome(runs, cfg, fatal);
  const ok = runs.filter((r) => r.status === 'success');
  const report: BaselineReport = {
    tool: 'pen.dev',
    date: new Date().toISOString(),
    status: outcome.status,
    protocolHash: protocol.hash,
    promptHashes: promptHashes(protocol, ids),
    model: cfg.model,
    modelUsageKeys: [...new Set(ok.flatMap((r) => r.modelUsageKeys))].sort(),
    claudeVersion: [...new Set(runs.flatMap((r) => (r.claudeCodeVersion ? [r.claudeCodeVersion] : [])))].join(', ') || pre.claudeVersion,
    toolVersions: { 'pen.dev desktop (X-AppImage-Version)': penDesktopVersion(), 'pen.dev MCP server (initialize serverInfo)': serverVersion.v },
    effort: `default (tanpa \`--effort\`; ${userEffortLevel()}; CLAUDE_EFFORT pemanggil dibuang)`,
    wrapper: protocol.wrapper,
    prompts: Object.fromEntries(cfg.promptIds.map((p) => [p, protocol.prompts[p]])),
    argv: shellQuote(['claude', ...buildArgs({ prompt: '<prompt hasil render>', config: cfg, mcpConfig: relative(REPO_ROOT, MCP_CONFIG), allowedTools: ALLOWED_TOOLS })]),
    env: { set: cfg.env, scrubbed: buildEnv(process.env, cfg).scrubbed },
    runsPerPrompt: cfg.runsPerPrompt,
    runs,
    notes: [...NOTES, ...(fatal ? [`Seri dihentikan: ${fatal}`] : [])],
  };
  // Eksklusif: baseline lama (termasuk bench/baseline-pendev.{md,json} G0) tidak pernah ditimpa.
  writeFileSync(out.md, renderMarkdown(report), { flag: 'wx' });
  writeFileSync(out.json, renderJson(report), { flag: 'wx' });
  for (const s of summarizeRuns(runs, cfg.promptIds)) log(`${s.prompt}: ${s.successes}/${s.attempts} sukses, median ${s.wallMs.median ?? '–'} ms, $${s.costUsd.median ?? '–'}`);
  log(`laporan: ${relative(REPO_ROOT, out.md)} (${report.status})`);
  return outcome.exitCode;
}

async function smoke(pre: Preflight): Promise<number> {
  const dir = join(RUNS_ROOT, 'pendev-smoke');
  mkdirSync(dir, { recursive: true });
  const runId = stamp();
  const rec = await runOne({ pre, runId, prompt: SMOKE_PROMPT, promptId: 'smoke', attempt: 1, outDir: join(dir, runId), prevUris: [] }, {});
  writeFileSync(join(dir, runId, 'run.json'), `${JSON.stringify(rec, null, 1)}\n`);
  const mf = join(dir, runId, 'metrics.json');
  const m = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : {};
  console.log(JSON.stringify({ runId, status: rec.status, reason: rec.reason, costUsd: rec.costUsd, wallMs: rec.wallMs, tools: m.init?.tools, mcpServers: m.init?.mcpServers, model: m.init?.model }, null, 1));
  // 0 frame wajar untuk smoke (prompt tidak menggambar); yang dicek adalah init.
  return rec.status === 'invalid' || rec.status === 'aborted' || m.initProblems?.length ? 1 : 0;
}

const USAGE =
  'pakai: node bench/dist/cli.js pendev-baseline [--prompts X,Y] [--dry-run] | pendev-smoke | round --round <uji-k|n> [--dry-run] [--resume] | rejudge --from <uji-k|n> --label <slug> [--resume] [--dry-run] | rubric-snapshot [--version <v>] | practice [--series practice|effects|polish] --iter <k> [--only P1,P3] [--reuse-pendev <j>] [--resume] [--dry-run]';

/** `rubric-snapshot [--version <v>]`: tulis `bench/rubric/v<ver>/` (eksklusif) dan perbarui `bench/rubric/rubric.json`. */
function rubricSnapshot(args: string[]): number {
  let version: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--') continue;
    if (a === '--version') version = args[++i];
    else if (a.startsWith('--version=')) version = a.slice('--version='.length);
    else {
      console.error(`rubric-snapshot: argumen tidak dikenal: ${a}\n${USAGE}`);
      return 64;
    }
  }
  const protocol = loadProtocol();
  const texts = prepareJudgeTexts(protocol);
  const plan = planSnapshot({
    designMd: readFileSync(DESIGN_MD_PATH, 'utf8'),
    goldenMd: readFileSync(GOLDEN_SET_PATH, 'utf8'),
    judgeTexts: Object.fromEntries(Object.entries(texts).map(([id, t]) => [id, t.text])),
    ...(version !== undefined ? { version } : {}),
    today: new Date().toISOString().slice(0, 10),
  });
  const how = writeSnapshot(plan);
  log(`rubrik v${plan.version}: ${relative(REPO_ROOT, plan.dir)} ${how}; bench/rubric/rubric.json → v${plan.version}`);
  for (const [id, s] of Object.entries(plan.json.judgeTextSha256)) console.log(`sha256 teks juri ${id}: ${s}`);
  return 0;
}

async function main(args: string[]): Promise<number> {
  const [cmd, ...rest] = args;
  if (cmd === 'round') return roundMain(rest);
  if (cmd === 'rubric-snapshot') return rubricSnapshot(rest);
  if (cmd === 'rejudge') return rejudgeMain(rest);
  if (cmd === 'practice') return practiceMain(rest);
  if (cmd !== 'pendev-baseline' && cmd !== 'pendev-smoke') {
    console.error(USAGE);
    return 64;
  }
  if (cmd === 'pendev-baseline') return pendevBaseline(rest);
  const pre = preflight();
  const { protocol } = pre;
  console.log(`protocolHash ${protocol.hash}`);
  for (const p of protocol.config.promptIds) {
    const rendered = renderPrompt(p, protocol);
    const argv = ['claude', ...buildArgs({ prompt: rendered, config: protocol.config, mcpConfig: MCP_CONFIG, allowedTools: ALLOWED_TOOLS })];
    console.log(`\n=== ${p}: argv ===\n${shellQuote(argv)}\n=== ${p}: prompt hasil render ===\n${rendered}`);
  }
  console.log(`\nenv tambahan: ${JSON.stringify(protocol.config.env)}; dibuang: ${buildEnv(process.env, protocol.config).scrubbed.join(', ') || '-'}`);
  if (rest.includes('--dry-run')) return 0;
  return smoke(pre);
}

/**
 * `pendev-baseline [--prompts X,Y] [--dry-run]`: baseline pen.dev per prompt. Default = prompt protokol tanpa baseline sah
 * (belum diukur, hash prompt/model/claude/pen.dev ≠ baseline). Keluaran eksklusif `bench/baseline-pendev-<IDS>-<tanggal>.{md,json}`
 * (sudah ada → exit 64, juga saat dry-run); `bench/baseline-pendev.{md,json}` G0 tidak pernah ditimpa.
 */
async function pendevBaseline(args: string[]): Promise<number> {
  const parsed = parsePendevBaselineArgs(args, loadProtocol().config.promptIds);
  if (!parsed.ok) {
    console.error(`pendev-baseline: ${parsed.error}\n${USAGE}`);
    return 64;
  }
  const pre = preflight();
  const cfg = pre.protocol.config;
  const hashes = promptHashes(pre.protocol);
  const index = loadBaselines();
  const current = { promptHashes: hashes, model: cfg.model, claude: pre.claudeVersion, pendevDesktop: penDesktopVersion() ?? null };
  const ids = (parsed.value.prompts ?? promptsWithoutValidBaseline(index, current, cfg.promptIds)) as PromptId[];
  console.log(`protocolHash ${pre.protocol.hash} (info; penjaga baseline = hash per prompt)`);
  for (const p of cfg.promptIds) {
    const b = index.byPrompt[p];
    const problems = baselineProblems({ ...index, fileProblems: [] }, current, [p]);
    console.log(`hash prompt ${p} ${hashes[p]}: ${b ? `baseline ${b.source} (${b.date})` : 'tanpa baseline'}; ${problems.length ? `belum sah (${problems.join('; ')})` : 'sah'}${ids.includes(p) ? ' → diukur' : ''}`);
  }
  for (const b of index.superseded) console.log(`baseline tergantikan: ${b.prompt} di ${b.source} (${b.date})`);
  for (const f of index.fileProblems) console.log(`MASALAH file baseline: ${f}`);
  for (const x of index.incomplete) console.log(`baseline tidak lengkap (tidak dipakai): ${x}`);
  if (!ids.length) {
    console.log('semua prompt sudah punya baseline sah; tidak ada yang diukur (pakai --prompts untuk memilih)');
    return 0;
  }
  const out = baselineOutputPaths(BENCH_ROOT, ids, new Date().toISOString().slice(0, 10));
  const exists = existingOutputs(out, existsSync);
  if (exists.length) {
    console.error(
      `pendev-baseline: keluaran sudah ada (${exists.map((f) => relative(REPO_ROOT, f)).join(', ')}); tidak ditimpa. Mengukur ulang set prompt yang sama pada tanggal yang sama butuh file itu (mis. seri tidak lengkap) dipindahkan secara manual dulu; harness tidak menghapusnya.`,
    );
    return 64;
  }
  console.log(
    `\nrencana: prompt ${ids.join(', ')}; seri berselang ${ids.map((p) => `${p}1`).join(' ')} ${ids.map((p) => `${p}2`).join(' ')} …, ${cfg.runsPerPrompt} sukses per prompt (maks ${cfg.maxAttemptsPerPrompt} percobaan); keluaran ${relative(REPO_ROOT, out.md)} + .json${parsed.value.dryRun ? ' (dry-run: tanpa spawn)' : ''}`,
  );
  for (const p of ids) {
    const rendered = renderPrompt(p, pre.protocol);
    const argv = ['claude', ...buildArgs({ prompt: rendered, config: cfg, mcpConfig: MCP_CONFIG, allowedTools: ALLOWED_TOOLS })];
    console.log(`\n=== ${p}: hash prompt ${hashes[p]} ===\n=== ${p}: argv ===\n${shellQuote(argv)}\n=== ${p}: prompt hasil render ===\n${rendered}`);
  }
  console.log(`\nenv tambahan: ${JSON.stringify(cfg.env)}; dibuang: ${buildEnv(process.env, cfg).scrubbed.join(', ') || '-'}`);
  if (parsed.value.dryRun) return 0;
  return series(pre, ids, out);
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (e) {
  if (e instanceof Abort) {
    log(`abort: ${e.message}`);
    process.exitCode = 1;
  } else throw e;
}
