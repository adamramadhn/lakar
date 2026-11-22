// Tes unit helper murni uji paritas (spec kode-4): ambang R5, scoping/urutan CSS modules, halaman ekspor, mutasi
// dokumen acuan, dan regresi sengaja. Tanpa Chromium.
import { describe, expect, it } from 'vitest';
import {
  cssModuleClasses,
  cssModuleOrder,
  DEFAULT_INSTANCE_ID,
  dropPadding,
  exportPageHtml,
  fontFaceCss,
  PARITY_MAX_RATIO,
  PARITY_TOLERANCE,
  scopeCssModule,
  withDefaultInstance,
  withinParity,
  withoutMeshFills,
  withTokenValues,
} from './support/parity.ts';

describe('ambang R5', () => {
  it('di bawah 1% lulus, 1% atau lebih gagal; nilai tak sah gagal', () => {
    expect(PARITY_MAX_RATIO).toBe(0.01);
    expect(PARITY_TOLERANCE).toBe(24);
    expect(withinParity(0)).toBe(true);
    expect(withinParity(0.0099)).toBe(true);
    expect(withinParity(0.01)).toBe(false);
    expect(withinParity(0.5)).toBe(false);
    expect(withinParity(Number.NaN)).toBe(false);
    expect(withinParity(-1)).toBe(false);
  });
});

describe('CSS modules', () => {
  const css = '.card {\n  opacity: 0.5;\n  background: url("/a.b.png");\n}\n\n.card::after {\n  content: \'\';\n}\n\n.title2 {\n  color: #FFF;\n}\n';

  it('scopeCssModule hanya mengganti selektor kelas (termasuk ::after), nilai bertitik tetap', () => {
    const out = scopeCssModule(css, (n) => `_${n}_x1`);
    expect(out).toContain('._card_x1 {');
    expect(out).toContain('._card_x1::after {');
    expect(out).toContain('._title2_x1 {');
    expect(out).toContain('opacity: 0.5;');
    expect(out).toContain('url("/a.b.png")');
    expect(cssModuleClasses(css)).toEqual(['card', 'title2']);
  });

  it('selektor di luar format codegen → Error', () => {
    expect(() => scopeCssModule('.a .b {\n}\n', (n) => n)).toThrow(/selektor tak dikenal/);
    expect(() => scopeCssModule('@media (x) {\n}\n', (n) => n)).toThrow(/selektor tak dikenal/);
  });

  it('cssModuleOrder mengikuti urutan evaluasi impor ESM (depth-first, sekali per modul, impor type dilewati)', () => {
    const files = [
      { path: 'Main.tsx', contents: "import { A } from './components/A';\nimport { B } from './components/B';\nimport styles from './Main.module.css';\n" },
      { path: 'Main.module.css', contents: '' },
      { path: 'components/A.tsx', contents: "import type { CSSProperties } from 'react';\nimport styles from './A.module.css';\n" },
      { path: 'components/A.module.css', contents: '' },
      { path: 'components/B.tsx', contents: "import { A } from './A';\nimport styles from './B.module.css';\n" },
      { path: 'components/B.module.css', contents: '' },
    ];
    expect(cssModuleOrder(files, 'Main.tsx')).toEqual(['components/A.module.css', 'components/B.module.css', 'Main.module.css']);
    expect(() => cssModuleOrder(files.slice(0, 2), 'Main.tsx')).toThrow(/components\/A.tsx tidak ada/);
  });
});

