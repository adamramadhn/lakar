// Story 12: pool render hangat (AD-18), endpoint status/sesi/boards/inspect/export/skills, config.toml.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright-core';
import { LAKAR_VERSION, SCHEMA_VERSION } from '@lakar/schema';
import { INSPECT_MAX_BYTES, RenderPool, inspectFit, loadConfig, parseFlatToml, startDaemon, type RunningDaemon } from './index.js';
import { decodePng, readPngSize } from './png.js';
import { chromiumInstalled } from '../../../tests/support/browser.ts';
import { postJson, type LakardBody } from '../../../tests/support/http.ts';

// Tes tidak pernah memakai key Unsplash nyata: file key default dialihkan ke path yang tidak ada.
const baseConfig = { ...loadConfig({ LAKAR_CONFIG: '' }), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key' };
const browsersPath = process.env.LAKAR_BROWSERS_PATH || baseConfig.browsersPath;
const browserInstalled = chromiumInstalled(browsersPath);
const mainJs = fileURLToPath(new URL('../dist/main.js', import.meta.url));

type Body = LakardBody;

function client(base: () => string) {
  const call = (path: string, body: unknown, session?: string): Promise<{ status: number; body: Body }> => postJson(base(), path, body, session);
  const status = async () => ((await (await fetch(`${base()}/status`)).json()) as Body).data;
  const session = async () => (await call('/sessions', {})).body.data.sessionId as string;
  /** Sesi + dokumen `slug` berisi satu board w×h berwarna `color`. */
  const boardDoc = async (slug: string, w: number, h: number, color: string, extra = '') => {
    const s = await session();
    await call('/docs/open', { slug }, s);
    const r = await call(
      '/execute',
      {
        code: `const b=add(null,{type:'board',name:'B ${slug}',x:0,y:0,width:${w},height:${h},screen:'mobile',fills:[{type:'solid',color:'${color}'}]}); ${extra}; b`,
        description: 'board warna uji pool',
      },
      s,
    );
    expect(r.status, JSON.stringify(r.body.error)).toBe(200);
    return { s, boardId: r.body.data.value as string, created: r.body.data.created as { id: string; name: string }[] };
  };
  return { call, status, session, boardDoc };
}

async function until<T>(fn: () => Promise<T>, pred: (v: T) => boolean, ms = 15_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (pred(v) || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
}

const pixel = (png: Buffer, x: number, y: number) => {
  const img = decodePng(png);
  const i = (y * img.width + x) * img.channels;
  return [img.pixels[i], img.pixels[i + 1], img.pixels[i + 2]];
};

describe('config.toml (kunci datar, env menang)', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'lakar-config-'));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('parse: string berkutip, bilangan bulat, komentar; kunci tak dikenal / bagian / nilai salah → Error jelas', () => {
    expect(parseFlatToml('# komentar\nport = 7467 # x\ndata_dir = "/tmp/a b"\nbrowsers_path = \'/x\'\n\nrender_pages = 3', 'c.toml')).toEqual({
      port: '7467',
      data_dir: '/tmp/a b',
      browsers_path: '/x',
      render_pages: '3',
    });
    expect(() => parseFlatToml('prot = 1', 'c.toml')).toThrow(/c\.toml:1: kunci tak dikenal "prot"/);
    expect(() => parseFlatToml('[lakard]\nport = 1', 'c.toml')).toThrow(/c\.toml:1: baris tidak dikenal/);
    expect(() => parseFlatToml('port = abc', 'c.toml')).toThrow(/nilai port tidak valid/);
    expect(() => parseFlatToml('port = 1\nport = 2', 'c.toml')).toThrow(/dua kali/);
  });

  it('loadConfig: file dipakai, env LAKAR_* menang, default pool 2 / 15000 ms, batas 2..8', async () => {
    const f = join(dir, 'config.toml');
    await writeFile(f, 'port = 7467\nrender_pages = 4\nrender_timeout_ms = 9000\ndata_dir = "/tmp/lakar-x"\n', 'utf8');
    expect(loadConfig({ LAKAR_CONFIG: f })).toMatchObject({ port: 7467, renderPages: 4, renderTimeoutMs: 9000, dataDir: '/tmp/lakar-x', configPath: f, host: '127.0.0.1' });
    expect(loadConfig({ LAKAR_CONFIG: f, LAKAR_PORT: '7468', LAKAR_RENDER_PAGES: '2' })).toMatchObject({ port: 7468, renderPages: 2 });
    const none = loadConfig({ LAKAR_CONFIG: '' });
    expect(none).toMatchObject({ renderPages: 2, renderTimeoutMs: 15000 });
    expect(() => loadConfig({ LAKAR_RENDER_PAGES: '1' })).toThrow(/LAKAR_RENDER_PAGES tidak valid.*2\.\.8/);
    expect(() => loadConfig({ LAKAR_RENDER_PAGES: '9' })).toThrow(/LAKAR_RENDER_PAGES/);
    expect(() => loadConfig({ LAKAR_RENDER_TIMEOUT_MS: 'x' })).toThrow(/LAKAR_RENDER_TIMEOUT_MS/);
    expect(() => loadConfig({ LAKAR_CONFIG: join(dir, 'tidak-ada.toml') })).toThrow(/LAKAR_CONFIG menunjuk file yang tidak ada/);
    // Key Unsplash: default ~/.config/lakar/unsplash-access-key; config/env menimpa; utm_source divalidasi.
    expect(none.unsplashKeyFile).toMatch(/\/\.config\/lakar\/unsplash-access-key$/);
    // Default bawaan diuji dengan file config kosong agar ~/.config/lakar/config.toml milik mesin tidak ikut terbaca.
    const kosong = join(dir, 'kosong.toml');
    await writeFile(kosong, '', 'utf8');
    expect(loadConfig({ LAKAR_CONFIG: kosong }).unsplashAppName).toBe('lakar');
    const u = join(dir, 'unsplash.toml');
    await writeFile(u, 'unsplash_key_file = "/tmp/k"\nunsplash_app_name = "lakar_studio"\n', 'utf8');
    expect(loadConfig({ LAKAR_CONFIG: u })).toMatchObject({ unsplashKeyFile: '/tmp/k', unsplashAppName: 'lakar_studio' });
    expect(loadConfig({ LAKAR_CONFIG: u, LAKAR_UNSPLASH_KEY_FILE: '/tmp/k2' }).unsplashKeyFile).toBe('/tmp/k2');
    expect(() => loadConfig({ LAKAR_CONFIG: '', LAKAR_UNSPLASH_APP_NAME: 'Nama App!' })).toThrow(/LAKAR_UNSPLASH_APP_NAME tidak valid/);
  });

  it('lakard dengan config.toml berkunci salah (`prot = 1`) → exit 1 + pesan kunci tak dikenal', async () => {
    const f = join(dir, 'salah.toml');
    await writeFile(f, 'prot = 1\n', 'utf8');
    const child = spawn(process.execPath, [mainJs], { env: { ...process.env, LAKAR_CONFIG: f, LAKAR_PORT: '0', LAKAR_DATA_DIR: dir } });
    let stderr = '';
    child.stderr.on('data', (c) => (stderr += c));
    const code = await new Promise<number | null>((r) => child.on('exit', r));
    expect(code).toBe(1);
    expect(stderr).toMatch(/lakard: .*salah\.toml:1: kunci tak dikenal "prot"/);
  });
});

