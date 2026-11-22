// Tes @lakar/codegen atas korpus (spec kode-2): golden deterministik per dokumen/target, deklarasi CSS sama dengan
// css.ts, var() token sama dengan Copy as, pulang-pergi tokens.css lewat parseCssVariables, dan typecheck TSX.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDocument } from '../packages/core/src/index.ts';
import { IconCatalog } from '../packages/icons/src/index.ts';
import { expandInstances, type ExpandedChildNode, type IconGlyph, type LakarDocument } from '../packages/schema/src/index.ts';
import {
  boxPaintDecls,
  childLayoutDecls,
  codeBackgroundDecls,
  dropShadowFilterList,
  effectDecls,
  fontFamilyCss,
  frameDecls,
  frameLayout,
  radiusCss,
  strokeOverlayDecls,
  textDecls,
  type CssDecl,
  type ParentLayout,
} from '../packages/render/src/css.ts';
import { ellipseShape } from '../packages/render/src/shape.ts';
import { parseCssVariables } from '../packages/render/src/css-vars.ts';
import {
  assignClassNames,
  buildTree,
  declToTailwind,
  evalComponent,
  evalNodes,
  exportModel,
  fullProps,
  generateCode,
  iconRefs,
  mergeDecls,
  needsInlineStyle,
  sameTree,
  tailwindClasses,
  tokensCss,
  type CodeElement,
  type CodegenTarget,
} from '../packages/codegen/src/index.ts';
import { copyAs } from '../packages/viewer/src/copyas.ts';
import { loadDocCorpus } from './support/doc-corpus.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const TARGETS: readonly CodegenTarget[] = ['react-css', 'react-tailwind'];

const corpus = loadDocCorpus().map((d) => ({ label: `v${d.version}-${d.name}`, doc: parseDocument(d.raw) as LakarDocument }));

type Walked = { n: ExpandedChildNode; layout: ParentLayout; scrollY: number; negativeGap: number | undefined };

/** Semua node ter-ekspansi board `boardId` beserta konteks parent (urutan pohon, gap negatif seperti render). */
function walkBoard(doc: LakarDocument, boardId: string): Walked[] {
  const b = expandInstances(doc).pages.flatMap((p) => p.children).find((x) => x.id === boardId)!;
  const out: Walked[] = [];
  const walk = (nodes: readonly ExpandedChildNode[], layout: ParentLayout, scrollY: number, gap: unknown) => {
    let flow = 0;
    for (const n of nodes) {
      let negativeGap: number | undefined;
      if (typeof gap === 'number' && gap < 0 && (layout === 'row' || layout === 'column') && n.position !== 'absolute') {
        if (flow > 0) negativeGap = gap;
        flow++;
      }
      out.push({ n, layout, scrollY, negativeGap });
      if (n.type === 'frame') walk(n.children, frameLayout(n), n.scrollY ?? 0, n.gap);
    }
  };
  walk(b.children, 'column', 0, undefined);
  return out;
}

/** Glyph semua ikon yang dipakai dokumen sesudah ekspansi instance (termasuk override ikon), dari katalog asli. */
function glyphsOf(doc: LakarDocument): IconGlyph[] {
  const refs = expandInstances(doc)
    .pages.flatMap((p) => p.children)
    .flatMap((b) => walkBoard(doc, b.id))
    .flatMap(({ n }) => (n.type === 'icon' ? [{ lib: n.lib, icon: n.icon }] : []));
  return IconCatalog.load().glyphs(refs);
}

/** Glyph yang diminta ekspor satu node dengan komponen (termasuk varian enum), lewat `iconRefs`. */
const glyphsFor = (doc: LakarDocument, nodeId: string): IconGlyph[] => IconCatalog.load().glyphs(iconRefs(doc, { nodeId }));

const boards = (doc: LakarDocument) => doc.pages.flatMap((p) => p.children);

/** Fixture komponen (master, instance ber-override, slot, row/absolute) khusus tes codegen. */
const fixture = parseDocument(JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'codegen', 'komponen.lakar.json'), 'utf8'))) as LakarDocument;
const docs = [...corpus, { label: 'komponen', doc: fixture }];

