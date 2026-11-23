// Identitas agen (spec-canvas-agent-effects): DaemonClient mengirim clientInfo harness sebagai header `x-lakar-agent`
// hanya saat membuat sesi. Daemon palsu (http) mencatat header tiap permintaan.
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { LAKAR_VERSION, SCHEMA_VERSION } from '@lakar/schema';
import { AGENT_HEADER, DaemonClient, agentHeader } from './client.js';

let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = undefined;
});

async function fakeDaemon(): Promise<{ url: string; seen: { path: string; headers: IncomingHttpHeaders }[] }> {
  const seen: { path: string; headers: IncomingHttpHeaders }[] = [];
  server = createServer((req, res) => {
    seen.push({ path: req.url ?? '', headers: req.headers });
    req.resume();
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      const data = req.url === '/sessions' ? { sessionId: 'S'.repeat(36), version: LAKAR_VERSION, schemaVersion: SCHEMA_VERSION } : { boards: [] };
      res.end(JSON.stringify({ ok: true, data }));
    });
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  return { url: `http://127.0.0.1:${(server!.address() as AddressInfo).port}`, seen };
}

describe('agentHeader', () => {
  it('nama dipangkas, karakter non-ASCII dibuang, maks 64; kosong/tanpa info → undefined', () => {
    expect(agentHeader({ name: ' claude-code ', version: '2.1.0' })).toBe('claude-code');
    expect(agentHeader({ name: 'codéx\n' })).toBe('codx');
    expect(agentHeader({ name: 'a'.repeat(80) })).toBe('a'.repeat(64));
    expect(agentHeader({ name: '  ' })).toBeUndefined();
    expect(agentHeader(undefined)).toBeUndefined();
  });
});

describe('DaemonClient + agent', () => {
  it('header x-lakar-agent hanya di POST /sessions', async () => {
    const d = await fakeDaemon();
    const client = new DaemonClient(d.url, { agent: () => ({ name: 'claude-code', version: '2.1.0' }) });
    await client.call('/boards', {});
    expect(d.seen.map((s) => s.path)).toEqual(['/sessions', '/boards']);
    expect(d.seen[0]!.headers[AGENT_HEADER]).toBe('claude-code');
    expect(d.seen[1]!.headers[AGENT_HEADER]).toBeUndefined();
  });

  it('tanpa clientInfo atau getter melempar → tanpa header, sesi tetap dibuat', async () => {
    const d = await fakeDaemon();
    await new DaemonClient(d.url, { agent: () => undefined }).call('/boards', {});
    await new DaemonClient(d.url, {
      agent: () => {
        throw new Error('belum initialize');
      },
    }).call('/boards', {});
    await new DaemonClient(d.url).call('/boards', {});
    const sessions = d.seen.filter((s) => s.path === '/sessions');
    expect(sessions).toHaveLength(3);
    for (const s of sessions) expect(s.headers[AGENT_HEADER]).toBeUndefined();
  });
});
