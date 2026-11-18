// Server MCP Lakar: 10 tool v1 (AD-11) → HTTP lakard: status, read_skill, open_doc, list_boards, execute,
// inspect, layout_check, screenshot, export, icon_search.
import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { LAKAR_VERSION, SCHEMA_VERSION, findingLine, summaryText, type ApiResult, type Finding, type FindingSummary } from '@lakar/schema';
import { DaemonClient, VERSION_HINT, formatError } from './client.js';

export const SERVER_NAME = 'lakar';
export const SERVER_VERSION = LAKAR_VERSION;

const errorResult = (text: string): CallToolResult => ({ isError: true, content: [{ type: 'text', text }] });

async function guarded(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (e) {
    return errorResult((e as Error).message);
  }
}

function asText<T>(r: ApiResult<T>): CallToolResult {
  if (!r.ok) return errorResult(formatError(r.error));
  return { content: [{ type: 'text', text: JSON.stringify(r.data) }] };
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
  const ss = st.sessions;
  const sessions = ss
    ? `sesi: ${ss.count}${ss.active.length ? ` (${ss.active.map((a) => `${a.id} ${a.activeSlug ?? '-'}, ${a.executes} execute`).join('; ')})` : ''}`
    : 'sesi: -';
  return [head, pool, fonts, icons, sessions].join('\n');
}

/** Deskripsi tool `status`. */
export const STATUS_DESCRIPTION =
  'Status lakard: versi daemon dan mcp (cocok/tidak), pool render (halaman siap/sibuk/antre, dibuat ulang), font hilang, versi ikon, sesi aktif. ' +
  'Tetap bekerja walau versi tidak cocok. Daemon mati → error berisi cara menjalankan service (systemctl --user start lakard).';

/** Deskripsi tool `read_skill`. */
export const READ_SKILL_DESCRIPTION =
  'Baca panduan skill Lakar (Markdown). Tanpa name → daftar {skills:[{name, available}]}; dengan name → isi skill. ' +
  'Nama: core, landing, mobile, icons, api. Nama lain atau skill yang belum tersedia → NOT_FOUND dengan daftar yang tersedia.';

/** Deskripsi tool `list_boards`. */
export const LIST_BOARDS_DESCRIPTION =
  'Daftar board dokumen aktif: {docId, slug, rev, boards:[{id, name, page, screen, x, y, width, height, expectedSize?, wip, childCount}]}. ' +
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

