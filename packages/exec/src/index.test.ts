import { describe, expect, it } from 'vitest';
import { beginTransaction, createDocument } from '@lakar/core';
import type { IconCatalogPort, PhotoInfo, PhotoLibraryPort } from '@lakar/ports';
import { LakarDocument, LakarError, resolveTokens, type LakarDocument as Doc } from '@lakar/schema';
import { API, API_GLOBALS, MAX_OPS, PACKAGE, photoRefsInCode, runSnippet as runSnippetRaw, type RunOptions, type RunResult } from './index.js';

/** Katalog ikon palsu kecil (struktural); katalog asli dites di @lakar/icons dan daemon. */
const FAKE_LIBS: Record<string, { version: string; icons: Record<string, string[]>; aliases: Record<string, string> }> = {
  lucide: {
    version: '1.74.0',
    icons: { house: ['home', 'building'], search: ['find', 'magnifier'], dumbbell: ['gym', 'workout'], ellipsis: ['more'], star: ['favorite'], check: ['done'] },
    aliases: { home: 'house', 'more-horizontal': 'ellipsis' },
  },
  'simple-icons': { version: '16.38.0', icons: { github: ['git'], hive_blockchain: ['hive'] }, aliases: {} },
};
const fakeIcons: IconCatalogPort & { searches: unknown[] } = {
  searches: [],
  versions: { lucide: '1.74.0', 'simple-icons': '16.38.0' },
  canonical(lib, icon) {
    const l = FAKE_LIBS[lib]!;
    const hit = Object.hasOwn(l.icons, icon) ? icon : l.aliases[icon];
    if (hit) return { icon: hit, version: l.version };
    const other = Object.keys(FAKE_LIBS).find((o) => o !== lib && Object.hasOwn(FAKE_LIBS[o]!.icons, icon));
    throw new LakarError('ICON_UNKNOWN', `ikon ${JSON.stringify(icon)} tidak ada di ${lib}; saran: ${Object.keys(l.icons).slice(0, 3).join(', ')}`, {
      hint: `${other ? `pakai lib:'${other}'; ` : ''}cari dengan iconSearch() (MCP: icon_search)`,
    });
  },
  search(query, opts = {}) {
    this.searches.push({ query, ...opts });
    const out = [];
    for (const [lib, l] of Object.entries(FAKE_LIBS)) {
      if (opts.lib && opts.lib !== lib) continue;
      for (const [icon, tags] of Object.entries(l.icons)) if (icon.includes(query) || tags.includes(query)) out.push({ lib, icon, tags });
    }
    return out.slice(0, opts.limit ?? 10);
  },
  glyph: () => undefined,
};
/** Pustaka foto palsu: satu foto terimpor (ref contoh api.md). */
const FAKE_PHOTO: PhotoInfo = {
  assetId: 'a'.repeat(64),
  width: 2880,
  height: 1920,
  credit: 'Foto: Contoh Fotografer / Pexels',
  license: 'Pexels License',
  creator: 'Contoh Fotografer',
  sourcePageUrl: 'https://www.pexels.com/photo/2014422/',
};
const fakePhotos: PhotoLibraryPort & { asked: string[] } = {
  asked: [],
  resolve(ref) {
    this.asked.push(ref);
    return ref === 'pexels:2014422' || ref === 'unsplash:Kq3wLm8xT0a' ? { ...FAKE_PHOTO } : undefined;
  },
};
const runSnippet = (code: string, tx: Parameters<typeof runSnippetRaw>[1], opts: Partial<RunOptions> = {}) =>
  runSnippetRaw(code, tx, { icons: fakeIcons, photos: fakePhotos, ...opts });

const tracer = `const b=add(null,{type:'board',name:'Tracer',x:0,y:0,width:390,height:844,screen:'mobile'}); add(b,{type:'text',name:'Judul',content:'Halo dari Lakar',size:32})`;
const BOARD = (name = 'B', x = 0, w = 390, h = 844) => `add(null,{type:'board',name:'${name}',x:${x},y:0,width:${w},height:${h},screen:'mobile'})`;
const txFor = (doc: Doc = createDocument()) => beginTransaction(doc, { sessionId: 's' });

