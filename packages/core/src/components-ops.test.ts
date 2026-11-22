// Op komponen (epic komponen story 3, AD-12 + AD-8): matriks spec komponen-3-ops — setComponent, override lewat
// alamat komposit, resetOverride, slot, detach, hapus master yang men-detach instance, dan invers bolak-balik.
import { describe, expect, it } from 'vitest';
import { LakarError, instanceIssues, resolveDocument, type DocOp, type LakarDocument } from '@lakar/schema';
import { applyOps, beginTransaction, createDocument, transact } from './index.js';

const seeded = (seed = 42) => {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x1_0000_0000);
};
const boardIn = (name = 'Home', x = 0) => ({ type: 'board', name, x, y: 0, width: 390, height: 844, screen: 'mobile' });

/**
 * Board Home: master frame Kartu (M) > [text Judul (T), frame Body (B, slot body) > text Isi (S0)], prop `title`
 * terikat ke content T; dua instance I1, I2.
 */
function fixture() {
  const tx = beginTransaction(createDocument(seeded(1)), { sessionId: 's', random: seeded(2) });
  const home = tx.add(null, boardIn('Home'));
  const m = tx.add(home, { type: 'frame', name: 'Kartu', layout: 'column', gap: 8, fills: [{ type: 'solid', color: '#FFFFFF' }] });
  const t = tx.add(m, { type: 'text', name: 'Judul', content: 'Halo', size: 16, color: '#000000' });
  const b = tx.add(m, { type: 'frame', name: 'Body', layout: 'column' });
  const s0 = tx.add(b, { type: 'text', name: 'Isi', content: 'Default', size: 14 });
  tx.setComponent(m, { props: [{ name: 'title', type: 'text', default: 'Halo', binds: [{ nodeId: t, prop: 'content' }] }], slots: [{ name: 'body', nodeId: b }] });
  const i1 = tx.add(home, { type: 'instance', name: 'Kartu A', componentId: m });
  const i2 = tx.add(home, { type: 'instance', name: 'Kartu B', componentId: m });
  const doc = tx.commit('fixture').doc;
  return { doc, home, m, t, b, s0, i1, i2 };
}

const run = (doc: LakarDocument, ops: unknown) => transact(doc, { sessionId: 'viewer', description: 'ops' }, (tx) => applyOps(tx, ops));
const content = (d: LakarDocument) => ({ pages: d.pages, tokens: d.tokens ?? {}, tokenModes: d.tokenModes });

async function roundTrip(doc: LakarDocument, ops: DocOp[]) {
  const done = await run(doc, ops);
  expect(done.inverse.length).toBeGreaterThan(0);
  const undone = await run(done.doc, done.inverse);
  expect(content(undone.doc)).toEqual(content(doc));
  const redone = await run(undone.doc, undone.inverse);
  expect(content(redone.doc)).toEqual(content(done.doc));
  return { done, undone, redone };
}

async function rejects(p: Promise<unknown>): Promise<LakarError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(LakarError);
    return e as LakarError;
  }
  return expect.unreachable('seharusnya melempar') as never;
}

type Raw = Record<string, any>;
/** Node tersimpan (termasuk isi slot) menurut id. */
function stored(doc: LakarDocument, id: string): Raw | undefined {
  const walk = (n: Raw): Raw | undefined => {
    if (n.id === id) return n;
    for (const c of n.children ?? []) {
      const hit = walk(c);
      if (hit) return hit;
    }
    for (const list of Object.values(n.slots ?? {}) as Raw[][]) for (const c of list) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return undefined;
  };
  for (const p of doc.pages) for (const b of p.children) {
    const hit = walk(b as Raw);
    if (hit) return hit;
  }
  return undefined;
}
/** Node hasil resolveDocument menurut alamat. */
function effective(doc: LakarDocument, address: string): Raw | undefined {
  const walk = (n: Raw): Raw | undefined => (n.id === address ? n : (n.children ?? []).map(walk).find(Boolean));
  for (const p of resolveDocument(doc).pages) for (const b of p.children) {
    const hit = walk(b as Raw);
    if (hit) return hit;
  }
  return undefined;
}
/** Bentuk efektif tanpa id (pembanding detach: tampilan sama, ID berbeda). */
const shape = (n: Raw | undefined): unknown => n && { ...n, id: undefined, children: n.children?.map(shape) };
const instancesOf = (doc: LakarDocument, m: string) => {
  const out: string[] = [];
  const walk = (n: Raw) => {
    if (n.type === 'instance' && n.componentId === m) out.push(n.id);
    (n.children ?? []).forEach(walk);
    for (const list of Object.values(n.slots ?? {}) as Raw[][]) list.forEach(walk);
  };
  for (const p of doc.pages) for (const b of p.children) walk(b as Raw);
  return out;
};

