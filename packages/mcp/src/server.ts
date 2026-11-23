// Server MCP Lakar: 19 tool (AD-11 + photo_search + get_selection + export_code + paste + list_documents + undo + redo
// + visual_diff + fix_check) → HTTP lakard: status, read_skill, open_doc, list_documents, list_boards, execute, inspect,
// layout_check, screenshot, export, export_code, icon_search, photo_search, get_selection, paste, undo, redo, visual_diff,
// fix_check.
import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  COMPONENT_SIZES,
  CONTRAST_MIN,
  CONTROL_PREFIXES,
  DISPLAY_SIZES,
  FORBIDDEN_PHRASES,
  HOME_INDICATOR_INSET,
  KPI_LINE_HEIGHT_RATIO,
  KPI_SIZES,
  LARGE_TEXT,
  PARAGRAPH_MIN,
  PARAGRAPH_MIN_IN_CARD,
  SCRIM_MIN_ALPHA,
  SPACING_VALUES,
  TOUCH_MIN,
  LAKAR_VERSION, SCHEMA_VERSION, VERSION_HINT, errorMessage, findingLine, summaryText, type ApiResult, type Finding, type FindingSummary } from '@lakar/schema';
import { DaemonClient, formatError } from './client.js';
import { registerFixCheckTool } from './fix-check.js';
import { toolAnnotations } from './annotations.js';

export const SERVER_NAME = 'lakar';
export const SERVER_VERSION = LAKAR_VERSION;

const errorResult = (text: string): CallToolResult => ({ isError: true, content: [{ type: 'text', text }] });

async function guarded(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (e) {
    return errorResult(errorMessage(e));
  }
}

/** Hasil tool dari respons daemon: error AD-11 → teks error terformat; sukses → `content(data)`. */
function asResult<T>(r: ApiResult<T>, content: (data: T) => CallToolResult['content']): CallToolResult {
  if (!r.ok) return errorResult(formatError(r.error));
  return { content: content(r.data) };
}

/** Seperti `asResult` dengan satu blok teks `format(data)` (default JSON). */
function asText<T>(r: ApiResult<T>, format: (data: T) => string = JSON.stringify): CallToolResult {
  return asResult(r, (data) => [{ type: 'text', text: format(data) }]);
}

/** Batas baris temuan di output MCP. */
export const EXECUTE_FINDING_LINES = 20;
export const LAYOUT_CHECK_FINDING_LINES = 60;

/** Baris temuan (format ringkas) dengan batas `max` + baris sisa. */
export function findingLines(findings: readonly Finding[], max: number): string[] {
  const lines = findings.slice(0, max).map(findingLine);
  if (findings.length > max) lines.push(`… ${findings.length - max} temuan lagi (layout_check untuk daftar penuh)`);
  return lines;
}

type ExecuteData = { check?: { boards: string[]; summary: FindingSummary; findings: Finding[] } } & Record<string, unknown>;

/** Output execute: field lain sebagai JSON, lalu ringkasan check + baris temuan (maks 20). */
export function formatExecute(data: ExecuteData): string {
  const { check, ...rest } = data;
  if (!check) return JSON.stringify(data);
  const head = check.boards.length ? `check board ${check.boards.join(', ')}: ${summaryText(check.summary)}` : 'check: tidak ada board tersentuh';
  return [JSON.stringify(rest), head, ...findingLines(check.findings, EXECUTE_FINDING_LINES)].join('\n');
}

/**
 * Mulai ke-N ini, baris jumlah execute membawa pengingat batas skill (pada error juga). Sejak
 * spec-skeleton-live-build landing dibangun skeleton dulu lalu satu blok per execute, jadi pengingat dua tingkat:
 * mobile/app dulu, landing mulai `EXECUTE_LANDING_REMINDER_FROM`.
 */
export const EXECUTE_REMINDER_FROM = 4;
/**
 * Mulai ke-N ini pengingat juga berlaku untuk landing: skeleton + navbar + 2 blok hero + ±6 seksi × 2–3 blok (header,
 * baris kartu) + footer + penutup ≈ 20–25 execute kecil.
 */
export const EXECUTE_LANDING_REMINDER_FROM = 26;

/** Baris jumlah execute sesi MCP ini (pengingat saja; pemanggilan tidak pernah diblokir). */
export function executeCountLine(n: number): string {
  const head = `execute ke-${n} di sesi ini`;
  if (n < EXECUTE_REMINDER_FROM) return head;
  if (n < EXECUTE_LANDING_REMINDER_FROM) {
    return `${head} · batas skill mobile (3) / app (4) termasuk perbaikan tercapai — lanjut screenshot/export; landing: lanjut satu blok per execute`;
  }
  return `${head} · melewati batas skill (mobile 3, app 4, landing blok + 1, termasuk perbaikan) — hentikan perbaikan kecil, lanjut screenshot/export`;
}

/** Tambahkan baris jumlah execute ke hasil tool: selalu pada sukses, pada error hanya bila N ≥ 3. */
export function withExecuteCount(result: CallToolResult, n: number): CallToolResult {
  if (result.isError && n < EXECUTE_REMINDER_FROM) return result;
  const content = [...(result.content ?? [])];
  const i = content.findLastIndex((c) => c.type === 'text');
  const line = executeCountLine(n);
  if (i >= 0) {
    const last = content[i] as { type: 'text'; text: string };
    content[i] = { ...last, text: `${last.text}\n${line}` };
  } else content.push({ type: 'text', text: line });
  return { ...result, content };
}

type LayoutCheckData = { docId: string; rev: number; boards: { id: string; name: string; summary: FindingSummary }[]; summary: FindingSummary; findings: Finding[] };

/** Output layout_check: satu baris ringkasan lalu baris temuan (maks 60). */
export function formatLayoutCheck(data: LayoutCheckData): string {
  const ids = data.boards.map((b) => b.id).join(', ');
  const head = `layout_check rev ${data.rev}, ${data.boards.length} board${ids ? ` (${ids})` : ''}: ${summaryText(data.summary)}`;
  return [head, ...findingLines(data.findings, LAYOUT_CHECK_FINDING_LINES)].join('\n');
}

/** Bentuk `GET /status` lakard yang dipakai formatter. */
export type StatusData = {
  version?: string;
  schemaVersion?: number;
  node?: string;
  pid?: number;
  uptimeSec?: number;
  pool?: { size: number; ready: number; busy: number; waiting: number; recreated: number; browserVersion?: string; lastError?: string } | null;
  fonts?: { families: string[]; missing: string[] };
  icons?: Record<string, string>;
  photos?: { provider: string; keyFile: string; imported: number };
  sessions?: { count: number; active: { id: string; activeSlug?: string; executes: number }[] };
};

const uptime = (sec: number) => (sec < 60 ? `${sec}d` : sec < 3600 ? `${Math.floor(sec / 60)}m` : `${Math.floor(sec / 3600)}j ${Math.floor((sec % 3600) / 60)}m`);

