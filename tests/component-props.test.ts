// Props dan slot panel komponen (epic komponen story 5): op dari componentProps.ts dijalankan lewat `applyOps` core
// sungguhan (tanpa daemon) supaya lolos validasi Transaction; hasilnya dicek pada `resolveDocument` (yang dirender
// canvas) dan invers setiap langkah mengembalikan dokumen persis (AD-8).
import { describe, expect, it } from 'vitest';
import { resolveDocument, type DocOp, type LakarDocument } from '../packages/schema/src/index.ts';
import { applyOps, beginTransaction, createDocument, transact } from '../packages/core/src/index.ts';
import { componentInfo } from '../packages/viewer/src/componentModel.ts';
import {
  addPropOps,
  addSlotOps,
  instanceModel,
  masterDef,
  moveCandidates,
  removePropOps,
  removeSlotOps,
  renameSlotOps,
  setInstancePropOps,
  slotAddOp,
  slotMoveOp,
  updatePropOps,
} from '../packages/viewer/src/componentProps.ts';
import { nodeProps } from '../packages/viewer/src/codegen.ts';

const seeded = (seed: number) => {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x1_0000_0000);
};

/** Board B: master Card (Title, Tag, Body{Inner}), instance I1 dan I2, rect Loose. */
function fixture() {
  const tx = beginTransaction(createDocument(seeded(1)), { sessionId: 's', random: seeded(2) });
  const b = tx.add(null, { type: 'board', name: 'Home', x: 0, y: 0, width: 800, height: 600, screen: 'app' });
  const card = tx.add(b, { type: 'frame', name: 'Card', layout: 'column', fills: [{ type: 'solid', color: '#FFFFFF' }] });
  const title = tx.add(card, { type: 'text', name: 'Title', content: 'Brand', size: 16 });
  const tag = tx.add(card, { type: 'rect', name: 'Tag', width: 20, height: 10 });
  const body = tx.add(card, { type: 'frame', name: 'Body', layout: 'column' });
  const inner = tx.add(body, { type: 'text', name: 'Inner', content: 'Default', size: 12 });
  tx.setComponent(card, { props: [], slots: [] });
  const i1 = tx.add(b, { type: 'instance', name: 'Card', componentId: card });
  const i2 = tx.add(b, { type: 'instance', name: 'Card', componentId: card });
  const loose = tx.add(b, { type: 'rect', name: 'Loose', width: 30, height: 30 });
  const doc = tx.commit('fixture').doc;
  return { doc, ids: { b, card, title, tag, body, inner, i1, i2, loose } };
}

const run = (doc: LakarDocument, ops: DocOp[]) => transact(doc, { sessionId: 'lakar-viewer', description: 'ops' }, (tx) => applyOps(tx, ops));
const content = (d: LakarDocument) => ({ pages: d.pages, tokens: d.tokens ?? {}, tokenModes: d.tokenModes });
async function roundTrip(doc: LakarDocument, ops: DocOp[] | { error: string } | undefined) {
  if (!ops || !Array.isArray(ops)) throw new Error(`tanpa op: ${JSON.stringify(ops)}`);
  const done = await run(doc, ops);
  expect(done.doc.rev).toBe(doc.rev + 1);
  const undone = await run(done.doc, done.inverse);
  expect(content(undone.doc)).toEqual(content(doc));
  const redone = await run(undone.doc, undone.inverse);
  expect(content(redone.doc)).toEqual(content(done.doc));
  return done;
}
/** Node hasil resolveDocument berdasarkan alamat (dokumen yang dirender canvas). */
const resolved = (doc: LakarDocument, id: string): Record<string, any> | undefined => {
  const walk = (n: any): any => (n.id === id ? n : (n.children ?? []).map(walk).find(Boolean));
  for (const p of resolveDocument(doc).pages) for (const b of p.children) {
    const hit = walk(b);
    if (hit) return hit;
  }
  return undefined;
};

