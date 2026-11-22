// Tes unit komponen di codegen (spec kode-3): master → komponen React, instance → pemakaian, selisih akar per
// keluarga shorthand, varian prop, dan jalur inline. Murni, tanpa IO; korpus + typecheck ada di tests/codegen.test.ts.
import { describe, expect, it } from 'vitest';
import type { LakarDocument } from '@lakar/schema';
import { applySite, buildTree, evalNodes, exportModel, family, generateCode, sameTree, siteDiff, type CodeElement } from './index.js';
import { condExpr, fixed, lookupExpr, type Driver, type Varying } from './jsx.js';

type AnyNode = Record<string, unknown>;
const BOARD = 'Board001';

function doc(children: AnyNode[], board: AnyNode = {}): LakarDocument {
  return {
    schemaVersion: 5,
    id: 'Doc00001',
    rev: 1,
    tokenModes: ['light', 'dark'],
    pages: [{ id: 'Page0001', name: 'Page', children: [{ type: 'board', id: BOARD, name: 'Page', x: 0, y: 0, width: 400, height: 300, screen: 'landing', children, ...board }] }],
  } as unknown as LakarDocument;
}

const frame = (id: string, extra: AnyNode = {}, children: AnyNode[] = []): AnyNode => ({ type: 'frame', id, name: id, children, ...extra });
const text = (id: string, content: string, extra: AnyNode = {}): AnyNode => ({ type: 'text', id, name: id, content, size: 16, ...extra });
const inst = (id: string, extra: AnyNode = {}): AnyNode => ({ type: 'instance', id, name: id, componentId: 'Mast0001', ...extra });
const file = (d: LakarDocument, path: string, target: 'react-css' | 'react-tailwind' = 'react-css', nodeId = BOARD) =>
  generateCode(d, { nodeId, target }).files.find((f) => f.path === path)?.contents ?? '';

/** Master Button: teks Label (prop text `label`), prop boolean `bold` → weight? (tidak), enum `tone` → align teks. */
const button = (component: AnyNode = {}, extra: AnyNode = {}) =>
  frame(
    'Mast0001',
    {
      name: 'Button',
      layout: 'row',
      padding: 8,
      width: 120,
      fills: [{ type: 'solid', color: '#0E7490' }],
      component: { props: [{ name: 'label', type: 'text', default: 'Click', binds: [{ nodeId: 'Labl0001', prop: 'content' }] }], slots: [], ...component },
      ...extra,
    },
    [text('Labl0001', 'Click', { color: '#FFFFFF' })],
  );

/** Pohon efektif ekspor (komponen dievaluasi) = pohon inline. */
function equivalent(d: LakarDocument, nodeId = BOARD): boolean {
  const m = exportModel(d, { nodeId });
  return sameTree(evalNodes([m.root!])[0] as CodeElement, buildTree(d, { nodeId }, []).root, false);
}

describe('keluarga shorthand dan selisih akar', () => {
  it('family: gap/flex/flex-flow/background/margin', () => {
    expect(family('column-gap')).toBe('gap');
    expect(family('flex-basis')).toBe('flex');
    expect(family('flex-direction')).toBe('flex-flow');
    expect(family('background-color')).toBe('background');
    expect(family('margin')).toBe('margin');
    expect(family('border-radius')).toBe('border-radius');
    expect(family('border-top')).toBe('border');
    expect(family('width')).toBe('width');
  });

  it('siteDiff: keluarga berbeda ditulis utuh; unset dulu; important bila komponen juga menulis', () => {
    const own: [string, string][] = [['gap', '8px'], ['column-gap', '4px'], ['flex', '0 0 auto'], ['width', '120px']];
    const actual: [string, string][] = [['gap', '2px'], ['flex', '0 0 120px'], ['width', '120px'], ['left', '4px']];
    const site = siteDiff(actual, own);
    expect(site).toEqual([
      ['column-gap', 'unset', true],
      ['gap', '2px', true],
      ['flex', '0 0 120px', true],
      ['left', '4px', false],
    ]);
    expect(applySite(own, site)).toEqual([['width', '120px'], ['gap', '2px'], ['flex', '0 0 120px'], ['left', '4px']]);
  });

  it('siteDiff: tidak ada selisih → kosong', () => {
    expect(siteDiff([['width', '1px']], [['width', '1px']])).toEqual([]);
  });
});