/** Teks ringkas tool `status` (beberapa baris). */
export function formatStatus(st: StatusData): string {
  const match = st.version === SERVER_VERSION && st.schemaVersion === SCHEMA_VERSION;
  const head =
    `lakard ${st.version ?? '?'} (schema ${st.schemaVersion ?? '?'}, node ${st.node ?? '?'}, pid ${st.pid ?? '?'}, uptime ${uptime(st.uptimeSec ?? 0)}) · ` +
    `mcp ${SERVER_VERSION}: ${match ? 'cocok' : `TIDAK cocok (VERSION_MISMATCH; ${VERSION_HINT})`}`;
  const p = st.pool;
  const pool = p
    ? `pool: ${p.size} halaman · ${p.ready} siap · ${p.busy} sibuk · ${p.waiting} antre · dibuat ulang ${p.recreated}× · chromium ${p.browserVersion ?? '-'}` +
      (p.lastError ? `\npool error terakhir: ${p.lastError}` : '')
    : 'pool: -';
  const fonts = st.fonts ? `font: ${st.fonts.families.length} keluarga, hilang: ${st.fonts.missing.length ? st.fonts.missing.join(', ') : '-'}` : 'font: -';
  const icons = st.icons ? `ikon: ${Object.entries(st.icons).map(([lib, v]) => `${lib} ${v}`).join(', ')}` : 'ikon: -';
  const photos = st.photos ? `foto: ${st.photos.provider} (file key ${st.photos.keyFile}), terimpor ${st.photos.imported}` : 'foto: -';
  const ss = st.sessions;
  const sessions = ss
    ? `sesi: ${ss.count}${ss.active.length ? ` (${ss.active.map((a) => `${a.id} ${a.activeSlug ?? '-'}, ${a.executes} execute`).join('; ')})` : ''}`
    : 'sesi: -';
  return [head, pool, fonts, icons, photos, sessions].join('\n');
}

/** Deskripsi tool `status`. */
export const STATUS_DESCRIPTION =
  'Status lakard: versi daemon dan mcp (cocok/tidak), pool render (halaman siap/sibuk/antre, dibuat ulang), font hilang, versi ikon, ' +
  'penyedia foto stok (unsplash/wikimedia/openverse, status file key Unsplash, jumlah foto terimpor), sesi aktif. ' +
  'Tetap bekerja walau versi tidak cocok. Daemon mati → error berisi cara menjalankan service (systemctl --user start lakard).';

/** Deskripsi tool `read_skill`. */
export const READ_SKILL_DESCRIPTION =
  'Baca panduan skill Lakar (Markdown). Baca core (alur kerja, prelude helper, token, konvensi) + delapan skill domain ' +
  '(layout, typography, color, accessibility, ui, interface, writing, review) + skill jenis layar (landing, mobile, atau webapp; ' +
  'aplikasi desktop/dashboard → webapp; berisi contoh teruji) di giliran yang sama (10 panggilan paralel); icons bila ragu nama ikon; api hanya untuk referensi lengkap; ' +
  'selection bila permintaan merujuk node yang dipilih pengguna di viewer (varian responsif, cek konsistensi); ' +
  'opsional: break-ui bila diminta uji data terburuk/edge case, variants bila diminta beberapa variasi/alternatif beda arah. ' +
  'Tanpa name → daftar {skills:[{name, available}]}; dengan name → isi skill. ' +
  'Nama: core, landing, mobile, webapp, layout, typography, color, accessibility, ui, interface, writing, review, icons, api, selection, break-ui, variants. ' +
  'Nama lain atau skill yang belum tersedia → NOT_FOUND dengan daftar yang tersedia (polish sudah dipecah ke delapan skill domain).';

/** Instruksi server MCP (dikirim saat initialize): urutan kerja singkat. */
export const SERVER_INSTRUCTIONS =
  'Lakar: canvas desain lewat kode. Prompt singkat (mis. "buatkan landing page menggunakan lakar") cukup: jalankan alur lengkap ini tanpa bertanya. ' +
  'Sebelum menggambar, read_skill core + layout + typography + color + accessibility + ui + interface + writing + review ' +
  '+ landing/mobile/webapp di giliran yang sama (paralel); aplikasi desktop/dashboard → webapp. ' +
  'Lalu open_doc {} tanpa slug (dokumen yang terbuka di aplikasi Lakar; tidak ada → dokumen baru yang terbuka sendiri sebagai tab) dan get_selection: ' +
  'bangun di board terpilih, atau board kosong (ubah ukuran dan nama sesuai jenis layar), atau board baru lewat place; ' +
  'open_doc {slug} hanya bila pengguna meminta file tertentu atau file baru. ' +
  'Lalu rencana singkat, dan langsung bangun bertahap supaya pengguna melihat canvas tumbuh live: execute pertama = board + semua seksi/area rencana ' +
  "sebagai placeholder Skel (skeleton), lalu satu blok kecil per execute (navbar, teks hero, visual hero, header seksi, satu baris kartu) yang mengisi placeholder di tempat lewat Build, " +
  "untuk landing dan webapp (board landing height:'hug' mengikuti isi, jangan isi atau naikkan tingginya; [WIP] sampai execute penutup); satu board utuh untuk mobile; " +
  'helper prelude skill core sudah bawaan di setiap execute: jangan ditulis ulang, palet arketipe sekali per dokumen lewat Palette(c, font); ' +
  'baca check di respons execute; fix aman temuan check: fix_check (satu rev, saran dinilai sendiri); perbaiki sisanya dengan editId/edits atau update; ' +
  'akhiri dengan satu screenshot board + satu screenshot zoom (nodeId, scale 2) area terpadat (skill review), satu execute perbaikan, ' +
  'visual_diff untuk memastikan hanya area yang dimaksud berubah, lalu export PNG. ' +
  'Langkah sendiri yang salah (execute/paste/fix_check): undo {steps?} (redo mengulang); ditolak bila ada edit lain sesudahnya, maka perbaiki maju lewat execute. ' +
  'Opsional: read_skill break-ui bila diminta uji data terburuk/edge case; variants bila diminta beberapa variasi/alternatif.';

/** Deskripsi tool `list_boards`. */
export const LIST_BOARDS_DESCRIPTION =
  'Daftar board dokumen aktif: {docId, slug, rev, boards:[{id, name, page, screen, x, y, width, height, heightMode?, expectedSize?, wip, childCount}]}. ' +
  "heightMode 'hug' = board height:'hug': height = tinggi terukur render terakhir. " +
  "wip = nama diawali '[WIP] '. Pakai id untuk screenshot, inspect, export, layout_check.";

/** Deskripsi tool `inspect`. */
export const INSPECT_DESCRIPTION =
  'Lihat satu board/node dokumen aktif: {docId, rev, boardId, node}. node = properti tersimpan (token apa adanya, mis. {$token:...}) ' +
  '+ bounds [x,y,w,h] hasil render (dibulatkan, relatif board) + children bersarang sampai depth (default 2, 0–6; lebih dalam → childCount). ' +
  'Bila JSON > 32 KB depth diturunkan sampai muat dan truncated:true. ID tidak ada → NOT_FOUND; dokumen yang tidak bisa dirender → error yang sama dengan screenshot.';

