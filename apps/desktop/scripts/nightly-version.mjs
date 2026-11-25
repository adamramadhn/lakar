// Hitung versi nightly untuk release.yml: `<B>-nightly.<T>`.
//   B = tag stable tertinggi `vX.Y.Z` dengan patch + 1  (mis. v0.1.8 → 0.1.9)
//   T = waktu UTC, YYYYMMDDHHmm (identifier numerik agar MSI/legal dan semver senang)
// Hasilnya selalu > stable terakhir (pra-rilis x.y.z+1 < x.y.z+1 tapi > x.y.z) dan monoton
// antar-malam lewat T. Tag pra-rilis/`nightly` diabaikan — hanya rilis final yang mengangkat B.
// Pakai: node nightly-version.mjs --tags <file daftar tag, satu per baris | - untuk stdin> --now <ISO>
import { readFileSync } from 'node:fs';
import process from 'node:process';

function usage() {
  return 'pakai: nightly-version.mjs --tags <file|-> --now <ISO 8601>';
}

function fail(message) {
  console.error(`nightly-version: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key.startsWith('--')) fail(`argumen tak dikenal: ${key}`);
    args[key.slice(2)] = argv[i + 1];
    if (args[key.slice(2)] === undefined) fail(`argumen ${key} butuh nilai`);
  }
  for (const k of ['tags', 'now']) {
    if (!args[k]) fail(`argumen --${k} wajib. ${usage()}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

let raw;
try {
  raw = args.tags === '-' ? readFileSync(0, 'utf8') : readFileSync(args.tags, 'utf8');
} catch (e) {
  fail(`daftar tag tidak bisa dibaca: ${args.tags} (${e.message})`);
}

// Hanya tag rilis final; pra-rilis (v1.2.3-rc1) dan `nightly` tidak mengangkat baseline.
const STABLE = /^v(\d+)\.(\d+)\.(\d+)$/;
const tags = raw
  .split(/\r?\n/)
  .map((t) => t.trim())
  .map((t) => STABLE.exec(t))
  .filter((m) => m !== null)
  .map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);

if (tags.length === 0) fail('tidak ada tag stable vX.Y.Z di daftar — baseline tidak bisa diturunkan');

// Urut semver, bukan leksikal: v0.1.10 > v0.1.9.
tags.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
const [major, minor, patch] = tags[tags.length - 1];
const base = `${major}.${minor}.${patch + 1}`;

const now = new Date(args.now);
if (Number.isNaN(now.getTime())) fail(`--now bukan tanggal valid: ${args.now}`);
const pad = (n) => String(n).padStart(2, '0');
const t = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;

console.log(`${base}-nightly.${t}`);
