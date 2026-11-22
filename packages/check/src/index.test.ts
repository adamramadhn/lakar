import { describe, expect, it } from 'vitest';
import { LakarDocument, SCHEMA_VERSION, resolveDocument, summarizeFindings, type Finding } from '@lakar/schema';
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
        const r = _r as R | undefined;
        // Tanpa `_r`: node tanpa entri bounds terukur (menguji fallback aturan).
        if (r) nodes.push({ id: n.id as string, x: r[0], y: r[1], width: r[2], height: r[3] });
        if (_ink || _lines || _lh) {
          const ink = _ink as R | undefined;
          texts.push({ id: n.id as string, lines: (_lines as number) ?? 1, lineHeight: (_lh as number) ?? r?.[3] ?? 0, ...(ink ? { ink: { x: ink[0], y: ink[1], width: ink[2], height: ink[3] } } : {}) });
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

/** Semua temuan checkBoard (semua level dan aturan). */
const runAll = (spec: BoardSpec | BoardSpec[], which = 0): Finding[] => {
  const { doc, boards, measures } = docOf(Array.isArray(spec) ? spec : [spec]);
  return checkBoard({ doc, boardId: boards[which]!, measure: measures.get(boards[which]!)! });
};
/**
 * Aturan G1: struktural (story 4), tipografi/spacing (story 5), konten/seksi (story 6). Fixture aturan G0 sengaja sintetis (bar absolut, rect
 * tanpa cat, nama bebas, ukuran huruf/padding bebas), jadi `run` menyaringnya; fixture G1 memakai `runAll`.
 */
const G1_FILTERED = new Set(['LC-13', 'LC-14', 'LC-15', 'LC-16', 'LC-21', 'LC-22', 'LC-03', 'LC-06', 'LC-07', 'LC-08', 'LC-09', 'LC-10', 'LC-17', 'LC-19']);
const run = (spec: BoardSpec | BoardSpec[], which = 0): Finding[] => runAll(spec, which).filter((f) => !G1_FILTERED.has(f.rule));
const rules = (f: Finding[]) => f.map((x) => x.rule);
const only = (f: Finding[], rule: string) => f.filter((x) => x.rule === rule);
/** Board mobile 390×844 bersih + anak tambahan. */
const clean = (children: BoardSpec['children'], extra: Partial<BoardSpec> = {}): BoardSpec => ({ children, ...extra });

describe('@lakar/check', () => {
  it('mengekspor nama paket', () => {
    expect(PACKAGE).toBe('@lakar/check');
  });
});

describe('frame grid (v4): anak diperlakukan flow, tidak crash', () => {
  const card = (name: string, r: R, kids: Loose[] = []) => frame(name, r, kids, { layout: 'column', padding: 12, radius: 12, fills: [{ type: 'solid', color: '#F2F4F7' }] });
  const gridSpec = () => {
    const a = card('Kartu A', [16, 16, 173, 80], [text('Satu', [28, 28, 149, 20], { color: '#101828' })]);
    const b = card('Kartu B', [201, 16, 173, 80], [text('Dua', [213, 28, 149, 20], { color: '#101828' })]);
    const c = card('Kartu lebar', [16, 108, 358, 80], [text('Tiga', [28, 120, 334, 20], { color: '#101828' })]);
    c.gridColumn = { span: 2 };
    const g = frame('Grid kartu', [0, 0, 390, 204], [a, b, c, rect('Overlay / Lencana', [360, 0, 24, 24], { position: 'absolute', x: 360, y: 0 })], {
      layout: 'grid',
      gridTemplateColumns: [{ fr: 1 }, { fr: 1 }],
      gridTemplateRows: [80, 'auto'],
      columnGap: 12,
      rowGap: 12,
      padding: 16,
    });
    return clean([g]);
  };

  it('grid bersih: tanpa temuan (termasuk aturan khusus row/column)', () => {
    expect(run(gridSpec())).toEqual([]);
  });

  it('anak grid meluber dari induk tetap dilaporkan (dihitung sebagai flow)', () => {
    const t = text('Judul yang sangat panjang meluber', [16, 16, 420, 20], { color: '#101828' });
    const g = frame('Grid', [0, 0, 390, 52], [t], { layout: 'grid', gridTemplateColumns: [{ fr: 1 }], padding: 16, clip: true });
    let f: Finding[] = [];
    expect(() => (f = run(clean([g])))).not.toThrow();
    expect(rules(f)).toContain('LC-02a');
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
    expect(summarizeFindings(f)).toEqual({ error: 0, warning: 1, gate: 0, info: 0 });
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
    // Tanpa zona, dengan Home indicator: isi berakhir 24 di atas home indicator → pas (tanpa temuan).
    const home = rect('Home indicator', [0, 1320 - 34, 390, 34], { position: 'absolute' });
    expect(only(run(long(1320, 1320 - 34 - 24, [home])), 'LC-12')).toEqual([]);
    const home2 = rect('Home indicator', [0, 1320 - 34, 390, 34], { position: 'absolute' });
    expect(only(run(long(1320, 1000, [home2])), 'LC-12')[0]!.detail).toBe('tinggi 1320, isi berakhir 286 px di atas Home indicator: tinggi pas = 1058');
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

describe('LC-02c non-teks meluap dari isi wadah', () => {
  const card = { fills: [{ type: 'solid', color: '#FFFFFF' }], stroke: { color: '#E4E7EC', width: 1, align: 'inside' } };
  const app = (kids: Loose[]) => run({ screen: 'app', width: 1440, height: 900, children: kids });
  /** Kartu KPI P8 polish-4: `Batang mini` (7×8, gap 4) di baris `Nilai` space-between masuk padding kanan kartu. */
  const kpi = (barsX = 811.5) => {
    const bars = frame('Batang mini', [barsX, 168, 80, 40], [0, 1, 2, 3, 4, 5, 6].map((i) => rect('Hari', [barsX + 12 * i, 180, 8, 28], { fills: [{ type: 'solid', color: '#9DB4E6' }] })), { layout: 'row', gap: 4 });
    const angka = frame('Angka', [688, 160, 107.5, 48], [text('186', [688, 160, 76.4, 48], { size: 40 }), text('trip', [770.4, 184, 25.1, 24], { size: 16 })], { layout: 'row', gap: 6 });
    const nilai = frame('Nilai', [688, 160, 184, 48], [angka, bars], { layout: 'row', gap: 16, justify: 'space-between' });
    const k = frame('Kartu / Pengiriman', [664, 104, 232, 160], [text('Pengiriman minggu ini', [688, 128, 184, 20]), nilai], { padding: 24, gap: 12, ...card });
    return { bars, k };
  };

  it('positif: kartu KPI P8 minimal → error gerbang pada Batang mini (luapan kanan 19.5, sisa 4.5)', () => {
    const { bars, k } = kpi();
    const f = only(app([k]), 'LC-02c');
    expect(f.map((x) => [x.level, x.nodeId, x.detail])).toEqual([
      ['error', bars.id, 'meluap 19.5px di kanan (sisa 4.5px ke tepi Kartu / Pengiriman) dari isi Nilai'],
    ]);
    expect(f[0]!.expected).toBe('di dalam isi wadah: kecilkan, bungkus, atau beri ruang (sisa ke tepi ≥ 8 atau ≥ separuh padding)');
    expect(summarizeFindings(f).gate).toBe(1);
    // batang di dalam isi kartu → bersih
    expect(only(app([kpi(792).k]), 'LC-02c')).toEqual([]);
  });

  it('positif: anak flow tumpah keluar kartu (sisa negatif); padding kecil memakai batas padding/2', () => {
    const r = rect('Bar', [16, 16, 220, 20], { fills: [{ type: 'solid', color: '#2563EB' }] });
    const f = only(app([frame('Kartu', [0, 0, 200, 52], [r], { padding: 16, ...card })]), 'LC-02c');
    expect(f.map((x) => [x.nodeId, x.detail])).toEqual([[r.id, 'meluap 52px di kanan (sisa -36px ke tepi Kartu) dari isi Kartu']]);
    // padding 8: sisa 3 < 4 → temuan; sisa 5 ≥ 4 → bukan
    const tight = rect('Bar', [8, 8, 189, 20], { fills: [{ type: 'solid', color: '#2563EB' }] });
    expect(only(app([frame('Kartu', [0, 0, 200, 36], [tight], { padding: 8, ...card })]), 'LC-02c').map((x) => x.nodeId)).toEqual([tight.id]);
    const ok = rect('Bar', [8, 8, 187, 20], { fills: [{ type: 'solid', color: '#2563EB' }] });
    expect(only(app([frame('Kartu', [0, 0, 200, 36], [ok], { padding: 8, ...card })]), 'LC-02c')).toEqual([]);
  });

  it('bersarang: frame meluap beserta anaknya → satu temuan (node terluar)', () => {
    const inner = rect('Isi', [24, 24, 200, 20], { fills: [{ type: 'solid', color: '#2563EB' }] });
    const outer = frame('Baris', [24, 24, 200, 20], [inner], { layout: 'row' });
    const f = only(app([frame('Kartu', [0, 0, 220, 68], [outer], { padding: 24, ...card })]), 'LC-02c');
    expect(f.map((x) => x.nodeId)).toEqual([outer.id]);
  });

  it('negatif: luapan kecil ke padding lega, wadah tanpa cat, Overlay /, Crop /, rotasi, gap negatif, Scroll /, absolut, LC-02a, teks', () => {
    const blue = { fills: [{ type: 'solid', color: '#2563EB' }] };
    const k = (kids: Loose[], extra: Loose = {}) => frame('Kartu', [0, 0, 200, 100], kids, { padding: 24, ...card, ...extra });
    const wide = (extra: Loose = {}) => rect('Bar', [24, 24, 190, 20], { ...blue, ...extra });
    // 2px ke padding 24 (sisa 22)
    expect(only(app([k([rect('Bar', [24, 24, 154, 20], blue)])]), 'LC-02c')).toEqual([]);
    // induk dan leluhur tanpa cat (board bukan wadah tampak)
    expect(only(app([frame('Grup', [0, 0, 200, 100], [wide()], { padding: 24 })]), 'LC-02c')).toEqual([]);
    expect(only(app([k([wide({ name: 'Overlay / Sorot' })])]), 'LC-02c')).toEqual([]);
    expect(only(app([frame('Crop / Foto', [0, 0, 200, 100], [wide()], { padding: 24, ...card })]), 'LC-02c')).toEqual([]);
    expect(only(app([k([frame('Crop / Pratinjau', [24, 24, 152, 52], [wide()], { layout: 'column' })])]), 'LC-02c')).toEqual([]);
    expect(only(app([k([wide({ rotation: 4 })])]), 'LC-02c')).toEqual([]);
    // leluhur `Overlay / …` atau leluhur berotasi di rantai
    expect(only(app([k([frame('Overlay / Sorot', [24, 24, 152, 20], [wide()], { layout: 'row' })])]), 'LC-02c')).toEqual([]);
    expect(only(app([k([frame('Baris', [24, 24, 152, 20], [wide()], { layout: 'row', rotation: 3 })])]), 'LC-02c')).toEqual([]);
    expect(only(app([k([wide()], { layout: 'row', gap: -8 })]), 'LC-02c')).toEqual([]);
    // sumbu vertikal di Scroll / atau scrollY (sisi kiri/kanan tetap dinilai)
    const tall = () => rect('Daftar', [24, 24, 152, 120], blue);
    expect(only(app([frame('Scroll / Isi', [0, 0, 200, 100], [tall()], { padding: 24, ...card })]), 'LC-02c')).toEqual([]);
    expect(only(app([k([tall()], { scrollY: 40 })]), 'LC-02c')).toEqual([]);
    expect(only(app([k([tall()])]), 'LC-02c')).toHaveLength(1);
    expect(only(app([k([wide({ position: 'absolute' })])]), 'LC-02c')).toEqual([]);
    // tumpah dari kartu ber-clip → LC-02a, bukan LC-02c
    const cut = rect('Bar', [24, 24, 220, 20], blue);
    const f = app([k([cut], { clip: true })]);
    expect(f.filter((x) => x.nodeId === cut.id).map((x) => x.rule)).toEqual(['LC-02a']);
    // keturunan node LC-02a: baris transparan lebar tetap terpotong clip kartu, anaknya lebih lebar → hanya LC-02a pada baris
    const child = rect('Isi', [24, 24, 260, 20], blue);
    const row = frame('Baris', [24, 24, 230, 20], [child], { layout: 'row' });
    const g = app([k([row], { clip: true })]);
    expect(g.filter((x) => x.rule === 'LC-02a' || x.rule === 'LC-02c').map((x) => [x.rule, x.nodeId])).toEqual([['LC-02a', row.id]]);
    // teks dinilai LC-02b
    expect(only(app([k([text('Judul yang sangat panjang', [24, 24, 190, 20])])]), 'LC-02c')).toEqual([]);
  });
});

describe('LC-31 konten rata di tepi bawah board/seksi dan daftar rata', () => {
  const card = { fills: [{ type: 'solid', color: '#FFFFFF' }], stroke: { color: '#E4E7EC', width: 1, align: 'inside' } };
  const app = (kids: Loose[]) => run({ screen: 'app', width: 1440, height: 900, children: kids });
  const kartu = (r: R, extra: Loose = {}) => frame('Kartu / Stok', r, [text('Stok gudang', [r[0] + 20, r[1] + 20, 200, 20])], { padding: 20, ...card, ...extra });

  it('positif: kartu berakhir rata di tepi bawah board (−2..+1) → error gerbang', () => {
    const k = kartu([300, 700, 600, 200]);
    const f = only(app([frame('Area', [0, 0, 1440, 900], [k], { layout: 'none' })]), 'LC-31');
    expect(f.map((x) => [x.nodeId, x.level, x.detail])).toEqual([[k.id, 'error', 'rata di tepi bawah Home tanpa ruang bawah (sisa 0px)']]);
    expect(summarizeFindings(f).gate).toBe(1);
    const k2 = kartu([300, 700, 600, 198.5]);
    expect(only(app([frame('Area', [0, 0, 1440, 900], [k2], { layout: 'none' })]), 'LC-31').map((x) => x.detail)).toEqual(['rata di tepi bawah Home tanpa ruang bawah (sisa 1.5px)']);
  });

  it('positif: kartu rata di tepi bawah seksi ber-clip selebar board', () => {
    const k = kartu([300, 500, 600, 300]);
    const seksi = frame('Seksi / Ringkasan', [0, 400, 1440, 400], [k], { layout: 'none', clip: true, fills: [{ type: 'solid', color: '#F6F7F9' }] });
    const f = only(app([frame('Isi', [0, 0, 1440, 900], [seksi], { layout: 'none' })]), 'LC-31');
    expect(f.map((x) => [x.nodeId, x.detail])).toEqual([[k.id, 'rata di tepi bawah Seksi / Ringkasan tanpa ruang bawah (sisa 0px)']]);
  });

  it('negatif: sidebar penuh tinggi, footer/tab bar selebar board, kartu dengan margin bawah ≥ 3px', () => {
    const side = frame('Sidebar', [0, 0, 240, 900], [text('Menu', [20, 20, 100, 20])], card);
    const footer = frame('Footer', [0, 820, 1440, 80], [text('© Lumbung', [20, 840, 100, 20])], card);
    const k = kartu([300, 697, 600, 200]);
    expect(only(app([frame('Area', [0, 0, 1440, 900], [side, footer, k], { layout: 'none' })]), 'LC-31')).toEqual([]);
  });

  it('negatif: sidebar dan area kerja di bawah header, kolom tengah dalam baris di bawah header', () => {
    const header = frame('Header', [0, 0, 1440, 64], [text('Lumbung', [24, 20, 100, 24])], card);
    const side = frame('Sidebar', [0, 64, 240, 836], [text('Menu', [20, 84, 100, 20])], card);
    const main = frame('Area kerja', [240, 64, 1200, 836], [text('Ringkasan', [272, 96, 200, 28])], card);
    expect(only(app([frame('Isi', [0, 0, 1440, 900], [header, side, main], { layout: 'none' })]), 'LC-31')).toEqual([]);
    const col = (name: string, x: number) => frame(name, [x, 64, 400, 836], [text(name, [x + 20, 84, 200, 20])], card);
    const body = frame('Badan', [0, 64, 1440, 836], [col('Kiri', 0), col('Tengah', 520), col('Kanan', 1040)], { layout: 'row', gap: 120 });
    expect(only(app([header, body]), 'LC-31')).toEqual([]);
  });

  /** Tabel P8 polish-4: kartu ber-clip padding [20,0,0,0], baris terakhir rata di tepi bawah kartu. */
  const table = (pad: number | number[], lastFill = true) => {
    const x = 280;
    const row = (name: string, y: number, fill = true) =>
      frame(name, [x, y, 744, 48], [text(name.slice(8), [x + 24, y + 6, 272, 20])], {
        layout: 'row',
        padding: [0, 24],
        ...(fill ? { fills: [{ type: 'solid', color: '#FFFFFF' }], stroke: { color: '#E4E7EC', width: 1, align: 'inside', sides: ['bottom'] } } : {}),
      });
    const top = typeof pad === 'number' ? pad : pad[0]!;
    const kepala = frame('Kepala', [x, 536 + top, 744, 28], [text('Pesanan keluar', [x + 24, 536 + top, 150, 28], { size: 20 })], { layout: 'row', padding: [0, 24] });
    const y0 = 536 + top + 40;
    const header = frame('Header tabel', [x, y0, 744, 32], [text('Pelanggan', [x + 24, y0 + 8, 272, 16], { size: 12 })], { layout: 'row', padding: [0, 24], fills: [{ type: 'solid', color: '#F2F4F8' }] });
    const rows = [0, 1, 2, 3].map((i) => row(`Baris / Pelanggan ${i + 1}`, y0 + 44 + 60 * i, i < 3 || lastFill));
    const bottomPad = typeof pad === 'number' ? pad : pad[2]!;
    const h = bottom(rows[3]!._r) + bottomPad - 536;
    const k = frame('Kartu / Pesanan keluar', [x, 536, 744, h], [kepala, header, ...rows], { padding: pad, gap: 12, clip: true, ...card });
    return { k, last: rows[3]! };
  };
  const bottom = (r: R) => r[1] + r[3];

  it('positif: daftar rata P8 minimal → error pada baris terakhir', () => {
    const { k, last } = table([20, 0, 0, 0]);
    const f = only(app([frame('Area kerja', [240, 0, 1200, 900], [k], { layout: 'column', padding: 32 })]), 'LC-31');
    expect(f.map((x) => [x.nodeId, x.level, x.detail])).toEqual([[last.id, 'error', 'baris terakhir rata di tepi bawah Kartu / Pesanan keluar (bawah 0px, atas 20px)']]);
    expect(f[0]!.expected).toBe('padding bawah setara padding atas, atau tampilkan baris utuh');
  });

  it('negatif: daftar bergaris tanpa ruang atas, kartu dengan padding bawah, baris terakhir tak ber-cat', () => {
    const wrap = (k: Loose) => only(app([frame('Area kerja', [240, 0, 1200, 900], [k], { layout: 'column', padding: 32 })]), 'LC-31');
    expect(wrap(table(0).k)).toEqual([]);
    expect(wrap(table(20).k)).toEqual([]);
    expect(wrap(table([20, 0, 0, 0], false).k)).toEqual([]);
  });

  it('baris terakhir menggantung 30px di bawah kartu tanpa clip → LC-02c saja, bukan LC-31', () => {
    const { k, last } = table([20, 0, 0, 0]);
    k.clip = false;
    k._r = [k._r[0], k._r[1], k._r[2], k._r[3] - 30];
    const f = app([frame('Area kerja', [240, 0, 1200, 900], [k], { layout: 'column', padding: 32 })]);
    expect(only(f, 'LC-31')).toEqual([]);
    expect(only(f, 'LC-02c').map((x) => x.nodeId)).toEqual([last.id]);
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
    expect(summarizeFindings(f)).toEqual({ error: 5, warning: 1, gate: 5, info: 0 });
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

  it('dilewati: teks di atas foto tanpa scrim (hanya warning scrim), atau tertutup sebagian lapisan', () => {
    const img = { fills: [{ type: 'image', assetId: 'a'.repeat(64), fit: 'cover' }] };
    const onPhoto = only(run(clean([frame('Image / Sampul', [0, 0, 200, 100], [text('Judul', [10, 10, 100, 20], { color: '#FFFFFF' })], img)])), 'LC-04');
    expect(onPhoto.map((f) => [f.level, f.detail.split(' ')[0]])).toEqual([['warning', 'scrim:']]);
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

describe('LC-04 lengkap: ambang, batas kontrol, ikon tanpa label, scrim', () => {
  const lc04 = (kids: Loose[]) => only(run(clean(kids)), 'LC-04');
  const sub = (f: Finding[], prefix: string) => f.filter((x) => x.detail.startsWith(prefix));
  const white = { fills: [{ type: 'solid', color: '#FFFFFF' }] };
  const stroke = (color: string) => ({ stroke: { color, width: 1, align: 'inside' } });
  const img = { fills: [{ type: 'image', assetId: 'b'.repeat(64), fit: 'cover' }] };
  const t = (size: number, weight?: number, extra: Loose = {}) => text('Keterangan', [16, 16, 200, Math.ceil(size * 1.3)], { size, color: '#949494', ...(weight ? { weight } : {}), ...extra });

  it('teks kecil 16px #949494 di #FFF (3,03:1) → error gerbang ≥ 4.5', () => {
    const f = lc04([t(16)]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: 'error' });
    expect(f[0]!.detail).toMatch(/^kontras 3\.0\d:1 \(#949494 di atas #FFFFFF\)/);
    expect(f[0]!.expected).toMatch(/^≥ 4\.5:1/);
    expect(summarizeFindings(f).gate).toBe(1);
  });

  it('teks besar: ≥ 24px berat 400 lulus 3:1; 23px error', () => {
    expect(lc04([t(24)])).toEqual([]);
    expect(lc04([t(23)])).toHaveLength(1);
  });

  it('teks besar tebal: 18,66px 700 lulus; 18,66px 600 dan 18px 700 error', () => {
    expect(lc04([t(18.66, 700)])).toEqual([]);
    expect(lc04([t(18.66, 600)])).toHaveLength(1);
    expect(lc04([t(18, 700)])).toHaveLength(1);
  });

  it('layer Placeholder 24px dinilai 4.5:1, bukan 3:1', () => {
    const f = lc04([t(24, undefined, { name: 'Placeholder' })]);
    expect(f).toHaveLength(1);
    expect(f[0]!.level).toBe('error');
    expect(f[0]!.expected).toMatch(/^≥ 4\.5:1/);
  });

  const input = (extra: Loose, kids: Loose[] = [text('Cari pesanan', [28, 28, 200, 20], { name: 'Placeholder', color: '#475467' })]) =>
    frame('Input / Cari', [16, 16, 300, 44], kids, { layout: 'row', ...extra });

  it('batas kontrol gagal: Input / stroke #D0D5DD di board #FFF → error gerbang 1.47:1', () => {
    const k = input({ ...white, ...stroke('#D0D5DD') });
    const f = sub(lc04([k]), 'batas kontrol');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: 'error', nodeId: k.id, detail: 'batas kontrol 1.47:1 (#D0D5DD di atas #FFFFFF)' });
    expect(f[0]!.expected).toContain('border-input (#7D8798)');
    expect(summarizeFindings(f).gate).toBe(1);
  });

  it('batas kontrol lulus: stroke border-input; fill aksen tanpa stroke; keturunan bercat ≥ 3:1', () => {
    expect(sub(lc04([input({ ...white, ...stroke('#7D8798') })]), 'batas kontrol')).toEqual([]);
    const checked = frame('Checkbox / Setuju', [16, 16, 20, 20], [icon('lucide', [18, 18, 16, 16], { color: '#FFFFFF' })], { layout: 'row', fills: [{ type: 'solid', color: '#2563EB' }] });
    expect(sub(lc04([checked]), 'batas kontrol')).toEqual([]);
    const radio = frame('Radio / Kirim', [16, 16, 200, 24], [frame('Lingkaran', [16, 16, 20, 20], [], { ...stroke('#7D8798') }), text('Kirim', [44, 18, 100, 20], { color: '#101828' })], { layout: 'row' });
    expect(sub(lc04([radio]), 'batas kontrol')).toEqual([]);
  });

  it('kontrol tanpa batas: fill #F6F7F9 tanpa stroke, keturunan tak bercat → error 1.07:1 (fill)', () => {
    const f = sub(lc04([input({ fills: [{ type: 'solid', color: '#F6F7F9' }] })]), 'batas kontrol');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: 'error', detail: 'batas kontrol 1.07:1 (#F6F7F9 di atas #FFFFFF)' });
  });

  it('kontrol tanpa cat sama sekali → error "tanpa batas terlihat"; kontrol bersarang dinilai sekali (terluar)', () => {
    const f = sub(lc04([input({})]), 'batas kontrol');
    expect(f.map((x) => x.detail)).toEqual(['batas kontrol: tanpa batas terlihat (tanpa stroke dan fill)']);
    const nested = frame('Input / Tanggal', [16, 16, 300, 44], [frame('Checkbox / Sepanjang hari', [24, 24, 20, 20], [], { ...stroke('#D0D5DD') })], { layout: 'row', ...stroke('#7D8798') });
    expect(sub(lc04([nested]), 'batas kontrol')).toEqual([]);
  });

  it('kontrol di latar komposit (gradien / opacity) → warning; di atas foto → dilewati', () => {
    const grad = { fills: [{ type: 'linear', angle: 90, stops: [{ offset: 0, color: '#FFFFFF' }, { offset: 1, color: '#F2F4F7' }] }] };
    const onGrad = sub(lc04([frame('Panel', [0, 0, 390, 100], [input({ ...white, ...stroke('#D0D5DD') })], { layout: 'column', ...grad })]), 'batas kontrol');
    expect(onGrad.map((x) => x.level)).toEqual(['warning']);
    expect(onGrad[0]!.detail).toContain('perkiraan');
    const faded = sub(lc04([input({ ...white, ...stroke('#98A2B3'), opacity: 0.5 })]), 'batas kontrol');
    expect(faded.map((x) => x.level)).toEqual(['warning']);
    expect(sub(lc04([frame('Image / Latar', [0, 0, 390, 100], [input({ ...white, ...stroke('#D0D5DD') })], { layout: 'column', ...img })]), 'batas kontrol')).toEqual([]);
  });

  it('ikon tanpa label gagal: IconButton / Tutup #D0D5DD; baris Bintang 5 ikon #F5B700 → error per ikon', () => {
    const ib = frame('IconButton / Tutup', [16, 16, 44, 44], [icon('lucide', [26, 26, 24, 24], { color: '#D0D5DD' })], { layout: 'row' });
    const f = sub(lc04([ib]), 'ikon tanpa label');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: 'error', detail: 'ikon tanpa label 1.47:1 (#D0D5DD di atas #FFFFFF)' });
    expect(f[0]!.expected).toContain('beri label teks');
    const stars = frame('Bintang', [16, 80, 120, 20], [0, 1, 2, 3, 4].map((i) => icon('lucide', [16 + i * 24, 80, 20, 20], { color: '#F5B700' })), { layout: 'row' });
    const card = frame('Kartu / Ulasan', [0, 60, 390, 120], [text('Ulasan Rina', [16, 60, 200, 20], { color: '#101828' }), stars], { layout: 'column', ...white });
    const sf = sub(lc04([card]), 'ikon tanpa label');
    expect(sf).toHaveLength(5);
    expect(sf.every((x) => x.level === 'error' && x.detail.startsWith('ikon tanpa label 1.'))).toBe(true);
  });

  it('deretan ikon: berlabel oleh teks nilai pendek bersebelahan ("4,8 dari 312 ulasan"); kalimat panjang atau nama tanpa angka bukan label', () => {
    const stars = (y: number) => frame('Bintang', [16, y, 120, 20], [0, 1, 2, 3, 4].map((i) => icon('lucide', [16 + i * 24, y, 20, 20], { color: '#F5B700' })), { layout: 'row' });
    const rating = frame('Rating', [16, 16, 360, 20], [stars(16), text('4,8 dari 312 ulasan pemilik', [144, 16, 200, 20], { color: '#101828' })], { layout: 'row' });
    expect(sub(lc04([rating]), 'ikon tanpa label')).toEqual([]);
    const skor = frame('Skor', [16, 16, 120, 90], [text('4,8', [16, 16, 60, 40], { size: 32, color: '#101828' }), stars(60), text('1.284 ulasan', [16, 84, 100, 20], { color: '#475467' })], { layout: 'column' });
    expect(sub(lc04([skor]), 'ikon tanpa label')).toEqual([]);
    const quote = 'Langganan bulanan bikin pengeluaran laundry saya tetap Rp 165.000 per bulan.';
    const card = frame('Kartu / Testimoni', [0, 0, 390, 200], [stars(16), text(quote, [16, 44, 358, 60], { color: '#101828' }), text('Bima Prasetyo', [16, 120, 200, 20], { color: '#101828' })], { layout: 'column', ...white });
    expect(sub(lc04([card]), 'ikon tanpa label')).toHaveLength(5);
  });

  it('bintang tanpa pembungkus langsung di baris: nama bukan label (error per ikon); teks nilai "4,8" di baris itu → berlabel', () => {
    const starsAt = () => [0, 1, 2, 3, 4].map((i) => icon('lucide', [16 + i * 24, 16, 20, 20], { icon: 'star', color: '#F5B700' }));
    const row = frame('Baris ulasan', [16, 16, 360, 20], [...starsAt(), text('Bima Prasetyo', [140, 16, 120, 20], { color: '#101828' })], { layout: 'row' });
    expect(sub(lc04([row]), 'ikon tanpa label')).toHaveLength(5);
    const rated = frame('Baris ulasan', [16, 16, 360, 20], [...starsAt(), text('4,8', [140, 16, 40, 20], { color: '#101828' })], { layout: 'row' });
    expect(sub(lc04([rated]), 'ikon tanpa label')).toEqual([]);
  });

  it('Checkbox / digambar dengan ikon square: ikon = batas (#7D8798 lulus, #D0D5DD 1.47:1)', () => {
    const cb = (c: string) => frame('Checkbox / Setuju', [16, 16, 200, 24], [icon('lucide', [16, 16, 24, 24], { icon: 'square', color: c }), text('Setuju', [48, 18, 100, 20], { color: '#101828' })], { layout: 'row' });
    expect(sub(lc04([cb('#7D8798')]), 'batas kontrol')).toEqual([]);
    expect(sub(lc04([cb('#D0D5DD')]), 'batas kontrol').map((x) => x.detail)).toEqual(['batas kontrol 1.47:1 (#D0D5DD di atas #FFFFFF)']);
  });

  it('ikon berlabel atau dikecualikan: Button / ikon + teks; wadah tint + judul; simple-icons; Status bar', () => {
    const btn = frame('Button / Simpan', [16, 16, 120, 44], [icon('lucide', [28, 28, 20, 20], { color: '#D0D5DD' }), text('Simpan', [52, 28, 60, 20], { color: '#101828' })], { layout: 'row' });
    const tint = frame('Wadah ikon', [16, 16, 40, 40], [icon('lucide', [24, 24, 24, 24], { color: '#D0D5DD' })], { layout: 'row', fills: [{ type: 'solid', color: '#F2F4F7' }] });
    const card = frame('Kartu', [0, 0, 390, 120], [tint, text('Pengiriman', [16, 64, 200, 20], { color: '#101828' })], { layout: 'column', ...white });
    const logo = icon('simple-icons', [16, 200, 24, 24], { color: '#D0D5DD' });
    const bar = frame('Status bar', [0, 300, 390, 44], [icon('lucide', [350, 310, 20, 20], { color: '#D0D5DD' })], { layout: 'row' });
    expect(sub(lc04([btn, card, logo, bar]), 'ikon tanpa label')).toEqual([]);
  });

  it('scrim tidak ada: teks di foto, gradien multi-hue, dan di atas blob blur ≥ 24 → warning; jam Status bar dilewati', () => {
    const onPhoto = frame('Image / Hero', [0, 0, 390, 200], [text('Kopi pagi', [16, 16, 200, 30], { color: '#FFFFFF' })], { layout: 'column', ...img });
    const f = sub(lc04([onPhoto]), 'scrim:');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: 'warning', detail: 'scrim: teks di atas foto tanpa scrim (fill solid ≥ 0,5) "Kopi pagi"' });
    expect(summarizeFindings(f).gate).toBe(0);
    const multi = { fills: [{ type: 'linear', angle: 90, stops: [{ offset: 0, color: '#1D4ED8' }, { offset: 1, color: '#7E22CE' }] }] };
    expect(sub(lc04([frame('Hero', [0, 0, 390, 200], [text('Judul', [16, 16, 200, 30], { color: '#FFFFFF' })], { layout: 'column', ...multi })]), 'scrim:').map((x) => x.detail)).toEqual([
      'scrim: teks di atas gradien tanpa scrim (fill solid ≥ 0,5) "Judul"',
    ]);
    // Kontras gagal di gradien multi-hue → satu temuan LC-04 (kontras), tanpa warning scrim ganda.
    const orange = { fills: [{ type: 'linear', angle: 90, stops: [{ offset: 0, color: '#2563EB' }, { offset: 1, color: '#F97316' }] }] };
    const once = lc04([frame('Hero', [0, 0, 390, 200], [text('Judul', [16, 16, 200, 30], { color: '#FFFFFF' })], { layout: 'column', ...orange })]);
    expect(once.map((x) => [x.level, x.detail.split(' ')[0]])).toEqual([['warning', 'kontras']]);
    const blob = rect('Blob', [0, 0, 120, 300], { position: 'absolute', fills: [{ type: 'solid', color: '#7C3AED' }], blur: 40 });
    const fx = frame('Hero', [0, 0, 390, 300], [blob, text('Judul', [100, 100, 100, 20], { color: '#101828', position: 'absolute' })], { layout: 'none' });
    expect(sub(lc04([fx]), 'scrim:').map((x) => x.detail)).toEqual(['scrim: teks di atas efek tanpa scrim (fill solid ≥ 0,5) "Judul"']);
    const bar = frame('Status bar', [0, 0, 390, 44], [text('09:41', [24, 12, 50, 20], { color: '#FFFFFF' })], { layout: 'row' });
    expect(sub(lc04([frame('Image / Hero', [0, 0, 390, 300], [bar], { layout: 'column', ...img })]), 'scrim:')).toEqual([]);
  });

  it('scrim ada: rect solid alpha ≥ 0,5 memuat ink; fill solid di atas foto di node yang sama; ellipse memuat keempat sudut ink', () => {
    const scrim = rect('Scrim', [0, 100, 390, 100], { position: 'absolute', fills: [{ type: 'solid', color: '#00000080' }] });
    const hero = frame('Image / Hero', [0, 0, 390, 200], [scrim, text('Kopi pagi', [16, 150, 200, 30], { color: '#FFFFFF', position: 'absolute' })], { layout: 'none', ...img });
    expect(sub(lc04([hero]), 'scrim:')).toEqual([]);
    const faint = rect('Scrim', [0, 100, 390, 100], { position: 'absolute', fills: [{ type: 'solid', color: '#000000' }], opacity: 0.3 });
    expect(sub(lc04([frame('Image / Hero', [0, 0, 390, 200], [faint, text('Kopi pagi', [16, 150, 200, 30], { color: '#FFFFFF', position: 'absolute' })], { layout: 'none', ...img })]), 'scrim:')).toHaveLength(1);
    const layered = { fills: [img.fills[0], { type: 'solid', color: '#0000008C' }] };
    expect(sub(lc04([frame('Image / Hero', [0, 0, 390, 200], [text('Kopi pagi', [16, 16, 200, 30], { color: '#FFFFFF' })], { layout: 'column', ...layered })]), 'scrim:')).toEqual([]);
    const disc = (r: R) => ({ type: 'ellipse', id: nid(), name: 'Cakram', position: 'absolute', fills: [{ type: 'solid', color: '#000000B3' }], _r: r });
    const inDisc = frame('Image / Hero', [0, 0, 390, 300], [disc([50, 50, 300, 200]), text('Kopi', [150, 135, 100, 30], { color: '#FFFFFF', position: 'absolute' })], { layout: 'none', ...img });
    expect(sub(lc04([inDisc]), 'scrim:')).toEqual([]);
    const edgeDisc = frame('Image / Hero', [0, 0, 390, 300], [disc([50, 50, 300, 200]), text('Kopi', [55, 55, 100, 30], { color: '#FFFFFF', position: 'absolute' })], { layout: 'none', ...img });
    expect(sub(lc04([edgeDisc]), 'scrim:')).toHaveLength(1);
  });

  it('gradien satu hue: tanpa warning scrim, kontras stop terburuk tetap dinilai', () => {
    const tint = { fills: [{ type: 'linear', angle: 90, stops: [{ offset: 0, color: '#1E3A8A' }, { offset: 1, color: '#93C5FD' }] }] };
    const f = lc04([frame('Hero', [0, 0, 390, 200], [text('Judul', [16, 16, 200, 30], { color: '#FFFFFF' })], { layout: 'column', ...tint })]);
    expect(sub(f, 'scrim:')).toEqual([]);
    expect(sub(f, 'kontras').map((x) => x.level)).toEqual(['warning']);
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

describe('LC-32 referensi instance basi (AD-12)', () => {
  const stored = (overrides?: Loose) =>
    LakarDocument.parse({
      schemaVersion: SCHEMA_VERSION,
      id: 'Docu0001',
      rev: 1,
      pages: [
        {
          id: 'Page0001',
          name: 'Page 1',
          children: [
            {
              type: 'board',
              id: 'Brd00001',
              name: 'Home',
              x: 0,
              y: 0,
              width: 390,
              height: 844,
              screen: 'mobile',
              children: [
                {
                  type: 'frame',
                  id: 'Mst00001',
                  name: 'Kartu',
                  layout: 'column',
                  padding: 12,
                  component: { props: [], slots: [] },
                  children: [{ type: 'text', id: 'Txt00001', name: 'Teks', content: 'Halo', size: 14, color: '#101828' }],
                },
                { type: 'instance', id: 'Ins00001', name: 'Kartu / A', componentId: 'Mst00001', ...(overrides ? { overrides } : {}) },
              ],
            },
          ],
        },
      ],
    });
  const measure: BoardMeasure = {
    width: 390,
    height: 844,
    nodes: [
      { id: 'Mst00001', x: 0, y: 0, width: 390, height: 44 },
      { id: 'Txt00001', x: 12, y: 12, width: 100, height: 20 },
      { id: 'Ins00001', x: 0, y: 60, width: 390, height: 44 },
      { id: 'Ins00001/Txt00001', x: 12, y: 72, width: 100, height: 20 },
    ],
    texts: [],
  };
  const check = (overrides?: Loose) => checkBoard({ doc: resolveDocument(stored(overrides)), boardId: 'Brd00001', measure });

  it('instance tanpa referensi basi: tanpa LC-32', () => {
    expect(only(check({ Txt00001: { content: 'Hai' } }), 'LC-32')).toEqual([]);
  });

  it('override yatim → satu warning LC-32 pada instance, gerbang tetap 0', () => {
    const f = check({ Gone0001: { content: 'x' }, Txt00001: { content: 'Hai' } });
    const lc32 = only(f, 'LC-32');
    expect(lc32).toEqual([expect.objectContaining({ level: 'warning', nodeId: 'Ins00001', nodeName: 'Kartu / A' })]);
    expect(lc32[0]!.detail).toContain('override Gone0001');
    expect(summarizeFindings(f).gate).toBe(0);
  });

  it('dokumen sintetis tanpa resolveDocument: LC-32 tidak muncul (tanpa laporan ekspansi)', () => {
    expect(rules(run(clean([text('Halo', [0, 0, 100, 20], { color: '#101828' })])))).not.toContain('LC-32');
  });
});

describe('LC-32 per board (AD-12)', () => {
  it('dua board: setiap board hanya mendapat LC-32 instance miliknya', () => {
    const board = (id: string, x: number, children: Loose[]) => ({ type: 'board', id, name: id, x, y: 0, width: 390, height: 844, screen: 'mobile', children });
    const m = { type: 'frame', id: 'Mst00001', name: 'Kartu', layout: 'column', component: { props: [], slots: [] }, children: [{ type: 'text', id: 'Txt00001', name: 'Teks', content: 'Halo', size: 14, color: '#101828' }] };
    const doc = resolveDocument(
      LakarDocument.parse({
        schemaVersion: SCHEMA_VERSION,
        id: 'Docu0001',
        rev: 1,
        pages: [
          {
            id: 'Page0001',
            name: 'Page 1',
            children: [
              board('Brd00001', 0, [m, { type: 'instance', id: 'Ins00001', name: 'A', componentId: 'Mst00001', overrides: { Gone0001: { content: 'x' } } }]),
              board('Brd00002', 500, [{ type: 'instance', id: 'Ins00002', name: 'B', componentId: 'Mst00001' }]),
            ],
          },
        ],
      }),
    );
    const measure = (ids: string[]): BoardMeasure => ({ width: 390, height: 844, nodes: ids.map((id, i) => ({ id, x: 0, y: i * 50, width: 390, height: 44 })), texts: [] });
    const a = only(checkBoard({ doc, boardId: 'Brd00001', measure: measure(['Mst00001', 'Txt00001', 'Ins00001', 'Ins00001/Txt00001']) }), 'LC-32');
    const b = only(checkBoard({ doc, boardId: 'Brd00002', measure: measure(['Ins00002', 'Ins00002/Txt00001']) }), 'LC-32');
    expect(a.map((f) => f.nodeId)).toEqual(['Ins00001']);
    expect(b).toEqual([]);
  });
});

// ===========================================================================
// Aturan struktural G1 (story 4): LC-13, LC-14, LC-15, LC-16, LC-21, LC-22.
// ===========================================================================

const paint = (c = '#FFFFFF') => ({ fills: [{ type: 'solid', color: c }] });
const icon = (lib: string, r: R, extra: Loose = {}): Loose => ({ type: 'icon', id: nid(), name: `Icon / ${lib}`, lib, icon: 'check', size: r[2], ...extra, _r: r });
const path = (name: string, r: R, extra: Loose = {}): Loose => ({ type: 'path', id: nid(), name, d: 'M0 0L10 10', viewBox: [0, 0, 24, 24], ...paint('#111111'), ...extra, _r: r });

describe('LC-13 nama layer default (info)', () => {
  it.each(['Rectangle 2', 'Group', 'svg12', 'Frame', 'Ellipse 3', 'Path', 'Image', 'Vector 7'])('positif %j', (name) => {
    const f = only(runAll(clean([rect(name, [0, 0, 100, 20], paint())])), 'LC-13');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: 'info', nodeName: name });
  });
  it.each(['Image / Kamar', 'Teks', 'Rectangle besar', 'Kartu / Harga', 'Icon / lucide / check'])('negatif %j', (name) => {
    expect(only(runAll(clean([rect(name, [0, 0, 100, 20], paint())])), 'LC-13')).toEqual([]);
  });
  it('board bernama default juga dilaporkan', () => {
    expect(only(runAll(clean([], { name: 'Board 1' })), 'LC-13').map((f) => f.nodeName)).toEqual(['Board 1']);
  });
  it('maks 3 info per board; ketiga "(+n serupa)"', () => {
    const f = only(runAll(clean(Array.from({ length: 5 }, (_, i) => rect(`Rectangle ${i}`, [0, i * 30, 100, 20], paint())))), 'LC-13');
    expect(f).toHaveLength(3);
    expect(f[2]!.detail.endsWith('(+2 serupa)')).toBe(true);
    expect(f[0]!.detail.endsWith('serupa)')).toBe(false);
  });
});

describe('LC-14 absolut di dalam flex', () => {
  const abs = { position: 'absolute' };
  it('positif: anak absolut di frame row/column dan di board', () => {
    const kids = [
      frame('Baris', [0, 0, 390, 40], [rect('Titik', [10, 10, 8, 8], { ...paint('#F00000'), ...abs })], { layout: 'row' }),
      frame('Kolom', [0, 40, 390, 200], [rect('Lencana', [10, 50, 20, 20], { ...paint('#F00000'), ...abs })]),
      rect('Bar bawah', [0, 780, 390, 64], { ...paint(), ...abs }),
    ];
    const f = only(runAll(clean(kids)), 'LC-14');
    expect(f.map((x) => x.nodeName)).toEqual(['Titik', 'Lencana', 'Bar bawah']);
    expect(f.every((x) => x.level === 'warning')).toBe(true);
    expect(f[0]!.detail).toContain('layout row Baris');
    expect(f[2]!.detail).toContain('board');
  });
  it('negatif: Overlay /, Crop /, Status bar, Home indicator, induk layout none, leluhur Overlay/Crop', () => {
    const kids = [
      frame('Overlay / Tab bar', [0, 780, 390, 64], [rect('Isi', [0, 780, 10, 10], { ...paint(), ...abs })], { ...abs, ...paint() }),
      frame('Crop / Efek', [0, 0, 390, 300], [rect('Blob', [0, 0, 200, 200], { ...paint('#FF0000'), ...abs })], { ...abs, clip: true }),
      rect('Status bar', [0, 0, 390, 44], abs),
      rect('Home indicator', [128, 830, 134, 5], { ...paint('#000000'), ...abs }),
      frame('Avatar', [0, 300, 48, 48], [rect('Titik', [36, 300, 12, 12], { ...paint('#00AA00'), ...abs })], { layout: 'none' }),
    ];
    expect(only(runAll(clean(kids)), 'LC-14')).toEqual([]);
  });
});

describe('LC-15 > 1 pustaka ikon UI', () => {
  it('lucide + pustaka lain (fixture cast) → 1 warning di board', () => {
    const f = only(runAll(clean([icon('lucide', [0, 0, 24, 24]), icon('lucide', [30, 0, 24, 24]), icon('phosphor', [60, 0, 24, 24])])), 'LC-15');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: 'warning', nodeName: 'Home', detail: '2 pustaka ikon UI: lucide 2, phosphor 1' });
  });
  it('lucide + simple-icons (logo) → tidak', () => {
    expect(only(runAll(clean([icon('lucide', [0, 0, 24, 24]), icon('simple-icons', [30, 0, 24, 24])])), 'LC-15')).toEqual([]);
  });
});

describe('LC-16 ikon digambar manual (error bukan gerbang)', () => {
  it('path 24×24 bernama "Centang" → error, summary gate tidak bertambah', () => {
    const f = runAll(clean([path('Centang', [0, 0, 24, 24])]));
    const lc16 = only(f, 'LC-16');
    expect(lc16).toHaveLength(1);
    expect(lc16[0]).toMatchObject({ level: 'error', nodeName: 'Centang' });
    expect(lc16[0]!.detail).toBe('path 24×24 "Centang" digambar manual');
    const s = summarizeFindings(f);
    expect(s.error).toBe(1);
    expect(s.gate).toBe(0);
  });
  it('batas 32 × 32 (+0,5); tanpa ukuran terukur → width/height angka, lalu viewBox', () => {
    expect(only(runAll(clean([path('Ikon kecil', [0, 0, 32.4, 32])])), 'LC-16')).toHaveLength(1);
    expect(only(runAll(clean([path('Ikon besar', [0, 0, 33, 24])])), 'LC-16')).toEqual([]);
    const unmeasured = (extra: Loose) => {
      const { _r, ...p } = path('Tanpa ukur', [0, 0, 0, 0], extra);
      return only(runAll(clean([p])), 'LC-16').map((f) => f.detail);
    };
    // Fallback 1: width/height angka (menang atas viewBox).
    expect(unmeasured({ width: 20, height: 20, viewBox: [0, 0, 100, 100] })).toEqual(['path 20×20 "Tanpa ukur" digambar manual']);
    expect(unmeasured({ width: 48, height: 48, viewBox: [0, 0, 24, 24] })).toEqual([]);
    // Fallback 2: viewBox bila width/height bukan angka.
    expect(unmeasured({ width: 'hug', viewBox: [0, 0, 24, 24] })).toEqual(['path 24×24 "Tanpa ukur" digambar manual']);
    expect(unmeasured({ viewBox: [0, 0, 64, 64] })).toEqual([]);
  });
  it('negatif: path tersembunyi (opacity 0, atau di luar clip/board sama sekali)', () => {
    const kids = [
      path('Centang 0', [0, 0, 24, 24], { opacity: 0 }),
      path('Di luar board', [500, 0, 24, 24], { position: 'absolute' }),
      frame('Kotak', [0, 40, 40, 40], [path('Terpotong habis', [60, 40, 24, 24], { position: 'absolute' })], { clip: true, layout: 'none' }),
    ];
    expect(only(runAll(clean(kids)), 'LC-16')).toEqual([]);
  });
  it('negatif: Chart /, Shape /, path 88×32', () => {
    const kids = [path('Chart / Garis', [0, 0, 24, 24]), path('Shape / Gelombang', [0, 30, 24, 24]), path('Sparkline', [0, 60, 88, 32])];
    expect(only(runAll(clean(kids)), 'LC-16')).toEqual([]);
  });
});

describe('LC-21 struktural', () => {
  const lc21 = (f: Finding[], prefix: string) => only(f, 'LC-21').filter((x) => x.detail.startsWith(prefix));
  it('radius: 4 nilai terlihat di luar 0 dan full → 1 warning di board', () => {
    const kids = [4, 8, 12, 20].map((r, i) => rect(`Kartu ${i}`, [0, i * 100, 200, 80], { ...paint('#EEEEEE'), radius: r }));
    const f = lc21(runAll(clean(kids)), 'radius:');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: 'warning', nodeName: 'Home', detail: 'radius: 4 nilai (4, 8, 12, 20)' });
  });
  it('radius: 3 nilai + pill/lingkaran, tuple dipecah, node tak bercat → tidak', () => {
    const kids = [
      rect('Kartu', [0, 0, 200, 80], { ...paint('#EEEEEE'), radius: [8, 8, 0, 0] }),
      rect('Panel', [0, 100, 200, 80], { ...paint('#EEEEEE'), radius: 12 }),
      rect('Tombol', [0, 200, 200, 40], { ...paint('#EEEEEE'), radius: 16 }),
      rect('Pill', [0, 300, 100, 32], { ...paint('#EEEEEE'), radius: 16 }),
      rect('Avatar', [0, 400, 48, 48], { ...paint('#EEEEEE'), radius: 999 }),
      frame('Tanpa cat', [0, 500, 200, 80], [text('Isi', [0, 500, 50, 20])], { radius: 6 }),
    ];
    expect(lc21(runAll(clean(kids)), 'radius:')).toEqual([]);
  });
  it('spacer kosong: frame tanpa anak dan tanpa cat, atau rect tanpa cat, anak flow → warning', () => {
    const kids = [
      text('Atas', [0, 0, 100, 20]),
      frame('Jarak', [0, 20, 390, 24], []),
      rect('Jarak 2', [0, 44, 390, 16], { fills: [{ type: 'solid', color: '#FFFFFF00' }] }),
      text('Bawah', [0, 60, 100, 20]),
      // Frame kosong 0×0 tidak memakan ruang: bukan spacer.
      frame('Isi', [0, 80, 0, 0], [], { layout: 'row' }),
    ];
    const f = lc21(runAll(clean(kids)), 'spacer kosong:');
    expect(f.map((x) => x.nodeName)).toEqual(['Jarak', 'Jarak 2']);
  });
  it('spacer kosong: Image /, absolut, frame ber-fill/stroke/bayangan → tidak', () => {
    const kids = [
      frame('Image / Kamar', [0, 0, 390, 200], []),
      frame('Hiasan', [0, 200, 390, 24], [], { position: 'absolute' }),
      frame('Garis', [0, 224, 390, 1], [], paint('#E5E7EB')),
      frame('Bingkai', [0, 230, 390, 40], [], { stroke: { color: '#E5E7EB', width: 1, align: 'inside' } }),
      frame('Bayang', [0, 280, 390, 40], [], { shadows: [{ x: 0, y: 2, blur: 8, color: '#0000001A' }] }),
    ];
    expect(lc21(runAll(clean(kids)), 'spacer kosong:')).toEqual([]);
  });
  it('padding ganda: board mobile, frame tak bercat selebar isi induk berpadding di dalam leluhur berpadding → warning', () => {
    const inner = frame('Daftar', [20, 0, 350, 100], [text('Butir', [40, 0, 100, 20])], { padding: [0, 20] });
    const kids = [frame('Layar', [0, 0, 390, 844], [inner], { padding: 20, ...paint('#F8F8F8') })];
    const f = lc21(runAll(clean(kids)), 'padding ganda:');
    expect(f).toHaveLength(1);
    expect(f[0]!.nodeName).toBe('Daftar');
    expect(f[0]!.detail).toContain('padding kiri 20 di dalam padding kiri 20 Layar');
  });
  it('padding ganda: leluhur di atas wadah bercat tidak dihitung; board app/landing, kartu bercat, komponen → tidak', () => {
    const card = (name: string, extra: Loose) => frame(name, [20, 0, 350, 100], [text('Isi', [40, 0, 100, 20])], { padding: 16, ...extra });
    const screen = (kid: Loose) => [frame('Layar', [0, 0, 390, 844], [kid], { padding: 20 })];
    // Kartu bercat dan komponen: bukan padding ganda.
    expect(lc21(runAll(clean(screen(card('Kartu', paint('#FFFFFF'))))), 'padding ganda:')).toEqual([]);
    expect(lc21(runAll(clean(screen(card('Button / Utama', {})))), 'padding ganda:')).toEqual([]);
    // Board app/landing.
    expect(lc21(runAll(clean(screen(card('Daftar', {})), { screen: 'app', width: 1440, height: 900 })), 'padding ganda:')).toEqual([]);
    // Frame selebar isi kartu bercat (padding 0) di layar berpadding: leluhur bercat pertama = kartu (tanpa padding sisi) → berhenti.
    const inner = frame('Baris', [20, 0, 350, 40], [text('Isi', [36, 0, 50, 20])], { padding: [0, 16] });
    const painted = frame('Kartu', [20, 0, 350, 100], [inner], paint('#FFFFFF'));
    expect(lc21(runAll(clean(screen(painted))), 'padding ganda:')).toEqual([]);
    // Frame lebih sempit dari isi induk → bukan selebar isi.
    expect(lc21(runAll(clean(screen(frame('Sempit', [20, 0, 200, 100], [text('Isi', [40, 0, 50, 20])], { padding: 16 })))), 'padding ganda:')).toEqual([]);
  });
  it('teks di baris tabel: ≥ 3 baris row sejajar dengan teks langsung → warning per baris', () => {
    const row = (y: number) =>
      frame('Baris', [0, y, 390, 44], [text('Nama', [0, y, 120, 20]), text('Status', [130, y, 100, 20]), text('Rp 10.000', [240, y, 100, 20])], { layout: 'row' });
    const f = lc21(runAll(clean([frame('Tabel', [0, 0, 390, 200], [row(0), row(44), row(88), row(132)])])), 'teks di baris tabel:');
    expect(f).toHaveLength(3);
    expect(f[2]!.detail.endsWith('(+1 serupa)')).toBe(true);
    expect(f[0]!.detail).toContain('3 teks langsung di baris (4 baris sejajar di Tabel)');
  });
  it('teks di baris tabel: daftar ikon+teks+kontrol, sel ber-frame, kolom tidak sejajar, < 3 baris → tidak', () => {
    const list = (y: number) =>
      frame('Butir', [0, y, 390, 44], [icon('lucide', [0, y, 24, 24]), text('Notifikasi', [32, y, 200, 20]), rect('Toggle', [340, y, 44, 24], paint('#00AA00'))], { layout: 'row' });
    const cells = (y: number) =>
      frame('Baris', [0, y, 390, 44], ['Nama', 'Status', 'Harga'].map((t, i) => frame(`Sel / ${t}`, [i * 130, y, 120, 44], [text(t, [i * 130, y, 100, 20])])), { layout: 'row' });
    const ragged = (y: number, dx: number) =>
      frame('Baris', [0, y, 390, 44], [text('Nama', [0, y, 120, 20]), text('Status', [130 + dx, y, 100, 20]), text('Harga', [240, y, 100, 20])], { layout: 'row' });
    // Daftar antrean: nomor (1 teks lepas) + avatar berinisial + tumpukan teks + status → bukan tabel.
    const queue = (y: number) =>
      frame('Antrean', [0, y, 390, 56], [
        text('02', [0, y, 20, 20]),
        frame('Avatar', [28, y, 40, 40], [text('FK', [36, y, 20, 20])], paint('#EEEEEE')),
        frame('Teks', [76, y, 200, 40], [text('Fajar', [76, y, 100, 20]), text('11.30', [76, y + 20, 100, 20])]),
        frame('Status', [290, y, 100, 40], [text('Menunggu', [290, y, 80, 20])]),
      ], { layout: 'row' });
    const check = (kids: Loose[]) => lc21(runAll(clean([frame('Daftar', [0, 0, 390, 400], kids)])), 'teks di baris tabel:');
    expect(check([queue(0), queue(56), queue(112)])).toEqual([]);
    expect(check([list(0), list(44), list(88)])).toEqual([]);
    expect(check([cells(0), cells(44), cells(88)])).toEqual([]);
    expect(check([ragged(0, 0), ragged(44, 6), ragged(88, 12)])).toEqual([]);
    expect(check([ragged(0, 0), ragged(44, 0)])).toEqual([]);
  });
  it('bidang efek: dua bidang terpisah (mesh + blob blur) → 1 warning di board', () => {
    const mesh = { fills: [{ type: 'mesh', columns: 2, rows: 2, colors: ['#FF0000', '#00FF00', '#0000FF', '#FFFF00'] }] };
    const kids = [rect('Hero mesh', [0, 0, 390, 300], mesh), rect('Blob', [100, 500, 200, 200], { ...paint('#7C3AED'), blur: 60 })];
    const f = lc21(runAll(clean(kids)), 'bidang efek:');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ nodeName: 'Home', detail: 'bidang efek: 2 bidang terpisah ("Hero mesh", "Blob")' });
    // Label bidang = node efek terluas: blob kecil yang beririsan dengan mesh tidak menggantikan nama mesh.
    const withSmall = [rect('Titik blur', [0, 0, 60, 60], { ...paint('#22C55E'), blur: 30 }), ...kids];
    expect(lc21(runAll(clean(withSmall)), 'bidang efek:')[0]!.detail).toBe('bidang efek: 2 bidang terpisah ("Hero mesh", "Blob")');
  });
  it('bidang efek: gradien multi-hue luas = efek; satu bidang bertumpuk/bersarang, gradien satu hue/scrim, ring kecil → tidak', () => {
    const conic = { fills: [{ type: 'conic', stops: [{ offset: 0, color: '#FF0000' }, { offset: 1, color: '#0000FF' }] }] };
    const oneHue = { fills: [{ type: 'linear', angle: 90, stops: [{ offset: 0, color: '#2563EB' }, { offset: 1, color: '#1E40AF' }] }] };
    const scrim = { fills: [{ type: 'linear', angle: 180, stops: [{ offset: 0, color: '#00000000' }, { offset: 1, color: '#000000CC' }] }] };
    const mesh = { fills: [{ type: 'mesh', columns: 2, rows: 2, colors: ['#FF0000', '#00FF00', '#0000FF', '#FFFF00'] }] };
    // Bidang efek bersarang + blob yang beririsan = satu bidang; gradien satu hue dan scrim di tempat lain bukan efek.
    const field = frame('Crop / Efek', [0, 0, 390, 300], [rect('Mesh', [0, 0, 390, 300], mesh), rect('Blob', [200, 100, 150, 150], { ...paint('#F97316'), blur: 40, position: 'absolute' })], { clip: true, layout: 'none' });
    const kids = [field, rect('Kartu biru', [0, 320, 390, 300], oneHue), rect('Scrim', [0, 640, 390, 200], scrim), rect('Ring', [10, 700, 40, 40], conic)];
    expect(lc21(runAll(clean(kids)), 'bidang efek:')).toEqual([]);
    // Dua blob blur tak beririsan di sudut berlawanan satu `Crop /` atau satu frame clip = satu bidang.
    const blob = (name: string, r: R) => rect(name, r, { ...paint('#F97316'), blur: 40, position: 'absolute' });
    for (const wrap of [{ name: 'Crop / Efek', extra: { clip: true } }, { name: 'Hero', extra: { clip: true } }]) {
      const box = frame(wrap.name, [0, 0, 390, 400], [blob('Blob kiri atas', [0, 0, 100, 100]), blob('Blob kanan bawah', [290, 300, 100, 100])], { layout: 'none', ...wrap.extra });
      expect(lc21(runAll(clean([box])), 'bidang efek:'), wrap.name).toEqual([]);
    }
    // Conic multi-hue luas (≥ 20% layar) di luar bidang pertama → bidang kedua.
    expect(lc21(runAll(clean([field, rect('Latar conic', [0, 400, 390, 300], conic)])), 'bidang efek:')).toHaveLength(1);
  });
});

