// Tinggi board `height:'hug'` di viewer (spec-board-hug-height). Tinggi board hug tidak tersimpan di dokumen; canvas
// mengukurnya dari DOM live (atau PNG screenshot) lalu semua geometri board (bingkai, seleksi, handle, kamera, marker,
// ekspor) memakai angka terukur itu. Murni.
import { HUG_VIEWPORT_HEIGHT } from '@lakar/render';

/** Tinggi sementara board hug yang belum terukur (sama dengan viewport awal render daemon). */
export const HUG_PENDING_HEIGHT = HUG_VIEWPORT_HEIGHT;

/** Board dengan tinggi terselesaikan: angka, plus penanda `hug` bila tingginya ikut isi. */
export type MeasuredHeight = { height: number; hug?: true };

/**
 * Board dokumen → board kanvas: `height:'hug'` diganti tinggi terukur `heights` (belum terukur →
 * `HUG_PENDING_HEIGHT`) dan ditandai `hug: true`; board bertinggi angka dikembalikan apa adanya (identitas sama).
 */
export function measuredBoards<B extends { id: string; height?: unknown }>(boards: readonly B[], heights: ReadonlyMap<string, number>): (Omit<B, 'height'> & MeasuredHeight)[] {
  return boards.map((b) => {
    if (b.height !== 'hug') return b as unknown as Omit<B, 'height'> & MeasuredHeight;
    return { ...b, height: heights.get(b.id) ?? HUG_PENDING_HEIGHT, hug: true as const };
  });
}

/** Peta tinggi dengan entri `id` = `h` (dibulatkan 0,01); peta yang sama bila tidak berubah (setState tanpa render). */
export function withHeight(m: ReadonlyMap<string, number>, id: string, h: number): ReadonlyMap<string, number> {
  const v = Math.round(h * 100) / 100;
  if (!Number.isFinite(v) || m.get(id) === v) return m;
  return new Map(m).set(id, v);
}
