// Tumpukan undo/redo per jendela viewer (AD-8, editor-canvas story 4): entri = op invers dari respons route ops.
// Murni dan immutable; Viewer memegang state ini dan menjalankan permintaan ops. Story 6 memperluasnya.
import type { DocOp } from '@lakar/schema';

/** `at` (ms): saat edit pengguna dicatat; pelaku toast "Undo skipped" hanya execute agen sesudahnya (story 3). */
export type UndoEntry = { ops: DocOp[]; label: string; at?: number };
export type UndoStacks = { readonly undo: readonly UndoEntry[]; readonly redo: readonly UndoEntry[] };
export type UndoDir = 'undo' | 'redo';

export const EMPTY_STACKS: UndoStacks = { undo: [], redo: [] };

/** Commit gestur baru: invers masuk undo, redo dikosongkan. Invers kosong (tanpa efek) → tidak berubah. */
export function recordCommit(s: UndoStacks, inverse: DocOp[], label: string, at?: number): UndoStacks {
  return inverse.length ? { undo: [...s.undo, { ops: inverse, label, ...(at !== undefined ? { at } : {}) }], redo: [] } : s;
}

/** Ambil entri teratas arah `dir`; tumpukan tanpa entri itu (entri sedang dikirim). */
export function takeStep(s: UndoStacks, dir: UndoDir): { entry: UndoEntry | undefined; stacks: UndoStacks } {
  const from = s[dir];
  const entry = from[from.length - 1];
  return { entry, stacks: entry ? { ...s, [dir]: from.slice(0, -1) } : s };
}

/**
 * Hasil step `dir` untuk `entry`: sukses → invers respons masuk tumpukan seberang; gagal permanen (invers basi,
 * mis. node sudah dihapus agen) → entri dibuang (tanpa undo sebagian); gagal sementara (offline/5xx) → entri kembali.
 */
export function settleStep(s: UndoStacks, dir: UndoDir, entry: UndoEntry, outcome: { ok: true; inverse: DocOp[]; at?: number } | { ok: false; transient: boolean }): UndoStacks {
  if (outcome.ok) {
    const other: UndoDir = dir === 'undo' ? 'redo' : 'undo';
    const at = outcome.at;
    return outcome.inverse.length ? { ...s, [other]: [...s[other], { ops: outcome.inverse, label: entry.label, ...(at !== undefined ? { at } : {}) }] } : s;
  }
  return outcome.transient ? { ...s, [dir]: [...s[dir], entry] } : s;
}
