import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, summarizeFindings, type Finding } from '@lakar/schema';
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
import type { BoardMeasure, NodeBounds, TextMeasure } from '@lakar/ports';
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
    const texts: TextMeasure[] = [];
    const strip = (children: Loose[]): Loose[] =>
      children.map(({ _r, _ink, _lines, _lh, children: kids, ...n }) => {
        const r = _r as R;
        nodes.push({ id: n.id as string, x: r[0], y: r[1], width: r[2], height: r[3] });
        if (_ink || _lines || _lh) {
          const ink = _ink as R | undefined;
          texts.push({ id: n.id as string, lines: (_lines as number) ?? 1, lineHeight: (_lh as number) ?? r[3], ...(ink ? { ink: { x: ink[0], y: ink[1], width: ink[2], height: ink[3] } } : {}) });
        }
        return kids ? { ...n, children: strip(kids as Loose[]) } : n;
      });
    const width = s.width ?? 390;
    const height = s.height ?? 844;
    const children = strip(s.children);
    measures.set(id, { width, height, nodes, texts });
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
  const doc = { schemaVersion: SCHEMA_VERSION, id: 'Docu0001', rev: 1, ...(tokens ? { tokens } : {}), pages: [{ id: 'Page0001', name: 'Page 1', children: boards }] };
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
    expect(rules(scrollV)).toEqual(['LC-12']);
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
    expect(f).toEqual([
      { level: 'warning', rule: 'LC-12', nodeId: expect.any(String), nodeName: 'Home · mobile', detail: 'ukuran 390×800', expected: 'lebar 390, tinggi ≥ 844 (isi lebih panjang: satu board panjang)' },
    ]);
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

  const solidFill = { fills: [{ type: 'solid', color: '#FFFFFF' }] };
  const long = (H: number, lastBottom: number, extra: Loose[] = []) => ({
    height: H,
    children: [
      frame('Konten', [0, 0, 390, lastBottom], [rect('Atas', [16, 0, 358, lastBottom - 200], solidFill), rect('Akhir', [16, lastBottom - 190, 358, 190], solidFill)]),
      ...extra,
    ],
  });
  const tabAt = (H: number) => frame('Overlay / Tab bar', [0, H - 98, 390, 64], [], { position: 'absolute', layout: 'row', ...solidFill });

  it('mobile panjang 390×1320 dengan tab bar di H−98, isi pas → tanpa temuan ukuran; lebar lain atau < 844 → temuan', () => {
    expect(run(long(1320, 1222 - 24, [tabAt(1320)]))).toEqual([]);
    expect(run(long(1177, 1177 - 24))).toEqual([]);
    expect(run({ children: [], width: 400, height: 1320 })[0]!.detail).toBe('ukuran 400×1320');
    expect(run({ children: [], height: 700 })[0]!.expected).toContain('tinggi ≥ 844');
  });

  it('mobile panjang tidak pas: isi berakhir 200 px di atas zona → warning "tinggi pas = N"', () => {
    const f = only(run(long(1320, 1222 - 200, [tabAt(1320)])), 'LC-12');
    expect(f).toHaveLength(1);
    expect(f[0]!.detail).toBe('tinggi 1320, isi berakhir 200 px di atas zona bawah: tinggi pas = 1144');
    expect(summarizeFindings(f).gate).toBe(0);
    // Tanpa zona: dihitung ke tepi bawah board.
    expect(only(run(long(1320, 1000)), 'LC-12')[0]!.detail).toBe('tinggi 1320, isi berakhir 320 px di atas tepi bawah: tinggi pas = 1024');
    // Board 844 tidak dinilai tinggi pas.
    expect(run(long(844, 600))).toEqual([]);
  });

  it('pola lama: Scroll / ber-scrollY > 0 → warning pola dua board usang', () => {
    const s = frame('Scroll / Konten', [0, 0, 390, 844], [rect('Isi', [0, -300, 390, 1100])], { clip: true, scrollY: 300 });
    const f = only(run(clean([s])), 'LC-12');
    expect(f[0]!.detail).toBe('pola dua board usang (Scroll / Konten scrollY 300)');
    expect(f[0]!.expected).toContain('satu board panjang');
    expect(only(run(clean([frame('Scroll / Konten', [0, 0, 390, 844], [], { clip: true })])), 'LC-12')).toEqual([]);
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
    expect(rules(f)).toEqual(['LC-20', 'LC-12']);
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

describe('LC-20 zona bawah struktural', () => {
  const solid = { fills: [{ type: 'solid', color: '#FFFFFF' }] };
  const abs = (name: string, r: R, extra: Loose = {}) => frame(name, r, [], { position: 'absolute', layout: 'row', ...solid, ...extra });
  const scroll = (kids: Loose[]) => frame('Scroll / Konten', [0, 0, 390, 844], kids, { clip: true });
  const lc20 = (f: Finding[]) => only(f, 'LC-20');
  const C7 = /rubrik|juri|skor|golden/i;

  it('(a) kartu terpotong bilah aksi absolut → satu temuan pada kartu (unit terluar saja)', () => {
    const kartu = frame('Kartu / Ulasan', [16, 662, 358, 98], [text('Isi ulasan', [32, 678, 300, 20]), rect('Avatar', [32, 702, 40, 40], solid)], solid);
    const bar = abs('Bilah aksi', [0, 738, 390, 106]);
    const f = run(clean([scroll([rect('Atas', [0, 0, 390, 662]), kartu, rect('Bawah', [0, 770, 390, 400])]), bar]));
    expect(f.map((x) => [x.rule, x.nodeId])).toEqual([['LC-20', kartu.id]]);
    expect(f[0]!.detail).toBe(`kartu terpotong zona bawah: terlihat y 662–738, tertutup "Bilah aksi" (${bar.id}) mulai y 738`);
    expect(f[0]!.expected).toBe('seluruhnya di atas y 730 (zona − 8) atau seluruhnya di bawah zona: geser/padatkan konten di atasnya, atau akhiri layar pertama sebelum kartu ini');
    expect(`${f[0]!.detail} ${f[0]!.expected}`).not.toMatch(C7);
  });

  it('(a′) elemen absolut sebelum konten (z-order) atau tanpa fill bukan zona', () => {
    const kids = () => [rect('Atas', [0, 0, 390, 662]), rect('Kartu', [16, 662, 358, 98], solid), rect('Bawah', [0, 770, 390, 400])];
    expect(lc20(run(clean([abs('Bilah aksi', [0, 738, 390, 106]), scroll(kids())])))).toEqual([]);
    expect(lc20(run(clean([scroll(kids()), abs('Bilah aksi', [0, 738, 390, 106], { fills: [] })])))).toEqual([]);
    expect(lc20(run(clean([scroll(kids()), abs('Bilah aksi', [0, 738, 390, 106], { fills: undefined, backdropBlur: 20 })])))).toHaveLength(1);
    // Anak flow (non-absolut) tidak pernah jadi anggota zona; lebar < 50% juga bukan.
    expect(lc20(run(clean([scroll(kids()), frame('Bilah aksi', [0, 738, 390, 106], [], solid)])))).toEqual([]);
    expect(lc20(run(clean([scroll(kids()), abs('FAB', [300, 738, 80, 80])])))).toEqual([]);
  });

  it('(b) judul seksi yatim di atas mini player + tab bar → satu temuan pada judul; kartu seksi tidak terpisah', () => {
    const judul = text('Episode baru', [16, 650, 200, 22], { size: 22, name: 'Judul' });
    const item = (y: number) => frame(`Item ${y}`, [16, y, 358, 100], [text('Eps. 1', [32, y + 16, 200, 20])], solid);
    const seksi = frame('Seksi / Episode baru', [0, 650, 390, 400], [judul, frame('Daftar', [0, 686, 390, 364], [item(686), item(794)])], { gap: 14 });
    const f = run(clean([scroll([rect('Atas', [0, 0, 390, 634]), seksi]), abs('Mini player', [8, 690, 374, 56]), abs('Tab bar', [0, 746, 390, 64])]));
    expect(f.map((x) => [x.rule, x.nodeId])).toEqual([['LC-20', judul.id]]);
    expect(f[0]!.detail).toBe(`judul seksi "Episode baru" di Seksi / Episode baru (${seksi.id}) terlihat, isinya tertutup zona bawah "Mini player" + "Tab bar" mulai y 690`);
    expect(f[0]!.expected).toBe('tampilkan ≥ 24 px isi di atas y 690 atau pindahkan seluruh seksi ke bawah zona (akhiri layar pertama dengan rapi)');
  });

  it('(b′) judul tidak lebih besar dari isi, atau isi terlihat ≥ 24 px → bukan judul yatim', () => {
    const mk = (size: number, listY: number) =>
      run(
        clean([
          scroll([rect('Atas', [0, 0, 390, 634]), frame('Seksi', [0, 650, 390, 400], [text('Judul', [16, 650, 200, 22], { size }), frame('Daftar', [0, listY, 390, 364], [text('Isi', [16, listY, 200, 20], { size: 14 })])])]),
          abs('Mini player', [8, 690, 374, 56]),
          abs('Tab bar', [0, 746, 390, 64]),
        ]),
      );
    const heading = (f: Finding[]) => lc20(f).filter((x) => x.detail.startsWith('judul seksi'));
    // Judul 14 px = isi 14 px: bukan judul; teks isi yang terpotong tetap dilaporkan sebagai unit.
    expect(heading(mk(14, 686))).toEqual([]);
    expect(lc20(mk(14, 686)).map((x) => x.detail.split(':')[0])).toEqual(['teks terpotong zona bawah']);
    expect(lc20(mk(22, 660))).toEqual([]);
  });

  it('(b″) latar absolut setinggi layar di awal board tidak memutus tumpukan zona', () => {
    const judul = text('Episode baru', [16, 650, 200, 22], { size: 22, name: 'Judul' });
    const seksi = frame('Seksi', [0, 650, 390, 400], [judul, frame('Daftar', [0, 686, 390, 364], [frame('Item', [16, 686, 358, 100], [text('Eps. 1', [32, 702, 200, 20])], solid)])]);
    const f = run(clean([abs('Latar', [0, 0, 390, 844]), scroll([rect('Atas', [0, 0, 390, 634]), seksi]), abs('Mini player', [8, 690, 374, 56]), abs('Tab bar', [0, 746, 390, 64])]));
    expect(f.map((x) => [x.rule, x.nodeId])).toEqual([['LC-20', judul.id]]);
  });

  it('wadah utama / Scroll ber-fill gambar bukan unit; kartu terpotong clip gulir tepat di tepi zona → "terpotong"', () => {
    const img = { fills: [{ type: 'image', assetId: 'a'.repeat(64), fit: 'cover' }] };
    const s = frame('Scroll / Konten', [0, 0, 390, 844], [rect('Atas', [0, 0, 390, 700]), rect('Lanjut', [0, 790, 390, 400])], { clip: true, ...img });
    expect(lc20(run(clean([s, abs('Tab bar', [0, 780, 390, 64])])))).toEqual([]);
    const kartu = rect('Kartu', [16, 640, 358, 150], solid);
    const feed = frame('Scroll / Feed', [0, 0, 390, 780], [rect('Atas', [0, 0, 390, 630]), kartu], { clip: true });
    const f = lc20(run(clean([feed, abs('Tab bar', [0, 780, 390, 64])])));
    expect(f.map((x) => x.nodeId)).toEqual([kartu.id]);
    expect(f[0]!.detail).toMatch(/^kartu terpotong zona bawah: terlihat y 640–780/);
  });

  it('(c) tab bar absolut ber-fill, konten berakhir ≥ 8 px di atasnya → tanpa temuan', () => {
    expect(run(clean([frame('Konten', [0, 0, 390, 772], [rect('Kartu', [16, 600, 358, 172], solid)]), abs('Tab bar', [0, 780, 390, 64])]))).toEqual([]);
  });

  it('(d) layar gulir: kartu terakhir terlihat utuh ≤ Z − 8, berikutnya seluruhnya di bawah zona → tanpa temuan', () => {
    const kids = [rect('Kartu 1', [16, 0, 358, 550], solid), rect('Kartu 2', [16, 560, 358, 210], solid), rect('Kartu 3', [16, 786, 358, 200], solid)];
    expect(run(clean([scroll(kids), abs('Tab bar', [0, 780, 390, 64])]))).toEqual([]);
  });

  it('(e)(f) landing desktop tanpa elemen bawah; footer anak flow di tepi bawah → tanpa temuan', () => {
    const landing = (kids: Loose[]) => run({ screen: 'landing', width: 1440, height: 3000, children: kids });
    expect(landing([frame('Hero', [0, 0, 1440, 800], [], solid), frame('Fitur', [0, 800, 1440, 2200], [], solid)])).toEqual([]);
    expect(landing([frame('Isi', [0, 0, 1440, 2600], [rect('Blok', [0, 2400, 1440, 200], solid)]), frame('Footer', [0, 2600, 1440, 400], [text('© Kopi', [80, 2700, 200, 20])], solid)])).toEqual([]);
  });

  it('Crop dinilai sebagai satu unit (isinya dilewati)', () => {
    const img = { fills: [{ type: 'image', assetId: 'a'.repeat(64), fit: 'cover' }] };
    const crop = frame('Crop / Foto', [16, 700, 358, 100], [rect('Foto', [0, 650, 400, 300], img)], { clip: true });
    const f = lc20(run(clean([scroll([rect('Atas', [0, 0, 390, 700]), crop, rect('Lanjut', [0, 800, 390, 400])]), abs('Tab bar', [0, 780, 390, 64])])));
    expect(f.map((x) => x.nodeId)).toEqual([crop.id]);
    expect(f[0]!.detail).toMatch(/^gambar terpotong zona bawah: terlihat y 700–780/);
  });

  it('baris berstroke sebagian dinilai dari isinya; sliver teks tanpa tinta tidak dilaporkan', () => {
    const line = { stroke: { color: '#E5E5E5', width: 1, align: 'inside', sides: ['bottom'] } };
    const row = (y: number) => frame(`Baris ${y}`, [16, y, 358, 66], [text('Nama', [32, y + 12, 200, 20], { size: 14 })], { layout: 'row', ...line });
    // Baris 670–736 (isi 682–702) utuh; baris 736–802 hanya 2 px kosong di atas zona.
    expect(lc20(run(clean([scroll([rect('Atas', [0, 0, 390, 670]), row(670), row(736), row(802)]), abs('Bilah', [0, 738, 390, 106])])))).toEqual([]);
    const cutRow = row(700);
    const f = lc20(run(clean([scroll([rect('Atas', [0, 0, 390, 700]), cutRow, row(766), row(832)]), abs('Bilah', [0, 738, 390, 106])])));
    expect(f.map((x) => x.nodeId)).toEqual([cutRow.id]);
    expect(f[0]!.detail).toMatch(/^baris /);
    const sliver = text('Judul', [16, 736, 200, 28], { size: 20, lineHeight: 28 });
    expect(lc20(run(clean([scroll([rect('Atas', [0, 0, 390, 736]), sliver, rect('Lanjut', [0, 764, 390, 400])]), abs('Bilah', [0, 738, 390, 106])])))).toEqual([]);
  });

  it('posisi akhir: padding bawah wadah transparan tidak dihitung sebagai konten', () => {
    const wrap = frame('Konten', [0, 0, 390, 690], [rect('Kartu', [16, 0, 358, 666], solid)], { padding: [0, 0, 24, 0] });
    const s = frame('Scroll / Konten', [0, 0, 390, 844], [wrap], { clip: true, scrollY: 400 });
    expect(lc20(run(clean([s, abs('Mini player', [8, 690, 374, 56]), abs('Tab bar', [0, 746, 390, 64])])))).toEqual([]);
  });

  // Tab bar mengambang (celah di bawahnya): kartu ber-fill tinggi 64 jarak 8 di Scroll yang clip sampai 844.
  const card = (y: number) => frame(`Kartu ${y}`, [16, y, 358, 64], [text(`Eps. ${y}`, [32, y + 20, 200, 20])], solid);
  const floatBar = () => abs('Tab bar', [20, 756, 350, 64]);

  it('(B1) tab bar mengambang: kartu terlihat di celah di bawahnya dan terpotong tepi board → satu temuan pada kartu', () => {
    const peek = card(830);
    const f = lc20(run(clean([scroll([rect('Atas', [0, 0, 390, 676]), card(676), frame('Jeda', [0, 748, 390, 74], []), peek]), floatBar()])));
    expect(f.map((x) => x.nodeId)).toEqual([peek.id]);
    expect(f[0]!.detail).toBe(`kartu terlihat di celah di bawah zona bawah mengambang "Tab bar" (${f[0]!.detail.match(/\((\w+)\)/)![1]}) (y 830–844), terpotong`);
    expect(f[0]!.expected).toBe('jangan biarkan konten terlihat di celah di bawah bar mengambang: akhiri daftar sebelum zona, beri latar penutup sampai tepi bawah, atau tempelkan bar ke tepi bawah');
    expect(`${f[0]!.detail} ${f[0]!.expected}`).not.toMatch(C7);
  });

  it('(B1′) kartu sebagian di belakang zona yang menyembul ke celah → temuan; kartu utuh sepenuhnya di celah → tidak', () => {
    const behind = rect('Kartu', [16, 790, 358, 40], solid);
    const f = lc20(run(clean([scroll([rect('Atas', [0, 0, 390, 676]), card(676), frame('Jeda', [0, 748, 390, 42], []), behind, frame('Ekor', [0, 838, 390, 300], [])]), floatBar()])));
    expect(f.map((x) => x.nodeId)).toEqual([behind.id]);
    expect(f[0]!.detail).toMatch(/\(y 820–830\), sebagian di belakang zona$/);
    const whole = rect('Kartu', [16, 824, 358, 16], solid);
    expect(lc20(run(clean([scroll([rect('Atas', [0, 0, 390, 676]), card(676), frame('Jeda', [0, 748, 390, 76], []), whole, frame('Ekor', [0, 848, 390, 300], [])]), floatBar()])))).toEqual([]);
  });

  it('(B1″) celah ditutup node ber-fill sesudah konten (Home indicator ber-fill) → tanpa temuan', () => {
    const peek = card(830);
    const hi = rect('Home indicator', [0, 820, 390, 24], solid);
    expect(lc20(run(clean([scroll([rect('Atas', [0, 0, 390, 676]), card(676), frame('Jeda', [0, 748, 390, 74], []), peek]), floatBar(), hi])))).toEqual([]);
  });

  it('(B2) tab bar mengambang bersih: konten terakhir ≤ zona − 8, celah kosong → tanpa temuan', () => {
    expect(lc20(run(clean([scroll([rect('Atas', [0, 0, 390, 676]), card(676)]), floatBar()])))).toEqual([]);
    expect(lc20(run(clean([scroll([rect('Atas', [0, 0, 390, 676]), card(676), frame('Jeda', [0, 748, 390, 300], [])]), floatBar()])))).toEqual([]);
  });

  it('(B3) kapsul mengambang dengan celah 60 px (> 48) tetap zona; kartu terpotong di tepinya → temuan', () => {
    const kartu = rect('Kartu', [16, 700, 358, 72], solid);
    const kapsul = abs('Kapsul', [16, 720, 358, 64]);
    const f = lc20(run(clean([scroll([rect('Atas', [0, 0, 390, 700]), kartu, frame('Lanjut', [0, 780, 390, 400], [])]), kapsul])));
    expect(f.map((x) => x.nodeId)).toEqual([kartu.id]);
    expect(f[0]!.detail).toBe(`kartu terpotong zona bawah: terlihat y 700–720, tertutup "Kapsul" (${kapsul.id}) mulai y 720`);
    // Terlalu tinggi untuk bar mengambang (> 120) atau terlalu jauh (> 96) → bukan zona.
    expect(lc20(run(clean([scroll([rect('Atas', [0, 0, 390, 600]), rect('Kartu', [16, 600, 358, 72], solid)]), abs('Panel', [16, 620, 358, 164])])))).toEqual([]);
    expect(lc20(run(clean([scroll([rect('Atas', [0, 0, 390, 600]), rect('Kartu', [16, 600, 358, 72], solid)]), abs('Kapsul', [16, 620, 358, 64])])))).toEqual([]);
  });

  it('(B4) kapsul ber-fill di dalam pembungkus absolut transparan = anggota zona', () => {
    const kartu = rect('Kartu', [16, 700, 358, 72], solid);
    const kapsul = frame('Kapsul', [16, 756, 358, 64], [], { layout: 'row', ...solid });
    const wrap = frame('Bawah', [0, 740, 390, 104], [kapsul], { position: 'absolute' });
    const f = lc20(run(clean([scroll([rect('Atas', [0, 0, 390, 700]), kartu, frame('Lanjut', [0, 780, 390, 400], [])]), wrap])));
    expect(f.map((x) => x.nodeId)).toEqual([kartu.id]);
    expect(f[0]!.detail).toBe(`kartu terpotong zona bawah: terlihat y 700–756, tertutup "Kapsul" (${kapsul.id}) mulai y 756`);
    // Pembungkus ber-fill sendiri adalah kandidat biasa; pembungkus flow (bukan absolut) bukan pembungkus.
    expect(lc20(run(clean([scroll([rect('Atas', [0, 0, 390, 700]), kartu, frame('Lanjut', [0, 780, 390, 400], [])]), frame('Bawah', [0, 740, 390, 104], [frame('Kapsul', [16, 756, 358, 64], [], solid)])])))).toEqual([]);
  });

  // Dua bar bertumpuk dengan celah 8 di antaranya (mini player y674–738, tab bar y746–810); Home indicator ber-fill menutup sisanya.
  const mini = (h = 64) => abs('Mini player', [8, 674, 374, h]);
  const tabs = () => abs('Tab bar', [0, 746, 390, 64]);
  const home = () => rect('Home indicator', [0, 810, 390, 34], solid);

  it('(L1) celah antar-bar: kartu di bawah kedua bar mengintip di celah → satu temuan pada kartu', () => {
    const kartu = rect('Kartu', [16, 700, 358, 80], solid);
    const f = lc20(run(clean([scroll([rect('Atas', [0, 0, 390, 666]), frame('Jeda', [0, 666, 390, 34], []), kartu, frame('Lanjut', [0, 780, 390, 400], [])]), mini(), tabs(), home()])));
    expect(f.map((x) => x.nodeId)).toEqual([kartu.id]);
    expect(f[0]!.detail).toBe('kartu terlihat di celah di antara bar zona bawah "Mini player" dan "Tab bar" (y 738–746), sebagian tertutup bar');
    expect(f[0]!.expected).toBe('jangan biarkan konten mengintip di celah antar-bar: rapatkan bar (celah 0), beri latar penutup di belakang keduanya, atau akhiri daftar sebelum zona');
    expect(`${f[0]!.detail} ${f[0]!.expected}`).not.toMatch(C7);
  });

  it('(L1′) kedua bar di dalam pembungkus `Overlay /` transparan → tetap satu temuan pada kartu', () => {
    const kartu = rect('Kartu', [16, 700, 358, 80], solid);
    const wrap = frame('Overlay / Bawah', [0, 674, 390, 136], [mini(), tabs()], { position: 'absolute', layout: 'none' });
    const f = lc20(run(clean([scroll([rect('Atas', [0, 0, 390, 666]), frame('Jeda', [0, 666, 390, 34], []), kartu, frame('Lanjut', [0, 780, 390, 400], [])]), wrap, home()])));
    expect(f.map((x) => x.nodeId)).toEqual([kartu.id]);
    expect(f[0]!.detail).toBe('kartu terlihat di celah di antara bar zona bawah "Mini player" dan "Tab bar" (y 738–746), sebagian tertutup bar');
  });

  it('(L2) celah antar-bar bersih: konten berakhir ≤ zona − 8, atau celah ditutup panel latar / anggota zona → tanpa temuan', () => {
    expect(lc20(run(clean([scroll([rect('Atas', [0, 0, 390, 594]), rect('Kartu', [16, 594, 358, 64], solid)]), mini(), tabs(), home()])))).toEqual([]);
    const body = () => scroll([rect('Atas', [0, 0, 390, 666]), frame('Jeda', [0, 666, 390, 34], []), rect('Kartu', [16, 700, 358, 80], solid), frame('Lanjut', [0, 780, 390, 400], [])]);
    expect(lc20(run(clean([body(), rect('Latar', [0, 674, 390, 170], { position: 'absolute', ...solid }), mini(), tabs(), home()])))).toEqual([]);
    expect(lc20(run(clean([body(), mini(), abs('Pemisah', [0, 736, 390, 12]), tabs(), home()])))).toEqual([]);
  });

  it('(L3) bar menempel (celah 0) → sub-cek celah antar-bar tidak memicu', () => {
    expect(lc20(run(clean([scroll([rect('Atas', [0, 0, 390, 666]), frame('Jeda', [0, 666, 390, 34], []), rect('Kartu', [16, 700, 358, 80], solid), frame('Lanjut', [0, 780, 390, 400], [])]), mini(72), tabs(), home()])))).toEqual([]);
  });

  it('(L4) unit utuh di dalam celah antar-bar → tidak dilaporkan', () => {
    expect(lc20(run(clean([scroll([rect('Atas', [0, 0, 390, 666]), frame('Jeda', [0, 666, 390, 73], []), rect('Garis', [16, 739, 358, 6], solid), frame('Lanjut', [0, 745, 390, 400], [])]), mini(), tabs(), home()])))).toEqual([]);
  });
});

describe('LC-20 board mobile panjang', () => {
  const solid = { fills: [{ type: 'solid', color: '#FFFFFF' }] };
  const H = 1320;
  const tab = () => frame('Overlay / Tab bar', [0, H - 98, 390, 64], [], { position: 'absolute', layout: 'row', ...solid });
  const home = () => rect('Home indicator', [128, H - 13, 134, 5], { position: 'absolute', ...solid });
  const body = (padBottom: number) => {
    const end = H - 98 - padBottom;
    return frame('Konten', [0, 0, 390, end], [rect('Atas', [16, 60, 358, end - 260], solid), frame('Butir terakhir', [16, end - 190, 358, 190], [text('Ganti oli', [32, end - 170, 200, 20])], solid)]);
  };

  it('positif: butir terakhir di bawah tab bar yang menempel di bawah board', () => {
    const f = only(run({ height: H, children: [body(-40), tab(), home()] }), 'LC-20');
    expect(f).toHaveLength(1);
    expect(f[0]!.detail).toContain(`mulai di y ${H - 98}`);
  });

  it('negatif: padding bawah cukup', () => {
    expect(run({ height: H, children: [body(24), tab(), home()] })).toEqual([]);
  });
});

describe('LC-31 mockup terpotong rata', () => {
  const solid = { fills: [{ type: 'solid', color: '#FFFFFF' }] };
  const card = (r: R) => frame('Dasbor', r, [text('Reservasi malam ini', [r[0] + 24, r[1] + 24, 300, 24])], { ...solid, radius: 16 });
  const landing = (kids: Loose[]) => run({ screen: 'landing', width: 1440, height: 2000, children: kids });

  it('positif: kartu di Crop / yang rata dengan tepi bawah hero → error gerbang', () => {
    const k = card([680, 300, 680, 520]);
    const crop = frame('Crop / Dasbor', [680, 300, 680, 420], [k], { clip: true, layout: 'none' });
    const hero = frame('Hero', [0, 0, 1440, 720], [crop], { layout: 'row', ...solid });
    const f = only(landing([hero, frame('Fitur', [0, 720, 1440, 1280], [], solid)]), 'LC-31');
    expect(f.map((x) => [x.nodeId, x.level, x.detail])).toEqual([[k.id, 'error', 'terpotong rata 100px di tepi bawah Hero']]);
    expect(f[0]!.expected).toBe('tampilkan utuh (padding bawah ≥ 64) atau kurangi isi');
    expect(summarizeFindings(f).gate).toBe(1);
  });

  it('positif: hanya kartu terluar; tepi Crop rata dengan tepi bawah board mobile', () => {
    const inner = frame('Baris', [32, 760, 326, 60], [text('Isi', [40, 770, 100, 20])], solid);
    const k = frame('Kartu', [16, 700, 358, 200], [text('Judul', [32, 716, 200, 20]), inner], solid);
    const crop = frame('Crop / Pratinjau', [16, 700, 358, 144], [k], { clip: true, layout: 'none' });
    const f = only(run({ children: [frame('Konten', [0, 0, 390, 844], [rect('Atas', [0, 0, 390, 700]), crop])] }), 'LC-31');
    expect(f.map((x) => [x.nodeId, x.detail])).toEqual([[k.id, 'terpotong rata 56px di tepi bawah Home']]);
  });

  it('negatif: hero utuh dengan padding bawah; kartu fitur ber-Crop / selebar < 90% board', () => {
    const k = card([680, 300, 680, 320]);
    const hero = frame('Hero', [0, 0, 1440, 720], [frame('Crop / Dasbor', [680, 300, 680, 356], [k], { clip: true, layout: 'none' })], solid);
    expect(only(landing([hero]), 'LC-31')).toEqual([]);
    const panel = frame('Panel', [120, 900, 400, 300], [text('Grafik', [140, 920, 100, 20])], solid);
    const fitur = frame('Kartu fitur', [80, 800, 440, 300], [frame('Crop / Panel', [100, 880, 400, 220], [panel], { clip: true, layout: 'none' })], { ...solid, padding: [24, 20, 0, 20] });
    expect(only(landing([frame('Fitur', [0, 760, 1440, 400], [fitur], solid)]), 'LC-31')).toEqual([]);
  });

  it('negatif: tanpa teks, transparan, di Scroll /, Overlay /, atau berotasi', () => {
    const mk = (k: Loose) => only(landing([frame('Hero', [0, 0, 1440, 720], [frame('Crop / Dasbor', [680, 300, 680, 420], [k], { clip: true, layout: 'none' })], solid)]), 'LC-31');
    expect(mk(frame('Foto', [680, 300, 680, 520], [], solid))).toEqual([]);
    expect(mk(frame('Dasbor', [680, 300, 680, 520], [text('A', [700, 320, 100, 20])]))).toEqual([]);
    expect(mk(frame('Overlay / Dasbor', [680, 300, 680, 520], [text('A', [700, 320, 100, 20])], solid))).toEqual([]);
    expect(mk(frame('Dasbor', [680, 300, 680, 520], [text('A', [700, 320, 100, 20])], { ...solid, rotation: -4 }))).toEqual([]);
    const s = frame('Scroll / Isi', [0, 0, 390, 844], [frame('Kartu', [16, 700, 358, 200], [text('A', [32, 716, 100, 20])], solid)], { clip: true });
    expect(only(run(clean([s])), 'LC-31')).toEqual([]);
  });

  it('kartu yang sudah dilaporkan LC-02a (clip biasa) tidak dilaporkan lagi', () => {
    const k = card([680, 300, 680, 520]);
    const hero = frame('Hero', [0, 0, 1440, 720], [k], { ...solid, clip: true });
    const f = landing([hero]);
    expect(rules(f)).toContain('LC-02a');
    expect(only(f, 'LC-31')).toEqual([]);
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
    // Dengan zona bawah (tab bar absolut ber-fill): LC-20 menilai setiap node.
    const z = docOf([{ children: [...children, rect('Tab bar', [0, 780, 390, 64], { position: 'absolute', fills: [{ type: 'solid', color: '#FFFFFF' }] })], height: 844 }]);
    const zm = z.measures.get(z.boards[0]!)!;
    checkBoard({ doc: z.doc, boardId: z.boards[0]!, measure: zm });
    const t1 = performance.now();
    checkBoard({ doc: z.doc, boardId: z.boards[0]!, measure: zm });
    const ms2 = performance.now() - t1;
    testLog(`[check] aturan G0 500 node + zona bawah: ${ms2.toFixed(2)} ms`);
    expect(ms2).toBeLessThan(100);
  });
});


// ---------------------------------------------------------------------------
// Aturan polesan (story 1.23)
// ---------------------------------------------------------------------------

const solidFill = (c: string) => ({ fills: [{ type: 'solid', color: c }] });
const badgeOf = (label: string, r: R, extra: Loose = {}) =>
  frame(`Badge / ${label}`, r, [text(label, [r[0] + 6, r[1] + 2, r[2] - 12, 16], { size: 12, name: 'Teks', color: '#0B5A2B' })], { layout: 'row', ...solidFill('#15803D1F'), radius: 9999, ...extra });

describe('LC-02b ink teks meluap dari induk', () => {
  /** Baris daftar B round-2: kolom teks fill 122, judul hug meluap ke lencana. */
  const row = (inkW: number, badgeX = 286) => {
    const judul = text('Kekuatan tubuh atas', [152, 10, 122, 20], { name: 'Judul', size: 14, lineHeight: 20, _ink: [152, 10, inkW, 20], _lh: 20 });
    const teks = frame('Teks', [152, 10, 122, 40], [judul, text('40 mnt', [152, 30, 122, 20], { name: 'Meta', _ink: [152, 30, 40, 20], _lh: 20 })]);
    const badge = badgeOf('Berikutnya', [badgeX, 18, 80, 24]);
    return { judul, spec: clean([frame('Item', [20, 0, 350, 60], [teks, badge], { layout: 'row', padding: [10, 16], ...solidFill('#241D18') })]) };
  };

  it('positif: ink melewati kolom dan menabrak lencana', () => {
    const { judul, spec } = row(138.5, 286);
    const f = only(run(spec), 'LC-02b');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: 'error', nodeId: judul.id });
    expect(f[0]!.detail).toContain('16.5px di kanan');
  });

  it('negatif: ink pas di kolom; luapan kecil ke padding yang masih lega', () => {
    expect(only(run(row(120).spec), 'LC-02b')).toEqual([]);
    // kartu padding 16, teks meluap 2px ke padding kanan → sisa 14px ke tepi kartu
    const t = text('Tambal komposit', [16, 16, 100, 20], { _ink: [16, 16, 102, 20], _lh: 20 });
    expect(only(run(clean([frame('Kartu', [0, 0, 132, 52], [t], { padding: 16, ...solidFill('#F6F7F9') })])), 'LC-02b')).toEqual([]);
  });

  it('negatif: di dalam Crop / atau Overlay /', () => {
    const t = text('Judul panjang sekali', [0, 0, 60, 20], { _ink: [0, 0, 160, 20] });
    expect(only(run(clean([frame('Crop / Foto', [0, 0, 80, 40], [t], { ...solidFill('#000000') })])), 'LC-02b')).toEqual([]);
  });
});