describe('LC-22 jumlah node berkonvensi (info)', () => {
  it('board dengan Crop/Overlay/Scroll/Ekstra → satu info', () => {
    const kids = [
      frame('Scroll / Isi', [0, 0, 390, 700], [frame('Crop / Efek', [0, 0, 390, 200], [], paint('#EEEEEE')), frame('Ekstra / Testimoni', [0, 200, 390, 200], [text('Isi', [0, 200, 50, 20])])]),
      frame('Overlay / Tab bar', [0, 780, 390, 64], [], { position: 'absolute', ...paint() }),
    ];
    const f = only(runAll(clean(kids)), 'LC-22');
    expect(f).toEqual([
      { level: 'info', rule: 'LC-22', nodeId: expect.any(String), nodeName: 'Home', detail: 'Crop 1, Overlay 1, Scroll 1, Ekstra 1', expected: 'sebut di artefak konvensi: (batas Crop ≤ 2, Ekstra ≤ 1 per board)' },
    ]);
  });
  it('board tanpa node konvensi → tidak ada temuan', () => {
    expect(only(runAll(clean([text('Halo', [0, 0, 100, 20])])), 'LC-22')).toEqual([]);
  });
  it('urutan level: error → warning → info', () => {
    const f = runAll(clean([rect('Rectangle', [0, 0, 100, 20], { position: 'absolute', ...paint() }), path('Centang', [0, 40, 24, 24]), frame('Overlay / X', [0, 800, 390, 44], [], { position: 'absolute', ...paint() })]));
    const levels = f.map((x) => x.level);
    expect(levels).toEqual([...levels].sort((a, b) => ['error', 'warning', 'info'].indexOf(a) - ['error', 'warning', 'info'].indexOf(b)));
    // Dalam level: urutan dokumen (board LC-22 sebelum node LC-13).
    expect(rules(f)).toEqual(['LC-16', 'LC-14', 'LC-22', 'LC-13']);
  });
});

