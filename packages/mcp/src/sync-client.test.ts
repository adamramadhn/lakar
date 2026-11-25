// Tes e2e `lakar --server` (spec-collab-cloud story 4): SyncClient + DocTransport melawan server
// `@lakar/sync` sungguhan (buildSync + MemoryRoomRepo di port ephemeral) — join/welcome, execute →
// ack → replika, konvergensi dua klien byte-per-byte, rejected→resync→retry, view token → FORBIDDEN,
// dan reconnect setelah server restart. Op baru ikut diuji end-to-end: pages/create → insertPage,
// comment → setComments.
import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { buildSync, MemoryRoomRepo, RoomManager } from '@lakar/sync';
import { SCHEMA_VERSION, type LakarDocument } from '@lakar/schema';
import { SyncClient, type SyncClientOptions } from './sync-client.js';

const KEY = 'test-key';
const AUTH = { authorization: `Bearer ${KEY}` };

/** Katalog ikon palsu (canonical lolos; tanpa file data lucide) — sama dengan file-client.test.ts. */
const fakeIcons = {
  versions: { lucide: '0.test' },
  canonical: (_lib: string, icon: string) => ({ icon, version: '0.test' }),
  search: () => [] as { lib: string; icon: string }[],
  glyph: () => undefined,
};

/** Dokumen valid rev 0 dengan satu board `board001` (bentuk tersimpan — sama dengan sync.test.ts). */
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

const apps: { close: () => Promise<unknown> }[] = [];
const clients: SyncClient[] = [];
afterEach(async () => {
  while (clients.length) clients.pop()!.close();
  while (apps.length) await apps.pop()!.close();
});