describe('LC-11 saudara tumpang tindih sebagian', () => {
  it('positif: dua teks absolut beririsan sebagian', () => {
    const a = text('Label kiri', [0, 0, 100, 20], { position: 'absolute' });
    const b = text('Label kanan', [80, 10, 100, 20], { position: 'absolute' });
    const f = only(run(clean([frame('Grafik', [0, 0, 300, 100], [a, b], { layout: 'none' })])), 'LC-11');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: 'error', nodeId: b.id });
  });

  it('positif: ink teks flow menimpa saudara flow', () => {
    const t = text('Judul yang terlalu panjang', [0, 0, 100, 20], { _ink: [0, 0, 150, 20] });
    const i = { type: 'icon', id: nid(), name: 'Ikon', lib: 'lucide', icon: 'check', size: 20, _r: [120, 0, 20, 20] };
    expect(only(run(clean([frame('Baris', [0, 0, 200, 20], [t, i], { layout: 'row' })])), 'LC-11')).toHaveLength(1);
  });

  it('negatif: label termuat penuh di dalam bentuk (layout none), Overlay /, gap negatif', () => {
    const ring = frame('Ring', [0, 0, 96, 96], [{ type: 'ellipse', id: nid(), name: 'Jalur', _r: [0, 0, 96, 96] }, frame('Tengah', [0, 0, 96, 96], [text('60%', [30, 38, 36, 20])], { position: 'absolute' })], { layout: 'none' });
    expect(only(run(clean([ring])), 'LC-11')).toEqual([]);
    const ov = frame('Kartu', [0, 0, 300, 100], [text('A', [0, 0, 100, 20], { position: 'absolute' }), frame('Overlay / Lencana', [80, 10, 100, 20], [text('B', [80, 10, 100, 20])], { position: 'absolute' })], { layout: 'none' });
    expect(only(run(clean([ov])), 'LC-11')).toEqual([]);
    const avatars = frame('Avatar', [0, 0, 100, 40], [frame('A1', [0, 0, 40, 40], [text('AB', [10, 10, 20, 20])]), frame('A2', [28, 0, 40, 40], [text('CD', [38, 10, 20, 20])])], { layout: 'row', gap: -12 });
    expect(only(run(clean([avatars])), 'LC-11')).toEqual([]);
  });
});

