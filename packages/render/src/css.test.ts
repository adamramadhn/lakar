// Pemetaan CSS tunggal (AD-5): baris matriks I/O spec model-dokumen story 4. Murni, tanpa Chromium.
import { describe, expect, it } from 'vitest';
import {
  ALIGN,
  backgroundCss,
  boxShadowsCss,
  colorCss,
  cssVarName,
  fontFamilyCss,
  fontWeightCss,
  gradientLayerCss,
  gridLineCss,
  gridTemplateCss,
  gridTrackCss,
  decorationCss,
  JUSTIFY,
  lengthCss,
  letterSpacingCss,
  lineHeightCss,
  paddingCss,
  percentCss,
  radiusCss,
  shadowCss,
  stopsCss,
  strokeBorderDecls,
  textRunDecls,
  textShadowCss,
  tokenVar,
} from './css.js';

const stops = [
  { offset: 0, color: '#FFFFFF' },
  { offset: 1, color: '#000000' },
];

describe('token dan nilai dasar', () => {
  it('token warna → var(--colors-text-primary)', () => {
    expect(cssVarName('colors.text-primary')).toBe('--colors-text-primary');
    expect(tokenVar('colors.text-primary')).toBe('var(--colors-text-primary)');
    expect(colorCss({ $token: 'colors.text-primary' })).toBe('var(--colors-text-primary)');
  });

  it('hex 3 digit diperluas; hex 6/8 apa adanya; bukan string → undefined', () => {
    expect(colorCss('#abc')).toBe('#aabbcc');
    expect(colorCss('#F97316')).toBe('#F97316');
    expect(colorCss('#11223344')).toBe('#11223344');
    expect(colorCss(12)).toBeUndefined();
  });

  it('panjang 16 → 16px, token → var(), tanpa pembulatan', () => {
    expect(lengthCss(16)).toBe('16px');
    expect(lengthCss({ $token: 'size.card' })).toBe('var(--size-card)');
    expect(lengthCss(12.3456)).toBe('12.3456px');
    expect(lengthCss('hug')).toBeUndefined();
    expect(lengthCss(Number.NaN)).toBeUndefined();
  });

  it('persen: presisi 4 desimal seperti render', () => {
    expect(percentCss(0.5)).toBe('50%');
    expect(percentCss(1 / 3)).toBe('33.3333%');
    expect(percentCss(undefined)).toBe('0%');
  });
});

describe('fill', () => {
  it('solid solo → warna polos; berlapis → linear-gradient(c, c)', () => {
    expect(gradientLayerCss({ type: 'solid', color: '#111111' }, { solo: true })).toBe('#111111');
    expect(gradientLayerCss({ type: 'solid', color: '#111111' })).toBe('linear-gradient(#111111, #111111)');
    expect(backgroundCss([{ type: 'solid', color: '#111111' }])).toBe('#111111');
    expect(backgroundCss([{ type: 'solid', color: '#111111' }, { type: 'solid', color: '#222222' }])).toBe(
      'linear-gradient(#222222, #222222), linear-gradient(#111111, #111111)',
    );
  });

  it('linear: sudut apa adanya; stops', () => {
    expect(stopsCss(stops)).toBe('#FFFFFF 0%, #000000 100%');
    expect(gradientLayerCss({ type: 'linear', angle: 12.3456, stops })).toBe('linear-gradient(12.3456deg, #FFFFFF 0%, #000000 100%)');
  });

  it('radial default → 50% 50% at 50% 50% (semantik render)', () => {
    expect(gradientLayerCss({ type: 'radial', stops })).toBe('radial-gradient(50% 50% at 50% 50%, #FFFFFF 0%, #000000 100%)');
    expect(gradientLayerCss({ type: 'radial', center: [0.25, 0.75], radius: 0.8, stops })).toBe(
      'radial-gradient(80% 80% at 25% 75%, #FFFFFF 0%, #000000 100%)',
    );
  });

  it('conic: from sudut (default 0) at pusat', () => {
    expect(gradientLayerCss({ type: 'conic', stops })).toBe('conic-gradient(from 0deg at 50% 50%, #FFFFFF 0%, #000000 100%)');
    expect(gradientLayerCss({ type: 'conic', angle: 45, center: [0.5, 0], stops })).toBe('conic-gradient(from 45deg at 50% 0%, #FFFFFF 0%, #000000 100%)');
  });

  it('noise/mesh/image → undefined (dilewati oleh background kode)', () => {
    expect(gradientLayerCss({ type: 'image' })).toBeUndefined();
    expect(backgroundCss([{ type: 'image' }, { type: 'noise' }])).toBeUndefined();
    expect(backgroundCss('x')).toBeUndefined();
  });
});

