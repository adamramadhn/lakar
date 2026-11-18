import { describe, expect, it } from 'vitest';
import { summarizeFindings, type Finding } from '@lakar/schema';
import { testLog } from '../../../tests/support/log.ts';
import {
  PACKAGE,
  boundsOf,
  changedNodeIds,
  checkBoard,
  emojiIn,
  glyphScan,
  isEmojiGrapheme,
  leadingIconGlyph,
  touchedBoards,
} from './index.js';
import type { BoardMeasure, NodeBounds } from '@lakar/ports';
import type { ResolvedDocument } from '@lakar/schema';

// ---- Pembangun dokumen + BoardMeasure sintetis (bounds ditulis eksplisit).
type R = [number, number, number, number];
type Loose = Record<string, any>;

let seq = 0;
const nid = (): string => `N${String(++seq).padStart(7, '0')}`;

const text = (content: string, r: R, extra: Loose = {}): Loose => ({ type: 'text', id: nid(), name: 'Teks', content, size: 14, ...extra, _r: r });
const rect = (name: string, r: R, extra: Loose = {}): Loose => ({ type: 'rect', id: nid(), name, ...extra, _r: r });
const frame = (name: string, r: R, children: Loose[], extra: Loose = {}): Loose => ({
  type: 'frame',
  id: nid(),
  name,
  layout: 'column',
  ...extra,
  children,
  _r: r,
});

type BoardSpec = { name?: string; x?: number; y?: number; width?: number; height?: number; screen?: 'mobile' | 'app' | 'landing'; expectedSize?: { width: number; height: number }; children: Loose[]; id?: string };

/** Dokumen satu halaman dengan board-board `specs`; measure per board dari `_r` setiap node. */
function docOf(specs: BoardSpec[], tokens?: Record<string, string | number>): { doc: ResolvedDocument; boards: string[]; measures: Map<string, BoardMeasure> } {
  const measures = new Map<string, BoardMeasure>();
  const boards = specs.map((s) => {
    const id = s.id ?? nid();
    const nodes: NodeBounds[] = [];
    const strip = (children: Loose[]): Loose[] =>
      children.map(({ _r, children: kids, ...n }) => {
        const r = _r as R;
        nodes.push({ id: n.id as string, x: r[0], y: r[1], width: r[2], height: r[3] });
        return kids ? { ...n, children: strip(kids as Loose[]) } : n;
      });
    const width = s.width ?? 390;
    const height = s.height ?? 844;
    const children = strip(s.children);
    measures.set(id, { width, height, nodes, texts: [] });
    return {
      type: 'board',
      id,
      name: s.name ?? 'Home',
      x: s.x ?? 0,
      y: s.y ?? 0,
      width,
      height,
      screen: s.screen ?? 'mobile',
      ...(s.expectedSize ? { expectedSize: s.expectedSize } : {}),
      children,
    };
  });
  const doc = { schemaVersion: 1, id: 'Docu0001', rev: 1, ...(tokens ? { tokens } : {}), pages: [{ id: 'Page0001', name: 'Page 1', children: boards }] };
  return { doc: doc as unknown as ResolvedDocument, boards: boards.map((b) => b.id), measures };
}

const run = (spec: BoardSpec | BoardSpec[], which = 0): Finding[] => {
  const { doc, boards, measures } = docOf(Array.isArray(spec) ? spec : [spec]);
  return checkBoard({ doc, boardId: boards[which]!, measure: measures.get(boards[which]!)! });
};
const rules = (f: Finding[]) => f.map((x) => x.rule);
const only = (f: Finding[], rule: string) => f.filter((x) => x.rule === rule);
/** Board mobile 390×844 bersih + anak tambahan. */
const clean = (children: BoardSpec['children'], extra: Partial<BoardSpec> = {}): BoardSpec => ({ children, ...extra });

describe('@lakar/check', () => {
  it('mengekspor nama paket', () => {
    expect(PACKAGE).toBe('@lakar/check');
  });
});

