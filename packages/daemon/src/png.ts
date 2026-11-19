// Dekoder PNG minimal (8-bit RGB/RGBA, non-interlaced) untuk tes dan checker tracer.
import { inflateSync } from 'node:zlib';

export type DecodedPng = { width: number; height: number; channels: 3 | 4; pixels: Uint8Array };

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

export function readPngSize(buf: Uint8Array): { width: number; height: number } {
  for (let i = 0; i < 8; i++) if (buf[i] !== SIG[i]) throw new Error('bukan PNG');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const type = String.fromCharCode(...buf.subarray(12, 16));
  if (type !== 'IHDR') throw new Error('chunk pertama bukan IHDR');
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

export function decodePng(buf: Uint8Array): DecodedPng {
  const { width, height } = readPngSize(buf);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const bitDepth = buf[24];
  const colorType = buf[25];
  const interlace = buf[28];
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new Error(`PNG tidak didukung (bitDepth ${bitDepth}, colorType ${colorType}, interlace ${interlace})`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const idat: Uint8Array[] = [];
  let off = 8;
  while (off < buf.length) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(...buf.subarray(off + 4, off + 8));
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[y * stride + x - channels]! : 0;
      const b = y > 0 ? out[(y - 1) * stride + x]! : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels]! : 0;
      let v = line[x]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 0xff;
    }
  }
  return { width, height, channels, pixels: out };
}

/** Jumlah piksel gelap (luminans < threshold) di persegi [x0,x1)×[y0,y1). */
export function countDarkPixels(img: DecodedPng, x0: number, y0: number, x1: number, y1: number, threshold = 128): number {
  let n = 0;
  for (let y = y0; y < Math.min(y1, img.height); y++) {
    for (let x = x0; x < Math.min(x1, img.width); x++) {
      const i = (y * img.width + x) * img.channels;
      const lum = 0.299 * img.pixels[i]! + 0.587 * img.pixels[i + 1]! + 0.114 * img.pixels[i + 2]!;
      if (lum < threshold) n++;
    }
  }
  return n;
}
