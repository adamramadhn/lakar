// Model panel Design (editor-canvas story 5): kelompok properti per tipe node, nilai gabungan seleksi ("Mixed"), dan
// pembangun op `update` untuk route ops viewer (AD-7). Murni: masukan = node tersimpan (ref token utuh) + pasangan
// ter-resolve (AD-10); keluaran = DocOp[] tanpa op untuk node yang nilainya tidak berubah. Patch hanya memakai
// properti skema v3 (AD-1, AD-13); `null` menghapus properti opsional (core `update`).
import type { DocOp } from '@lakar/schema';
import { isTokenRef, joinHex, round2, sameValue, splitHex, withHex } from './designValues.js';

export type Raw = Record<string, unknown>;
export type ParentLayout = 'row' | 'column' | 'none';

/** Satu node terpilih untuk panel Design. */
export type DesignTarget = {
  id: string;
  type: string;
  name: string;
  /** Node tersimpan (ref `{$token}` utuh). */
  stored: Raw;
  /** Node yang sama dari `resolveDocument` (nilai token mode aktif); sama dengan `stored` bila tidak tersedia. */
  resolved: Raw;
  /** Layout induk; undefined untuk board. */
  parentLayout: ParentLayout | undefined;
  /** Ukuran terukur DOM live (koordinat desain). */
  measured?: { w: number; h: number } | undefined;
};

export type Group = 'position' | 'autoLayout' | 'typography' | 'icon' | 'fill' | 'stroke' | 'radius' | 'effects';

/** Kelompok per tipe (urutan tampil). Teks tidak punya fills/stroke di skema, jadi kelompok itu tidak tampil. */
const GROUPS: Record<string, readonly Group[]> = {
  board: ['position', 'fill'],
  frame: ['position', 'autoLayout', 'fill', 'stroke', 'radius', 'effects'],
  rect: ['position', 'fill', 'stroke', 'radius', 'effects'],
  ellipse: ['position', 'fill', 'stroke', 'effects'],
  path: ['position', 'fill', 'stroke', 'effects'],
  text: ['position', 'typography', 'effects'],
  icon: ['position', 'icon', 'effects'],
};
const ORDER: readonly Group[] = ['position', 'autoLayout', 'typography', 'icon', 'fill', 'stroke', 'radius', 'effects'];

/** Kelompok yang berlaku untuk semua node terpilih. */
export function designGroups(targets: readonly DesignTarget[]): Group[] {
  if (targets.length === 0) return [];
  return ORDER.filter((g) => targets.every((t) => (GROUPS[t.type] ?? []).includes(g)));
}

export type FieldState = { mixed: true } | { mixed: false; value: unknown; resolved: unknown };

/** Nilai gabungan: sama di semua node → nilai tersimpan + resolve (node pertama); beda → mixed. */
export function readField(targets: readonly DesignTarget[], get: (n: Raw) => unknown): FieldState {
  const first = targets[0];
  if (!first) return { mixed: false, value: undefined, resolved: undefined };
  const v = get(first.stored);
  if (targets.some((t) => !sameValue(get(t.stored), v))) return { mixed: true };
  return { mixed: false, value: v, resolved: get(first.resolved) };
}

/**
 * Nilai baru dari kolom sama dengan nilai resolve sebuah ref token → tidak ada perubahan (ref dipertahankan);
 * selain itu nilai baru (literal, detach AD-11).
 */
export function keepsToken(state: FieldState, next: unknown): boolean {
  return !state.mixed && isTokenRef(state.value) && sameValue(state.resolved, next);
}

export type Patch = Record<string, unknown>;

/** Op `update` per node dari `patchFor`; kunci yang nilainya sudah sama dilewati, node tanpa perubahan tanpa op. */
export function opsFor(targets: readonly DesignTarget[], patchFor: (t: DesignTarget) => Patch | undefined): DocOp[] {
  const ops: DocOp[] = [];
  for (const t of targets) {
    const raw = patchFor(t);
    if (!raw) continue;
    const patch: Patch = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v === undefined) continue;
      const cur = t.stored[k];
      if (v === null ? cur === undefined : sameValue(cur, v)) continue;
      patch[k] = v;
    }
    if (Object.keys(patch).length) ops.push({ op: 'update', id: t.id, patch });
  }
  return ops;
}

/** Satu properti sama untuk semua node. */
export const setProp = (targets: readonly DesignTarget[], key: string, value: unknown): DocOp[] => opsFor(targets, () => ({ [key]: value }));

