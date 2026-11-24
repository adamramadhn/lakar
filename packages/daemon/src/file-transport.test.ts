// Transport file `lakar --file` (spec-collab-cloud story 2): FileTransport memetakan route tool yang sama
// dengan lakard langsung ke DocStore + transaksi core pada satu `.lakar.json` — tanpa HTTP, sesi, render.
// Tool render/jaringan/viewer → NOT_SUPPORTED; file hilang/rusak → error start yang jelas.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDocument } from '@lakar/core';
import type { IconCatalogPort } from '@lakar/ports';
import type { IconGlyph } from '@lakar/schema';
import { FileTransport } from './file-transport.js';

const DESC = 'langkah uji transport file';

/** Katalog ikon palsu: canonical lolos semua, search satu hasil, tanpa file data. */
const fakeIcons: IconCatalogPort<string, IconGlyph> = {
  versions: { lucide: '0.test' },
  canonical: (_lib, icon) => ({ icon, version: '0.test' }),
  search: (query) => [{ lib: 'lucide', icon: query }],
  glyph: () => undefined,
};

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-filetransport-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Tulis fixture dokumen `<slug>.lakar.json` di direktori baru; kembalikan {dir, file, slug}. */
async function fixture(slug: string, doc: unknown = createDocument()): Promise<{ dir: string; file: string; slug: string }> {
  const dir = await mkdtemp(join(root, 'ft-'));
  const file = join(dir, `${slug}.lakar.json`);
  await writeFile(file, JSON.stringify(doc), 'utf8');
  return { dir, file, slug };
}

const transport = (file: string) => new FileTransport(file, { icons: fakeIcons, skillsDir: join(root, 'skills') });

describe('FileTransport: start', () => {
  it('file tidak ada → error start yang jelas', async () => {
    const { dir } = await fixture('ada');
    expect(() => new FileTransport(join(dir, 'tidakada.lakar.json'))).toThrow(/tidak bisa membaca/);
  });

  it('bukan .lakar.json → error start', async () => {
    const dir = await mkdtemp(join(root, 'ft-suffix-'));
    const f = join(dir, 'doc.json');
    await writeFile(f, '{}');
    expect(() => new FileTransport(f)).toThrow(/\.lakar\.json/);
  });

  it('JSON rusak → error start', async () => {
    const dir = await mkdtemp(join(root, 'ft-badjson-'));
    const f = join(dir, 'rusak.lakar.json');
    await writeFile(f, '{tidak-json', 'utf8');
    expect(() => new FileTransport(f)).toThrow(/bukan JSON valid/);
  });

  it('skema rusak → error start', async () => {
    const { file } = await fixture('jelek', { bukan: 'dokumen' });
    expect(() => new FileTransport(file)).toThrow(/rusak/);
  });
});

