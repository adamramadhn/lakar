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
      description:
        'Jalankan snippet JavaScript sinkron (sandbox QuickJS, tanpa fs/jaringan, batas 2 detik) terhadap dokumen aktif dalam satu transaksi: ' +
        'sukses = commit (rev +1), error tak tertangkap = rollback penuh. API: add(parentId|null, node) → id (string 8 karakter, langsung bisa dipakai). ' +
        "Katalog node v1 (tertutup): board (parent null) {type:'board', name, x, y, width, height, screen:'landing'|'app'|'mobile', expectedSize?:{width,height}, fills?}; " +
        "frame {layout?:'none'|'row'|'column', gap? (boleh negatif), padding?: n|[v,h]|[t,r,b,l], align?:'start'|'center'|'end'|'stretch', justify?:'start'|'center'|'end'|'space-between', clip?, scrollY?, children lewat add}; " +
        "text {content, size, family?, weight? (100–900), style?:'normal'|'italic', lineHeight? px, letterSpacing? em, align?:'left'|'center'|'right'|'justify', wrap?:'auto'|'wrap'|'fixed', numeric?:'proportional'|'tabular', color?}; " +
        "rect {}; ellipse {startDeg?, sweepDeg? (-360..360), inner? [0,1)}; path {d, viewBox:[x,y,w,h]}; icon {lib:'lucide'|'simple-icons', icon (nama kanonik, mis. 'arrow-right'), size, color?, strokeWidth?, filled?}. " +
        "Semua node anak wajib name; sizing width/height: angka | 'hug' | 'fill' (+ minWidth/maxWidth/minHeight/maxHeight). " +
        "Efek (semua node anak, termasuk text dan icon): shadows[] {x,y,blur,spread?,color,type?:'drop'|'inner'}, opacity 0..1, blend, blur, backdropBlur, rotation. " +
        "Cat (frame/rect/ellipse/path; radius hanya frame/rect): fills[] ({type:'solid',color} | {type:'linear',angle,stops} | {type:'radial',center?,radius?,stops} | {type:'image',assetId,fit}), " +
        "stroke {color, width, align:'inside'|'center'|'outside', sides?}, radius (n atau [tl,tr,br,bl]). " +
        "Warna: '#RRGGBB' atau '#RRGGBBAA'. Nilai boleh referensi token {$token:'colors.nama'} (token harus ada di dokumen). " +
        "x/y hanya untuk board atau node anak dengan position:'absolute'. Kunci di luar skema ditolak (SCHEMA_INVALID). " +
        'Mengembalikan {docId, rev, created:[{id,name,path}]}.',
      inputSchema: z.object({
        code: z.string().describe('snippet JavaScript'),
        description: z.string().optional().describe('label singkat 3–8 kata untuk riwayat'),
      }),
    },
    ({ code, description }) => guarded(async () => asText(await client.call('/execute', { code, description }))),
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
