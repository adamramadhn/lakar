// Inti dokumen Lakar: allocator ID, transaksi operasi (AD-3, AD-4). Tanpa IO.
import {
  LakarDocument,
  LakarError,
  NodeInput,
  SCHEMA_VERSION,
  zodToLakarError,
  type BoardNode,
  type ChildNode,
  type CreatedEntry,
  type HistoryEntry,
  type LakarDocument as Doc,
} from '@lakar/schema';

export const PACKAGE = '@lakar/core';

// core dikompilasi tanpa lib DOM/@types/node; API global standar (Web Crypto, structuredClone)
// diakses lewat tipe minimal ini, bukan impor modul IO.
const host = globalThis as unknown as {
  structuredClone<T>(v: T): T;
  crypto: { getRandomValues(a: Uint32Array): Uint32Array };
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Sumber acak 0..1 (inject untuk tes). Default: Web Crypto global, tanpa impor IO. */
export type RandomSource = () => number;
const cryptoRandom: RandomSource = () => {
  const buf = new Uint32Array(1);
  host.crypto.getRandomValues(buf);
  return buf[0]! / 0x1_0000_0000;
};

/** Allocator ID 8 karakter `[A-Za-z0-9]`, unik per dokumen. */
export class IdAllocator {
  readonly #used = new Set<string>();
  readonly #random: RandomSource;
  constructor(existing: Iterable<string> = [], random: RandomSource = cryptoRandom) {
    for (const id of existing) this.#used.add(id);
    this.#random = random;
  }
  next(): string {
    for (let attempt = 0; attempt < 1000; attempt++) {
      let id = '';
      for (let i = 0; i < 8; i++) id += ALPHABET[Math.floor(this.#random() * ALPHABET.length)];
      if (!this.#used.has(id)) {
        this.#used.add(id);
        return id;
      }
    }
    throw new Error('IdAllocator: gagal mendapat ID unik setelah 1000 percobaan');
  }
  static forDocument(doc: Doc, random?: RandomSource): IdAllocator {
    return new IdAllocator(collectIds(doc), random);
  }
}

export function collectIds(doc: Doc): string[] {
  const ids = [doc.id];
  const walk = (n: BoardNode | ChildNode) => {
    ids.push(n.id);
    if ('children' in n) n.children.forEach(walk);
  };
  for (const p of doc.pages) {
    ids.push(p.id);
    p.children.forEach(walk);
  }
  return ids;
}

/** Dokumen kosong: satu halaman, rev 0. */
export function createDocument(random?: RandomSource): Doc {
  const ids = new IdAllocator([], random);
  return { schemaVersion: SCHEMA_VERSION, id: ids.next(), rev: 0, pages: [{ id: ids.next(), name: 'Page 1', children: [] }] };
}

/** Validasi dokumen dari luar (file). Rusak → SCHEMA_INVALID. */
export function parseDocument(value: unknown): Doc {
  const r = LakarDocument.safeParse(value);
  if (!r.success) throw zodToLakarError(r.error, 'dokumen tidak valid');
  return r.data;
}

type Located = { node: BoardNode | ChildNode; path: string };

function findNode(doc: Doc, id: string): Located | undefined {
  const walk = (n: BoardNode | ChildNode, prefix: string): Located | undefined => {
    const path = prefix ? `${prefix}/${n.name}` : n.name;
    if (n.id === id) return { node: n, path };
    if ('children' in n) {
      for (const c of n.children) {
        const hit = walk(c, path);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  for (const p of doc.pages) {
    for (const b of p.children) {
      const hit = walk(b, '');
      if (hit) return hit;
    }
  }
  return undefined;
}

export type CommitResult = { doc: Doc; entry: HistoryEntry; created: CreatedEntry[] };

export interface Transaction {
  /** Tambah node. `parentId` null = halaman pertama (khusus board). Mengembalikan ID baru secara sinkron. */
  add(parentId: string | null, node: unknown): string;
  commit(description: string): CommitResult;
  rollback(): void;
  readonly open: boolean;
}

export type TransactionOptions = { sessionId: string; random?: RandomSource; now?: () => Date };

/**
 * Transaksi copy-on-write (AD-4): semua op bekerja di `structuredClone(doc)`.
 * `commit` mengembalikan dokumen baru (rev +1) + entri riwayat; `rollback` membuang salinan kerja.
 * Dokumen asli tidak pernah dimutasi.
 */
export function beginTransaction(doc: Doc, opts: TransactionOptions): Transaction {
  let work: Doc | undefined = host.structuredClone(doc);
  const ids = IdAllocator.forDocument(doc, opts.random);
  const created: CreatedEntry[] = [];
  const ops: Record<string, number> = {};
  const now = opts.now ?? (() => new Date());

  const live = (): Doc => {
    if (!work) throw new Error('transaksi sudah ditutup (commit/rollback)');
    return work;
  };

  return {
    get open() {
      return work !== undefined;
    },
    add(parentId, raw) {
      const w = live();
      const parsed = NodeInput.safeParse(raw);
      if (!parsed.success) throw zodToLakarError(parsed.error, 'add');
      const input = parsed.data;
      let path: string;
      const id = ids.next();
      if (parentId === null) {
        if (input.type !== 'board') {
          throw new LakarError('SCHEMA_INVALID', `add(null, …) hanya untuk board, bukan ${input.type}`, {
            hint: 'anak halaman hanya board; tambahkan frame/text ke dalam board: add(boardId, {...})',
          });
        }
        w.pages[0]!.children.push({ ...input, id, children: [] });
        path = input.name;
      } else {
        const parent = findNode(w, parentId);
        if (!parent) {
          throw new LakarError('NOT_FOUND', `parent ${parentId} tidak ada`, { hint: 'pakai ID yang dikembalikan add()' });
        }
        if (input.type === 'board') {
          throw new LakarError('SCHEMA_INVALID', 'board hanya boleh menjadi anak halaman', { hint: 'pakai add(null, {type:"board",...})' });
        }
        if (parent.node.type === 'text') {
          throw new LakarError('SCHEMA_INVALID', `node text ${parentId} tidak bisa punya anak`, { hint: 'tambahkan ke board atau frame' });
        }
        const child: ChildNode = input.type === 'frame' ? { ...input, id, children: [] } : { ...input, id };
        parent.node.children.push(child);
        path = `${parent.path}/${input.name}`;
      }
      created.push({ id, name: input.name, path });
      ops.add = (ops.add ?? 0) + 1;
      return id;
    },
    commit(description) {
      const w = live();
      work = undefined;
      w.rev = doc.rev + 1;
      const opsSummary = Object.entries(ops).map(([op, n]) => `${op}×${n}`).join(', ') || 'kosong';
      const entry: HistoryEntry = { rev: w.rev, sessionId: opts.sessionId, description, opsSummary, at: now().toISOString() };
      return { doc: w, entry, created };
    },
    rollback() {
      work = undefined;
    },
  };
}