describe('LC-04 kontras teks', () => {
  it('positif: abu muda di atas putih (error, gerbang)', () => {
    const t = text('Keterangan', [0, 0, 100, 20], { color: '#98A2B3' });
    const f = only(run(clean([t])), 'LC-04');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: 'error', nodeId: t.id });
    expect(f[0]!.detail).toMatch(/kontras 2\.\d+:1 \(#98A2B3 di atas #FFFFFF\)/);
    expect(summarizeFindings(f).gate).toBe(1);
  });

  it('positif: teks lencana nada terang di atas tint hex8 (komposit)', () => {
    const t = text('Selesai', [6, 2, 50, 16], { size: 12, color: '#15803D' });
    const f = only(run(clean([frame('Badge / Selesai', [0, 0, 62, 20], [t], { layout: 'row', ...solidFill('#15803D1F') })])), 'LC-04');
    expect(f).toHaveLength(1);
    expect(f[0]!.detail).toContain('4.25:1');
  });

  it('negatif: teks gelap; teks besar ≥ 3:1; nada gelap di atas tint', () => {
    expect(only(run(clean([text('Judul', [0, 0, 100, 20], { color: '#101828' })])), 'LC-04')).toEqual([]);
    expect(only(run(clean([text('Judul besar', [0, 0, 200, 32], { size: 24, color: '#8A8A8A' })])), 'LC-04')).toEqual([]);
    expect(only(run(clean([text('Judul kecil', [0, 0, 200, 20], { size: 14, color: '#8A8A8A' })])), 'LC-04')).toHaveLength(1);
    const t = text('Selesai', [6, 2, 50, 16], { size: 12, color: '#0B5A2B' });
    expect(only(run(clean([frame('Badge / Selesai', [0, 0, 62, 20], [t], { layout: 'row', ...solidFill('#15803D1F') })])), 'LC-04')).toEqual([]);
  });

  it('dilewati: teks di atas foto tanpa scrim, atau tertutup sebagian lapisan', () => {
    const img = { fills: [{ type: 'image', assetId: 'a'.repeat(64), fit: 'cover' }] };
    expect(only(run(clean([frame('Image / Sampul', [0, 0, 200, 100], [text('Judul', [10, 10, 100, 20], { color: '#FFFFFF' })], img)])), 'LC-04')).toEqual([]);
    const partial = frame('Kartu', [0, 0, 200, 100], [rect('Pita', [0, 0, 50, 100], { position: 'absolute', ...solidFill('#000000') }), text('Judul', [10, 10, 100, 20], { color: '#FFFFFF', position: 'absolute' })], { layout: 'none', ...solidFill('#FFFFFF') });
    expect(only(run(clean([partial])), 'LC-04')).toEqual([]);
  });

  it('gradien atau opacity → warning (stop terburuk), tidak dihitung gerbang', () => {
    const grad = { fills: [{ type: 'linear', angle: 90, stops: [{ offset: 0, color: '#0F172A' }, { offset: 1, color: '#94A3B8' }] }] };
    const f = only(run(clean([frame('Hero', [0, 0, 300, 100], [text('Judul', [10, 10, 100, 20], { color: '#FFFFFF' })], grad)])), 'LC-04');
    expect(f).toHaveLength(1);
    expect(f[0]!.level).toBe('warning');
    expect(f[0]!.detail).toContain('#94A3B8');
    expect(summarizeFindings(f).gate).toBe(0);
    const op = only(run(clean([text('Redup', [0, 0, 100, 20], { color: '#667085', opacity: 0.6 })])), 'LC-04');
    expect(op.map((x) => x.level)).toEqual(['warning']);
  });
});