// ===========================================================================
// Tipografi dan spacing G1 (story 5): LC-03, LC-06, LC-07, LC-08, LC-09, LC-10 (warning, tanpa gerbang).
// ===========================================================================

const landing = (children: Loose[]): BoardSpec => ({ children, screen: 'landing', width: 1440, height: 900 });
const app = (children: Loose[]): BoardSpec => ({ children, screen: 'app', width: 1440, height: 900 });
const PARA = 'Kami membantu warung mencatat stok dan penjualan harian dengan mudah';

describe('LC-03 teks tetap berisiko meluber', () => {
  it("positif: wrap:'fixed' terukur 2 baris → warning", () => {
    const f = only(runAll(clean([text('Kopi susu gula aren', [0, 0, 100, 40], { name: 'Judul', wrap: 'fixed', _lines: 2, _lh: 20 })])), 'LC-03');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: 'warning', nodeName: 'Judul', expected: `wrap:'wrap' dengan lebar fill/angka, atau beri ruang` });
    expect(f[0]!.detail.startsWith('wrap fixed: 2 baris')).toBe(true);
    expect(summarizeFindings(f).gate).toBe(0);
  });
  it('positif: ink melewati kotak > 1px (kiri/kanan); baris × line-height melewati tinggi kotak', () => {
    const wide = only(runAll(clean([text('Meta pesanan', [0, 0, 100, 20], { _ink: [0, 2, 104, 16] })])), 'LC-03');
    expect(wide).toHaveLength(1);
    expect(wide[0]!.detail).toContain('melewati kotaknya 4px');
    const left = only(runAll(clean([text('Nama', [10, 0, 100, 20], { _ink: [7, 2, 50, 16] })])), 'LC-03');
    expect(left).toHaveLength(1);
    const tall = only(runAll(clean([text('Isi panjang', [0, 0, 200, 40], { wrap: 'wrap', _lines: 3, _lh: 20 })])), 'LC-03');
    expect(tall).toHaveLength(1);
    expect(tall[0]!.detail.startsWith('3 baris × 20 > tinggi kotak 40')).toBe(true);
  });
  it('satu temuan per teks (fixed didahulukan)', () => {
    const f = only(runAll(clean([text('Kopi susu', [0, 0, 100, 20], { wrap: 'fixed', _lines: 2, _lh: 20, _ink: [0, 0, 110, 40] })])), 'LC-03');
    expect(f).toHaveLength(1);
    expect(f[0]!.detail.startsWith('wrap fixed')).toBe(true);
  });
  it('teks yang sudah error LC-02b (ink meluap dari induk) tidak diberi LC-03 lagi', () => {
    const t = text('Meta pesanan panjang', [0, 0, 100, 20], { _ink: [0, 2, 130, 16] });
    const all = runAll(clean([frame('Kartu', [0, 0, 100, 20], [t], { layout: 'row', ...paint() })]));
    expect(only(all, 'LC-02b').map((f) => f.nodeId)).toEqual([t.id]);
    expect(only(all, 'LC-03')).toEqual([]);
  });
  it('negatif: fixed 1 baris; ink lebih 1px; teks kosong; teks tak terlihat', () => {
    const kids = [
      text('Satu baris', [0, 0, 100, 20], { wrap: 'fixed', _lines: 1, _lh: 20 }),
      text('Pas', [0, 30, 100, 20], { _ink: [0, 32, 101, 16] }),
      text('  ', [0, 60, 100, 20], { wrap: 'fixed', _lines: 2, _lh: 20 }),
      text('Di luar board', [0, 900, 100, 20], { wrap: 'fixed', _lines: 2, _lh: 20 }),
    ];
    expect(only(runAll(clean(kids)), 'LC-03')).toEqual([]);
  });
});

