// Seleksi efemeral (AD-9): PUT/GET /viewer/docs/:slug/selection dan POST /viewer/selection (tool get_selection).
// Hanya di memori: file dokumen, riwayat, dan rev tidak berubah; daemon baru kosong. RenderPort palsu.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LakarError, SELECTION_MAX, isNodeAddress } from '@lakar/schema';
import { buildServer, loadConfig } from './index.js';
import type { BusEvent, DocSelection } from './events.js';
import { SelectionStore, summarizeSelection } from './selection.js';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };

/** Board `failBoard` gagal diukur; node lain diberi kotak tetap. */
let failBoard: string | undefined;
const fakeRender = {
  screenshot: async () => new Uint8Array(),
  measure: async (doc: any, boardId: string) => {
    if (boardId === failBoard) throw new LakarError('FONT_MISSING', 'keluarga X tidak terdaftar', { hint: 'pakai font terdaftar' });
    const b = doc.pages.flatMap((p: any) => p.children).find((x: any) => x.id === boardId);
    const nodes: any[] = [];
    const walk = (n: any, i: number) => {
      nodes.push({ id: n.id, x: 10 + i, y: 20.4, width: 100.6, height: 40 });
      (n.children ?? []).forEach(walk);
    };
    b.children.forEach(walk);
    return { width: b.width, height: b.height, nodes, texts: [] };
  },
} as never;

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-selection-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function setup(dataDir?: string) {
  const dir = dataDir ?? (await mkdtemp(join(root, 'data-')));
  const daemon = buildServer({ config: { ...baseConfig, port: 7466, dataDir: dir }, render: fakeRender });
  const { app } = daemon;
  const inject = (method: 'GET' | 'PUT' | 'POST', url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method, url, ...(payload !== undefined ? { payload: payload as object } : {}), headers });
  const docsDir = join(dir, 'docs');
  const create = async (name: string) => {
    const r = await inject('POST', '/viewer/docs', { name, board: { preset: 'mobile' } });
    expect(r.statusCode, r.body).toBe(200);
    const slug = r.json().data.slug as string;
    const doc = JSON.parse(await readFile(join(docsDir, `${slug}.lakar.json`), 'utf8'));
    return { slug, board: doc.pages[0].children[0].id as string };
  };
  const addFrame = async (slug: string, board: string) => {
    const r = await inject('POST', `/viewer/docs/${slug}/ops`, { ops: [{ op: 'add', parentId: board, node: { type: 'frame', name: 'Hero', width: 100, height: 40 } }] });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data.created[0].id as string;
  };
  const session = async () => (await inject('POST', '/sessions', { client: 'test-agent' })).json().data.sessionId as string;
  const getSel = (sid: string, body: unknown = {}) => inject('POST', '/viewer/selection', body, { 'x-lakar-session': sid });
  const events: BusEvent[] = [];
  daemon.activity.subscribeAll((e) => events.push(e));
  const selEvents = () => events.filter((e) => e.type === 'selection').map((e) => (e as { selection: DocSelection }).selection);
  const files = async (slug: string) => ({
    doc: await readFile(join(docsDir, `${slug}.lakar.json`), 'utf8'),
    history: await readFile(join(docsDir, `${slug}.history.jsonl`), 'utf8'),
  });
  return { ...daemon, dir, inject, create, addFrame, session, getSel, events, selEvents, files };
}

