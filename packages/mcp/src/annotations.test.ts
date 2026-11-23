// Anotasi tool MCP (epic adopsi open-pencil story 2): `tools/list` memuat readOnlyHint/destructiveHint untuk setiap
// tool sesuai tabel efek `TOOL_EFFECTS`; tool tanpa baris tabel atau tanpa anotasi membuat tes gagal.
import { describe, expect, it } from 'vitest';
import { isDeepStrictEqual } from 'node:util';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { TOOL_EFFECTS, createLakarMcpServer, toolAnnotations } from './index.js';

// Daemon tidak dihubungi: tools/list tidak memanggil lakard (sesi dibuat malas pada tool pertama).
const DEAD_URL = 'http://127.0.0.1:9';

async function listTools(server: McpServer = createLakarMcpServer(DEAD_URL)) {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(ct);
  const { tools } = await client.listTools();
  await client.close();
  await server.close();
  return tools;
}

type ListedTool = Awaited<ReturnType<typeof listTools>>[number];

/** Pelanggaran aturan anotasi di daftar tool (kosong = lolos). */
function annotationProblems(tools: readonly ListedTool[]): string[] {
  const effects: Record<string, string> = TOOL_EFFECTS;
  const problems: string[] = [];
  for (const t of tools) {
    const effect = effects[t.name];
    if (!effect) problems.push(`${t.name}: tidak ada di TOOL_EFFECTS`);
    else if (!t.annotations) problems.push(`${t.name}: tanpa annotations`);
    else if (!isDeepStrictEqual(t.annotations, toolAnnotations(t.name as keyof typeof TOOL_EFFECTS))) {
      problems.push(`${t.name}: annotations ${JSON.stringify(t.annotations)} tidak sesuai efek ${effect}`);
    }
  }
  const listed = new Set(tools.map((t) => t.name));
  for (const name of Object.keys(effects)) if (!listed.has(name)) problems.push(`${name}: ada di TOOL_EFFECTS tetapi tidak terdaftar`);
  return problems;
}

describe('anotasi tool MCP', () => {
  it('setiap tool di tools/list membawa anotasi sesuai TOOL_EFFECTS, dan tabel = daftar tool', async () => {
    expect(annotationProblems(await listTools())).toEqual([]);
  });

  it('pemetaan efek terkunci: baca → readOnlyHint true; tulis → destructiveHint hanya bila menghapus/menimpa isi pengguna', async () => {
    const byName = Object.fromEntries((await listTools()).map((t) => [t.name, t.annotations]));
    const read = ['status', 'read_skill', 'list_boards', 'list_documents', 'inspect', 'screenshot', 'layout_check', 'get_selection', 'icon_search', 'photo_search', 'export_code', 'visual_diff'];
    const write = ['open_doc', 'paste', 'import_url', 'export', 'undo'];
    const destructive = ['execute', 'redo', 'fix_check'];
    expect([...read, ...write, ...destructive].sort()).toEqual(Object.keys(byName).sort());
    for (const n of read) expect(byName[n], n).toEqual({ readOnlyHint: true });
    for (const n of write) expect(byName[n], n).toEqual({ readOnlyHint: false, destructiveHint: false });
    for (const n of destructive) expect(byName[n], n).toEqual({ readOnlyHint: false, destructiveHint: true });
  });

  it('tool baru tanpa efek (tanpa anotasi dan di luar tabel) terdeteksi sebagai pelanggaran', async () => {
    const server = createLakarMcpServer(DEAD_URL);
    server.registerTool('tool_baru', { description: 'uji', inputSchema: z.object({}) }, () => ({ content: [] }));
    expect(annotationProblems(await listTools(server))).toEqual(['tool_baru: tidak ada di TOOL_EFFECTS']);
  });

  it('registrasi tanpa anotasi terdeteksi; anotasi hanya menambah field, nama/deskripsi/input/output tool lama sama', async () => {
    // Server pembanding: registerTool yang membuang annotations (seperti sebelum story ini).
    const original = McpServer.prototype.registerTool;
    const strip = function (this: McpServer, name: string, config: { annotations?: unknown }, cb: unknown) {
      return (original as (...args: unknown[]) => unknown).call(this, name, { ...config, annotations: undefined }, cb);
    };
    McpServer.prototype.registerTool = strip as unknown as typeof original;
    let bare: ListedTool[];
    try {
      bare = await listTools();
    } finally {
      McpServer.prototype.registerTool = original;
    }
    expect(annotationProblems(bare)).toEqual(bare.map((t) => `${t.name}: tanpa annotations`));
    const annotated = await listTools();
    expect(annotated.map((t) => ({ ...t, annotations: undefined }))).toEqual(bare);
  });

  it('toolAnnotations mengembalikan salinan baru (tabel bersama tidak bisa diubah lewat hasilnya)', () => {
    const a = toolAnnotations('status');
    a.readOnlyHint = false;
    expect(toolAnnotations('status')).toEqual({ readOnlyHint: true });
  });
});