/** Semua keluaran satu dokumen untuk satu target, digabung per board dengan pemisah berkas. `components:false` = story 2. */
function bundle(doc: LakarDocument, target: CodegenTarget, components: boolean): string {
  const all = glyphsOf(doc);
  return boards(doc)
    .map((b) => {
      const r = generateCode(doc, { nodeId: b.id, target, icons: components ? glyphsFor(doc, b.id) : all, components });
      const files = r.files.map((f) => `----- ${f.path} -----\n${f.contents}`).join('\n');
      const warnings = r.warnings.map((w) => `${w.code} ${w.nodeId ?? '-'}: ${w.message}`).join('\n');
      return `===== board ${b.id} (${b.name}) =====\n${files}${warnings ? `\n----- warnings -----\n${warnings}\n` : ''}`;
    })
    .join('\n');
}

describe('codegen: golden korpus', () => {
  it('korpus tidak kosong', () => {
    expect(corpus.length).toBeGreaterThan(0);
  });

  it.each(corpus.flatMap((c) => TARGETS.map((t): [string, CodegenTarget, LakarDocument] => [c.label, t, c.doc])))('%s %s components:false: deterministik dan sama dengan golden story 2', async (label, target, doc) => {
    const a = bundle(doc, target, false);
    expect(bundle(structuredClone(doc), target, false)).toBe(a);
    await expect(a).toMatchFileSnapshot(join(root, 'tests', 'fixtures', 'codegen', `${label}.${target}.txt`));
  });

  const withComponents = (d: LakarDocument) => JSON.stringify(d).includes('"componentId"');
  it.each(docs.filter((c) => withComponents(c.doc)).flatMap((c) => TARGETS.map((t): [string, CodegenTarget, LakarDocument] => [c.label, t, c.doc])))(
    '%s %s dengan komponen: deterministik dan sama dengan golden',
    async (label, target, doc) => {
      const a = bundle(doc, target, true);
      expect(bundle(structuredClone(doc), target, true)).toBe(a);
      await expect(a).toMatchFileSnapshot(join(root, 'tests', 'fixtures', 'codegen', `${label}.${target}.components.txt`));
    },
  );

  it.each(corpus.filter((c) => !withComponents(c.doc)).flatMap((c) => TARGETS.map((t): [string, CodegenTarget, LakarDocument] => [c.label, t, c.doc])))(
    '%s %s tanpa komponen: keluaran default identik byte dengan components:false',
    (_label, target, doc) => {
      expect(bundle(doc, target, true)).toBe(bundle(doc, target, false));
    },
  );
});

/** Pohon efektif ekspor dengan komponen: berkas utama dievaluasi (komponen dengan props, kelas pemakai, slot). */
function effectiveTree(doc: LakarDocument, nodeId: string, icons: readonly IconGlyph[]): CodeElement {
  const m = exportModel(doc, { nodeId, icons });
  if (m.main) return evalComponent(m.main, fullProps(m.main, []), new Map())!;
  return evalNodes([m.root!])[0] as CodeElement;
}

describe('codegen: komponen setara dengan inline (story 2)', () => {
  it.each(docs.map((c): [string, LakarDocument] => [c.label, c.doc]))('%s: setiap board, setiap master, dan setiap instance', (_label, doc) => {
    const nodes = boards(doc).flatMap((b) => [b.id, ...walkBoard(doc, b.id).filter(({ n }) => !n.id.includes('/') && (n as { component?: unknown }).component !== undefined).map(({ n }) => n.id)]);
    const stored: string[] = [];
    const walk = (list: readonly { id: string; type: string; children?: unknown }[]) => {
      for (const x of list) {
        if (x.type === 'instance') stored.push(x.id);
        if (Array.isArray(x.children)) walk(x.children);
      }
    };
    for (const p of doc.pages) for (const b of p.children) walk(b.children);
    for (const id of [...nodes, ...stored]) {
      const icons = glyphsFor(doc, id);
      const inline = buildTree(doc, { nodeId: id, icons }, []).root;
      expect(sameTree(effectiveTree(doc, id, icons), inline, false), id).toBe(true);
    }
  });
});

