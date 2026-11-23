// History Restore/Compare (aplikasi 3): snapshot per rev, GET revs/:rev, screenshot snapshot, Restore, dan
// snapshot yang ikut operasi kelola file. Seluruh matriks I/O spec; RenderPort palsu.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDocument } from '@lakar/core';
import type { LakarDocument } from '@lakar/schema';
import { buildServer, loadConfig } from './index.js';
import type { ActivityEvent } from './events.js';
import { DocStore, SNAPSHOT_KEEP } from './store.js';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-history-restore-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function setup(opts: { measureDelayMs?: number } = {}) {
  const dataDir = await mkdtemp(join(root, 'data-'));
  const shots: { boardId: string; boards: number }[] = [];
  const render = {
    screenshot: async (doc: any, boardId: string) => {
      shots.push({ boardId, boards: doc.pages.flatMap((p: any) => p.children).length });
      return new Uint8Array(PNG_1x1);
    },
    measure: async (doc: any, boardId: string) => {
      if (opts.measureDelayMs) await new Promise((r) => setTimeout(r, opts.measureDelayMs));
      const b = doc.pages.flatMap((p: any) => p.children).find((x: any) => x.id === boardId);
      return { width: b.width, height: b.height, nodes: [], texts: [] };
    },
  } as never;
  const daemon = buildServer({ config: { ...baseConfig, port: 0, dataDir }, render });
  const { app } = daemon;
  const docsDir = join(dataDir, 'docs');
  const post = (url: string, payload?: unknown, session?: string) =>
    app.inject({ method: 'POST', url, ...(payload !== undefined ? { payload: payload as object } : {}), headers: session ? { 'x-lakar-session': session } : {} });
  const get = (url: string) => app.inject({ method: 'GET', url });
  const del = (url: string) => app.inject({ method: 'DELETE', url });
  /** Dokumen baru `name` (rev 1, satu board) + sesi agen yang membukanya. */
  const createOpen = async (name: string) => {
    const c = await post('/viewer/docs', { name, board: { preset: 'mobile' } });
    expect(c.statusCode, c.body).toBe(200);
    const slug = c.json().data.slug as string;
    const s = (await post('/sessions', { client: 'claude-code' })).json().data.sessionId as string;
    expect((await post('/docs/open', { slug }, s)).statusCode).toBe(200);
    return { slug, s };
  };
  let n = 0;
  /** Satu execute yang menambah satu board; mengembalikan rev baru. */
  const addBoard = async (s: string) => {
    n++;
    const r = await post('/execute', { code: `add(null,{type:'board',name:'Extra ${n}',x:${n * 500},y:0,width:390,height:844,screen:'mobile'})`, description: `tambah board ekstra nomor ${n}` }, s);
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data.rev as number;
  };
  const snapDir = (slug: string, archived = false) => join(archived ? join(docsDir, 'archive') : docsDir, '.snapshots', slug);
  const snapFiles = async (slug: string, archived = false) => (existsSync(snapDir(slug, archived)) ? (await readdir(snapDir(slug, archived))).sort() : []);
  const boardCount = (doc: LakarDocument) => doc.pages.flatMap((p) => p.children).length;
  const events: ActivityEvent[] = [];
  daemon.activity.subscribe((e) => events.push(e));
  return { ...daemon, dataDir, docsDir, post, get, del, createOpen, addBoard, snapDir, snapFiles, boardCount, shots, events };
}

