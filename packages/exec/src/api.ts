// Permukaan API snippet `execute` (AD-7) — didefinisikan SEKALI di sini.
// Irisan tracer: hanya `add`. Story 6/9 menambah op lain, get/find/place/keep.
import type { Transaction } from '@lakar/core';

export type ApiFunction = {
  /** Tanda tangan untuk dokumentasi (`api.md` nanti dihasilkan dari sini). */
  signature: string;
  doc: string;
  /** Implementasi host; argumen sudah berupa nilai JSON hasil dump dari QuickJS. */
  call(tx: Transaction, args: unknown[]): unknown;
};

export const API: Readonly<Record<string, ApiFunction>> = {
  add: {
    signature: "add(parentId: string | null, node: {type: 'board'|'frame'|'text'|'rect'|'ellipse'|'path'|'icon', name, ...}): string",
    doc:
      'Tambah node ke parent (null = halaman, khusus board; anak hanya bisa ditambahkan ke board atau frame). ' +
      'Katalog v1 tertutup: board, frame, text, rect, ellipse, path, icon. Mengembalikan ID 8 karakter secara sinkron.',
    call(tx, [parentId, node]) {
      if (parentId !== null && typeof parentId !== 'string') {
        throw new TypeError('add: parentId harus string ID atau null');
      }
      return tx.add(parentId, node);
    },
  },
};
