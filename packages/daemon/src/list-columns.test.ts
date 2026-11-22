// Kolom List view Dashboard (aplikasi 11): field opsional createdAt/lastClient/check di GET /viewer/docs dan
// CheckLedger. Matriks I/O spec-app-11; RenderPort palsu (tanpa temuan check).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer, loadConfig } from './index.js';
import { CheckLedger } from './checks.js';
import { historyMeta } from './viewer.js';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const fakeRender = {
  screenshot: async () => new Uint8Array(PNG_1x1),
  measure: async (doc: any, boardId: string) => {
    const b = doc.pages.flatMap((p: any) => p.children).find((x: any) => x.id === boardId);
    return { width: b.width, height: b.height, nodes: [], texts: [] };
  },
} as never;

type Summary = { slug: string; rev: number; createdAt?: string; lastClient?: string; check?: { error: number; warning: number } };

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-list-columns-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function server(dataDir: string) {
  const { app } = buildServer({ config: { ...baseConfig, port: 0, dataDir }, render: fakeRender });
  const post = (url: string, payload?: unknown, session?: string) =>
    app.inject({ method: 'POST', url, ...(payload !== undefined ? { payload: payload as object } : {}), headers: session ? { 'x-lakar-session': session } : {} });
  const summary = async (slug: string) => ((await app.inject({ method: 'GET', url: '/viewer/docs' })).json().data.docs as Summary[]).find((d) => d.slug === slug);
  const agent = async (slug: string, client = 'claude-code') => {
    const s = (await post('/sessions', { client })).json().data.sessionId as string;
    expect((await post('/docs/open', { slug }, s)).statusCode).toBe(200);
    return s;
  };
  let n = 0;
  const addBoard = async (s: string) => {
    n++;
    const r = await post('/execute', { code: `add(null,{type:'board',name:'Extra ${n}',x:${n * 500},y:0,width:390,height:844,screen:'mobile'})`, description: `tambah board ekstra nomor ${n}` }, s);
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data.rev as number;
  };
  /** layout_check semua board dokumen aktif sesi; ringkasan {error, warning}. */
  const layoutCheck = async (s: string) => {
    const r = await post('/layout-check', {}, s);
    expect(r.statusCode, r.body).toBe(200);
    const { error, warning } = r.json().data.summary as { error: number; warning: number };
    return { error, warning };
  };
  return { app, post, summary, agent, addBoard, layoutCheck };
}

