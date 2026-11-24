// Transaksi operasi (AD-4): add | update | replace | move | duplicate | remove | insert | setTokens | setTokenModes |
// renameToken | setComponent | resetOverride | detach di atas salinan copy-on-write. Komponen (AD-12): update ke alamat
// komposit menjadi override instance terluar; parent `I/<frameSlot>` mengisi slot; master yang hilang men-detach
// instancenya di op yang sama. Setiap op atomik sendiri: semua validasi selesai sebelum salinan kerja diubah,
// sehingga op gagal yang ditangkap snippet tidak meninggalkan jejak. Setiap op sukses mencatat op inversnya (AD-8);
// commit mengembalikan daftar invers yang, diterapkan sebagai transaksi baru, mengembalikan isi dokumen. Tanpa IO.
import {
  CommentThread,
  ComponentDef,
  ID_PATTERN,
  INSTANCE_KEYS,
  LakarError,
  NodeInput,
  OVERRIDABLE_PROPS,
  Page,
  TokenDef,
  TokenModes,
  TokenName,
  TokenValue,
  XY_HINT,
  expandInstanceAt,
  expandedNodeAt,
  isTokenValueOf,
  resolveDocument,
  suggestTokens,
  zodToLakarError,
  type AnyNode,
  BoardNode,
  ChildNode,
  type DocOp,
  type CreatedEntry,
  type HistoryEntry,
  type InstanceNode,
  type LakarDocument as Doc,
  type TokenDef as TokenDefT,
} from '@lakar/schema';
import { detachedNode, instancesOf, isComposite, mastersIn, pruneSlots, remapAfterDetach, remapComponentIds, slotList, slotTarget } from './components.js';
import { host } from './host.js';
import { isPlainObject } from './object.js';
import { IdAllocator, collectIds, type RandomSource } from './ids.js';
import { inferTokens, tokenTypeOfValue } from './tokens-infer.js';
import { indexNodes, isContainer, locate, parentAddress, subtree, type Container, type Location } from './tree.js';

export type OpKind =
  | 'add'
  | 'update'
  | 'replace'
  | 'move'
  | 'duplicate'
  | 'remove'
  | 'insert'
  | 'setTokens'
  | 'setTokenModes'
  | 'renameToken'
  | 'setComponent'
  | 'resetOverride'
  | 'detach'
  | 'setComments'
  | 'insertPage'
  | 'removePage'
  | 'renamePage'
  | 'movePage';

/**
 * Hasil commit. `entry === null` berarti tidak ada op yang sukses: tidak ada revisi baru, `doc` adalah
 * dokumen asli (rev tetap), dan pemanggil tidak menulis file maupun riwayat. `inverse` (AD-8) = op yang, di-commit
 * sebagai transaksi baru pada `doc`, mengembalikan `pages`/`tokens`/`tokenModes` seperti sebelum commit ini
 * (ID node sama); kosong bila tidak ada op yang berefek.
 */
export type CommitResult = { doc: Doc; entry: HistoryEntry | null; created: CreatedEntry[]; inverse: DocOp[] };

export interface Transaction {
  /**
   * Tambah node. `parentId` null = halaman pertama (khusus board); `parentId` = ID halaman → board ke halaman
   * itu (dipakai viewer untuk halaman aktif). Mengembalikan ID baru secara sinkron.
   */
  add(parentId: string | null, node: unknown): string;
  /** Merge dangkal properti; `null` menghapus kunci opsional. Tidak boleh mengubah `type`/`id`/`children`. */
  update(id: string, patch: unknown): void;
  /** Ganti semua properti (boleh ganti tipe); ID, posisi, dan anak (bila tipe baru kontainer) tetap. */
  replace(id: string, node: unknown): void;
  /** Pindah ke board/frame `parentId` pada `index` (default akhir). `null` = halaman (khusus board, reorder). */
  move(id: string, parentId: string | null, index?: number): void;
  /** Salin subtree dengan ID baru, sisipkan tepat setelah asal; `patch` di-merge ke akar salinan. */
  duplicate(id: string, patch?: unknown): string;
  /** Hapus node beserta subtree-nya. */
  remove(id: string): void;
  /**
   * Sisipkan node tersimpan utuh (dengan `id` dan `children`) beserta ID aslinya: `parentId` = ID halaman (board),
   * board/frame (node anak), atau `null` = halaman pertama; `index` default akhir. Dipakai invers `remove` (AD-8).
   * ID yang sudah ada di dokumen (atau ganda di subtree) → CONFLICT. Mengembalikan ID akar.
   */
  insert(parentId: string | null, node: unknown, index?: number): string;
  /**
   * Merge peta token ke `doc.tokens` (AD-11). Nilai: `null` menghapus; string/angka datar mengganti `value` token
   * yang ada (`type`/`modes` tetap) atau membuat token baru yang tipenya diinferensi saat commit; objek
   * `{type, value, modes?}` menggantikan token sepenuhnya.
   */
  setTokens(map: unknown): void;
  /** Ganti daftar mode tema dokumen (elemen pertama = default); `null` menghapus `tokenModes`. Konsistensi dicek saat commit. */
  setTokenModes(modes: unknown): void;
  /**
   * Ganti nama token `from` → `to`: definisi pindah (posisi kunci tetap) dan setiap ref `{$token: from}` di semua
   * halaman ikut berganti. `from` tidak ada → TOKEN_UNKNOWN; `to` sudah ada → CONFLICT; `from === to` tanpa efek.
   */
  renameToken(from: unknown, to: unknown): void;
  /**
   * Jadikan node anak master (`component` = `{props, slots}`) atau lepas status master (`null`): instance master
   * itu di-detach di op yang sama. Bind/slot harus menunjuk node di dalam master (slot: frame turunan).
   */
  setComponent(id: string, component: unknown): void;
  /** Hapus override pada `address` (ID instance = akar, atau komposit); `props` = hanya properti itu. */
  resetOverride(address: string, props?: unknown): void;
  /** Ganti instance dengan node biasa ber-ID baru; `null` bila akarnya disembunyikan prop sendiri (instance dihapus). */
  detach(id: string): string | null;
  /** Ganti seluruh daftar komentar dokumen; `null` menghapus field `comments`. Tiap entri divalidasi `CommentThread`. */
  setComments(comments: unknown): void;
  /**
   * Sisipkan halaman tersimpan utuh (`{id, name, children}`) pada `index` (default akhir). ID halaman dan semua
   * ID node di dalamnya harus belum dipakai → CONFLICT. Dipakai op `insertPage` (klien sync) dan invers `removePage`.
   */
  insertPage(page: unknown, index?: number): string;
  /** Hapus halaman `id` beserta seluruh board-nya; halaman terakhir tidak boleh dihapus. Inversnya `insertPage`. */
  removePage(id: string): void;
  /** Ganti nama halaman `id`; nama harus string tidak kosong. Inversnya renamePage ke nama lama. */
  renamePage(id: unknown, name: unknown): void;
  /** Pindahkan halaman `id` ke posisi `index` (0..jumlah-1); halaman lain bergeser. Inversnya movePage ke indeks lama. */
  movePage(id: unknown, index: unknown): void;
  /**
   * Salinan kerja hidup (melihat op yang sudah sukses di transaksi ini). Hanya-baca menurut kontrak:
   * pemanggil tidak boleh memutasinya. Melempar bila transaksi sudah ditutup.
   */
  view(): Doc;
  commit(description: string): CommitResult;
  rollback(): void;
  readonly open: boolean;
}

export type TransactionOptions = { sessionId: string; random?: RandomSource; now?: () => Date };

