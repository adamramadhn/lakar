// Tes unit @lakar/codegen (matriks spec kode-2): murni, tanpa IO. Golden korpus + typecheck ada di tests/codegen.test.ts.
import { describe, expect, it } from 'vitest';
import type { IconGlyph, LakarDocument } from '@lakar/schema';
import { buildTree, declToTailwind, generateCode, tailwindThemeCss, tokensCss, type CodeElement } from './index.js';
import { camelName, pascalName } from './names.js';

type AnyNode = Record<string, unknown>;

const BOARD = 'Board001';

function doc(children: AnyNode[], extra: AnyNode = {}, board: AnyNode = {}): LakarDocument {
  return {
    schemaVersion: 5,
    id: 'Doc00001',
    rev: 1,
    tokens: {
      'colors.bg': { type: 'color', value: '#FFFFFF', modes: { dark: '#0F0F0F' } },
      'colors.text': { type: 'color', value: '#101828' },
      'space.4': { type: 'spacing', value: 16 },
      'stroke.w': { type: 'spacing', value: 2 },
    },
    tokenModes: ['light', 'dark'],
    pages: [{ id: 'Page0001', name: 'Page', children: [{ type: 'board', id: BOARD, name: 'Landing Hero', x: 0, y: 0, width: 400, height: 300, screen: 'landing', children, ...board }] }],
    ...extra,
  } as unknown as LakarDocument;
}

const file = (r: { files: { path: string; contents: string }[] }, path: string) => r.files.find((f) => f.path === path)!.contents;

/** Elemen pohon berdasarkan id node. */
function find(e: CodeElement, id: string): CodeElement | undefined {
  if (e.nodeId === id && !e.svgChild) return e;
  for (const c of e.children) {
    if (c.kind !== 'element') continue;
    const hit = find(c, id);
    if (hit) return hit;
  }
  return undefined;
}
const declsOf = (d: LakarDocument, id: string, nodeId = BOARD) => new Map(find(buildTree(d, { nodeId }, []).root, id)!.decls);

const frame = (id: string, extra: AnyNode = {}, children: AnyNode[] = []): AnyNode => ({ type: 'frame', id, name: id, children, ...extra });
const text = (id: string, content: string, extra: AnyNode = {}): AnyNode => ({ type: 'text', id, name: id, content, size: 16, ...extra });