/** Deskripsi tool `export`. */
export const EXPORT_DESCRIPTION =
  'Ekspor board/node dokumen aktif ke file PNG di disk daemon: <dataDir>/exports/<slug>/<id>-r<rev>@<scale>x.png. ' +
  'id = board atau node (default board pertama); scale 1 atau 2 (default 1; 2 = render asli 2× piksel). ' +
  'Mengembalikan {path, id, name, rev, scale, width, height, bytes} (width/height = piksel PNG). Gagal menulis → EXPORT_FAILED.';

/** Deskripsi tool `export_code` (epic kode story 5). */
export const EXPORT_CODE_DESCRIPTION =
  'Ekspor board/node dokumen aktif menjadi kode React (generator yang sama dengan dialog Export code di viewer; berkas identik). ' +
  "target 'react-tailwind' (default: <Nama>.tsx, components/*.tsx, tokens.css, theme.css Tailwind v4) atau 'react-css' (+ *.module.css). " +
  'Token menjadi var(--nama) dan master komponen menjadi components/<Nama>.tsx dengan props bertipe; instance menjadi pemakaiannya. ' +
  'components:false = semua di-inline; tokens:false = tanpa tokens.css; typescript:false = .jsx tanpa tipe. ' +
  'Mengembalikan blok JSON {docId, slug, rev, id, name, target, files:[{path, bytes}], warnings} lalu satu blok teks per berkas.';

/** Teks `export_code`: ringkasan JSON (tanpa isi berkas) lalu satu blok per berkas `----- path -----`. */
export type ExportCodeData = { files: { path: string; contents: string; bytes: number }[] } & Record<string, unknown>;
export function formatExportCode(data: ExportCodeData): CallToolResult['content'] {
  const { files, ...rest } = data;
  const head = { ...rest, files: files.map((f) => ({ path: f.path, bytes: f.bytes })) };
  return [{ type: 'text', text: JSON.stringify(head) }, ...files.map((f) => ({ type: 'text' as const, text: `----- ${f.path} -----\n${f.contents}` }))];
}

/** Deskripsi tool `paste` (epic paste-vektor story 3–4, AD-15). */
export const PASTE_DESCRIPTION =
  'Tempel SVG atau HTML ke board/frame dokumen aktif sebagai layer yang bisa diedit (importer yang sama dengan Ctrl+V di viewer; hasil identik). ' +
  'content = dokumen SVG utuh berakar <svg> (kind "svg", default) atau potongan HTML (kind "html"); parentId = ID board atau frame tujuan; x/y opsional (default: tengah parent; parent auto layout → ditambahkan di akhir tanpa x/y); ' +
  'name opsional (nama layer akar); description opsional (label riwayat, default "Paste SVG"/"Paste HTML"); width opsional (lebar viewport HTML, default lebar tujuan). ' +
  'HTML dirender di Chromium terisolasi (JavaScript mati, jaringan diblokir; gambar hanya data URI): flex/grid → auto layout, teks → text, <img> data → rect gambar, <svg> → path, tag semantik (nav, h1, p, button, …) → tag; ' +
  'computed style dipetakan ke properti Lakar; HTML/CSS mentah tidak disimpan. Report HTML: {kind:"html", layers, autoLayout, texts, images, vectors, dropped:[{kind: element|attribute|request|property|value|font|layout, name, count}]}. ' +
  'Satu bentuk → node path; beberapa bentuk → frame berisi path (path, rect, circle, ellipse, line, polyline, polygon; <g> diratakan, transform dipanggang ke d). ' +
  'fill/stroke solid, stroke-width, fill-rule, stroke-linecap/linejoin/miterlimit/dasharray/dashoffset, fill/stroke-opacity, paint-order, shape-rendering, opacity dipetakan ke properti path; ' +
  'yang lain (filter, mask, clip-path, gradien url(), <text>, <image>, <use>, <style>, <script>, …) dibuang dan dilaporkan. Satu paste = satu rev. ' +
  'Mengembalikan {docId, slug, rev, created, nodeId, boards, report:{kind, paths, kept:[atribut], dropped:[{kind: element|attribute|value, name, count}]}}. ' +
  'SVG rusak/tanpa bentuk, HTML tanpa isi terlihat, atau parent bukan board/frame → SCHEMA_INVALID; ID tidak ada → NOT_FOUND; belum open_doc → NO_ACTIVE_DOC; daemon tanpa Chromium (HTML) → RENDER_FAILED.';

