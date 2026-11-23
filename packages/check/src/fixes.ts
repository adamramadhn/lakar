// Autofix temuan check (spec-check-autofix): pembangun patch yang dipakai aturan, lalu perencanaan penerapan
// (`planFixes`) dan cek basi (`staleFixes`) yang dipakai daemon (`fix_check`). Murni; arah spine check → schema.
import {
  COMPONENT_SIZES,
  SPACING_VALUES,
  TYPE_SCALE,
  type DocOp,
  type Finding,
  type FindingFix,
  type G0RuleId,
  type ResolvedDocument,
} from '@lakar/schema';

export const update = (id: string, patch: Record<string, unknown>): DocOp => ({ op: 'update', id, patch });
export const remove = (id: string): DocOp => ({ op: 'remove', id });

/** Satu fix berlabel dengan satu `update`. */
export const patchFix = (label: string, id: string, patch: Record<string, unknown>): FindingFix => ({ label, ops: [update(id, patch)] });

/** Nilai terdekat di `values`; seri → yang lebih besar (spacing lebih lega, teks lebih besar). */
export function nearestOf(values: Iterable<number>, v: number): number {
  let best: number | undefined;
  for (const x of values) {
    if (best === undefined || Math.abs(x - v) < Math.abs(best - v) || (Math.abs(x - v) === Math.abs(best - v) && x > best)) best = x;
  }
  return best ?? v;
}

/** Line-height token skala untuk `size` (token pertama berukuran sama); tidak ada → undefined. */
export function scaleLineHeight(size: number): number | undefined {
  return Object.values(TYPE_SCALE).find((t) => t.size === size)?.lineHeight;
}

/** Nilai spacing terdekat (LC-07). */
export const snapSpacing = (v: number): number => nearestOf(SPACING_VALUES, v);
/** Ukuran komponen terdekat (token spacing atau ukuran komponen, LC-07). */
export const snapComponent = (v: number): number => nearestOf([...SPACING_VALUES, ...COMPONENT_SIZES], v);

/**
 * Padding (number | [v,h] | [t,r,b,l]) dengan setiap sisi dipetakan `f(nilai, sisi)`; bentuk disederhanakan ke angka
 * bila keempat sisi sama. Sisi: 0 atas, 1 kanan, 2 bawah, 3 kiri.
 */
export function mapPadding(p: number | readonly number[] | undefined, f: (v: number, side: 0 | 1 | 2 | 3) => number): number | number[] {
  const raw = p ?? 0;
  const [t, r, b, l] = typeof raw === 'number' ? [raw, raw, raw, raw] : raw.length === 2 ? [raw[0]!, raw[1]!, raw[0]!, raw[1]!] : [raw[0]!, raw[1]!, raw[2]!, raw[3]!];
  const out = [f(t, 0), f(r, 1), f(b, 2), f(l, 3)];
  return out.every((x) => x === out[0]) ? out[0]! : out;
}

// ---------------------------------------------------------------------------
// Perencanaan penerapan
// ---------------------------------------------------------------------------

export type FixKind = 'fix' | 'suggestion';
/** Fix yang akan/telah diterapkan untuk satu temuan. */
export type PlannedFix = { rule: G0RuleId; nodeId: string; nodeName: string; kind: FixKind; label: string; ops: DocOp[] };
/** Alasan fix tidak diterapkan: bentrok dengan fix sebelumnya, target berubah sejak check, properti terikat token, atau ditolak op core. */
export type FixSkipReason = 'conflict' | 'stale' | 'token' | 'invalid';
export type SkippedFix = PlannedFix & { reason: FixSkipReason; detail?: string };

export type PlanOptions = {
  /** Hanya temuan aturan ini (mis. `['LC-30']`); kosong/tanpa = semua aturan. */
  codes?: readonly string[] | undefined;
  /** Temuan tanpa fix aman → terapkan saran pertamanya. Default false. */
  suggestions?: boolean | undefined;
};

/** Kunci yang disentuh op: `id:kunci` untuk update, `id:*` untuk remove. */
function touches(op: DocOp): { id: string; keys: string[] | '*' } | undefined {
  if (op.op === 'update') return { id: op.id, keys: Object.keys(op.patch) };
  if (op.op === 'remove') return { id: op.id, keys: '*' };
  return undefined;
}

/**
 * Pilih fix per temuan (urutan temuan): fix aman, atau saran pertama bila `suggestions`. Fix yang menyentuh properti
 * atau node yang sudah disentuh fix sebelumnya dilewati (`conflict`): satu nilai per properti, tanpa update pada node
 * yang dihapus. Temuan sama (aturan + node + op identik) hanya sekali.
 */