describe('generateCode: berkas dan target', () => {
  const d = doc([frame('Frame001', { name: 'Hero Card', layout: 'column', gap: 8, padding: 16, fills: [{ type: 'solid', color: { $token: 'colors.bg' } }] }, [text('Text0001', 'Hello')])]);

  it('react-css: TSX + modul CSS + tokens.css; kelas frame dari css.ts', () => {
    const r = generateCode(d, { nodeId: BOARD, target: 'react-css' });
    expect(r.files.map((f) => f.path)).toEqual(['LandingHero.tsx', 'LandingHero.module.css', 'tokens.css']);
    const tsx = file(r, 'LandingHero.tsx');
    expect(tsx).toContain("import styles from './LandingHero.module.css';");
    expect(tsx).toContain('export function LandingHero() {');
    expect(tsx).toContain('<div className={styles.heroCard}>');
    expect(tsx).toContain('export default LandingHero;');
    const css = file(r, 'LandingHero.module.css');
    expect(css).toContain('.heroCard {\n  position: relative;\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  padding: 16px;\n  background-color: var(--colors-bg);');
    expect(r.warnings).toEqual([]);
  });

  it('react-tailwind: kelas utilitas/arbitrer, theme.css, tanpa modul CSS', () => {
    const r = generateCode(d, { nodeId: BOARD, target: 'react-tailwind' });
    expect(r.files.map((f) => f.path)).toEqual(['LandingHero.tsx', 'tokens.css', 'theme.css']);
    const tsx = file(r, 'LandingHero.tsx');
    expect(tsx).toContain('className="relative flex flex-col gap-[8px] p-[16px] bg-[color:var(--colors-bg)] box-border m-[0] flex-[0_0_auto]"');
    expect(tsx).not.toContain('styles.');
  });

  it('componentName dan nodeId frame: akar diperlakukan sebagai anak flow kolom, absolute diabaikan', () => {
    const d2 = doc([frame('Frame001', { name: 'Card', position: 'absolute', x: 10, y: 20, width: 100, height: 50 })]);
    const r = generateCode(d2, { nodeId: 'Frame001', target: 'react-css', componentName: 'my card' });
    expect(r.files[0]!.path).toBe('MyCard.tsx');
    const m = declsOf(d2, 'Frame001', 'Frame001');
    expect(m.get('position')).toBe('relative');
    expect(m.has('left')).toBe(false);
    expect(m.get('flex')).toBe('0 0 50px');
  });

  it('assetBase diteruskan ke fill image di kedua target', () => {
    const sha = 'a'.repeat(64);
    const d2 = doc([frame('Img00001', { name: 'Photo', width: 10, height: 10, fills: [{ type: 'image', assetId: sha, fit: 'cover' }] })]);
    const css = generateCode(d2, { nodeId: BOARD, target: 'react-css', assetBase: './img/' });
    expect(file(css, 'LandingHero.module.css')).toContain(`background: url("./img/${sha}") center / cover no-repeat;`);
    const tw = generateCode(d2, { nodeId: BOARD, target: 'react-tailwind', assetBase: './img/' });
    expect(file(tw, 'LandingHero.tsx')).toContain(`style={{ background: "url(\\"./img/${sha}\\") center / cover no-repeat" }}`);
  });

  it('Tailwind: nilai berkutip tunggal/`&` → prop style, bukan kelas arbitrer', () => {
    const d2 = doc([text('Text0001', 'Hi', { family: "O'Reilly Sans" })]);
    const tsx = file(generateCode(d2, { nodeId: BOARD, target: 'react-tailwind' }), 'LandingHero.tsx');
    expect(tsx).toContain(`style={{ fontFamily: "\\"O'Reilly Sans\\"" }}`);
    expect(tsx).not.toContain('[font-family:');
  });

  it('peringatan token tingkat dokumen tanpa nodeId', () => {
    const d2 = doc([]);
    (d2.tokens as Record<string, unknown>)['colors-bg'] = { type: 'color', value: '#000000' };
    const [w] = generateCode(d2, { nodeId: BOARD, target: 'react-css' }).warnings;
    expect(w).toEqual({ code: 'token-var-collision', message: expect.stringContaining('--colors-bg') });
  });

  it('deterministik: dua panggilan → byte identik', () => {
    for (const target of ['react-css', 'react-tailwind'] as const) {
      expect(generateCode(d, { nodeId: BOARD, target })).toEqual(generateCode(d, { nodeId: BOARD, target }));
    }
  });

  it('node tidak ada → NOT_FOUND', () => {
    expect(() => generateCode(d, { nodeId: 'Nope0000', target: 'react-css' })).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });
});

