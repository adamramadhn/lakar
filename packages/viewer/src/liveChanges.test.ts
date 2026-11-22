// Perubahan agen live (agen-di-canvas story 3): helper murni rebase gestur, pratinjau tertahan, seleksi, undo, Activity.
import { describe, expect, it } from 'vitest';
import type { DocOp } from '@lakar/schema';
import type { ActivityCall, SessionView } from './activity.ts';
import { indexGeo, moveOps, type GeoNode } from './gesture.ts';
import { commitRow, heldStatus, lastAgentLabel, missingTargets, pruneSelection, rebaseNodes, rebaseReorderNode, rebaseResize, selectionRead, shareBadgeText, undoSkippedFor, undoSkippedText } from './liveChanges.ts';

const geo = (id: string, x: number, y: number, over: Partial<GeoNode> = {}): GeoNode => ({
  id,
  type: 'rect',
  name: `N ${id}`,
  box: { x, y, w: 50, h: 20 },
  parentId: 'B1',
  absolute: true,
  x,
  y,
  layout: undefined,
  children: [],
  ...over,
});
const board = (children: GeoNode[]): GeoNode => ({ id: 'B1', type: 'board', name: 'Board', box: { x: 0, y: 0, w: 400, h: 400 }, parentId: undefined, absolute: true, x: 0, y: 0, layout: 'column', children });

describe('rebaseNodes', () => {
  it('memakai x/y terbaru: agen memindah A selama drag → commit = nilai baru + Δ', () => {
    const before = [geo('A', 100, 10)];
    const after = indexGeo([board([geo('A', 300, 10)])]);
    const nodes = rebaseNodes(before, after, (n) => n.absolute);
    expect(moveOps(nodes, 40, 0)).toEqual([{ op: 'update', id: 'A', patch: { x: 340, y: 10 } }]);
  });

  it('node yang dihapus agen keluar; semua hilang → kosong', () => {
    const before = [geo('A', 0, 0), geo('B', 10, 10)];
    expect(rebaseNodes(before, indexGeo([board([geo('B', 10, 10)])])).map((n) => n.id)).toEqual(['B']);
    expect(rebaseNodes(before, indexGeo([board([])]))).toEqual([]);
  });

  it('`keep` menyaring node yang kini tidak absolute', () => {
    const after = indexGeo([board([geo('A', 0, 0, { absolute: false })])]);
    expect(rebaseNodes([geo('A', 0, 0)], after, (n) => n.absolute)).toEqual([]);
  });
});

describe('rebaseResize', () => {
  it('from dari kotak baru, to = from + Δ pointer', () => {
    const after = indexGeo([board([geo('A', 20, 30)])]);
    const r = rebaseResize([geo('A', 0, 0)], after, 'se', { x: 10, y: 5 });
    expect(r?.from).toEqual({ x: 20, y: 30, w: 50, h: 20 });
    expect(r?.to).toEqual({ x: 20, y: 30, w: 60, h: 25 });
    expect(rebaseResize([geo('A', 0, 0)], after, 'se', undefined)?.to).toEqual({ x: 20, y: 30, w: 50, h: 20 });
  });
  it('semua anggota hilang → undefined', () => {
    expect(rebaseResize([geo('A', 0, 0)], indexGeo([board([])]), 'e', { x: 1, y: 1 })).toBeUndefined();
  });
});

describe('rebaseReorderNode', () => {
  it('masih anak flow → node baru; hilang atau absolute → undefined', () => {
    const flow = geo('A', 0, 0, { absolute: false });
    expect(rebaseReorderNode(flow, indexGeo([board([geo('A', 5, 5, { absolute: false })])]))?.box.x).toBe(5);
    expect(rebaseReorderNode(flow, indexGeo([board([])]))).toBeUndefined();
    expect(rebaseReorderNode(flow, indexGeo([board([geo('A', 0, 0)])]))).toBeUndefined();
  });
});