describe('LC-01a emoji', () => {
  it.each(['Halo 👋', '✅ Lunas', '⭐ 4,9', '❤️', '1️⃣ Pilih', '🇮🇩', '👩‍💻', '👋🏽', '▶️ Putar', '#️⃣', '1️'])('positif %s', (s) => {
    expect(emojiIn(s).length).toBeGreaterThan(0);
    expect(rules(run(clean([text(s, [0, 0, 100, 20])])))).toContain('LC-01a');
  });

  it.each(['© 2026 Kopi', 'Merek®', 'Kopi™', '©️', '#1 di Jakarta', 'Langkah 3*', 'Rp 25.000', '❤', '★', '✔'])('negatif %s', (s) => {
    expect(emojiIn(s)).toEqual([]);
    expect(only(run(clean([text(s, [0, 0, 100, 20])])), 'LC-01a')).toEqual([]);
  });

  it('grapheme: ZWJ, bendera, skin tone, keycap tanpa VS16', () => {
    expect(isEmojiGrapheme('👨‍👩‍👧')).toBe(true);
    expect(isEmojiGrapheme('🇮🇩')).toBe(true);
    expect(isEmojiGrapheme('3⃣')).toBe(true);
    expect(isEmojiGrapheme('a')).toBe(false);
    expect(isEmojiGrapheme('®️')).toBe(false);
  });

  it('detail menyebut emoji, code point, dan konten; satu temuan per node', () => {
    const f = only(run(clean([text('Halo 👋 👋 🎉', [0, 0, 100, 20], { name: 'Sapaan' })])), 'LC-01a');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: 'error', nodeName: 'Sapaan', expected: 'hapus emoji; ikon pakai node icon (icon_search)' });
    expect(f[0]!.detail).toBe('emoji "👋" U+1F44B, "🎉" U+1F389 di "Halo 👋 👋 🎉"');
  });
});

describe('LC-01b glyph sebagai ikon', () => {
  it.each(['★★★★★', '☆ 4,9', '  ✓ Gratis ongkir', '• Kopi susu', '→', '▶ Putar', '▶︎ Putar'])('positif %j', (s) => {
    expect(leadingIconGlyph(s)).toBeDefined();
    const f = run(clean([text(s, [0, 0, 100, 20])]));
    expect(rules(f)).toEqual(['LC-01b']);
  });

  it.each(['Lihat semua →', 'Jakarta → Bandung', 'Naik 12% ↑', '4,9 ★', '▶️ Putar'])('negatif %j', (s) => {
    expect(only(run(clean([text(s, [0, 0, 100, 20])])), 'LC-01b')).toEqual([]);
  });

  it('expected menyarankan ikon lucide', () => {
    const [f] = run(clean([text('★★★★★', [0, 0, 100, 20], { name: 'Rating' })]));
    expect(f!.detail).toBe('glyph "★" U+2605 sebagai ikon di "★★★★★"');
    expect(f!.expected).toContain('lucide star');
  });
});

