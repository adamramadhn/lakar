// Adaptor Lakar untuk putaran: preflight lakard, snapshot dokumen, claude -p (waktu terukur, argumen sama dengan pen.dev),
// lalu di luar waktu: slug dari transkrip, sesi HTTP harness → open → boards → layout-check → export skala 1 per board.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { LAKAR_VERSION, SCHEMA_VERSION, errorMessage } from '@lakar/schema';
import { runClaude } from '../claude-runner.js';
import { copyExclusive } from '../pendev/artifacts.js';
import { readPngSizeFile } from '../png/codec.js';
import { applyMetrics, emptyRecord, RUNS_ROOT } from '../pendev/run.js';
import { REPO_ROOT, type ProtocolConfig } from '../protocol.js';
import type { RunRecord } from '../report.js';
import { pngScaleMismatch } from '../series.js';
import { computeMetrics, validateInit, type InitRules, type TimedLine } from '../stream-metrics.js';
import { systemdShow, type SystemdInfo } from '../sys.js';
import { toolEvents } from '../tool-events.js';
import { LakardClient, type LakardBoard, type LakardStatus, type LayoutCheck } from './lakard-client.js';

export const LAKAR_SERVER = 'lakar';
export const LAKAR_MCP_CONFIG = join(REPO_ROOT, '.mcp.json');
export const LAKAR_ALLOWED_TOOLS = `mcp__${LAKAR_SERVER}`;
export const LAKAR_INIT_RULES: InitRules = { server: LAKAR_SERVER, requiredTools: [`mcp__${LAKAR_SERVER}__execute`], forbiddenCwdRoot: REPO_ROOT };
export const LAKARD_UNIT = 'lakard';

/** Masalah preflight lakard (murni): versi = LAKAR_VERSION, pool.ready ≥ 1, `.mcp.json` tepat [lakar]. */
export function lakarPreflightProblems(status: Pick<LakardStatus, 'version' | 'pool'> | undefined, mcpServers: readonly string[]): string[] {
  const out: string[] = [];
  if (!status) out.push('GET /status gagal');
  else {
    if (status.version !== LAKAR_VERSION) out.push(`lakard version ${status.version} ≠ LAKAR_VERSION ${LAKAR_VERSION}`);
    if (!status.pool || !(status.pool.ready >= 1)) out.push(`pool render belum siap (ready=${status.pool?.ready ?? '?'})`);
  }
  if (mcpServers.length !== 1 || mcpServers[0] !== LAKAR_SERVER) out.push(`.mcp.json harus berisi tepat server [${LAKAR_SERVER}], dapat [${mcpServers.join(', ')}]`);
  return out;
}

export function mcpServerNames(path = LAKAR_MCP_CONFIG): string[] {
  return Object.keys(JSON.parse(readFileSync(path, 'utf8'))?.mcpServers ?? {});
}

export type DocEntry = { name: string; size: number; mtimeMs: number };

/** Snapshot `<docsDir>/*.lakar.json` (nama, ukuran, mtime). */
export function snapshotLakarDocs(docsDir: string): DocEntry[] {
  if (!existsSync(docsDir)) return [];
  return readdirSync(docsDir)
    .filter((f) => f.endsWith('.lakar.json'))
    .sort()
    .map((name) => {
      const s = statSync(join(docsDir, name));
      return { name, size: s.size, mtimeMs: s.mtimeMs };
    });
}

export type DaemonState = { pid: number | undefined; startedAt: string | undefined; recreated: number | undefined; systemd: SystemdInfo };

function daemonState(status: LakardStatus | undefined, systemd: SystemdInfo): DaemonState {
  return { pid: status?.pid, startedAt: status?.startedAt, recreated: status?.pool?.recreated, systemd };
}

/**
 * Slug dokumen hasil agen (murni): `open_doc` terakhir (tool_result sukses) yang diikuti `execute` sukses.
 * `opened` = semua slug yang pernah dibuka agen (urut).
 */