describe('LC-23 celah teks ↔ badge/tombol/ikon', () => {
  const rowWith = (gapPx: number, name = 'Baris') =>
    frame(name, [0, 0, 300, 24], [text('Kopi susu', [0, 2, 100, 20], { _ink: [0, 2, 100, 20] }), badgeOf('Baru', [100 + gapPx, 0, 50, 24])], { layout: 'row' });
  it('positif: celah 4 → warning', () => {
    const f = only(run(clean([rowWith(4)])), 'LC-23');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: 'warning' });
    expect(f[0]!.detail).toContain('celah 4px');
  });
  it('negatif: celah 12; di dalam Button /; ikon < 20', () => {
    expect(only(run(clean([rowWith(12)])), 'LC-23')).toEqual([]);
    expect(only(run(clean([frame('Button / Kirim', [0, 0, 300, 40], [rowWith(4, 'Isi')], { layout: 'row' })])), 'LC-23')).toEqual([]);
    const i = { type: 'icon', id: nid(), name: 'Ikon', lib: 'lucide', icon: 'check', size: 16, _r: [104, 4, 16, 16] };
    expect(only(run(clean([frame('Baris', [0, 0, 300, 24], [text('Kopi', [0, 2, 100, 20]), i], { layout: 'row' })])), 'LC-23')).toEqual([]);
  });
});

