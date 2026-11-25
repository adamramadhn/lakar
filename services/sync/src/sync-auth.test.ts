// Tes auth story B spec-cloud-auth di @lakar/sync (MemoryRoomRepo): endpoint pemilik /api/rooms
// menerima admin key ATAU Bearer session; rooms.owner_id menyaring list/meta/delete per user.
// Session ditanam lewat helper `seedSession`; tabel auth yang belum ada disimulasikan lewat
// `authReady = false` → 501 NOT_SUPPORTED. Join WS tamu (capability token) tidak berubah.
import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { createDocument } from '@lakar/core';
import { buildSync } from './app.js';
import { MemoryRoomRepo, type SessionUser } from './repo.js';

const KEY = 'test-key';
const ADMIN = { authorization: `Bearer ${KEY}` };

const ALICE: SessionUser = { id: 'a1b2c3d4-0000-4000-8000-0000000000aa', email: 'alice@example.com', name: 'Alice' };
const BOB: SessionUser = { id: 'b1b2c3d4-0000-4000-8000-0000000000bb', email: 'bob@example.com', name: 'Bob' };
const AUTH_ALICE = { authorization: 'Bearer sess-alice' };
const AUTH_BOB = { authorization: 'Bearer sess-bob' };

function setup() {
  const repo = new MemoryRoomRepo();
  repo.seedSession('sess-alice', ALICE);
  repo.seedSession('sess-bob', BOB);
  // Session kedaluwarsa tetap tercatat — lookup harus menjawab undefined (→ 401).
  repo.seedSession('sess-expired', ALICE, Date.now() - 1000);
  const app = buildSync({ repo, apiKey: KEY });
  const post = (url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url, ...(payload !== undefined ? { payload: payload as object } : {}), headers });
  const createRoom = async (headers: Record<string, string>, title = 'Room Uji') => {
    const r = await post('/api/rooms', { title, doc: createDocument() }, headers);
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data as { token: string; viewToken: string; rev: number };
  };
  return { repo, app, post, createRoom };
}

const apps: { close: () => Promise<unknown> }[] = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
});

describe('POST /api/rooms (identity)', () => {
  it('session → room berpemilik user; admin key → owner NULL (era workspace)', async () => {
    const t = setup();
    apps.push(t.app);
    const mine = await t.createRoom(AUTH_ALICE);
    expect(await t.repo.ownerOf(mine.token)).toBe(ALICE.id);
    expect((await t.repo.meta(mine.token))!.ownerId).toBe(ALICE.id);
    const admin = await t.createRoom(ADMIN);
    expect(await t.repo.ownerOf(admin.token)).toBeNull();
    expect((await t.repo.meta(admin.token))!.ownerId).toBeNull();
  });

  it('tanpa kredensial / session tidak dikenal / session kedaluwarsa → 401 UNAUTHORIZED', async () => {
    const t = setup();
    apps.push(t.app);
    const badHeaders: Record<string, string>[] = [{}, { authorization: 'Bearer ngasal' }, { authorization: 'Bearer sess-expired' }];
    for (const headers of badHeaders) {
      const r = await t.post('/api/rooms', { title: 'x', doc: createDocument() }, headers);
      expect(r.statusCode).toBe(401);
      expect(r.json().error.code).toBe('UNAUTHORIZED');
    }
  });

  it('admin key tetap berfungsi identik (compat AD-4); Bearer bukan "Bearer <key>" pun dicoba sebagai session', async () => {
    const t = setup();
    apps.push(t.app);
    // Header dengan panjang sama seperti `Bearer <key>` tapi isi beda → bukan admin, bukan session → 401.
    const sameLen = { authorization: `Bearer ${'x'.repeat(KEY.length)}` };
    expect((await t.post('/api/rooms', { title: 'x', doc: createDocument() }, sameLen)).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'GET', url: '/api/rooms', headers: ADMIN })).statusCode).toBe(200);
  });
});

describe('GET /api/rooms (list scoping)', () => {
  it('session → hanya room miliknya; admin → semua termasuk workspace; user lain tidak melihat room user', async () => {
    const t = setup();
    apps.push(t.app);
    const a = await t.createRoom(AUTH_ALICE, 'Milik Alice');
    const b = await t.createRoom(AUTH_BOB, 'Milik Bob');
    const w = await t.createRoom(ADMIN, 'Workspace');
    const roomsOf = async (headers: Record<string, string>) =>
      ((await t.app.inject({ method: 'GET', url: '/api/rooms', headers })).json().data.rooms as { token: string }[]).map((r) => r.token);
    expect(await roomsOf(AUTH_ALICE)).toEqual([a.token]);
    expect(await roomsOf(AUTH_BOB)).toEqual([b.token]);
    expect((await roomsOf(ADMIN)).sort()).toEqual([a.token, b.token, w.token].sort());
  });

  it('tanpa kredensial → 401', async () => {
    const t = setup();
    apps.push(t.app);
    expect((await t.app.inject({ method: 'GET', url: '/api/rooms' })).statusCode).toBe(401);
  });
});