/** Deskripsi tool `layout_check` (aturan gerbang G0). */
export const LAYOUT_CHECK_DESCRIPTION =
  'Check gerbang G0 pada board dokumen aktif (tanpa boardId = semua board). Board dirender lalu diperiksa: ' +
  'LC-01a emoji di teks; LC-01b glyph Unicode sebagai ikon (★☆✓✔✗→←↑↓↗↘▶◀• di awal teks; pakai node icon); ' +
  "LC-02a node terpotong clip board/frame (pengecualian: isi frame 'Crop / …' maks 2 per board, sumbu vertikal frame 'Scroll / …', node berotasi); " +
  'LC-05 teks lebih kecil dari 12px; ' +
  "LC-20 konten tertutup zona bawah (bar 'Overlay / …' atau frame/rect absolut ber-fill yang menempel bawah atau mengambang, termasuk kapsul ber-fill di dalam pembungkus absolut transparan, ditumpuk): " +
  'konten terakhir posisi akhir scroll berakhir ≤ y zona − 8, tidak ada kartu/teks/gambar terpotong di tepi atas zona, ' +
  'tidak ada judul seksi yang isinya tertutup zona, dan tidak ada konten terlihat terpotong di celah di bawah bar mengambang atau mengintip di celah antar-bar bertumpuk; ' +
  "LC-02b teks (ink terukur) meluap dari isi induk dan menabrak tepi/saudara (< 4px); " +
  'LC-02c non-teks (frame, rect, ikon, gambar) anak flow meluap dari isi induk ke padding/tepi wadah ber-cat terdekat dengan sisa < min(8, padding/2) atau tumpah keluar; ' +
  'LC-31 kartu ber-cat berisi teks terpotong atau rata di tepi bawah seksi/board (mockup di Crop, kartu tanpa ruang bawah), dan baris terakhir daftar/tabel rata di tepi bawah kartunya tanpa ruang bawah padahal ada ruang atas; ' +
  "LC-11 saudara tumpang tindih sebagian (kecuali 'Overlay / …', 'Crop / …', gap negatif); " +
  `LC-04 kontras teks setelah komposit < ${CONTRAST_MIN.text}:1 (teks ≥ ${LARGE_TEXT.size} atau ≥ ${LARGE_TEXT.boldSize} berat ≥ ${LARGE_TEXT.boldWeight}: < ${CONTRAST_MIN.large}:1; layer 'Placeholder' selalu ${CONTRAST_MIN.placeholder}:1; di atas gradien/opacity/blend = warning, di atas foto/noise/mesh dilewati), ` +
  `batas kontrol ${CONTROL_PREFIXES.map((p) => `'${p} …'`).join('/')} (stroke/fill, atau keturunan bercat) < ${CONTRAST_MIN.nonText}:1 terhadap latar, ` +
  `ikon tanpa label teks (di komponen tanpa teks, atau deretan ikon seperti bintang rating tanpa nilai) < ${CONTRAST_MIN.nonText}:1, ` +
  `dan warning scrim: teks di atas foto/gradien multi-hue/efek blur tanpa fill solid opacity ≥ ${String(SCRIM_MIN_ALPHA).replace('.', ',')} di antaranya; ` +
  'LC-12 (warning) ukuran board (mobile 390×844, app 1440×900 atau 1440×1024, landing lebar 1440, atau expectedSize), tinggi pas board mobile panjang dan board landing tanpa [WIP] (ruang kosong di bawah isi > 8 px → update tinggi; board height hug tidak dinilai), dan tabrakan antarboard (pakai place). ' +
  'Warning polesan: LC-18 kartu bersarang, LC-23 celah teks ↔ badge/tombol/ikon < 8, LC-24 proporsi badge di baris, LC-25 radius tidak konsentris, ' +
  'LC-26 ruang di atas judul ≤ bawah, LC-27 > 6 ukuran huruf, LC-28 baris > 80 karakter, LC-29 bobot < 400 di < 18px, LC-30 tanda baca (... dan tanda hubung rentang). ' +
  `Warning tipografi/spacing (token DESIGN.md): LC-03 teks wrap 'fixed' ≥ 2 baris atau teks melewati kotaknya, LC-06 paragraf (≥ 2 baris, ≥ 6 kata) < ${PARAGRAPH_MIN.landing}px di landing/mobile, < ${PARAGRAPH_MIN.app}px di app, < ${PARAGRAPH_MIN_IN_CARD}px di kartu ber-cat, ` +
  `LC-07 gap/padding di luar ${[...SPACING_VALUES].sort((a, b) => a - b).join('/')} (padding bawah ${HOME_INDICATOR_INSET} sah) dan tinggi komponen di luar token atau ${COMPONENT_SIZES.join('/')}, ` +
  `LC-08 ukuran di luar skala tipe atau line-height tak cocok token (KPI / Nilai ${KPI_SIZES.join('/')} dengan line-height × ${KPI_LINE_HEIGHT_RATIO} atau token, 'Display / …' ${DISPLAY_SIZES.join('/')}; < 12px = LC-05), LC-09 > 2 keluarga font (mono tidak dihitung), LC-10 target sentuh < ${TOUCH_MIN}×${TOUCH_MIN} di board mobile. ` +
  `Warning konten/seksi: LC-17 struktur seksi mirip (pasangan 'Seksi / …', atau anak tumpukan utama kolom, dengan multiset tipe node + ukuran font Jaccard ≥ 0,9; variasikan komposisi), ` +
  `LC-19 frasa terlarang (kata utuh, tanpa beda huruf; kecuali di 'Input / …' dan layer 'Label'): ${[...FORBIDDEN_PHRASES.id, ...FORBIDDEN_PHRASES.en].map((p) => `"${p}"`).join(', ')}. ` +
  "Struktural: LC-16 (error bukan gerbang) path ≤ 32×32 sebagai ikon (pakai node icon; bentuk sengaja 'Shape / …', grafik 'Chart / …'); " +
  "warning LC-14 absolut di dalam flex tanpa 'Overlay / …', LC-15 > 1 pustaka ikon UI, LC-21 radius > 3 nilai / spacer kosong / padding ganda mobile / teks langsung di baris tabel / > 1 bidang efek; " +
  'info (hanya di layout_check, tidak di execute) LC-13 nama layer default, LC-22 jumlah node Crop/Overlay/Scroll/Ekstra. ' +
  "Placeholder '[Skeleton] …' (dan isinya) tidak dinilai aturan mana pun; LC-33 (warning) placeholder skeleton tersisa di board tanpa [WIP] (isi dengan Build(id,{…}) atau remove). " +
  'Warning dan info maks 3 per aturan per board. ' +
  'Selesai bila 0 error gerbang. Output: satu baris ringkasan lalu satu baris per temuan ' +
  "'<level>[·gerbang] · <aturan> · <nama node> (<id>) · <terukur> · <seharusnya>' (maks 60 baris). " +
  'Board tidak ada → NOT_FOUND; dokumen yang tidak bisa dirender → error yang sama dengan screenshot.';

