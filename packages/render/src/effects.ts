/// <reference lib="dom" />
// Fill efek (story 22): noise/grain ber-seed (ubin SVG feTurbulence) dan mesh (medan warna titik kendali, canvas 2D).
// Murni browser (AD-6): tanpa API Node, tanpa WebGL. Deterministik: input sama → piksel sama (dikunci tes golden +
// render ganda byte-identik). Sinkron, jadi `mountBoard` tetap sinkron.
import type { ResolvedFill } from '@lakar/schema';

type NoiseFill = Extract<ResolvedFill, { type: 'noise' }>;
type MeshFill = Extract<ResolvedFill, { type: 'mesh' }>;

/** Ukuran ubin noise (px CSS); diulang `repeat`. */
export const NOISE_TILE = 256;
/** Default noise (Design Notes §Skema). */
export const NOISE_DEFAULTS = { size: 1.5, seed: 1, blend: 'overlay', mono: true } as const;
/**
 * Sisi terpanjang bitmap mesh (px; batas desain ≤ 512) dan ukuran bila kotak belum diketahui (hug/fill). 320 cukup
 * untuk medan mulus yang diskalakan bilinear dan menjaga mesh < 30 ms per fill (dikunci tes latensi).
 */
export const MESH_BITMAP_MAX = 320;
export const MESH_BITMAP_FALLBACK = 256;
/** σ Gauss mesh relatif jarak grid (Design Notes §Render). */
export const MESH_SIGMA = 0.6;

const SVG_NS = 'http://www.w3.org/2000/svg';
const n4 = (n: number) => String(+n.toFixed(4));

/**
 * Data URI SVG ubin noise: feTurbulence fractalNoise (baseFrequency = 1/size, 3 oktaf, seed, stitch) → matriks warna
 * (abu bila mono, kontras ×1,8 di sekitar 0,5) → alpha konstan = opacity.
 */
