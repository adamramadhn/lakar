// Permukaan API snippet `execute` (AD-7) — didefinisikan SEKALI di sini: tipe publik ber-JSDoc
// (`LakarApi`) dan tabel runtime `API` (signature, doc, contoh yang dites, implementasi host).
// Tanpa IO. Semua op baca bekerja di salinan kerja transaksi dan mengembalikan salinan.
import type { Transaction } from '@lakar/core';
import { ID_PATTERN, LakarError, NODE_TYPES, type AnyNode, type ErrorCode, type LakarDocument as Doc, type NodeInput, type NodeType } from '@lakar/schema';

// ---------------------------------------------------------------------------
// Batas
// ---------------------------------------------------------------------------

/** Maksimum op mutasi sukses per snippet; lebih dari ini → EXEC_ERROR + rollback. */
export const MAX_OPS = 5000;
/** Ukuran maksimum `keep` (JSON, UTF-8). */
export const KEEP_MAX_BYTES = 64 * 1024;
/** Ukuran maksimum `value` (JSON, UTF-8) sebelum dipotong. */
export const VALUE_MAX_BYTES = 32 * 1024;
/** Batas log `console.log` per snippet. */
export const LOG_MAX_LINES = 100;
export const LOG_MAX_BYTES = 16 * 1024;
/** Jarak default antar-board untuk `place`. */
export const DEFAULT_PLACE_GAP = 80;

// ---------------------------------------------------------------------------
// Tipe publik
// ---------------------------------------------------------------------------

/**
 * Pandangan datar sebuah node (salinan): semua properti tersimpan apa adanya (ref token `{$token}` tidak
 * di-resolve) + field turunan hanya-baca `parentId`, `path`, dan `childIds` (khusus board/frame).
 * Tidak memuat `children`. Jangan kirim balik view utuh ke `update`/`replace`/`add`.
 */
export type NodeView = {
  id: string;
  type: NodeType;
  name: string;
  /** ID parent; `null` untuk board (anak halaman). */
  parentId: string | null;
  /** Daftar nama dari board ke node ini, mis. `['Home', 'Hero', 'Judul']`. */
  path: string[];
  /** ID anak langsung (urutan dokumen); hanya pada board/frame. */
  childIds?: string[];
  [prop: string]: unknown;
};

/** Kueri `find`. Semua kunci opsional; tanpa kunci = semua node. */
export type FindQuery = {
  type?: NodeType;
  /** String = nama sama persis; RegExp = nama cocok (dijalankan di sandbox). */
  name?: string | RegExp;
  /** ID board/frame: hanya keturunan node ini. */
  within?: string;
};

/** Opsi `place`. */
export type PlaceOptions = {
  /** ID board acuan: posisi dicari di kanan board itu, lalu di bawahnya. */
  near?: string;
  /** Jarak minimum antar-board (default 80). */
  gap?: number;
};

export type Point = { x: number; y: number };

/** Properti node untuk `add`/`replace` (katalog v1 tertutup), tanpa `id`/`children`. */
export type NodeProps = NodeInput;
/** Patch dangkal untuk `update`/`duplicate`; `null` menghapus properti opsional. */
export type NodePatch = Record<string, unknown>;

