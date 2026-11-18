// Probe Chromium Lakar untuk tes (bukan bagian dist paket mana pun): tes yang butuh Chromium asli memakai ini
// untuk `describe.skipIf`. Default path sama dengan daemon `config.ts` (C9: cache browser khusus Lakar).
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** `LAKAR_BROWSERS_PATH` atau `~/.cache/lakar/ms-playwright`. */
export const DEFAULT_BROWSERS_PATH = process.env.LAKAR_BROWSERS_PATH || join(homedir(), '.cache', 'lakar', 'ms-playwright');

/** chromium-headless-shell terpasang lengkap (`INSTALLATION_COMPLETE`) di `browsersPath`. */
export function chromiumInstalled(browsersPath: string = DEFAULT_BROWSERS_PATH): boolean {
  return (
    existsSync(browsersPath) &&
    readdirSync(browsersPath).some((d) => d.startsWith('chromium_headless_shell-') && existsSync(join(browsersPath, d, 'INSTALLATION_COMPLETE')))
  );
}
