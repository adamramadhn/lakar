// Artefak run (pen.dev dan Lakar): salinan eksklusif (byte, tanpa membaca isi) di bawah root run.
import { constants, copyFileSync, existsSync } from 'node:fs';
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
