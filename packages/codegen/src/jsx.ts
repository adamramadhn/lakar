// Model JSX antara untuk ekspor dengan komponen (story 3): elemen, teks/prop, slot, kondisi, pemakaian komponen,
// dan nilai yang bergantung prop (`Varying`, tabel per kombinasi nilai prop "driver"). Model yang sama dievaluasi
// kembali menjadi pohon flat (cek pemakaian dan tes kesetaraan) dan ditulis menjadi TSX + modul CSS / kelas Tailwind,
// sehingga yang dicek sama dengan yang ditulis. Murni dan deterministik.
import type { CssDecl } from '@lakar/render';
import { camelProp, jsxAttr, jsxText, reactAttr, rule, type CodegenTarget } from './emit.js';
import { NameAllocator } from './names.js';
import { declToTailwind, needsInlineStyle } from './tailwind.js';
import type { CodeElement, CodeNode, CodegenWarning } from './tree.js';

export type PropValue = string | boolean;
/** Prop yang menentukan sebuah nilai; `values` = semua opsi (enum) atau `[true, false]`. */
export type Driver = { name: string; values: readonly PropValue[] };
/** Nilai per kombinasi driver (kunci `comboKey`); tanpa driver = statis (kunci ''). */
export type Varying<T> = { drivers: readonly Driver[]; table: ReadonlyMap<string, T> };

export const comboKey = (values: readonly PropValue[]): string => values.map((v) => JSON.stringify(v)).join(',');
export const fixed = <T>(v: T): Varying<T> => ({ drivers: [], table: new Map([['', v]]) });

/** Semua kombinasi nilai driver (urutan driver, lalu urutan opsi). */
export function combos(drivers: readonly Driver[]): PropValue[][] {
  let out: PropValue[][] = [[]];
  for (const d of drivers) out = out.flatMap((c) => d.values.map((v) => [...c, v]));
  return out;
}

export function pick<T>(v: Varying<T>, props: Readonly<Record<string, PropValue>>): T {
  const key = comboKey(v.drivers.map((d) => props[d.name]!));
  if (!v.table.has(key)) throw new Error(`codegen: nilai varian tidak ada untuk ${key}`);
  return v.table.get(key)!;
}

/** Gaya satu elemen: deklarasi + `::after`. */
export type Styled = { decls: CssDecl[]; after?: CssDecl[] | undefined };
/** Deklarasi kelas pemakai (selisih akar); `important` bila keluarganya juga ditulis komponen. */
export type SiteDecl = [prop: string, value: string, important: boolean];

export type JEl = {
  kind: 'el';
  tag: string;
  name: string;
  nodeId: string;
  attrs: [string, string][];
  svgChild?: boolean;
  style: Varying<Styled>;
  children: JChild[];
  when?: Varying<boolean> | undefined;
  /** Akar komponen: menggabung `className`/`style` pemanggil. */
  root?: boolean;
  /** Frame slot (nama slot) di komponen. */
  slotFrame?: string | undefined;
  warnings?: CodegenWarning[] | undefined;
};
export type JText = { kind: 'text'; text: Varying<string> };
export type JProp = { kind: 'prop'; name: string };
export type JSlot = { kind: 'slot'; name: string; fallback: JChild[] };
export type JCond = { kind: 'cond'; when: Varying<boolean>; children: JChild[] };
export type JUse = {
  kind: 'use';
  comp: JComponent;
  /** Nama dasar kelas pemakai (nama layer instance). */
  name: string;
  nodeId: string;
  /** Props yang berbeda dari default (urutan definisi). */
  props: [string, PropValue][];
  site: Varying<SiteDecl[]>;
  slots: [string, JChild[]][];
  when?: Varying<boolean> | undefined;
};
export type JChild = JEl | JText | JProp | JSlot | JCond | JUse;

export type ExportedProp = { name: string; type: 'text' | 'boolean' | 'enum'; default: PropValue; options?: readonly string[] | undefined };

