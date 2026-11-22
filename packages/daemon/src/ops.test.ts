// Route ops viewer (AD-7, AD-8): POST /viewer/docs/:slug/ops. Satu permintaan = satu rev + satu entri riwayat,
// rollback penuh, undo/redo lewat op invers (termasuk perubahan agen di antaranya), event `change`, guard Origin,
// ikon, dan body salah. RenderPort palsu.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveDocument, type DocOp, type LakarDocument } from '@lakar/schema';
import { buildServer, loadConfig } from './index.js';
import type { DocChange } from './events.js';

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
  root = await mkdtemp(join(tmpdir(), 'lakar-ops-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

type OpsData = { slug: string; rev: number; created: { id: string; name: string; path: string[] }[]; inverse: DocOp[]; refs: Record<string, string> };

async function setup() {
  const dataDir = await mkdtemp(join(root, 'data-'));
  // Port 7466 hanya untuk guard Origin (app.inject tidak mendengarkan port).
  const daemon = buildServer({ config: { ...baseConfig, port: 7466, dataDir }, render: fakeRender });
  const { app } = daemon;
  const docsDir = join(dataDir, 'docs');
  const post = (url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url, ...(payload !== undefined ? { payload: payload as object } : {}), headers });
  const doc = async (slug: string) => JSON.parse(await readFile(join(docsDir, `${slug}.lakar.json`), 'utf8')) as LakarDocument;
  const history = async (slug: string) =>
    (await readFile(join(docsDir, `${slug}.history.jsonl`), 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  const create = async (name: string) => {
    const r = await post('/viewer/docs', { name, board: { preset: 'mobile' } });
    expect(r.statusCode, r.body).toBe(200);
    const slug = r.json().data.slug as string;
    return { slug, board: (await doc(slug)).pages[0]!.children[0]!.id };
  };
  const ops = async (slug: string, body: unknown, headers: Record<string, string> = {}) => {
    const r = await post(`/viewer/docs/${slug}/ops`, body, headers);
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data as OpsData;
  };
  const changes: DocChange[] = [];
  daemon.activity.subscribeAll((e) => {
    if (e.type === 'change') changes.push(e.change);
  });
  return { ...daemon, dataDir, post, doc, history, create, ops, changes };
}

const content = (d: LakarDocument) => ({ pages: d.pages, tokens: d.tokens ?? {}, tokenModes: d.tokenModes });
const node = (d: LakarDocument, id: string): any => {
  const walk = (n: any): any => (n.id === id ? n : (n.children ?? []).map(walk).find(Boolean));
  for (const p of d.pages) for (const b of p.children) {
    const hit = walk(b);
    if (hit) return hit;
  }
  return undefined;
};

describe('POST /viewer/docs/:slug/ops', () => {
  it('banyak op = satu rev + satu entri riwayat (lakar-viewer) + snapshot; refs, created, event change', async () => {
    const t = await setup();
    try {
      const { slug, board } = await t.create('Ops Satu');
      const before = await t.doc(slug);
      const histBefore = await t.history(slug);
      const data = await t.ops(
        slug,
        {
          ops: [
            { op: 'add', parentId: board, node: { type: 'frame', name: 'Kartu', layout: 'column', gap: 8 }, ref: 'k' },
            { op: 'add', parentId: '@k', node: { type: 'text', name: 'Judul', content: 'Halo', size: 24 }, ref: 't' },
            { op: 'update', id: board, patch: { name: 'Layar' } },
          ],
          description: 'Add card',
        },
        { 'x-lakar-origin': 'win-1' },
      );
      expect(data).toMatchObject({ slug, rev: before.rev + 1 });
      expect(data.created.map((c) => c.name)).toEqual(['Kartu', 'Judul']);
      expect(data.refs).toEqual({ k: data.created[0]!.id, t: data.created[1]!.id });
      expect(data.inverse).toEqual([
        { op: 'update', id: board, patch: { name: before.pages[0]!.children[0]!.name } },
        { op: 'remove', id: data.refs.t },
        { op: 'remove', id: data.refs.k },
      ]);
      const after = await t.doc(slug);
      expect(after.rev).toBe(data.rev);
      expect(node(after, data.refs.t!).content).toBe('Halo');
      const hist = await t.history(slug);
      expect(hist).toHaveLength(histBefore.length + 1);
      expect(hist.at(-1)).toMatchObject({ rev: data.rev, sessionId: 'lakar-viewer', client: 'lakar-viewer', description: 'Add card', opsSummary: 'add×2, update×1' });
      const snap = await t.app.inject({ method: 'GET', url: `/viewer/docs/${slug}/revs/${data.rev}` });
      expect(snap.statusCode).toBe(200);
      expect(t.changes.at(-1)).toEqual({ kind: 'edit', slug, rev: data.rev, boards: [board], origin: 'win-1' });
      // Tanpa description → default.
      await t.ops(slug, { ops: [{ op: 'update', id: board, patch: { name: 'Lagi' } }] });
      expect((await t.history(slug)).at(-1)).toMatchObject({ description: 'Edited in app', opsSummary: 'update×1' });
    } finally {
      await t.app.close();
    }
  });

  it('op gagal → rollback seluruh permintaan: status error op pertama, rev/file/riwayat/memori tetap', async () => {
    const t = await setup();
    try {
      const { slug, board } = await t.create('Ops Gagal');
      const before = await t.doc(slug);
      const hist = await t.history(slug);
      const r = await t.post(`/viewer/docs/${slug}/ops`, {
        ops: [
          { op: 'update', id: board, patch: { name: 'X' } },
          { op: 'remove', id: 'Zzzzzzzz' },
          { op: 'update', id: board, patch: { width: -1 } },
        ],
      });
      expect(r.statusCode).toBe(404);
      expect(r.json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
      expect(r.json().error.message).toMatch(/^ops\[1\] remove: node Zzzzzzzz tidak ada/);
      expect(await t.doc(slug)).toEqual(before);
      expect(await t.history(slug)).toEqual(hist);
      // Memori ikut utuh: op berikutnya berjalan dari rev yang sama.
      expect((await t.ops(slug, { ops: [{ op: 'update', id: board, patch: { name: 'Y' } }] })).rev).toBe(before.rev + 1);
      const bad = await t.post(`/viewer/docs/${slug}/ops`, { ops: [{ op: 'update', id: board, patch: { width: -1 } }] });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error.code).toBe('SCHEMA_INVALID');
    } finally {
      await t.app.close();
    }
  });

  it('undo (inverse) dan redo (inverse undo) sebagai commit baru; perubahan agen di antaranya tetap', async () => {
    const t = await setup();
    try {
      const { slug, board } = await t.create('Ops Undo');
      const seed = await t.ops(slug, {
        ops: [
          { op: 'add', parentId: board, node: { type: 'frame', name: 'Isi', layout: 'column' }, ref: 'f' },
          { op: 'add', parentId: '@f', node: { type: 'text', name: 'Judul', content: 'Halo', size: 24 }, ref: 't' },
          { op: 'add', parentId: '@f', node: { type: 'rect', name: 'Garis', width: 10, height: 1 }, ref: 'r' },
        ],
      });
      const { f, t: text, r: rect } = seed.refs as { f: string; t: string; r: string };
      const base = await t.doc(slug);
      const edit = await t.ops(slug, {
        ops: [
          { op: 'remove', id: f },
          { op: 'setTokens', tokens: { 'colors.ink': '#112233' } },
          { op: 'update', id: board, patch: { fills: [{ type: 'solid', color: { $token: 'colors.ink' } }] } },
        ],
      });
      const edited = await t.doc(slug);
      const undo = await t.ops(slug, { ops: edit.inverse, description: 'Undo' });
      expect(undo.rev).toBe(edit.rev + 1);
      const undone = await t.doc(slug);
      expect(content(undone)).toEqual(content(base));
      expect(node(undone, text)).toEqual(node(base, text));
      const redo = await t.ops(slug, { ops: undo.inverse, description: 'Redo' });
      expect(content(await t.doc(slug))).toEqual(content(edited));
      // Undo lagi, lalu agen (execute) mengubah judul; undo edit viewer berikutnya tidak menyentuh perubahan agen.
      await t.ops(slug, { ops: redo.inverse });
      const own = await t.ops(slug, { ops: [{ op: 'update', id: text, patch: { content: 'Viewer' } }] });
      const s = await t.post('/sessions', { client: 'claude-code' });
      const session = { 'x-lakar-session': s.json().data.sessionId as string };
      expect((await t.post('/docs/open', { slug }, session)).statusCode).toBe(200);
      const ex = await t.post('/execute', { code: `update('${text}', {size: 40}); update('${rect}', {width: 50});`, description: 'agen ubah ukuran judul' }, session);
      expect(ex.statusCode, ex.body).toBe(200);
      await t.ops(slug, { ops: own.inverse });
      const final = await t.doc(slug);
      expect(node(final, text)).toMatchObject({ content: 'Halo', size: 40 });
      expect(node(final, rect).width).toBe(50);
    } finally {
      await t.app.close();
    }
  });

  it('dokumen di disk yang belum dimuat (daemon baru) → dibaca dari store lalu di-commit; change tanpa origin', async () => {
    const t = await setup();
    const { slug, board } = await t.create('Ops Dingin');
    const before = await t.doc(slug);
    await t.app.close();
    const fresh = buildServer({ config: { ...baseConfig, port: 7466, dataDir: t.dataDir }, render: fakeRender });
    const changes: DocChange[] = [];
    fresh.activity.subscribeAll((e) => {
      if (e.type === 'change') changes.push(e.change);
    });
    try {
      const r = await fresh.app.inject({ method: 'POST', url: `/viewer/docs/${slug}/ops`, payload: { ops: [{ op: 'update', id: board, patch: { name: 'Dingin' } }] } });
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().data.rev).toBe(before.rev + 1);
      const after = await t.doc(slug);
      expect(after.rev).toBe(before.rev + 1);
      expect(after.pages[0]!.children[0]!.name).toBe('Dingin');
      expect(changes).toEqual([{ kind: 'edit', slug, rev: before.rev + 1, boards: [board] }]);
    } finally {
      await fresh.app.close();
    }
  });

  it('undo basi (node sudah dihapus agen) → NOT_FOUND tanpa commit', async () => {
    const t = await setup();
    try {
      const { slug, board } = await t.create('Ops Basi');
      const a = await t.ops(slug, { ops: [{ op: 'add', parentId: board, node: { type: 'rect', name: 'R', width: 1, height: 1 }, ref: 'r' }] });
      const upd = await t.ops(slug, { ops: [{ op: 'update', id: a.refs.r, patch: { width: 5 } }] });
      await t.ops(slug, { ops: a.inverse });
      const before = await t.doc(slug);
      const r = await t.post(`/viewer/docs/${slug}/ops`, { ops: upd.inverse });
      expect(r.statusCode).toBe(404);
      expect(await t.doc(slug)).toEqual(before);
    } finally {
      await t.app.close();
    }
  });

  it('guard Origin: asing → 403 tanpa commit; origin daemon sendiri → boleh', async () => {
    const t = await setup();
    try {
      const { slug, board } = await t.create('Ops Origin');
      const before = await t.doc(slug);
      const body = { ops: [{ op: 'update', id: board, patch: { name: 'X' } }] };
      const evil = await t.post(`/viewer/docs/${slug}/ops`, body, { origin: 'https://evil.example' });
      expect(evil.statusCode).toBe(403);
      expect(evil.json()).toMatchObject({ ok: false, error: { code: 'SCHEMA_INVALID' } });
      expect(await t.doc(slug)).toEqual(before);
      expect((await t.post(`/viewer/docs/${slug}/ops`, body, { origin: 'http://127.0.0.1:7466' })).statusCode).toBe(200);
    } finally {
      await t.app.close();
    }
  });

  it('ikon tak dikenal → 422 ICON_UNKNOWN tanpa commit; ikon kanonik → boleh', async () => {
    const t = await setup();
    try {
      const { slug, board } = await t.create('Ops Ikon');
      const before = await t.doc(slug);
      const r = await t.post(`/viewer/docs/${slug}/ops`, { ops: [{ op: 'add', parentId: board, node: { type: 'icon', name: 'I', lib: 'lucide', icon: 'zz-no-such-icon', size: 24 } }] });
      expect(r.statusCode, r.body).toBe(422);
      expect(r.json().error.code).toBe('ICON_UNKNOWN');
      expect(await t.doc(slug)).toEqual(before);
      await t.ops(slug, { ops: [{ op: 'add', parentId: board, node: { type: 'icon', name: 'I', lib: 'lucide', icon: 'house', size: 24 } }] });
    } finally {
      await t.app.close();
    }
  });

  it('body/slug salah → 400; dokumen tidak ada → 404', async () => {
    const t = await setup();
    try {
      const { slug, board } = await t.create('Ops Body');
      const bad: unknown[] = [
        {},
        { ops: [] },
        { ops: 'x' },
        { ops: [{ op: 'nope' }] },
        { ops: [{ op: 'update', id: board, patch: {} }], extra: 1 },
        { ops: [{ op: 'update', id: board, patch: {} }], description: '  ' },
        { ops: [{ op: 'update', id: board, patch: {} }], description: 'x'.repeat(201) },
        { ops: Array.from({ length: 1001 }, () => ({ op: 'update', id: board, patch: {} })) },
      ];
      for (const body of bad) {
        const r = await t.post(`/viewer/docs/${slug}/ops`, body);
        expect(r.statusCode, JSON.stringify(body).slice(0, 80)).toBe(400);
        expect(r.json().error.code).toBe('SCHEMA_INVALID');
      }
      expect((await t.post('/viewer/docs/Bad_Slug/ops', { ops: [{ op: 'remove', id: board }] })).statusCode).toBe(400);
      const missing = await t.post('/viewer/docs/tidak-ada/ops', { ops: [{ op: 'remove', id: board }] });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().error.code).toBe('NOT_FOUND');
    } finally {
      await t.app.close();
    }
  });
});

// epic token-tema story 2: agen membaca/impor token lewat execute, viewer mengganti nama token lewat route ops.
describe('token: execute getTokens/importCssVariables + route ops renameToken', () => {
  it('impor CSS variables lewat execute, getTokens tanpa rev baru, renameToken route ops + undo invers', async () => {
    const t = await setup();
    try {
      const { slug, board } = await t.create('Ops Token');
      const s = await t.post('/sessions', { client: 'claude-code' });
      const session = { 'x-lakar-session': s.json().data.sessionId as string };
      expect((await t.post('/docs/open', { slug }, session)).statusCode).toBe(200);
      const css = ':root { --colors-bg: #ffffff; --radius-md: 12px; --shadow-card: 0 8px 24px #0003; } [data-theme="dark"] { --colors-bg: #0f0f0f; }';
      const imp = await t.post('/execute', { code: `importCssVariables(${JSON.stringify(css)})`, description: 'impor token dari css' }, session);
      expect(imp.statusCode, imp.body).toBe(200);
      const impData = imp.json().data;
      expect(impData.value.tokens.map((x: any) => [x.variable, x.token, x.type, x.status])).toEqual([
        ['--colors-bg', 'colors.bg', 'color', 'new'],
        ['--radius-md', 'radius.md', 'radius', 'new'],
      ]);
      expect(impData.value.skipped).toEqual([expect.objectContaining({ source: '--shadow-card', reason: 'unsupported-value' })]);
      const ex = await t.post(
        '/execute',
        { code: `update('${board}', {themeMode:'dark', fills:[{type:'solid', color:{$token:'colors.bg'}}]});`, description: 'pakai token latar' },
        session,
      );
      expect(ex.statusCode, ex.body).toBe(200);
      const read = await t.post('/execute', { code: 'getTokens()', description: 'baca token dokumen' }, session);
      expect(read.statusCode, read.body).toBe(200);
      expect(read.json().data.rev).toBe(ex.json().data.rev);
      expect(read.json().data.value).toEqual({
        tokens: { 'colors.bg': { type: 'color', value: '#FFFFFF', modes: { dark: '#0F0F0F' } }, 'radius.md': { type: 'radius', value: 12 } },
        modes: ['light', 'dark'],
      });

      const before = await t.doc(slug);
      const ren = await t.ops(slug, { ops: [{ op: 'renameToken', from: 'colors.bg', to: 'colors.surface' }] });
      expect(ren.rev).toBe(before.rev + 1);
      expect(ren.inverse).toEqual([{ op: 'renameToken', from: 'colors.surface', to: 'colors.bg' }]);
      const renamed = await t.doc(slug);
      expect(Object.keys(renamed.tokens!)).toEqual(['colors.surface', 'radius.md']);
      expect(node(renamed, board).fills).toEqual([{ type: 'solid', color: { $token: 'colors.surface' } }]);
      await t.ops(slug, { ops: ren.inverse });
      expect(content(await t.doc(slug))).toEqual(content(before));
    } finally {
      await t.app.close();
    }
  });
});

// epic komponen story 3: agen membuat master + instance lewat execute, viewer memakai op komponen lewat route ops.
describe('komponen: execute (agen) + route ops (viewer) dengan invers', () => {
  it('agen: master, dua instance, override teks, ubah master, hapus master men-detach dalam satu rev; LC-32 untuk override basi', async () => {
    const t = await setup();
    try {
      const { slug, board } = await t.create('Ops Komponen');
      const s = await t.post('/sessions', { client: 'claude-code' });
      const session = { 'x-lakar-session': s.json().data.sessionId as string };
      expect((await t.post('/docs/open', { slug }, session)).statusCode).toBe(200);
      const exec = async (code: string, description: string) => {
        const r = await t.post('/execute', { code, description }, session);
        expect(r.statusCode, r.body).toBe(200);
        return r.json().data;
      };
      const made = await exec(
        `const k = add('${board}', {type:'frame', name:'Kartu', layout:'column'}); const t = add(k, {type:'text', name:'Judul', content:'Halo', size:16});` +
          ` setComponent(k); const a = add('${board}', {type:'instance', name:'Kartu A', componentId:k}); const c = add('${board}', {type:'instance', name:'Kartu B', componentId:k});` +
          ` update(a + '/' + t, {content:'Promo'}); keep.k = k; keep.t = t; keep.a = a; keep.c = c; [a, c]`,
        'buat kartu komponen',
      );
      const [a, c] = made.value as [string, string];
      await exec(`update(keep.t, {color:'#B42318'}); update(keep.k, {gap: 12})`, 'ubah master kartu');
      const read = await exec(`[get(keep.a + '/' + keep.t), get(keep.c + '/' + keep.t)]`, 'baca isi instance');
      expect(read.value[0]).toMatchObject({ content: 'Promo', color: '#B42318' });
      expect(read.value[1]).toMatchObject({ content: 'Halo', color: '#B42318' });

      const stale = await exec(`replace(keep.t, {type:'rect', name:'Garis', width:40, height:2})`, 'ganti judul jadi garis');
      expect(stale.check.findings.some((f: any) => f.rule === 'LC-32' && f.nodeId === a)).toBe(true);
      expect(stale.check.summary.gate).toBe(0);

      const before = await t.doc(slug);
      const removed = await exec(`remove(keep.k)`, 'hapus master kartu');
      expect(removed.rev).toBe(before.rev + 1);
      const after = await t.doc(slug);
      expect(JSON.stringify(after)).not.toContain('"instance"');
      expect(node(after, a)).toBeUndefined();
      expect(node(after, c)).toBeUndefined();
      expect((await t.history(slug)).at(-1).opsSummary).toContain('remove');
    } finally {
      await t.app.close();
    }
  });

  it('viewer: setComponent, sisip instance, override, slot, reset, detach dalam satu permintaan; undo/redo lewat inverse', async () => {
    const t = await setup();
    try {
      const { slug, board } = await t.create('Ops Komponen Viewer');
      const base = await t.ops(slug, {
        ops: [
          { op: 'add', parentId: board, node: { type: 'frame', name: 'Kartu', layout: 'column' }, ref: 'k' },
          { op: 'add', parentId: '@k', node: { type: 'text', name: 'Judul', content: 'Halo', size: 16 }, ref: 't' },
          { op: 'add', parentId: '@k', node: { type: 'frame', name: 'Isi', layout: 'column' }, ref: 'b' },
        ],
      });
      const { k, t: tid, b } = base.refs as Record<string, string>;
      const before = await t.doc(slug);
      const done = await t.ops(slug, {
        ops: [
          { op: 'setComponent', id: k, component: { props: [], slots: [{ name: 'body', nodeId: b }] } },
          { op: 'add', parentId: board, node: { type: 'instance', name: 'Kartu A', componentId: k }, ref: 'i' },
          { op: 'add', parentId: board, node: { type: 'instance', name: 'Kartu B', componentId: k }, ref: 'j' },
          { op: 'update', id: `@i/${tid}`, patch: { content: 'Promo', color: '#B42318' } },
          { op: 'resetOverride', id: `@i/${tid}`, props: ['color'] },
          { op: 'add', parentId: `@i/${b}`, node: { type: 'text', name: 'Catatan', content: 'x', size: 12 }, ref: 's' },
          { op: 'detach', id: '@j', ref: 'd' },
        ],
        description: 'Create component',
      });
      expect(done.rev).toBe(before.rev + 1);
      const mid = await t.doc(slug);
      const inst = node(mid, done.refs.i!);
      expect(inst.overrides).toEqual({ [tid!]: { content: 'Promo' } });
      expect(inst.slots.body[0].id).toBe(done.refs.s);
      expect(node(mid, done.refs.d!).type).toBe('frame');
      expect((await t.history(slug)).at(-1).opsSummary).toContain('setComponent');

      const undo = await t.ops(slug, { ops: done.inverse });
      expect(content(await t.doc(slug))).toEqual(content(before));
      await t.ops(slug, { ops: undo.inverse });
      expect(content(await t.doc(slug))).toEqual(content(mid));

      // Hapus master lewat route: satu rev, instance menjadi node biasa yang tampil sama; inverse mengembalikannya.
      const eff = (d: LakarDocument, id: string): any => node(resolveDocument(d) as unknown as LakarDocument, id);
      const shape = (n: any): any => n && { ...n, id: undefined, children: n.children?.map(shape) };
      const at = mid.pages[0]!.children.find((x) => x.id === board)!.children.findIndex((x) => x.id === done.refs.i);
      const looked = shape(eff(mid, done.refs.i!));
      const del = await t.ops(slug, { ops: [{ op: 'remove', id: k }] });
      expect(del.rev).toBe(done.rev + 3);
      const gone = await t.doc(slug);
      expect(JSON.stringify(gone)).not.toContain('"instance"');
      const detached = gone.pages[0]!.children.find((x) => x.id === board)!.children[at - 1]!;
      expect(detached.type).toBe('frame');
      expect(shape(eff(gone, detached.id))).toEqual(looked);
      await t.ops(slug, { ops: del.inverse });
      expect(content(await t.doc(slug))).toEqual(content(mid));
    } finally {
      await t.app.close();
    }
  });
});
