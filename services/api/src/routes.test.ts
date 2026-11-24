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
  const patch = (url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method: 'PATCH', url, ...(payload !== undefined ? { payload: payload as object } : {}), headers });
  const put = (url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method: 'PUT', url, ...(payload !== undefined ? { payload: payload as object } : {}), headers });
  const del = (url: string, headers: Record<string, string> = {}) => app.inject({ method: 'DELETE', url, headers });
  const create = async (body = shareBody()) => {
    const r = await post('/api/shares', body, AUTH);
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data as { token: string; url: string };
  };
  return { repo, app, post, get, patch, put, del, create };
}

describe('POST /api/shares', () => {
  it('upload valid → {token,url}; token ≥21 char base64url; meta tampil di GET publik', async () => {
    const t = setup();
    const { token, url } = await t.create();
    expect(token).toMatch(/^[A-Za-z0-9_-]{21,}$/);
    expect(url).toBe(`https://share.example/s/${token}`);
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

  it('GET comments tidak men-serialize guestId; `mine` dari header x-lakar-guest-id', async () => {
    const t = setup();
    const { token } = await t.create();
    await t.post(`/api/shares/${token}/comments`, { boardId: 'b1', x: 0, y: 0, author: 'Saya', body: 'milikku', guestId: 'g-1' });
    await t.post(`/api/shares/${token}/comments`, { boardId: 'b1', x: 0, y: 0, author: 'Lain', body: 'punya orang', guestId: 'g-2' });
    const mine = (await t.get(`/api/shares/${token}/comments`, { 'x-lakar-guest-id': 'g-1' })).json().data.comments;
    expect(mine.map((c: { mine: boolean }) => c.mine)).toEqual([true, false]);
    expect(mine.every((c: { guestId?: string }) => c.guestId === undefined)).toBe(true);
    // Tanpa header → semua mine:false; header tamu lain → semua false untuk g-1.
    const anon = (await t.get(`/api/shares/${token}/comments`)).json().data.comments;
    expect(anon.map((c: { mine: boolean }) => c.mine)).toEqual([false, false]);
    // POST mengembalikan komentar baru dengan mine:true dan tanpa guestId mentah.
    const made = await t.post(`/api/shares/${token}/comments`, { boardId: 'b1', x: 1, y: 1, author: 'Saya', body: 'baru', guestId: 'g-1' });
    expect(made.json().data).toMatchObject({ mine: true });
    expect(made.json().data.guestId).toBeUndefined();
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
    // Pin di luar batas board (390×844) → 400, tidak di-clamp diam-diam.
    const oob = await t.post(`/api/shares/${token}/comments`, { boardId: 'b1', x: 9999, y: 0, author: 'A', body: 'B' });
    expect(oob.statusCode).toBe(400);
    const neg = await t.post(`/api/shares/${token}/comments`, { boardId: 'b1', x: -1, y: 0, author: 'A', body: 'B' });
    expect(neg.statusCode).toBe(400);
    // Tepat di tepi board masih boleh.
    const edge = await t.post(`/api/shares/${token}/comments`, { boardId: 'b1', x: 390, y: 844, author: 'A', body: 'B' });
    expect(edge.statusCode).toBe(201);
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

describe('PATCH /api/shares/:token', () => {
  it('izin parsial merge instan; expiresAt ISO/null; share kedaluwarsa bisa dihidupkan lagi', async () => {
    const t = setup();
    const { token } = await t.create();
    expect((await t.patch(`/api/shares/${token}`, { permissions: { download: false } })).statusCode).toBe(401);
    const r = await t.patch(`/api/shares/${token}`, { permissions: { download: false } }, AUTH);
    expect(r.statusCode).toBe(200);
    expect(r.json().data.permissions).toEqual({ comment: true, download: false });
    // Izin baru langsung berlaku tanpa re-upload.
    expect((await t.get(`/api/shares/${token}/download`)).statusCode).toBe(403);
    const iso = new Date(Date.now() - 1000).toISOString();
    const exp = await t.patch(`/api/shares/${token}`, { expiresAt: iso }, AUTH);
    expect(exp.statusCode).toBe(200);
    expect(exp.json().data.expiresAt).toBe(iso);
    // Bentuk tanggal non-ISO-datetime ("March 5" yang lolos Date.parse) ditolak.
    expect((await t.patch(`/api/shares/${token}`, { expiresAt: 'March 5' }, AUTH)).statusCode).toBe(400);
    // Sudah kedaluwarsa ≡ revoked untuk publik, tapi masih tampil di list pemilik.
    expect((await t.get(`/api/shares/${token}`)).statusCode).toBe(404);
    expect((await t.get('/api/shares', AUTH)).json().data.shares[0].token).toBe(token);
    // PATCH null = "Never" → hidup lagi.
    const revive = await t.patch(`/api/shares/${token}`, { expiresAt: null }, AUTH);
    expect(revive.statusCode).toBe(200);
    expect(revive.json().data.expiresAt).toBeNull();
    expect((await t.get(`/api/shares/${token}`)).statusCode).toBe(200);
  });

  it('token tak dikenal/revoked → 404; body aneh → 400', async () => {
    const t = setup();
    expect((await t.patch('/api/shares/tidak-ada', { permissions: { download: true } }, AUTH)).statusCode).toBe(404);
    const { token } = await t.create();
    const bad = await t.patch(`/api/shares/${token}`, { permissions: { comment: 'ya' } }, AUTH);
    expect(bad.statusCode).toBe(400);
    await t.del(`/api/shares/${token}`, AUTH);
    expect((await t.patch(`/api/shares/${token}`, { permissions: { download: true } }, AUTH)).statusCode).toBe(404);
  });
});

describe('PUT /api/shares/:token (refresh snapshot)', () => {
  it('doc+boards diganti, token/url tetap; komentar board yang hilang ikut terhapus; share mati → 404', async () => {
    const t = setup();
    const { token } = await t.create(shareBody({ boards: [board('b1'), board('b2')] }));
    await t.post(`/api/shares/${token}/comments`, { boardId: 'b1', x: 1, y: 2, author: 'A', body: 'hilang' });
    const keep = (await t.post(`/api/shares/${token}/comments`, { boardId: 'b2', x: 1, y: 2, author: 'A', body: 'tetap' })).json().data;
    const doc2 = createDocument();
    const r = await t.put(
      `/api/shares/${token}`,
      { doc: doc2, boards: [board('b2', PNG_B64)], title: 'Judul Baru' },
      AUTH,
    );
    expect(r.statusCode, r.body).toBe(200);
    const meta = (await t.get(`/api/shares/${token}`)).json().data;
    expect(meta.title).toBe('Judul Baru');
    expect(meta.boards.map((b: { id: string }) => b.id)).toEqual(['b2']);
    // Komentar pada board yang masih ada di snapshot baru tetap; komentar di board b1 (hilang) terhapus.
    const comments = (await t.get(`/api/shares/${token}/comments`)).json().data.comments;
    expect(comments).toHaveLength(1);
    expect(comments[0].id).toBe(keep.id);
    // PNG board lama hilang, baru tersedia.
    expect((await t.get(`/api/shares/${token}/boards/b1.png`)).statusCode).toBe(404);
    expect((await t.get(`/api/shares/${token}/boards/b2.png`)).statusCode).toBe(200);
    expect((await t.put('/api/shares/tidak-ada', { doc: doc2, boards: [board()] }, AUTH)).statusCode).toBe(404);
    expect((await t.put(`/api/shares/${token}`, { doc: doc2, boards: [board()] })).statusCode).toBe(401);
  });
});

describe('views + expiresAt di create/meta', () => {
  it('default expiresAt ≈ +30 hari; null = Never; GET meta menghitung views, PNG tidak', async () => {
    const t = setup();
    const { token } = await t.create();
    const first = (await t.get(`/api/shares/${token}`)).json().data;
    expect(first.views).toBe(1);
    const expMs = new Date(first.expiresAt).getTime() - Date.now();
    expect(expMs).toBeGreaterThan(28 * 86_400_000);
    expect(expMs).toBeLessThan(31 * 86_400_000);
    await t.get(`/api/shares/${token}/boards/b1.png`);
    await t.get(`/api/shares/${token}/comments`);
    const second = (await t.get(`/api/shares/${token}`)).json().data;
    expect(second.views).toBe(2);
    const never = await t.create(shareBody({ slug: 'never', expiresAt: null }));
    const metaNever = (await t.get(`/api/shares/${never.token}`)).json().data;
    expect(metaNever.expiresAt).toBeNull();
  });
});

describe('edit/hapus komentar tamu (guestId)', () => {
  it('PATCH own → 200; guestId lain / komentar lama tanpa guestId → 403; DELETE menghapus balasan transitif', async () => {
    const t = setup();
    const { token } = await t.create();
    const mine = (
      await t.post(`/api/shares/${token}/comments`, { boardId: 'b1', x: 0, y: 0, author: 'Saya', body: 'awal', guestId: 'g-1' })
    ).json().data;
    const legacy = (await t.post(`/api/shares/${token}/comments`, { boardId: 'b1', x: 0, y: 0, author: 'Lama', body: 'tanpa id' })).json().data;
    const reply = (await t.post(`/api/shares/${token}/comments`, { boardId: 'b1', x: 0, y: 0, author: 'Saya', body: 'balas', parentId: mine.id, guestId: 'g-1' })).json().data;
    const edited = await t.patch(`/api/shares/${token}/comments/${mine.id}`, { guestId: 'g-1', body: 'diedit' });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().data.body).toBe('diedit');
    expect((await t.patch(`/api/shares/${token}/comments/${mine.id}`, { guestId: 'g-2', body: 'x' })).statusCode).toBe(403);
    expect((await t.patch(`/api/shares/${token}/comments/${legacy.id}`, { guestId: 'g-1', body: 'x' })).statusCode).toBe(403);
    expect((await t.patch(`/api/shares/${token}/comments/${mine.id}`, { body: 'x' })).statusCode).toBe(400);
    // Hapus thread induk → balasan ikut hilang.
    expect((await t.app.inject({ method: 'DELETE', url: `/api/shares/${token}/comments/${mine.id}`, payload: { guestId: 'g-2' } })).statusCode).toBe(403);
    const del = await t.app.inject({ method: 'DELETE', url: `/api/shares/${token}/comments/${mine.id}`, payload: { guestId: 'g-1' } });
    expect(del.statusCode).toBe(204);
    const rest = (await t.get(`/api/shares/${token}/comments`)).json().data.comments.map((c: { id: number }) => c.id);
    expect(rest).not.toContain(mine.id);
    expect(rest).not.toContain(reply.id);
    // guestId hanya lewat body — query ?guestId= tidak diterima (kredensial tidak boleh di URL/log).
    expect((await t.app.inject({ method: 'DELETE', url: `/api/shares/${token}/comments/${legacy.id}?guestId=g-1` })).statusCode).toBe(400);
  });
});

describe('GET /s/* (halaman tamu)', () => {
  it('share hidup → HTML 200; share mati → status 404 dengan shell sama; aset js/css tersaji', async () => {
    const t = setup();
    const { token } = await t.create();
    const page = await t.get(`/s/${token}`);
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain('share.js');
    // CSP halaman tamu: aset same-origin saja + frame-ancestors (anti-clickjacking).
    expect(page.headers['content-security-policy']).toContain("frame-ancestors 'self'");
    const dead = await t.get('/s/token-tidak-ada');
    expect(dead.statusCode).toBe(404);
    expect(dead.body).toContain('share.js');
    for (const asset of ['share.js', 'share.css']) {
      const r = await t.get(`/s/${asset}`);
      expect(r.statusCode, asset).toBe(200);
      expect(r.headers['content-type'], asset).not.toContain('text/html');
    }
  });
});