describe('ekspresi varian', () => {
  const tone: Driver = { name: 'tone', values: ['a', 'b-c'] };
  const show: Driver = { name: 'show', values: [true, false] };
  it('lookup: ternary boolean, objek enum, kunci gabungan', () => {
    const b: Varying<string> = { drivers: [show], table: new Map([['true', 'X'], ['false', 'Y']]) };
    expect(lookupExpr(b, (s) => s)).toBe('show ? X : Y');
    const e: Varying<string> = { drivers: [tone], table: new Map([['"a"', 'X'], ['"b-c"', 'Y']]) };
    expect(lookupExpr(e, (s) => s)).toBe('{ a: X, "b-c": Y }[tone]');
    const both: Varying<string> = { drivers: [tone, show], table: new Map([['"a",true', '1'], ['"a",false', '2'], ['"b-c",true', '3'], ['"b-c",false', '4']]) };
    expect(lookupExpr(both, (s) => s)).toBe('{ a: (show ? 1 : 2), "b-c": (show ? 3 : 4) }[tone]');
    expect(lookupExpr(fixed('Z'), (s) => s)).toBe('Z');
    // Opsi berisi `|` atau `__proto__` tidak bentrok/tidak mengganti prototipe.
    const odd: Driver = { name: 'k', values: ['a|b', '__proto__'] };
    expect(lookupExpr({ drivers: [odd], table: new Map([['"a|b"', 'X'], ['"__proto__"', 'Y']]) }, (s) => s)).toBe('{ "a|b": X, ["__proto__"]: Y }[k]');
  });

  it('kondisi: boolean, negasi, enum, gabungan', () => {
    expect(condExpr({ drivers: [show], table: new Map([['true', true], ['false', false]]) })).toBe('show');
    expect(condExpr({ drivers: [show], table: new Map([['true', false], ['false', true]]) })).toBe('!show');
    expect(condExpr({ drivers: [tone], table: new Map([['"a"', true], ['"b-c"', false]]) })).toBe('tone === "a"');
    expect(condExpr({ drivers: [tone, show], table: new Map([['"a",true', true], ['"a",false', false], ['"b-c",true', true], ['"b-c",false', false]]) })).toBe(
      '(tone === "a" && show) || (tone === "b-c" && show)',
    );
  });
});