describe('LC-24 proporsi badge di baris', () => {
  const rowWith = (badgeH: number, wrapper = false) => {
    const b = badgeOf('Berikutnya', [250, 0, 80, badgeH]);
    const kids = [frame('Teks', [0, 0, 200, 40], [text('Percakapan', [0, 0, 200, 20], { size: 14, lineHeight: 20, _lh: 20 }), text('Unit 4', [0, 20, 200, 20], { size: 14, _lh: 20 })]), wrapper ? frame('Status', [250, 0, 100, badgeH], [b], { layout: 'row' }) : b];
    return { b, spec: clean([frame('Item', [0, 0, 350, 40], kids, { layout: 'row', gap: 12 })]) };
  };
  it('positif: lencana 24 di samping judul line-height 20 (juga lewat pembungkus)', () => {
    for (const w of [false, true]) {
      const { b, spec } = rowWith(24, w);
      const f = only(run(spec), 'LC-24');
      expect(f).toHaveLength(1);
      expect(f[0]).toMatchObject({ level: 'warning', nodeId: b.id });
      expect(f[0]!.detail).toContain('tinggi 24 > line-height 20');
    }
  });
  it('negatif: lencana sm 20; lencana di kolom', () => {
    expect(only(run(rowWith(20).spec), 'LC-24')).toEqual([]);
    const col = frame('Legenda', [0, 0, 200, 80], [text('Menit belajar', [0, 0, 200, 20], { _lh: 20 }), badgeOf('+20', [0, 24, 60, 24])]);
    expect(only(run(clean([col])), 'LC-24')).toEqual([]);
  });
});

