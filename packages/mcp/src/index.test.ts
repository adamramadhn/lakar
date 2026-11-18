import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, request, type IncomingMessage, type Server } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { LAKAR_VERSION, SCHEMA_VERSION } from '@lakar/schema';
import { PACKAGE, READ_SKILL_DESCRIPTION, SERVER_INSTRUCTIONS, SERVER_VERSION, createLakarMcpServer, formatStatus } from './index.js';
import { readFile } from 'node:fs/promises';

/** Skill v1 (packages/skills; mcp tidak bergantung pada paket itu, hanya membaca file untuk perbandingan). */
const SKILL_NAMES = ['core', 'landing', 'mobile', 'icons', 'api'] as const;
const readSkill = (name: string) => readFile(fileURLToPath(new URL(`../../skills/skills/${name}.md`, import.meta.url)), 'utf8');

const PNG_B64 = Buffer.from('fake-png').toString('base64');

type Seen = { path: string; session?: string; body: any };

const manyFindings = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ level: 'error', rule: 'LC-05', nodeId: `Tttt${String(i).padStart(4, '0')}`, nodeName: `Caption ${i}`, detail: 'size 11px', expected: '≥ 12' }));

/** Daemon tiruan: meniru bentuk respons AD-11 lakard. */
function fakeDaemon() {
  const seen: Seen[] = [];
  let sessions = 0;
  let restartOnce = false;
  /** 'reject' = 409 VERSION_MISMATCH; 'old' = respons tanpa versi (lakard lama); undefined = cocok. */
  let versionMode: 'reject' | 'old' | undefined;
  const server: Server = createServer(async (req: IncomingMessage, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : {};
    const session = req.headers['x-lakar-session'] as string | undefined;
    seen.push({ path: req.url!, session, body });
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (req.url === '/status') {
      return send(200, {
        ok: true,
        data: {
          version: versionMode ? '0.0.9' : LAKAR_VERSION,
          schemaVersion: SCHEMA_VERSION,
          node: 'v26.1.0',
          pid: 1234,
          startedAt: '2026-11-18T00:00:00.000Z',
          uptimeSec: 185,
          host: '127.0.0.1',
          port: 7466,
          dataDir: '/data',
          pool: { size: 2, ready: 2, idle: 2, busy: 0, waiting: 0, recreated: 0, peakBusy: 1, browserVersion: '140.0' },
          fonts: { families: ['Inter', 'Manrope'], missing: [] },
          icons: { lucide: '1.74.0', 'simple-icons': '16.38.0' },
          sessions: { count: 1, active: [{ id: 'a1b2c3d4', activeSlug: 'landing-kopi', createdAt: 'x', executes: 3 }] },
        },
      });
    }
    if (req.url === '/sessions') {
      if (versionMode === 'reject') {
        return send(409, { ok: false, error: { code: 'VERSION_MISMATCH', message: `versi tidak cocok: lakard 0.0.9, lakar-mcp ${body.version}`, hint: 'systemctl --user restart lakard', retryable: false } });
      }
      if (versionMode === 'old') return send(200, { ok: true, data: { sessionId: `s${++sessions}` } });
      return send(200, { ok: true, data: { sessionId: `s${++sessions}`, version: LAKAR_VERSION, schemaVersion: SCHEMA_VERSION } });
    }
    if (restartOnce) {
      restartOnce = false;
      return send(401, { ok: false, error: { code: 'NOT_FOUND', message: 'sesi tidak dikenal', hint: '', retryable: false } });
    }
    if (req.url === '/docs/open') return send(200, { ok: true, data: { docId: 'Dddddddd', slug: body.slug, rev: 0, created: true } });
    if (req.url === '/execute') {
      if (body.code === 'boom') {
        return send(422, { ok: false, error: { code: 'EXEC_ERROR', message: 'baris 1:1: error tak tertangkap', hint: 'perbaiki', retryable: false, editId: 'Eeeeeeee' } });
      }
      if (body.code === 'check') {
        return send(200, {
          ok: true,
          data: {
            docId: 'Dddddddd',
            rev: 4,
            created: [],
            check: { boards: ['Bbbbbbbb'], summary: { error: 25, warning: 0, gate: 25 }, findings: manyFindings(25) },
            bounds: { Bbbbbbbb: [0, 0, 390, 844] },
          },
        });
      }
      if (body.editId === 'Eeeeeeee') return send(200, { ok: true, data: { docId: 'Dddddddd', rev: 2, created: [], value: 1, logs: 'halo' } });
      return send(200, { ok: true, data: { docId: 'Dddddddd', rev: 1, created: [{ id: 'Bbbbbbbb', name: 'Tracer', path: ['Tracer'] }] } });
    }
    if (req.url === '/layout-check') {
      if (body.boardId === 'Zzzzzzzz') return send(404, { ok: false, error: { code: 'NOT_FOUND', message: 'board Zzzzzzzz tidak ada', hint: 'pakai ID board', retryable: false } });
      return send(200, { ok: true, data: { docId: 'Dddddddd', rev: 3, boards: [{ id: 'Bbbbbbbb', name: 'Home', summary: { error: 70, warning: 0, gate: 70 } }], summary: { error: 70, warning: 0, gate: 70 }, findings: manyFindings(70) } });
    }
    if (req.url === '/icons/search') {
      if (!body.query) return send(400, { ok: false, error: { code: 'SCHEMA_INVALID', message: 'query: wajib', hint: 'kirim {query}', retryable: false } });
      const results = body.query === 'dumbbell' ? [{ lib: 'lucide', icon: 'dumbbell', tags: ['gym'] }] : [];
      return send(200, { ok: true, data: { query: body.query, results } });
    }
    if (req.url === '/boards') return send(200, { ok: true, data: { docId: 'Dddddddd', slug: 'a', rev: 1, boards: [{ id: 'Bbbbbbbb', name: '[WIP] Home', wip: true }] } });
    if (req.url === '/inspect') {
      if (body.id === 'Zzzzzzzz') return send(404, { ok: false, error: { code: 'NOT_FOUND', message: 'node Zzzzzzzz tidak ada', hint: 'pakai ID', retryable: false } });
      return send(200, { ok: true, data: { docId: 'Dddddddd', rev: 1, boardId: 'Bbbbbbbb', node: { id: body.id, bounds: [0, 0, 10, 10] } } });
    }
    if (req.url === '/export') {
      if (body.scale === 3) return send(400, { ok: false, error: { code: 'SCHEMA_INVALID', message: 'scale: 1 atau 2', hint: 'kirim scale 1|2', retryable: false } });
      return send(200, { ok: true, data: { path: '/data/exports/a/Bbbbbbbb-r1@2x.png', id: 'Bbbbbbbb', name: 'Home', rev: 1, scale: body.scale ?? 1, width: 780, height: 1688, bytes: 10 } });
    }
    if (req.url === '/skills/read') {
      if (body.name === undefined) return send(200, { ok: true, data: { skills: [{ name: 'core', available: true }] } });
      if (body.name === 'core') return send(200, { ok: true, data: { name: 'core', content: '# core\nisi' } });
      return send(404, { ok: false, error: { code: 'NOT_FOUND', message: `skill "${body.name}" tidak ada`, hint: 'skill dikenal: core, landing, mobile, icons, api; tersedia: core', retryable: false } });
    }
    if (req.url === '/screenshot') {
      if (body.boardId === 'ZZZZZZZZ') return send(404, { ok: false, error: { code: 'NOT_FOUND', message: 'board tidak ada', hint: 'pakai id', retryable: false } });
      return send(200, { ok: true, data: { boardId: 'Bbbbbbbb', width: 390, height: 844, mimeType: 'image/png', png: PNG_B64 } });
    }
    send(404, {});
  });
  return {
    seen,
    server,
    restartOnce: () => (restartOnce = true),
    setVersionMode: (m: 'reject' | 'old' | undefined) => (versionMode = m),
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

describe('@lakar/mcp', () => {
  const fake = fakeDaemon();
  let url: string;
  beforeAll(async () => {
    url = await fake.listen();
  });
  afterAll(() => fake.server.close());

  it('mengekspor nama paket', () => {
    expect(PACKAGE).toBe('@lakar/mcp');
  });

  it('daftar tool v1 lengkap (10, AD-11); SERVER_VERSION = LAKAR_VERSION', async () => {
    const c = await connect(url);
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['execute', 'export', 'icon_search', 'inspect', 'layout_check', 'list_boards', 'open_doc', 'read_skill', 'screenshot', 'status'].sort(),
    );
    expect(SERVER_VERSION).toBe(LAKAR_VERSION);
    expect(c.getServerVersion()?.version).toBe(LAKAR_VERSION);
  });

  it('instructions server: read_skill core lalu skill jenis layar, sedikit execute besar; deskripsi read_skill menyarankan urutan', async () => {
    const c = await connect(url);
    const ins = c.getInstructions() ?? '';
    expect(ins).toBe(SERVER_INSTRUCTIONS);
    expect(ins.indexOf('read_skill core')).toBeGreaterThanOrEqual(0);
    expect(ins.indexOf('read_skill core')).toBeLessThan(ins.indexOf('landing atau mobile'));
    expect(ins).toContain('sedikit execute besar');
    expect(READ_SKILL_DESCRIPTION).toMatch(/core dulu.*landing atau mobile/);
  });

  it('sesi dibuat dengan versi mcp: POST /sessions {client, version, schemaVersion}', async () => {
    fake.seen.length = 0;
    const c = await connect(url);
    await c.callTool({ name: 'open_doc', arguments: { slug: 'v' } });
    expect(fake.seen[0]).toMatchObject({ path: '/sessions', body: { client: 'lakar-mcp', version: LAKAR_VERSION, schemaVersion: SCHEMA_VERSION } });
  });

  it('status → teks ringkas (versi cocok, pool, font, ikon, sesi) tanpa sesi', async () => {
    fake.seen.length = 0;
    const c = await connect(url);
    const r = await c.callTool({ name: 'status', arguments: {} });
    expect(r.isError).toBeFalsy();
    const text = (r.content as any)[0].text as string;
    expect(text.split('\n')).toEqual([
      `lakard ${LAKAR_VERSION} (schema ${SCHEMA_VERSION}, node v26.1.0, pid 1234, uptime 3m) · mcp ${LAKAR_VERSION}: cocok`,
      'pool: 2 halaman · 2 siap · 0 sibuk · 0 antre · dibuat ulang 0× · chromium 140.0',
      'font: 2 keluarga, hilang: -',
      'ikon: lucide 1.74.0, simple-icons 16.38.0',
      'sesi: 1 (a1b2c3d4 landing-kopi, 3 execute)',
    ]);
    expect(fake.seen.map((x) => x.path)).toEqual(['/status']);
  });

  it.each(['reject', 'old'] as const)('versi beda (%s) → setiap tool VERSION_MISMATCH + hint restart; status tetap jalan; pulih setelah daemon cocok', async (mode) => {
    fake.setVersionMode(mode);
    try {
      const c = await connect(url);
      for (const [name, args] of [['open_doc', { slug: 'x' }], ['list_boards', {}], ['execute', { code: '1', description: 'uji versi beda mcp' }]] as const) {
        const r = await c.callTool({ name, arguments: args });
        expect(r.isError, name).toBe(true);
        expect((r.content as any)[0].text).toMatch(/^VERSION_MISMATCH: versi tidak cocok/);
        expect((r.content as any)[0].text).toContain('systemctl --user restart lakard');
      }
      const st = await c.callTool({ name: 'status', arguments: {} });
      expect(st.isError).toBeFalsy();
      expect((st.content as any)[0].text).toMatch(/mcp \S+: TIDAK cocok/);
      fake.setVersionMode(undefined);
      expect((await c.callTool({ name: 'open_doc', arguments: { slug: 'x' } })).isError).toBeFalsy();
    } finally {
      fake.setVersionMode(undefined);
    }
  });

  it('lakard lama tanpa route (404 bawaan fastify, bukan bentuk AD-11) → status dan tool lain VERSION_MISMATCH terformat, bukan TypeError', async () => {
    // Bentuk 404 bawaan fastify persis: {message, error, statusCode}.
    const old = createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        if (req.url === '/sessions') {
          res.writeHead(200, { 'content-type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, data: { sessionId: 'lama' } }));
        }
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: `Route ${req.method}:${req.url} not found`, error: 'Not Found', statusCode: 404 }));
      });
    });
    await new Promise<void>((r) => old.listen(0, '127.0.0.1', r));
    try {
      const addr = old.address() as { port: number };
      const c = await connect(`http://127.0.0.1:${addr.port}`);
      const st = await c.callTool({ name: 'status', arguments: {} });
      expect(st.isError).toBe(true);
      const text = (st.content as any)[0].text as string;
      expect(text).toMatch(/^VERSION_MISMATCH: lakard di http:\/\/127\.0\.0\.1:\d+ tidak mengenal GET \/status \(HTTP 404/);
      expect(text).toContain('systemctl --user restart lakard');
      expect(text).not.toMatch(/Cannot read|undefined/);
    } finally {
      await new Promise<void>((r) => old.close(() => r()));
    }
  });

  it('formatStatus: lastError pool dan font hilang ditampilkan', () => {
    const text = formatStatus({
      version: LAKAR_VERSION,
      schemaVersion: SCHEMA_VERSION,
      uptimeSec: 30,
      pool: { size: 2, ready: 0, busy: 0, waiting: 0, recreated: 0, lastError: 'browser gagal dijalankan' },
      fonts: { families: [], missing: ['inter'] },
      sessions: { count: 0, active: [] },
    });
    expect(text).toContain('uptime 30d');
    expect(text).toContain('pool error terakhir: browser gagal dijalankan');
    expect(text).toContain('hilang: inter');
    expect(text).toContain('sesi: 0');
  });

  it('read_skill / list_boards / inspect / export / screenshot nodeId diteruskan ke endpoint daemon', async () => {
    fake.seen.length = 0;
    const c = await connect(url);
    const list = await c.callTool({ name: 'read_skill', arguments: {} });
    expect(JSON.parse((list.content as any)[0].text)).toEqual({ skills: [{ name: 'core', available: true }] });
    const core = await c.callTool({ name: 'read_skill', arguments: { name: 'core' } });
    expect((core.content as any)[0].text).toBe('# core\nisi');
    const none = await c.callTool({ name: 'read_skill', arguments: { name: 'landing' } });
    expect(none.isError).toBe(true);
    expect((none.content as any)[0].text).toMatch(/^NOT_FOUND: .*\nhint: skill dikenal: core, landing, mobile, icons, api/);
    const boards = await c.callTool({ name: 'list_boards', arguments: {} });
    expect(JSON.parse((boards.content as any)[0].text).boards[0]).toMatchObject({ wip: true });
    const ins = await c.callTool({ name: 'inspect', arguments: { id: 'Tttttttt', depth: 1 } });
    expect(JSON.parse((ins.content as any)[0].text).node).toEqual({ id: 'Tttttttt', bounds: [0, 0, 10, 10] });
    expect((await c.callTool({ name: 'inspect', arguments: { id: 'Zzzzzzzz' } })).isError).toBe(true);
    const ex = await c.callTool({ name: 'export', arguments: { id: 'Bbbbbbbb', scale: 2 } });
    expect(JSON.parse((ex.content as any)[0].text)).toMatchObject({ scale: 2, width: 780, height: 1688 });
    expect((await c.callTool({ name: 'export', arguments: { scale: 3 } })).isError).toBe(true);
    await c.callTool({ name: 'screenshot', arguments: { nodeId: 'Tttttttt' } });
    const bodies = fake.seen.filter((x) => x.path !== '/sessions').map((x) => [x.path, x.body]);
    expect(bodies).toEqual([
      ['/skills/read', {}],
      ['/skills/read', { name: 'core' }],
      ['/skills/read', { name: 'landing' }],
      ['/boards', {}],
      ['/inspect', { id: 'Tttttttt', depth: 1 }],
      ['/inspect', { id: 'Zzzzzzzz' }],
      ['/export', { id: 'Bbbbbbbb', scale: 2 }],
      ['/export', { scale: 3 }],
      ['/screenshot', { nodeId: 'Tttttttt' }],
    ]);
    const { tools } = await c.listTools();
    const shot = tools.find((t) => t.name === 'screenshot')!;
    expect(Object.keys((shot.inputSchema as any).properties).sort()).toEqual(['boardId', 'nodeId']);
  });

  it('execute dengan check → JSON field lain + ringkasan + maks 20 baris temuan + baris sisa', async () => {
    const c = await connect(url);
    const r = await c.callTool({ name: 'execute', arguments: { code: 'check', description: 'uji baris temuan check' } });
    expect(r.isError).toBeFalsy();
    const lines = ((r.content as any)[0].text as string).split('\n');
    expect(JSON.parse(lines[0]!)).toEqual({ docId: 'Dddddddd', rev: 4, created: [], bounds: { Bbbbbbbb: [0, 0, 390, 844] } });
    expect(lines[1]).toBe('check board Bbbbbbbb: 25 error (25 gerbang), 0 warning');
    expect(lines[2]).toBe('error·gerbang · LC-05 · Caption 0 (Tttt0000) · size 11px · ≥ 12');
    expect(lines).toHaveLength(2 + 20 + 1);
    expect(lines.at(-1)).toBe('… 5 temuan lagi (layout_check untuk daftar penuh)');
  });

  it('layout_check → POST /layout-check {boardId?}; satu ringkasan + maks 60 baris; board tak ada → NOT_FOUND', async () => {
    fake.seen.length = 0;
    const c = await connect(url);
    const r = await c.callTool({ name: 'layout_check', arguments: {} });
    expect(r.isError).toBeFalsy();
    expect(fake.seen.at(-1)).toMatchObject({ path: '/layout-check', body: {} });
    const lines = ((r.content as any)[0].text as string).split('\n');
    expect(lines[0]).toBe('layout_check rev 3, 1 board (Bbbbbbbb): 70 error (70 gerbang), 0 warning');
    expect(lines).toHaveLength(1 + 60 + 1);
    expect(lines.at(-1)).toBe('… 10 temuan lagi (layout_check untuk daftar penuh)');
    const bad = await c.callTool({ name: 'layout_check', arguments: { boardId: 'Zzzzzzzz' } });
    expect(fake.seen.at(-1)!.body).toEqual({ boardId: 'Zzzzzzzz' });
    expect(bad.isError).toBe(true);
    expect((bad.content as any)[0].text).toMatch(/^NOT_FOUND: .*\nhint: pakai ID board/);
    const tool = (await c.listTools()).tools.find((t) => t.name === 'layout_check')!;
    for (const id of ['LC-01a', 'LC-01b', 'LC-02a', 'LC-05', 'LC-12', 'LC-20']) expect(tool.description).toContain(id);
  });

  it('icon_search → POST /icons/search {query, lib?, limit?}; hasil pertama dumbbell; deskripsi menyebut kanonik/alias/brand', async () => {
    fake.seen.length = 0;
    const c = await connect(url);
    const r = await c.callTool({ name: 'icon_search', arguments: { query: 'dumbbell', lib: 'lucide', limit: 3 } });
    expect(r.isError).toBeFalsy();
    const data = JSON.parse((r.content as any)[0].text);
    expect(data.results[0]).toMatchObject({ lib: 'lucide', icon: 'dumbbell' });
    expect(fake.seen.at(-1)).toMatchObject({ path: '/icons/search', body: { query: 'dumbbell', lib: 'lucide', limit: 3 } });
    expect(fake.seen.at(-1)!.session).toMatch(/^s\d+$/);
    await c.callTool({ name: 'icon_search', arguments: { query: 'gym' } });
    expect(fake.seen.at(-1)!.body).toEqual({ query: 'gym' });
    const bad = await c.callTool({ name: 'icon_search', arguments: { query: '' } });
    expect(bad.isError).toBe(true);
    expect((bad.content as any)[0].text).toMatch(/^SCHEMA_INVALID/);
    const tool = (await c.listTools()).tools.find((t) => t.name === 'icon_search')!;
    expect(Object.keys((tool.inputSchema as any).properties).sort()).toEqual(['lib', 'limit', 'query']);
    for (const s of ['kanonik', 'alias', 'logo brand', 'simple-icons', 'lucide', 'iconSearch(']) expect(tool.description).toContain(s);
  });

  it('alur open_doc → execute → screenshot, sesi malas dan dipakai ulang', async () => {
    fake.seen.length = 0;
    const c = await connect(url);
    expect(fake.seen).toHaveLength(0); // belum ada sesi sebelum tool pertama
    const o = await c.callTool({ name: 'open_doc', arguments: { slug: 'tracer-a' } });
    expect(o.isError).toBeFalsy();
    expect(JSON.parse((o.content as any)[0].text)).toMatchObject({ slug: 'tracer-a', created: true });
    const e = await c.callTool({ name: 'execute', arguments: { code: 'add(null,{})', description: 'board tracer' } });
    expect(JSON.parse((e.content as any)[0].text).created).toHaveLength(1);
    const s = await c.callTool({ name: 'screenshot', arguments: {} });
    expect((s.content as any)[0]).toEqual({ type: 'image', data: PNG_B64, mimeType: 'image/png' });
    expect(JSON.parse((s.content as any)[1].text)).toEqual({ boardId: 'Bbbbbbbb', width: 390, height: 844, mimeType: 'image/png' });
    const paths = fake.seen.map((x) => x.path);
    expect(paths).toEqual(['/sessions', '/docs/open', '/execute', '/screenshot']);
    const sessionsUsed = new Set(fake.seen.slice(1).map((x) => x.session));
    expect(sessionsUsed.size).toBe(1);
    expect(fake.seen[2]!.body).toEqual({ code: 'add(null,{})', description: 'board tracer' });
  });

  it('dua panggilan paralel sebelum ada sesi → satu /sessions', async () => {
    fake.seen.length = 0;
    const c = await connect(url);
    await Promise.all([
      c.callTool({ name: 'open_doc', arguments: { slug: 'p1' } }),
      c.callTool({ name: 'open_doc', arguments: { slug: 'p2' } }),
    ]);
    expect(fake.seen.filter((x) => x.path === '/sessions')).toHaveLength(1);
    expect(new Set(fake.seen.filter((x) => x.path === '/docs/open').map((x) => x.session)).size).toBe(1);
  });

  it('error daemon → isError dengan kode + hint', async () => {
    const c = await connect(url);
    const e = await c.callTool({ name: 'execute', arguments: { code: 'boom' } });
    expect(e.isError).toBe(true);
    expect((e.content as any)[0].text).toMatch(/^EXEC_ERROR: .*\nhint: perbaiki\neditId: Eeeeeeee$/);
    const s = await c.callTool({ name: 'screenshot', arguments: { boardId: 'ZZZZZZZZ' } });
    expect(s.isError).toBe(true);
    expect((s.content as any)[0].text).toMatch(/^NOT_FOUND/);
  });

  it('execute perbaikan: editId + edits diteruskan apa adanya, tanpa code; value/logs dikembalikan', async () => {
    fake.seen.length = 0;
    const c = await connect(url);
    const edits = [{ find: 'boom', replace: '1' }];
    const r = await c.callTool({ name: 'execute', arguments: { editId: 'Eeeeeeee', edits } });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse((r.content as any)[0].text)).toMatchObject({ rev: 2, value: 1, logs: 'halo' });
    expect(fake.seen.find((x) => x.path === '/execute')!.body).toEqual({ editId: 'Eeeeeeee', edits });
    const { tools } = await c.listTools();
    const exec = tools.find((t) => t.name === 'execute')!;
    expect(Object.keys((exec.inputSchema as any).properties).sort()).toEqual(['code', 'description', 'editId', 'edits']);
    expect(exec.description).toMatch(/3–8 kata/);
  });

  it('sesi hilang (401) → sesi baru, permintaan diulang sekali', async () => {
    const c = await connect(url);
    await c.callTool({ name: 'open_doc', arguments: { slug: 'a' } });
    fake.seen.length = 0;
    fake.restartOnce();
    const o = await c.callTool({ name: 'open_doc', arguments: { slug: 'b' } });
    expect(o.isError).toBeFalsy();
    expect(fake.seen.map((x) => x.path)).toEqual(['/docs/open', '/sessions', '/docs/open']);
  });

  it('daemon mati → isError menyebut URL dan cara menjalankan lakard; proses tetap hidup', async () => {
    const dead = createServer();
    await new Promise<void>((r) => dead.listen(0, '127.0.0.1', r));
    const deadUrl = `http://127.0.0.1:${(dead.address() as { port: number }).port}`;
    await new Promise<void>((r) => dead.close(() => r()));
    const c = await connect(deadUrl);
    const r = await c.callTool({ name: 'open_doc', arguments: { slug: 'x' } });
    expect(r.isError).toBe(true);
    const text = (r.content as any)[0].text as string;
    expect(text).toContain(deadUrl);
    expect(text).toContain('systemctl --user start lakard');
    const st = await c.callTool({ name: 'status', arguments: {} });
    expect(st.isError).toBe(true);
    expect((st.content as any)[0].text).toContain('systemctl --user start lakard');
    // panggilan berikutnya tetap dilayani
    expect((await c.callTool({ name: 'screenshot', arguments: {} })).isError).toBe(true);
  });

  it('stdio: dist/main.js memakai LAKAR_URL dan bertahan walau daemon mati', async () => {
    const mainJs = fileURLToPath(new URL('../dist/main.js', import.meta.url));
    const transport = new StdioClientTransport({ command: process.execPath, args: [mainJs], env: { LAKAR_URL: url } });
    const client = new Client({ name: 'stdio-test', version: '0' });
    await client.connect(transport);
    try {
      const o = await client.callTool({ name: 'open_doc', arguments: { slug: 'stdio-a' } });
      expect(JSON.parse((o.content as any)[0].text).slug).toBe('stdio-a');
    } finally {
      await client.close();
    }
    const deadTransport = new StdioClientTransport({ command: process.execPath, args: [mainJs], env: { LAKAR_URL: 'http://127.0.0.1:1' } });
    const c2 = new Client({ name: 'stdio-test', version: '0' });
    await c2.connect(deadTransport);
    try {
      const r = await c2.callTool({ name: 'execute', arguments: { code: '1' } });
      expect(r.isError).toBe(true);
      expect((r.content as any)[0].text).toContain('http://127.0.0.1:1');
      expect((await c2.listTools()).tools).toHaveLength(10);
    } finally {
      await c2.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Integrasi: lakard asli (proses terpisah, Chromium Lakar) di balik daemon tiruan yang meneruskan respons apa adanya.
// ---------------------------------------------------------------------------

const browsersPath = process.env.LAKAR_BROWSERS_PATH || join(homedir(), '.cache', 'lakar', 'ms-playwright');
const browserInstalled =
  existsSync(browsersPath) &&
  readdirSync(browsersPath).some((d) => d.startsWith('chromium_headless_shell-') && existsSync(join(browsersPath, d, 'INSTALLATION_COMPLETE')));

const FIXTURE = `
  const b = add(null, {type:'board', name:'Home · mobile', x:0, y:0, width:390, height:800, screen:'mobile'});
  add(b, {type:'text', name:'Sapaan', content:'Halo 👋', size:16});
  add(b, {type:'text', name:'Rating', content:'★★★★★', size:16});
  add(b, {type:'text', name:'Caption', content:'Catatan kecil', size:11});
  add(b, {type:'text', name:'Hak cipta', content:'© 2026 Kopi', size:12});
  const k = add(b, {type:'frame', name:'Kartu', width:200, height:40, clip:true});
  add(k, {type:'rect', name:'Lebar', width:260, height:20});
  const c = add(b, {type:'frame', name:'Konten', layout:'column', width:390});
  add(c, {type:'rect', name:'Isi', width:390, height:640});
  add(b, {type:'frame', name:'Overlay / Tab bar', position:'absolute', x:0, y:736, width:390, height:64});`;

describe.skipIf(!browserInstalled)('layout_check dengan respons lakard asli', () => {
  let child: ChildProcess;
  let tmp: string;
  let proxy: Server;
  let proxyUrl: string;
  const forwarded: { path: string; status: number; body: string }[] = [];

  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'lakar-mcp-check-'));
    const mainJs = fileURLToPath(new URL('../../daemon/dist/main.js', import.meta.url));
    child = spawn(process.execPath, [mainJs], { env: { ...process.env, LAKAR_PORT: '0', LAKAR_DATA_DIR: tmp, LAKAR_BROWSERS_PATH: browsersPath } });
    const realUrl = await new Promise<string>((resolve, reject) => {
      let out = '';
      child.stdout!.on('data', (c: Buffer) => {
        out += c.toString();
        const m = /mendengarkan (http:\/\/127\.0\.0\.1:\d+)/.exec(out);
        if (m) resolve(m[1]!);
      });
      child.on('exit', () => reject(new Error(`lakard keluar sebelum listen: ${out}`)));
    });
    const real = new URL(realUrl);
    // Daemon tiruan: meneruskan setiap permintaan ke lakard asli, respons dikembalikan apa adanya.
    proxy = createServer((req, res) => {
      const up = request({ host: real.hostname, port: real.port, path: req.url, method: req.method, headers: req.headers }, (r) => {
        let body = '';
        r.on('data', (c) => (body += c));
        r.on('end', () => {
          forwarded.push({ path: req.url!, status: r.statusCode!, body });
          res.writeHead(r.statusCode!, r.headers);
          res.end(body);
        });
      });
      req.pipe(up);
    });
    await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
    proxyUrl = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((r) => (proxy ? proxy.close(() => r()) : r()));
    if (child && child.exitCode === null) {
      const exited = new Promise((r) => child.on('exit', r));
      child.kill('SIGTERM');
      await exited;
    }
    await rm(tmp, { recursive: true, force: true });
  });

  it('execute fixture → ringkasan + 6 baris; layout_check → 1 ringkasan + 6 baris dengan ID sama, bahasa aturan produk', async () => {
    const c = await connect(proxyUrl);
    expect((await c.callTool({ name: 'open_doc', arguments: { slug: 'mcp-check' } })).isError).toBeFalsy();
    const e = await c.callTool({ name: 'execute', arguments: { code: FIXTURE, description: 'fixture enam aturan check' } });
    expect(e.isError, (e.content as any)[0].text).toBeFalsy();
    const eLines = ((e.content as any)[0].text as string).split('\n');
    expect(JSON.parse(eLines[0]!)).toMatchObject({ rev: 1, bounds: expect.any(Object) });
    expect(eLines[1]).toMatch(/^check board [A-Za-z0-9]{8}: 5 error \(5 gerbang\), 1 warning$/);
    expect(eLines.slice(2)).toHaveLength(6);

    const r = await c.callTool({ name: 'layout_check', arguments: {} });
    expect(r.isError).toBeFalsy();
    const text = (r.content as any)[0].text as string;
    const lines = text.split('\n');
    const real = JSON.parse(forwarded.filter((f) => f.path === '/layout-check').at(-1)!.body);
    expect(real.data.findings).toHaveLength(6);
    expect(lines[0]).toBe(`layout_check rev 1, 1 board (${real.data.boards[0].id}): 5 error (5 gerbang), 1 warning`);
    expect(lines.slice(1)).toHaveLength(6);
    expect(lines.slice(1).map((l) => l.split(' · ')[1])).toEqual(['LC-01a', 'LC-01b', 'LC-05', 'LC-02a', 'LC-20', 'LC-12']);
    expect(lines.slice(1)).toEqual(eLines.slice(2));
    expect(lines[1]).toMatch(/^error·gerbang · LC-01a · Sapaan \([A-Za-z0-9]{8}\) · emoji "👋" U\+1F44B di "Halo 👋" · hapus emoji; ikon pakai node icon \(icon_search\)$/);
    expect(lines[6]).toMatch(/^warning · LC-12 · Home · mobile \([A-Za-z0-9]{8}\) · ukuran 390×800 · 390×844$/);
    expect(text).not.toMatch(/golden|juri|rubrik|Lampiran B|skor|pen\.dev|benchmark/i);
    console.log(`[mcp] layout_check:\n${text}`);
  }, 60_000);

  it('read_skill terhadap lakard asli: kelima skill tersedia, isi sama dengan file skill', async () => {
    const c = await connect(proxyUrl);
    const list = await c.callTool({ name: 'read_skill', arguments: {} });
    expect(list.isError).toBeFalsy();
    expect(JSON.parse((list.content as any)[0].text)).toEqual({ skills: SKILL_NAMES.map((name) => ({ name, available: true })) });
    for (const name of SKILL_NAMES) {
      const r = await c.callTool({ name: 'read_skill', arguments: { name } });
      expect(r.isError, name).toBeFalsy();
      const text = (r.content as any)[0].text as string;
      expect(text.startsWith('# '), name).toBe(true);
      expect(text, name).toBe(await readSkill(name));
    }
    const none = await c.callTool({ name: 'read_skill', arguments: { name: 'webapp' } });
    expect(none.isError).toBe(true);
    expect((none.content as any)[0].text).toContain('NOT_FOUND');
  }, 60_000);

  it('status terhadap lakard asli: versi cocok, pool 2 halaman', async () => {
    const c = await connect(proxyUrl);
    const r = await c.callTool({ name: 'status', arguments: {} });
    expect(r.isError).toBeFalsy();
    const text = (r.content as any)[0].text as string;
    expect(text).toMatch(new RegExp(`^lakard ${LAKAR_VERSION.replaceAll('.', '\\.')} \\(schema ${SCHEMA_VERSION}, .*\\) · mcp ${LAKAR_VERSION.replaceAll('.', '\\.')}: cocok`));
    expect(text).toMatch(/\npool: 2 halaman · \d siap/);
    expect(text).toMatch(/\nfont: 8 keluarga, hilang: -/);
    console.log(`[mcp] status:\n${text}`);
  }, 60_000);
});

