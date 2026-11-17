import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ChromiumRenderer, PACKAGE, RENDER_MODULE_PATH, buildServer, loadConfig, startDaemon, type RunningDaemon } from './index.js';
import { LakarError } from '@lakar/schema';
import { countDarkPixels, decodePng, readPngSize } from './png.js';

const TRACER = `const b=add(null,{type:'board',name:'Tracer',x:0,y:0,width:390,height:844,screen:'mobile'}); add(b,{type:'text',name:'Judul',content:'Halo dari Lakar',size:32})`;

const baseConfig = loadConfig({});
const browsersPath = process.env.LAKAR_BROWSERS_PATH || baseConfig.browsersPath;
const browserInstalled =
  existsSync(browsersPath) &&
  readdirSync(browsersPath).some((d) => d.startsWith('chromium_headless_shell-') && existsSync(join(browsersPath, d, 'INSTALLATION_COMPLETE')));
if (!browserInstalled) {
  console.warn(`[@lakar/daemon] SKIP tes Chromium: chromium-headless-shell belum terpasang di ${browsersPath}. Jalankan: bash scripts/install-browser.sh`);
}

type Res = { status: number; body: { ok: boolean; data?: any; error?: { code: string; message: string; hint: string; retryable: boolean } } };

let d: RunningDaemon;
let dataDir: string;