describe('LC-18 kartu bersarang', () => {
  const inner = (extra: Loose) => frame('Kartu dalam', [16, 16, 200, 80], [text('A', [32, 32, 50, 20]), text('B', [32, 52, 50, 20])], { padding: 16, ...extra });
  it('positif: kartu bergaris di dalam kartu berbayang', () => {
    const k = inner({ stroke: { color: '#E4E7EC', width: 1, align: 'inside' } });
    const outer = frame('Kartu', [0, 0, 232, 160], [k, text('C', [16, 100, 50, 20])], { padding: 16, ...solidFill('#FFFFFF'), shadows: [{ x: 0, y: 4, blur: 16, color: '#10182814' }] });
    const f = only(run(clean([outer])), 'LC-18');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: 'warning', nodeId: k.id });
  });
  it('negatif: bidang tint tanpa garis/bayangan di dalam kartu; garis satu sisi', () => {
    const outer = (k: Loose) => frame('Kartu', [0, 0, 232, 160], [k, text('C', [16, 100, 50, 20])], { padding: 16, stroke: { color: '#E4E7EC', width: 1, align: 'inside' } });
    expect(only(run(clean([outer(inner(solidFill('#F6F7F9')))])), 'LC-18')).toEqual([]);
    expect(only(run(clean([outer(inner({ stroke: { color: '#E4E7EC', width: 1, align: 'inside', sides: ['bottom'] } }))])), 'LC-18')).toEqual([]);
  });
});

