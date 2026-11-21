// Pengelompokan timeline History per hari (Today, Yesterday, tanggal lokal). Tanpa impor relatif supaya bisa
// dites langsung di Node.

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
