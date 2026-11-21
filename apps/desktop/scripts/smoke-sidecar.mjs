#!/usr/bin/env node
// Smoke test sidecar hasil prepare-sidecar, dijalankan persis seperti aplikasi desktop: runtime `lakar-node`
// dibundel + `resources/sidecar/daemon` dengan env desktop. Memeriksa /status, /viewer/connections, /app/, lalu
// server MCP bundel lewat stdio (status, read_skill, icon_search), dan bahwa daemon berhenti rapi saat stdin ditutup.
// Pakai: node scripts/smoke-sidecar.mjs --target <rust-triple>
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tauriDir = resolve(here, '..', 'src-tauri');
const sidecar = join(tauriDir, 'resources', 'sidecar');
const i = process.argv.indexOf('--target');
const target = i >= 0 ? process.argv[i + 1] : undefined;
if (!target) throw new Error('pakai: smoke-sidecar.mjs --target <rust-triple>');
const node = join(tauriDir, 'binaries', `lakar-node-${target}${target.includes('windows') ? '.exe' : ''}`);
const daemonMain = join(sidecar, 'daemon', 'dist', 'main.js');
const mcpMain = join(sidecar, 'mcp', 'dist', 'main.js');

const log = (m) => console.log(`smoke-sidecar: ${m}`);
function assert(cond, msg) {
  if (!cond) throw new Error(`GAGAL: ${msg}`);
}

const work = mkdtempSync(join(tmpdir(), 'lakar-smoke-'));
const config = join(work, 'config.toml');
writeFileSync(config, '# smoke\n');

const daemon = spawn(node, [daemonMain], {
  env: {
    ...process.env,
    LAKAR_PORT: '0',
    LAKAR_DATA_DIR: join(work, 'data'),
    LAKAR_CONFIG: config,
    LAKAR_BROWSER_CHANNEL: 'auto',
    LAKAR_VIEWER_DIR: join(sidecar, 'viewer'),
    LAKAR_MCP_ENTRY: mcpMain,
    LAKAR_EXIT_ON_STDIN_CLOSE: '1',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let output = '';
daemon.stdout.on('data', (d) => (output += d));
daemon.stderr.on('data', (d) => (output += d));
const exited = new Promise((res) => daemon.on('exit', (code) => res(code)));

try {
  const url = await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`daemon tidak siap dalam 60 s:\n${output}`)), 60_000);
    daemon.on('error', (e) => rej(e));
    daemon.on('exit', (code) => rej(new Error(`daemon keluar (${code}):\n${output}`)));
    daemon.stdout.on('data', () => {
      const m = /mendengarkan (http:\/\/127\.0\.0\.1:\d+)/.exec(output);
      if (m) {
        clearTimeout(timer);
        res(m[1]);
      }
    });
  });
  log(`daemon ${url}`);

  const status = await (await fetch(`${url}/status`)).json();
  assert(status.ok && status.data.node === `v${process.env.LAKAR_DESKTOP_NODE_VERSION || '26.13.1'}`, `/status: ${JSON.stringify(status).slice(0, 300)}`);
  assert(status.data.icons?.lucide && status.data.fonts?.missing?.length === 0, `ikon/font tidak lengkap: ${JSON.stringify({ icons: status.data.icons, fonts: status.data.fonts })}`);

  const conn = await (await fetch(`${url}/viewer/connections`)).json();
  assert(conn.ok && conn.data.mcp && resolve(conn.data.mcp.args[0]) === resolve(mcpMain), `/viewer/connections: ${JSON.stringify(conn)}`);
  assert(conn.data.mcp.env.LAKAR_URL === url, 'LAKAR_URL tidak sama dengan URL daemon');

  const app = await fetch(`${url}/app/`);
  assert(app.ok && (app.headers.get('content-type') ?? '').startsWith('text/html'), `/app/ HTTP ${app.status}`);

  // MCP stdio bundel → daemon: status, skill (file skill ikut ter-deploy), ikon (lucide hasil pangkas).
  const replies = await new Promise((res, rej) => {
    const mcp = spawn(node, [mcpMain], { env: { ...process.env, LAKAR_URL: url }, stdio: ['pipe', 'pipe', 'inherit'] });
    const got = new Map();
    let buf = '';
    const timer = setTimeout(() => {
      mcp.kill();
      rej(new Error(`MCP tidak menjawab semua permintaan (dapat: ${[...got.keys()].join(',')})`));
    }, 60_000);
    mcp.stdout.on('data', (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.id !== undefined) got.set(msg.id, msg);
        if (got.size === 4) {
          clearTimeout(timer);
          mcp.stdin.end();
          res(got);
        }
      }
    });
    const send = (m) => mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`);
    send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } } });
    send({ method: 'notifications/initialized' });
    const call = (id, name, args) => send({ id, method: 'tools/call', params: { name, arguments: args } });
    call(2, 'status', {});
    call(3, 'read_skill', { name: 'core' });
    call(4, 'icon_search', { query: 'arrow right' });
  });
  const text = (id) => {
    const r = replies.get(id);
    assert(!r.error && !r.result?.isError, `MCP id ${id}: ${JSON.stringify(r).slice(0, 400)}`);
    return r.result.content.map((c) => c.text ?? '').join('\n');
  };
  assert(text(2).includes('cocok'), `MCP status: ${text(2).slice(0, 200)}`);
  assert(text(3).length > 500, 'read_skill core kosong');
  assert(/arrow-right/.test(text(4)), `icon_search: ${text(4).slice(0, 200)}`);
  log('MCP status, read_skill, icon_search OK');

  const pool = status.data.pool;
  log(`pool render: ${pool ? `${pool.ready}/${pool.size}${pool.lastError ? ` (${pool.lastError})` : ''}` : 'tidak ada'}`);

  daemon.stdin.end();
  const code = await Promise.race([exited, new Promise((r) => setTimeout(() => r('timeout'), 15_000))]);
  assert(code === 0, `daemon tidak berhenti rapi setelah stdin ditutup (exit ${code}):\n${output}`);
  log('daemon berhenti rapi saat stdin ditutup');
  log('selesai');
} finally {
  if (daemon.exitCode === null) daemon.kill();
  rmSync(work, { recursive: true, force: true });
}