/** Deskripsi tool `layout_check` (aturan gerbang G0). */
export const LAYOUT_CHECK_DESCRIPTION =
  'Check gerbang G0 pada board dokumen aktif (tanpa boardId = semua board). Board dirender lalu diperiksa: ' +
  'LC-01a emoji di teks; LC-01b glyph Unicode sebagai ikon (★☆✓✔✗→←↑↓↗↘▶◀• di awal teks; pakai node icon); ' +
  "LC-02a node terpotong clip board/frame (pengecualian: isi frame 'Crop / …' maks 2 per board, sumbu vertikal frame 'Scroll / …', node berotasi); " +
  'LC-05 teks lebih kecil dari 12px; ' +
  "LC-20 konten terakhir tertutup bar bawah 'Overlay / …' (berakhir ≤ y bar − 8; dicek pada posisi akhir scroll); " +
  'LC-12 (warning) ukuran board (mobile 390×844, app 1440×900 atau 1440×1024, landing lebar 1440, atau expectedSize) dan tabrakan antarboard (pakai place). ' +
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
  "setTokens({'colors.primary':'#0F62FE','spacing.4':16}) merge token, null menghapus; " +
  'get(id) → NodeView; find({type?, name?: string|RegExp, within?}) → NodeView[] urutan dokumen; children(id|null) → NodeView[] anak langsung (null = board); ' +
  'NodeView = properti tersimpan (token apa adanya) + parentId, path, childIds (hanya-baca: jangan kirim balik ke update/add); ' +
  'place(w, h, {near?, gap?}) → {x,y} posisi board baru yang tidak tumpang tindih (gap default 80); ' +
  "iconSearch(query, {lib?:'lucide'|'simple-icons', limit?}) → [{lib, icon, tags?, title?, aliasOf?}] cari ikon (default 10, maks 50; sama dengan tool icon_search). " +
  'keep: objek JSON per sesi yang bertahan antar-execute bila sukses (mis. keep.hero = add(...); lalu get(keep.hero)). ' +
  'console.log(...) → data.logs. Nilai ekspresi terakhir → data.value (JSON; dipotong di 32 KB dengan valueTruncated). ' +
  "Katalog node v1 (tertutup): board (parent null) {type:'board', name, x, y, width, height, screen:'landing'|'app'|'mobile', expectedSize?:{width,height}, fills?}; " +
  "frame {layout?:'none'|'row'|'column', gap? (boleh negatif), padding?: n|[v,h]|[t,r,b,l], align?:'start'|'center'|'end'|'stretch', justify?:'start'|'center'|'end'|'space-between', clip?, scrollY?}; " +
  "text {content, size, family?, weight? (100–900), style?:'normal'|'italic', lineHeight? px, letterSpacing? em, align?:'left'|'center'|'right'|'justify', wrap?:'auto'|'wrap'|'fixed', numeric?:'proportional'|'tabular', color?}; " +
  "rect {}; ellipse {startDeg?, sweepDeg? (-360..360), inner? [0,1)}; path {d, viewBox:[x,y,w,h]}; icon {lib:'lucide'|'simple-icons', icon (nama kanonik, mis. 'arrow-right'), size, color?, strokeWidth?, filled?}. " +
  "Icon: lucide = ikon UI, simple-icons = khusus logo brand; jangan pakai emoji/karakter sebagai ikon. Alias dikonversi otomatis ke nama kanonik (lucide 'home' → 'house'); " +
  "name default 'Icon / <lib> / <icon>'; version diisi otomatis (jangan dikirim). Lucide: stroke = color (default #000000), strokeWidth dalam unit grid 24 (default 2), " +
  'filled:true mengisi bentuk dengan color; simple-icons: fill = color (default warna brand), strokeWidth/filled diabaikan; kotak = size×size. ' +
  'Nama tidak dikenal → ICON_UNKNOWN dengan 3 saran nama kanonik (cari dulu dengan iconSearch atau tool icon_search). ' +
  "Semua node anak wajib name; sizing width/height: angka | 'hug' | 'fill' (+ minWidth/maxWidth/minHeight/maxHeight). " +
  "Efek (semua node anak, termasuk text dan icon): shadows[] {x,y,blur,spread?,color,type?:'drop'|'inner'}, opacity 0..1, blend, blur, backdropBlur, rotation. " +
  "Cat (frame/rect/ellipse/path; radius hanya frame/rect): fills[] ({type:'solid',color} | {type:'linear',angle,stops} | {type:'radial',center?,radius?,stops} | {type:'image',assetId,fit}), " +
  "stroke {color, width, align:'inside'|'center'|'outside', sides?}, radius (n atau [tl,tr,br,bl]). " +
  "Warna: '#RRGGBB' atau '#RRGGBBAA'. Nilai boleh referensi token {$token:'colors.nama'} (token harus ada di dokumen). " +
  "x/y hanya untuk board atau node anak dengan position:'absolute'. Kunci di luar skema ditolak (SCHEMA_INVALID). " +
  'Mengembalikan {docId, rev, created:[{id,name,path}], value?, valueTruncated?, logs?, check?, bounds?}: path = list nama dari board ke node (mis. [\'Home\',\'Hero / Card\',\'Judul\']), hanya untuk dibaca; alamati node lewat id. ' +
  'Snippet tanpa op yang sukses tidak menambah rev (tanpa check/bounds). ' +
  'Setelah snippet sukses, board yang tersentuh dirender dan dicek gerbang G0 sebelum commit (aturan: lihat tool layout_check): ' +
  'check {boards, summary:{error, warning, gate}, findings:[{level, rule, nodeId, nodeName, detail, expected}]} ditampilkan sebagai baris ringkas (maks 20), ' +
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

