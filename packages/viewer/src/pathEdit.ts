// Model edit titik path (epic paste-vektor story 5, AD-14): `d` diurai saat edit menjadi anchor + segmen, lalu ditulis
// kembali sebagai `d` (`serializePath`). Murni (tanpa DOM, tanpa IO). Segmen hanya `L` dan `C`: `Q` dinaikkan ke kubik
// secara eksak dan `A` diubah ke kubik (`flattenArcs`) saat model dibuat. Koordinat model = ruang `viewBox`.
import { flattenArcs, parsePath, pathBounds, serializePath, type PathSeg } from '@lakar/render';
import type { DocOp } from '@lakar/schema';

export type Pt = { x: number; y: number };
export type Seg = { k: 'L' } | { k: 'C'; c1: Pt; c2: Pt };
/**
 * Subpath: `segs[i]` menghubungkan `pts[i]` ke `pts[i+1]`; pada subpath tertutup segmen terakhir kembali ke `pts[0]`
 * (`segs.length === pts.length`), terbuka `pts.length - 1`. `explicitClose` = sumber menulis titik awal lagi sebelum
 * `Z` (`L p0 Z`), dipertahankan saat ditulis ulang.
 */
export type Sub = { pts: Pt[]; segs: Seg[]; closed: boolean; explicitClose?: boolean };
export type PathModel = Sub[];
/** Alamat anchor: subpath `s`, indeks titik `i`. */
export type AnchorRef = { s: number; i: number };
export type PointType = 'corner' | 'smooth' | 'mirrored';
export const POINT_TYPES: readonly PointType[] = ['corner', 'smooth', 'mirrored'];

/** Titik berimpit (penggabungan titik tutup, handle terlipat). */
const EPS = 1e-6;
const same = (a: Pt, b: Pt, eps = EPS) => Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
const sub2 = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add2 = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const len = (a: Pt) => Math.hypot(a.x, a.y);
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const unit = (a: Pt): Pt | undefined => {
  const l = len(a);
  return l > EPS ? { x: a.x / l, y: a.y / l } : undefined;
};
export const refKey = (r: AnchorRef) => `${r.s}:${r.i}`;
export const sameRef = (a: AnchorRef, b: AnchorRef) => a.s === b.s && a.i === b.i;

const clone = (m: PathModel): PathModel =>
  m.map((s) => ({ ...s, pts: s.pts.map((p) => ({ ...p })), segs: s.segs.map((g) => (g.k === 'C' ? { k: 'C', c1: { ...g.c1 }, c2: { ...g.c2 } } : { k: 'L' })) }));