/** Komponen React hasil satu master. */
export type JComponent = {
  name: string;
  masterId: string;
  /** Nama master (header berkas). */
  source: string;
  props: readonly ExportedProp[];
  slots: readonly string[];
  root: JEl;
  /** Kehadiran akar (prop boolean `visible` pada akar master). */
  rootWhen?: Varying<boolean> | undefined;
  /** Peringatan tingkat komponen (prop tidak didukung). */
  warnings: CodegenWarning[];
};

// ---------------------------------------------------------------------------
// Keluarga shorthand dan kaskade kelas pemakai
// ---------------------------------------------------------------------------

const FAMILY_EXACT: Readonly<Record<string, string>> = {
  'column-gap': 'gap',
  'row-gap': 'gap',
  'flex-grow': 'flex',
  'flex-shrink': 'flex',
  'flex-basis': 'flex',
  'flex-direction': 'flex-flow',
  'flex-wrap': 'flex-flow',
};
const FAMILY_PREFIXES = ['background', 'margin', 'padding', 'overflow', 'border-radius', 'border', 'grid-template', 'mask', 'font'] as const;

/**
 * Keluarga shorthand properti: properti yang bisa saling menimpa lewat shorthand dianggap satu keluarga (`gap`,
 * `flex`, `flex-flow`, `background*`, `margin*`, `padding*`, `overflow*`, `border-radius*`, `border*`,
 * `grid-template*`, `mask*`, `font*`).
 */
export function family(prop: string): string {
  const exact = FAMILY_EXACT[prop];
  if (exact) return exact;
  for (const f of FAMILY_PREFIXES) if (prop === f || prop.startsWith(`${f}-`)) return f;
  return prop;
}

function byFamily(decls: readonly CssDecl[]): Map<string, CssDecl[]> {
  const out = new Map<string, CssDecl[]>();
  for (const d of decls) {
    const f = family(d[0]);
    const list = out.get(f);
    if (list) list.push(d);
    else out.set(f, [d]);
  }
  return out;
}