/** Deskripsi entri History: `Change width` / `Change width on 3 layers`. */
export const describeEdit = (label: string, n: number) => (n > 1 ? `${label} on ${n} layers` : label);

// ---------------------------------------------------------------------------
// Posisi & ukuran
// ---------------------------------------------------------------------------

export type Sizing = 'fixed' | 'hug' | 'fill';
export type Axis = 'width' | 'height';

/** Mode sizing nilai tersimpan; ketiadaan = hug (render layout.ts: ukuran konten sendiri), kecuali board (selalu angka). */
export function sizingMode(type: string, v: unknown): Sizing {
  if (v === 'hug' || v === 'fill') return v;
  if (v === undefined && type !== 'board') return 'hug';
  return 'fixed';
}

/** Mode sizing gabungan seleksi (undefined = campuran). */
export function readSizing(targets: readonly DesignTarget[], axis: Axis): Sizing | undefined {
  const modes = new Set(targets.map((t) => sizingMode(t.type, t.stored[axis])));
  return modes.size === 1 ? [...modes][0] : undefined;
}

/** Ganti mode sizing: hug/fill langsung; fixed = ukuran terukur dibulatkan (angka tersimpan tetap). */
export function setSizing(targets: readonly DesignTarget[], axis: Axis, mode: Sizing): DocOp[] {
  return opsFor(targets, (t) => {
    if (mode !== 'fixed') return { [axis]: mode };
    const cur = t.stored[axis];
    if (typeof cur === 'number' || isTokenRef(cur)) return undefined;
    const m = t.measured?.[axis === 'width' ? 'w' : 'h'];
    return m === undefined ? undefined : { [axis]: Math.max(0, Math.round(m)) };
  });
}

/**
 * Layout induk untuk `DesignTarget.parentLayout`, sejajar dengan core `implicitAbsolute` dan render layout.ts: board
 * = kolom (anak flow), frame tanpa `layout`/`none` = none (anak absolute), row/column apa adanya; node board → undefined.
 */
export function parentLayoutOf(type: string, parent: Raw | undefined): ParentLayout | undefined {
  if (type === 'board') return undefined;
  if (parent?.type === 'board') return 'column';
  return parent?.layout === 'row' || parent?.layout === 'column' ? parent.layout : 'none';
}

/** X/Y bisa diedit: board, node absolute, atau anak frame `none` (core menambah `position` lewat implicitAbsolute). */
export const canEditXY = (t: DesignTarget) => t.type === 'board' || t.stored.position === 'absolute' || t.parentLayout === 'none';

// ---------------------------------------------------------------------------
// Auto layout
// ---------------------------------------------------------------------------

/** Arah layout tersimpan (ketiadaan = none). */
export const layoutOf = (n: Raw) => (n.layout === 'row' || n.layout === 'column' ? n.layout : 'none');

export const setLayout = (targets: readonly DesignTarget[], layout: ParentLayout | null) => setProp(targets, 'layout', layout);

// ---------------------------------------------------------------------------
// Fill
// ---------------------------------------------------------------------------

export type FillLike = Raw & { type?: unknown };
export type FillRow = { index: number; fill: FillLike; resolved: FillLike };
export const FILL_DEFAULT = '#D9D9D9';

const fillsOf = (n: Raw): FillLike[] => (Array.isArray(n.fills) ? (n.fills as FillLike[]) : []);

/** Baris fill urut tampil: atas = lapisan teratas = indeks terakhir (render: `fills[0]` paling bawah). */
export function fillRows(t: DesignTarget): FillRow[] {
  const s = fillsOf(t.stored);
  const r = fillsOf(t.resolved);
  return s.map((fill, index) => ({ index, fill, resolved: r[index] ?? fill })).reverse();
}

const withFills = (fills: FillLike[]): Patch => ({ fills: fills.length ? fills : null });

export const addFill = (targets: readonly DesignTarget[]) =>
  opsFor(targets, (t) => withFills([...fillsOf(t.stored), { type: 'solid', color: FILL_DEFAULT }]));

export const removeFill = (targets: readonly DesignTarget[], index: number) =>
  opsFor(targets, (t) => withFills(fillsOf(t.stored).filter((_, i) => i !== index)));

/** Pindah fill indeks `from` ke indeks `to` (indeks array tersimpan). */
export function moveFill(targets: readonly DesignTarget[], from: number, to: number): DocOp[] {
  return opsFor(targets, (t) => {
    const f = [...fillsOf(t.stored)];
    if (from === to || from < 0 || from >= f.length || to < 0 || to >= f.length) return undefined;
    const [x] = f.splice(from, 1);
    f.splice(to, 0, x!);
    return { fills: f };
  });
}