describe('inspectFit (batas 32 KB)', () => {
  const tree = (n: number) => ({
    id: 'Bbbbbbbb',
    name: 'B',
    children: Array.from({ length: n }, (_, i) => ({ id: `F${i}`, name: `F${i}`, children: [{ id: `T${i}`, name: 'x'.repeat(200), children: [{ id: `U${i}`, name: 'u' }] }] })),
  });
  it('muat → depth apa adanya; terlalu besar → depth turun + truncated, childCount di batas', () => {
    const small = inspectFit(tree(2), new Map([['F0', [0, 0, 1, 1]]]), 2);
    expect(small.truncated).toBe(false);
    expect((small.node.children as any[])[0]).toMatchObject({ bounds: [0, 0, 1, 1], children: [{ id: 'T0', childCount: 1 }] });
    const big = inspectFit(tree(300), new Map(), 3);
    expect(big.truncated).toBe(true);
    expect(big.depth).toBeLessThan(3);
    expect(Buffer.byteLength(JSON.stringify(big.node))).toBeLessThanOrEqual(INSPECT_MAX_BYTES);
  });
});

describe('RenderPool page2 (browser/halaman tiruan)', () => {
  type FakePage = { dpr: 1 | 2; closed: boolean; isClosed(): boolean; context(): { close(): Promise<void> }; on(): void };
  const fakePage = (dpr: 1 | 2): FakePage => {
    const p: FakePage = {
      dpr,
      closed: false,
      isClosed: () => p.closed,
      context: () => ({
        close: async () => {
          p.closed = true;
        },
      }),
      on: () => {},
    };
    return p;
  };
  const fakeBrowser = { isConnected: () => true, version: () => 'tiruan', on: () => {}, close: async () => {} };
  /** Pool 1 slot; `gate2` menahan openPage DPR 2 sampai dilepas. */
  const pool = (timeoutMs: number, gate2?: Promise<void>) => {
    const opened2: FakePage[] = [];
    const p = new RenderPool({
      size: 1,
      timeoutMs,
      launch: async () => fakeBrowser as never,
      openPage: async (_b, dpr) => {
        const page = fakePage(dpr);
        if (dpr === 2) {
          opened2.push(page);
          await (gate2 ?? new Promise((r) => setTimeout(r, 10)));
        }
        return page as never;
      },
    });
    return { p, opened2 };
  };

  it('page2() paralel dalam satu sewa → satu halaman DPR 2 dibuka dan dibagi; sewa berikutnya memakainya ulang', async () => {
    const { p, opened2 } = pool(5_000);
    const [a, b] = await p.lease(async (l) => Promise.all([l.page2(), l.page2()]));
    expect(a).toBe(b);
    expect(opened2).toHaveLength(1);
    expect(await p.lease((l) => l.page2())).toBe(a);
    expect(opened2).toHaveLength(1);
    await p.close();
  });

  it('lease basi: slot dibuang (batas waktu) selama page2 dibuka → halaman itu ditutup, tidak disimpan di slot', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { p, opened2 } = pool(50, gate);
    await expect(p.lease((l) => l.page2())).rejects.toMatchObject({ code: 'RENDER_FAILED', retryable: true });
    expect(opened2).toHaveLength(1);
    release();
    const stale = opened2[0]!;
    for (let i = 0; i < 50 && !stale.closed; i++) await new Promise((r) => setTimeout(r, 5));
    expect(stale.closed).toBe(true);
    // Sewa baru tidak menerima halaman basi: halaman DPR 2 baru dibuka.
    const fresh = await p.lease((l) => l.page2());
    expect(fresh).not.toBe(stale);
    expect(opened2).toHaveLength(2);
    await p.close();
  });
});

