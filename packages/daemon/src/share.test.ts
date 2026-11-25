// Tes `POST /viewer/docs/:slug/share` (spec-collab-cloud story 1): fetch ke service tiruan
// (vi.stubGlobal) + env cloud (vi.stubEnv). RenderPort palsu; Origin guard tidak berlaku
// tanpa header Origin (sama seperti klien CLI/MCP).
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer, loadConfig } from './index.js';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const fakeRender = {
  screenshot: async () => new Uint8Array(PNG_1x1),
  measure: async (doc: any, boardId: string) => {
    const b = doc.pages.flatMap((p: any) => p.children).find((x: any) => x.id === boardId);
    return { width: b.width, height: b.height, nodes: [], texts: [] };
  },
} as never;

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-share-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function setup() {
  const dataDir = await mkdtemp(join(root, 'data-'));
  const { app, store } = buildServer({ config: { ...baseConfig, port: 0, dataDir }, render: fakeRender });
  const post = (url: string, payload?: unknown) => app.inject({ method: 'POST', url, ...(payload !== undefined ? { payload: payload as object } : {}) });
  const create = async (name: string) => {
    const r = await post('/viewer/docs', { name });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data.slug as string;
  };
  return { app, store, post, create };
}

const cloudOk = (over: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ ok: true, data: { token: 'tok_share_123', url: 'https://share.example/api/shares/tok_share_123', ...over } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('POST /viewer/docs/:slug/share', () => {
  it('env cloud diset → render tiap board, POST ke service, {token,url} pulang; body service berisi doc+png+permissions', async () => {
    const t = await setup();
    const slug = await t.create('My Landing');
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example/');
    vi.stubEnv('LAKAR_CLOUD_KEY', 'kunci-1');
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return cloudOk();
    });
    const r = await t.post(`/viewer/docs/${slug}/share`, { permissions: { comment: true, download: false } });
    expect(r.statusCode, r.body).toBe(200);
    const data = r.json().data;
    expect(data).toEqual({ token: 'tok_share_123', url: 'https://share.example/api/shares/tok_share_123', boards: 1 });
    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.url).toBe('https://api.example/api/shares');
    expect((c.init!.headers as Record<string, string>).authorization).toBe('Bearer kunci-1');
    const sent = JSON.parse(c.init!.body as string);
    expect(sent.title).toBe(slug);
    expect(sent.slug).toBe(slug);
    expect(sent.doc.schemaVersion).toBeGreaterThan(0);
    expect(sent.permissions).toEqual({ comment: true, download: false });
    expect(sent.boards).toHaveLength(1);
    expect(sent.boards[0]).toMatchObject({ name: 'Desktop', w: 1, h: 1 });
    expect(Buffer.from(sent.boards[0].pngB64, 'base64').equals(PNG_1x1)).toBe(true);
  });

  it('LAKAR_CLOUD_URL tidak diset → {ok:false} jelas, daemon tetap hidup', async () => {
    const t = await setup();
    const slug = await t.create('No Cloud');
    vi.stubEnv('LAKAR_CLOUD_URL', '');
    const r = await t.post(`/viewer/docs/${slug}/share`, {});
    expect(r.statusCode).toBe(500);
    const err = r.json().error;
    expect(err.code).toBe('EXPORT_FAILED');
    expect(err.message).toContain('LAKAR_CLOUD_URL');
    // Daemon tetap merespons.
    expect((await t.app.inject({ method: 'GET', url: '/status' })).statusCode).toBe(200);
  });

  it('service down (fetch reject / HTTP error) → EXPORT_FAILED terpetakan, status ≥500 retryable', async () => {
    const t = await setup();
    const slug = await t.create('Down');
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    vi.stubGlobal('fetch', async () => {
      throw new Error('connect ECONNREFUSED');
    });
    const down = await t.post(`/viewer/docs/${slug}/share`, {});
    expect(down.statusCode).toBe(500);
    expect(down.json().error).toMatchObject({ code: 'EXPORT_FAILED', retryable: true });
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ok: false, error: { message: 'API key tidak valid' } }), { status: 401 }));
    const unauth = await t.post(`/viewer/docs/${slug}/share`, {});
    expect(unauth.statusCode).toBe(500);
    const err = unauth.json().error;
    expect(err.code).toBe('EXPORT_FAILED');
    expect(err.message).toContain('API key tidak valid');
    expect(err.retryable).toBe(false);
  });

  it('slug invalid → SCHEMA_INVALID; dokumen tak ada → 404; body aneh → 400', async () => {
    const t = await setup();
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    const bad = await t.post('/viewer/docs/BAD SLUG/share', {});
    expect(bad.statusCode).toBe(400);
    const missing = await t.post('/viewer/docs/tidak-ada/share', {});
    expect(missing.statusCode).toBe(404);
    const slug = await t.create('Body');
    const weird = await t.post(`/viewer/docs/${slug}/share`, { permissions: 'ya' });
    expect(weird.statusCode).toBe(400);
  });

  it('permissions default {comment:true, download:true} saat body kosong', async () => {
    const t = await setup();
    const slug = await t.create('Defaults');
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    let sent: any;
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      sent = JSON.parse(init!.body as string);
      return cloudOk();
    });
    const r = await t.post(`/viewer/docs/${slug}/share`);
    expect(r.statusCode).toBe(200);
    expect(sent.permissions).toEqual({ comment: true, download: true });
  });
});