describe('setComponent', () => {
  it('menjadikan node master (default kosong) dan inversnya melepas; nilai sama tanpa invers', async () => {
    const f = fixture();
    const tx = beginTransaction(f.doc, { sessionId: 's' });
    const r = tx.add(f.home, { type: 'rect', name: 'Kotak', width: 10, height: 10 });
    const doc = tx.commit('rect').doc;
    const { done } = await roundTrip(doc, [{ op: 'setComponent', id: r, component: { props: [], slots: [] } }]);
    expect(stored(done.doc, r)!.component).toEqual({ props: [], slots: [] });
    expect(done.inverse).toEqual([{ op: 'setComponent', id: r, component: null }]);
    const same = await run(done.doc, [{ op: 'setComponent', id: r, component: { props: [], slots: [] } }]);
    expect(same.inverse).toEqual([]);
  });

  it('board, instance, slot non-frame, slot akar, bind di luar master → SCHEMA_INVALID', async () => {
    const f = fixture();
    const bad = async (id: string, component: unknown) => (await rejects(run(f.doc, [{ op: 'setComponent', id, component }]))).code;
    expect(await bad(f.home, { props: [], slots: [] })).toBe('SCHEMA_INVALID');
    expect(await bad(f.i1, { props: [], slots: [] })).toBe('SCHEMA_INVALID');
    expect(await bad(f.m, { props: [], slots: [{ name: 'body', nodeId: f.t }] })).toBe('SCHEMA_INVALID');
    expect(await bad(f.m, { props: [], slots: [{ name: 'body', nodeId: f.m }] })).toBe('SCHEMA_INVALID');
    expect(await bad(f.m, { props: [{ name: 'x', type: 'text', default: '', binds: [{ nodeId: f.home, prop: 'content' }] }], slots: [] })).toBe('SCHEMA_INVALID');
    expect(await bad(f.m, { props: 'x' })).toBe('SCHEMA_INVALID');
  });

  it('null melepas status master dan men-detach instancenya di commit yang sama', async () => {
    const f = fixture();
    const { done } = await roundTrip(f.doc, [{ op: 'setComponent', id: f.m, component: null }]);
    expect(stored(done.doc, f.m)!.component).toBeUndefined();
    expect(instancesOf(done.doc, f.m)).toEqual([]);
    expect(stored(done.doc, f.i1)).toBeUndefined();
  });
});

