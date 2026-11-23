// Tool MCP fix_check (spec-check-autofix): registrasi + skema input, body diteruskan ke /viewer/fix-check, output ringkas,
// error daemon, dan kalimat instruksi server.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { LAKAR_VERSION, SCHEMA_VERSION } from '@lakar/schema';
import { FIX_CHECK_DESCRIPTION, SERVER_INSTRUCTIONS, createLakarMcpServer, formatFixCheck, type FixCheckData } from './index.js';

const seen: { path: string; body: any }[] = [];
const DATA: FixCheckData = {
  rev: 7,
  dryRun: false,
  boards: [{ id: 'Bbbbbbbb' }],
  summary: { error: 1, warning: 0, gate: 1, info: 0 },
  applied: [{ rule: 'LC-30', nodeId: 'Tttt0001', nodeName: 'Jam', kind: 'fix', label: 'Fix punctuation', ops: [{ op: 'update', id: 'Tttt0001', patch: { content: '09.00–10.00' } }] }],
  skipped: [{ rule: 'LC-29', nodeId: 'Tttt0002', nodeName: 'Tipis', kind: 'fix', label: 'Weight 400', ops: [], reason: 'stale', detail: 'target Tttt0002 changed since the check' }],
  remaining: [
    {
      level: 'error',
      rule: 'LC-05',
      nodeId: 'Tttt0003',
      nodeName: 'Kecil',
      detail: 'size 10px',
      expected: '≥ 12',
      suggestions: [{ label: 'Size 12', ops: [{ op: 'update', id: 'Tttt0003', patch: { size: 12 } }] }],
    },
  ],
  newFindings: [],
};

let server: Server;
let url: string;
beforeAll(async () => {
  server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : {};
    seen.push({ path: req.url!, body });
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (req.url === '/sessions') return send(200, { ok: true, data: { sessionId: 's1', version: LAKAR_VERSION, schemaVersion: SCHEMA_VERSION } });
    if (req.url === '/viewer/fix-check') {
      if (body.boardId === 'Zzzzzzzz') return send(404, { ok: false, error: { code: 'NOT_FOUND', message: 'board Zzzzzzzz tidak ada di dokumen a', hint: 'pakai ID board', retryable: false } });
      return send(200, { ok: true, data: { docId: 'Dddddddd', slug: 'a', ...DATA } });
    }
    send(404, {});
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

async function connect() {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await createLakarMcpServer(url).connect(st);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(ct);
  return client;
}

describe('fix_check (MCP)', () => {
  it('terdaftar dengan skema {boardId?, codes?, suggestions?, dryRun?}; deskripsi menyebut satu rev dan alasan skipped', async () => {
    const c = await connect();
    const tool = (await c.listTools()).tools.find((t) => t.name === 'fix_check')!;
    expect(Object.keys((tool.inputSchema as any).properties).sort()).toEqual(['boardId', 'codes', 'dryRun', 'suggestions']);
    expect((tool.inputSchema as any).required ?? []).toEqual([]);
    expect(tool.description).toBe(FIX_CHECK_DESCRIPTION);
    expect(FIX_CHECK_DESCRIPTION).toContain('satu rev (satu langkah undo');
    expect(FIX_CHECK_DESCRIPTION).toMatch(/stale.*token.*conflict.*invalid/);
    expect(SERVER_INSTRUCTIONS).toContain('fix_check');
  });

  it('argumen diteruskan apa adanya (tanpa undefined); output ringkas: kepala, diterapkan, dilewati, sisa + saran', async () => {
    const c = await connect();
    seen.length = 0;
    const r = await c.callTool({ name: 'fix_check', arguments: { codes: ['LC-30'], suggestions: true } });
    expect(seen.find((x) => x.path === '/viewer/fix-check')!.body).toEqual({ codes: ['LC-30'], suggestions: true });
    const text = (r.content as any)[0].text as string;
    expect(text).toBe(formatFixCheck(DATA));
    expect(text.split('\n')).toEqual([
      'fix_check rev 7: 1 diterapkan, 1 dilewati; sesudah: 1 error (1 gerbang), 0 warning',
      'diterapkan · fix · LC-30 · Jam (Tttt0001) · Fix punctuation',
      'dilewati · stale · LC-29 · Tipis (Tttt0002) · Weight 400 · target Tttt0002 changed since the check',
      'sisa · error·gerbang · LC-05 · Kecil (Tttt0003) · size 10px · ≥ 12 · saran: Size 12',
    ]);
    expect(formatFixCheck({ ...DATA, dryRun: true }).split('\n')[0]).toContain('(dryRun: tidak di-commit)');
  });

  it('kode tool tak dikenal ditolak skema; error daemon → isError dengan kode', async () => {
    const c = await connect();
    const nf = await c.callTool({ name: 'fix_check', arguments: { boardId: 'Zzzzzzzz' } });
    expect(nf.isError).toBe(true);
    expect((nf.content as any)[0].text).toMatch(/^NOT_FOUND: board Zzzzzzzz/);
    const bad = await c.callTool({ name: 'fix_check', arguments: { codes: ['LC-99'] } });
    expect(bad.isError).toBe(true);
  });
});