describe('halaman ekspor', () => {
  it('fontFaceCss setara FontFace render (woff2, weight, style, unicode-range opsional)', () => {
    const out = fontFaceCss([
      { family: 'Inter', weight: 600, style: 'normal', url: '/fonts/a.woff2', unicodeRange: 'U+0000-00FF' },
      { family: 'Inter', weight: 400, style: 'italic', url: '/fonts/b.woff2' },
    ]);
    expect(out).toContain('font-family: "Inter";\n  src: url("/fonts/a.woff2") format("woff2");\n  font-weight: 600;\n  font-style: normal;');
    expect(out).toContain('unicode-range: U+0000-00FF;');
    expect(out.match(/unicode-range/g)).toHaveLength(1);
  });

  it('exportPageHtml: gaya dasar harness, font, CSS, lalu markup di #root (dibungkus #wrap bila ada)', () => {
    const plain = exportPageHtml({ css: '.a{}', fonts: '@font-face{}', body: '<div class="a"></div>' });
    expect(plain).toContain('<style>html,body{margin:0;padding:0;background:transparent}</style><style>@font-face{}</style><style>.a{}</style>');
    expect(plain).toContain('<div id="root"><div class="a"></div></div>');
    const wrapped = exportPageHtml({ css: '', fonts: '', body: '<i></i>', wrapperStyle: 'display:flex' });
    expect(wrapped).toContain('<div id="root"><div id="wrap" style="display:flex"><i></i></div></div>');
  });
});

describe('mutasi dokumen', () => {
  const doc = {
    tokens: { 'colors.a': { type: 'color', value: '#000000', modes: { dark: '#111111' } } as { value: unknown; modes?: Record<string, unknown> } },
    pages: [
      {
        children: [
          {
            id: 'Board001',
            fills: [{ type: 'mesh' }, { type: 'solid', color: '#FFFFFF' }],
            children: [{ id: 'Frame001', children: [{ id: 'Mast0001', name: 'Card', component: { props: [], slots: [] } }] }],
          },
        ],
      },
    ],
  };

  it('withoutMeshFills membuang lapisan mesh saja, tanpa mengubah aslinya', () => {
    const out = withoutMeshFills(doc);
    expect(out.pages[0]!.children[0]!.fills).toEqual([{ type: 'solid', color: '#FFFFFF' }]);
    expect(doc.pages[0]!.children[0]!.fills).toHaveLength(2);
  });

  it('withDefaultInstance menyisipkan instance default sebagai anak pertama parent master', () => {
    const out = withDefaultInstance(doc, 'Mast0001');
    expect(out.pages[0]!.children[0]!.children[0]!.children[0]).toEqual({ type: 'instance', id: DEFAULT_INSTANCE_ID, name: 'Card / default', componentId: 'Mast0001' });
    expect(out.pages[0]!.children[0]!.children[0]!.children).toHaveLength(2);
    expect(doc.pages[0]!.children[0]!.children[0]!.children).toHaveLength(1);
    expect(() => withDefaultInstance(doc, 'Nope0001')).toThrow(/tidak ada/);
  });

  it('withTokenValues mengganti value dan menggabung modes; token asing → Error', () => {
    const out = withTokenValues(doc, { 'colors.a': { value: '#FF0000', modes: { hc: '#00FF00' } } });
    expect(out.tokens['colors.a']).toEqual({ type: 'color', value: '#FF0000', modes: { dark: '#111111', hc: '#00FF00' } });
    expect(doc.tokens['colors.a']!.value).toBe('#000000');
    expect(() => withTokenValues(doc, { 'colors.b': { value: '#FFFFFF' } })).toThrow(/colors.b/);
  });
});

describe('regresi sengaja', () => {
  it('dropPadding membuang padding modul CSS dan kelas p-[…] Tailwind (termasuk di template akar komponen)', () => {
    const r = dropPadding([
      { path: 'A.module.css', contents: '.a {\n  padding: 8px 16px;\n  padding-top: 2px;\n}\n' },
      { path: 'A.tsx', contents: '<div className="flex p-[8px_16px] gap-[4px]"><div className={`p-[2px] ${className ?? \'\'}`.trimEnd()} /></div>' },
      { path: 'tokens.css', contents: ':root {\n  padding: 1px;\n}\n' },
    ]);
    expect(r.removed).toBe(3);
    expect(r.files[0]!.contents).toBe('.a {\n  padding-top: 2px;\n}\n');
    expect(r.files[1]!.contents).toBe('<div className="flex p-[0px] gap-[4px]"><div className={`p-[0px] ${className ?? \'\'}`.trimEnd()} /></div>');
    expect(r.files[2]!.contents).toBe(':root {\n  padding: 1px;\n}\n');
  });
});
