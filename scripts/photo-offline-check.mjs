// Verifikasi live foto stok (orkestrator, bukan tes CI): lakard di 127.0.0.1:7466 (atau LAKAR_URL).
//   /opt/node-26/bin/node scripts/photo-offline-check.mjs [query]
// 1. photo_search ("kamar hotel" untuk Pexels, "hotel room" untuk Wikimedia Commons/Openverse) lewat HTTP daemon; 2. doc uji `photo-check`: execute kartu dengan foto kandidat
// pertama lalu screenshot daemon; 3. Playwright terpisah (Chromium Lakar, page.route membatalkan semua host selain
// 127.0.0.1) memuat /render/page, me-render board yang sama, screenshot ulang; 4. bandingkan (selisih piksel ≤ 1 %),
// cetak permintaan luar yang tercatat (harus 0) dan path metadata aset; cek isi metadata (provider, atribusi, ukuran).
// Dokumen dan metadata dibaca dari dataDir hanya-baca.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = (p) => import(pathToFileURL(join(root, p)).href);
const { decodePng } = await dist('packages/daemon/dist/png.js');
const { FontRegistry, DAEMON_BROWSER_ARGS } = await dist('packages/daemon/dist/index.js');
const { CHROMIUM_ARGS, NODE_ATTR, fontRequests } = await dist('packages/render/dist/index.js');
const { resolveTokens, findBoard } = await dist('packages/schema/dist/index.js');

const BASE = (process.env.LAKAR_URL || 'http://127.0.0.1:7466').replace(/\/+$/, '');
// Default: 'kamar hotel' untuk Pexels (locale id-ID); Wikimedia Commons/Openverse praktis hanya berbahasa Inggris → 'hotel room'.
let QUERY = process.argv[2];
const SLUG = 'photo-check';
const MAX_DIFF = 0.01;
let failed = 0;
const pass = (m) => console.log(`LULUS  ${m}`);
const fail = (m) => {
  console.log(`GAGAL  ${m}`);
  failed++;
};
const info = (m) => console.log(`info   ${m}`);

async function post(path, body, session) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(session ? { 'x-lakar-session': session } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`${path}: ${j.error.code} ${j.error.message} (hint: ${j.error.hint})`);
  return j.data;
}

const status = (await (await fetch(`${BASE}/status`)).json()).data;
info(`lakard ${status.version} di ${BASE}, data ${status.dataDir}, foto ${JSON.stringify(status.photos)}`);
const sid = (await post('/sessions', { client: 'photo-offline-check' })).sessionId;
QUERY ||= status.photos?.provider === 'pexels' ? 'kamar hotel' : 'hotel room';

// 1. Cari.
const t0 = performance.now();
const search = await post('/photos/search', { query: QUERY, orientation: 'landscape', limit: 6 }, sid);
const searchMs = Math.round(performance.now() - t0);
info(`photo_search ${JSON.stringify(QUERY)}: provider ${search.provider}${search.fallbackReason ? ` (fallback ${search.fallbackReason})` : ''}, ${search.results.length} hasil, ${search.thumbnails.length} thumbnail, ${searchMs} ms`);
const complete = search.results.filter((r) => r.creator && r.license && r.sourcePageUrl && r.credit);
complete.length >= 3 ? pass(`≥ 3 kandidat beratribusi (${complete.length})`) : fail(`kandidat beratribusi ${complete.length} < 3`);
search.thumbnails.length >= Math.min(3, search.results.length) ? pass('thumbnail pratinjau ada') : fail('thumbnail kurang');
const first = search.results[0];
if (!first) {
  fail('tidak ada kandidat');
  process.exit(1);
}
info(`kandidat pertama: ${first.ref} · ${first.creator} · ${first.license} · ${first.credit}`);

// 2. Execute kartu dengan foto + screenshot daemon.
await post('/docs/open', { slug: SLUG }, sid);
const code = [
  'const pos = place(390, 844);',
  "const b = add(null, {type:'board', name:'Cek Foto / Kartu · mobile', x:pos.x, y:pos.y, width:390, height:844, screen:'mobile', fills:[{type:'solid', color:'#F6F7F9'}]});",
  `const p = photo('${first.ref}');`,
  "const k = add(b, {type:'frame', name:'Kartu', layout:'column', gap:12, padding:16, width:'fill', radius:12, fills:[{type:'solid', color:'#FFFFFF'}]});",
  "add(k, {type:'rect', name:'Image / Kamar', width:'fill', height:220, radius:8, fills:[{type:'image', assetId:p.assetId, fit:'cover'}]});",
  "add(k, {type:'text', name:'Judul', content:'Kamar Deluxe', size:20, lineHeight:28, weight:600, color:'#101828'});",
  "add(k, {type:'text', name:'Kredit', content:'Foto stok: ' + p.license, size:12, lineHeight:16, color:'#667085'});",
  '({board: b, photo: p})',
].join('\n');
const t1 = performance.now();
const ex = await post('/execute', { code, description: 'cek kartu foto offline' }, sid);
info(`execute (termasuk impor) ${Math.round(performance.now() - t1)} ms, rev ${ex.rev}`);
const boardId = ex.value.board;
const photo = ex.value.photo;
const shot = await post('/screenshot', { boardId }, sid);
const daemonPng = Buffer.from(shot.png, 'base64');