describe('generateCode dengan komponen', () => {
  it('master di canvas + instance default di parent kolom → <Button /> tanpa kelas; komponen berprops bertipe', () => {
    const d = doc([button(), inst('Inst0001')]);
    const main = file(d, 'Page.tsx');
    expect(main).toContain("import { Button } from './components/Button';");
    expect(main.match(/<Button \/>/g)).toHaveLength(2);
    const comp = file(d, 'components/Button.tsx');
    expect(comp).toContain('export type ButtonProps = {\n  label?: string;\n  className?: string;\n  style?: CSSProperties;\n};');
    expect(comp).toContain('export function Button({ label = "Click", className, style }: ButtonProps) {');
    expect(comp).toContain("<div className={`${styles.button}${className ? ` ${className}` : ''}`} style={style}>");
    expect(comp).toContain('{label}');
    expect(equivalent(d)).toBe(true);
  });

  it('prop text dan override content node terikat → prop; override akar → kelas !important', () => {
    const d = doc([
      button(),
      inst('Inst0001', { props: { label: 'Buy' } }),
      inst('Inst0002', { overrides: { Labl0001: { content: 'Over' } } }),
      inst('Inst0003', { name: 'Red', overrides: { Mast0001: { fills: [{ type: 'solid', color: '#FF0000' }] } } }),
    ]);
    const main = file(d, 'Page.tsx');
    expect(main).toContain('<Button label="Buy" />');
    expect(main).toContain('<Button label="Over" />');
    expect(main).toContain('<Button className={styles.red} />');
    expect(file(d, 'Page.module.css')).toContain('.red {\n  background-color: #FF0000 !important;\n}');
    expect(file(d, 'Page.tsx', 'react-tailwind')).toContain('<Button className="bg-[#FF0000]!" />');
    expect(equivalent(d)).toBe(true);
  });

  it('parent row dan absolute → selisih penempatan di kelas pemakai', () => {
    const d = doc([button(), frame('Row00001', { layout: 'row' }, [inst('Inst0001', { name: 'InRow' })]), frame('Free0001', { layout: 'none', width: 200, height: 50 }, [inst('Inst0002', { name: 'Free', position: 'absolute', x: 5, y: 6 })])]);
    const css = file(d, 'Page.module.css');
    expect(css).toContain('.inRow {\n  flex: 0 0 120px !important;\n}');
    expect(css).toContain('.free {\n  position: absolute !important;\n  left: 5px;\n  top: 6px;\n  height: max-content;\n}');
    expect(equivalent(d)).toBe(true);
  });

  it('enum → kelas per varian; boolean visible → kehadiran bersyarat; boolean visible di akar → return null', () => {
    const d = doc([
      button(
        {
          props: [
            { name: 'label', type: 'text', default: 'Click', binds: [{ nodeId: 'Labl0001', prop: 'content' }] },
            { name: 'tone', type: 'enum', options: ['start', 'center'], default: 'start', binds: [{ nodeId: 'Mast0001', prop: 'justify' }] },
            { name: 'showIcon', type: 'boolean', default: true, binds: [{ nodeId: 'Rect0001', prop: 'visible' }] },
            { name: 'shown', type: 'boolean', default: true, binds: [{ nodeId: 'Mast0001', prop: 'visible' }] },
          ],
        },
        {},
      ),
      inst('Inst0001', { props: { tone: 'center', showIcon: false } }),
      inst('Inst0002', { props: { shown: false } }),
    ]);
    // Tambah rect ikon ke master.
    const master = (d.pages[0]!.children[0]!.children[0] as { children: AnyNode[] }).children;
    master.push({ type: 'rect', id: 'Rect0001', name: 'Dot', width: 8, height: 8, fills: [{ type: 'solid', color: '#FFFFFF' }] });
    const comp = file(d, 'components/Button.tsx');
    expect(comp).toContain('tone?: "start" | "center";');
    expect(comp).toContain('{ start: styles.button, center: styles.button2 }[tone]');
    expect(comp).toContain('{showIcon && (');
    expect(comp).toContain('  if (!(shown)) return null;\n');
    expect(file(d, 'Page.tsx')).toContain('<Button tone="center" showIcon={false} />');
    expect(equivalent(d)).toBe(true);
  });

  it('enum ke content teks → teks bervarian (lookup)', () => {
    const d = doc([
      button({ props: [{ name: 'size', type: 'enum', options: ['S', 'L'], default: 'S', binds: [{ nodeId: 'Labl0001', prop: 'content' }] }] }),
      inst('Inst0001', { props: { size: 'L' } }),
    ]);
    expect(file(d, 'components/Button.tsx')).toContain('{{ S: "S", L: "L" }[size]}');
    expect(file(d, 'Page.tsx')).toContain('<Button size="L" />');
    expect(equivalent(d)).toBe(true);
  });

  it('slot: isi tersimpan dan override isi default → prop ReactNode', () => {
    const master = frame('Mast0001', { name: 'Card', layout: 'column', component: { props: [], slots: [{ name: 'body', nodeId: 'Body0001' }] } }, [
      frame('Body0001', { layout: 'column', width: 'fill' }, [text('Dflt0001', 'Default')]),
    ]);
    const d = doc([
      master,
      inst('Inst0001', { name: 'Filled', slots: { body: [text('Slot0001', 'Custom')] } }),
      inst('Inst0002', { name: 'Tinted', overrides: { Dflt0001: { color: '#FF0000' } } }),
      inst('Inst0003', { name: 'Plain' }),
    ]);
    const main = file(d, 'Page.tsx');
    expect(main).toContain('<Card\n        body={\n          <div className={styles.slot0001}>\n            Custom\n          </div>\n        }\n      />');
    expect(main).toContain('Default');
    expect(main.match(/<Card \/>/g)).toHaveLength(2);
    expect(file(d, 'components/Card.tsx')).toContain('{body ?? (');
    expect(file(d, 'components/Card.tsx')).toContain('body?: ReactNode;');
    expect(equivalent(d)).toBe(true);
  });

  it('override tak terekspresi → inline + warning instance-inlined', () => {
    const d = doc([button(), inst('Inst0001', { name: 'Odd', overrides: { Labl0001: { size: 30 } } })]);
    const r = generateCode(d, { nodeId: BOARD, target: 'react-css' });
    expect(r.warnings).toContainEqual({ code: 'instance-inlined', nodeId: 'Inst0001', message: 'Instance "Odd" differs from component "Button" in ways props, slots, and root classes can\'t express; exported inline.' });
    expect(r.files[0]!.contents).toContain('Click');
    expect(equivalent(d)).toBe(true);
  });

  it('prop text yang mengikat properti selain content → tidak diekspor + warning prop-unsupported', () => {
    const d = doc([button({ props: [{ name: 'tint', type: 'text', default: '#FFFFFF', binds: [{ nodeId: 'Labl0001', prop: 'color' }] }] }), inst('Inst0001')]);
    const r = generateCode(d, { nodeId: BOARD, target: 'react-css' });
    expect(r.warnings.map((w) => w.code)).toContain('prop-unsupported');
    expect(r.files.find((f) => f.path === 'components/Button.tsx')!.contents).not.toContain('tint');
  });

  it('kombinasi > 64 per elemen → komponen tidak diekspor, instance di-inline + warning', () => {
    const opts = (p: string) => Array.from({ length: 9 }, (_, i) => `${p}${i}`);
    const colors = Array.from({ length: 9 }, (_, i) => `#00000${i}`);
    const d = doc([
      button({
        props: [
          { name: 'a', type: 'enum', options: opts('a'), default: 'a0', binds: [{ nodeId: 'Labl0001', prop: 'content' }] },
          { name: 'b', type: 'enum', options: colors, default: colors[0], binds: [{ nodeId: 'Labl0001', prop: 'color' }] },
        ],
      }),
      inst('Inst0001'),
    ]);
    const r = generateCode(d, { nodeId: BOARD, target: 'react-css' });
    expect(r.files.map((f) => f.path)).toEqual(['Page.tsx', 'Page.module.css', 'tokens.css']);
    expect(r.warnings.map((w) => w.code)).toContain('component-too-complex');
  });

  it('akar ekspor instance dengan data-theme → inline; nodeId instance tanpa mode → pemakaian', () => {
    const d = doc([button(), inst('Inst0001', { name: 'Solo' })]);
    expect(file(d, 'Solo.tsx', 'react-css', 'Inst0001')).toContain('<Button />');
    const dark = doc([button(), inst('Inst0001', { name: 'Solo' })], { themeMode: 'dark' });
    expect(file(dark, 'Solo.tsx', 'react-css', 'Inst0001')).toContain('data-theme="dark"');
  });

  it('interaksi prop: node yang hanya hadir bila dua prop non-default, dan warna yang hanya berlaku saat node itu hadir', () => {
    const master = frame(
      'Mast0001',
      {
        name: 'Panel',
        layout: 'column',
        component: {
          props: [
            { name: 'open', type: 'boolean', default: false, binds: [{ nodeId: 'Body0001', prop: 'visible' }] },
            { name: 'extra', type: 'boolean', default: false, binds: [{ nodeId: 'More0001', prop: 'visible' }] },
            { name: 'tone', type: 'enum', options: ['#111111', '#EE0000'], default: '#111111', binds: [{ nodeId: 'More0001', prop: 'color' }] },
          ],
          slots: [],
        },
      },
      [frame('Body0001', { layout: 'column' }, [text('More0001', 'More', { color: '#111111' })])],
    );
    const d = doc([master, inst('Inst0001', { name: 'Both', props: { open: true, extra: true, tone: '#EE0000' } })]);
    const comp = file(d, 'components/Panel.tsx');
    expect(comp).toContain('More');
    expect(file(d, 'Page.tsx')).toContain('<Panel open={true} extra={true} tone="#EE0000" />');
    expect(equivalent(d)).toBe(true);
    // Komponen benar untuk kombinasi yang tidak dipakai dokumen: evaluasi model = ekspansi instance dengan props itu.
    for (const props of [{ open: true, extra: true }, { open: true, extra: false, tone: '#EE0000' }]) {
      const probe = doc([master, inst('Inst0002', { name: 'Probe', props })]);
      expect(equivalent(probe)).toBe(true);
      expect(file(probe, 'Page.tsx')).toContain('<Panel ');
    }
  });

  it('nama prop/slot cadangan (style, default) → tidak diekspor + prop-unsupported; instance bernilai lain di-inline', () => {
    const d = doc([
      button({
        props: [
          { name: 'label', type: 'text', default: 'Click', binds: [{ nodeId: 'Labl0001', prop: 'content' }] },
          { name: 'style', type: 'enum', options: ['start', 'center'], default: 'start', binds: [{ nodeId: 'Mast0001', prop: 'justify' }] },
        ],
      }),
      inst('Inst0001', { name: 'Centered', props: { style: 'center' } }),
    ]);
    const r = generateCode(d, { nodeId: BOARD, target: 'react-css' });
    expect(r.warnings.map((w) => w.code)).toEqual(['prop-unsupported']);
    // Prop tidak diekspor; selisihnya hanya di akar → kelas pemakai.
    expect(r.files[0]!.contents).toContain('<Button className={styles.centered} />');
    const comp = r.files.find((f) => f.path === 'components/Button.tsx')!.contents;
    expect(comp).toContain('export function Button({ label = "Click", className, style }: ButtonProps)');
    expect(equivalent(d)).toBe(true);
  });

  it('dua master bernama sama → Button dan Button2; instance bersarang yang tak terekspresi di komponen → warning', () => {
    const other = frame('Mast0002', { name: 'Button', layout: 'row', component: { props: [], slots: [] } }, [
      { type: 'instance', id: 'InsB0001', name: 'Inner', componentId: 'Mast0001', overrides: { Labl0001: { size: 30 } } },
    ]);
    const d = doc([button(), other, { type: 'instance', id: 'Inst0002', name: 'Use2', componentId: 'Mast0002' }]);
    const r = generateCode(d, { nodeId: BOARD, target: 'react-css' });
    expect(r.files.map((f) => f.path)).toEqual(expect.arrayContaining(['components/Button.tsx', 'components/Button2.tsx']));
    expect(r.warnings).toContainEqual(expect.objectContaining({ code: 'instance-inlined', nodeId: 'InsB0001' }));
    expect(equivalent(d)).toBe(true);
  });

  it('akar komponen dengan nilai backtick/`$` (Tailwind) → style digabung, bukan kelas di template', () => {
    const master = text('Mast0001', 'Hi', { name: 'Label', family: 'Cash$Sans', component: { props: [], slots: [] } });
    const comp = file(doc([master, inst('Inst0001')]), 'components/Label.tsx', 'react-tailwind');
    expect(comp).toContain('style={{ ...{ fontFamily: ');
    expect(comp).not.toContain('[font-family:');
  });

  it('deterministik dan components:false tetap story 2', () => {
    const d = doc([button(), inst('Inst0001', { props: { label: 'Buy' } })]);
    expect(generateCode(d, { nodeId: BOARD, target: 'react-tailwind' })).toEqual(generateCode(structuredClone(d), { nodeId: BOARD, target: 'react-tailwind' }));
    expect(generateCode(d, { nodeId: BOARD, target: 'react-css', components: false }).files.map((f) => f.path)).toEqual(['Page.tsx', 'Page.module.css', 'tokens.css']);
  });
});
