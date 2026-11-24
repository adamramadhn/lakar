// Tes @lakar/sync dengan MemoryRoomRepo (seluruh matriks kasus plan): REST lewat app.inject, WS
// lewat klien `ws` nyata ke listen ephemeral (bukan mock socket — jalur @fastify/websocket ikut
// terverifikasi). Integrasi Postgres ada di pg.test.ts.
import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { applyOps, createDocument, transact } from '@lakar/core';
import { seededRandom, type LakarDocument } from '@lakar/schema';
import { buildSync } from './app.js';
import { RoomManager, type PeerSocket } from './rooms.js';
import { MemoryRoomRepo } from './repo.js';
import type { ServerMessage } from './protocol.js';

const KEY = 'test-key';
const AUTH = { authorization: `Bearer ${KEY}` };

/** Dokumen valid rev 0 dengan satu board (untuk skenario lock/update). */
function docWithBoard(boardId = 'board001'): LakarDocument {
  const doc = createDocument();
  doc.pages[0]!.children.push({ type: 'board', id: boardId, name: 'B1', x: 0, y: 0, width: 390, height: 844, screen: 'app', children: [] } as never);
  return doc;
}

type Msg = Record<string, unknown> & { type?: string };

/** Klien ws tes: kumpulkan semua pesan, tunggu berdasar predikat (pesan lama ikut dipindai). */
class Peer {
  private readonly ws: WebSocket;
  private readonly msgs: Msg[] = [];
  private readonly waiters: { pred: (m: Msg) => boolean; res: (m: Msg) => void; timer: NodeJS.Timeout }[] = [];
  readonly closed: Promise<{ code: number; reason: string }>;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    this.closed = new Promise((res) => ws.once('close', (code, reason) => res({ code, reason: String(reason) })));
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw)) as Msg;
      const i = this.waiters.findIndex((w) => w.pred(m));
      if (i >= 0) {
        const [w] = this.waiters.splice(i, 1);
        clearTimeout(w!.timer);
        w!.res(m);
      } else {
        this.msgs.push(m);
      }
    });
  }

  static open(url: string): Promise<Peer> {
    const ws = new WebSocket(url);
    const peer = new Peer(ws);
    return new Promise((resolve, reject) => {
      ws.once('open', () => resolve(peer));
      ws.once('error', reject);
    });
  }

  /** Pesan pertama yang cocok predikat (backlog dulu, lalu tunggu sampai `ms`). */
  next(pred: (m: Msg) => boolean, ms = 5000): Promise<Msg> {
    const i = this.msgs.findIndex(pred);
    if (i >= 0) return Promise.resolve(this.msgs.splice(i, 1)[0]!);
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('timeout menunggu pesan ws')), ms);
      this.waiters.push({ pred, res, timer });
    });
  }

  ofType(type: string, ms = 5000): Promise<Msg> {
    return this.next((m) => m.type === type, ms);
  }

  send(msg: unknown): void {
    this.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  close(): Promise<{ code: number; reason: string }> {
    this.ws.close();
    return this.closed;
  }
}

function setup(opts: { apiKey?: string; roomOpts?: ConstructorParameters<typeof RoomManager>[1] } = {}) {
  const repo = new MemoryRoomRepo();
  const rooms = new RoomManager(repo, opts.roomOpts);
  const app = buildSync({ repo, apiKey: opts.apiKey ?? KEY, rooms });
  return { repo, rooms, app };
}

/** App listen ephemeral + helper create room + connect ws. */
async function live(opts: { apiKey?: string; roomOpts?: ConstructorParameters<typeof RoomManager>[1] } = {}) {
  const t = setup(opts);
  await t.app.listen({ host: '127.0.0.1', port: 0 });
  const port = (t.app.server.address() as AddressInfo).port;
  const post = (url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    t.app.inject({ method: 'POST', url, ...(payload !== undefined ? { payload: payload as object } : {}), headers });
  const createRoom = async (doc: LakarDocument = docWithBoard(), extra: Record<string, unknown> = {}) => {
    const r = await post('/api/rooms', { title: 'Room Uji', doc, ...extra }, AUTH);
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data as { token: string; viewToken: string; rev: number };
  };
  const join = async (accessToken: string, qs = '') => {
    const peer = await Peer.open(`ws://127.0.0.1:${port}/room/${accessToken}${qs}`);
    const welcome = await peer.ofType('welcome');
    return { peer, welcome };
  };
  return { ...t, port, post, createRoom, join };
}

const apps: { close: () => Promise<unknown> }[] = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
});