/** `d` → model. `d` tidak sah → PathDataError dari `parsePath`. */
export function modelFromD(d: string): PathModel {
  const segs = flattenArcs(parsePath(d));
  const out: PathModel = [];
  let cur: Sub | undefined;
  let start: Pt = { x: 0, y: 0 };
  const last = (): Pt => (cur ? cur.pts[cur.pts.length - 1]! : start);
  const ensure = () => {
    // Perintah gambar sesudah Z tanpa M: subpath baru dari titik awal subpath sebelumnya (aturan SVG).
    if (!cur || cur.closed) {
      cur = { pts: [{ ...start }], segs: [], closed: false };
      out.push(cur);
    }
    return cur;
  };
  for (const s of segs) {
    switch (s.cmd) {
      case 'M':
        start = { x: s.args[0], y: s.args[1] };
        cur = { pts: [{ ...start }], segs: [], closed: false };
        out.push(cur);
        break;
      case 'L': {
        const c = ensure();
        c.pts.push({ x: s.args[0], y: s.args[1] });
        c.segs.push({ k: 'L' });
        break;
      }
      case 'C': {
        const c = ensure();
        c.segs.push({ k: 'C', c1: { x: s.args[0], y: s.args[1] }, c2: { x: s.args[2], y: s.args[3] } });
        c.pts.push({ x: s.args[4], y: s.args[5] });
        break;
      }
      case 'Q': {
        // Elevasi derajat eksak: C1 = P0 + ⅔(Q − P0), C2 = P + ⅔(Q − P).
        const c = ensure();
        const p0 = last();
        const q = { x: s.args[0], y: s.args[1] };
        const p = { x: s.args[2], y: s.args[3] };
        c.segs.push({ k: 'C', c1: lerp(p0, q, 2 / 3), c2: lerp(p, q, 2 / 3) });
        c.pts.push(p);
        break;
      }
      case 'Z': {
        if (!cur || cur.closed) break;
        const n = cur.pts.length;
        if (n > 1 && same(cur.pts[n - 1]!, cur.pts[0]!)) {
          cur.pts.pop();
          cur.explicitClose = true;
        } else cur.segs.push({ k: 'L' });
        cur.closed = true;
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** Model → segmen absolut. */
export function modelSegs(m: PathModel): PathSeg[] {
  const out: PathSeg[] = [];
  for (const s of m) {
    if (!s.pts.length) continue;
    out.push({ cmd: 'M', args: [s.pts[0]!.x, s.pts[0]!.y] });
    const n = s.pts.length;
    s.segs.forEach((g, i) => {
      const to = s.pts[(i + 1) % n]!;
      const closing = s.closed && i === n - 1;
      if (g.k === 'C') out.push({ cmd: 'C', args: [g.c1.x, g.c1.y, g.c2.x, g.c2.y, to.x, to.y] });
      else if (!closing || s.explicitClose) out.push({ cmd: 'L', args: [to.x, to.y] });
    });
    if (s.closed) out.push({ cmd: 'Z', args: [] });
  }
  return out;
}

export const serializeModel = (m: PathModel): string => serializePath(modelSegs(m));

/** Jumlah anchor seluruh path. */
export const anchorCount = (m: PathModel) => m.reduce((n, s) => n + s.pts.length, 0);
export function allRefs(m: PathModel): AnchorRef[] {
  return m.flatMap((s, si) => s.pts.map((_, i) => ({ s: si, i })));
}
export const validRef = (m: PathModel, r: AnchorRef) => r.s >= 0 && r.s < m.length && r.i >= 0 && r.i < m[r.s]!.pts.length;

/** Indeks segmen masuk/keluar anchor (undefined = ujung subpath terbuka). */
function inIndex(s: Sub, i: number): number | undefined {
  if (i > 0) return i - 1;
  return s.closed ? s.segs.length - 1 : undefined;
}
const outIndex = (s: Sub, i: number): number | undefined => (i < s.segs.length ? i : undefined);

export type Handles = { in?: Pt | undefined; out?: Pt | undefined };
/** Handle kubik di sisi anchor; yang berimpit dengan anchor tidak dihitung. */
export function handlesOf(m: PathModel, r: AnchorRef): Handles {
  const s = m[r.s]!;
  const p = s.pts[r.i]!;
  const ii = inIndex(s, r.i);
  const oi = outIndex(s, r.i);
  const gi = ii !== undefined ? s.segs[ii] : undefined;
  const go = oi !== undefined ? s.segs[oi] : undefined;
  const h: Handles = {};
  if (gi?.k === 'C' && !same(gi.c2, p, 1e-4)) h.in = gi.c2;
  if (go?.k === 'C' && !same(go.c1, p, 1e-4)) h.out = go.c1;
  return h;
}

/** Tipe titik turunan dari handle (segaris berlawanan ≤1°, panjang sama ≤1%). */
export function pointType(m: PathModel, r: AnchorRef): PointType {
  const p = m[r.s]!.pts[r.i]!;
  const h = handlesOf(m, r);
  if (!h.in || !h.out) return 'corner';
  const a = sub2(h.in, p);
  const b = sub2(h.out, p);
  const la = len(a);
  const lb = len(b);
  const cos = (a.x * b.x + a.y * b.y) / (la * lb);
  if (cos > -Math.cos(Math.PI / 180)) return 'corner';
  return Math.abs(la - lb) <= 0.01 * Math.max(la, lb) ? 'mirrored' : 'smooth';
}

/** Geser anchor `refs` sebesar (dx, dy) di ruang viewBox; handle ikut. */
export function moveAnchors(m: PathModel, refs: readonly AnchorRef[], dx: number, dy: number): PathModel {
  const out = clone(m);
  const d = { x: dx, y: dy };
  for (const r of refs) {
    if (!validRef(out, r)) continue;
    const s = out[r.s]!;
    s.pts[r.i] = add2(s.pts[r.i]!, d);
    const ii = inIndex(s, r.i);
    const oi = outIndex(s, r.i);
    const gi = ii !== undefined ? s.segs[ii] : undefined;
    const go = oi !== undefined ? s.segs[oi] : undefined;
    if (gi?.k === 'C') gi.c2 = add2(gi.c2, d);
    if (go?.k === 'C') go.c1 = add2(go.c1, d);
  }
  return out;
}

/** Tetapkan handle `side` anchor ke `to`; mirrored/smooth menyesuaikan handle lawan kecuali `free`. */
export function moveHandle(m: PathModel, r: AnchorRef, side: 'in' | 'out', to: Pt, free = false): PathModel {
  if (!validRef(m, r)) return m;
  const type = pointType(m, r);
  const out = clone(m);
  const s = out[r.s]!;
  const p = s.pts[r.i]!;
  const ii = inIndex(s, r.i);
  const oi = outIndex(s, r.i);
  const gi = ii !== undefined ? s.segs[ii] : undefined;
  const go = oi !== undefined ? s.segs[oi] : undefined;
  const mine = side === 'in' ? gi : go;
  const other = side === 'in' ? go : gi;
  if (mine?.k !== 'C') return m;
  if (side === 'in') mine.c2 = { ...to };
  else mine.c1 = { ...to };
  if (!free && other?.k === 'C' && type !== 'corner') {
    const otherPt = side === 'in' ? other.c1 : other.c2;
    const dir = unit(sub2(p, to));
    if (dir) {
      const l = type === 'mirrored' ? len(sub2(to, p)) : len(sub2(otherPt, p));
      const next = add2(p, mul(dir, l));
      if (side === 'in') other.c1 = next;
      else other.c2 = next;
    }
  }
  return out;
}

/** Segmen `L` → `C` dengan handle terlipat ke ujungnya. */
function toCubic(s: Sub, gi: number): Extract<Seg, { k: 'C' }> {
  const g = s.segs[gi]!;
  if (g.k === 'C') return g;
  const n = s.pts.length;
  const c: Extract<Seg, { k: 'C' }> = { k: 'C', c1: { ...s.pts[gi]! }, c2: { ...s.pts[(gi + 1) % n]! } };
  s.segs[gi] = c;
  return c;
}

/** Kubik yang kedua handle-nya terlipat ke ujung → `L`. */
function collapseLines(s: Sub) {
  const n = s.pts.length;
  s.segs = s.segs.map((g, i) => (g.k === 'C' && same(g.c1, s.pts[i]!, 1e-4) && same(g.c2, s.pts[(i + 1) % n]!, 1e-4) ? { k: 'L' } : g));
}

/** Ubah tipe titik `refs`. */
export function setPointType(m: PathModel, refs: readonly AnchorRef[], type: PointType): PathModel {
  let cur = m;
  for (const r of refs) if (validRef(cur, r)) cur = setOne(cur, r, type);
  return cur;
}

function setOne(m: PathModel, r: AnchorRef, type: PointType): PathModel {
  const out = clone(m);
  const s = out[r.s]!;
  const n = s.pts.length;
  const p = s.pts[r.i]!;
  const ii = inIndex(s, r.i);
  const oi = outIndex(s, r.i);
  if (type === 'corner') {
    if (ii !== undefined && s.segs[ii]!.k === 'C') (s.segs[ii] as Extract<Seg, { k: 'C' }>).c2 = { ...p };
    if (oi !== undefined && s.segs[oi]!.k === 'C') (s.segs[oi] as Extract<Seg, { k: 'C' }>).c1 = { ...p };
    collapseLines(s);
    return out;
  }
  if (ii === undefined && oi === undefined) return m;
  const h = handlesOf(m, r);
  const prev = ii !== undefined ? s.pts[(r.i - 1 + n) % n]! : undefined;
  const next = oi !== undefined ? s.pts[(r.i + 1) % n]! : undefined;
  // Arah tangen: handle yang ada (keluar − masuk), atau tetangga (next − prev).
  let dir = h.in && h.out ? unit(sub2(h.out, h.in)) : h.out ? unit(sub2(h.out, p)) : h.in ? unit(sub2(p, h.in)) : undefined;
  dir ??= unit(sub2(next ?? p, prev ?? p));
  if (!dir) return m;
  const third = (q: Pt | undefined) => (q ? len(sub2(q, p)) / 3 : 0);
  let li = h.in ? len(sub2(h.in, p)) : third(prev);
  let lo = h.out ? len(sub2(h.out, p)) : third(next);
  if (li <= EPS) li = lo;
  if (lo <= EPS) lo = li;
  if (type === 'mirrored') li = lo = (li + lo) / 2;
  if (ii !== undefined) toCubic(s, ii).c2 = add2(p, mul(dir, -li));
  if (oi !== undefined) toCubic(s, oi).c1 = add2(p, mul(dir, lo));
  return out;
}

/**
 * Hapus anchor `refs`. Segmen masuk + keluar digabung (kubik bila salah satunya kubik, handle luar dipertahankan).
 * Subpath dengan < 2 titik dibuang. Semua habis → model kosong (pemanggil menghapus node).
 */
export function deletePoints(m: PathModel, refs: readonly AnchorRef[]): PathModel {
  const out = clone(m);
  const bySub = new Map<number, number[]>();
  for (const r of refs) if (validRef(out, r)) bySub.set(r.s, [...(bySub.get(r.s) ?? []), r.i]);
  for (const [si, list] of bySub) {
    const s = out[si]!;
    for (const i of [...new Set(list)].sort((a, b) => b - a)) removeAnchor(s, i);
  }
  // Subpath yang tersentuh dan tersisa < 2 titik dibuang; subpath lain (termasuk `M` tunggal sumber) tetap.
  return out.filter((s, si) => !bySub.has(si) || s.pts.length >= 2);
}

function removeAnchor(s: Sub, i: number) {
  const n = s.pts.length;
  const ii = inIndex(s, i);
  const oi = outIndex(s, i);
  if (ii === undefined || oi === undefined) {
    // Ujung subpath terbuka: buang titik dan satu segmennya.
    s.pts.splice(i, 1);
    if (ii !== undefined) s.segs.splice(ii, 1);
    else if (oi !== undefined) s.segs.splice(oi, 1);
    return;
  }
  const gi = s.segs[ii]!;
  const go = s.segs[oi]!;
  const prev = s.pts[(i - 1 + n) % n]!;
  const next = s.pts[(i + 1) % n]!;
  const merged: Seg = gi.k === 'C' || go.k === 'C' ? { k: 'C', c1: gi.k === 'C' ? gi.c1 : { ...prev }, c2: go.k === 'C' ? go.c2 : { ...next } } : { k: 'L' };
  s.pts.splice(i, 1);
  if (i === 0) {
    // Tertutup, titik 0: segmen masuk = segmen terakhir, keluar = segmen 0.
    s.segs.splice(0, 1);
    s.segs[s.segs.length - 1] = merged;
  } else {
    s.segs.splice(ii, 2, merged);
  }
  if (s.closed && s.pts.length < 2) s.segs = [];
}

/** Titik bisa dibuka: punya segmen keluar. */
export const canOpenAt = (m: PathModel, r: AnchorRef) => validRef(m, r) && outIndex(m[r.s]!, r.i) !== undefined;

/**
 * Buka path di anchor `r`: segmen keluar dari titik itu dibuang. Tertutup → terbuka mulai titik berikutnya sampai
 * `r`; terbuka → dipecah dua (subpath < 2 titik dibuang). Tidak bisa → model sama.
 */
export function openAt(m: PathModel, r: AnchorRef): PathModel {
  if (!canOpenAt(m, r)) return m;
  const out = clone(m);
  const s = out[r.s]!;
  const n = s.pts.length;
  let parts: Sub[];
  if (s.closed) {
    const order = Array.from({ length: n }, (_, k) => (r.i + 1 + k) % n);
    parts = [{ pts: order.map((k) => s.pts[k]!), segs: order.slice(0, -1).map((k) => s.segs[k]!), closed: false }];
  } else {
    parts = [
      { pts: s.pts.slice(0, r.i + 1), segs: s.segs.slice(0, r.i), closed: false },
      { pts: s.pts.slice(r.i + 1), segs: s.segs.slice(r.i + 1), closed: false },
    ];
  }
  out.splice(r.s, 1, ...parts.filter((p) => p.pts.length >= 2));
  return out;
}

/** Titik pada segmen `gi` subpath `s` di parameter t. */
export function segPoint(s: Sub, gi: number, t: number): Pt {
  const a = s.pts[gi]!;
  const b = s.pts[(gi + 1) % s.pts.length]!;
  const g = s.segs[gi]!;
  if (g.k === 'L') return lerp(a, b, t);
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * g.c1.x + 3 * u * t * t * g.c2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * g.c1.y + 3 * u * t * t * g.c2.y + t * t * t * b.y,
  };
}

/** Sisip anchor di segmen `gi` subpath `si` pada t (de Casteljau); mengembalikan model + alamat titik baru. */
export function insertPoint(m: PathModel, si: number, gi: number, t: number): { model: PathModel; ref: AnchorRef } {
  const out = clone(m);
  const s = out[si]!;
  const a = s.pts[gi]!;
  const b = s.pts[(gi + 1) % s.pts.length]!;
  const g = s.segs[gi]!;
  const at = gi + 1;
  if (g.k === 'L') {
    s.pts.splice(at, 0, lerp(a, b, t));
    s.segs.splice(gi, 1, { k: 'L' }, { k: 'L' });
  } else {
    const p01 = lerp(a, g.c1, t);
    const p12 = lerp(g.c1, g.c2, t);
    const p23 = lerp(g.c2, b, t);
    const p012 = lerp(p01, p12, t);
    const p123 = lerp(p12, p23, t);
    const mid = lerp(p012, p123, t);
    s.pts.splice(at, 0, mid);
    s.segs.splice(gi, 1, { k: 'C', c1: p01, c2: p012 }, { k: 'C', c1: p123, c2: p23 });
  }
  return { model: out, ref: { s: si, i: at } };
}

export type SegmentHit = { s: number; seg: number; t: number; at: Pt; dist: number };
/** Segmen terdekat dari `p` (ruang layar lewat `toScreen`) dalam `tol` px; 24 sampel per segmen. */
export function hitSegment(m: PathModel, toScreen: (q: Pt) => Pt, p: Pt, tol: number): SegmentHit | undefined {
  let best: SegmentHit | undefined;
  const N = 24;
  m.forEach((s, si) => {
    s.segs.forEach((_, gi) => {
      let prev = toScreen(segPoint(s, gi, 0));
      for (let k = 1; k <= N; k++) {
        const t1 = k / N;
        const cur = toScreen(segPoint(s, gi, t1));
        // Jarak titik ke ruas sampel.
        const d = sub2(cur, prev);
        const l2 = d.x * d.x + d.y * d.y;
        const u = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - prev.x) * d.x + (p.y - prev.y) * d.y) / l2)) : 0;
        const q = add2(prev, mul(d, u));
        const dist = len(sub2(p, q));
        if (dist <= tol && (!best || dist < best.dist)) {
          const t = (k - 1 + u) / N;
          best = { s: si, seg: gi, t, at: q, dist };
        }
        prev = cur;
      }
    });
  });
  return best;
}

