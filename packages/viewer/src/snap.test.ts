import { describe, expect, it } from 'vitest';
import { indexGeo, type Box, type GeoNode } from './gesture.js';
import { measure, snapCandidates, snapMove, snapResize } from './snap.js';

const node = (id: string, box: Box, opts: Partial<GeoNode> = {}): GeoNode => ({
  id,
  type: 'rect',
  name: id,
  box,
  parentId: undefined,
  absolute: true,
  x: box.x,
  y: box.y,
  layout: undefined,
  children: [],
  ...opts,
});
/** Pasang parentId anak secara rekursif (pola gesture.test.ts). */
const tree = (n: GeoNode): GeoNode => {
  for (const c of n.children) {
    c.parentId = n.id;
    tree(c);
  }
  return n;
};

const TOL = 6;

describe('snapMove', () => {
  it('SNAP_EDGE: tepi moving ≤ tol dari tepi kandidat → disesuaikan, guide v di garis itu', () => {
    // Tepi kiri moving di 104, tepi kanan kandidat di 100 → dx −4. Sumbu y di luar tol.
    const s = snapMove({ x: 104, y: 10, w: 50, h: 50 }, [{ x: 0, y: 0, w: 100, h: 100 }], TOL);
    expect(s.dx).toBe(-4);
    expect(s.dy).toBe(0);
    // Extent = union kotak moving (sesudah snap: y 10..60) + kandidat (0..100).
    expect(s.guides).toEqual([{ orientation: 'v', at: 100, from: 0, to: 100 }]);
  });

  it('tanpa kandidat ≤ tol: dx/dy nol, tanpa guide', () => {
    const s = snapMove({ x: 110, y: 10, w: 50, h: 50 }, [{ x: 0, y: 0, w: 100, h: 100 }], TOL);
    expect(s.dx).toBe(0);
    expect(s.dy).toBe(0);
    expect(s.guides).toEqual([]);
    expect(s.gaps).toEqual([]);
  });

  it('SNAP_CENTER: titik moving yang dicek = tepi awal, tengah, tepi akhir', () => {
    // Titik y moving: 33, 53, 73; kandidat: 0, 50, 100 → 53 → 50 (d=−3) menang.
    const s = snapMove({ x: 200, y: 33, w: 40, h: 40 }, [{ x: 0, y: 0, w: 100, h: 100 }], TOL);
    expect(s.dy).toBe(-3);
    expect(s.dx).toBe(0);
    expect(s.guides).toEqual([{ orientation: 'h', at: 50, from: 0, to: 240 }]);
  });

  it('offset terkecil menang; seri → pasangan pertama dalam urutan evaluasi', () => {
    // |Δ| minimal = 2 (tengah moving 105 → tepi kandidat 103), bukan tepi 104 (d=+4).
    const s = snapMove({ x: 100, y: 0, w: 10, h: 10 }, [{ x: 104, y: 0, w: 10, h: 10 }, { x: 103, y: 20, w: 10, h: 10 }], TOL);
    expect(s.dx).toBe(-1); // 104 − 105 = −1 pada kandidat pertama
    // Dua kandidat dengan tepi sama di x=103: extent guide = union semua yang berhimpit.
    const s2 = snapMove({ x: 100, y: 0, w: 10, h: 10 }, [
      { x: 103, y: 0, w: 10, h: 10 },
      { x: 103, y: 20, w: 10, h: 10 },
    ], TOL);
    expect(s2.dx).toBe(-2);
    expect(s2.guides[0]).toMatchObject({ orientation: 'v', at: 103, from: 0, to: 30 });
  });

  it('GAP_LABEL: kandidat yang ikut snap dan disjoint → label jarak; overlap/bersentuhan → tanpa label', () => {
    // Sesudah snap moving bersentuhan dengan kandidat di sumbu x dan overlap penuh di y → tanpa label.
    const s = snapMove({ x: 104, y: 10, w: 50, h: 50 }, [{ x: 0, y: 0, w: 100, h: 100 }], TOL);
    expect(s.dx).toBe(-4);
    expect(s.gaps).toEqual([]);
    // Snap pada sumbu x, disjoint pada sumbu y → label celah y = 10 (at = tengah irisan proyeksi x = 100).
    const s2 = snapMove({ x: 104, y: 110, w: 50, h: 50 }, [{ x: 0, y: 0, w: 100, h: 100 }], TOL);
    expect(s2.dx).toBe(-4);
    expect(s2.dy).toBe(0);
    expect(s2.gaps).toEqual([{ axis: 'y', from: 100, to: 110, at: 100, value: 10 }]);
  });
});

