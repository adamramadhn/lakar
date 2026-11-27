// Input strict (spec-mcp-strict-inputs): semua inputSchema tool = z.object().strict() —
// kunci argumen salah eja/tak dikenal → error validasi (bukan di-strip diam-diam).
import { afterEach, describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { LAKAR_VERSION, SCHEMA_VERSION } from '@lakar/schema';
import { createLakarMcpServer } from './index.js';

let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = undefined;
});

async function fakeDaemon(): Promise<string> {
  server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      const data = req.url === '/sessions' ? { sessionId: 'S'.repeat(36), version: LAKAR_VERSION, schemaVersion: SCHEMA_VERSION } : { boards: [] };
      res.end(JSON.stringify({ ok: true, data }));
    });
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

async function connect(url: string) {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await createLakarMcpServer(url).connect(st);
  const c = new Client({ name: 'tes', version: '0' });
  await c.connect(ct);
  return c;
}

const text = (r: { content?: unknown }) =>
  ((r.content as { type: string; text?: string }[] | undefined)?.map((t) => t.text ?? '').join('\n') ?? '');

describe('inputSchema strict', () => {
  it.each([
    ['read_skill', { name: 'core', salah_eja: 'x' }, 'salah_eja'],
    ['undo', { step: 2 }, 'step'],
    ['status', { foo: 1 }, 'foo'],
    ['inspect', { id: 'Abcdef01', kedalaman: 3 }, 'kedalaman'],
  ])('%s dengan kunci tak dikenal → error validasi menyebut kuncinya', async (tool, args, key) => {
    const c = await connect(await fakeDaemon());
    const r = await c.callTool({ name: tool, arguments: args });
    expect(r.isError, JSON.stringify(r.content)).toBe(true);
    expect(text(r), JSON.stringify(r.content)).toContain(key);
    await c.close();
  });

  it('argumen valid tetap lolos validasi (sampai ke daemon)', async () => {
    const c = await connect(await fakeDaemon());
    const r = await c.callTool({ name: 'list_boards', arguments: {} });
    expect(r.isError, JSON.stringify(r.content)).toBeFalsy();
    await c.close();
  });
});