/** Fungsi global yang tersedia di snippet `execute`. */
export interface LakarApi {
  /** Tambah node ke board/frame `parentId` (null = halaman, khusus board). Mengembalikan ID baru 8 karakter. */
  add(parentId: string | null, node: NodeProps): string;
  /** Merge dangkal properti; `null` menghapus properti opsional. `type`/`id`/`children` tidak bisa diubah. */
  update(id: string, patch: NodePatch): void;
  /** Ganti semua properti (boleh ganti tipe); ID, posisi, dan anak (bila tipe baru frame/board) tetap. */
  replace(id: string, node: NodeProps): void;
  /** Pindah node ke board/frame `parentId` pada `index` (default akhir); `null` = urutan board di halaman. */
  move(id: string, parentId: string | null, index?: number): void;
  /** Salin node + subtree dengan ID baru tepat setelah asal; `patch` di-merge ke akar salinan. Mengembalikan ID akar baru. */
  duplicate(id: string, patch?: NodePatch): string;
  /** Hapus node beserta subtree-nya. */
  remove(id: string): void;
  /** Merge token datar ke dokumen; `null` menghapus token. */
  setTokens(map: Record<string, string | number | null>): void;
  /** Baca satu node (salinan datar). */
  get(id: string): NodeView;
  /** Cari node dalam urutan dokumen. */
  find(query?: FindQuery): NodeView[];
  /** Anak langsung node (`null` = board di halaman). */
  children(id: string | null): NodeView[];
  /** Posisi bebas tumpang tindih untuk board baru berukuran `w`×`h`. */
  place(w: number, h: number, opts?: PlaceOptions): Point;
}

/** Konteks host untuk satu snippet. */
export type ApiContext = {
  tx: Transaction;
  /** Salinan kerja hidup transaksi (hanya-baca). */
  view(): Readonly<Doc>;
  /** Dipanggil setelah setiap op mutasi sukses; melempar bila melewati `MAX_OPS`. */
  countOp(): void;
};

export type ApiFunction = {
  kind: 'op' | 'read';
  /** Tanda tangan untuk dokumentasi (`api.md` nanti dihasilkan dari sini). */
  signature: string;
  doc: string;
  returns: string;
  errors: readonly ErrorCode[];
  /** Snippet mandiri yang sukses di dokumen kosong (dites). */
  example: string;
  /** Implementasi host; argumen sudah berupa nilai JSON hasil dump dari QuickJS. */
  call(ctx: ApiContext, args: unknown[]): unknown;
};

export type ApiGlobal = { signature: string; doc: string };

