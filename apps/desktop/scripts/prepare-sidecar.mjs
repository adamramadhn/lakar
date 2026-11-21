#!/usr/bin/env node
// Siapkan sidecar aplikasi desktop sebelum `tauri build`:
//   src-tauri/resources/sidecar/{daemon,mcp,viewer}  — hasil `pnpm deploy --prod` (node-linker hoisted, tanpa symlink)
//   src-tauri/binaries/lakar-node-<target>[.exe]      — runtime Node resmi, SHA256 diverifikasi dengan SHASUMS256.txt
// Prasyarat: `pnpm build` di root repo (dist daemon, mcp, render, viewer).
// Pakai: node scripts/prepare-sidecar.mjs [--target <rust-triple>] [--skip-deploy] [--skip-node]
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NODE_VERSION = process.env.LAKAR_DESKTOP_NODE_VERSION || '26.13.1';

/** Rust target triple → nama distribusi Node resmi. */
const NODE_DIST = {
  'x86_64-pc-windows-msvc': { platform: 'win-x64', ext: 'zip', bin: 'node.exe' },
  'aarch64-pc-windows-msvc': { platform: 'win-arm64', ext: 'zip', bin: 'node.exe' },
  'x86_64-apple-darwin': { platform: 'darwin-x64', ext: 'tar.gz', bin: 'bin/node' },
  'aarch64-apple-darwin': { platform: 'darwin-arm64', ext: 'tar.gz', bin: 'bin/node' },
  'x86_64-unknown-linux-gnu': { platform: 'linux-x64', ext: 'tar.xz', bin: 'bin/node' },
  'aarch64-unknown-linux-gnu': { platform: 'linux-arm64', ext: 'tar.xz', bin: 'bin/node' },
};

const here = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(here, '..');
const repoRoot = resolve(desktopDir, '../..');
const tauriDir = join(desktopDir, 'src-tauri');
const sidecarDir = join(tauriDir, 'resources', 'sidecar');
const binDir = join(tauriDir, 'binaries');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name) => process.argv.includes(name);

function hostTriple() {
  const out = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
  const m = /^host:\s*(\S+)/m.exec(out);
  if (!m) throw new Error('target host tidak terbaca dari `rustc -vV`');
  return m[1];
}

function log(msg) {
  console.log(`prepare-sidecar: ${msg}`);
}

