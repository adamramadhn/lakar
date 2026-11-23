// Agen di dokumen terbuka (spec-agent-open-doc): FocusStore, PUT /viewer/focus, open_doc tanpa slug (viewer /
// dibuat / slug), pin sesi, target di respons, list_documents, event openTab. Hanya di memori; RenderPort palsu.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer, loadConfig } from './index.js';
import type { BusEvent, DocOpenRequest } from './events.js';
import { FocusStore } from './focus.js';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };
const fakeRender = {
  screenshot: async () => new Uint8Array(),
  measure: async (doc: any, boardId: string) => {
    const b = doc.pages.flatMap((p: any) => p.children).find((x: any) => x.id === boardId);
    return { width: b.width, height: b.height, nodes: [], texts: [] };
  },
} as never;

const BOARD = "add(null, {type:'board', name:'Ekstra', x:2000, y:0, width:390, height:844, screen:'mobile'})";

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-focus-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function setup() {
  const dir = await mkdtemp(join(root, 'data-'));
  const daemon = buildServer({ config: { ...baseConfig, port: 7466, dataDir: dir }, render: fakeRender });
  const { app } = daemon;
  const inject = (method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method, url, ...(payload !== undefined ? { payload: payload as object } : {}), headers });
  const create = async (name: string) => {
    const r = await inject('POST', '/viewer/docs', { name, board: { preset: 'mobile' } });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data.slug as string;
  };
  const session = async () => (await inject('POST', '/sessions', { client: 'test-agent' })).json().data.sessionId as string;
  const report = (slug: string | null, origin?: string) => inject('PUT', '/viewer/focus', { slug }, origin ? { 'x-lakar-origin': origin } : {});
  const open = (sid: string, body: unknown = {}) => inject('POST', '/docs/open', body, { 'x-lakar-session': sid });
  const events: BusEvent[] = [];
  daemon.activity.subscribeAll((e) => events.push(e));
  const openTabs = () => events.flatMap((e) => (e.type === 'openTab' ? [(e as { openTab: DocOpenRequest }).openTab] : []));
  return { ...daemon, dir, inject, create, session, report, open, events, openTabs };
}

describe('FocusStore', () => {
  it('per origin; fokus terakhir menang; null menghapus entri jendela itu saja; isOpen; lastOrigin', () => {
    const f = new FocusStore();
    expect(f.current()).toBeUndefined();
    f.set('A', 'a');
    f.set('B', 'b');
    expect(f.current()).toBe('b');
    expect(f.isOpen('a') && f.isOpen('b')).toBe(true);
    // Jendela A difokuskan lagi dengan dokumen sama → A terbaru.
    f.set('A', 'a');
    expect(f.current()).toBe('a');
    // A kembali ke Dashboard: entri A hilang, B tetap.
    f.set('A', null);
    expect(f.current()).toBe('b');
    expect(f.isOpen('a')).toBe(false);
    expect(f.lastOrigin()).toBe('A');
    expect(f.size).toBe(1);
  });

  it('onFileChange: rename memindah slug; archive/delete menghapus; delete arsip tidak', () => {
    const f = new FocusStore();
    f.set('A', 'a');
    f.set('B', 'b');
    f.onFileChange({ kind: 'rename', slug: 'a2', from: 'a' });
    expect(f.isOpen('a2')).toBe(true);
    expect(f.isOpen('a')).toBe(false);
    f.onFileChange({ kind: 'delete', slug: 'b', archived: true });
    expect(f.isOpen('b')).toBe(true);
    f.onFileChange({ kind: 'archive', slug: 'b' });
    expect(f.isOpen('b')).toBe(false);
    f.onFileChange({ kind: 'delete', slug: 'a2' });
    expect(f.size).toBe(0);
  });
});

describe('PUT /viewer/focus', () => {
  it('menyimpan per origin, validasi slug 400, dokumen tak ada 404, Origin asing 403; dokumen/riwayat tidak berubah', async () => {
    const t = await setup();
    try {
      const a = await t.create('Fokus A');
      const before = await readFile(join(t.dir, 'docs', `${a}.lakar.json`), 'utf8');
      const r = await t.report(a, 'winA');
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().data).toEqual({ slug: a, focused: a });
      expect(t.focus.current()).toBe(a);
      expect((await t.report('Bad Slug', 'winA')).statusCode).toBe(400);
      expect((await t.inject('PUT', '/viewer/focus', { slug: 1 })).statusCode).toBe(400);
      expect((await t.inject('PUT', '/viewer/focus', {})).statusCode).toBe(400);
      expect((await t.report('tidak-ada', 'winA')).statusCode).toBe(404);
      const cross = await t.inject('PUT', '/viewer/focus', { slug: a }, { origin: 'https://evil.example' });
      expect(cross.statusCode).toBe(403);
      expect((await t.report(null, 'winA')).json().data).toEqual({ slug: null, focused: null });
      expect(await readFile(join(t.dir, 'docs', `${a}.lakar.json`), 'utf8')).toBe(before);
    } finally {
      await t.app.close();
    }
  });
});