describe('props komponen lewat applyOps core', () => {
  it('text: tambah (bind otomatis) lalu nilai per instance hanya mengubah instance itu', async () => {
    const { doc, ids } = fixture();
    const added = addPropOps(doc, ids.card, 'text')!;
    expect(added.name).toBe('title');
    const d1 = (await roundTrip(doc, added.ops)).doc;
    expect(masterDef(d1, ids.card)!.props).toEqual([{ name: 'title', type: 'text', default: 'Brand', binds: [{ nodeId: ids.title, prop: 'content' }] }]);
    const d2 = (await roundTrip(d1, setInstancePropOps(d1, componentInfo(d1), ids.i1, 'title', 'Digital'))).doc;
    expect(resolved(d2, `${ids.i1}/${ids.title}`)!.content).toBe('Digital');
    expect(resolved(d2, `${ids.i2}/${ids.title}`)!.content).toBe('Brand');
    expect(resolved(d2, ids.title)!.content).toBe('Brand');
    // Nilai kembali ke default → kunci dibuang (props:null).
    const d3 = (await roundTrip(d2, setInstancePropOps(d2, componentInfo(d2), ids.i1, 'title', 'Brand'))).doc;
    expect(componentInfo(d3).instances.get(ids.i1)!.props).toBeUndefined();
  });

  it('boolean: bind visible menyembunyikan node terikat di instance', async () => {
    const { doc, ids } = fixture();
    const d1 = (await roundTrip(doc, addPropOps(doc, ids.card, 'boolean')!.ops)).doc;
    const d2 = (await roundTrip(d1, updatePropOps(d1, componentInfo(d1), ids.card, 'show', { binds: [{ nodeId: ids.tag, prop: 'visible' }] }))).doc;
    const d3 = (await roundTrip(d2, setInstancePropOps(d2, componentInfo(d2), ids.i1, 'show', false))).doc;
    expect(resolved(d3, `${ids.i1}/${ids.tag}`)).toBeUndefined();
    expect(resolved(d3, `${ids.i2}/${ids.tag}`)).toBeDefined();
    expect(instanceModel(d3, componentInfo(d3), ids.i1)!.props[0]).toMatchObject({ name: 'show', value: false, visibility: true });
  });

  it('enum: bind ke align mengganti options bawaan; option lain mengubah nilai terikat', async () => {
    const { doc, ids } = fixture();
    const d1 = (await roundTrip(doc, addPropOps(doc, ids.card, 'enum')!.ops)).doc;
    const d2 = (await roundTrip(d1, updatePropOps(d1, componentInfo(d1), ids.card, 'variant', { binds: [{ nodeId: ids.title, prop: 'align' }] }))).doc;
    expect(masterDef(d2, ids.card)!.props[0]).toMatchObject({ options: ['left', 'center', 'right', 'justify'], default: 'left' });
    const d3 = (await roundTrip(d2, setInstancePropOps(d2, componentInfo(d2), ids.i2, 'variant', 'center'))).doc;
    expect(resolved(d3, `${ids.i2}/${ids.title}`)!.align).toBe('center');
    expect(resolved(d3, `${ids.i1}/${ids.title}`)!.align).toBe('left');
  });

  it('enum ke layout akar: options Layout, default = nilai master; nilai instance mengubah layout', async () => {
    const { doc, ids } = fixture();
    const d1 = (await roundTrip(doc, addPropOps(doc, ids.card, 'enum')!.ops)).doc;
    const d2 = (await roundTrip(d1, updatePropOps(d1, componentInfo(d1), ids.card, 'variant', { binds: [{ nodeId: ids.card, prop: 'layout' }] }))).doc;
    expect(masterDef(d2, ids.card)!.props[0]).toMatchObject({ options: ['none', 'row', 'column', 'grid'], default: 'column' });
    const d3 = (await roundTrip(d2, setInstancePropOps(d2, componentInfo(d2), ids.i1, 'variant', 'row'))).doc;
    expect(resolved(d3, ids.i1)!.layout).toBe('row');
    expect(resolved(d3, ids.i2)!.layout).toBe('column');
  });

  it('nilai prop bertahan saat master berubah; override menang atas prop; default baru berlaku untuk instance tanpa nilai', async () => {
    const { doc, ids } = fixture();
    const d1 = (await roundTrip(doc, addPropOps(doc, ids.card, 'text')!.ops)).doc;
    const d2 = (await roundTrip(d1, setInstancePropOps(d1, componentInfo(d1), ids.i1, 'title', 'Digital'))).doc;
    // Master berubah (ukuran dan isi teks terikat): nilai prop instance tetap.
    const d3 = (await run(d2, [{ op: 'update', id: ids.title, patch: { size: 24, content: 'Changed' } }])).doc;
    expect(resolved(d3, `${ids.i1}/${ids.title}`)).toMatchObject({ content: 'Digital', size: 24 });
    // Default baru berlaku untuk instance tanpa nilai sendiri.
    const d4 = (await roundTrip(d3, updatePropOps(d3, componentInfo(d3), ids.card, 'title', { default: 'Fresh' }))).doc;
    expect(resolved(d4, `${ids.i2}/${ids.title}`)!.content).toBe('Fresh');
    expect(resolved(d4, `${ids.i1}/${ids.title}`)!.content).toBe('Digital');
    // Override content menang atas prop; reset override → nilai prop kembali.
    const d5 = (await roundTrip(d4, [{ op: 'update', id: `${ids.i1}/${ids.title}`, patch: { content: 'Override' } }])).doc;
    expect(resolved(d5, `${ids.i1}/${ids.title}`)!.content).toBe('Override');
    const d6 = (await roundTrip(d5, [{ op: 'resetOverride', id: `${ids.i1}/${ids.title}`, props: ['content'] }])).doc;
    expect(resolved(d6, `${ids.i1}/${ids.title}`)!.content).toBe('Digital');
  });

  it('rename memindah nilai instance; hapus membersihkannya', async () => {
    const { doc, ids } = fixture();
    const d1 = (await roundTrip(doc, addPropOps(doc, ids.card, 'text')!.ops)).doc;
    const d2 = (await roundTrip(d1, setInstancePropOps(d1, componentInfo(d1), ids.i1, 'title', 'X'))).doc;
    const d3 = (await roundTrip(d2, updatePropOps(d2, componentInfo(d2), ids.card, 'title', { name: 'heading' }))).doc;
    expect(componentInfo(d3).instances.get(ids.i1)!.props).toEqual({ heading: 'X' });
    expect(resolved(d3, `${ids.i1}/${ids.title}`)!.content).toBe('X');
    const d4 = (await roundTrip(d3, removePropOps(d3, componentInfo(d3), ids.card, 'heading'))).doc;
    expect(masterDef(d4, ids.card)!.props).toEqual([]);
    expect(componentInfo(d4).instances.get(ids.i1)!.props).toBeUndefined();
  });
});