/** Bentuk normal deklarasi: dikelompokkan per keluarga (urutan antar keluarga tidak bermakna, di dalam keluarga bermakna). */
export function normDecls(decls: readonly CssDecl[] | undefined): string {
  if (!decls) return '';
  return JSON.stringify([...byFamily(decls).entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/**
 * Selisih deklarasi akar asli `actual` terhadap akar komponen `own`, per keluarga. Keluarga yang berbeda ditulis
 * utuh dari `actual`, didahului `unset` untuk properti `own` yang tidak ada di `actual`; `important` bila `own` juga
 * menulis keluarga itu.
 */
export function siteDiff(actual: readonly CssDecl[], own: readonly CssDecl[]): SiteDecl[] {
  const fa = byFamily(actual);
  const fo = byFamily(own);
  const order = [...fa.keys(), ...[...fo.keys()].filter((f) => !fa.has(f))];
  const out: SiteDecl[] = [];
  for (const f of order) {
    const a = fa.get(f) ?? [];
    const o = fo.get(f) ?? [];
    if (JSON.stringify(a) === JSON.stringify(o)) continue;
    const imp = o.length > 0;
    for (const [p] of o) if (!a.some(([q]) => q === p) && !out.some(([q, v]) => q === p && v === 'unset')) out.push([p, 'unset', imp]);
    for (const [p, v] of a) out.push([p, v, imp]);
  }
  return out;
}

/** Kaskade kelas pemakai di atas deklarasi akar komponen (keluarga yang ditulis pemakai menang utuh). */
export function applySite(own: readonly CssDecl[], site: readonly SiteDecl[]): CssDecl[] {
  const fams = new Set(site.map(([p]) => family(p)));
  return [...own.filter(([p]) => !fams.has(family(p))), ...site.filter(([, v]) => v !== 'unset').map(([p, v]): CssDecl => [p, v])];
}

// ---------------------------------------------------------------------------
// Evaluasi model → pohon flat
// ---------------------------------------------------------------------------

/** Props lengkap: default komponen ditimpa `given`. */
export function fullProps(c: JComponent, given: Iterable<readonly [string, PropValue]>): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const p of c.props) out[p.name] = p.default;
  for (const [k, v] of given) out[k] = v;
  return out;
}

type Env = { props: Readonly<Record<string, PropValue>>; slots: ReadonlyMap<string, CodeNode[]>; slotEls: Map<CodeElement, string> | undefined };

/** Render komponen untuk props lengkap dan isi slot; `slotEls` (opsional) menerima frame slot komponen ini. */
export function evalComponent(c: JComponent, props: Readonly<Record<string, PropValue>>, slots: ReadonlyMap<string, CodeNode[]>, slotEls?: Map<CodeElement, string>): CodeElement | null {
  if (c.rootWhen && !pick(c.rootWhen, props)) return null;
  const out = evalNodes([c.root], { props, slots, slotEls });
  return (out[0] as CodeElement | undefined) ?? null;
}

/** Evaluasi anak-anak model menjadi pohon flat (props kosong untuk berkas utama). */
export function evalNodes(nodes: readonly JChild[], env: Env = { props: {}, slots: new Map(), slotEls: undefined }): CodeNode[] {
  const out: CodeNode[] = [];
  for (const n of nodes) {
    switch (n.kind) {
      case 'el': {
        if (n.when && !pick(n.when, env.props)) break;
        const s = pick(n.style, env.props);
        const e: CodeElement = { kind: 'element', tag: n.tag, name: n.name, nodeId: n.nodeId, decls: [...s.decls], attrs: n.attrs, children: evalNodes(n.children, env) };
        if (s.after) e.after = s.after;
        if (n.svgChild) e.svgChild = true;
        if (n.slotFrame !== undefined && env.slotEls) env.slotEls.set(e, n.slotFrame);
        out.push(e);
        break;
      }
      case 'text':
        out.push({ kind: 'text', text: pick(n.text, env.props) });
        break;
      case 'prop':
        out.push({ kind: 'text', text: String(env.props[n.name]) });
        break;
      case 'slot':
        out.push(...(env.slots.get(n.name) ?? evalNodes(n.fallback, env)));
        break;
      case 'cond':
        if (pick(n.when, env.props)) out.push(...evalNodes(n.children, env));
        break;
      case 'use': {
        if (n.when && !pick(n.when, env.props)) break;
        const slots = new Map(n.slots.map(([k, c]): [string, CodeNode[]] => [k, evalNodes(c, env)]));
        const r = evalComponent(n.comp, fullProps(n.comp, n.props), slots);
        if (!r) break;
        r.decls = applySite(r.decls, pick(n.site, env.props));
        out.push(r);
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Perbandingan pohon flat (abaikan nama kelas dan id node; id SVG dinormalkan)
// ---------------------------------------------------------------------------

const normAttr = (v: string) => v.replace(/[A-Za-z0-9-]+-stroke\b/g, '#stroke');
const attrsEq = (a: readonly [string, string][], b: readonly [string, string][]) =>
  a.length === b.length && a.every(([k, v], i) => b[i]![0] === k && normAttr(b[i]![1]) === normAttr(v));

/**
 * `a` sama dengan `s`? `root` = deklarasi akar tidak dibandingkan. Frame slot `s` (di `slotEls`) hanya dibandingkan
 * dirinya; anak yang berbeda dicatat di `slotsOut` (frame slot asli per nama).
 */
export function sameTree(a: CodeElement, s: CodeElement, root: boolean, slotEls?: ReadonlyMap<CodeElement, string>, slotsOut?: Map<string, CodeElement>): boolean {
  if (a.tag !== s.tag || !!a.svgChild !== !!s.svgChild || !attrsEq(a.attrs, s.attrs) || normDecls(a.after) !== normDecls(s.after)) return false;
  if (!root && normDecls(a.decls) !== normDecls(s.decls)) return false;
  const slot = slotEls?.get(s);
  if (slot !== undefined) {
    if (!sameChildren(a.children, s.children)) slotsOut?.set(slot, a);
    return true;
  }
  if (a.children.length !== s.children.length) return false;
  return a.children.every((c, i) => {
    const d = s.children[i]!;
    if (c.kind === 'text' || d.kind === 'text') return c.kind === d.kind && (c as { text: string }).text === (d as { text: string }).text;
    return sameTree(c, d, false, slotEls, slotsOut);
  });
}

export function sameChildren(a: readonly CodeNode[], b: readonly CodeNode[]): boolean {
  return (
    a.length === b.length &&
    a.every((c, i) => {
      const d = b[i]!;
      if (c.kind === 'text' || d.kind === 'text') return c.kind === d.kind && (c as { text: string }).text === (d as { text: string }).text;
      return sameTree(c, d, false);
    })
  );
}

// ---------------------------------------------------------------------------
// Penulisan TSX + modul CSS / kelas Tailwind
// ---------------------------------------------------------------------------

const isBoolDriver = (d: Driver) => d.values.every((v) => typeof v === 'boolean');
/** Kunci objek literal untuk opsi enum; `__proto__` ditulis sebagai kunci terhitung (literal biasa mengganti prototipe). */
const propKey = (o: PropValue) => {
  const s = String(o);
  if (s === '__proto__') return '["__proto__"]';
  return /^[A-Za-z_$][\w$]*$/.test(s) ? s : JSON.stringify(s);
};

/** String literal JS; kelas Tailwind berisi `\` memakai `String.raw` supaya pemindai dan runtime melihat teks sama. */
export const jsStr = (s: string): string => (s.includes('\\') ? `String.raw\`${s}\`` : JSON.stringify(s));

/**
 * Ekspresi pemilih nilai varian, bersarang per driver: ternary untuk boolean, lookup objek untuk enum (tanpa kunci
 * gabungan, jadi opsi berisi pemisah apa pun tidak bisa bentrok).
 */
export function lookupExpr<T>(v: Varying<T>, render: (t: T) => string): string {
  const ds = v.drivers;
  const level = (i: number, prefix: readonly PropValue[]): string => {
    if (i === ds.length) return render(v.table.get(comboKey(prefix)) as T);
    const d = ds[i]!;
    const inner = (x: PropValue) => {
      const s = level(i + 1, [...prefix, x]);
      return i + 1 < ds.length && isBoolDriver(ds[i + 1]!) ? `(${s})` : s;
    };
    if (isBoolDriver(d)) return `${d.name} ? ${inner(true)} : ${inner(false)}`;
    return `{ ${d.values.map((o) => `${propKey(o)}: ${inner(o)}`).join(', ')} }[${d.name}]`;
  };
  return level(0, []);
}

/** Ekspresi kondisi kehadiran. */
export function condExpr(v: Varying<boolean>): string {
  const ds = v.drivers;
  const present = combos(ds).filter((c) => v.table.get(comboKey(c)));
  if (!present.length) return 'false';
  const term = (d: Driver, x: PropValue) => (isBoolDriver(d) ? (x ? d.name : `!${d.name}`) : `${d.name} === ${JSON.stringify(x)}`);
  const terms = present.map((c) => c.map((x, i) => term(ds[i]!, x)).join(' && '));
  return terms.length === 1 ? terms[0]! : terms.map((t) => (t.includes(' && ') ? `(${t})` : t)).join(' || ');
}

const wrapCond = (c: string) => (/ \|\| | \? /.test(c) ? `(${c})` : c);

/** Nilai atribut: string polos (atribut JSX) atau ekspresi. */
type AttrValue = { str: string } | { expr: string };

const styleObj = (decls: readonly CssDecl[]) => `{ ${decls.map(([p, v]) => `${camelProp(p)}: ${JSON.stringify(v)}`).join(', ')} }`;

function twSite(site: readonly SiteDecl[]): { classes: string[]; style: CssDecl[] } {
  const classes: string[] = [];
  const style: CssDecl[] = [];
  for (const [p, v, imp] of site) {
    if (needsInlineStyle(v)) style.push([p, v]);
    else classes.push(`${declToTailwind(p, v)}${imp ? '!' : ''}`);
  }
  return { classes, style };
}

/** Penulis satu berkas TSX (+ modul CSS). */
class FileWriter {
  private readonly alloc = new NameAllocator();
  private readonly rules: string[] = [];
  readonly uses: JComponent[] = [];
  private readonly lines: string[] = [];

  constructor(
    private readonly target: CodegenTarget,
    private readonly fileBase: string,
  ) {}

  get css(): boolean {
    return this.target === 'react-css';
  }

  /** Kelas modul CSS untuk satu gaya (atau selisih pemakai); kosong → undefined. */
  private cssClass(base: string, decls: readonly SiteDecl[], after: readonly CssDecl[] | undefined): string | undefined {
    if (!decls.length && !after) return undefined;
    const cls = this.alloc.take(base);
    if (decls.length) this.rules.push(rule(`.${cls}`, decls.map(([p, v, imp]): CssDecl => [p, imp ? `${v} !important` : v])));
    if (after) this.rules.push(rule(`.${cls}::after`, [['content', "''"], ...after]));
    return cls;
  }

  /** Atribut className + style untuk gaya bervarian (elemen) atau selisih pemakai. */
  private classAndStyle<T>(base: string, v: Varying<T>, toSite: (t: T) => { decls: SiteDecl[]; after?: CssDecl[] | undefined }): { cls?: AttrValue | undefined; style?: string | undefined } {
    const entries = [...v.table.values()];
    if (this.css) {
      const names = new Map<string, string | undefined>();
      const nameOf = (t: T) => {
        const s = toSite(t);
        const key = JSON.stringify(s);
        if (!names.has(key)) names.set(key, this.cssClass(base, s.decls, s.after));
        return names.get(key);
      };
      entries.forEach(nameOf);
      if (!v.drivers.length) {
        const n = nameOf(entries[0]!);
        return { cls: n === undefined ? undefined : { expr: `styles.${n}` } };
      }
      if (entries.every((t) => nameOf(t) === undefined)) return {};
      return { cls: { expr: lookupExpr(v, (t) => (nameOf(t) === undefined ? 'undefined' : `styles.${nameOf(t)!}`)) } };
    }
    const tw = (t: T) => {
      const s = toSite(t);
      const stylePart = twSite(s.decls);
      if (s.after) stylePart.classes.push("after:content-['']", ...s.after.map(([p, val]) => `after:${declToTailwind(p, val)}`));
      return stylePart;
    };
    if (!v.drivers.length) {
      const { classes, style } = tw(entries[0]!);
      return { cls: classes.length ? { str: classes.join(' ') } : undefined, style: style.length ? styleObj(style) : undefined };
    }
    const anyClass = entries.some((t) => tw(t).classes.length);
    const anyStyle = entries.some((t) => tw(t).style.length);
    return {
      cls: anyClass ? { expr: lookupExpr(v, (t) => jsStr(tw(t).classes.join(' '))) } : undefined,
      style: anyStyle ? lookupExpr(v, (t) => (tw(t).style.length ? styleObj(tw(t).style) : 'undefined')) : undefined,
    };
  }

  private elStyle(n: JEl): { cls?: AttrValue | undefined; style?: string | undefined } {
    if (n.svgChild) {
      const s = pick(n.style, {});
      return { style: s.decls.length ? styleObj(s.decls) : undefined };
    }
    return this.classAndStyle(n.name, n.style, (s: Styled) => ({ decls: s.decls.map(([p, v]): SiteDecl => [p, v, false]), after: s.after }));
  }

  private pad = (d: number) => '  '.repeat(d);

  private push(d: number, s: string) {
    this.lines.push(this.pad(d) + s);
  }

  private use(c: JComponent) {
    if (!this.uses.includes(c)) this.uses.push(c);
  }

  /** Atribut JSX dari nilai. */
  private attr(name: string, v: AttrValue): string {
    return 'str' in v ? jsxAttr(name, v.str) : `${name}={${v.expr}}`;
  }

  private elProps(n: JEl): string[] {
    const { cls, style } = this.elStyle(n);
    const props: string[] = [];
    if (n.root) {
      // Kelas akar + kelas pemanggil dalam satu template (String.raw bila kelas Tailwind memuat `\`).
      const extra = "${className ? ` ${className}` : ''}";
      if (cls === undefined) props.push('className={className}');
      else if ('str' in cls) props.push(`className={${cls.str.includes('\\') ? 'String.raw' : ''}\`${cls.str}${extra}\`}`);
      else props.push(`className={\`\${${cls.expr}}${extra}\`}`);
    } else if (cls) props.push(this.attr('className', cls));
    for (const [k, v] of n.attrs) props.push(jsxAttr(reactAttr(k), v));
    if (n.root) props.push(style === undefined ? 'style={style}' : `style={{ ...${style}, ...style }}`);
    else if (style !== undefined) props.push(`style={${style}}`);
    return props;
  }

  /** Blok berisi satu atau beberapa anak (fragment bila ≠ 1 elemen tanpa syarat). */
  private block(children: readonly JChild[], d: number) {
    const single = children.length === 1 && (children[0]!.kind === 'el' || children[0]!.kind === 'use') && !(children[0] as JEl | JUse).when;
    if (single) this.node(children[0]!, d);
    else {
      this.push(d, '<>');
      for (const c of children) this.node(c, d + 1);
      this.push(d, '</>');
    }
  }

  private conditional(when: Varying<boolean> | undefined, d: number, body: (d: number) => void) {
    if (!when) return body(d);
    this.push(d, `{${wrapCond(condExpr(when))} && (`);
    body(d + 1);
    this.push(d, ')}');
  }

  node(n: JChild, d: number): void {
    switch (n.kind) {
      case 'el':
        return this.conditional(n.when, d, (dd) => {
          const props = this.elProps(n);
          const open = `<${n.tag}${props.length ? ' ' + props.join(' ') : ''}`;
          if (!n.children.length) return this.push(dd, `${open} />`);
          this.push(dd, `${open}>`);
          for (const c of n.children) this.node(c, dd + 1);
          this.push(dd, `</${n.tag}>`);
        });
      case 'text':
        return this.push(d, n.text.drivers.length ? `{${lookupExpr(n.text, (t) => JSON.stringify(t))}}` : jsxText(pick(n.text, {})));
      case 'prop':
        return this.push(d, `{${n.name}}`);
      case 'slot':
        if (!n.fallback.length) return this.push(d, `{${n.name}}`);
        this.push(d, `{${n.name} ?? (`);
        this.block(n.fallback, d + 1);
        return this.push(d, ')}');
      case 'cond':
        this.push(d, `{${wrapCond(condExpr(n.when))} && (`);
        this.block(n.children, d + 1);
        return this.push(d, ')}');
      case 'use':
        return this.conditional(n.when, d, (dd) => {
          this.use(n.comp);
          const props = n.props.map(([k, v]) => (typeof v === 'boolean' ? `${k}={${v}}` : jsxAttr(k, v)));
          const { cls, style } = this.classAndStyle(n.name, n.site, (s: SiteDecl[]) => ({ decls: s }));
          if (cls) props.push(this.attr('className', cls));
          if (style !== undefined) props.push(`style={${style}}`);
          if (!n.slots.length) return this.push(dd, `<${n.comp.name}${props.length ? ' ' + props.join(' ') : ''} />`);
          this.push(dd, `<${n.comp.name}`);
          for (const p of props) this.push(dd + 1, p);
          for (const [k, c] of n.slots) {
            this.push(dd + 1, `${k}={`);
            if (c.length) this.block(c, dd + 2);
            else this.push(dd + 2, '<></>');
            this.push(dd + 1, '}');
          }
          this.push(dd, '/>');
        });
    }
  }

  body(): string {
    return this.lines.join('\n');
  }

  cssText(): string {
    return this.rules.join('\n');
  }

  stylesImport(): string {
    return this.css ? `import styles from './${this.fileBase}.module.css';\n` : '';
  }
}

/** Nama prop yang dipakai ekspresi di pohon (driver, `{prop}`, slot). */
function usedNames(nodes: readonly JChild[], out = new Set<string>()): Set<string> {
  const drivers = (v: Varying<unknown> | undefined) => v?.drivers.forEach((d) => out.add(d.name));
  for (const n of nodes) {
    switch (n.kind) {
      case 'el':
        drivers(n.style);
        drivers(n.when);
        usedNames(n.children, out);
        break;
      case 'text':
        drivers(n.text);
        break;
      case 'prop':
        out.add(n.name);
        break;
      case 'slot':
        out.add(n.name);
        usedNames(n.fallback, out);
        break;
      case 'cond':
        drivers(n.when);
        usedNames(n.children, out);
        break;
      case 'use':
        drivers(n.site);
        drivers(n.when);
        n.slots.forEach(([, c]) => usedNames(c, out));
        break;
    }
  }
  return out;
}

const importsOf = (uses: readonly JComponent[], dir: string) => uses.map((c) => `import { ${c.name} } from '${dir}${c.name}';\n`).join('');

export type WrittenFile = { tsx: string; css?: string | undefined; uses: JComponent[] };

/**
 * Tulis berkas utama: `export function <name>()` dengan akar `root`. `componentDir` = prefiks impor komponen
 * (`./components/`).
 */
export function writeMain(name: string, root: JChild, target: CodegenTarget, header: string, componentDir: string): WrittenFile {
  const w = new FileWriter(target, name);
  w.node(root, 2);
  const tsx = `${header}${importsOf(w.uses, componentDir)}${w.stylesImport()}\nexport function ${name}() {\n  return (\n${w.body()}\n  );\n}\n\nexport default ${name};\n`;
  return { tsx, css: w.css ? w.cssText() : undefined, uses: w.uses };
}

const tsType = (p: ExportedProp) => (p.type === 'text' ? 'string' : p.type === 'boolean' ? 'boolean' : p.options!.map((o) => JSON.stringify(o)).join(' | '));

/** Tulis berkas komponen. `componentDir` = prefiks impor komponen lain dari berkas ini. */
export function writeComponent(c: JComponent, target: CodegenTarget, header: string, componentDir: string): WrittenFile {
  const w = new FileWriter(target, c.name);
  w.node(c.root, 2);
  const used = usedNames([c.root]);
  if (c.rootWhen) c.rootWhen.drivers.forEach((d) => used.add(d.name));
  const typeLines = [...c.props.map((p) => `  ${p.name}?: ${tsType(p)};`), ...c.slots.map((s) => `  ${s}?: ReactNode;`), '  className?: string;', '  style?: CSSProperties;'];
  const params = [
    ...c.props.filter((p) => used.has(p.name)).map((p) => `${p.name} = ${JSON.stringify(p.default)}`),
    ...c.slots.filter((s) => used.has(s)),
    'className',
    'style',
  ];
  const reactTypes = c.slots.length ? 'CSSProperties, ReactNode' : 'CSSProperties';
  const guard = c.rootWhen ? `  if (!(${condExpr(c.rootWhen)})) return null;\n` : '';
  const tsx =
    `${header}import type { ${reactTypes} } from 'react';\n${importsOf(w.uses, componentDir)}${w.stylesImport()}\n` +
    `export type ${c.name}Props = {\n${typeLines.join('\n')}\n};\n\n` +
    `export function ${c.name}({ ${params.join(', ')} }: ${c.name}Props) {\n${guard}  return (\n${w.body()}\n  );\n}\n\nexport default ${c.name};\n`;
  return { tsx, css: w.css ? w.cssText() : undefined, uses: w.uses };
}

/** Elemen flat → model statis (anak elemen lewat `child`, teks apa adanya). */
export function staticEl(e: CodeElement, child: (c: CodeElement) => JChild = (c) => staticEl(c)): JEl {
  const j: JEl = {
    kind: 'el',
    tag: e.tag,
    name: e.name,
    nodeId: e.nodeId,
    attrs: e.attrs,
    style: fixed<Styled>(e.after ? { decls: e.decls, after: e.after } : { decls: e.decls }),
    children: e.children.map((c): JChild => (c.kind === 'text' ? { kind: 'text', text: fixed(c.text) } : child(c))),
  };
  if (e.svgChild) j.svgChild = true;
  if (e.warnings) j.warnings = e.warnings;
  return j;
}