/** Jalankan pnpm (Windows butuh shell untuk pnpm.cmd; argumen dikutip karena shell menggabungkannya). */
function pnpm(args) {
  const win = process.platform === 'win32';
  const argv = win ? args.map((a) => (/[\s"]/.test(a) ? `"${a.replaceAll('"', '\\"')}"` : a)) : args;
  execFileSync('pnpm', argv, { cwd: repoRoot, stdio: 'inherit', shell: win });
}

/** Buang file yang tidak dibaca daemon saat runtime (menghemat ~60 MB dan ribuan file installer). */
function prune(nodeModules) {
  const lucide = join(nodeModules, 'lucide-static');
  if (existsSync(lucide)) {
    rmSync(join(lucide, 'font'), { recursive: true, force: true });
    rmSync(join(lucide, 'sprite.svg'), { force: true });
    // Daemon membaca dist/esm/lucide-static.mjs dan me-resolve entry `main` paket (packages/icons/src/data.ts
    // `packageRoot`); file dist lain dibuang.
    const main = JSON.parse(readFileSync(join(lucide, 'package.json'), 'utf8')).main;
    const keep = new Set(['esm/lucide-static.mjs', ...(typeof main === 'string' ? [main.replace(/^\.\//, '').replace(/^dist\//, '')] : [])]);
    const dist = join(lucide, 'dist');
    const walk = (dir, rel) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const r = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if ([...keep].some((k) => k.startsWith(`${r}/`))) walk(join(dir, entry.name), r);
          else rmSync(join(dir, entry.name), { recursive: true, force: true });
        } else if (!keep.has(r)) rmSync(join(dir, entry.name), { force: true });
      }
    };
    if (existsSync(dist)) walk(dist, '');
  }
  // Shim .bin bisa berupa symlink (tidak dipakai daemon, dan resource Tauri tidak boleh berisi symlink);
  // metadata pnpm tidak dibutuhkan saat runtime.
  for (const meta of ['.bin', '.pnpm', '.modules.yaml', '.pnpm-workspace-state-v1.json']) {
    rmSync(join(nodeModules, meta), { recursive: true, force: true });
  }
}

function deploy(pkg, name) {
  const out = join(sidecarDir, name);
  log(`pnpm deploy ${pkg} → ${out}`);
  pnpm(['--filter', pkg, 'deploy', '--prod', '--config.node-linker=hoisted', out]);
  for (const f of ['pnpm-lock.yaml', 'pnpm-workspace.yaml', 'README.md']) rmSync(join(out, f), { force: true });
  prune(join(out, 'node_modules'));
}

function assertBuilt() {
  for (const rel of ['packages/daemon/dist/main.js', 'packages/mcp/dist/main.js', 'packages/render/dist/index.js', 'packages/viewer/dist/index.html']) {
    if (!existsSync(join(repoRoot, rel))) throw new Error(`${rel} belum ada; jalankan \`pnpm build\` di root repo dulu`);
  }
}

function prepareResources() {
  assertBuilt();
  rmSync(sidecarDir, { recursive: true, force: true });
  mkdirSync(sidecarDir, { recursive: true });
  deploy('@lakar/daemon', 'daemon');
  deploy('@lakar/mcp', 'mcp');
  cpSync(join(repoRoot, 'packages/viewer/dist'), join(sidecarDir, 'viewer'), { recursive: true });
  // File skill wajib ikut (packages/skills `files`), kalau tidak read_skill gagal di aplikasi.
  if (!existsSync(join(sidecarDir, 'daemon/node_modules/@lakar/skills/skills'))) {
    throw new Error('file skill tidak ikut ter-deploy (cek "files" di packages/skills/package.json)');
  }
}

async function download(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`unduh ${url} gagal: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function prepareNode(target) {
  const dist = NODE_DIST[target];
  if (!dist) throw new Error(`target ${target} tidak didukung (dukungan: ${Object.keys(NODE_DIST).join(', ')})`);
  const suffix = target.includes('windows') ? '.exe' : '';
  const outFile = join(binDir, `lakar-node-${target}${suffix}`);
  const marker = `${outFile}.version`;
  if (existsSync(outFile) && existsSync(marker) && readFileSync(marker, 'utf8').trim() === NODE_VERSION) {
    log(`Node ${NODE_VERSION} untuk ${target} sudah ada`);
    return;
  }
  const base = `https://nodejs.org/dist/v${NODE_VERSION}`;
  const archive = `node-v${NODE_VERSION}-${dist.platform}.${dist.ext}`;
  log(`unduh ${base}/${archive}`);
  const sums = (await download(`${base}/SHASUMS256.txt`)).toString('utf8');
  const expected = sums
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .find(([, file]) => file === archive)?.[0];
  if (!expected) throw new Error(`${archive} tidak ada di SHASUMS256.txt`);
  const data = await download(`${base}/${archive}`);
  const actual = createHash('sha256').update(data).digest('hex');
  if (actual !== expected) throw new Error(`SHA256 ${archive} tidak cocok: ${actual} ≠ ${expected}`);

  const work = mkdtempSync(join(tmpdir(), 'lakar-node-'));
  try {
    const file = join(work, archive);
    writeFileSync(file, data);
    const inner = `node-v${NODE_VERSION}-${dist.platform}/${dist.bin}`;
    // tar membaca tar.gz dan tar.xz; di Windows pakai bsdtar bawaan (System32) yang juga membaca zip —
    // GNU tar dari Git Bash bisa lebih dulu di PATH dan tidak mengenal zip.
    const tar = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    execFileSync(tar, ['-xf', archive, inner], { cwd: work, stdio: 'inherit' });
    mkdirSync(binDir, { recursive: true });
    cpSync(join(work, inner), outFile);
    if (!suffix) chmodSync(outFile, 0o755);
    writeFileSync(marker, `${NODE_VERSION}\n`);
    log(`Node ${NODE_VERSION} → ${outFile} (${(statSync(outFile).size / 1048576).toFixed(1)} MB)`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (!flag('--skip-deploy')) prepareResources();
if (!flag('--skip-node')) await prepareNode(arg('--target') || hostTriple());
log('selesai');
