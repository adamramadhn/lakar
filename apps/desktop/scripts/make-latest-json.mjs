// Gabungkan `*.sig` hasil matrix build release.yml menjadi `latest.json` untuk endpoint statis
// tauri-plugin-updater (plugin.updater.endpoints di tauri.conf.json → GitHub Release "latest").
// Pemetaan platform mengikuti artefak updater Tauri: NSIS `-setup.exe` di atas msi di Windows,
// `.app.tar.gz` per arsitektur di macOS, dan `.AppImage` (bukan .deb) di Linux. `.sig` lain
// (mis. `*.msi.sig`, `*.deb.sig`) sengaja diabaikan: tetap diunggah ke Release, tidak masuk latest.json.
// Pakai: node make-latest-json.mjs --dir <dir-sig> --version <x.y.z> --tag <v*> --repo <owner/name>
//        [--notes-file <file>] [--out <file>]   (default --out: <dir>/latest.json)
// Gagal bila tidak ada `.sig` sama sekali, atau platform yang diharapkan tidak lengkap/duplikat.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';

/** sufiks `.sig` → platform Tauri; url memakai nama artefak (nama sig tanpa `.sig`). */
const PLATFORMS = [
  { suffix: '_x64-setup.exe.sig', platform: 'windows-x86_64' },
  { suffix: '_x64.app.tar.gz.sig', platform: 'darwin-x86_64' },
  { suffix: '_aarch64.app.tar.gz.sig', platform: 'darwin-aarch64' },
  { suffix: '_amd64.AppImage.sig', platform: 'linux-x86_64' },
];

function usage() {
  return 'pakai: make-latest-json.mjs --dir <dir> --version <x.y.z> --tag <tag> --repo <owner/repo> [--notes-file <file>] [--out <file>]';
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key.startsWith('--')) fail(`argumen tak dikenal: ${key}`);
    args[key.slice(2)] = argv[i + 1];
    if (args[key.slice(2)] === undefined) fail(`argumen ${key} butuh nilai`);
  }
  for (const k of ['dir', 'version', 'tag', 'repo']) {
    if (!args[k]) fail(`argumen --${k} wajib. ${usage()}`);
  }
  return args;
}

function fail(message) {
  console.error(`make-latest-json: ${message}`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));

let files;
try {
  files = readdirSync(args.dir);
} catch (e) {
  fail(`direktori tidak bisa dibaca: ${args.dir} (${e.message})`);
}

const platforms = {};
const missing = [];
for (const { suffix, platform } of PLATFORMS) {
  const matches = files.filter((f) => f.endsWith(suffix));
  if (matches.length === 0) {
    missing.push(`${platform} (*${suffix})`);
    continue;
  }
  if (matches.length > 1) fail(`lebih dari satu sig untuk ${platform}: ${matches.join(', ')}`);
  const sigFile = matches[0];
  const signature = readFileSync(join(args.dir, sigFile), 'utf8').trim();
  if (!signature) fail(`sig kosong: ${sigFile}`);
  platforms[platform] = {
    signature,
    url: `https://github.com/${args.repo}/releases/download/${args.tag}/${sigFile.slice(0, -'.sig'.length)}`,
  };
}
if (missing.length === PLATFORMS.length) fail(`tidak ada berkas .sig di ${args.dir}`);
if (missing.length > 0) fail(`platform updater tidak lengkap: ${missing.join('; ')}`);

let notes;
if (args['notes-file']) {
  notes = readFileSync(args['notes-file'], 'utf8').trim();
}

const latest = {
  version: args.version,
  ...(notes ? { notes } : {}),
  pub_date: new Date().toISOString(),
  platforms,
};

const out = args.out ?? join(args.dir, 'latest.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(latest, null, 2)}\n`);
console.log(`latest.json → ${out} (${Object.keys(platforms).length} platform)`);
