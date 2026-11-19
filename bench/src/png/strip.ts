// Normalisasi bentuk untuk juri (golden-set §Prosedur 4, Lampiran B "Normalisasi bentuk"): murni, tanpa dependensi.
// Board/frame top-level → alpha dikomposit di atas latar netral → strip vertikal (jarak 48 px) → tile + overview.
import { decodePng, encodePngRgb, type RgbImage, type RgbaImage } from './codec.js';

/** Latar netral yang sama untuk kedua alat (#808080). */
export const NEUTRAL: readonly [number, number, number] = [0x80, 0x80, 0x80];
export const STRIP_GAP = 48;
/** API mengecilkan gambar bersisi panjang > 1568 px. */
export const MAX_SIDE = 1568;
/** Tinggi tile: ≤ 1000 untuk lebar > 600 (desktop), ≤ 1700 untuk lebih sempit (dipakai 1568 agar tidak dikecilkan API). */
export const TILE_HEIGHT_WIDE = 1000;
export const TILE_HEIGHT_NARROW = MAX_SIDE;
export const NARROW_MAX_WIDTH = 600;

/** RGBA di atas latar solid → RGB (alpha "straight", dibulatkan). */
export function compositeOver(img: RgbaImage, bg: readonly [number, number, number] = NEUTRAL): RgbImage {
  const n = img.width * img.height;
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = img.data[i * 4 + 3]!;
    for (let k = 0; k < 3; k++) {
      const c = img.data[i * 4 + k]!;
      out[i * 3 + k] = a === 255 ? c : a === 0 ? bg[k]! : Math.round((c * a + bg[k]! * (255 - a)) / 255);
    }
  }
  return { width: img.width, height: img.height, data: out };
}

/** Tumpuk vertikal sesuai urutan, jarak `gap` berwarna `bg`; gambar lebih sempit diletakkan di tengah. */
export function stackVertical(imgs: readonly RgbImage[], gap = STRIP_GAP, bg: readonly [number, number, number] = NEUTRAL): RgbImage {
  if (!imgs.length) throw new Error('strip: tidak ada gambar');
  const width = Math.max(...imgs.map((i) => i.width));
  const height = imgs.reduce((s, i) => s + i.height, 0) + gap * (imgs.length - 1);
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) data.set(bg, i * 3);
  let y0 = 0;
  for (const img of imgs) {
    const x0 = Math.floor((width - img.width) / 2);
    for (let y = 0; y < img.height; y++) {
      data.set(img.data.subarray(y * img.width * 3, (y + 1) * img.width * 3), ((y0 + y) * width + x0) * 3);
    }
    y0 += img.height + gap;
  }
  return { width, height, data };
}

/** Strip dari PNG (urutan dokumen): dekode, komposit alpha di atas #808080, tumpuk. */
export function buildStrip(pngs: readonly Uint8Array[]): RgbImage {
  return stackVertical(pngs.map((p) => compositeOver(decodePng(p))));
}

export function tileHeightFor(width: number): number {
  return width > NARROW_MAX_WIDTH ? TILE_HEIGHT_WIDE : TILE_HEIGHT_NARROW;
}

/** Potong menjadi tile lebar penuh dengan tinggi tetap (tile terakhir bisa lebih pendek). */
export function tiles(img: RgbImage, tileHeight = tileHeightFor(img.width)): RgbImage[] {
  const out: RgbImage[] = [];
  const row = img.width * 3;
  for (let y = 0; y < img.height; y += tileHeight) {
    const h = Math.min(tileHeight, img.height - y);
    out.push({ width: img.width, height: h, data: img.data.slice(y * row, (y + h) * row) });
  }
  return out;
}

/** Downscale box (rata-rata area) sampai sisi panjang ≤ `maxSide`; gambar yang sudah muat dikembalikan apa adanya. */
export function downscaleBox(img: RgbImage, maxSide = MAX_SIDE): RgbImage {
  const long = Math.max(img.width, img.height);
  if (long <= maxSide) return img;
  const s = maxSide / long;
  const w = Math.max(1, Math.round(img.width * s));
  const h = Math.max(1, Math.round(img.height * s));
  const out = new Uint8Array(w * h * 3);
  for (let oy = 0; oy < h; oy++) {
    const y0 = Math.floor((oy * img.height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((oy + 1) * img.height) / h));
    for (let ox = 0; ox < w; ox++) {
      const x0 = Math.floor((ox * img.width) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((ox + 1) * img.width) / w));
      let r = 0;
      let g = 0;
      let b = 0;
      for (let y = y0; y < y1; y++) {
        let p = (y * img.width + x0) * 3;
        for (let x = x0; x < x1; x++, p += 3) {
          r += img.data[p]!;
          g += img.data[p + 1]!;
          b += img.data[p + 2]!;
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const o = (oy * w + ox) * 3;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
    }
  }
  return { width: w, height: h, data: out };
}

/** Gambar untuk juri: tile lebar penuh + satu overview (semua PNG tanpa metadata). */
export function judgeImages(strip: RgbImage): { tiles: Buffer[]; overview: Buffer } {
  return { tiles: tiles(strip).map(encodePngRgb), overview: encodePngRgb(downscaleBox(strip)) };
}

/** Gambar juri dari strip PNG yang sudah ada (`<round>/<prompt>-<alat>.png`, RGB): dekode → komposit → tile + overview. */
export function judgeImagesFromStripPng(png: Uint8Array): { tiles: Buffer[]; overview: Buffer } {
  return judgeImages(compositeOver(decodePng(png)));
}