/** Bentuk node path minimum untuk `editPatch`. */
export type PathLike = { d: string; viewBox: readonly [number, number, number, number]; width?: unknown; height?: unknown; x?: unknown; y?: unknown };
export type ViewBox = [number, number, number, number];
const r4 = (n: number) => +n.toFixed(4);

/**
 * Patch `update` sesudah edit (AD-14): `d` baru; bila titik keluar dari viewBox, viewBox diperluas ke gabungan dan
 * `width`/`height` angka (serta `x`/`y` angka bila `absolute`) diskalakan dengan skala tampil `box` supaya bentuk
 * tetap di tempatnya. Model kosong → undefined (pemanggil menghapus node).
 */
export function editPatch(node: PathLike, model: PathModel, box: { w: number; h: number }, absolute: boolean): Record<string, unknown> | undefined {
  const segs = modelSegs(model);
  if (!segs.some((s) => s.cmd !== 'M' && s.cmd !== 'Z')) return undefined;
  const d = serializePath(segs);
  const patch: Record<string, unknown> = { d };
  const b = pathBounds(segs);
  const [vx, vy, vw, vh] = node.viewBox;
  if (!b) return patch;
  const minX = Math.min(vx, b[0]);
  const minY = Math.min(vy, b[1]);
  const maxX = Math.max(vx + vw, b[0] + b[2]);
  const maxY = Math.max(vy + vh, b[1] + b[3]);
  const tol = 1e-3;
  if (minX >= vx - tol && minY >= vy - tol && maxX <= vx + vw + tol && maxY <= vy + vh + tol) return patch;
  const nv: ViewBox = [r4(minX), r4(minY), r4(maxX - minX), r4(maxY - minY)];
  patch.viewBox = nv;
  const sx = vw > 0 ? box.w / vw : 1;
  const sy = vh > 0 ? box.h / vh : 1;
  if (typeof node.width === 'number' && nv[2] !== vw) patch.width = r4(nv[2] * sx);
  if (typeof node.height === 'number' && nv[3] !== vh) patch.height = r4(nv[3] * sy);
  if (absolute && typeof node.x === 'number' && nv[0] !== vx) patch.x = r4(node.x + (nv[0] - vx) * sx);
  if (absolute && typeof node.y === 'number' && nv[1] !== vy) patch.y = r4(node.y + (nv[1] - vy) * sy);
  return patch;
}

