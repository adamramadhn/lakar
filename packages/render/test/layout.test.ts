// Tes golden layout (Design Notes story 7): bounds numerik (±0,5px) + PNG golden per baris matriks.
// Frame diberi fill tint (story 8) agar golden bermakna; bounds tidak berubah.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BoardMeasure, NodeBounds } from '../src/index.js';
import { boardDoc, browserInstalled, compareGolden, frame, interFaces, rect, render, start, stop, text } from './harness.js';

const faces = interFaces(400);
// Tint fill (story 8) supaya golden memperlihatkan box frame, bukan hanya teks.
const TINT = [{ type: 'solid', color: '#E3F2FD' }];
const INNER = [{ type: 'solid', color: '#FFE0B2' }];

async function run(name: string, children: Record<string, unknown>[], size?: { width: number; height: number }) {
  const { doc, boardId } = boardDoc(children, size);
  const { result, png } = await render(doc, boardId, faces);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok || !png) throw new Error('render gagal');
  await compareGolden(name, png);
  const m: BoardMeasure = result.measure;
  return (id: unknown): NodeBounds => {
    const b = m.nodes.find((n) => n.id === id);
    if (!b) throw new Error(`node ${String(id)} tidak diukur`);
    return b;
  };
}

const near = (v: number, want: number) => expect(Math.abs(v - want), `${v} ≈ ${want}`).toBeLessThanOrEqual(0.5);

