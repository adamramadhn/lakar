// Folder di Dashboard (aplikasi 10): /viewer/folders* + kait keanggotaan di route kelola file. Seluruh matriks I/O
// daemon spec, termasuk folders.json rusak, restart (muat ulang dari disk), dan guard Origin.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer, FOLDER_ID_PATTERN, folderName, loadConfig, newFolderId } from './index.js';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const fakeRender = {
  screenshot: async () => new Uint8Array(PNG_1x1),
  measure: async (doc: any, boardId: string) => {
    const b = doc.pages.flatMap((p: any) => p.children).find((x: any) => x.id === boardId);
    return { width: b.width, height: b.height, nodes: [], texts: [] };
  },
} as never;

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-folders-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

type State = { folders: { id: string; name: string; createdAt: string }[]; membership: Record<string, string> };

async function setup(dataDir?: string) {
  dataDir ??= await mkdtemp(join(root, 'data-'));
  const daemon = buildServer({ config: { ...baseConfig, port: 0, dataDir }, render: fakeRender });
  const { app } = daemon;
  const post = (url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url, ...(payload !== undefined ? { payload: payload as object } : {}), headers });
  const get = (url: string) => app.inject({ method: 'GET', url });
  const del = (url: string) => app.inject({ method: 'DELETE', url });
  const create = async (name: string) => {
    const r = await post('/viewer/docs', { name });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data.slug as string;
  };
  const folder = async (name: string) => {
    const r = await post('/viewer/folders', { name });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data.folder as { id: string; name: string; createdAt: string };
  };
  const state = async () => {
    const r = await get('/viewer/folders');
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data as State;
  };
  const move = (slug: string, folder: string | null) => post('/viewer/folders/move', { slug, folder });
  return { ...daemon, dataDir, post, get, del, create, folder, state, move };
}

