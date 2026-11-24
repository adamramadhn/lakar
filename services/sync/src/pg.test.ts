// Integrasi Postgres nyata untuk PgRoomRepo + runner migrasi (sequencer FOR UPDATE ikut dites
// lewat dua appendOp berurutan). Dilewati bila DATABASE_URL tidak diset; jalankan dengan
// postgres:16, mis.
//   docker run -d -p 55434:5432 -e POSTGRES_PASSWORD=test postgres:16
//   DATABASE_URL=postgres://postgres:test@127.0.0.1:55434/postgres pnpm vitest run services/sync/src/pg.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDocument } from '@lakar/core';
import type { LakarDocument } from '@lakar/schema';
import { createPool, migrate } from './db.js';
import { PgRoomRepo, type NewRoom } from './repo.js';
import type { Pool } from 'pg';

const URL_ = process.env.DATABASE_URL;

const room = (token: string, over: Partial<NewRoom> = {}): NewRoom => ({
  token,
  viewToken: `${token}-view`,
  title: `Room ${token}`,
  doc: createDocument(),
  ...over,
});

describe.skipIf(!URL_)('PgRoomRepo (Postgres nyata)', () => {
  let pool: Pool;
  let repo: PgRoomRepo;
  beforeAll(async () => {
    pool = createPool(URL_!);
    await migrate(pool);
    repo = new PgRoomRepo(pool);
    // Bersihkan sisa run sebelumnya supaya hasil deterministik.
    await pool.query('TRUNCATE room_ops, rooms CASCADE');
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
});

describe.skipIf(URL_)('PgRoomRepo', () => {
  it('dilewati: DATABASE_URL tidak diset', () => {});
});