describe('override lewat alamat komposit', () => {
  it('update I/T menjadi override; master berubah tanpa menimpa override; invers resetOverride', async () => {
    const f = fixture();
    const addr = `${f.i1}/${f.t}`;
    const { done } = await roundTrip(f.doc, [{ op: 'update', id: addr, patch: { content: 'Promo' } }]);
    expect(stored(done.doc, f.i1)!.overrides).toEqual({ [f.t]: { content: 'Promo' } });
    expect(done.inverse).toEqual([{ op: 'resetOverride', id: addr, props: ['content'] }]);
    const edited = await run(done.doc, [{ op: 'update', id: f.t, patch: { content: 'Baru', color: '#FF0000' } }]);
    expect(effective(edited.doc, addr)).toMatchObject({ content: 'Promo', color: '#FF0000' });
    expect(effective(edited.doc, `${f.i2}/${f.t}`)).toMatchObject({ content: 'Halo', color: '#FF0000' });
  });

  it('override yang sudah ada: invers memulihkan nilai lama per properti', async () => {
    const f = fixture();
    const addr = `${f.i1}/${f.t}`;
    const first = await run(f.doc, [{ op: 'update', id: addr, patch: { content: 'A' } }]);
    const { done } = await roundTrip(first.doc, [{ op: 'update', id: addr, patch: { content: 'B', size: 20 } }]);
    expect(done.inverse).toEqual([
      { op: 'update', id: addr, patch: { content: 'A' } },
      { op: 'resetOverride', id: addr, props: ['size'] },
    ]);
  });

  it('update instance: kunci instance ke instance, kunci node menjadi override akar', async () => {
    const f = fixture();
    const fills = [{ type: 'solid', color: '#FEF3C7' }];
    const { done } = await roundTrip(f.doc, [{ op: 'update', id: f.i1, patch: { name: 'Kartu promo', fills } }]);
    const inst = stored(done.doc, f.i1)!;
    expect(inst.name).toBe('Kartu promo');
    expect(inst.overrides).toEqual({ [f.m]: { fills } });
    expect(effective(done.doc, f.i1)).toMatchObject({ name: 'Kartu promo', fills });
  });

  it('alamat tak ada → NOT_FOUND; nilai/kunci tidak sah → SCHEMA_INVALID; tidak ada jejak', async () => {
    const f = fixture();
    expect((await rejects(run(f.doc, [{ op: 'update', id: `${f.i1}/Zzzzzzzz`, patch: { content: 'x' } }]))).code).toBe('NOT_FOUND');
    expect((await rejects(run(f.doc, [{ op: 'update', id: `${f.t}/${f.t}`, patch: { content: 'x' } }]))).code).toBe('NOT_FOUND');
    for (const patch of [{ size: -1 }, { children: [] }, { component: { props: [], slots: [] } }, { bogus: 1 }, { type: 'rect' }]) {
      expect((await rejects(run(f.doc, [{ op: 'update', id: `${f.i1}/${f.t}`, patch }]))).code).toBe('SCHEMA_INVALID');
    }
    expect((await rejects(run(f.doc, [{ op: 'update', id: f.i1, patch: { size: 'besar' } }]))).code).toBe('SCHEMA_INVALID');
  });

  it('master berganti tipe: override basi diabaikan, commit sukses, dilaporkan', async () => {
    const f = fixture();
    const o = await run(f.doc, [{ op: 'update', id: `${f.i1}/${f.t}`, patch: { content: 'Promo', name: 'Judul promo' } }]);
    const r = await run(o.doc, [{ op: 'replace', id: f.t, node: { type: 'rect', name: 'Garis', width: 10, height: 2 } }]);
    const eff = effective(r.doc, `${f.i1}/${f.t}`)!;
    expect(eff.type).toBe('rect');
    expect(eff.content).toBeUndefined();
    expect(eff.name).toBe('Judul promo');
    const issues = instanceIssues(resolveDocument(r.doc));
    expect(issues.some((i) => i.instanceId === f.i1 && i.kind === 'override' && i.key === f.t && i.detail.includes('content'))).toBe(true);
    // bind prop text ke content juga tidak lagi sah untuk rect: diabaikan dan dilaporkan.
    expect(issues.some((i) => i.kind === 'bind')).toBe(true);
  });

  it('applyOps: ref di segmen pertama alamat komposit', async () => {
    const f = fixture();
    const r = await run(f.doc, [
      { op: 'add', parentId: f.home, node: { type: 'instance', name: 'Baru', componentId: f.m }, ref: 'k' },
      { op: 'update', id: `@k/${f.t}`, patch: { content: 'Lewat ref' } },
    ]);
    expect(effective(r.doc, `${r.value.refs.k}/${f.t}`)!.content).toBe('Lewat ref');
  });
});

describe('resetOverride', () => {
  it('per properti, seluruh entri, kunci yatim; invers = peta overrides lama', async () => {
    const f = fixture();
    const addr = `${f.i1}/${f.t}`;
    const o = await run(f.doc, [
      { op: 'update', id: addr, patch: { content: 'A', size: 20 } },
      { op: 'update', id: f.i1, patch: { overrides: { [f.t]: { content: 'A', size: 20 }, Gone1234: { content: 'x' } } } },
    ]);
    const one = await roundTrip(o.doc, [{ op: 'resetOverride', id: addr, props: ['size'] }]);
    expect(stored(one.done.doc, f.i1)!.overrides[f.t]).toEqual({ content: 'A' });
    expect(one.done.inverse).toEqual([{ op: 'update', id: f.i1, patch: { overrides: stored(o.doc, f.i1)!.overrides } }]);
    const all = await roundTrip(o.doc, [{ op: 'resetOverride', id: addr }, { op: 'resetOverride', id: `${f.i1}/Gone1234` }]);
    expect(stored(all.done.doc, f.i1)!.overrides).toBeUndefined();
    expect(effective(all.done.doc, addr)!.content).toBe('Halo');
    const none = await run(o.doc, [{ op: 'resetOverride', id: f.i2 }]);
    expect(none.inverse).toEqual([]);
  });

  it('bukan instance / props salah → SCHEMA_INVALID; tidak ada → NOT_FOUND', async () => {
    const f = fixture();
    expect((await rejects(run(f.doc, [{ op: 'resetOverride', id: f.t }]))).code).toBe('SCHEMA_INVALID');
    expect((await rejects(run(f.doc, [{ op: 'resetOverride', id: f.i1, props: [] }]))).code).toBe('SCHEMA_INVALID');
    expect((await rejects(run(f.doc, [{ op: 'resetOverride', id: 'Zzzzzzzz' }]))).code).toBe('NOT_FOUND');
  });
});