describe('snapshot saat commit', () => {
  it('execute r5 sukses → r5.lakar.json ada berisi dokumen r5; respons execute tidak berubah', async () => {
    const t = await setup();
    try {
      const { slug, s } = await t.createOpen('Snap');
      for (let i = 0; i < 4; i++) await t.addBoard(s);
      expect(await t.snapFiles(slug)).toEqual(['r1.lakar.json', 'r2.lakar.json', 'r3.lakar.json', 'r4.lakar.json', 'r5.lakar.json']);
      const r5 = (await t.get(`/viewer/docs/${slug}/revs/5`)).json().data.doc as LakarDocument;
      expect(r5.rev).toBe(5);
      expect(t.boardCount(r5)).toBe(5);
      const r2 = (await t.get(`/viewer/docs/${slug}/revs/2`)).json().data.doc as LakarDocument;
      expect(r2.rev).toBe(2);
      expect(t.boardCount(r2)).toBe(2);
      // Respons execute: kunci lama saja (tidak ada field snapshot baru).
      const ex = await t.post('/execute', { code: `add(null,{type:'board',name:'Z',x:9000,y:0,width:10,height:10,screen:'mobile'})`, description: 'tambah board kecil terakhir' }, s);
      expect(Object.keys(ex.json().data).sort()).toEqual(['bounds', 'check', 'created', 'docId', 'rev', 'target', 'value']);
    } finally {
      await t.app.close();
    }
  });

  it('snapshot gagal ditulis → dicatat di log, execute tetap ok dan dokumen tersimpan', async () => {
    const t = await setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { slug, s } = await t.createOpen('Broken Snap');
      // Folder snapshot diganti file biasa: mkdir/tulis snapshot gagal.
      await rm(t.snapDir(slug), { recursive: true, force: true });
      await writeFile(t.snapDir(slug), 'bukan folder');
      const rev = await t.addBoard(s);
      expect(rev).toBe(2);
      expect(warn.mock.calls.some((c) => String(c[0]).includes(`snapshot ${slug} r2 gagal ditulis`))).toBe(true);
      const doc = (await t.get(`/viewer/docs/${slug}`)).json().data.doc as LakarDocument;
      expect(doc.rev).toBe(2);
      // History tetap terbaca; tanpa snapshot.
      const h = (await t.get(`/viewer/docs/${slug}/history`)).json().data.entries;
      expect(h[0]).toMatchObject({ rev: 2 });
      expect(h[0].snapshot).toBeUndefined();
    } finally {
      warn.mockRestore();
      await t.app.close();
    }
  });

  it(`retensi: ${SNAPSHOT_KEEP + 1} commit → r1 terhapus, r2..r${SNAPSHOT_KEEP + 1} ada`, async () => {
    const dataDir = await mkdtemp(join(root, 'keep-'));
    const store = new DocStore(dataDir);
    let doc = createDocument();
    for (let rev = 1; rev <= SNAPSHOT_KEEP + 1; rev++) {
      doc = { ...doc, rev };
      await store.commit('k', doc, { rev, sessionId: 'x', description: `rev ${rev}`, opsSummary: 'set×1', at: new Date().toISOString() });
    }
    const revs = [...(await store.snapshotRevs('k'))].sort((a, b) => a - b);
    expect(revs).toHaveLength(SNAPSHOT_KEEP);
    expect(revs[0]).toBe(2);
    expect(revs.at(-1)).toBe(SNAPSHOT_KEEP + 1);
    expect(existsSync(store.snapshotPath('k', 1))).toBe(false);
  }, 120_000);
});

