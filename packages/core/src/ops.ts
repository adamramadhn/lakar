// Op JSON route ops viewer (AD-7): validasi bentuk tiap op lalu jalankan lewat `Transaction` yang sama dengan
// API `execute`, sehingga isi node/patch/token divalidasi dengan pesan dan kode yang sama. Op dialamati dengan
// ID; node yang dibuat op sebelumnya di daftar yang sama dialamati dengan `"@<ref>"`. Tanpa IO.
import { LakarError, OPS_MAX, OP_REF_PATTERN, type DocOp, type DocOpKind } from '@lakar/schema';
import { isPlainObject } from './object.js';
import type { Transaction } from './transaction.js';

const OP_KEYS: Record<DocOpKind, { required: readonly string[]; optional: readonly string[] }> = {
  add: { required: ['parentId', 'node'], optional: ['ref'] },
  update: { required: ['id', 'patch'], optional: [] },
  replace: { required: ['id', 'node'], optional: [] },
  move: { required: ['id', 'parentId'], optional: ['index'] },
  duplicate: { required: ['id'], optional: ['patch', 'ref'] },
  remove: { required: ['id'], optional: [] },
  insert: { required: ['parentId', 'node'], optional: ['index'] },
  setTokens: { required: ['tokens'], optional: [] },
  setTokenModes: { required: ['modes'], optional: [] },
  renameToken: { required: ['from', 'to'], optional: [] },
  setComponent: { required: ['id', 'component'], optional: [] },
  resetOverride: { required: ['id'], optional: ['props'] },
  detach: { required: ['id'], optional: ['ref'] },
  // Op level-dokumen (bukan node): dipakai klien sync untuk mutasi komentar/halaman.
  setComments: { required: ['comments'], optional: [] },
  insertPage: { required: ['page'], optional: ['index'] },
  removePage: { required: ['id'], optional: [] },
};

const OPS_HINT =
  'kirim {ops:[{op:"update", id, patch}, {op:"add", parentId, node, ref?}, {op:"move", id, parentId, index?}, …]}; op: ' +
  Object.keys(OP_KEYS).join(' | ') +
  '; node baru di permintaan yang sama dialamati "@<ref>"';

const show = (v: unknown): string => (Array.isArray(v) ? 'array' : (JSON.stringify(v) ?? 'undefined'));

/** Bungkus error op ke-`i` dengan prefiks `ops[i] ` (kode, hint, retryable tetap). */
function atOp(i: number, e: unknown): unknown {
  if (!(e instanceof LakarError)) return e;
  return new LakarError(e.code, `ops[${i}] ${e.message}`, { hint: e.hint, retryable: e.retryable });
}

/** Bentuk op tervalidasi (kunci ketat); isi node/patch divalidasi `Transaction`. */
function checkShape(raw: unknown): DocOp {
  if (!isPlainObject(raw)) throw new LakarError('SCHEMA_INVALID', `op harus objek {op, …}, bukan ${show(raw)}`, { hint: OPS_HINT });
  const kind = raw.op;
  if (typeof kind !== 'string' || !Object.hasOwn(OP_KEYS, kind)) {
    throw new LakarError('SCHEMA_INVALID', `op tidak dikenal: ${show(kind)}`, { hint: OPS_HINT });
  }
  const spec = OP_KEYS[kind as DocOpKind];
  const extra = Object.keys(raw).filter((k) => k !== 'op' && !spec.required.includes(k) && !spec.optional.includes(k));
  if (extra.length) throw new LakarError('SCHEMA_INVALID', `${kind}: kunci tidak dikenal ${extra.join(', ')}`, { hint: OPS_HINT });
  const missing = spec.required.filter((k) => !Object.hasOwn(raw, k));
  if (missing.length) throw new LakarError('SCHEMA_INVALID', `${kind}: kunci wajib ${missing.join(', ')} tidak ada`, { hint: OPS_HINT });
  if (raw.ref !== undefined && (typeof raw.ref !== 'string' || !OP_REF_PATTERN.test(raw.ref))) {
    throw new LakarError('SCHEMA_INVALID', `${kind}: ref harus cocok ${OP_REF_PATTERN.source}, bukan ${show(raw.ref)}`, { hint: OPS_HINT });
  }
  return raw as DocOp;
}

export type ApplyOpsResult = {
  /** Ref lokal → ID node yang dibuat (cara klien mengetahui ID baru per op). */
  refs: Record<string, string>;
};

/**
 * Jalankan `ops` berurutan pada `tx`. Error op pertama yang gagal dilempar dengan prefiks `ops[i] `; pemanggil
 * (biasanya `transact`) me-rollback seluruh transaksi. Tidak commit.
 */