describe('generateCode: tata letak sama dengan render (css.ts)', () => {
  it('anak fill di row → flex 1 1 0px + min-width 0', () => {
    const d = doc([frame('Row00001', { layout: 'row', width: 300 }, [frame('Fill0001', { width: 'fill', height: 40 })])]);
    const m = declsOf(d, 'Fill0001');
    expect(m.get('flex')).toBe('1 1 0px');
    expect(m.get('min-width')).toBe('0');
    expect(m.get('height')).toBe('40px');
  });

  it('absolute hug → left/top + max-content', () => {
    const d = doc([frame('Box00001', { width: 200, height: 200 }, [frame('Abs00001', { position: 'absolute', x: 10, y: 20 })])]);
    const m = declsOf(d, 'Abs00001');
    expect([...m]).toEqual(expect.arrayContaining([['position', 'absolute'], ['left', '10px'], ['top', '20px'], ['flex', '0 0 auto'], ['width', 'max-content'], ['height', 'max-content']]));
  });

  it('gap negatif → margin anak flow ke-2 dst., parent tanpa gap', () => {
    const d = doc([frame('Row00001', { layout: 'row', gap: -4 }, [frame('A0000001'), frame('B0000001'), frame('C0000001')])]);
    expect(declsOf(d, 'Row00001').has('gap')).toBe(false);
    expect(declsOf(d, 'A0000001').get('margin')).toBe('0');
    expect(declsOf(d, 'B0000001').get('margin')).toBe('0 0 0 -4px');
    expect(declsOf(d, 'C0000001').get('margin')).toBe('0 0 0 -4px');
  });

  it('teks dengan karakter khusus JSX dan baris baru → ekspresi string literal, white-space pre', () => {
    const d = doc([text('Text0001', 'a {b} <c>\nline 2')]);
    const tsx = file(generateCode(d, { nodeId: BOARD, target: 'react-css' }), 'LandingHero.tsx');
    expect(tsx).toContain('{"a {b} <c>\\nline 2"}');
    expect(declsOf(d, 'Text0001').get('white-space')).toBe('pre');
    expect(declsOf(d, 'Text0001').get('font-family')).toBe('Inter');
  });
});