describe('slot', () => {
  it('add ke I/B mengisi slot; node terakhir keluar menghapus kunci slot; invers bolak-balik', async () => {
    const f = fixture();
    const slot = `${f.i1}/${f.b}`;
    const added = await roundTrip(f.doc, [{ op: 'add', parentId: slot, node: { type: 'text', name: 'Isi A', content: 'Halo slot', size: 14 }, ref: 's' }]);
    const sid = added.done.value.refs.s!;
    expect(stored(added.done.doc, f.i1)!.slots).toEqual({ body: [expect.objectContaining({ id: sid })] });
    expect(effective(added.done.doc, `${f.i1}/${f.b}`)!.children.map((c: Raw) => c.id)).toEqual([sid]);
    expect(added.done.created.map((c) => c.id)).toEqual([sid]);
    const out = await roundTrip(added.done.doc, [{ op: 'move', id: sid, parentId: f.home }]);
    expect(stored(out.done.doc, f.i1)!.slots).toBeUndefined();
    const back = await roundTrip(out.done.doc, [{ op: 'move', id: sid, parentId: slot, index: 0 }]);
    expect(stored(back.done.doc, f.i1)!.slots.body[0].id).toBe(sid);
    // isi slot bisa di-update, diduplikasi (ID baru), dan dihapus lewat ID tersimpannya.
    const dup = await roundTrip(added.done.doc, [{ op: 'update', id: sid, patch: { content: 'X' } }, { op: 'duplicate', id: sid, ref: 'd' }]);
    expect(stored(dup.done.doc, f.i1)!.slots.body.map((n: Raw) => n.content)).toEqual(['X', 'X']);
    await roundTrip(added.done.doc, [{ op: 'remove', id: sid }]);
  });

  it('alamat bukan slot, board ke slot, atau pindah ke slot di dalam dirinya → SCHEMA_INVALID', async () => {
    const f = fixture();
    const text = { type: 'text', name: 'x', content: 'x', size: 12 };
    expect((await rejects(run(f.doc, [{ op: 'add', parentId: `${f.i1}/${f.t}`, node: text }]))).code).toBe('SCHEMA_INVALID');
    expect((await rejects(run(f.doc, [{ op: 'add', parentId: `${f.i1}/${f.b}`, node: boardIn() }]))).code).toBe('SCHEMA_INVALID');
    expect((await rejects(run(f.doc, [{ op: 'move', id: f.i1, parentId: `${f.i1}/${f.b}` }]))).code).toBe('SCHEMA_INVALID');
    expect((await rejects(run(f.doc, [{ op: 'add', parentId: `Zzzzzzzz/${f.b}`, node: text }]))).code).toBe('NOT_FOUND');
  });

  it('isi slot yatim (nama slot hilang dari master): remove dan move tetap punya invers', async () => {
    const f = fixture();
    const a = await run(f.doc, [{ op: 'add', parentId: `${f.i1}/${f.b}`, node: { type: 'text', name: 'Isi A', content: 'A', size: 14 }, ref: 's' }]);
    const sid = a.value.refs.s!;
    const orphan = await run(a.doc, [{ op: 'setComponent', id: f.m, component: { props: [], slots: [] } }]);
    await roundTrip(orphan.doc, [{ op: 'remove', id: sid }]);
    await roundTrip(orphan.doc, [{ op: 'move', id: sid, parentId: f.home }]);
  });
});