describe('GET + DELETE /api/rooms/:token (owner scoping)', () => {
  it('meta: owner 200; admin 200; user lain 403; tak dikenal → 404 dulu (bukan 403)', async () => {
    const t = setup();
    apps.push(t.app);
    const room = await t.createRoom(AUTH_ALICE);
    const get = (headers: Record<string, string>, token = room.token) => t.app.inject({ method: 'GET', url: `/api/rooms/${token}`, headers });
    expect((await get(AUTH_ALICE)).statusCode).toBe(200);
    expect((await get(ADMIN)).statusCode).toBe(200);
    const bob = await get(AUTH_BOB);
    expect(bob.statusCode).toBe(403);
    expect(bob.json().error.code).toBe('FORBIDDEN');
    // 404 sebelum 403: room tak dikenal menjawab 404 untuk user (jangan bocorkan eksistensi).
    expect((await get(AUTH_BOB, 'room-ngasal')).statusCode).toBe(404);
    expect((await get(ADMIN, 'room-ngasal')).statusCode).toBe(404);
    expect((await get({})).statusCode).toBe(401);
  });

  it('delete: owner → archived; user lain → 403; room workspace hanya admin; arsip ulang → 404', async () => {
    const t = setup();
    apps.push(t.app);
    const mine = await t.createRoom(AUTH_ALICE);
    const del = (headers: Record<string, string>, token = mine.token) => t.app.inject({ method: 'DELETE', url: `/api/rooms/${token}`, headers });
    // Bob bukan pemilik → 403, room tetap hidup.
    expect((await del(AUTH_BOB)).statusCode).toBe(403);
    expect((await t.repo.meta(mine.token))!.token).toBe(mine.token);
    // Owner mengarsip; akses berikutnya → 404 (archived diperlakukan seperti tidak ada).
    expect((await del(AUTH_ALICE)).statusCode).toBe(200);
    expect((await del(AUTH_ALICE)).statusCode).toBe(404);
    expect(await t.repo.load(mine.token)).toBeUndefined();
    // Room workspace (owner NULL): user manapun → 403; admin → 200.
    const ws = await t.createRoom(ADMIN);
    expect((await del(AUTH_ALICE, ws.token)).statusCode).toBe(403);
    expect((await del(ADMIN, ws.token)).statusCode).toBe(200);
    // Tak dikenal → 404 dulu untuk user dan admin.
    expect((await del(AUTH_BOB, 'room-ngasal')).statusCode).toBe(404);
    expect((await del(ADMIN, 'room-ngasal')).statusCode).toBe(404);
  });
});

describe('tabel auth belum ada', () => {
  it('Bearer apa pun → 501 NOT_SUPPORTED; admin key tetap jalan', async () => {
    const t = setup();
    apps.push(t.app);
    t.repo.authReady = false;
    const r = await t.post('/api/rooms', { title: 'x', doc: createDocument() }, AUTH_ALICE);
    expect(r.statusCode).toBe(501);
    expect(r.json().error.code).toBe('NOT_SUPPORTED');
    // Admin key tidak menyentuh lookup session → tetap 200 (compat).
    expect((await t.post('/api/rooms', { title: 'x', doc: createDocument() }, ADMIN)).statusCode).toBe(200);
  });
});

describe('WS join tidak berubah', () => {
  it('tamu join lewat capability token tanpa auth header → welcome (edit dan view)', async () => {
    const t = setup();
    await t.app.listen({ host: '127.0.0.1', port: 0 });
    apps.push(t.app);
    const port = (t.app.server.address() as AddressInfo).port;
    const room = await t.createRoom(AUTH_ALICE);
    const join = async (accessToken: string) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/room/${accessToken}`);
      const welcome = await new Promise<{ type?: string }>((res, rej) => {
        ws.once('message', (raw) => res(JSON.parse(String(raw)) as { type?: string }));
        ws.once('error', rej);
      });
      ws.close();
      return welcome;
    };
    expect((await join(room.token)).type).toBe('welcome');
    expect((await join(room.viewToken)).type).toBe('welcome');
  });
});