describe('generateCode: stroke, bentuk, ikon', () => {
  it('stroke inside → ::after dengan border tiap sisi', () => {
    const d = doc([{ type: 'rect', id: 'Rect0001', name: 'Panel', width: 50, height: 50, radius: 8, stroke: { color: '#111111', width: 2, align: 'inside' } }]);
    const css = file(generateCode(d, { nodeId: BOARD, target: 'react-css' }), 'LandingHero.module.css');
    expect(css).toContain(".panel::after {\n  content: '';\n  position: absolute;\n  inset: 0;");
    for (const side of ['top', 'right', 'bottom', 'left']) expect(css).toContain(`  border-${side}: 2px solid #111111;`);
    const tsx = file(generateCode(d, { nodeId: BOARD, target: 'react-tailwind' }), 'LandingHero.tsx');
    expect(tsx).toContain("after:content-[''] after:absolute after:inset-[0]");
    expect(tsx).toContain('after:[border-top:2px_solid_#111111]');
  });

  it('stroke token center → setengah lebar calc() di luar (box-shadow) dan dalam (::after)', () => {
    const d = doc([{ type: 'rect', id: 'Rect0001', name: 'Panel', width: 50, height: 50, stroke: { color: '#111111', width: { $token: 'stroke.w' }, align: 'center' } }]);
    const tree = buildTree(d, { nodeId: BOARD }, []);
    const e = find(tree.root, 'Rect0001')!;
    expect(new Map(e.decls).get('box-shadow')).toBe('0 0 0 calc(var(--stroke-w) / 2) #111111');
    expect(new Map(e.after).get('border-top')).toBe('calc(var(--stroke-w) / 2) solid #111111');
  });

  it('path → lapisan fill ber-mask (url di style pada Tailwind) + svg stroke dengan id deterministik', () => {
    const d = doc([
      { type: 'path', id: 'Path0001', name: 'Logo', d: 'M0 0 L10 10', viewBox: [0, 0, 10, 10], fills: [{ type: 'solid', color: '#FF0000' }], stroke: { color: '#000000', width: 1, align: 'inside' } },
    ]);
    const tsx = file(generateCode(d, { nodeId: BOARD, target: 'react-tailwind' }), 'LandingHero.tsx');
    expect(tsx).toMatch(/style=\{\{ maskImage: "url\(\\"data:image\/svg\+xml,/);
    expect(tsx).toContain('<clipPath id="landing-hero-Path0001-stroke">');
    expect(tsx).toContain('clipPath="url(#landing-hero-Path0001-stroke)"');
    expect(tsx).toContain('vectorEffect="non-scaling-stroke"');
  });

  it('ikon dengan glyph → svg; tanpa glyph → kotak kosong + warning', () => {
    const icon = { type: 'icon', id: 'Icon0001', name: 'Star', lib: 'lucide', icon: 'star', size: 20, color: { $token: 'colors.text' } };
    const d = doc([icon]);
    const glyph: IconGlyph = { lib: 'lucide', icon: 'star', kind: 'stroke', viewBox: [0, 0, 24, 24], nodes: [['path', { d: 'M1 1', stroke: 'currentColor' }]] } as unknown as IconGlyph;
    const withGlyph = generateCode(d, { nodeId: BOARD, target: 'react-css', icons: [glyph] });
    const tsx = file(withGlyph, 'LandingHero.tsx');
    expect(tsx).toContain('<svg className={styles.starSvg} viewBox="0 0 24 24"');
    expect(tsx).toContain('stroke="currentColor"');
    expect(file(withGlyph, 'LandingHero.module.css')).toContain('.starSvg {\n  overflow: visible;\n  display: block;\n  color: var(--colors-text);\n}');
    expect(withGlyph.warnings).toEqual([]);
    const without = generateCode(d, { nodeId: BOARD, target: 'react-css' });
    expect(without.warnings).toEqual([expect.objectContaining({ code: 'icon-glyph-missing', nodeId: 'Icon0001' })]);
  });

  it('fill mesh dilewati + warning; lapisan lain tetap', () => {
    const d = doc([
      frame('Mesh0001', {
        width: 10,
        height: 10,
        fills: [
          { type: 'solid', color: '#000000' },
          { type: 'mesh', columns: 2, rows: 2, colors: ['#000000', '#111111', '#222222', '#333333'] },
        ],
      }),
    ]);
    const r = generateCode(d, { nodeId: BOARD, target: 'react-css' });
    expect(r.warnings).toEqual([expect.objectContaining({ code: 'mesh-fill', nodeId: 'Mesh0001' })]);
    expect(declsOf(d, 'Mesh0001').get('background-color')).toBe('#000000');
  });
});

describe('generateCode: instance dan mode', () => {
  it('instance di-inline lewat expandInstances, override diterapkan', () => {
    const master = frame('Mast0001', { name: 'Button', component: { props: [], slots: [] } }, [text('Labl0001', 'Click')]);
    const inst = { type: 'instance', id: 'Inst0001', name: 'Buy', componentId: 'Mast0001', overrides: { Labl0001: { content: 'Buy now' } } };
    const d = doc([master, inst]);
    const tsx = file(generateCode(d, { nodeId: BOARD, target: 'react-css' }), 'LandingHero.tsx');
    expect(tsx).toContain('Click');
    expect(tsx).toContain('Buy now');
    expect(declsOf(d, 'Inst0001/Labl0001').get('font-size')).toBe('16px');
  });

  it('themeMode non-default → data-theme di akar; tokens.css punya :root dan [data-theme]', () => {
    const d = doc([], {}, { themeMode: 'dark' });
    const r = generateCode(d, { nodeId: BOARD, target: 'react-css' });
    expect(file(r, 'LandingHero.tsx')).toContain('<div className={styles.landingHero} data-theme="dark" />');
    expect(file(r, 'tokens.css')).toBe(
      ':root {\n  --colors-bg: #FFFFFF;\n  --colors-text: #101828;\n  --space-4: 16px;\n  --stroke-w: 2px;\n}\n\n[data-theme="dark"] {\n  --colors-bg: #0F0F0F;\n}\n',
    );
    const light = generateCode(doc([], {}, { themeMode: 'light' }), { nodeId: BOARD, target: 'react-css' });
    expect(file(light, 'LandingHero.tsx')).not.toContain('data-theme');
  });
});

describe('tokensCss dan tailwindThemeCss', () => {
  it('nilai per tipe dan mode default = mode pertama', () => {
    const css = tokensCss({
      tokenModes: ['dark', 'light'],
      tokens: {
        'font.sans': { type: 'fontFamily', value: 'Space Grotesk' },
        'font.bold': { type: 'fontWeight', value: 700 },
        'tracking.wide': { type: 'letterSpacing', value: 0.02 },
        'c.x': { type: 'color', value: '#FFFFFF', modes: { dark: '#000000' } },
      },
    });
    expect(css).toBe(':root {\n  --font-sans: "Space Grotesk";\n  --font-bold: 700;\n  --tracking-wide: 0.02em;\n  --c-x: #000000;\n}\n\n[data-theme="light"] {\n  --c-x: #FFFFFF;\n}\n');
    expect(tokensCss({})).toBe(':root {}\n');
  });

  it('tema Tailwind: namespace per tipe, bentrok atau sama dengan variabel token (siklik) → nama penuh', () => {
    const css = tailwindThemeCss({
      tokens: {
        'colors.primary': { type: 'color', value: '#000000' },
        'brand.primary': { type: 'color', value: '#111111' },
        'radius.md': { type: 'radius', value: 8 },
        'bp.md': { type: 'breakpoint', value: 768 },
        'text.lg': { type: 'fontSize', value: 18 },
      },
    });
    expect(css).toBe(
      '@import "./tokens.css";\n\n@theme inline {\n  --color-colors-primary: var(--colors-primary);\n  --color-brand-primary: var(--brand-primary);\n  --radius-radius-md: var(--radius-md);\n  --breakpoint-md: var(--bp-md);\n  --text-text-lg: var(--text-lg);\n}\n',
    );
  });

  it('variabel CSS bentrok → warning token-var-collision', () => {
    const d = doc([]);
    (d.tokens as Record<string, unknown>)['colors-bg'] = { type: 'color', value: '#000000' };
    expect(generateCode(d, { nodeId: BOARD, target: 'react-css' }).warnings).toEqual([expect.objectContaining({ code: 'token-var-collision' })]);
  });
});

describe('declToTailwind dan nama', () => {
  it.each([
    ['display', 'flex', 'flex'],
    ['width', '120px', 'w-[120px]'],
    ['flex', '1 1 0px', 'flex-[1_1_0px]'],
    ['color', 'var(--c)', 'text-[color:var(--c)]'],
    ['font-size', 'var(--s)', 'text-[length:var(--s)]'],
    ['font-weight', '600', 'font-[600]'],
    ['font-family', '"Space Grotesk"', "[font-family:'Space_Grotesk']"],
    ['box-shadow', '0 0 0 1px #000000', '[box-shadow:0_0_0_1px_#000000]'],
    ['grid-template-columns', 'minmax(0px, 1fr) auto', 'grid-cols-[minmax(0px,_1fr)_auto]'],
    ['mix-blend-mode', 'multiply', 'mix-blend-multiply'],
    ['font-variant-numeric', 'tabular-nums', '[font-variant-numeric:tabular-nums]'],
    ['transform', 'translateY(-4px)', '[transform:translateY(-4px)]'],
    ['grid-column', 'a_b', 'col-[a\\_b]'],
  ])('%s: %s → %s', (p, v, cls) => {
    expect(declToTailwind(p, v)).toBe(cls);
  });

  it('camelName/pascalName ASCII deterministik', () => {
    expect(camelName('Hero Section', 'frame')).toBe('heroSection');
    expect(camelName('Icon / lucide / star', 'icon')).toBe('iconLucideStar');
    expect(camelName('', 'text')).toBe('text');
    expect(camelName('1 kolom', 'frame')).toBe('n1Kolom');
    expect(camelName('Café', 'x')).toBe('cafe');
    expect(pascalName('landing hero')).toBe('LandingHero');
    expect(pascalName('???')).toBe('Frame');
    expect(pascalName('3 cards')).toBe('Frame3Cards');
  });
});
