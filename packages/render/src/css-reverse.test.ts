// Tabel kebalikan AD-5 (story 4): setiap parser kebalikan, bila diumpankan ke fungsi maju `css.ts`, menghasilkan
// nilai CSS yang setara dengan masukannya (round trip), dan nilai tanpa padanan → undefined.
import { describe, expect, it } from 'vitest';
import { gradientLayerCss, gridLineCss, gridTemplateCss, letterSpacingCss, radiusCss, shadowCss, textShadowItemCss } from './css.js';
import {
  alignFromCss,
  blendFromCss,
  blurFromFilterCss,
  boxShadowsFromCss,
  cssColorHex,
  cssPx,
  fontWeightFromCss,
  gradientFromCss,
  gridPlacementFromCss,
  gridTemplateFromCss,
  gridTracksFromPx,
  justifyFromCss,
  letterSpacingFromCss,
  lineHeightFromCss,
  radiusFromCss,
  rotationFromTransformCss,
  splitTopLevel,
  textAlignFromCss,
  textShadowsFromCss,
} from './css-reverse.js';

describe('css-reverse', () => {
  it('splitTopLevel menghormati kurung dan kutip', () => {
    expect(splitTopLevel('rgb(1, 2, 3) 0px, url("a,b") , x', ',')).toEqual(['rgb(1, 2, 3) 0px', 'url("a,b")', 'x']);
    expect(splitTopLevel('  repeat(2, 1fr)   10px ', ' ')).toEqual(['repeat(2, 1fr)', '10px']);
    expect(splitTopLevel('', ',')).toEqual([]);
  });

  it('panjang dan warna computed', () => {
    expect(cssPx('12.5px')).toBe(12.5);
    expect(cssPx('0')).toBe(0);
    expect(cssPx('1em')).toBeUndefined();
    expect(cssColorHex('rgb(15, 23, 42)')).toBe('#0F172A');
    expect(cssColorHex('rgba(0, 0, 0, 0.5)')).toBe('#00000080');
    expect(cssColorHex('transparent')).toBe('#00000000');
    expect(cssColorHex('oklch(0.5 0.1 200)')).toBeUndefined();
  });

  it('box-shadow / text-shadow → bayangan; round trip lewat shadowCss', () => {
    const v = 'rgba(15, 23, 42, 0.12) 0px 8px 24px 0px, rgb(255, 0, 0) 1px 2px 3px 4px inset';
    const s = boxShadowsFromCss(v)!;
    expect(s).toEqual([
      { x: 0, y: 8, blur: 24, color: '#0F172A1F' },
      { type: 'inner', x: 1, y: 2, blur: 3, spread: 4, color: '#FF0000' },
    ]);
    expect(s.map(shadowCss)).toEqual(['0px 8px 24px 0px #0F172A1F', 'inset 1px 2px 3px 4px #FF0000']);
    expect(boxShadowsFromCss('none')).toEqual([]);
    expect(boxShadowsFromCss('calc(1px) 0px')).toBeUndefined();
    const t = textShadowsFromCss('rgb(0, 0, 0) 0px 1px 2px')!;
    expect(t.map(textShadowItemCss)).toEqual(['0px 1px 2px #000000']);
  });

  it('gradien linear/conic → fill; round trip lewat gradientLayerCss; radial/url → undefined', () => {
    const lin = gradientFromCss('linear-gradient(90deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)', { w: 10, h: 10 })!;
    expect(gradientLayerCss(lin)).toBe('linear-gradient(90deg, #FF0000 0%, #0000FF 100%)');
    expect(gradientFromCss('linear-gradient(rgb(0, 0, 0), rgb(1, 1, 1), rgb(2, 2, 2))', { w: 1, h: 1 })).toMatchObject({ angle: 180, stops: [{ offset: 0 }, { offset: 0.5 }, { offset: 1 }] });
    expect(gradientFromCss('linear-gradient(to right, rgb(255, 0, 0), rgb(0, 0, 255))', { w: 1, h: 1 })).toMatchObject({ angle: 90 });
    // `to top right` pada kotak 2:1 → sudut garis tegak lurus diagonal.
    const corner = gradientFromCss('linear-gradient(to top right, rgb(0, 0, 0), rgb(1, 1, 1))', { w: 200, h: 100 }) as { angle: number };
    expect(corner.angle).toBeCloseTo(26.5651, 3);
    const con = gradientFromCss('conic-gradient(from 45deg at 25% 50%, rgb(0, 0, 0), rgb(255, 255, 255))', { w: 1, h: 1 })!;
    expect(gradientLayerCss(con)).toBe('conic-gradient(from 45deg at 25% 50%, #000000 0%, #FFFFFF 100%)');
    expect(gradientFromCss('radial-gradient(rgb(0, 0, 0), rgb(1, 1, 1))', { w: 1, h: 1 })).toBeUndefined();
    expect(gradientFromCss('linear-gradient(rgb(0, 0, 0) 10px, rgb(1, 1, 1))', { w: 1, h: 1 })).toBeUndefined();
  });

  it('radius: sama → angka, beda → tuple, persen dari kotak, elips → lossy', () => {
    expect(radiusFromCss(['8px', '8px', '8px', '8px'], { w: 10, h: 10 })).toEqual({ radius: 8, lossy: false });
    const t = radiusFromCss(['8px', '0px', '4px', '0px'], { w: 10, h: 10 });
    expect(radiusCss(t.radius)).toBe('8px 0px 4px 0px');
    expect(radiusFromCss(['50%', '50%', '50%', '50%'], { w: 40, h: 40 })).toEqual({ radius: 20, lossy: false });
    expect(radiusFromCss(['10px 4px', '0px', '0px', '0px'], { w: 40, h: 40 })).toMatchObject({ lossy: true, radius: [4, 0, 0, 0] });
    expect(radiusFromCss(['0px', '0px', '0px', '0px'], { w: 1, h: 1 })).toEqual({ lossy: false });
  });

  it('align/justify kebalikan ALIGN/JUSTIFY', () => {
    expect(['flex-start', 'center', 'flex-end', 'stretch', 'normal', 'start', 'flow-start', 'baseline'].map(alignFromCss)).toEqual(['start', 'center', 'end', 'stretch', 'stretch', 'start', 'start', undefined]);
    expect(['flex-start', 'center', 'flex-end', 'space-between', 'normal', 'space-around'].map(justifyFromCss)).toEqual(['start', 'center', 'end', 'space-between', 'start', undefined]);
  });

  it('track grid tertulis → track bertipe; round trip lewat gridTemplateCss', () => {
    const t = gridTemplateFromCss('repeat(3, 1fr) 200px minmax(0, 2fr) auto')!;
    expect(gridTemplateCss(t)).toBe('1fr 1fr 1fr 200px minmax(0px, 2fr) auto');
    expect(gridTemplateFromCss('repeat(auto-fill, minmax(100px, 1fr))')).toBeUndefined();
    expect(gridTemplateFromCss('[a] 1fr [b]')).toBeUndefined();
    expect(gridTemplateFromCss('50%')).toBeUndefined();
    expect(gridTemplateFromCss('repeat(30, 1fr)')).toBeUndefined();
    // Batas dicek sebelum mengisi (tanpa membangun jutaan track).
    expect(gridTemplateFromCss('repeat(10000000, 1fr 1fr)')).toBeUndefined();
    expect(gridTracksFromPx('258.656px 258.672px')).toEqual([258.66, 258.67]);
  });

  it('penempatan grid computed → penempatan skema; round trip lewat gridLineCss', () => {
    const cases: [string, string, string | undefined][] = [
      ['2', 'auto', '2'],
      ['1', '3', '1 / 3'],
      ['span 2', 'auto', 'span 2'],
      ['2', 'span 2', '2 / span 2'],
      ['auto', '3', 'auto / 3'],
    ];
    for (const [a, b, css] of cases) expect(gridLineCss(gridPlacementFromCss(a, b)), `${a} / ${b}`).toBe(css);
    expect(gridPlacementFromCss('auto', 'auto')).toEqual({});
    expect(gridPlacementFromCss('hero', 'auto')).toBeUndefined();
    // Di luar batas skema (garis ±25, span ≤ 24) → undefined.
    expect(gridPlacementFromCss('1', '200')).toBeUndefined();
    expect(gridPlacementFromCss('span 99', 'auto')).toBeUndefined();
  });

  it('efek, teks', () => {
    expect(blendFromCss('multiply')).toBe('multiply');
    expect(blendFromCss('plus-lighter')).toBeUndefined();
    expect(blurFromFilterCss('blur(4px)')).toBe(8);
    expect(blurFromFilterCss('none')).toBe(0);
    expect(blurFromFilterCss('grayscale(1)')).toBeUndefined();
    expect(rotationFromTransformCss('matrix(0, 1, -1, 0, 0, 0)')).toBe(90);
    expect(rotationFromTransformCss('matrix(1, 0, 0, 1, 10, 0)')).toBeUndefined();
    expect(rotationFromTransformCss('none')).toBe(0);
    expect(fontWeightFromCss('650')).toBe(700);
    expect(letterSpacingCss(letterSpacingFromCss('1.12px', 14))).toBe('0.08em');
    expect(letterSpacingFromCss('normal', 14)).toBeUndefined();
    expect(lineHeightFromCss('20px')).toBe(20);
    expect(lineHeightFromCss('normal')).toBeUndefined();
    expect(['start', 'left', 'center', 'right', 'end', 'justify'].map(textAlignFromCss)).toEqual([undefined, undefined, 'center', 'right', 'right', 'justify']);
  });
});