describe('LC-06 paragraf di bawah minimum', () => {
  it('positif: landing/mobile 14px paragraf di luar kartu; kartu ber-cat 12px; app 12px', () => {
    for (const spec of [landing([text(PARA, [0, 0, 300, 40], { _lines: 2 })]), clean([text(PARA, [0, 0, 300, 40], { _lines: 2 })])]) {
      const f = only(runAll(spec), 'LC-06');
      expect(f).toHaveLength(1);
      expect(f[0]!.detail.startsWith('paragraf 14px 2 baris')).toBe(true);
      expect(f[0]!.expected).toBe('≥ 16px (body)');
    }
    const card = frame('Kartu / Fitur', [0, 0, 340, 120], [text(PARA, [24, 24, 280, 32], { size: 12, _lines: 2 })], { padding: 24, ...paint() });
    const inCard = only(runAll(landing([card])), 'LC-06');
    expect(inCard).toHaveLength(1);
    expect(inCard[0]!.expected).toBe('≥ 14px (body-sm di kartu)');
    const ap = only(runAll(app([text(PARA, [0, 0, 300, 32], { size: 12, _lines: 2 })])), 'LC-06');
    expect(ap).toHaveLength(1);
    expect(ap[0]!.expected).toBe('≥ 14px (body-sm)');
  });
  it('negatif: app 14px; landing 14px di kartu ber-cat; judul 600; < 6 kata; 1 baris; di dalam komponen', () => {
    expect(only(runAll(app([text(PARA, [0, 0, 300, 40], { _lines: 2 })])), 'LC-06')).toEqual([]);
    const card = frame('Kartu', [0, 0, 340, 120], [text(PARA, [24, 24, 280, 40], { _lines: 2 })], { padding: 24, ...paint() });
    expect(only(runAll(landing([card])), 'LC-06')).toEqual([]);
    const kids = [
      text(PARA, [0, 0, 300, 40], { weight: 600, _lines: 2 }),
      text('Stok kopi hampir habis', [0, 50, 100, 40], { _lines: 2 }),
      text(PARA, [0, 100, 600, 20], { _lines: 1 }),
      frame('Chip / Filter', [0, 150, 120, 44], [text(PARA, [8, 150, 100, 40], { size: 12, _lines: 2 })], { layout: 'row' }),
      frame('Button / Kirim', [0, 200, 120, 44], [text(PARA, [8, 200, 100, 40], { _lines: 2 })], { layout: 'row' }),
    ];
    expect(only(runAll(landing(kids)), 'LC-06')).toEqual([]);
  });
});