describe('snapResize', () => {
  const t = { x: 0, y: 0, w: 100, h: 100 };

  it('handle e: tepi kanan di luar tol → tanpa snap', () => {
    // Tepi kanan 204; titik kandidat x = 0, 50, 100 → semua |Δ| > 6.
    const s = snapResize({ x: 120, y: 0, w: 84, h: 50 }, 'e', [t], TOL);
    expect(s.dx).toBe(0);
    expect(s.guides).toEqual([]);
  });

  it('handle e menempel ke tepi kanan kandidat', () => {
    const s = snapResize({ x: 0, y: 0, w: 96, h: 50 }, 'e', [t], TOL);
    expect(s.dx).toBe(4); // 96 → 100
    expect(s.guides).toEqual([{ orientation: 'v', at: 100, from: 0, to: 100 }]);
  });

  it('handle w: tepi kiri menempel, tepi lain tidak ikut snap', () => {
    // Tepi kiri 4 → 0; tepi kanan 104 tidak disnap walaupun 104−100=4 ≤ tol.
    const s = snapResize({ x: 4, y: 0, w: 100, h: 50 }, 'w', [t], TOL);
    expect(s.dx).toBe(-4);
    expect(s.guides).toEqual([{ orientation: 'v', at: 0, from: 0, to: 100 }]);
  });

  it('pojok se: dua sumbu ikut snap', () => {
    const s = snapResize({ x: 0, y: 0, w: 97, h: 103 }, 'se', [t], TOL);
    expect(s.dx).toBe(3);
    expect(s.dy).toBe(-3);
    expect(s.guides).toHaveLength(2);
  });

  it('handle n: tepi atas menempel', () => {
    const s = snapResize({ x: 0, y: 5, w: 50, h: 45 }, 'n', [t], TOL);
    expect(s.dy).toBe(-5); // 5 → 0
    expect(s.guides).toEqual([{ orientation: 'h', at: 0, from: 0, to: 100 }]);
  });
});

describe('measure', () => {
  it('disjoint: nilai = celah antar tepi berhadapan, segmen di celah itu, at = tengah irisan tegak lurus', () => {
    const a: Box = { x: 0, y: 0, w: 100, h: 100 };
    const b: Box = { x: 140, y: 20, w: 50, h: 50 };
    const [mx] = measure(a, b);
    expect(mx).toEqual({ axis: 'x', from: 100, to: 140, at: 45, value: 40 });
  });

  it('tanpa irisan pada sumbu tegak lurus: at = titik tengah antar tepi berhadapan', () => {
    const a: Box = { x: 0, y: 0, w: 100, h: 100 };
    const b: Box = { x: 140, y: 300, w: 50, h: 50 };
    const [mx, my] = measure(a, b);
    // Sumbu x: at = tengah celah y (100..300) = 200.
    expect(mx).toEqual({ axis: 'x', from: 100, to: 140, at: 200, value: 40 });
    // Sumbu y: at = tengah celah x (100..140) = 120.
    expect(my).toEqual({ axis: 'y', from: 100, to: 300, at: 120, value: 200 });
  });

  it('overlap pada satu sumbu: jarak antar tepi berhadapan |maxStart−minEnd| tetap dilaporkan', () => {
    const a: Box = { x: 0, y: 0, w: 100, h: 100 };
    const b: Box = { x: 80, y: 120, w: 50, h: 50 };
    const [mx] = measure(a, b);
    // Irisan x 80..100 → nilai 20; y disjoint → at = tengah celah y (100..120) = 110.
    expect(mx).toEqual({ axis: 'x', from: 80, to: 100, at: 110, value: 20 });
  });

  it('value === 0 (tepi bersentuhan) dibuang; sumbu lain tetap dihitung', () => {
    const a: Box = { x: 0, y: 0, w: 100, h: 100 };
    const b: Box = { x: 100, y: 0, w: 50, h: 50 };
    // Sumbu x bersentuhan (value 0, dibuang); sumbu y overlap 0..50.
    expect(measure(a, b)).toEqual([{ axis: 'y', from: 0, to: 50, at: 100, value: 50 }]);
  });
});

describe('snapCandidates', () => {
  // Board B (0,0 400×300) → Row (frame) → A, C; Abs anak absolute board; board D board lain.
  const scene = () => [
    tree(
      node('B', { x: 0, y: 0, w: 400, h: 300 }, {
        type: 'board',
        layout: 'column',
        children: [
          node('Row', { x: 10, y: 10, w: 380, h: 100 }, { type: 'frame', layout: 'row', absolute: false, children: [node('A', { x: 10, y: 10, w: 50, h: 50 }), node('C', { x: 70, y: 10, w: 50, h: 50 })] }),
          node('Abs', { x: 200, y: 200, w: 50, h: 50 }),
        ],
      }),
    ),
    tree(node('D', { x: 500, y: 0, w: 300, h: 200 }, { type: 'board', layout: 'column' })),
  ];

  it('anak board: saudara se-parent + kotak parent + kotak board (tanpa node itu dan board lain)', () => {
    const roots = scene();
    const index = indexGeo(roots);
    const a = index.get('Abs')!;
    const boxes = snapCandidates([a], index);
    const ids = [...index.values()].filter((n) => boxes.includes(n.box)).map((n) => n.id);
    expect(ids.sort()).toEqual(['B', 'Row']);
  });

  it('anak frame: saudara frame + frame + board', () => {
    const roots = scene();
    const index = indexGeo(roots);
    const boxes = snapCandidates([index.get('A')!], index);
    const ids = [...index.values()].filter((n) => boxes.includes(n.box)).map((n) => n.id);
    expect(ids.sort()).toEqual(['B', 'C', 'Row']);
  });

  it('board digeser → board lain saja', () => {
    const roots = scene();
    const index = indexGeo(roots);
    const boxes = snapCandidates([index.get('B')!], index);
    expect(boxes).toEqual([{ x: 500, y: 0, w: 300, h: 200 }]);
  });

  it('seleksi lintas parent: gabungan kandidat tiap node', () => {
    const roots = scene();
    const index = indexGeo(roots);
    const boxes = snapCandidates([index.get('A')!, index.get('Abs')!], index);
    const ids = [...index.values()].filter((n) => boxes.includes(n.box)).map((n) => n.id);
    expect(ids.sort()).toEqual(['B', 'C', 'Row']);
  });
});
