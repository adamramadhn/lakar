// Bacaan sistem untuk putaran: systemd show, hash file/direktori, md5 .pen lama, git HEAD/status (hanya baca),
// ditambah restart lakard (user service) sebelum putaran, mtime terbaru dist (bukti lakard memuat build saat ini), dan
// satu-satunya restart pen-desktop (`restartPenDesktopAfterSeries`, izin Adam: sekali per iterasi/putaran yang
// menjalankan pen.dev, setelah run pen.dev terakhir; dipakai seri practice, seri efek, dan round).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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

/** `systemctl --user restart <unit>` (hanya dipakai untuk lakard; service pen-* tidak lewat sini, lihat `restartPenDesktopAfterSeries`). */
export function restartUserUnit(unit: string): void {
  if (unit.startsWith('pen-')) throw new Error(`restart ${unit} dilarang`);
  execFileSync('systemctl', ['--user', 'restart', unit], { encoding: 'utf8' });
}

export const PEN_DESKTOP_UNIT = 'pen-desktop';
/** Batas tunggu pen-desktop aktif + MCP pencil menjawab sesudah restart (ms). */
export const PEN_DESKTOP_RESTART_TIMEOUT_MS = 120_000;

export type PenDesktopRestart = { ok: boolean; ms: number; detail: string };

export type PenDesktopRestartDeps = {
  /** `systemctl restart pen-desktop` (unit sistem). */
  restart: () => void;
  /** `systemctl is-active pen-desktop`. */
  isActive: () => string;
  /** Satu panggilan baca MCP pencil (mis. `get_app_state`); throw bila gagal. Dibatasi sisa batas waktu (boleh menggantung). */
  probe: () => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  timeoutMs?: number;
};

/**
 * Restart pen-desktop **sesudah** seri pen.dev satu iterasi/putaran selesai (practice, efek, round; izin Adam), lalu tunggu
 * `is-active` dan satu panggilan baca MCP pencil berhasil, maks 120 dtk (+ satu interval tunggu). Probe yang menggantung
 * dipotong sisa batas waktu. Tidak pernah throw: hasil (berhasil/gagal, durasi) dicatat di laporan dan juri tetap jalan.
 * Tidak dipanggil saat `--reuse-pendev`, `--dry-run`, atau tanpa run pen.dev di pemanggilan itu.
 */
export async function restartPenDesktopAfterSeries(deps: PenDesktopRestartDeps): Promise<PenDesktopRestart> {
  const t0 = deps.now();
  const limit = deps.timeoutMs ?? PEN_DESKTOP_RESTART_TIMEOUT_MS;
  const elapsed = () => deps.now() - t0;
  try {
    deps.restart();
  } catch (e) {
    return { ok: false, ms: elapsed(), detail: `systemctl restart ${PEN_DESKTOP_UNIT} gagal: ${errorMessage(e)}` };
  }
  let state = '';
  let lastErr = '';
  while (elapsed() <= limit) {
    state = deps.isActive();
    if (state === 'active') {
      try {
        await withTimeout(deps.probe(), limit - elapsed());
        return { ok: true, ms: elapsed(), detail: `${PEN_DESKTOP_UNIT} active; MCP pencil menjawab panggilan baca` };
      } catch (e) {
        lastErr = errorMessage(e);
      }
    }
    await deps.sleep(2_000);
  }
  return { ok: false, ms: elapsed(), detail: `batas ${Math.round(limit / 1000)} dtk terlewati: is-active ${state || '?'}${lastErr ? `; MCP pencil: ${lastErr}` : ''}` };
}

/**
 * Langkah restart pen-desktop sesudah seri (practice, efek, round): pen.dev dipakai ulang → alasan, tanpa restart;
 * ada run pen.dev di pemanggilan ini → `restart()` sekali, hasil ditulis ke `file`; selain itu hasil tersimpan di
 * `file` dari pemanggilan sebelumnya (`--resume`) atau alasan "tidak ada run pen.dev".
 */
export async function penDesktopRestartStep(o: {
  pendevRan: number;
  reusedFrom?: string | undefined;
  file: string;
  restart: () => Promise<PenDesktopRestart>;
}): Promise<{ result: PenDesktopRestart | string; ran: boolean }> {
  if (o.reusedFrom !== undefined) return { result: `pen.dev dipakai ulang dari ${o.reusedFrom}`, ran: false };
  if (o.pendevRan > 0) {
    const result = await o.restart();
    writeFileSync(o.file, `${JSON.stringify(result, null, 1)}\n`);
    return { result, ran: true };
  }
  let stored: PenDesktopRestart | undefined;
  try {
    stored = existsSync(o.file) ? (JSON.parse(readFileSync(o.file, 'utf8')) as PenDesktopRestart) : undefined;
  } catch {
    stored = undefined;
  }
  return { result: stored ?? 'tidak ada run pen.dev di pemanggilan ini', ran: false };
}

/** `p` atau reject sesudah `ms` (timer dibersihkan; tidak menahan proses). */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`probe tidak menjawab dalam ${Math.max(0, Math.round(ms / 1000))} dtk`)), Math.max(0, ms));
    timer.unref?.();
  });
  p.catch(() => undefined);
  try {
    return await Promise.race([p, limit]);
  } finally {
    clearTimeout(timer);
  }
}

/** Dependensi nyata `restartPenDesktopAfterSeries` (probe disuntikkan pemanggil: klien MCP pencil). */
export function penDesktopRestartDeps(probe: () => Promise<void>): PenDesktopRestartDeps {
  return {
    restart: () => execFileSync('systemctl', ['restart', PEN_DESKTOP_UNIT], { encoding: 'utf8' }),
    isActive: () => isActive(PEN_DESKTOP_UNIT, false),
    probe,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
  };
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
