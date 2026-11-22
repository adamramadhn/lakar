// Transaksi operasi (AD-4): add | update | replace | move | duplicate | remove | setTokens | setTokenModes di atas
// salinan copy-on-write. Setiap op atomik sendiri: semua validasi selesai sebelum salinan kerja diubah,
// sehingga op gagal yang ditangkap snippet tidak meninggalkan jejak. Tanpa IO.
import {
  ID_PATTERN,
  LakarError,
  NodeInput,
  TokenDef,
  TokenModes,
  TokenName,
  TokenValue,
  XY_HINT,
  isTokenValueOf,
  resolveTokens,
  zodToLakarError,
  type AnyNode,
  type BoardNode,
  type ChildNode,
  type CreatedEntry,
  type HistoryEntry,
  type LakarDocument as Doc,
  type TokenDef as TokenDefT,
} from '@lakar/schema';
import { host } from './host.js';
import { isPlainObject } from './object.js';
import { IdAllocator, type RandomSource } from './ids.js';
import { inferTokens, tokenTypeOfValue } from './tokens-infer.js';
import { indexNodes, isContainer, locate, subtree, type Container, type Location } from './tree.js';

export type OpKind = 'add' | 'update' | 'replace' | 'move' | 'duplicate' | 'remove' | 'setTokens' | 'setTokenModes';

/**
 * Hasil commit. `entry === null` berarti tidak ada op yang sukses: tidak ada revisi baru, `doc` adalah
 * dokumen asli (rev tetap), dan pemanggil tidak menulis file maupun riwayat.
 */
export type CommitResult = { doc: Doc; entry: HistoryEntry | null; created: CreatedEntry[] };

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
   * Merge peta token ke `doc.tokens` (AD-11). Nilai: `null` menghapus; string/angka datar mengganti `value` token
   * yang ada (`type`/`modes` tetap) atau membuat token baru yang tipenya diinferensi saat commit; objek
   * `{type, value, modes?}` menggantikan token sepenuhnya.
   */
  setTokens(map: unknown): void;
  /** Ganti daftar mode tema dokumen (elemen pertama = default); `null` menghapus `tokenModes`. Konsistensi dicek saat commit. */
  setTokenModes(modes: unknown): void;
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

