// Bacaan sistem untuk putaran: systemd show, hash file/direktori, md5 .pen lama, git HEAD/status (hanya baca),
// ditambah restart lakard (user service) sebelum putaran dan mtime terbaru dist (bukti lakard memuat build saat ini).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { errorMessage } from '@lakar/schema';
import { REPO_ROOT } from './protocol.js';

export type SystemdInfo = { NRestarts?: string; ActiveEnterTimestamp?: string; MainPID?: string; ActiveState?: string; error?: string };

/** `systemctl [--user] show -p NRestarts,ActiveEnterTimestamp,MainPID,ActiveState <unit>` (hanya baca). */
export function systemdShow(unit: string, user: boolean): SystemdInfo {
  try {
    const out = execFileSync('systemctl', [...(user ? ['--user'] : []), 'show', '-p', 'NRestarts,ActiveEnterTimestamp,MainPID,ActiveState', unit], { encoding: 'utf8' });
    const info: SystemdInfo = {};
    for (const l of out.split('\n')) {
      const i = l.indexOf('=');
      if (i > 0) (info as Record<string, string>)[l.slice(0, i)] = l.slice(i + 1);
    }
    return info;
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

/** `systemctl --user restart <unit>` (hanya dipakai untuk lakard; service pen-* tidak pernah disentuh). */
export function restartUserUnit(unit: string): void {
  if (unit.startsWith('pen-')) throw new Error(`restart ${unit} dilarang`);
  execFileSync('systemctl', ['--user', 'restart', unit], { encoding: 'utf8' });
}

export function isActive(unit: string, user: boolean): string {
  try {
    return execFileSync('systemctl', [...(user ? ['--user'] : []), 'is-active', unit], { encoding: 'utf8' }).trim();
  } catch (e) {
    return String((e as { stdout?: string }).stdout ?? '').trim() || 'unknown';
  }
}

export const sha256 = (b: Uint8Array | string): string => createHash('sha256').update(b).digest('hex');
export const md5 = (b: Uint8Array): string => createHash('md5').update(b).digest('hex');

function walk(dir: string, filter: (path: string) => boolean, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const d of entries) {
    const p = join(dir, d.name);
    if (d.isDirectory()) walk(p, filter, out);
    else if (d.isFile() && filter(p)) out.push(p);
  }
  return out;
}

/** sha256 direktori: sha256 atas baris `<sha256 file>  <path relatif>` terurut. */
export function sha256Dir(dir: string): string {
  const files = walk(dir, () => true).sort();
  return sha256(files.map((f) => `${sha256(readFileSync(f))}  ${relative(dir, f)}`).join('\n'));
}

/** mtime (ms) file terbaru di `dir` (rekursif); undefined bila tidak ada file. */
export function newestMtimeMs(dir: string): number | undefined {
  let max: number | undefined;
  for (const f of walk(dir, () => true)) {
    const m = statSync(f).mtimeMs;
    if (max === undefined || m > max) max = m;
  }
  return max;
}

/** Direktori .pen yang dijaga (md5 sebelum/sesudah putaran). Isi .pen hanya dibaca sebagai byte untuk hash. */
const PEN_GUARD_DIRS = ['/root/.pencil/documents', join(REPO_ROOT, 'design'), '/root/comprice', '/opt/pen'];

/** md5 semua `.pen` di `dirs` (path → md5). */
export function md5PenFiles(dirs: readonly string[] = PEN_GUARD_DIRS): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of dirs) {
    if (!existsSync(d) || !statSync(d).isDirectory()) continue;
    for (const f of walk(d, (p) => p.endsWith('.pen'))) out[f] = md5(readFileSync(f));
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/** Bandingkan md5 sebelum/sesudah: file lama yang berubah atau hilang (file baru diabaikan). */
export function comparePenHashes(before: Record<string, string>, after: Record<string, string>): { changed: string[]; removed: string[]; added: string[] } {
  const changed: string[] = [];
  const removed: string[] = [];
  for (const [p, h] of Object.entries(before)) {
    if (!(p in after)) removed.push(p);
    else if (after[p] !== h) changed.push(p);
  }
  return { changed, removed, added: Object.keys(after).filter((p) => !(p in before)) };
}

export function git(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

/** `git status --porcelain [-- paths]` apa adanya (spasi awal kolom status dipertahankan; hanya newline akhir dibuang). */
export function gitPorcelain(repo: string, paths: readonly string[] = []): string {
  return execFileSync('git', ['-C', repo, 'status', '--porcelain', ...(paths.length ? ['--', ...paths] : [])], { encoding: 'utf8' }).trimEnd();
}