describe('LC-25 radius konsentris', () => {
  const card = (ri: number, ro = 20, pad = 12) => {
    const c = frame('Ikon', [pad, pad, 40, 40], [], { radius: ri, ...solidFill('#E6F2F1') });
    return { c, spec: clean([frame('Item', [0, 0, 300, 64], [c, text('Judul', [64, 22, 100, 20])], { layout: 'row', padding: pad, radius: ro, ...solidFill('#FFFFFF') })]) };
  };
  it('positif: luar 12, dalam 12, padding 12', () => {
    const { c, spec } = card(12, 12);
    const f = only(run(spec), 'LC-25');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: 'warning', nodeId: c.id });
    expect(f[0]!.detail).toContain('radius 12 di sudut kiri atas Item (radius 12, padding 12)');
  });
  it('negatif: luar = dalam + padding; induk full; padding > 24', () => {
    expect(only(run(card(8, 20).spec), 'LC-25')).toEqual([]);
    expect(only(run(card(8, 9999).spec), 'LC-25')).toEqual([]);
    expect(only(run(card(8, 12, 32).spec), 'LC-25')).toEqual([]);
  });
});

describe('LC-26 ritme judul', () => {
  const col = (above: number, below: number, prev: Loose) => {
    const h = text('Pelajaran hari ini', [0, 0, 0, 0], { size: 20, weight: 600 });
    const y1 = 100 + above;
    h._r = [0, y1, 300, 28];
    return { h, spec: clean([frame('Konten', [0, 0, 350, 400], [prev, h, frame('Daftar', [0, y1 + 28 + below, 350, 100], [text('Butir', [0, y1 + 28 + below, 100, 20])])])]) };
  };
  const card = () => frame('Kartu', [0, 0, 350, 100], [text('Target mingguan', [0, 0, 200, 20], { size: 16 }), text('90 dari 150', [0, 24, 200, 20])]);
  it('positif: ruang atas 24 = bawah 24', () => {
    const { h, spec } = col(24, 24, card());
    const f = only(run(spec), 'LC-26');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: 'warning', nodeId: h.id });
  });
  it('negatif: atas 32 > bawah 12; sebelumnya overline; nilai harga', () => {
    expect(only(run(col(32, 12, card()).spec), 'LC-26')).toEqual([]);
    expect(only(run(col(8, 16, text('CARA KERJA', [0, 80, 100, 20], { size: 12 })).spec), 'LC-26')).toEqual([]);
    const { h, spec } = col(8, 8, card());
    h.content = 'Rp 79.000';
    expect(only(run(spec), 'LC-26')).toEqual([]);
  });
});