describe('codegen: fixture komponen', () => {
  const files = (target: CodegenTarget, d: LakarDocument = fixture) =>
    Object.fromEntries(generateCode(d, { nodeId: 'BrdCgK01', target, icons: glyphsFor(d, 'BrdCgK01') }).files.map((f) => [f.path, f.contents]));

  it('satu berkas per komponen di components/, berkas utama mengimpor dan memakainya', () => {
    const css = files('react-css');
    expect(Object.keys(css)).toEqual(['Halaman.tsx', 'Halaman.module.css', 'components/Tombol.tsx', 'components/Tombol.module.css', 'components/Kartu.tsx', 'components/Kartu.module.css', 'tokens.css']);
    const main = css['Halaman.tsx']!;
    expect(main).toContain("import { Tombol } from './components/Tombol';");
    expect(main).toContain("import { Kartu } from './components/Kartu';");
    expect(main).toContain('<Kartu title="Promo" className={styles.kartuPromo} />');
    expect(main).toContain('<Kartu title="Diganti" />');
    expect(main).toContain('<Tombol label="Lanjut" showIcon={false} />');
    expect(css['Halaman.module.css']).toContain('.kartuPromo {\n  background-color: #FEF3C7 !important;\n}');
    expect(css['Halaman.module.css']).toContain('.tombolAbsolut {\n  position: absolute !important;');
    expect(css['components/Kartu.tsx']).toContain("import { Tombol } from './Tombol';");
    expect(css['components/Kartu.tsx']).toContain('{body ?? (');
    expect(css['components/Tombol.tsx']).toContain('export type TombolProps = {\n  label?: string;\n  showIcon?: boolean;\n  arah?: "row" | "column";');
    expect(css['components/Tombol.tsx']).toContain('{showIcon && (');
    const tw = files('react-tailwind');
    expect(Object.keys(tw)).toEqual(['Halaman.tsx', 'components/Tombol.tsx', 'components/Kartu.tsx', 'tokens.css', 'theme.css']);
    expect(tw['Halaman.tsx']).toContain('<Kartu title="Promo" className="bg-[#FEF3C7]!" />');
  });

  it('override yang tidak bisa dinyatakan → inline + warning; instance bersarang di dalamnya tetap dicoba', () => {
    const r = generateCode(fixture, { nodeId: 'BrdCgK01', target: 'react-css' });
    expect(r.warnings.filter((w) => w.code === 'instance-inlined').map((w) => w.nodeId)).toEqual(['InsKrt06', 'InsKrt06/InsTmb01']);
    // v5: Card / promo di-inline (override di dalam Badge bersarang), Badge di dalamnya tetap pemakaian dengan prop.
    const v5 = corpus.find((c) => c.label === 'v5-komponen-kartu')!.doc;
    const tsx = generateCode(v5, { nodeId: 'BrdKm001', target: 'react-css' }).files[0]!.contents;
    expect(tsx).toContain('<Badge label="Hemat" className={styles.badge} />');
    expect(tsx).toContain('<Card\n            showBadge={false}\n            tone="check"\n            body={');
  });

  it('mengubah master mengubah berkas komponen tanpa mengubah berkas utama', () => {
    // Tanpa instance yang memang di-inline (InsKrt06): isinya salinan master.
    const base = structuredClone(fixture);
    const daftar = base.pages[0]!.children[0]!.children[1] as { children: { id: string }[] };
    daftar.children = daftar.children.filter((c) => c.id !== 'InsKrt06');
    const files = (target: CodegenTarget, d: LakarDocument) =>
      Object.fromEntries(generateCode(d, { nodeId: 'BrdCgK01', target, icons: glyphsFor(d, 'BrdCgK01') }).files.map((f) => [f.path, f.contents]));
    const changed = structuredClone(base);
    const krt = (changed.pages[0]!.children[0]!.children[0] as { children: Record<string, unknown>[] }).children[1]!;
    krt.padding = 24;
    krt.fills = [{ type: 'solid', color: '#F9FAFB' }];
    for (const target of TARGETS) {
      const before = files(target, base);
      const after = files(target, changed);
      expect(after['components/Kartu.tsx'] !== before['components/Kartu.tsx'] || after['components/Kartu.module.css'] !== before['components/Kartu.module.css'], target).toBe(true);
      expect(after['Halaman.tsx'], target).toBe(before['Halaman.tsx']);
      expect(after['Halaman.module.css'], target).toBe(before['Halaman.module.css']);
    }
  });

  it('nodeId master → berkas utama adalah komponen itu; iconRefs memuat varian ikon', () => {
    const r = generateCode(fixture, { nodeId: 'MstKrt01', target: 'react-css' });
    expect(r.files.map((f) => f.path)).toEqual(['Kartu.tsx', 'Kartu.module.css', 'components/Tombol.tsx', 'components/Tombol.module.css', 'tokens.css']);
    expect(r.files[0]!.contents).toContain("import { Tombol } from './components/Tombol';");
    expect(iconRefs(fixture, { nodeId: 'BrdCgK01' })).toEqual([{ lib: 'lucide', icon: 'arrow-right' }]);
    const v5 = corpus.find((c) => c.label === 'v5-komponen-kartu')!.doc;
    expect(iconRefs(v5, { nodeId: 'BrdKm001' })).toEqual([
      { lib: 'lucide', icon: 'check' },
      { lib: 'lucide', icon: 'star' },
    ]);
    // components:false: ikon pohon inline saja; cukup untuk ekspor inline tanpa icon-glyph-missing.
    const inlineRefs = iconRefs(v5, { nodeId: 'BrdKm001', components: false });
    expect(inlineRefs).toEqual([
      { lib: 'lucide', icon: 'check' },
      { lib: 'lucide', icon: 'star' },
    ]);
    const inline = generateCode(v5, { nodeId: 'BrdKm001', target: 'react-css', components: false, icons: IconCatalog.load().glyphs(inlineRefs) });
    expect(inline.warnings.filter((w) => w.code === 'icon-glyph-missing')).toEqual([]);
    expect(iconRefs(fixture, { nodeId: 'FrmBrs01', components: false })).toEqual([{ lib: 'lucide', icon: 'arrow-right' }]);
  });
});