describe('GET /viewer/docs/:slug/revs/:rev dan history.snapshot', () => {
  it('history menandai entri bersnapshot; rev tanpa snapshot → 404 dengan hint; rev/slug tidak valid → 400; dokumen tidak ada → 404', async () => {
    const t = await setup();
    try {
      const { slug, s } = await t.createOpen('Revs');
      await t.addBoard(s);
      await t.addBoard(s);
      await rm(join(t.snapDir(slug), 'r2.lakar.json'));
      const h = (await t.get(`/viewer/docs/${slug}/history`)).json().data.entries as { rev: number; snapshot?: boolean }[];
      expect(h.map((e) => [e.rev, e.snapshot ?? false])).toEqual([
        [3, true],
        [2, false],
        [1, true],
      ]);
      const miss = await t.get(`/viewer/docs/${slug}/revs/2`);
      expect(miss.statusCode).toBe(404);
      expect(miss.json().error).toMatchObject({ code: 'NOT_FOUND', hint: 'versi ini dibuat sebelum snapshot tersedia' });
      expect((await t.get(`/viewer/docs/${slug}/revs/99`)).statusCode).toBe(404);
      expect((await t.get(`/viewer/docs/${slug}/revs/abc`)).json().error.code).toBe('SCHEMA_INVALID');
      expect((await t.get(`/viewer/docs/${slug}/revs/-1`)).json().error.code).toBe('SCHEMA_INVALID');
      expect((await t.get(`/viewer/docs/BAD/revs/1`)).json().error.code).toBe('SCHEMA_INVALID');
      expect((await t.get(`/viewer/docs/nope/revs/1`)).json().error.code).toBe('NOT_FOUND');
    } finally {
      await t.app.close();
    }
  });

  it('rev terkini tanpa snapshot tetap terbaca dari dokumen kini; snapshot milik dokumen lain (id beda) diabaikan', async () => {
    const t = await setup();
    try {
      const { slug, s } = await t.createOpen('Current');
      await t.addBoard(s);
      await rm(t.snapDir(slug), { recursive: true });
      expect((await t.get(`/viewer/docs/${slug}/revs/2`)).json().data.doc.rev).toBe(2);
      // Snapshot asing (id lain) di rev 1.
      const foreign = { ...createDocument(), rev: 1 };
      await mkdir(t.snapDir(slug), { recursive: true });
      await writeFile(join(t.snapDir(slug), 'r1.lakar.json'), JSON.stringify(foreign));
      expect((await t.get(`/viewer/docs/${slug}/revs/1`)).statusCode).toBe(404);
    } finally {
      await t.app.close();
    }
  });

  it('POST revs/:rev/screenshot → PNG base64 berbentuk /screenshot, dirender dari snapshot tanpa mengubah dokumen', async () => {
    const t = await setup();
    try {
      const { slug, s } = await t.createOpen('Shot');
      await t.addBoard(s);
      const r1 = (await t.get(`/viewer/docs/${slug}/revs/1`)).json().data.doc as LakarDocument;
      const boardId = r1.pages[0]!.children[0]!.id;
      t.shots.length = 0;
      const r = await t.post(`/viewer/docs/${slug}/revs/1/screenshot`, { boardId });
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().data).toEqual({ boardId, width: 375, height: 812, mimeType: 'image/png', png: PNG_1x1.toString('base64') });
      expect(t.shots).toEqual([{ boardId, boards: 1 }]);
      expect((await t.get(`/viewer/docs/${slug}`)).json().data.doc.rev).toBe(2);
      expect((await t.post(`/viewer/docs/${slug}/revs/1/screenshot`, { boardId: 'Nope0000' })).statusCode).toBe(404);
      expect((await t.post(`/viewer/docs/${slug}/revs/1/screenshot`, {})).json().error.code).toBe('SCHEMA_INVALID');
    } finally {
      await t.app.close();
    }
  });
});

