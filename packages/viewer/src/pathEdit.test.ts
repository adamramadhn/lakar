// Model edit titik path (epic paste-vektor story 5): round trip d, operasi titik, perluasan viewBox, dan node pen.
import { describe, expect, it } from 'vitest';
import { flattenArcs, parsePath, type PathSeg } from '@lakar/render';
import {
  canOpenAt,
  deletePoints,
  editPatch,
  handlesOf,
  hitSegment,
  insertPoint,
  modelFromD,
  moveAnchors,
  moveHandle,
  openAt,
  panelDelta,
  panelXY,
  pathEditable,
  pathEditOps,
  penNode,
  pointType,
  segPoint,
  serializeModel,
  setPointType,
  viewMapping,
  type PathModel,
  type Pt,
} from './pathEdit.js';

/** Titik sampel sepanjang path (kubik/garis/kuadratik), untuk membandingkan geometri dua `d`. */
function samples(d: string): [number, number][] {
  const out: [number, number][] = [];
  let cur: [number, number] = [0, 0];
  let start: [number, number] = [0, 0];
  const segs: PathSeg[] = flattenArcs(parsePath(d));
  for (const s of segs) {
    const a = s.args as number[];
    if (s.cmd === 'M') {
      // M ke titik sekarang (subpath sesudah Z tanpa M) tidak menambah sampel.
      const next: [number, number] = [a[0]!, a[1]!];
      if (out.length === 0 || Math.hypot(next[0] - cur[0], next[1] - cur[1]) > 1e-6) out.push(next);
      cur = start = next;
      continue;
    }
    if (s.cmd === 'Z') {
      if (Math.hypot(cur[0] - start[0], cur[1] - start[1]) > 1e-6) for (let k = 1; k <= 8; k++) out.push([cur[0] + ((start[0] - cur[0]) * k) / 8, cur[1] + ((start[1] - cur[1]) * k) / 8]);
      cur = start;
      continue;
    }
    for (let k = 1; k <= 8; k++) {
      const t = k / 8;
      const u = 1 - t;
      if (s.cmd === 'L') out.push([cur[0] + (a[0]! - cur[0]) * t, cur[1] + (a[1]! - cur[1]) * t]);
      else if (s.cmd === 'C')
        out.push([u * u * u * cur[0] + 3 * u * u * t * a[0]! + 3 * u * t * t * a[2]! + t * t * t * a[4]!, u * u * u * cur[1] + 3 * u * u * t * a[1]! + 3 * u * t * t * a[3]! + t * t * t * a[5]!]);
      else if (s.cmd === 'Q') out.push([u * u * cur[0] + 2 * u * t * a[0]! + t * t * a[2]!, u * u * cur[1] + 2 * u * t * a[1]! + t * t * a[3]!]);
    }
    cur = s.cmd === 'C' ? [a[4]!, a[5]!] : s.cmd === 'Q' ? [a[2]!, a[3]!] : [a[0]!, a[1]!];
  }
  return out;
}
const expectSameGeometry = (a: string, b: string) => {
  const sa = samples(a);
  const sb = samples(b);
  expect(sb.length).toBe(sa.length);
  sa.forEach((p, i) => {
    expect(Math.abs(p[0] - sb[i]![0])).toBeLessThan(1e-3);
    expect(Math.abs(p[1] - sb[i]![1])).toBeLessThan(1e-3);
  });
};

describe('round trip d ↔ model', () => {
  it.each([
    'M0 0L10 0L10 10Z',
    'M0 0L10 0L10 10L0 0Z',
    'M2 2h10v10H2z',
    'm1 1 5 5 5-5',
    'M0 0C5 0 10 5 10 10S15 20 20 20',
    'M0 0Q5 10 10 0T20 0',
    'M10.268 21a2 2 0 0 0 3.464 0',
    'M19 1.5a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
    'M0 0L4 0L4 4ZL8 8',
    'M0 0L1 1M5 5L6 6',
  ])('%s', (d) => {
    const out = serializeModel(modelFromD(d));
    expectSameGeometry(d, out);
    // Idempoten: model dari keluaran menulis keluaran yang sama.
    expect(serializeModel(modelFromD(out))).toBe(out);
  });

  it('titik tutup yang sama dengan titik awal digabung, bentuk tulis dipertahankan', () => {
    const m = modelFromD('M0 0L10 0L10 10L0 0Z');
    expect(m[0]!.pts).toHaveLength(3);
    expect(m[0]!.segs).toHaveLength(3);
    expect(serializeModel(m)).toBe('M0 0L10 0L10 10L0 0Z');
    expect(serializeModel(modelFromD('M0 0L10 0L10 10Z'))).toBe('M0 0L10 0L10 10Z');
  });
});

