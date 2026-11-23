// Undo/redo agen (spec-agent-undo): POST /viewer/undo|redo membatalkan/mengulang langkah execute/paste sesi itu sendiri
// sebagai rev baru ("Undo: …"), dan menolak (CONFLICT) bila ada rev lain sesudah langkah sesi itu: edit pengguna,
// agen lain, atau restore. Tumpukan per sesi per dokumen, hanya di memori.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AGENT_UNDO_MAX, AgentSteps } from './agent-undo.js';
import { buildServer, loadConfig } from './index.js';
import type { Session } from './sessions.js';

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
  root = await mkdtemp(join(tmpdir(), 'lakar-agent-undo-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function server(dataDir?: string) {
  const dir = dataDir ?? (await mkdtemp(join(root, 'data-')));
  const daemon = buildServer({ config: { ...baseConfig, port: 0, dataDir: dir }, render: fakeRender });
  const { app } = daemon;
  const post = (url: string, payload: unknown, headers: Record<string, string> = {}) => app.inject({ method: 'POST', url, payload: payload as object, headers });
  const doc = async (slug: string) => (await app.inject({ method: 'GET', url: `/viewer/docs/${slug}` })).json().data.doc as any;
  const boards = async (slug: string) => ((await doc(slug)).pages[0].children as { id: string; name: string }[]).map((b) => b.name);
  const history = async (slug: string) => (await app.inject({ method: 'GET', url: `/viewer/docs/${slug}/history` })).json().data.entries as Record<string, any>[];
  const create = async (name: string) => expect((await post('/viewer/docs', { name, board: { preset: 'mobile' } })).statusCode).toBe(200);
  const session = async (slug: string, agent = 'claude-code') => {
    const s = (await post('/sessions', { client: 'lakar-mcp' }, { 'x-lakar-agent': agent })).json().data.sessionId as string;
    await open(s, slug);
    return s;
  };
  const open = async (s: string, slug: string) => expect((await post('/docs/open', { slug }, { 'x-lakar-session': s })).statusCode).toBe(200);
  let n = 0;
  /** Execute agen: board baru "Extra N"; mengembalikan rev. */
  const execute = async (s: string) => {
    n++;
    const r = await post('/execute', { code: `add(null,{type:'board',name:'Extra ${n}',x:${n * 500},y:0,width:390,height:844,screen:'mobile'})`, description: `tambah board ekstra nomor ${n}` }, { 'x-lakar-session': s });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data.rev as number;
  };
  /** Edit pengguna lewat route ops viewer: ganti nama board pertama. */
  const userEdit = async (slug: string, name: string) => {
    const id = (await doc(slug)).pages[0].children[0].id as string;
    const r = await post(`/viewer/docs/${slug}/ops`, { ops: [{ op: 'update', id, patch: { name } }] });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data as { rev: number; inverse: unknown[] };
  };
  const step = (dir: 'undo' | 'redo', s: string, body: unknown = {}) => post(`/viewer/${dir}`, body, { 'x-lakar-session': s });
  return { daemon, app, dir, post, doc, boards, history, create, session, open, execute, userEdit, step };
}

describe('undo/redo agen', () => {
  it('undo membatalkan execute terakhir sebagai rev baru; redo mengulangnya; riwayat berlabel; Activity mencatat', async () => {
    const t = await server();
    try {
      await t.create('Doc');
      const s = await t.session('doc');
      await t.execute(s);
      const r2 = await t.execute(s);
      expect(await t.boards('doc')).toEqual(['Mobile', 'Extra 1', 'Extra 2']);

      const u = await t.step('undo', s);
      expect(u.statusCode, u.body).toBe(200);
      expect(u.json().data).toMatchObject({ slug: 'doc', rev: r2 + 1, undone: [{ description: 'tambah board ekstra nomor 2', rev: r2 + 1 }], available: { undo: 1, redo: 1 } });
      expect(Array.isArray(u.json().data.boards)).toBe(true);
      expect(await t.boards('doc')).toEqual(['Mobile', 'Extra 1']);
      expect((await t.history('doc'))[0]).toMatchObject({ rev: r2 + 1, description: 'Undo: tambah board ekstra nomor 2', client: 'lakar-mcp', agent: 'claude-code' });

      const r = await t.step('redo', s);
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().data).toMatchObject({ rev: r2 + 2, redone: [{ description: 'tambah board ekstra nomor 2' }], available: { undo: 2, redo: 0 } });
      expect(await t.boards('doc')).toEqual(['Mobile', 'Extra 1', 'Extra 2']);
      expect((await t.history('doc'))[0]).toMatchObject({ description: 'Redo: tambah board ekstra nomor 2' });

      // Activity: call undo/redo selesai dengan rev, judul dari label riwayat (viewer memuat ulang lewat revChange).
      const calls = t.daemon.activity
        .recent()
        .flatMap((e) => (e.type === 'call' && e.call.status !== 'running' && (e.call.tool === 'undo' || e.call.tool === 'redo') ? [e.call] : []));
      expect(calls.map((c) => [c.tool, c.rev, c.description, c.slug])).toEqual([
        ['undo', r2 + 1, 'Undo: tambah board ekstra nomor 2', 'doc'],
        ['redo', r2 + 2, 'Redo: tambah board ekstra nomor 2', 'doc'],
      ]);

      // steps: dua langkah = dua rev; minta lebih dari yang ada → NOT_FOUND tanpa perubahan.
      const many = await t.step('undo', s, { steps: 3 });
      expect(many.statusCode).toBe(404);
      expect(many.json().error.message).toContain('hanya 2 langkah');
      const two = await t.step('undo', s, { steps: 2 });
      expect(two.json().data).toMatchObject({ rev: r2 + 4, undone: [{ rev: r2 + 3 }, { rev: r2 + 4 }], available: { undo: 0, redo: 2 } });
      expect(await t.boards('doc')).toEqual(['Mobile']);
      expect((await t.step('undo', s)).json().error.code).toBe('NOT_FOUND');
      expect((await t.step('undo', s, { steps: 0 })).json().error.code).toBe('SCHEMA_INVALID');
      expect((await t.step('undo', s, { steps: 1, x: 1 })).json().error.code).toBe('SCHEMA_INVALID');
    } finally {
      await t.app.close();
    }
  });

  it('edit pengguna sesudah langkah agen → undo dan redo ditolak (CONFLICT), dokumen tidak berubah; undo viewer tetap jalan', async () => {
    const t = await server();
    try {
      await t.create('User');
      const s = await t.session('user');
      await t.execute(s);
      const edit = await t.userEdit('user', 'Renamed by user');
      const before = await t.doc('user');
      const r = await t.step('undo', s);
      expect(r.statusCode).toBe(409);
      expect(r.json().error).toMatchObject({ code: 'CONFLICT', retryable: false });
      expect(r.json().error.message).toContain('pengguna (aplikasi Lakar)');
      expect(r.json().error.message).toContain(`rev ${edit.rev}, "Edited in app"`);
      expect(r.json().error.hint).toContain('perbaiki maju lewat execute');
      expect(await t.doc('user')).toEqual(before);
      // CONFLICT membuang tumpukan sesi di dokumen itu (review 31-1): sesudah pengguna meng-undo edit-nya sendiri pun
      // langkah lama tidak hidup lagi → NOT_FOUND jujur, bukan CONFLICT berulang.
      const own = await t.post('/viewer/docs/user/ops', { ops: edit.inverse, description: 'Undo Rename' });
      expect(own.statusCode).toBe(200);
      expect((await t.step('undo', s)).json().error.code).toBe('NOT_FOUND');

      // Redo: undo agen, lalu edit pengguna → redo ditolak.
      const s2 = await t.session('user');
      await t.execute(s2);
      expect((await t.step('undo', s2)).statusCode).toBe(200);
      await t.userEdit('user', 'Again');
      const redo = await t.step('redo', s2);
      expect(redo.statusCode).toBe(409);
      expect(redo.json().error.message).toContain('redo ditolak');
    } finally {
      await t.app.close();
    }
  });

  it('rantai putus: agen → pengguna → agen; undo hanya langkah terakhir, langkah sebelum edit pengguna tidak ikut', async () => {
    const t = await server();
    try {
      await t.create('Chain');
      const s = await t.session('chain');
      await t.execute(s);
      await t.userEdit('chain', 'User name');
      await t.execute(s);
      expect((await t.step('undo', s)).statusCode).toBe(200);
      const again = await t.step('undo', s);
      expect(again.statusCode).toBe(404);
      expect(await t.boards('chain')).toEqual(['User name', 'Extra 1']);
    } finally {
      await t.app.close();
    }
  });

  it('dua agen: langkah agen lain sesudahnya → CONFLICT menyebut harness; tiap sesi hanya langkahnya sendiri', async () => {
    const t = await server();
    try {
      await t.create('Two');
      const a = await t.session('two', 'claude-code');
      const b = await t.session('two', 'codex-mcp-client');
      await t.execute(a);
      await t.execute(b);
      const r = await t.step('undo', a);
      expect(r.statusCode).toBe(409);
      expect(r.json().error.message).toContain('agen lain (codex-mcp-client)');
      const ub = await t.step('undo', b);
      expect(ub.statusCode).toBe(200);
      expect(await t.boards('two')).toEqual(['Mobile', 'Extra 1']);
      // CONFLICT pertama membuang tumpukan A (review 31-1): undo A berikutnya NOT_FOUND, bukan langkah yang hidup lagi.
      expect((await t.step('undo', a)).json().error.code).toBe('NOT_FOUND');
    } finally {
      await t.app.close();
    }
  });

  it('execute baru mengosongkan redo; lintas dokumen: undo hanya di dokumen aktif', async () => {
    const t = await server();
    try {
      await t.create('One');
      await t.create('Other');
      const s = await t.session('one');
      await t.execute(s);
      expect((await t.step('undo', s)).statusCode).toBe(200);
      await t.execute(s);
      const redo = await t.step('redo', s);
      expect(redo.statusCode).toBe(404);
      expect(redo.json().error.hint).toContain('execute/paste baru mengosongkan redo');

      await t.open(s, 'other');
      const none = await t.step('undo', s);
      expect(none.statusCode).toBe(404);
      expect(none.json().error.message).toContain('dokumen other');
      await t.open(s, 'one');
      expect((await t.step('undo', s)).statusCode).toBe(200);
      expect(await t.boards('one')).toEqual(['Mobile']);
    } finally {
      await t.app.close();
    }
  });

  it('paste agen = satu langkah; tanpa sesi/dokumen aktif → 401/NO_ACTIVE_DOC', async () => {
    const t = await server();
    try {
      await t.create('Paste');
      const s = await t.session('paste');
      const board = (await t.doc('paste')).pages[0].children[0].id as string;
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#f00"/></svg>';
      const p = await t.post('/viewer/paste', { content: svg, parentId: board }, { 'x-lakar-session': s });
      expect(p.statusCode, p.body).toBe(200);
      const nodeId = p.json().data.nodeId as string;
      const u = await t.step('undo', s);
      expect(u.statusCode, u.body).toBe(200);
      expect(u.json().data.undone).toEqual([{ description: 'Paste SVG', rev: 3 }]);
      expect(JSON.stringify(await t.doc('paste'))).not.toContain(nodeId);
      expect((await t.step('redo', s)).statusCode).toBe(200);
      expect(JSON.stringify(await t.doc('paste'))).toContain(nodeId);

      expect((await t.post('/viewer/undo', {})).statusCode).toBe(401);
      const fresh = (await t.post('/sessions', { client: 'lakar-mcp' })).json().data.sessionId as string;
      expect((await t.step('undo', fresh)).json().error.code).toBe('NO_ACTIVE_DOC');
    } finally {
      await t.app.close();
    }
  });

  it('daemon restart: tumpukan hilang bersama sesi → NOT_FOUND, dokumen tetap', async () => {
    const t = await server();
    await t.create('Restart');
    const s = await t.session('restart');
    await t.execute(s);
    await t.app.close();
    const again = await server(t.dir);
    try {
      const s2 = await again.session('restart');
      const r = await again.step('undo', s2);
      expect(r.statusCode).toBe(404);
      expect(r.json().error.hint).toContain('sejak daemon berjalan');
      expect(await again.boards('restart')).toEqual(['Mobile', 'Extra 1']);
    } finally {
      await again.app.close();
    }
  });
});