/** Ganti fill indeks `index` lewat `edit(fill, resolved)`. */
export function editFill(targets: readonly DesignTarget[], index: number, edit: (fill: FillLike, resolved: FillLike) => FillLike | undefined): DocOp[] {
  return opsFor(targets, (t) => {
    const s = fillsOf(t.stored);
    const fill = s[index];
    if (!fill) return undefined;
    const next = edit(fill, fillsOf(t.resolved)[index] ?? fill);
    if (!next) return undefined;
    return { fills: s.map((f, i) => (i === index ? next : f)) };
  });
}

/** Seleksi dengan fills berbeda: ganti semuanya dengan satu solid (baris "Mixed"). */
export const setAllFills = (targets: readonly DesignTarget[], fills: FillLike[] | null) => opsFor(targets, () => ({ fills }));

/** Warna solid baru dari teks hex: alpha lama dipertahankan (dari nilai resolve bila tersimpan sebagai token). */
export function solidColor(fill: FillLike, resolved: FillLike, hexText: string): FillLike | undefined {
  if (fill.type !== 'solid') return undefined;
  const next = withHex(resolved.color, hexText);
  return next.startsWith('#') && splitHex(next) ? { ...fill, color: next } : undefined;
}

/** Alpha solid (0–1) pada warna resolve. */
export function solidAlpha(fill: FillLike, resolved: FillLike, alpha: number): FillLike | undefined {
  const c = splitHex(resolved.color);
  if (fill.type !== 'solid' || !c) return undefined;
  return { ...fill, color: joinHex(c.hex, alpha) };
}

export type PaintKind = 'solid' | 'linear' | 'radial';
type Stop = { offset: number; color: unknown };

/** Konversi jenis fill dengan mempertahankan warna: solid → gradien (warna → warna transparan), gradien → solid (stop pertama). */
export function convertFill(fill: FillLike, resolved: FillLike, kind: PaintKind): FillLike | undefined {
  if (fill.type === kind) return undefined;
  const stops = (Array.isArray(fill.stops) ? fill.stops : undefined) as Stop[] | undefined;
  if (kind === 'solid') {
    if (!stops?.length) return undefined;
    return { type: 'solid', color: stops[0]!.color };
  }
  let nextStops = stops;
  if (!nextStops) {
    if (fill.type !== 'solid') return undefined;
    const c = splitHex(resolved.color);
    nextStops = [
      { offset: 0, color: fill.color },
      { offset: 1, color: c ? joinHex(c.hex, 0) : '#00000000' },
    ];
  }
  return kind === 'linear' ? { type: 'linear', angle: typeof fill.angle === 'number' ? fill.angle : 180, stops: nextStops } : { type: 'radial', stops: nextStops };
}

/** Ubah satu stop gradien: warna (teks hex, alpha dipertahankan) dan/atau offset 0–1 (di-clamp). */
export function editStop(fill: FillLike, resolved: FillLike, k: number, change: { hex?: string; offset?: number }): FillLike | undefined {
  const stops = Array.isArray(fill.stops) ? (fill.stops as Stop[]) : undefined;
  const rs = Array.isArray(resolved.stops) ? (resolved.stops as Stop[]) : stops;
  const stop = stops?.[k];
  if (!stops || !stop) return undefined;
  const next: Stop = { ...stop };
  if (change.hex !== undefined) {
    const c = withHex(rs?.[k]?.color, change.hex);
    if (!splitHex(c)) return undefined;
    next.color = c;
  }
  if (change.offset !== undefined) next.offset = round2(Math.min(1, Math.max(0, change.offset)));
  return { ...fill, stops: stops.map((s, i) => (i === k ? next : s)) };
}

// ---------------------------------------------------------------------------
// Stroke
// ---------------------------------------------------------------------------

export const SIDES = ['top', 'right', 'bottom', 'left'] as const;
export type Side = (typeof SIDES)[number];
export const STROKE_DEFAULT = { color: '#000000', width: 1, align: 'inside' } as const;

export const addStroke = (targets: readonly DesignTarget[]) =>
  opsFor(targets, (t) => (t.stored.stroke ? undefined : { stroke: { ...STROKE_DEFAULT } }));

export const removeStroke = (targets: readonly DesignTarget[]) => setProp(targets, 'stroke', null);

/** Gabungkan perubahan ke stroke tiap node (node tanpa stroke mendapat default + perubahan). */
export function setStroke(targets: readonly DesignTarget[], change: Raw): DocOp[] {
  return opsFor(targets, (t) => ({ stroke: { ...((t.stored.stroke as Raw | undefined) ?? STROKE_DEFAULT), ...change } }));
}