export function planFixes(findings: readonly Finding[], opts: PlanOptions = {}): { planned: PlannedFix[]; skipped: SkippedFix[] } {
  const codes = opts.codes?.length ? new Set(opts.codes) : undefined;
  const planned: PlannedFix[] = [];
  const skipped: SkippedFix[] = [];
  const keys = new Set<string>();
  const removed = new Set<string>();
  const touchedIds = new Set<string>();
  const seen = new Set<string>();
  for (const f of findings) {
    if (codes && !codes.has(f.rule)) continue;
    const pick = f.fix ? { kind: 'fix' as const, fix: f.fix } : opts.suggestions && f.suggestions?.length ? { kind: 'suggestion' as const, fix: f.suggestions[0]! } : undefined;
    if (!pick || !pick.fix.ops.length) continue;
    const item: PlannedFix = { rule: f.rule, nodeId: f.nodeId, nodeName: f.nodeName, kind: pick.kind, label: pick.fix.label, ops: pick.fix.ops };
    const sig = `${f.rule}|${f.nodeId}|${JSON.stringify(item.ops)}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    const ts = item.ops.map(touches);
    const clash = ts.some((t) => {
      if (!t) return true;
      if (removed.has(t.id)) return true;
      if (t.keys === '*') return touchedIds.has(t.id);
      return t.keys.some((k) => keys.has(`${t.id}:${k}`));
    });
    if (clash) {
      skipped.push({ ...item, reason: 'conflict', detail: 'another fix in this run already changes the same property or node' });
      continue;
    }
    for (const t of ts) {
      if (!t) continue;
      touchedIds.add(t.id);
      if (t.keys === '*') removed.add(t.id);
      else for (const k of t.keys) keys.add(`${t.id}:${k}`);
    }
    planned.push(item);
  }
  return { planned, skipped };
}

type AnyNode = { id: string; children?: readonly AnyNode[] } & Record<string, unknown>;

/** Indeks node ter-resolve (board + keturunan, termasuk isi instance beralamat komposit) per ID → ID board-nya. */
export function resolvedIndex(doc: ResolvedDocument): Map<string, { node: AnyNode; boardId: string }> {
  const out = new Map<string, { node: AnyNode; boardId: string }>();
  for (const p of doc.pages) {
    for (const b of p.children) {
      const walk = (n: AnyNode) => {
        if (!out.has(n.id)) out.set(n.id, { node: n, boardId: b.id });
        for (const c of n.children ?? []) walk(c);
      };
      walk(b as unknown as AnyNode);
    }
  }
  return out;
}

/**
 * Fix basi (review 33-1). Fix dihitung dari tata letak SELURUH board (tinggi pas LC-12 dari semua seksi, LC-29 dari
 * size, LC-30 dari family), bukan hanya properti yang di-patch. Jadi bila dokumen berubah sejak check, setiap fix yang
 * targetnya ada di board yang berubah (JSON ter-resolve berbeda, termasuk perubahan token) atau sudah tidak ada →
 * `stale`. Board lain tetap segar. Dokumen sama (rev sama) → tidak ada yang basi.
 */
export function staleFixes(items: readonly PlannedFix[], base: ResolvedDocument, current: ResolvedDocument): { fresh: PlannedFix[]; stale: SkippedFix[] } {
  if (base === current) return { fresh: [...items], stale: [] };
  const before = resolvedIndex(base);
  const now = resolvedIndex(current);
  const boardJson = (doc: ResolvedDocument) => new Map(doc.pages.flatMap((p) => p.children).map((b) => [b.id, JSON.stringify(b)]));
  const oldBoards = boardJson(base);
  const newBoards = boardJson(current);
  const fresh: PlannedFix[] = [];
  const stale: SkippedFix[] = [];
  for (const it of items) {
    const bad = it.ops.find((op) => {
      const t = touches(op);
      if (!t) return true;
      const a = before.get(t.id);
      const b = now.get(t.id);
      if (!a || !b || a.boardId !== b.boardId) return true;
      return oldBoards.get(a.boardId) !== newBoards.get(a.boardId);
    });
    if (bad) stale.push({ ...it, reason: 'stale', detail: `board of ${touches(bad)?.id ?? '?'} changed since the check` });
    else fresh.push(it);
  }
  return { fresh, stale };
}

/** Kunci temuan untuk membandingkan sebelum/sesudah: aturan + node (+ detail tidak dipakai: angka bisa berubah). */
export const findingKey = (f: Pick<Finding, 'rule' | 'nodeId'>): string => `${f.rule}|${f.nodeId}`;

/**
 * Klasifikasi autofix per aturan (tabel spec-check-autofix): `safe` = hanya fix aman, `suggestion` = hanya saran,
 * `mixed` = fix aman untuk sebagian kasus + saran untuk sisanya (LC-12), `none` = tanpa data fix (butuh penilaian
 * desain atau konten). Tes memastikan temuan tidak membawa jenis fix di luar kelasnya.
 */
export const AUTOFIX: Readonly<Record<G0RuleId, 'safe' | 'suggestion' | 'mixed' | 'none'>> = {
  'LC-01a': 'suggestion',
  'LC-01b': 'suggestion',
  'LC-02a': 'none',
  'LC-02b': 'none',
  'LC-02c': 'none',
  'LC-03': 'suggestion',
  'LC-04': 'none',
  'LC-05': 'suggestion',
  'LC-06': 'suggestion',
  'LC-07': 'suggestion',
  'LC-08': 'suggestion',
  'LC-09': 'none',
  'LC-10': 'suggestion',
  'LC-11': 'none',
  'LC-12': 'mixed',
  'LC-13': 'none',
  'LC-14': 'suggestion',
  'LC-15': 'none',
  'LC-16': 'none',
  'LC-17': 'none',
  'LC-18': 'none',
  'LC-19': 'none',
  'LC-20': 'none',
  'LC-21': 'suggestion',
  'LC-22': 'none',
  'LC-23': 'suggestion',
  'LC-24': 'none',
  'LC-25': 'suggestion',
  'LC-26': 'none',
  'LC-27': 'none',
  'LC-28': 'suggestion',
  'LC-29': 'safe',
  'LC-30': 'mixed',
  'LC-31': 'none',
  'LC-32': 'none',
  'LC-33': 'none',
  'LC-34': 'none',
  'LC-35': 'suggestion',
};
