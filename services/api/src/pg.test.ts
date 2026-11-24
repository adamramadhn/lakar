// Integrasi Postgres nyata untuk PgShareRepo + runner migrasi. Dilewati bila DATABASE_URL tidak
// diset (CI lokal tanpa DB); jalankan dengan postgres:16, mis.
//   docker run -d -p 55432:5432 -e POSTGRES_PASSWORD=test postgres:16
//   DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/postgres pnpm vitest run services/api/src/pg.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDocument } from '@lakar/core';
import { createPool, migrate } from './db.js';
import { PgShareRepo, type NewShare } from './repo.js';
import type { Pool } from 'pg';

const URL_ = process.env.DATABASE_URL;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const share = (token: string, over: Partial<NewShare> = {}): NewShare => ({
  token,
  slug: `doc-${token}`,
  title: `Doc ${token}`,
  permissions: { comment: true, download: true },
  doc: createDocument(),
  expiresAt: null,
  boards: [
    { id: 'b1', name: 'Board 1', x: 0, y: 0, w: 390, h: 844, png: PNG },
    { id: 'b2', name: 'Board 2', x: 500, y: 0, w: 390, h: 844, png: PNG },
  ],
  ...over,
});

describe.skipIf(!URL_)('PgShareRepo (Postgres nyata)', () => {
  let pool: Pool;
  let repo: PgShareRepo;
  beforeAll(async () => {
    pool = createPool(URL_!);
    await migrate(pool);
    repo = new PgShareRepo(pool);
    // Bersihkan sisa run sebelumnya supaya list() deterministik.
    await pool.query('TRUNCATE share_comments, share_boards, shares CASCADE');
  });
  afterAll(async () => {
    await pool.query('TRUNCATE share_comments, share_boards, shares CASCADE').catch(() => {});
    await repo.close();
  });

  it('migrate idempoten: run kedua tidak menerapkan ulang', async () => {
    expect(await migrate(pool)).toEqual([]);
  });

  it('create → get/list meta; PNG pulang utuh; docJson = dokumen tersimpan', async () => {
    const s = share('tok_pg_1');
    await repo.create(s);
    const meta = await repo.get('tok_pg_1');
    expect(meta).toMatchObject({ token: 'tok_pg_1', slug: 'doc-tok_pg_1', title: 'Doc tok_pg_1', permissions: { comment: true, download: true } });
    expect(meta!.boards.map((b) => b.id)).toEqual(['b1', 'b2']);
    const list = await repo.list();
    expect(list.map((x) => x.token)).toContain('tok_pg_1');
    expect((await repo.boardPng('tok_pg_1', 'b2'))!.equals(PNG)).toBe(true);
    expect(await repo.boardPng('tok_pg_1', 'zzz')).toBeUndefined();
    expect(await repo.docJson('tok_pg_1')).toMatchObject({ id: (s.doc as { id: string }).id });
  });

  it('komentar: tambah, daftar urut, parentId asing → missing-parent', async () => {
    await repo.create(share('tok_pg_2'));
    const c1 = await repo.addComment('tok_pg_2', { boardId: 'b1', x: 1, y: 2, author: 'A', body: 'hi' });
    expect(c1.status).toBe('ok');
    const c2 = await repo.addComment('tok_pg_2', { boardId: 'b1', x: 0, y: 0, author: 'B', body: 're', parentId: (c1 as { comment: { id: number } }).comment.id });
    expect(c2.status).toBe('ok');
    const orphan = await repo.addComment('tok_pg_2', { boardId: 'b1', x: 0, y: 0, author: 'C', body: 'x', parentId: 99999 });
    expect(orphan.status).toBe('missing-parent');
    const list = await repo.comments('tok_pg_2');
    expect(list!.map((c) => c.author)).toEqual(['A', 'B']);
    expect(await repo.comments('tidak-ada')).toBeUndefined();
    expect((await repo.addComment('tidak-ada', { boardId: 'b1', x: 0, y: 0, author: 'A', body: 'B' })).status).toBe('missing-share');
  });

  it('revoke: semua baca → undefined; revoke ulang → false; list tidak memuat revoked', async () => {
    await repo.create(share('tok_pg_3'));
    expect(await repo.revoke('tok_pg_3')).toBe(true);
    expect(await repo.get('tok_pg_3')).toBeUndefined();
    expect(await repo.boardPng('tok_pg_3', 'b1')).toBeUndefined();
    expect(await repo.docJson('tok_pg_3')).toBeUndefined();
    expect(await repo.comments('tok_pg_3')).toBeUndefined();
    expect(await repo.revoke('tok_pg_3')).toBe(false);
    expect((await repo.list()).map((x) => x.token)).not.toContain('tok_pg_3');
  });

  it('ping → true', async () => {
    expect(await repo.ping()).toBe(true);
  });

  it('expiry: expires_at lampau → get undefined tapi tetap di list; update expiresAt:null menghidupkan lagi', async () => {
    await repo.create(share('tok_pg_exp', { expiresAt: new Date(Date.now() - 1000) }));
    expect(await repo.get('tok_pg_exp')).toBeUndefined();
    expect((await repo.list()).map((x) => x.token)).toContain('tok_pg_exp');
    const revived = await repo.update('tok_pg_exp', { expiresAt: null });
    expect(revived?.expiresAt).toBeNull();
    expect(await repo.get('tok_pg_exp')).toBeTruthy();
  });

  it('update izin shallow-merge; countView hanya menaikkan views', async () => {
    await repo.create(share('tok_pg_upd'));
    const patched = await repo.update('tok_pg_upd', { permissions: { download: false } });
    expect(patched?.permissions).toEqual({ comment: true, download: false });
    expect((await repo.get('tok_pg_upd'))!.views).toBe(0);
    expect((await repo.countView('tok_pg_upd'))!.views).toBe(1);
    expect((await repo.countView('tok_pg_upd'))!.views).toBe(2);
    expect(await repo.update('tidak-ada', { permissions: { comment: false } })).toBeUndefined();
  });

  it('refresh: doc+boards diganti atomik, komentar board hilang terhapus (+ cascade balasan), token sama', async () => {
    await repo.create(share('tok_pg_rf'));
    const gone = await repo.addComment('tok_pg_rf', { boardId: 'b1', x: 0, y: 0, author: 'A', body: 'hilang', guestId: 'g1' });
    // Balasan di board yang bertahan tetap ikut terhapus bila induknya hilang (ON DELETE CASCADE).
    await repo.addComment('tok_pg_rf', { boardId: 'b3', x: 0, y: 0, author: 'B', body: 're-cascade', parentId: (gone as { comment: { id: number } }).comment.id });
    await repo.addComment('tok_pg_rf', { boardId: 'b3', x: 0, y: 0, author: 'A', body: 'stay' });
    expect(await repo.refresh('tok_pg_rf', { doc: createDocument(), boards: [{ id: 'b3', name: 'Baru', x: 0, y: 0, w: 10, h: 10, png: PNG }] })).toBe(true);
    const meta = await repo.get('tok_pg_rf');
    expect(meta!.boards.map((b) => b.id)).toEqual(['b3']);
    expect(await repo.boardPng('tok_pg_rf', 'b1')).toBeUndefined();
    expect(await repo.boardPng('tok_pg_rf', 'b3')).toBeTruthy();
    expect((await repo.comments('tok_pg_rf'))!.map((c) => c.body)).toEqual(['stay']);
    expect(await repo.refresh('tidak-ada', { doc: {}, boards: [] })).toBe(false);
  });

  it('komentar guestId: update/delete hanya pemilik; delete cascade ke balasan', async () => {
    await repo.create(share('tok_pg_gc'));
    const c = await repo.addComment('tok_pg_gc', { boardId: 'b1', x: 0, y: 0, author: 'A', body: 'hi', guestId: 'g1' });
    const id = (c as { comment: { id: number } }).comment.id;
    const r = await repo.addComment('tok_pg_gc', { boardId: 'b1', x: 0, y: 0, author: 'A', body: 're', parentId: id, guestId: 'g1' });
    expect(r.status).toBe('ok');
    expect((await repo.updateComment('tok_pg_gc', id, 'g2', 'x')).status).toBe('forbidden');
    expect((await repo.updateComment('tok_pg_gc', id, 'g1', 'edited')).status).toBe('ok');
    expect((await repo.deleteComment('tok_pg_gc', id, 'g2')).status).toBe('forbidden');
    expect((await repo.deleteComment('tok_pg_gc', id, 'g1')).status).toBe('ok');
    expect(await repo.comments('tok_pg_gc')).toHaveLength(0);
  });
});

describe.skipIf(URL_)('PgShareRepo', () => {
  it('dilewati: DATABASE_URL tidak diset', () => {});
});