describe('detach dan hapus master', () => {
  it('detach: node biasa ber-ID baru dengan tampilan sama, isi slot ID tetap; invers mengembalikan instance', async () => {
    const f = fixture();
    const prep = await run(f.doc, [
      { op: 'update', id: `${f.i1}/${f.t}`, patch: { content: 'Promo' } },
      { op: 'add', parentId: `${f.i1}/${f.b}`, node: { type: 'text', name: 'Isi A', content: 'A', size: 14 }, ref: 's' },
    ]);
    const before = effective(prep.doc, f.i1);
    const { done } = await roundTrip(prep.doc, [{ op: 'detach', id: f.i1, ref: 'd' }]);
    const nid = done.value.refs.d!;
    expect(nid).not.toBe(f.i1);
    const node = stored(done.doc, nid)!;
    expect(node.type).toBe('frame');
    expect(node.component).toBeUndefined();
    expect(shape(effective(done.doc, nid))).toEqual(shape(before));
    expect(node.children[0].content).toBe('Promo');
    expect(node.children[1].children[0].id).toBe(prep.value.refs.s);
    expect(stored(done.doc, f.i1)).toBeUndefined();
    expect(done.inverse[0]).toEqual({ op: 'remove', id: nid });
  });

  it('detach bukan instance → SCHEMA_INVALID; instance tersembunyi prop sendiri → null, dihapus', async () => {
    const f = fixture();
    expect((await rejects(run(f.doc, [{ op: 'detach', id: f.t }]))).code).toBe('SCHEMA_INVALID');
    const def = {
      props: [{ name: 'show', type: 'boolean', default: true, binds: [{ nodeId: f.m, prop: 'visible' }] }],
      slots: [{ name: 'body', nodeId: f.b }],
    };
    const hid = await run(f.doc, [{ op: 'setComponent', id: f.m, component: def }, { op: 'update', id: f.i1, patch: { props: { show: false } } }]);
    const tx = beginTransaction(hid.doc, { sessionId: 's' });
    expect(tx.detach(f.i1)).toBeNull();
    tx.rollback();
    await roundTrip(hid.doc, [{ op: 'detach', id: f.i1 }]);
  });

  it('remove master men-detach semua instance dalam satu rev; invers mengembalikan master dan instance (ID sama)', async () => {
    const f = fixture();
    const prep = await run(f.doc, [{ op: 'update', id: `${f.i2}/${f.t}`, patch: { content: 'Dua' } }]);
    const before = [effective(prep.doc, f.i1), effective(prep.doc, f.i2)].map(shape);
    const { done } = await roundTrip(prep.doc, [{ op: 'remove', id: f.m }]);
    expect(done.doc.rev).toBe(prep.doc.rev + 1);
    expect(stored(done.doc, f.m)).toBeUndefined();
    expect(instancesOf(done.doc, f.m)).toEqual([]);
    const home = done.doc.pages[0]!.children[0]!;
    expect(home.children.map((c) => c.type)).toEqual(['frame', 'frame']);
    expect(home.children.map((c) => shape(effective(done.doc, c.id)))).toEqual(before);
  });

  it('replace master tanpa component dan update {component:null} juga men-detach', async () => {
    const f = fixture();
    const r = await roundTrip(f.doc, [{ op: 'replace', id: f.m, node: { type: 'frame', name: 'Bukan master', layout: 'row' } }]);
    expect(instancesOf(r.done.doc, f.m)).toEqual([]);
    const u = await roundTrip(f.doc, [{ op: 'update', id: f.m, patch: { component: null } }]);
    expect(instancesOf(u.done.doc, f.m)).toEqual([]);
  });

  it('instance di dalam master lain: kunci override instance luar dipetakan, teks override tetap', async () => {
    const f = fixture();
    const tx = beginTransaction(f.doc, { sessionId: 's', random: seeded(9) });
    const n = tx.add(f.home, { type: 'frame', name: 'Daftar', layout: 'column' });
    const j = tx.add(n, { type: 'instance', name: 'Kartu dalam', componentId: f.m });
    tx.setComponent(n, { props: [{ name: 'tampil', type: 'boolean', default: true, binds: [{ nodeId: j, prop: 'visible' }] }], slots: [] });
    const x = tx.add(f.home, { type: 'instance', name: 'Daftar A', componentId: n });
    tx.update(`${x}/${j}/${f.t}`, { content: 'Dari luar' });
    const doc = tx.commit('nested').doc;
    expect(stored(doc, x)!.overrides).toEqual({ [`${j}/${f.t}`]: { content: 'Dari luar' } });
    const { done } = await roundTrip(doc, [{ op: 'remove', id: f.m }]);
    const newJ = stored(done.doc, n)!.children[0];
    expect(newJ.type).toBe('frame');
    const newT = newJ.children[0].id;
    expect(stored(done.doc, x)!.overrides).toEqual({ [newT]: { content: 'Dari luar' } });
    expect(stored(done.doc, n)!.component.props[0].binds[0].nodeId).toBe(newJ.id);
    expect(effective(done.doc, `${x}/${newT}`)!.content).toBe('Dari luar');
    expect(instanceIssues(resolveDocument(done.doc))).toEqual([]);
  });

  it('remove frame yang memuat master dan instancenya sendiri: hanya instance di luar yang di-detach', async () => {
    const f = fixture();
    const tx = beginTransaction(f.doc, { sessionId: 's' });
    const wrap = tx.add(f.home, { type: 'frame', name: 'Bungkus', layout: 'column' });
    tx.move(f.m, wrap);
    const inner = tx.add(wrap, { type: 'instance', name: 'Dalam', componentId: f.m });
    const doc = tx.commit('wrap').doc;
    const { done } = await roundTrip(doc, [{ op: 'remove', id: wrap }]);
    expect(stored(done.doc, inner)).toBeUndefined();
    expect(instancesOf(done.doc, f.m)).toEqual([]);
    expect(done.doc.pages[0]!.children[0]!.children.map((c) => c.type)).toEqual(['frame', 'frame']);
  });
});

