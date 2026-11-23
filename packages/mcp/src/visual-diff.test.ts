// Tool MCP `visual_diff` (spec-agent-visual-diff): terdaftar dengan deskripsi dan skema input, meneruskan argumen ke
// POST /visual-diff, menyajikan overlay sebagai gambar (seperti screenshot) + JSON meta tanpa base64, dan error daemon.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { LAKAR_VERSION, SCHEMA_VERSION } from '@lakar/schema';
import { SERVER_INSTRUCTIONS, VISUAL_DIFF_DESCRIPTION, createLakarMcpServer } from './server.js';

const PNG_B64 = Buffer.from('fake-overlay').toString('base64');

function fakeDaemon() {
  const seen: { path: string; body: any }[] = [];
  const server: Server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : {};
    seen.push({ path: req.url!, body });
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (req.url === '/sessions') return send(200, { ok: true, data: { sessionId: 's1', version: LAKAR_VERSION, schemaVersion: SCHEMA_VERSION } });
    if (req.url === '/viewer/visual-diff') {
      if (body.fromRev === 99) return send(404, { ok: false, error: { code: 'NOT_FOUND', message: 'versi r99 dokumen a tidak punya snapshot', hint: 'versi ini dibuat sebelum snapshot tersedia', retryable: false } });
      return send(200, {
        ok: true,
        data: {
          docId: 'Dddddddd', slug: 'a', rev: 4, boardId: 'Bbbbbbbb', fromRev: 3, toRev: 4, base: 'lastWrite', area: [0, 0, 390, 844],
          size: { from: [390, 844], to: [390, 844] }, changedPixels: 120, changedRatio: 0.0004,
          regions: [{ bounds: [16, 40, 120, 20], pixels: 120, nodes: [{ id: 'Tttttttt', name: 'Title' }] }],
          mimeType: 'image/png', png: PNG_B64,
        },
      });
    }
    send(404, {});
  });
  return {
    seen,
    server,
    async listen() {
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    },
  };
}

async function connect(url: string) {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await createLakarMcpServer(url).connect(st);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(ct);
  return client;
}

describe('tool MCP visual_diff', () => {
  const fake = fakeDaemon();
  let url: string;
  beforeAll(async () => {
    url = await fake.listen();
  });
  afterAll(() => new Promise<void>((r) => fake.server.close(() => r())));

  it('terdaftar: deskripsi menyebut default rev, overlay, regions, nodes, ukuran beda, dan error; skema input', async () => {
    const c = await connect(url);
    const tool = (await c.listTools()).tools.find((t) => t.name === 'visual_diff')!;
    expect(tool.description).toBe(VISUAL_DIFF_DESCRIPTION);
    for (const s of ['tulis terakhir sesi', "since 'session'", 'previousRev', 'boardId ATAU nodeId', 'changedRatio', 'regions:[{bounds:[x,y,w,h], pixels, nodes', 'sizeDelta', 'antialiasing diabaikan', 'NOT_FOUND', "missing 'from'|'to'"]) {
      expect(VISUAL_DIFF_DESCRIPTION).toContain(s);
    }
    expect(Object.keys((tool.inputSchema as { properties: Record<string, unknown> }).properties).sort()).toEqual(['boardId', 'fromRev', 'nodeId', 'since', 'toRev']);
    expect(SERVER_INSTRUCTIONS).toContain('visual_diff');
  });

  it('meneruskan argumen ke POST /visual-diff; hasil = gambar overlay + JSON meta tanpa png', async () => {
    const c = await connect(url);
    fake.seen.length = 0;
    const r = await c.callTool({ name: 'visual_diff', arguments: { nodeId: 'Tttttttt', since: 'session' } });
    expect(r.isError).toBeFalsy();
    expect(fake.seen.find((x) => x.path === '/viewer/visual-diff')!.body).toEqual({ nodeId: 'Tttttttt', since: 'session' });
    const content = r.content as any[];
    expect(content[0]).toEqual({ type: 'image', data: PNG_B64, mimeType: 'image/png' });
    const meta = JSON.parse(content[1].text);
    expect(meta).toMatchObject({ boardId: 'Bbbbbbbb', fromRev: 3, toRev: 4, base: 'lastWrite', changedRatio: 0.0004 });
    expect(meta.regions[0].nodes[0].id).toBe('Tttttttt');
    expect(meta).not.toHaveProperty('png');

    fake.seen.length = 0;
    await c.callTool({ name: 'visual_diff', arguments: {} });
    expect(fake.seen.find((x) => x.path === '/viewer/visual-diff')!.body).toEqual({});
  });

  it('error daemon → isError dengan kode dan hint', async () => {
    const c = await connect(url);
    const r = await c.callTool({ name: 'visual_diff', arguments: { fromRev: 99 } });
    expect(r.isError).toBe(true);
    expect((r.content as any)[0].text).toContain('NOT_FOUND');
  });
});
