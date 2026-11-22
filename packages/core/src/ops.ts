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
    const name = v.slice(1);
    if (!Object.hasOwn(refs, name)) {
      throw new LakarError('SCHEMA_INVALID', `ref ${v} tidak dikenal`, { hint: 'ref dipakai sesudah op add/duplicate dengan ref yang sama di daftar ops ini' });
    }
    return refs[name];
  };
  ops.forEach((raw, i) => {
    try {
      const o = checkShape(raw);
      if ((o.op === 'add' || o.op === 'duplicate') && o.ref !== undefined && Object.hasOwn(refs, o.ref)) {
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
      }
      if ((o.op === 'add' || o.op === 'duplicate') && o.ref !== undefined && id !== undefined) refs[o.ref] = id;
    } catch (e) {
      throw atOp(i, e);
    }
  });
  return { refs };
}
