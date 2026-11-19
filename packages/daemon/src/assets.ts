// Store aset gambar daemon: `<dataDir>/assets/<sha256>` (tanpa ekstensi). Hanya raster PNG/JPEG/WebP/GIF
// (dikenali dari magic bytes) yang disajikan; SVG/HTML/lainnya tidak pernah disajikan sebagai aset.
import { createHash, randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { ASSET_ID_PATTERN } from '@lakar/schema';

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
  if (!ASSET_ID_PATTERN.test(hash)) return undefined;
  const body = await readFile(join(dataDir, 'assets', hash)).catch(() => undefined);
  if (!body) return undefined;
  const type = rasterType(body);
  return type ? { type, body } : undefined;
}

/** Tulis file secara atomik (tmp di direktori yang sama + rename), mode 644. */
export async function writeFileAtomic(path: string, data: Uint8Array | string): Promise<void> {
  const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await writeFile(tmp, data, { mode: 0o644 });
    await chmod(tmp, 0o644);
    await rename(tmp, path);
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}

/**
 * Simpan raster `bytes` ke `<dataDir>/assets/<sha256>` (atomik, mode 644). Bukan raster → Error. sha yang sudah
 * ada tidak ditulis ulang. Mengembalikan sha + MIME.
 */
export async function writeAsset(dataDir: string, bytes: Uint8Array): Promise<{ sha: string; mime: string }> {
  const mime = rasterType(bytes);
  if (!mime) throw new Error('bukan gambar raster PNG/JPEG/WebP/GIF');
  const sha = createHash('sha256').update(bytes).digest('hex');
  const dir = join(dataDir, 'assets');
  const path = join(dir, sha);
  const exists = await stat(path).then(
    (s) => s.isFile() && s.size === bytes.byteLength,
    () => false,
  );
  if (!exists) {
    await mkdir(dir, { recursive: true });
    await writeFileAtomic(path, bytes);
  }
  return { sha, mime };
}

/** Metadata sidecar aset foto `<dataDir>/assets/meta/<sha>.json`. */
export type AssetMeta = {
  ref: string;
  provider: string;
  sourcePageUrl: string;
  downloadUrl: string;
  creator: string;
  creatorUrl?: string;
  license: string;
  licenseUrl?: string;
  attribution: string;
  width: number;
  height: number;
  bytes: number;
  mime: string;
  importedAt: string;
  /** Warna rata-rata foto (placeholder render aset jarak jauh). */
  avgColor?: string;
  /**
   * Aset jarak jauh (Unsplash, hotlink resmi): tanpa byte di `assets/`; `url` = URL gambar dari API (ixid dipertahankan),
   * disajikan lewat cache render `<dataDir>/cache/remote-images/`.
   */
  remote?: { provider: 'unsplash'; url: string; downloadLocation: string };
  /** `download_location` yang sudah dipicu, sekali per dokumen. */
  downloads?: { docId: string; at: string }[];
  /** `download_location` yang gagal (pesan tersanitasi, tanpa key). */
  downloadErrors?: { docId: string; at: string; error: string }[];
};

/** PNG RGB 8-bit `w`×`h` satu warna (placeholder aset jarak jauh saat cache dingin + jaringan gagal). */
export function solidPng(w: number, h: number, rgb: readonly [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [...rgb]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export const assetMetaPath = (dataDir: string, sha: string) => join(dataDir, 'assets', 'meta', `${sha}.json`);

/** Tulis metadata sidecar (atomik). */
export async function writeAssetMeta(dataDir: string, sha: string, meta: AssetMeta): Promise<string> {
  if (!ASSET_ID_PATTERN.test(sha)) throw new Error('sha aset tidak valid');
  await mkdir(join(dataDir, 'assets', 'meta'), { recursive: true });
  const path = assetMetaPath(dataDir, sha);
  await writeFileAtomic(path, `${JSON.stringify(meta, null, 2)}\n`);
  return path;
}

/** Baca metadata sidecar aset, atau undefined (hash tidak valid / tidak ada / rusak). */
export async function readAssetMeta(dataDir: string, sha: string): Promise<AssetMeta | undefined> {
  if (!ASSET_ID_PATTERN.test(sha)) return undefined;
  try {
    return JSON.parse(await readFile(assetMetaPath(dataDir, sha), 'utf8')) as AssetMeta;
  } catch {
    return undefined;
  }
}

/** Ukuran piksel raster dari header (PNG/GIF/JPEG/WebP), atau undefined. */
export function imageSize(buf: Uint8Array): { width: number; height: number } | undefined {
  const type = rasterType(buf);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const ok = (w: number, h: number) => (w > 0 && h > 0 ? { width: w, height: h } : undefined);
  try {
    if (type === 'image/png') return buf.length >= 24 ? ok(dv.getUint32(16), dv.getUint32(20)) : undefined;
    if (type === 'image/gif') return buf.length >= 10 ? ok(dv.getUint16(6, true), dv.getUint16(8, true)) : undefined;
    if (type === 'image/webp') {
      const chunk = String.fromCharCode(...buf.subarray(12, 16));
      if (chunk === 'VP8X' && buf.length >= 30) return ok(1 + (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16)), 1 + (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16)));
      if (chunk === 'VP8 ' && buf.length >= 30) return ok(dv.getUint16(26, true) & 0x3fff, dv.getUint16(28, true) & 0x3fff);
      if (chunk === 'VP8L' && buf.length >= 25) {
        const b = dv.getUint32(21, true);
        return ok((b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1);
      }
      return undefined;
    }
    if (type === 'image/jpeg') {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) {
          i++;
          continue;
        }
        const marker = buf[i + 1]!;
        if (marker === 0xff) {
          i++;
          continue;
        }
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          i += 2;
          continue;
        }
        const len = dv.getUint16(i + 2);
        // SOF0..SOF15 kecuali DHT (C4), JPG (C8), DAC (CC).
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return ok(dv.getUint16(i + 7), dv.getUint16(i + 5));
        if (marker === 0xda || marker === 0xd9) return undefined;
        i += 2 + len;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}
