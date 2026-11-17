// Artefak run pen.dev: salinan `.pen` eksklusif (byte, tanpa membaca isi) dan ukuran PNG dari IHDR.
import { closeSync, constants, copyFileSync, existsSync, openSync, readSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

/** Tujuan harus di bawah `runsRoot` dan belum ada. Murni: keberadaan file diberikan pemanggil. */
export function assertSafeDestination(dest: string, runsRoot: string, exists: boolean): void {
  const rel = relative(resolve(runsRoot), resolve(dest));
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`tujuan ${dest} berada di luar ${runsRoot}`);
  if (exists) throw new Error(`tujuan ${dest} sudah ada; tidak ditimpa`);
}

/** Salin byte `src` → `dest` dengan COPYFILE_EXCL setelah lolos assertSafeDestination. */
export function copyExclusive(src: string, dest: string, runsRoot: string): void {
  assertSafeDestination(dest, runsRoot, existsSync(dest));
  copyFileSync(src, dest, constants.COPYFILE_EXCL);
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Lebar/tinggi dari 24 byte pertama PNG (signature + chunk IHDR). */
export function readPngSize(head: Uint8Array): { width: number; height: number } {
  const b = Buffer.from(head.buffer, head.byteOffset, head.byteLength);
  if (b.length < 24 || !b.subarray(0, 8).equals(PNG_SIG)) throw new Error('bukan PNG (signature)');
  if (b.toString('ascii', 12, 16) !== 'IHDR') throw new Error('bukan PNG (chunk pertama bukan IHDR)');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

export function readPngSizeFile(path: string): { width: number; height: number } {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(24);
    const n = readSync(fd, buf, 0, 24, 0);
    return readPngSize(buf.subarray(0, n));
  } finally {
    closeSync(fd);
  }
}
