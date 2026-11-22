// @lakar/codegen (AD-16): satu generator kode murni untuk viewer dan daemon. Dokumen tersimpan (AD-10) → komponen
// React (TSX) dengan modul CSS atau kelas Tailwind v4, plus file token. Master menjadi komponen React tersendiri dan
// instance menjadi pemakaiannya (story 3). Deps hanya `@lakar/schema` dan `@lakar/render` (AD-17); tanpa IO.
// Deterministik: input sama → byte sama.
import { type IconGlyph, type LakarDocument } from '@lakar/schema';
import { componentsOf, Exporter, warningsOf } from './components.js';
import { assignClassNames, emitCssModule, emitJsx, type CodegenTarget } from './emit.js';
import { writeComponent, writeMain, type JChild, type JComponent } from './jsx.js';
import { NameAllocator, pascalName } from './names.js';
import { tailwindThemeCss, tokensCss, tokenVarCollisions } from './tokens.js';
import { buildTree, storedIndex, type CodegenWarning, type TreeCtx } from './tree.js';

export const PACKAGE = '@lakar/codegen';

export { arbitraryValue, declToTailwind, needsInlineStyle } from './tailwind.js';
export { tailwindThemeCss, THEME_NAMESPACE, tokensCss, tokenVarCollisions } from './tokens.js';
export { buildTree, mergeDecls, type CodeElement, type CodeNode, type CodeText, type CodeTree, type CodegenWarning } from './tree.js';
export { assignClassNames, emitCssModule, emitJsx, tailwindClasses, type CodegenTarget } from './emit.js';
export { camelName, pascalName } from './names.js';
export { applySite, evalComponent, evalNodes, family, fullProps, normDecls, sameTree, siteDiff, type JChild, type JComponent } from './jsx.js';
export { COMBOS_MAX } from './components.js';

export type CodegenOptions = {
  /** Id tersimpan board atau node anak (termasuk instance dan master). */
  nodeId: string;
  target: CodegenTarget;
  /** Nama komponen React berkas utama; default PascalCase dari nama node. */
  componentName?: string | undefined;
  /** Glyph ikon (daemon me-resolve dari katalog @lakar/icons); ikon tanpa glyph → kotak kosong + warning. Daftar yang dibutuhkan: `iconRefs`. */
  icons?: readonly IconGlyph[] | undefined;
  /** Prefiks URL aset gambar (default `/assets/`). */
  assetBase?: string | undefined;
  /** Master sebagai berkas komponen terpisah dan instance sebagai pemakaiannya (default true); false = semua di-inline. */
  components?: boolean | undefined;
  /** Sertakan `tokens.css` (default true); false = tanpa berkas token (`theme.css` Tailwind tetap). */
  tokens?: boolean | undefined;
  /** TypeScript (default true): `.tsx` dengan props bertipe; false = JavaScript `.jsx` tanpa anotasi tipe. */
  typescript?: boolean | undefined;
};

export type CodegenFile = { path: string; contents: string };
export type CodegenResult = { files: CodegenFile[]; warnings: CodegenWarning[] };

/** Folder berkas komponen (relatif akar ekspor). */
export const COMPONENTS_DIR = 'components/';

/** Model ekspor dengan komponen: akar berkas utama, komponen yang dipakai (urut ditemukan), dan peringatan. */
export type ExportModel = {
  name: string;
  /** Akar berkas utama; undefined bila berkas utama adalah komponen itu sendiri (`nodeId` = master). */
  root: JChild | undefined;
  /** Komponen berkas utama bila `nodeId` = master. */
  main: JComponent | undefined;
  components: JComponent[];
  warnings: CodegenWarning[];
  /** Nama sumber (nama node) untuk header. */
  source: string;
};

/** Bangun model ekspor dengan komponen (dipakai `generateCode`, `iconRefs`, dan tes kesetaraan). */
export function exportModel(doc: LakarDocument, opts: Omit<CodegenOptions, 'target' | 'components'>, requested: TreeCtx['requested'] = new Map()): ExportModel {
  const treeWarnings: CodegenWarning[] = [];
  const tree = buildTree(doc, { nodeId: opts.nodeId, icons: opts.icons, assetBase: opts.assetBase, componentName: opts.componentName }, treeWarnings, requested);
  const names = new NameAllocator();
  // Tipe React yang diimpor berkas komponen tidak boleh dipakai sebagai nama komponen.
  names.take('CSSProperties');
  names.take('ReactNode');
  const ex = new Exporter(doc, storedIndex(doc), { icons: opts.icons, assetBase: opts.assetBase }, requested, names);
  const docWarnings: CodegenWarning[] = tokenVarCollisions(doc).map(([variable, list]) => ({
    code: 'token-var-collision',
    message: `Tokens ${list.join(', ')} share the CSS variable ${variable}; the last one wins.`,
  }));
  let root: JChild | undefined;
  let main: JComponent | undefined;
  let name = tree.name;
  if (tree.node.type !== 'board' && ex.isMaster(tree.node.id) && !tree.node.id.includes('/')) {
    // Berkas utama = komponen master itu sendiri (nama dari componentName bila ada).
    if (opts.componentName !== undefined) names.take(pascalName(opts.componentName));
    main = ex.component(tree.node.id) ?? undefined;
    if (main && opts.componentName !== undefined) main.name = pascalName(opts.componentName);
    if (main) name = main.name;
  }
  if (!main) {
    // Nama bisa sudah dipakai komponen bersarang (build master utama yang gagal) → nama unik.
    name = names.take(name);
    root = ex.toJ(tree.root);
  }
  const comps = main ? componentsOf(main.root).filter((c) => c !== main) : componentsOf(root!);
  const warnings = [...docWarnings, ...warningsOf(root ? [root] : [])];
  for (const c of main ? [main, ...comps] : comps) warnings.push(...c.warnings, ...warningsOf([c.root]));
  return { name, root, main, components: comps, warnings: ex.dedupe(warnings), source: tree.node.name };
}

