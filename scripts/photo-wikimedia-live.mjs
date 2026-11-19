// Verifikasi live penyedia foto Wikimedia Commons (orkestrator, bukan tes CI): lakard di 127.0.0.1:7466 (atau LAKAR_URL).
//   /opt/node-26/bin/node scripts/photo-wikimedia-live.mjs [dir-output] [--suffix <teks>] [--delay <ms>]
// Menjalankan ≥ 20 kueri stok umum berbahasa Inggris secara serial lewat POST /photos/search (preview true). Per kueri
// mencetak provider, jumlah hasil, latensi, dan lisensi 3 teratas, lalu menyimpan thumbnail pertama ke dir output
// (default: <tmpdir>/lakar-wikimedia-live). Sukses = provider 'wikimedia' dan ≥ 3 hasil. Keluar non-zero bila
// sukses < 80 %. `--suffix` ditambahkan ke setiap kueri untuk menghindari cache hasil cari daemon (24 jam).
// `--delay` = jeda antar kueri (default 4000 ms): API Wikimedia membatasi laju per klien (HTTP 429 + Retry-After setelah
// ±10 pencarian beruntun, terukur 2026-11-18); skrip menghormati batas itu, bukan mengakalinya. Latensi diukur per kueri.
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.env.LAKAR_URL || 'http://127.0.0.1:7466').replace(/\/+$/, '');
const QUERIES = [
  'coffee shop interior',
  'woman portrait smiling',
  'fresh salad bowl',
  'running shoes',
  'office team meeting',
  'man portrait outdoor',
  'hotel room',
  'pizza',
  'city skyline at night',
  'beach sunset',
  'mountain lake',
  'laptop on desk',
  'modern kitchen',
  'bicycle',
  'cup of coffee',
  'fruit market',
  'students in classroom',
  'living room interior',
  'wristwatch',
  'restaurant dining table',
  'dog',
  'headphones',
];
const MIN_RESULTS = 3;
const MIN_SUCCESS = 0.8;

const args = process.argv.slice(2);
let suffix = '';
let delayMs = 4000;
let outDir;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--suffix') suffix = args[++i] ?? '';
  else if (args[i] === '--delay') delayMs = Math.max(0, Number(args[++i]) || 0);
  else outDir ??= args[i];
}
outDir ??= join(tmpdir(), 'lakar-wikimedia-live');
mkdirSync(outDir, { recursive: true });

async function post(path, body, session) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(session ? { 'x-lakar-session': session } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  return r.json();
}

const status = (await (await fetch(`${BASE}/status`)).json()).data;
console.log(`info   lakard ${status.version} di ${BASE}, foto ${JSON.stringify(status.photos)}, output ${outDir}`);
const sid = (await post('/sessions', { client: 'photo-wikimedia-live' })).data.sessionId;

const ext = (mime) => (mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/gif' ? 'gif' : 'jpg');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const times = [];
let ok = 0;
for (const [i, base] of QUERIES.entries()) {
  if (i > 0 && delayMs) await new Promise((r) => setTimeout(r, delayMs));
  const query = suffix ? `${base} ${suffix}` : base;
  const t0 = performance.now();
  const j = await post('/photos/search', { query, limit: 6, preview: true }, sid);
  const ms = Math.round(performance.now() - t0);
  times.push(ms);
  if (!j.ok) {
    console.log(`GAGAL  ${JSON.stringify(query)}: ${j.error.code} ${j.error.message} · ${ms} ms`);
    continue;
  }
  const d = j.data;
  const success = d.provider === 'wikimedia' && d.results.length >= MIN_RESULTS;
  if (success) ok++;
  const lic = d.results.slice(0, 3).map((r) => r.license).join(' | ');
  let saved = '';
  const t = d.thumbnails[0];
  if (t) {
    const file = join(outDir, `${slug(query)}.${ext(t.mimeType)}`);
    writeFileSync(file, Buffer.from(t.data, 'base64'));
    saved = ` · ${file}`;
  }
  console.log(
    `${success ? 'LULUS ' : 'GAGAL '} ${JSON.stringify(query)}: ${d.provider}${d.fallbackReason ? ` (${d.fallbackReason})` : ''}, ${d.results.length} hasil, ${ms} ms · ${lic}${saved}`,
  );
}

const sorted = [...times].sort((a, b) => a - b);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
const rate = ok / QUERIES.length;
console.log(`latensi p50 ${pct(50)} ms, p95 ${pct(95)} ms`);
console.log(`HASIL: sukses ${ok}/${QUERIES.length} (${(rate * 100).toFixed(0)} %, ambang ${MIN_SUCCESS * 100} %)`);
process.exit(rate >= MIN_SUCCESS ? 0 : 1);
