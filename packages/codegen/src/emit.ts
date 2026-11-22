// Penulisan teks keluaran: TSX (React, `jsx: react-jsx`), modul CSS, dan kelas Tailwind dari pohon kode. Murni.
import type { CssDecl } from '@lakar/render';
import { NameAllocator } from './names.js';
import { declToTailwind, needsInlineStyle } from './tailwind.js';
import type { CodeElement, CodeNode } from './tree.js';

export type CodegenTarget = 'react-css' | 'react-tailwind';

/** Kelas per elemen (CSS module): nama unik camelCase, urutan pohon (pre-order). */
export function assignClassNames(root: CodeElement): Map<CodeElement, string> {
  const alloc = new NameAllocator();
  const out = new Map<CodeElement, string>();
  const walk = (e: CodeElement) => {
    if (!e.svgChild) out.set(e, alloc.take(e.name));
    for (const c of e.children) if (c.kind === 'element') walk(c);
  };
  walk(root);
  return out;
}

const camelProp = (p: string) => p.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());

/** Atribut SVG → nama prop React (`stroke-width` → `strokeWidth`; `aria-*`/`data-*` tetap). */
const reactAttr = (name: string) => (name.startsWith('aria-') || name.startsWith('data-') ? name : camelProp(name));

/**
 * Atribut JSX: string polos bila aman, selain itu ekspresi string literal. Backslash boleh polos (string atribut JSX
 * tidak memproses escape), jadi kelas Tailwind `\_` tetap terbaca pemindai; `&` diproses sebagai entitas → ekspresi.
 */
function jsxAttr(name: string, value: string): string {
  return /^[^"{}<>&\r\n]*$/.test(value) ? `${name}="${value}"` : `${name}={${JSON.stringify(value)}}`;
}

/** Prop `style` React dari deklarasi. */
function styleProp(decls: readonly CssDecl[]): string {
  return `style={{ ${decls.map(([p, v]) => `${camelProp(p)}: ${JSON.stringify(v)}`).join(', ')} }}`;
}

/** Teks JSX: polos bila aman (tanpa karakter khusus JSX, tanpa spasi tepi/baris baru), selain itu `{"…"}`. */
function jsxText(text: string): string {
  return text !== '' && /^[^{}<>&"'\r\n\u2028\u2029`]*$/.test(text) && text.trim() === text ? text : `{${JSON.stringify(text)}}`;
}

/** Kelas Tailwind satu elemen + deklarasi yang ditulis ke `style`. */
export function tailwindClasses(e: CodeElement): { classes: string[]; style: CssDecl[] } {
  const classes: string[] = [];
  const style: CssDecl[] = [];
  for (const [p, v] of e.decls) {
    if (needsInlineStyle(v)) style.push([p, v]);
    else classes.push(declToTailwind(p, v));
  }
  if (e.after) {
    classes.push("after:content-['']");
    for (const [p, v] of e.after) classes.push(`after:${declToTailwind(p, v)}`);
  }
  return { classes, style };
}

/** JSX elemen beserta anak-anaknya, diindentasi `depth` level (2 spasi). */
export function emitJsx(root: CodeElement, target: CodegenTarget, classNames: Map<CodeElement, string>, depth: number): string {
  const lines: string[] = [];
  const pad = (d: number) => '  '.repeat(d);
  const walk = (n: CodeNode, d: number) => {
    if (n.kind === 'text') {
      lines.push(pad(d) + jsxText(n.text));
      return;
    }
    const props: string[] = [];
    let inline: CssDecl[] = [];
    if (n.svgChild) inline = n.decls;
    else if (target === 'react-css') {
      if (n.decls.length || n.after) props.push(`className={styles.${classNames.get(n)!}}`);
    } else {
      const { classes, style } = tailwindClasses(n);
      if (classes.length) props.push(jsxAttr('className', classes.join(' ')));
      inline = style;
    }
    for (const [k, v] of n.attrs) props.push(jsxAttr(reactAttr(k), v));
    if (inline.length) props.push(styleProp(inline));
    const open = `<${n.tag}${props.length ? ' ' + props.join(' ') : ''}`;
    if (!n.children.length) {
      lines.push(`${pad(d)}${open} />`);
      return;
    }
    lines.push(`${pad(d)}${open}>`);
    for (const c of n.children) walk(c, d + 1);
    lines.push(`${pad(d)}</${n.tag}>`);
  };
  walk(root, depth);
  return lines.join('\n');
}

function rule(selector: string, decls: readonly CssDecl[]): string {
  return `${selector} {\n${decls.map(([p, v]) => `  ${p}: ${v};`).join('\n')}\n}\n`;
}

/** Modul CSS: satu aturan per elemen (urutan pohon) + `::after` untuk overlay stroke. */
export function emitCssModule(root: CodeElement, classNames: Map<CodeElement, string>): string {
  const rules: string[] = [];
  const walk = (e: CodeElement) => {
    const cls = classNames.get(e);
    if (cls !== undefined) {
      if (e.decls.length) rules.push(rule(`.${cls}`, e.decls));
      if (e.after) rules.push(rule(`.${cls}::after`, [['content', "''"], ...e.after]));
    }
    for (const c of e.children) if (c.kind === 'element') walk(c);
  };
  walk(root);
  return rules.join('\n');
}
