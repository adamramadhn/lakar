// Model murni dialog Export code: opsi → codegen, baris file, ukuran, meta, nama zip, dan pewarnaan.
import { describe, expect, it } from 'vitest';
import { generateCode } from '@lakar/codegen';
import type { IconGlyph, LakarDocument } from '@lakar/schema';
import { DEFAULT_SETTINGS, exportCode, fileMeta, fileRows, filesSummary, findStoredNode, formatBytes, glyphKeys, highlight, nodeKindLabel, zipName, type Tok } from './codeExport.js';

const BOARD = 'Board001';
const doc = {
  schemaVersion: 8,
  id: 'Doc00001',
  rev: 7,
  tokens: { 'colors.brand': { type: 'color', value: '#0E7490' } },
  pages: [
    {
      id: 'Page0001',
      name: 'Page',
      children: [
        {
          type: 'board',
          id: BOARD,
          name: 'Hero — Desktop',
          x: 0,
          y: 0,
          width: 400,
          height: 300,
          screen: 'landing',
          children: [
            {
              type: 'frame',
              id: 'Mast0001',
              name: 'Card',
              layout: 'column',
              fills: [{ type: 'solid', color: { $token: 'colors.brand' } }],
              component: { props: [], slots: [] },
              children: [{ type: 'icon', id: 'Icon0001', name: 'Star', lib: 'lucide', icon: 'star', size: 16 }],
            },
            { type: 'instance', id: 'Inst0001', name: 'Card 2', componentId: 'Mast0001' },
          ],
        },
      ],
    },
  ],
} as unknown as LakarDocument;

const star: IconGlyph = { lib: 'lucide', icon: 'star', viewBox: [0, 0, 24, 24], kind: 'stroke', nodes: [['path', { d: 'M1 1h2' }]] };

describe('ekspor', () => {
  it('glyph diminta dari dokumen ter-ekspansi; hasil = generateCode dengan glyph yang sama', async () => {
    expect(glyphKeys(doc, BOARD, DEFAULT_SETTINGS)).toEqual(['lucide/star']);
    const asked: string[][] = [];
    const r = await exportCode(doc, BOARD, DEFAULT_SETTINGS, async (keys) => (asked.push(keys), [star]));
    expect(asked).toEqual([['lucide/star']]);
    expect(r).toEqual(generateCode(doc, { nodeId: BOARD, target: 'react-tailwind', icons: [star] }));
    const css = await exportCode(doc, BOARD, { ...DEFAULT_SETTINGS, target: 'react-css', tokens: false, typescript: false }, async () => []);
    expect(css.files.map((f) => f.path)).toEqual(['HeroDesktop.jsx', 'HeroDesktop.module.css', 'components/Card.jsx', 'components/Card.module.css']);
    expect(css.warnings.some((w) => w.code === 'icon-glyph-missing')).toBe(true);
  });

  it('baris file: folder components/ sebelum komponen, menjorok; ikon per jenis', async () => {
    const r = await exportCode(doc, BOARD, { ...DEFAULT_SETTINGS, target: 'react-css' }, async () => [star]);
    const rows = fileRows(r.files);
    expect(rows.map((x) => (x.kind === 'folder' ? `[${x.name}]` : `${x.nested ? '  ' : ''}${x.name}:${x.icon}`))).toEqual([
      'HeroDesktop.tsx:fileCode',
      'HeroDesktop.module.css:fileType',
      '[components/]',
      '  Card.tsx:component',
      '  Card.module.css:fileType',
      'tokens.css:palette',
    ]);
    expect(zipName(r.files, 'react-css')).toBe('HeroDesktop-react-css.zip');
    expect(filesSummary(r.files)).toMatch(/^5 files · \d+\.\d KB$/);
  });

  it('ukuran, meta, jenis node', () => {
    expect([formatBytes(0), formatBytes(99), formatBytes(3174), formatBytes(2 * 1024 * 1024)]).toEqual(['0 B', '99 B', '3.1 KB', '2.0 MB']);
    expect(filesSummary([{ path: 'a.tsx', contents: 'x' }])).toBe('1 file · 1 B');
    expect(fileMeta('HeroDesktop.tsx', 'react-tailwind')).toBe('TSX · Tailwind v4');
    expect(fileMeta('HeroDesktop.jsx', 'react-css')).toBe('JSX · CSS Modules');
    expect(fileMeta('HeroDesktop.module.css', 'react-css')).toBe('CSS Modules');
    expect(fileMeta('tokens.css', 'react-css')).toBe('CSS variables');
    expect(fileMeta('theme.css', 'react-tailwind')).toBe('Tailwind v4 theme');
    expect(nodeKindLabel(findStoredNode(doc, BOARD)!)).toBe('Board');
    expect(nodeKindLabel(findStoredNode(doc, 'Mast0001')!)).toBe('Component');
    expect(nodeKindLabel(findStoredNode(doc, 'Inst0001')!)).toBe('Instance');
    expect(findStoredNode(doc, 'Nope0000')).toBeUndefined();
  });
});

const kinds = (toks: Tok[]) => toks.filter((t) => t.text.trim()).map((t) => `${t.kind}:${t.text.trim()}`);

describe('highlight', () => {
  it('TSX: keyword, string, tag, atribut, tanda baca; teks baris utuh', () => {
    const src = 'import { Card } from "./components/Card";\n  return <div className="p-[8px]">{label}</div>;\n';
    const lines = highlight('Main.tsx', src);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.map((t) => t.text).join(''))).toEqual(src.slice(0, -1).split('\n'));
    expect(kinds(lines[0]!)).toEqual(['keyword:import', 'punct:{', 'plain:Card', 'punct:}', 'keyword:from', 'string:"./components/Card"', 'punct:;']);
    expect(kinds(lines[1]!)).toContain('selector:div');
    expect(kinds(lines[1]!)).toContain('prop:className');
    expect(kinds(lines[1]!)).toContain('string:"p-[8px]"');
    expect(kinds(highlight('a.tsx', '// Generated by Lakar')[0]!)).toEqual(['comment:// Generated by Lakar']);
  });

  it('CSS: selektor, properti, var()/hex sebagai nilai berwarna, at-rule', () => {
    const src = ':root {\n  --colors-bg: #FFFFFF;\n}\n[data-theme="dark"] {\n  gap: var(--space-4);\n}\n@theme inline {\n  --color-bg: var(--colors-bg);\n}\n';
    const l = highlight('tokens.css', src);
    expect(kinds(l[0]!)).toEqual(['selector::root', 'punct:{']);
    expect(kinds(l[1]!)).toEqual(['prop:--colors-bg', 'punct::', 'string:#FFFFFF', 'punct:;']);
    expect(kinds(l[3]!)).toEqual(['selector:[data-theme="dark"]', 'punct:{']);
    expect(kinds(l[4]!)).toEqual(['prop:gap', 'punct::', 'string:var(--space-4)', 'punct:;']);
    expect(kinds(l[6]!)[0]).toBe('keyword:@theme');
    expect(kinds(l[7]!)[0]).toBe('prop:--color-bg');
    expect(l.map((x) => x.map((t) => t.text).join(''))).toEqual(src.slice(0, -1).split('\n'));
  });
});