describe('operasi titik', () => {
  const tri = () => modelFromD('M0 0L10 0L10 10Z');

  it('geser anchor membawa handle-nya', () => {
    const m = modelFromD('M0 0C2 0 8 0 10 0');
    const moved = moveAnchors(m, [{ s: 0, i: 1 }], 0, 5);
    expect(serializeModel(moved)).toBe('M0 0C2 0 8 5 10 5');
    // Model asli tidak berubah (murni).
    expect(serializeModel(m)).toBe('M0 0C2 0 8 0 10 0');
  });

  it('tipe titik: corner, smooth, mirrored', () => {
    const m = modelFromD('M0 0C0 5 5 10 10 10C15 10 20 5 20 0');
    expect(pointType(m, { s: 0, i: 1 })).toBe('mirrored');
    expect(pointType(modelFromD('M0 0C0 5 5 10 10 10C20 10 20 5 20 0'), { s: 0, i: 1 })).toBe('smooth');
    expect(pointType(tri(), { s: 0, i: 1 })).toBe('corner');
  });

  it('handle mirrored mencerminkan lawan; smooth meluruskan dengan panjang tetap; Alt bebas', () => {
    const m = modelFromD('M0 0C0 5 5 10 10 10C15 10 20 5 20 0');
    const r = { s: 0, i: 1 };
    const mir = moveHandle(m, r, 'out', { x: 10, y: 14 });
    expect(handlesOf(mir, r).in).toEqual({ x: 10, y: 6 });
    const sm = modelFromD('M0 0C0 5 5 10 10 10C20 10 20 5 20 0');
    const s2 = moveHandle(sm, r, 'in', { x: 10, y: 5 });
    const out = handlesOf(s2, r).out!;
    expect(out.x).toBeCloseTo(10);
    expect(out.y).toBeCloseTo(20);
    const free = moveHandle(m, r, 'out', { x: 10, y: 14 }, true);
    expect(handlesOf(free, r).in).toEqual({ x: 5, y: 10 });
  });

  it('corner melipat handle dan kubik tanpa handle menjadi L', () => {
    const m = modelFromD('M0 0C0 0 5 10 10 10C15 10 20 0 20 0');
    expect(serializeModel(setPointType(m, [{ s: 0, i: 1 }], 'corner'))).toBe('M0 0L10 10L20 0');
  });

  it('mirrored dari titik lurus membuat handle searah tetangga', () => {
    const m = setPointType(modelFromD('M0 0L10 10L20 0'), [{ s: 0, i: 1 }], 'mirrored');
    const h = handlesOf(m, { s: 0, i: 1 });
    expect(h.in!.y).toBeCloseTo(10);
    expect(h.out!.y).toBeCloseTo(10);
    expect(h.out!.x - 10).toBeCloseTo(10 - h.in!.x);
    expect(pointType(m, { s: 0, i: 1 })).toBe('mirrored');
    expect(pointType(setPointType(modelFromD('M0 0L10 10L20 0'), [{ s: 0, i: 1 }], 'smooth'), { s: 0, i: 1 })).not.toBe('corner');
  });

  it('hapus titik: tengah digabung, ujung dibuang, subpath < 2 titik dibuang', () => {
    expect(serializeModel(deletePoints(modelFromD('M0 0L5 5L10 0'), [{ s: 0, i: 1 }]))).toBe('M0 0L10 0');
    expect(serializeModel(deletePoints(modelFromD('M0 0L5 5L10 0'), [{ s: 0, i: 0 }]))).toBe('M5 5L10 0');
    expect(serializeModel(deletePoints(modelFromD('M0 0L5 5L10 0'), [{ s: 0, i: 2 }]))).toBe('M0 0L5 5');
    expect(serializeModel(deletePoints(tri(), [{ s: 0, i: 0 }]))).toBe('M10 0L10 10Z');
    expect(deletePoints(modelFromD('M0 0L5 5'), [{ s: 0, i: 0 }])).toEqual([]);
    // Kubik + garis → kubik dengan handle luar dipertahankan.
    expect(serializeModel(deletePoints(modelFromD('M0 0C0 5 5 5 5 5L10 0'), [{ s: 0, i: 1 }]))).toBe('M0 0C0 5 10 0 10 0');
  });

  it('open path: tertutup jadi terbuka dari titik berikutnya; terbuka dipecah', () => {
    expect(serializeModel(openAt(tri(), { s: 0, i: 0 }))).toBe('M10 0L10 10L0 0');
    expect(serializeModel(openAt(modelFromD('M0 0L5 5L10 0L15 5'), { s: 0, i: 1 }))).toBe('M0 0L5 5M10 0L15 5');
    expect(serializeModel(openAt(modelFromD('M0 0L5 5L10 0'), { s: 0, i: 0 }))).toBe('M5 5L10 0');
    expect(canOpenAt(modelFromD('M0 0L5 5'), { s: 0, i: 1 })).toBe(false);
  });

  it('sisip titik di garis dan kubik tanpa mengubah bentuk', () => {
    const a = insertPoint(modelFromD('M0 0L10 0'), 0, 0, 0.5);
    expect(serializeModel(a.model)).toBe('M0 0L5 0L10 0');
    expect(a.ref).toEqual({ s: 0, i: 1 });
    const c = modelFromD('M0 0C0 10 10 10 10 0');
    const b = insertPoint(c, 0, 0, 0.5);
    expect(b.model[0]!.pts[1]).toEqual(segPoint(c[0]!, 0, 0.5));
    // Bentuk tetap: paruh pertama segmen baru di t sama dengan segmen asli di t/2, paruh kedua di (1+t)/2.
    for (const t of [0.25, 0.5, 0.75]) {
      const p1 = segPoint(b.model[0]!, 0, t);
      const q1 = segPoint(c[0]!, 0, t / 2);
      const p2 = segPoint(b.model[0]!, 1, t);
      const q2 = segPoint(c[0]!, 0, (1 + t) / 2);
      expect(p1.x).toBeCloseTo(q1.x, 9);
      expect(p1.y).toBeCloseTo(q1.y, 9);
      expect(p2.x).toBeCloseTo(q2.x, 9);
      expect(p2.y).toBeCloseTo(q2.y, 9);
    }
  });

  it('hit segmen dalam toleransi layar', () => {
    const m = modelFromD('M0 0L100 0');
    const hit = hitSegment(m, (p: Pt) => p, { x: 50, y: 3 }, 6);
    expect(hit?.seg).toBe(0);
    expect(hit!.t).toBeCloseTo(0.5, 1);
    expect(hitSegment(m, (p: Pt) => p, { x: 50, y: 20 }, 6)).toBeUndefined();
  });
});

