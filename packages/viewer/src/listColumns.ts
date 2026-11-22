// Isi kolom Last agent dan Checks di List view Dashboard (aplikasi 11). Fungsi murni, diuji di listColumns.test.ts.
import { harnessColor, harnessLabel, VIEWER_CLIENT } from './activity.js';

export type LastAgentView = { label: string; initial: string; kind: 'user' | 'agent' | 'codex' };
export type CheckView = { text: string; tone: 'success' | 'warning' | 'danger' };

/** Penulis terakhir: edit dari aplikasi = "You" (avatar pengguna); agen = label harness + huruf awal (Codex = X). */
export function lastAgentView(client: string | undefined): LastAgentView | undefined {
  if (!client) return undefined;
  if (client === VIEWER_CLIENT) return { label: 'You', initial: 'Y', kind: 'user' };
  const label = harnessLabel(client);
  const kind = harnessColor(client);
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
