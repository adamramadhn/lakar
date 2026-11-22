// Aksi edit canvas (editor-canvas story 6): plan dari editActions.ts dijalankan lewat `applyOps` core sungguhan
// (tanpa daemon) supaya op lolos validasi Transaction, mendarat di tempat yang benar, dan inversnya (AD-8)
// mengembalikan dokumen persis — juga bila agen mengubah node lain di antaranya.
import { describe, expect, it } from 'vitest';
import type { DocOp, LakarDocument } from '../packages/schema/src/index.ts';
import { applyOps, beginTransaction, createDocument, transact } from '../packages/core/src/index.ts';
import { planAction, textEditPlan, type EditAction, type EditPlan } from '../packages/viewer/src/editActions.ts';
import type { Box, GeoNode } from '../packages/viewer/src/gesture.ts';

const seeded = (seed: number) => {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x1_0000_0000);
};

/** Board B1 (100,100): A, C absolut; Row R (R1..R3); frame F `none` absolut (F1, F2). Board B2 (600,100). */
function fixture() {
  const tx = beginTransaction(createDocument(seeded(1)), { sessionId: 's', random: seeded(2) });
  const b1 = tx.add(null, { type: 'board', name: 'Home', x: 100, y: 100, width: 400, height: 300, screen: 'app' });
  const a = tx.add(b1, { type: 'rect', name: 'A', position: 'absolute', x: 20, y: 30, width: 50, height: 40 });
  const c = tx.add(b1, { type: 'rect', name: 'C', position: 'absolute', x: 100, y: 50, width: 60, height: 20 });
  const r = tx.add(b1, { type: 'frame', name: 'Row', layout: 'row' });
  const r1 = tx.add(r, { type: 'rect', name: 'R1', width: 100, height: 100 });
  const r2 = tx.add(r, { type: 'rect', name: 'R2', width: 100, height: 100 });
  const r3 = tx.add(r, { type: 'text', name: 'R3', content: 'Hi', size: 16 });
  const f = tx.add(b1, { type: 'frame', name: 'F', position: 'absolute', x: 200, y: 200, width: 100, height: 80 });
  const f1 = tx.add(f, { type: 'rect', name: 'F1', x: 10, y: 10, width: 20, height: 20 });
  const f2 = tx.add(f, { type: 'rect', name: 'F2', x: 50, y: 40, width: 30, height: 30 });
  const b2 = tx.add(null, { type: 'board', name: 'Second', x: 600, y: 100, width: 200, height: 200, screen: 'app' });
  const doc = tx.commit('fixture').doc;
  const ids = { b1, a, c, r, r1, r2, r3, f, f1, f2, b2 };
  return { doc, ids, scene: sceneOf(ids) };
}

/** Geometri yang akan diukur canvas untuk fixture (koordinat halaman). */
function sceneOf(id: Record<string, string>): GeoNode[] {
  const n = (key: string, box: Box, o: Partial<GeoNode> = {}): GeoNode => ({ id: id[key]!, type: 'rect', name: key, box, parentId: undefined, absolute: false, x: 0, y: 0, layout: undefined, children: [], ...o });
  const link = (p: GeoNode): GeoNode => {
    for (const c of p.children) {
      c.parentId = p.id;
      link(c);
    }
    return p;
  };
  return [
    link(
      n('b1', { x: 100, y: 100, w: 400, h: 300 }, {
        type: 'board',
        absolute: true,
        x: 100,
        y: 100,
        layout: 'column',
        children: [
          n('a', { x: 120, y: 130, w: 50, h: 40 }, { absolute: true, x: 20, y: 30 }),
          n('c', { x: 200, y: 150, w: 60, h: 20 }, { absolute: true, x: 100, y: 50 }),
          n('r', { x: 100, y: 100, w: 400, h: 100 }, {
            type: 'frame',
            layout: 'row',
            children: [n('r1', { x: 100, y: 100, w: 100, h: 100 }), n('r2', { x: 200, y: 100, w: 100, h: 100 }), n('r3', { x: 300, y: 100, w: 20, h: 20 }, { type: 'text' })],
          }),
          n('f', { x: 300, y: 300, w: 100, h: 80 }, {
            type: 'frame',
            layout: 'none',
            absolute: true,
            x: 200,
            y: 200,
            children: [n('f1', { x: 310, y: 310, w: 20, h: 20 }, { absolute: true, x: 10, y: 10 }), n('f2', { x: 350, y: 340, w: 30, h: 30 }, { absolute: true, x: 50, y: 40 })],
          }),
        ],
      }),
    ),
    n('b2', { x: 600, y: 100, w: 200, h: 200 }, { type: 'board', absolute: true, x: 600, y: 100, layout: 'column' }),
  ];
}

const run = (doc: LakarDocument, ops: DocOp[]) => transact(doc, { sessionId: 'lakar-viewer', description: 'ops' }, (tx) => applyOps(tx, ops));
const content = (d: LakarDocument) => ({ pages: d.pages, tokens: d.tokens ?? {}, tokenModes: d.tokenModes });
const find = (doc: LakarDocument, id: string): Record<string, any> | undefined => {
  const walk = (n: any): any => (n.id === id ? n : (n.children ?? []).map(walk).find(Boolean));
  for (const p of doc.pages) for (const b of p.children) {
    const hit = walk(b);
    if (hit) return hit;
  }
  return undefined;
};
const childIds = (doc: LakarDocument, id: string) => (find(doc, id)!.children as { id: string }[]).map((c) => c.id);

function planOf(kind: EditAction, scene: GeoNode[], ids: string[]): EditPlan {
  const p = planAction(kind, scene, ids);
  if (!p || !('ops' in p)) throw new Error(`tanpa plan: ${JSON.stringify(p)}`);
  return p;
}