describe('hook tulis agen: dasar visual_diff ikut undo/redo (spec-agent-visual-diff X1)', () => {
  it('sesudah undo, visual_diff {} membandingkan dengan rev sebelum undo (bukan sebelum langkah yang di-undo)', async () => {
    const t = await server();
    try {
      await t.create('Vd');
      const s = await t.session('vd');
      const r1 = await t.execute(s);
      const r2 = await t.execute(s);
      const diff = async () => (await t.post('/viewer/visual-diff', {}, { 'x-lakar-session': s })).json().data;
      expect(await diff()).toMatchObject({ base: 'lastWrite', fromRev: r1, toRev: r2 });
      const u = (await t.step('undo', s)).json().data;
      expect(await diff()).toMatchObject({ base: 'lastWrite', fromRev: r2, toRev: u.rev });
      const r = (await t.step('redo', s)).json().data;
      expect(await diff()).toMatchObject({ fromRev: u.rev, toRev: r.rev });
      // undo beberapa langkah sekaligus = satu tulis: dasar = rev sebelum panggilan.
      const before = r.rev;
      const multi = (await t.step('undo', s, { steps: 2 })).json().data;
      expect(await diff()).toMatchObject({ fromRev: before, toRev: multi.rev });
      expect((await t.post('/viewer/visual-diff', { since: 'session' }, { 'x-lakar-session': s })).json().data.fromRev).toBe(r1 - 1);
    } finally {
      await t.app.close();
    }
  });
});