describe('POST /viewer/docs/:slug/restore', () => {
  it('{rev:3}, latest r7 → r8 = isi r3; history "Restored r3" atas nama viewer; event activity running → done; agen melihat r8', async () => {
    const t = await setup();
    try {
      const { slug, s } = await t.createOpen('Restore Me');
      for (let i = 0; i < 6; i++) await t.addBoard(s);
      const r3 = (await t.get(`/viewer/docs/${slug}/revs/3`)).json().data.doc as LakarDocument;
      t.events.length = 0;
      const r = await t.post(`/viewer/docs/${slug}/restore`, { rev: 3 });
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().data).toEqual({ slug, rev: 8, restoredFrom: 3 });
      const doc = (await t.get(`/viewer/docs/${slug}`)).json().data.doc as LakarDocument;
      expect(doc.rev).toBe(8);
      expect(doc.id).toBe(r3.id);
      expect(doc.pages).toEqual(r3.pages);
      const h = (await t.get(`/viewer/docs/${slug}/history`)).json().data.entries;
      expect(h[0]).toMatchObject({ rev: 8, description: 'Restored r3', client: 'lakar-viewer', snapshot: true });
      expect(h).toHaveLength(8);
      const calls = t.events.filter((e) => e.type === 'call').map((e) => (e as Extract<ActivityEvent, { type: 'call' }>).call);
      expect(calls.map((c) => [c.tool, c.status])).toEqual([
        ['restore', 'running'],
        ['restore', 'done'],
      ]);
      expect(calls[1]).toMatchObject({ slug, rev: 8, description: 'Restored r3', client: 'lakar-viewer' });
      // Agen melanjutkan dari isi yang dipulihkan.
      expect(await t.addBoard(s)).toBe(9);
      const after = (await t.get(`/viewer/docs/${slug}`)).json().data.doc as LakarDocument;
      expect(t.boardCount(after)).toBe(t.boardCount(r3) + 1);
    } finally {
      await t.app.close();
    }
  });

  it('rev tanpa snapshot → 404, tidak ada commit; event error; body/slug salah → 400; dokumen tidak ada → 404', async () => {
    const t = await setup();
    try {
      const { slug, s } = await t.createOpen('No Snap');
      await t.addBoard(s);
      await t.addBoard(s);
      await rm(join(t.snapDir(slug), 'r2.lakar.json'));
      t.events.length = 0;
      const r = await t.post(`/viewer/docs/${slug}/restore`, { rev: 2 });
      expect(r.statusCode).toBe(404);
      expect(r.json().error).toMatchObject({ code: 'NOT_FOUND', hint: 'versi ini dibuat sebelum snapshot tersedia' });
      expect((await t.get(`/viewer/docs/${slug}`)).json().data.doc.rev).toBe(3);
      expect(t.events.map((e) => (e.type === 'call' ? e.call.status : e.type))).toEqual(['running', 'error']);
      expect((await t.post(`/viewer/docs/${slug}/restore`, { rev: -1 })).json().error.code).toBe('SCHEMA_INVALID');
      expect((await t.post(`/viewer/docs/${slug}/restore`, { rev: 1, x: 1 })).json().error.code).toBe('SCHEMA_INVALID');
      expect((await t.post(`/viewer/docs/BAD/restore`, { rev: 1 })).json().error.code).toBe('SCHEMA_INVALID');
      expect((await t.post(`/viewer/docs/nope/restore`, { rev: 1 })).statusCode).toBe(404);
    } finally {
      await t.app.close();
    }
  });

  it('baseRev usang → 409 CONFLICT tanpa commit; rev terkini → 409; baseRev cocok → sukses', async () => {
    const t = await setup();
    try {
      const { slug, s } = await t.createOpen('Stale');
      await t.addBoard(s); // r2
      await t.addBoard(s); // r3
      const stale = await t.post(`/viewer/docs/${slug}/restore`, { rev: 1, baseRev: 2 });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().error.code).toBe('CONFLICT');
      expect(stale.json().error.hint).toMatch(/lebih baru/);
      const current = await t.post(`/viewer/docs/${slug}/restore`, { rev: 3 });
      expect(current.statusCode).toBe(409);
      expect(current.json().error.code).toBe('CONFLICT');
      expect((await t.get(`/viewer/docs/${slug}`)).json().data.doc.rev).toBe(3);
      const ok = await t.post(`/viewer/docs/${slug}/restore`, { rev: 1, baseRev: 3 });
      expect(ok.statusCode, ok.body).toBe(200);
      expect(ok.json().data.rev).toBe(4);
    } finally {
      await t.app.close();
    }
  });

  it('restore saat execute agen berjalan → diserialkan oleh kunci dokumen (rev berurutan, tidak ada yang hilang)', async () => {
    const t = await setup({ measureDelayMs: 150 });
    try {
      const { slug, s } = await t.createOpen('Busy');
      await t.addBoard(s); // r2
      const exec = t.post('/execute', { code: `add(null,{type:'board',name:'Late',x:9000,y:0,width:10,height:10,screen:'mobile'})`, description: 'tambah board lambat sekali' }, s);
      await new Promise((r) => setTimeout(r, 30));
      const restore = t.post(`/viewer/docs/${slug}/restore`, { rev: 1 });
      const [e, r] = await Promise.all([exec, restore]);
      expect(e.json().data.rev).toBe(3);
      expect(r.json().data.rev).toBe(4);
      const doc = (await t.get(`/viewer/docs/${slug}`)).json().data.doc as LakarDocument;
      expect(doc.rev).toBe(4);
      expect(t.boardCount(doc)).toBe(1);
      const h = (await t.get(`/viewer/docs/${slug}/history`)).json().data.entries;
      expect(h.map((x: { rev: number }) => x.rev)).toEqual([4, 3, 2, 1]);
      expect(h[0].description).toBe('Restored r1');
    } finally {
      await t.app.close();
    }
  });

  it('dokumen yang belum dibuka siapa pun (tidak di memori) tetap bisa dipulihkan', async () => {
    const t = await setup();
    try {
      const { slug, s } = await t.createOpen('Cold');
      await t.addBoard(s);
      await t.app.close();
      const again = buildServer({ config: { ...baseConfig, port: 0, dataDir: t.dataDir }, render: { screenshot: async () => new Uint8Array(PNG_1x1), measure: async () => ({ width: 1, height: 1, nodes: [], texts: [] }) } as never });
      try {
        const r = await again.app.inject({ method: 'POST', url: `/viewer/docs/${slug}/restore`, payload: { rev: 1 } });
        expect(r.statusCode, r.body).toBe(200);
        expect(r.json().data.rev).toBe(3);
      } finally {
        await again.app.close();
      }
    } finally {
      await t.app.close().catch(() => {});
    }
  });
});