describe('LC-27/28/29/30 tipografi dan tanda baca', () => {
  it('LC-27: 7 ukuran → warning; 6 → tidak', () => {
    const sizes = (n: number) => clean(Array.from({ length: n }, (_, i) => text(`T${i}`, [0, i * 30, 100, 20], { size: 12 + i * 2 })));
    expect(only(run(sizes(7)), 'LC-27')).toHaveLength(1);
    expect(only(run(sizes(6)), 'LC-27')).toEqual([]);
  });
  it('LC-28: rata-rata > 80 karakter per baris', () => {
    const long = 'a'.repeat(200);
    expect(only(run(clean([text(long, [0, 0, 380, 40], { _lines: 2 })])), 'LC-28')).toHaveLength(1);
    expect(only(run(clean([text('a'.repeat(120), [0, 0, 380, 40], { _lines: 2 })])), 'LC-28')).toEqual([]);
  });
  it('LC-29: bobot < 400 di bawah 18px', () => {
    expect(only(run(clean([text('Tipis', [0, 0, 100, 20], { weight: 300 })])), 'LC-29')).toHaveLength(1);
    expect(only(run(clean([text('Tipis besar', [0, 0, 300, 40], { weight: 300, size: 32 })])), 'LC-29')).toEqual([]);
  });
  it.each(['09.00-10.00', '09:00 - 10:00', 'Rp 50-100 rb', '5-10 menit', 'Memuat...'])('LC-30 positif %j', (s) => {
    expect(only(run(clean([text(s, [0, 0, 200, 20])])), 'LC-30')).toHaveLength(1);
  });
  it.each(['2026-11-18', '0812-3456-7890', 'PO-2611-084', 'SKU B-12', 'A1-B2', '09.00–10.00', 'Memuat…'])('LC-30 negatif %j', (s) => {
    expect(only(run(clean([text(s, [0, 0, 200, 20])])), 'LC-30')).toEqual([]);
  });
  it('LC-30: "..." di teks mono (cuplikan kode) tidak dihitung', () => {
    expect(only(run(clean([text('fetch(url, ...)', [0, 0, 200, 20], { family: 'JetBrains Mono' })])), 'LC-30')).toEqual([]);
  });
});

describe('batas warning per aturan per board', () => {
  it('12 teks bobot 300 berukuran 14 → 3 temuan LC-29, temuan ketiga "(+9 serupa)", detail ≤ 120', () => {
    const kids = Array.from({ length: 12 }, (_, i) => text(`Butir tipis nomor ${i + 1} dengan keterangan yang cukup panjang untuk dipotong rapi`, [0, i * 24, 380, 20], { weight: 300 }));
    const f = only(run(clean(kids)), 'LC-29');
    expect(f).toHaveLength(3);
    expect(f[2]!.detail.endsWith('(+9 serupa)')).toBe(true);
    expect(f[0]!.detail.endsWith('serupa)')).toBe(false);
    for (const x of f) expect([...x.detail].length).toBeLessThanOrEqual(120);
  });
  it('error tidak dibatasi', () => {
    const kids = Array.from({ length: 5 }, (_, i) => text(`Abu ${i}`, [0, i * 24, 100, 20], { color: '#D0D5DD' }));
    expect(only(run(clean(kids)), 'LC-04')).toHaveLength(5);
  });
});
