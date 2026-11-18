import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ChromiumRenderer, FontRegistry, PACKAGE, RENDER_DIST_DIR, buildServer, loadConfig, startDaemon, type RunningDaemon } from './index.js';
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
    const files = readdirSync(RENDER_DIST_DIR).filter((f) => f.endsWith('.js'));
    expect(files).toContain('index.js');
    for (const f of files) {
      const js = await readFile(join(RENDER_DIST_DIR, f), 'utf8');
      expect(js, f).not.toMatch(/from\s*['"]@/);
      expect(js, f).not.toMatch(/(?:from|import)\s*\(?\s*['"][^./'"][^'"]*['"]/);
    }
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

  it('file schemaVersion lebih baru → VERSION_MISMATCH + hint perbarui, bukan "rusak"', async () => {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(dataDir, 'docs'), { recursive: true });
    await writeFile(join(dataDir, 'docs', 'masa-depan.lakar.json'), '{"schemaVersion":2,"id":"Dddddddd","rev":0,"pages":[]}', 'utf8');
    const r = await call('/docs/open', { slug: 'masa-depan' }, await newSession());
    expect(r.body.ok).toBe(false);
    expect(r.body.error!.code).toBe('VERSION_MISMATCH');
    expect(r.body.error!.hint).toMatch(/perbarui Lakar/);
    expect(r.body.error!.message).not.toMatch(/rusak/);
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
        { id: expect.stringMatching(/^[A-Za-z0-9]{8}$/), name: 'Tracer', path: ['Tracer'] },
        { id: expect.stringMatching(/^[A-Za-z0-9]{8}$/), name: 'Judul', path: ['Tracer', 'Judul'] },
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

    it('snippet tanpa mutasi → ok, rev tetap, file dan riwayat tidak berubah', async () => {
      const before = await snapshot();
      const r = await call('/execute', { code: '1+1', description: 'baca saja' }, s);
      expect(r.status, JSON.stringify(r.body.error)).toBe(200);
      expect(r.body).toEqual({ ok: true, data: { docId: expect.stringMatching(/^[A-Za-z0-9]{8}$/), rev: 1, created: [] } });
      expect(await snapshot()).toEqual(before);
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

describe('execute katalog v1', () => {
  let s: string;
  const file = () => join(dataDir, 'docs', 'katalog-v1.lakar.json');
  const hist = () => join(dataDir, 'docs', 'katalog-v1.history.jsonl');
  const snapshot = async () => ({ doc: await readFile(file(), 'utf8'), hist: existsSync(hist()) ? await readFile(hist(), 'utf8') : '' });
  const SEVEN = `
    const b = add(null, {type:'board', name:'Katalog', x:0, y:0, width:400, height:300, screen:'app', expectedSize:{width:400,height:300}, fills:[{type:'solid', color:'#F7F5F0'}]});
    const f = add(b, {type:'frame', name:'Isi', layout:'column', gap:8, padding:[16,24], width:'fill', height:'hug', radius:8,
      fills:[{type:'linear', angle:90, stops:[{offset:0,color:'#FFFFFF'},{offset:1,color:'#EEEEEEFF'}]}],
      stroke:{color:'#E5E5E5', width:1, align:'inside'}, shadows:[{x:0,y:2,blur:4,color:'#0000001A'}]});
    add(f, {type:'text', name:'Judul', content:'Halo', size:24, weight:600, family:'Inter', lineHeight:32, color:'#1A1A1A'});
    add(f, {type:'rect', name:'Garis', width:100, height:1, fills:[{type:'solid', color:'#E5E5E5'}]});
    add(f, {type:'ellipse', name:'Titik', width:12, height:12, inner:0.5, sweepDeg:270});
    add(f, {type:'path', name:'Panah', d:'M0 0L10 10', viewBox:[0,0,10,10], width:10, height:10});
    add(b, {type:'icon', name:'Icon / lucide / arrow-right', icon:'arrow-right', lib:'lucide', size:20, color:'#111111', position:'absolute', x:360, y:16});
  `;

  beforeAll(async () => {
    s = await newSession();
    await call('/docs/open', { slug: 'katalog-v1' }, s);
  });

  it('snippet berisi ketujuh tipe → ok, created 7 entri, file tersimpan', async () => {
    const r = await call('/execute', { code: SEVEN, description: 'katalog tujuh tipe' }, s);
    expect(r.status, JSON.stringify(r.body.error)).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.data.created).toHaveLength(7);
    expect(r.body.data.created.map((c: { path: string[] }) => c.path)).toEqual([
      ['Katalog'],
      ['Katalog', 'Isi'],
      ['Katalog', 'Isi', 'Judul'],
      ['Katalog', 'Isi', 'Garis'],
      ['Katalog', 'Isi', 'Titik'],
      ['Katalog', 'Isi', 'Panah'],
      ['Katalog', 'Icon / lucide / arrow-right'],
    ]);
    const doc = JSON.parse(await readFile(file(), 'utf8'));
    expect(doc.rev).toBe(1);
    const board = doc.pages[0].children[0];
    expect(board.children.map((c: { type: string }) => c.type)).toEqual(['frame', 'icon']);
    expect(board.children[0].children.map((c: { type: string }) => c.type)).toEqual(['text', 'rect', 'ellipse', 'path']);
  });

  it.each([
    ['warna non-hex', `const b=add(null,{type:'board',name:'X',x:0,y:0,width:10,height:10,screen:'app'}); add(b,{type:'rect',name:'R',fills:[{type:'solid',color:'rgba(0,0,0,1)'}]})`, /warna/],
    ['x/y pada node flow', `const b=add(null,{type:'board',name:'X',x:0,y:0,width:10,height:10,screen:'app'}); add(b,{type:'rect',name:'R',x:4})`, /x\/y hanya untuk board\/node absolute/],
    ['tipe asing', `const b=add(null,{type:'board',name:'X',x:0,y:0,width:10,height:10,screen:'app'}); add(b,{type:'image',name:'I'})`, /katalog/],
  ])('%s → HTTP 400 SCHEMA_INVALID, rev tetap', async (_l, code, hint) => {
    const before = await snapshot();
    const r = await call('/execute', { code }, s);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ ok: false, error: { code: 'SCHEMA_INVALID' } });
    expect(r.body.error!.hint).toMatch(hint);
    expect(await snapshot()).toEqual(before);
  });

  it('ref token tak dikenal → TOKEN_UNKNOWN, rev tetap', async () => {
    const before = await snapshot();
    const r = await call('/execute', { code: `const b=add(null,{type:'board',name:'X',x:0,y:0,width:10,height:10,screen:'app'}); add(b,{type:'text',name:'T',content:'a',size:12,color:{$token:'colors.text-primary'}})` }, s);
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ ok: false, error: { code: 'TOKEN_UNKNOWN' } });
    expect(r.body.error!.message).toContain('colors.text-primary');
    expect(await snapshot()).toEqual(before);
    expect((await call('/docs/open', { slug: 'katalog-v1' }, await newSession())).body.data.rev).toBe(1);
  });

  it.skipIf(!browserInstalled)('screenshot board katalog: PNG 400×300, latar dari fills board', async () => {
    const r = await call('/screenshot', {}, s);
    expect(r.status, JSON.stringify(r.body.error)).toBe(200);
    const img = decodePng(Buffer.from(r.body.data.png, 'base64'));
    expect(img.width).toBe(400);
    expect(img.height).toBe(300);
    // piksel pojok kanan bawah = fill solid board #F7F5F0
    const at = (299 * img.width + 399) * img.channels;
    expect([...img.pixels.subarray(at, at + 3)]).toEqual([0xf7, 0xf5, 0xf0]);
  }, 60_000);
});

describe('screenshot menerima dokumen ter-resolve', () => {
  it('ref token diganti nilai sebelum RenderPort dipanggil', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'lakar-tokens-'));
    const seen: unknown[] = [];
    const capture = { screenshot: async (doc: unknown) => (seen.push(doc), new Uint8Array([1])) };
    const { app } = buildServer({ config: { ...baseConfig, port: 0, dataDir: tmp }, render: capture });
    try {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(join(tmp, 'docs'), { recursive: true });
      const stored = {
        schemaVersion: 1,
        id: 'Dddddddd',
        rev: 2,
        tokens: { 'colors.surface': '#101010', 'colors.text-primary': '#FAFAFA', 'type.body.size': 18 },
        pages: [
          {
            id: 'Pppppppp',
            name: 'Page 1',
            children: [
              {
                type: 'board', name: 'B', x: 0, y: 0, width: 100, height: 100, screen: 'app', id: 'Bbbbbbbb',
                fills: [{ type: 'solid', color: { $token: 'colors.surface' } }],
                children: [{ type: 'text', name: 'T', id: 'Tttttttt', content: 'a', size: { $token: 'type.body.size' }, color: { $token: 'colors.text-primary' } }],
              },
            ],
          },
        ],
      };
      await writeFile(join(tmp, 'docs', 'tok.lakar.json'), JSON.stringify(stored), 'utf8');
      const post = (url: string, payload: unknown, session?: string) =>
        app.inject({ method: 'POST', url, payload: payload as object, headers: session ? { 'x-lakar-session': session } : {} });
      const sid = (await post('/sessions', {})).json().data.sessionId as string;
      expect((await post('/docs/open', { slug: 'tok' }, sid)).json().ok).toBe(true);
      const r = await post('/screenshot', {}, sid);
      expect(r.statusCode, r.body).toBe(200);
      expect(seen).toHaveLength(1);
      const doc = seen[0] as typeof stored;
      expect(doc.pages[0]!.children[0]!.fills).toEqual([{ type: 'solid', color: '#101010' }]);
      expect(doc.pages[0]!.children[0]!.children[0]).toMatchObject({ size: 18, color: '#FAFAFA' });
      // file tetap menyimpan referensi
      expect(await readFile(join(tmp, 'docs', 'tok.lakar.json'), 'utf8')).toContain('"$token"');
    } finally {
      await app.close();
      await rm(tmp, { recursive: true, force: true });
    }
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
    const renderer = new ChromiumRenderer({ browsersPath, pageUrl: () => 'http://127.0.0.1:1/render/page', timeoutMs: 5000, fonts: FontRegistry.load() });
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

describe('font lokal (registry + FONT_MISSING)', () => {
  let s: string;
  const board = (body: string, name: string) =>
    `const b=add(null,{type:'board',name:'${name}',x:0,y:0,width:200,height:60,screen:'app'}); ${body}; b`;
  /** Buat board baru lewat execute, kembalikan ID-nya. */
  const makeBoard = async (body: string, name: string) => {
    const r = await call('/execute', { code: board(body, name) }, s);
    expect(r.status, JSON.stringify(r.body.error)).toBe(200);
    return r.body.data.created[0].id as string;
  };

  beforeAll(async () => {
    s = await newSession();
    await call('/docs/open', { slug: 'font-lokal' }, s);
  });

  it('registry: 8 keluarga arketipe terdaftar, tanpa paket hilang', () => {
    const reg = FontRegistry.load();
    expect(reg.missing).toEqual([]);
    expect(reg.families()).toEqual(['Inter', 'Plus Jakarta Sans', 'JetBrains Mono', 'Manrope', 'IBM Plex Mono', 'Bricolage Grotesque', 'DM Sans', 'DM Mono']);
    const faces = reg.resolveFaces([{ family: 'Inter', weight: 400, style: 'normal' }]);
    expect(faces.map((f) => f.url)).toEqual(['/fonts/inter/inter-latin-400-normal.woff2', '/fonts/inter/inter-latin-ext-400-normal.woff2']);
    expect(faces[0]!.unicodeRange).toMatch(/^U\+0000-00FF/);
  });

  it.each([
    ['Manrope italic', `add(b,{type:'text',name:'T',content:'a',size:12,family:'Manrope',style:'italic'})`, /Manrope 400 italic/, /Manrope tersedia weight 200\/300\/400\/500\/600\/700\/800 style normal/],
    ['DM Mono 700', `add(b,{type:'text',name:'T',content:'a',size:12,family:'DM Mono',weight:700})`, /DM Mono 700 normal/, /DM Mono tersedia weight 300\/400\/500/],
  ])('varian hilang %s → 422 FONT_MISSING + varian tersedia', async (_l, body, msg, hint) => {
    const id = await makeBoard(body, 'Varian');
    const r = await call('/screenshot', { boardId: id }, s);
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ ok: false, error: { code: 'FONT_MISSING', retryable: false } });
    expect(r.body.error!.message).toMatch(msg);
    expect(r.body.error!.hint).toMatch(hint);
  });

  it.skipIf(!browserInstalled)('family tak terdaftar → 422 FONT_MISSING (hint memuat Inter); screenshot valid berikutnya tetap berhasil', async () => {
    const bad = await makeBoard(`add(b,{type:'text',name:'T',content:'Halo',size:16,family:'Roboto'})`, 'Roboto');
    const r = await call('/screenshot', { boardId: bad }, s);
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ ok: false, error: { code: 'FONT_MISSING', retryable: false } });
    expect(r.body.error!.message).toContain('Roboto');
    expect(r.body.error!.hint).toContain('Inter');
    const good = await makeBoard(`add(b,{type:'text',name:'T',content:'Tebal',size:24,weight:700})`, 'Inter700');
    const r2 = await call('/screenshot', { boardId: good }, s);
    expect(r2.status, JSON.stringify(r2.body.error)).toBe(200);
    const img = decodePng(Buffer.from(r2.body.data.png, 'base64'));
    expect(img.width).toBe(200);
    expect(countDarkPixels(img, 0, 0, 200, 60)).toBeGreaterThan(50);
  }, 60_000);

  it.skipIf(!browserInstalled)('cakupan glyph: teks "Lihat →" → 422 FONT_MISSING U+2192 (hint: node icon); screenshot valid berikutnya 200', async () => {
    const bad = await makeBoard(`add(b,{type:'text',name:'T',content:'Lihat →',size:16})`, 'Panah');
    const r = await call('/screenshot', { boardId: bad }, s);
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ ok: false, error: { code: 'FONT_MISSING', retryable: false } });
    expect(r.body.error!.message).toContain('U+2192');
    expect(r.body.error!.hint).toContain('Inter');
    expect(r.body.error!.hint).toMatch(/node icon/);
    const good = await makeBoard(`add(b,{type:'text',name:'T',content:'Lihat',size:16})`, 'TanpaPanah');
    const r2 = await call('/screenshot', { boardId: good }, s);
    expect(r2.status, JSON.stringify(r2.body.error)).toBe(200);
  }, 60_000);

  it.skipIf(!browserInstalled)('face gagal dimuat (URL 404) → LakarError FONT_MISSING non-retryable, renderer tetap bisa dipakai', async () => {
    const real = FontRegistry.load();
    let broken = true;
    const fonts = {
      families: () => real.families(),
      resolveFaces: (reqs: Parameters<FontRegistry['resolveFaces']>[0]) =>
        real.resolveFaces(reqs).map((f) => (broken ? { ...f, url: `${f.url}.hilang` } : f)),
    } as unknown as FontRegistry;
    const renderer = new ChromiumRenderer({ browsersPath, pageUrl: () => `${d.url}/render/page`, timeoutMs: 15000, fonts });
    try {
      const doc = {
        schemaVersion: 1 as const,
        id: 'Dddddddd',
        rev: 0,
        pages: [{ id: 'Pppppppp', name: 'P', children: [{ type: 'board' as const, name: 'B', id: 'Bbbbbbbb', x: 0, y: 0, width: 50, height: 30, screen: 'app' as const, children: [{ type: 'text' as const, name: 'T', id: 'Tttttttt', content: 'a', size: 12 }] }] }],
      };
      const err = await renderer.screenshot(doc, 'Bbbbbbbb').then(() => undefined, (e: unknown) => e);
      expect(err).toBeInstanceOf(LakarError);
      expect(err).toMatchObject({ code: 'FONT_MISSING', retryable: false });
      broken = false;
      const png = await renderer.screenshot(doc, 'Bbbbbbbb');
      expect(readPngSize(Buffer.from(png))).toEqual({ width: 50, height: 30 });
    } finally {
      await renderer.close();
    }
  }, 60_000);

  it('GET /fonts: file registry → 200 font/woff2; traversal / id asing / file asing → 404', async () => {
    const ok = await fetch(`${d.url}/fonts/inter/inter-latin-400-normal.woff2`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('font/woff2');
    const buf = Buffer.from(await ok.arrayBuffer());
    expect(buf.subarray(0, 4).toString('latin1')).toBe('wOF2');
    for (const path of [
      '/fonts/inter/..%2Fpackage.json',
      '/fonts/inter/..%2F..%2Fpackage.json',
      '/fonts/roboto/roboto-latin-400-normal.woff2',
      '/fonts/inter/inter-cyrillic-400-normal.woff2',
      '/fonts/inter/inter-latin-450-normal.woff2',
      '/fonts/manrope/manrope-latin-400-italic.woff2',
      '/fonts/..%2Finter/inter-latin-400-normal.woff2',
    ]) {
      expect((await fetch(`${d.url}${path}`)).status, path).toBe(404);
    }
  });

  it('GET /render/:file: modul dist disajikan; nama lain → 404', async () => {
    const r = await fetch(`${d.url}/render/layout.js`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/javascript/);
    expect((await fetch(`${d.url}/render/..%2Fpackage.json`)).status).toBe(404);
    expect((await fetch(`${d.url}/render/index.d.ts`)).status).toBe(404);
  });
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
