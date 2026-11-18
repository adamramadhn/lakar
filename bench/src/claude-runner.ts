// Runner generik `claude -p --output-format stream-json`: cap waktu monotonic per baris saat tiba,
// transkrip mentah byte-identik ke stream.jsonl, cap waktu di timing.json. Tidak tahu apa pun tentang pen.dev.
import { spawn } from 'node:child_process';
import { createWriteStream, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { ProtocolConfig } from './protocol.js';
import { parseInit, type InitInfo, type TimedLine } from './stream-metrics.js';

export type BuildArgsInput = {
  prompt: string;
  config: Pick<ProtocolConfig, 'model' | 'claudeArgs'>;
  mcpConfig: string;
  allowedTools: string;
};

/** argv `claude` (tanpa nama program). Hanya `--mcp-config` dan `--allowedTools` yang berbeda antar-alat. */
export function buildArgs({ prompt, config, mcpConfig, allowedTools }: BuildArgsInput): string[] {
  return ['-p', prompt, '--model', config.model, ...config.claudeArgs, '--mcp-config', mcpConfig, '--allowedTools', allowedTools];
}

/** env proses claude: env pemanggil tanpa variabel berawalan `envScrubPrefixes`, ditambah `config.env`. */
export function buildEnv(base: NodeJS.ProcessEnv, config: Pick<ProtocolConfig, 'env' | 'envScrubPrefixes'>): { env: Record<string, string>; scrubbed: string[] } {
  const env: Record<string, string> = {};
  const scrubbed: string[] = [];
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined) continue;
    if (config.envScrubPrefixes.some((p) => k.startsWith(p))) scrubbed.push(k);
    else env[k] = v;
  }
  return { env: { ...env, ...config.env }, scrubbed: scrubbed.sort() };
}