/** Deskripsi tool `execute`: harus menyebut setiap fungsi API exec (dites di tests/execute-description.test.ts). */
export const EXECUTE_DESCRIPTION =
  'Jalankan snippet JavaScript sinkron (sandbox QuickJS, tanpa fs/jaringan/import/await, batas 2 detik, maks 5000 op mutasi) terhadap dokumen aktif dalam satu transaksi: ' +
  'sukses = commit (rev +1), error tak tertangkap = rollback penuh. description WAJIB: label riwayat 3–8 kata. ' +
  'Fungsi global (ID = string 8 karakter, langsung bisa dipakai): ' +
  'add(parentId|null, node) → id (null = board di halaman; anak satu per satu, tanpa children bersarang); ' +
  'update(id, patch) merge dangkal, null menghapus properti opsional; ' +
  'replace(id, node) ganti semua properti (boleh ganti tipe), ID/posisi tetap; ' +
  'move(id, parentId|null, index?) pindah ke board/frame (null = urutan board); ' +
  'duplicate(id, patch?) → id salinan subtree tepat setelah asal; ' +
  'remove(id) hapus subtree; ' +
  "komponen: setComponent(id, {props, slots}?) jadikan master (null melepas), add(parent, {type:'instance', name, componentId, props?}) sisip instance, " +
  "update('<instanceId>/<idNodeMaster>', patch) override isi instance, resetOverride(alamat, props?) kembali ke master, add('<instanceId>/<idFrameSlot>', node) isi slot, " +
  'detach(instanceId) → id node biasa, get(alamat) node efektif; hapus master men-detach instancenya; ' +
  "setTokens({'colors.primary':'#0F62FE','spacing.4':16}) merge token, null menghapus (bertipe: {type, value, modes?}); " +
  "setTokenModes(['light','dark']) mode tema, board themeMode; " +
  'getTokens() → {tokens, modes} baca token dan mode; renameToken(from, to) ganti nama token + semua ref; ' +
  'importCssVariables(css) → {tokens, modes, skipped} token bertipe dari isi file CSS variables (:root + [data-theme="dark"]); ' +
  'get(id) → NodeView; find({type?, name?: string|RegExp, within?}) → NodeView[] urutan dokumen; children(id|null) → NodeView[] anak langsung (null = board); ' +
  "NodeView = properti tersimpan (token apa adanya) + parentId, path, childIds, measuredHeight (board height:'hug') (hanya-baca: jangan kirim balik ke update/add); " +
  "place(w, h|'hug', {near?, gap?}) → {x,y} posisi board baru yang tidak tumpang tindih (gap default 80); " +
  "iconSearch(query, {lib?:'lucide'|'simple-icons', limit?}) → [{lib, icon, tags?, title?, aliasOf?}] cari ikon (default 10, maks 50; sama dengan tool icon_search). " +
  "photo('<ref>') → {assetId, width, height, credit, license, creator, sourcePageUrl} foto stok untuk ref dari tool photo_search; tulis ref sebagai literal string " +
  "(daemon mengimpornya sekali sebelum snippet berjalan; ref dari variabel → NOT_FOUND), pakai di fills [{type:'image', assetId:p.assetId, fit:'cover'}]; credit untuk ringkasan akhir, bukan node UI kecuali diminta. " +
  'keep: objek JSON per sesi yang bertahan antar-execute bila sukses (mis. keep.hero = add(...); lalu get(keep.hero)). ' +
  "Helper desain bawaan (prelude skill core, sudah ada di setiap snippet; deklarasi ulang tetap sah): C/FONT (palet; dipulihkan dari keep.C/keep.FONT, dihapus saat open_doc pindah dokumen), Palette(c, font) palet utuh dari nilai bawaan + simpan di keep, R, TY, HEAD, fill, line, F, Row, T, I, Btn, Badge, " +
  "Skel(parent, nama, minHeight) placeholder '[Skeleton] nama', Build(id, patch) isi placeholder di tempat (placeholder: lepas prefiks + minHeight). " +
  'console.log(...) → data.logs. Nilai ekspresi terakhir → data.value (JSON; dipotong di 32 KB dengan valueTruncated). ' +
  "Katalog node v1 (tertutup): board (parent null) {type:'board', name, x, y, width, height (angka | 'hug' = ikut isi), screen:'landing'|'app'|'mobile', expectedSize?:{width,height}, fills?}; " +
  "frame {layout?:'none'|'row'|'column', gap? (boleh negatif), padding?: n|[v,h]|[t,r,b,l], align?:'start'|'center'|'end'|'stretch', justify?:'start'|'center'|'end'|'space-between', clip?, scrollY?}; " +
  "text {content, size, family?, weight? (100–900), style?:'normal'|'italic', lineHeight? px, letterSpacing? em, align?:'left'|'center'|'right'|'justify', wrap?:'auto'|'wrap'|'fixed', numeric?:'proportional'|'tabular', color?}; " +
  "rect {}; ellipse {startDeg?, sweepDeg? (-360..360), inner? [0,1)}; path {d, viewBox:[x,y,w,h]}; icon {lib:'lucide'|'simple-icons', icon (nama kanonik, mis. 'arrow-right'), size, color?, strokeWidth?, filled?}. " +
  "Icon: lucide = ikon UI, simple-icons = khusus logo brand; jangan pakai emoji/karakter sebagai ikon. Alias dikonversi otomatis ke nama kanonik (lucide 'home' → 'house'); " +
  "name default 'Icon / <lib> / <icon>'; version diisi otomatis (jangan dikirim). Lucide: stroke = color (default #000000), strokeWidth dalam unit grid 24 (default 2), " +
  'filled:true mengisi bentuk dengan color; simple-icons: fill = color (default warna brand), strokeWidth/filled diabaikan; kotak = size×size. ' +
  'Nama tidak dikenal → ICON_UNKNOWN dengan 3 saran nama kanonik (cari dulu dengan iconSearch atau tool icon_search). ' +
  "Semua node anak wajib name; sizing width/height: angka | 'hug' | 'fill' (+ minWidth/maxWidth/minHeight/maxHeight). " +
  "Efek (semua node anak, termasuk text dan icon): shadows[] {x,y,blur,spread?,color,type?:'drop'|'inner'}, opacity 0..1, blend, blur, backdropBlur, rotation. " +
  "Cat (frame/rect/ellipse/path; radius hanya frame/rect): fills[] ({type:'solid',color} | {type:'linear',angle,stops} | {type:'radial',center?,radius?,stops} | {type:'conic',angle?,center?,stops} | {type:'noise',opacity,size?,seed?,blend?,mono?} | {type:'mesh',columns,rows,colors (= columns×rows),points?} | {type:'image',assetId,fit}), " +
  "stroke {color, width, align:'inside'|'center'|'outside', sides?}, radius (n atau [tl,tr,br,bl]). " +
  "Warna: '#RRGGBB' atau '#RRGGBBAA'. Nilai boleh referensi token {$token:'colors.nama'} (token harus ada di dokumen). " +
  "x/y hanya untuk board, node anak dengan position:'absolute', atau anak frame layout:'none' (position:'absolute' ditambahkan otomatis). Kunci di luar skema ditolak (SCHEMA_INVALID). " +
  'Mengembalikan {docId, rev, created:[{id,name,path}], value?, valueTruncated?, logs?, check?, bounds?}: path = list nama dari board ke node (mis. [\'Home\',\'Hero / Card\',\'Judul\']), hanya untuk dibaca; alamati node lewat id. ' +
  'Snippet tanpa op yang sukses tidak menambah rev (tanpa check/bounds). ' +
  'Setelah snippet sukses, board yang tersentuh dirender dan dicek gerbang G0 sebelum commit (aturan: lihat tool layout_check): ' +
  'check {boards, summary:{error, warning, gate, info (selalu 0: temuan info hanya di layout_check)}, findings:[{level, rule, nodeId, nodeName, detail, expected}]} ditampilkan sebagai baris ringkas (maks 20), ' +
  'bounds {id:[x,y,w,h]} dibulatkan relatif board (board tersentuh, node baru, node berubah; maks 60, sisanya boundsTruncated). ' +
  'Temuan tidak membatalkan commit; perbaiki lalu execute lagi (daftar penuh: layout_check). ' +
  'Board tersentuh yang tidak bisa dirender (FONT_MISSING: keluarga tak terdaftar atau karakter di luar font; aset NOT_FOUND; ICON_UNKNOWN) → dokumen tidak di-commit, error membawa editId. ' +
  'Error menyebut baris:kolom snippet dan membawa editId: perbaiki tanpa mengirim ulang kode dengan execute({editId, edits:[{find, replace}]}) ' +
  '(find harus muncul tepat sekali; description diwarisi; edits kosong = jalankan ulang; editId hilang saat daemon restart → kirim code lengkap).';

/** Deskripsi tool `icon_search` (AD-9). */
export const ICON_SEARCH_DESCRIPTION =
  'Cari ikon untuk node icon di execute. Pustaka: lucide (ikon UI) dan simple-icons (KHUSUS logo brand, mis. github, whatsapp). ' +
  'Mengembalikan {query, results:[{lib, icon, tags?, title?, aliasOf?}]} urut relevansi: nama persis > awalan nama/alias > token nama > tag persis > tag sebagian (default 10, maks 50). ' +
  "Pakai lib + icon hasilnya apa adanya: add(b, {type:'icon', lib, icon, size}). icon = nama kanonik; alias (aliasOf ada) juga diterima dan otomatis disimpan sebagai nama kanonik. " +
  'Di dalam snippet execute, fungsi yang sama tersedia sebagai iconSearch(query, {lib?, limit?}).';

/** Maks thumbnail (image content) di hasil `photo_search`. */
export const PHOTO_THUMBNAILS_MAX = 6;

