// spec-check-autofix: data fix per aturan (fix aman vs saran), perencanaan (`planFixes`), dan cek basi (`staleFixes`).
import { afterAll, describe, expect, it } from 'vitest';
import { G0_RULE_IDS, SCHEMA_VERSION, type Finding, type ResolvedDocument } from '@lakar/schema';
import type { BoardMeasure, NodeBounds, TextMeasure } from '@lakar/ports';
import { AUTOFIX, checkBoard, nearestOf, planFixes, punctuated, staleFixes, type PlannedFix } from './index.js';

type R = [number, number, number, number];
type Loose = Record<string, any>;

let seq = 0;
const nid = (): string => `F${String(++seq).padStart(7, '0')}`;
const text = (content: string, r: R, extra: Loose = {}): Loose => ({ type: 'text', id: nid(), name: 'Teks', content, size: 14, ...extra, _r: r });
const rect = (name: string, r: R, extra: Loose = {}): Loose => ({ type: 'rect', id: nid(), name, ...extra, _r: r });
const frame = (name: string, r: R, children: Loose[], extra: Loose = {}): Loose => ({ type: 'frame', id: nid(), name, layout: 'column', ...extra, children, _r: r });
const solid = { fills: [{ type: 'solid', color: '#FFFFFF' }] };

type Spec = { name?: string; x?: number; width?: number; height?: number; screen?: 'mobile' | 'app' | 'landing'; hug?: true; expectedSize?: { width: number; height: number }; children: Loose[] };