describe('snapshot ikut kelola file', () => {
  it('rename memindahkan folder; duplicate tidak menyalin; archive/unarchive memindahkan ke archive/.snapshots; delete menghapus', async () => {
    const t = await setup();
    try {
      const { slug, s } = await t.createOpen('Movable');
      await t.addBoard(s);
      expect(await t.snapFiles(slug)).toEqual(['r1.lakar.json', 'r2.lakar.json']);

      const ren = await t.post(`/viewer/docs/${slug}/rename`, { name: 'Moved' });
      expect(ren.statusCode, ren.body).toBe(200);
      expect(existsSync(t.snapDir(slug))).toBe(false);
      expect(await t.snapFiles('moved')).toEqual(['r1.lakar.json', 'r2.lakar.json']);
      expect((await t.get('/viewer/docs/moved/revs/1')).statusCode).toBe(200);

      const dup = (await t.post('/viewer/docs/moved/duplicate')).json().data.slug as string;
      // Salinan hanya punya snapshot rev 0 miliknya sendiri, bukan salinan riwayat sumber.
      expect(await t.snapFiles(dup)).toEqual(['r0.lakar.json']);
      expect((await t.get(`/viewer/docs/${dup}/revs/1`)).statusCode).toBe(404);

      expect((await t.post('/viewer/docs/moved/archive')).statusCode).toBe(200);
      expect(existsSync(t.snapDir('moved'))).toBe(false);
      expect(await t.snapFiles('moved', true)).toEqual(['r1.lakar.json', 'r2.lakar.json']);

      expect((await t.post('/viewer/docs/moved/unarchive')).statusCode).toBe(200);
      expect(existsSync(t.snapDir('moved', true))).toBe(false);
      expect(await t.snapFiles('moved')).toEqual(['r1.lakar.json', 'r2.lakar.json']);

      expect((await t.del('/viewer/docs/moved')).statusCode).toBe(200);
      expect(existsSync(t.snapDir('moved'))).toBe(false);

      // Hapus dari arsip juga menghapus snapshot arsip.
      expect((await t.post(`/viewer/docs/${dup}/archive`)).statusCode).toBe(200);
      expect(await t.snapFiles(dup, true)).toEqual(['r0.lakar.json']);
      expect((await t.del(`/viewer/docs/${dup}?archived=true`)).statusCode).toBe(200);
      expect(existsSync(t.snapDir(dup, true))).toBe(false);

      // Slug dipakai ulang: snapshot lama tidak bocor ke dokumen baru.
      const again = (await t.post('/viewer/docs', { name: 'Moved' })).json().data.slug as string;
      expect(again).toBe('moved');
      expect(await t.snapFiles('moved')).toEqual(['r1.lakar.json']);
    } finally {
      await t.app.close();
    }
  });
});