// 3. Render ulang di Playwright terpisah, semua host selain 127.0.0.1 dibatalkan.
const doc = resolveTokens(JSON.parse(readFileSync(join(status.dataDir, 'docs', `${SLUG}.lakar.json`), 'utf8')));
const board = findBoard(doc, boardId);
const fonts = FontRegistry.load().resolveFaces(fontRequests(board));
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.LAKAR_BROWSERS_PATH || join(homedir(), '.cache', 'lakar', 'ms-playwright');
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ headless: true, args: [...CHROMIUM_ARGS, ...DAEMON_BROWSER_ARGS] });
const external = [];
let replayPng;
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    external.push(url.toString());
    return route.abort();
  });
  await page.goto(`${BASE}/render/page`);
  await page.waitForFunction('window.__lakarReady === true');
  await page.setViewportSize({ width: Math.ceil(board.width), height: Math.ceil(board.height) });
  const res = await page.evaluate(({ doc, boardId, fonts }) => window.__lakarRender(doc, boardId, fonts, [], []), { doc, boardId, fonts });
  if (!res.ok) throw new Error(`render ulang gagal: ${res.code} ${res.message}`);
  replayPng = await page.locator(`[${NODE_ATTR}="${boardId}"]`).screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
} finally {
  await browser.close();
}

// 4. Bandingkan.
const a = decodePng(daemonPng);
const b = decodePng(replayPng);
if (a.width !== b.width || a.height !== b.height) fail(`ukuran beda: daemon ${a.width}×${a.height}, ulang ${b.width}×${b.height}`);
else {
  let diff = 0;
  for (let i = 0; i < a.width * a.height; i++) {
    for (let c = 0; c < 3; c++) {
      if (Math.abs(a.pixels[i * a.channels + c] - b.pixels[i * b.channels + c]) > 8) {
        diff++;
        break;
      }
    }
  }
  const frac = diff / (a.width * a.height);
  frac <= MAX_DIFF ? pass(`render ulang offline identik: selisih ${(frac * 100).toFixed(3)} % (≤ 1 %)`) : fail(`selisih ${(frac * 100).toFixed(3)} % > 1 %`);
}
// Foto benar-benar tampil: piksel tengah kotak gambar bukan latar putih/abu.
const bounds = ex.bounds?.[Object.keys(ex.bounds).find((id) => ex.created.some((c) => c.id === id && c.name === 'Image / Kamar'))];
if (bounds) {
  const [x, y, w, h] = bounds;
  const px = (x + w / 2) | 0;
  const py = (y + h / 2) | 0;
  const at = [...a.pixels.subarray((py * a.width + px) * a.channels, (py * a.width + px) * a.channels + 3)];
  const plain = at.every((v) => v >= 0xf0);
  plain ? fail(`tengah kotak foto polos ${JSON.stringify(at)}`) : pass(`foto tampil di kartu (piksel tengah ${JSON.stringify(at)})`);
}
external.length === 0 ? pass('0 permintaan luar dari halaman render') : fail(`permintaan luar: ${external.join(', ')}`);
console.log(`external_requests=${JSON.stringify(external)}`);
const metaPath = join(status.dataDir, 'assets', 'meta', `${photo.assetId}.json`);
console.log(`meta=${metaPath}`);
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
info(`meta: provider ${meta.provider}, ${meta.width}×${meta.height}, ${meta.bytes} byte, ${meta.license}, ${meta.attribution}`);
search.provider === status.photos?.provider ? pass(`photo_search memakai penyedia utama ${search.provider}`) : fail(`photo_search jatuh ke ${search.provider} (${search.fallbackReason ?? '-'}), bukan ${status.photos?.provider}`);
meta.provider === search.provider ? pass(`meta provider ${meta.provider}`) : fail(`meta provider ${meta.provider} ≠ ${search.provider}`);
const missing = ['creator', 'license', 'sourcePageUrl', 'attribution', ...(meta.provider === 'wikimedia' ? ['licenseUrl'] : [])].filter((k) => !meta[k]);
missing.length ? fail(`meta tanpa ${missing.join(', ')}`) : pass('meta memuat creator, license, sourcePageUrl, attribution' + (meta.provider === 'wikimedia' ? ', licenseUrl' : ''));
if (meta.provider === 'wikimedia') {
  Math.max(meta.width, meta.height) >= 1200 ? pass(`sisi panjang ${Math.max(meta.width, meta.height)} ≥ 1200`) : fail(`sisi panjang ${Math.max(meta.width, meta.height)} < 1200`);
}
console.log(`index=${join(status.dataDir, 'photos', 'index.json')}`);
console.log(failed ? `HASIL: ${failed} cek gagal` : 'HASIL: semua cek lulus');
process.exit(failed ? 1 : 0);
