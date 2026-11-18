// Tes teks + font: wrap/baris, bobot, FONT_MISSING, dan bukti Inter benar-benar dipakai (bukan fallback).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseUnicodeRange, type FontFaceSource } from '../src/index.js';
import { boardDoc, browserInstalled, compareGolden, freshPage, interFaces, render, start, stop, text } from './harness.js';

const LONG = 'Desain yang baik dimulai dari tata letak yang jujur dan teks yang terbaca.';

describe('cakupan glyph: parser unicode-range', () => {
  it('U+X, U+X-Y, wildcard U+4??, spasi dan token tak valid', () => {
    expect(parseUnicodeRange('U+0000-00FF, U+0131,u+4??, U+1?, bukan, U+20-10')).toEqual([
      [0, 0xff],
      [0x131, 0x131],
      [0x400, 0x4ff],
      [0x10, 0x1f],
    ]);
  });
});

describe.skipIf(!browserInstalled)('render teks dan font (Chromium, tanpa daemon)', () => {
  beforeAll(start, 60_000);
  afterAll(stop);

  it('teks wrap: width 120 Inter 16/24 → ≥ 2 baris, height = baris × 24', async () => {
    const t = text(LONG, { width: 120, size: 16, lineHeight: 24 });
    const auto = text('Satu\nDua baris', { lineHeight: 24 });
    const { doc, boardId } = boardDoc([t, auto], { width: 240, height: 320 });
    const { result, png } = await render(doc, boardId, interFaces(400));
    if (!result.ok) throw new Error(JSON.stringify(result));
    await compareGolden('teks-wrap', png!);
    const m = result.measure.texts.find((x) => x.id === t.id)!;
    const b = result.measure.nodes.find((x) => x.id === t.id)!;
    expect(m.lines).toBeGreaterThanOrEqual(2);
    expect(m.lineHeight).toBe(24);
    expect(Math.abs(b.height - m.lines * 24)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(b.width - 120)).toBeLessThanOrEqual(0.5);
    // wrap auto: satu baris per \n, tidak dibungkus
    expect(result.measure.texts.find((x) => x.id === auto.id)!.lines).toBe(2);
  });

  it('teks bobot: Inter 400 vs 700 dengan lebar berbeda', async () => {
    const a = text('Hamburgefonstiv', { size: 24, lineHeight: 32 });
    const b = text('Hamburgefonstiv', { size: 24, lineHeight: 32, weight: 700 });
    const { doc, boardId } = boardDoc([a, b], { width: 260, height: 80 });
    const { result, png } = await render(doc, boardId, [...interFaces(400), ...interFaces(700)]);
    if (!result.ok) throw new Error(JSON.stringify(result));
    await compareGolden('teks-bobot', png!);
    const wa = result.measure.nodes.find((x) => x.id === a.id)!.width;
    const wb = result.measure.nodes.find((x) => x.id === b.id)!.width;
    expect(wb - wa).toBeGreaterThan(2);
  });

  it('face tidak diberikan → FONT_MISSING (tanpa exception)', async () => {
    const { doc, boardId } = boardDoc([text('Halo', { weight: 700 }), text('Roboto', { family: 'Roboto' })]);
    const { result } = await render(doc, boardId, interFaces(400));
    expect(result).toMatchObject({ ok: false, code: 'FONT_MISSING' });
    if (result.ok || result.code !== 'FONT_MISSING') return;
    expect(result.missing).toEqual([
      { family: 'Inter', weight: 700, style: 'normal' },
      { family: 'Roboto', weight: 400, style: 'normal' },
    ]);
  });

  it('face URL 404 → FONT_MISSING, render berikutnya tetap jalan', async () => {
    const bad: FontFaceSource[] = [{ family: 'Inter', weight: 500, style: 'normal', url: '/fonts/inter/tidak-ada.woff2' }];
    const { doc, boardId } = boardDoc([text('Halo', { weight: 500 })]);
    const { result } = await render(doc, boardId, bad);
    expect(result).toMatchObject({ ok: false, code: 'FONT_MISSING', missing: [{ family: 'Inter', weight: 500, style: 'normal' }] });
    const again = await render(doc, boardId, interFaces(500));
    expect(again.result.ok).toBe(true);
  });

  it('cakupan glyph: → (U+2192) dan ✓ (U+2713) di luar latin+latin-ext → FONT_MISSING', async () => {
    const a = text('Lihat →');
    const b = text('Selesai ✓', { weight: 700 });
    const ok = text('Halo');
    const { doc, boardId } = boardDoc([a, b, ok]);
    const { result } = await render(doc, boardId, [...interFaces(400), ...interFaces(700)]);
    expect(result).toMatchObject({ ok: false, code: 'FONT_MISSING' });
    if (result.ok || result.code !== 'FONT_MISSING') return;
    expect(result.message).toContain('"→" U+2192');
    expect(result.message).toContain('"✓" U+2713');
    expect(result.message).toContain(String(a.id));
    expect(result.missing).toEqual([
      { family: 'Inter', weight: 400, style: 'normal' },
      { family: 'Inter', weight: 700, style: 'normal' },
    ]);
  });

  it('allowGlyphs: emoji yang di-allow terukur; yang tidak di-allow tetap FONT_MISSING', async () => {
    const wave = text('Halo 👋');
    const heart = text('Suka ❤');
    const { doc, boardId } = boardDoc([wave, heart]);
    const allowed = await render(doc, boardId, interFaces(400), undefined, { allowGlyphs: [0x1f44b, 0x2764] });
    expect(allowed.result.ok, JSON.stringify(allowed.result)).toBe(true);
    if (!allowed.result.ok) return;
    expect(allowed.result.measure.nodes.find((n) => n.id === wave.id)!.width).toBeGreaterThan(20);
    const partial = await render(doc, boardId, interFaces(400), undefined, { allowGlyphs: [0x1f44b] });
    expect(partial.result).toMatchObject({ ok: false, code: 'FONT_MISSING' });
    if (partial.result.ok || partial.result.code !== 'FONT_MISSING') return;
    expect(partial.result.message).toContain('U+2764');
    expect(partial.result.message).not.toContain('U+1F44B');
  });

  it('cakupan glyph: Łódź (latin-ext) → ok; face tanpa unicodeRange mencakup semua', async () => {
    const pl = text('Łódź');
    const b1 = boardDoc([pl]);
    const r1 = await render(b1.doc, b1.boardId, interFaces(400));
    expect(r1.result.ok, JSON.stringify(r1.result)).toBe(true);
    const arrow = text('Lihat →');
    const all: FontFaceSource[] = interFaces(400).map(({ unicodeRange: _u, ...f }) => f);
    const b2 = boardDoc([arrow]);
    const r2 = await render(b2.doc, b2.boardId, all);
    expect(r2.result.ok, JSON.stringify(r2.result)).toBe(true);
  });

  it('Inter benar-benar dipakai: lebar "Hamburgefonstiv" 32px beda > 2px dari halaman tanpa face', async () => {
    const t = text('Hamburgefonstiv', { size: 32, lineHeight: 40 });
    const { doc, boardId } = boardDoc([t], { width: 400, height: 60 });
    const { result } = await render(doc, boardId, interFaces(400));
    if (!result.ok) throw new Error(JSON.stringify(result));
    const withInter = result.measure.nodes.find((x) => x.id === t.id)!.width;
    const p = await freshPage();
    try {
      const without = (await p.evaluate(`(async () => {
        const m = await import('/render/index.js');
        const el = m.mountBoard(${JSON.stringify(doc)}, ${JSON.stringify(boardId)}, document.getElementById('root'));
        await document.fonts.ready;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return m.measureBoard(el).nodes.find((n) => n.id === ${JSON.stringify(t.id)}).width;
      })()`)) as number;
      expect(Math.abs(withInter - without), `Inter ${withInter} vs tanpa face ${without}`).toBeGreaterThan(2);
    } finally {
      await p.close();
    }
  });
});