describe('glyphScan → allowGlyphs', () => {
  it('emoji + glyph ikon di-allow; ©, → di tengah, dan glyph yang juga muncul di luar temuan tidak', () => {
    const { doc, boards } = docOf([
      clean([
        text('Halo 👋🏽', [0, 0, 1, 1]),
        text('→ ←', [0, 0, 1, 1]),
        text('▶ Putar ↓', [0, 0, 1, 1]),
        text('© 2026', [0, 0, 1, 1]),
        text('Lihat →', [0, 0, 1, 1]),
        text('©️', [0, 0, 1, 1]),
      ]),
    ]);
    const { findings, allowGlyphs } = glyphScan(doc.pages[0]!.children.find((b) => b.id === boards[0])!);
    expect(rules(findings)).toEqual(['LC-01a', 'LC-01b', 'LC-01b']);
    // → juga muncul di "Lihat →" (bukan temuan) → tidak di-allow, tetap FONT_MISSING saat ukur.
    expect(allowGlyphs).toEqual([0x2190, 0x25b6, 0x1f3fd, 0x1f44b]);
  });

  it('glyph temuan yang juga dipakai di luar temuan pada board yang sama tidak di-allow', () => {
    const scan = (...contents: string[]) => {
      const { doc, boards } = docOf([clean(contents.map((c) => text(c, [0, 0, 1, 1])))]);
      return glyphScan(doc.pages[0]!.children.find((b) => b.id === boards[0])!);
    };
    // ❤️ (emoji) + "Suka ❤" (tanpa VS16, bukan temuan): U+2764 harus tetap FONT_MISSING.
    const heart = scan('❤️ Favorit', 'Suka ❤');
    expect(rules(heart.findings)).toEqual(['LC-01a']);
    expect(heart.allowGlyphs).toEqual([0xfe0f]);
    // VS16 dari emoji tidak membebaskan "©️".
    expect(scan('▶️ Putar', '©️ 2026').allowGlyphs).toEqual([0x25b6]);
    // "4,9 ★" tidak ikut terukur karena "★★★★★" di board yang sama.
    expect(scan('★★★★★', '4,9 ★').allowGlyphs).toEqual([]);
    expect(scan('★★★★★', '☆ 4,9').allowGlyphs).toEqual([0x2605, 0x2606]);
  });
});

describe('LC-02a terpotong', () => {
  it('anak 260 di frame clip 200 → keluar 60 di kanan; 0,4 px → lolos', () => {
    const child = rect('Lebar', [10, 100, 260, 20]);
    const f = run(clean([frame('Kartu', [10, 100, 200, 40], [child], { clip: true })]));
    expect(rules(f)).toEqual(['LC-02a']);
    expect(f[0]).toMatchObject({ nodeId: child.id });
    expect(f[0]!.detail).toMatch(/^keluar 60px di kanan dari clip Kartu/);
    const ok = run(clean([frame('Kartu', [10, 100, 200, 40], [rect('Pas', [10, 100, 200.4, 20])], { clip: true })]));
    expect(ok).toEqual([]);
  });

  it('board selalu clip; node luas 0 dilewati', () => {
    expect(rules(run(clean([rect('Keluar', [300, 0, 120, 10])])))).toEqual(['LC-02a']);
    expect(run(clean([rect('Garis', [300, 0, 120, 0])]))).toEqual([]);
  });

  it('hanya node terluar; keturunan tetap diuji terhadap clip lebih dalam', () => {
    const inner = rect('Dalam', [400, 0, 10, 10]);
    const deep = rect('Dalam clip', [300, 50, 200, 10]);
    const wrap = frame('Wrap', [300, 0, 200, 100], [inner, frame('Klip', [300, 40, 50, 20], [deep], { clip: true })]);
    const f = run(clean([wrap]));
    expect(f.map((x) => x.nodeName)).toEqual(['Wrap', 'Dalam clip']);
  });

  it('Crop: 2 pertama bebas, ke-3 → "maks 2"; Scroll bebas vertikal saja; rotasi bebas', () => {
    const crop = (i: number) => frame(`Crop / ${i}`, [0, i * 50, 100, 40], [rect(`Isi ${i}`, [-20, i * 50 - 20, 200, 100])], { clip: true });
    const f = run(clean([crop(1), crop(2), crop(3)]));
    expect(f.map((x) => x.nodeName)).toEqual(['Isi 3']);
    expect(f[0]!.detail).toContain('maks 2');

    const scrollV = run(clean([frame('Scroll / Konten', [0, 100, 390, 300], [rect('Panjang', [0, -100, 390, 900])], { clip: true, scrollY: 200 })]));
    expect(scrollV).toEqual([]);
    const scrollH = run(clean([frame('Scroll / Konten', [0, 100, 390, 300], [rect('Lebar', [0, 100, 500, 10])], { clip: true })]));
    expect(rules(scrollH)).toEqual(['LC-02a']);

    const rotated = run(clean([frame('Miring', [100, 100, 100, 100], [rect('Isi', [50, 50, 200, 200])], { clip: true, rotation: 12 })]));
    expect(rotated).toEqual([]);
  });
});

