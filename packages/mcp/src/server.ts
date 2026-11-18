// Server MCP Lakar (v2): tool open_doc, execute, screenshot → HTTP lakard.
import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { ApiResult } from '@lakar/schema';
import { DaemonClient, formatError } from './client.js';

export const SERVER_NAME = 'lakar';
export const SERVER_VERSION = '0.0.0';

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
  'place(w, h, {near?, gap?}) → {x,y} posisi board baru yang tidak tumpang tindih (gap default 80). ' +
  'keep: objek JSON per sesi yang bertahan antar-execute bila sukses (mis. keep.hero = add(...); lalu get(keep.hero)). ' +
  'console.log(...) → data.logs. Nilai ekspresi terakhir → data.value (JSON; dipotong di 32 KB dengan valueTruncated). ' +
  "Katalog node v1 (tertutup): board (parent null) {type:'board', name, x, y, width, height, screen:'landing'|'app'|'mobile', expectedSize?:{width,height}, fills?}; " +
  "frame {layout?:'none'|'row'|'column', gap? (boleh negatif), padding?: n|[v,h]|[t,r,b,l], align?:'start'|'center'|'end'|'stretch', justify?:'start'|'center'|'end'|'space-between', clip?, scrollY?}; " +
  "text {content, size, family?, weight? (100–900), style?:'normal'|'italic', lineHeight? px, letterSpacing? em, align?:'left'|'center'|'right'|'justify', wrap?:'auto'|'wrap'|'fixed', numeric?:'proportional'|'tabular', color?}; " +
  "rect {}; ellipse {startDeg?, sweepDeg? (-360..360), inner? [0,1)}; path {d, viewBox:[x,y,w,h]}; icon {lib:'lucide'|'simple-icons', icon (nama kanonik, mis. 'arrow-right'), size, color?, strokeWidth?, filled?}. " +
  "Semua node anak wajib name; sizing width/height: angka | 'hug' | 'fill' (+ minWidth/maxWidth/minHeight/maxHeight). " +
  "Efek (semua node anak, termasuk text dan icon): shadows[] {x,y,blur,spread?,color,type?:'drop'|'inner'}, opacity 0..1, blend, blur, backdropBlur, rotation. " +
  "Cat (frame/rect/ellipse/path; radius hanya frame/rect): fills[] ({type:'solid',color} | {type:'linear',angle,stops} | {type:'radial',center?,radius?,stops} | {type:'image',assetId,fit}), " +
  "stroke {color, width, align:'inside'|'center'|'outside', sides?}, radius (n atau [tl,tr,br,bl]). " +
  "Warna: '#RRGGBB' atau '#RRGGBBAA'. Nilai boleh referensi token {$token:'colors.nama'} (token harus ada di dokumen). " +
  "x/y hanya untuk board atau node anak dengan position:'absolute'. Kunci di luar skema ditolak (SCHEMA_INVALID). " +
  'Mengembalikan {docId, rev, created:[{id,name,path}], value?, valueTruncated?, logs?}: path = list nama dari board ke node (mis. [\'Home\',\'Hero / Card\',\'Judul\']), hanya untuk dibaca; alamati node lewat id. ' +
  'Snippet tanpa op yang sukses tidak menambah rev. ' +
  'Error menyebut baris:kolom snippet dan membawa editId: perbaiki tanpa mengirim ulang kode dengan execute({editId, edits:[{find, replace}]}) ' +
  '(find harus muncul tepat sekali; description diwarisi; edits kosong = jalankan ulang; editId hilang saat daemon restart → kirim code lengkap).';

export function createLakarMcpServer(daemonUrl: string): McpServer {
  const client = new DaemonClient(daemonUrl);
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

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
        return asText(await client.call('/execute', body));
      }),
  );

  server.registerTool(
    'screenshot',
    {
      description: 'Render board dokumen aktif ke PNG (skala 1). Tanpa boardId → board pertama di halaman pertama.',
      inputSchema: z.object({ boardId: z.string().optional().describe('ID board dari created[] execute') }),
    },
    ({ boardId }) =>
      guarded(async () => {
        const r = await client.call<{ boardId: string; width: number; height: number; mimeType: string; png: string }>(
          '/screenshot',
          boardId ? { boardId } : {},
        );
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

  return server;
}