describe('LC-07 spacing di luar himpunan', () => {
  it('positif: gap 10 + padding [0,10] → satu warning per frame berisi daftar nilai; padding 112; Chip / height 28; IconButton / width 36', () => {
    const kids = [
      frame('Daftar', [0, 0, 390, 100], [], { gap: 10, padding: [0, 10] }),
      frame('Seksi', [0, 100, 390, 300], [], { padding: [112, 20] }),
      frame('Chip / Semua', [0, 400, 80, 28], [], { height: 28, padding: [0, 12] }),
    ];
    const f = only(runAll(clean(kids)), 'LC-07');
    expect(f.map((x) => [x.nodeName, x.detail])).toEqual([
      ['Daftar', 'gap 10, padding 10'],
      ['Seksi', 'padding 112'],
      ['Chip / Semua', 'height 28'],
    ]);
    expect(f[0]!.level).toBe('warning');
    const ib = only(runAll(clean([frame('IconButton / Tutup', [0, 0, 36, 44], [], { width: 36, height: 44 })])), 'LC-07');
    expect(ib.map((x) => x.detail)).toEqual(['width 36']);
  });
  it('cap: 5 frame → 3 temuan, ketiga "(+2 serupa)"', () => {
    const kids = Array.from({ length: 5 }, (_, i) => frame(`Baris ${i}`, [0, i * 50, 390, 40], [], { gap: 10 }));
    const f = only(runAll(clean(kids)), 'LC-07');
    expect(f).toHaveLength(3);
    expect(f[2]!.detail).toBe('gap 10 (+2 serupa)');
  });
  it('negatif: nilai token, gap negatif, padding bawah 34, Status bar/Home indicator + keturunan, komponen 44/56, lebar Button bebas, frame non-komponen', () => {
    const kids = [
      ...[0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128].map((v, i) => frame(`F${i}`, [0, i * 10, 390, 10], [], { gap: v, padding: v })),
      frame('Tumpuk', [0, 200, 390, 40], [], { gap: -8, layout: 'row' }),
      frame('Overlay / Bilah bawah', [0, 700, 390, 144], [], { padding: [16, 20, 34, 20] }),
      frame('Status bar', [0, 0, 390, 54], [frame('Sinyal', [300, 10, 60, 20], [], { gap: 5, padding: 3 })], { padding: [21, 24, 0, 24] }),
      frame('Home indicator', [0, 810, 390, 34], [], { padding: [21, 127] }),
      frame('IconButton / Kembali', [0, 300, 44, 44], [], { width: 44, height: 44 }),
      frame('Button / Bayar', [0, 400, 343, 56], [], { width: 343, height: 56, padding: [0, 24] }),
      frame('Kartu', [0, 500, 390, 52], [], { height: 52, width: 333 }),
    ];
    expect(only(runAll(clean(kids)), 'LC-07')).toEqual([]);
  });
});