/** Aturan modul CSS: selektor kelas (termasuk `::after`) → daftar deklarasi berurutan. */
function parseCssModule(css: string): Map<string, CssDecl[]> {
  const out = new Map<string, CssDecl[]>();
  for (const m of css.matchAll(/^\.([A-Za-z0-9]+(?:::after)?) \{\n([\s\S]*?)\n\}$/gm)) {
    out.set(m[1]!, [...m[2]!.matchAll(/^ {2}([a-z-]+): (.*);$/gm)].map((d): CssDecl => [d[1]!, d[2]!]));
  }
  return out;
}

/**
 * Oracle independen dari pohon codegen: deklarasi node langsung dari fungsi css.ts dengan urutan render (milik node →
 * paint → tata letak terhadap parent termasuk gap negatif → efek dengan scrollY dan drop-shadow bentuk).
 */
function expected({ n, layout, scrollY, negativeGap }: Walked): { decls: CssDecl[]; after: CssDecl[] | undefined } {
  let own: CssDecl[] = [];
  let after: CssDecl[] | undefined;
  let filters: string[] = [];
  const box = (radius: string | undefined) => {
    after = strokeOverlayDecls((n as { stroke?: never }).stroke, radius);
    return [...codeBackgroundDecls((n as { fills?: unknown }).fills).decls, ...boxPaintDecls(n as never, radius)];
  };
  switch (n.type) {
    case 'frame':
      own = [...frameDecls(n), ...box(radiusCss(n.radius))];
      break;
    case 'text':
      own = textDecls(n, fontFamilyCss(n.family ?? 'Inter')!);
      break;
    case 'rect':
      own = [['position', 'relative'], ...box(radiusCss(n.radius))];
      break;
    case 'ellipse': {
      const shape = ellipseShape(n);
      own = [['position', 'relative'], ...(shape === 'box' ? box('50%') : [])];
      if (shape !== 'box' && shape !== 'empty') filters = dropShadowFilterList(n.shadows);
      break;
    }
    case 'path':
      own = [['position', 'relative']];
      filters = dropShadowFilterList(n.shadows);
      break;
    case 'icon':
      filters = dropShadowFilterList(n.shadows);
      break;
  }
  return { decls: mergeDecls([...own, ...childLayoutDecls(n, layout, { negativeGap }), ...effectDecls(n, scrollY, filters)]), after };
}