describe('LC-05 teks < 12', () => {
  it.each([
    [11, 1],
    [11.5, 1],
    [12, 0],
  ])('size %d → %d temuan', (size, n) => {
    const f = run(clean([text('Caption', [0, 0, 100, 20], { size })]));
    expect(only(f, 'LC-05')).toHaveLength(n);
    if (n) expect(f[0]).toMatchObject({ detail: `size ${size}px`, expected: '≥ 12' });
  });

  it('konten kosong / spasi dilewati', () => {
    expect(run(clean([text('  ', [0, 0, 10, 10], { size: 8 })]))).toEqual([]);
  });
});

describe('LC-12 board', () => {
  it('mobile 390×800 → warning ukuran (bukan gerbang)', () => {
    const f = run({ children: [], height: 800, name: 'Home · mobile' });
    expect(f).toEqual([{ level: 'warning', rule: 'LC-12', nodeId: expect.any(String), nodeName: 'Home · mobile', detail: 'ukuran 390×800', expected: '390×844' }]);
    expect(summarizeFindings(f)).toEqual({ error: 0, warning: 1, gate: 0 });
  });

  it('app 1440×900 dan ×1024 lolos; 1440×800 tidak; landing tinggi bebas; expectedSize menang', () => {
    expect(run({ children: [], screen: 'app', width: 1440, height: 900 })).toEqual([]);
    expect(run({ children: [], screen: 'app', width: 1440, height: 1024 })).toEqual([]);
    expect(run({ children: [], screen: 'app', width: 1440, height: 800 })[0]!.expected).toBe('1440×900 atau 1440×1024');
    expect(run({ children: [], screen: 'landing', width: 1440, height: 5123 })).toEqual([]);
    expect(run({ children: [], screen: 'landing', width: 1280, height: 900 })[0]!.expected).toBe('lebar 1440 (tinggi bebas)');
    expect(run({ children: [], screen: 'app', width: 400, height: 300, expectedSize: { width: 400, height: 300 } })).toEqual([]);
  });

  it('tabrakan dengan board lain di halaman → detail nama+ID, expected place(w,h)', () => {
    const f = run([{ children: [], name: 'A', id: 'Aaaaaaaa' }, { children: [], name: 'B', x: 200 }], 1);
    expect(f[0]!.detail).toBe('bertabrakan dengan board A (Aaaaaaaa)');
    expect(f[0]!.expected).toContain('place(390, 844)');
    expect(run([{ children: [], name: 'A' }, { children: [], name: 'B', x: 390 }], 1)).toEqual([]);
  });
});