/** Kutip argv untuk dicetak (sh-kompatibel; string kosong → ""). */
export function shellQuote(args: readonly string[]): string {
  return args.map((a) => (a === '' ? '""' : /^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`)).join(' ');
}

export type RunClaudeOptions = {
  /** Agen desain: argv dibangun `buildArgs` dari tiga field ini (wajib bila `rawArgs` tidak diberikan). */
  prompt?: string;
  mcpConfig?: string;
  allowedTools?: string;
  /** argv mentah (tanpa nama program) menggantikan `buildArgs`, mis. juri dengan `--input-format stream-json`. */
  rawArgs?: string[];
  /** Ditulis ke stdin proses lalu stdin ditutup (stream-json input). Tanpa ini stdin = 'ignore'. */
  stdin?: string | Buffer;
  config: ProtocolConfig;
  outDir: string;
  /** Dipanggil saat event init tiba; masalah ≠ [] → proses dihentikan segera. */
  validateInit?: (init: InitInfo) => string[];
  /** Untuk tes: program pengganti `claude` dan argumen di depannya. */
  command?: string;
  prefixArgs?: string[];
  /** Root yang tidak boleh memuat cwd run (default: tidak dicek di sini). */
  forbiddenCwdRoot?: string;
};

export type RunClaudeResult = {
  argv: string[];
  cwd: string;
  lines: TimedLine[];
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  killedForInvalidInit: string[] | undefined;
  startedAt: string;
  stdoutBytes: number;
  scrubbedEnv: string[];
};

const KILL_GRACE_MS = 5_000;

export async function runClaude(opts: RunClaudeOptions): Promise<RunClaudeResult> {
  let argv: string[];
  if (opts.rawArgs) argv = [...opts.rawArgs];
  else {
    if (opts.prompt === undefined || opts.mcpConfig === undefined || opts.allowedTools === undefined) throw new Error('runClaude: prompt, mcpConfig, dan allowedTools wajib tanpa rawArgs');
    argv = buildArgs({ prompt: opts.prompt, config: opts.config, mcpConfig: opts.mcpConfig, allowedTools: opts.allowedTools });
  }
  const cwd = mkdtempSync(join(tmpdir(), 'lakar-bench-'));
  if (opts.forbiddenCwdRoot) {
    const root = resolve(opts.forbiddenCwdRoot);
    if (cwd === root || cwd.startsWith(`${root}/`)) {
      rmSync(cwd, { recursive: true, force: true });
      throw new Error(`cwd run ${cwd} berada di bawah ${root}`);
    }
  }
  const { env, scrubbed } = buildEnv(process.env, opts.config);
  const stdoutFile = createWriteStream(join(opts.outDir, 'stream.jsonl'), { flags: 'wx' });
  const stderrFile = createWriteStream(join(opts.outDir, 'stderr.txt'), { flags: 'wx' });
  // Gagal buka/tulis (mis. file sudah ada, flag `wx`) dicatat lalu dilempar setelah proses selesai dan
  // pembersihan berjalan, bukan event 'error' tanpa listener yang menjatuhkan seluruh harness.
  const fileErrors: Error[] = [];
  for (const f of [stdoutFile, stderrFile]) f.on('error', (e) => fileErrors.push(e));
  // File transkrip harus terbuka sebelum spawn: gagal buka (mis. EEXIST) → berhenti tanpa menjalankan agen berbayar.
  await Promise.all([stdoutFile, stderrFile].map((f) => new Promise<void>((r) => (f.pending ? f.once('ready', () => r()).once('error', () => r()) : r()))));
  if (fileErrors.length) {
    for (const f of [stdoutFile, stderrFile]) f.destroy();
    rmSync(cwd, { recursive: true, force: true });
    throw new Error(`transkrip run tidak bisa ditulis: ${fileErrors.map((e) => e.message).join('; ')}`);
  }
  const lines: TimedLine[] = [];
  let pending: Buffer[] = [];
  let stdoutBytes = 0;
  let timedOut = false;
  let killedForInvalidInit: string[] | undefined;
  let initSeen = false;
  const startedAt = new Date().toISOString();

  const t0 = performance.now();
  const child = spawn(opts.command ?? 'claude', [...(opts.prefixArgs ?? []), ...argv], { cwd, env, stdio: [opts.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
  if (opts.stdin !== undefined) {
    // EPIPE bila proses keluar lebih dulu: diabaikan (hasilnya terlihat dari exit/transkrip).
    child.stdin!.on('error', () => {});
    child.stdin!.end(opts.stdin);
  }

  const kill = () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, KILL_GRACE_MS).unref();
  };

  const onLine = (t: number, buf: Buffer) => {
    const line = buf.toString('utf8').replace(/\r$/, '');
    lines.push({ t, line });
    if (initSeen || !opts.validateInit || !line.includes('"init"')) return;
    try {
      const ev = JSON.parse(line);
      if (ev?.type === 'system' && ev.subtype === 'init') {
        initSeen = true;
        const problems = opts.validateInit(parseInit(ev));
        if (problems.length) {
          killedForInvalidInit = problems;
          kill();
        }
      }
    } catch {
      /* baris non-JSON: disimpan mentah, diabaikan */
    }
  };

  child.stdout!.on('data', (chunk: Buffer) => {
    const t = performance.now() - t0;
    stdoutFile.write(chunk);
    stdoutBytes += chunk.length;
    let start = 0;
    for (let i = chunk.indexOf(10); i >= 0; i = chunk.indexOf(10, start)) {
      pending.push(chunk.subarray(start, i));
      onLine(t, Buffer.concat(pending));
      pending = [];
      start = i + 1;
    }
    if (start < chunk.length) pending.push(chunk.subarray(start));
  });
  child.stderr!.on('data', (chunk: Buffer) => stderrFile.write(chunk));

  const timer = setTimeout(() => {
    timedOut = true;
    kill();
  }, opts.config.timeoutMs);

  let exitCode: number | null;
  let signal: string | null;
  try {
    ({ exitCode, signal } = await new Promise<{ exitCode: number | null; signal: string | null }>((res, rej) => {
      child.on('error', rej);
      child.on('close', (code, sig) => res({ exitCode: code, signal: sig }));
    }));
    if (pending.length) onLine(performance.now() - t0, Buffer.concat(pending));
  } finally {
    // Selalu: timer dibersihkan, stream ditutup, cwd tmp dihapus (juga saat spawn 'error').
    clearTimeout(timer);
    await Promise.all([new Promise((r) => stdoutFile.end(r)), new Promise((r) => stderrFile.end(r))]);
    rmSync(cwd, { recursive: true, force: true });
  }
  if (fileErrors.length) throw new Error(`transkrip run tidak bisa ditulis: ${fileErrors.map((e) => e.message).join('; ')}`);

  writeFileSync(
    join(opts.outDir, 'timing.json'),
    `${JSON.stringify(
      {
        clock: 'performance.now() ms sejak spawn; t = saat chunk berisi akhir baris tiba',
        startedAt,
        exitCode,
        signal,
        timedOut,
        killedForInvalidInit: killedForInvalidInit ?? null,
        lines: lines.map((l, i) => ({ i, t: Math.round(l.t * 1000) / 1000, bytes: Buffer.byteLength(l.line) })),
      },
      null,
      1,
    )}\n`,
    { flag: 'wx' },
  );
  return { argv, cwd, lines, exitCode, signal, timedOut, killedForInvalidInit, startedAt, stdoutBytes, scrubbedEnv: scrubbed };
}