/** Warna stroke baru dari teks hex (alpha dipertahankan). */
export function strokeColor(targets: readonly DesignTarget[], hexText: string): DocOp[] {
  return opsFor(targets, (t) => {
    const s = t.stored.stroke as Raw | undefined;
    if (!s) return undefined;
    const c = withHex((t.resolved.stroke as Raw | undefined)?.color, hexText);
    return splitHex(c) ? { stroke: { ...s, color: c } } : undefined;
  });
}

/** Sisi aktif stroke (ketiadaan `sides` = semua). */
export const strokeSides = (stroke: unknown): Side[] => {
  const s = (stroke as Raw | undefined)?.sides;
  return Array.isArray(s) ? SIDES.filter((x) => s.includes(x)) : [...SIDES];
};

/**
 * Nyala/matikan satu sisi; sisi terakhir tidak bisa dimatikan; semua sisi aktif → `sides` dihapus. Sisi baru dihitung
 * dari node primer (terakhir) lalu dipasang ke semua node, sehingga seleksi bersisi campuran menyatu.
 */
export function toggleSide(targets: readonly DesignTarget[], side: Side): DocOp[] {
  const primary = targets[targets.length - 1]?.stored.stroke;
  const cur = strokeSides(primary);
  const next = cur.includes(side) ? cur.filter((x) => x !== side) : SIDES.filter((x) => x === side || cur.includes(x));
  if (next.length === 0) return [];
  return opsFor(targets, (t) => {
    const s = t.stored.stroke as Raw | undefined;
    if (!s) return undefined;
    const { sides: _drop, ...rest } = s;
    return { stroke: next.length === SIDES.length ? rest : { ...rest, sides: next } };
  });
}

// ---------------------------------------------------------------------------
// Radius
// ---------------------------------------------------------------------------

export const CORNERS = ['TL', 'TR', 'BR', 'BL'] as const;

/** Radius tersimpan → 4 sudut (TL, TR, BR, BL); ketiadaan = 0. */
export function radiusCorners(v: unknown): unknown[] {
  if (Array.isArray(v) && v.length === 4) return [...v];
  return [v ?? 0, v ?? 0, v ?? 0, v ?? 0];
}

/** Nilai kolom All: angka/token tunggal, atau tuple yang keempat sudutnya sama. */
export function radiusAll(v: unknown): { mixed: true } | { mixed: false; value: unknown } {
  const c = radiusCorners(v);
  return c.every((x) => sameValue(x, c[0])) ? { mixed: false, value: c[0] } : { mixed: true };
}

export const setRadiusAll = (targets: readonly DesignTarget[], value: unknown) => setProp(targets, 'radius', value);

/** Ubah satu sudut: radius tiap node jadi tuple 4. */
export function setRadiusCorner(targets: readonly DesignTarget[], corner: number, value: unknown): DocOp[] {
  return opsFor(targets, (t) => {
    const c = radiusCorners(t.stored.radius);
    c[corner] = value;
    return { radius: c };
  });
}

// ---------------------------------------------------------------------------
// Efek: shadow
// ---------------------------------------------------------------------------

export const SHADOW_DEFAULT = { type: 'drop', x: 0, y: 4, blur: 12, color: '#00000033' } as const;
const shadowsOf = (n: Raw): Raw[] => (Array.isArray(n.shadows) ? (n.shadows as Raw[]) : []);
const withShadows = (s: Raw[]): Patch => ({ shadows: s.length ? s : null });

export const addShadow = (targets: readonly DesignTarget[]) => opsFor(targets, (t) => withShadows([...shadowsOf(t.stored), { ...SHADOW_DEFAULT }]));
export const removeShadow = (targets: readonly DesignTarget[], index: number) =>
  opsFor(targets, (t) => withShadows(shadowsOf(t.stored).filter((_, i) => i !== index)));

/** Ubah shadow indeks `index` lewat `edit(shadow, resolved)`. */
export function editShadow(targets: readonly DesignTarget[], index: number, edit: (s: Raw, resolved: Raw) => Raw | undefined): DocOp[] {
  return opsFor(targets, (t) => {
    const all = shadowsOf(t.stored);
    const s = all[index];
    if (!s) return undefined;
    const next = edit(s, shadowsOf(t.resolved)[index] ?? s);
    return next ? { shadows: all.map((x, i) => (i === index ? next : x)) } : undefined;
  });
}