describe('FileTransport: sesi, status, open_doc', () => {
  it('/sessions no-op; /status menandai transport file', async () => {
    const { file, slug } = await fixture('status-doc');
    const t = transport(file);
    const s = await t.call<{ sessionId: string }>('/sessions', {});
    expect(s.ok && typeof s.data.sessionId === 'string').toBe(true);
    const st = await t.status<{ transport: string; file: string; slug: string; sessions: { count: number } }>();
    expect(st.ok).toBe(true);
    if (!st.ok) return;
    expect(st.data.transport).toBe('file');
    expect(st.data.file).toBe(file);
    expect(st.data.slug).toBe(slug);
    expect(st.data.sessions.count).toBe(1);
  });

  it('open_doc idempoten: rev tetap, slug lain → NOT_FOUND', async () => {
    const { file, slug } = await fixture('doc-aktif');
    const t = transport(file);
    const a = await t.call<{ slug: string; rev: number; source: string; viewerOpen: boolean }>('/docs/open', {});
    expect(a.ok).toBe(true);
    expect(a.ok && a.data).toMatchObject({ slug, rev: 0, source: 'file', viewerOpen: false });
    const b = await t.call<{ slug: string; rev: number }>('/docs/open', { slug });
    expect(b.ok && b.data.rev).toBe(0);
    const lain = await t.call('/docs/open', { slug: 'lain-lain' });
    expect(!lain.ok && lain.error.code).toBe('NOT_FOUND');
  });

  it('list_documents: satu entri file aktif', async () => {
    const { file, slug } = await fixture('doc-list');
    const t = transport(file);
    const r = await t.call<{ documents: { slug: string; active: boolean }[]; active: string }>('/viewer/documents', {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.documents).toHaveLength(1);
    expect(r.data.documents[0]).toMatchObject({ slug, active: true });
    expect(r.data.active).toBe(slug);
  });
});

describe('FileTransport: execute menulis file', () => {
  it('execute menambah board → rev+1, file dan riwayat ditulis, tanpa check', async () => {
    const { file, slug, dir } = await fixture('eksek');
    const t = transport(file);
    const r = await t.call<{ rev: number; created: { id: string }[]; target: { slug: string } }>('/execute', {
      code: `add(null,{type:'board',name:'Hero',x:0,y:0,width:390,height:844,screen:'mobile'})`,
      description: 'tambah board hero landing',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.rev).toBe(1);
    expect(r.data.created).toHaveLength(1);
    expect(r.data.target.slug).toBe(slug);
    // File ditulis atomik oleh DocStore (rev + board).
    const onDisk = JSON.parse(await readFile(file, 'utf8')) as { rev: number; pages: { children: { name: string }[] }[] };
    expect(onDisk.rev).toBe(1);
    expect(onDisk.pages[0]!.children[0]!.name).toBe('Hero');
    // Riwayat + snapshot sidecar ada.
    const hist = await readFile(join(dir, `${slug}.history.jsonl`), 'utf8');
    const entry = JSON.parse(hist.trim()) as { rev: number; client: string; description: string };
    expect(entry).toMatchObject({ rev: 1, client: 'lakar-mcp', description: 'tambah board hero landing' });
  });

  it('baca-saja (tanpa op) → rev tetap, value dikembalikan', async () => {
    const { file } = await fixture('read-only');
    const t = transport(file);
    const r = await t.call<{ rev: number; value: number }>('/execute', { code: '1+1', description: DESC });
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.rev).toBe(0);
    expect(r.ok && r.data.value).toBe(2);
  });

  it('description hilang → SCHEMA_INVALID + editId; perbaikan lewat editId berhasil', async () => {
    const { file } = await fixture('editid');
    const t = transport(file);
    const bad = await t.call('/execute', { code: `add(null,{type:'board',name:'B',x:0,y:0,width:10,height:10,screen:'app'})` });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error.code).toBe('SCHEMA_INVALID');
    expect(bad.error.editId).toEqual(expect.any(String));
    const fixed = await t.call<{ rev: number }>('/execute', { editId: bad.error.editId, description: 'board dari editId uji' });
    expect(fixed.ok && fixed.data.rev).toBe(1);
  });

  it('dryRun: changes dikembalikan tanpa commit/riwayat', async () => {
    const { file, dir, slug } = await fixture('dryrun');
    const t = transport(file);
    const r = await t.call<{ rev: number; dryRun: boolean; changes: { counts: { added: number } } }>('/execute', {
      code: `add(null,{type:'board',name:'B',x:0,y:0,width:10,height:10,screen:'app'})`,
      description: 'pratinjau board kering uji',
      dryRun: true,
    });
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.dryRun).toBe(true);
    expect(r.ok && r.data.changes.counts.added).toBe(1);
    const onDisk = JSON.parse(await readFile(file, 'utf8')) as { rev: number };
    expect(onDisk.rev).toBe(0);
    await expect(readFile(join(dir, `${slug}.history.jsonl`), 'utf8')).rejects.toThrow();
  });

  it('setTokens lewat execute; getTokens membaca kembali', async () => {
    const { file } = await fixture('tokens');
    const t = transport(file);
    const r = await t.call('/execute', {
      code: `setTokens({'colors.brand':{type:'color',value:'#FF6B60'}})`,
      description: 'set token warna brand',
    });
    expect(r.ok).toBe(true);
    const read = await t.call<{ value: { tokens: Record<string, unknown> } }>('/execute', { code: 'getTokens()', description: 'baca token warna brand' });
    expect(read.ok).toBe(true);
    expect(read.ok && read.data.value.tokens['colors.brand']).toMatchObject({ type: 'color', value: '#FF6B60' });
  });

  it('photo() di kode → NOT_SUPPORTED (butuh jaringan lakard)', async () => {
    const { file } = await fixture('foto');
    const t = transport(file);
    const r = await t.call('/execute', { code: `photo('unsplash:abc')`, description: 'impor foto uji lakar' });
    expect(!r.ok && r.error.code).toBe('NOT_SUPPORTED');
  });
});