describe('heldStatus', () => {
  const boards = new Set(['B1', 'B2']);
  it('belum ada mount → keep; mount dari rev lama (agen duluan) → reapply; mount rev ≥ commit → release', () => {
    const h = { mounts: { B1: 2 }, rev: 8 };
    expect(heldStatus(h, { B1: 2 }, { B1: 6 }, boards)).toBe('keep');
    expect(heldStatus(h, { B1: 3 }, { B1: 7 }, boards)).toBe('reapply');
    expect(heldStatus(h, { B1: 3 }, { B1: 8 }, boards)).toBe('release');
  });
  it('rev commit belum diketahui: mount ulang → reapply; rev tiba sesudah mount rev baru → release', () => {
    expect(heldStatus({ mounts: { B1: 1 } }, { B1: 2 }, { B1: 9 }, boards)).toBe('reapply');
    expect(heldStatus({ mounts: { B1: 2 }, rev: 9 }, { B1: 2 }, { B1: 9 }, boards)).toBe('release');
  });
  it('board hilang dianggap selesai; board lain belum → keep', () => {
    expect(heldStatus({ mounts: { B3: 1 }, rev: 4 }, {}, {}, boards)).toBe('release');
    expect(heldStatus({ mounts: { B1: 1, B2: 1 }, rev: 4 }, { B1: 2, B2: 1 }, { B1: 4, B2: 3 }, boards)).toBe('keep');
  });
});

describe('pruneSelection', () => {
  const has = (ids: string[]) => (id: string) => ids.includes(id);
  it('node yang dihapus dibuang; node baru yang belum termuat tetap', () => {
    expect(pruneSelection(['A', 'B'], has(['A', 'B']), has(['B']))).toEqual(['B']);
    expect(pruneSelection(['N'], has(['A']), has(['A']))).toEqual(['N']);
  });
  it('tanpa perubahan → array yang sama', () => {
    const sel = ['A'];
    expect(pruneSelection(sel, has(['A']), has(['A']))).toBe(sel);
  });
});

describe('missingTargets', () => {
  it('id dan parentId yang hilang, urut, unik; rujukan @ dilewati', () => {
    const ops = [
      { op: 'update', id: 'Headline', patch: { x: 1 } },
      { op: 'move', id: 'Card0001', parentId: 'Gone0001', index: 0 },
      { op: 'move', id: 'Headline', parentId: '@group', index: 0 },
    ] as unknown as DocOp[];
    expect(missingTargets(ops, (id) => id === 'Card0001')).toEqual(['Headline', 'Gone0001']);
    expect(missingTargets(ops, () => true)).toEqual([]);
  });
  it('id yang dibuat entri itu sendiri (invers ungroup: insert frame lalu move ke dalamnya) bukan target hilang', () => {
    const ops = [
      { op: 'insert', parentId: 'Board001', node: { id: 'Frame001', type: 'frame', name: 'Group', children: [{ id: 'Inner001', type: 'rect', name: 'R' }] }, index: 0 },
      { op: 'move', id: 'Child001', parentId: 'Frame001', index: 0 },
      { op: 'update', id: 'Inner001', patch: { x: 1 } },
    ] as unknown as DocOp[];
    expect(missingTargets(ops, (id) => id === 'Board001')).toEqual(['Child001']);
  });
});

describe('undoSkippedFor', () => {
  const ops = [{ op: 'update', id: 'Headline', patch: { x: 1 } }] as unknown as DocOp[];
  const names = (id: string) => (id === 'Headline' ? 'Headline' : undefined);
  it('404 dengan target hilang dari dokumen terkini → skipped + nama + agen', () => {
    expect(undoSkippedFor('undo', ops, { transient: false, message: 'update: node Headline tidak ada' }, () => false, names, 'Claude Code')).toEqual({
      title: 'Undo skipped',
      description: 'Claude Code deleted “Headline” after your edit, so this step can’t be undone.',
    });
  });
  it('409 dengan target masih ada di dokumen lama (belum termuat ulang) → nama dari pesan error (batas kata)', () => {
    const r = undoSkippedFor('redo', ops, { transient: false, message: 'konflik pada Headline' }, () => true, names, undefined);
    expect(r).toEqual({ title: 'Redo skipped', description: '“Headline” was deleted after your edit, so this step can’t be redone.' });
    // Bukan kata utuh → tidak dianggap disebut.
    expect(undoSkippedFor('undo', ops, { transient: false, message: 'XHeadlineX' }, () => true, names, 'Codex')?.description).toBe('This step can’t be undone because a newer change replaced what it targets.');
  });
  it('gagal sementara (offline/5xx) → undefined (toast lama, entri kembali)', () => {
    expect(undoSkippedFor('undo', ops, { transient: true }, () => false, names, 'Claude Code')).toBeUndefined();
  });
});