// ---- Proxy dialog Share (plan-share-link-ui): /viewer/* → service dengan key dari env. ----

const shareMeta = (over: Record<string, unknown> = {}) => ({
  token: 'tok_share_123',
  slug: 'my-landing',
  title: 'My Landing',
  permissions: { comment: true, download: true },
  createdAt: '2026-11-24T10:00:00.000Z',
  expiresAt: null,
  views: 3,
  boards: [{ id: 'b1', name: 'Board', w: 100, h: 100 }],
  ...over,
});
const okJson = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } });

describe('proxy share /viewer/*', () => {
  it('GET /viewer/docs/:slug/shares: filter slug + petakan url /s/; env unset → configured:false', async () => {
    const t = await setup();
    const slug = await t.create('My Landing');
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    vi.stubGlobal('fetch', async () =>
      okJson({ shares: [shareMeta(), shareMeta({ token: 'tok_lain', slug: 'doc-lain' })] }),
    );
    const r = await t.app.inject({ method: 'GET', url: `/viewer/docs/${slug}/shares` });
    expect(r.statusCode, r.body).toBe(200);
    const data = r.json().data;
    expect(data.configured).toBe(true);
    expect(data.host).toBe('api.example');
    expect(data.shares).toHaveLength(1);
    expect(data.shares[0].url).toBe('https://api.example/s/tok_share_123');
    // Env kosong → configured:false tanpa memanggil service.
    vi.stubEnv('LAKAR_CLOUD_URL', '');
    const off = await t.app.inject({ method: 'GET', url: `/viewer/docs/${slug}/shares` });
    expect(off.json().data).toEqual({ configured: false, shares: [] });
  });

  it('GET /viewer/docs/:slug/shares: `shares` bukan array → EXPORT_FAILED (bukan TypeError)', async () => {
    const t = await setup();
    const slug = await t.create('My Landing');
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    vi.stubGlobal('fetch', async () => okJson({ shares: { aneh: true } }));
    const r = await t.app.inject({ method: 'GET', url: `/viewer/docs/${slug}/shares` });
    expect(r.statusCode).toBe(500);
    expect(r.json().error.code).toBe('EXPORT_FAILED');
    expect(r.json().error.retryable).toBe(true);
  });

  it('PATCH /viewer/shares/:token: diteruskan sebagai PATCH ke /api/shares/:token dengan key', async () => {
    const t = await setup();
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    vi.stubEnv('LAKAR_CLOUD_KEY', 'kunci-1');
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return okJson(shareMeta());
    });
    const r = await t.app.inject({ method: 'PATCH', url: '/viewer/shares/tok_share_123', payload: { permissions: { comment: false }, expiresAt: null } });
    expect(r.statusCode, r.body).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.example/api/shares/tok_share_123');
    expect(calls[0]!.init!.method).toBe('PATCH');
    expect((calls[0]!.init!.headers as Record<string, string>).authorization).toBe('Bearer kunci-1');
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ permissions: { comment: false }, expiresAt: null });
    const bad = await t.app.inject({ method: 'PATCH', url: '/viewer/shares/tok_share_123', payload: { permissions: { comment: 'ya' } } });
    expect(bad.statusCode).toBe(400);
  });

  it('DELETE /viewer/shares/:token: 204 service → {revoked:true}', async () => {
    const t = await setup();
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 204 });
    });
    const r = await t.app.inject({ method: 'DELETE', url: '/viewer/shares/tok_share_123' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toEqual({ token: 'tok_share_123', revoked: true });
    expect(calls[0]!.url).toBe('https://api.example/api/shares/tok_share_123');
    expect(calls[0]!.init!.method).toBe('DELETE');
  });

  it('POST /viewer/shares/:token/refresh: render ulang lalu PUT doc+boards, url pulang', async () => {
    const t = await setup();
    const slug = await t.create('My Landing');
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return okJson({ token: 'tok_share_123', url: 'https://api.example/s/tok_share_123' });
    });
    const r = await t.post('/viewer/shares/tok_share_123/refresh', { slug });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toEqual({ token: 'tok_share_123', url: 'https://api.example/s/tok_share_123', boards: 1 });
    const c = calls[0]!;
    expect(c.url).toBe('https://api.example/api/shares/tok_share_123');
    expect(c.init!.method).toBe('PUT');
    const sent = JSON.parse(c.init!.body as string);
    expect(sent.doc.schemaVersion).toBeGreaterThan(0);
    expect(sent.boards).toHaveLength(1);
    // Body tanpa slug → 400; slug tak dikenal → 404 sebelum fetch.
    expect((await t.post('/viewer/shares/tok/refresh', {})).statusCode).toBe(400);
    expect((await t.post('/viewer/shares/tok/refresh', { slug: 'tidak-ada' })).statusCode).toBe(404);
  });
});