describe('FileTransport: route NOT_SUPPORTED', () => {
  it.each(['/screenshot', '/export', '/layout-check', '/viewer/fix-check', '/viewer/paste', '/viewer/import-url', '/viewer/visual-diff', '/viewer/selection', '/photos/search', '/route/ngawur'])(
    '%s → NOT_SUPPORTED dengan hint lakard',
    async (path) => {
      const { file } = await fixture('nsup');
      const t = transport(file);
      const r = await t.call(path, {});
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe('NOT_SUPPORTED');
      expect(r.error.hint).toMatch(/lakard/);
    },
  );
});

describe('FileTransport: baca dokumen', () => {
  const withBoard = async (slug: string) => {
    const f = await fixture(slug);
    const t = transport(f.file);
    const r = await t.call<{ created: { id: string }[] }>('/execute', {
      code: `const b=add(null,{type:'board',name:'Hero',x:0,y:0,width:390,height:844,screen:'mobile'}); add(b,{type:'text',name:'Judul',content:'Halo',size:24,position:'absolute',x:20,y:20})`,
      description: 'board hero berisi judul',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('withBoard: execute gagal');
    return { ...f, t, boardId: r.data.created[0]!.id };
  };

  it('list_boards setelah execute', async () => {
    const { t, boardId, slug } = await withBoard('boards');
    const r = await t.call<{ slug: string; boards: { id: string; name: string; childCount: number }[] }>('/boards', {});
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.slug).toBe(slug);
    expect(r.ok && r.data.boards).toEqual([expect.objectContaining({ id: boardId, name: 'Hero', childCount: 1 })]);
  });

  it('inspect mengembalikan pohon tanpa bounds (render tidak ada)', async () => {
    const { t, boardId } = await withBoard('insp');
    const r = await t.call<{ boardId: string; node: Record<string, unknown> }>('/inspect', { id: boardId, depth: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.boardId).toBe(boardId);
    expect(r.data.node.name).toBe('Hero');
    expect(JSON.stringify(r.data.node)).not.toContain('"bounds"');
    const nope = await t.call('/inspect', { id: 'ZZZZZZZZ' });
    expect(!nope.ok && nope.error.code).toBe('NOT_FOUND');
  });

  it('pages: list, create, switch, tree', async () => {
    const { t, boardId } = await withBoard('halaman');
    const list = await t.call<{ pages: { name: string }[]; active: { name: string } }>('/pages', {});
    expect(list.ok && list.data.active.name).toBe('Page 1');
    const created = await t.call<{ page: { id: string; name: string; index: number } }>('/pages/create', { name: 'Page Dua' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.page).toMatchObject({ name: 'Page Dua', index: 1, boards: 0 });
    const sw = await t.call<{ page: { name: string }; previous: { id: string } }>('/pages/switch', { page: 'Page 1' });
    expect(sw.ok && sw.data.previous.id).toBe(created.data.page.id);
    const tree = await t.call<{ page: { name: string }; children: { id: string; name: string }[] }>('/pages/tree', { page: 'Page 1' });
    expect(tree.ok && tree.data.children).toEqual([expect.objectContaining({ id: boardId, name: 'Hero' })]);
  });

  it('analyze/colors membaca warna yang dipakai node', async () => {
    const { file } = await fixture('warna');
    const t = transport(file);
    const e = await t.call('/execute', {
      code: `const b=add(null,{type:'board',name:'B',x:0,y:0,width:100,height:100,screen:'app'}); add(b,{type:'text',name:'T',content:'x',size:12,color:'#FF6B60'})`,
      description: 'teks warna untuk audit',
    });
    expect(e.ok).toBe(true);
    const r = await t.call<{ colors: { value: string }[] }>('/analyze/colors', {});
    expect(r.ok && r.data.colors.length).toBeGreaterThan(0);
    expect(r.ok && r.data.colors[0]!.value).toBe('#FF6B60');
  });

  it('icons/search memakai katalog injeksi', async () => {
    const { file } = await fixture('ikon');
    const t = transport(file);
    const r = await t.call<{ results: { icon: string }[] }>('/icons/search', { query: 'dumbbell' });
    expect(r.ok && r.data.results[0]).toMatchObject({ lib: 'lucide', icon: 'dumbbell' });
  });

  it('skills/read: daftar kosong tanpa direktori; nama ngawur → NOT_FOUND', async () => {
    const { file } = await fixture('skill');
    const t = transport(file);
    const list = await t.call<{ skills: { name: string; available: boolean }[] }>('/skills/read', {});
    expect(list.ok && list.data.skills.every((s) => !s.available)).toBe(true);
    const nope = await t.call('/skills/read', { name: 'ngawur' });
    expect(!nope.ok && nope.error.code).toBe('NOT_FOUND');
  });

  it('export_code dtcg (tokens.json) dan react-tailwind tanpa render', async () => {
    const { t, boardId } = await withBoard('export-kode');
    await t.call('/execute', { code: `setTokens({'colors.brand':{type:'color',value:'#123456'}})`, description: 'set token untuk ekspor' });
    const dtcg = await t.call<{ files: { path: string }[] }>('/viewer/export-code', { target: 'dtcg' });
    expect(dtcg.ok && dtcg.data.files).toEqual([expect.objectContaining({ path: 'tokens.json' })]);
    const react = await t.call<{ target: string; id: string; files: { path: string }[] }>('/viewer/export-code', { id: boardId });
    expect(react.ok).toBe(true);
    expect(react.ok && react.data.target).toBe('react-tailwind');
    expect(react.ok && react.data.files.some((f) => f.path.endsWith('.tsx'))).toBe(true);
  });
});

describe('FileTransport: komentar', () => {
  it('create/reply/resolve/delete dengan penulis agen sesi', async () => {
    const { file, slug, dir } = await fixture('komen');
    const t = transport(file);
    t.setAgent(() => 'claude-code');
    const c = await t.call<{ rev: number; thread: { id: string; status: string; messages: { author: { kind: string; name: string } }[] } }>('/comments/create', { text: 'perbesar judul', x: 10, y: 20 });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.data.rev).toBe(1);
    const thread = c.data.thread;
    expect(thread.status).toBe('open');
    expect(thread.messages[0]!.author).toEqual({ kind: 'agent', name: 'claude-code' });
    const list = await t.call<{ total: number; open: number }>('/comments', {});
    expect(list.ok && list.data.total).toBe(1);
    expect(list.ok && list.data.open).toBe(1);
    const rep = await t.call('/comments/reply', { threadId: thread.id, text: 'sudah dibesarkan' });
    expect(rep.ok).toBe(true);
    const res = await t.call<{ status: string }>('/comments/resolve', { threadId: thread.id });
    expect(res.ok && res.data.status).toBe('resolved');
    const del = await t.call('/comments/delete', { threadId: thread.id });
    expect(del.ok).toBe(true);
    const empty = await t.call<{ total: number }>('/comments', {});
    expect(empty.ok && empty.data.total).toBe(0);
    // Riwayat di samping file mencatat rev komentar atas nama agen.
    const lines = (await readFile(join(dir, `${slug}.history.jsonl`), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as { opsSummary: string; agent?: string });
    expect(lines.every((e) => e.opsSummary === 'comments')).toBe(true);
    expect(lines[0]!.agent).toBe('claude-code');
  });
});

describe('FileTransport: undo/redo', () => {
  it('undo membatalkan execute (rev naik, board hilang); redo mengembalikan', async () => {
    const { file } = await fixture('undo');
    const t = transport(file);
    await t.call('/execute', { code: `add(null,{type:'board',name:'B1',x:0,y:0,width:10,height:10,screen:'app'})`, description: 'board pertama untuk undo' });
    await t.call('/execute', { code: `add(null,{type:'board',name:'B2',x:100,y:0,width:10,height:10,screen:'app'})`, description: 'board kedua untuk undo' });
    const u = await t.call<{ rev: number; undone: { description: string }[]; available: { undo: number; redo: number } }>('/viewer/undo', {});
    expect(u.ok).toBe(true);
    expect(u.ok && u.data.rev).toBe(3);
    expect(u.ok && u.data.undone).toEqual([expect.objectContaining({ description: 'board kedua untuk undo' })]);
    const doc = JSON.parse(await readFile(file, 'utf8')) as { rev: number; pages: { children: unknown[] }[] };
    expect(doc.rev).toBe(3);
    expect(doc.pages[0]!.children).toHaveLength(1);
    const r = await t.call<{ rev: number; redone: { description: string }[] }>('/viewer/redo', {});
    expect(r.ok && r.data.rev).toBe(4);
    const doc2 = JSON.parse(await readFile(file, 'utf8')) as { pages: { children: unknown[] }[] };
    expect(doc2.pages[0]!.children).toHaveLength(2);
  });

  it('undo tanpa langkah → NOT_FOUND', async () => {
    const { file } = await fixture('undo-kosong');
    const t = transport(file);
    const r = await t.call('/viewer/undo', {});
    expect(!r.ok && r.error.code).toBe('NOT_FOUND');
  });

  it('steps melebihi tumpukan → NOT_FOUND', async () => {
    const { file } = await fixture('undo-lebih');
    const t = transport(file);
    await t.call('/execute', { code: `add(null,{type:'board',name:'B',x:0,y:0,width:10,height:10,screen:'app'})`, description: 'satu langkah saja uji' });
    const r = await t.call('/viewer/undo', { steps: 5 });
    expect(!r.ok && r.error.code).toBe('NOT_FOUND');
  });
});

describe('FileTransport: gerbang tulis lintas proses', () => {
  it('rev di disk berubah setelah dimuat → commit berikutnya CONFLICT dan berulang (execute + komentar)', async () => {
    const { file } = await fixture('konflik');
    const t = transport(file);
    await t.call('/boards', {});
    // Proses lain menulis rev lebih baru.
    const disk = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    await writeFile(file, JSON.stringify({ ...disk, rev: 5 }), 'utf8');
    const e = await t.call('/execute', { code: `add(null,{type:'board',name:'B',x:0,y:0,width:10,height:10,screen:'app'})`, description: 'tulis setelah edit luar' });
    expect(!e.ok && e.error.code).toBe('CONFLICT');
    // Konflik berulang (bukan ditandai "sudah dilihat"): komentar juga ditolak.
    const c = await t.call('/comments/create', { text: 'komentar uji konflik', x: 1, y: 2 });
    expect(!c.ok && c.error.code).toBe('CONFLICT');
    // Edit eksternal tidak ditimpa.
    expect((JSON.parse(await readFile(file, 'utf8')) as { rev: number }).rev).toBe(5);
  });

  it('tulis ulang eksternal pada rev sama → cache disegarkan, commit lanjut', async () => {
    const { file } = await fixture('tulis-ulang');
    const t = transport(file);
    await t.call('/boards', {});
    const disk = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    await writeFile(file, JSON.stringify({ ...disk, rev: 0 }), 'utf8');
    const e = await t.call<{ rev: number }>('/execute', { code: `add(null,{type:'board',name:'B',x:0,y:0,width:10,height:10,screen:'app'})`, description: 'lanjut setelah tulis ulang' });
    expect(e.ok && e.data.rev).toBe(1);
  });

  it('berkas terhapus setelah dimuat → list_documents/execute NOT_FOUND (bukan EXEC_ERROR)', async () => {
    const { file } = await fixture('terhapus');
    const t = transport(file);
    await t.call('/boards', {});
    await rm(file);
    const docs = await t.call('/viewer/documents', {});
    expect(!docs.ok && docs.error.code).toBe('NOT_FOUND');
    const e = await t.call('/execute', { code: `add(null,{type:'board',name:'B',x:0,y:0,width:10,height:10,screen:'app'})`, description: 'tulis pada berkas hilang' });
    expect(!e.ok && e.error.code).toBe('NOT_FOUND');
  });
});

describe('FileTransport: nama berkas non-slug', () => {
  it('`My Design.lakar.json` → slug my-design; tulis tetap ke berkas asli + riwayat nama asli', async () => {
    const dir = await mkdtemp(join(root, 'ft-nama-'));
    const f = join(dir, 'My Design.lakar.json');
    await writeFile(f, JSON.stringify(createDocument()), 'utf8');
    const t = transport(f);
    expect(t.slug).toBe('my-design');
    const e = await t.call<{ rev: number; target: { slug: string } }>('/execute', { code: `add(null,{type:'board',name:'B',x:0,y:0,width:10,height:10,screen:'app'})`, description: 'tulis pada nama non-slug' });
    expect(e.ok && e.data.target.slug).toBe('my-design');
    expect(e.ok && e.data.rev).toBe(1);
    // Berkas asli ditulis (bukan my-design.lakar.json baru) dan riwayat memakai nama asli.
    const disk = JSON.parse(await readFile(f, 'utf8')) as { rev: number };
    expect(disk.rev).toBe(1);
    const hist = await readFile(join(dir, 'My Design.history.jsonl'), 'utf8');
    expect(JSON.parse(hist.trim())).toMatchObject({ rev: 1 });
    const open = await t.call<{ slug: string }>('/docs/open', { slug: 'my-design' });
    expect(open.ok).toBe(true);
  });

  it('nama tanpa karakter slug sama sekali → error start yang jelas', async () => {
    const dir = await mkdtemp(join(root, 'ft-noname-'));
    const f = join(dir, '!!!.lakar.json');
    await writeFile(f, '{}', 'utf8');
    expect(() => new FileTransport(f)).toThrow(/slug valid/);
  });
});
