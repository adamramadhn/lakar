// Integrasi Postgres nyata untuk PgRoomRepo + runner migrasi (sequencer FOR UPDATE ikut dites
// lewat dua appendOp berurutan). Dilewati bila DATABASE_URL tidak diset; jalankan dengan
// postgres:16, mis.
//   docker run -d -p 55434:5432 -e POSTGRES_PASSWORD=test postgres:16
//   DATABASE_URL=postgres://postgres:test@127.0.0.1:55434/postgres pnpm vitest run services/sync/src/pg.test.ts
// Bagian auth (story B): tabel `users`/`sessions` dibuat tes sendiri sesuai bentuk migrasi
// 0003 services/api — migrasi api memang tidak ada di paket ini, jadi tidak bisa lewat `migrate`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDocument } from '@lakar/core';
import type { LakarDocument } from '@lakar/schema';
import { createPool, migrate } from './db.js';
import { AuthTablesMissing, PgRoomRepo, type NewRoom } from './repo.js';
import type { Pool } from 'pg';

const URL_ = process.env.DATABASE_URL;

const room = (token: string, over: Partial<NewRoom> = {}): NewRoom => ({
  token,
  viewToken: `${token}-view`,
  title: `Room ${token}`,
  doc: createDocument(),
  ...over,
});

// Bentuk tabel auth = services/api/migrations/0003_auth.sql (hanya yang sync baca).
const AUTH_TABLES_SQL = `
  CREATE EXTENSION IF NOT EXISTS citext;
  CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email citext NOT NULL UNIQUE,
    name text,
    avatar_url text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    ua text
  );
`;

describe.skipIf(!URL_)('PgRoomRepo (Postgres nyata)', () => {
  let pool: Pool;
  let repo: PgRoomRepo;
  beforeAll(async () => {
    pool = createPool(URL_!);
    await migrate(pool);
    repo = new PgRoomRepo(pool);
    // Bersihkan sisa run sebelumnya supaya hasil deterministik — termasuk tabel auth yang
    // dibuat describe di bawah (tes "tabel belum ada" butuh sessions/users benar-benar hilang).
    await pool.query('TRUNCATE room_ops, rooms CASCADE');
    await pool.query('DROP TABLE IF EXISTS sessions, users CASCADE');
  });
  afterAll(async () => {
    await pool.query('TRUNCATE room_ops, rooms CASCADE').catch(() => {});
    await repo.close();
  });

  it('migrate idempoten: run kedua tidak menerapkan ulang', async () => {
    expect(await migrate(pool)).toEqual([]);
  });

  it('create → load lewat token edit (access edit) dan view (access view); meta pemilik', async () => {
    await repo.create(room('tok_pg_r1'));
    const edit = await repo.load('tok_pg_r1');
    expect(edit).toMatchObject({ token: 'tok_pg_r1', viewToken: 'tok_pg_r1-view', access: 'edit', rev: 0 });
    const view = await repo.load('tok_pg_r1-view');
    expect(view).toMatchObject({ token: 'tok_pg_r1', access: 'view' });
    expect((await repo.meta('tok_pg_r1'))!.title).toBe('Room tok_pg_r1');
    expect(await repo.load('ngasal')).toBeUndefined();
    expect(await repo.meta('ngasal')).toBeUndefined();
  });

  it('appendOp: rev naik atomik + satu baris room_ops; baseRev basi → stale tanpa tulis', async () => {
    const doc = createDocument() as LakarDocument;
    await repo.create(room('tok_pg_r2', { doc }));
    const doc1 = { ...doc, rev: 1 };
    const meta1 = { peerName: 'Alice', seed: 'lakar-sync:tok_pg_r2:1', at: new Date('2030-01-01T00:00:00Z') };
    const ok = await repo.appendOp('tok_pg_r2', 0, doc1, [{ op: 'update', id: 'board001', patch: { name: 'x' } }], meta1);
    expect(ok).toEqual({ status: 'ok', rev: 1 });
    // baseRev 0 kedua kali → stale dengan rev terkini; doc tidak berubah.
    const stale = await repo.appendOp('tok_pg_r2', 0, { ...doc, rev: 1 }, [], { peerName: 'Bob', seed: 's', at: new Date() });
    expect(stale).toEqual({ status: 'stale', rev: 1 });
    const loaded = await repo.load('tok_pg_r2');
    expect(loaded!.rev).toBe(1);
    const log = await repo.opsLog('tok_pg_r2');
    expect(log!.length).toBe(1);
    // seed + at tersimpan persis — syarat replay deterministik (kontrak protocol.ts).
    expect(log![0]).toMatchObject({ rev: 1, peerName: 'Alice', seed: 'lakar-sync:tok_pg_r2:1', at: '2030-01-01T00:00:00.000Z', ops: [{ op: 'update', id: 'board001' }] });
    const doc2 = { ...doc1, rev: 2 };
    expect(await repo.appendOp('tok_pg_r2', 1, doc2, [{ op: 'remove', id: 'board001' }], { peerName: 'Bob', seed: 's2', at: new Date() })).toEqual({ status: 'ok', rev: 2 });
    expect((await repo.opsLog('tok_pg_r2', 2))!.map((o) => o.rev)).toEqual([2]);
  });

  it('archive: load/meta/appendOp → missing; archive ulang → false; opsLog → undefined', async () => {
    await repo.create(room('tok_pg_r3'));
    expect(await repo.archive('tok_pg_r3')).toBe(true);
    expect(await repo.load('tok_pg_r3')).toBeUndefined();
    expect(await repo.load('tok_pg_r3-view')).toBeUndefined();
    expect(await repo.meta('tok_pg_r3')).toBeUndefined();
    expect(await repo.appendOp('tok_pg_r3', 0, createDocument(), [], { peerName: 'x', seed: 's', at: new Date() })).toEqual({ status: 'missing' });
    expect(await repo.opsLog('tok_pg_r3')).toBeUndefined();
    expect(await repo.archive('tok_pg_r3')).toBe(false);
  });

  it('ping → true', async () => {
    expect(await repo.ping()).toBe(true);
  });

  it('sessionUser tanpa tabel auth (migrasi api belum jalan) → AuthTablesMissing', async () => {
    // Tabel sessions/users di-drop di beforeAll describe ini dan baru dibuat describe berikut.
    await expect(repo.sessionUser('token-ngasal')).rejects.toBeInstanceOf(AuthTablesMissing);
  });
});

