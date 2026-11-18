import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, decodePng, encodePngRgb, encodePngRgbaWithChunks, readChunks, PNG_SIGNATURE, type RgbaImage } from './codec.js';
import { buildStrip, compositeOver, downscaleBox, judgeImages, stackVertical, tileHeightFor, tiles } from './strip.js';
import { readPngSize } from '../pendev/artifacts.js';

const rgba = (width: number, height: number, px: (x: number, y: number) => [number, number, number, number]): RgbaImage => {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(px(x, y), (y * width + x) * 4);
  return { width, height, data };
};

/** PNG RGB dengan filter baris bervariasi (0–4) untuk menguji semua jalur defilter. */
function rgbPngAllFilters(width: number, height: number, px: (x: number, y: number) => [number, number, number]): Buffer {
  const stride = width * 3;
  const img = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) img.set(px(x, y), y * stride + x * 3);
  const raw = Buffer.alloc((stride + 1) * height);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const ft = y % 5;
    raw[y * (stride + 1)] = ft;
    for (let x = 0; x < stride; x++) {
      const v = img[y * stride + x]!;
      const a = x >= 3 ? img[y * stride + x - 3]! : 0;
      const b = y ? img[(y - 1) * stride + x]! : 0;
      const c = y && x >= 3 ? img[(y - 1) * stride + x - 3]! : 0;
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][ft]!;
      raw[y * (stride + 1) + 1 + x] = (v - pred) & 0xff;
    }
  }
  const chunk = (type: string, data: Uint8Array) => {
    const h = Buffer.alloc(8);
    h.writeUInt32BE(data.length, 0);
    h.write(type, 4, 'latin1');
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc32(Buffer.concat([h.subarray(4), data])), 0);
    return Buffer.concat([h, data, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]);
}

describe('codec PNG', () => {
  it('crc32 standar', () => {
    expect(crc32(Buffer.from('IEND'))).toBe(0xae426082);
  });

  it('dekode RGB dengan filter 0–4 dan encode ulang identik piksel', () => {
    const px = (x: number, y: number): [number, number, number] => [(x * 37 + y) & 255, (y * 11) & 255, (x ^ y) & 255];
    const img = decodePng(rgbPngAllFilters(13, 11, px));
    expect([img.width, img.height]).toEqual([13, 11]);
    for (let y = 0; y < 11; y++) for (let x = 0; x < 13; x++) expect([...img.data.subarray((y * 13 + x) * 4, (y * 13 + x) * 4 + 4)]).toEqual([...px(x, y), 255]);
    const rgb = compositeOver(img);
    const back = decodePng(encodePngRgb(rgb));
    expect(Buffer.from(back.data)).toEqual(Buffer.from(img.data));
  });

  it('input ber-tEXt/iTXt/pHYs → output hanya IHDR/IDAT/IEND, RGB', () => {
    const src = encodePngRgbaWithChunks(rgba(4, 3, () => [10, 20, 30, 255]), [
      { type: 'tEXt', data: Buffer.from('Software\0pen') },
      { type: 'iTXt', data: Buffer.from('Comment\0\0\0\0\0rahasia') },
      { type: 'pHYs', data: Buffer.alloc(9, 1) },
    ]);
    expect(readChunks(src).map((c) => c.type)).toEqual(['IHDR', 'tEXt', 'iTXt', 'pHYs', 'IDAT', 'IEND']);
    const out = encodePngRgb(compositeOver(decodePng(src)));
    const chunks = readChunks(out);
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(chunks[0]!.data[9]).toBe(2);
    expect(out.includes(Buffer.from('rahasia'))).toBe(false);
  });

  it('menolak colortype/interlace yang tidak didukung', () => {
    const src = Buffer.from(encodePngRgbaWithChunks(rgba(1, 1, () => [0, 0, 0, 255])));
    const bad = (mut: (ihdr: Buffer) => void) => {
      const b = Buffer.from(src);
      const ihdr = b.subarray(16, 29);
      mut(ihdr);
      b.writeUInt32BE(crc32(b.subarray(12, 29)), 29);
      return b;
    };
    expect(() => decodePng(bad((h) => (h[9] = 3)))).toThrow(/colortype 3/);
    expect(() => decodePng(bad((h) => (h[12] = 1)))).toThrow(/interlaced/);
    expect(() => decodePng(bad((h) => (h[8] = 16)))).toThrow(/bit depth/);
  });
});

describe('strip', () => {
  it('2 board 390×844 + RGBA transparan → PNG 390×1736, RGB, 3 chunk, alpha di atas #808080', () => {
    const a = encodePngRgbaWithChunks(rgba(390, 844, () => [255, 255, 255, 0]));
    const b = encodePngRgbaWithChunks(rgba(390, 844, (x) => (x < 10 ? [0, 0, 0, 128] : [200, 0, 0, 255])));
    const strip = buildStrip([a, b]);
    expect([strip.width, strip.height]).toEqual([390, 1736]);
    const png = encodePngRgb(strip);
    expect(readPngSize(png)).toEqual({ width: 390, height: 1736 });
    expect(readChunks(png).map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    const at = (x: number, y: number) => [...strip.data.subarray((y * 390 + x) * 3, (y * 390 + x) * 3 + 3)];
    expect(at(5, 5)).toEqual([128, 128, 128]); // transparan penuh → latar netral
    expect(at(5, 860)).toEqual([128, 128, 128]); // jarak 48 px
    expect(at(5, 844 + 48 + 1)).toEqual([64, 64, 64]); // hitam alpha 128 di atas #808080
    expect(at(100, 844 + 48 + 1)).toEqual([200, 0, 0]);
  });

  it('gambar lebih sempit diletakkan di tengah, sisanya latar netral', () => {
    const s = stackVertical([
      { width: 4, height: 1, data: new Uint8Array(12).fill(255) },
      { width: 2, height: 1, data: new Uint8Array(6).fill(0) },
    ], 1);
    expect([s.width, s.height]).toEqual([4, 3]);
    expect([...s.data.subarray(24, 36)]).toEqual([128, 128, 128, 0, 0, 0, 0, 0, 0, 128, 128, 128]);
  });

  it('tile lebar penuh: ≤ 1000 untuk desktop, ≤ 1700 untuk sempit; overview sisi panjang ≤ 1568', () => {
    expect(tileHeightFor(1440)).toBe(1000);
    expect(tileHeightFor(390)).toBeLessThanOrEqual(1700);
    const img = { width: 1440, height: 2500, data: new Uint8Array(1440 * 2500 * 3).fill(7) };
    const t = tiles(img);
    expect(t.map((x) => [x.width, x.height])).toEqual([[1440, 1000], [1440, 1000], [1440, 500]]);
    const o = downscaleBox(img);
    expect(Math.max(o.width, o.height)).toBeLessThanOrEqual(1568);
    expect(o.data[0]).toBe(7);
    const j = judgeImages(img);
    expect(j.tiles).toHaveLength(3);
    expect(readPngSize(j.overview).height).toBe(1568);
  });

  it('downscale box merata-rata area', () => {
    const img = { width: 4, height: 2, data: Uint8Array.from([0, 0, 0, 255, 255, 255, 0, 0, 0, 255, 255, 255, 0, 0, 0, 255, 255, 255, 0, 0, 0, 255, 255, 255]) };
    const o = downscaleBox(img, 2);
    expect([o.width, o.height]).toEqual([2, 1]);
    expect([...o.data]).toEqual([128, 128, 128, 128, 128, 128]);
  });
});
