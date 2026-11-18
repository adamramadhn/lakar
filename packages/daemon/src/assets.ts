// Store aset gambar daemon: `<dataDir>/assets/<sha256>` (tanpa ekstensi). Hanya raster PNG/JPEG/WebP/GIF
// (dikenali dari magic bytes) yang disajikan; SVG/HTML/lainnya tidak pernah disajikan sebagai aset.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const ASSET_ID = /^[a-f0-9]{64}$/;

/** MIME raster dari magic bytes, atau undefined. */
export function rasterType(buf: Uint8Array): string | undefined {
  const b = (i: number) => buf[i];
  const ascii = (from: number, to: number) => String.fromCharCode(...buf.subarray(from, to));
  if (buf.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b(i) === v)) return 'image/png';
  if (buf.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'image/gif';
  return undefined;
}

/** Baca aset `hash` dari store. Hash tidak valid, file tidak ada, atau bukan raster → undefined. */
export async function readAsset(dataDir: string, hash: string): Promise<{ type: string; body: Buffer } | undefined> {
  if (!ASSET_ID.test(hash)) return undefined;
  const body = await readFile(join(dataDir, 'assets', hash)).catch(() => undefined);
  if (!body) return undefined;
  const type = rasterType(body);
  return type ? { type, body } : undefined;
}