/** Global non-fungsi API yang tersedia di snippet. */
export const API_GLOBALS: Readonly<Record<'keep' | 'console', ApiGlobal>> = {
  keep: {
    signature: 'keep: Record<string, any>',
    doc:
      'Objek JSON per sesi yang bertahan antar-execute (mis. keep.hero = add(...); lalu get(keep.hero) di panggilan berikutnya). ' +
      `Disimpan hanya bila execute sukses; maks ${KEEP_MAX_BYTES / 1024} KB.`,
  },
  console: {
    signature: 'console.log(...args): void',
    doc: `Tulis ke data.logs (string apa adanya, nilai lain sebagai JSON); maks ${LOG_MAX_LINES} baris / ${LOG_MAX_BYTES / 1024} KB.`,
  },
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const show = (v: unknown): string => (Array.isArray(v) ? 'array' : (JSON.stringify(v) ?? String(v)));

const ADDRESS_HINT = 'pakai ID 8 karakter dari add()/duplicate(), get()/find()/children(), created[].id, atau keep';

function requireId(fn: string, what: string, v: unknown): string {
  if (typeof v !== 'string' || !ID_PATTERN.test(v)) {
    throw new LakarError('SCHEMA_INVALID', `${fn}: ${what} harus ID 8 karakter [A-Za-z0-9], bukan ${show(v)}`, { hint: ADDRESS_HINT });
  }
  return v;
}

const VIEW_KEYS = ['parentId', 'path', 'childIds'] as const;

/** Tolak field turunan NodeView (dan `children` bersarang) di argumen node/patch. */
function rejectDerivedKeys(fn: string, obj: unknown): void {
  if (!isPlainObject(obj)) return;
  const hit = VIEW_KEYS.filter((k) => Object.hasOwn(obj, k));
  if (hit.length) {
    throw new LakarError('SCHEMA_INVALID', `${fn}: ${hit.join('/')} hanya-baca (field turunan get/find/children), tidak bisa dikirim balik`, {
      hint: `parentId/path/childIds hanya-baca; ambil properti yang perlu saja, mis. update(id, {gap: get(x).gap, fills: get(x).fills}); pindah parent → move(id, parentId)`,
    });
  }
  if (fn === 'add' && Object.hasOwn(obj, 'children')) {
    throw new LakarError('SCHEMA_INVALID', 'add: children bersarang tidak didukung', {
      hint: "tambahkan anak satu per satu: const f = add(b, {type:'frame', name:'Kartu'}); add(f, {type:'text', name:'Judul', content:'Halo', size:16})",
    });
  }
}

type Entry = { node: AnyNode; parentId: string | null; path: string[] };

/** Semua node dalam urutan dokumen (pre-order: halaman → board → anak). */
function walk(doc: Readonly<Doc>): Entry[] {
  const out: Entry[] = [];
  const visit = (n: AnyNode, parentId: string | null, prefix: string[]) => {
    const path = [...prefix, n.name];
    out.push({ node: n, parentId, path });
    if ('children' in n) for (const c of n.children) visit(c, n.id, path);
  };
  for (const p of doc.pages) for (const b of p.children) visit(b, null, []);
  return out;
}

/** NodeView salinan (JSON) dari entri. */
function toView(e: Entry): NodeView {
  const { children, ...props } = e.node as AnyNode & { children?: AnyNode[] };
  const view: Record<string, unknown> = { ...props, parentId: e.parentId, path: e.path };
  if (children) view.childIds = children.map((c) => c.id);
  return JSON.parse(JSON.stringify(view)) as NodeView;
}

function mustFind(fn: string, doc: Readonly<Doc>, id: string, what = 'node'): Entry {
  const hit = walk(doc).find((e) => e.node.id === id);
  if (!hit) {
    throw new LakarError('NOT_FOUND', `${fn}: ${what} ${id} tidak ada`, {
      hint: 'ID mungkin sudah di-remove atau berasal dari dokumen lain; cari ulang dengan find({name}) atau children(null)',
    });
  }
  return hit;
}

/** Bungkus op mutasi: validasi wrapper → op core → hitung op sukses. */
function mutation<T>(ctx: ApiContext, fn: () => T): T {
  const r = fn();
  ctx.countOp();
  return r;
}

const FIND_KEYS = ['type', 'name', 'within'];
const PLACE_KEYS = ['near', 'gap'];

type Rect = { x: number; y: number; w: number; h: number };
const boardRect = (n: AnyNode): Rect => {
  const b = n as { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return { x: num(b.x), y: num(b.y), w: num(b.width), h: num(b.height) };
};
/** Dua kotak terlalu dekat (jarak < gap di kedua sumbu) = tumpang tindih. */
const clash = (a: Rect, b: Rect, gap: number) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

const BOARD = "const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});";

// ---------------------------------------------------------------------------
// Tabel API
// ---------------------------------------------------------------------------

export const API: { readonly [K in keyof LakarApi]: ApiFunction } = {
  add: {
    kind: 'op',
    signature: "add(parentId: string | null, node: {type: 'board'|'frame'|'text'|'rect'|'ellipse'|'path'|'icon', name, ...}): string",
    doc:
      'Tambah node ke board/frame parentId (null = halaman, khusus board). Katalog v1 tertutup: board, frame, text, rect, ellipse, path, icon. ' +
      'Anak ditambahkan satu per satu (tanpa children bersarang). Mengembalikan ID 8 karakter secara sinkron.',
    returns: 'ID node baru (string 8 karakter)',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND'],
    example: `${BOARD}\nadd(b, {type:'text', name:'Judul', content:'Halo', size:32});`,
    call(ctx, [parentId, node]) {
      rejectDerivedKeys('add', node);
      return mutation(ctx, () => ctx.tx.add(parentId as string | null, node));
    },
  },
  update: {
    kind: 'op',
    signature: 'update(id: string, patch: {...}): void',
    doc: 'Merge dangkal properti ke node; null menghapus properti opsional. type/id/children tidak bisa diubah (ganti tipe → replace).',
    returns: 'undefined',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND'],
    example: `${BOARD}\nconst t = add(b, {type:'text', name:'Judul', content:'Halo', size:32});\nupdate(t, {size: 40, color: '#1A1A1A'});`,
    call(ctx, [id, patch]) {
      rejectDerivedKeys('update', patch);
      mutation(ctx, () => ctx.tx.update(id as string, patch));
      return undefined;
    },
  },
  replace: {
    kind: 'op',
    signature: "replace(id: string, node: {type, name, ...}): void",
    doc: 'Ganti semua properti node (boleh ganti tipe, kecuali board ↔ non-board). ID dan posisi tetap; anak dipertahankan bila tipe baru frame/board.',
    returns: 'undefined',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND'],
    example: `${BOARD}\nconst r = add(b, {type:'rect', name:'Kotak', width:100, height:40});\nreplace(r, {type:'ellipse', name:'Bulat', width:40, height:40});`,
    call(ctx, [id, node]) {
      rejectDerivedKeys('replace', node);
      mutation(ctx, () => ctx.tx.replace(id as string, node));
      return undefined;
    },
  },
  move: {
    kind: 'op',
    signature: 'move(id: string, parentId: string | null, index?: number): void',
    doc: 'Pindah node ke board/frame parentId pada index (default akhir). parentId null hanya untuk board: mengubah urutan board di halaman.',
    returns: 'undefined',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND'],
    example: `${BOARD}\nconst f = add(b, {type:'frame', name:'Kartu', layout:'column'});\nconst t = add(b, {type:'text', name:'Judul', content:'Halo', size:16});\nmove(t, f, 0);`,
    call(ctx, [id, parentId, index]) {
      mutation(ctx, () => ctx.tx.move(id as string, parentId as string | null, index as number | undefined));
      return undefined;
    },
  },
  duplicate: {
    kind: 'op',
    signature: 'duplicate(id: string, patch?: {...}): string',
    doc: 'Salin node beserta subtree dengan ID baru, disisipkan tepat setelah asal; patch (aturan update) di-merge ke akar salinan.',
    returns: 'ID akar salinan (string 8 karakter)',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND'],
    example: `${BOARD}\nconst f = add(b, {type:'frame', name:'Kartu', layout:'column', gap:8});\nadd(f, {type:'text', name:'Judul', content:'Halo', size:16});\nduplicate(f, {name:'Kartu 2'});`,
    call(ctx, [id, patch]) {
      rejectDerivedKeys('duplicate', patch);
      return mutation(ctx, () => ctx.tx.duplicate(id as string, patch));
    },
  },
  remove: {
    kind: 'op',
    signature: 'remove(id: string): void',
    doc: 'Hapus node beserta subtree-nya; ID itu tidak bisa dipakai lagi.',
    returns: 'undefined',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND'],
    example: `${BOARD}\nconst t = add(b, {type:'text', name:'Sementara', content:'x', size:12});\nremove(t);`,
    call(ctx, [id]) {
      mutation(ctx, () => ctx.tx.remove(id as string));
      return undefined;
    },
  },
  setTokens: {
    kind: 'op',
    signature: 'setTokens(map: {[name: string]: string | number | null}): void',
    doc: "Merge token datar ke dokumen (nama segmen [a-z0-9-] dipisah titik, mis. 'colors.primary'); null menghapus. Rujuk dengan {$token:'colors.primary'}.",
    returns: 'undefined',
    errors: ['SCHEMA_INVALID', 'TOKEN_UNKNOWN'],
    example:
      "setTokens({'colors.primary': '#0F62FE', 'spacing.4': 16});\n" +
      `${BOARD}\nadd(b, {type:'rect', name:'Aksen', width:40, height:40, fills:[{type:'solid', color:{$token:'colors.primary'}}]});`,
    call(ctx, [map]) {
      mutation(ctx, () => ctx.tx.setTokens(map));
      return undefined;
    },
  },
  get: {
    kind: 'read',
    signature: 'get(id: string): NodeView',
    doc: 'Baca satu node sebagai salinan datar: properti tersimpan (token apa adanya) + parentId, path (nama board→node), childIds (board/frame). Melihat perubahan snippet ini.',
    returns: 'NodeView',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND'],
    example: `${BOARD}\nconst t = add(b, {type:'text', name:'Judul', content:'Halo', size:32});\nget(t).path;`,
    call(ctx, [id]) {
      const nid = requireId('get', 'id', id);
      return toView(mustFind('get', ctx.view(), nid));
    },
  },
  find: {
    kind: 'read',
    signature: 'find(query?: {type?, name?: string | RegExp, within?: string}): NodeView[]',
    doc: 'Cari node dalam urutan dokumen. name string = sama persis, RegExp = cocok; within = hanya keturunan board/frame itu.',
    returns: 'NodeView[] (urutan dokumen)',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND'],
    example: `${BOARD}\nadd(b, {type:'text', name:'Judul', content:'Halo', size:32});\nfind({type:'text', name:/^Jud/, within: b}).map((n) => n.id);`,
    call(ctx, [query]) {
      const q = query ?? {};
      if (!isPlainObject(q)) {
        throw new LakarError('SCHEMA_INVALID', `find: query harus objek, bukan ${show(q)}`, { hint: "contoh: find({type:'text', name:/^Judul/, within: boardId})" });
      }
      const unknown = Object.keys(q).filter((k) => !FIND_KEYS.includes(k));
      if (unknown.length) {
        throw new LakarError('SCHEMA_INVALID', `find: kunci tidak dikenal: ${unknown.join(', ')}`, { hint: `kunci yang didukung: ${FIND_KEYS.join(', ')}` });
      }
      if (q.type !== undefined && !(NODE_TYPES as readonly unknown[]).includes(q.type)) {
        throw new LakarError('SCHEMA_INVALID', `find: type tidak dikenal: ${show(q.type)}`, { hint: `type salah satu: ${NODE_TYPES.join(', ')}` });
      }
      if (q.name !== undefined && typeof q.name !== 'string') {
        throw new LakarError('SCHEMA_INVALID', `find: name harus string atau RegExp, bukan ${show(q.name)}`, { hint: "contoh: find({name:'Judul'}) atau find({name:/^Kartu/})" });
      }
      const doc = ctx.view();
      let pool = walk(doc);
      if (q.within !== undefined) {
        const wid = requireId('find', 'within', q.within);
        mustFind('find', doc, wid, 'within');
        const parents = new Map(pool.map((x) => [x.node.id, x.parentId] as const));
        pool = pool.filter((e) => e.node.id !== wid && isUnder(parents, e, wid));
      }
      return pool.filter((e) => (q.type === undefined || e.node.type === q.type) && (q.name === undefined || e.node.name === q.name)).map(toView);
    },
  },
  children: {
    kind: 'read',
    signature: 'children(id: string | null): NodeView[]',
    doc: 'Anak langsung node dalam urutan dokumen; null = board di halaman. Node daun → [].',
    returns: 'NodeView[]',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND'],
    example: `${BOARD}\nadd(b, {type:'text', name:'Judul', content:'Halo', size:32});\nchildren(b).map((n) => n.name);`,
    call(ctx, [id]) {
      const doc = ctx.view();
      if (id === null || id === undefined) {
        const boards = new Set(doc.pages[0]!.children.map((b) => b.id));
        return walk(doc).filter((e) => e.parentId === null && boards.has(e.node.id)).map(toView);
      }
      const nid = requireId('children', 'id', id);
      mustFind('children', doc, nid);
      return walk(doc).filter((e) => e.parentId === nid).map(toView);
    },
  },
  place: {
    kind: 'read',
    signature: 'place(w: number, h: number, opts?: {near?: string, gap?: number}): {x, y}',
    doc:
      'Posisi {x, y} untuk board baru w×h yang tidak tumpang tindih board di halaman (termasuk yang dibuat di snippet ini), berjarak gap (default 80). ' +
      'Halaman kosong → {x:0, y:0}; tanpa near → baris atas, kiri ke kanan; near → kanan board itu, lalu di bawahnya.',
    returns: '{x: number, y: number}',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND'],
    example: "const p = place(1440, 900);\nadd(null, {type:'board', name:'Desktop', x:p.x, y:p.y, width:1440, height:900, screen:'landing'});",
    call(ctx, [w, h, opts]) {
      for (const [what, v] of [['w', w], ['h', h]] as const) {
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
          throw new LakarError('SCHEMA_INVALID', `place: ${what} harus angka > 0, bukan ${show(v)}`, { hint: 'contoh: const p = place(390, 844); add(null, {type:"board", x:p.x, y:p.y, ...})' });
        }
      }
      const o = opts ?? {};
      if (!isPlainObject(o)) throw new LakarError('SCHEMA_INVALID', `place: opsi harus objek {near?, gap?}, bukan ${show(o)}`, { hint: 'contoh: place(390, 844, {near: boardId, gap: 80})' });
      const unknown = Object.keys(o).filter((k) => !PLACE_KEYS.includes(k));
      if (unknown.length) throw new LakarError('SCHEMA_INVALID', `place: kunci opsi tidak dikenal: ${unknown.join(', ')}`, { hint: `kunci yang didukung: ${PLACE_KEYS.join(', ')}` });
      const gap = o.gap ?? DEFAULT_PLACE_GAP;
      if (typeof gap !== 'number' || !Number.isFinite(gap) || gap < 0) {
        throw new LakarError('SCHEMA_INVALID', `place: gap harus angka ≥ 0, bukan ${show(gap)}`, { hint: 'hilangkan gap untuk default 80' });
      }
      const doc = ctx.view();
      const boards = doc.pages[0]!.children.map(boardRect);
      const size = { w: w as number, h: h as number };
      if (o.near !== undefined) {
        const nid = requireId('place', 'near', o.near);
        const near = mustFind('place', doc, nid, 'board near');
        if (near.node.type !== 'board') {
          throw new LakarError('SCHEMA_INVALID', `place: near harus ID board, bukan ${near.node.type}`, { hint: 'pakai ID board (children(null) mendaftar board di halaman)' });
        }
        const r = boardRect(near.node);
        const right = { x: r.x + r.w + gap, y: r.y, ...size };
        if (!boards.some((b) => clash(right, b, gap))) return { x: right.x, y: right.y };
        // Di bawah board acuan; geser turun melewati board yang menghalangi.
        const below = { x: r.x, y: r.y + r.h + gap, ...size };
        for (;;) {
          const hits = boards.filter((b) => clash(below, b, gap));
          if (!hits.length) return { x: below.x, y: below.y };
          below.y = Math.max(...hits.map((b) => b.y + b.h)) + gap;
        }
      }
      if (!boards.length) return { x: 0, y: 0 };
      // Baris atas: kanan dari board paling kanan, sejajar board paling atas.
      return { x: Math.max(...boards.map((b) => b.x + b.w)) + gap, y: Math.min(...boards.map((b) => b.y)) };
    },
  },
};

function isUnder(parents: ReadonlyMap<string, string | null>, e: Entry, ancestorId: string): boolean {
  let p = e.parentId;
  while (p !== null) {
    if (p === ancestorId) return true;
    p = parents.get(p) ?? null;
  }
  return false;
}

/** Nama semua global snippet (fungsi API + keep + console). */
export const SNIPPET_GLOBALS: readonly string[] = [...Object.keys(API), 'keep', 'console.log'];