/** Plan → satu commit; invers → isi semula; invers undo → isi sesudah. */
async function roundTrip(doc: LakarDocument, plan: EditPlan) {
  const done = await run(doc, plan.ops);
  expect(done.doc.rev).toBe(doc.rev + 1);
  const undone = await run(done.doc, done.inverse);
  expect(content(undone.doc)).toEqual(content(doc));
  const redone = await run(undone.doc, undone.inverse);
  expect(content(redone.doc)).toEqual(content(done.doc));
  return done;
}

describe('aksi edit lewat applyOps core', () => {
  it('group node absolut: frame Group di posisi z, anak relatif, undo/redo persis', async () => {
    const { doc, ids, scene } = fixture();
    const done = await roundTrip(doc, planOf('group', scene, [ids.c, ids.a]));
    const g = done.value.refs.group!;
    expect(childIds(done.doc, ids.b1)).toEqual([g, ids.r, ids.f]);
    expect(find(done.doc, g)).toMatchObject({ type: 'frame', layout: 'none', position: 'absolute', x: 20, y: 30, width: 140, height: 40 });
    expect(find(done.doc, ids.c)).toMatchObject({ position: 'absolute', x: 80, y: 20 });
  });

  it('group anak flow dan ungroup frame absolut / flow', async () => {
    const { doc, ids, scene } = fixture();
    const grouped = await roundTrip(doc, planOf('group', scene, [ids.r2, ids.r3]));
    expect(childIds(grouped.doc, ids.r)).toEqual([ids.r1, grouped.value.refs.group!]);
    const ung = await roundTrip(doc, planOf('ungroup', scene, [ids.f, ids.r]));
    expect(childIds(ung.doc, ids.b1)).toEqual([ids.a, ids.c, ids.r1, ids.r2, ids.r3, ids.f1, ids.f2]);
    expect(find(ung.doc, ids.f1)).toMatchObject({ position: 'absolute', x: 210, y: 210 });
    expect(find(ung.doc, ids.r1)).not.toHaveProperty('position');
  });

  it('duplicate, delete teratas, z-order, align, distribute, edit teks', async () => {
    const { doc, ids, scene } = fixture();
    const dup = await roundTrip(doc, planOf('duplicate', scene, [ids.a, ids.b2, ids.r1]));
    expect(find(dup.doc, dup.value.refs.dup0!)).toMatchObject({ x: 30, y: 40 });
    expect(find(dup.doc, dup.value.refs.dup1!)).toMatchObject({ type: 'board', x: 840 });
    expect(childIds(dup.doc, ids.r)[1]).toBe(dup.value.refs.dup2);
    const del = await roundTrip(doc, planOf('delete', scene, [ids.f1, ids.f, ids.a]));
    expect(childIds(del.doc, ids.b1)).toEqual([ids.c, ids.r]);
    const fwd = await roundTrip(doc, planOf('forward', scene, [ids.a, ids.c]));
    expect(childIds(fwd.doc, ids.b1)).toEqual([ids.r, ids.a, ids.c, ids.f]);
    const back = await roundTrip(doc, planOf('backward', scene, [ids.b2]));
    expect(back.doc.pages[0]!.children.map((b) => b.id)).toEqual([ids.b2, ids.b1]);
    const left = await roundTrip(doc, planOf('align-left', scene, [ids.a, ids.c, ids.f1]));
    expect(find(left.doc, ids.c)).toMatchObject({ x: 20 });
    expect(find(left.doc, ids.f1)).toMatchObject({ x: -180 });
    const dist = await roundTrip(doc, planOf('distribute-h', scene, [ids.a, ids.c, ids.f]));
    expect(find(dist.doc, ids.c)).toMatchObject({ x: 105 });
    const text = await roundTrip(doc, textEditPlan(ids.r3, 'R3', 'Hi', 'Hello\nworld')!);
    expect(find(text.doc, ids.r3)).toMatchObject({ content: 'Hello\nworld' });
  });

  it('undo sesudah agen menulis node lain: hanya aksi pengguna yang dibatalkan', async () => {
    const { doc, ids, scene } = fixture();
    const user = await run(doc, planOf('delete', scene, [ids.a, ids.f]).ops);
    const agent = await transact(user.doc, { sessionId: 'agent', description: 'agent edit' }, (tx) => {
      tx.update(ids.r1, { width: 222 });
      tx.add(ids.b1, { type: 'rect', name: 'Agent', width: 10, height: 10 });
    });
    const undone = await run(agent.doc, user.inverse);
    expect(childIds(undone.doc, ids.b1).slice(0, 4)).toEqual([ids.a, ids.c, ids.r, ids.f]);
    expect(find(undone.doc, ids.r1)).toMatchObject({ width: 222 });
    expect(find(undone.doc, agent.created[0]!.id)).toMatchObject({ name: 'Agent' });
    // Agen menghapus anggota group: invers group basi → NOT_FOUND, tanpa undo sebagian (viewer membuang entri, AD-8).
    const grouped = await run(doc, planOf('group', scene, [ids.a, ids.c]).ops);
    const agentDel = await transact(grouped.doc, { sessionId: 'agent', description: 'agent delete' }, (tx) => tx.remove(ids.a));
    await expect(run(agentDel.doc, grouped.inverse)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // Redo menghapus lagi tanpa menyentuh perubahan agen.
    const redone = await run(undone.doc, undone.inverse);
    expect(find(redone.doc, ids.a)).toBeUndefined();
    expect(find(redone.doc, ids.r1)).toMatchObject({ width: 222 });
  });
});
