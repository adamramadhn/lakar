// Bentuk op JSON route ops viewer (AD-7) dan op invers (AD-8). Hanya tipe + batas; validasi isi node/patch/token
// dilakukan `Transaction` di @lakar/core, sama dengan API `execute`. Tanpa IO.

/** Batas jumlah op per permintaan `POST /viewer/docs/:slug/ops`. */
export const OPS_MAX = 1000;

/** Pola nama ref lokal (`ref` pada add/duplicate, dipakai op berikutnya sebagai `"@<ref>"`). */
export const OP_REF_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

type Props = Record<string, unknown>;

/**
 * Satu op dokumen. `id`/`parentId` = ID 8 karakter, atau `"@<ref>"` untuk node yang dibuat op sebelumnya di
 * permintaan yang sama. `parentId: null` = halaman pertama (add/insert) atau halaman board itu sendiri (move).
 * `insert` menyisipkan node tersimpan utuh (dengan `id` dan `children`) beserta ID aslinya; dipakai invers `remove`.
 * Komponen (AD-12): `id` pada `update`/`resetOverride` boleh alamat komposit `<instanceId>/<idNodeMaster>…` (menjadi
 * override instance terluar); `parentId` `<instanceId>/<idFrameSlot>` pada `add`/`move`/`insert` = isi slot instance.
 * `"@<ref>/…"` = alamat komposit di dalam node yang dibuat op sebelumnya.
 */
export type DocOp =
  | { op: 'add'; parentId: string | null; node: Props; ref?: string }
  | { op: 'update'; id: string; patch: Props }
  | { op: 'replace'; id: string; node: Props }
  | { op: 'move'; id: string; parentId: string | null; index?: number }
  | { op: 'duplicate'; id: string; patch?: Props; ref?: string }
  | { op: 'remove'; id: string }
  | { op: 'insert'; parentId: string | null; node: Props; index?: number }
  | { op: 'setTokens'; tokens: Record<string, unknown> }
  | { op: 'setTokenModes'; modes: string[] | null }
  /** Ganti seluruh daftar flow prototipe (v13); `null` menghapus kunci `flows`. */
  | { op: 'setFlows'; flows: Props[] | null }
  /** Ganti nama token beserta semua ref `{$token}` (epic token-tema story 2); inversnya rename balik. */
  | { op: 'renameToken'; from: string; to: string }
  /** Jadikan node master (`component` = `{props, slots}`) atau lepas status master (`null`, instance di-detach). */
  | { op: 'setComponent'; id: string; component: Props | null }
  /** Hapus override pada alamat (ID instance = akar, atau komposit `I/…`); tanpa `props` = seluruh entri. */
  | { op: 'resetOverride'; id: string; props?: string[] }
  /** Ganti instance dengan node biasa ber-ID baru (props, override, slot diterapkan); `ref` → ID akar baru. */
  | { op: 'detach'; id: string; ref?: string };

export type DocOpKind = DocOp['op'];