function requireId(op: OpKind, what: string, v: unknown): string {
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

const TOKENS_HINT =
  'setTokens({"colors.text-primary": "#1A1A1A", "spacing.2": 8}) atau bertipe {"colors.bg": {type:"color", value:"#FFFFFF", modes:{dark:"#000000"}}}; nama: segmen [a-z0-9-] dipisah titik; nilai datar: angka atau string tak kosong; null menghapus token';
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
  /** Token baru dari nilai datar di transaksi ini: tipenya diinferensi saat commit (AD-11, seperti migrasi). */
  const pendingFlat = new Set<string>();
  const now = opts.now ?? (() => new Date());

  const live = (): Doc => {
    if (!work) throw new Error('transaksi sudah ditutup (commit/rollback)');
    return work;
  };
  /** Jalankan op: hitung hanya bila sukses (op yang melempar tidak meninggalkan jejak). */
  const op = <T>(kind: OpKind, fn: (w: Doc) => T): T => {
    const result = fn(live());
    ops.set(kind, (ops.get(kind) ?? 0) + 1);
    return result;
  };

  return {
    get open() {
      return work !== undefined;
    },

    view() {
      return live();
    },

    add(parentId, raw) {
      return op('add', (w) => {
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
        return id;
      });
    },

    update(id, patch) {
      op('update', (w) => {
        const loc = mustLocate(w, 'update', requireId('update', 'id', id));
        const input = mergePatch('update', loc.node, implicitAbsolute(loc.parent, patch));
        loc.siblings[loc.index] = buildNode(input, loc.node.id, 'children' in loc.node ? loc.node.children : undefined);
      });
    },

    replace(id, raw) {
      op('replace', (w) => {
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
        loc.siblings[loc.index] = buildNode(input, old.id, children);
      });
    },

    move(id, parentId, index) {
      op('move', (w) => {
        const loc = mustLocate(w, 'move', requireId('move', 'id', id));
        const node = loc.node;
        let dest: AnyNode[];
        if (parentId === null) {
          if (node.type !== 'board') {
            throw new LakarError('SCHEMA_INVALID', `move(id, null): hanya board yang bisa menjadi anak halaman, bukan ${node.type}`, {
              hint: 'pindahkan node anak ke board atau frame: move(id, boardId|frameId, index?)',
            });
          }
          dest = loc.page.children;
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
        loc.siblings.splice(loc.index, 1);
        dest.splice(index ?? dest.length, 0, node);
      });
    },

    duplicate(id, patch) {
      return op('duplicate', (w) => {
        const loc = mustLocate(w, 'duplicate', requireId('duplicate', 'id', id));
        const rootInput = patch === undefined ? undefined : mergePatch('duplicate', loc.node, implicitAbsolute(loc.parent, patch));
        const copy = host.structuredClone(loc.node);
        const fresh: string[] = [];
        for (const n of subtree(copy)) {
          n.id = ids.next();
          fresh.push(n.id);
        }
        const root = rootInput ? buildNode(rootInput, copy.id, 'children' in copy ? copy.children : undefined) : copy;
        loc.siblings.splice(loc.index + 1, 0, root);
        createdIds.push(...fresh);
        return root.id;
      });
    },

    remove(id) {
      op('remove', (w) => {
        const loc = mustLocate(w, 'remove', requireId('remove', 'id', id));
        loc.siblings.splice(loc.index, 1);
      });
    },

    setTokens(map) {
      op('setTokens', (w) => {
        const tokens = { ...(w.tokens ?? {}) };
        const entries = parseTokenPatch(map, tokens, pendingFlat);
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
      });
    },

    setTokenModes(modes) {
      op('setTokenModes', (w) => {
        if (modes === null) {
          delete w.tokenModes;
          return;
        }
        const r = TokenModes.safeParse(modes);
        if (!r.success) throw new LakarError('SCHEMA_INVALID', zodToLakarError(r.error, 'setTokenModes').message, { hint: TOKEN_MODES_HINT });
        w.tokenModes = r.data;
      });
    },

    commit(description) {
      const w = live();
      work = undefined;
      if (ops.size === 0) return { doc, entry: null, created: [] };
      // AD-11: token baru dari nilai datar mendapat tipe dari pemakaiannya (ref slot lain di-detach), seperti migrasi.
      const fresh = [...pendingFlat].filter((n) => Object.hasOwn(w.tokens ?? {}, n));
      if (fresh.length) {
        const flat = Object.fromEntries(fresh.map((n) => [n, w.tokens![n]!.value]));
        const inferred = inferTokens(flat, w.pages);
        w.tokens = { ...w.tokens, ...(inferred.tokens as Record<string, TokenDefT>) };
        w.pages = inferred.pages as Doc['pages'];
      }
      // AD-16: ref token tak dikenal → TOKEN_UNKNOWN, token salah tipe → SCHEMA_INVALID, keduanya saat
      // commit. Transaksi sudah tertutup; dokumen asli tidak tersentuh (salinan kerja dibuang).
      resolveTokens(w);
      w.rev = doc.rev + 1;
      const opsSummary = [...ops].map(([kind, n]) => `${kind}×${n}`).join(', ');
      const entry: HistoryEntry = { rev: w.rev, sessionId: opts.sessionId, description, opsSummary, at: now().toISOString() };
      const index = indexNodes(w);
      const created: CreatedEntry[] = [];
      for (const cid of createdIds) {
        const hit = index.get(cid);
        if (hit) created.push({ id: cid, name: hit.node.name, path: hit.path });
      }
      return { doc: w, entry, created };
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