describe('editPatch', () => {
  const node = { d: 'M2 2L22 2L22 22Z', viewBox: [0, 0, 24, 24] as const, width: 96, height: 96, x: 10, y: 20 };
  it('titik di dalam viewBox → hanya d', () => {
    const m = moveAnchors(modelFromD(node.d), [{ s: 0, i: 0 }], 1, 1);
    expect(editPatch(node, m, { w: 96, h: 96 }, true)).toEqual({ d: 'M3 3L22 2L22 22Z' });
  });
  it('titik keluar → viewBox diperluas, ukuran dan posisi diskalakan', () => {
    const m = moveAnchors(modelFromD(node.d), [{ s: 0, i: 0 }], -4, 0);
    expect(editPatch(node, m, { w: 96, h: 96 }, true)).toEqual({ d: 'M-2 2L22 2L22 22Z', viewBox: [-2, 0, 26, 24], width: 104, x: 2 });
    // Anak flow: x tidak ditulis; ukuran non-angka tidak diubah.
    expect(editPatch({ ...node, width: 'fill' }, m, { w: 96, h: 96 }, false)).toEqual({ d: 'M-2 2L22 2L22 22Z', viewBox: [-2, 0, 26, 24] });
  });
  it('model kosong → undefined', () => {
    expect(editPatch(node, [] as PathModel, { w: 96, h: 96 }, true)).toBeUndefined();
  });
  it('pemetaan viewBox ↔ halaman', () => {
    const v = viewMapping([0, 0, 24, 24], { x: 100, y: 50, w: 96, h: 48 });
    expect(v.toPage({ x: 12, y: 12 })).toEqual({ x: 148, y: 74 });
    expect(v.fromPage({ x: 148, y: 74 })).toEqual({ x: 12, y: 12 });
  });
});