describe('LC-08 ukuran dan triple tipe', () => {
  it('positif: ukuran di luar skala (13px, KPI / Nilai 56)', () => {
    const f = only(runAll(clean([text('09.30', [0, 0, 60, 20], { name: 'Jam', size: 13, lineHeight: 20 }), text('1.204', [0, 40, 200, 68], { name: 'KPI / Nilai', size: 56, lineHeight: 67.2 })])), 'LC-08');
    expect(f.map((x) => [x.nodeName, x.detail])).toEqual([
      ['Jam', '13/20 di luar skala'],
      ['KPI / Nilai', '56/67.2 di luar skala'],
    ]);
  });
  it('positif: triple tak cocok 16/20; 32 tanpa lineHeight (terukur 39); KPI / Nilai 28/32', () => {
    const f = only(runAll(clean([text('Isi', [0, 0, 100, 20], { size: 16, lineHeight: 20 }), text('Judul', [0, 40, 200, 39], { size: 32, _lh: 39, _lines: 1 })])), 'LC-08');
    expect(f.map((x) => x.detail)).toEqual(['16/20 (token 16/24)', '32/39 (token 32/40)']);
    const kpi = only(runAll(clean([text('486', [0, 0, 100, 32], { name: 'KPI / Nilai', size: 28, lineHeight: 32 })])), 'LC-08');
    expect(kpi.map((x) => x.detail)).toEqual(['28/32 (KPI 28/33.6 atau 28/36)']);
    expect(f[0]!.level).toBe('warning');
  });
  it('negatif: 16/24, 20/28, 22/28, 12/16 ±0,5; KPI / Nilai 32/38,4 dan 28/36 (triple skala); Display / 72/80; tanpa ukur; < 12px (LC-05)', () => {
    const kids = [
      text('A', [0, 0, 100, 24], { size: 16, lineHeight: 24 }),
      text('B', [0, 30, 100, 28], { size: 20, lineHeight: 28 }),
      text('C', [0, 60, 100, 28], { size: 22, _lh: 28, _lines: 1 }),
      text('D', [0, 90, 100, 16], { size: 12, lineHeight: 16.4 }),
      text('1.204', [0, 120, 100, 38], { name: 'KPI / Nilai', size: 32, lineHeight: 38.4 }),
      text('486', [0, 120, 100, 36], { name: 'KPI / Nilai', size: 28, lineHeight: 36 }),
      text('Kopi', [0, 170, 300, 80], { name: 'Display / Hero', size: 72, lineHeight: 80 }),
      text('E', [0, 260, 100, 20], { size: 14 }),
      text('Kecil', [0, 290, 100, 16], { name: 'Kecil', size: 11, lineHeight: 16 }),
    ];
    const f = runAll(clean(kids));
    expect(only(f, 'LC-08')).toEqual([]);
    // < 12px: hanya error LC-05, tidak dilaporkan ganda sebagai LC-08.
    expect(only(f, 'LC-05').map((x) => x.nodeName)).toEqual(['Kecil']);
  });
});

