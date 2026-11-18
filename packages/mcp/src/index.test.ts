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
import { PACKAGE, createLakarMcpServer } from './index.js';

const PNG_B64 = Buffer.from('fake-png').toString('base64');

type Seen = { path: string; session?: string; body: any };

const manyFindings = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ level: 'error', rule: 'LC-05', nodeId: `Tttt${String(i).padStart(4, '0')}`, nodeName: `Caption ${i}`, detail: 'size 11px', expected: '≥ 12' }));

/** Daemon tiruan: meniru bentuk respons AD-11 lakard. */
function fakeDaemon() {
  const seen: Seen[] = [];
  let sessions = 0;
  let restartOnce = false;
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
    if (req.url === '/sessions') return send(200, { ok: true, data: { sessionId: `s${++sessions}` } });
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

  it('daftar tool: open_doc, execute, screenshot, icon_search, layout_check', async () => {
    const c = await connect(url);
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['execute', 'icon_search', 'layout_check', 'open_doc', 'screenshot']);
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
    expect(text).toContain('lakard');
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
      expect((await c2.listTools()).tools).toHaveLength(5);
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
});