const ADDRESS_HINT = 'alamati node hanya dengan ID 8 karakter dari add()/duplicate() atau created[].id; nama dan path tidak diterima';
const FORBIDDEN_PATCH_KEYS: Record<string, string> = {
  type: 'untuk mengganti tipe pakai replace(id, {type, name, ...})',
  id: 'ID tidak bisa diubah; buat node baru dengan add() atau duplicate()',
  children: 'anak diubah lewat add/move/remove, bukan lewat patch',
};

const CONTENT_HINT =
  'isi instance diubah lewat update(alamat, patch) (menjadi override) atau resetOverride(alamat); untuk mengubah strukturnya ubah master atau detach(instanceId); slot diisi lewat parent "<instanceId>/<frameSlot>"';

function requireId(op: OpKind, what: string, v: unknown): string {
  if (isComposite(v)) {
    throw new LakarError('SCHEMA_INVALID', `${op}: ${what} ${v} adalah alamat isi instance; ${op} hanya menerima ID node tersimpan`, { hint: CONTENT_HINT });
  }
  if (typeof v !== 'string' || !ID_PATTERN.test(v)) {
    throw new LakarError('SCHEMA_INVALID', `${op}: ${what} harus ID 8 karakter [A-Za-z0-9], bukan ${JSON.stringify(v) ?? 'undefined'}`, { hint: ADDRESS_HINT });
  }
  return v;
}

function mustLocate(doc: Doc, op: OpKind, id: string, what = 'node'): Location {
  const loc = locate(doc, id);
  if (!loc) {
    throw new LakarError('NOT_FOUND', `${op}: ${what} ${id} tidak ada`, {
      hint: 'pakai ID yang dikembalikan add()/duplicate() atau created[].id; node yang sudah di-remove tidak bisa dipakai lagi',
    });
  }
  return loc;
}

/** Properti node tanpa `id`/`children` (bentuk input `NodeInput`). */
function propsOf(n: AnyNode): Record<string, unknown> {
  const { id: _id, ...rest } = n as AnyNode & { children?: unknown };
  delete (rest as { children?: unknown }).children;
  return rest;
}

/** Kesamaan struktural nilai JSON (urutan kunci objek tidak diperhatikan). */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && sameValue(a[k], b[k]));
}

/**
 * Patch `update` yang mengubah properti `after` kembali ke `before`: hanya kunci yang berbeda, nilai lama atau
 * `null` (kunci dulu tidak ada). Kosong → `undefined`.
 */
function revertPatch(before: AnyNode, after: AnyNode): Record<string, unknown> | undefined {
  const b = propsOf(before);
  const a = propsOf(after);
  const patch: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (sameValue(b[key], a[key])) continue;
    patch[key] = Object.hasOwn(b, key) ? host.structuredClone(b[key]) : null;
  }
  return Object.keys(patch).length ? patch : undefined;
}

function parseInput(op: OpKind, raw: unknown): NodeInput {
  const parsed = NodeInput.safeParse(raw);
  if (!parsed.success) throw zodToLakarError(parsed.error, op);
  return parsed.data;
}

/** Aturan `update` (dipakai juga oleh `duplicate`): merge dangkal + validasi skema tipe node. */
function mergePatch(op: OpKind, node: AnyNode, patch: unknown): NodeInput {
  if (!isPlainObject(patch)) {
    throw new LakarError('SCHEMA_INVALID', `${op}: patch harus objek properti, bukan ${Array.isArray(patch) ? 'array' : JSON.stringify(patch) ?? 'undefined'}`, {
      hint: `contoh: ${op}(id, {gap: 12, padding: null}); null menghapus properti opsional`,
    });
  }
  for (const key of Object.keys(patch)) {
    if (Object.hasOwn(FORBIDDEN_PATCH_KEYS, key)) {
      throw new LakarError('SCHEMA_INVALID', `${op}: properti ${key} tidak bisa diubah lewat patch`, { hint: FORBIDDEN_PATCH_KEYS[key]! });
    }
  }
  const merged = propsOf(node);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  const parsed = NodeInput.safeParse(merged);
  if (!parsed.success) {
    const e = zodToLakarError(parsed.error, `${op} ${node.type} ${node.id}`);
    // x/y pada node flow sudah membawa XY_HINT; selain itu tambahkan cara menghapus/ganti tipe.
    const hint = e.hint === XY_HINT ? e.hint : `${e.hint}; null menghapus properti opsional (properti wajib tidak bisa dihapus); ganti tipe → replace`;
    throw new LakarError('SCHEMA_INVALID', e.message, { hint });
  }
  return parsed.data;
}

/**
 * Anak frame `layout:'none'` selalu absolut: input/patch polos tanpa kunci `position` yang membawa x atau y
 * mendapat `position:'absolute'` eksplisit (dokumen tersimpan tetap valid terhadap skema per-node). Parent flow
 * (row/column) dan board tidak dinormalisasi: x/y tanpa position di sana tetap SCHEMA_INVALID + XY_HINT.
 */
function implicitAbsolute(parent: AnyNode | null | undefined, raw: unknown): unknown {
  if (!parent || parent.type !== 'frame' || (parent.layout ?? 'none') !== 'none') return raw;
  if (!isPlainObject(raw) || Object.hasOwn(raw, 'position') || raw.type === 'board') return raw;
  const has = (v: unknown) => v !== undefined && v !== null;
  return has(raw.x) || has(raw.y) ? { ...raw, position: 'absolute' } : raw;
}

/** Bangun node tersimpan dari input tervalidasi; anak hanya untuk kontainer. */
function buildNode(input: NodeInput, id: string, children: ChildNode[] | undefined): AnyNode {
  if (input.type === 'board' || input.type === 'frame') return { ...input, id, children: children ?? [] } as AnyNode;
  return { ...input, id } as AnyNode;
}

/**
 * Op yang memulihkan node pada lokasi `loc` sesudah node itu dicabut (invers remove/detach). Isi slot yatim
 * (nama slot tidak ada lagi di master) tidak punya alamat: dipulihkan dengan peta `slots` instance utuh.
 */
function reinsertOp(loc: Location): DocOp {
  const node = host.structuredClone(loc.node) as unknown as Record<string, unknown>;
  if (loc.slot) {
    if (loc.slot.address) return { op: 'insert', parentId: loc.slot.address, node, index: loc.index };
    return { op: 'update', id: loc.slot.instance.id, patch: { slots: host.structuredClone(loc.slot.instance.slots) } };
  }
  return { op: 'insert', parentId: loc.parent ? loc.parent.id : loc.page.id, node, index: loc.index };
}

const COMPONENT_HINT =
  "setComponent(id, {props:[{name:'title', type:'text', default:'Judul', binds:[{nodeId, prop:'content'}]}], slots:[{name:'body', nodeId:<frame turunan>}]}); null melepas status master (instancenya di-detach)";
const RESET_HINT = "resetOverride('<instanceId>/<idNodeMaster>', ['content']) atau resetOverride(instanceId) untuk override akar; tanpa props = semua properti kunci itu";
const OVERRIDE_HINT = 'override = properti node (mis. content, fills, color); type/id/children/component tidak bisa di-override';

const TOKENS_HINT =
  'setTokens({"colors.text-primary": "#1A1A1A", "spacing.2": 8}) atau bertipe {"colors.bg": {type:"color", value:"#FFFFFF", modes:{dark:"#000000"}}}; nama: segmen [a-z0-9-] dipisah titik; nilai datar: angka atau string tak kosong; null menghapus token';
const RENAME_HINT = "renameToken('colors.primary', 'colors.brand'): nama lama harus ada, nama baru belum dipakai; nama: segmen [a-z0-9-] dipisah titik";

