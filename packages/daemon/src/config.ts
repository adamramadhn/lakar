// Konfigurasi lakard: `~/.config/lakar/config.toml` (path `LAKAR_CONFIG`, opsional) + env `LAKAR_*` (env menang).
// TOML yang didukung sengaja datar: `kunci = nilai` (string berkutip atau bilangan bulat), komentar `#`.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** AD-14: daemon hanya bind ke loopback. Sengaja tidak bisa diubah. */
export const HOST = '127.0.0.1' as const;
export const DEFAULT_PORT = 7466;
/** Pool render AD-18: jumlah halaman hangat (default, min, maks). */
export const RENDER_PAGES_DEFAULT = 2;
export const RENDER_PAGES_MIN = 2;
export const RENDER_PAGES_MAX = 8;
export const RENDER_TIMEOUT_DEFAULT_MS = 15000;

export type DaemonConfig = {
  host: typeof HOST;
  port: number;
  dataDir: string;
  browsersPath: string;
  execTimeoutMs: number;
  execMemoryBytes: number;
  /** Batas waktu host per sewa halaman (render + screenshot); antrean dibatasi 2× nilai ini. */
  renderTimeoutMs: number;
  /** Jumlah halaman pool render (2..8). */
  renderPages: number;
  /** File config yang dibaca (undefined bila tidak ada). */
  configPath?: string;
};

/** Kunci config.toml → nama env pengganti. */
const KEYS = {
  port: 'LAKAR_PORT',
  data_dir: 'LAKAR_DATA_DIR',
  browsers_path: 'LAKAR_BROWSERS_PATH',
  render_pages: 'LAKAR_RENDER_PAGES',
  render_timeout_ms: 'LAKAR_RENDER_TIMEOUT_MS',
} as const;
type Key = keyof typeof KEYS;

export const defaultConfigPath = (home = homedir()) => join(home, '.config', 'lakar', 'config.toml');

/** Parser TOML datar: `kunci = "str" | 'str' | 123`. Bagian `[x]`, kunci tak dikenal, atau nilai lain → Error. */
export function parseFlatToml(text: string, file: string): Partial<Record<Key, string>> {
  const out: Partial<Record<Key, string>> = {};
  text.split(/\r?\n/).forEach((raw, i) => {
    const where = `${file}:${i + 1}`;
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const m = /^([A-Za-z0-9_-]+)\s*=\s*(.*)$/.exec(line);
    if (!m) throw new Error(`${where}: baris tidak dikenal ${JSON.stringify(line)} (hanya "kunci = nilai" datar; kunci: ${Object.keys(KEYS).join(', ')})`);
    const key = m[1]!;
    if (!(key in KEYS)) throw new Error(`${where}: kunci tak dikenal ${JSON.stringify(key)} (kunci yang dikenal: ${Object.keys(KEYS).join(', ')})`);
    if (key in out) throw new Error(`${where}: kunci ${key} ditulis dua kali`);
    let rest = m[2]!;
    let value: string;
    const dq = /^"((?:[^"\\]|\\.)*)"\s*(#.*)?$/.exec(rest);
    const sq = /^'([^']*)'\s*(#.*)?$/.exec(rest);
    const int = /^(\d+)\s*(#.*)?$/.exec(rest);
    if (dq) value = JSON.parse(`"${dq[1]}"`) as string;
    else if (sq) value = sq[1]!;
    else if (int) value = int[1]!;
    else throw new Error(`${where}: nilai ${key} tidak valid ${JSON.stringify(rest)} (string berkutip atau bilangan bulat)`);
    out[key as Key] = value;
  });
  return out;
}

function intIn(name: string, raw: string, min: number, max: number): number {
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || n < min || n > max) throw new Error(`${name} tidak valid: ${JSON.stringify(raw)} (harus ${min}..${max})`);
  return n;
}

/**
 * Baca config. `LAKAR_CONFIG` menunjuk file config (bila diset, file wajib ada); default
 * `~/.config/lakar/config.toml` opsional. Nilai salah atau kunci tak dikenal → Error (gagal start yang jelas).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): DaemonConfig {
  const home = homedir();
  const explicit = env.LAKAR_CONFIG;
  const path = explicit || defaultConfigPath(home);
  let file: Partial<Record<Key, string>> = {};
  let configPath: string | undefined;
  if (existsSync(path)) {
    file = parseFlatToml(readFileSync(path, 'utf8'), path);
    configPath = path;
  } else if (explicit) {
    throw new Error(`LAKAR_CONFIG menunjuk file yang tidak ada: ${explicit}`);
  }
  const pick = (key: Key): { name: string; raw: string } | undefined => {
    const fromEnv = env[KEYS[key]];
    if (fromEnv !== undefined && fromEnv !== '') return { name: KEYS[key], raw: fromEnv };
    const fromFile = file[key];
    return fromFile !== undefined ? { name: `${path}: ${key}`, raw: fromFile } : undefined;
  };
  const port = pick('port');
  const pages = pick('render_pages');
  const timeout = pick('render_timeout_ms');
  return {
    host: HOST,
    port: port ? intIn(port.name, port.raw, 0, 65535) : DEFAULT_PORT,
    dataDir: pick('data_dir')?.raw || join(home, '.local', 'share', 'lakar'),
    browsersPath: pick('browsers_path')?.raw || join(home, '.cache', 'lakar', 'ms-playwright'),
    execTimeoutMs: 2000,
    execMemoryBytes: 64 * 1024 * 1024,
    renderTimeoutMs: timeout ? intIn(timeout.name, timeout.raw, 100, 600_000) : RENDER_TIMEOUT_DEFAULT_MS,
    renderPages: pages ? intIn(pages.name, pages.raw, RENDER_PAGES_MIN, RENDER_PAGES_MAX) : RENDER_PAGES_DEFAULT,
    ...(configPath ? { configPath } : {}),
  };
}
