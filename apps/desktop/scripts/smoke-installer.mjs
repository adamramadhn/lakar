#!/usr/bin/env node
// Smoke test installer NSIS Windows: upgrade di atas aplikasi yang sedang berjalan (hook installer-hooks.nsh).
//
// 1. Pasang (opsional) installer versi sebelumnya, lalu installer build ini, secara senyap ke direktori uji.
// 2. Jalankan lakar.exe (membuat salinan Node MCP di %LOCALAPPDATA%\id.lakar.desktop\mcp dan daemon), server MCP
//    stdio dari config lama (lakar-node.exe di direktori instalasi), server MCP dari salinan stabil, serta decoy:
//    lakar-node.exe di direktori lain dan node.exe runner.
// 3. Pasang ulang secara senyap (/S): harus sukses tanpa dialog; proses dari direktori instalasi berhenti, proses
//    lain tetap hidup, file baru ada dan tidak ada sisa *.old.
// 4. Uninstall senyap saat server MCP config lama berjalan: lakar-node.exe harus terhapus.
//
// Pakai (Windows): node scripts/smoke-installer.mjs --installer <Lakar_x_x64-setup.exe> [--previous <setup.exe>]
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const installer = arg('--installer');
const previous = arg('--previous');
if (process.platform !== 'win32') throw new Error('smoke-installer.mjs hanya untuk Windows');
if (!installer) throw new Error('pakai: smoke-installer.mjs --installer <setup.exe> [--previous <setup.exe>]');

const log = (m) => console.log(`smoke-installer: ${m}`);
function assert(cond, msg) {
  if (!cond) throw new Error(`GAGAL: ${msg}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Path panjang (runner bisa memberi TEMP berbentuk 8.3 seperti RUNNER~1) agar perbandingan path cocok.
const work = realpathSync.native(mkdtempSync(join(tmpdir(), 'lakar-installer-')));
// Spasi di path menguji kutipan $INSTDIR di hook.
const instDir = join(work, 'Lakar Smoke');
const appData = join(process.env.LOCALAPPDATA, 'id.lakar.desktop');
const stableNode = join(appData, 'mcp', 'lakar-node.exe');
const instNode = join(instDir, 'lakar-node.exe');
const mcpMain = join(instDir, 'resources', 'sidecar', 'mcp', 'dist', 'main.js');

/** Jalankan installer NSIS senyap; `/D=` wajib argumen terakhir dan tanpa kutip. */
function runInstaller(exe, label) {
  const started = Date.now();
  const r = spawnSync(exe, ['/S', `/D=${instDir}`], { timeout: 240_000, windowsVerbatimArguments: true });
  log(`${label}: exit ${r.status} dalam ${Date.now() - started} ms`);
  assert(!r.error, `${label}: ${r.error?.message}`);
  assert(r.status === 0, `${label}: exit ${r.status}`);
  for (const f of ['lakar.exe', 'lakar-node.exe', 'uninstall.exe', join('resources', 'sidecar', 'daemon', 'dist', 'main.js')]) {
    assert(existsSync(join(instDir, f)), `${label}: ${f} tidak ada`);
  }
  const old = readdirSync(instDir).filter((f) => f.endsWith('.old'));
  assert(old.length === 0, `${label}: sisa ${old.join(', ')}`);
}

/** Proses berdasarkan PID → path image (null bila sudah tidak ada). */
function imagePath(pid) {
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").ExecutablePath`], { encoding: 'utf8' });
  return out.trim() || null;
}

/** Proses stdio jangka panjang (server MCP menunggu stdin). */
function startHolder(exe, args, env = {}) {
  const child = spawn(exe, args, { env: { ...process.env, ...env }, stdio: ['pipe', 'ignore', 'ignore'] });
  child.on('error', (e) => log(`proses ${exe}: ${e.message}`));
  return child;
}

async function waitFor(what, fn, ms = 90_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => undefined);
    if (v) return v;
    if (Date.now() > end) throw new Error(`GAGAL: ${what} tidak terjadi dalam ${ms / 1000} s`);
    await sleep(500);
  }
}