async function call(path: string, body: unknown, session?: string): Promise<Res> {
  const r = await fetch(`${d.url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(session ? { 'x-lakar-session': session } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  return { status: r.status, body: (await r.json()) as Res['body'] };
}
const newSession = async () => (await call('/sessions', {})).body.data.sessionId as string;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'lakar-daemon-test-'));
  d = await startDaemon({ ...baseConfig, port: 0, dataDir, browsersPath });
});
afterAll(async () => {
  await d?.close();
  await rm(dataDir, { recursive: true, force: true });
});

describe('@lakar/daemon', () => {
  it('mengekspor nama paket, bind hanya 127.0.0.1', () => {
    expect(PACKAGE).toBe('@lakar/daemon');
    expect(d.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const addr = d.app.server.address();
    expect(typeof addr === 'object' && addr?.address).toBe('127.0.0.1');
  });

  it('config: default port 7466, host terkunci, LAKAR_PORT tidak valid ditolak', () => {
    expect(loadConfig({}).port).toBe(7466);
    expect(loadConfig({ LAKAR_PORT: '0' }).port).toBe(0);
    expect(loadConfig({ LAKAR_HOST: '0.0.0.0' } as NodeJS.ProcessEnv).host).toBe('127.0.0.1');
    expect(() => loadConfig({ LAKAR_PORT: 'abc' })).toThrow(/LAKAR_PORT/);
  });

  it('dist render tanpa impor non-relatif (dimuat apa adanya di Chromium)', async () => {
    const js = await readFile(RENDER_MODULE_PATH, 'utf8');
    expect(js).not.toMatch(/from\s*['"]@/);
    expect(js).not.toMatch(/(?:from|import)\s*\(?\s*['"][^./'"][^'"]*['"]/);
  });

  it('open_doc baru → dibuat, ditulis, rev 0; buka lagi dari sesi baru → created:false', async () => {
    const s = await newSession();
    const r = await call('/docs/open', { slug: 'tracer-a' }, s);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ slug: 'tracer-a', rev: 0, created: true });
    expect(r.body.data.docId).toMatch(/^[A-Za-z0-9]{8}$/);
    const onDisk = JSON.parse(await readFile(join(dataDir, 'docs', 'tracer-a.lakar.json'), 'utf8'));
    expect(onDisk.pages).toHaveLength(1);
    const r2 = await call('/docs/open', { slug: 'tracer-a' }, await newSession());
    expect(r2.body.data).toMatchObject({ docId: r.body.data.docId, rev: 0, created: false });
  });

  it('dokumen yang ada dibaca dari file; file rusak → SCHEMA_INVALID', async () => {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(dataDir, 'docs'), { recursive: true });
    await writeFile(join(dataDir, 'docs', 'rusak.lakar.json'), '{"schemaVersion":1,', 'utf8');
    const r = await call('/docs/open', { slug: 'rusak' }, await newSession());
    expect(r.body.ok).toBe(false);
    expect(r.body.error!.code).toBe('SCHEMA_INVALID');
    await writeFile(join(dataDir, 'docs', 'rusak2.lakar.json'), '{"schemaVersion":1}', 'utf8');
    expect((await call('/docs/open', { slug: 'rusak2' }, await newSession())).body.error!.code).toBe('SCHEMA_INVALID');
  });

  it.each(['../x', 'A B', ''])('slug tidak valid %j → SCHEMA_INVALID + hint pola', async (slug) => {
    const r = await call('/docs/open', { slug }, await newSession());
    expect(r.status).toBe(400);
    expect(r.body.error).toMatchObject({ code: 'SCHEMA_INVALID', retryable: false });
    expect(r.body.error!.hint).toContain('^[a-z0-9][a-z0-9-]{0,63}$');
  });

  it('execute tanpa open_doc → NO_ACTIVE_DOC', async () => {
    const r = await call('/execute', { code: TRACER }, await newSession());
    expect(r.body.error!.code).toBe('NO_ACTIVE_DOC');
    expect(r.body.error!.hint).toMatch(/open_doc/);
  });

  it('NOT_FOUND biasa pada slug berisi "sesi" tetap 404 (bukan 401 sesi)', async () => {
    const s = await newSession();
    await call('/docs/open', { slug: 'sesi-latihan' }, s);
    const r = await call('/screenshot', { boardId: 'ZZZZZZZZ' }, s);
    expect(r.status).toBe(404);
    expect(r.body.error!.code).toBe('NOT_FOUND');
    expect(r.body.error!.message).toContain('sesi-latihan');
  });

  it('sesi tidak dikenal → 401 NOT_FOUND', async () => {
    const r = await call('/execute', { code: '1' }, 'tidak-ada');
    expect(r.status).toBe(401);
    expect(r.body.error!.code).toBe('NOT_FOUND');
  });

  describe('execute pada dokumen', () => {
    let s: string;
    const file = () => join(dataDir, 'docs', 'exec-a.lakar.json');
    const hist = () => join(dataDir, 'docs', 'exec-a.history.jsonl');
    const snapshot = async () => ({ doc: await readFile(file(), 'utf8'), hist: existsSync(hist()) ? await readFile(hist(), 'utf8') : '' });

    beforeAll(async () => {
      s = await newSession();
      await call('/docs/open', { slug: 'exec-a' }, s);
    });

    it('sukses: rev +1, file ditulis, satu baris riwayat, created 2 entri', async () => {
      const r = await call('/execute', { code: TRACER, description: 'board tracer' }, s);
      expect(r.status).toBe(200);
      expect(r.body.data.rev).toBe(1);
      expect(r.body.data.created).toEqual([
        { id: expect.stringMatching(/^[A-Za-z0-9]{8}$/), name: 'Tracer', path: 'Tracer' },
        { id: expect.stringMatching(/^[A-Za-z0-9]{8}$/), name: 'Judul', path: 'Tracer/Judul' },
      ]);
      const doc = JSON.parse(await readFile(file(), 'utf8'));
      expect(doc.rev).toBe(1);
      expect(doc.pages[0].children[0]).toMatchObject({ type: 'board', width: 390, height: 844 });
      const lines = (await readFile(hist(), 'utf8')).trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]!)).toMatchObject({ rev: 1, sessionId: s, description: 'board tracer', opsSummary: 'add×2' });
      const files = readdirSync(join(dataDir, 'docs'));
      expect(files.filter((f) => f.endsWith('.tmp'))).toEqual([]);
    });

    it('x/y pada node flow → SCHEMA_INVALID + hint, rollback penuh, file tidak berubah', async () => {
      const before = await snapshot();
      const r = await call('/execute', { code: `const b=add(null,{type:'board',name:'B2',x:500,y:0,width:100,height:100,screen:'app'}); add(b,{type:'text',name:'T',content:'a',size:12,x:10})` }, s);
      expect(r.body.error!.code).toBe('SCHEMA_INVALID');
      expect(r.body.error!.hint).toMatch(/x\/y hanya untuk board\/node absolute/);
      expect(await snapshot()).toEqual(before);
    });

    it('error tak tertangkap → EXEC_ERROR, rev tetap, tanpa baris riwayat', async () => {
      const before = await snapshot();
      const r = await call('/execute', { code: `add(null,{type:'board',name:'B3',x:0,y:0,width:10,height:10,screen:'app'}); throw new Error('x')` }, s);
      expect(r.body.error!.code).toBe('EXEC_ERROR');
      expect(r.body.error!.message).toContain('x');
      expect(await snapshot()).toEqual(before);
    });

    it('loop tak berujung → EXEC_TIMEOUT, daemon tetap melayani', async () => {
      const before = await snapshot();
      const loop = call('/execute', { code: 'while(true){}' }, s);
      const other = call('/sessions', {});
      const [r, o] = await Promise.all([loop, other]);
      expect(r.body.error!.code).toBe('EXEC_TIMEOUT');
      expect(o.body.ok).toBe(true);
      expect(await snapshot()).toEqual(before);
      const after = await call('/docs/open', { slug: 'exec-a' }, await newSession());
      expect(after.body.data.rev).toBe(1);
    });

    it('screenshot board tak ada → NOT_FOUND', async () => {
      const r = await call('/screenshot', { boardId: 'ZZZZZZZZ' }, s);
      expect(r.body.error!.code).toBe('NOT_FOUND');
    });

    it.skipIf(!browserInstalled)('screenshot tanpa id → board pertama, PNG 390×844 skala 1 dengan piksel teks', async () => {
      const r = await call('/screenshot', {}, s);
      expect(r.status, JSON.stringify(r.body.error)).toBe(200);
      expect(r.body.data).toMatchObject({ width: 390, height: 844, mimeType: 'image/png' });
      const png = Buffer.from(r.body.data.png, 'base64');
      expect(readPngSize(png)).toEqual({ width: 390, height: 844 });
      const img = decodePng(png);
      // teks 32px di kiri atas board, latar putih
      expect(countDarkPixels(img, 0, 0, 390, 60)).toBeGreaterThan(100);
      expect(countDarkPixels(img, 0, 200, 390, 844)).toBe(0);
      // panggilan kedua memakai halaman yang sama (mutex) dan tetap benar
      const r2 = await call('/screenshot', { boardId: r.body.data.boardId }, s);
      expect(r2.body.data.png).toBe(r.body.data.png);
    }, 60_000);
  });
});

describe('RENDER_FAILED', () => {
  it('render port gagal → HTTP 503, RENDER_FAILED retryable, dokumen tidak berubah', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'lakar-render-fail-'));
    const failing = {
      screenshot: async () => {
        throw new LakarError('RENDER_FAILED', 'render Chromium gagal: tiruan', { hint: 'coba lagi', retryable: true });
      },
    };
    const { app } = buildServer({ config: { ...baseConfig, port: 0, dataDir: tmp }, render: failing });
    try {
      const post = (url: string, payload: unknown, session?: string) =>
        app.inject({ method: 'POST', url, payload: payload as object, headers: session ? { 'x-lakar-session': session } : {} });
      const s = (await post('/sessions', {})).json().data.sessionId as string;
      await post('/docs/open', { slug: 'rf' }, s);
      expect((await post('/execute', { code: TRACER }, s)).json().ok).toBe(true);
      const before = await readFile(join(tmp, 'docs', 'rf.lakar.json'), 'utf8');
      const r = await post('/screenshot', {}, s);
      expect(r.statusCode).toBe(503);
      expect(r.json().error).toMatchObject({ code: 'RENDER_FAILED', retryable: true });
      expect(await readFile(join(tmp, 'docs', 'rf.lakar.json'), 'utf8')).toBe(before);
    } finally {
      await app.close();
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it.skipIf(!browserInstalled)('adaptor Chromium: halaman render tidak bisa dimuat → LakarError RENDER_FAILED retryable', async () => {
    const renderer = new ChromiumRenderer({ browsersPath, pageUrl: () => 'http://127.0.0.1:1/render/page', timeoutMs: 5000 });
    try {
      const err = await renderer.screenshot({ schemaVersion: 1, id: 'Dddddddd', rev: 0, pages: [{ id: 'Pppppppp', name: 'P', children: [] }] }, 'Bbbbbbbb').then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(LakarError);
      expect(err).toMatchObject({ code: 'RENDER_FAILED', retryable: true });
    } finally {
      await renderer.close();
    }
  }, 60_000);
});

describe('lakard main', () => {
  const mainJs = fileURLToPath(new URL('../dist/main.js', import.meta.url));

  it('port terpakai → exit 1 dengan pesan LAKAR_PORT', async () => {
    const blocker = createServer();
    await new Promise<void>((r) => blocker.listen(0, '127.0.0.1', r));
    const port = (blocker.address() as { port: number }).port;
    const tmp = await mkdtemp(join(tmpdir(), 'lakar-main-'));
    try {
      const child = spawn(process.execPath, [mainJs], { env: { ...process.env, LAKAR_PORT: String(port), LAKAR_DATA_DIR: tmp } });
      let stderr = '';
      child.stderr.on('data', (c) => (stderr += c));
      const code = await new Promise<number | null>((r) => child.on('exit', r));
      expect(code).toBe(1);
      expect(stderr).toContain('LAKAR_PORT');
      await expect(stat(join(tmp, 'docs'))).rejects.toThrow();
    } finally {
      blocker.close();
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('SIGTERM → berhenti bersih (exit 0)', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'lakar-main-'));
    try {
      const child = spawn(process.execPath, [mainJs], { env: { ...process.env, LAKAR_PORT: '0', LAKAR_DATA_DIR: tmp } });
      await new Promise<void>((resolve, reject) => {
        child.stdout.on('data', (c: Buffer) => c.toString().includes('mendengarkan http://127.0.0.1:') && resolve());
        child.on('exit', () => reject(new Error('keluar sebelum listen')));
      });
      const exited = new Promise<number | null>((r) => child.on('exit', r));
      child.kill('SIGTERM');
      expect(await exited).toBe(0);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