/** Titik pen: anchor + handle keluar opsional (masuk = cerminannya). */
export type PenPoint = { p: Pt; out?: Pt | undefined };

/** Model dari titik pen (koordinat board). */
export function penModel(points: readonly PenPoint[], closed: boolean): PathModel {
  const n = points.length;
  const inOf = (q: PenPoint): Pt | undefined => (q.out ? sub2(mul(q.p, 2), q.out) : undefined);
  const seg = (a: PenPoint, b: PenPoint): Seg => {
    const c1 = a.out;
    const c2 = inOf(b);
    return c1 || c2 ? { k: 'C', c1: { ...(c1 ?? a.p) }, c2: { ...(c2 ?? b.p) } } : { k: 'L' };
  };
  const segs: Seg[] = [];
  for (let i = 0; i + 1 < n; i++) segs.push(seg(points[i]!, points[i + 1]!));
  if (closed && n > 1) segs.push(seg(points[n - 1]!, points[0]!));
  return [{ pts: points.map((q) => ({ ...q.p })), segs, closed: closed && n > 1 }];
}

/**
 * NodeInput path dari titik pen (koordinat board): x/y = floor kotak, width/height = ceil (min 1), `d` digeser ke
 * origin node. Desain "Path Drawn": stroke #111111 2px, ujung dan sambungan bulat. < 2 titik → undefined.
 */
