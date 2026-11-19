// Migrasi dokumen antarversi skema (AD-2). Murni: hanya memeriksa `schemaVersion` dan menjalankan
// rantai langkah n→n+1; validasi penuh tetap oleh `LakarDocument`. Write-back hasil migrasi ada di daemon.
import { LakarDocument, LakarError, SCHEMA_VERSION, zodToLakarError, type LakarDocument as Doc } from '@lakar/schema';
import { host } from './host.js';
import { isPlainObject } from './object.js';

export type RawDocument = Record<string, unknown>;
/** Satu langkah: dokumen versi n → dokumen versi n+1. Boleh memutasi argumennya (sudah salinan). */
export type Migration = (doc: RawDocument) => RawDocument;
/** Kunci n = langkah n→n+1. */
export type MigrationRegistry = Readonly<Record<number, Migration>>;

/**
 * Registri migrasi resmi.
 * - 1 → 2 (story 22): v2 hanya menambah jenis fill (`conic`, `noise`, `mesh`); dokumen v1 valid apa adanya, jadi langkahnya
 *   identitas yang hanya menaikkan `schemaVersion`. Pembaca v1 tidak bisa membuka v2 (fill baru), maka versinya naik.
 */
export const MIGRATIONS: MigrationRegistry = Object.freeze({
  1: (d: RawDocument): RawDocument => ({ ...d, schemaVersion: 2 }),
});

export type MigrateOptions = { migrations?: MigrationRegistry; target?: number };

/**
 * Bawa dokumen mentah ke versi `target` (default `SCHEMA_VERSION`). Input tidak dimutasi.
 * Versi sama → dikembalikan apa adanya. Lebih baru / langkah hilang → VERSION_MISMATCH.
 * Bukan objek / versi bukan integer ≥ 1 → SCHEMA_INVALID.
 */
export function migrateDocument(raw: unknown, opts: MigrateOptions = {}): unknown {
  const migrations = opts.migrations ?? MIGRATIONS;
  const target = opts.target ?? SCHEMA_VERSION;
  if (!isPlainObject(raw)) {
    throw new LakarError('SCHEMA_INVALID', 'dokumen tidak valid: harus objek JSON', { hint: 'file dokumen harus berisi objek {schemaVersion, id, rev, pages}' });
  }
  const version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new LakarError('SCHEMA_INVALID', `dokumen tidak valid: schemaVersion harus integer ≥ 1, bukan ${JSON.stringify(version) ?? 'undefined'}`, {
      hint: 'dokumen Lakar wajib membawa schemaVersion (versi saat ini: ' + SCHEMA_VERSION + ')',
    });
  }
  if (version > target) {
    throw new LakarError('VERSION_MISMATCH', `dokumen schemaVersion ${version} lebih baru dari yang didukung (${target})`, {
      hint: 'perbarui Lakar (daemon dan paket) ke versi yang mendukung dokumen ini; jangan sunting file secara manual',
    });
  }
  if (version === target) return raw;
  for (let n = version; n < target; n++) {
    if (!Object.hasOwn(migrations, n)) {
      throw new LakarError('VERSION_MISMATCH', `tidak ada migrasi schemaVersion ${n} → ${n + 1}`, {
        hint: 'versi Lakar ini tidak bisa membuka dokumen lama tersebut; pakai versi Lakar yang menyertakan migrasinya',
      });
    }
  }
  let cur: RawDocument = host.structuredClone(raw);
  for (let n = version; n < target; n++) {
    const out = migrations[n]!(cur);
    // Bug di langkah migrasi (bukan input agen): Error biasa, bukan LakarError.
    if (!isPlainObject(out) || out.schemaVersion !== n + 1) {
      throw new Error(`migrasi ${n} → ${n + 1} menghasilkan schemaVersion ${JSON.stringify(isPlainObject(out) ? out.schemaVersion : out)}`);
    }
    cur = out;
  }
  return cur;
}

/** Dokumen dari luar (file): migrasi ke versi kini lalu validasi. Rusak → SCHEMA_INVALID. */
export function parseDocument(value: unknown, opts: Pick<MigrateOptions, 'migrations'> = {}): Doc {
  const migrated = migrateDocument(value, { migrations: opts.migrations });
  const r = LakarDocument.safeParse(migrated);
  if (!r.success) throw zodToLakarError(r.error, 'dokumen tidak valid');
  return r.data;
}
