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
});

describe.skipIf(URL_)('PgShareRepo', () => {
  it('dilewati: DATABASE_URL tidak diset', () => {});
});
