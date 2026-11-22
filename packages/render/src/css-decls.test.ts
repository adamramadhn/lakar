// Deklarasi node di css.ts (AD-5, spec kode-2): render (angka) dan codegen (ref token). Murni, tanpa Chromium.
// Kesamaan dengan output render lama dikunci golden piksel di packages/render/test.
import { describe, expect, it } from 'vitest';
import {
  boardDecls,
  boxShadowWithStrokeCss,
  childLayoutDecls,
  codeBackgroundDecls,
  effectDecls,
  frameDecls,
  strokeOverlayDecls,
  textDecls,
  textWrapMode,
  tokenValueCss,
} from './css.js';
import { iconSvgSpec } from './icon.js';
import { pathShape, strokeSvgSpec } from './shape.js';

const tok = (name: string) => ({ $token: name });

describe('childLayoutDecls', () => {
  it('flow row: angka, fill, hug; min/max menimpa min-width:0', () => {
    expect(childLayoutDecls({ width: 120, height: 'hug' }, 'row')).toEqual([
      ['box-sizing', 'border-box'],
      ['margin', '0'],
      ['flex', '0 0 120px'],
      ['width', '120px'],
      ['height', 'fit-content'],
    ]);
    expect(childLayoutDecls({ width: 'fill', height: 'fill', minWidth: 40 }, 'row')).toEqual([
      ['box-sizing', 'border-box'],
      ['margin', '0'],
      ['flex', '1 1 0px'],
      ['min-width', '0'],
      ['align-self', 'stretch'],
      ['height', 'auto'],
      ['min-width', '40px'],
    ]);
  });

  it('token di sizing → var()', () => {
    expect(childLayoutDecls({ height: tok('size.h') }, 'column')).toContainEqual(['flex', '0 0 var(--size-h)']);
  });

  it('absolute (atau parent none): left/top + max-content / fill → right/bottom 0', () => {
    expect(childLayoutDecls({ position: 'absolute', x: 5, width: 'fill' }, 'row')).toEqual([
      ['box-sizing', 'border-box'],
      ['margin', '0'],
      ['position', 'absolute'],
      ['left', '5px'],
      ['top', '0px'],
      ['flex', '0 0 auto'],
      ['right', '0'],
      ['height', 'max-content'],
    ]);
  });

  it('item grid dan penempatan', () => {
    expect(childLayoutDecls({ width: 'fill', gridColumn: { span: 2 } }, 'grid')).toEqual([
      ['box-sizing', 'border-box'],
      ['margin', '0'],
      ['justify-self', 'stretch'],
      ['width', 'auto'],
      ['min-width', '0'],
      ['grid-column', 'span 2'],
    ]);
  });

  it('gap negatif → margin sisi awal; anak absolute tidak terpengaruh', () => {
    expect(childLayoutDecls({}, 'row', { negativeGap: -4 })[1]).toEqual(['margin', '0 0 0 -4px']);
    expect(childLayoutDecls({}, 'column', { negativeGap: -4 })[1]).toEqual(['margin', '-4px 0 0 0']);
    expect(childLayoutDecls({ position: 'absolute' }, 'row', { negativeGap: -4 })[1]).toEqual(['margin', '0']);
  });

  it('icon size×size, path viewBox, teks wrap → tinggi hug', () => {
    expect(childLayoutDecls({ type: 'icon', size: 20 }, 'row')).toContainEqual(['height', '20px']);
    expect(childLayoutDecls({ type: 'path', viewBox: [0, 0, 24, 12] }, 'row')).toContainEqual(['height', '12px']);
    expect(childLayoutDecls({ type: 'text', width: 100 }, 'row')).toContainEqual(['height', 'fit-content']);
    expect(textWrapMode({ width: tok('w') })).toBe('wrap');
    expect(textWrapMode({})).toBe('auto');
  });
});

describe('frame, board, teks, efek', () => {
  it('frameDecls: gap negatif tidak ditulis; token gap → var()', () => {
    expect(frameDecls({ layout: 'row', gap: -4, padding: [8, 16], clip: true, align: 'center' })).toEqual([
      ['position', 'relative'],
      ['display', 'flex'],
      ['flex-direction', 'row'],
      ['align-items', 'center'],
      ['padding', '8px 16px'],
      ['overflow', 'hidden'],
    ]);
    expect(frameDecls({ layout: 'column', gap: tok('space.2') })).toContainEqual(['gap', 'var(--space-2)']);
    expect(frameDecls({})).toEqual([
      ['position', 'relative'],
      ['display', 'block'],
    ]);
  });

  it('boardDecls: ukuran tetap, clip, kolom flex', () => {
    expect(boardDecls({ width: 400, height: 300 })).toContainEqual(['width', '400px']);
    expect(boardDecls({ width: 400, height: 300 })).toContainEqual(['isolation', 'isolate']);
  });

  it('textDecls: default bobot/warna, token → var()', () => {
    const d = textDecls({ size: tok('text.base'), color: tok('colors.text'), weight: tok('fw.bold') }, 'Inter');
    expect(d).toContainEqual(['font-size', 'var(--text-base)']);
    expect(d).toContainEqual(['color', 'var(--colors-text)']);
    expect(d).toContainEqual(['font-weight', 'var(--fw-bold)']);
    expect(textDecls({ size: 16 }, 'Inter')).toContainEqual(['color', '#000000']);
    expect(textDecls({ size: 16, wrap: 'fixed' }, 'Inter')).toContainEqual(['overflow', 'visible']);
  });

  it('effectDecls: opacity < 1, filter dengan drop-shadow awal, transform scrollY + rotasi', () => {
    expect(effectDecls({ opacity: 0.5, blur: 4, rotation: 10, blend: 'multiply' }, 12, ['drop-shadow(0px 1px 2px #000000)'])).toEqual([
      ['opacity', '0.5'],
      ['mix-blend-mode', 'multiply'],
      ['filter', 'drop-shadow(0px 1px 2px #000000) blur(2px)'],
      ['transform', 'translateY(-12px) rotate(10deg)'],
      ['transform-origin', '50% 50%'],
    ]);
    expect(effectDecls({ opacity: 1 })).toEqual([]);
  });
});