describe('helper', () => {
  it('id folder: f + 10 karakter [a-z0-9], acak', () => {
    const ids = new Set(Array.from({ length: 50 }, newFolderId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(FOLDER_ID_PATTERN);
  });
  it('nama dipangkas, 1–60 karakter', () => {
    expect(folderName('  Client work ')).toBe('Client work');
    expect(folderName('x'.repeat(60))).toHaveLength(60);
    expect(() => folderName('   ')).toThrow();
    expect(() => folderName('x'.repeat(61))).toThrow();
  });
});

describe('buat / rename / hapus folder', () => {
  it('buat → nama dipangkas; kosong / > 60 → 400; sama beda huruf → 409', async () => {
    const t = await setup();
    const r = await t.post('/viewer/folders', { name: ' Client work ' });
    expect(r.statusCode, r.body).toBe(200);
    const { folder } = r.json().data;
    expect(folder).toEqual({ id: expect.stringMatching(FOLDER_ID_PATTERN), name: 'Client work', createdAt: expect.any(String) });
    for (const name of ['', '   ', 'x'.repeat(61)]) {
      const bad = await t.post('/viewer/folders', { name });
      expect(bad.statusCode, name).toBe(400);
      expect(bad.json().error.code).toBe('SCHEMA_INVALID');
    }
    expect((await t.post('/viewer/folders', { name: 'x', extra: 1 })).statusCode).toBe(400);
    const dup = await t.post('/viewer/folders', { name: 'CLIENT WORK' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('CONFLICT');
    expect((await t.state()).folders).toEqual([folder]);
  });

  it('daftar urut nama', async () => {
    const t = await setup();
    await t.folder('beta');
    await t.folder('Alpha');
    expect((await t.state()).folders.map((f) => f.name)).toEqual(['Alpha', 'beta']);
  });

  it('rename → nama baru, id sama; bentrok → 409; id tidak ada → 404; nama sendiri beda huruf → boleh', async () => {
    const t = await setup();
    const a = await t.folder('Alpha');
    await t.folder('Beta');
    const r = await t.post(`/viewer/folders/${a.id}/rename`, { name: 'Gamma' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data.folder).toEqual({ ...a, name: 'Gamma' });
    const clash = await t.post(`/viewer/folders/${a.id}/rename`, { name: 'beta' });
    expect(clash.statusCode).toBe(409);
    expect((await t.post(`/viewer/folders/${a.id}/rename`, { name: 'GAMMA' })).json().data.folder.name).toBe('GAMMA');
    expect((await t.post('/viewer/folders/fzzzzzzzzzz/rename', { name: 'x' })).statusCode).toBe(404);
    expect((await t.post('/viewer/folders/nope/rename', { name: 'x' })).statusCode).toBe(404);
    expect((await t.post(`/viewer/folders/${a.id}/rename`, { name: '' })).statusCode).toBe(400);
  });

  it('hapus folder berisi 2 file → folder hilang, kedua file di root, file utuh; id tidak ada → 404', async () => {
    const t = await setup();
    const f = await t.folder('F');
    await t.create('a');
    await t.create('b');
    await t.create('c');
    expect((await t.move('a', f.id)).statusCode).toBe(200);
    expect((await t.move('b', f.id)).statusCode).toBe(200);
    const r = await t.del(`/viewer/folders/${f.id}`);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toEqual({ id: f.id, deleted: true, moved: ['a', 'b'] });
    expect(await t.state()).toEqual({ folders: [], membership: {} });
    const listed = ((await t.get('/viewer/docs')).json().data.docs as { slug: string }[]).map((d) => d.slug).sort();
    expect(listed).toEqual(['a', 'b', 'c']);
    expect((await t.del(`/viewer/folders/${f.id}`)).statusCode).toBe(404);
  });
});

describe('pindah file', () => {
  it('masuk folder lalu kembali ke root; slug / folder tidak ada → 404; body salah → 400', async () => {
    const t = await setup();
    const f = await t.folder('F');
    await t.create('a');
    const r = await t.move('a', f.id);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toEqual({ slug: 'a', folder: f.id });
    expect((await t.state()).membership).toEqual({ a: f.id });
    expect((await t.move('a', null)).json().data).toEqual({ slug: 'a', folder: null });
    expect((await t.state()).membership).toEqual({});
    expect((await t.move('zz', f.id)).statusCode).toBe(404);
    expect((await t.move('a', 'fzzzzzzzzzz')).statusCode).toBe(404);
    expect((await t.move('a', 'bad')).statusCode).toBe(404);
    expect((await t.move('Bad Slug', f.id)).statusCode).toBe(400);
    expect((await t.post('/viewer/folders/move', { slug: 'a' })).statusCode).toBe(400);
  });

  it('satu slug paling banyak satu folder: pindah antar folder', async () => {
    const t = await setup();
    const f = await t.folder('F');
    const g = await t.folder('G');
    await t.create('a');
    await t.move('a', f.id);
    await t.move('a', g.id);
    expect((await t.state()).membership).toEqual({ a: g.id });
  });

  it('file di folder: /docs/open dengan slug yang sama membuka dokumen yang sama (path tidak berubah)', async () => {
    const t = await setup();
    const f = await t.folder('F');
    await t.create('a');
    await t.move('a', f.id);
    expect(existsSync(join(t.dataDir, 'docs', 'a.lakar.json'))).toBe(true);
    const s = (await t.post('/sessions', { client: 'claude-code' })).json().data.sessionId as string;
    const open = await t.post('/docs/open', { slug: 'a' }, { 'x-lakar-session': s });
    expect(open.statusCode, open.body).toBe(200);
    expect(open.json().data.rev).toBe(1);
    // Tidak ada direktori folder di disk.
    expect((await readdir(join(t.dataDir, 'docs'))).filter((n) => !n.includes('.'))).toEqual([]);
  });
});

describe('kait route kelola file', () => {
  it('rename a→b di F: b di F, a tidak ada', async () => {
    const t = await setup();
    const f = await t.folder('F');
    await t.create('a');
    await t.move('a', f.id);
    expect((await t.post('/viewer/docs/a/rename', { name: 'b' })).statusCode).toBe(200);
    expect((await t.state()).membership).toEqual({ b: f.id });
  });

  it('archive → keluar F; unarchive → root', async () => {
    const t = await setup();
    const f = await t.folder('F');
    await t.create('a');
    await t.move('a', f.id);
    expect((await t.post('/viewer/docs/a/archive')).statusCode).toBe(200);
    expect((await t.state()).membership).toEqual({});
    expect((await t.post('/viewer/docs/a/unarchive')).statusCode).toBe(200);
    expect((await t.state()).membership).toEqual({});
  });

  it('delete → keluar F; file baru dengan slug sama mulai di root', async () => {
    const t = await setup();
    const f = await t.folder('F');
    await t.create('a');
    await t.move('a', f.id);
    expect((await t.del('/viewer/docs/a')).statusCode).toBe(200);
    expect((await t.state()).membership).toEqual({});
    await t.create('a');
    expect((await t.state()).membership).toEqual({});
  });

  it('duplicate a di F → a-copy di F', async () => {
    const t = await setup();
    const f = await t.folder('F');
    await t.create('a');
    await t.move('a', f.id);
    expect((await t.post('/viewer/docs/a/duplicate')).json().data.slug).toBe('a-copy');
    expect((await t.state()).membership).toEqual({ a: f.id, 'a-copy': f.id });
  });

  it('GET hanya keanggotaan slug aktif yang ada (file dihapus dari luar disembunyikan)', async () => {
    const t = await setup();
    const f = await t.folder('F');
    await t.create('a');
    await t.create('b');
    await t.move('a', f.id);
    await t.move('b', f.id);
    await t.app.close();
    await rm(join(t.dataDir, 'docs', 'b.lakar.json'));
    const t2 = await setup(t.dataDir);
    expect((await t2.state()).membership).toEqual({ a: f.id });
  });

  it('gagal menulis keanggotaan tidak menggagalkan operasi file (dicatat log)', async () => {
    const t = await setup();
    const f = await t.folder('F');
    await t.create('a');
    await t.move('a', f.id);
    // folders.json jadi direktori → tulis atomik (rename) gagal.
    await rm(join(t.dataDir, 'folders.json'));
    await mkdir(join(t.dataDir, 'folders.json'));
    const warn = console.warn;
    const logged: string[] = [];
    console.warn = (m: string) => logged.push(m);
    try {
      expect((await t.post('/viewer/docs/a/rename', { name: 'b' })).statusCode).toBe(200);
    } finally {
      console.warn = warn;
    }
    expect(logged.some((m) => m.includes('folder'))).toBe(true);
    expect(existsSync(join(t.dataDir, 'docs', 'b.lakar.json'))).toBe(true);
  });
});

const F = 'fabcdefghij';
/** Tulis folders.json langsung (keanggotaan sisa yang tertinggal dari file yang hilang di luar aplikasi). */
async function seed(dataDir: string, membership: Record<string, string>) {
  await writeFile(join(dataDir, 'folders.json'), JSON.stringify({ version: 1, folders: [{ id: F, name: 'Old', createdAt: '2026-01-01T00:00:00.000Z' }], membership }));
}
const onDisk = async (dataDir: string) => JSON.parse(await readFile(join(dataDir, 'folders.json'), 'utf8')).membership as Record<string, string>;

describe('keanggotaan sisa', () => {
  it('New file dengan slug yang punya keanggotaan sisa → root', async () => {
    const dataDir = await mkdtemp(join(root, 'stale-'));
    await seed(dataDir, { x: F });
    const t = await setup(dataDir);
    await t.create('x');
    expect((await t.state()).membership).toEqual({});
    expect(await onDisk(dataDir)).toEqual({});
  });

  it('rename file root ke slug yang punya keanggotaan sisa → root', async () => {
    const dataDir = await mkdtemp(join(root, 'stale-'));
    await seed(dataDir, { x: F });
    const t = await setup(dataDir);
    await t.create('a');
    expect((await t.post('/viewer/docs/a/rename', { name: 'x' })).statusCode).toBe(200);
    expect((await t.state()).membership).toEqual({});
    expect(await onDisk(dataDir)).toEqual({});
  });

  it('duplicate file root yang slug salinannya punya keanggotaan sisa → root', async () => {
    const dataDir = await mkdtemp(join(root, 'stale-'));
    await seed(dataDir, { 'a-copy': F });
    const t = await setup(dataDir);
    await t.create('a');
    expect((await t.post('/viewer/docs/a/duplicate')).json().data.slug).toBe('a-copy');
    expect((await t.state()).membership).toEqual({});
    expect(await onDisk(dataDir)).toEqual({});
  });

  it('slug arsip dengan keanggotaan → unarchive ke root', async () => {
    const t = await setup();
    await t.create('a');
    expect((await t.post('/viewer/docs/a/archive')).statusCode).toBe(200);
    await t.app.close();
    await seed(t.dataDir, { a: F });
    const t2 = await setup(t.dataDir);
    expect((await t2.post('/viewer/docs/a/unarchive')).statusCode).toBe(200);
    expect((await t2.state()).membership).toEqual({});
  });

  it('kunci keanggotaan yang bukan slug valid dibuang saat dimuat', async () => {
    const dataDir = await mkdtemp(join(root, 'stale-'));
    await seed(dataDir, { 'Bad Key': F, ok: F });
    const t = await setup(dataDir);
    await t.create('ok');
    await t.create('b');
    await t.move('b', F);
    expect(await onDisk(dataDir)).toEqual({ b: F });
  });

  it('slug `constructor` di root dan di folder berperilaku normal', async () => {
    const t = await setup();
    const f = await t.folder('F');
    await t.create('constructor');
    expect((await t.state()).membership).toEqual({});
    expect((await t.move('constructor', null)).statusCode).toBe(200);
    expect((await t.move('constructor', f.id)).json().data).toEqual({ slug: 'constructor', folder: f.id });
    expect((await t.state()).membership).toEqual({ constructor: f.id });
    expect((await t.post('/viewer/docs/constructor/duplicate')).json().data.slug).toBe('constructor-copy');
    expect((await t.state()).membership).toEqual({ constructor: f.id, 'constructor-copy': f.id });
    await t.move('constructor', null);
    expect((await t.state()).membership).toEqual({ 'constructor-copy': f.id });
  });
});

describe('persistensi', () => {
  it('daemon dimulai ulang → folder dan keanggotaan yang sama kembali', async () => {
    const t = await setup();
    const f = await t.folder('Client work');
    await t.create('a');
    await t.move('a', f.id);
    const before = await t.state();
    await t.app.close();
    const t2 = await setup(t.dataDir);
    try {
      expect(await t2.state()).toEqual(before);
      expect(before).toEqual({ folders: [f], membership: { a: f.id } });
    } finally {
      await t2.app.close();
    }
  });

  it('folders.json bukan JSON → daftar kosong, file lama disimpan .corrupt-*, dicatat log; tulis berikut berhasil', async () => {
    const dataDir = await mkdtemp(join(root, 'corrupt-'));
    await writeFile(join(dataDir, 'folders.json'), '{not json');
    const warn = console.warn;
    const logged: string[] = [];
    console.warn = (m: string) => logged.push(m);
    const t = await setup(dataDir);
    try {
      expect(await t.state()).toEqual({ folders: [], membership: {} });
    } finally {
      console.warn = warn;
    }
    const aside = (await readdir(dataDir)).filter((n) => n.startsWith('folders.json.corrupt-'));
    expect(aside).toHaveLength(1);
    expect(await readFile(join(dataDir, aside[0]!), 'utf8')).toBe('{not json');
    expect(logged.some((m) => m.includes('rusak'))).toBe(true);
    await t.folder('Fresh');
    expect(JSON.parse(await readFile(join(dataDir, 'folders.json'), 'utf8')).folders.map((f: { name: string }) => f.name)).toEqual(['Fresh']);
  });

  it('bentuk salah (JSON valid) juga dianggap rusak', async () => {
    const dataDir = await mkdtemp(join(root, 'shape-'));
    await writeFile(join(dataDir, 'folders.json'), JSON.stringify({ folders: 'x' }));
    const warn = console.warn;
    console.warn = () => {};
    try {
      const t = await setup(dataDir);
      expect(await t.state()).toEqual({ folders: [], membership: {} });
    } finally {
      console.warn = warn;
    }
  });
});

describe('Origin', () => {
  it('POST/DELETE folder dengan Origin asing → 403', async () => {
    const dataDir = await mkdtemp(join(root, 'origin-'));
    const { app } = buildServer({ config: { ...baseConfig, port: 7466, dataDir }, render: fakeRender });
    try {
      const evil = { origin: 'https://evil.example' };
      expect((await app.inject({ method: 'POST', url: '/viewer/folders', payload: { name: 'x' }, headers: evil })).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url: '/viewer/folders/move', payload: { slug: 'a', folder: null }, headers: evil })).statusCode).toBe(403);
      expect((await app.inject({ method: 'DELETE', url: '/viewer/folders/fzzzzzzzzzz', headers: evil })).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url: '/viewer/folders', payload: { name: 'x' }, headers: { origin: 'http://127.0.0.1:7466' } })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