describe.skipIf(!browserInstalled)('pool render (AD-18) + endpoint story 12, Chromium asli', () => {
  let d: RunningDaemon;
  let dataDir: string;
  let skillsDir: string;
  let delayMs = 0;
  let crashNext = false;
  let hangNext = false;
  const c = client(() => d.url);

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'lakar-pool-test-'));
    skillsDir = await mkdtemp(join(tmpdir(), 'lakar-skills-test-'));
    await writeFile(join(skillsDir, 'core.md'), '# Lakar core\nisi uji', 'utf8');
    d = await startDaemon(
      { ...baseConfig, port: 0, dataDir, browsersPath, renderTimeoutMs: 3000, renderPages: 2 },
      {
        skillsDir,
        onLease: async (page: Page) => {
          if (crashNext) {
            crashNext = false;
            const cdp = await page.context().newCDPSession(page);
            void cdp.send('Page.crash').catch(() => {});
            await new Promise((r) => setTimeout(r, 300));
          }
          if (hangNext) {
            hangNext = false;
            await new Promise((r) => setTimeout(r, 8000));
          }
          if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        },
      },
    );
    await d.warmed;
  }, 60_000);
  afterAll(async () => {
    await d?.close();
    await rm(dataDir, { recursive: true, force: true });
    await rm(skillsDir, { recursive: true, force: true });
  });

  it('warm-up: status pool size 2 ready 2 idle 2, versi Chromium; /status tanpa sesi memuat versi, font, ikon, sesi', async () => {
    const st = await c.status();
    expect(st.pool).toMatchObject({ size: 2, ready: 2, idle: 2, busy: 0, waiting: 0, recreated: 0, browserVersion: expect.any(String) });
    expect(st).toMatchObject({
      version: LAKAR_VERSION,
      schemaVersion: SCHEMA_VERSION,
      node: process.version,
      pid: process.pid,
      host: '127.0.0.1',
      port: Number(new URL(d.url).port),
      dataDir,
      fonts: { families: expect.arrayContaining(['Inter']), missing: [] },
      icons: { lucide: expect.any(String), 'simple-icons': expect.any(String) },
      sessions: { count: expect.any(Number), active: expect.any(Array) },
    });
    expect(st.uptimeSec).toBeGreaterThanOrEqual(0);
  });

  it('paralel: 2 sesi, 2 dokumen (390×844 merah / 300×500 biru), screenshot bersamaan → ukuran & warna benar, peakBusy 2', async () => {
    const red = await c.boardDoc('pool-merah', 390, 844, '#FF0000');
    const blue = await c.boardDoc('pool-biru', 300, 500, '#0000FF');
    delayMs = 400;
    try {
      const [a, b] = await Promise.all([c.call('/screenshot', {}, red.s), c.call('/screenshot', {}, blue.s)]);
      expect(a.status, JSON.stringify(a.body.error)).toBe(200);
      expect(b.status, JSON.stringify(b.body.error)).toBe(200);
      const pa = Buffer.from(a.body.data.png, 'base64');
      const pb = Buffer.from(b.body.data.png, 'base64');
      expect(readPngSize(pa)).toEqual({ width: 390, height: 844 });
      expect(readPngSize(pb)).toEqual({ width: 300, height: 500 });
      expect(pixel(pa, 195, 422)).toEqual([255, 0, 0]);
      expect(pixel(pb, 150, 250)).toEqual([0, 0, 255]);
    } finally {
      delayMs = 0;
    }
    expect((await c.status()).pool.peakBusy).toBe(2);
    const sessions = (await c.status()).sessions;
    expect(sessions.active.find((x: any) => x.activeSlug === 'pool-merah')).toMatchObject({ id: red.s.slice(0, 8), executes: 1, lastAt: expect.any(String) });
  }, 60_000);

  it('crash di tengah sewa → 503 RENDER_FAILED retryable; berikutnya 200; status size 2 ready 2 recreated ≥ 1', async () => {
    const { s } = await c.boardDoc('pool-crash', 200, 100, '#00FF00');
    const before = (await c.status()).pool.recreated as number;
    crashNext = true;
    const r = await c.call('/screenshot', {}, s);
    expect(r.status, JSON.stringify(r.body)).toBe(503);
    expect(r.body.error).toMatchObject({ code: 'RENDER_FAILED', retryable: true });
    const ok = await c.call('/screenshot', {}, s);
    expect(ok.status, JSON.stringify(ok.body.error)).toBe(200);
    const st = await until(c.status, (x) => x.pool.ready === 2 && x.pool.recreated > before);
    expect(st.pool).toMatchObject({ size: 2, ready: 2 });
    expect(st.pool.recreated).toBeGreaterThanOrEqual(before + 1);
  }, 60_000);

  it('batas waktu host: sewa macet > timeout → 503 RENDER_FAILED retryable, halaman dibuat ulang, berikutnya sukses', async () => {
    const { s } = await c.boardDoc('pool-macet', 200, 100, '#00FFFF');
    const before = (await c.status()).pool.recreated as number;
    hangNext = true;
    const t0 = Date.now();
    const r = await c.call('/screenshot', {}, s);
    expect(r.status).toBe(503);
    expect(r.body.error).toMatchObject({ code: 'RENDER_FAILED', retryable: true });
    expect(r.body.error!.message).toMatch(/batas waktu 3000 ms/);
    expect(Date.now() - t0).toBeLessThan(7000);
    const ok = await c.call('/screenshot', {}, s);
    expect(ok.status, JSON.stringify(ok.body.error)).toBe(200);
    const st = await until(c.status, (x) => x.pool.ready === 2 && x.pool.recreated > before);
    expect(st.pool.recreated).toBeGreaterThan(before);
    expect(st.pool.lastError).toMatch(/batas waktu/);
  }, 60_000);

  it('error dokumen (FONT_MISSING) tidak membuang halaman', async () => {
    const before = (await c.status()).pool.recreated as number;
    const s = await c.session();
    await c.call('/docs/open', { slug: 'pool-font' }, s);
    const r = await c.call('/execute', { code: `const b=add(null,{type:'board',name:'F',x:0,y:0,width:100,height:50,screen:'app'}); add(b,{type:'text',name:'T',content:'a',size:12,family:'Roboto'})`, description: 'keluarga font tidak terdaftar' }, s);
    expect(r.body.error!.code).toBe('FONT_MISSING');
    const st = await c.status();
    expect(st.pool).toMatchObject({ ready: 2, recreated: before });
  });

  it('versi: POST /sessions versi beda → 409 VERSION_MISMATCH + hint restart; sama → sessionId + versi; kunci asing → 400', async () => {
    const bad = await c.call('/sessions', { client: 'lakar-mcp', version: '9.9.9' });
    expect(bad.status).toBe(409);
    expect(bad.body.error).toMatchObject({ code: 'VERSION_MISMATCH' });
    expect(bad.body.error!.message).toContain('9.9.9');
    expect(bad.body.error!.message).toContain(LAKAR_VERSION);
    expect(bad.body.error!.hint).toContain('systemctl --user restart lakard');
    expect(bad.body.error!.hint).toContain('scripts/release.sh');
    expect((await c.call('/sessions', { schemaVersion: 99 })).status).toBe(409);
    const good = await c.call('/sessions', { client: 'lakar-mcp', version: LAKAR_VERSION, schemaVersion: SCHEMA_VERSION });
    expect(good.body.data).toEqual({ sessionId: expect.any(String), version: LAKAR_VERSION, schemaVersion: SCHEMA_VERSION });
    expect((await c.call('/sessions', { x: 1 })).status).toBe(400);
  });

  it('list_boards: board + page + screen + wip + childCount', async () => {
    const s = await c.session();
    await c.call('/docs/open', { slug: 'pool-boards' }, s);
    await c.call(
      '/execute',
      {
        code: `const a=add(null,{type:'board',name:'Home',x:0,y:0,width:390,height:844,screen:'mobile'}); add(a,{type:'rect',name:'R',width:10,height:10}); add(null,{type:'board',name:'[WIP] Detail',x:500,y:0,width:390,height:844,screen:'mobile',expectedSize:{width:390,height:844}})`,
        description: 'dua board untuk daftar',
      },
      s,
    );
    const r = await c.call('/boards', {}, s);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ slug: 'pool-boards', rev: 1 });
    expect(r.body.data.boards).toEqual([
      { id: expect.any(String), name: 'Home', page: 'Page 1', screen: 'mobile', x: 0, y: 0, width: 390, height: 844, wip: false, childCount: 1 },
      { id: expect.any(String), name: '[WIP] Detail', page: 'Page 1', screen: 'mobile', x: 500, y: 0, width: 390, height: 844, expectedSize: { width: 390, height: 844 }, wip: true, childCount: 0 },
    ]);
    expect((await c.call('/boards', { x: 1 }, s)).status).toBe(400);
  });

  it('inspect: board berisi `Halo 👋` → 200 dengan bounds (allowGlyphs); token apa adanya; depth; tak ada → NOT_FOUND', async () => {
    const s = await c.session();
    await c.call('/docs/open', { slug: 'pool-inspect' }, s);
    const r = await c.call(
      '/execute',
      {
        code: `setTokens({'colors.ink':'#111111'}); const b=add(null,{type:'board',name:'Sapa',x:0,y:0,width:390,height:844,screen:'mobile'}); const f=add(b,{type:'frame',name:'Kartu',layout:'column',padding:16,width:300}); add(f,{type:'text',name:'Halo',content:'Halo 👋',size:16,color:{$token:'colors.ink'}}); b`,
        description: 'board sapaan dengan emoji',
      },
      s,
    );
    expect(r.status, JSON.stringify(r.body.error)).toBe(200);
    const boardId = r.body.data.value as string;
    const ids = Object.fromEntries((r.body.data.created as { id: string; name: string }[]).map((x) => [x.name, x.id]));
    const i = await c.call('/inspect', { id: boardId }, s);
    expect(i.status, JSON.stringify(i.body.error)).toBe(200);
    expect(i.body.data).toMatchObject({ rev: 1, boardId, node: { id: boardId, type: 'board', bounds: [0, 0, 390, 844] } });
    const kartu = i.body.data.node.children[0];
    expect(kartu).toMatchObject({ id: ids.Kartu, bounds: [0, 0, 300, expect.any(Number)] });
    const halo = kartu.children[0];
    expect(halo).toMatchObject({ id: ids.Halo, content: 'Halo 👋', color: { $token: 'colors.ink' }, bounds: [16, 16, expect.any(Number), expect.any(Number)] });
    expect(halo.bounds[2]).toBeGreaterThan(0);
    const shallow = await c.call('/inspect', { id: boardId, depth: 0 }, s);
    expect(shallow.body.data.node).toMatchObject({ childCount: 1 });
    expect(shallow.body.data.node.children).toBeUndefined();
    expect((await c.call('/inspect', { id: ids.Halo }, s)).body.data.node).toMatchObject({ id: ids.Halo, bounds: halo.bounds });
    expect((await c.call('/inspect', { id: 'Zzzzzzzz' }, s)).status).toBe(404);
    expect((await c.call('/inspect', { id: boardId, depth: 7 }, s)).status).toBe(400);
  }, 60_000);

  it('screenshot nodeId → potret node (skala 1; scale 2 = 2× piksel); boardId + nodeId / scale 3 → SCHEMA_INVALID', async () => {
    const { s, boardId, created } = await c.boardDoc('pool-node', 390, 844, '#FFFFFF', `add(b,{type:'rect',name:'Kotak',width:120,height:80,fills:[{type:'solid',color:'#FF00FF'}]})`);
    const kotak = created.find((x) => x.name === 'Kotak')!.id;
    const r = await c.call('/screenshot', { nodeId: kotak }, s);
    expect(r.status, JSON.stringify(r.body.error)).toBe(200);
    expect(r.body.data).toMatchObject({ boardId, nodeId: kotak, width: 120, height: 80 });
    const png = Buffer.from(r.body.data.png, 'base64');
    expect(readPngSize(png)).toEqual({ width: 120, height: 80 });
    expect(pixel(png, 60, 40)).toEqual([255, 0, 255]);
    const both = await c.call('/screenshot', { boardId, nodeId: kotak }, s);
    expect(both.status).toBe(400);
    expect(both.body.error!.code).toBe('SCHEMA_INVALID');
    expect((await c.call('/screenshot', { nodeId: 'Zzzzzzzz' }, s)).status).toBe(404);
    // Zoom review (story 2.16): scale 2 = PNG 2× piksel bounds node; scale lain → SCHEMA_INVALID.
    const z = await c.call('/screenshot', { nodeId: kotak, scale: 2 }, s);
    expect(z.status, JSON.stringify(z.body.error)).toBe(200);
    expect(z.body.data).toMatchObject({ boardId, nodeId: kotak, width: 240, height: 160 });
    expect(readPngSize(Buffer.from(z.body.data.png, 'base64'))).toEqual({ width: 240, height: 160 });
    const zb = await c.call('/screenshot', { boardId, scale: 2 }, s);
    expect(zb.status, JSON.stringify(zb.body.error)).toBe(200);
    expect(readPngSize(Buffer.from(zb.body.data.png, 'base64'))).toEqual({ width: 780, height: 1688 });
    expect({ width: zb.body.data.width, height: zb.body.data.height }).toEqual({ width: 780, height: 1688 });
    const s3 = await c.call('/screenshot', { nodeId: kotak, scale: 3 }, s);
    expect(s3.status).toBe(400);
    expect(s3.body.error!.code).toBe('SCHEMA_INVALID');
  }, 60_000);

  it('export: skala 1 / 2 (DPR asli) / node; scale 3 → 400; id tak ada → 404; gagal tulis → EXPORT_FAILED', async () => {
    const { s, boardId, created } = await c.boardDoc('pool-export', 390, 844, '#FFFFFF', `add(b,{type:'text',name:'Judul',content:'Halo Lakar',size:24})`);
    const judul = created.find((x) => x.name === 'Judul')!.id;
    const one = await c.call('/export', {}, s);
    expect(one.status, JSON.stringify(one.body.error)).toBe(200);
    const path1 = join(dataDir, 'exports', 'pool-export', `${boardId}-r1@1x.png`);
    expect(one.body.data).toEqual({ path: path1, id: boardId, name: 'B pool-export', rev: 1, scale: 1, width: 390, height: 844, bytes: (await stat(path1)).size });
    const two = await c.call('/export', { id: boardId, scale: 2 }, s);
    expect(two.status, JSON.stringify(two.body.error)).toBe(200);
    const path2 = join(dataDir, 'exports', 'pool-export', `${boardId}-r1@2x.png`);
    expect(two.body.data).toMatchObject({ path: path2, scale: 2, width: 780, height: 1688 });
    const img2 = decodePng(await readFile(path2));
    expect({ width: img2.width, height: img2.height }).toEqual({ width: 780, height: 1688 });
    // Render asli DPR 2 (bukan upscale): di area teks ada blok 2×2 yang tidak seragam.
    let mixed = 0;
    for (let y = 0; y < 80; y += 2) {
      for (let x = 0; x < 400; x += 2) {
        const at = (xx: number, yy: number) => img2.pixels[(yy * img2.width + xx) * img2.channels];
        const v = at(x, y);
        if (at(x + 1, y) !== v || at(x, y + 1) !== v || at(x + 1, y + 1) !== v) mixed++;
      }
    }
    expect(mixed).toBeGreaterThan(20);
    const node = await c.call('/export', { id: judul }, s);
    expect(node.status, JSON.stringify(node.body.error)).toBe(200);
    const ins = await c.call('/inspect', { id: judul, depth: 0 }, s);
    const [, , w, h] = ins.body.data.node.bounds as number[];
    expect(Math.abs(node.body.data.width - w!)).toBeLessThanOrEqual(1);
    expect(Math.abs(node.body.data.height - h!)).toBeLessThanOrEqual(1);
    expect(node.body.data).toMatchObject({ id: judul, name: 'Judul', scale: 1 });
    expect(readdirSync(join(dataDir, 'exports', 'pool-export')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    const bad = await c.call('/export', { scale: 3 }, s);
    expect(bad.status).toBe(400);
    expect(bad.body.error!.code).toBe('SCHEMA_INVALID');
    expect((await c.call('/export', { id: 'Zzzzzzzz' }, s)).status).toBe(404);
    // exports/<slug> berupa file → mkdir gagal → EXPORT_FAILED
    const s2 = await c.session();
    await c.call('/docs/open', { slug: 'pool-export-rusak' }, s2);
    await c.call('/execute', { code: `add(null,{type:'board',name:'X',x:0,y:0,width:50,height:50,screen:'app'})`, description: 'board kecil export rusak' }, s2);
    await mkdir(join(dataDir, 'exports'), { recursive: true });
    await writeFile(join(dataDir, 'exports', 'pool-export-rusak'), 'bukan direktori', 'utf8');
    const fail = await c.call('/export', {}, s2);
    expect(fail.status).toBe(500);
    expect(fail.body.error!.code).toBe('EXPORT_FAILED');
  }, 60_000);

  it('read_skill: tanpa name → daftar; core → isi; landing (file belum ada) / x / polish (dipecah) → NOT_FOUND + daftar', async () => {
    const s = await c.session();
    const list = await c.call('/skills/read', {}, s);
    expect(list.body.data.skills).toEqual([
      { name: 'core', available: true },
      ...['landing', 'mobile', 'webapp', 'layout', 'typography', 'color', 'accessibility', 'ui', 'interface', 'writing', 'review', 'icons', 'api', 'selection'].map((name) => ({ name, available: false })),
    ]);
    expect((await c.call('/skills/read', { name: 'core' }, s)).body.data).toEqual({ name: 'core', content: '# Lakar core\nisi uji' });
    for (const name of ['landing', 'x']) {
      const r = await c.call('/skills/read', { name }, s);
      expect(r.status).toBe(404);
      expect(r.body.error!.code).toBe('NOT_FOUND');
      expect(r.body.error!.hint).toContain('core, landing, mobile, webapp, layout, typography, color, accessibility, ui, interface, writing, review, icons, api');
      expect(r.body.error!.hint).toContain('tersedia: core');
    }
    // Nama lama `polish` (story 2.16): NOT_FOUND dengan pesan pemecahannya, bukan alias.
    const old = await c.call('/skills/read', { name: 'polish' }, s);
    expect(old.status).toBe(404);
    expect(old.body.error!.code).toBe('NOT_FOUND');
    expect(old.body.error!.message).toBe('skill "polish" tidak ada: skill polish dipecah menjadi layout, typography, color, accessibility, ui, interface, writing, review');
    expect(old.body.error!.hint).not.toContain('polish');
    expect((await c.call('/skills/read', {})).status).toBe(401);
  });
});

