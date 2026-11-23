// Tool undo/redo agen (spec-agent-undo): diteruskan ke POST /viewer/undo|redo dalam sesi; steps opsional; error
// daemon (CONFLICT saat pengguna sudah mengedit) diteruskan apa adanya beserta hint.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { LAKAR_VERSION, SCHEMA_VERSION } from '@lakar/schema';
import { SERVER_INSTRUCTIONS, createLakarMcpServer } from './index.js';

type Seen = { path: string; session?: string; body: unknown };
const seen: Seen[] = [];
let refuse = false;
let server: Server;
let url: string;

beforeAll(async () => {
  server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : {};
    seen.push({ path: req.url ?? '', session: req.headers['x-lakar-session'] as string | undefined, body });
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (req.url === '/sessions') return send(200, { ok: true, data: { sessionId: 'S1', version: LAKAR_VERSION, schemaVersion: SCHEMA_VERSION } });
    if (refuse) {
      return send(409, { ok: false, error: { code: 'CONFLICT', message: 'undo ditolak: pengguna (aplikasi Lakar) mengedit dokumen demo', hint: 'perbaiki maju lewat execute', retryable: false } });
    }
    const key = req.url === '/viewer/undo' ? 'undone' : 'redone';
    return send(200, { ok: true, data: { docId: 'Dddddddd', slug: 'demo', rev: 7, [key]: [{ description: 'tambah hero', rev: 7 }], boards: ['Bbbbbbbb'], available: { undo: 0, redo: 1 } } });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

async function connect() {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await createLakarMcpServer(url).connect(st);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(ct);
  return client;
}

describe('tool undo/redo', () => {
  it('terdaftar dengan input {steps?}; instructions menyebut undo dan perbaiki maju', async () => {
    const c = await connect();
    const { tools } = await c.listTools();
    for (const name of ['undo', 'redo']) {
      const t = tools.find((x) => x.name === name)!;
      expect(t, name).toBeDefined();
      expect(Object.keys((t.inputSchema as any).properties)).toEqual(['steps']);
      expect((t.inputSchema as any).required ?? []).toEqual([]);
      expect(t.description).toContain('CONFLICT');
    }
    expect(SERVER_INSTRUCTIONS).toContain('undo {steps?}');
    expect(SERVER_INSTRUCTIONS).toContain('perbaiki maju lewat execute');
  });

  it('undo/redo → POST /viewer/undo|redo dalam sesi; steps hanya bila diisi; teks JSON', async () => {
    seen.length = 0;
    refuse = false;
    const c = await connect();
    const r = await c.callTool({ name: 'undo', arguments: {} });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse((r.content as any[])[0].text)).toMatchObject({ rev: 7, undone: [{ description: 'tambah hero' }] });
    await c.callTool({ name: 'redo', arguments: { steps: 2 } });
    const calls = seen.filter((s) => s.path !== '/sessions');
    expect(calls.map((s) => [s.path, s.body])).toEqual([
      ['/viewer/undo', {}],
      ['/viewer/redo', { steps: 2 }],
    ]);
    for (const s of calls) expect(s.session).toBe('S1');
  });

  it('penolakan daemon → isError dengan kode, pesan, dan hint', async () => {
    refuse = true;
    try {
      const c = await connect();
      const r = await c.callTool({ name: 'undo', arguments: {} });
      expect(r.isError).toBe(true);
      const text = (r.content as any[])[0].text as string;
      expect(text).toContain('CONFLICT');
      expect(text).toContain('perbaiki maju lewat execute');
    } finally {
      refuse = false;
    }
  });
});