function okRun(r: RunResult) {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}\n${r.error.hint}`);
  return r;
}
function errRun(r: RunResult) {
  if (r.ok) throw new Error(`diharapkan gagal, dapat ${JSON.stringify(r)}`);
  return r.error;
}
/** Jalankan lalu commit; kembalikan dokumen baru. */
async function commitRun(code: string, doc: Doc = createDocument()) {
  const tx = txFor(doc);
  const r = okRun(await runSnippet(code, tx, { timeoutMs: 5000 }));
  return { r, c: tx.commit('tes') };
}

describe('@lakar/exec', () => {
  it('mengekspor nama paket dan permukaan API lengkap (AD-7)', () => {
    expect(PACKAGE).toBe('@lakar/exec');
    expect(Object.keys(API)).toEqual(['add', 'update', 'replace', 'move', 'duplicate', 'remove', 'setTokens', 'setTokenModes', 'get', 'find', 'children', 'place', 'iconSearch', 'photo']);
    for (const [name, fn] of Object.entries(API)) {
      expect(fn.signature.startsWith(`${name}(`), name).toBe(true);
      expect(fn.doc.length, name).toBeGreaterThan(20);
      expect(fn.errors.length, name).toBeGreaterThan(0);
    }
    expect(Object.keys(API_GLOBALS)).toEqual(['keep', 'console']);
  });

  it.each(Object.entries(API))('contoh API %s sukses di dokumen kosong lalu commit valid', async (_name, fn) => {
    const { c } = await commitRun(fn.example);
    expect(c.entry).not.toBeNull();
    expect(LakarDocument.safeParse(c.doc).success).toBe(true);
    expect(() => resolveTokens(c.doc)).not.toThrow();
  });

  it('sukses: ID dikembalikan sinkron ke snippet, commit oleh pemanggil', async () => {
    const tx = txFor();
    const r = await runSnippet(`${tracer}; typeof b === 'string' && b.length`, tx);
    expect(r).toEqual({ ok: true, value: 8, logs: [], keep: {} });
    const c = tx.commit('tracer');
    expect(c.created.map((x) => x.name)).toEqual(['Tracer', 'Judul']);
    expect(c.doc.pages[0]!.children[0]!.children[0]).toMatchObject({ type: 'text', content: 'Halo dari Lakar' });
  });

  it('op lengkap dalam satu snippet: opsSummary dan created benar', async () => {
    const { c } = await commitRun(`
      setTokens({'colors.a': '#111111'});
      const b = ${BOARD('Home')};
      const f = add(b, {type:'frame', name:'Kartu', layout:'column'});
      const t = add(b, {type:'text', name:'Judul', content:'x', size:12});
      update(t, {size: 20, color: {$token:'colors.a'}});
      move(t, f);
      const r = add(f, {type:'rect', name:'Kotak', width:10, height:10});
      replace(r, {type:'ellipse', name:'Bulat', width:10, height:10});
      const f2 = duplicate(f, {name:'Kartu 2'});
      remove(children(f2)[1].id);
    `);
    expect(c.entry!.opsSummary).toBe('setTokens×1, add×4, update×1, move×1, replace×1, duplicate×1, remove×1');
    expect(c.created.map((x) => x.path)).toEqual([
      ['Home'],
      ['Home', 'Kartu'],
      ['Home', 'Kartu', 'Judul'],
      ['Home', 'Kartu', 'Bulat'],
      ['Home', 'Kartu 2'],
      ['Home', 'Kartu 2', 'Judul'],
    ]);
  });

  describe('baca model', () => {
    const SETUP = `
      const b = ${BOARD('Home')};
      const f = add(b, {type:'frame', name:'Hero', layout:'column'});
      const t = add(f, {type:'text', name:'Judul', content:'Halo', size:32, color:{$token:'colors.a'}});
      const k = add(b, {type:'text', name:'Judul', content:'Lagi', size:12});
      setTokens({'colors.a': '#111111'});
    `;
    const read = async (expr: string) => okRun(await runSnippet(`${SETUP}; ${expr}`, txFor())).value as any;

    it('get: properti tersimpan (token apa adanya) + parentId/path/childIds, tanpa children', async () => {
      const v = await read('[get(t), get(f), get(b)]');
      expect(v[0]).toEqual({
        type: 'text', name: 'Judul', content: 'Halo', size: 32, color: { $token: 'colors.a' },
        id: expect.any(String), parentId: expect.any(String), path: ['Home', 'Hero', 'Judul'],
      });
      expect(v[1].childIds).toEqual([v[0].id]);
      expect(v[1]).not.toHaveProperty('children');
      expect(v[2].parentId).toBeNull();
      expect(v[2].childIds).toHaveLength(2);
    });

    it('children(id) dan children(null) dalam urutan dokumen', async () => {
      const v = await read('[children(b).map(n => n.name), children(null).map(n => n.name), children(t)]');
      expect(v).toEqual([['Hero', 'Judul'], ['Home'], []]);
    });

    it('find: type/name string sama persis/RegExp/within, urutan dokumen', async () => {
      const v = await read(`[
        find({name:'Judul'}).map(n => n.content),
        find({name:'Jud'}).length,
        find({name:/^jud/i, type:'text'}).map(n => n.content),
        find({within: f}).map(n => n.content),
        find().length,
        find({type:'frame'}).map(n => n.name),
      ]`);
      expect(v).toEqual([['Halo', 'Lagi'], 0, ['Halo', 'Lagi'], ['Halo'], 4, ['Hero']]);
    });

    it('baca melihat perubahan snippet yang sama; mutasi view tidak mengubah dokumen', async () => {
      const v = await read(`update(t, {size: 40}); const g = get(t); g.size = 1; g.path.push('x'); [get(t).size, get(t).path.length]`);
      expect(v).toEqual([40, 3]);
    });

    it('ID tak ada → NOT_FOUND; bukan ID → SCHEMA_INVALID; kunci query asing → SCHEMA_INVALID + daftar kunci', async () => {
      expect(errRun(await runSnippet(`${SETUP}; get('ZZZZZZZZ')`, txFor())).code).toBe('NOT_FOUND');
      expect(errRun(await runSnippet(`${SETUP}; get('Judul')`, txFor())).code).toBe('SCHEMA_INVALID');
      expect(errRun(await runSnippet(`${SETUP}; children(42)`, txFor())).code).toBe('SCHEMA_INVALID');
      expect(errRun(await runSnippet(`${SETUP}; find({within:'ZZZZZZZZ'})`, txFor())).code).toBe('NOT_FOUND');
      const e = errRun(await runSnippet(`${SETUP}; find({nama:'x'})`, txFor()));
      expect(e.code).toBe('SCHEMA_INVALID');
      expect(e.message).toContain('nama');
      expect(e.hint).toMatch(/type, name, within/);
    });

    it('view dipakai ulang di update/add → SCHEMA_INVALID + hint hanya-baca', async () => {
      const e = errRun(await runSnippet(`${SETUP}; update(k, {...get(t)})`, txFor()));
      expect(e.code).toBe('SCHEMA_INVALID');
      expect(e.hint).toMatch(/parentId\/path\/childIds hanya-baca/);
      const e2 = errRun(await runSnippet(`${SETUP}; add(b, {type:'frame', name:'X', children:[]})`, txFor()));
      expect(e2.hint).toMatch(/satu per satu/);
    });
  });

  describe('place', () => {
    const place = async (code: string) => okRun(await runSnippet(code, txFor())).value as any;

    it('dokumen kosong → {0,0}', async () => {
      expect(await place('place(390, 844)')).toEqual({ x: 0, y: 0 });
    });

    it('baris atas kiri→kanan, termasuk board yang dibuat di snippet ini; gap default 80 dan kustom', async () => {
      expect(await place(`${BOARD('A', 0)}; ${BOARD('B', 500, 100, 100)}; place(390, 844)`)).toEqual({ x: 680, y: 0 });
      expect(await place(`${BOARD('A', 0)}; place(10, 10, {gap: 20})`)).toEqual({ x: 410, y: 0 });
    });

    it('near → kanan board itu; terhalang → di bawahnya', async () => {
      expect(await place(`const a = ${BOARD('A', 0)}; ${BOARD('B', 2000)}; place(390, 844, {near: a})`)).toEqual({ x: 470, y: 0 });
      expect(await place(`const a = ${BOARD('A', 0)}; ${BOARD('B', 470)}; place(390, 844, {near: a})`)).toEqual({ x: 0, y: 924 });
    });

    it('hasil tidak tumpang tindih saat dipakai berulang', async () => {
      const v = await place(`
        const rects = [];
        for (let i = 0; i < 6; i++) { const p = place(300, 200 + i * 50); add(null, {type:'board', name:'B'+i, x:p.x, y:p.y, width:300, height:200 + i*50, screen:'app'}); rects.push([p.x, p.y, 300, 200 + i*50]); }
        const a = children(null)[0].id;
        for (let i = 0; i < 3; i++) { const p = place(100, 100, {near: a}); add(null, {type:'board', name:'N'+i, x:p.x, y:p.y, width:100, height:100, screen:'app'}); rects.push([p.x, p.y, 100, 100]); }
        rects`);
      for (let i = 0; i < v.length; i++) {
        for (let j = i + 1; j < v.length; j++) {
          const [a, b] = [v[i], v[j]];
          const overlap = a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
          expect(overlap, `${i} vs ${j}`).toBe(false);
        }
      }
    });

    it.each(['place(0, 10)', "place('a', 10)", 'place(10)', 'place(10, 10, {gap:-1})', 'place(10, 10, {dekat:1})'])('%s → SCHEMA_INVALID', async (code) => {
      expect(errRun(await runSnippet(code, txFor())).code).toBe('SCHEMA_INVALID');
    });
  });

  describe('keep, value, logs', () => {
    it('keep masuk dan keluar; gagal → error (pemanggil mempertahankan keep lama)', async () => {
      const r1 = okRun(await runSnippet(`keep.hero = ${BOARD('Hero')}; keep.n = (keep.n || 0) + 1`, txFor()));
      expect(r1.keep).toEqual({ hero: expect.stringMatching(/^[A-Za-z0-9]{8}$/), n: 1 });
      const r2 = okRun(await runSnippet('keep.n += 1; keep.n', txFor(), { keep: r1.keep }));
      expect(r2.value).toBe(2);
      expect(r2.keep).toEqual({ ...r1.keep, n: 2 });
    });

    it('keep bukan objek JSON / > 64 KB → SCHEMA_INVALID', async () => {
      expect(errRun(await runSnippet('keep = 5', txFor())).code).toBe('SCHEMA_INVALID');
      expect(errRun(await runSnippet('keep = [1]', txFor())).code).toBe('SCHEMA_INVALID');
      expect(errRun(await runSnippet('keep.a = {}; keep.a.self = keep.a', txFor())).code).toBe('SCHEMA_INVALID');
      const big = errRun(await runSnippet("keep.x = 'a'.repeat(70000)", txFor()));
      expect(big.code).toBe('SCHEMA_INVALID');
      expect(big.message).toMatch(/terlalu besar/);
    });

    it('value: ekspresi terakhir sebagai JSON; undefined dihilangkan; > 32 KB dipotong', async () => {
      expect(okRun(await runSnippet('({a: [1, "x"], b: null})', txFor())).value).toEqual({ a: [1, 'x'], b: null });
      const u = okRun(await runSnippet('let x = 1', txFor()));
      expect(u).not.toHaveProperty('value');
      const big = okRun(await runSnippet("'a'.repeat(40000)", txFor()));
      expect(big.valueTruncated).toBe(true);
      expect((big.value as string).length).toBeLessThan(33 * 1024);
    });

    it('console.log: string apa adanya, nilai lain JSON; dipotong di 100 baris dengan tanda', async () => {
      expect(okRun(await runSnippet("console.log('a', {b: 1}, [2]); console.log(3)", txFor())).logs).toEqual(['a {"b":1} [2]', '3']);
      const many = okRun(await runSnippet('for (let i = 0; i < 150; i++) console.log(i)', txFor())).logs;
      expect(many).toHaveLength(101);
      expect(many[100]).toMatch(/log dipotong: 50 baris/);
      const wide = okRun(await runSnippet("for (let i = 0; i < 10; i++) console.log('x'.repeat(4000))", txFor())).logs;
      expect(wide.at(-1)).toMatch(/log dipotong/);
      expect(wide.slice(0, -1).join('\n').length).toBeLessThanOrEqual(16 * 1024);
    });
  });

  describe('error dan lokasi baris', () => {
    it('throw tak tertangkap → EXEC_ERROR + baris:kolom + kutipan', async () => {
      const e = errRun(await runSnippet(`const a = 1;\nconst b = undefined;\n  b.x`, txFor()));
      expect(e.code).toBe('EXEC_ERROR');
      expect(e.message).toMatch(/^baris 3:\d+: TypeError: cannot read property 'x' of undefined\n> b\.x$/);
      expect(e.hint).toMatch(/periksa ID/);
      const e2 = errRun(await runSnippet(`${tracer}; throw new Error('x')`, txFor()));
      expect(e2.message).toContain('Error: x');
    });

    it('error host tak tertangkap → kode aslinya + lokasi pemanggil (termasuk lewat find)', async () => {
      const e = errRun(await runSnippet(`const b=${BOARD()};\nadd(b,{type:'text',name:'T',content:'a',size:12,x:10})`, txFor()));
      expect(e.code).toBe('SCHEMA_INVALID');
      expect(e.message).toMatch(/^baris 2:\d+: /);
      expect(e.message).toContain("> add(b,{type:'text'");
      expect(e.hint).toMatch(/x\/y hanya untuk board\/node absolute/);
      const e2 = errRun(await runSnippet(`\n\nfind({within:'ZZZZZZZZ', name:/x/})`, txFor()));
      expect(e2.code).toBe('NOT_FOUND');
      expect(e2.message).toMatch(/^baris 3:/);
    });

    it('ReferenceError → hint daftar global; SyntaxError (TS/JSX) → hint JavaScript biasa', async () => {
      const r = errRun(await runSnippet('import x from "y"', txFor()));
      expect(r.code).toBe('EXEC_ERROR');
      expect(r.message).toMatch(/^baris 1/);
      expect(r.hint).toMatch(/JavaScript biasa/);
      const ts = errRun(await runSnippet('const a = 1;\nconst b: number = 2', txFor()));
      expect(ts.message).toMatch(/^baris 2:\d+: SyntaxError/);
      const ref = errRun(await runSnippet('fetch("x")', txFor()));
      expect(ref.hint).toContain('add, update, replace, move, duplicate, remove, setTokens, setTokenModes, get, find, children, place, iconSearch, photo, keep, console.log');
    });

    it('error host yang ditangkap snippet tidak membatalkan transaksi; e.code tersedia', async () => {
      const tx = txFor();
      const r = await runSnippet(`const b=${BOARD()}; let code; try { add(b,{type:'nope'}) } catch (e) { code = [e.name, e.code] } code`, tx);
      expect(okRun(r).value).toEqual(['LakarError', 'SCHEMA_INVALID']);
      expect(tx.commit('x').created).toHaveLength(1);
    });

    it(`> ${MAX_OPS} op mutasi → EXEC_ERROR walau ditangkap, hint pecah execute`, async () => {
      const tx = txFor();
      const r = await runSnippet(
        `const b=${BOARD()}; const f = add(b, {type:'frame', name:'F'}); try { for (let i = 0; i < ${MAX_OPS}; i++) update(f, {gap: i}); } catch (e) {} 1`,
        tx,
        { timeoutMs: 20000 },
      );
      const e = errRun(r);
      expect(e.code).toBe('EXEC_ERROR');
      expect(e.hint).toMatch(/pecah/);
    }, 30000);
  });

  it('loop tak berujung → EXEC_TIMEOUT', async () => {
    const t0 = Date.now();
    const r = await runSnippet('while(true){}', txFor(), { timeoutMs: 200 });
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(errRun(r).code).toBe('EXEC_TIMEOUT');
  });

  it('regex find berjalan di sandbox (bisa di-interrupt)', async () => {
    const t0 = Date.now();
    const r = await runSnippet(`for (let i = 0; i < 50; i++) add(null,{type:'board',name:'a'.repeat(30),x:i*500,y:0,width:10,height:10,screen:'app'}); find({name:/^(a+)+b$/})`, txFor(), { timeoutMs: 300 });
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(errRun(r).code).toBe('EXEC_TIMEOUT');
  });

  it('batas memori → EXEC_ERROR', async () => {
    const r = await runSnippet(`const a=[]; while(true){ a.push(new Array(1e5).fill(1)) }`, txFor(), { memoryBytes: 8 * 1024 * 1024, timeoutMs: 5000 });
    const e = errRun(r);
    expect(e.code).toBe('EXEC_ERROR');
    expect(e.message).toMatch(/batas memori/);
    // modul tetap/kembali bisa dipakai setelah out of memory
    expect(okRun(await runSnippet('1+1', txFor(), { memoryBytes: 8 * 1024 * 1024 })).value).toBe(2);
  });

  it('tanpa fs/jaringan dan tanpa fungsi host tersembunyi', async () => {
    const r = await runSnippet(
      `[typeof require, typeof fetch, typeof process, typeof XMLHttpRequest, typeof globalThis.std, typeof globalThis.os, typeof __lakar_find, typeof __lakar_log]`,
      txFor(),
    );
    expect(okRun(r).value).toEqual(Array(8).fill('undefined'));
  });
  describe('ikon (AD-9)', () => {
    const B = `const b = ${BOARD('Ikon')};`;
    const icons = async (code: string) => {
      const { r, c } = await commitRun(`${B}\n${code}`);
      const board = c.doc.pages[0]!.children[0]!;
      return { r, c, nodes: board.children as Record<string, unknown>[] };
    };

    it('alias → kanonik, version distempel, name default; name kanonik + nama layer dipertahankan', async () => {
      const { nodes } = await icons(`add(b, {type:'icon', lib:'lucide', icon:'home', size:24});\nadd(b, {type:'icon', lib:'lucide', icon:'search', name:'Cari', size:20});`);
      expect(nodes[0]).toMatchObject({ type: 'icon', lib: 'lucide', icon: 'house', version: '1.74.0', name: 'Icon / lucide / house' });
      expect(nodes[1]).toMatchObject({ icon: 'search', name: 'Cari', version: '1.74.0' });
    });

    it('slug simple-icons ber-underscore diterima', async () => {
      const { nodes } = await icons(`add(b, {type:'icon', lib:'simple-icons', icon:'hive_blockchain', size:24});`);
      expect(nodes[0]).toMatchObject({ icon: 'hive_blockchain', version: '16.38.0', name: 'Icon / simple-icons / hive_blockchain' });
    });

    it('update/replace/duplicate mengkanonikkan dan menstempel version; lib/icon digabung dari node lama', async () => {
      const { nodes } = await icons(
        `const i = add(b, {type:'icon', lib:'lucide', icon:'star', size:24});\n` +
          `update(i, {icon:'more-horizontal'});\n` +
          `const j = duplicate(i, {icon:'home'});\n` +
          `const r = add(b, {type:'rect', name:'R', width:10, height:10});\n` +
          `replace(r, {type:'icon', lib:'simple-icons', icon:'github', size:16});\n` +
          `update(j, {lib:'lucide', version: null});`,
      );
      expect(nodes.map((n) => [n.icon, n.version, n.name])).toEqual([
        ['ellipsis', '1.74.0', 'Icon / lucide / star'],
        ['house', '1.74.0', 'Icon / lucide / star'],
        ['github', '16.38.0', 'Icon / simple-icons / github'],
      ]);
    });

    it('update lib ke simple-icons pada house → ICON_UNKNOWN + rollback', async () => {
      const e = errRun(await runSnippet(`${B}\nconst i = add(b, {type:'icon', lib:'lucide', icon:'house', size:24});\nupdate(i, {lib:'simple-icons'});`, txFor()));
      expect(e.code).toBe('ICON_UNKNOWN');
    });

    it('nama tak dikenal → ICON_UNKNOWN + baris L:K + saran; salah pustaka → hint lib', async () => {
      const e = errRun(await runSnippet(`${B}\n\nadd(b, {type:'icon', lib:'lucide', icon:'hoem', size:24});`, txFor()));
      expect(e.code).toBe('ICON_UNKNOWN');
      expect(e.message).toMatch(/^baris 3:/);
      expect(e.message).toMatch(/saran: house, search, dumbbell/);
      expect(e.hint).toMatch(/iconSearch/);
      const e2 = errRun(await runSnippet(`${B}\nadd(b, {type:'icon', lib:'lucide', icon:'github', size:24});`, txFor()));
      expect(e2.hint).toContain("lib:'simple-icons'");
    });

    it('version asing → SCHEMA_INVALID + hint hapus version; version terpasang diterima', async () => {
      const e = errRun(await runSnippet(`${B}\nadd(b, {type:'icon', lib:'lucide', icon:'house', version:'0.1.0', size:24});`, txFor()));
      expect(e.code).toBe('SCHEMA_INVALID');
      expect(e.hint).toMatch(/hapus version/);
      const { nodes } = await icons(`add(b, {type:'icon', lib:'lucide', icon:'house', version:'1.74.0', size:24});`);
      expect(nodes[0]!.version).toBe('1.74.0');
    });

    it('input tidak valid dibiarkan sampai validasi core (SCHEMA_INVALID)', async () => {
      expect(errRun(await runSnippet(`${B}\nadd(b, {type:'icon', lib:'phosphor', icon:'house', size:24});`, txFor())).code).toBe('SCHEMA_INVALID');
      expect(errRun(await runSnippet(`${B}\nadd(b, {type:'icon', lib:'lucide', icon:42, size:24});`, txFor())).code).toBe('SCHEMA_INVALID');
      expect(errRun(await runSnippet(`${B}\nadd(b, {type:'icon', lib:'lucide', icon:'house'});`, txFor())).code).toBe('SCHEMA_INVALID');
    });

    it('iconSearch: meneruskan ke katalog; default limit 10; input tidak valid → SCHEMA_INVALID', async () => {
      fakeIcons.searches.length = 0;
      const r = okRun(await runSnippet(`[iconSearch('dumbbell')[0], iconSearch('gym', {lib:'lucide', limit:2}).map((m) => m.icon)]`, txFor()));
      expect(r.value).toEqual([{ lib: 'lucide', icon: 'dumbbell', tags: ['gym', 'workout'] }, ['dumbbell']]);
      expect(fakeIcons.searches).toEqual([{ query: 'dumbbell', limit: 10 }, { query: 'gym', lib: 'lucide', limit: 2 }]);
      for (const bad of [`iconSearch('')`, `iconSearch(5)`, `iconSearch('x', {lib:'feather'})`, `iconSearch('x', {limit:0})`, `iconSearch('x', {limit:51})`, `iconSearch('x', {top:1})`, `iconSearch('x', 3)`]) {
        expect(errRun(await runSnippet(bad, txFor())).code, bad).toBe('SCHEMA_INVALID');
      }
    });
  });

  describe('photo (foto stok terimpor)', () => {
    it('ref terimpor → info foto; dipakai di fill image', async () => {
      const { r, c } = await commitRun(`const b=${BOARD()}; const p = photo('pexels:2014422'); add(b, {type:'rect', name:'Image / Kamar', width:200, height:120, fills:[{type:'image', assetId:p.assetId, fit:'cover'}]}); p`);
      expect(r.value).toEqual(FAKE_PHOTO);
      const rect = c.doc.pages[0]!.children[0]!.children[0] as { fills: unknown[] };
      expect(rect.fills).toEqual([{ type: 'image', assetId: FAKE_PHOTO.assetId, fit: 'cover' }]);
    });

    it('ref belum diimpor → NOT_FOUND + hint literal; format salah → SCHEMA_INVALID; tanpa port → NOT_FOUND', async () => {
      const e = errRun(await runSnippet(`const x = 'pexels:' + '99'; photo(x)`, txFor()));
      expect(e.code).toBe('NOT_FOUND');
      expect(e.hint).toMatch(/literal/);
      for (const bad of [`photo('foo')`, `photo(42)`, `photo('https://images.pexels.com/x.jpg')`, `photo('unsplash:abc')`, `photo('wikimedia:abc')`, `photo()`]) {
        expect(errRun(await runSnippet(bad, txFor())).code, bad).toBe('SCHEMA_INVALID');
      }
      expect(errRun(await runSnippetRaw(`photo('pexels:2014422')`, txFor(), { icons: fakeIcons })).code).toBe('NOT_FOUND');
    });

    it('photoRefsInCode: hanya literal pexels/wikimedia/openverse, unik, urutan muncul', () => {
      const uuid = '0a1b2c3d-4e5f-6789-abcd-ef0123456789';
      const code = `const a = photo('pexels:2014422');\nconst b = photo( "openverse:${uuid}" );\nconst c = photo('wikimedia:98688894');\nconst d = photo('unsplash:Zp9_rT2uVb1');\nphoto('pexels:2014422'); photo(x); photo('foo'); photo(\`pexels:1\`); photo('pexels:12")`;
      expect(photoRefsInCode(code)).toEqual(['pexels:2014422', `openverse:${uuid}`, 'wikimedia:98688894', 'unsplash:Zp9_rT2uVb1']);
      expect(photoRefsInCode('add(b, {})')).toEqual([]);
    });
  });
});