describe('box', () => {
  it('padding [8,16] → 8px 16px; [1,2,3,4] → 1px 2px 3px 4px; entri tak valid → undefined', () => {
    expect(paddingCss(8)).toBe('8px');
    expect(paddingCss([8, 16])).toBe('8px 16px');
    expect(paddingCss([1, 2, 3, 4])).toBe('1px 2px 3px 4px');
    expect(paddingCss([16, 'x', 8])).toBeUndefined();
    expect(paddingCss(undefined)).toBeUndefined();
  });

  it('radius angka | 4-tuple', () => {
    expect(radiusCss(12)).toBe('12px');
    expect(radiusCss([4, 4, 0, 0])).toBe('4px 4px 0px 0px');
    expect(radiusCss(undefined)).toBeUndefined();
  });

  it('bayangan box: drop dan inset, spread default 0', () => {
    expect(shadowCss({ x: 0, y: 4, blur: 12, color: '#0000001A' })).toBe('0px 4px 12px 0px #0000001A');
    expect(boxShadowsCss([{ x: 0, y: 4, blur: 12, color: '#0000001A' }, { type: 'inner', x: 0, y: 1, blur: 0, spread: 1, color: '#FFFFFF' }])).toBe(
      '0px 4px 12px 0px #0000001A, inset 0px 1px 0px 1px #FFFFFF',
    );
    expect(boxShadowsCss([])).toBeUndefined();
  });

  it('bayangan teks: inner diabaikan', () => {
    expect(textShadowCss([{ x: 0, y: 1, blur: 2, color: '#00000033' }, { type: 'inner', x: 0, y: 0, blur: 1, color: '#000000' }])).toBe(
      '0px 1px 2px #00000033',
    );
    expect(textShadowCss([{ type: 'inner', x: 0, y: 0, blur: 1, color: '#000000' }])).toBeUndefined();
  });

  it('stroke → border semua sisi atau per sisi; tak lengkap → kosong', () => {
    expect(strokeBorderDecls({ color: '#E5E7EB', width: 1, align: 'inside' })).toEqual([['border', '1px solid #E5E7EB']]);
    expect(strokeBorderDecls({ color: '#000000', width: 2, sides: ['top', 'bottom'] })).toEqual([
      ['border-top', '2px solid #000000'],
      ['border-bottom', '2px solid #000000'],
    ]);
    expect(strokeBorderDecls({ color: '#000000' })).toEqual([]);
    expect(strokeBorderDecls(undefined)).toEqual([]);
  });

  it('ALIGN/JUSTIFY flex', () => {
    expect(ALIGN.start).toBe('flex-start');
    expect(ALIGN.stretch).toBe('stretch');
    expect(JUSTIFY.end).toBe('flex-end');
    expect(JUSTIFY['space-between']).toBe('space-between');
  });
});

describe('teks', () => {
  it('letterSpacing 0.02 → 0.02em; token → var()', () => {
    expect(letterSpacingCss(0.02)).toBe('0.02em');
    expect(letterSpacingCss({ $token: 'type.tracking' })).toBe('var(--type-tracking)');
  });

  it('lineHeight → px; fontWeight → angka; family kutip minimal', () => {
    expect(lineHeightCss(18)).toBe('18px');
    expect(fontWeightCss(600)).toBe('600');
    expect(fontWeightCss({ $token: 'type.bold' })).toBe('var(--type-bold)');
    expect(fontFamilyCss('Inter')).toBe('Inter');
    expect(fontFamilyCss('JetBrains Mono')).toBe('"JetBrains Mono"');
    expect(fontFamilyCss({ $token: 'type.family' })).toBe('var(--type-family)');
  });

  it('decoration (v15): underline/strikethrough/none → text-decoration; nilai lain → undefined', () => {
    expect(decorationCss('underline')).toBe('underline');
    expect(decorationCss('strikethrough')).toBe('line-through');
    expect(decorationCss('none')).toBe('none');
    expect(decorationCss('blink')).toBeUndefined();
    expect(decorationCss(undefined)).toBeUndefined();
  });

  it('textRunDecls (v15): hanya kunci yang diisi; family dari argumen; color/decoration ikut', () => {
    expect(textRunDecls({}, undefined)).toEqual([]);
    expect(textRunDecls({ weight: 700, color: '#FF0000' }, undefined)).toEqual([
      ['font-weight', '700'],
      ['color', '#FF0000'],
    ]);
    expect(textRunDecls({ family: 'JetBrains Mono', size: 12, decoration: 'strikethrough' }, '"JetBrains Mono"')).toEqual([
      ['font-family', '"JetBrains Mono"'],
      ['font-size', '12px'],
      ['text-decoration', 'line-through'],
    ]);
    // family terisi di run tapi pemanggil tak memberi nilai CSS → deklarasi dilewati.
    expect(textRunDecls({ family: 'X' }, undefined)).toEqual([]);
  });
});

describe('grid (v4, AD-13)', () => {
  it('track: px, fr, auto, minmax', () => {
    expect(gridTemplateCss([80, { fr: 1 }, 'auto', { minmax: [120, { fr: 2 }] }])).toBe('80px 1fr auto minmax(120px, 2fr)');
    expect(gridTrackCss({ minmax: ['auto', 'auto'] })).toBe('minmax(auto, auto)');
    expect(gridTrackCss({ fr: 0.5 })).toBe('0.5fr');
  });

  it('track tak terpetakan → undefined; template dengan satu entri salah atau kosong → undefined', () => {
    expect(gridTrackCss('1fr')).toBeUndefined();
    expect(gridTrackCss({ minmax: [10] })).toBeUndefined();
    expect(gridTrackCss({ $token: 'space.4' })).toBeUndefined();
    expect(gridTemplateCss([80, '1fr'])).toBeUndefined();
    expect(gridTemplateCss([])).toBeUndefined();
    expect(gridTemplateCss(undefined)).toBeUndefined();
  });

  it('penempatan: start, start/end, span, start/span, end saja', () => {
    expect(gridLineCss({ start: 2 })).toBe('2');
    expect(gridLineCss({ start: 1, end: 3 })).toBe('1 / 3');
    expect(gridLineCss({ start: 1, end: -1 })).toBe('1 / -1');
    expect(gridLineCss({ span: 2 })).toBe('span 2');
    expect(gridLineCss({ start: 2, span: 2 })).toBe('2 / span 2');
    expect(gridLineCss({ end: 3 })).toBe('auto / 3');
    expect(gridLineCss({})).toBeUndefined();
    expect(gridLineCss(undefined)).toBeUndefined();
  });
});