describe.skipIf(!browserInstalled)('render layout (Chromium, tanpa daemon)', () => {
  beforeAll(start, 60_000);
  afterAll(stop);

  it('row: fixed + fill', async () => {
    const a = text('Kiri', { width: 100 });
    const b = text('Isi fill', { width: 'fill' });
    const f = frame({ fills: TINT, layout: 'row', width: 400, padding: 10, gap: 8 }, [a, b]);
    const at = await run('row', [f]);
    near(at(a.id).x, 10);
    near(at(a.id).width, 100);
    near(at(b.id).width, 272);
    near(at(b.id).x, 118);
    near(at(f.id).width, 400);
    near(at(f.id).height, 40);
  });

  it('column: gap + padding [v,h], anak meregang (align default)', async () => {
    const t = [text('Satu'), text('Dua'), text('Tiga')];
    const f = frame({ fills: TINT, layout: 'column', width: 300, padding: [12, 16], gap: 6 }, t);
    const at = await run('column', [f]);
    near(at(t[0]!.id).y, 12);
    near(at(t[1]!.id).y, 38);
    near(at(t[2]!.id).y, 64);
    for (const n of t) {
      near(at(n.id).x, 16);
      near(at(n.id).width, 268);
    }
    near(at(f.id).height, 12 + 20 * 3 + 6 * 2 + 12);
  });

  it('hug: frame row hug = padding + anak + gap', async () => {
    const a = text('Aa', { width: 50 });
    const b = text('Bb', { width: 50 });
    const f = frame({ fills: TINT, layout: 'row', width: 'hug', height: 'hug', padding: 8, gap: 4 }, [a, b]);
    const at = await run('hug', [f]);
    near(at(f.id).width, 120);
    near(at(f.id).height, 36);
    near(at(b.id).x, 62);
  });

  it('fill: sumbu utama dan silang di parent fixed', async () => {
    const a = text('Atas', { height: 40 });
    const inner = text('Dalam fill');
    const b = frame({ fills: INNER, layout: 'column', width: 'fill', height: 'fill', padding: 4 }, [inner]);
    const f = frame({ fills: TINT, layout: 'column', width: 400, height: 140, align: 'start' }, [a, b]);
    const at = await run('fill', [f]);
    near(at(b.id).y, 40);
    near(at(b.id).height, 100);
    near(at(b.id).width, 400);
    near(at(inner.id).x, 4);
  });

  it('fill di parent hug berperilaku hug; fill silang meregang ke anak terlebar', async () => {
    const a = text('Kiri', { width: 100 });
    const b = text('Halo', { width: 'fill' });
    const row = frame({ fills: TINT, layout: 'row', width: 'hug', gap: 8 }, [a, b]);
    const ref = text('Halo');
    const c = text('Lebar 200', { width: 200 });
    const d = text('Fill silang', { width: 'fill' });
    const col = frame({ fills: TINT, layout: 'column', width: 'hug' }, [c, d]);
    const at = await run('fill-in-hug', [row, ref, col]);
    const halo = at(ref.id).width;
    expect(halo).toBeGreaterThan(20);
    near(at(b.id).width, halo);
    near(at(row.id).width, 100 + 8 + halo);
    near(at(d.id).width, 200);
    near(at(col.id).width, 200);
  });

  it('min/max: fill dengan maxWidth 120 di row 400; minWidth menimpa min 0 milik fill', async () => {
    const a = text('Max 120', { width: 'fill', maxWidth: 120 });
    const r1 = frame({ fills: TINT, layout: 'row', width: 400 }, [a]);
    const b = text('Fixed 380', { width: 380 });
    const c = text('Min 60', { width: 'fill', minWidth: 60 });
    const r2 = frame({ fills: TINT, layout: 'row', width: 400, clip: true }, [b, c]);
    const at = await run('min-max', [r1, r2]);
    near(at(a.id).width, 120);
    near(at(c.id).width, 60);
    near(at(c.id).x, 380);
  });

  it('gap negatif: tiga fixed 40 dengan gap −12', async () => {
    const t = ['A1', 'B2', 'C3'].map((s) => text(s, { width: 40 }));
    const f = frame({ fills: TINT, layout: 'row', gap: -12 }, t);
    const abs = text('Abs', { position: 'absolute', x: 200, y: 0, width: 40 });
    const g = frame({ fills: TINT, layout: 'column', gap: -5 }, [text('X'), abs, text('Y')]);
    const at = await run('gap-negatif', [f, g]);
    near(at(t[0]!.id).x, 0);
    near(at(t[1]!.id).x, 28);
    near(at(t[2]!.id).x, 56);
    near(at(f.id).width, 40 * 3 - 24);
    // anak absolute dilewati: Y tetap 20 − 5 di bawah X
    const g0 = at(g.id).y;
    const kids = (g as { children: { id: string }[] }).children;
    near(at(kids[2]!.id).y - g0, 15);
    near(at(abs.id).x, 200);
  });

  it('absolute: relatif border-box parent, tidak menggeser flow', async () => {
    const flow = text('Flow');
    const abs = text('Abs', { position: 'absolute', x: 5, y: 7 });
    const f = frame({ fills: TINT, layout: 'column', width: 200, height: 100, padding: 20 }, [flow, abs]);
    const at = await run('absolute', [frame({ fills: TINT, layout: 'none', width: 10, height: 10 }), f]);
    const p = at(f.id);
    near(at(abs.id).x - p.x, 5);
    near(at(abs.id).y - p.y, 7);
    near(at(flow.id).x - p.x, 20);
    near(at(flow.id).y - p.y, 20);
  });

  it('layout none: anak absolute di (x,y), anak flow di (0,0); hug = padding', async () => {
    const abs = text('Abs', { position: 'absolute', x: 30, y: 40 });
    const flow = text('Flow');
    const f = frame({ fills: TINT, layout: 'none', width: 200, height: 100 }, [abs, flow]);
    const h = frame({ fills: TINT, layout: 'none', width: 'hug', height: 'hug', padding: 10 }, [text('Isi', { position: 'absolute', x: 0, y: 0 })]);
    const at = await run('none', [f, h]);
    near(at(abs.id).x, 30);
    near(at(abs.id).y, 40);
    near(at(flow.id).x, 0);
    near(at(flow.id).y, 0);
    near(at(h.id).width, 20);
    near(at(h.id).height, 20);
  });

  it('absolute hug = max-content: teks wrap absolute di frame none hug tidak diperas', async () => {
    const long = text('Overlay absolute dengan kalimat yang cukup panjang', { position: 'absolute', x: 0, y: 0, wrap: 'wrap' });
    const h = frame({ fills: TINT, layout: 'none', width: 'hug', height: 'hug', padding: 10 }, [long]);
    const { doc, boardId } = boardDoc([h], { width: 440, height: 60 });
    const { result, png } = await render(doc, boardId, faces);
    if (!result.ok || !png) throw new Error(JSON.stringify(result));
    await compareGolden('absolute-hug', png);
    const fw = result.measure.nodes.find((n) => n.id === h.id)!.width;
    const tw = result.measure.nodes.find((n) => n.id === long.id)!.width;
    near(fw, 20);
    expect(tw).toBeGreaterThan(fw);
    expect(result.measure.texts.find((t) => t.id === long.id)!.lines).toBe(1);
  });

  // Grid v4 (editor-canvas story 7): hanya rect (tanpa teks) supaya golden tidak bergantung rasterisasi font.
  it('grid: track px/fr, rows, gap sumbu, span, start/end, align center, anak absolute', async () => {
    const solid = (color: string) => [{ type: 'solid', color }];
    const a = rect({ width: 'fill', height: 'fill', fills: solid('#1E88E5') });
    const b = rect({ width: 'fill', height: 20, gridColumn: { span: 2 }, fills: solid('#43A047') });
    const c = rect({ width: 'fill', height: 30, gridColumn: { start: 1, end: 3 }, fills: solid('#FB8C00') });
    const d = rect({ width: 50, height: 30, fills: solid('#8E24AA') });
    const e = rect({ position: 'absolute', x: 370, y: 0, width: 20, height: 20, fills: solid('#E53935') });
    const g = frame(
      { fills: TINT, layout: 'grid', width: 400, padding: 10, gridTemplateColumns: [80, { fr: 1 }, { fr: 2 }], gridTemplateRows: [40, 'auto'], columnGap: 10, rowGap: 8, align: 'center' },
      [a, b, c, d, e],
    );
    const at = await run('grid', [g], { width: 420, height: 120 });
    near(at(g.id).width, 400);
    near(at(g.id).height, 10 + 40 + 8 + 30 + 10);
    // Kolom: 80 | (380 - 80 - 20) / 3 = 93.33 | 186.67.
    near(at(a.id).x, 10);
    near(at(a.id).y, 10);
    near(at(a.id).width, 80);
    near(at(a.id).height, 40);
    near(at(b.id).x, 100);
    near(at(b.id).width, 93.333 + 10 + 186.667);
    near(at(b.id).y, 20); // align center di baris 40
    near(at(c.id).x, 10);
    near(at(c.id).y, 58);
    near(at(c.id).width, 80 + 10 + 93.333);
    near(at(d.id).x, 10 + 80 + 10 + 93.333 + 10);
    near(at(d.id).y, 58);
    near(at(d.id).width, 50);
    near(at(e.id).x, 370);
    near(at(e.id).y, 0);
  });

  // Cabang sizing/penempatan grid lain (tanpa golden baru: bounds saja).
  it('grid: hug, tanpa ukuran, gridRow span/start, gap negatif diabaikan; gap sumbu di flex', async () => {
    const solid = (color: string) => [{ type: 'solid', color }];
    const tall = rect({ width: 'fill', gridRow: { span: 2 }, fills: solid('#1E88E5') });
    const plain = rect({ height: 30, fills: solid('#43A047') });
    const hug = frame({ layout: 'row', width: 'hug', height: 'hug', padding: 5, fills: solid('#FB8C00') }, [rect({ width: 20, height: 20 })]);
    const low = rect({ height: 10, gridColumn: { start: 3 }, gridRow: { start: 2 }, fills: solid('#8E24AA') });
    const g = frame({ fills: TINT, layout: 'grid', width: 330, gap: -8, gridTemplateColumns: [100, 100, 100], gridTemplateRows: [30, 30] }, [tall, plain, hug, low]);
    const r1 = rect({ width: 20, height: 20 });
    const r2 = rect({ width: 20, height: 20 });
    const row = frame({ fills: TINT, layout: 'row', gap: 4, columnGap: 12 }, [r1, r2]);
    const { doc, boardId } = boardDoc([g, row], { width: 400, height: 140 });
    const { result } = await render(doc, boardId, faces);
    if (!result.ok) throw new Error(JSON.stringify(result));
    const at = (id: unknown) => result.measure.nodes.find((n) => n.id === id)!;
    // gap -8 diabaikan (tanpa margin): kolom 0 / 100 / 200, baris 0 / 30.
    near(at(tall.id).x, 0);
    near(at(tall.id).height, 60);
    near(at(plain.id).x, 100);
    near(at(plain.id).width, 100); // tanpa width → regang selebar sel
    near(at(plain.id).y, 0);
    near(at(hug.id).x, 200);
    near(at(hug.id).width, 30); // hug = isi, tidak diregang
    near(at(hug.id).height, 30);
    near(at(low.id).x, 200);
    near(at(low.id).y, 30);
    near(at(g.id).height, 60);
    near(at(r2.id).x - at(r1.id).x, 20 + 12); // columnGap menimpa gap di flex row
  });
});