export function applyOps(tx: Transaction, ops: unknown): ApplyOpsResult {
  if (!Array.isArray(ops)) throw new LakarError('SCHEMA_INVALID', `ops harus array, bukan ${show(ops)}`, { hint: OPS_HINT });
  if (ops.length === 0) throw new LakarError('SCHEMA_INVALID', 'ops kosong', { hint: OPS_HINT });
  if (ops.length > OPS_MAX) throw new LakarError('SCHEMA_INVALID', `ops maks ${OPS_MAX} per permintaan, dikirim ${ops.length}`, { hint: 'pecah menjadi beberapa permintaan' });
  // Tanpa prototipe: ref seperti "__proto__" atau "constructor" tetap kunci biasa.
  const refs: Record<string, string> = Object.create(null) as Record<string, string>;
  /** `"@ref"` → ID; selain itu nilai apa adanya (divalidasi op core). */
  const addr = (v: unknown): unknown => {
    if (typeof v !== 'string' || !v.startsWith('@')) return v;
    // `"@ref/…"` = alamat komposit di dalam instance yang dibuat op sebelumnya (mis. "@kartu/Tttttt01").
    const slash = v.indexOf('/');
    const name = slash < 0 ? v.slice(1) : v.slice(1, slash);
    if (!Object.hasOwn(refs, name)) {
      throw new LakarError('SCHEMA_INVALID', `ref ${v} tidak dikenal`, { hint: 'ref dipakai sesudah op add/duplicate/detach dengan ref yang sama di daftar ops ini' });
    }
    return slash < 0 ? refs[name] : `${refs[name]}${v.slice(slash)}`;
  };
  ops.forEach((raw, i) => {
    try {
      const o = checkShape(raw);
      if ((o.op === 'add' || o.op === 'duplicate' || o.op === 'detach') && o.ref !== undefined && Object.hasOwn(refs, o.ref)) {
        throw new LakarError('SCHEMA_INVALID', `${o.op}: ref ${JSON.stringify(o.ref)} sudah dipakai`, { hint: 'pakai ref unik per permintaan' });
      }
      let id: string | undefined;
      switch (o.op) {
        case 'add':
          id = tx.add(addr(o.parentId) as string | null, o.node);
          break;
        case 'update':
          tx.update(addr(o.id) as string, o.patch);
          break;
        case 'replace':
          tx.replace(addr(o.id) as string, o.node);
          break;
        case 'move':
          tx.move(addr(o.id) as string, addr(o.parentId) as string | null, o.index);
          break;
        case 'duplicate':
          id = tx.duplicate(addr(o.id) as string, o.patch);
          break;
        case 'remove':
          tx.remove(addr(o.id) as string);
          break;
        case 'insert':
          id = tx.insert(addr(o.parentId) as string | null, o.node, o.index);
          break;
        case 'setTokens':
          tx.setTokens(o.tokens);
          break;
        case 'setTokenModes':
          tx.setTokenModes(o.modes);
          break;
        case 'renameToken':
          tx.renameToken(o.from, o.to);
          break;
        case 'setComponent':
          tx.setComponent(addr(o.id) as string, o.component);
          break;
        case 'resetOverride':
          tx.resetOverride(addr(o.id) as string, o.props);
          break;
        case 'detach':
          id = tx.detach(addr(o.id) as string) ?? undefined;
          break;
        case 'setComments':
          tx.setComments(o.comments);
          break;
        case 'insertPage':
          tx.insertPage(o.page, o.index);
          break;
        case 'removePage':
          tx.removePage(addr(o.id) as string);
          break;
      }
      if ((o.op === 'add' || o.op === 'duplicate' || o.op === 'detach') && o.ref !== undefined && id !== undefined) refs[o.ref] = id;
    } catch (e) {
      throw atOp(i, e);
    }
  });
  return { refs };
}

/**
 * Bungkus `tx` dengan fasad `Transaction` yang mencatat setiap pemanggilan sebagai `DocOp` setara
 * (untuk klien sync: snippet `execute` dijalankan pada replika lokal, ops-nya dikirim ke server dan
 * diterapkan ulang di sana dengan seed deterministik). ID yang di-mint di transaksi ini dikembalikan
 * pemanggilnya lalu dicatat sebagai `ref` + ditulis `"@<ref>"` pada field `id`/`parentId` op berikutnya —
 * persis mekanisme `addr` di `applyOps`.
 *
 * Batasan terdokumentasi (sama dengan route ops): referensi ke ID minted di dalam payload `node`/`patch`/
 * `component` (mis. `componentId`, `binds[].nodeId`) dan ID node dalam yang di-mint `duplicate`/`detach`/
 * ekspansi tidak bisa dialamatkan `"@<ref>"` — op seperti itu gagal `SCHEMA_INVALID` saat replay.
 */