describe('pohon dan alamat', () => {
  it('alamat komposit di move/remove/replace/duplicate/detach/setComponent → SCHEMA_INVALID dengan hint', async () => {
    const f = fixture();
    const addr = `${f.i1}/${f.t}`;
    for (const o of [
      { op: 'remove', id: addr },
      { op: 'move', id: addr, parentId: f.home },
      { op: 'replace', id: addr, node: { type: 'rect', name: 'r' } },
      { op: 'duplicate', id: addr },
      { op: 'detach', id: addr },
      { op: 'setComponent', id: addr, component: null },
    ]) {
      const e = await rejects(run(f.doc, [o]));
      expect(e.code).toBe('SCHEMA_INVALID');
      expect(e.hint).toContain('update(alamat, patch)');
    }
  });

  it('duplicate master: bind/slot menunjuk salinan; duplicate instance berisi slot: ID isi slot baru', async () => {
    const f = fixture();
    const d = await run(f.doc, [{ op: 'duplicate', id: f.m, ref: 'm2' }]);
    const m2 = stored(d.doc, d.value.refs.m2!)!;
    const [t2, b2] = m2.children.map((c: Raw) => c.id);
    expect(m2.component.props[0].binds[0].nodeId).toBe(t2);
    expect(m2.component.slots[0].nodeId).toBe(b2);
    const s = await run(f.doc, [{ op: 'add', parentId: `${f.i1}/${f.b}`, node: { type: 'text', name: 'Isi', content: 'A', size: 12 }, ref: 's' }]);
    const di = await run(s.doc, [{ op: 'duplicate', id: f.i1, ref: 'c' }]);
    const copy = stored(di.doc, di.value.refs.c!)!;
    expect(copy.slots.body[0].id).not.toBe(s.value.refs.s);
    // Review k3: duplicate dengan patch (mis. geser) juga memberi ID baru ke isi slot salinan.
    const dp = await roundTrip(s.doc, [{ op: 'duplicate', id: f.i1, patch: { name: 'Kartu A salinan' }, ref: 'c' }]);
    const copy2 = stored(dp.done.doc, dp.done.value.refs.c!)!;
    expect(copy2.name).toBe('Kartu A salinan');
    expect(copy2.slots.body[0].id).not.toBe(s.value.refs.s);
  });

  it('setComponent pada node di dalam master, memuat master, atau di isi slot → SCHEMA_INVALID di op (bisa ditangkap)', async () => {
    const f = fixture();
    const nested = await rejects(run(f.doc, [{ op: 'setComponent', id: f.b, component: { props: [], slots: [] } }]));
    expect(nested.code).toBe('SCHEMA_INVALID');
    expect(nested.message).toContain(`ops[0] setComponent`);
    expect(nested.message).toContain(`di dalam master ${f.m}`);
    const tx = beginTransaction(f.doc, { sessionId: 's' });
    const wrap = tx.add(f.home, { type: 'frame', name: 'Bungkus' });
    tx.move(f.m, wrap);
    expect(() => tx.setComponent(wrap, { props: [], slots: [] })).toThrow(/memuat master/);
    const s = tx.add(`${f.i1}/${f.b}`, { type: 'frame', name: 'Di slot' });
    expect(() => tx.setComponent(s, { props: [], slots: [] })).toThrow(/isi slot/);
    // op yang gagal tidak meninggalkan jejak; transaksi tetap bisa di-commit.
    expect(tx.commit('tetap sah').entry).not.toBeNull();
  });
});
