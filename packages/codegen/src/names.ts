// Nama identifier kode dari nama layer (deterministik, ASCII): kelas CSS module (camelCase) dan nama komponen
// (PascalCase). Murni.
import { SKELETON_PREFIX } from '@lakar/schema';

/** Nama layer tanpa penanda placeholder `[Skeleton] ` (spec-skeleton-live-build): bukan bagian nama di kode/header. */
export const layerName = (name: string): string => (name.startsWith(SKELETON_PREFIX) ? name.slice(SKELETON_PREFIX.length) : name);

/** Kata ASCII dari nama layer (tanpa penanda placeholder): diakritik dibuang, pemisah = non-alfanumerik dan batas camelCase. */
export function words(name: string): string[] {
  return layerName(name)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** camelCase; kosong → `fallback`; diawali angka → awalan `n`. */
export function camelName(name: string, fallback: string): string {
  const w = words(name);
  if (!w.length) return fallback;
  const s = w[0]! + w.slice(1).map(cap).join('');
  return /^[0-9]/.test(s) ? `n${cap(s)}` : s;
}

/** PascalCase untuk nama komponen React; kosong atau diawali angka → awalan `Frame`. */
export function pascalName(name: string): string {
  const s = words(name).map(cap).join('');
  if (!s) return 'Frame';
  return /^[0-9]/.test(s) ? `Frame${s}` : s;
}

/** Alokator nama unik: bentrok → sufiks angka (`title`, `title2`, …). */
export class NameAllocator {
  private readonly used = new Set<string>();
  take(base: string): string {
    let name = base;
    for (let i = 2; this.used.has(name); i++) name = `${base}${i}`;
    this.used.add(name);
    return name;
  }
}
