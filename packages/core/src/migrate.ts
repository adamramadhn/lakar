// Migrasi dokumen antarversi skema (AD-2). Murni: hanya memeriksa `schemaVersion` dan menjalankan
// rantai langkah n→n+1; validasi penuh tetap oleh `LakarDocument`. Write-back hasil migrasi ada di daemon.
import { LakarDocument, LakarError, SCHEMA_VERSION, zodToLakarError, type LakarDocument as Doc } from '@lakar/schema';
import { host } from './host.js';
import { isPlainObject } from './object.js';
import { inferTokens } from './tokens-infer.js';

export type RawDocument = Record<string, unknown>;
/** Satu langkah: dokumen versi n → dokumen versi n+1. Boleh memutasi argumennya (sudah salinan). */
export type Migration = (doc: RawDocument) => RawDocument;
/** Kunci n = langkah n→n+1. */
export type MigrationRegistry = Readonly<Record<number, Migration>>;

/**
 * Registri migrasi resmi.
 * - 1 → 2 (story 22): v2 hanya menambah jenis fill (`conic`, `noise`, `mesh`); dokumen v1 valid apa adanya, jadi langkahnya
 *   identitas yang hanya menaikkan `schemaVersion`. Pembaca v1 tidak bisa membuka v2 (fill baru), maka versinya naik.
 * - 2 → 3 (epic model-dokumen story 2, AD-11): token datar menjadi `{type, value}` lewat `inferTokens` (tipe dari
 *   slot yang paling sering merujuk; ref dari slot lain di-detach ke nilai literal, jadi tampilan tetap). Tanpa
 *   `tokenModes`/`modes`. Dokumen tanpa `tokens` hanya naik versi. Murni: input tidak dimutasi.
 * - 3 → 4 (epic editor-canvas story 7, AD-13): v4 hanya menambah `layout:'grid'`, track grid, `columnGap`/`rowGap`,
 *   dan `gridColumn`/`gridRow`; dokumen v3 valid apa adanya, jadi langkahnya identitas yang menaikkan versi.
 * - 4 → 5 (epic komponen story 2, AD-12): v5 hanya menambah master `component` dan tipe node `instance`; dokumen v4
 *   valid apa adanya, jadi langkahnya identitas yang menaikkan versi.
 * - 5 → 6 (epic paste-vektor story 2, AD-14): v6 hanya menambah atribut vektor bertipe dan `svg` pada node `path`;
 *   dokumen v5 valid apa adanya, jadi langkahnya identitas yang menaikkan versi.
 * - 6 → 7 (epic paste-vektor story 4, AD-1): v7 hanya menambah `tag` semantik opsional pada frame dan text;
 *   dokumen v6 valid apa adanya, jadi langkahnya identitas yang menaikkan versi.
 * - 7 → 8 (spec-board-hug-height): v8 hanya membolehkan `height:'hug'` pada board; board v7 selalu bertinggi angka
 *   dan tetap angka (tidak diubah menjadi hug), jadi langkahnya identitas yang menaikkan versi.
 * - 8 → 9 (story flex-wrap, epic adopsi-open-pencil): v9 hanya menambah `wrap?:boolean` pada frame; dokumen v8
 *   valid apa adanya, jadi langkahnya identitas yang menaikkan versi.
 * - 9 → 10 (epic kolaborasi-agen story 9.3): v10 hanya menambah `comments` opsional di root dokumen; dokumen v9
 *   valid apa adanya, jadi langkahnya identitas yang menaikkan versi.
 * - 10 → 11 (spec-section-groups): v11 hanya menambah `section` opsional pada board; dokumen v10 valid apa adanya,
 *   jadi langkahnya identitas yang menaikkan versi.
 * - 11 → 12 (spec-comment-to-fix): v12 hanya menambah `fixRequest` opsional pada thread komentar; dokumen v11
 *   valid apa adanya, jadi langkahnya identitas yang menaikkan versi.
 * - 12 → 13 (spec-prototype-mode): v13 hanya menambah `interactions` opsional pada node anak/board dan `flows`
 *   opsional di root dokumen; dokumen v12 valid apa adanya, jadi langkahnya identitas yang menaikkan versi.
 * - 13 → 14 (spec-resize-constraints): v14 hanya menambah `constraints` opsional pada node anak `position:'absolute'`;
 *   dokumen v13 valid apa adanya, jadi langkahnya identitas yang menaikkan versi.
 * - 14 → 15 (spec-rich-text): v15 hanya menambah `decoration`/`runs` opsional pada node teks; dokumen v14 valid
 *   apa adanya, jadi langkahnya identitas yang menaikkan versi.
 * - 15 → 16 (spec-variant-set): v16 hanya menambah `variantOf` opsional pada master dan `variant` opsional pada
 *   instance; dokumen v15 valid apa adanya, jadi langkahnya identitas yang menaikkan versi.
 */
export const MIGRATIONS: MigrationRegistry = Object.freeze({
  1: (d: RawDocument): RawDocument => ({ ...d, schemaVersion: 2 }),
  2: (d: RawDocument): RawDocument => {
    if (!isPlainObject(d.tokens)) return { ...d, schemaVersion: 3 };
    const { tokens, pages } = inferTokens(d.tokens, d.pages);
    return { ...d, schemaVersion: 3, tokens, pages };
  },
  3: (d: RawDocument): RawDocument => ({ ...d, schemaVersion: 4 }),
  4: (d: RawDocument): RawDocument => ({ ...d, schemaVersion: 5 }),
  5: (d: RawDocument): RawDocument => ({ ...d, schemaVersion: 6 }),
  6: (d: RawDocument): RawDocument => ({ ...d, schemaVersion: 7 }),
  7: (d: RawDocument): RawDocument => ({ ...d, schemaVersion: 8 }),
  8: (d: RawDocument): RawDocument => ({ ...d, schemaVersion: 9 }),
  9: (d: RawDocument): RawDocument => ({ ...d, schemaVersion: 10 }),
  // 10 → 11 (spec-section-groups): v11 hanya menambah `section?` pada board; dokumen v10 valid apa adanya.
  10: (d: RawDocument): RawDocument => ({ ...d, schemaVersion: 11 }),
  // 11 → 12 (spec-comment-to-fix): v12 hanya menambah `fixRequest?` pada thread komentar; dokumen v11 valid apa adanya.
  11: (d: RawDocument): RawDocument => ({ ...d, schemaVersion: 12 }),
  // 12 → 13 (spec-prototype-mode): v13 hanya menambah `interactions?`/`flows?`; dokumen v12 valid apa adanya.
  12: (d: RawDocument): RawDocument => ({ ...d, schemaVersion: 13 }),
  // 13 → 14 (spec-resize-constraints): v14 hanya menambah `constraints?` pada anak absolute; dokumen v13 valid apa adanya.
  13: (d: RawDocument): RawDocument => ({ ...d, schemaVersion: 14 }),
  // 14 → 15 (spec-rich-text): v15 hanya menambah `decoration?`/`runs?` pada teks; dokumen v14 valid apa adanya.
  14: (d: RawDocument): RawDocument => ({ ...d, schemaVersion: 15 }),
  // 15 → 16 (spec-variant-set): v16 hanya menambah `variantOf?`/`variant?`; dokumen v15 valid apa adanya.
  15: (d: RawDocument): RawDocument => ({ ...d, schemaVersion: 16 }),
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