/** Server sync hidup di port ephemeral + helper create room + klien sync. */
async function live() {
  const repo = new MemoryRoomRepo();
  const rooms = new RoomManager(repo);
  const app = buildSync({ repo, apiKey: KEY, rooms });
  await app.listen({ host: '127.0.0.1', port: 0 });
  apps.push(app);
  const port = (app.server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}`;
  const createRoom = async (doc: LakarDocument = docWithBoard()) => {
    const r = await app.inject({ method: 'POST', url: '/api/rooms', payload: { title: 'Room Uji', doc }, headers: AUTH });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data as { token: string; viewToken: string; rev: number };
  };
  const client = async (token: string, opts: SyncClientOptions = {}) => {
    const c = new SyncClient(url, token, { transport: { icons: fakeIcons }, ...opts });
    clients.push(c);
    await c.waitReady();
    return c;
  };
  return { repo, rooms, app, port, url, createRoom, client };
}

/** Jeda singkat menunggu pesan broadcast diproses klien. */
const settle = (ms = 50) => new Promise((r) => setTimeout(r, ms));

/** Tunggu predikat (polling 5ms; timeout → error). */
const waitUntil = async (pred: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('timeout menunggu kondisi');
    await settle(5);
  }
};

describe('SyncClient: join + replika', () => {
  it('join edit → welcome mengisi replika {doc, rev} + daftar peer; status transport server', async () => {
    const t = await live();
    const room = await t.createRoom();
    const c = await t.client(room.token);
    expect(c.connected).toBe(true);
    expect(c.rev).toBe(0);
    expect(c.doc?.id).toBe('Ddocdocd');
    expect(c.peers).toBe(1);
    const st = await c.status<{ transport: string; server: string; room: string; connected: boolean; peers: number }>();
    // Token room (capability) disamarkan di status: 6 karakter pertama + elipsis.
    expect(st.ok && st.data).toMatchObject({ transport: 'server', room: `${room.token.slice(0, 6)}…`, connected: true, peers: 1 });
    expect(st.ok && st.data.room).not.toBe(room.token);
    // Peer kedua muncul di replika peer list yang pertama (peer_join).
    const d = await t.client(room.token, { name: 'agen-kedua' });
    await settle();
    expect(c.peers).toBe(2);
    expect(d.peers).toBe(2);
    d.close();
    await settle();
    expect(c.peers).toBe(1);
  });

  it('token salah → call menjawab FORBIDDEN permanen (tanpa reconnect loop)', async () => {
    const t = await live();
    const c = new SyncClient(t.url, 'token-ngasal', { transport: { icons: fakeIcons } });
    clients.push(c);
    await expect(c.waitReady()).rejects.toThrow(/token join ditolak/);
    const r = await c.call('/boards', {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('FORBIDDEN');
    expect(c.connected).toBe(false);
  });

  it('baca murni lewat replika: open_doc, list_boards, inspect — tanpa menyentuh server', async () => {
    const t = await live();
    const room = await t.createRoom();
    const c = await t.client(room.token);
    const open = await c.call<{ slug: string; rev: number }>('/docs/open', {});
    expect(open.ok && open.data).toMatchObject({ slug: 'Ddocdocd', rev: 0 });
    const boards = await c.call<{ boards: { id: string; name: string }[] }>('/boards', {});
    expect(boards.ok && boards.data.boards.map((b) => b.id)).toEqual(['board001']);
    const ins = await c.call<{ node: { id: string } }>('/inspect', { id: 'board001' });
    expect(ins.ok && ins.data.node.id).toBe('board001');
    expect((await t.repo.meta(room.token))!.rev).toBe(0);
  });
});

describe('SyncClient: execute → ops → ack', () => {
  it('execute mengirim ops ke server dan replika identik byte-per-byte dengan doc server', async () => {
    const t = await live();
    const room = await t.createRoom();
    const c = await t.client(room.token);
    const ex = await c.call<{ rev: number; created: { id: string }[] }>('/execute', {
      code: `add('board001',{type:'text',name:'Judul',content:'Halo',size:24})`,
      description: 'tambah teks halo uji',
    });
    expect(ex.ok, JSON.stringify(ex)).toBe(true);
    if (!ex.ok) return;
    expect(ex.data.rev).toBe(1);
    expect(ex.data.created.length).toBeGreaterThan(0);
    const serverDoc = (await t.repo.load(room.token))!.doc;
    // Kontrak deterministik: ack membawa seed/at dan replay lokal menghasilkan dokumen yang sama.
    expect(c.doc).toEqual(serverDoc);
    expect(c.doc!.pages[0]!.children[0]!.children[0]).toMatchObject({ type: 'text', content: 'Halo' });
  });

  it('dua klien konvergen: execute A di-broadcast ke B dengan replay ber-seed', async () => {
    const t = await live();
    const room = await t.createRoom();
    const a = await t.client(room.token, { name: 'agen-A' });
    const b = await t.client(room.token, { name: 'agen-B' });
    const ex = await a.call<{ rev: number }>('/execute', {
      code: `const f = add('board001',{type:'frame',name:'Hero',width:100,height:50}); add(f,{type:'text',name:'Dalam',content:'Isi',size:16})`,
      description: 'frame hero + teks uji',
    });
    expect(ex.ok, JSON.stringify(ex)).toBe(true);
    await settle(200);
    const serverDoc = (await t.repo.load(room.token))!.doc;
    // Ketiga replika identik — seed/at broadcast menjamin ID minted sama di tiap peer.
    expect(a.doc).toEqual(serverDoc);
    expect(b.doc).toEqual(serverDoc);
  });

  it('rejected (baseRev basi) → resync → retry sekali → commit lolos dan semua pihak konvergen', async () => {
    const t = await live();
    const room = await t.createRoom();
    const a = await t.client(room.token, { name: 'agen-A' });
    let resyncs = 0;
    // sendDelay menahan frame ops B: A commit duluan (rev1), B mengirim baseRev=0 → rejected.
    const b = await t.client(room.token, { name: 'agen-B', sendDelayMs: 200, onResync: () => resyncs++ });
    const bp = b.call<{ rev: number }>('/execute', {
      code: `add('board001',{type:'rect',name:'RB',width:10,height:10})`,
      description: 'rect dari B uji',
    });
    // Beri B waktu merekam ops + menjadwalkan kirim sebelum A commit.
    await settle(50);
    const ra = await a.call<{ rev: number }>('/execute', {
      code: `add('board001',{type:'rect',name:'RA',width:10,height:10})`,
      description: 'rect dari A uji',
    });
    expect(ra.ok && ra.data.rev).toBe(1);
    const rb = await bp;
    expect(rb.ok, JSON.stringify(rb)).toBe(true);
    if (!rb.ok) return;
    expect(rb.data.rev).toBe(2);
    expect(resyncs).toBeGreaterThan(0);
    await settle(200);
    const serverDoc = (await t.repo.load(room.token))!.doc;
    expect(a.doc).toEqual(serverDoc);
    expect(b.doc).toEqual(serverDoc);
    // Kedua rect masuk: retry B menerapkan ops rev0-nya di atas doc rev1.
    expect(serverDoc.pages[0]!.children[0]!.children.map((n) => n.name)).toEqual(['RA', 'RB']);
  });

  it('view token: execute → FORBIDDEN; baca tetap jalan', async () => {
    const t = await live();
    const room = await t.createRoom();
    const v = await t.client(room.viewToken);
    const boards = await v.call<{ boards: unknown[] }>('/boards', {});
    expect(boards.ok).toBe(true);
    const ex = await v.call('/execute', { code: `add('board001',{type:'rect',name:'R',width:1,height:1})`, description: 'view mencoba menulis' });
    expect(ex.ok).toBe(false);
    if (!ex.ok) expect(ex.error.code).toBe('FORBIDDEN');
    expect((await t.repo.meta(room.token))!.rev).toBe(0);
  });
});

describe('SyncClient: op level-dokumen (insertPage + setComments)', () => {
  it('pages/create → insertPage di server; create comment → setComments; peer lain melihat', async () => {
    const t = await live();
    const room = await t.createRoom();
    const a = await t.client(room.token, { name: 'agen-A' });
    const b = await t.client(room.token, { name: 'agen-B' });
    const page = await a.call<{ page: { id: string; name: string } }>('/pages/create', { name: 'Detail' });
    expect(page.ok, JSON.stringify(page)).toBe(true);
    if (!page.ok) return;
    const cm = await a.call<{ thread: { id: string; status: string } }>('/comments/create', { text: 'tombol ini geser', x: 10, y: 20, pageId: 'Ppagepag' });
    expect(cm.ok, JSON.stringify(cm)).toBe(true);
    if (!cm.ok) return;
    await settle(200);
    const serverDoc = (await t.repo.load(room.token))!.doc;
    expect(serverDoc.pages.map((p) => p.name)).toEqual(['Page 1', 'Detail']);
    expect(serverDoc.comments).toHaveLength(1);
    expect(serverDoc.comments![0]).toMatchObject({ status: 'open', pageId: 'Ppagepag' });
    expect(serverDoc.comments![0]!.messages[0]).toMatchObject({ text: 'tombol ini geser' });
    // Replika B ikut konvergen lewat broadcast ops level-dokumen.
    expect(b.doc).toEqual(serverDoc);
    // Baca sisi B lewat route yang sama.
    const threads = await b.call<{ threads: { messages: { text: string }[] }[] }>('/comments', {});
    expect(threads.ok && threads.data.threads.map((x) => x.messages[0]!.text)).toEqual(['tombol ini geser']);
  });
});

describe('SyncClient: validasi argumen + tutup', () => {
  it('--server URL ber-path non-root → gagal cepat (bukan loop reconnect diam-diam)', () => {
    expect(() => new SyncClient('http://127.0.0.1:9999/api', 'tok')).toThrow(/berisi path/);
    expect(() => new SyncClient('ws://127.0.0.1:9999/rooms/x', 'tok')).toThrow(/pakai origin saja/);
  });

  it('close() menolak waitReady yang menggantung (bukan hang selamanya)', async () => {
    // Port 1 = tidak akan pernah ada welcome; waitReady harus ditolak saat close().
    const c = new SyncClient('ws://127.0.0.1:1', 'tok', { reconnectBaseMs: 10 });
    clients.push(c);
    const p = c.waitReady();
    c.close();
    await expect(p).rejects.toThrow(/ditutup/);
  });
});

describe('SyncClient: reconnect', () => {
  it('server restart → call gagal retryable sementara down, lalu menyambung ulang dan jalan lagi', async () => {
    const t = await live();
    const room = await t.createRoom();
    const c = await t.client(room.token, { reconnectBaseMs: 20 });
    // Server berhenti total → koneksi putus → call menjawab retryable, proses tetap hidup.
    await t.app.close();
    apps.pop();
    await waitUntil(() => !c.connected);
    const down = await c.call('/boards', {});
    expect(down.ok).toBe(false);
    if (!down.ok) {
      expect(down.error.code).toBe('EXEC_ERROR');
      expect(down.error.retryable).toBe(true);
    }
    // Server baru (repo sama) di port yang sama → klien menyambung ulang otomatis.
    const repo = t.repo;
    const app2 = buildSync({ repo, apiKey: KEY, rooms: new RoomManager(repo) });
    await app2.listen({ host: '127.0.0.1', port: t.port });
    apps.push(app2);
    await c.waitReady();
    const up = await c.call<{ rev: number }>('/execute', { code: `add('board001',{type:'rect',name:'R',width:1,height:1})`, description: 'rect pasca restart' });
    expect(up.ok, JSON.stringify(up)).toBe(true);
    if (up.ok) expect(up.data.rev).toBe(1);
    expect(c.doc).toEqual((await repo.load(room.token))!.doc);
  });
});
