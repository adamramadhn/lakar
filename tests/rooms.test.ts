// Tes e2e klien room lakard (spec-collab-cloud story 5): daemon `buildServer` + server `@lakar/sync`
// sungguhan (buildSync + MemoryRoomRepo di port ephemeral). Join → slug `room-<token6>` tampil di
// `/viewer/docs` (remote:true), GET dokumen = replika, `POST /viewer/docs/:slug/ops` → commit sequencer,
// broadcast peer lain sampai ke replika (konvergensi), route file/riwayat menolak slug room, leave →
// room hilang. Route agent (`/viewer/undo`) didelegasikan ke DocTransport room.
import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCHEMA_VERSION, type LakarDocument } from '../packages/schema/src/index.ts';
import { buildServer, loadConfig, type Daemon } from '../packages/daemon/src/index.ts';
import { RoomClient } from '../packages/daemon/src/room-client.ts';
import { buildSync, MemoryRoomRepo, RoomManager } from '../services/sync/src/index.ts';

const KEY = 'test-key';
const AUTH = { authorization: `Bearer ${KEY}` };

/** Salinan `tokenSlug` registry: 6 karakter pertama token → potongan slug `room-<token6>`. */
const tokenSlug = (token: string): string => {
  const s = token
    .slice(0, 6)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/^-+|-+$/g, '');
  return s || 'x';
};

/** Dokumen valid rev 0 dengan satu board `board001` (bentuk tersimpan — sama dengan sync-client.test.ts). */
const docWithBoard = (): LakarDocument =>
  ({
    schemaVersion: SCHEMA_VERSION,
    id: 'Ddocdocd',
    rev: 0,
    tokens: {},
    pages: [
      {
        id: 'Ppagepag',
        name: 'Page 1',
        children: [{ type: 'board', id: 'board001', name: 'B1', x: 0, y: 0, width: 390, height: 844, screen: 'app', children: [] }],
      },
    ],
  }) as LakarDocument;

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };
const fakeRender = { screenshot: async () => new Uint8Array(), measure: async () => ({ width: 0, height: 0, nodes: [], texts: [] }) } as never;

const apps: { close: () => Promise<unknown> }[] = [];
const daemons: Daemon[] = [];
const clients: RoomClient[] = [];
const dirs: string[] = [];
afterEach(async () => {
  while (clients.length) clients.pop()!.close();
  while (daemons.length) {
    const d = daemons.pop()!;
    await d.rooms.close();
    await d.app.close();
  }
  while (apps.length) await apps.pop()!.close();
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
});

/** Server sync hidup + daemon hidup (keduanya port ephemeral), plus helper join lewat route. */
async function live() {
  const repo = new MemoryRoomRepo();
  const syncApp = buildSync({ repo, apiKey: KEY, rooms: new RoomManager(repo) });
  await syncApp.listen({ host: '127.0.0.1', port: 0 });
  apps.push(syncApp);
  const server = `http://127.0.0.1:${(syncApp.server.address() as AddressInfo).port}`;

  const root = await mkdtemp(join(tmpdir(), 'lakar-rooms-'));
  dirs.push(root);
  const daemon = buildServer({ config: { ...baseConfig, port: 0, dataDir: await mkdtemp(join(root, 'data-')) }, render: fakeRender });
  daemons.push(daemon);
  const post = (url: string, payload?: object) => daemon.app.inject({ method: 'POST', url, ...(payload ? { payload } : {}) });
  const get = (url: string) => daemon.app.inject({ method: 'GET', url });
  const put = (url: string, payload?: object) => daemon.app.inject({ method: 'PUT', url, ...(payload ? { payload } : {}) });
  const del = (url: string) => daemon.app.inject({ method: 'DELETE', url });
  const createRoom = async (doc: LakarDocument = docWithBoard()) => {
    const r = await syncApp.inject({ method: 'POST', url: '/api/rooms', payload: { title: 'Room Uji', doc }, headers: AUTH });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data as { token: string; viewToken: string; rev: number };
  };
  const joinRoom = async (token: string) => {
    const r = await post('/viewer/rooms/join', { server, token });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data as { slug: string; server: string; name: string; rev: number; peers: number; connected: boolean };
  };
  /** Klien room kedua langsung (bukan lewat daemon) untuk broadcast dari peer lain. */
  const peerClient = async (token: string) => {
    const c = new RoomClient(server, token, { kind: 'human', client: 'peer-test', name: 'Peer Test' });
    clients.push(c);
    await c.waitReady();
    return c;
  };
  return { server, daemon, post, get, put, del, createRoom, joinRoom, peerClient };
}