function docOf(specs: Spec[]): { doc: ResolvedDocument; boards: string[]; measures: Map<string, BoardMeasure> } {
  const measures = new Map<string, BoardMeasure>();
  const boards = specs.map((s) => {
    const id = nid();
    const nodes: NodeBounds[] = [];
    const texts: TextMeasure[] = [];
    const strip = (children: Loose[]): Loose[] =>
      children.map(({ _r, _lines, children: kids, ...n }) => {
        const r = _r as R;
        nodes.push({ id: n.id as string, x: r[0], y: r[1], width: r[2], height: r[3] });
        if (_lines) texts.push({ id: n.id as string, lines: _lines as number, lineHeight: r[3] / (_lines as number) });
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
      y: 0,
      width,
      height: s.hug ? 'hug' : height,
      screen: s.screen ?? 'mobile',
      ...(s.expectedSize ? { expectedSize: s.expectedSize } : {}),
      children,
    };
  });
  const doc = { schemaVersion: SCHEMA_VERSION, id: 'Docu0001', rev: 1, pages: [{ id: 'Page0001', name: 'Page 1', children: boards }] };
  return { doc: doc as unknown as ResolvedDocument, boards: boards.map((b) => b.id), measures };
}

/** Semua temuan yang pernah dihasilkan file ini (konsistensi kelas AUTOFIX di akhir). */
const produced: Finding[] = [];
const check = (spec: Spec | Spec[], which = 0, cap = true): Finding[] => {
  const { doc, boards, measures } = docOf(Array.isArray(spec) ? spec : [spec]);
  const out = checkBoard({ doc, boardId: boards[which]!, measure: measures.get(boards[which]!)!, cap });
  produced.push(...out);
  return out;
};
const of = (f: Finding[], rule: string) => f.filter((x) => x.rule === rule);
const one = (f: Finding[], rule: string): Finding => {
  const xs = of(f, rule);
  expect(xs, rule).toHaveLength(1);
  return xs[0]!;
};

describe('fix aman', () => {
  it('LC-29: bobot tipis di teks kecil → fix weight 400, tanpa saran', () => {
    const t = text('Tipis', [16, 16, 100, 20], { weight: 300 });
    const f = one(check({ children: [t] }), 'LC-29');
    expect(f.fix).toEqual({ label: 'Weight 400', ops: [{ op: 'update', id: t.id, patch: { weight: 400 } }] });
    expect(f.suggestions).toBeUndefined();
  });

  it('LC-30: rentang tanpa spasi → en dash dan "..." → "…" (fix aman); rentang berspasi hanya saran (review 33-3)', () => {
    const t = text('Buka 09.00 - 10.00, 5-10 menit. Memuat...', [16, 16, 300, 20]);
    const f = one(check({ children: [t] }), 'LC-30');
    expect(f.fix).toEqual({ label: 'Fix punctuation', ops: [{ op: 'update', id: t.id, patch: { content: 'Buka 09.00 - 10.00, 5–10 menit. Memuat…' } }] });
    expect(f.suggestions).toEqual([{ label: 'Use en dash in ranges', ops: [{ op: 'update', id: t.id, patch: { content: 'Buka 09.00–10.00, 5–10 menit. Memuat…' } }] }]);
    // `x = 10 - 5` (pengurangan) tidak pernah fix aman.
    const minus = text('Hasil 10 - 5', [16, 40, 300, 20]);
    const m = one(check({ children: [minus] }), 'LC-30');
    expect(m.fix).toBeUndefined();
    expect(m.suggestions![0]!.ops[0]).toMatchObject({ patch: { content: 'Hasil 10–5' } });
    // Teks mono (kode): tanpa fix aman, rentang hanya saran, "..." tetap.
    const code = text('x = arr[1-2] ...', [16, 64, 300, 20], { family: 'JetBrains Mono' });
    const c = one(check({ children: [code] }), 'LC-30');
    expect(c.fix).toBeUndefined();
    expect(c.suggestions![0]!.ops[0]).toMatchObject({ patch: { content: 'x = arr[1–2] ...' } });
    expect(punctuated('run(a, ...) 1-2', false)).toBe('run(a, ...) 1–2');
    expect(punctuated('a 1 - 2 dan 3-4', true, false)).toBe('a 1 - 2 dan 3–4');
    // Tanggal, telepon, kode tidak disentuh.
    expect(punctuated('2026-11-18 · 0812-3456-7890 · 3-5 hari', true)).toBe('2026-11-18 · 0812-3456-7890 · 3–5 hari');
  });

  const seksi = (name: string, y: number, h: number) => frame(name, [0, y, 1440, h], [], solid);
  const halaman = (end: number) => frame('Halaman', [0, 0, 1440, end], [seksi('Seksi / Hero', 0, 900), seksi('Footer', 900, end - 900)], { width: 'fill' });

  it('LC-12 landing: node absolut terlihat yang melewati tinggi pas → hanya saran (review 33-2)', () => {
    const badge = rect('Overlay / Lencana', [1300, 4040, 80, 30], { position: 'absolute', x: 1300, y: 4040, ...solid });
    const f = one(check({ name: 'Landing', screen: 'landing', width: 1440, height: 4074, children: [halaman(4050), badge] }), 'LC-12');
    expect(f.fix).toBeUndefined();
    expect(f.suggestions).toEqual([{ label: 'Fit height to 4050', ops: [{ op: 'update', id: f.nodeId, patch: { height: 4050 } }] }]);
    // Node absolut di dalam tinggi pas tidak menghalangi fix aman.
    const inside = rect('Overlay / Lencana', [1300, 100, 80, 30], { position: 'absolute', x: 1300, y: 100, ...solid });
    expect(one(check({ name: 'Landing', screen: 'landing', width: 1440, height: 4074, children: [halaman(4050), inside] }), 'LC-12').fix).toBeDefined();
  });

  it('LC-12 landing selesai: tinggi pas = fix aman; [WIP] dan board hug tanpa fix', () => {
    const spec: Spec = { name: 'Landing', screen: 'landing', width: 1440, height: 4074, children: [halaman(4050)] };
    const f = one(check(spec), 'LC-12');
    expect(f.fix).toEqual({ label: 'Fit height to 4050', ops: [{ op: 'update', id: expect.any(String), patch: { height: 4050 } }] });
    expect(of(check({ ...spec, name: '[WIP] Landing', children: [halaman(4050)] }), 'LC-12')).toEqual([]);
    expect(of(check({ ...spec, hug: true, children: [halaman(4050)] }), 'LC-12')).toEqual([]);
  });
});

describe('saran', () => {
  it('LC-12 mobile panjang: tinggi pas + zona bawah absolut ikut naik (saran, bukan fix)', () => {
    const tab = frame('Overlay / Tab bar', [0, 1320 - 98, 390, 64], [], { position: 'absolute', y: 1320 - 98, layout: 'row', ...solid });
    const konten = frame('Konten', [0, 0, 390, 1022], [rect('Isi', [16, 0, 358, 1022], solid)]);
    const f = one(check({ height: 1320, children: [konten, tab] }), 'LC-12');
    expect(f.fix).toBeUndefined();
    expect(f.suggestions).toEqual([
      {
        label: 'Fit height to 1144',
        ops: [
          { op: 'update', id: f.nodeId, patch: { height: 1144 } },
          { op: 'update', id: tab.id, patch: { y: 1320 - 98 - 176 } },
        ],
      },
    ]);
  });

  it('LC-12 ukuran: expectedSize / ukuran layar; board hug tidak diberi tinggi angka', () => {
    expect(one(check({ height: 800, children: [] }), 'LC-12').suggestions![0]!.ops).toEqual([{ op: 'update', id: expect.any(String), patch: { height: 844 } }]);
    expect(one(check({ screen: 'app', width: 1440, height: 800, children: [] }), 'LC-12').suggestions![0]!.ops[0]).toMatchObject({ patch: { height: 900 } });
    expect(one(check({ screen: 'app', width: 400, height: 280, expectedSize: { width: 400, height: 300 }, children: [] }), 'LC-12').suggestions![0]!.label).toBe('Resize to 400×300');
    // Hug: hanya lebar yang bisa disarankan; tinggi berbeda saja → tanpa saran.
    expect(one(check({ screen: 'app', width: 400, height: 280, hug: true, expectedSize: { width: 400, height: 300 }, children: [] }), 'LC-12').suggestions).toBeUndefined();
    expect(one(check({ width: 400, height: 1320, hug: true, children: [] }), 'LC-12').suggestions![0]!.ops).toEqual([{ op: 'update', id: expect.any(String), patch: { width: 390 } }]);
  });

  it('LC-12 tabrakan: geser ke kanan semua board lain (jarak 80)', () => {
    const f = one(check([{ children: [] }, { x: 200, children: [] }]), 'LC-12');
    expect(f.suggestions).toEqual([{ label: 'Move clear of other boards', ops: [{ op: 'update', id: f.nodeId, patch: { x: 200 + 390 + 80 } }] }]);
  });

  it('LC-05: ukuran 12 + line-height token (juga tanpa line-height tersimpan)', () => {
    const a = text('Kecil', [16, 16, 100, 14], { size: 10 });
    const b = text('Kecil juga', [16, 40, 100, 14], { size: 11, lineHeight: 13 });
    const fs = of(check({ children: [a, b] }), 'LC-05');
    expect(fs.map((f) => f.suggestions)).toEqual([
      [{ label: 'Size 12', ops: [{ op: 'update', id: a.id, patch: { size: 12, lineHeight: 16 } }] }],
      [{ label: 'Size 12', ops: [{ op: 'update', id: b.id, patch: { size: 12, lineHeight: 16 } }] }],
    ]);
  });

  it('LC-01a/LC-01b: hapus emoji/glyph; teks yang isinya hanya itu → tanpa saran', () => {
    const e = text('Promo 🔥 hari ini', [16, 16, 200, 20]);
    const g = text('★ 4,8 rating', [16, 40, 200, 20]);
    const only = text('★★★', [16, 64, 200, 20]);
    const fs = check({ children: [e, g, only] });
    expect(one(fs, 'LC-01a').suggestions).toEqual([{ label: 'Remove emoji', ops: [{ op: 'update', id: e.id, patch: { content: 'Promo hari ini' } }] }]);
    const glyphs = of(fs, 'LC-01b');
    expect(glyphs.find((f) => f.nodeId === g.id)!.suggestions![0]!.ops[0]).toEqual({ op: 'update', id: g.id, patch: { content: '4,8 rating' } });
    expect(glyphs.find((f) => f.nodeId === only.id)!.suggestions).toBeUndefined();
  });

  it('LC-07: gap/padding ke token terdekat (seri → lebih besar), padding bawah home indicator tetap', () => {
    const fr = frame('Kartu', [0, 0, 390, 200], [], { gap: 10, padding: [22, 18, 34, 18] });
    const f = one(check({ children: [fr] }), 'LC-07');
    expect(f.suggestions).toEqual([{ label: 'Snap spacing to scale', ops: [{ op: 'update', id: fr.id, patch: { gap: 12, padding: [24, 20, 34, 20] } }] }]);
    expect(nearestOf([8, 12], 10)).toBe(12);
  });

  it('LC-08: ukuran di luar skala → skala terdekat; line-height tak cocok → token', () => {
    const a = text('Judul', [16, 16, 200, 30], { size: 15, lineHeight: 22 });
    const b = text('Isi', [16, 60, 200, 30], { size: 16, lineHeight: 30 });
    const fs = of(check({ children: [a, b] }), 'LC-08');
    expect(fs.find((f) => f.nodeId === a.id)!.suggestions![0]!.ops[0]).toEqual({ op: 'update', id: a.id, patch: { size: 16, lineHeight: 24 } });
    expect(fs.find((f) => f.nodeId === b.id)!.suggestions![0]).toEqual({ label: 'Line height 24', ops: [{ op: 'update', id: b.id, patch: { lineHeight: 24 } }] });
  });

  it('LC-10: frame target sentuh kecil → minWidth/minHeight 44 pada sumbu yang kurang', () => {
    const btn = frame('Button / Simpan', [16, 16, 120, 32], [], { layout: 'row', ...solid });
    expect(one(check({ children: [btn] }), 'LC-10').suggestions).toEqual([{ label: 'Grow to 44×44', ops: [{ op: 'update', id: btn.id, patch: { minHeight: 44 } }] }]);
  });

  it('LC-03 wrap fixed multi-baris → wrap + lebar fill; LC-28 → batasi lebar', () => {
    const t = text('Teks panjang yang membungkus', [16, 16, 200, 40], { wrap: 'fixed', _lines: 2 });
    expect(one(check({ children: [t] }), 'LC-03').suggestions![0]!.ops[0]).toEqual({ op: 'update', id: t.id, patch: { wrap: 'wrap', width: 'fill' } });
    const long = text('a'.repeat(200), [16, 16, 358, 40], { size: 16, _lines: 2 });
    expect(one(check({ children: [long] }), 'LC-28').suggestions![0]).toEqual({ label: 'Limit width to 600', ops: [{ op: 'update', id: long.id, patch: { maxWidth: 600 } }] });
  });

  it('LC-14: tandai Overlay dulu (tampilan tetap), lalu jadikan anak flow', () => {
    const abs = rect('Lencana', [300, 0, 24, 24], { position: 'absolute', x: 300, y: 0, ...solid });
    const f = one(check({ children: [frame('Kolom', [0, 0, 390, 200], [abs])] }), 'LC-14');
    expect(f.suggestions!.map((s) => s.ops[0])).toEqual([
      { op: 'update', id: abs.id, patch: { name: 'Overlay / Lencana' } },
      { op: 'update', id: abs.id, patch: { position: null, x: null, y: null } },
    ]);
  });

  it('LC-21 spacer kosong → saran remove', () => {
    const sp = frame('Jarak', [0, 100, 390, 24], [], { layout: 'none' });
    const f = of(check({ children: [frame('Kolom', [0, 0, 390, 300], [rect('A', [0, 0, 390, 100], solid), sp, rect('B', [0, 124, 390, 100], solid)])] }), 'LC-21').find((x) => x.nodeId === sp.id)!;
    expect(f.suggestions).toEqual([{ label: 'Remove spacer', ops: [{ op: 'remove', id: sp.id }] }]);
  });
});

describe('aturan tanpa fix', () => {
  it('LC-04 kontras, LC-13 nama default: tanpa fix/suggestions', () => {
    const fs = check({ children: [frame('frame', [0, 0, 390, 100], [text('Pucat', [16, 16, 100, 20], { color: '#EEEEEE' })], solid)] });
    for (const f of [...of(fs, 'LC-04'), ...of(fs, 'LC-13')]) {
      expect(f.fix).toBeUndefined();
      expect(f.suggestions).toBeUndefined();
    }
    expect(of(fs, 'LC-04').length + of(fs, 'LC-13').length).toBeGreaterThan(0);
  });

  it('cap:false → semua warning per aturan (fix_check), default tetap maks 3', () => {
    const kids = Array.from({ length: 5 }, (_, i) => text(`Tipis ${i}`, [16, 16 + i * 24, 100, 20], { weight: 300 }));
    expect(of(check({ children: kids }), 'LC-29')).toHaveLength(3);
    expect(of(check({ children: kids }, 0, false), 'LC-29')).toHaveLength(5);
  });
});

describe('planFixes', () => {
  const f = (rule: Finding['rule'], nodeId: string, extra: Partial<Finding>): Finding => ({ level: 'warning', rule, nodeId, nodeName: nodeId, detail: '', expected: '', ...extra });
  const upd = (id: string, patch: Record<string, unknown>) => ({ label: 'x', ops: [{ op: 'update' as const, id, patch }] });

  it('default: hanya fix aman; suggestions:true → saran pertama temuan tanpa fix; codes menyaring', () => {
    const fs = [f('LC-29', 'A', { fix: upd('A', { weight: 400 }) }), f('LC-05', 'B', { suggestions: [upd('B', { size: 12 }), upd('B', { size: 14 })] }), f('LC-04', 'C', {})];
    expect(planFixes(fs).planned.map((p) => [p.rule, p.kind])).toEqual([['LC-29', 'fix']]);
    const all = planFixes(fs, { suggestions: true }).planned;
    expect(all.map((p) => [p.rule, p.kind])).toEqual([['LC-29', 'fix'], ['LC-05', 'suggestion']]);
    expect(all[1]!.ops).toEqual([{ op: 'update', id: 'B', patch: { size: 12 } }]);
    expect(planFixes(fs, { suggestions: true, codes: ['LC-05'] }).planned.map((p) => p.rule)).toEqual(['LC-05']);
  });

  it('bentrok: properti sama atau node terhapus → conflict; duplikat identik sekali', () => {
    const fs = [
      f('LC-06', 'T', { suggestions: [upd('T', { size: 16 })] }),
      f('LC-08', 'T', { suggestions: [upd('T', { size: 14, lineHeight: 20 })] }),
      f('LC-29', 'T', { fix: upd('T', { weight: 400 }) }),
      f('LC-21', 'S', { suggestions: [{ label: 'rm', ops: [{ op: 'remove', id: 'S' }] }] }),
      f('LC-07', 'S', { suggestions: [upd('S', { gap: 8 })] }),
      f('LC-29', 'T', { fix: upd('T', { weight: 400 }) }),
    ];
    const { planned, skipped } = planFixes(fs, { suggestions: true });
    expect(planned.map((p) => `${p.rule}:${p.nodeId}`)).toEqual(['LC-06:T', 'LC-29:T', 'LC-21:S']);
    expect(skipped.map((s) => [`${s.rule}:${s.nodeId}`, s.reason])).toEqual([
      ['LC-08:T', 'conflict'],
      ['LC-07:S', 'conflict'],
    ]);
  });
});

describe('staleFixes', () => {
  const docWith = (props: Loose) => {
    const { doc } = docOf([{ children: [{ ...text('A', [0, 0, 10, 10]), id: 'Txt00001', ...props }, { ...rect('Spacer', [0, 10, 10, 10]), id: 'Rct00001' }] }]);
    return doc;
  };
  const item = (ops: PlannedFix['ops']): PlannedFix => ({ rule: 'LC-29', nodeId: 'Txt00001', nodeName: 'A', kind: 'fix', label: 'x', ops });

  it('dokumen sama → segar; perubahan apa pun di board target (bukan hanya properti yang di-patch) → stale; board lain → segar (review 33-1)', () => {
    const base = docWith({ weight: 300 });
    const fix = item([{ op: 'update', id: 'Txt00001', patch: { weight: 400 } }]);
    expect(staleFixes([fix], base, base).stale).toEqual([]);
    // Properti lain di board yang sama (mis. seksi baru, size) → stale: fix dihitung dari tata letak board.
    const s = staleFixes([fix], base, docWith({ weight: 300, content: 'B' }));
    expect(s.fresh).toEqual([]);
    expect(s.stale[0]).toMatchObject({ reason: 'stale', detail: 'board of Txt00001 changed since the check' });
    const rm = item([{ op: 'remove', id: 'Rct00001' }]);
    expect(staleFixes([rm], base, docWith({ weight: 200 })).stale).toHaveLength(1);
    // Target hilang → stale.
    expect(staleFixes([fix], base, docOf([{ children: [] }]).doc).stale).toHaveLength(1);
    // Board lain berubah (board baru ditambah) → board target tetap sama → segar.
    const other = { ...base, pages: [{ ...base.pages[0]!, children: [...base.pages[0]!.children, { ...base.pages[0]!.children[0]!, id: 'Brd00002', children: [] }] }] } as ResolvedDocument;
    expect(staleFixes([fix, rm], base, other).fresh).toEqual([fix, rm]);
  });
});

afterAll(() => {
  // Konsistensi tabel AUTOFIX: setiap aturan terklasifikasi, dan temuan hanya membawa jenis fix kelasnya.
  expect(Object.keys(AUTOFIX).sort()).toEqual([...G0_RULE_IDS].sort());
  for (const f of produced) {
    const cls = AUTOFIX[f.rule];
    if (f.fix) expect(['safe', 'mixed'], `${f.rule} fix`).toContain(cls);
    if (f.suggestions) expect(['suggestion', 'mixed'], `${f.rule} suggestions`).toContain(cls);
  }
});
