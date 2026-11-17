// Konfigurasi lakard dari env LAKAR_* (config.toml menyusul di story 12).
import { homedir } from 'node:os';
import { join } from 'node:path';

/** AD-14: daemon hanya bind ke loopback. Sengaja tidak bisa diubah. */
export const HOST = '127.0.0.1' as const;
export const DEFAULT_PORT = 7466;

export type DaemonConfig = {
  host: typeof HOST;
  port: number;
  dataDir: string;
  browsersPath: string;
  execTimeoutMs: number;
  execMemoryBytes: number;
  renderTimeoutMs: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DaemonConfig {
  const home = homedir();
  const rawPort = env.LAKAR_PORT ?? String(DEFAULT_PORT);
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || port > 65535) {
    throw new Error(`LAKAR_PORT tidak valid: ${JSON.stringify(rawPort)} (harus 0..65535)`);
  }
  return {
    host: HOST,
    port,
    dataDir: env.LAKAR_DATA_DIR || join(home, '.local', 'share', 'lakar'),
    browsersPath: env.LAKAR_BROWSERS_PATH || join(home, '.cache', 'lakar', 'ms-playwright'),
    execTimeoutMs: 2000,
    execMemoryBytes: 64 * 1024 * 1024,
    renderTimeoutMs: 15000,
  };
}