describe('LC-09 keluarga font', () => {
  it('3 keluarga non-mono (kosong = Inter) → satu warning di board', () => {
    const kids = [text('A', [0, 0, 100, 20]), text('B', [0, 30, 100, 20], { family: 'Plus Jakarta Sans' }), text('C', [0, 60, 100, 20], { family: 'Lora' })];
    const f = only(runAll(clean(kids)), 'LC-09');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ nodeName: 'Home', level: 'warning', detail: '3 keluarga font: Inter, Plus Jakarta Sans, Lora' });
  });
  it('2 keluarga + JetBrains Mono → tidak; teks kosong/tak terlihat tidak dihitung', () => {
    const kids = [
      text('A', [0, 0, 100, 20]),
      text('B', [0, 30, 100, 20], { family: 'Plus Jakarta Sans' }),
      text('SKU-1', [0, 60, 100, 20], { family: 'JetBrains Mono' }),
      text(' ', [0, 90, 100, 20], { family: 'Lora' }),
      text('Jauh', [0, 1000, 100, 20], { family: 'Lora' }),
    ];
    expect(only(runAll(clean(kids)), 'LC-09')).toEqual([]);
  });
});

describe('LC-10 target sentuh di board mobile', () => {
  const small = () => [
    frame('IconButton / Kembali', [0, 0, 40, 40], [], { width: 40, height: 40 }),
    text('Semua', [300, 60, 60, 20], { name: 'Link / Semua' }),
    frame('Tab / Beranda', [0, 100, 169, 40], [], { height: 40 }),
  ];
  it('positif: mobile 390: IconButton / 40×40, Link / teks tinggi 20, Tab / 169×40', () => {
    const f = only(runAll(clean(small())), 'LC-10');
    expect(f.map((x) => [x.nodeName, x.detail])).toEqual([
      ['IconButton / Kembali', '40×40 < 44×44'],
      ['Link / Semua', '60×20 < 44×44'],
      ['Tab / Beranda', '169×40 < 44×44'],
    ]);
    expect(summarizeFindings(f)).toEqual({ error: 0, warning: 3, gate: 0, info: 0 });
  });
  it('negatif: board app/landing, mobile lebar 744, Button / 342×48, Badge / kecil, node tak terlihat', () => {
    expect(only(runAll(app(small())), 'LC-10')).toEqual([]);
    expect(only(runAll(landing(small())), 'LC-10')).toEqual([]);
    expect(only(runAll({ children: small(), width: 744, height: 1133 }), 'LC-10')).toEqual([]);
    const kids = [
      frame('Button / Bayar', [24, 700, 342, 48], [], { height: 48 }),
      frame('Badge / Baru', [0, 0, 40, 20], [], { height: 20 }),
      frame('IconButton / Jauh', [0, 900, 40, 40], [], { width: 40, height: 40 }),
    ];
    expect(only(runAll(clean(kids)), 'LC-10')).toEqual([]);
  });
});