describe('slot komponen lewat applyOps core', () => {
  it('tandai slot, sisip dan pindah ke slot instance, isi bertahan saat master berubah, rename memindah isi', async () => {
    const { doc, ids } = fixture();
    const marked = addSlotOps(doc, ids.card, ids.body)!;
    expect(marked.name).toBe('body');
    const d1 = (await roundTrip(doc, marked.ops)).doc;
    const address = `${ids.i1}/${ids.body}`;
    const added = await roundTrip(d1, [slotAddOp(address, nodeProps('text'))]);
    const t = added.value.refs.slotted!;
    const d2 = added.doc;
    expect(instanceModel(d2, componentInfo(d2), ids.i1)!.slots[0]).toMatchObject({ name: 'body', filled: true, text: '1 layer' });
    expect(instanceModel(d2, componentInfo(d2), ids.i2)!.slots[0]).toMatchObject({ filled: false, text: 'Default · 1 layer' });
    expect(moveCandidates(d2, componentInfo(d2), ids.i1).map((c) => c.id)).toEqual([ids.i2, ids.loose]);
    const d3 = (await roundTrip(d2, [slotMoveOp(ids.loose, address)])).doc;
    expect(resolved(d3, address)!.children.map((c: { id: string }) => c.id)).toEqual([t, ids.loose]);
    // Master berubah → isi slot instance tetap.
    const d4 = (await run(d3, [{ op: 'update', id: ids.card, patch: { fills: [{ type: 'solid', color: '#FF0000' }] } }])).doc;
    expect(resolved(d4, address)!.children.map((c: { id: string }) => c.id)).toEqual([t, ids.loose]);
    expect(resolved(d4, ids.i1)!.fills).toEqual([{ type: 'solid', color: '#FF0000' }]);
    const d5 = (await roundTrip(d4, renameSlotOps(d4, componentInfo(d4), ids.card, 'body', 'content'))).doc;
    expect(Object.keys(componentInfo(d5).instances.get(ids.i1)!.slots as object)).toEqual(['content']);
    expect(resolved(d5, address)!.children.map((c: { id: string }) => c.id)).toEqual([t, ids.loose]);
    // Lepas slot: isi slot instance menjadi yatim (tidak tampil), frame kembali ke isi master; undo memulihkannya.
    const d6 = (await roundTrip(d5, removeSlotOps(d5, ids.card, 'content'))).doc;
    expect(resolved(d6, address)!.children.map((c: { id: string }) => c.id)).toEqual([`${ids.i1}/${ids.inner}`]);
  });
});