const headerOf = (source: string, css: boolean, what: string) => {
  const s = JSON.stringify(source.replace(/[\r\n\u2028\u2029]+/g, ' '));
  return css ? `// Generated by Lakar from ${what}${s}. Import tokens.css once in your app.\n` : `// Generated by Lakar from ${what}${s}. Requires Tailwind CSS v4 and theme.css (imports tokens.css).\n`;
};

/**
 * Ekspor satu board/node menjadi file kode. `react-css` → `<Name>.tsx`, `<Name>.module.css`, `components/*`,
 * `tokens.css`; `react-tailwind` → `<Name>.tsx`, `components/*.tsx`, `tokens.css`, `theme.css`. Node tidak ada →
 * `LakarError('NOT_FOUND')`.
 */
export function generateCode(doc: LakarDocument, opts: CodegenOptions): CodegenResult {
  if (opts.components === false) return generateInline(doc, opts);
  const m = exportModel(doc, opts);
  const css = opts.target === 'react-css';
  const ts = opts.typescript !== false;
  const ext = ts ? '.tsx' : '.jsx';
  const files: CodegenFile[] = [];
  const add = (dir: string, base: string, w: { tsx: string; css?: string | undefined }) => {
    files.push({ path: `${dir}${base}${ext}`, contents: w.tsx });
    if (css) files.push({ path: `${dir}${base}.module.css`, contents: w.css ?? '' });
  };
  if (m.main) add('', m.name, writeComponent(m.main, opts.target, headerOf(m.source, css, 'component '), `./${COMPONENTS_DIR}`, ts));
  else add('', m.name, writeMain(m.name, m.root!, opts.target, headerOf(m.source, css, ''), `./${COMPONENTS_DIR}`));
  for (const c of m.components) {
    add(COMPONENTS_DIR, c.name, writeComponent(c, opts.target, headerOf(c.source, css, 'component '), './', ts));
  }
  addTokenFiles(files, doc, opts);
  return { files, warnings: m.warnings };
}

/** Keluaran story 2: instance di-inline, satu berkas komponen. */
function generateInline(doc: LakarDocument, opts: CodegenOptions): CodegenResult {
  const warnings: CodegenWarning[] = tokenVarCollisions(doc).map(([variable, names]) => ({
    code: 'token-var-collision',
    message: `Tokens ${names.join(', ')} share the CSS variable ${variable}; the last one wins.`,
  }));
  const tree = buildTree(doc, { nodeId: opts.nodeId, icons: opts.icons, assetBase: opts.assetBase, componentName: opts.componentName }, warnings);
  const { name } = tree;
  const classNames = assignClassNames(tree.root);
  const css = opts.target === 'react-css';
  const header = headerOf(tree.node.name, css, '');
  const imports = css ? `import styles from './${name}.module.css';\n\n` : '\n';
  const tsx = `${header}${imports}export function ${name}() {\n  return (\n${emitJsx(tree.root, opts.target, classNames, 2)}\n  );\n}\n\nexport default ${name};\n`;
  const files: CodegenFile[] = [{ path: `${name}${opts.typescript === false ? '.jsx' : '.tsx'}`, contents: tsx }];
  if (css) files.push({ path: `${name}.module.css`, contents: emitCssModule(tree.root, classNames) });
  addTokenFiles(files, doc, opts);
  return { files, warnings };
}

/** Berkas token di akhir: `tokens.css` (kecuali `tokens: false`) lalu `theme.css` untuk Tailwind. */
function addTokenFiles(files: CodegenFile[], doc: LakarDocument, opts: CodegenOptions): void {
  if (opts.tokens !== false) files.push({ path: 'tokens.css', contents: tokensCss(doc) });
  if (opts.target !== 'react-css') files.push({ path: 'theme.css', contents: tailwindThemeCss(doc) });
}

/**
 * Ikon yang diminta ekspor `opts` (termasuk varian enum di komponen dan ikon di dalam instance), unik dan terurut
 * `lib` lalu `icon`. Pemanggil me-resolve glyph-nya lalu meneruskannya sebagai `icons`.
 */
export function iconRefs(doc: LakarDocument, opts: Omit<CodegenOptions, 'target' | 'icons'>): { lib: string; icon: string }[] {
  const requested: TreeCtx['requested'] = new Map();
  if (opts.components === false) buildTree(doc, { nodeId: opts.nodeId }, [], requested);
  else exportModel(doc, { nodeId: opts.nodeId, componentName: opts.componentName, assetBase: opts.assetBase }, requested);
  return [...requested.values()].sort((a, b) => (a.lib === b.lib ? (a.icon < b.icon ? -1 : a.icon > b.icon ? 1 : 0) : a.lib < b.lib ? -1 : 1));
}

