// Tes @lakar/codegen atas korpus (spec kode-2): golden deterministik per dokumen/target, deklarasi CSS sama dengan
// css.ts, var() token sama dengan Copy as, pulang-pergi tokens.css lewat parseCssVariables, dan typecheck TSX.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
import { assignClassNames, buildTree, declToTailwind, generateCode, mergeDecls, tailwindClasses, tokensCss, type CodeElement, type CodegenTarget } from '../packages/codegen/src/index.ts';
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

const boards = (doc: LakarDocument) => doc.pages.flatMap((p) => p.children);

/** Semua keluaran satu dokumen untuk satu target, digabung per board dengan pemisah berkas. */
function bundle(doc: LakarDocument, target: CodegenTarget): string {
  const icons = glyphsOf(doc);
  return boards(doc)
    .map((b) => {
      const r = generateCode(doc, { nodeId: b.id, target, icons });
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

  it.each(corpus.flatMap((c) => TARGETS.map((t): [string, CodegenTarget, LakarDocument] => [c.label, t, c.doc])))('%s %s: deterministik dan sama dengan golden', async (label, target, doc) => {
    const a = bundle(doc, target);
    expect(bundle(structuredClone(doc), target)).toBe(a);
    await expect(a).toMatchFileSnapshot(join(root, 'tests', 'fixtures', 'codegen', `${label}.${target}.txt`));
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
      const css = parseCssModule(generateCode(doc, { nodeId: b.id, target: 'react-css', icons }).files[1]!.contents);
      const tsx = generateCode(doc, { nodeId: b.id, target: 'react-tailwind', icons }).files[0]!.contents;
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
        const inline = (v: string) => /url\(|['&{}<>]/.test(v);
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
        generateCode(doc, { nodeId: b.id, target, icons })
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

  it('semua board korpus, kedua target: tsc strict 0 error', () => {
    const types = join(root, 'packages', 'viewer', 'node_modules', '@types', 'react');
    let n = 0;
    for (const c of corpus) {
      for (const b of boards(c.doc)) {
        for (const target of TARGETS) {
          const sub = join(dir, `${c.label}-${b.id}-${target}`);
          mkdirSync(sub, { recursive: true });
          for (const f of generateCode(c.doc, { nodeId: b.id, target, icons: glyphsOf(c.doc) }).files) writeFileSync(join(sub, f.path), f.contents);
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