describe('undoSkippedText', () => {
  it('dengan agen dan nama, hanya nama, tanpa keduanya; redo', () => {
    expect(undoSkippedText('undo', 'Claude Code', 'Headline')).toEqual({ title: 'Undo skipped', description: 'Claude Code deleted “Headline” after your edit, so this step can’t be undone.' });
    expect(undoSkippedText('undo', undefined, 'Headline').description).toBe('“Headline” was deleted after your edit, so this step can’t be undone.');
    expect(undoSkippedText('redo', 'Codex', undefined)).toEqual({ title: 'Redo skipped', description: 'This step can’t be redone because a newer change replaced what it targets.' });
  });
});

const T0 = Date.parse('2026-11-22T10:00:00.000Z');
const call = (over: Partial<ActivityCall>): ActivityCall => ({ callId: 'c', session: 's', tool: 'execute', status: 'done', startedAt: new Date(T0).toISOString(), ...over });
const view = (client: string, calls: ActivityCall[]): SessionView => ({ session: { id: client, client, createdAt: new Date(T0).toISOString(), executes: 0 }, calls, live: true, running: false, lastCallAt: T0 });

describe('lastAgentLabel', () => {
  it('harness dengan execute sukses terbaru; tanpa execute → undefined', () => {
    const a = view('claude-code', [call({ rev: 3, durationMs: 100 })]);
    const b = view('codex', [call({ rev: 4, startedAt: new Date(T0 + 5000).toISOString() })]);
    expect(lastAgentLabel([a, b])).toBe('Codex');
    expect(lastAgentLabel([view('codex', [call({ status: 'error', rev: 4 })])])).toBeUndefined();
    // Execute agen sebelum edit pengguna dicatat bukan pelaku.
    expect(lastAgentLabel([a, b], T0 + 10_000)).toBeUndefined();
    expect(lastAgentLabel([a, b], T0 + 1000)).toBe('Codex');
  });
});

describe('commitRow', () => {
  it('execute sukses ber-rev → meta + locate node baru dulu', () => {
    expect(commitRow(call({ rev: 42, nodes: 3, created: ['N1'], bounds: { B1: [0, 0, 1, 1], N1: [0, 0, 1, 1] }, boards: ['B1'] }))).toEqual({ meta: 'rev 42 · 3 nodes changed', locate: 'N1' });
    expect(commitRow(call({ rev: 7, nodes: 1, boards: ['B1'] }))).toEqual({ meta: 'rev 7 · 1 node changed', locate: 'B1' });
    // Bounds memuat board lebih dulu: node berubah yang bukan board dipilih.
    expect(commitRow(call({ rev: 8, nodes: 2, boards: ['B1'], bounds: { B1: [0, 0, 1, 1], T1: [0, 0, 1, 1] } }))?.locate).toBe('T1');
  });
  it('gagal, running, tanpa rev, atau bukan execute → undefined', () => {
    expect(commitRow(call({ status: 'error', rev: 1 }))).toBeUndefined();
    expect(commitRow(call({ status: 'warning', rev: 1 }))).toBeUndefined();
    expect(commitRow(call({ status: 'running' }))).toBeUndefined();
    expect(commitRow(call({}))).toBeUndefined();
    expect(commitRow(call({ tool: 'inspect', rev: 1 }))).toBeUndefined();
    expect(commitRow(undefined)).toBeUndefined();
  });
});

describe('selectionRead & shareBadgeText', () => {
  it('get_selection selesai terbaru', () => {
    const r = call({ callId: 'g2', tool: 'get_selection', target: 'H' });
    expect(selectionRead(view('claude-code', [call({ tool: 'get_selection', status: 'running' }), r]))).toBe(r);
    expect(selectionRead(view('claude-code', [call({})]))).toBeUndefined();
  });
  it('label badge dengan primer dan sisa', () => {
    expect(shareBadgeText('Headline', 1)).toBe('Selection shared with agents · Headline');
    expect(shareBadgeText('Headline', 3)).toBe('Selection shared with agents · Headline +2');
    expect(shareBadgeText(undefined, 0)).toBe('Selection shared with agents');
  });
});
