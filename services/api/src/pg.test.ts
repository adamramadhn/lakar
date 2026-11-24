// Integrasi Postgres nyata untuk PgShareRepo + runner migrasi. Dilewati bila DATABASE_URL tidak
// diset (CI lokal tanpa DB); jalankan dengan postgres:16, mis.
//   docker run -d -p 55432:5432 -e POSTGRES_PASSWORD=test postgres:16
//   DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/postgres pnpm vitest run services/api/src/pg.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createDocument } from '@lakar/core';
import { createPool, migrate } from './db.js';
import { PgShareRepo, PgUserRepo, type NewShare } from './repo.js';
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
  let users: PgUserRepo;
  beforeAll(async () => {
    pool = createPool(URL_!);
    await migrate(pool);
    repo = new PgShareRepo(pool);
    users = new PgUserRepo(pool);
    // Bersihkan sisa run sebelumnya supaya list() deterministik.
    await pool.query('TRUNCATE share_comments, share_boards, shares, sessions, magic_tokens, identities, users CASCADE');
  });
  afterAll(async () => {
    await pool.query('TRUNCATE share_comments, share_boards, shares, sessions, magic_tokens, identities, users CASCADE').catch(() => {});
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

  it('owner_id: create dengan pemilik, ownerOf membedakan null/unknown/revoked, list(owner) tersaring', async () => {
    const owner = await users.upsertUserIdentity({ provider: 'email', subject: 'owner@x.y', email: 'owner@x.y' });
    const lain = await users.upsertUserIdentity({ provider: 'email', subject: 'lain@x.y', email: 'lain@x.y' });
    await repo.create(share('tok_pg_own', { ownerId: owner.id }));
    await repo.create(share('tok_pg_lain', { ownerId: lain.id }));
    await repo.create(share('tok_pg_null'));
    expect(await repo.ownerOf('tok_pg_own')).toBe(owner.id);
    expect(await repo.ownerOf('tok_pg_null')).toBeNull();
    expect(await repo.ownerOf('tidak-ada')).toBeUndefined();
    const mine = await repo.list(owner.id);
    expect(mine.map((x) => x.token)).toEqual(['tok_pg_own']);
    const all = await repo.list();
    expect(all.map((x) => x.token)).toEqual(expect.arrayContaining(['tok_pg_own', 'tok_pg_lain', 'tok_pg_null']));
    await repo.revoke('tok_pg_own');
    expect(await repo.ownerOf('tok_pg_own')).toBeUndefined();
  });
});

describe.skipIf(!URL_)('PgUserRepo (Postgres nyata)', () => {
  let pool: Pool;
  let users: PgUserRepo;
  beforeAll(async () => {
    pool = createPool(URL_!);
    await migrate(pool);
    users = new PgUserRepo(pool, { sessionTtlMs: 60_000 });
    await pool.query('TRUNCATE sessions, magic_tokens, identities, users CASCADE');
  });
  afterAll(async () => {
    await pool.query('TRUNCATE sessions, magic_tokens, identities, users CASCADE').catch(() => {});
    await pool.end();
  });

  it('upsertUserIdentity: user baru; provider lain email sama → user sama (link-by-email, citext)', async () => {
    const u1 = await users.upsertUserIdentity({ provider: 'google', subject: 'g-1', email: 'Link@X.Y', name: 'Satu', avatarUrl: 'https://p/1' });
    expect(u1).toMatchObject({ email: 'Link@X.Y', name: 'Satu', avatarUrl: 'https://p/1' });
    const u2 = await users.upsertUserIdentity({ provider: 'github', subject: '42', email: 'link@x.y' });
    expect(u2.id).toBe(u1.id);
    // Identity yang sama lagi → user sama; cari by identity dan by email (case-insensitive).
    expect((await users.upsertUserIdentity({ provider: 'google', subject: 'g-1', email: 'link@x.y' })).id).toBe(u1.id);
    expect((await users.findUserByIdentity('github', '42'))!.id).toBe(u1.id);
    expect((await users.findUserByEmail('LINK@x.y'))!.id).toBe(u1.id);
    expect(await users.findUserByIdentity('github', 'zzz')).toBeUndefined();
  });

  it('session: create → sessionUser (rolling expiry) → revoke; token ngawur → undefined', async () => {
    const u = await users.upsertUserIdentity({ provider: 'email', subject: 's@x.y', email: 's@x.y' });
    const { token, expiresAt } = await users.createSession(u.id, { ua: 'vitest' });
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    const found = await users.sessionUser(token);
    expect(found!.id).toBe(u.id);
    // Rolling: expires_at maju setelah dipakai.
    const { rows } = await pool.query<{ expires_at: Date }>('SELECT expires_at FROM sessions WHERE token = $1', [token]);
    expect(rows[0]!.expires_at.getTime()).toBeGreaterThanOrEqual(expiresAt.getTime());
    expect(await users.sessionUser('ngawur')).toBeUndefined();
    expect(await users.revokeSession(token)).toBe(true);
    expect(await users.sessionUser(token)).toBeUndefined();
    expect(await users.revokeSession(token)).toBe(false);
  });

  it('magic token: consume sekali → email; kedua → undefined; kedaluwarsa → undefined', async () => {
    const hash = (t: string) => createHash('sha256').update(t).digest('hex');
    await users.createMagicToken('m@x.y', hash('tok-1'), new Date(Date.now() + 60_000));
    await users.createMagicToken('exp@x.y', hash('tok-exp'), new Date(Date.now() - 1000));
    expect(await users.consumeMagicToken(hash('tok-1'))).toBe('m@x.y');
    expect(await users.consumeMagicToken(hash('tok-1'))).toBeUndefined();
    expect(await users.consumeMagicToken(hash('tok-exp'))).toBeUndefined();
    expect(await users.consumeMagicToken(hash('ngawur'))).toBeUndefined();
  });
});

describe.skipIf(URL_)('PgShareRepo', () => {
  it('dilewati: DATABASE_URL tidak diset', () => {});
});
