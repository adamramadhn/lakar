// Fungsi murni tata letak sentuh (aplikasi 9): snap bottom sheet mobile dan geometri pinch kanvas.
import type { Camera } from './viewState.js';

export type SheetState = 'collapsed' | 'half' | 'full';

// Konstanta ini harus sama dengan tinggi sheet dan media query mobile di app.css (54px, 356px, celah 8px, 767.98px).

/** Tinggi sheet collapsed: grabber 16px + strip tab 38px. */
export const SHEET_COLLAPSED = 54;
/** Batas tinggi sheet half (desain "Viewer — Mobile": sheet 356px). */
export const SHEET_HALF_MAX = 356;
/** Jarak sheet full dari atas viewer. */
export const SHEET_FULL_GAP = 8;

/** Pilih tab panel: sheet collapsed terbuka ke half, state lain tetap. */
export const sheetForTab = (s: SheetState): SheetState => (s === 'collapsed' ? 'half' : s);

/** Tap grabber (tanpa drag): collapsed ↔ half, full → half. */
export const grabberTap = (s: SheetState): SheetState => (s === 'half' ? 'collapsed' : 'half');

/** Tinggi tiap state untuk area sheet setinggi `viewerH` (viewer dikurangi top bar): collapsed 54, half min(356, 50%), full tinggi − 8. */
export function sheetHeights(viewerH: number): Record<SheetState, number> {
  const full = Math.max(SHEET_COLLAPSED, viewerH - SHEET_FULL_GAP);
  return { collapsed: SHEET_COLLAPSED, half: Math.min(full, Math.max(SHEET_COLLAPSED, Math.min(SHEET_HALF_MAX, viewerH / 2))), full };
}

/** State terdekat dari tinggi `height` sesudah drag dilepas (seri → state yang lebih rendah). */
export function snapSheet(height: number, viewerH: number): SheetState {
  const h = sheetHeights(viewerH);
  let best: SheetState = 'collapsed';
  for (const s of ['half', 'full'] as const) if (Math.abs(h[s] - height) < Math.abs(h[best] - height)) best = s;
  return best;
}

export type Point = { x: number; y: number };

/**
 * Kamera pinch: dua jari dari (a0, b0) ke (a1, b1), koordinat relatif kanvas. Zoom = rasio jarak jari (dijepit
 * `clamp`); titik dokumen di bawah titik tengah awal tetap di bawah titik tengah sekarang (zoom + pan sekaligus).
 */
export function pinchCamera(start: Camera, a0: Point, b0: Point, a1: Point, b1: Point, clamp: (z: number) => number = (z) => z): Camera {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  const z = clamp(d0 > 0 && d1 > 0 ? start.z * (d1 / d0) : start.z);
  const k = z / start.z;
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  return { z, x: m1.x - (m0.x - start.x) * k, y: m1.y - (m0.y - start.y) * k };
}

/** Gerak maksimal (px) sebuah klik mouse / tap sentuh. */
export const CLICK_SLOP = 3;
export const TAP_SLOP = 8;

/**
 * Arti satu pointer di kanvas: `pan` = gerak menggeser kamera, `tap` = lepas tanpa gerak (≤ `slop`) memilih/menyisip.
 * Sentuh: Select/Hand menggeser, tap memilih kecuali Hand. Mouse: Hand, Space, atau tombol tengah menggeser.
 */
export function pointerIntent({ touch, tool, spaceHeld, button }: { touch: boolean; tool: string; spaceHeld: boolean; button: number }): { pan: boolean; tap: boolean; slop: number } {
  if (touch) return { pan: tool === 'select' || tool === 'hand', tap: tool !== 'hand', slop: TAP_SLOP };
  const pan = tool === 'hand' || spaceHeld || button === 1;
  return { pan, tap: !pan, slop: CLICK_SLOP };
}
