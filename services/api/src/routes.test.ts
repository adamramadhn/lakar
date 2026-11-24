// Tes route @lakar/api dengan MemoryShareRepo (seluruh matriks kasus spec): app.inject,
// pola yang sama dengan tes daemon. Integrasi Postgres ada di pg.test.ts.
import { describe, expect, it } from 'vitest';
import { createDocument } from '@lakar/core';
import { buildApi } from './app.js';
import { MemoryShareRepo } from './repo.js';

const KEY = 'test-key';
const AUTH = { authorization: `Bearer ${KEY}` };
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const board = (id = 'b1', pngB64 = PNG_B64) => ({ id, name: 'Board 1', x: 0, y: 0, w: 390, h: 844, pngB64 });
const shareBody = (over: Record<string, unknown> = {}) => ({
  title: 'My Landing',
  slug: 'my-landing',
  doc: createDocument(),
  boards: [board()],
  permissions: { comment: true, download: true },
  ...over,
});

function setup(apiKey = KEY) {
  const repo = new MemoryShareRepo();
  const app = buildApi({ repo, apiKey, publicBaseUrl: 'https://share.example' });
  const post = (url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url, ...(payload !== undefined ? { payload: payload as object } : {}), headers });
  const get = (url: string, headers: Record<string, string> = {}) => app.inject({ method: 'GET', url, headers });
  const del = (url: string, headers: Record<string, string> = {}) => app.inject({ method: 'DELETE', url, headers });
  const create = async (body = shareBody()) => {
    const r = await post('/api/shares', body, AUTH);
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data as { token: string; url: string };
  };
  return { repo, app, post, get, del, create };
}

describe('POST /api/shares', () => {
  it('upload valid → {token,url}; token ≥21 char base64url; meta tampil di GET publik', async () => {
    const t = setup();
    const { token, url } = await t.create();
    expect(token).toMatch(/^[A-Za-z0-9_-]{21,}$/);
    expect(url).toBe(`https://share.example/api/shares/${token}`);
    const meta = (await t.get(`/api/shares/${token}`)).json().data;
    expect(meta.title).toBe('My Landing');
    expect(meta.slug).toBe('my-landing');
    expect(meta.permissions).toEqual({ comment: true, download: true });
    expect(meta.commentsEnabled).toBe(true);
    expect(meta.createdAt).toBeTruthy();
    expect(meta.boards).toEqual([{ id: 'b1', name: 'Board 1', w: 390, h: 844, imageUrl: `/api/shares/${token}/boards/b1.png` }]);
  });

  it('tanpa key / key salah → 401 UNAUTHORIZED', async () => {
    const t = setup();
    const noKey = await t.post('/api/shares', shareBody());
    expect(noKey.statusCode).toBe(401);
    expect(noKey.json().error.code).toBe('UNAUTHORIZED');
    const badKey = await t.post('/api/shares', shareBody(), { authorization: 'Bearer salah' });
    expect(badKey.statusCode).toBe(401);
  });

  it('doc tidak lolos parseDocument → 400; boards kosong/png rusak → 400', async () => {
    const t = setup();
    const badDoc = await t.post('/api/shares', shareBody({ doc: { schemaVersion: 99 } }), AUTH);
    expect(badDoc.statusCode).toBe(400);
    expect(badDoc.json().error.code).toBe('SCHEMA_INVALID');
    const noBoards = await t.post('/api/shares', shareBody({ boards: [] }), AUTH);
    expect(noBoards.statusCode).toBe(400);
    const badPng = await t.post('/api/shares', shareBody({ boards: [board('b1', 'aGVsbG8=')] }), AUTH);
    expect(badPng.statusCode).toBe(400);
  });

  it('GET /api/shares tanpa key → 401; dengan key → daftar meta tanpa doc/png', async () => {
    const t = setup();
    expect((await t.get('/api/shares')).statusCode).toBe(401);
    const { token } = await t.create();
    const r = await t.get('/api/shares', AUTH);
    expect(r.statusCode).toBe(200);
    const shares = r.json().data.shares;
    expect(shares).toHaveLength(1);
    expect(shares[0].token).toBe(token);
    expect(shares[0].doc).toBeUndefined();
    expect(shares[0].boards[0].png).toBeUndefined();
  });
});