function requireTokenName(what: string, v: unknown): string {
  if (typeof v !== 'string' || !TokenName.safeParse(v).success) {
    throw new LakarError('SCHEMA_INVALID', `renameToken: ${what} harus nama token (segmen [a-z0-9-] dipisah titik, maks 64), bukan ${JSON.stringify(v) ?? 'undefined'}`, { hint: RENAME_HINT });
  }
  return v;
}

/** Ganti setiap ref `{$token: from}` di dalam nilai JSON (in place); mengembalikan jumlah ref yang diganti. */
function renameRefs(value: unknown, from: string, to: string): number {
  if (Array.isArray(value)) return value.reduce<number>((n, v) => n + renameRefs(v, from, to), 0);
  if (!isPlainObject(value)) return 0;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === '$token') {
    if (value.$token !== from) return 0;
    value.$token = to;
    return 1;
  }
  let n = 0;
  for (const k of keys) n += renameRefs(value[k], from, to);
  return n;
}

const TOKEN_MODES_HINT = 'setTokenModes(["light","dark"]): nama mode [a-z0-9-] (maks 32), minimal satu, tanpa duplikat, elemen pertama = default; null menghapus tokenModes';

/** Satu entri `setTokens` tervalidasi: hapus, nilai datar, atau definisi bertipe lengkap. */
type TokenPatchEntry = { name: string } & ({ kind: 'delete' } | { kind: 'flat'; value: string | number } | { kind: 'def'; def: TokenDefT });

/**
 * Validasi seluruh peta token sebelum apa pun diubah; satu entri salah → seluruh peta ditolak. Nilai datar untuk
 * token yang sudah ada (dan bukan token baru di transaksi ini, `pending`) wajib sah untuk tipe token itu.
 */
function parseTokenPatch(map: unknown, existing: Readonly<Record<string, TokenDefT>>, pending: ReadonlySet<string>): TokenPatchEntry[] {
  if (!isPlainObject(map)) {
    throw new LakarError('SCHEMA_INVALID', `setTokens: argumen harus objek {nama: nilai}, bukan ${Array.isArray(map) ? 'array' : JSON.stringify(map) ?? 'undefined'}`, { hint: TOKENS_HINT });
  }
  const problems: string[] = [];
  const out: TokenPatchEntry[] = [];
  for (const [name, value] of Object.entries(map)) {
    if (!TokenName.safeParse(name).success) problems.push(`nama token tidak valid: ${JSON.stringify(name)}`);
    if (value === null) out.push({ name, kind: 'delete' });
    else if (isPlainObject(value)) {
      const d = TokenDef.safeParse(value);
      if (d.success) out.push({ name, kind: 'def', def: d.data });
      else problems.push(zodToLakarError(d.error, name).message);
    } else {
      const v = TokenValue.safeParse(value);
      if (!v.success) {
        problems.push(`${name}: nilai harus angka, string tak kosong, atau {type, value, modes?}, bukan ${JSON.stringify(value) ?? 'undefined'}`);
        continue;
      }
      const old = Object.hasOwn(existing, name) && !pending.has(name) ? existing[name] : undefined;
      if (old && !isTokenValueOf(old.type, v.data)) problems.push(`${name}: nilai ${JSON.stringify(v.data)} tidak sah untuk token bertipe ${old.type}`);
      else out.push({ name, kind: 'flat', value: v.data });
    }
  }
  if (problems.length) throw new LakarError('SCHEMA_INVALID', `setTokens: ${problems.join('; ')}`, { hint: TOKENS_HINT });
  return out;
}

/**
 * Transaksi copy-on-write (AD-4): semua op bekerja di `structuredClone(doc)`.
 * `commit` mengembalikan dokumen baru (rev +1) + entri riwayat; `rollback` membuang salinan kerja.
 * Dokumen asli tidak pernah dimutasi.
 */