const track = <T extends { app: { close: () => Promise<unknown> } }>(t: T): T => {
  apps.push(t.app);
  return t;
};

/** Socket tiruan untuk memanggil RoomManager langsung (tanpa server ws). */
const fakeSocket = () => {
  const sent: ServerMessage[] = [];
  const closes: { code: number; reason: string }[] = [];
  const socket: PeerSocket = {
    send: (m) => void sent.push(m),
    close: (code, reason) => void closes.push({ code, reason }),
  };
  return { sent, closes, socket };
};

describe('REST /api/rooms', () => {
  it('create valid → {token, viewToken, rev}; token base64url ≥21 dan beda', async () => {
    const t = track(await live());
    const r = await t.createRoom();
    expect(r.rev).toBe(0);
    expect(r.token).toMatch(/^[A-Za-z0-9_-]{21,}$/);
    expect(r.viewToken).toMatch(/^[A-Za-z0-9_-]{21,}$/);
    expect(r.viewToken).not.toBe(r.token);
    const meta = (await t.app.inject({ method: 'GET', url: `/api/rooms/${r.token}`, headers: AUTH })).json().data;
    expect(meta).toMatchObject({ token: r.token, viewToken: r.viewToken, title: 'Room Uji', rev: 0 });
  });

  it('tanpa key / key salah → 401 UNAUTHORIZED', async () => {
    const t = track(await live());
    const noKey = await t.post('/api/rooms', { title: 'x', doc: createDocument() });
    expect(noKey.statusCode).toBe(401);
    expect(noKey.json().error.code).toBe('UNAUTHORIZED');
    expect((await t.post('/api/rooms', { title: 'x', doc: createDocument() }, { authorization: 'Bearer salah' })).statusCode).toBe(401);
  });

  it('doc invalid → 400 SCHEMA_INVALID; schemaVersion lama → 400 (server tidak memigrasi)', async () => {
    const t = track(await live());
    const bad = await t.post('/api/rooms', { title: 'x', doc: { bukan: 'dokumen' } }, AUTH);
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('SCHEMA_INVALID');
    const old = { ...(createDocument() as unknown as Record<string, unknown>), schemaVersion: 1 };
    const migrated = await t.post('/api/rooms', { title: 'x', doc: old }, AUTH);
    expect(migrated.statusCode).toBe(400);
    expect(migrated.json().error.message).toContain('schemaVersion');
  });

  it('GET room tak dikenal → 404; route tak dikenal → 404 envelope', async () => {
    const t = track(await live());
    expect((await t.app.inject({ method: 'GET', url: '/api/rooms/zzz', headers: AUTH })).statusCode).toBe(404);
    const r = await t.app.inject({ method: 'GET', url: '/zzz' });
    expect(r.statusCode).toBe(404);
    expect(r.json().error.code).toBe('NOT_FOUND');
  });

  it('healthz → ok; DB turun → 503', async () => {
    const t = track(await live());
    expect((await t.app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    t.repo.up = false;
    expect((await t.app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(503);
    t.repo.up = true;
  });
});

describe('WS join + welcome', () => {
  it('join edit → welcome {rev, doc, peers}; peer kedua → peer_join ke yang pertama', async () => {
    const t = track(await live());
    const doc = docWithBoard();
    const room = await t.createRoom(doc);
    const a = await t.join(room.token, '?name=Alice');
    expect(a.welcome.rev).toBe(0);
    expect(a.welcome.doc).toMatchObject({ id: doc.id });
    expect((a.welcome.peers as { name: string }[]).map((p) => p.name)).toEqual(['Alice']);
    const b = await t.join(room.token, '?name=Bob&kind=agent');
    const joined = await a.peer.ofType('peer_join');
    expect(joined.peer).toMatchObject({ name: 'Bob', kind: 'agent', access: 'edit' });
    expect((b.welcome.peers as unknown[]).length).toBe(2);
    await a.peer.close();
    await b.peer.close();
  });

  it('token salah/archived → close 4001', async () => {
    const t = track(await live());
    const peer = await Peer.open(`ws://127.0.0.1:${t.port}/room/token-ngasal`);
    const { code } = await peer.closed;
    expect(code).toBe(4001);
  });
});

describe('commit ops', () => {
  it('ops valid → rev naik atomik: sender ack {rev, refs}, peer lain ops berurutan', async () => {
    const t = track(await live());
    const room = await t.createRoom();
    const a = await t.join(room.token, '?name=Alice');
    const b = await t.join(room.token, '?name=Bob');
    a.peer.send({ type: 'ops', baseRev: 0, ops: [{ op: 'add', parentId: 'board001', node: { type: 'frame', name: 'Hero', layout: 'row', x: 0, y: 0, position: 'absolute' }, ref: 'hero' }] });
    const ack = await a.peer.ofType('ack');
    expect(ack.rev).toBe(1);
    const heroId = (ack.refs as Record<string, string>).hero;
    expect(heroId).toMatch(/^[A-Za-z0-9]{8}$/);
    const got = await b.peer.ofType('ops');
    expect(got).toMatchObject({ rev: 1, from: { name: 'Alice', kind: 'human' } });
    expect((got.ops as { ref?: string }[])[0]).toMatchObject({ op: 'add', ref: 'hero' });
    // Rev kedua berurutan tanpa gap.
    b.peer.send({ type: 'ops', baseRev: 1, ops: [{ op: 'update', id: heroId, patch: { name: 'Hero 2' } }] });
    expect((await b.peer.ofType('ack')).rev).toBe(2);
    expect((await a.peer.ofType('ops')).rev).toBe(2);
    const meta = await t.repo.meta(room.token);
    expect(meta!.rev).toBe(2);
    const log = await t.repo.opsLog(room.token);
    expect(log!.map((o) => o.rev)).toEqual([1, 2]);
    await a.peer.close();
    await b.peer.close();
  });

  it('baseRev basi → rejected {rev}; doc tidak berubah', async () => {
    const t = track(await live());
    const room = await t.createRoom();
    const a = await t.join(room.token, '?name=Alice');
    const b = await t.join(room.token, '?name=Bob');
    a.peer.send({ type: 'ops', baseRev: 0, ops: [{ op: 'update', id: 'board001', patch: { name: 'B2' } }] });
    await a.peer.ofType('ack');
    b.peer.send({ type: 'ops', baseRev: 0, ops: [{ op: 'update', id: 'board001', patch: { name: 'B3' } }] });
    const rej = await b.peer.ofType('rejected');
    expect(rej.rev).toBe(1);
    const meta = await t.repo.load(room.token);
    expect(meta!.doc.pages[0]!.children[0]).toMatchObject({ name: 'B2' });
    await a.peer.close();
    await b.peer.close();
  });

  it('ops invalid → opError {code}; doc dan rev tidak berubah', async () => {
    const t = track(await live());
    const room = await t.createRoom();
    const a = await t.join(room.token);
    a.peer.send({ type: 'ops', baseRev: 0, ops: [{ op: 'update', id: 'tidakada', patch: { name: 'x' } }] });
    const err = await a.peer.ofType('opError');
    expect((err.error as { code: string }).code).toBe('NOT_FOUND');
    a.peer.send({ type: 'ops', baseRev: 0, ops: [{ op: 'sihir' }] });
    expect(((await a.peer.ofType('opError')).error as { code: string }).code).toBe('SCHEMA_INVALID');
    expect((await t.repo.meta(room.token))!.rev).toBe(0);
    await a.peer.close();
  });

  it('dua commit bersamaan baseRev sama: satu ack, satu rejected (server ordering)', async () => {
    const t = track(await live());
    const room = await t.createRoom();
    const a = await t.join(room.token, '?name=Alice');
    const b = await t.join(room.token, '?name=Bob');
    a.peer.send({ type: 'ops', baseRev: 0, ops: [{ op: 'update', id: 'board001', patch: { name: 'A' } }] });
    b.peer.send({ type: 'ops', baseRev: 0, ops: [{ op: 'update', id: 'board001', patch: { name: 'B' } }] });
    const [ra, rb] = await Promise.all([
      a.peer.next((m) => m.type === 'ack' || m.type === 'rejected'),
      b.peer.next((m) => m.type === 'ack' || m.type === 'rejected'),
    ]);
    const types = [ra.type, rb.type].sort();
    expect(types).toEqual(['ack', 'rejected']);
    expect((await t.repo.meta(room.token))!.rev).toBe(1);
    await a.peer.close();
    await b.peer.close();
  });

  it('konvergensi: replay ops broadcast dengan seed/at menghasilkan doc identik byte-per-byte', async () => {
    const t = track(await live());
    const room = await t.createRoom();
    const before = structuredClone((await t.repo.load(room.token))!.doc);
    const a = await t.join(room.token, '?name=Alice');
    const b = await t.join(room.token, '?name=Bob');
    // Op mint-ID (add + duplicate lewat @ref) — kasus yang dulunya divergen antar peer.
    a.peer.send({
      type: 'ops',
      baseRev: 0,
      ops: [
        { op: 'add', parentId: 'board001', node: { type: 'frame', name: 'Hero', layout: 'row', x: 0, y: 0, position: 'absolute' }, ref: 'hero' },
        { op: 'duplicate', id: '@hero', ref: 'copy' },
      ],
    });
    const got = await b.peer.ofType('ops');
    await a.peer.ofType('ack');
    expect(got.seed).toBe(`lakar-sync:${room.token}:1`);
    expect(typeof got.at).toBe('string');
    // Kontrak protocol.ts: penerima WAJIB transact dengan seededRandom(seed) + now = at.
    const replayed = await transact(before, { sessionId: 'replay', description: 'replay', random: seededRandom(got.seed as string), now: () => new Date(got.at as string) }, (tx) =>
      applyOps(tx, got.ops),
    );
    const serverDoc = (await t.repo.load(room.token))!.doc;
    expect(replayed.doc).toEqual(serverDoc);
    // room_ops menyimpan seed + at yang sama → log replayable.
    const log = await t.repo.opsLog(room.token);
    expect(log![0]).toMatchObject({ rev: 1, seed: got.seed, at: got.at });
    await a.peer.close();
    await b.peer.close();
  });

  it('baseRev mismatch: cache in-process disegarkan sekali dari repo sebelum rejected', async () => {
    const t = track(await live());
    const room = await t.createRoom();
    const a = await t.join(room.token, '?name=Alice');
    // Simulasi commit instance lain: rev 0→1 langsung lewat repo (bypass RoomManager),
    // sehingga cache in-process masih mengira rev 0.
    const doc0 = structuredClone((await t.repo.load(room.token))!.doc);
    doc0.pages[0]!.children[0]!.name = 'Luar';
    const foreign = await t.repo.appendOp(room.token, 0, { ...doc0, rev: 1 }, [{ op: 'update', id: 'board001', patch: { name: 'Luar' } }], {
      peerName: 'ext',
      seed: 'lakar-sync:foreign:1',
      at: new Date(),
    });
    expect(foreign.status).toBe('ok');
    // Klien yang sudah melihat rev 1 mengirim baseRev=1 → setelah reload commit tetap lolos.
    a.peer.send({ type: 'ops', baseRev: 1, ops: [{ op: 'update', id: 'board001', patch: { name: 'Dalam' } }] });
    expect((await a.peer.ofType('ack')).rev).toBe(2);
    expect((await t.repo.load(room.token))!.doc.pages[0]!.children[0]).toMatchObject({ name: 'Dalam' });
    await a.peer.close();
  });
});

describe('view token', () => {
  it('join view-only: ops → FORBIDDEN; presence tetap diterima peer lain', async () => {
    const t = track(await live());
    const room = await t.createRoom();
    const editor = await t.join(room.token, '?name=Ed');
    const viewer = await t.join(room.viewToken, '?name=Vu');
    expect((viewer.welcome.peers as { name: string; access: string }[]).find((p) => p.name === 'Vu')!.access).toBe('view');
    viewer.peer.send({ type: 'ops', baseRev: 0, ops: [{ op: 'update', id: 'board001', patch: { name: 'x' } }] });
    const err = await viewer.peer.ofType('opError');
    expect((err.error as { code: string }).code).toBe('FORBIDDEN');
    viewer.peer.send({ type: 'presence', cursor: { x: 10, y: 20 } });
    const presence = await editor.peer.ofType('peer');
    expect(presence.presence).toMatchObject({ cursor: { x: 10, y: 20 } });
    await editor.peer.close();
    await viewer.peer.close();
  });

  it('view-token lock/unlock → FORBIDDEN (tidak boleh menahan editor)', async () => {
    const t = track(await live());
    const room = await t.createRoom();
    const viewer = await t.join(room.viewToken, '?name=Vu');
    viewer.peer.send({ type: 'lock', nodeIds: ['board001'] });
    expect(((await viewer.peer.ofType('opError')).error as { code: string }).code).toBe('FORBIDDEN');
    viewer.peer.send({ type: 'unlock', nodeIds: ['board001'] });
    expect(((await viewer.peer.ofType('opError')).error as { code: string }).code).toBe('FORBIDDEN');
    await viewer.peer.close();
  });
});

describe('presence + lock', () => {
  it('presence throttle ≥50ms/peer: dua kirim cepat → satu broadcast trailing-edge', async () => {
    const t = track(await live());
    const room = await t.createRoom();
    const a = await t.join(room.token, '?name=Alice');
    const b = await t.join(room.token, '?name=Bob');
    a.peer.send({ type: 'presence', cursor: { x: 1, y: 1 } });
    a.peer.send({ type: 'presence', cursor: { x: 2, y: 2 } });
    const first = await b.peer.ofType('peer');
    const second = await b.peer.ofType('peer');
    // Kedua pesan akhirnya diterima; yang kedua adalah trailing-edge (nilai terakhir).
    expect(second.presence).toMatchObject({ cursor: { x: 2, y: 2 } });
    void first;
    await a.peer.close();
    await b.peer.close();
  });

  it('lock: peer lain ops node ter-lock → locked {nodeIds, by}; unlock → commit bisa', async () => {
    const t = track(await live());
    const room = await t.createRoom();
    const a = await t.join(room.token, '?name=Alice');
    const b = await t.join(room.token, '?name=Bob');
    a.peer.send({ type: 'lock', nodeIds: ['board001'] });
    const locked = await b.peer.ofType('locked');
    expect(locked).toMatchObject({ peerId: a.welcome.peerId, nodeIds: ['board001'] });
    b.peer.send({ type: 'ops', baseRev: 0, ops: [{ op: 'update', id: 'board001', patch: { name: 'x' } }] });
    const denied = await b.peer.ofType('locked');
    expect(denied).toMatchObject({ nodeIds: ['board001'], by: a.welcome.peerId });
    a.peer.send({ type: 'unlock' });
    await b.peer.ofType('unlocked');
    b.peer.send({ type: 'ops', baseRev: 0, ops: [{ op: 'update', id: 'board001', patch: { name: 'x' } }] });
    expect((await b.peer.ofType('ack')).rev).toBe(1);
    await a.peer.close();
    await b.peer.close();
  });

  it('lock komposit dinormalkan; grant meng-echo ke pengirim; re-lock broadcast unlocked id terlepas', async () => {
    const t = track(await live());
    const room = await t.createRoom();
    const a = await t.join(room.token, '?name=Alice');
    const b = await t.join(room.token, '?name=Bob');
    // Lock alamat komposit disimpan/dibroadcast sebagai ID node tersimpan (segmen pertama).
    a.peer.send({ type: 'lock', nodeIds: ['board001/inner'] });
    expect(await a.peer.ofType('locked')).toMatchObject({ peerId: a.welcome.peerId, nodeIds: ['board001'] });
    expect(await b.peer.ofType('locked')).toMatchObject({ peerId: a.welcome.peerId, nodeIds: ['board001'] });
    b.peer.send({ type: 'ops', baseRev: 0, ops: [{ op: 'update', id: 'board001', patch: { name: 'x' } }] });
    expect((await b.peer.ofType('locked')).by).toBe(a.welcome.peerId);
    // Re-lock mengganti set lock: board001 terlepas → peer lain dapat unlocked.
    a.peer.send({ type: 'lock', nodeIds: ['node999'] });
    expect(await b.peer.ofType('unlocked')).toMatchObject({ peerId: a.welcome.peerId, nodeIds: ['board001'] });
    b.peer.send({ type: 'ops', baseRev: 0, ops: [{ op: 'update', id: 'board001', patch: { name: 'x' } }] });
    expect((await b.peer.ofType('ack')).rev).toBe(1);
    await a.peer.close();
    await b.peer.close();
  });

  it('TTL lock pendek: setelah kadaluarsa ops peer lain lolos', async () => {
    const t = track(await live({ roomOpts: { lockTtlMs: 60 } }));
    const room = await t.createRoom();
    const a = await t.join(room.token, '?name=Alice');
    const b = await t.join(room.token, '?name=Bob');
    a.peer.send({ type: 'lock', nodeIds: ['board001'] });
    await b.peer.ofType('locked');
    await new Promise((r) => setTimeout(r, 120));
    b.peer.send({ type: 'ops', baseRev: 0, ops: [{ op: 'update', id: 'board001', patch: { name: 'x' } }] });
    expect((await b.peer.ofType('ack')).rev).toBe(1);
    await a.peer.close();
    await b.peer.close();
  });

  it('disconnect melepas lock + broadcast peer_leave', async () => {
    const t = track(await live());
    const room = await t.createRoom();
    const a = await t.join(room.token, '?name=Alice');
    const b = await t.join(room.token, '?name=Bob');
    a.peer.send({ type: 'lock', nodeIds: ['board001'] });
    await b.peer.ofType('locked');
    await a.peer.close();
    const left = await b.peer.ofType('peer_leave');
    expect(left.peerId).toBe(a.welcome.peerId);
    b.peer.send({ type: 'ops', baseRev: 0, ops: [{ op: 'update', id: 'board001', patch: { name: 'x' } }] });
    expect((await b.peer.ofType('ack')).rev).toBe(1);
    await b.peer.close();
  });
});

describe('resync + arsip + pesan rusak', () => {
  it('resync → welcome segar (rev terkini)', async () => {
    const t = track(await live());
    const room = await t.createRoom();
    const a = await t.join(room.token, '?name=Alice');
    a.peer.send({ type: 'ops', baseRev: 0, ops: [{ op: 'update', id: 'board001', patch: { name: 'x' } }] });
    await a.peer.ofType('ack');
    a.peer.send({ type: 'resync' });
    const fresh = await a.peer.next((m) => m.type === 'welcome');
    expect(fresh.rev).toBe(1);
    expect((fresh.doc as LakarDocument).pages[0]!.children[0]).toMatchObject({ name: 'x' });
    await a.peer.close();
  });

  it('pesan non-JSON dan bentuk salah → opError SCHEMA_INVALID, koneksi tetap hidup', async () => {
    const t = track(await live());
    const room = await t.createRoom();
    const a = await t.join(room.token);
    a.peer.send('bukan json{{{');
    expect(((await a.peer.ofType('opError')).error as { code: string }).code).toBe('SCHEMA_INVALID');
    a.peer.send({ type: 'sihir' });
    expect(((await a.peer.ofType('opError')).error as { code: string }).code).toBe('SCHEMA_INVALID');
    a.peer.send({ type: 'resync' });
    await a.peer.next((m) => m.type === 'welcome');
    await a.peer.close();
  });

  it('DELETE /api/rooms/:token → semua WS close 4000 dan route/WS → 404/4001', async () => {
    const t = track(await live());
    const room = await t.createRoom();
    const a = await t.join(room.token, '?name=Alice');
    const b = await t.join(room.viewToken, '?name=Vu');
    const del = await t.app.inject({ method: 'DELETE', url: `/api/rooms/${room.token}`, headers: AUTH });
    expect(del.statusCode).toBe(200);
    expect((await a.peer.closed).code).toBe(4000);
    expect((await b.peer.closed).code).toBe(4000);
    expect((await t.app.inject({ method: 'GET', url: `/api/rooms/${room.token}`, headers: AUTH })).statusCode).toBe(404);
    const late = await Peer.open(`ws://127.0.0.1:${t.port}/room/${room.token}`);
    expect((await late.closed).code).toBe(4001);
  });
});

describe('RoomManager langsung', () => {
  const room = async (repo: MemoryRoomRepo) => {
    await repo.create({ token: 'tok', viewToken: 'tok-v', title: 'R', doc: docWithBoard() });
  };

  it('join melintasi archive (TOCTOU) → socket close 4000, tanpa peer/welcome tertinggal', async () => {
    const repo = new MemoryRoomRepo();
    await room(repo);
    const rooms = new RoomManager(repo);
    const base = repo.load.bind(repo);
    // Archive terjadi tepat sesudah load membaca baris room — TOCTOU yang dicegat `archived`.
    repo.load = async (tok) => {
      const r = await base(tok);
      if (r) await rooms.closeRoom(r.token);
      return r;
    };
    const s = fakeSocket();
    expect(await rooms.join('tok', 'A', 'human', s.socket)).toBeUndefined();
    expect(s.closes).toEqual([{ code: 4000, reason: 'room diarsip' }]);
    expect(s.sent).toEqual([]);
    expect(rooms.size).toBe(0);
  });

  it('ops terantre dari peer yang sudah putus tidak di-commit', async () => {
    const repo = new MemoryRoomRepo();
    await room(repo);
    // Tahan appendOp: commit pertama menggantung sehingga ops kedua menumpuk di docLocks.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const baseAppend = repo.appendOp.bind(repo);
    repo.appendOp = async (...args) => {
      await gate;
      return baseAppend(...args);
    };
    const rooms = new RoomManager(repo);
    const a = fakeSocket();
    const b = fakeSocket();
    const aId = (await rooms.join('tok', 'A', 'human', a.socket))!;
    const bId = (await rooms.join('tok', 'B', 'human', b.socket))!;
    const p1 = rooms.message(aId, { type: 'ops', baseRev: 0, ops: [{ op: 'update', id: 'board001', patch: { name: 'A' } }] });
    const p2 = rooms.message(bId, { type: 'ops', baseRev: 0, ops: [{ op: 'update', id: 'board001', patch: { name: 'B' } }] });
    // B putus selagi ops-nya masih mengantre di belakang commit A.
    rooms.leave(bId);
    release();
    await Promise.all([p1, p2]);
    expect((await repo.meta('tok'))!.rev).toBe(1);
    expect(b.sent.filter((m) => m.type !== 'welcome' && m.type !== 'peer_join')).toEqual([]);
    await rooms.close();
  });
});

describe('WS hardening', () => {
  /** App dengan repo.load yang ditahan gerbang — membuka jendela join yang bisa diputus klien. */
  const gatedApp = async (token: string) => {
    const repo = new MemoryRoomRepo();
    await repo.create({ token, viewToken: `${token}-v`, title: 'R', doc: docWithBoard() });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const base = repo.load.bind(repo);
    repo.load = async (tok) => {
      await gate;
      return base(tok);
    };
    const rooms = new RoomManager(repo);
    const app = buildSync({ repo, apiKey: KEY, rooms });
    apps.push(app);
    await app.listen({ host: '127.0.0.1', port: 0 });
    const port = (app.server.address() as AddressInfo).port;
    return { rooms, port, release };
  };

  it('socket putus selama repo.load → tidak ada ghost peer tersisa', async () => {
    const t = await gatedApp('tok-ghost');
    const ws = new WebSocket(`ws://127.0.0.1:${t.port}/room/tok-ghost`);
    await new Promise<void>((res, rej) => {
      ws.once('open', res);
      ws.once('error', rej);
    });
    const done = new Promise((r) => ws.once('close', r));
    ws.close();
    await done;
    t.release();
    // Beri waktu .then join berjalan: peer sempat terdaftar lalu harus dilepas lagi.
    await new Promise((r) => setTimeout(r, 100));
    expect(t.rooms.size).toBe(0);
  });

  it('antrean pra-join melewati 100 frame → close 1013', async () => {
    const t = await gatedApp('tok-flood');
    const ws = new WebSocket(`ws://127.0.0.1:${t.port}/room/tok-flood`);
    await new Promise<void>((res, rej) => {
      ws.once('open', res);
      ws.once('error', rej);
    });
    for (let i = 0; i < 105; i++) ws.send(JSON.stringify({ type: 'presence', cursor: { x: i, y: i } }));
    const code = await new Promise<number>((r) => ws.once('close', (c) => r(c)));
    expect(code).toBe(1013);
    t.release();
  });
});
