// Matematika snapping, smart guide, dan pengukur jarak (desain bagian 11 "Editor ergonomics & import", layar
// fvbjN/GSpGv/pSUKZ): tepi atau tengah kotak yang digeser/di-resize menempel ke saudara se-parent, kotak parent,
// atau board lain; label jarak hanya untuk kandidat yang ikut snap dan disjoint pada sumbu itu; dan jarak
// Alt+hover antar dua kotak. Murni seperti gesture.ts: tanpa DOM/IO, semua kotak dalam koordinat halaman
// (satuan dokumen). Op commit tidak berubah bentuk — snap hanya menyesuaikan delta/posisi sebelum commit.
import type { Box, GeoNode, Handle } from './gesture.js';

/** Toleransi snap dalam piksel layar; pemanggil membaginya dengan `cam.z` (satuan dokumen). */
export const SNAP_TOLERANCE_PX = 6;

/** Garis smart guide (koordinat halaman): `v` = garis tegak di x=`at` dari y `from` ke `to`; `h` sebaliknya. */
export type Guide = { orientation: 'v' | 'h'; at: number; from: number; to: number };

/** Segmen jarak pada satu sumbu (koordinat halaman): `from`→`to` di sumbu `axis`, digambar pada posisi `at` sumbu lain. */
export type Measure = { axis: 'x' | 'y'; from: number; to: number; at: number; value: number };

/** Hasil snap: penyesuaian posisi (`dx`/`dy`), guide yang tampil, dan label jarak kandidat disjoint yang ikut snap. */
export type Snap = { dx: number; dy: number; guides: Guide[]; gaps: Measure[] };

const AXES = ['x', 'y'] as const;
type Axis = (typeof AXES)[number];

const start = (b: Box, a: Axis) => (a === 'x' ? b.x : b.y);
const span = (b: Box, a: Axis) => (a === 'x' ? b.w : b.h);
const end = (b: Box, a: Axis) => start(b, a) + span(b, a);
const other = (a: Axis): Axis => (a === 'x' ? 'y' : 'x');

/** Titik align sebuah kotak pada `axis`: tepi awal, tengah, tepi akhir (SNAP_CENTER). */
const aligns = (b: Box, a: Axis): readonly number[] => [start(b, a), start(b, a) + span(b, a) / 2, end(b, a)];