describe('LC-20 konten tertutup bar bawah', () => {
  const tab = () => rect('Overlay / Tab bar', [0, 780, 390, 64], { position: 'absolute' });

  it('wrapper flow terbesar, anak terakhir terlihat utuh melewati y(O)−8 → temuan pada wrapper', () => {
    const last = rect('Kartu terakhir', [0, 600, 390, 180]);
    const wrap = frame('Konten', [0, 0, 390, 780], [rect('Kartu', [0, 0, 390, 600]), last]);
    const f = run(clean([wrap, tab()]));
    expect(rules(f)).toEqual(['LC-20']);
    expect(f[0]).toMatchObject({ nodeId: wrap.id, nodeName: 'Konten' });
    expect(f[0]!.detail).toBe(`konten terakhir Kartu terakhir (${last.id}) berakhir di y 780, Overlay / Tab bar (${f[0]!.detail.match(/Tab bar \((\w+)\)/)![1]}) mulai di y 780`);
    expect(f[0]!.expected).toBe('berakhir ≤ 772 (y Overlay / Tab bar − 8); tambah padding bawah pada Konten');
  });

  it('berakhir tepat di y(O)−8 lolos; bar kecil / jauh dari bawah bukan bar bawah', () => {
    expect(run(clean([frame('Konten', [0, 0, 390, 772], [rect('A', [0, 0, 390, 772])]), tab()]))).toEqual([]);
    const badge = rect('Overlay / Badge', [300, 780, 60, 64], { position: 'absolute' });
    expect(run(clean([frame('Konten', [0, 0, 390, 800], [rect('A', [0, 0, 390, 800])]), badge]))).toEqual([]);
  });

  it('Scroll: posisi awal (terpotong, scrollY 0) tidak dievaluasi; posisi akhir (scrollY > 0) dievaluasi', () => {
    const scroll = (scrollY: number, lastY: number) =>
      frame('Scroll / Konten', [0, 0, 390, 844], [rect('Atas', [0, lastY - 600, 390, 600]), rect('Akhir', [0, lastY, 390, 200])], { clip: true, ...(scrollY ? { scrollY } : {}) });
    expect(run(clean([scroll(0, 700), tab()]))).toEqual([]);
    const f = run(clean([scroll(300, 600), tab()]));
    expect(rules(f)).toEqual(['LC-20']);
    expect(f[0]!.nodeName).toBe('Scroll / Konten');
  });

  it('wrapper hug yang melewati board (posisi awal, terpotong board) → tidak dievaluasi', () => {
    const wrap = frame('Konten', [0, 0, 390, 1200], [rect('Kartu', [0, 0, 390, 600]), rect('Akhir', [0, 600, 390, 600])]);
    expect(only(run(clean([wrap, tab()])), 'LC-20')).toEqual([]);
  });

  it('wadah tanpa clip: anak yang melewati bottom wadah tetap terlihat → dievaluasi; wadah clip → terpotong, tidak dievaluasi', () => {
    const kids = () => [rect('Kartu', [0, 0, 390, 590]), rect('Akhir', [0, 590, 390, 200])];
    const f = run(clean([frame('Konten', [0, 0, 390, 700], kids()), tab()]));
    expect(rules(f)).toEqual(['LC-20']);
    expect(f[0]!.nodeName).toBe('Konten');
    expect(only(run(clean([frame('Konten', [0, 0, 390, 700], kids(), { clip: true }), tab()])), 'LC-20')).toEqual([]);
  });

  it('tanpa frame → board sebagai wadah; anak absolute dan Status bar diabaikan', () => {
    const f = run(clean([rect('Status bar', [0, 0, 390, 44]), rect('Isi', [0, 44, 390, 760]), tab()]));
    expect(f.map((x) => [x.rule, x.nodeName])).toEqual([['LC-20', 'Home']]);
  });
});

describe('fixture enam aturan', () => {
  it('tepat 6 temuan: LC-01a, LC-01b, LC-02a, LC-05, LC-20 (error) lalu LC-12 (warning); © bukan temuan', () => {
    const copy = text('© 2026 Kopi', [0, 80, 100, 15], { size: 12, name: 'Hak cipta' });
    const spec: BoardSpec = {
      height: 800,
      children: [
        text('Halo 👋', [0, 0, 80, 20], { name: 'Sapaan' }),
        text('★★★★★', [0, 20, 80, 20], { name: 'Rating' }),
        text('Catatan kecil', [0, 40, 80, 14], { size: 11, name: 'Caption' }),
        copy,
        frame('Kartu', [0, 95, 200, 40], [rect('Lebar', [0, 95, 260, 20])], { clip: true }),
        frame('Konten', [0, 135, 390, 625], [rect('Isi', [0, 135, 390, 625])]),
        rect('Overlay / Tab bar', [0, 736, 390, 64], { position: 'absolute' }),
      ],
    };
    const f = run(spec);
    expect(rules(f)).toEqual(['LC-01a', 'LC-01b', 'LC-05', 'LC-02a', 'LC-20', 'LC-12']);
    expect(f.some((x) => x.nodeId === copy.id)).toBe(false);
    expect(summarizeFindings(f)).toEqual({ error: 5, warning: 1, gate: 5 });
  });
});

