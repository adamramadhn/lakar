// Logika murni kelola file dan routing hash (tanpa React, tanpa impor relatif: dites langsung di Node).
// `slugify`/`withSuffix` salinan packages/daemon/src/files.ts (disalin agar bundle tidak menarik zod);
// daemon tetap sumber kebenaran, pratinjau di dialog hanya perkiraan.

export const SLUG_MAX = 64;

/** Nama bebas → slug kebab-case (`My Landing` → `my-landing`); kosong bila nama tidak bisa dipakai. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');
}

/** `base` dengan sufiks `-n` (n ≥ 2), tetap ≤ 64 karakter. */
export function withSuffix(base: string, n: number): string {
  if (n <= 1) return base;
  const sfx = `-${n}`;
  return `${base.slice(0, SLUG_MAX - sfx.length).replace(/-+$/, '')}${sfx}`;
}

/** Pratinjau slug New file: slug pertama yang belum dipakai (`-2`, `-3`, …; `taken` termasuk arsip bila sudah dimuat); '' bila nama tidak valid. */
export function previewSlug(name: string, taken: ReadonlySet<string>): string {
  const base = slugify(name);
  if (!base) return '';
  for (let n = 1; ; n++) {
    const s = withSuffix(base, n);
    if (!taken.has(s)) return s;
  }
}

export type PresetId = 'desktop' | 'tablet' | 'mobile' | 'custom';
export const PRESETS: { id: PresetId; label: string; width?: number; height?: number }[] = [
  { id: 'desktop', label: 'Desktop', width: 1440, height: 900 },
  { id: 'tablet', label: 'Tablet', width: 768, height: 1024 },
  { id: 'mobile', label: 'Mobile', width: 375, height: 812 },
  { id: 'custom', label: 'Custom' },
];
export const SIZE_MAX = 10000;

export type BoardChoice = { preset: Exclude<PresetId, 'custom'> } | { preset: 'custom'; width: number; height: number };

/** Ukuran custom valid: bilangan bulat 1..10000. */
export const validSize = (v: number) => Number.isInteger(v) && v >= 1 && v <= SIZE_MAX;

// ---- Routing hash ----

export type Route =
  | { name: 'recents' }
  | { name: 'files'; folder?: string }
  | { name: 'archive' }
  | { name: 'settings' }
  | { name: 'connections' }
  | { name: 'updates' }
  | { name: 'join'; server?: string; token?: string }
  | { name: 'viewer'; slug: string };

/** Hash halaman Settings → General. */
export const SETTINGS_HASH = '#/settings';
/** Hash Settings → Connections (App.tsx mengekspor ulang dari sini). */
export const CONNECTIONS_HASH = '#/settings/connections';
/** Hash Settings → Updates (hanya bermakna di aplikasi desktop). */
export const UPDATES_HASH = '#/settings/updates';

/**
 * `#/` Recents, `#/files`, `#/files/<id>` folder, `#/archive`, `#/settings` (= `#/settings/general`) General,
 * `#/settings/connections`, `#/settings/updates`, `#/d/<slug>` Viewer; selain itu Recents.
 */