describe('stroke box', () => {
  it('angka: center dibagi dua luar/dalam, sisi tertentu → offset', () => {
    expect(boxShadowWithStrokeCss({ color: '#111111', width: 2, align: 'center' }, undefined)).toBe('0 0 0 1px #111111');
    expect(boxShadowWithStrokeCss({ color: '#111111', width: 2, align: 'outside', sides: ['top'] }, undefined)).toBe('0 -2px 0 0 #111111');
    expect(strokeOverlayDecls({ color: '#111111', width: 2, align: 'outside' }, undefined)).toBeUndefined();
    expect(strokeOverlayDecls({ color: '#111111', width: 2, align: 'inside', sides: ['bottom'] }, '4px')).toEqual([
      ['position', 'absolute'],
      ['inset', '0'],
      ['box-sizing', 'border-box'],
      ['pointer-events', 'none'],
      ['margin', '0'],
      ['z-index', 'auto'],
      ['border-radius', '4px'],
      ['border-bottom', '2px solid #111111'],
    ]);
  });

  it('token: calc() untuk setengah lebar dan negasi', () => {
    expect(boxShadowWithStrokeCss({ color: tok('c.b'), width: tok('w'), align: 'outside', sides: ['left'] }, undefined)).toBe('calc(-1 * var(--w)) 0 0 0 var(--c-b)');
    expect(strokeOverlayDecls({ color: '#000000', width: tok('w'), align: 'center' }, undefined)).toContainEqual(['border-top', 'calc(var(--w) / 2) solid #000000']);
  });
});

describe('latar kode dan nilai token', () => {
  it('codeBackgroundDecls: solid tunggal → background-color; berlapis → background; mesh dihitung skipped', () => {
    expect(codeBackgroundDecls([{ type: 'solid', color: tok('c.bg') }])).toEqual({ decls: [['background-color', 'var(--c-bg)']], skipped: 0 });
    const two = codeBackgroundDecls([
      { type: 'solid', color: '#000000' },
      { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#FFFFFF' }, { offset: 1, color: '#000000' }] },
    ]);
    expect(two.decls).toEqual([['background', 'linear-gradient(90deg, #FFFFFF 0%, #000000 100%), linear-gradient(#000000, #000000)']]);
    expect(codeBackgroundDecls([{ type: 'mesh' }]).skipped).toBe(1);
    expect(codeBackgroundDecls([{ type: 'image', assetId: 'a'.repeat(64), fit: 'cover' }], './img/').decls[0]![1]).toBe(`url("./img/${'a'.repeat(64)}") center / cover no-repeat`);
    expect(codeBackgroundDecls([{ type: 'solid', color: '#000000' }, { type: 'noise', opacity: 0.2 }]).decls[1]).toEqual(['background-blend-mode', 'overlay, normal']);
  });

  it('tokenValueCss per tipe', () => {
    expect(tokenValueCss('color', '#ABCDEF')).toBe('#ABCDEF');
    expect(tokenValueCss('spacing', 16)).toBe('16px');
    expect(tokenValueCss('lineHeight', 24)).toBe('24px');
    expect(tokenValueCss('fontWeight', 600)).toBe('600');
    expect(tokenValueCss('fontFamily', 'Space Grotesk')).toBe('"Space Grotesk"');
    expect(tokenValueCss('letterSpacing', -0.01)).toBe('-0.01em');
  });
});

describe('spesifikasi SVG', () => {
  it('strokeSvgSpec: angka → atribut; token → currentColor + style', () => {
    const shape = pathShape({ d: 'M0 0 L1 1', viewBox: [0, 0, 1, 1] });
    const num = strokeSvgSpec(shape, { color: '#000000', width: 2, align: 'center' }, 'x')!;
    const path = num.children.at(-1)!;
    expect(path.attrs).toContainEqual(['stroke-width', '2']);
    expect(num.children).toHaveLength(1);
    const t = strokeSvgSpec(shape, { color: tok('c.s'), width: tok('w'), align: 'inside' }, 'clip1')!;
    expect(t.style).toContainEqual(['color', 'var(--c-s)']);
    expect(t.children.at(-1)!.attrs).toContainEqual(['stroke', 'currentColor']);
    expect(t.children.at(-1)!.style).toEqual([['stroke-width', 'calc(2 * var(--w))']]);
    expect(t.children[0]!.children[0]!.attrs).toContainEqual(['id', 'clip1']);
    expect(strokeSvgSpec(shape, { color: '#000000', width: 0, align: 'center' }, 'x')).toBeUndefined();
  });

  it('iconSvgSpec: currentColor glyph diganti warna; atribut asing dibuang', () => {
    const glyph = { lib: 'lucide', icon: 'x', kind: 'stroke', viewBox: [0, 0, 24, 24], nodes: [['path', { d: 'M1 1', fill: 'currentColor', onclick: 'x' }], ['script', {}]] } as never;
    const spec = iconSvgSpec({ color: '#FF0000' }, glyph);
    expect(spec.attrs).toContainEqual(['stroke', '#FF0000']);
    expect(spec.children).toEqual([{ tag: 'path', attrs: [['d', 'M1 1'], ['fill', '#FF0000']], style: [], children: [] }]);
  });
});