export function findCommittedSlug(lines: readonly TimedLine[], server = LAKAR_SERVER): { slug: string | undefined; opened: string[] } {
  const opened: string[] = [];
  let current: string | undefined;
  let committed: string | undefined;
  for (const ev of toolEvents(lines)) {
    if (ev.kind !== 'result') continue;
    const u = ev.use;
    if (!u || ev.block.is_error) continue;
    if (u.name === `mcp__${server}__open_doc` && typeof u.input?.slug === 'string') {
      current = u.input.slug;
      opened.push(u.input.slug);
    } else if (u.name === `mcp__${server}__execute` && current) committed = current;
  }
  return { slug: committed, opened };
}

/** Ukuran board mengikat (gerbang): A semua board lebar 1440; B semua board 390×844. */
export function boardSizeProblems(promptId: string, boards: readonly { id: string; width: number; height: number }[]): string[] {
  if (!boards.length) return ['tidak ada board'];
  const out: string[] = [];
  for (const b of boards) {
    if (promptId === 'A' && b.width !== 1440) out.push(`board ${b.id} lebar ${b.width} ≠ 1440`);
    if (promptId === 'B' && (b.width !== 390 || b.height !== 844)) out.push(`board ${b.id} ${b.width}×${b.height} ≠ 390×844`);
  }
  return out;
}

export type LakarExtra = {
  slug: string | undefined;
  opened: string[];
  boards: LakardBoard[];
  layout: Pick<LayoutCheck, 'rev' | 'summary' | 'findings' | 'boards'> | undefined;
  docPath: string | undefined;
  historyPath: string | undefined;
  daemonBefore: DaemonState | undefined;
  daemonAfter: DaemonState | undefined;
  docsBefore: number;
};

export type LakarRunRecord = RunRecord & { lakar: LakarExtra };

export type RunLakarInput = {
  runId: string;
  prompt: string;
  promptId: string;
  outDir: string;
  config: ProtocolConfig;
  client?: LakardClient;
  /** Untuk tes. */
  command?: string;
  prefixArgs?: string[];
  mcpConfig?: string;
  runsRoot?: string;
  systemd?: () => SystemdInfo;
};

