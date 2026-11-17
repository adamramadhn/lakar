#!/opt/node-26/bin/node
// CLI bench. `pendev-baseline [--dry-run]`: preflight → seri berselang A1 B1 A2 B2 … → bench/baseline-pendev.{md,json}.
// `pendev-smoke`: satu run uji murah (prompt netral pendek) untuk membuktikan init memuat tool mcp__pencil__*; tidak masuk baseline.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import { buildArgs, buildEnv, runClaude, shellQuote } from './claude-runner.js';
import { BENCH_ROOT, GOLDEN_SET_PATH, REPO_ROOT, checkProtocolC7, loadProtocol, renderPrompt, type PromptId, type Protocol } from './protocol.js';
import { renderJson, renderMarkdown, summarizeRuns, type BaselineReport, type RunRecord } from './report.js';
import { isFatal, needsRun, pngScaleMismatch, seriesOutcome } from './series.js';
import { computeMetrics, validateInit, type InitRules } from './stream-metrics.js';
import { copyExclusive, readPngSizeFile } from './pendev/artifacts.js';
import { runNewDoc, snapshotDocuments, uriToPath, verifyNewDoc } from './pendev/newdoc.js';
import { PencilClient, loadServerConfig, type StdioServerConfig } from './pendev/pencil-client.js';

const SERVER = 'pencil';
const MCP_CONFIG = join(BENCH_ROOT, 'mcp/pencil.json');
const ALLOWED_TOOLS = `mcp__${SERVER}`;
const RUNS_ROOT = join(BENCH_ROOT, 'runs');
const PEN_DESKTOP_FILE = '/opt/pen/squashfs-root/pen.desktop';
const INIT_RULES: InitRules = { server: SERVER, requiredTools: [`mcp__${SERVER}__execute`], forbiddenCwdRoot: REPO_ROOT };
const NEWDOC_READY_TRIES = 15;
const SMOKE_PROMPT = 'Panggil tool get_app_state satu kali, lalu jawab satu kata: selesai.';

class Abort extends Error {}

const log = (m: string) => process.stderr.write(`bench: ${m}\n`);

