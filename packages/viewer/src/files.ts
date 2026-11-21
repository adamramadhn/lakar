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
  | { name: 'files' }
  | { name: 'archive' }
  | { name: 'settings' }
  | { name: 'connections' }
  | { name: 'viewer'; slug: string };

/** Hash halaman Settings → General. */
export const SETTINGS_HASH = '#/settings';
/** Hash Settings → Connections (App.tsx mengekspor ulang dari sini). */
export const CONNECTIONS_HASH = '#/settings/connections';

/**
 * `#/` Recents, `#/files`, `#/archive`, `#/settings` (= `#/settings/general`) General, `#/settings/connections`,
 * `#/d/<slug>` Viewer; selain itu Recents.
 */
export function parseRoute(hash: string): Route {
  if (/^#\/settings\/connections\/?$/.test(hash)) return { name: 'connections' };
  if (/^#\/settings(\/general)?\/?$/.test(hash)) return { name: 'settings' };
  if (/^#\/files\/?$/.test(hash)) return { name: 'files' };
  if (/^#\/archive\/?$/.test(hash)) return { name: 'archive' };
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