export function beginTransaction(doc: Doc, opts: TransactionOptions): Transaction {
  let work: Doc | undefined = host.structuredClone(doc);
  const ids = IdAllocator.forDocument(doc, opts.random);
  /** ID node baru dalam urutan pembuatan; difilter ke yang masih ada saat commit. */
  const createdIds: string[] = [];
  const ops = new Map<OpKind, number>();
  /** Invers per op sukses, urut penerapan (AD-8); dibalik saat commit. */
  const inverses: DocOp[][] = [];
  /** Token baru dari nilai datar di transaksi ini: tipenya diinferensi saat commit (AD-11, seperti migrasi). */
  const pendingFlat = new Set<string>();
  const now = opts.now ?? (() => new Date());

  const live = (): Doc => {
    if (!work) throw new Error('transaksi sudah ditutup (commit/rollback)');
    return work;
  };
  /**
   * Jalankan op: hitung dan catat inversnya hanya bila sukses (op yang melempar tidak meninggalkan jejak).
   * `undo` dipanggil op sesudah validasi, dengan op yang membatalkan efeknya.
   */
  const op = <T>(kind: OpKind, fn: (w: Doc, undo: (inv: DocOp) => void) => T): T => {
    const inv: DocOp[] = [];
    const result = fn(live(), (o) => inv.push(o));
    ops.set(kind, (ops.get(kind) ?? 0) + 1);
    inverses.push(inv);
    return result;
  };
  /** Jalankan `f` yang memutasi lebih dari satu tempat; gagal di tengah → salinan kerja dipulihkan (op atomik). */
  const withRollback = <T>(f: () => T): T => {
    const snap = host.structuredClone(live());
    try {
      return f();
    } catch (e) {
      work = snap;
      throw e;
    }
  };

  /**
   * Detach instance `iid` (AD-12) di tempat: diganti salinan beku hasil ekspansinya (ID baru, isi slot tetap).
   * Mengembalikan ID akar baru (`null` = akar tersembunyi, instance dihapus) dan invers urut penerapan undo.
   */
  const detachOne = (w: Doc, opName: OpKind, iid: string): { id: string | null; inv: DocOp[] } => {
    const loc = mustLocate(w, opName, iid, 'instance');
    if (loc.node.type !== 'instance') {
      throw new LakarError('SCHEMA_INVALID', `${opName}: node ${loc.node.type} ${iid} bukan instance`, { hint: 'detach hanya untuk node bertipe instance' });
    }
    const inst = loc.node;
    const back = reinsertOp(loc);
    const expanded = expandInstanceAt(w, iid);
    if (!expanded) {
      loc.siblings.splice(loc.index, 1);
      if (loc.slot) pruneSlots(loc.slot.instance, loc.slot.name);
      return { id: null, inv: [back] };
    }
    const built = detachedNode(expanded, inst, () => ids.next());
    const parsed = ChildNode.safeParse(built.node);
    if (!parsed.success) throw zodToLakarError(parsed.error, `${opName} instance ${iid}`);
    const restore = remapAfterDetach(w, iid, built.map);
    loc.siblings[loc.index] = parsed.data;
    createdIds.push(...built.fresh);
    return { id: parsed.data.id, inv: [{ op: 'remove', id: parsed.data.id }, back, ...restore] };
  };

  /** Detach semua instance tersimpan dari `masters` di luar `exclude`; invers per langkah (urut penerapan). */
  const detachAll = (w: Doc, opName: OpKind, masters: ReadonlySet<string>, exclude?: ReadonlySet<string>): DocOp[][] =>
    instancesOf(w, masters, exclude).map((iid) => detachOne(w, opName, iid).inv);

  /** Catat invers langkah detach (langkah terakhir dibatalkan lebih dulu). */
  const undoSteps = (steps: DocOp[][], undo: (inv: DocOp) => void) => {
    for (const s of [...steps].reverse()) s.forEach(undo);
  };

  /**
   * Siapkan override `patch` pada `address` (ID instance = akar, atau komposit) milik instance `inst` tanpa
   * memutasi: validasi node efektif (`NodeInput`), lalu kembalikan penerap (mencari ulang instance) dan inversnya.
   */
  const prepareOverride = (w: Doc, opName: OpKind, inst: InstanceNode, address: string, patch: Record<string, unknown>) => {
    for (const key of Object.keys(patch)) {
      if (Object.hasOwn(FORBIDDEN_PATCH_KEYS, key) || key === 'component') {
        throw new LakarError('SCHEMA_INVALID', `${opName}: properti ${key} pada isi instance ${address} tidak bisa di-override`, { hint: OVERRIDE_HINT });
      }
      if (!OVERRIDABLE_PROPS.includes(key)) {
        throw new LakarError('SCHEMA_INVALID', `${opName}: properti ${key} tidak dikenal untuk override`, { hint: OVERRIDE_HINT });
      }
    }
    const hit = expandedNodeAt(w, address);
    if (!hit) {
      throw new LakarError('NOT_FOUND', `${opName}: isi instance ${address} tidak ada`, {
        hint: 'alamat = <instanceId>/<idNodeMaster>[/…] dari get()/find() atau seleksi; node yang disembunyikan prop boolean tidak bisa dialamati',
      });
    }
    const parent = hit.parent ?? (address === inst.id ? (locate(w, inst.id)?.parent ?? null) : null);
    const norm = implicitAbsolute(parent as AnyNode | null, patch) as Record<string, unknown>;
    mergePatch(opName, hit.node as unknown as AnyNode, norm);
    const key = address === inst.id ? inst.componentId : address.slice(inst.id.length + 1);
    const old = inst.overrides?.[key] ?? {};
    const restore: Record<string, unknown> = {};
    const fresh: string[] = [];
    for (const [p, v] of Object.entries(norm)) {
      if (v === undefined) continue;
      if (!Object.hasOwn(old, p)) fresh.push(p);
      else if (!sameValue(old[p], v)) restore[p] = host.structuredClone(old[p]);
    }
    const inv: DocOp[] = [];
    if (Object.keys(restore).length) inv.push({ op: 'update', id: address, patch: restore });
    if (fresh.length) inv.push({ op: 'resetOverride', id: address, props: fresh });
    const apply = () => {
      const target = locate(live(), inst.id)!.node as InstanceNode;
      const entry: Record<string, unknown> = { ...(target.overrides?.[key] ?? {}) };
      for (const [p, v] of Object.entries(norm)) if (v !== undefined) entry[p] = v;
      target.overrides = { ...(target.overrides ?? {}), [key]: entry };
    };
    return { apply, inv };
  };

  return {
    get open() {
      return work !== undefined;
    },

    view() {
      return live();
    },

    add(parentId, raw) {
      return op('add', (w, undo) => {
        if (isComposite(parentId)) {
          // Isi slot instance (AD-12): parent = "<instanceId>/<frameSlot>".
          const t = slotTarget(w, 'add', parentId);
          const input = parseInput('add', implicitAbsolute(t.frame, raw));
          if (input.type === 'board') throw new LakarError('SCHEMA_INVALID', 'board hanya boleh menjadi anak halaman', { hint: 'pakai add(null, {type:"board",...})' });
          const id = ids.next();
          slotList(t).push(buildNode(input, id, undefined) as ChildNode);
          createdIds.push(id);
          undo({ op: 'remove', id });
          return id;
        }
        const pid = parentId === null ? null : requireId('add', 'parentId', parentId);
        // Parent dicari tanpa throw dulu (normalisasi x/y); urutan error lama tetap (skema → parent).
        const input = parseInput('add', implicitAbsolute(pid === null ? null : locate(w, pid)?.node, raw));
        let target: Container | null = null;
        // ID halaman (viewer: board baru di halaman aktif); halaman bukan node, jadi dicari terpisah.
        const page = pid === null ? w.pages[0]! : w.pages.find((p) => p.id === pid);
        if (page && pid !== null) {
          if (input.type !== 'board') {
            throw new LakarError('SCHEMA_INVALID', `add(pageId, …) hanya untuk board, bukan ${input.type}`, {
              hint: 'anak halaman hanya board; tambahkan node anak ke dalam board: add(boardId, {...})',
            });
          }
        } else if (pid === null) {
          if (input.type !== 'board') {
            throw new LakarError('SCHEMA_INVALID', `add(null, …) hanya untuk board, bukan ${input.type}`, {
              hint: 'anak halaman hanya board; tambahkan node anak (frame, text, rect, ellipse, path, icon) ke dalam board: add(boardId, {...})',
            });
          }
        } else {
          const parent = mustLocate(w, 'add', pid, 'parent');
          if (input.type === 'board') {
            throw new LakarError('SCHEMA_INVALID', 'board hanya boleh menjadi anak halaman', { hint: 'pakai add(null, {type:"board",...})' });
          }
          if (!isContainer(parent.node)) {
            throw new LakarError('SCHEMA_INVALID', `node ${parent.node.type} ${pid} tidak bisa punya anak`, {
              hint: 'hanya board dan frame yang bisa punya anak; tambahkan ke board atau frame',
            });
          }
          target = parent.node;
        }
        const id = ids.next();
        const node = buildNode(input, id, undefined);
        if (target === null) page!.children.push(node as BoardNode);
        else target.children.push(node as ChildNode);
        createdIds.push(id);
        undo({ op: 'remove', id });
        return id;
      });
    },

    update(id, patch) {
      op('update', (w, undo) => {
        if (isComposite(id)) {
          // Alamat komposit (AD-12) → override pada instance terluar (segmen pertama).
          const iid = id.split('/')[0]!;
          const loc = mustLocate(w, 'update', iid, 'instance');
          if (loc.node.type !== 'instance') throw new LakarError('NOT_FOUND', `update: isi instance ${id} tidak ada (${iid} bukan instance)`, { hint: CONTENT_HINT });
          if (!isPlainObject(patch)) mergePatch('update', loc.node, patch);
          const prep = prepareOverride(w, 'update', loc.node, id, patch as Record<string, unknown>);
          prep.apply();
          prep.inv.forEach(undo);
          return;
        }
        const loc = mustLocate(w, 'update', requireId('update', 'id', id));
        let own: unknown = patch;
        let over: ReturnType<typeof prepareOverride> | undefined;
        if (loc.node.type === 'instance' && isPlainObject(patch)) {
          // Kunci non-instance pada instance = override akar (kunci componentId), mis. fills dari panel Design.
          const mine: Record<string, unknown> = {};
          const rest: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(patch)) (INSTANCE_KEYS.includes(k) || Object.hasOwn(FORBIDDEN_PATCH_KEYS, k) ? mine : rest)[k] = v;
          if (Object.keys(rest).length) {
            over = prepareOverride(w, 'update', loc.node, loc.node.id, rest);
            own = mine;
          }
        }
        const input = mergePatch('update', loc.node, implicitAbsolute(loc.parent, own));
        const vanishing = loc.node.type !== 'board' && loc.node.type !== 'instance' && loc.node.component !== undefined && (input as { component?: unknown }).component === undefined;
        const apply = (steps: DocOp[][]) => {
          const at = steps.length ? mustLocate(live(), 'update', loc.node.id) : loc;
          const next = buildNode(input, at.node.id, 'children' in at.node ? at.node.children : undefined);
          const revert = revertPatch(at.node, next);
          at.siblings[at.index] = next;
          over?.apply();
          over?.inv.forEach(undo);
          if (revert) undo({ op: 'update', id: next.id, patch: revert });
          undoSteps(steps, undo);
        };
        // Lepas status master lewat patch component:null → instancenya di-detach dulu (AD-12).
        if (vanishing) withRollback(() => apply(detachAll(live(), 'update', new Set([loc.node.id]))));
        else apply([]);
      });
    },

    replace(id, raw) {
      op('replace', (w, undo) => {
        const loc = mustLocate(w, 'replace', requireId('replace', 'id', id));
        if (isPlainObject(raw) && (Object.hasOwn(raw, 'id') || Object.hasOwn(raw, 'children'))) {
          throw new LakarError('SCHEMA_INVALID', 'replace: node pengganti tidak boleh membawa id atau children', {
            hint: 'ID dan posisi dipertahankan otomatis; anak dipertahankan bila tipe baru frame/board',
          });
        }
        const input = parseInput('replace', implicitAbsolute(loc.parent, raw));
        const old = loc.node;
        if (old.type === 'board' && input.type !== 'board') {
          throw new LakarError('SCHEMA_INVALID', `replace: board ${old.id} hanya bisa diganti dengan board, bukan ${input.type}`, {
            hint: 'anak halaman hanya board; untuk mengubah properti board pakai update atau replace dengan {type:"board",...}',
          });
        }
        if (old.type !== 'board' && input.type === 'board') {
          throw new LakarError('SCHEMA_INVALID', `replace: ${old.type} ${old.id} tidak bisa menjadi board`, {
            hint: 'board hanya boleh menjadi anak halaman; buat board baru dengan add(null, {type:"board",...})',
          });
        }
        const children = 'children' in old ? old.children : [];
        if (children.length > 0 && input.type !== 'frame' && input.type !== 'board') {
          throw new LakarError('SCHEMA_INVALID', `replace: ${old.type} ${old.id} punya ${children.length} anak; tipe ${input.type} tidak bisa punya anak`, {
            hint: 'pindahkan anaknya (move) atau hapus (remove) dulu, atau ganti ke tipe frame agar anak dipertahankan',
          });
        }
        const back: DocOp = { op: 'replace', id: old.id, node: host.structuredClone(propsOf(old)) };
        const vanishing = old.type !== 'board' && old.type !== 'instance' && old.component !== undefined && (input as { component?: unknown }).component === undefined;
        if (!vanishing) {
          loc.siblings[loc.index] = buildNode(input, old.id, children);
          undo(back);
          return;
        }
        // Pengganti tanpa component = master hilang → instancenya di-detach dulu di op yang sama (AD-12).
        withRollback(() => {
          const steps = detachAll(live(), 'replace', new Set([old.id]));
          const at = mustLocate(live(), 'replace', old.id);
          at.siblings[at.index] = buildNode(input, old.id, 'children' in at.node ? at.node.children : []);
          undo(back);
          undoSteps(steps, undo);
        });
      });
    },

    move(id, parentId, index) {
      op('move', (w, undo) => {
        const loc = mustLocate(w, 'move', requireId('move', 'id', id));
        const node = loc.node;
        let dest: AnyNode[];
        let slot: ReturnType<typeof slotTarget> | undefined;
        if (parentId === null) {
          if (node.type !== 'board') {
            throw new LakarError('SCHEMA_INVALID', `move(id, null): hanya board yang bisa menjadi anak halaman, bukan ${node.type}`, {
              hint: 'pindahkan node anak ke board atau frame: move(id, boardId|frameId, index?)',
            });
          }
          dest = loc.page.children;
        } else if (isComposite(parentId)) {
          // Ke slot instance (AD-12); daftar slot baru dibuat hanya bila op lolos validasi.
          slot = slotTarget(w, 'move', parentId);
          if (node.type === 'board') throw new LakarError('SCHEMA_INVALID', 'move: board hanya boleh menjadi anak halaman', { hint: 'untuk mengubah urutan board pakai move(boardId, null, index)' });
          if (slot.instance.id === node.id || slot.loc.ancestors.some((a) => a.id === node.id)) {
            throw new LakarError('SCHEMA_INVALID', `move: ${node.id} tidak bisa dipindah ke slot di dalam dirinya sendiri (${parentId})`, { hint: 'pilih slot di luar subtree node yang dipindah' });
          }
          dest = slot.instance.slots?.[slot.name] ?? [];
        } else {
          const pid = requireId('move', 'parentId', parentId);
          const target = mustLocate(w, 'move', pid, 'parent');
          if (node.type === 'board') {
            throw new LakarError('SCHEMA_INVALID', 'move: board hanya boleh menjadi anak halaman', {
              hint: 'untuk mengubah urutan board pakai move(boardId, null, index)',
            });
          }
          if (pid === node.id || target.ancestors.some((a) => a.id === node.id)) {
            throw new LakarError('SCHEMA_INVALID', `move: ${node.id} tidak bisa dipindah ke dirinya sendiri atau keturunannya (${pid})`, {
              hint: 'pilih parent di luar subtree node yang dipindah',
            });
          }
          if (!isContainer(target.node)) {
            throw new LakarError('SCHEMA_INVALID', `move: node ${target.node.type} ${pid} tidak bisa punya anak`, {
              hint: 'hanya board dan frame yang bisa punya anak; pindahkan ke board atau frame',
            });
          }
          dest = target.node.children;
        }
        const max = dest.length - (dest === loc.siblings ? 1 : 0);
        if (index !== undefined && (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > max)) {
          throw new LakarError('SCHEMA_INVALID', `move: index harus integer 0..${max}, bukan ${JSON.stringify(index) ?? 'undefined'}`, {
            hint: 'index = posisi akhir di antara anak parent tujuan; hilangkan index untuk menaruh di akhir',
          });
        }
        // Asal di slot yatim (tanpa alamat): invers memulihkan peta slots instance utuh.
        const orphanBack = loc.slot && !loc.slot.address ? reinsertOp(loc) : undefined;
        loc.siblings.splice(loc.index, 1);
        if (slot && dest.length === 0 && slot.instance.slots?.[slot.name] === undefined) dest = slotList(slot);
        const at = index ?? dest.length;
        dest.splice(at, 0, node);
        if (loc.slot) pruneSlots(loc.slot.instance, loc.slot.name);
        // Pindah ke posisi yang sama (wadah dan indeks akhir sama) tidak menghasilkan invers.
        if (dest === loc.siblings && at === loc.index) return;
        if (orphanBack) {
          undo({ op: 'remove', id: node.id });
          undo(orphanBack);
        } else undo({ op: 'move', id: node.id, parentId: parentAddress(loc), index: loc.index });
      });
    },

    duplicate(id, patch) {
      return op('duplicate', (w, undo) => {
        const loc = mustLocate(w, 'duplicate', requireId('duplicate', 'id', id));
        const rootInput = patch === undefined ? undefined : mergePatch('duplicate', loc.node, implicitAbsolute(loc.parent, patch));
        const copy = host.structuredClone(loc.node);
        const fresh: string[] = [];
        const renamed = new Map<string, string>();
        // subtree ikut isi slot instance, jadi salinan isi slot juga mendapat ID baru.
        for (const n of subtree(copy)) {
          const nid = ids.next();
          renamed.set(n.id, nid);
          n.id = nid;
          fresh.push(nid);
        }
        // Patch dibangun dari properti asal: isi slot instance diambil dari salinan (ID baru), kecuali patch membawa slots sendiri.
        const keepSlots = copy.type === 'instance' && copy.slots && !(isPlainObject(patch) && Object.hasOwn(patch, 'slots'));
        const input = rootInput && keepSlots ? ({ ...rootInput, slots: (copy as InstanceNode).slots } as NodeInput) : rootInput;
        const root = input ? buildNode(input, copy.id, 'children' in copy ? copy.children : undefined) : copy;
        // Salinan master menjadi master baru: bind/slot menunjuk node salinan, bukan node master asal.
        for (const n of subtree(root)) remapComponentIds(n, renamed);
        loc.siblings.splice(loc.index + 1, 0, root);
        createdIds.push(...fresh);
        undo({ op: 'remove', id: root.id });
        return root.id;
      });
    },

    remove(id) {
      op('remove', (w, undo) => {
        const loc = mustLocate(w, 'remove', requireId('remove', 'id', id));
        const masters = mastersIn(loc.node);
        const removeAt = (at: Location) => {
          // Board: parent = ID halamannya (bisa bukan halaman pertama); isi slot: alamat slot.
          const back = reinsertOp(at);
          at.siblings.splice(at.index, 1);
          if (at.slot) pruneSlots(at.slot.instance, at.slot.name);
          undo(back);
        };
        if (!masters.size) return removeAt(loc);
        // Master ikut terhapus → instancenya di luar subtree ini di-detach dulu, di op yang sama (AD-12).
        const inside = new Set(subtree(loc.node).map((n) => n.id));
        withRollback(() => {
          const steps = detachAll(live(), 'remove', masters, inside);
          removeAt(mustLocate(live(), 'remove', loc.node.id));
          undoSteps(steps, undo);
        });
      });
    },

    insert(parentId, raw, index) {
      return op('insert', (w, undo) => {
        const slot = isComposite(parentId) ? slotTarget(w, 'insert', parentId) : undefined;
        const pid = parentId === null || slot ? null : requireId('insert', 'parentId', parentId);
        if (!isPlainObject(raw)) {
          throw new LakarError('SCHEMA_INVALID', `insert: node harus objek node tersimpan, bukan ${Array.isArray(raw) ? 'array' : JSON.stringify(raw) ?? 'undefined'}`, {
            hint: 'insert menerima node utuh dengan id dan children (mis. dari op invers remove)',
          });
        }
        const page = slot ? undefined : pid === null ? w.pages[0]! : w.pages.find((p) => p.id === pid);
        let dest: AnyNode[];
        let node: AnyNode;
        if (slot) {
          if (raw.type === 'board') throw new LakarError('SCHEMA_INVALID', 'board hanya boleh menjadi anak halaman', { hint: 'insert(pageId | null, board)' });
          const parsed = ChildNode.safeParse(raw);
          if (!parsed.success) throw zodToLakarError(parsed.error, 'insert');
          dest = slot.instance.slots?.[slot.name] ?? [];
          node = parsed.data;
        } else if (page) {
          if (raw.type !== 'board') {
            throw new LakarError('SCHEMA_INVALID', `insert(pageId, …) hanya untuk board, bukan ${JSON.stringify(raw.type) ?? 'undefined'}`, {
              hint: 'anak halaman hanya board; sisipkan node anak ke board atau frame',
            });
          }
          const parsed = BoardNode.safeParse(raw);
          if (!parsed.success) throw zodToLakarError(parsed.error, 'insert');
          dest = page.children;
          node = parsed.data;
        } else {
          const parent = mustLocate(w, 'insert', pid!, 'parent');
          if (raw.type === 'board') throw new LakarError('SCHEMA_INVALID', 'board hanya boleh menjadi anak halaman', { hint: 'insert(pageId | null, board)' });
          if (!isContainer(parent.node)) {
            throw new LakarError('SCHEMA_INVALID', `node ${parent.node.type} ${pid} tidak bisa punya anak`, {
              hint: 'hanya board dan frame yang bisa punya anak; sisipkan ke board atau frame',
            });
          }
          const parsed = ChildNode.safeParse(raw);
          if (!parsed.success) throw zodToLakarError(parsed.error, 'insert');
          dest = parent.node.children;
          node = parsed.data;
        }
        if (index !== undefined && (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > dest.length)) {
          throw new LakarError('SCHEMA_INVALID', `insert: index harus integer 0..${dest.length}, bukan ${JSON.stringify(index) ?? 'undefined'}`, {
            hint: 'index = posisi di antara anak parent tujuan; hilangkan index untuk menaruh di akhir',
          });
        }
        const fresh = subtree(node).map((n) => n.id);
        const taken = new Set(collectIds(w));
        const seen = new Set<string>();
        for (const nid of fresh) {
          if (taken.has(nid) || seen.has(nid)) {
            throw new LakarError('CONFLICT', `insert: ID ${nid} sudah dipakai di dokumen`, {
              hint: 'node dengan ID ini sudah ada (mis. undo yang sudah diterapkan); muat ulang dokumen',
            });
          }
          seen.add(nid);
        }
        if (slot && dest.length === 0) dest = slotList(slot);
        dest.splice(index ?? dest.length, 0, node);
        for (const nid of fresh) ids.reserve(nid);
        createdIds.push(...fresh);
        undo({ op: 'remove', id: node.id });
        return node.id;
      });
    },

    setTokens(map) {
      op('setTokens', (w, undo) => {
        const tokens = { ...(w.tokens ?? {}) };
        const entries = parseTokenPatch(map, tokens, pendingFlat);
        const prev = { ...tokens };
        for (const e of entries) {
          if (e.kind === 'delete') {
            delete tokens[e.name];
            pendingFlat.delete(e.name);
          } else if (e.kind === 'def') {
            tokens[e.name] = e.def;
            pendingFlat.delete(e.name);
          } else if (Object.hasOwn(tokens, e.name) && !pendingFlat.has(e.name)) {
            tokens[e.name] = { ...tokens[e.name]!, value: e.value } as TokenDefT;
          } else {
            // Tipe sementara dari nilai; diganti hasil inferensi pemakaian saat commit.
            tokens[e.name] = { type: tokenTypeOfValue(e.value), value: e.value } as TokenDefT;
            pendingFlat.add(e.name);
          }
        }
        w.tokens = tokens;
        // Invers hanya untuk token yang benar-benar berubah (set ke nilai sama / hapus token tak ada → tanpa invers).
        const revert: Record<string, unknown> = {};
        for (const e of entries) {
          if (sameValue(prev[e.name], tokens[e.name])) continue;
          revert[e.name] = Object.hasOwn(prev, e.name) ? host.structuredClone(prev[e.name]) : null;
        }
        if (Object.keys(revert).length) undo({ op: 'setTokens', tokens: revert });
      });
    },

    setTokenModes(modes) {
      op('setTokenModes', (w, undo) => {
        const revert: DocOp = { op: 'setTokenModes', modes: w.tokenModes ? [...w.tokenModes] : null };
        if (modes === null) {
          if (w.tokenModes !== undefined) undo(revert);
          delete w.tokenModes;
          return;
        }
        const r = TokenModes.safeParse(modes);
        if (!r.success) throw new LakarError('SCHEMA_INVALID', zodToLakarError(r.error, 'setTokenModes').message, { hint: TOKEN_MODES_HINT });
        if (!sameValue(w.tokenModes, r.data)) undo(revert);
        w.tokenModes = r.data;
      });
    },

    renameToken(fromRaw, toRaw) {
      op('renameToken', (w, undo) => {
        const from = requireTokenName('from', fromRaw);
        const to = requireTokenName('to', toRaw);
        const tokens = w.tokens ?? {};
        if (!Object.hasOwn(tokens, from)) {
          const s = suggestTokens(from, Object.keys(tokens));
          throw new LakarError('TOKEN_UNKNOWN', `renameToken: token ${from} tidak ada${s.length ? ` (mungkin: ${s.join(', ')})` : ''}`, { hint: RENAME_HINT });
        }
        if (from === to) return;
        if (Object.hasOwn(tokens, to)) {
          throw new LakarError('CONFLICT', `renameToken: nama ${to} sudah dipakai token lain`, {
            hint: 'pilih nama baru yang belum ada, atau hapus token itu dulu dengan setTokens({nama: null})',
          });
        }
        // Posisi kunci dipertahankan (urutan panel Theme dan ekspor tetap).
        w.tokens = Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k === from ? to : k, v]));
        renameRefs(w.pages, from, to);
        if (pendingFlat.delete(from)) pendingFlat.add(to);
        undo({ op: 'renameToken', from: to, to: from });
      });
    },

    setComponent(id, raw) {
      op('setComponent', (w, undo) => {
        const loc = mustLocate(w, 'setComponent', requireId('setComponent', 'id', id));
        const node = loc.node;
        if (node.type === 'board' || node.type === 'instance') {
          throw new LakarError('SCHEMA_INVALID', `setComponent: ${node.type} ${node.id} tidak bisa menjadi master`, {
            hint: 'master = node anak biasa (frame, text, rect, ellipse, path, icon); instance di-detach dulu bila ingin dijadikan master',
          });
        }
        const old = node.component;
        if (raw === null) {
          if (old === undefined) return;
          // Lepas status master → instancenya di-detach dulu di op yang sama (AD-12).
          withRollback(() => {
            const steps = detachAll(live(), 'setComponent', new Set([node.id]));
            const at = mustLocate(live(), 'setComponent', node.id).node as ChildNode & { component?: unknown };
            delete at.component;
            undo({ op: 'setComponent', id: node.id, component: host.structuredClone(old) as unknown as Record<string, unknown> });
            undoSteps(steps, undo);
          });
          return;
        }
        // Master tidak boleh bersarang atau berada di isi slot (componentIssues); ditolak di op supaya snippet bisa menangkapnya.
        const outer = loc.ancestors.find((a) => a.type !== 'board' && a.type !== 'instance' && a.component !== undefined);
        const innerMaster = [...mastersIn(node)].find((m) => m !== node.id);
        const where = loc.slot || loc.ancestors.some((a) => a.type === 'instance') ? 'berada di isi slot instance' : outer ? `berada di dalam master ${outer.id}` : innerMaster ? `memuat master ${innerMaster}` : undefined;
        if (old === undefined && where) {
          throw new LakarError('SCHEMA_INVALID', `setComponent: ${node.type} ${node.id} ${where}; master tidak boleh bersarang`, {
            hint: 'pakai instance komponen lain di dalam master (add(parent, {type:"instance", …})), atau pindahkan node keluar dari master/slot dulu',
          });
        }
        const parsed = ComponentDef.safeParse(raw);
        if (!parsed.success) throw new LakarError('SCHEMA_INVALID', zodToLakarError(parsed.error, 'setComponent').message, { hint: COMPONENT_HINT });
        const def = parsed.data;
        const inside = new Map(subtree(node).map((n) => [n.id, n] as const));
        const problems: string[] = [];
        for (const p of def.props) for (const b of p.binds) if (!inside.has(b.nodeId)) problems.push(`prop ${p.name}: bind ${b.nodeId} bukan node di dalam master ${node.id}`);
        for (const s of def.slots) {
          const target = inside.get(s.nodeId);
          if (!target || s.nodeId === node.id || target.type !== 'frame') problems.push(`slot ${s.name}: ${s.nodeId} harus frame turunan master ${node.id}`);
        }
        if (problems.length) throw new LakarError('SCHEMA_INVALID', `setComponent: ${problems.join('; ')}`, { hint: COMPONENT_HINT });
        if (sameValue(old, def)) return;
        (node as ChildNode & { component?: unknown }).component = def;
        undo({ op: 'setComponent', id: node.id, component: old === undefined ? null : (host.structuredClone(old) as unknown as Record<string, unknown>) });
      });
    },

    resetOverride(address, props) {
      op('resetOverride', (w, undo) => {
        if (typeof address !== 'string' || !(ID_PATTERN.test(address) || isComposite(address))) {
          throw new LakarError('SCHEMA_INVALID', `resetOverride: alamat harus ID instance atau alamat komposit "<instanceId>/<idNodeMaster>", bukan ${JSON.stringify(address) ?? 'undefined'}`, { hint: RESET_HINT });
        }
        if (props !== undefined && (!Array.isArray(props) || props.length === 0 || props.some((p) => typeof p !== 'string' || !p))) {
          throw new LakarError('SCHEMA_INVALID', `resetOverride: props harus array nama properti tak kosong, bukan ${JSON.stringify(props) ?? 'undefined'}`, { hint: RESET_HINT });
        }
        const iid = address.split('/')[0]!;
        const loc = mustLocate(w, 'resetOverride', iid, 'instance');
        if (loc.node.type !== 'instance') {
          throw new LakarError('SCHEMA_INVALID', `resetOverride: node ${loc.node.type} ${iid} bukan instance`, { hint: RESET_HINT });
        }
        const inst = loc.node;
        const key = address === iid ? inst.componentId : address.slice(iid.length + 1);
        const old = inst.overrides;
        const entry = old?.[key];
        if (!old || !entry) return;
        const next = { ...entry };
        for (const p of (props as string[] | undefined) ?? Object.keys(entry)) delete next[p];
        if (Object.keys(next).length === Object.keys(entry).length) return;
        const overrides = { ...old };
        if (Object.keys(next).length) overrides[key] = next;
        else delete overrides[key];
        if (Object.keys(overrides).length) inst.overrides = overrides;
        else delete inst.overrides;
        // Peta lama utuh: selalu bisa diterapkan, juga untuk kunci yatim atau nilai yang sudah basi.
        undo({ op: 'update', id: iid, patch: { overrides: host.structuredClone(old) } });
      });
    },

    detach(id) {
      return op('detach', (_w, undo) => {
        const iid = requireId('detach', 'id', id);
        const r = withRollback(() => detachOne(live(), 'detach', iid));
        r.inv.forEach(undo);
        return r.id;
      });
    },

    setComments(raw) {
      op('setComments', (w, undo) => {
        const revert: DocOp = { op: 'setComments', comments: w.comments ? host.structuredClone(w.comments) : null };
        if (raw === null) {
          // Hanya invers bila memang ada field sebelumnya — idempotent terhadap doc tanpa komentar.
          if (w.comments !== undefined) undo(revert);
          delete w.comments;
          return;
        }
        if (!Array.isArray(raw)) {
          throw new LakarError('SCHEMA_INVALID', `setComments: comments harus array CommentThread atau null, bukan ${JSON.stringify(raw) ?? 'undefined'}`, {
            hint: 'setComments menerima array CommentThread utuh ({id, pageId, nodeId?, x, y, status, messages[]}) atau null',
          });
        }
        const next: CommentThread[] = [];
        raw.forEach((t, i) => {
          const r = CommentThread.safeParse(t);
          if (!r.success) throw new LakarError('SCHEMA_INVALID', `setComments comments[${i}]: ${zodToLakarError(r.error, 'CommentThread').message}`, {
            hint: 'setComments menerima array CommentThread utuh ({id, pageId, nodeId?, x, y, status, messages[]}) atau null',
          });
          next.push(r.data);
        });
        if (!sameValue(w.comments ?? null, next.length ? next : null)) undo(revert);
        if (next.length === 0) delete w.comments;
        else w.comments = next;
      });
    },

    insertPage(raw, index) {
      return op('insertPage', (w, undo) => {
        if (!isPlainObject(raw)) {
          throw new LakarError('SCHEMA_INVALID', `insertPage: page harus objek {id, name, children}, bukan ${Array.isArray(raw) ? 'array' : JSON.stringify(raw) ?? 'undefined'}`, {
            hint: 'insertPage menerima halaman tersimpan utuh (mis. dari op invers removePage)',
          });
        }
        const parsed = Page.safeParse(raw);
        if (!parsed.success) throw zodToLakarError(parsed.error, 'insertPage');
        const page = parsed.data;
        if (index !== undefined && (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > w.pages.length)) {
          throw new LakarError('SCHEMA_INVALID', `insertPage: index harus integer 0..${w.pages.length}, bukan ${JSON.stringify(index) ?? 'undefined'}`, {
            hint: 'index = posisi di daftar pages; hilangkan index untuk menaruh di akhir',
          });
        }
        // ID halaman + seluruh ID node di dalamnya harus unik (payload membawa ID sendiri).
        const fresh = [page.id, ...page.children.flatMap((b) => subtree(b).map((n) => n.id))];
        const taken = new Set(collectIds(w));
        const seen = new Set<string>();
        for (const nid of fresh) {
          if (taken.has(nid) || seen.has(nid)) {
            throw new LakarError('CONFLICT', `insertPage: ID ${nid} sudah dipakai di dokumen`, {
              hint: 'halaman dengan ID ini sudah ada (mis. undo yang sudah diterapkan); muat ulang dokumen',
            });
          }
          seen.add(nid);
        }
        w.pages.splice(index ?? w.pages.length, 0, page);
        for (const nid of fresh) ids.reserve(nid);
        undo({ op: 'removePage', id: page.id });
        return page.id;
      });
    },

    removePage(id) {
      op('removePage', (w, undo) => {
        const pid = requireId('removePage', 'id', id);
        const i = w.pages.findIndex((p) => p.id === pid);
        if (i < 0) {
          throw new LakarError('SCHEMA_INVALID', `removePage: halaman ${pid} tidak ada`, { hint: 'pakai id halaman dari list_pages' });
        }
        if (w.pages.length <= 1) {
          throw new LakarError('SCHEMA_INVALID', 'removePage: tidak bisa menghapus halaman terakhir dokumen', { hint: 'dokumen wajib punya minimal satu halaman' });
        }
        const page = w.pages.splice(i, 1)[0]!;
        // Thread komentar milik halaman ini ikut dihapus: `pageId` wajib di skema CommentThread,
        // jadi tidak boleh dibiarkan menggantung ke halaman yang sudah tidak ada. Invers memulihkan
        // daftar komentar utuh (setComments direplay sebelum insertPage — keduanya independen).
        if (w.comments?.some((t) => t.pageId === pid)) {
          undo({ op: 'setComments', comments: host.structuredClone(w.comments) });
          const kept = w.comments.filter((t) => t.pageId !== pid);
          if (kept.length) w.comments = kept;
          else delete w.comments;
        }
        // Invers menyimpan isi halaman + posisi (undo memulihkan utuh di tempat yang sama).
        undo({ op: 'insertPage', page: host.structuredClone(page), index: i });
      });
    },

    renamePage(id, name) {
      op('renamePage', (w, undo) => {
        const pid = requireId('renamePage', 'id', id);
        if (typeof name !== 'string' || name.trim() === '') {
          throw new LakarError('SCHEMA_INVALID', `renamePage: name harus string tidak kosong, bukan ${JSON.stringify(name) ?? 'undefined'}`, {
            hint: 'renamePage menerima {id, name}; id = ID halaman dari list_pages',
          });
        }
        const i = w.pages.findIndex((p) => p.id === pid);
        if (i < 0) {
          throw new LakarError('SCHEMA_INVALID', `renamePage: halaman ${pid} tidak ada`, { hint: 'pakai id halaman dari list_pages' });
        }
        const prev = w.pages[i]!.name;
        if (prev === name) return;
        undo({ op: 'renamePage', id: pid, name: prev });
        w.pages[i] = { ...w.pages[i]!, name };
      });
    },

    movePage(id, index) {
      op('movePage', (w, undo) => {
        const pid = requireId('movePage', 'id', id);
        const i = w.pages.findIndex((p) => p.id === pid);
        if (i < 0) {
          throw new LakarError('SCHEMA_INVALID', `movePage: halaman ${pid} tidak ada`, { hint: 'pakai id halaman dari list_pages' });
        }
        if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= w.pages.length) {
          throw new LakarError('SCHEMA_INVALID', `movePage: index harus integer 0..${w.pages.length - 1}, bukan ${JSON.stringify(index) ?? 'undefined'}`, {
            hint: 'index = posisi tujuan di daftar pages (0 = paling kiri)',
          });
        }
        if (i === index) return;
        undo({ op: 'movePage', id: pid, index: i });
        const page = w.pages.splice(i, 1)[0]!;
        w.pages.splice(index, 0, page);
      });
    },

    commit(description) {
      const w = live();
      work = undefined;
      if (ops.size === 0) return { doc, entry: null, created: [], inverse: [] };
      const inverse = inverses.reverse().flat();
      // AD-11: token baru dari nilai datar mendapat tipe dari pemakaiannya (ref slot lain di-detach), seperti migrasi.
      const fresh = [...pendingFlat].filter((n) => Object.hasOwn(w.tokens ?? {}, n));
      if (fresh.length) {
        const flat = Object.fromEntries(fresh.map((n) => [n, w.tokens![n]!.value]));
        const inferred = inferTokens(flat, w.pages);
        w.tokens = { ...w.tokens, ...(inferred.tokens as Record<string, TokenDefT>) };
        if (inferred.detached > 0) {
          // Ref yang di-detach inferensi bisa ada di node yang tidak disentuh op: pulihkan lebih dulu (AD-8).
          const pre = indexNodes(w);
          const post = indexNodes({ ...w, pages: inferred.pages as Doc['pages'] });
          const restore: DocOp[] = [];
          for (const [nid, hit] of post) {
            const old = pre.get(nid);
            const revert = old && revertPatch(old.node, hit.node);
            if (revert) restore.push({ op: 'update', id: nid, patch: revert });
          }
          inverse.unshift(...restore);
        }
        w.pages = inferred.pages as Doc['pages'];
      }
      // AD-16: ref token tak dikenal → TOKEN_UNKNOWN, token salah tipe → SCHEMA_INVALID, keduanya saat
      // commit. Transaksi sudah tertutup; dokumen asli tidak tersentuh (salinan kerja dibuang).
      resolveDocument(w);
      w.rev = doc.rev + 1;
      const opsSummary = [...ops].map(([kind, n]) => `${kind}×${n}`).join(', ');
      const entry: HistoryEntry = { rev: w.rev, sessionId: opts.sessionId, description, opsSummary, at: now().toISOString() };
      const index = indexNodes(w);
      const created: CreatedEntry[] = [];
      for (const cid of createdIds) {
        const hit = index.get(cid);
        if (hit) created.push({ id: cid, name: hit.node.name, path: hit.path });
      }
      return { doc: w, entry, created, inverse };
    },

    rollback() {
      work = undefined;
    },
  };
}

export type TransactOptions = TransactionOptions & { description: string };

/**
 * Jalankan `body` di dalam satu transaksi. Body melempar → rollback penuh lalu error dilempar ulang
 * (dokumen asli utuh, tanpa entri riwayat). Body selesai → commit; kegagalan commit (mis. TOKEN_UNKNOWN)
 * juga dilempar. Body tidak boleh commit/rollback sendiri.
 */
export async function transact<T>(doc: Doc, opts: TransactOptions, body: (tx: Transaction) => T | Promise<T>): Promise<{ value: T } & CommitResult> {
  const { description, ...txOpts } = opts;
  const tx = beginTransaction(doc, txOpts);
  let value: T;
  try {
    value = await body(tx);
  } catch (e) {
    if (tx.open) tx.rollback();
    throw e;
  }
  if (!tx.open) throw new Error('transact: body tidak boleh commit/rollback sendiri');
  return { value, ...tx.commit(description) };
}