describe('AgentSteps', () => {
  const session = () => ({ id: 's', createdAt: '', executes: 0, keep: {}, failed: new Map(), log: [] }) as Session;
  const op = (id: string) => [{ op: 'remove', id }] as never[];
  it('rantai putus membuang langkah lama; invers kosong memajukan head tanpa langkah; batas AGENT_UNDO_MAX', () => {
    const steps = new AgentSteps();
    const s = session();
    steps.onAgentWrite(s, 'D', 0, 1, op('a'), 'a');
    steps.onAgentWrite(s, 'D', 1, 2, [], 'noop');
    steps.onAgentWrite(s, 'D', 2, 3, op('b'), 'b');
    expect(steps.of(s, 'D')).toMatchObject({ head: 3, undo: [{ description: 'a' }, { description: 'b' }], redo: [] });
    steps.onAgentWrite(s, 'D', 5, 6, op('c'), 'c');
    expect(steps.of(s, 'D')).toMatchObject({ head: 6, undo: [{ description: 'c' }] });
    expect(steps.of(session(), 'D')).toBeUndefined();
    for (let i = 0; i < AGENT_UNDO_MAX + 5; i++) steps.onAgentWrite(s, 'E', i, i + 1, op(`n${i}`), `n${i}`);
    expect(steps.of(s, 'E')!.undo).toHaveLength(AGENT_UNDO_MAX);
    expect(steps.of(s, 'E')!.undo[0]!.description).toBe('n5');
  });

  it('onAgentWrite: semua jenis memajukan dasar visual_diff; hanya step yang masuk tumpukan; rantai putus membuang redo; drop', () => {
    const steps = new AgentSteps();
    const s = session();
    steps.onAgentWrite(s, 'D', 3, 4, op('a'), 'a');
    steps.onAgentWrite(s, 'D', 4, 5, [], 'Undo', 'undo');
    expect(s.bases!.get('D')).toEqual({ first: 3, last: 4 });
    expect(steps.of(s, 'D')).toMatchObject({ head: 4, undo: [{ description: 'a' }] });
    steps.of(s, 'D')!.redo.push({ ops: op('x'), description: 'x' } as never);
    steps.onAgentWrite(s, 'D', 9, 10, op('b'), 'b');
    expect(steps.of(s, 'D')).toMatchObject({ head: 10, undo: [{ description: 'b' }], redo: [] });
    steps.drop(s, 'D');
    expect(steps.of(s, 'D')).toBeUndefined();
  });
});
