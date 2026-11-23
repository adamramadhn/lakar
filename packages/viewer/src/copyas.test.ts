// Pemetaan murni Copy as CSS/Tailwind/JSON (aplikasi 2), termasuk baris matriks I/O spec.
import { describe, expect, it } from 'vitest';
import { copyAs, cssDeclarations, toCss, toTailwind } from './copyas.ts';

const id = { id: 'AbCd1234', name: 'n' };

describe('toCss', () => {
  it('teks Inter 16/600 #111 → font-family, font-size, font-weight, color (matriks spec)', () => {
    const node = { ...id, type: 'text', content: 'Hi', family: 'Inter', size: 16, weight: 600, color: '#111' };
    expect(toCss(node)).toBe('font-family: Inter;\nfont-size: 16px;\nfont-weight: 600;\ncolor: #111111;');
  });

  it('teks lengkap: keluarga berspasi dikutip, line-height px, letter-spacing em, italic, align, text-shadow', () => {
    const node = {
      ...id,
      type: 'text',
      family: 'JetBrains Mono',
      size: 12,
      lineHeight: 18,
      letterSpacing: 0.02,
      style: 'italic',
      align: 'center',
      color: '#F97316',
      shadows: [{ x: 0, y: 1, blur: 2, color: '#00000033' }, { type: 'inner', x: 0, y: 0, blur: 1, color: '#000000' }],
    };
    expect(cssDeclarations(node)).toEqual([
      ['text-shadow', '0px 1px 2px #00000033'],
      ['font-family', '"JetBrains Mono"'],
      ['font-size', '12px'],
      ['font-style', 'italic'],
      ['line-height', '18px'],
      ['letter-spacing', '0.02em'],
      ['color', '#F97316'],
      ['text-align', 'center'],
    ]);
  });

  it('frame flex: ukuran, absolute, fill solid, border, radius, opacity, box-shadow, layout', () => {
    const node = {
      ...id,
      type: 'frame',
      width: 298,
      height: 'hug',
      bounds: [10, 20, 298, 120.456],
      position: 'absolute',
      x: 10,
      y: 20,
      fills: [{ type: 'solid', color: '#F97316' }],
      stroke: { color: '#E5E7EB', width: 1, align: 'inside' },
      radius: 12,
      opacity: 0.9,
      shadows: [{ x: 0, y: 4, blur: 12, color: '#0000001A' }, { type: 'inner', x: 0, y: 1, blur: 0, spread: 1, color: '#FFFFFF' }],
      layout: 'column',
      gap: 8,
      padding: [12, 16],
      align: 'center',
      justify: 'space-between',
    };
    expect(toCss(node)).toBe(
      [
        'width: 298px;',
        'height: 120.46px;',
        'position: absolute;',
        'left: 10px;',
        'top: 20px;',
        'background: #F97316;',
        'border: 1px solid #E5E7EB;',
        'border-radius: 12px;',
        'opacity: 0.9;',
        'box-shadow: 0px 4px 12px 0px #0000001A, inset 0px 1px 0px 1px #FFFFFF;',
        'display: flex;',
        'flex-direction: column;',
        'gap: 8px;',
        'padding: 12px 16px;',
        'align-items: center;',
        'justify-content: space-between;',
      ].join('\n'),
    );
  });

  it('gradient → linear-gradient; beberapa fill → lapisan terbalik; image dilewati', () => {
    const linear = { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#FFFFFF' }, { offset: 1, color: '#000000' }] };
    expect(toCss({ ...id, type: 'rect', fills: [linear] })).toBe('background: linear-gradient(90deg, #FFFFFF 0%, #000000 100%);');
    expect(toCss({ ...id, type: 'rect', fills: [{ type: 'solid', color: '#111111' }, linear, { type: 'image', assetId: 'x', fit: 'cover' }] })).toBe(
      'background: linear-gradient(90deg, #FFFFFF 0%, #000000 100%), linear-gradient(#111111, #111111);',
    );
  });

  it('token → var(), stroke per sisi, radius 4 nilai', () => {
    const node = {
      ...id,
      type: 'rect',
      width: { $token: 'size.card' },
      fills: [{ type: 'solid', color: { $token: 'colors.primary' } }],
      stroke: { color: '#000000', width: 2, align: 'center', sides: ['top', 'bottom'] },
      radius: [4, 4, 0, 0],
    };
    expect(cssDeclarations(node)).toEqual([
      ['width', 'var(--size-card)'],
      ['background', 'var(--colors-primary)'],
      ['border-top', '2px solid #000000'],
      ['border-bottom', '2px solid #000000'],
      ['border-radius', '4px 4px 0px 0px'],
    ]);
  });

  it('board: tanpa posisi; ukuran tersimpan', () => {
    expect(toCss({ ...id, type: 'board', x: 0, y: 0, width: 1440, height: 900, fills: [{ type: 'solid', color: '#FFFFFF' }] })).toBe(
      'width: 1440px;\nheight: 900px;\nbackground: #FFFFFF;',
    );
  });
});

describe('toTailwind', () => {
  it('frame flex row gap 8 padding 16 → flex flex-row gap-[8px] p-[16px] (matriks spec)', () => {
    expect(toTailwind({ ...id, type: 'frame', layout: 'row', gap: 8, padding: 16 })).toBe('flex flex-row gap-[8px] p-[16px]');
  });

  it('padding 3 nilai → pt/px/pb; padding tidak valid (non-flex) dilewati, bukan "16px  8px"', () => {
    expect(toTailwind({ ...id, type: 'frame', layout: 'column', padding: [4, 8, 12] })).toBe('flex flex-col pt-[4px] px-[8px] pb-[12px]');
    expect(toCss({ ...id, type: 'frame', padding: [16, 'x', 8] })).not.toContain('padding');
    expect(toCss({ ...id, type: 'frame', padding: [16, 8] })).toContain('padding: 16px 8px;');
    expect(toTailwind({ ...id, type: 'frame', padding: [16, null] })).toBe('');
  });

  it('ukuran + fill solid → w-[298px] bg-[#F97316]', () => {
    expect(toTailwind({ ...id, type: 'rect', width: 298, fills: [{ type: 'solid', color: '#F97316' }] })).toBe('w-[298px] bg-[#F97316]');
  });

  it('teks dan tampilan lengkap', () => {
    const node = {
      ...id,
      type: 'text',
      family: 'JetBrains Mono',
      size: 16,
      weight: 600,
      lineHeight: 24,
      letterSpacing: -0.01,
      color: '#111111',
      align: 'center',
    };
    expect(toTailwind(node)).toBe("font-['JetBrains_Mono'] text-[16px] font-[600] leading-[24px] tracking-[-0.01em] text-[#111111] text-center");
  });

  it('absolute, border, rounded, opacity, shadow, padding 4 sisi, align/justify, gradient', () => {
    const node = {
      ...id,
      type: 'frame',
      width: 100,
      height: 40,
      position: 'absolute',
      x: 4,
      y: 8,
      fills: [{ type: 'linear', angle: 180, stops: [{ offset: 0, color: '#FFFFFF' }, { offset: 1, color: '#000000' }] }],
      stroke: { color: '#E5E7EB', width: 1, align: 'inside' },
      radius: [8, 8, 0, 0],
      opacity: 0.5,
      shadows: [{ x: 0, y: 4, blur: 8, color: '#00000033' }],
      layout: 'column',
      padding: [1, 2, 3, 4],
      align: 'start',
      justify: 'space-between',
    };
    expect(toTailwind(node).split(' ')).toEqual([
      'w-[100px]',
      'h-[40px]',
      'absolute',
      'left-[4px]',
      'top-[8px]',
      'bg-[linear-gradient(180deg,_#FFFFFF_0%,_#000000_100%)]',
      'border-[1px]',
      'border-[#E5E7EB]',
      'rounded-tl-[8px]',
      'rounded-tr-[8px]',
      'rounded-br-[0px]',
      'rounded-bl-[0px]',
      'opacity-[0.5]',
      'shadow-[0px_4px_8px_0px_#00000033]',
      'flex',
      'flex-col',
      'pt-[1px]',
      'pr-[2px]',
      'pb-[3px]',
      'pl-[4px]',
      'items-start',
      'justify-between',
    ]);
  });

  it('token: petunjuk tipe untuk utilitas ambigu', () => {
    const node = { ...id, type: 'text', size: { $token: 'type.body' }, color: { $token: 'colors.text-primary' } };
    expect(toTailwind(node)).toBe('text-[length:var(--type-body)] text-[color:var(--colors-text-primary)]');
  });
});

describe('copyAs', () => {
  it('json = node apa adanya (perilaku lama)', () => {
    const node = { ...id, type: 'rect', width: 10 };
    expect(copyAs('json', node)).toBe(JSON.stringify(node, null, 2));
    expect(copyAs('css', node)).toBe('width: 10px;');
    expect(copyAs('tailwind', node)).toBe('w-[10px]');
  });
});

describe('grid (v4)', () => {
  const grid = {
    ...id,
    type: 'frame',
    layout: 'grid',
    width: 400,
    gridTemplateColumns: [80, { fr: 1 }, { minmax: [120, { fr: 2 }] }],
    gridTemplateRows: [40, 'auto'],
    gap: 8,
    columnGap: { $token: 'space.4' },
    rowGap: 12,
    padding: 10,
    align: 'center',
    justify: 'start',
  };

  it('frame grid → display grid, template, gap, column-gap, row-gap, padding, align', () => {
    expect(toCss(grid)).toBe(
      [
        'width: 400px;',
        'display: grid;',
        'grid-template-columns: 80px 1fr minmax(120px, 2fr);',
        'grid-template-rows: 40px auto;',
        'gap: 8px;',
        'column-gap: var(--space-4);',
        'row-gap: 12px;',
        'padding: 10px;',
        'align-items: center;',
        'justify-content: flex-start;',
      ].join('\n'),
    );
    expect(toTailwind(grid)).toBe('w-[400px] grid grid-cols-[80px_1fr_minmax(120px,_2fr)] grid-rows-[40px_auto] gap-[8px] gap-x-[var(--space-4)] gap-y-[12px] p-[10px] items-center justify-start');
  });

  it('anak dengan penempatan → grid-column/grid-row (col-/row-)', () => {
    const child = { ...id, type: 'rect', height: 20, gridColumn: { start: 2, span: 2 }, gridRow: { start: 1, end: -1 } };
    expect(toCss(child)).toBe('height: 20px;\ngrid-column: 2 / span 2;\ngrid-row: 1 / -1;');
    expect(toTailwind(child)).toBe('h-[20px] col-[2_/_span_2] row-[1_/_-1]');
  });

  it('gap negatif di grid tidak disalin (render mengabaikannya); di flex tetap', () => {
    expect(toCss({ ...id, type: 'frame', layout: 'grid', gap: -4 })).toBe('display: grid;');
    expect(toCss({ ...id, type: 'frame', layout: 'row', gap: -4 })).toBe('display: flex;\nflex-direction: row;\ngap: -4px;');
  });

  it('frame row tetap flex; track di frame non-grid diabaikan', () => {
    const row = { ...id, type: 'frame', layout: 'row', gridTemplateColumns: [{ fr: 1 }], gap: 4 };
    expect(toCss(row)).toBe('display: flex;\nflex-direction: row;\ngap: 4px;');
  });
});

describe('wrap (v9)', () => {
  it('frame flex wrap:true → flex-wrap: wrap / kelas flex-wrap; tanpa wrap tidak ditulis', () => {
    const row = { ...id, type: 'frame', layout: 'row', wrap: true, columnGap: 8, rowGap: 12 };
    expect(toCss(row)).toBe('display: flex;\nflex-direction: row;\nflex-wrap: wrap;\ncolumn-gap: 8px;\nrow-gap: 12px;');
    expect(toTailwind(row)).toBe('flex flex-row flex-wrap gap-x-[8px] gap-y-[12px]');
    const nowrap = { ...id, type: 'frame', layout: 'column' };
    expect(toCss(nowrap)).not.toContain('flex-wrap');
    expect(toTailwind(nowrap)).not.toContain('flex-wrap');
    // wrap diabaikan di grid/none (sama seperti render).
    expect(toCss({ ...id, type: 'frame', layout: 'grid', wrap: true })).toBe('display: grid;');
    expect(toCss({ ...id, type: 'frame', wrap: true })).toBe('');
  });
});
