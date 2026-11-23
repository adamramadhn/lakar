// Sidebar Viewer yang bisa dilipat (spec-viewer-collapsible-panels, desain bagian 03 "Viewer — Desktop — … collapsed"
// dan bagian 04 "Panel toggles" + baris motion "Panel expand/collapse"). Logika murni: state tersimpan, shortcut,
// dan aturan "toggle keduanya". Gerak dan tata letak ada di Viewer.tsx + app.css.
import type { ShortcutKey } from './editActions.js';

/** `true` = sidebar dilipat. Kiri = header file + Pages + Layers/Assets; kanan = Activity/Design/Checks/History. */
export type Sidebars = { left: boolean; right: boolean };
export type SidebarSide = keyof Sidebars;

export const SIDEBARS_KEY = 'lakar.viewer.sidebars';
export const OPEN_SIDEBARS: Sidebars = { left: false, right: false };

/** Durasi slide (ms), sama dengan app.css dan tabel motion WHm4A: expand 240, collapse 200. */
export const EXPAND_MS = 240;
export const COLLAPSE_MS = 200;

/** State tersimpan (localStorage, dibagi semua jendela aplikasi); rusak/tidak tersedia → kedua sidebar terbuka. */
export function readSidebars(): Sidebars {
  try {
    const raw = localStorage.getItem(SIDEBARS_KEY);
    if (!raw) return OPEN_SIDEBARS;
    const v = JSON.parse(raw) as Partial<Record<SidebarSide, unknown>>;
    return { left: v.left === true, right: v.right === true };
  } catch {
    return OPEN_SIDEBARS;
  }
}

export function writeSidebars(s: Sidebars) {
  try {
    localStorage.setItem(SIDEBARS_KEY, JSON.stringify(s));
  } catch {
    // penyimpanan tidak tersedia: state tetap berlaku di sesi ini
  }
}

/** Satu sidebar dibalik. */
export const toggleSide = (s: Sidebars, side: SidebarSide): Sidebars => ({ ...s, [side]: !s[side] });

/** Ctrl/⌘+\ (gaya Figma "Show/Hide UI"): ada yang terbuka → lipat keduanya; keduanya dilipat → buka keduanya. */
export const toggleBoth = (s: Sidebars): Sidebars => (s.left && s.right ? OPEN_SIDEBARS : { left: true, right: true });

/**
 * Shortcut sidebar (lewat `code`, jadi tidak bergantung tata letak keyboard): Ctrl/⌘+\ = keduanya,
 * Ctrl/⌘+Alt+[ = kiri, Ctrl/⌘+Alt+] = kanan. Tidak bentrok dengan Ctrl/⌘+[ / ] (urutan z) maupun Ctrl/⌘+Alt+K/B
 * (komponen) di editActions.ts.
 */
export function sidebarShortcut(e: ShortcutKey): SidebarSide | 'both' | undefined {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey) return undefined;
  if (!e.altKey) return e.code === 'Backslash' ? 'both' : undefined;
  if (e.code === 'BracketLeft') return 'left';
  if (e.code === 'BracketRight') return 'right';
  return undefined;
}