describe('GET publik + PNG + download', () => {
  it('PNG board → image/png bytea; board tak dikenal → 404; token tak dikenal → 404', async () => {
    const t = setup();
    const { token } = await t.create();
    const png = await t.get(`/api/shares/${token}/boards/b1.png`);
    expect(png.statusCode).toBe(200);
    expect(png.headers['content-type']).toBe('image/png');
    expect(Buffer.from(png.rawPayload).equals(Buffer.from(PNG_B64, 'base64'))).toBe(true);
    expect((await t.get(`/api/shares/${token}/boards/lain.png`)).statusCode).toBe(404);
    expect((await t.get('/api/shares/token-tidak-ada')).statusCode).toBe(404);
  });

  it('download on → lampiran .lakar.json; download off → 403', async () => {
    const t = setup();
    const doc = createDocument();
    const { token } = await t.create(shareBody({ doc }));
    const dl = await t.get(`/api/shares/${token}/download`);
    expect(dl.statusCode).toBe(200);
    expect(dl.headers['content-disposition']).toBe('attachment; filename="my-landing.lakar.json"');
    expect(dl.json().id).toBe(doc.id);
    const off = await t.create(shareBody({ title: 'No DL', slug: 'no-dl', permissions: { comment: true, download: false } }));
    const denied = await t.get(`/api/shares/${off.token}/download`);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('FORBIDDEN');
  });
});

describe('komentar tamu', () => {
  it('POST komentar → 201 + tampil di GET; balasan parentId valid → tersimpan', async () => {
    const t = setup();
    const { token } = await t.create();
    const made = await t.post(`/api/shares/${token}/comments`, { boardId: 'b1', x: 10, y: 20, author: 'Tamu', body: 'Halo' });
    expect(made.statusCode).toBe(201);
    const c1 = made.json().data;
    expect(c1).toMatchObject({ boardId: 'b1', x: 10, y: 20, author: 'Tamu', body: 'Halo' });
    const reply = await t.post(`/api/shares/${token}/comments`, { boardId: 'b1', x: 0, y: 0, author: 'Pemilik', body: 'Siap', parentId: c1.id });
    expect(reply.statusCode).toBe(201);
    const list = (await t.get(`/api/shares/${token}/comments`)).json().data.comments;
    expect(list).toHaveLength(2);
    expect(list[1].parentId).toBe(c1.id);
  });

  it('comment perm off → 403; author>40/body>2000 → 400; board/parent tak dikenal → 400', async () => {
    const t = setup();
    const off = await t.create(shareBody({ title: 'No C', slug: 'no-c', permissions: { comment: false, download: true } }));
    const denied = await t.post(`/api/shares/${off.token}/comments`, { boardId: 'b1', x: 0, y: 0, author: 'A', body: 'B' });
    expect(denied.statusCode).toBe(403);
    const { token } = await t.create(shareBody({ title: 'Lain', slug: 'lain' }));
    const long = await t.post(`/api/shares/${token}/comments`, { boardId: 'b1', x: 0, y: 0, author: 'a'.repeat(41), body: 'B' });
    expect(long.statusCode).toBe(400);
    const huge = await t.post(`/api/shares/${token}/comments`, { boardId: 'b1', x: 0, y: 0, author: 'A', body: 'b'.repeat(2001) });
    expect(huge.statusCode).toBe(400);
    const badBoard = await t.post(`/api/shares/${token}/comments`, { boardId: 'zzz', x: 0, y: 0, author: 'A', body: 'B' });
    expect(badBoard.statusCode).toBe(400);
    const badParent = await t.post(`/api/shares/${token}/comments`, { boardId: 'b1', x: 0, y: 0, author: 'A', body: 'B', parentId: 999 });
    expect(badParent.statusCode).toBe(400);
  });
});

describe('revoke + healthz', () => {
  it('DELETE + key → 204 lalu semua GET publik 404; token tak dikenal → 404', async () => {
    const t = setup();
    const { token } = await t.create();
    expect((await t.del(`/api/shares/${token}`)).statusCode).toBe(401);
    expect((await t.del(`/api/shares/${token}`, AUTH)).statusCode).toBe(204);
    for (const url of [`/api/shares/${token}`, `/api/shares/${token}/boards/b1.png`, `/api/shares/${token}/comments`, `/api/shares/${token}/download`]) {
      expect((await t.get(url)).statusCode, url).toBe(404);
    }
    expect((await t.del(`/api/shares/${token}`, AUTH)).statusCode).toBe(404);
    expect((await t.del('/api/shares/tidak-ada', AUTH)).statusCode).toBe(404);
  });

  it('healthz: db up → {ok:true, db:up}; db down → 503', async () => {
    const t = setup();
    const up = await t.get('/healthz');
    expect(up.statusCode).toBe(200);
    expect(up.json()).toEqual({ ok: true, db: 'up' });
    t.repo.up = false;
    const down = await t.get('/healthz');
    expect(down.statusCode).toBe(503);
    expect(down.json().ok).toBe(false);
  });
});
