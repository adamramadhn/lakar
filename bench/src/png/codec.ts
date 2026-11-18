// Kodek PNG murni (hanya node:zlib bawaan): dekode 8-bit colortype 2/6 non-interlaced → RGBA,
// encode RGB 8-bit dengan tepat tiga chunk IHDR/IDAT/IEND (tanpa metadata apa pun).
import { deflateSync, inflateSync } from 'node:zlib';

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Gambar RGBA 8-bit (4 byte per piksel, baris berurutan). */
export type RgbaImage = { width: number; height: number; data: Uint8Array };
/** Gambar RGB 8-bit (3 byte per piksel, baris berurutan). */
export type RgbImage = { width: number; height: number; data: Uint8Array };

export type PngChunk = { type: string; data: Buffer };

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Daftar chunk (type + data) dengan verifikasi signature dan CRC. */
export function readChunks(png: Uint8Array): PngChunk[] {
  const b = Buffer.from(png.buffer, png.byteOffset, png.byteLength);
  if (b.length < 8 || !b.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('bukan PNG (signature)');
  const out: PngChunk[] = [];
  let i = 8;
  while (i < b.length) {
    if (i + 12 > b.length) throw new Error('PNG terpotong (header chunk)');
    const len = b.readUInt32BE(i);
    const type = b.toString('latin1', i + 4, i + 8);
    if (i + 12 + len > b.length) throw new Error(`PNG terpotong (chunk ${type})`);
    const data = b.subarray(i + 8, i + 8 + len);
    if (crc32(b.subarray(i + 4, i + 8 + len)) !== b.readUInt32BE(i + 8 + len)) throw new Error(`CRC chunk ${type} salah`);
    out.push({ type, data });
    i += 12 + len;
    if (type === 'IEND') break;
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Dekode PNG 8-bit colortype 2 (RGB) / 6 (RGBA), non-interlaced → RGBA (RGB diberi alpha 255). */
export function decodePng(png: Uint8Array): RgbaImage {
  const chunks = readChunks(png);
  const ihdr = chunks[0];
  if (!ihdr || ihdr.type !== 'IHDR' || ihdr.data.length !== 13) throw new Error('chunk pertama bukan IHDR');
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const [depth, colorType, compression, filter, interlace] = [ihdr.data[8]!, ihdr.data[9]!, ihdr.data[10]!, ihdr.data[11]!, ihdr.data[12]!];
  if (depth !== 8) throw new Error(`bit depth ${depth} tidak didukung (hanya 8)`);
  if (colorType !== 2 && colorType !== 6) throw new Error(`colortype ${colorType} tidak didukung (hanya 2/6)`);
  if (compression !== 0 || filter !== 0) throw new Error('metode kompresi/filter PNG tidak dikenal');
  if (interlace !== 0) throw new Error('PNG interlaced tidak didukung');
  if (!width || !height) throw new Error('ukuran PNG nol');
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  if (raw.length < (stride + 1) * height) throw new Error(`data IDAT kurang: ${raw.length} < ${(stride + 1) * height}`);
  const cur = new Uint8Array(stride);
  const prev = new Uint8Array(stride);
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const off = y * (stride + 1);
    const ft = raw[off]!;
    for (let x = 0; x < stride; x++) {
      const v = raw[off + 1 + x]!;
      const a = x >= bpp ? cur[x - bpp]! : 0;
      const b = prev[x]!;
      const c = x >= bpp ? prev[x - bpp]! : 0;
      let r: number;
      switch (ft) {
        case 0:
          r = v;
          break;
        case 1:
          r = v + a;
          break;
        case 2:
          r = v + b;
          break;
        case 3:
          r = v + ((a + b) >> 1);
          break;
        case 4:
          r = v + paeth(a, b, c);
          break;
        default:
          throw new Error(`filter baris ${ft} tidak dikenal`);
      }
      cur[x] = r & 0xff;
    }
    const o = y * width * 4;
    for (let x = 0; x < width; x++) {
      out[o + x * 4] = cur[x * bpp]!;
      out[o + x * 4 + 1] = cur[x * bpp + 1]!;
      out[o + x * 4 + 2] = cur[x * bpp + 2]!;
      out[o + x * 4 + 3] = bpp === 4 ? cur[x * bpp + 3]! : 255;
    }
    prev.set(cur);
  }
  return { width, height, data: out };
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** Encode RGB 8-bit: hanya IHDR, satu IDAT, IEND (tanpa tEXt/iTXt/pHYs/gAMA/…). Filter baris: Up. */
export function encodePngRgb(img: RgbImage): Buffer {
  const { width, height, data } = img;
  if (data.length !== width * height * 3) throw new Error(`panjang data RGB ${data.length} ≠ ${width}×${height}×3`);
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const o = y * (stride + 1);
    raw[o] = 2; // Up
    for (let x = 0; x < stride; x++) {
      const v = data[y * stride + x]!;
      const up = y ? data[(y - 1) * stride + x]! : 0;
      raw[o + 1 + x] = (v - up) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array(0))]);
}

/** Untuk tes: PNG dengan chunk tambahan (mis. tEXt/pHYs) dari gambar RGBA. */
export function encodePngRgbaWithChunks(img: RgbaImage, extra: { type: string; data: Uint8Array }[] = []): Buffer {
  const stride = img.width * 4;
  const raw = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(img.data.buffer, img.data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    ...extra.map((c) => chunk(c.type, c.data)),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]);
}
