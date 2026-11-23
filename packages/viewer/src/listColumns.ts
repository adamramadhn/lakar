// Isi kolom Last agent dan Checks di List view Dashboard (aplikasi 11). Fungsi murni, diuji di listColumns.test.ts.
import { harnessColor, harnessLabel, VIEWER_CLIENT, whoOf } from './activity.js';

export type LastAgentView = { label: string; initial: string; kind: 'user' | 'agent' | 'codex' };
export type CheckView = { text: string; tone: 'success' | 'warning' | 'danger' };

/**
 * Penulis terakhir: edit dari aplikasi = "You" (avatar pengguna); agen = label harness + huruf awal (Codex = X).
 * `agent` (harness dari `x-lakar-agent`) didahulukan atas `client` (`lakar-mcp` → "MCP agent"). Warnanya tetap
 * warna harness, bukan warna sesi: penulis terakhir bisa sesi yang sudah berakhir (spec-agent-identity-history).
 */
export function lastAgentView(client: string | undefined, agent?: string): LastAgentView | undefined {
  if (!client && !agent) return undefined;
  if (client === VIEWER_CLIENT) return { label: 'You', initial: 'Y', kind: 'user' };
  const who = whoOf({ client, agent });
  const label = harnessLabel(who);
  const kind = harnessColor(who);
  return { label, initial: kind === 'codex' ? 'X' : (label.trim()[0] ?? 'A').toUpperCase(), kind };
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Status check: error lebih penting dari warning; tanpa temuan = "Passed". */
export function checkView(check: { error: number; warning: number } | undefined): CheckView | undefined {
  if (!check) return undefined;
  if (check.error > 0) return { text: count(check.error, 'error'), tone: 'danger' };
  if (check.warning > 0) return { text: count(check.warning, 'warning'), tone: 'warning' };
  return { text: 'Passed', tone: 'success' };
}