export function createLakarMcpServer(daemonUrl: string): McpServer {
  const client = new DaemonClient(daemonUrl);
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    'status',
    { description: STATUS_DESCRIPTION, inputSchema: z.object({}) },
    () =>
      guarded(async () => {
        const r = await client.status<StatusData>();
        if (!r.ok) return errorResult(formatError(r.error));
        return { content: [{ type: 'text', text: formatStatus(r.data) }] };
      }),
  );

  server.registerTool(
    'read_skill',
    {
      description: READ_SKILL_DESCRIPTION,
      inputSchema: z.object({ name: z.string().optional().describe('core | landing | mobile | icons | api; kosongkan untuk daftar') }),
    },
    ({ name }) =>
      guarded(async () => {
        const r = await client.call<{ name: string; content: string } | { skills: { name: string; available: boolean }[] }>('/skills/read', name !== undefined ? { name } : {});
        if (!r.ok) return errorResult(formatError(r.error));
        return { content: [{ type: 'text', text: 'content' in r.data ? r.data.content : JSON.stringify(r.data) }] };
      }),
  );

  server.registerTool(
    'list_boards',
    { description: LIST_BOARDS_DESCRIPTION, inputSchema: z.object({}) },
    () => guarded(async () => asText(await client.call('/boards', {}))),
  );

  server.registerTool(
    'inspect',
    {
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
    'open_doc',
    {
      description:
        'Buka (atau buat bila belum ada) dokumen Lakar berdasarkan slug dan jadikan dokumen aktif sesi ini. ' +
        'Slug: huruf kecil/angka/tanda hubung, cocok ^[a-z0-9][a-z0-9-]{0,63}$. Mengembalikan {docId, slug, rev, created}.',
      inputSchema: z.object({ slug: z.string().describe('slug dokumen, mis. "landing-kopi"') }),
    },
    ({ slug }) => guarded(async () => asText(await client.call('/docs/open', { slug }))),
  );

  server.registerTool(
    'execute',
    {
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
    ({ code, description, editId, edits }) =>
      guarded(async () => {
        const body: Record<string, unknown> = {};
        if (code !== undefined) body.code = code;
        if (description !== undefined) body.description = description;
        if (editId !== undefined) body.editId = editId;
        if (edits !== undefined) body.edits = edits;
        const r = await client.call<ExecuteData>('/execute', body);
        if (!r.ok) return errorResult(formatError(r.error));
        return { content: [{ type: 'text', text: formatExecute(r.data) }] };
      }),
  );

  server.registerTool(
    'screenshot',
    {
      description:
        'Render board dokumen aktif ke PNG (skala 1). Tanpa argumen → board pertama di halaman pertama. ' +
        'nodeId → potret satu node saja (ukuran bounds node). Kirim boardId ATAU nodeId, bukan keduanya (SCHEMA_INVALID).',
      inputSchema: z.object({
        boardId: z.string().optional().describe('ID board dari created[] execute atau list_boards'),
        nodeId: z.string().optional().describe('ID node yang dipotret sendiri (bukan bersama boardId)'),
      }),
    },
    ({ boardId, nodeId }) =>
      guarded(async () => {
        const body: Record<string, unknown> = {};
        if (boardId !== undefined) body.boardId = boardId;
        if (nodeId !== undefined) body.nodeId = nodeId;
        const r = await client.call<{ boardId: string; nodeId?: string; width: number; height: number; mimeType: string; png: string }>('/screenshot', body);
        if (!r.ok) return errorResult(formatError(r.error));
        const { png, ...meta } = r.data;
        return {
          content: [
            { type: 'image', data: png, mimeType: 'image/png' },
            { type: 'text', text: JSON.stringify(meta) },
          ],
        };
      }),
  );

  server.registerTool(
    'icon_search',
    {
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
    'layout_check',
    {
      description: LAYOUT_CHECK_DESCRIPTION,
      inputSchema: z.object({ boardId: z.string().optional().describe('ID board; kosongkan untuk semua board dokumen aktif') }),
    },
    ({ boardId }) =>
      guarded(async () => {
        const r = await client.call<LayoutCheckData>('/layout-check', boardId ? { boardId } : {});
        if (!r.ok) return errorResult(formatError(r.error));
        return { content: [{ type: 'text', text: formatLayoutCheck(r.data) }] };
      }),
  );

  return server;
}