/** Satu run Lakar. Preflight gagal → `aborted` (claude tidak dipanggil); dokumen lama → `invalid`. */
export async function runLakar(i: RunLakarInput): Promise<LakarRunRecord> {
  const client = i.client ?? new LakardClient();
  const sd = i.systemd ?? (() => systemdShow(LAKARD_UNIT, true));
  const runsRoot = i.runsRoot ?? RUNS_ROOT;
  const mcpConfig = i.mcpConfig ?? LAKAR_MCP_CONFIG;
  const rec: LakarRunRecord = {
    ...emptyRecord({ runId: i.runId, promptId: i.promptId, attempt: 1 }),
    lakar: { slug: undefined, opened: [], boards: [], layout: undefined, docPath: undefined, historyPath: undefined, daemonBefore: undefined, daemonAfter: undefined, docsBefore: 0 },
  };
  mkdirSync(i.outDir, { recursive: false });

  // 1. preflight per run + snapshot dokumen
  let status: LakardStatus | undefined;
  try {
    status = await client.status();
  } catch (e) {
    rec.reason = `preflight: ${errorMessage(e)}`;
    return rec;
  }
  const problems = lakarPreflightProblems(status, mcpServerNames(mcpConfig));
  if (problems.length) {
    rec.reason = `preflight: ${problems.join('; ')}`;
    return rec;
  }
  const docsDir = join(status.dataDir, 'docs');
  const before = snapshotLakarDocs(docsDir);
  rec.lakar.docsBefore = before.length;
  writeFileSync(join(i.outDir, 'docs-before.json'), `${JSON.stringify(before, null, 1)}\n`);
  // 2. status reconnect sebelum
  rec.lakar.daemonBefore = daemonState(status, sd());

  // 3. claude -p (waktu terukur)
  const run = await runClaude({
    prompt: i.prompt,
    mcpConfig,
    allowedTools: LAKAR_ALLOWED_TOOLS,
    config: i.config,
    outDir: i.outDir,
    validateInit: (init) => validateInit(init, LAKAR_INIT_RULES),
    forbiddenCwdRoot: REPO_ROOT,
    ...(i.command ? { command: i.command } : {}),
    ...(i.prefixArgs ? { prefixArgs: i.prefixArgs } : {}),
  });
  const m = computeMetrics(run.lines, LAKAR_INIT_RULES, { exitCode: run.exitCode, timedOut: run.timedOut });
  applyMetrics(rec, m, run, i.outDir, i.runId);

  // 2'. status reconnect sesudah (sebelum operasi harness agar export harness tidak tercampur)
  let after: LakardStatus | undefined;
  try {
    after = await client.status();
  } catch {
    after = undefined;
  }
  rec.lakar.daemonAfter = daemonState(after, sd());
  if (m.status === 'invalid') return rec;

  // 4. slug dari transkrip (di luar waktu)
  const found = findCommittedSlug(run.lines);
  rec.lakar.slug = found.slug;
  rec.lakar.opened = found.opened;
  const fail = (reason: string) => {
    if (rec.status === 'success') rec.status = 'failed';
    rec.reason = `${rec.reason ? `${rec.reason}; ` : ''}${reason}`;
  };
  if (!found.slug) {
    fail('no_doc: tidak ada open_doc yang diikuti execute sukses');
    return rec;
  }
  if (before.some((d) => d.name === `${found.slug}.lakar.json`)) {
    rec.status = 'invalid';
    rec.reason = `dokumen lama: ${found.slug} sudah ada sebelum run`;
    return rec;
  }
  const docFile = join(docsDir, `${found.slug}.lakar.json`);
  if (!existsSync(docFile)) {
    fail(`dokumen ${found.slug} tidak ada di ${docsDir}`);
    return rec;
  }

  // 5. sesi harness → open → boards → layout-check → export skala 1 per board; salin eksklusif
  try {
    await client.createSession(LAKAR_VERSION, SCHEMA_VERSION);
    await client.openDoc(found.slug);
    const docDir = join(i.outDir, 'doc');
    mkdirSync(docDir);
    const docDest = join(docDir, `${found.slug}.lakar.json`);
    copyExclusive(docFile, docDest, runsRoot);
    rec.lakar.docPath = relative(REPO_ROOT, docDest);
    const hist = join(docsDir, `${found.slug}.history.jsonl`);
    if (existsSync(hist)) {
      const histDest = join(docDir, `${found.slug}.history.jsonl`);
      copyExclusive(hist, histDest, runsRoot);
      rec.lakar.historyPath = relative(REPO_ROOT, histDest);
    }
    const { boards } = await client.boards();
    rec.lakar.boards = boards;
    const lc = await client.layoutCheck();
    rec.lakar.layout = { rev: lc.rev, summary: lc.summary, findings: lc.findings, boards: lc.boards };
    writeFileSync(join(i.outDir, 'layout-check.json'), `${JSON.stringify(lc, null, 1)}\n`);
    rec.frames = boards.map((b) => ({ id: b.id, name: b.name, width: b.width, height: b.height }));
    if (boards.length) {
      const pngDir = join(i.outDir, 'png');
      mkdirSync(pngDir);
      for (const f of rec.frames) {
        const ex = await client.exportPng(f.id);
        const dest = join(pngDir, `${f.id}.png`);
        copyExclusive(ex.path, dest, runsRoot);
        const sz = readPngSizeFile(dest);
        Object.assign(f, { png: relative(REPO_ROOT, dest), pngWidth: sz.width, pngHeight: sz.height });
        if (pngScaleMismatch(f, sz)) rec.pngScaleMismatch = true;
      }
    } else if (rec.status === 'success') fail('no_frames');
  } catch (e) {
    fail(`post: ${errorMessage(e)}`);
  }
  return rec;
}