describe('codegen: deklarasi per properti sama dengan css.ts', () => {
  it.each(corpus.map((c): [string, LakarDocument] => [c.label, c.doc]))('%s', (_label, doc) => {
    const icons = glyphsOf(doc);
    let checked = 0;
    for (const b of boards(doc)) {
      const tree = buildTree(doc, { nodeId: b.id, icons }, []);
      const classes = assignClassNames(tree.root);
      const css = parseCssModule(generateCode(doc, { nodeId: b.id, target: 'react-css', icons, components: false }).files[1]!.contents);
      const tsx = generateCode(doc, { nodeId: b.id, target: 'react-tailwind', icons, components: false }).files[0]!.contents;
      const byId = new Map<string, CodeElement>();
      const index = (e: CodeElement) => {
        if (!e.svgChild && !byId.has(e.nodeId)) byId.set(e.nodeId, e);
        for (const c of e.children) if (c.kind === 'element') index(c);
      };
      index(tree.root);
      for (const w of walkBoard(doc, b.id)) {
        const e = byId.get(w.n.id)!;
        const want = expected(w);
        expect(e.decls, w.n.id).toEqual(want.decls);
        expect(e.after, `${w.n.id} ::after`).toEqual(want.after);
        // Modul CSS: aturan kelas node (dan ::after) = deklarasi css.ts.
        const cls = classes.get(e)!;
        expect(css.get(cls), `${w.n.id} .${cls}`).toEqual(want.decls);
        if (want.after) expect(css.get(`${cls}::after`)).toEqual([['content', "''"], ...want.after]);
        // Tailwind: setiap kelas = declToTailwind dari deklarasi yang sama, tertulis utuh di TSX.
        const { classes: tw, style } = tailwindClasses(e);
        const inline = needsInlineStyle;
        expect(tw.filter((c) => !c.startsWith('after:'))).toEqual(want.decls.filter(([, v]) => !inline(v)).map(([p, v]) => declToTailwind(p, v)));
        expect(style).toEqual(want.decls.filter(([, v]) => inline(v)));
        if (tw.length) expect(tsx).toContain(`className="${tw.join(' ')}"`);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('codegen: var() token sama dengan Copy as', () => {
  it.each(corpus.map((c): [string, LakarDocument] => [c.label, c.doc]))('%s: per node, di TSX/modul CSS (bukan file token)', (_label, doc) => {
    const icons = glyphsOf(doc);
    for (const b of boards(doc)) {
      const tree = buildTree(doc, { nodeId: b.id, icons }, []);
      const byId = new Map<string, CodeElement>();
      const index = (e: CodeElement) => {
        if (!e.svgChild && !byId.has(e.nodeId)) byId.set(e.nodeId, e);
        for (const c of e.children) if (c.kind === 'element') index(c);
      };
      index(tree.root);
      const code = TARGETS.map((target) =>
        generateCode(doc, { nodeId: b.id, target, icons, components: false })
          .files.filter((f) => f.path.endsWith('.tsx') || f.path.endsWith('.module.css'))
          .map((f) => f.contents)
          .join('\n'),
      );
      for (const { n } of walkBoard(doc, b.id)) {
        const vars = copyAs('css', n as never).match(/var\(--[a-z0-9-]+\)/g) ?? [];
        if (!vars.length) continue;
        // Elemen node sendiri (deklarasi, ::after, dan elemen SVG/fill internal milik node yang sama).
        const own = (e: CodeElement): string[] => [
          ...e.decls.map(([, v]) => v),
          ...(e.after ?? []).map(([, v]) => v),
          ...e.children.flatMap((c) => (c.kind === 'element' && c.nodeId === n.id ? own(c) : [])),
        ];
        const values = own(byId.get(n.id)!).join(' ');
        for (const v of vars) {
          expect(values, `${n.id} ${v}`).toContain(v);
          for (const text of code) expect(text, `${n.id} ${v}`).toContain(v);
        }
      }
    }
  });
});

describe('codegen: tokens.css pulang-pergi', () => {
  it.each(corpus.filter((c) => Object.keys(c.doc.tokens ?? {}).length).map((c): [string, LakarDocument] => [c.label, c.doc]))('%s', (_label, doc) => {
    const tokens = doc.tokens ?? {};
    const r = parseCssVariables(tokensCss(doc), { tokens, ...(doc.tokenModes ? { modes: doc.tokenModes } : {}) });
    expect(r.skipped).toEqual([]);
    expect(r.tokenModes).toBeNull();
    expect(r.entries.map((e) => e.token)).toEqual(Object.keys(tokens));
    const modes = doc.tokenModes ?? [undefined];
    // Parser menulis hex huruf besar dan membuang alpha FF (#RRGGBBFF ≡ #RRGGBB).
    const norm = (v: unknown) => (typeof v === 'string' ? v.toUpperCase().replace(/^(#[0-9A-F]{6})FF$/, '$1') : v);
    for (const e of r.entries) {
      const t = tokens[e.token]!;
      expect(e.type).toBe(t.type);
      for (const m of modes) {
        const want = m === undefined ? t.value : ((t.modes as Record<string, unknown> | undefined)?.[m] ?? t.value);
        const got = m === undefined ? e.value : ((e.modes as Record<string, unknown> | undefined)?.[m] ?? e.value);
        expect(norm(got), `${e.token} @${m}`).toBe(norm(want));
      }
    }
  });
});

describe('codegen: TSX lolos typecheck', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lakar-codegen-tsc-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('semua board korpus + fixture komponen (dan master fixture), kedua target, dengan/tanpa komponen: tsc strict 0 error', () => {
    const types = join(root, 'packages', 'viewer', 'node_modules', '@types', 'react');
    let n = 0;
    const exports = docs.flatMap((c) => [...boards(c.doc).map((b) => ({ c, id: b.id })), ...(c.label === 'komponen' ? [{ c, id: 'MstKrt01' }, { c, id: 'InsKrt02' }] : [])]);
    for (const { c, id } of exports) {
      for (const target of TARGETS) {
        for (const components of [false, true]) {
          const sub = join(dir, `${c.label}-${id}-${target}-${components ? 'k' : 'i'}`);
          for (const f of generateCode(c.doc, { nodeId: id, target, icons: glyphsFor(c.doc, id), components }).files) {
            mkdirSync(join(sub, f.path, '..'), { recursive: true });
            writeFileSync(join(sub, f.path), f.contents);
          }
          n++;
        }
      }
    }
    writeFileSync(join(dir, 'css-modules.d.ts'), "declare module '*.module.css' {\n  const styles: Record<string, string>;\n  export default styles;\n}\n");
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          jsx: 'react-jsx',
          module: 'esnext',
          moduleResolution: 'bundler',
          target: 'ES2022',
          lib: ['ES2022', 'DOM'],
          types: [],
          skipLibCheck: true,
          noUnusedLocals: true,
          paths: { react: [join(types, 'index.d.ts')], 'react/jsx-runtime': [join(types, 'jsx-runtime.d.ts')] },
        },
        include: ['**/*.tsx', '*.d.ts'],
      }),
    );
    expect(n).toBeGreaterThan(0);
    const r = spawnSync(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', dir], { encoding: 'utf8' });
    expect(`${r.stdout}${r.stderr}`).toBe('');
    expect(r.status).toBe(0);
  }, 120_000);
});