describe('bentuk alamat dan SelectionStore', () => {
  it('isNodeAddress: ID dan alamat komposit; lainnya ditolak', () => {
    for (const ok of ['Aaaaaaa1', 'Aaaaaaa1/Bbbbbbb2', 'Aaaaaaa1/Bbbbbbb2/Ccccccc3']) expect(isNodeAddress(ok), ok).toBe(true);
    for (const bad of ['abc', 'Aaaaaaa1/', '/Aaaaaaa1', 'Aaaaaaa1//Bbbbbbb2', 'Aaaaaaa-', 'Aaaaaaa1 ', 1, null]) expect(isNodeAddress(bad), String(bad)).toBe(false);
  });

  it('set: dedupe urutan pertama, changed hanya bila isi berbeda, kosong menghapus entri, latest', () => {
    let t = 0;
    const s = new SelectionStore(() => ++t * 1000);
    expect(s.set('a', ['Aaaaaaa1', 'Bbbbbbb2', 'Aaaaaaa1']).entry.addresses).toEqual(['Aaaaaaa1', 'Bbbbbbb2']);
    expect(s.set('a', ['Aaaaaaa1', 'Bbbbbbb2']).changed).toBe(false);
    expect(s.set('a', ['Bbbbbbb2', 'Aaaaaaa1']).changed).toBe(true);
    s.set('b', ['Ccccccc3']);
    expect(s.latest()).toBe('b');
    expect(s.set('b', []).changed).toBe(true);
    expect(s.get('b')).toBeUndefined();
    expect(s.latest()).toBe('a');
    expect(s.set('c', []).changed).toBe(false);
    expect(s.size).toBe(1);
  });

  it('isi sama tidak menyegarkan waktu/urutan; latest = perubahan terakhir walau jam sama; kosong dari jendela lain diabaikan', () => {
    const s = new SelectionStore(() => 0);
    const first = s.set('a', ['Aaaaaaa1'], 'w1').entry;
    s.set('b', ['Bbbbbbb2'], 'w2');
    expect(s.set('a', ['Aaaaaaa1'], 'w3')).toEqual({ entry: first, changed: false });
    expect(s.latest()).toBe('b');
    s.set('a', ['Ccccccc3'], 'w1');
    expect(s.latest()).toBe('a');
    // Jendela w9 ditutup sesudah w1 memilih: seleksi w1 tetap.
    expect(s.set('a', [], 'w9').changed).toBe(false);
    expect(s.get('a')?.addresses).toEqual(['Ccccccc3']);
    // Pemilik sendiri, atau klien tanpa origin, boleh mengosongkan.
    expect(s.set('a', [], 'w1').changed).toBe(true);
    s.set('b', [], undefined);
    expect(s.size).toBe(0);
  });

  it('onFileChange: rename (slug lama), archive, delete dokumen aktif membuang; delete salinan arsip tidak', () => {
    const s = new SelectionStore();
    for (const slug of ['a', 'b', 'c', 'd']) s.set(slug, ['Aaaaaaa1']);
    s.onFileChange({ kind: 'delete', slug: 'd', archived: true });
    expect(s.get('d')).toBeDefined();
    s.onFileChange({ kind: 'rename', slug: 'a2', from: 'a' });
    s.onFileChange({ kind: 'archive', slug: 'b' });
    s.onFileChange({ kind: 'delete', slug: 'c', archived: false });
    s.onFileChange({ kind: 'edit', slug: 'd', rev: 3 });
    expect([...['a', 'b', 'c', 'd']].filter((x) => s.get(x))).toEqual(['d']);
  });

  it('summarizeSelection: board, node, missing (terhapus dan komposit), bounds per board', () => {
    const doc = { pages: [{ id: 'Pppppppp', name: 'Page 1', children: [{ id: 'Bbbbbbbb', name: 'Home', children: [{ id: 'Ffffffff', name: 'Hero', type: 'frame' }] }] }] };
    const measured = new Map([['Bbbbbbbb', new Map<string, [number, number, number, number]>([['Bbbbbbbb', [0, 0, 390, 844]], ['Ffffffff', [0, 10, 390, 200]]])]]);
    expect(summarizeSelection(doc, ['Ffffffff', 'Bbbbbbbb', 'Xxxxxxxx', 'Ffffffff/Gggggggg'], measured)).toEqual({
      nodes: [
        { address: 'Ffffffff', id: 'Ffffffff', type: 'frame', name: 'Hero', boardId: 'Bbbbbbbb', bounds: [0, 10, 390, 200] },
        { address: 'Bbbbbbbb', id: 'Bbbbbbbb', type: 'board', name: 'Home', boardId: 'Bbbbbbbb', bounds: [0, 0, 390, 844] },
      ],
      missing: ['Xxxxxxxx', 'Ffffffff/Gggggggg'],
    });
    expect(summarizeSelection(doc, ['Ffffffff']).nodes[0]).not.toHaveProperty('bounds');
  });
});

