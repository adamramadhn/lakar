// Permukaan API snippet `execute` (AD-7) — didefinisikan SEKALI di sini: tipe publik ber-JSDoc
// (`LakarApi`) dan tabel runtime `API` (signature, doc, contoh yang dites, implementasi host).
// Tanpa IO. Semua op baca bekerja di salinan kerja transaksi dan mengembalikan salinan.
import type { Transaction } from '@lakar/core';
import type { IconCatalogMatch, IconCatalogPort } from '@lakar/ports';
import { ID_PATTERN, LakarError, NODE_TYPES, type AnyNode, type ErrorCode, type LakarDocument as Doc, type NodeInput, type NodeType } from '@lakar/schema';

// ---------------------------------------------------------------------------
// Batas
// ---------------------------------------------------------------------------

/** Maksimum op mutasi sukses per snippet; lebih dari ini → EXEC_ERROR + rollback. */
export const MAX_OPS = 5000;
/** Batas waktu default satu snippet (ms). */
export const DEFAULT_TIMEOUT_MS = 2000;
/** Ukuran maksimum `keep` (JSON, UTF-8). */
export const KEEP_MAX_BYTES = 64 * 1024;
/** Ukuran maksimum `value` (JSON, UTF-8) sebelum dipotong. */
export const VALUE_MAX_BYTES = 32 * 1024;
/** Batas log `console.log` per snippet. */
export const LOG_MAX_LINES = 100;
export const LOG_MAX_BYTES = 16 * 1024;
/** Jarak default antar-board untuk `place`. */
export const DEFAULT_PLACE_GAP = 80;
/** `iconSearch`: jumlah hasil default dan maksimum. */
export const ICON_SEARCH_DEFAULT_LIMIT = 10;
export const ICON_SEARCH_MAX_LIMIT = 50;

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

/** Opsi `iconSearch`. */
export type IconSearchOptions = {
  /** Batasi ke satu pustaka: `lucide` (ikon UI) atau `simple-icons` (logo brand). */
  lib?: 'lucide' | 'simple-icons';
  /** Jumlah hasil (default 10, maks 50). */
  limit?: number;
};

/** Satu hasil `iconSearch`. `aliasOf` ada bila `icon` adalah alias (nilai = nama kanonik). */
export type IconSearchMatch = IconCatalogMatch<'lucide' | 'simple-icons'>;

/** Properti node untuk `add`/`replace` (katalog v1 tertutup), tanpa `id`/`children`. */
export type NodeProps = NodeInput;
/** Patch dangkal untuk `update`/`duplicate`; `null` menghapus properti opsional. */
export type NodePatch = Record<string, unknown>;

/** Fungsi global yang tersedia di snippet `execute`. */
export interface LakarApi {
  /**
   * Tambah node ke board/frame `parentId` (null = halaman, khusus board). Mengembalikan ID baru 8 karakter.
   *
   * Node `icon` ({type:'icon', lib:'lucide'|'simple-icons', icon, size, color?, strokeWidth?, filled?}): `icon` = nama
   * ikon kanonik pustaka (alias dikonversi otomatis, mis. lucide `home` → `house`); `name` = nama layer (default
   * `Icon / <lib> / <icon>`); `version` diisi otomatis dengan versi pustaka terpasang (jangan dikirim). Nama tidak
   * dikenal → ICON_UNKNOWN + 3 saran (cari dengan `iconSearch`).
   * Gambar lucide: stroke = `color` (default #000000), `strokeWidth` dalam unit grid 24 (default 2), ujung/sambungan
   * bulat, `filled: true` mengisi bentuk dengan `color`. Simple-icons (khusus logo brand): fill = `color` (default
   * warna brand), `strokeWidth`/`filled` diabaikan. Kotak node = `size`×`size`.
   */
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
  /**
   * Cari ikon di katalog terpasang (lucide = ikon UI, simple-icons = logo brand). Urut relevansi: nama persis >
   * awalan nama/alias > token nama > tag persis > tag sebagian. Pakai `lib` + `icon` hasilnya di node icon.
   */
  iconSearch(query: string, opts?: IconSearchOptions): IconSearchMatch[];
}