export function noiseTileUrl(f: NoiseFill): string {
  const size = f.size ?? NOISE_DEFAULTS.size;
  const seed = f.seed ?? NOISE_DEFAULTS.seed;
  const mono = f.mono ?? NOISE_DEFAULTS.mono;
  const k = 1.8;
  const off = n4(0.5 - k / 2);
  const rgb = mono
    ? [0, 1, 2].map(() => `${n4(k / 3)} ${n4(k / 3)} ${n4(k / 3)} 0 ${off}`)
    : [0, 1, 2].map((i) => [0, 1, 2].map((j) => (i === j ? n4(k) : '0')).join(' ') + ` 0 ${off}`);
  const matrix = [...rgb, `0 0 0 0 ${n4(f.opacity)}`].join(' ');
  const svg =
    `<svg xmlns="${SVG_NS}" width="${NOISE_TILE}" height="${NOISE_TILE}" viewBox="0 0 ${NOISE_TILE} ${NOISE_TILE}">` +
    `<filter id="n" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${n4(1 / size)}" numOctaves="3" seed="${seed}" stitchTiles="stitch"/>` +
    `<feColorMatrix type="matrix" values="${matrix}"/>` +
    `</filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Lapisan CSS noise: ubin 256 px diulang dari kiri atas. */
export function noiseLayer(f: NoiseFill): string {
  return `${noiseTileUrl(f)} 0 0 / ${NOISE_TILE}px ${NOISE_TILE}px repeat`;
}

/** Ukuran bitmap mesh: rasio kotak, sisi terpanjang ≤ MESH_BITMAP_MAX; kotak belum diketahui → 256×256. */
export function meshBitmapSize(w: number | undefined, h: number | undefined): { width: number; height: number } {
  if (!w || !h || !(w > 0) || !(h > 0)) return { width: MESH_BITMAP_FALLBACK, height: MESH_BITMAP_FALLBACK };
  const s = Math.min(1, MESH_BITMAP_MAX / Math.max(w, h));
  return { width: Math.max(2, Math.round(w * s)), height: Math.max(2, Math.round(h * s)) };
}

const hex = (c: string): [number, number, number, number] => {
  const v = c.slice(1);
  const p = (i: number) => parseInt(v.slice(i, i + 2), 16);
  return [p(0), p(2), p(4), v.length >= 8 ? p(6) : 255];
};

/** Titik kendali mesh: `points` atau grid rata (baris demi baris). */
export function meshPoints(f: Pick<MeshFill, 'columns' | 'rows' | 'points'>): [number, number][] {
  if (f.points) return f.points.map(([x, y]) => [x, y]);
  const out: [number, number][] = [];
  for (let r = 0; r < f.rows; r++) for (let c = 0; c < f.columns; c++) out.push([c / (f.columns - 1), r / (f.rows - 1)]);
  return out;
}

/** Hash bilangan bulat deterministik per piksel (32 bit; tiap byte = dither satu kanal). */
function hash32(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Piksel RGBA mesh (murni, tanpa DOM): tiap piksel = rata-rata warna sRGB titik kendali berbobot Gauss
 * (σ = 0,6 × jarak grid per sumbu, dalam koordinat kotak 0..1, jadi bentuk medan tidak bergantung rasio bitmap),
 * + dither hash ±0,5 LSB agar tanpa banding.
 */
export function meshPixels(f: Pick<MeshFill, 'columns' | 'rows' | 'colors' | 'points'>, width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
  const pts = meshPoints(f);
  const cols = f.colors.map(hex);
  const sx = MESH_SIGMA / (f.columns - 1);
  const sy = MESH_SIGMA / (f.rows - 1);
  const n = pts.length;
  // Separabel: w_k(x, y) = ex_k[x] · ey_k[y].
  const ex = new Float64Array(n * width);
  const ey = new Float64Array(n * height);
  for (let k = 0; k < n; k++) {
    const [px, py] = pts[k]!;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width - px;
      ex[k * width + x] = Math.exp(-(u * u) / (2 * sx * sx));
    }
    for (let y = 0; y < height; y++) {
      const v = (y + 0.5) / height - py;
      ey[k * height + y] = Math.exp(-(v * v) / (2 * sy * sy));
    }
  }
  const out = new Uint8ClampedArray(width * height * 4);
  const acc = new Float64Array(4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      acc.fill(0);
      let sum = 0;
      for (let k = 0; k < n; k++) {
        const w = ex[k * width + x]! * ey[k * height + y]!;
        const c = cols[k]!;
        // RGB dirata-ratakan premultiplied (bobot × alpha) seperti gradien CSS: titik transparan tidak menggelapkan
        // atau mewarnai tetangganya; alpha dirata-ratakan biasa.
        const wa = w * c[3];
        acc[0]! += wa * c[0];
        acc[1]! += wa * c[1];
        acc[2]! += wa * c[2];
        acc[3]! += wa;
        sum += w;
      }
      const i = (y * width + x) * 4;
      const h = hash32(x, y);
      const aSum = acc[3]!;
      for (let ch = 0; ch < 4; ch++) {
        const v = ch === 3 ? (sum > 0 ? aSum / sum : cols[0]![3]) : aSum > 0 ? acc[ch]! / aSum : cols[0]![ch]!;
        // Dither ±0,5 LSB pada RGB (byte hash per kanal); alpha tanpa dither.
        out[i + ch] = ch === 3 ? Math.round(v) : Math.round(v + ((h >>> (ch * 8)) & 255) / 256 - 0.5);
      }
    }
  }
  return out;
}

const meshCache = new Map<string, string>();

/** Data URL PNG mesh (canvas 2D `putImageData` → `toDataURL`), cache per (fill, ukuran bitmap). */
export function meshDataUrl(f: MeshFill, w: number | undefined, h: number | undefined, doc: Document): string {
  const { width, height } = meshBitmapSize(w, h);
  const key = `${JSON.stringify([f.columns, f.rows, f.colors, f.points ?? null])}@${width}x${height}`;
  const hit = meshCache.get(key);
  if (hit) return hit;
  const canvas = doc.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d', { colorSpace: 'srgb' });
  if (!g) throw new Error('canvas 2D tidak tersedia untuk fill mesh');
  g.putImageData(new ImageData(meshPixels(f, width, height), width, height), 0, 0);
  const url = canvas.toDataURL('image/png');
  if (meshCache.size > 64) meshCache.clear();
  meshCache.set(key, url);
  return url;
}

/** Lapisan CSS mesh: bitmap diskalakan ke kotak (upscale bilinear browser). */
export function meshLayer(f: MeshFill, w: number | undefined, h: number | undefined, doc: Document): string {
  return `url("${meshDataUrl(f, w, h, doc)}") 0 0 / 100% 100% no-repeat`;
}