describe('GET /viewer/docs: createdAt, lastClient, check (aplikasi 11)', () => {
  it('file baru dari aplikasi → createdAt + lastClient lakar-viewer, tanpa check', async () => {
    const dataDir = await mkdtemp(join(root, 'data-'));
    const t = server(dataDir);
    try {
      const before = Date.now();
      expect((await t.post('/viewer/docs', { name: 'Fresh', board: { preset: 'mobile' } })).statusCode).toBe(200);
      const d = await t.summary('fresh');
      expect(d).toMatchObject({ slug: 'fresh', rev: 1, lastClient: 'lakar-viewer' });
      expect(Date.parse(d!.createdAt!)).toBeGreaterThanOrEqual(before - 1000);
      expect(d).not.toHaveProperty('check');
    } finally {
      await t.app.close();
    }
  });

  it('execute agen → lastClient + client di riwayat; check hanya bila semua board tercakup; restore → tanpa check', async () => {
    const dataDir = await mkdtemp(join(root, 'data-'));
    const t = server(dataDir);
    try {
      await t.post('/viewer/docs', { name: 'Two', board: { preset: 'mobile' } });
      const created = (await t.summary('two'))!.createdAt;
      const s = await t.agent('two');
      await t.addBoard(s);
      // Board pertama belum pernah dicek → tidak diketahui.
      let d = await t.summary('two');
      expect(d).toMatchObject({ rev: 2, lastClient: 'claude-code', createdAt: created });
      expect(d).not.toHaveProperty('check');
      const hist = (await readFile(join(dataDir, 'docs', 'two.history.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
      expect(hist.at(-1)).toMatchObject({ rev: 2, client: 'claude-code' });
      expect(hist[0]).not.toHaveProperty('client');

      const full = await t.layoutCheck(s);
      expect((await t.summary('two'))!.check).toEqual(full);
      // Execute berikutnya menyentuh board baru saja: hasil board lain dari rev dasar tetap dipakai, dan jumlahnya
      // sama dengan layout_check penuh pada rev itu.
      await t.addBoard(s);
      const merged = (await t.summary('two'))!.check;
      expect(merged).toEqual({ error: expect.any(Number), warning: expect.any(Number) });
      expect(merged).toEqual(await t.layoutCheck(s));

      // Tulis tanpa check (Restore dari aplikasi) → rev naik, check tidak diketahui; penulis = aplikasi.
      expect((await t.post('/viewer/docs/two/restore', { rev: 2 })).statusCode).toBe(200);
      d = await t.summary('two');
      expect(d).toMatchObject({ rev: 4, lastClient: 'lakar-viewer' });
      expect(d).not.toHaveProperty('check');
      // Execute sesudahnya mulai catatan baru (rev dasar tidak cocok): board lama tidak ikut → tetap tidak diketahui.
      await t.addBoard(s);
      expect(await t.summary('two')).not.toHaveProperty('check');
    } finally {
      await t.app.close();
    }
  });

  it('rename mempertahankan check (kunci id dokumen); restart → lastClient dari riwayat, check hilang', async () => {
    const dataDir = await mkdtemp(join(root, 'data-'));
    const t = server(dataDir);
    try {
      await t.post('/viewer/docs', { name: 'Old', board: { preset: 'mobile' } });
      const s = await t.agent('old', 'codex-cli');
      await t.addBoard(s);
      const check = await t.layoutCheck(s);
      expect((await t.post('/viewer/docs/old/rename', { name: 'New' })).statusCode).toBe(200);
      expect(await t.summary('new')).toMatchObject({ lastClient: 'codex-cli', check });
    } finally {
      await t.app.close();
    }
    const again = server(dataDir);
    try {
      const d = await again.summary('new');
      expect(d).toMatchObject({ rev: 2, lastClient: 'codex-cli' });
      expect(d!.createdAt).toEqual(expect.any(String));
      expect(d).not.toHaveProperty('check');
      const entries = (await again.app.inject({ method: 'GET', url: '/viewer/docs/new/history' })).json().data.entries;
      expect(entries[0]).toMatchObject({ rev: 2, client: 'codex-cli' });
    } finally {
      await again.app.close();
    }
  });
});

describe('historyMeta', () => {
  it('riwayat kosong → {}; entri lama tanpa client dari sesi hilang → tanpa lastClient', () => {
    expect(historyMeta([])).toEqual({});
    expect(historyMeta([{ rev: 1, sessionId: 'gone-session', description: 'x', opsSummary: '', at: '2026-01-01T00:00:00.000Z' }])).toEqual({ createdAt: '2026-01-01T00:00:00.000Z' });
    expect(
      historyMeta([
        { rev: 0, sessionId: 'lakar-viewer', description: 'Duplicated', opsSummary: '', at: '2026-01-01T00:00:00.000Z' },
        { rev: 1, sessionId: 'abc', description: 'y', opsSummary: 'add×1', at: '2026-01-02T00:00:00.000Z', client: 'claude-code' },
      ]),
    ).toEqual({ createdAt: '2026-01-01T00:00:00.000Z', lastClient: 'claude-code' });
  });
});

describe('CheckLedger', () => {
  const doc = (rev: number) => ({ id: 'Dddddddd', rev });
  it('menjumlah per board; board tanpa hasil atau rev berbeda → undefined', () => {
    const l = new CheckLedger();
    expect(l.forDoc(doc(1), ['A'])).toBeUndefined();
    l.record('Dddddddd', 1, 1, [
      { id: 'A', summary: { error: 1, warning: 2 } },
      { id: 'B', summary: { error: 0, warning: 1 } },
    ]);
    expect(l.forDoc(doc(1), ['A', 'B'])).toEqual({ error: 1, warning: 3 });
    expect(l.forDoc(doc(1), ['A', 'B', 'C'])).toBeUndefined();
    expect(l.forDoc(doc(2), ['A', 'B'])).toBeUndefined();
    expect(l.forDoc(doc(1), [])).toBeUndefined();
  });
  it('rev dasar cocok → gabung (board tersentuh ditimpa); tidak cocok → mulai baru', () => {
    const l = new CheckLedger();
    l.record('Dddddddd', 1, 1, [
      { id: 'A', summary: { error: 1, warning: 0 } },
      { id: 'B', summary: { error: 0, warning: 0 } },
    ]);
    l.record('Dddddddd', 1, 2, [{ id: 'A', summary: { error: 0, warning: 0 } }]);
    expect(l.forDoc(doc(2), ['A', 'B'])).toEqual({ error: 0, warning: 0 });
    l.record('Dddddddd', 3, 4, [{ id: 'B', summary: { error: 2, warning: 0 } }]);
    expect(l.forDoc(doc(4), ['A', 'B'])).toBeUndefined();
    expect(l.forDoc(doc(4), ['B'])).toEqual({ error: 2, warning: 0 });
  });
});
