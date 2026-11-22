import { describe, expect, it } from 'vitest';
import type { DocOp } from '@lakar/schema';
import { EMPTY_STACKS, recordCommit, settleStep, takeStep } from './undoHistory.js';

const inv = (x: number): DocOp[] => [{ op: 'update', id: 'AAAAAAAA', patch: { x } }];

describe('undoHistory', () => {
  it('commit → undo → redo memindahkan invers antar tumpukan', () => {
    let s = recordCommit(EMPTY_STACKS, inv(0), 'Move A');
    expect(s.undo).toEqual([{ ops: inv(0), label: 'Move A' }]);
    const u = takeStep(s, 'undo');
    expect(u.entry?.ops).toEqual(inv(0));
    expect(u.stacks.undo).toEqual([]);
    s = settleStep(u.stacks, 'undo', u.entry!, { ok: true, inverse: inv(10) });
    expect(s).toEqual({ undo: [], redo: [{ ops: inv(10), label: 'Move A' }] });
    const r = takeStep(s, 'redo');
    s = settleStep(r.stacks, 'redo', r.entry!, { ok: true, inverse: inv(0) });
    expect(s).toEqual({ undo: [{ ops: inv(0), label: 'Move A' }], redo: [] });
  });
  it('commit baru mengosongkan redo; invers kosong tidak dicatat', () => {
    const s = { undo: [], redo: [{ ops: inv(1), label: 'x' }] };
    expect(recordCommit(s, inv(2), 'y')).toEqual({ undo: [{ ops: inv(2), label: 'y' }], redo: [] });
    expect(recordCommit(s, [], 'y')).toBe(s);
  });
  it('gagal permanen membuang entri, gagal sementara mengembalikannya', () => {
    const s = recordCommit(EMPTY_STACKS, inv(0), 'Move A');
    const u = takeStep(s, 'undo');
    expect(settleStep(u.stacks, 'undo', u.entry!, { ok: false, transient: false })).toEqual({ undo: [], redo: [] });
    expect(settleStep(u.stacks, 'undo', u.entry!, { ok: false, transient: true })).toEqual(s);
  });
  it('tumpukan kosong → tanpa entri', () => {
    expect(takeStep(EMPTY_STACKS, 'redo')).toEqual({ entry: undefined, stacks: EMPTY_STACKS });
  });
});