/** Konteks host untuk satu snippet. */
export type ApiContext = {
  tx: Transaction;
  /** Salinan kerja hidup transaksi (hanya-baca). */
  view(): Readonly<Doc>;
  /** Dipanggil setelah setiap op mutasi sukses; melempar bila melewati `MAX_OPS`. */
  countOp(): void;
  /** Katalog ikon (kanonikalisasi node icon, `iconSearch`). */
  icons: IconCatalogPort;
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

// ---------------------------------------------------------------------------
// Ikon (AD-9): kanonikalisasi sebelum op core
// ---------------------------------------------------------------------------

const ICON_KEYS = ['icon', 'lib', 'version'] as const;

/** `lib` yang dikenal katalog, atau undefined (dibiarkan sampai validasi core → SCHEMA_INVALID). */
const knownLib = (ctx: ApiContext, lib: unknown): string | undefined =>
  typeof lib === 'string' && Object.hasOwn(ctx.icons.versions, lib) ? lib : undefined;

/**
 * Kanonikkan `icon` + stempel `version` untuk lib/icon gabungan. Versi asing → SCHEMA_INVALID; nama tidak
 * dikenal → ICON_UNKNOWN (dari katalog). Mengembalikan undefined bila input dibiarkan untuk validasi core.
 */
function canonicalIcon(ctx: ApiContext, fn: string, lib: unknown, icon: unknown, version: unknown): { icon: string; version: string } | undefined {
  const l = knownLib(ctx, lib);
  if (l === undefined || typeof icon !== 'string') return undefined;
  const installed = ctx.icons.versions[l]!;
  if (version !== undefined && version !== null && version !== installed) {
    throw new LakarError('SCHEMA_INVALID', `${fn}: version ikon ${show(version)} bukan versi ${l} terpasang (${installed})`, {
      hint: 'hapus version dari node icon; diisi otomatis dengan versi pustaka terpasang',
    });
  }
  return ctx.icons.canonical(l, icon);
}

/** add/replace: node icon → `icon` kanonik, `version` terpasang, `name` default `Icon / <lib> / <icon>`. */
function iconNode(ctx: ApiContext, fn: string, node: unknown): unknown {
  if (!isPlainObject(node) || node.type !== 'icon') return node;
  const c = canonicalIcon(ctx, fn, node.lib, node.icon, node.version);
  if (!c) return node;
  return { ...node, icon: c.icon, version: c.version, ...(node.name === undefined ? { name: `Icon / ${node.lib as string} / ${c.icon}` } : {}) };
}

/** update/duplicate: patch yang menyentuh icon/lib/version pada node icon → lib/icon digabung dari node lama. */
function iconPatch(ctx: ApiContext, fn: string, id: unknown, patch: unknown): unknown {
  if (!isPlainObject(patch) || !ICON_KEYS.some((k) => Object.hasOwn(patch, k))) return patch;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return patch;
  const hit = walk(ctx.view()).find((e) => e.node.id === id);
  if (!hit || hit.node.type !== 'icon') return patch;
  const old = hit.node as { lib: string; icon: string };
  const lib = Object.hasOwn(patch, 'lib') ? patch.lib : old.lib;
  const icon = Object.hasOwn(patch, 'icon') ? patch.icon : old.icon;
  const c = canonicalIcon(ctx, fn, lib, icon, patch.version);
  return c ? { ...patch, icon: c.icon, version: c.version } : patch;
}

const ICON_SEARCH_KEYS = ['lib', 'limit'];
const ICON_SEARCH_HINT = "contoh: iconSearch('dumbbell') atau iconSearch('arrow right', {lib:'lucide', limit:5})";

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
      'Anak ditambahkan satu per satu (tanpa children bersarang). Mengembalikan ID 8 karakter secara sinkron. ' +
      "Icon: {type:'icon', lib:'lucide'|'simple-icons', icon:<nama kanonik>, size, color?, strokeWidth?, filled?}; alias dikonversi ke nama kanonik " +
      "(lucide 'home' → 'house'), name default 'Icon / <lib> / <icon>', version diisi otomatis (jangan dikirim); nama tidak dikenal → ICON_UNKNOWN + 3 saran (cari dengan iconSearch).",
    returns: 'ID node baru (string 8 karakter)',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND', 'ICON_UNKNOWN'],
    example: `${BOARD}\nadd(b, {type:'text', name:'Judul', content:'Halo', size:32});\nadd(b, {type:'icon', lib:'lucide', icon:'home', size:24, color:'#1A1A1A'});`,
    call(ctx, [parentId, node]) {
      rejectDerivedKeys('add', node);
      const n = iconNode(ctx, 'add', node);
      return mutation(ctx, () => ctx.tx.add(parentId as string | null, n));
    },
  },
  update: {
    kind: 'op',
    signature: 'update(id: string, patch: {...}): void',
    doc: 'Merge dangkal properti ke node; null menghapus properti opsional. type/id/children tidak bisa diubah (ganti tipe → replace).',
    returns: 'undefined',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND', 'ICON_UNKNOWN'],
    example: `${BOARD}\nconst t = add(b, {type:'text', name:'Judul', content:'Halo', size:32});\nupdate(t, {size: 40, color: '#1A1A1A'});`,
    call(ctx, [id, patch]) {
      rejectDerivedKeys('update', patch);
      const p = iconPatch(ctx, 'update', id, patch);
      mutation(ctx, () => ctx.tx.update(id as string, p));
      return undefined;
    },
  },
  replace: {
    kind: 'op',
    signature: "replace(id: string, node: {type, name, ...}): void",
    doc: 'Ganti semua properti node (boleh ganti tipe, kecuali board ↔ non-board). ID dan posisi tetap; anak dipertahankan bila tipe baru frame/board.',
    returns: 'undefined',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND', 'ICON_UNKNOWN'],
    example: `${BOARD}\nconst r = add(b, {type:'rect', name:'Kotak', width:100, height:40});\nreplace(r, {type:'ellipse', name:'Bulat', width:40, height:40});`,
    call(ctx, [id, node]) {
      rejectDerivedKeys('replace', node);
      const n = iconNode(ctx, 'replace', node);
      mutation(ctx, () => ctx.tx.replace(id as string, n));
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
    errors: ['SCHEMA_INVALID', 'NOT_FOUND', 'ICON_UNKNOWN'],
    example: `${BOARD}\nconst f = add(b, {type:'frame', name:'Kartu', layout:'column', gap:8});\nadd(f, {type:'text', name:'Judul', content:'Halo', size:16});\nduplicate(f, {name:'Kartu 2'});`,
    call(ctx, [id, patch]) {
      rejectDerivedKeys('duplicate', patch);
      const p = iconPatch(ctx, 'duplicate', id, patch);
      return mutation(ctx, () => ctx.tx.duplicate(id as string, p));
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
  iconSearch: {
    kind: 'read',
    signature: "iconSearch(query: string, opts?: {lib?: 'lucide'|'simple-icons', limit?: number}): {lib, icon, tags?, title?, aliasOf?}[]",
    doc:
      'Cari ikon di katalog terpasang: lucide (ikon UI) dan simple-icons (khusus logo brand). Urut relevansi: nama persis > awalan nama/alias > ' +
      `token nama > tag persis > tag sebagian; default ${ICON_SEARCH_DEFAULT_LIMIT} hasil, maks ${ICON_SEARCH_MAX_LIMIT}. Pakai lib + icon hasilnya di node icon (alias juga diterima, disimpan sebagai nama kanonik).`,
    returns: '{lib, icon, tags?, title?, aliasOf?}[] (bisa kosong)',
    errors: ['SCHEMA_INVALID'],
    example: `${BOARD}\nconst [m] = iconSearch('dumbbell', {lib:'lucide', limit:3});\nadd(b, {type:'icon', lib:m.lib, icon:m.icon, size:24});`,
    call(ctx, [query, opts]) {
      if (typeof query !== 'string' || !query.trim()) {
        throw new LakarError('SCHEMA_INVALID', `iconSearch: query harus string tidak kosong, bukan ${show(query)}`, { hint: ICON_SEARCH_HINT });
      }
      const o = opts ?? {};
      if (!isPlainObject(o)) throw new LakarError('SCHEMA_INVALID', `iconSearch: opsi harus objek {lib?, limit?}, bukan ${show(o)}`, { hint: ICON_SEARCH_HINT });
      const unknown = Object.keys(o).filter((k) => !ICON_SEARCH_KEYS.includes(k));
      if (unknown.length) throw new LakarError('SCHEMA_INVALID', `iconSearch: kunci opsi tidak dikenal: ${unknown.join(', ')}`, { hint: `kunci yang didukung: ${ICON_SEARCH_KEYS.join(', ')}` });
      if (o.lib !== undefined && knownLib(ctx, o.lib) === undefined) {
        throw new LakarError('SCHEMA_INVALID', `iconSearch: lib tidak dikenal: ${show(o.lib)}`, { hint: `lib salah satu: ${Object.keys(ctx.icons.versions).join(', ')} (atau hilangkan untuk semua)` });
      }
      const limit = o.limit ?? ICON_SEARCH_DEFAULT_LIMIT;
      if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > ICON_SEARCH_MAX_LIMIT) {
        throw new LakarError('SCHEMA_INVALID', `iconSearch: limit harus bilangan bulat 1–${ICON_SEARCH_MAX_LIMIT}, bukan ${show(limit)}`, { hint: `hilangkan limit untuk default ${ICON_SEARCH_DEFAULT_LIMIT}` });
      }
      const res = ctx.icons.search(query, { ...(o.lib !== undefined ? { lib: o.lib as string } : {}), limit });
      return JSON.parse(JSON.stringify(res)) as unknown;
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

// ---------------------------------------------------------------------------
// Referensi node/properti/respons (sumber `api.md`, AD-12)
// ---------------------------------------------------------------------------

/** Satu bagian referensi: butir ringkas + contoh opsional (snippet mandiri yang sukses di dokumen kosong). */
export type ApiReferenceSection = { title: string; items: readonly string[]; example?: string };

/** Referensi node, properti, respons execute, dan kode error. Dipakai `renderApiMarkdown()`. */
export const API_REFERENCE: readonly ApiReferenceSection[] = [
  {
    title: 'Katalog node v1',
    items: [
      "Tertutup: board, frame, text, rect, ellipse, path, icon. Kunci di luar skema → SCHEMA_INVALID. Semua node anak wajib `name`.",
      "board (parent null): `{type:'board', name, x, y, width, height, screen:'landing'|'app'|'mobile', expectedSize?:{width,height}, fills?}`. Selalu clip; anak disusun kolom dari kiri atas (seperti frame `layout:'column'`, align start).",
      "frame: `layout?:'none'|'row'|'column'` (default `'none'` = semua anak absolut di x/y, default 0,0), `gap?` (boleh negatif), `padding?`, `align?:'start'|'center'|'end'|'stretch'` (sumbu silang), `justify?:'start'|'center'|'end'|'space-between'` (sumbu utama), `clip?`, `scrollY?` (geser isi ke atas), sizing, cat, radius, efek.",
      "text: `content, size, family?` (default Inter), `weight?` (100–900, default 400), `style?:'normal'|'italic'`, `lineHeight?` (px), `letterSpacing?` (em), `align?:'left'|'center'|'right'|'justify'`, `wrap?`, `numeric?:'proportional'|'tabular'`, `color?` (default #000000), sizing, efek.",
      'rect: sizing, cat, radius, efek. ellipse: sizing, cat, efek + `startDeg?` (0 = jam 12, searah jarum jam), `sweepDeg?` (-360..360), `inner?` (rasio lubang [0,1)) untuk busur/ring.',
      'path: `d` (SVG path), `viewBox:[x,y,w,h]`, sizing, cat, efek. icon: `lib, icon, size, color?, strokeWidth?, filled?`, efek (lihat add).',
    ],
    example:
      `${BOARD}\nconst f = add(b, {type:'frame', name:'Kartu', layout:'column', gap:8, padding:16, width:'fill', radius:12, fills:[{type:'solid', color:'#F6F7F9'}]});\n` +
      "add(f, {type:'text', name:'Judul', content:'Ringkasan', size:20, lineHeight:28, weight:600, color:'#101828'});\n" +
      "add(f, {type:'ellipse', name:'Ring', width:64, height:64, inner:0.8, startDeg:0, sweepDeg:216, fills:[{type:'solid', color:'#4F46E5'}]});\n" +
      "add(f, {type:'path', name:'Shape / Gelombang', d:'M0 8 Q 12 0 24 8 T 48 8', viewBox:[0,0,48,16], stroke:{color:'#0F766E', width:2, align:'center'}});",
  },
  {
    title: 'Sizing',
    items: [
      "`width`/`height`: angka (fixed) | `'hug'` (ikut isi) | `'fill'` (isi sisa ruang di sumbu utama parent, regang di sumbu silang) + `minWidth`/`maxWidth`/`minHeight`/`maxHeight`.",
      "Tanpa width/height: ikut isi di sumbu utama; di sumbu silang ikut `align` parent (board: start = ikut isi). `'fill'` butuh parent yang ukurannya diketahui.",
      "Teks: `wrap` default `'auto'` (satu baris, tidak dibungkus) bila width kosong/'hug', `'wrap'` bila width angka/'fill' (tinggi ikut isi). `'fixed'` = kotak width×height apa adanya. Paragraf: beri width angka atau 'fill'.",
      'icon: kotak `size`×`size`. path tanpa width/height (atau hug) memakai ukuran viewBox.',
    ],
    example:
      `${BOARD}\nconst row = add(b, {type:'frame', name:'Baris', layout:'row', gap:12, width:'fill', padding:[0,20], align:'center'});\n` +
      "add(row, {type:'text', name:'Paragraf', content:'Teks panjang yang dibungkus mengikuti lebar sisa baris ini.', size:16, lineHeight:24, width:'fill'});\n" +
      "add(row, {type:'rect', name:'Penanda', width:24, height:24, radius:6, fills:[{type:'solid', color:'#2563EB'}]});",
  },
  {
    title: 'Padding dan posisi',
    items: [
      '`padding`: angka | `[vertikal, horizontal]` | `[atas, kanan, bawah, kiri]` (urutan CSS).',
      "`position:'absolute'` + `x`/`y`: relatif kotak parent, keluar dari flow (x/y tanpa position → SCHEMA_INVALID). Anak frame `layout:'none'` selalu absolut. Pakai untuk node `Overlay /`; selebihnya flex.",
    ],
    example:
      `${BOARD}\nconst bar = add(b, {type:'frame', name:'Overlay / Tab bar', position:'absolute', x:20, y:746, width:350, height:64, layout:'row', padding:[0,8], align:'center', radius:24, fills:[{type:'solid', color:'#FFFFFF'}], stroke:{color:'#E4E7EC', width:1, align:'inside'}});\n` +
      "add(bar, {type:'icon', lib:'lucide', icon:'house', size:24, color:'#2563EB'});",
  },
  {
    title: 'Cat, stroke, radius',
    items: [
      "`fills[]` (frame/rect/ellipse/path/board): `fills[0]` lapisan paling bawah. `{type:'solid', color}` | `{type:'linear', angle, stops:[{offset, color}]}` (sudut ala CSS: 0 = ke atas, 90 = ke kanan, searah jarum jam) | `{type:'radial', center?:[cx,cy] (0..1, default tengah), radius? (relatif kotak, default 0.5), stops}` | `{type:'image', assetId, fit:'cover'|'contain'|'fill'|'tile'}`.",
      "Warna: `'#RRGGBB'` atau `'#RRGGBBAA'` (alpha di 2 digit akhir, mis. tint `#2563EB14`). rgba()/nama warna ditolak.",
      "`stroke: {color, width, align:'inside'|'center'|'outside', sides?:['top'|'right'|'bottom'|'left']}`; pemisah satu sisi = `sides:['bottom']`.",
      '`radius` (frame/rect): angka atau `[kiriAtas, kananAtas, kananBawah, kiriBawah]`.',
    ],
    example:
      `${BOARD}\nadd(b, {type:'rect', name:'Latar', width:390, height:200, fills:[{type:'solid', color:'#0B0C0F'}, {type:'radial', center:[0.8,0.2], radius:0.6, stops:[{offset:0, color:'#2563EB66'}, {offset:1, color:'#2563EB00'}]}]});\n` +
      "add(b, {type:'frame', name:'Garis bawah', width:'fill', height:48, stroke:{color:'#E4E7EC', width:1, align:'inside', sides:['bottom']}});",
  },
  {
    title: 'Efek',
    items: [
      "Semua node anak: `shadows[]` `{x, y, blur, spread?, color, type?:'drop'|'inner'}` (makna sama dengan CSS box-shadow), `opacity` 0..1, `blend`, `blur`, `backdropBlur`, `rotation` (derajat, searah jarum jam, poros tengah, tidak memengaruhi layout).",
      'Keterbatasan: pada ellipse busur/ring, path, dan icon bayangan mengikuti bentuk tetapi `spread` dan `inner` tidak didukung; `stroke.sides` diabaikan pada ellipse busur dan path. Text: hanya bayangan drop.',
    ],
    example:
      `${BOARD}\nadd(b, {type:'frame', name:'Kartu terangkat', width:200, height:120, radius:12, fills:[{type:'solid', color:'#FFFFFF'}], shadows:[{x:0, y:4, blur:16, color:'#10182814'}]});`,
  },
  {
    title: 'Token',
    items: [
      "`setTokens({'colors.primary':'#0F62FE', 'spacing.4':16})`; nilai properti boleh `{$token:'colors.primary'}` (token harus ada → selain itu TOKEN_UNKNOWN). get/find mengembalikan referensi apa adanya.",
    ],
  },
  {
    title: 'Respons execute',
    items: [
      'Sukses: `{docId, rev, created:[{id, name, path}], value?, valueTruncated?, logs?, check?, bounds?, boundsTruncated?}`. `value` = nilai ekspresi terakhir (JSON). Snippet tanpa op mutasi tidak menaikkan rev (tanpa check/bounds).',
      '`check {boards, summary:{error, warning, gate}, findings:[{level, rule, nodeId, nodeName, detail, expected}]}`: board yang disentuh dirender dan dicek sebelum commit. Temuan tidak membatalkan commit; perbaiki lalu execute lagi.',
      '`bounds {id:[x,y,w,h]}`: dibulatkan, relatif board, untuk board tersentuh, node baru, dan node berubah (maks 60). Pakai untuk tinggi akhir board landing.',
      'Gagal: rollback penuh; error menyebut baris:kolom dan membawa `editId`. Perbaiki tanpa mengirim ulang kode: `execute({editId, edits:[{find, replace}]})` (find muncul tepat sekali; description diwarisi; edits kosong = jalankan ulang; editId hilang saat daemon restart).',
    ],
  },
  {
    title: 'Kode error',
    items: [
      'SCHEMA_INVALID: properti/kunci/nilai salah (pesan menyebut path). NOT_FOUND: ID/dokumen/aset/skill tidak ada. CONFLICT: perubahan bersamaan (dicadangkan).',
      `NO_ACTIVE_DOC: panggil open_doc dulu. EXEC_TIMEOUT: snippet > ${DEFAULT_TIMEOUT_MS / 1000} detik. EXEC_ERROR: error JavaScript atau > ${MAX_OPS} op.`,
      'ICON_UNKNOWN: nama ikon tidak ada (+3 saran). TOKEN_UNKNOWN: token belum di-setTokens. FONT_MISSING: keluarga/weight tidak terdaftar atau karakter di luar latin/latin-ext (ganti dengan node icon).',
      'RENDER_FAILED (retryable): render gagal, coba lagi. EXPORT_FAILED: PNG gagal ditulis. VERSION_MISMATCH: versi mcp ≠ lakard (restart service).',
    ],
  },
];