export function penNode(points: readonly PenPoint[], closed: boolean): Record<string, unknown> | undefined {
  if (points.length < 2) return undefined;
  const model = penModel(points, closed);
  const b = pathBounds(modelSegs(model))!;
  const x = Math.floor(b[0]);
  const y = Math.floor(b[1]);
  const width = Math.max(1, Math.ceil(b[0] + b[2] - x));
  const height = Math.max(1, Math.ceil(b[1] + b[3] - y));
  const shifted = model.map((s) => ({
    ...s,
    pts: s.pts.map((p) => ({ x: p.x - x, y: p.y - y })),
    segs: s.segs.map((g): Seg => (g.k === 'C' ? { k: 'C', c1: { x: g.c1.x - x, y: g.c1.y - y }, c2: { x: g.c2.x - x, y: g.c2.y - y } } : g)),
  }));
  return {
    type: 'path',
    name: 'Path',
    position: 'absolute',
    x,
    y,
    width,
    height,
    d: serializeModel(shifted),
    viewBox: [0, 0, width, height],
    stroke: { color: '#111111', width: 2, align: 'center' },
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
}

/** Pemetaan ruang viewBox ↔ halaman untuk kotak node `box` (viewBox dipetakan non-uniform ke kotak). */
export function viewMapping(viewBox: readonly [number, number, number, number], box: { x: number; y: number; w: number; h: number }) {
  const [vx, vy, vw, vh] = viewBox;
  // Kotak tampil 0 (path tanpa luas) → skala 1, bukan pembagian dengan nol.
  const sx = vw > 0 && box.w > 0 ? box.w / vw : 1;
  const sy = vh > 0 && box.h > 0 ? box.h / vh : 1;
  return {
    sx,
    sy,
    toPage: (p: Pt): Pt => ({ x: box.x + (p.x - vx) * sx, y: box.y + (p.y - vy) * sy }),
    fromPage: (p: Pt): Pt => ({ x: vx + (p.x - box.x) / sx, y: vy + (p.y - box.y) / sy }),
  };
}

const rotated = (n: Record<string, unknown>) => typeof n.rotation === 'number' && n.rotation % 360 !== 0;

/**
 * Path bisa diedit titiknya: node `path` dengan `d` sah, tanpa rotasi pada node maupun leluhurnya (`ancestors` =
 * board → parent). Geometri live berupa kotak tegak, jadi pemetaan viewBox salah di bawah rotasi.
 */
export function pathEditable(node: Record<string, unknown> | undefined, ancestors: readonly Record<string, unknown>[] = []): boolean {
  if (!node || node.type !== 'path' || typeof node.d !== 'string' || !Array.isArray(node.viewBox)) return false;
  if (rotated(node) || ancestors.some(rotated)) return false;
  try {
    modelFromD(node.d);
    return true;
  } catch {
    return false;
  }
}

/** Posisi titik di panel Point: px relatif kotak node (viewBox dipetakan ke ukuran tampil), 2 desimal. */
export function panelXY(p: Pt, viewBox: readonly [number, number, number, number], scale: { sx: number; sy: number }): Pt {
  return { x: +((p.x - viewBox[0]) * scale.sx).toFixed(2), y: +((p.y - viewBox[1]) * scale.sy).toFixed(2) };
}

/** Δ ruang viewBox supaya titik `p` tampil di panel pada `x`/`y` (undefined = sumbu itu tetap). */
export function panelDelta(p: Pt, viewBox: readonly [number, number, number, number], scale: { sx: number; sy: number }, x?: number, y?: number): Pt {
  return { x: x === undefined ? 0 : x / scale.sx - (p.x - viewBox[0]), y: y === undefined ? 0 : y / scale.sy - (p.y - viewBox[1]) };
}

/**
 * Op satu aksi edit titik (AD-7): `update` dengan `editPatch`, `remove` bila model kosong, null bila tidak ada
 * perubahan (hasil sama dengan model `before`; `d` sumber yang belum dinormalisasi tidak ditulis ulang tanpa edit).
 */
export function pathEditOps(node: PathLike & { id: string }, before: PathModel, next: PathModel, box: { w: number; h: number }, absolute: boolean): DocOp[] | null {
  const patch = editPatch(node, next, box, absolute);
  if (!patch) return [{ op: 'remove', id: node.id }];
  if (Object.keys(patch).length === 1 && patch.d === serializeModel(before)) return null;
  return [{ op: 'update', id: node.id, patch }];
}