describe('open_doc tanpa slug', () => {
  it('dokumen viewer: sesi dipaku ke dokumen fokus; respons membawa source, target, viewerOpen', async () => {
    const t = await setup();
    const detach = t.activity.attachViewer();
    try {
      const a = await t.create('Untitled');
      await t.report(a, 'winA');
      const sid = await t.session();
      const r = await t.open(sid);
      expect(r.statusCode, r.body).toBe(200);
      const data = r.json().data;
      expect(data).toMatchObject({ slug: a, rev: 1, created: false, source: 'viewer', viewerOpen: true });
      expect(data.target).toEqual({ slug: a, name: a, boardIds: [expect.any(String)] });
      expect(data).not.toHaveProperty('hint');
      expect(t.sessions.byId(sid)!.activeSlug).toBe(a);
      expect(t.openTabs()).toEqual([]);
    } finally {
      detach();
      await t.app.close();
    }
  });

  it('tidak ada dokumen terbuka + viewer terhubung: dokumen baru (slug dari name, unik termasuk arsip), event change create + openTab ke jendela terakhir', async () => {
    const t = await setup();
    const detach = t.activity.attachViewer('winA');
    try {
      const old = await t.create('Kopi Landing');
      await t.report(old, 'winA');
      await t.report(null, 'winA'); // kembali ke Dashboard
      const sid = await t.session();
      const r = await t.open(sid, { name: 'Kopi Landing' });
      expect(r.statusCode, r.body).toBe(200);
      const data = r.json().data;
      expect(data).toMatchObject({ slug: 'kopi-landing-2', rev: 0, created: true, source: 'created', viewerOpen: true, target: { slug: 'kopi-landing-2', boardIds: [] } });
      expect(existsSync(join(t.dir, 'docs', 'kopi-landing-2.lakar.json'))).toBe(true);
      expect(t.openTabs()).toEqual([{ slug: 'kopi-landing-2', origin: 'winA' }]);
      expect(t.events.some((e) => e.type === 'change' && e.change.kind === 'create' && e.change.slug === 'kopi-landing-2')).toBe(true);
      expect(t.sessions.byId(sid)!.activeSlug).toBe('kopi-landing-2');
      // Tanpa name: default Untitled.
      const sid2 = await t.session();
      expect((await t.open(sid2)).json().data).toMatchObject({ slug: 'untitled', source: 'created' });
      // Slug di arsip tidak dipakai ulang.
      expect((await t.inject('POST', '/viewer/docs/untitled/archive')).statusCode).toBe(200);
      expect((await t.open(await t.session())).json().data.slug).toBe('untitled-2');
      expect((await t.open(sid, { name: '***' })).statusCode).toBe(400);
    } finally {
      detach();
      await t.app.close();
    }
  });

  it('aplikasi tidak jalan: dokumen baru, viewerOpen false + hint, tanpa event openTab', async () => {
    const t = await setup();
    try {
      const sid = await t.session();
      const data = (await t.open(sid)).json().data;
      expect(data).toMatchObject({ slug: 'untitled', created: true, source: 'created', viewerOpen: false });
      expect(data.hint).toMatch(/buka.*aplikasi Lakar/);
      expect(t.openTabs()).toEqual([]);
    } finally {
      await t.app.close();
    }
  });

  it('slug eksplisit: perilaku lama + source slug; open_doc {slug} belum ada → dibuat dengan field lama', async () => {
    const t = await setup();
    try {
      const a = await t.create('Fokus Dua');
      await t.report(a, 'winA');
      const sid = await t.session();
      const data = (await t.open(sid, { slug: 'baru-sekali' })).json().data;
      expect(data).toMatchObject({ docId: expect.any(String), slug: 'baru-sekali', rev: 0, created: true, source: 'slug', viewerOpen: false });
      expect(t.openTabs()).toEqual([]);
      expect((await t.open(sid, { slug: 'Bad Slug' })).statusCode).toBe(400);
    } finally {
      await t.app.close();
    }
  });

  it('pin sesi: pindah tab tidak memindahkan execute; target menyebut dokumen terpaku; dokumen terpaku diarsip → NO_ACTIVE_DOC dengan hint open_doc', async () => {
    const t = await setup();
    try {
      const a = await t.create('Pin A');
      const b = await t.create('Pin B');
      await t.report(a, 'winA');
      const sid = await t.session();
      await t.open(sid);
      await t.report(b, 'winA'); // pengguna pindah tab
      const ex = await t.inject('POST', '/execute', { code: BOARD, description: 'tambah board ekstra mobile' }, { 'x-lakar-session': sid });
      expect(ex.statusCode, ex.body).toBe(200);
      expect(ex.json().data.target).toMatchObject({ slug: a, name: a });
      expect(ex.json().data.target.boardIds).toHaveLength(2);
      expect(t.sessions.byId(sid)!.activeSlug).toBe(a);
      expect((await t.inject('POST', `/viewer/docs/${a}/archive`)).statusCode).toBe(200);
      const gone = await t.inject('POST', '/execute', { code: BOARD, description: 'tambah board ekstra mobile' }, { 'x-lakar-session': sid });
      expect(gone.statusCode).toBe(409);
      expect(gone.json().error.code).toBe('NO_ACTIVE_DOC');
      expect(gone.json().error.hint).toContain('open_doc {}');
      // list_boards tanpa open_doc: tanpa fallback diam-diam.
      const fresh = await t.session();
      const lb = await t.inject('POST', '/boards', {}, { 'x-lakar-session': fresh });
      expect(lb.json().error).toMatchObject({ code: 'NO_ACTIVE_DOC', hint: expect.stringContaining('open_doc {}') });
    } finally {
      await t.app.close();
    }
  });

  it('rename dokumen fokus → fokus ikut slug baru; event running open_doc tanpa slug membawa slug fokus', async () => {
    const t = await setup();
    try {
      const a = await t.create('Ganti Nama');
      await t.report(a, 'winA');
      expect((await t.inject('POST', `/viewer/docs/${a}/rename`, { name: 'Nama Baru' })).statusCode).toBe(200);
      expect(t.focus.current()).toBe('nama-baru');
      const sid = await t.session();
      expect((await t.open(sid)).json().data).toMatchObject({ slug: 'nama-baru', source: 'viewer' });
      const calls = t.activity.recent().flatMap((e) => (e.type === 'call' && e.call.tool === 'open_doc' ? [e.call] : []));
      expect(calls.map((c) => [c.status, c.slug])).toEqual([
        ['running', 'nama-baru'],
        ['done', 'nama-baru'],
      ]);
    } finally {
      await t.app.close();
    }
  });
});