export function recordOps(tx: Transaction): { tx: Transaction; ops: DocOp[] } {
  const ops: DocOp[] = [];
  /** ID minted (nilai kembali add/duplicate/detach) → nama ref lokal. */
  const minted = new Map<string, string>();
  let n = 0;
  /** Alamat `v` yang berawal ID minted → `"@<ref>"` (segmen komposit `/…` dipertahankan). */
  const remap = <T>(v: T): T => {
    if (typeof v !== 'string') return v;
    const slash = v.indexOf('/');
    const head = slash < 0 ? v : v.slice(0, slash);
    const ref = minted.get(head);
    return (ref === undefined ? v : `@${ref}${slash < 0 ? '' : v.slice(slash)}`) as T;
  };
  /** Daftarkan ID hasil op mint; `undefined`/`null` (mis. detach menghapus akar) → tanpa ref. */
  const ref = (id: string | null | undefined): string | undefined => {
    if (id === null || id === undefined) return undefined;
    const r = `r${++n}`;
    minted.set(id, r);
    return r;
  };
  const opt = <K extends string, V>(key: K, v: V | undefined): Record<K, V> => (v === undefined ? {} : { [key]: v }) as Record<K, V>;
  const rec: Transaction = {
    add(parentId, node) {
      const id = tx.add(parentId, node);
      ops.push({ op: 'add', parentId: remap(parentId), node: node as Record<string, unknown>, ...opt('ref', ref(id)) });
      return id;
    },
    update(id, patch) {
      tx.update(id, patch);
      ops.push({ op: 'update', id: remap(id), patch: patch as Record<string, unknown> });
    },
    replace(id, node) {
      tx.replace(id, node);
      ops.push({ op: 'replace', id: remap(id), node: node as Record<string, unknown> });
    },
    move(id, parentId, index) {
      tx.move(id, parentId, index);
      ops.push({ op: 'move', id: remap(id), parentId: remap(parentId), ...opt('index', index) });
    },
    duplicate(id, patch) {
      const nid = tx.duplicate(id, patch);
      ops.push({ op: 'duplicate', id: remap(id), ...opt('patch', patch as Record<string, unknown> | undefined), ...opt('ref', ref(nid)) });
      return nid;
    },
    remove(id) {
      tx.remove(id);
      ops.push({ op: 'remove', id: remap(id) });
    },
    insert(parentId, node, index) {
      const id = tx.insert(parentId, node, index);
      ops.push({ op: 'insert', parentId: remap(parentId), node: node as Record<string, unknown>, ...opt('index', index) });
      return id;
    },
    setTokens(map) {
      tx.setTokens(map);
      ops.push({ op: 'setTokens', tokens: map as Record<string, unknown> });
    },
    setTokenModes(modes) {
      tx.setTokenModes(modes);
      ops.push({ op: 'setTokenModes', modes: modes as string[] | null });
    },
    renameToken(from, to) {
      tx.renameToken(from, to);
      ops.push({ op: 'renameToken', from: String(from), to: String(to) });
    },
    setComponent(id, component) {
      tx.setComponent(id, component);
      ops.push({ op: 'setComponent', id: remap(id), component: component as Record<string, unknown> | null });
    },
    resetOverride(address, props) {
      tx.resetOverride(address, props);
      ops.push({ op: 'resetOverride', id: remap(address), ...opt('props', props as string[] | undefined) });
    },
    detach(id) {
      const nid = tx.detach(id);
      ops.push({ op: 'detach', id: remap(id), ...opt('ref', ref(nid)) });
      return nid;
    },
    setComments(comments) {
      tx.setComments(comments);
      ops.push({ op: 'setComments', comments: comments as Record<string, unknown>[] | null });
    },
    insertPage(page, index) {
      const id = tx.insertPage(page, index);
      ops.push({ op: 'insertPage', page: page as Record<string, unknown>, ...opt('index', index) });
      return id;
    },
    removePage(id) {
      tx.removePage(id);
      ops.push({ op: 'removePage', id });
    },
    view: () => tx.view(),
    commit: (description) => tx.commit(description),
    rollback: () => tx.rollback(),
    get open() {
      return tx.open;
    },
  };
  return { tx: rec, ops };
}