// ---- Konten dan struktur seksi (story G1 6)

/** Seksi landing: judul 32 + grid `layout:'row'` berisi `n` kartu (frame + judul 20 + isi 16) = 2 + 3n node. */
const section = (name: string, y: number, n: number, extra: Loose = {}): Loose =>
  frame(name, [0, y, 1440, 200], [
    text('Judul seksi', [80, y + 24, 600, 40], { size: 32, name: 'Judul' }),
    frame('Grid', [80, y + 80, 1280, 100], Array.from({ length: n }, (_, i) => frame(`Kartu ${i + 1}`, [80 + i * 300, y + 80, 280, 100], [
      text('Judul kartu', [96 + i * 300, y + 96, 240, 28], { size: 20, name: 'Judul kartu' }),
      text('Isi kartu singkat', [96 + i * 300, y + 132, 240, 24], { size: 16, name: 'Isi' }),
    ])), { layout: 'row', gap: 16 }),
  ], extra);

describe('LC-17 struktur seksi mirip', () => {
  it('positif: dua Seksi / judul + 3 kartu identik → 1 warning pada seksi kedua', () => {
    const a = section('Seksi / Fitur', 0, 3);
    const b = section('Seksi / Manfaat', 220, 3);
    const f = only(runAll(landing([a, b])), 'LC-17');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: 'warning', nodeId: b.id, nodeName: 'Seksi / Manfaat', detail: `mirip Seksi / Fitur (${a.id}): 100%` });
    expect(f[0]!.expected).toBe('variasikan komposisi antar-seksi (tata letak, jenis isi), bukan judul + kartu identik berulang');
    expect(summarizeFindings(f).gate).toBe(0);
  });
  it('tiga seksi identik → satu temuan per seksi kedua dan ketiga (pasangan terbaik = seksi pertama)', () => {
    const [a, b, c] = [section('Seksi / A', 0, 3), section('Seksi / B', 220, 3), section('Seksi / C', 440, 3)];
    const f = only(runAll(landing([a, b, c])), 'LC-17');
    expect(f.map((x) => [x.nodeId, x.detail])).toEqual([
      [b.id, `mirip Seksi / A (${a.id}): 100%`],
      [c.id, `mirip Seksi / A (${a.id}): 100%`],
    ]);
  });
  it('fallback tanpa Seksi /: board → Halaman (satu-satunya anak flow, kolom) → dua anak frame berpola sama', () => {
    const a = section('Fitur', 0, 3);
    const b = section('Harga', 220, 3);
    const f = only(runAll(landing([frame('Halaman', [0, 0, 1440, 900], [a, b])])), 'LC-17');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ nodeId: b.id, detail: `mirip Fitur (${a.id}): 100%` });
  });
  it('negatif: 3 vs 4 kartu (Jaccard < 0,9)', () => {
    expect(only(runAll(landing([section('Seksi / A', 0, 3), section('Seksi / B', 220, 4)])), 'LC-17')).toEqual([]);
  });
  it('negatif: kartu dalam satu grid (anak row) tanpa Seksi /', () => {
    const card = (i: number) => frame(`Kartu ${i}`, [i * 300, 0, 280, 300], [
      text('Judul', [i * 300, 0, 200, 28], { size: 20 }),
      text('Isi', [i * 300, 40, 200, 24], { size: 16 }),
      text('Isi', [i * 300, 70, 200, 24], { size: 16 }),
      text('Isi', [i * 300, 100, 200, 24], { size: 16 }),
      frame('Button / Pesan', [i * 300, 140, 120, 44], [text('Pesan', [i * 300 + 16, 150, 80, 24], { size: 16 })], { layout: 'row' }),
    ]);
    expect(only(runAll(landing([frame('Grid', [0, 0, 1440, 300], [card(0), card(1), card(2)], { layout: 'row' })])), 'LC-17')).toEqual([]);
  });
  it('negatif: baris daftar (anak layout row) di tumpukan utama kolom tanpa Seksi /', () => {
    const row = (y: number) => frame(`Item / ${y}`, [20, y, 350, 64], [
      frame('Ikon', [32, y + 12, 40, 40], [{ type: 'icon', id: nid(), name: 'Ikon', lib: 'lucide', icon: 'book', size: 20, _r: [42, y + 22, 20, 20] }], { layout: 'row' }),
      frame('Teks', [84, y + 12, 200, 40], [text('Judul', [84, y + 12, 200, 20], { size: 16 }), text('Meta', [84, y + 34, 200, 18], { size: 14 })]),
      frame('Badge / Status', [290, y + 20, 70, 24], [text('Dipinjam', [298, y + 22, 54, 20], { size: 12 })], { layout: 'row' }),
    ], { layout: 'row' });
    expect(only(runAll(clean([frame('Daftar', [0, 0, 390, 300], [row(20), row(92), row(164)], { padding: 20, gap: 8 })])), 'LC-17')).toEqual([]);
  });
  it('negatif: seksi bersarang (leluhur–keturunan)', () => {
    const inner = section('Seksi / Dalam', 0, 3);
    const outer = frame('Seksi / Luar', [0, 0, 1440, 220], [inner]);
    expect(only(runAll(landing([outer])), 'LC-17')).toEqual([]);
  });
  it('negatif: seksi < 6 node terlihat', () => {
    expect(only(runAll(landing([section('Seksi / A', 0, 1), section('Seksi / B', 220, 1)])), 'LC-17')).toEqual([]);
  });
  it('negatif: tumpukan utama berupa row (sidebar + main)', () => {
    const side = section('Sidebar', 0, 3);
    const main = section('Main', 0, 3);
    expect(only(runAll(app([frame('Layar', [0, 0, 1440, 900], [side, main], { layout: 'row' })])), 'LC-17')).toEqual([]);
  });
});

describe('LC-19 frasa terlarang', () => {
  it('positif: kata utuh, tanpa beda huruf, spasi ganda, tanda hubung', () => {
    const kids = [
      text('Pelajari Lebih Lanjut →', [0, 0, 300, 20], { name: 'Tautan' }),
      text('Unlock your data.', [0, 30, 300, 20]),
      text('Klik  di sini', [0, 60, 300, 20]),
      text('Analitik next-level untuk warung', [0, 90, 300, 20]),
    ];
    const f = only(runAll(landing(kids)), 'LC-19');
    expect(f).toHaveLength(3);
    expect(f[0]).toMatchObject({ level: 'warning', nodeId: kids[0]!.id, detail: 'frasa terlarang "pelajari lebih lanjut" (id) di "Pelajari Lebih Lanjut →"', expected: 'ganti dengan aksi/klaim spesifik dari konten' });
    expect(f[1]!.detail).toBe('frasa terlarang "unlock" (en) di "Unlock your data."');
    expect(f[2]!.detail).toBe('frasa terlarang "klik di sini" (id) di "Klik  di sini" (+1 serupa)');
    const all = only(runAll(landing([kids[3]!])), 'LC-19');
    expect(all[0]!.detail).toBe('frasa terlarang "next-level" (en) di "Analitik next-level untuk warung"');
    expect(summarizeFindings(f).gate).toBe(0);
  });
  it('beberapa frasa dalam satu teks → satu temuan', () => {
    const f = only(runAll(landing([text('Seamless and next-level. Learn more', [0, 0, 400, 20])])), 'LC-19');
    expect(f).toHaveLength(1);
    expect(f[0]!.detail).toBe('frasa terlarang "learn more" (en), "seamless" (en), "next-level" (en) di "Seamless and next-level. Learn more"');
  });
  it('negatif: bukan kata utuh; di dalam Input /; bernama atau berleluhur Label; tak terlihat', () => {
    const kids = [
      text('unlocked', [0, 0, 300, 20]),
      text('Seamlessly', [0, 30, 300, 20]),
      text('pelajari lebih lanjutan', [0, 60, 300, 20]),
      frame('Input / Cari', [0, 90, 300, 44], [text('Klik di sini untuk mencari', [12, 100, 260, 20], { name: 'Placeholder' })], { layout: 'row' }),
      text('Learn more', [0, 140, 300, 20], { name: 'Label' }),
      frame('Label', [0, 170, 300, 20], [text('Lorem ipsum', [0, 170, 300, 20])], { layout: 'row' }),
      text('Click here', [0, 1000, 300, 20]),
    ];
    expect(only(runAll(landing(kids)), 'LC-19')).toEqual([]);
  });
  it('positif: Label di dalam Button / Link / Tab tidak dikecualikan (keputusan Adam 2026-11-19)', () => {
    const btn = frame('Button / Info', [0, 0, 200, 44], [text('Pelajari lebih lanjut', [16, 12, 168, 20], { name: 'Label' })], { layout: 'row' });
    const link = frame('Link / Info', [0, 60, 200, 20], [frame('Label', [0, 60, 200, 20], [text('Learn more', [0, 60, 200, 20])], { layout: 'row' })], { layout: 'row' });
    const f = only(runAll(landing([btn, link])), 'LC-19');
    expect(f.map((x) => x.detail)).toEqual(['frasa terlarang "pelajari lebih lanjut" (id) di "Pelajari lebih lanjut"', 'frasa terlarang "learn more" (en) di "Learn more"']);
  });
});