describe('list_documents', () => {
  it('dokumen aktif (tanpa arsip) + open/focused/active; sesi wajib; dicatat sebagai tool list_documents', async () => {
    const t = await setup();
    try {
      const a = await t.create('Daftar A');
      const b = await t.create('Daftar B');
      const c = await t.create('Daftar C');
      expect((await t.inject('POST', `/viewer/docs/${c}/archive`)).statusCode).toBe(200);
      await t.report(a, 'winA');
      await t.report(b, 'winB');
      const sid = await t.session();
      await t.inject('POST', '/docs/open', { slug: a }, { 'x-lakar-session': sid });
      const r = await t.inject('POST', '/viewer/documents', {}, { 'x-lakar-session': sid });
      expect(r.statusCode, r.body).toBe(200);
      const data = r.json().data;
      expect(data.focused).toBe(b);
      expect(data.active).toBe(a);
      const bySlug = Object.fromEntries(data.documents.map((d: any) => [d.slug, d]));
      expect(Object.keys(bySlug).sort()).toEqual([a, b].sort());
      expect(bySlug[a]).toMatchObject({ slug: a, name: a, rev: 1, open: true, focused: false, active: true });
      expect(bySlug[b]).toMatchObject({ slug: b, rev: 1, open: true, focused: true });
      expect(bySlug[b]).not.toHaveProperty('active');
      expect((await t.inject('POST', '/viewer/documents', {})).statusCode).toBe(401);
      expect((await t.inject('POST', '/viewer/documents', { x: 1 }, { 'x-lakar-session': sid })).statusCode).toBe(400);
      const done = t.activity.recent().flatMap((e) => (e.type === 'call' && e.call.tool === 'list_documents' && e.call.status === 'done' ? [e.call] : []));
      expect(done[0]).toMatchObject({ nodes: 2 });
    } finally {
      await t.app.close();
    }
  });
});

describe('get_selection memakai fokus', () => {
  it('sesi tanpa open_doc: dokumen fokus dipakai sebelum seleksi terakhir', async () => {
    const t = await setup();
    try {
      const a = await t.create('Sel Fokus A');
      const b = await t.create('Sel Fokus B');
      await t.inject('PUT', `/viewer/docs/${b}/selection`, { addresses: [] });
      const docB = JSON.parse(await readFile(join(t.dir, 'docs', `${b}.lakar.json`), 'utf8'));
      await t.inject('PUT', `/viewer/docs/${b}/selection`, { addresses: [docB.pages[0].children[0].id] });
      await t.report(a, 'winA');
      const sid = await t.session();
      const r = await t.inject('POST', '/viewer/selection', {}, { 'x-lakar-session': sid });
      expect(r.json().data).toMatchObject({ slug: a, addresses: [] });
    } finally {
      await t.app.close();
    }
  });
});

