/// <reference lib="dom" />
// Font render (AD-6, AD-10): face HANYA dari input pemanggil (daemon me-resolve ke URL lokal),
// dimuat eksplisit; yang tidak ada/gagal → FONT_MISSING. Tanpa fallback diam-diam.
import type { ResolvedBoardNode as BoardNode, ResolvedChildNode as ChildNode } from '@lakar/schema';

export type FontStyle = 'normal' | 'italic';

/** Varian font yang dipakai teks: `{family, weight, style}` setelah default diterapkan. */
export type FontRequest = { family: string; weight: number; style: FontStyle };

/** Satu face yang sudah di-resolve pemanggil (URL lokal, mis. `/fonts/inter/inter-latin-400-normal.woff2`). */
export type FontFaceSource = FontRequest & { url: string; unicodeRange?: string | undefined };

/** Default teks tanpa family/weight/style. */
export const DEFAULT_FONT: FontRequest = { family: 'Inter', weight: 400, style: 'normal' };

export const fontKey = (r: FontRequest): string => `${r.family.toLowerCase()}|${r.weight}|${r.style}`;

/** Varian teks setelah default diterapkan. */
export function textFont(n: { family?: string | undefined; weight?: number | undefined; style?: FontStyle | undefined }): FontRequest {
  return { family: n.family ?? DEFAULT_FONT.family, weight: n.weight ?? DEFAULT_FONT.weight, style: n.style ?? DEFAULT_FONT.style };
}

/** Daftar unik `{family, weight, style}` yang dipakai teks di board (urut kemunculan). */
export function fontRequests(board: BoardNode): FontRequest[] {
  const out = new Map<string, FontRequest>();
  const walk = (nodes: readonly ChildNode[]) => {
    for (const n of nodes) {
      if (n.type === 'text') {
        const r = textFont(n);
        const k = fontKey(r);
        if (!out.has(k)) out.set(k, r);
      } else if (n.type === 'frame') walk(n.children);
    }
  };
  walk(board.children);
  return [...out.values()];
}

/** Request yang tidak punya satu pun face di input. */
export function missingFaces(requests: readonly FontRequest[], faces: readonly FontFaceSource[]): FontRequest[] {
  const have = new Set(faces.map(fontKey));
  return requests.filter((r) => !have.has(fontKey(r)));
}

// Cache per halaman: halaman daemon dipakai ulang antar-render; face yang sama tidak ditambah dua kali.
const cache = new Map<string, FontFace>();
const faceKey = (f: FontFaceSource) => `${fontKey(f)}|${f.url}|${f.unicodeRange ?? ''}`;

/** Nama family untuk CSS: dikutip, tanpa generic fallback. */
export const cssFamily = (family: string): string => `"${family.replace(/["\\]/g, '\\$&')}"`;

/**
 * Daftarkan + muat (await `load()`) semua face. Mengembalikan request yang face-nya gagal dimuat
 * beserta FontFace per request untuk verifikasi ulang setelah mount.
 */
export async function loadFaces(
  d: Document,
  faces: readonly FontFaceSource[],
): Promise<{ failed: FontRequest[]; byRequest: Map<string, FontFace[]> }> {
  const byRequest = new Map<string, FontFace[]>();
  const failed = new Map<string, FontRequest>();
  await Promise.all(
    faces.map(async (src) => {
      const k = faceKey(src);
      let face = cache.get(k);
      if (!face || face.status === 'error') {
        face = new FontFace(src.family, `url(${JSON.stringify(src.url)}) format("woff2")`, {
          weight: String(src.weight),
          style: src.style,
          ...(src.unicodeRange ? { unicodeRange: src.unicodeRange } : {}),
        });
        cache.set(k, face);
      }
      if (!d.fonts.has(face)) d.fonts.add(face);
      const list = byRequest.get(fontKey(src)) ?? [];
      list.push(face);
      byRequest.set(fontKey(src), list);
      try {
        await face.load();
      } catch {
        failed.set(fontKey(src), { family: src.family, weight: src.weight, style: src.style });
        // Face rusak jangan ikut dipakai; render berikutnya mencoba lagi.
        d.fonts.delete(face);
        cache.delete(k);
      }
    }),
  );
  return { failed: [...failed.values()], byRequest };
}

// ---- Cakupan glyph (AD-6): karakter di luar `unicode-range` face → FONT_MISSING, bukan fallback sistem.

/** Parse CSS `unicode-range` (`U+X`, `U+X-Y`, wildcard `U+4??`) → daftar [lo, hi] inklusif. */
export function parseUnicodeRange(range: string): [number, number][] {
  const out: [number, number][] = [];
  for (const raw of range.split(',')) {
    const part = raw.trim().toUpperCase();
    if (!part) continue;
    const m = /^U\+([0-9A-F?]{1,6})(?:-([0-9A-F]{1,6}))?$/.exec(part);
    if (!m) continue; // token tak valid diabaikan, seperti browser
    const a = m[1]!;
    if (a.includes('?')) {
      if (m[2] !== undefined || !/^[0-9A-F]*\?+$/.test(a)) continue;
      out.push([parseInt(a.replace(/\?/g, '0'), 16), parseInt(a.replace(/\?/g, 'F'), 16)]);
    } else {
      const lo = parseInt(a, 16);
      const hi = m[2] !== undefined ? parseInt(m[2], 16) : lo;
      if (hi >= lo) out.push([lo, hi]);
    }
  }
  return out;
}

/** Karakter teks yang tidak tercakup face varian-nya. */
export type UncoveredGlyph = { nodeId: string; char: string; codePoint: number; request: FontRequest };

export const codePointLabel = (cp: number): string => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

/**
 * Periksa setiap code point `content` setiap teks: harus berada di `unicodeRange` salah satu face
 * `{family, weight, style}` teks itu. Face tanpa `unicodeRange` mencakup semua.
 * Mengembalikan karakter unik tak tercakup per node (urut kemunculan). Request tanpa face dilewati
 * (sudah ditangani `missingFaces`).
 */
export function uncoveredGlyphs(board: BoardNode, faces: readonly FontFaceSource[]): UncoveredGlyph[] {
  const ranges = new Map<string, [number, number][] | 'all'>();
  for (const f of faces) {
    const k = fontKey(f);
    if (ranges.get(k) === 'all') continue;
    if (f.unicodeRange === undefined || f.unicodeRange.trim() === '') {
      ranges.set(k, 'all');
      continue;
    }
    const list = (ranges.get(k) as [number, number][] | undefined) ?? [];
    list.push(...parseUnicodeRange(f.unicodeRange));
    ranges.set(k, list);
  }
  const out: UncoveredGlyph[] = [];
  const walk = (nodes: readonly ChildNode[]) => {
    for (const n of nodes) {
      if (n.type === 'frame') walk(n.children);
      if (n.type !== 'text') continue;
      const request = textFont(n);
      const r = ranges.get(fontKey(request));
      if (r === undefined || r === 'all') continue;
      const seen = new Set<number>();
      for (const ch of n.content) {
        const cp = ch.codePointAt(0)!;
        if (seen.has(cp)) continue;
        seen.add(cp);
        if (!r.some(([lo, hi]) => cp >= lo && cp <= hi)) out.push({ nodeId: n.id, char: ch, codePoint: cp, request });
      }
    }
  };
  walk(board.children);
  return out;
}