describe('room lakard (story 5)', () => {
  it('join → slug room-* di /viewer/docs (remote), GET replika, leave → hilang', async () => {
    const { get, post, del, createRoom, joinRoom } = await live();
    const { token } = await createRoom();
    const joined = await joinRoom(token);
    expect(joined.slug).toMatch(/^room-[a-z0-9-]{6}$/);
    expect(joined.connected).toBe(true);
    expect(joined.peers).toBeGreaterThanOrEqual(1);

    const list = (await get('/viewer/docs')).json().data as { docs: { slug: string; remote?: boolean; server?: string }[] };
    const remote = list.docs.find((d) => d.slug === joined.slug);
    expect(remote?.remote).toBe(true);
    expect(remote?.server).toContain('127.0.0.1');

    const doc = (await get(`/viewer/docs/${joined.slug}`)).json().data as { doc: LakarDocument; rev?: number };
    expect(doc.doc.id).toBe('Ddocdocd');
    expect(doc.doc.pages[0]!.children[0]!.id).toBe('board001');

    // Riwayat/snapshot lokal tidak ada untuk room.
    const hist = await get(`/viewer/docs/${joined.slug}/history`);
    expect(hist.statusCode).toBe(200);
    expect((hist.json().data as { entries: unknown[] }).entries).toEqual([]);
    expect((await get(`/viewer/docs/${joined.slug}/revs/0`)).statusCode).toBe(404);

    // Kelola file lokal → 501 dengan hint leave.
    for (const [m, u] of [
      ['POST', `/viewer/docs/${joined.slug}/rename`],
      ['POST', `/viewer/docs/${joined.slug}/archive`],
      ['POST', `/viewer/docs/${joined.slug}/duplicate`],
    ] as const) {
      const r = await post(u, { name: 'X' });
      expect(r.statusCode, `${u}: ${r.body}`).toBe(501);
      expect(r.json().error.code).toBe('NOT_SUPPORTED');
    }
    expect((await del(`/viewer/docs/${joined.slug}`)).statusCode).toBe(501);

    const left = await post(`/viewer/rooms/${joined.slug}/leave`);
    expect(left.statusCode).toBe(200);
    const after = (await get('/viewer/docs')).json().data as { docs: { slug: string }[] };
    expect(after.docs.some((d) => d.slug === joined.slug)).toBe(false);
    expect((await get(`/viewer/docs/${joined.slug}`)).statusCode).toBe(404);
  });

  it('ops viewer di slug room → commit sequencer; broadcast peer lain konvergen di replika', async () => {
    const { get, post, createRoom, joinRoom, peerClient } = await live();
    const { token } = await createRoom();
    const joined = await joinRoom(token);

    const ops = await post(`/viewer/docs/${joined.slug}/ops`, {
      ops: [{ op: 'update', id: 'board001', patch: { name: 'B1-updated' } }],
      description: 'rename board',
    });
    expect(ops.statusCode, ops.body).toBe(200);
    const data = ops.json().data as { rev: number };
    expect(data.rev).toBe(1);

    // Peer kedua (klien room langsung) melihat commit daemon di replikanya.
    const peer = await peerClient(token);
    const peerDoc = peer.doc();
    expect(peerDoc.rev).toBe(1);
    expect(JSON.stringify(peerDoc)).toContain('B1-updated');

    // Broadcast peer → replika daemon ikut maju (GET dokumen room membaca replika terkini).
    await peer.commitOps([{ op: 'update', id: 'board001', patch: { name: 'B1-peer' } }], 'rename from peer');
    await expect
      .poll(async () => ((await get(`/viewer/docs/${joined.slug}`)).json().data as { doc: LakarDocument }).doc.rev, { timeout: 3000 })
      .toBe(2);
    const doc = ((await get(`/viewer/docs/${joined.slug}`)).json().data as { doc: LakarDocument }).doc;
    expect(JSON.stringify(doc)).toContain('B1-peer');
  });

  it('route agen didelegasikan: open_doc focus → /pages membaca replika room; undo → sequencer', async () => {
    const { daemon, get, post, createRoom, joinRoom } = await live();
    const { token } = await createRoom();
    const joined = await joinRoom(token);

    // Sesi agen: buat sesi, lalu open_doc {slug room} → dokumen aktif = replika.
    const sess = await post('/sessions', { client: 'agent-test' });
    expect(sess.statusCode).toBe(200);
    const sessionId = (sess.json().data as { sessionId: string }).sessionId;
    const H = { 'x-lakar-session': sessionId };
    const opened = await daemon.app.inject({ method: 'POST', url: '/docs/open', payload: { slug: joined.slug }, headers: H });
    expect(opened.statusCode, opened.body).toBe(200);
    expect((opened.json().data as { slug: string }).slug).toBe(joined.slug);

    const pages = await daemon.app.inject({ method: 'POST', url: '/pages', payload: {}, headers: H });
    expect(pages.statusCode, pages.body).toBe(200);
    expect((pages.json().data as { pages: { id: string }[] }).pages[0]!.id).toBe('Ppagepag');

    // create_page di room → halaman baru lewat insertPage di sequencer.
    const created = await daemon.app.inject({ method: 'POST', url: '/pages/create', payload: { name: 'Room Page 2' }, headers: H });
    expect(created.statusCode, created.body).toBe(200);
    const doc = ((await get(`/viewer/docs/${joined.slug}`)).json().data as { doc: LakarDocument }).doc;
    expect(doc.pages.map((p) => p.name)).toEqual(['Page 1', 'Room Page 2']);

    // undo agen didelegasikan ke DocTransport room (bukan tumpukan lokal) → respons transport, bukan error NO_ACTIVE_DOC.
    const undo = await daemon.app.inject({ method: 'POST', url: '/viewer/undo', payload: {}, headers: H });
    expect(undo.statusCode, undo.body).not.toBe(500);
  });

  it('tabrakan slug dua arah: join di atas file lokal room-* dan file lokal di atas room ter-mount', async () => {
    const { server, get, post, createRoom } = await live();
    const { token } = await createRoom();
    const base = `room-${tokenSlug(token)}`;

    // Arah 1: file lokal sudah memakai slug `room-<token6>` → join mengambil sufiks -2, file lokal tidak tertutup.
    const created = await post('/viewer/docs', { name: base });
    expect(created.statusCode, created.body).toBe(200);
    expect((created.json().data as { slug: string }).slug).toBe(base);

    const joined = await post('/viewer/rooms/join', { server, token });
    expect(joined.statusCode, joined.body).toBe(200);
    const roomSlug = (joined.json().data as { slug: string }).slug;
    expect(roomSlug).toBe(`${base}-2`);

    // Slug `base` tetap dokumen lokal (id-nya bukan id dokumen room) — room tidak membayanginya.
    const local = await get(`/viewer/docs/${base}`);
    expect(local.statusCode, local.body).toBe(200);
    expect((local.json().data as { doc: LakarDocument }).doc.id).not.toBe('Ddocdocd');
    const list = (await get('/viewer/docs')).json().data as { docs: { slug: string; remote?: boolean }[] };
    expect(list.docs.find((d) => d.slug === base)?.remote).toBeUndefined();
    expect(list.docs.find((d) => d.slug === roomSlug)?.remote).toBe(true);

    // Arah 2: file lokal baru tidak boleh mengambil slug room yang sedang ter-mount.
    const clash = await post('/viewer/docs', { name: roomSlug });
    expect(clash.statusCode, clash.body).toBe(200);
    const clashSlug = (clash.json().data as { slug: string }).slug;
    expect(clashSlug).toBe(`${roomSlug}-2`);
    const roomDoc = await get(`/viewer/docs/${roomSlug}`);
    expect(roomDoc.statusCode, roomDoc.body).toBe(200);
    expect((roomDoc.json().data as { doc: LakarDocument }).doc.id).toBe('Ddocdocd');

    // Rename ke slug room yang ter-mount → CONFLICT (bukan menimpa).
    const renamed = await post(`/viewer/docs/${clashSlug}/rename`, { name: roomSlug });
    expect(renamed.statusCode, renamed.body).toBe(409);
    expect(renamed.json().error.code).toBe('CONFLICT');
  });

  it('join idempotent: server ternormalisasi (trailing slash) dan join konkuren → satu entri', async () => {
    const { server, get, post, createRoom, joinRoom } = await live();
    const { token } = await createRoom();
    const first = await joinRoom(token);
    // Trailing slash/userinfo dinormalisasi → room yang sama (bukan slug -2).
    const again = await post('/viewer/rooms/join', { server: `${server}/`, token });
    expect(again.statusCode, again.body).toBe(200);
    expect((again.json().data as { slug: string }).slug).toBe(first.slug);
    // Join konkuren room yang sama → dedup ke satu entri (satu slug, satu klien).
    const { token: token2 } = await createRoom();
    const [a, b] = await Promise.all([post('/viewer/rooms/join', { server, token: token2 }), post('/viewer/rooms/join', { server, token: token2 })]);
    expect(a.statusCode, a.body).toBe(200);
    expect(b.statusCode, b.body).toBe(200);
    expect((a.json().data as { slug: string }).slug).toBe((b.json().data as { slug: string }).slug);
    const remote = (await get('/viewer/docs')).json().data as { docs: { slug: string; remote?: boolean }[] };
    expect(remote.docs.filter((d) => d.remote === true).map((d) => d.slug).sort()).toEqual([first.slug, (a.json().data as { slug: string }).slug].sort());
  });

  it('join gagal: token salah → 4xx; body jelek → SCHEMA_INVALID', { timeout: 30_000 }, async () => {
    const { post, server } = await live();
    const bad = await post('/viewer/rooms/join', { server, token: 'token-bohongan' });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
    expect(bad.json().error).toBeDefined();
    const schema = await post('/viewer/rooms/join', { server });
    expect(schema.statusCode).toBe(400);
    expect(schema.json().error.code).toBe('SCHEMA_INVALID');
    const unreachable = await post('/viewer/rooms/join', { server: 'http://127.0.0.1:1', token: 'x' });
    expect(unreachable.statusCode).toBeGreaterThanOrEqual(400);
  });
});