export function parseRoute(hash: string): Route {
  if (/^#\/settings\/connections\/?$/.test(hash)) return { name: 'connections' };
  if (/^#\/settings\/updates\/?$/.test(hash)) return { name: 'updates' };
  if (/^#\/settings(\/general)?\/?$/.test(hash)) return { name: 'settings' };
  if (/^#\/files\/?$/.test(hash)) return { name: 'files' };
  const f = /^#\/files\/([^/?#]+)\/?$/.exec(hash);
  if (f) {
    try {
      return { name: 'files', folder: decodeURIComponent(f[1]!) };
    } catch {
      return { name: 'files' };
    }
  }
  if (/^#\/archive\/?$/.test(hash)) return { name: 'archive' };
  // `#/join?server=<url>&token=<token>` — dialog gabung room (query opsional: prefill dari tautan undangan).
  const j = /^#\/join(?:\?([^#]*))?\/?$/.exec(hash);
  if (j) {
    const q = new URLSearchParams(j[1] ?? '');
    return { name: 'join', ...(q.get('server') ? { server: q.get('server')! } : {}), ...(q.get('token') ? { token: q.get('token')! } : {}) };
  }
  const m = /^#\/d\/([^/?#]+)/.exec(hash);
  if (m) {
    try {
      return { name: 'viewer', slug: decodeURIComponent(m[1]!) };
    } catch {
      // hash rusak → dashboard
    }
  }
  return { name: 'recents' };
}

export const docHash = (slug: string) => `#/d/${encodeURIComponent(slug)}`;

/** Hash halaman folder (`#/files/<id>`); tanpa id → halaman Files (root). */
export const folderHash = (id?: string | null) => (id ? `#/files/${encodeURIComponent(id)}` : '#/files');

// ---- Folder ----

/** Meta Folder Item: `Empty`, `1 file`, `N files`. */
export const folderMeta = (n: number) => (n <= 0 ? 'Empty' : n === 1 ? '1 file' : `${n} files`);

/** Folder `slug` (null = root). Hanya properti milik sendiri: slug seperti `constructor` tidak membaca Object.prototype. */
export const memberOf = (membership: Readonly<Record<string, string>>, slug: string): string | null => (Object.hasOwn(membership, slug) ? membership[slug]! : null);

/** File di folder `folder` (null = root: file yang tidak di folder mana pun). Urutan daftar dipertahankan. */
export function inFolder<T extends { slug: string }>(docs: readonly T[], membership: Readonly<Record<string, string>>, folder: string | null): T[] {
  return docs.filter((d) => memberOf(membership, d.slug) === folder);
}

/** Tautan file untuk Copy link: `http://127.0.0.1:<port>/app/#/d/<slug>`. */
export const docLink = (port: number, slug: string) => `http://127.0.0.1:${port}/app/${docHash(slug)}`;

/** Urut nama (halaman Files). */
export const byName = <T extends { slug: string }>(docs: readonly T[]): T[] => [...docs].sort((a, b) => a.slug.localeCompare(b.slug));

/** Hasil Search sidebar: file yang slug-nya memuat `query` (tanpa peka huruf besar), urutan daftar dipertahankan, ≤ `limit`. Query kosong → []. */
export function searchDocs<T extends { slug: string }>(docs: readonly T[], query: string, limit = 8): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: T[] = [];
  for (const d of docs) {
    if (!d.slug.toLowerCase().includes(q)) continue;
    out.push(d);
    if (out.length >= limit) break;
  }
  return out;
}

/** Indeks baris berikut (`dir` 1) / sebelumnya (-1) yang melingkar di daftar `n` baris; `n` 0 → 0. */
export function wrapIndex(current: number, n: number, dir: 1 | -1): number {
  if (n <= 0) return 0;
  return (((current + dir) % n) + n) % n;
}

// ---- Urutan halaman Files ----

export type SortKey = 'edited' | 'name';
export const SORT_LABEL: Record<SortKey, string> = { edited: 'Last edited', name: 'Name' };
export const SORT_KEYS: readonly SortKey[] = ['edited', 'name'];
/** Nilai simpanan → kunci urut; tidak dikenal → `edited` (bawaan desain "Files": "Last edited"). */
export const parseSort = (v: string | null | undefined): SortKey => (v === 'name' ? 'name' : 'edited');

/** Terbaru diedit dulu (seri: nama). */
export const byEdited = <T extends { slug: string; updatedAt: string }>(docs: readonly T[]): T[] =>
  [...docs].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.slug.localeCompare(b.slug)));

export const sortDocs = <T extends { slug: string; updatedAt: string }>(docs: readonly T[], key: SortKey): T[] => (key === 'name' ? byName(docs) : byEdited(docs));

// ---- Pesan error kelola file ----

export type FileOp = 'load' | 'create' | 'rename' | 'duplicate' | 'archive' | 'unarchive' | 'delete' | 'move' | 'folder' | 'copy' | 'leave';

const INTERNAL_PREFIX = 'kesalahan internal daemon: ';

/**
 * Pesan error berbahasa Inggris untuk aksi Dashboard. Pesan daemon ditulis dalam bahasa Indonesia untuk agen dan
 * tidak boleh tampil di UI: kode AD-11 (`code`) dipetakan per aksi. `slug` = file sasaran (rename: slug tujuan).
 * Error tanpa kode (jaringan, offline, clipboard) memakai `fallback` dari pemanggil (mis. `errorText`).
 */
export function fileErrorText(e: unknown, op: FileOp, slug: string | undefined, fallback: (e: unknown) => string): string {
  const err = (typeof e === 'object' && e !== null ? e : {}) as { code?: unknown; message?: unknown; retryable?: unknown };
  const code = typeof err.code === 'string' ? err.code : undefined;
  if (op === 'copy' && !code) return 'Couldn’t copy to the clipboard. Select the text and copy it manually.';
  if (!code) return fallback(e);
  const message = typeof err.message === 'string' ? err.message : '';
  const name = slug ? `“${slug}”` : 'This file';
  switch (code) {
    case 'CONFLICT':
      if (err.retryable === true) return 'Another file with this name was just created. Try again.';
      if (op === 'rename' || op === 'create')
        return message.includes('arsip') ? `An archived file is already named ${name}. Choose another name, or delete it from Archive first.` : `A file named ${name} already exists. Choose another name.`;
      if (op === 'unarchive') return `A file named ${name} is already in your files. Rename or delete it first, then unarchive.`;
      if (op === 'folder') return 'A folder with this name already exists.';
      return `${name} changed in another window. Reload and try again.`;
    case 'NOT_FOUND':
      if (op === 'leave') return 'This room is no longer joined. It may have been left in another window.';
      if (op === 'move' || op === 'folder') return 'This folder or file no longer exists. It may have been deleted in another window.';
      return `${name} no longer exists. It may have been renamed or deleted in another window.`;
    case 'SCHEMA_INVALID':
      if (op === 'create' || op === 'rename' || op === 'folder') return 'That name or size isn’t valid. Use letters or numbers, and board sizes from 1 to 10000 px.';
      return 'Lakar rejected this request. Reload the app and try again.';
    case 'EXEC_ERROR': {
      // Error tak terduga di daemon (mis. EPERM dari sistem file): sertakan pesan sistem (bahasa Inggris dari Node).
      const detail = message.startsWith(INTERNAL_PREFIX) ? message.slice(INTERNAL_PREFIX.length) : '';
      return `Lakar couldn’t save this change${detail ? ` (${detail})` : ''}. Try again.`;
    }
    default:
      if (op === 'leave') return 'Couldn’t leave this room. Check your connection and try again.';
      return `Something went wrong (${code}). Try again.`;
  }
}