describe('umur fokus = stream jendela', () => {
  /** Buka stream `/viewer/events?origin=` dan tunggu `hello`. */
  const stream = async (port: number, origin: string) => {
    const ac = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/viewer/events?origin=${origin}`, { signal: ac.signal });
    const reader = res.body!.getReader();
    let buf = '';
    while (!buf.includes('event: hello')) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += new TextDecoder().decode(value);
    }
    return () => ac.abort();
  };
  const until = async (cond: () => boolean) => {
    for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
    expect(cond()).toBe(true);
  };

  it('stream jendela tertutup (reload/tutup) → fokusnya dibuang; open_doc {} membuat dokumen baru; jendela lain tetap', async () => {
    const t = await setup();
    try {
      await t.app.listen({ port: 0, host: '127.0.0.1' });
      const port = (t.app.server.address() as { port: number }).port;
      const a = await t.create('Umur A');
      const b = await t.create('Umur B');
      const closeA = await stream(port, 'winA');
      const closeB = await stream(port, 'winB');
      await t.report(b, 'winB');
      await t.report(a, 'winA');
      expect(t.activity.hasViewer('winA')).toBe(true);
      closeA(); // jendela A di-reload: PUT pagehide hilang, tetapi stream tertutup
      await until(() => !t.activity.hasViewer('winA'));
      expect(t.focus.current()).toBe(b);
      expect(t.focus.isOpen(a)).toBe(false);
      closeB();
      await until(() => t.focus.size === 0);
      // Origin tidak valid di query diabaikan (stream tetap dihitung sebagai viewer).
      const closeBad = await stream(port, 'bad%20origin');
      expect(t.activity.viewerCount).toBe(1);
      const data = (await t.open(await t.session())).json().data;
      expect(data).toMatchObject({ source: 'created', viewerOpen: true });
      closeBad();
    } finally {
      await t.app.close();
    }
  });

  it('openTab hanya menuju origin yang stream-nya masih terbuka; selain itu tanpa origin', async () => {
    const t = await setup();
    try {
      await t.app.listen({ port: 0, host: '127.0.0.1' });
      const port = (t.app.server.address() as { port: number }).port;
      const closeA = await stream(port, 'winA');
      const closeB = await stream(port, 'winB');
      await t.report(null, 'winA');
      expect((await t.open(await t.session(), { name: 'Satu' })).json().data.slug).toBe('satu');
      expect(t.openTabs().at(-1)).toEqual({ slug: 'satu', origin: 'winA' });
      // Jendela B melapor null (pagehide) lalu tertutup: tujuan jatuh ke jendela mana pun.
      await t.report(null, 'winB');
      closeB();
      await until(() => !t.activity.hasViewer('winB'));
      expect((await t.open(await t.session(), { name: 'Dua' })).json().data.slug).toBe('dua');
      expect(t.openTabs().at(-1)).toEqual({ slug: 'dua' });
      // Laporan null dari origin tanpa stream (jendela sudah tertutup) juga tidak dipakai.
      await t.report(null, 'winZ');
      await t.open(await t.session(), { name: 'Tiga' });
      expect(t.openTabs().at(-1)).toEqual({ slug: 'tiga' });
      closeA();
    } finally {
      await t.app.close();
    }
  });
});

describe('open_doc body (AD-4)', () => {
  it('dengan slug, kunci lain diabaikan seperti dulu (name bukan string tetap sah); tanpa slug name divalidasi', async () => {
    const t = await setup();
    try {
      const sid = await t.session();
      const r = await t.open(sid, { slug: 'a', name: 123, extra: true });
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().data).toMatchObject({ slug: 'a', source: 'slug', created: true });
      expect((await t.open(sid, { name: 123 })).statusCode).toBe(400);
      expect((await t.open(sid, { slug: 1 })).statusCode).toBe(400);
    } finally {
      await t.app.close();
    }
  });
});

describe('SSE', () => {
  it('stream viewer dihitung (viewerOpen) dan menulis event: openTab', async () => {
    const t = await setup();
    try {
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
      expect(t.activity.viewerCount).toBe(1);
      const sid = await t.session();
      const data = (await t.open(sid, { name: 'Dari Agen' })).json().data;
      expect(data).toMatchObject({ slug: 'dari-agen', source: 'created', viewerOpen: true });
      await until('event: openTab');
      const line = buf.split('\n').find((l, i, all) => all[i - 1] === 'event: openTab' && l.startsWith('data: '))!;
      expect(JSON.parse(line.slice(6))).toMatchObject({ type: 'openTab', openTab: { slug: 'dari-agen' } });
      ac.abort();
    } finally {
      await t.app.close();
    }
    expect(t.activity.viewerCount).toBe(0);
  });
});