describe('route seleksi', () => {
  it('PUT menyimpan + dedupe + event selection (origin, rev); isi sama tanpa event; GET membaca; file/riwayat/rev tetap', async () => {
    const t = await setup();
    try {
      const { slug, board } = await t.create('Sel Satu');
      const frame = await t.addFrame(slug, board);
      const before = await t.files(slug);
      const r = await t.inject('PUT', `/viewer/docs/${slug}/selection`, { addresses: [frame, board, frame] }, { 'x-lakar-origin': 'win-1' });
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json()).toEqual({ ok: true, data: { slug, rev: 2, addresses: [frame, board] } });
      expect(t.selEvents()).toEqual([{ slug, addresses: [frame, board], rev: 2, origin: 'win-1' }]);
      const again = await t.inject('PUT', `/viewer/docs/${slug}/selection`, { addresses: [frame, board] });
      expect(again.statusCode).toBe(200);
      expect(t.selEvents()).toHaveLength(1);
      const got = (await t.inject('GET', `/viewer/docs/${slug}/selection`)).json().data;
      expect(got).toMatchObject({ slug, rev: 2, addresses: [frame, board] });
      expect(typeof got.updatedAt).toBe('string');
      expect(await t.files(slug)).toEqual(before);
      // Event selection tidak masuk ring hello.
      expect(t.activity.recent().some((e) => (e as { type: string }).type === 'selection')).toBe(false);
    } finally {
      await t.app.close();
    }
  });

  it('kosongkan, alamat komposit diterima, bentuk salah 400, slug salah 400, dokumen tak ada 404, Origin asing 403', async () => {
    const t = await setup();
    try {
      const { slug, board } = await t.create('Sel Dua');
      const put = (body: unknown, headers: Record<string, string> = {}, s = slug) => t.inject('PUT', `/viewer/docs/${s}/selection`, body, headers);
      expect((await put({ addresses: [`${board}/Aaaaaaa1`] })).statusCode).toBe(200);
      for (const body of [{ addresses: ['abc'] }, { addresses: [`${board}/`] }, { addresses: 'x' }, {}, { addresses: [], extra: 1 }, { addresses: Array.from({ length: SELECTION_MAX + 1 }, () => board) }]) {
        const r = await put(body);
        expect(r.statusCode, JSON.stringify(body).slice(0, 80)).toBe(400);
        expect(r.json().error.code).toBe('SCHEMA_INVALID');
      }
      expect((await put({ addresses: [] }, {}, 'Bad_Slug')).statusCode).toBe(400);
      const missing = await put({ addresses: [] }, {}, 'tidak-ada');
      expect(missing.statusCode).toBe(404);
      expect(missing.json().error.code).toBe('NOT_FOUND');
      expect((await t.inject('GET', '/viewer/docs/tidak-ada/selection')).statusCode).toBe(404);
      const evil = await put({ addresses: [board] }, { origin: 'https://evil.example' });
      expect(evil.statusCode).toBe(403);
      expect((await t.inject('GET', `/viewer/docs/${slug}/selection`)).json().data.addresses).toEqual([`${board}/Aaaaaaa1`]);
      expect((await put({ addresses: [board] }, { origin: 'http://127.0.0.1:7466' })).statusCode).toBe(200);
      expect((await put({ addresses: [] })).json().data.addresses).toEqual([]);
      expect(t.selEvents().at(-1)).toEqual({ slug, addresses: [], rev: 1 });
      const got = (await t.inject('GET', `/viewer/docs/${slug}/selection`)).json().data;
      expect(got).toEqual({ slug, rev: 1, addresses: [] });
    } finally {
      await t.app.close();
    }
  });

  it('get_selection: dokumen aktif, ringkasan + bounds bulat, missing, unmeasured, slug eksplisit, fallback terbaru, NO_ACTIVE_DOC', async () => {
    const t = await setup();
    try {
      const a = await t.create('Sel Tiga');
      const frame = await t.addFrame(a.slug, a.board);
      const b = await t.create('Sel Empat');
      const sid = await t.session();
      // Tanpa dokumen aktif dan tanpa seleksi.
      const none = await t.getSel(sid);
      expect(none.statusCode).toBe(409);
      expect(none.json().error.code).toBe('NO_ACTIVE_DOC');
      // Seleksi di dokumen b → fallback ke b.
      await t.inject('PUT', `/viewer/docs/${b.slug}/selection`, { addresses: [b.board] });
      expect((await t.getSel(sid)).json().data).toMatchObject({ slug: b.slug, addresses: [b.board], nodes: [{ id: b.board, type: 'board', bounds: [0, 0, 375, 812] }] });
      // Dokumen aktif a menang atas seleksi terbaru di b.
      expect((await t.inject('POST', '/docs/open', { slug: a.slug }, { 'x-lakar-session': sid })).statusCode).toBe(200);
      const empty = (await t.getSel(sid)).json().data;
      expect(empty).toEqual({ slug: a.slug, rev: 2, addresses: [], nodes: [] });
      await t.inject('PUT', `/viewer/docs/${a.slug}/selection`, { addresses: [frame, 'Xxxxxxxx', `${frame}/Aaaaaaa1`] });
      const r = await t.getSel(sid);
      expect(r.statusCode, r.body).toBe(200);
      const data = r.json().data;
      expect(data).toMatchObject({ slug: a.slug, rev: 2, addresses: [frame, 'Xxxxxxxx', `${frame}/Aaaaaaa1`], missing: ['Xxxxxxxx', `${frame}/Aaaaaaa1`] });
      expect(data.nodes).toEqual([{ address: frame, id: frame, type: 'frame', name: 'Hero', boardId: a.board, bounds: [10, 20, 101, 40] }]);
      expect(data).not.toHaveProperty('unmeasured');
      // Board gagal diukur: node tetap ada tanpa bounds.
      failBoard = a.board;
      const bad = (await t.getSel(sid)).json().data;
      expect(bad.nodes[0]).not.toHaveProperty('bounds');
      expect(bad.unmeasured).toEqual([{ boardId: a.board, code: 'FONT_MISSING', message: 'keluarga X tidak terdaftar' }]);
      failBoard = undefined;
      // Slug eksplisit.
      expect((await t.getSel(sid, { slug: b.slug })).json().data.slug).toBe(b.slug);
      expect((await t.getSel(sid, { slug: 'tidak-ada' })).statusCode).toBe(404);
      expect((await t.getSel(sid, { slug: 1 })).statusCode).toBe(400);
      // Sesi wajib.
      expect((await t.inject('POST', '/viewer/selection', {})).statusCode).toBe(401);
      // Tercatat di Activity sebagai tool get_selection.
      const calls = t.activity.recent().filter((e) => e.type === 'call' && e.call.tool === 'get_selection');
      expect(calls.length).toBeGreaterThan(0);
    } finally {
      failBoard = undefined;
      await t.app.close();
    }
  });

  it('rename/arsip/hapus membuang seleksi slug lama; daemon baru (restart) kosong', async () => {
    const t = await setup();
    try {
      const a = await t.create('Sel Lima');
      const b = await t.create('Sel Enam');
      const c = await t.create('Sel Tujuh');
      for (const d of [a, b, c]) await t.inject('PUT', `/viewer/docs/${d.slug}/selection`, { addresses: [d.board] });
      expect(t.selections.size).toBe(3);
      const ren = await t.inject('POST', `/viewer/docs/${a.slug}/rename`, { name: 'Sel Lima Baru' });
      expect(ren.statusCode, ren.body).toBe(200);
      expect(t.selections.get(a.slug)).toBeUndefined();
      expect((await t.inject('POST', `/viewer/docs/${b.slug}/archive`)).statusCode).toBe(200);
      expect(t.selections.get(b.slug)).toBeUndefined();
      const del = await t.app.inject({ method: 'DELETE', url: `/viewer/docs/${c.slug}` });
      expect(del.statusCode, del.body).toBe(200);
      expect(t.selections.size).toBe(0);
      // Restart: seleksi tidak pernah ditulis ke disk.
      const newSlug = ren.json().data.slug as string;
      await t.inject('PUT', `/viewer/docs/${newSlug}/selection`, { addresses: [a.board] });
      const fresh = await setup(t.dir);
      try {
        expect((await fresh.inject('GET', `/viewer/docs/${newSlug}/selection`)).json().data.addresses).toEqual([]);
        const sid = await fresh.session();
        expect((await fresh.getSel(sid, { slug: newSlug })).json().data).toMatchObject({ slug: newSlug, addresses: [], nodes: [] });
      } finally {
        await fresh.app.close();
      }
    } finally {
      await t.app.close();
    }
  });

  it('SSE /viewer/events menulis event: selection', async () => {
    const t = await setup();
    try {
      const { slug, board } = await t.create('Sel Delapan');
      await t.app.listen({ port: 0, host: '127.0.0.1' });
      const port = (t.app.server.address() as { port: number }).port;
      const ac = new AbortController();
      const res = await fetch(`http://127.0.0.1:${port}/viewer/events`, { signal: ac.signal });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      const until = async (s: string) => {
        while (!buf.includes(s)) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value);
        }
      };
      await until('event: hello');
      const put = await fetch(`http://127.0.0.1:${port}/viewer/docs/${slug}/selection`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ addresses: [board] }) });
      expect(put.status).toBe(200);
      await until('event: selection');
      const line = buf.split('\n').find((l, i, all) => all[i - 1] === 'event: selection' && l.startsWith('data: '))!;
      expect(JSON.parse(line.slice(6))).toMatchObject({ type: 'selection', selection: { slug, addresses: [board], rev: 1 } });
      ac.abort();
    } finally {
      await t.app.close();
    }
  });
});