describe('touchedBoards / changedNodeIds', () => {
  const two = (tokens?: Record<string, string>) =>
    docOf(
      [
        { id: 'Bbbbbbb1', children: [text('A', [0, 0, 1, 1], { id: 'Tttttt01' })] },
        { id: 'Bbbbbbb2', x: 500, children: [text('B', [0, 0, 1, 1], { id: 'Tttttt02' }), rect('R', [0, 0, 1, 1], { id: 'Rrrrrr02' })] },
      ],
      tokens,
    ).doc;

  it('baca-saja → []; tambah board → board baru; ubah node → board-nya; pindah board', () => {
    const a = two();
    expect(touchedBoards(a, structuredClone(a))).toEqual([]);
    const add = structuredClone(a);
    add.pages[0]!.children.push({ ...structuredClone(a.pages[0]!.children[0]!), id: 'Bbbbbbb3', x: 1000 });
    expect(touchedBoards(a, add)).toEqual(['Bbbbbbb3']);
    const upd = structuredClone(a);
    (upd.pages[0]!.children[1]!.children[0] as { content: string }).content = 'B2';
    expect(touchedBoards(a, upd)).toEqual(['Bbbbbbb2']);
    expect(changedNodeIds(a, upd, ['Bbbbbbb2'])).toEqual(['Tttttt02']);
    const mv = structuredClone(a);
    mv.pages[0]!.children[0]!.x = 40;
    expect(touchedBoards(a, mv)).toEqual(['Bbbbbbb1']);
    expect(changedNodeIds(a, mv, ['Bbbbbbb1'])).toEqual([]);
  });

  it('nilai token ter-resolve berubah di 2 board → keduanya tersentuh', () => {
    const a = two();
    const b = structuredClone(a);
    (b.pages[0]!.children[0]!.children[0] as { color?: string }).color = '#111111';
    (b.pages[0]!.children[1]!.children[0] as { color?: string }).color = '#111111';
    expect(touchedBoards(a, b)).toEqual(['Bbbbbbb1', 'Bbbbbbb2']);
  });

  it('reorder anak → indeks berubah tercatat', () => {
    const a = two();
    const b = structuredClone(a);
    b.pages[0]!.children[1]!.children.reverse();
    expect(changedNodeIds(a, b, ['Bbbbbbb2'])).toEqual(['Rrrrrr02', 'Tttttt02']);
  });
});

describe('boundsOf', () => {
  it('dibulatkan, board [0,0,w,h], maks cap + truncated', () => {
    const { boards, measures } = docOf([{ children: [rect('A', [1.4, 2.6, 10.5, 3], { id: 'Aaaaaaa1' }), rect('B', [0, 0, 1, 1], { id: 'Aaaaaaa2' })] }]);
    expect(boundsOf(measures, [boards[0]!, 'Aaaaaaa1', 'Aaaaaaa2', 'Tidakada'], 2)).toEqual({
      bounds: { [boards[0]!]: [0, 0, 390, 844], Aaaaaaa1: [1, 3, 11, 3] },
      truncated: 1,
    });
  });
});

describe('kinerja aturan murni', () => {
  it('500 node ≤ 20 ms (asersi longgar 100 ms)', () => {
    const children = Array.from({ length: 100 }, (_, i) =>
      frame(`Baris ${i}`, [0, i * 8, 390, 8], [text(`Item ${i} ★`, [0, i * 8, 100, 8]), rect('R', [100, i * 8, 10, 8]), text('Rp 25.000', [200, i * 8, 50, 8], { size: 11 }), rect('S', [300, i * 8, 10, 8])], {
        clip: i % 2 === 0,
      }),
    );
    const { doc, boards, measures } = docOf([{ children, height: 844 }]);
    const measure = measures.get(boards[0]!)!;
    expect(measure.nodes).toHaveLength(500);
    checkBoard({ doc, boardId: boards[0]!, measure });
    const t0 = performance.now();
    const f = checkBoard({ doc, boardId: boards[0]!, measure });
    const ms = performance.now() - t0;
    testLog(`[check] aturan G0 500 node: ${ms.toFixed(2)} ms`);
    expect(f.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(100);
  });
});