/** Deskripsi tool `photo_search`. */
export const PHOTO_SEARCH_DESCRIPTION =
  'Cari foto stok nyata untuk gambar di desain (sampul, kartu, hero, avatar orang/tempat, makanan, produk; bukan ikon fitur). Photos provided by Unsplash bila key Unsplash terpasang; ' +
  'selain itu Wikimedia Commons (foto CC0/Public Domain, CC BY, CC BY-SA; tersaring dan terurut mutu), cadangan Openverse (CC0, Public Domain Mark, CC BY). ' +
  'Mengembalikan teks JSON {provider, fallbackReason?, query, tried, results:[{ref, width, height, alt, avgColor?, creator, license, sourcePageUrl, credit}], previews} ' +
  `lalu thumbnail pratinjau (maks ${PHOTO_THUMBNAILS_MAX} gambar; previews:[ref] di JSON = urutan gambar). ` +
  "Pakai di execute: const p = photo('<ref>'); lalu fills:[{type:'image', assetId:p.assetId, fit:'cover'}] pada frame/rect bernama 'Image / …'. " +
  'Ref ditulis literal di kode; foto diimpor sekali saat execute (maks 6 foto baru per execute); halaman render tidak memakai jaringan (foto Unsplash disajikan daemon dari cache). ' +
  'Pilih kandidat dengan subjek jelas dan berwarna. ' +
  'credit = baris kredit siap pakai; atribusi (pembuat, lisensi, sumber) tercatat di metadata aset, jadi kredit tidak ditampilkan di UI kecuali pengguna memintanya; sebut kredit di ringkasan akhir. ' +
  "Kata kunci: 2–3 kata benda Inggris yang visual (tempat/objek/suasana); orang = '<peran> portrait' (mis. 'chef portrait'). orientation: landscape | portrait | square. " +
  'Bila kosong, daemon menyederhanakan kata kunci sendiri (query = yang dipakai, tried = yang dicoba): jangan mengulang pencarian. ' +
  'Cari di awal (maks 2 pencarian per desain, paralel, sebelum execute pertama). Tidak ada hasil → NOT_FOUND; penyedia sibuk/gagal → EXEC_ERROR (retryable): satu percobaan saja, lalu pakai blok gambar pengganti.';

/** Deskripsi tool `get_selection` (AD-9). */
export const GET_SELECTION_DESCRIPTION =
  'Baca node yang sedang dipilih pengguna di canvas viewer Lakar (seleksi hidup, hanya di memori daemon; tidak ada di dokumen maupun riwayat). ' +
  'Tanpa slug → dokumen aktif sesi; belum open_doc → dokumen yang terbuka di aplikasi, lalu dokumen yang seleksinya terakhir berubah. ' +
  'Mengembalikan {slug, rev, addresses, nodes:[{address, id, type, name, boardId, bounds?}], missing?, unmeasured?, updatedAt?}: ' +
  'addresses = urutan pilihan pengguna (ID atau alamat komposit id/id); bounds [x,y,w,h] hasil render, dibulatkan, relatif board (board = [0,0,w,h]); ' +
  'missing = alamat yang tidak ada lagi di dokumen; unmeasured = board yang gagal dirender (node tetap tercantum tanpa bounds). ' +
  'addresses kosong = pengguna belum memilih apa pun. Pakai id untuk inspect, execute (get/update), atau open_doc {slug} dulu bila slug bukan dokumen aktif. ' +
  'Tanpa dokumen aktif, tanpa dokumen terbuka, dan tanpa seleksi → NO_ACTIVE_DOC. Alur varian responsif dan cek konsistensi atas seleksi: read_skill selection.';

/** Deskripsi tool `open_doc` (spec-agent-open-doc). */
export const OPEN_DOC_DESCRIPTION =
  'Pilih dokumen kerja sesi ini; dokumen dipaku sampai open_doc berikutnya (pengguna pindah tab di aplikasi tidak memindahkannya). ' +
  'Tanpa argumen → dokumen yang sedang terbuka di aplikasi Lakar (source "viewer"); tidak ada dokumen terbuka → dokumen baru dibuat ' +
  '(nama dari name, default "Untitled") dan aplikasi membukanya sebagai tab (source "created"). ' +
  'slug → buka atau buat file tertentu (source "slug"); pakai hanya bila pengguna meminta file tertentu atau file baru. ' +
  'Slug: huruf kecil/angka/tanda hubung, cocok ^[a-z0-9][a-z0-9-]{0,63}$. ' +
  'Mengembalikan {docId, slug, rev, created, source, target:{slug, name, boardIds}, viewerOpen, hint?}; viewerOpen false = aplikasi Lakar tidak terbuka: sampaikan hint ke pengguna.';

/** Deskripsi tool `list_documents` (spec-agent-open-doc). */
export const LIST_DOCUMENTS_DESCRIPTION =
  'Daftar dokumen Lakar (bukan arsip), terbaru dulu: {documents:[{slug, name, rev, updatedAt, open, focused, active?}], focused, active?}. ' +
  'open = tampil di jendela aplikasi; focused = dokumen yang terakhir difokuskan pengguna (dipakai open_doc tanpa slug); active = dokumen kerja sesi ini. ' +
  'Pakai slug untuk open_doc {slug} bila pengguna menyebut file tertentu.';

/** Deskripsi tool `visual_diff` (spec-agent-visual-diff). */
export const VISUAL_DIFF_DESCRIPTION =
  'Bandingkan render board/node dokumen aktif di dua rev (snapshot History) untuk memastikan edit hanya mengubah area yang dimaksud. ' +
  "Tanpa fromRev → rev sebelum tulis terakhir sesi ini (execute/paste) di dokumen ini (base lastWrite); since 'session' → sebelum tulis pertama sesi (sessionStart); " +
  'sesi belum menulis → rev sebelumnya (previousRev). toRev default rev kini. Kirim boardId ATAU nodeId (default board pertama); nodeId → hanya bounds node (gabungan kedua rev). ' +
  'Mengembalikan gambar overlay (piksel berubah merah di atas "sesudah" yang dipudarkan, wilayah berbingkai biru) lalu JSON ' +
  '{boardId, nodeId?, fromRev, toRev, base, area:[x,y,w,h], size:{from,to}, sizeDelta?, missing?, changedPixels, changedRatio, regions:[{bounds:[x,y,w,h], pixels, nodes:[{id, name, state?}]}], regionsTruncated?}. ' +
  'Koordinat board; ukuran beda (board hug) disejajarkan kiri-atas dan selisihnya dihitung berubah; antialiasing diabaikan; board > 4 MP dibandingkan pada skala turun (scale), overlay maks 4096 px per sisi (overlayScale). ' +
  'regions[].nodes = node paling spesifik yang bersinggungan (state added/removed): node di luar rencana edit berarti ikut berubah. ' +
  "Rev tanpa snapshot atau board/node tidak ada di kedua rev → NOT_FOUND; board/node hanya ada di satu rev → missing 'from'|'to'.";