describe('Chromium hilang', () => {
  it('browsersPath kosong → lakard tetap listen; status ready 0 + lastError; screenshot 503 RENDER_FAILED', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'lakar-nochrome-'));
    const empty = join(tmp, 'browsers');
    await mkdir(empty);
    const child = spawn(process.execPath, [mainJs], {
      env: { ...process.env, LAKAR_PORT: '0', LAKAR_DATA_DIR: tmp, LAKAR_BROWSERS_PATH: empty, LAKAR_CONFIG: '' },
    });
    try {
      const url = await new Promise<string>((resolve, reject) => {
        let out = '';
        child.stdout.on('data', (b: Buffer) => {
          out += b.toString();
          const m = /mendengarkan (http:\/\/127\.0\.0\.1:\d+)/.exec(out);
          if (m) resolve(m[1]!);
        });
        child.on('exit', () => reject(new Error(`keluar sebelum listen: ${out}`)));
      });
      const c = client(() => url);
      const st = await until(c.status, (x) => !!x.pool.lastError);
      expect(st.pool).toMatchObject({ size: 2, ready: 0, lastError: expect.stringMatching(/browser gagal dijalankan|Executable/) });
      // Dokumen dengan board ditulis langsung (execute pun akan gagal render saat check).
      await mkdir(join(tmp, 'docs'), { recursive: true });
      const doc = {
        schemaVersion: SCHEMA_VERSION,
        id: 'Dddddddd',
        rev: 1,
        tokens: {},
        pages: [{ id: 'Pppppppp', name: 'Page 1', children: [{ type: 'board', name: 'X', id: 'Bbbbbbbb', x: 0, y: 0, width: 50, height: 50, screen: 'app', children: [] }] }],
      };
      await writeFile(join(tmp, 'docs', 'nochrome.lakar.json'), JSON.stringify(doc), 'utf8');
      const s = await c.session();
      expect((await c.call('/docs/open', { slug: 'nochrome' }, s)).body.ok).toBe(true);
      const shot = await c.call('/screenshot', {}, s);
      expect(shot.status).toBe(503);
      expect(shot.body.error).toMatchObject({ code: 'RENDER_FAILED', retryable: true });
      const r = await c.call('/execute', { code: `add(null,{type:'board',name:'Y',x:100,y:0,width:50,height:50,screen:'app'})`, description: 'board tanpa chromium terpasang' }, s);
      expect(r.status).toBe(503);
      expect(r.body.error).toMatchObject({ code: 'RENDER_FAILED', retryable: true });
    } finally {
      const exited = new Promise((r) => child.on('exit', r));
      child.kill('SIGTERM');
      await exited;
      await rm(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
