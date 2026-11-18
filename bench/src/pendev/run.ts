// Jalur run pen.dev satu-satunya (story 4), dipakai `pendev-baseline`, `pendev-smoke`, dan `round`:
// preflight → newdoc + verifikasi → claude -p (waktu terukur) → (di luar waktu) save, salin .pen, Export PNG skala 1, IHDR.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import { errorMessage } from '@lakar/schema';
import { runClaude, shellQuote, type RunClaudeResult } from '../claude-runner.js';
import { Abort, canonical, log, sleep } from '../log.js';
import { BENCH_ROOT, GOLDEN_SET_PATH, REPO_ROOT, checkProtocolC7, loadProtocol, type Protocol } from '../protocol.js';
import type { RunRecord } from '../report.js';
import { pngScaleMismatch } from '../series.js';
import { computeMetrics, validateInit, type InitRules, type RunMetrics } from '../stream-metrics.js';
import { copyExclusive } from './artifacts.js';
import { readPngSizeFile } from '../png/codec.js';
import { runNewDoc, snapshotDocuments, uriToPath, verifyNewDoc } from './newdoc.js';
import { PencilClient, loadServerConfig, type StdioServerConfig } from './pencil-client.js';

export const PENDEV_SERVER = 'pencil';
export const PENDEV_MCP_CONFIG = join(BENCH_ROOT, 'mcp/pencil.json');
export const PENDEV_ALLOWED_TOOLS = `mcp__${PENDEV_SERVER}`;
export const RUNS_ROOT = join(BENCH_ROOT, 'runs');
const PEN_DESKTOP_FILE = '/opt/pen/squashfs-root/pen.desktop';
export const PENDEV_INIT_RULES: InitRules = { server: PENDEV_SERVER, requiredTools: [`mcp__${PENDEV_SERVER}__execute`], forbiddenCwdRoot: REPO_ROOT };
const NEWDOC_READY_TRIES = 15;

/** Baca ~/.claude/settings.json (hanya baca) dan laporkan effortLevel apa adanya. */
export function userEffortLevel(): string {
  try {
    const v = JSON.parse(readFileSync(join(homedir(), '.claude/settings.json'), 'utf8'))?.effortLevel;
    return v === undefined ? '`~/.claude/settings.json` tanpa `effortLevel`' : `\`~/.claude/settings.json\` effortLevel=${JSON.stringify(v)}`;
  } catch (e) {
    return `\`~/.claude/settings.json\` tidak terbaca (${errorMessage(e)})`;
  }
}

export function penDesktopVersion(): string | undefined {
  try {
    return readFileSync(PEN_DESKTOP_FILE, 'utf8').match(/^X-AppImage-Version=(.+)$/m)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

export type Preflight = { protocol: Protocol; claudeVersion: string; server: StdioServerConfig };

/**
 * Preflight pen.dev (story 4): C7 protokol, pencil.json = ~/.claude.json, claude di PATH, pen-desktop aktif.
 * `requirePenDesktop: false` (latihan `--reuse-pendev`): pen.dev tidak dijalankan, jadi service pen-desktop tidak dicek.
 */
export function preflight(opts: { requirePenDesktop?: boolean } = {}): Preflight {
  const protocol = loadProtocol();
  if (!existsSync(GOLDEN_SET_PATH)) throw new Abort(`golden-set.md tidak ada (${GOLDEN_SET_PATH}); C7 tidak bisa dicek`);
  const c7 = checkProtocolC7(protocol, readFileSync(GOLDEN_SET_PATH, 'utf8'));
  if (!c7.ok) throw new Abort(`C7 gagal:\n  ${c7.problems.join('\n  ')}`);
  log('C7 lulus untuk semua prompt hasil render');

  const servers = Object.keys(JSON.parse(readFileSync(PENDEV_MCP_CONFIG, 'utf8'))?.mcpServers ?? {});
  if (servers.length !== 1 || servers[0] !== PENDEV_SERVER) throw new Abort(`${PENDEV_MCP_CONFIG} harus berisi tepat server [${PENDEV_SERVER}], dapat [${servers.join(', ')}]`);
  const server = loadServerConfig(PENDEV_MCP_CONFIG, PENDEV_SERVER);
  const userCfg = JSON.parse(readFileSync(join(homedir(), '.claude.json'), 'utf8'));
  const userServer = userCfg?.mcpServers?.[PENDEV_SERVER];
  if (canonical(userServer) !== canonical(server)) throw new Abort(`${PENDEV_MCP_CONFIG} berbeda dari ~/.claude.json mcpServers.${PENDEV_SERVER}`);
  log(`${relative(REPO_ROOT, PENDEV_MCP_CONFIG)} identik dengan ~/.claude.json mcpServers.${PENDEV_SERVER}`);

  let claudeVersion: string;
  try {
    const path = execFileSync('which', ['claude'], { encoding: 'utf8' }).trim();
    claudeVersion = execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim();
    log(`claude: ${path} (${claudeVersion})`);
  } catch {
    throw new Abort('claude tidak ada di PATH');
  }
  if (opts.requirePenDesktop === false) {
    log('service pen-desktop tidak dicek (pen.dev tidak dijalankan)');
    return { protocol, claudeVersion, server };
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

export type RunOneInput = {
  pre: Preflight;
  runId: string;
  prompt: string;
  promptId: string;
  attempt: number;
  outDir: string;
  prevUris: string[];
};

export function emptyRecord(i: Pick<RunOneInput, 'runId' | 'promptId' | 'attempt'>): RunRecord {
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

/**
 * Metrik transkrip → rekaman run (sama untuk pen.dev dan Lakar), lalu `metrics.json` (metrik + argv + env
 * yang dibuang) dan satu baris log ringkas.
 */
export function applyMetrics(rec: RunRecord, m: RunMetrics, run: RunClaudeResult, outDir: string, runId: string): void {
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
  writeFileSync(join(outDir, 'metrics.json'), `${JSON.stringify({ ...m, argv: shellQuote(['claude', ...run.argv]), scrubbedEnv: run.scrubbedEnv }, null, 1)}\n`);
  log(`${runId}: ${m.status}${m.reason ? ` (${m.reason})` : ''}, wall ${m.wallMs ?? '–'} ms, $${m.totalCostUsd ?? '–'}, ${m.toolCalls} tool call`);
}

/** Satu run: newdoc + verifikasi → claude -p → (di luar waktu) save, salin .pen, Export PNG, cek IHDR. */
export async function runOne(i: RunOneInput, serverVersion: { v?: string }): Promise<RunRecord> {
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
      if (k) await sleep(1_000);
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
    rec.reason = `newdoc: verifikasi gagal setelah ${NEWDOC_READY_TRIES} percobaan: ${errorMessage(lastErr)}`;
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
    mcpConfig: PENDEV_MCP_CONFIG,
    allowedTools: PENDEV_ALLOWED_TOOLS,
    config: i.pre.protocol.config,
    outDir: i.outDir,
    validateInit: (init) => validateInit(init, PENDEV_INIT_RULES),
    forbiddenCwdRoot: REPO_ROOT,
  });
  const m = computeMetrics(run.lines, PENDEV_INIT_RULES, { exitCode: run.exitCode, timedOut: run.timedOut });
  applyMetrics(rec, m, run, i.outDir, i.runId);
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
    rec.reason = `${rec.reason ? `${rec.reason}; ` : ''}post: ${errorMessage(e)}`;
  } finally {
    await post?.close().catch((e: unknown) => log(`${i.runId}: post close gagal (diabaikan): ${errorMessage(e)}`));
  }
  return rec;
}