const children = [];
try {
  if (previous) runInstaller(previous, 'install versi sebelumnya');
  runInstaller(installer, 'install');

  // Aplikasi berjalan: daemon sidecar + salinan Node MCP di app-data.
  const app = spawn(join(instDir, 'lakar.exe'), [], { stdio: 'ignore', detached: true });
  app.unref();
  const port = () => (existsSync(join(appData, 'port')) ? readFileSync(join(appData, 'port'), 'utf8').trim() : '7466');
  const conn = await waitFor('lakard aplikasi siap + /viewer/connections', async () => {
    const res = await fetch(`http://127.0.0.1:${port()}/viewer/connections`);
    const body = await res.json();
    return body.data?.mcp ? body.data : undefined;
  });
  log(`connections: ${JSON.stringify(conn.mcp)}`);
  assert(conn.mcp.command.toLowerCase() === stableNode.toLowerCase(), `command MCP harus salinan stabil ${stableNode}, dapat ${conn.mcp.command}`);
  assert(conn.mcp.args[0].toLowerCase() === mcpMain.toLowerCase(), `args MCP harus ${mcpMain}`);

  // Config lama (lakar-node.exe instalasi) dan config baru (salinan stabil), plus decoy.
  const env = { LAKAR_URL: conn.url };
  const oldMcp = startHolder(instNode, [mcpMain], env);
  const newMcp = startHolder(stableNode, [mcpMain], env);
  const decoyDir = join(work, 'decoy');
  mkdirSync(decoyDir);
  copyFileSync(instNode, join(decoyDir, 'lakar-node.exe'));
  const decoy = startHolder(join(decoyDir, 'lakar-node.exe'), ['-e', 'setInterval(() => {}, 1e6)']);
  const runnerNode = startHolder(process.execPath, ['-e', 'setInterval(() => {}, 1e6)']);
  children.push(oldMcp, newMcp, decoy, runnerNode);
  await sleep(2000);
  for (const c of [oldMcp, newMcp, decoy, runnerNode]) assert(c.exitCode === null && imagePath(c.pid), `proses uji PID ${c.pid} tidak berjalan`);

  runInstaller(installer, 'upgrade di atas aplikasi berjalan');

  assert(imagePath(oldMcp.pid) === null, 'server MCP config lama (lakar-node.exe instalasi) harus dihentikan');
  assert(imagePath(app.pid) === null, 'lakar.exe harus dihentikan');
  const leftovers = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `@(Get-CimInstance Win32_Process | ? { $_.ExecutablePath -like '${instDir.replace(/'/g, "''")}\\*' }).Count`],
    { encoding: 'utf8' },
  ).trim();
  assert(leftovers === '0', `masih ada ${leftovers} proses dari direktori instalasi`);
  assert(imagePath(newMcp.pid), 'server MCP dari salinan stabil harus tetap hidup');
  assert(imagePath(decoy.pid), 'lakar-node.exe di luar direktori instalasi harus tetap hidup');
  assert(imagePath(runnerNode.pid), 'node.exe lain harus tetap hidup');
  log('upgrade: OK');

  // Uninstall saat server MCP config lama berjalan. `_?=` menjalankan uninstaller di tempat (sinkron).
  const oldMcp2 = startHolder(instNode, [mcpMain], env);
  children.push(oldMcp2);
  await sleep(1500);
  const un = spawnSync(join(instDir, 'uninstall.exe'), ['/S', `_?=${instDir}`], { timeout: 120_000, windowsVerbatimArguments: true });
  log(`uninstall: exit ${un.status}`);
  assert(un.status === 0, `uninstall exit ${un.status}`);
  assert(imagePath(oldMcp2.pid) === null, 'uninstall harus menghentikan server MCP dari direktori instalasi');
  assert(!existsSync(instNode), 'lakar-node.exe harus terhapus saat uninstall');
  assert(imagePath(newMcp.pid), 'uninstall tanpa hapus app-data tidak menyentuh salinan stabil');
  log('uninstall: OK');
} finally {
  for (const c of children) if (c.exitCode === null) c.kill();
  spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process -Filter "Name='lakar.exe'" | % { Stop-Process -Id $_.ProcessId -Force }`]);
}