/** Penyesuaian terkecil supaya salah satu titik `moving` berhimpit dengan titik align kandidat (≤ `tol`; seri → pertama). */
function snapPoints(moving: readonly number[], targets: readonly Box[], tol: number, axis: Axis): { delta: number; at: number; target: Box } | undefined {
  let best: { delta: number; at: number; target: Box } | undefined;
  for (const t of targets) {
    for (const tp of aligns(t, axis)) {
      for (const mp of moving) {
        const d = tp - mp;
        if (Math.abs(d) <= tol && (best === undefined || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, at: tp, target: t };
      }
    }
  }
  return best;
}

/** Kandidat dengan titik align pada garis `at` (≤ `tol`): ikut memperpanjang guide dan dihitung label jaraknya. */
const alignedTo = (targets: readonly Box[], axis: Axis, at: number, tol: number): Box[] => targets.filter((t) => aligns(t, axis).some((p) => Math.abs(p - at) <= tol));

/** Jarak dua kotak pada satu sumbu; `gap` = kotak disjoint pada sumbu itu (celah, bukan overlap/irisan). */
function axisMeasure(a: Box, b: Box, axis: Axis): { from: number; to: number; at: number; value: number; gap: boolean } {
  // Segmen dari `maxStart` ke `minEnd` (MEASURE): disjoint → celah antar tepi berhadapan, overlap → irisan.
  const i0 = Math.max(start(a, axis), start(b, axis));
  const i1 = Math.min(end(a, axis), end(b, axis));
  // Titik tengah proyeksi tegak lurus; tanpa irisan = titik tengah antar tepi berhadapan (rumus sama).
  const perp = other(axis);
  const at = (Math.max(start(a, perp), start(b, perp)) + Math.min(end(a, perp), end(b, perp))) / 2;
  const from = Math.min(i0, i1);
  const to = Math.max(i0, i1);
  return { from, to, at, value: to - from, gap: i0 > i1 };
}

/** Jarak Alt+hover antar kotak `a` dan `b` per sumbu (MEASURE); hanya sumbu disjoint (`gap`) —
 * overlap/irisan bukan jarak, jadi tidak dilabeli (mis. tinggi yang sama tidak tampil sebagai "jarak"). */
export function measure(a: Box, b: Box): Measure[] {
  const out: Measure[] = [];
  for (const axis of AXES) {
    const m = axisMeasure(a, b, axis);
    if (m.gap && m.value !== 0) out.push({ axis, from: m.from, to: m.to, at: m.at, value: m.value });
  }
  return out;
}

/** Label jarak pada sumbu disjoint antara `moved` dan tiap kandidat yang ikut snap (GAP_LABEL, desain "40"). */
function gapLabels(moved: Box, matched: ReadonlySet<Box>): Measure[] {
  const out: Measure[] = [];
  for (const t of matched) {
    for (const axis of AXES) {
      const m = axisMeasure(moved, t, axis);
      if (m.gap && m.value !== 0) out.push({ axis, from: m.from, to: m.to, at: m.at, value: m.value });
    }
  }
  return out;
}

/** Guide + label dari hasil snap kedua sumbu; `moved` = kotak sesudah penyesuaian. */
function finish(moved: Box, mx: { at: number } | undefined, my: { at: number } | undefined, targets: readonly Box[], tol: number): { guides: Guide[]; gaps: Measure[] } {
  const guides: Guide[] = [];
  const matched = new Set<Box>();
  for (const axis of AXES) {
    const m = axis === 'x' ? mx : my;
    if (!m) continue;
    const aligned = alignedTo(targets, axis, m.at, tol);
    for (const t of aligned) matched.add(t);
    const perp = other(axis);
    const boxes = [moved, ...aligned];
    // Extent guide = union kotak yang bergerak + kandidat yang berhimpit pada garis ini.
    guides.push({
      orientation: axis === 'x' ? 'v' : 'h',
      at: m.at,
      from: Math.min(...boxes.map((b) => start(b, perp))),
      to: Math.max(...boxes.map((b) => end(b, perp))),
    });
  }
  return { guides, gaps: gapLabels(moved, matched) };
}

/**
 * Snap gestur move: `moving` = union box node pada posisi kandidat (sebelum snap). Titik yang dicek per sumbu:
 * tepi awal, tengah, tepi akhir moving × kandidat; |Δ| terkecil ≤ `tol` menang. Tanpa kandidat ≤ tol → dx/dy nol.
 */
export function snapMove(moving: Box, targets: readonly Box[], tol: number): Snap {
  const mx = snapPoints(aligns(moving, 'x'), targets, tol, 'x');
  const my = snapPoints(aligns(moving, 'y'), targets, tol, 'y');
  const dx = mx?.delta ?? 0;
  const dy = my?.delta ?? 0;
  const moved = { ...moving, x: moving.x + dx, y: moving.y + dy };
  return { dx, dy, ...finish(moved, mx, my, targets, tol) };
}

/**
 * Snap gestur resize (SNAP_RESIZE): hanya tepi yang digerakkan handle (`e`/`w` sumbu x, `s`/`n` sumbu y; pojok =
 * dua sumbu) yang menempel ke titik align kandidat. `dx`/`dy` = penyesuaian tepi itu: `e`/`s` menambah `w`/`h`,
 * `w`/`n` menggeser `x`/`y` sekaligus mengurangi `w`/`h`.
 */
export function snapResize(to: Box, handle: Handle, targets: readonly Box[], tol: number): Snap {
  const px = handle.includes('e') ? [end(to, 'x')] : handle.includes('w') ? [start(to, 'x')] : [];
  const py = handle.includes('s') ? [end(to, 'y')] : handle.includes('n') ? [start(to, 'y')] : [];
  const mx = px.length ? snapPoints(px, targets, tol, 'x') : undefined;
  const my = py.length ? snapPoints(py, targets, tol, 'y') : undefined;
  const dx = mx?.delta ?? 0;
  const dy = my?.delta ?? 0;
  const snapped: Box = {
    x: handle.includes('w') ? to.x + dx : to.x,
    y: handle.includes('n') ? to.y + dy : to.y,
    w: to.w + (handle.includes('e') ? dx : 0) - (handle.includes('w') ? dx : 0),
    h: to.h + (handle.includes('s') ? dy : 0) - (handle.includes('n') ? dy : 0),
  };
  return { dx, dy, ...finish(snapped, mx, my, targets, tol) };
}

/**
 * Kandidat snap untuk node `moved` (SNAP_TARGETS): saudara se-parent (bukan node yang digeser/turunannya),
 * kotak parent, dan kotak board; node tingkat halaman (board) → board lain. Seleksi lintas parent = gabungan.
 */
export function snapCandidates(moved: readonly GeoNode[], index: ReadonlyMap<string, GeoNode>): Box[] {
  const movedIds = new Set(moved.map((n) => n.id));
  const seen = new Set<string>();
  const out: Box[] = [];
  const add = (n: GeoNode | undefined) => {
    if (n && !movedIds.has(n.id) && !seen.has(n.id)) {
      seen.add(n.id);
      out.push(n.box);
    }
  };
  for (const n of moved) {
    const parent = n.parentId !== undefined ? index.get(n.parentId) : undefined;
    if (!parent) {
      // Board digeser/di-resize: kandidatnya board lain di halaman.
      for (const g of index.values()) if (g.parentId === undefined) add(g);
      continue;
    }
    add(parent);
    for (const c of parent.children) add(c);
    // Kotak board (akar pohon node ini).
    let root: GeoNode | undefined;
    for (let p = n.parentId; p !== undefined; p = root?.parentId) {
      root = index.get(p);
      if (!root) break;
    }
    add(root);
  }
  return out;
}
