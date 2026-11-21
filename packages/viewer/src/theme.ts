// Tema viewer (Settings → General → Appearance): pilihan `system | light | dark` di localStorage, diterapkan sebagai
// atribut `data-theme="light|dark"` di <html> (token gelap di tokens.css). `system` mengikuti prefers-color-scheme
// dan ikut berubah saat OS berubah; pilihan dari tab lain ikut lewat event `storage`. Tanpa impor relatif: dites di Node.
import { useSyncExternalStore } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'lakar.viewer.theme';
export const THEME_PREFS: readonly ThemePref[] = ['light', 'dark', 'system'];
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Nilai tersimpan → pilihan; selain `light`/`dark`/`system` (rusak, kosong) → `system`. */
export function parseTheme(v: unknown): ThemePref {
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

/** Pilihan + preferensi OS → tema yang dipakai. */
export function resolveTheme(pref: ThemePref, systemDark: boolean): Theme {
  return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
}

function readPref(): ThemePref {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

function darkQuery(): MediaQueryList | undefined {
  try {
    return typeof matchMedia === 'function' ? matchMedia(DARK_QUERY) : undefined;
  } catch {
    return undefined;
  }
}

let pref: ThemePref = 'system';
let started = false;
const listeners = new Set<() => void>();

function apply() {
  const theme = resolveTheme(pref, darkQuery()?.matches ?? false);
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme;
}

function update(next: ThemePref) {
  const changed = next !== pref;
  pref = next;
  apply();
  if (changed) for (const l of listeners) l();
}

/** Terapkan tema tersimpan sebelum render pertama dan mulai mengikuti OS + tab lain. Aman dipanggil berulang. */
export function initTheme(): void {
  pref = readPref();
  apply();
  if (started) return;
  started = true;
  const mq = darkQuery();
  // OS berubah: hanya berpengaruh saat pilihan `system`, tetapi apply() murah dan selalu benar.
  mq?.addEventListener?.('change', apply);
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === THEME_KEY || e.key === null) update(readPref());
    });
  }
}

/** Simpan + terapkan pilihan. Penyimpanan gagal → tetap diterapkan untuk sesi ini. */
export function setTheme(next: ThemePref): void {
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // penyimpanan tidak tersedia
  }
  update(next);
}

export const getThemePref = (): ThemePref => pref;

/** Daftarkan pendengar perubahan pilihan tema; mengembalikan fungsi berhenti. */
export function subscribeTheme(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Pilihan tema saat ini + setter (ikut berubah dari tab lain). */
export function useTheme(): [ThemePref, (next: ThemePref) => void] {
  return [useSyncExternalStore(subscribeTheme, getThemePref, getThemePref), setTheme];
}
