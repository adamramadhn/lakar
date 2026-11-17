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
        "Node: board {type:'board', name, x, y, width, height, screen:'landing'|'app'|'mobile'} (parent null); " +
        "frame {type:'frame', name, layout?:'none'|'row'|'column', gap?, padding?, align?:'start'|'center'|'end'|'stretch', justify?:'start'|'center'|'end'|'space-between', width?, height?, position?:'absolute', x?, y?}; " +
        "text {type:'text', name, content, size, color?:'#RRGGBB'}. x/y hanya untuk board atau frame position:'absolute'. " +
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