export function createLakarMcpServer(daemonUrl: string): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: SERVER_INSTRUCTIONS });
  // clientInfo harness (Claude Code, Codex, …) baru ada sesudah initialize; sesi daemon dibuat malas pada tool pertama.
  const client = new DaemonClient(daemonUrl, { agent: () => server.server.getClientVersion() });
  let executes = 0;

  server.registerTool(
    'status',
    { annotations: toolAnnotations('status'), description: STATUS_DESCRIPTION, inputSchema: z.object({}) },
    () => guarded(async () => asText(await client.status<StatusData>(), formatStatus)),
  );

  server.registerTool(
    'read_skill',
    {
      annotations: toolAnnotations('read_skill'),
      description: READ_SKILL_DESCRIPTION,
      inputSchema: z.object({ name: z.string().optional().describe('core | landing | mobile | webapp | layout | typography | color | accessibility | ui | interface | writing | review | icons | api | selection | break-ui | variants; kosongkan untuk daftar') }),
    },
    ({ name }) =>
      guarded(async () => {
        const r = await client.call<{ name: string; content: string } | { skills: { name: string; available: boolean }[] }>('/skills/read', name !== undefined ? { name } : {});
        return asText(r, (data) => ('content' in data ? data.content : JSON.stringify(data)));
      }),
  );

  server.registerTool(
    'list_boards',
    { annotations: toolAnnotations('list_boards'), description: LIST_BOARDS_DESCRIPTION, inputSchema: z.object({}) },
    () => guarded(async () => asText(await client.call('/boards', {}))),
  );

  server.registerTool(
    'inspect',
    {
      annotations: toolAnnotations('inspect'),
      description: INSPECT_DESCRIPTION,
      inputSchema: z.object({
        id: z.string().describe('ID board atau node'),
        depth: z.number().int().optional().describe('kedalaman children 0–6 (default 2)'),
      }),
    },
    ({ id, depth }) => guarded(async () => asText(await client.call('/inspect', depth !== undefined ? { id, depth } : { id }))),
  );

  server.registerTool(
    'export',
    {
      annotations: toolAnnotations('export'),
      description: EXPORT_DESCRIPTION,
      inputSchema: z.object({
        id: z.string().optional().describe('ID board/node; kosongkan untuk board pertama'),
        scale: z.number().int().optional().describe('1 atau 2 (default 1)'),
      }),
    },
    ({ id, scale }) =>
      guarded(async () => {
        const body: Record<string, unknown> = {};
        if (id !== undefined) body.id = id;
        if (scale !== undefined) body.scale = scale;
        return asText(await client.call('/export', body));
      }),
  );

  server.registerTool(
    'export_code',
    {
      annotations: toolAnnotations('export_code'),
      description: EXPORT_CODE_DESCRIPTION,
      inputSchema: z.object({
        id: z.string().optional().describe('ID board/node; kosongkan untuk board pertama'),
        target: z.enum(['react-tailwind', 'react-css']).optional().describe("'react-tailwind' (default) atau 'react-css'"),
        components: z.boolean().optional().describe('master sebagai berkas komponen terpisah (default true)'),
        tokens: z.boolean().optional().describe('sertakan tokens.css (default true)'),
        typescript: z.boolean().optional().describe('TSX bertipe (default true); false = JSX'),
      }),
    },
    (args) =>
      guarded(async () => {
        const body = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
        return asResult(await client.call<ExportCodeData>('/viewer/export-code', body), formatExportCode);
      }),
  );

  server.registerTool(
    'paste',
    {
      annotations: toolAnnotations('paste'),
      description: PASTE_DESCRIPTION,
      inputSchema: z.object({
        content: z.string().describe('dokumen SVG utuh (<svg …>…</svg>) atau potongan HTML (kind html)'),
        parentId: z.string().describe('ID board atau frame tujuan'),
        x: z.number().optional().describe('posisi x di parent (default tengah)'),
        y: z.number().optional().describe('posisi y di parent (default tengah)'),
        name: z.string().optional().describe('nama layer akar (default <title> SVG atau "SVG"; HTML: aria-label/id/kelas/tag akar)'),
        description: z.string().optional().describe('label riwayat (default "Paste SVG"/"Paste HTML")'),
        kind: z.enum(['svg', 'html']).optional().describe("jenis isi: 'svg' (default) atau 'html'"),
        width: z.number().optional().describe('HTML: lebar viewport px (default lebar board/frame tujuan)'),
      }),
    },
    (args) =>
      guarded(async () => {
        const body = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
        return asText(await client.call('/viewer/paste', body));
      }),
  );

  server.registerTool(
    'open_doc',
    {
      annotations: toolAnnotations('open_doc'),
      description: OPEN_DOC_DESCRIPTION,
      inputSchema: z.object({
        slug: z.string().optional().describe('slug file tertentu, mis. "landing-kopi"; kosongkan untuk dokumen yang terbuka di aplikasi Lakar'),
        name: z.string().optional().describe('nama dokumen baru bila tidak ada dokumen terbuka (default "Untitled"); diabaikan bila ada'),
      }),
    },
    ({ slug, name }) =>
      guarded(async () => {
        const body: Record<string, unknown> = {};
        if (slug !== undefined) body.slug = slug;
        if (name !== undefined) body.name = name;
        return asText(await client.call('/docs/open', body));
      }),
  );

  server.registerTool(
    'list_documents',
    { annotations: toolAnnotations('list_documents'), description: LIST_DOCUMENTS_DESCRIPTION, inputSchema: z.object({}) },
    () => guarded(async () => asText(await client.call('/viewer/documents', {}))),
  );

  // undo/redo agen (spec-agent-undo): hanya langkah execute/paste sesi ini; edit pengguna/agen lain sesudahnya → ditolak.
  for (const dir of ['undo', 'redo'] as const) {
    server.registerTool(
      dir,
      {
        annotations: toolAnnotations(dir),
        description:
          dir === 'undo'
            ? 'Batalkan langkah terakhir SESI INI di dokumen aktif (satu langkah = satu execute/paste yang meng-commit; default 1, steps maks 50). ' +
              'Setiap undo menjadi rev baru di riwayat ("Undo: <description>") dan tampil live di aplikasi. Tidak pernah membatalkan edit pengguna atau agen lain: ' +
              'ada rev lain sesudah langkah sesi ini → CONFLICT (inspect lalu perbaiki maju lewat execute). Tidak ada langkah (sesi baru, daemon restart, dokumen lain) → NOT_FOUND. ' +
              'Mengembalikan {docId, slug, rev, undone:[{description, rev}], boards, available:{undo, redo}, target}.'
            : 'Ulangi langkah yang baru di-undo sesi ini (default 1). Hanya bila tidak ada rev lain sesudah undo; execute/paste baru mengosongkan redo. ' +
              'Penolakan sama dengan undo (CONFLICT/NOT_FOUND). Mengembalikan {docId, slug, rev, redone:[{description, rev}], boards, available:{undo, redo}, target}.',
        inputSchema: z.object({ steps: z.number().int().optional().describe('jumlah langkah 1–50 (default 1)') }),
      },
      ({ steps }) => guarded(async () => asText(await client.call(`/viewer/${dir}`, steps !== undefined ? { steps } : {}))),
    );
  }

  server.registerTool(
    'execute',
    {
      annotations: toolAnnotations('execute'),
      description: EXECUTE_DESCRIPTION,
      inputSchema: z.object({
        code: z.string().optional().describe('snippet JavaScript (kosongkan bila memperbaiki lewat editId)'),
        description: z.string().optional().describe('WAJIB untuk snippet baru: label riwayat 3–8 kata, mis. "tambah hero landing kopi"; diwarisi saat perbaikan editId'),
        editId: z.string().optional().describe('editId dari error execute sebelumnya (sesi yang sama); jangan dikirim bersama code'),
        edits: z
          .array(z.object({ find: z.string().describe('potongan teks persis yang muncul tepat sekali'), replace: z.string() }))
          .optional()
          .describe('edit find/replace berurutan terhadap snippet editId; kosong = jalankan ulang'),
      }),
    },
    async ({ code, description, editId, edits }) => {
      // Dihitung per instance server (= satu sesi agen), sukses maupun error.
      const n = ++executes;
      return withExecuteCount(
        await guarded(async () => {
          const body: Record<string, unknown> = {};
          if (code !== undefined) body.code = code;
          if (description !== undefined) body.description = description;
          if (editId !== undefined) body.editId = editId;
          if (edits !== undefined) body.edits = edits;
          return asText(await client.call<ExecuteData>('/execute', body), formatExecute);
        }),
        n,
      );
    },
  );

  server.registerTool(
    'screenshot',
    {
      annotations: toolAnnotations('screenshot'),
      description:
        'Render board dokumen aktif ke PNG (default skala 1). Tanpa argumen → board pertama di halaman pertama. ' +
        'nodeId → potret satu node saja (ukuran bounds node). Kirim boardId ATAU nodeId, bukan keduanya (SCHEMA_INVALID). ' +
        'scale 2 → PNG 2× piksel untuk zoom review area terpadat (skill review); scale lain → SCHEMA_INVALID.',
      inputSchema: z.object({
        boardId: z.string().optional().describe('ID board dari created[] execute atau list_boards'),
        nodeId: z.string().optional().describe('ID node yang dipotret sendiri (bukan bersama boardId)'),
        scale: z.number().int().optional().describe('1 (default) atau 2 (zoom review: 2× piksel)'),
      }),
    },
    ({ boardId, nodeId, scale }) =>
      guarded(async () => {
        const body: Record<string, unknown> = {};
        if (boardId !== undefined) body.boardId = boardId;
        if (nodeId !== undefined) body.nodeId = nodeId;
        if (scale !== undefined) body.scale = scale;
        const r = await client.call<{ boardId: string; nodeId?: string; width: number; height: number; mimeType: string; png: string }>('/screenshot', body);
        return asResult(r, ({ png, ...meta }) => [
          { type: 'image', data: png, mimeType: 'image/png' },
          { type: 'text', text: JSON.stringify(meta) },
        ]);
      }),
  );

  server.registerTool(
    'icon_search',
    {
      annotations: toolAnnotations('icon_search'),
      description: ICON_SEARCH_DESCRIPTION,
      inputSchema: z.object({
        query: z.string().describe('kata kunci, mis. "dumbbell", "arrow right", "github"'),
        lib: z.enum(['lucide', 'simple-icons']).optional().describe('batasi pustaka: lucide (ikon UI) atau simple-icons (logo brand)'),
        limit: z.number().int().optional().describe('jumlah hasil 1–50 (default 10)'),
      }),
    },
    ({ query, lib, limit }) =>
      guarded(async () => {
        const body: Record<string, unknown> = { query };
        if (lib !== undefined) body.lib = lib;
        if (limit !== undefined) body.limit = limit;
        return asText(await client.call('/icons/search', body));
      }),
  );

  server.registerTool(
    'photo_search',
    {
      annotations: toolAnnotations('photo_search'),
      description: PHOTO_SEARCH_DESCRIPTION,
      inputSchema: z.object({
        query: z.string().describe('kata kunci foto, mis. "kamar hotel" atau "hotel room"'),
        orientation: z.enum(['landscape', 'portrait', 'square']).optional().describe('orientasi foto'),
        limit: z.number().int().optional().describe('jumlah hasil 1–12 (default 6)'),
      }),
    },
    ({ query, orientation, limit }) =>
      guarded(async () => {
        const body: Record<string, unknown> = { query };
        if (orientation !== undefined) body.orientation = orientation;
        if (limit !== undefined) body.limit = limit;
        type Thumb = { ref: string; mimeType: string; data: string };
        const r = await client.call<{ thumbnails?: Thumb[] } & Record<string, unknown>>('/photos/search', body);
        return asResult(r, ({ thumbnails = [], ...rest }) => {
          const shown = thumbnails.slice(0, PHOTO_THUMBNAILS_MAX);
          return [
            { type: 'text', text: JSON.stringify({ ...rest, previews: shown.map((t) => t.ref) }) },
            ...shown.map((t) => ({ type: 'image' as const, data: t.data, mimeType: t.mimeType })),
          ];
        });
      }),
  );

  server.registerTool(
    'get_selection',
    {
      annotations: toolAnnotations('get_selection'),
      description: GET_SELECTION_DESCRIPTION,
      inputSchema: z.object({ slug: z.string().optional().describe('slug dokumen; kosongkan untuk dokumen aktif sesi (atau dokumen dengan seleksi terakhir)') }),
    },
    ({ slug }) => guarded(async () => asText(await client.call('/viewer/selection', slug !== undefined ? { slug } : {}))),
  );

  server.registerTool(
    'visual_diff',
    {
      annotations: toolAnnotations('visual_diff'),
      description: VISUAL_DIFF_DESCRIPTION,
      inputSchema: z.object({
        boardId: z.string().optional().describe('ID board; kosongkan untuk board pertama'),
        nodeId: z.string().optional().describe('ID node: bandingkan hanya bounds node ini (bukan bersama boardId)'),
        fromRev: z.number().int().optional().describe('rev "sebelum"; kosongkan untuk rev sebelum tulis terakhir sesi ini'),
        toRev: z.number().int().optional().describe('rev "sesudah" (default rev kini)'),
        since: z.enum(['last', 'session']).optional().describe("tanpa fromRev: 'last' (default) = sebelum tulis terakhir sesi, 'session' = sebelum tulis pertama sesi"),
      }),
    },
    (args) =>
      guarded(async () => {
        const body = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
        const r = await client.call<{ png: string } & Record<string, unknown>>('/viewer/visual-diff', body);
        return asResult(r, ({ png, ...meta }) => [
          { type: 'image', data: png, mimeType: 'image/png' },
          { type: 'text', text: JSON.stringify(meta) },
        ]);
      }),
  );

  server.registerTool(
    'layout_check',
    {
      annotations: toolAnnotations('layout_check'),
      description: LAYOUT_CHECK_DESCRIPTION,
      inputSchema: z.object({ boardId: z.string().optional().describe('ID board; kosongkan untuk semua board dokumen aktif') }),
    },
    ({ boardId }) =>
      guarded(async () => {
        return asText(await client.call<LayoutCheckData>('/layout-check', boardId ? { boardId } : {}), formatLayoutCheck);
      }),
  );

  // spec-check-autofix: fix_check (deskripsi, format, dan registrasi di fix-check.ts).
  registerFixCheckTool(server, client);

  return server;
}