function canonical(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonical).join(',')}]`;
  if (x && typeof x === 'object')
    return `{${Object.keys(x)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((x as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(x);
}

/** Baca ~/.claude/settings.json (hanya baca) dan laporkan effortLevel apa adanya. */
function userEffortLevel(): string {
  try {
    const v = JSON.parse(readFileSync(join(homedir(), '.claude/settings.json'), 'utf8'))?.effortLevel;
    return v === undefined ? '`~/.claude/settings.json` tanpa `effortLevel`' : `\`~/.claude/settings.json\` effortLevel=${JSON.stringify(v)}`;
  } catch (e) {
    return `\`~/.claude/settings.json\` tidak terbaca (${(e as Error).message})`;
  }
}

function penDesktopVersion(): string | undefined {
  try {
    return readFileSync(PEN_DESKTOP_FILE, 'utf8').match(/^X-AppImage-Version=(.+)$/m)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

type Preflight = { protocol: Protocol; claudeVersion: string; server: StdioServerConfig };

function preflight(): Preflight {
  const protocol = loadProtocol();
  if (!existsSync(GOLDEN_SET_PATH)) throw new Abort(`golden-set.md tidak ada (${GOLDEN_SET_PATH}); C7 tidak bisa dicek`);
  const c7 = checkProtocolC7(protocol, readFileSync(GOLDEN_SET_PATH, 'utf8'));
  if (!c7.ok) throw new Abort(`C7 gagal:\n  ${c7.problems.join('\n  ')}`);
  log('C7 lulus untuk semua prompt hasil render');

  const servers = Object.keys(JSON.parse(readFileSync(MCP_CONFIG, 'utf8'))?.mcpServers ?? {});
  if (servers.length !== 1 || servers[0] !== SERVER) throw new Abort(`${MCP_CONFIG} harus berisi tepat server [${SERVER}], dapat [${servers.join(', ')}]`);
  const server = loadServerConfig(MCP_CONFIG, SERVER);
  const userCfg = JSON.parse(readFileSync(join(homedir(), '.claude.json'), 'utf8'));
  const userServer = userCfg?.mcpServers?.[SERVER];
  if (canonical(userServer) !== canonical(server)) throw new Abort(`${MCP_CONFIG} berbeda dari ~/.claude.json mcpServers.${SERVER}`);
  log(`${relative(REPO_ROOT, MCP_CONFIG)} identik dengan ~/.claude.json mcpServers.${SERVER}`);

  let claudeVersion: string;
  try {
    const path = execFileSync('which', ['claude'], { encoding: 'utf8' }).trim();
    claudeVersion = execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim();
    log(`claude: ${path} (${claudeVersion})`);
  } catch {
    throw new Abort('claude tidak ada di PATH');
  }
  let active = '';
  try {
    active = execFileSync('systemctl', ['is-active', 'pen-desktop'], { encoding: 'utf8' }).trim();
  } catch (e) {
    active = String((e as { stdout?: string }).stdout ?? '').trim();
  }
  if (active !== 'active') throw new Abort(`service pen-desktop tidak aktif (${active || '?'})`);
  log('service pen-desktop aktif');
  return { protocol, claudeVersion, server };
}

type RunOneInput = {
  pre: Preflight;
  runId: string;
  prompt: string;
  promptId: string;
  attempt: number;
  outDir: string;
  prevUris: string[];
};

function emptyRecord(i: RunOneInput): RunRecord {
  return {
    runId: i.runId,
    prompt: i.promptId,
    attempt: i.attempt,
    status: 'aborted',
    reason: undefined,
    uri: undefined,
    uriSource: undefined,
    wallMs: undefined,
    durationMs: undefined,
    durationApiMs: undefined,
    costUsd: undefined,
    numTurns: undefined,
    toolCalls: undefined,
    firstToolUseMs: undefined,
    lastToolResultMs: undefined,
    spawnToFirstEventMs: undefined,
    frames: [],
    transcriptBytes: undefined,
    penPath: undefined,
    pngScaleMismatch: false,
    model: undefined,
    modelUsageKeys: [],
    claudeCodeVersion: undefined,
    startedAt: undefined,
  };
}

/** Satu run: newdoc + verifikasi → claude -p → (di luar waktu) save, salin .pen, Export PNG, cek IHDR. */
async function runOne(i: RunOneInput, serverVersion: { v?: string }): Promise<RunRecord> {
  const rec = emptyRecord(i);
  mkdirSync(i.outDir, { recursive: false });

  // 1–3. dokumen baru + verifikasi oleh klien harness
  const snapshot = snapshotDocuments();
  const nd = await runNewDoc();
  writeFileSync(join(i.outDir, 'newdoc.txt'), `${nd.stdout}${nd.stderr ? `\n[stderr]\n${nd.stderr}` : ''}`);
  // Dokumen baru kadang belum siap tepat setelah ctrl+shift+n ("referencing the wrong .pen file"): ulangi singkat.
  let v: ReturnType<typeof verifyNewDoc> | undefined;
  let lastErr: unknown;
  const pre = await PencilClient.connect(i.pre.server);
  try {
    serverVersion.v ??= pre.serverVersion ? `${pre.serverVersion.name} ${pre.serverVersion.version}` : undefined;
    for (let k = 0; k < NEWDOC_READY_TRIES && !(v && v.problems.length === 0); k++) {
      if (k) await new Promise((r) => setTimeout(r, 1_000));
      try {
        // get_app_state bisa masih melaporkan dokumen lama (ctrl+shift+n asinkron): ulangi juga saat ada masalah.
        const st = await pre.appState();
        const candidate = nd.uri ?? st.uri;
        const topNodes = candidate && st.uri === candidate ? await pre.listTopNodes(candidate) : [];
        v = verifyNewDoc({ uri: nd.uri, appStateUri: st.uri, prevUris: i.prevUris, snapshot, postSnapshot: snapshotDocuments(), topNodes });
      } catch (e) {
        lastErr = e;
      }
    }
  } finally {
    await pre.close(); // 4. klien harness ditutup sebelum claude
  }
  if (!v) {
    rec.reason = `newdoc: verifikasi gagal setelah ${NEWDOC_READY_TRIES} percobaan: ${(lastErr as Error)?.message}`;
    return rec;
  }
  rec.uri = v.uri;
  rec.uriSource = v.source;
  if (v.problems.length) {
    rec.reason = `newdoc: ${v.problems.join('; ')}`;
    return rec;
  }
  const uri = v.uri!;
  i.prevUris.push(uri);
  log(`${i.runId}: dokumen baru ${uri} (URI dari ${v.source})`);

  // claude -p (waktu terukur)
  const run = await runClaude({
    prompt: i.prompt,
    mcpConfig: MCP_CONFIG,
    allowedTools: ALLOWED_TOOLS,
    config: i.pre.protocol.config,
    outDir: i.outDir,
    validateInit: (init) => validateInit(init, INIT_RULES),
    forbiddenCwdRoot: REPO_ROOT,
  });
  const m = computeMetrics(run.lines, INIT_RULES, { exitCode: run.exitCode, timedOut: run.timedOut });
  Object.assign(rec, {
    status: m.status,
    reason: m.reason,
    wallMs: m.wallMs,
    durationMs: m.durationMs,
    durationApiMs: m.durationApiMs,
    costUsd: m.totalCostUsd,
    numTurns: m.numTurns,
    toolCalls: m.toolCalls,
    firstToolUseMs: m.firstToolUseMs,
    lastToolResultMs: m.lastToolResultMs,
    spawnToFirstEventMs: m.spawnToFirstEventMs,
    transcriptBytes: run.stdoutBytes,
    model: m.init?.model,
    modelUsageKeys: m.modelUsageKeys,
    claudeCodeVersion: m.init?.claudeCodeVersion,
    startedAt: run.startedAt,
  } satisfies Partial<RunRecord>);
  writeFileSync(join(i.outDir, 'metrics.json'), `${JSON.stringify({ ...m, argv: shellQuote(['claude', ...run.argv]), scrubbedEnv: run.scrubbedEnv }, null, 1)}\n`);
  log(`${i.runId}: ${m.status}${m.reason ? ` (${m.reason})` : ''}, wall ${m.wallMs ?? '–'} ms, $${m.totalCostUsd ?? '–'}, ${m.toolCalls} tool call`);
  if (m.status === 'invalid') return rec;

  // Di luar waktu: save, salin .pen, frame top-level, Export PNG skala 1, IHDR.
  let post: PencilClient | undefined;
  try {
    post = await PencilClient.connect(i.pre.server);
    await post.save(uri);
    const src = uriToPath(uri)!;
    const dest = join(i.outDir, 'design.pen');
    copyExclusive(src, dest, RUNS_ROOT);
    rec.penPath = relative(REPO_ROOT, dest);
    const top = await post.listTopNodes(uri);
    const frames = top.filter((n) => n.type === 'frame');
    rec.frames = frames.map((f) => ({ id: f.id, name: f.name, width: f.width, height: f.height }));
    if (frames.length) {
      const pngDir = join(i.outDir, 'png');
      mkdirSync(pngDir);
      const exportText = await post.exportPng(uri, frames.map((f) => f.id), pngDir);
      writeFileSync(join(i.outDir, 'export.txt'), `${exportText}\n`);
      for (const f of rec.frames) {
        const p = join(pngDir, `${f.id}.png`);
        const sz = existsSync(p) ? readPngSizeFile(p) : undefined;
        if (sz) Object.assign(f, { png: relative(REPO_ROOT, p), pngWidth: sz.width, pngHeight: sz.height });
        if (pngScaleMismatch(f, sz)) rec.pngScaleMismatch = true;
      }
    }
    if (rec.status === 'success' && frames.length === 0) {
      rec.status = 'failed';
      rec.reason = 'no_frames';
    }
  } catch (e) {
    if (rec.status === 'success') rec.status = 'failed';
    rec.reason = `${rec.reason ? `${rec.reason}; ` : ''}post: ${(e as Error).message}`;
  } finally {
    await post?.close().catch((e: Error) => log(`${i.runId}: post close gagal (diabaikan): ${e.message}`));
  }
  return rec;
}

function stamp(d = new Date()): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

const NOTES = [
  'Waktu gerbang (AD-13): `wall` = cap waktu monotonic saat baris event `result` diterima − cap waktu event stdout pertama. Setiap baris diberi cap waktu saat tiba; transkrip mentah byte-identik di `stream.jsonl`, cap waktu di `timing.json`.',
  'Offset `tool_use` pertama → `tool_result` terakhir dan spawn → event pertama hanya diagnostik, bukan waktu gerbang.',
  'Run gagal (is_error, subtype ≠ success, tanpa result, timeout, exit ≠ 0, 0 frame) tidak masuk median. Run tidak dipilih-pilih (C8): urutan berselang A1 B1 A2 B2 …, maksimal percobaan per prompt dari protocol.json.',
  '`save`, salinan `.pen` (COPYFILE_EXCL), daftar frame, dan Export PNG dilakukan harness setelah `result`, di luar waktu. pen.dev menahan dokumen di app, sedangkan Lakar menulis file di setiap execute; bias ini membuat baseline pen.dev sedikit lebih cepat, jadi konservatif bagi gerbang 1,5×.',
  'Export memakai `{scale:1}` (default pen.dev = 2, lihat `ExportOptions.scale` di execute.md dari read_skill). Ukuran frame diambil dari `ctx.bounds` karena `height` frame bisa null (fit content).',
  'Setiap run memakai dokumen baru (`pen-newdoc.sh`) yang diverifikasi klien MCP harness: URI sama dengan get_app_state, berbeda dari run sebelumnya, tidak ada sebelum newdoc, bukan dokumen golden, 0 node top-level.',
  'cwd claude = direktori tmp kosong baru di luar repo (dihapus setelah run). Env proses claude: variabel berawalan CLAUDE*/AI_AGENT* dari sesi pemanggil dibuang (mis. CLAUDE_EFFORT), lalu `ENABLE_TOOL_SEARCH=false` ditambahkan agar tool MCP dimuat langsung walau `--tools ""` (simetris untuk semua alat).',
  'Event init divalidasi per run: hanya server MCP `pencil` (connected), semua tool berawalan `mcp__pencil__`, `mcp__pencil__execute` ada, cwd di luar repo. Pelanggaran = `invalid`, seri berhenti.',
];

async function series(pre: Preflight): Promise<number> {
  const { protocol } = pre;
  const cfg = protocol.config;
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
        rec = { ...emptyRecord({ pre, runId, prompt: '', promptId: p, attempt, outDir: '', prevUris }), reason: `harness: ${(e as Error).message}` };
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
  writeFileSync(join(BENCH_ROOT, 'baseline-pendev.md'), renderMarkdown(report));
  writeFileSync(join(BENCH_ROOT, 'baseline-pendev.json'), renderJson(report));
  for (const s of summarizeRuns(runs, cfg.promptIds)) log(`${s.prompt}: ${s.successes}/${s.attempts} sukses, median ${s.wallMs.median ?? '–'} ms, $${s.costUsd.median ?? '–'}`);
  log(`laporan: bench/baseline-pendev.md (${report.status})`);
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

async function main(args: string[]): Promise<number> {
  const [cmd, ...rest] = args;
  if (cmd !== 'pendev-baseline' && cmd !== 'pendev-smoke') {
    console.error('pakai: node bench/dist/cli.js pendev-baseline [--dry-run] | pendev-smoke');
    return 64;
  }
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
  return cmd === 'pendev-smoke' ? smoke(pre) : series(pre);
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (e) {
  if (e instanceof Abort) {
    log(`abort: ${e.message}`);
    process.exitCode = 1;
  } else throw e;
}
