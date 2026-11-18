// Tes golden layout (Design Notes story 7): bounds numerik (±0,5px) + PNG golden per baris matriks.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BoardMeasure, NodeBounds } from '../src/index.js';
import { boardDoc, browserInstalled, compareGolden, frame, interFaces, render, start, stop, text } from './harness.js';

const faces = interFaces(400);

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
    const f = frame({ layout: 'row', width: 400, padding: 10, gap: 8 }, [a, b]);
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
    const f = frame({ layout: 'column', width: 300, padding: [12, 16], gap: 6 }, t);
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
    const f = frame({ layout: 'row', width: 'hug', height: 'hug', padding: 8, gap: 4 }, [a, b]);
    const at = await run('hug', [f]);
    near(at(f.id).width, 120);
    near(at(f.id).height, 36);
    near(at(b.id).x, 62);
  });

  it('fill: sumbu utama dan silang di parent fixed', async () => {
    const a = text('Atas', { height: 40 });
    const inner = text('Dalam fill');
    const b = frame({ layout: 'column', width: 'fill', height: 'fill', padding: 4 }, [inner]);
    const f = frame({ layout: 'column', width: 400, height: 140, align: 'start' }, [a, b]);
    const at = await run('fill', [f]);
    near(at(b.id).y, 40);
    near(at(b.id).height, 100);
    near(at(b.id).width, 400);
    near(at(inner.id).x, 4);
  });

  it('fill di parent hug berperilaku hug; fill silang meregang ke anak terlebar', async () => {
    const a = text('Kiri', { width: 100 });
    const b = text('Halo', { width: 'fill' });
    const row = frame({ layout: 'row', width: 'hug', gap: 8 }, [a, b]);
    const ref = text('Halo');
    const c = text('Lebar 200', { width: 200 });
    const d = text('Fill silang', { width: 'fill' });
    const col = frame({ layout: 'column', width: 'hug' }, [c, d]);
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
    const r1 = frame({ layout: 'row', width: 400 }, [a]);
    const b = text('Fixed 380', { width: 380 });
    const c = text('Min 60', { width: 'fill', minWidth: 60 });
    const r2 = frame({ layout: 'row', width: 400, clip: true }, [b, c]);
    const at = await run('min-max', [r1, r2]);
    near(at(a.id).width, 120);
    near(at(c.id).width, 60);
    near(at(c.id).x, 380);
  });

  it('gap negatif: tiga fixed 40 dengan gap −12', async () => {
    const t = ['A1', 'B2', 'C3'].map((s) => text(s, { width: 40 }));
    const f = frame({ layout: 'row', gap: -12 }, t);
    const abs = text('Abs', { position: 'absolute', x: 200, y: 0, width: 40 });
    const g = frame({ layout: 'column', gap: -5 }, [text('X'), abs, text('Y')]);
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
    const f = frame({ layout: 'column', width: 200, height: 100, padding: 20 }, [flow, abs]);
    const at = await run('absolute', [frame({ layout: 'none', width: 10, height: 10 }), f]);
    const p = at(f.id);
    near(at(abs.id).x - p.x, 5);
    near(at(abs.id).y - p.y, 7);
    near(at(flow.id).x - p.x, 20);
    near(at(flow.id).y - p.y, 20);
  });

  it('layout none: anak absolute di (x,y), anak flow di (0,0); hug = padding', async () => {
    const abs = text('Abs', { position: 'absolute', x: 30, y: 40 });
    const flow = text('Flow');
    const f = frame({ layout: 'none', width: 200, height: 100 }, [abs, flow]);
    const h = frame({ layout: 'none', width: 'hug', height: 'hug', padding: 10 }, [text('Isi', { position: 'absolute', x: 0, y: 0 })]);
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
    const h = frame({ layout: 'none', width: 'hug', height: 'hug', padding: 10 }, [long]);
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
});
