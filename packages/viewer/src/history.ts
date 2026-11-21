// Logika murni tab History: pengelompokan per hari (Today, Yesterday, tanggal lokal), ketersediaan
// pratinjau/Compare/Restore dari snapshot, pasangan rev Compare, dan board yang berubah antara dua versi
// (per board, bukan diff per node). Tanpa impor relatif supaya bisa dites langsung di Node.

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Label grup hari: Today, Yesterday, atau tanggal lokal; `at` tidak valid → "Unknown date". */
export function dayLabel(at: string, now = new Date()): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return 'Unknown date';
  if (dayKey(d) === dayKey(now)) return 'Today';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(y)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

/** Entri (urut rev turun) dikelompokkan per hari berurutan; urutan entri dipertahankan. */
export function groupByDay<E extends { at: string }>(entries: readonly E[], now = new Date()): { label: string; entries: E[] }[] {
  const out: { label: string; entries: E[] }[] = [];
  for (const e of entries) {
    const label = dayLabel(e.at, now);
    const last = out.at(-1);
    if (last && last.label === label) last.entries.push(e);
    else out.push({ label, entries: [e] });
  }
  return out;
}

/** Bentuk minimum entri riwayat yang dipakai di sini (lihat `HistoryEntry` di api.ts). */
export type RevEntry = { rev: number; at: string; description: string; snapshot?: boolean };

/** Tooltip tombol nonaktif untuk entri tanpa snapshot. */
export const NO_SNAPSHOT = 'No snapshot for this version';

/**
 * Isi versi `entry` bisa dibaca: ada snapshot, atau entri ini rev terkini (dokumen kini = versi itu).
 * Dipakai untuk pratinjau dan Compare (sisi After).
 */
export const hasVersion = (entry: RevEntry, latestRev: number): boolean => entry.snapshot === true || entry.rev === latestRev;

/** Restore hanya untuk versi lama yang punya snapshot (memulihkan rev terkini tidak berarti apa-apa). */
export const canRestore = (entry: RevEntry, latestRev: number): boolean => entry.snapshot === true && entry.rev !== latestRev;

/**
 * Pasangan rev Compare untuk `entry` dalam `entries` (urut rev turun): After = rev entri, Before = entri tepat
 * sebelumnya bila versinya terbaca; tidak ada entri sebelumnya / tanpa snapshot → `before` undefined.
 */
export function comparePair(entries: readonly RevEntry[], entry: RevEntry, latestRev: number): { before?: number; after: number } {
  const older = entries.filter((e) => e.rev < entry.rev).sort((a, b) => b.rev - a.rev)[0];
  return older && hasVersion(older, latestRev) ? { before: older.rev, after: entry.rev } : { after: entry.rev };
}

/** Teks banner pratinjau: `Previewing 14:29 · Tightened headline tracking`. */
export function previewLabel(entry: RevEntry, time: (at: string) => string): string {
  const t = time(entry.at);
  return `Previewing ${t ? `${t} · ` : `r${entry.rev} · `}${entry.description}`;
}

type BoardLike = { id: string; name: string };
type DocLike = { pages: readonly { children: readonly BoardLike[] }[] };
export type BoardChange = { id: string; name: string; change: 'added' | 'removed' | 'changed' };

const boardsOf = (doc: DocLike | undefined) => new Map((doc?.pages ?? []).flatMap((p) => p.children.map((b) => [b.id, b] as const)));

/**
 * Board yang berbeda antara `before` dan `after` (dibandingkan utuh per board, urutan dokumen After lalu
 * board yang dihapus). `before` undefined → semua board After dianggap baru.
 */
export function changedBoards(before: DocLike | undefined, after: DocLike): BoardChange[] {
  const a = boardsOf(after);
  const b = boardsOf(before);
  const out: BoardChange[] = [];
  for (const [id, board] of a) {
    const prev = b.get(id);
    if (!prev) out.push({ id, name: board.name, change: 'added' });
    else if (JSON.stringify(prev) !== JSON.stringify(board)) out.push({ id, name: board.name, change: 'changed' });
  }
  for (const [id, board] of b) if (!a.has(id)) out.push({ id, name: board.name, change: 'removed' });
  return out;
}