describe('pathEditOps (op satu aksi edit)', () => {
  const node = { id: 'Pth00001', d: 'M2 2L22 2L22 22Z', viewBox: [0, 0, 24, 24] as const, width: 96, height: 96, x: 10, y: 20 };
  const box = { w: 96, h: 96 };
  it('edit → satu update {d}', () => {
    const m = modelFromD(node.d);
    expect(pathEditOps(node, m, moveAnchors(m, [{ s: 0, i: 0 }], 1, 0), box, true)).toEqual([{ op: 'update', id: 'Pth00001', patch: { d: 'M3 2L22 2L22 22Z' } }]);
  });
  it('semua titik dihapus → remove node', () => {
    const m = modelFromD(node.d);
    expect(pathEditOps(node, m, deletePoints(m, [{ s: 0, i: 0 }, { s: 0, i: 1 }, { s: 0, i: 2 }]), box, true)).toEqual([{ op: 'remove', id: 'Pth00001' }]);
  });
  it('tanpa perubahan → null, termasuk d sumber yang belum dinormalisasi (arc)', () => {
    const m = modelFromD(node.d);
    expect(pathEditOps(node, m, moveAnchors(m, [{ s: 0, i: 0 }], 0, 0), box, true)).toBeNull();
    const arc = { ...node, d: 'M10.268 21a2 2 0 0 0 3.464 0' };
    const am = modelFromD(arc.d);
    expect(serializeModel(am)).not.toBe(arc.d);
    expect(pathEditOps(arc, am, moveAnchors(am, [{ s: 0, i: 1 }], 0, 0), box, true)).toBeNull();
    // Corner pada titik yang sudah corner (garis) juga tanpa op.
    const tri = modelFromD(node.d);
    expect(pathEditOps(node, tri, setPointType(tri, [{ s: 0, i: 1 }], 'corner'), box, true)).toBeNull();
  });
});

describe('pathEditable dan koordinat panel', () => {
  const p = { type: 'path', d: 'M0 0L10 10', viewBox: [0, 0, 10, 10] };
  it('rotasi node atau leluhur, d rusak, dan bukan path → tidak bisa', () => {
    expect(pathEditable(p)).toBe(true);
    expect(pathEditable({ ...p, rotation: 360 })).toBe(true);
    expect(pathEditable({ ...p, rotation: 45 })).toBe(false);
    expect(pathEditable(p, [{ type: 'board' }, { type: 'frame', rotation: 10 }])).toBe(false);
    expect(pathEditable({ ...p, d: 'L5 5' })).toBe(false);
    expect(pathEditable({ type: 'rect' })).toBe(false);
  });
  it('X/Y panel relatif kotak node; panelDelta membalikkannya (viewBox bergeser, skala ≠ 1)', () => {
    const vb = [-2, 0, 26, 24] as const;
    const map = viewMapping(vb, { x: 0, y: 0, w: 104, h: 96 });
    const pt = { x: 3, y: 6 };
    expect(panelXY(pt, vb, map)).toEqual({ x: 20, y: 24 });
    const d = panelDelta(pt, vb, map, 21, undefined);
    expect(d.y).toBe(0);
    expect(panelXY({ x: pt.x + d.x, y: pt.y + d.y }, vb, map)).toEqual({ x: 21, y: 24 });
  });
  it('kotak tampil 0 → skala 1 (tanpa Infinity)', () => {
    const map = viewMapping([0, 0, 10, 10], { x: 0, y: 0, w: 0, h: 5 });
    expect(map.sx).toBe(1);
    expect(Number.isFinite(map.fromPage({ x: 3, y: 3 }).x)).toBe(true);
  });
});

describe('penNode', () => {
  it('garis terbuka: kotak floor/ceil, d di origin node, gaya desain', () => {
    const n = penNode([{ p: { x: 10, y: 10 } }, { p: { x: 110, y: 10 } }, { p: { x: 110, y: 60 } }], false)!;
    expect(n).toMatchObject({ type: 'path', position: 'absolute', x: 10, y: 10, width: 100, height: 50, d: 'M0 0L100 0L100 50', viewBox: [0, 0, 100, 50] });
    expect(n.stroke).toEqual({ color: '#111111', width: 2, align: 'center' });
    expect(n.strokeLinecap).toBe('round');
  });
  it('drag = kubik dengan handle masuk tercermin; tutup = Z', () => {
    const n = penNode([{ p: { x: 0, y: 0 } }, { p: { x: 10, y: 10 }, out: { x: 15, y: 10 } }, { p: { x: 20, y: 0 } }], true)!;
    expect(n.d).toBe('M0 0C0 0 5 10 10 10C15 10 20 0 20 0Z');
  });
  it('garis horizontal: tinggi minimal 1; < 2 titik → undefined', () => {
    expect(penNode([{ p: { x: 0.5, y: 3 } }, { p: { x: 9.2, y: 3 } }], false)).toMatchObject({ x: 0, y: 3, width: 10, height: 1 });
    expect(penNode([{ p: { x: 0, y: 0 } }], false)).toBeUndefined();
  });
});