// Tabel `users`/`sessions` di sini dibuat manual (bentuk 0003 api) — sync hanya membaca,
// tidak pernah menulis/memigrasi tabel milik service lain.
describe.skipIf(!URL_)('PgRoomRepo + tabel auth (Postgres nyata)', () => {
  let pool: Pool;
  let repo: PgRoomRepo;
  beforeAll(async () => {
    pool = createPool(URL_!);
    await migrate(pool);
    repo = new PgRoomRepo(pool);
    await pool.query(AUTH_TABLES_SQL);
    await pool.query('TRUNCATE sessions, users, room_ops, rooms CASCADE');
  });
  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS sessions, users CASCADE').catch(() => {});
    await pool.query('TRUNCATE room_ops, rooms CASCADE').catch(() => {});
    await repo.close();
  });

  const seedUser = async (email: string, name = 'User'): Promise<string> => {
    const { rows } = await pool.query<{ id: string }>('INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id', [email, name]);
    return rows[0]!.id;
  };
  const seedSession = (userId: string, token: string, expiresAt = new Date(Date.now() + 60_000)) =>
    pool.query('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)', [token, userId, expiresAt]);

  it('sessionUser: session hidup → user; kedaluwarsa dan tak dikenal → undefined (read-only)', async () => {
    const uid = await seedUser('Alice@Example.com', 'Alice');
    await seedSession(uid, 'sess-pg-ok');
    await seedSession(uid, 'sess-pg-exp', new Date(Date.now() - 1000));
    expect(await repo.sessionUser('sess-pg-ok')).toEqual({ id: uid, email: 'Alice@Example.com', name: 'Alice' });
    expect(await repo.sessionUser('sess-pg-exp')).toBeUndefined();
    expect(await repo.sessionUser('sess-ngasal')).toBeUndefined();
    // Sync hanya membaca: sessionUser tidak boleh menulis baris sessions (tidak rolling di sini —
    // perpanjangan TTL adalah tanggung jawab service api).
    const { rows } = await pool.query<{ expires_at: Date }>('SELECT expires_at FROM sessions WHERE token = $1', ['sess-pg-ok']);
    expect(rows[0]!.expires_at.getTime()).toBeLessThan(Date.now() + 60_000);
  });

  it('owner_id: create menyimpan pemilik; ownerOf → id/null/undefined; list menyaring per owner', async () => {
    const alice = await seedUser('alice2@example.com');
    const bob = await seedUser('bob2@example.com');
    await repo.create(room('tok_pg_a1', { ownerId: alice }));
    await repo.create(room('tok_pg_a2', { ownerId: bob }));
    await repo.create(room('tok_pg_a3')); // workspace (owner NULL)
    expect(await repo.ownerOf('tok_pg_a1')).toBe(alice);
    expect(await repo.ownerOf('tok_pg_a3')).toBeNull();
    expect(await repo.ownerOf('tok_pg_zzz')).toBeUndefined();
    expect((await repo.list(alice)).map((m) => m.token)).toEqual(['tok_pg_a1']);
    expect((await repo.list()).map((m) => m.token).sort()).toEqual(['tok_pg_a1', 'tok_pg_a2', 'tok_pg_a3'].sort());
    const meta = await repo.meta('tok_pg_a1');
    expect(meta!.ownerId).toBe(alice);
    // Room archived tidak ikut list/ownerOf (diperlakukan seperti tidak ada).
    await repo.archive('tok_pg_a1');
    expect(await repo.ownerOf('tok_pg_a1')).toBeUndefined();
    expect(await repo.list(alice)).toEqual([]);
  });
});

describe.skipIf(URL_)('PgRoomRepo', () => {
  it('dilewati: DATABASE_URL tidak diset', () => {});
});
