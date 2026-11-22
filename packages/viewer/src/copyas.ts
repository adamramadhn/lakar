// Copy as CSS/Tailwind/JSON (aplikasi 2): pemetaan murni node dari POST /inspect (properti tersimpan, token apa
// adanya, plus `bounds` terukur) ke teks yang disalin. Semua pemetaan nilai (token → var(), panjang, warna,
// gradien, radius, padding, bayangan, teks, align/justify, stroke → border) berasal dari pemetaan CSS tunggal
// di @lakar/render (AD-5), jadi nilainya sama dengan canvas. Di sini hanya urutan deklarasi, ukuran terukur
// (`bounds`, dibulatkan 2 desimal), dan format Tailwind. Fill image/noise/mesh dilewati (tidak ada padanan).
import {
  ALIGN,
  backgroundCss,
  boxShadowsCss,
  colorCss,
  fontFamilyCss,
  fontWeightCss,
  gridLineCss,
  gridTemplateCss,
  JUSTIFY,
  lengthCss,
  letterSpacingCss,
  lineHeightCss,
  paddingCss,
  radiusCss,
  strokeBorderDecls,
  textShadowCss,
  type CssDecl,
  type ShadowLike,
} from '@lakar/render';

export type CopyFormat = 'css' | 'tailwind' | 'json';

type Node = Record<string, unknown> & { type?: string; bounds?: readonly number[] };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** Pembulatan khusus ukuran terukur (bounds), bukan nilai tersimpan. */
const round = (n: number) => String(Math.round(n * 100) / 100);

/** Ukuran: angka/token tersimpan; hug/fill → ukuran terukur (bounds) bila ada. */
function size(v: unknown, measured: number | undefined): string | undefined {
  return lengthCss(v) ?? (isNum(measured) ? `${round(measured)}px` : undefined);
}

/** Deklarasi CSS node (urutan: ukuran, posisi, fill, stroke, radius, opacity, shadow, teks, layout flex). */
export function cssDeclarations(node: Node): CssDecl[] {
  const out: CssDecl[] = [];
  const type = node.type;
  const text = type === 'text';
  const b = node.bounds;
  const push = (p: string, v: string | undefined) => v !== undefined && v !== '' && out.push([p, v]);

  if (type === 'icon') {
    push('width', lengthCss(node.size));
    push('height', lengthCss(node.size));
  } else {
    push('width', size(node.width, b?.[2]));
    push('height', size(node.height, b?.[3]));
  }
  if (node.position === 'absolute') {
    push('position', 'absolute');
    push('left', lengthCss(node.x));
    push('top', lengthCss(node.y));
  }
  if (!text && type !== 'icon') push('background', backgroundCss(node.fills));
  for (const [p, v] of strokeBorderDecls(node.stroke)) push(p, v);
  push('border-radius', radiusCss(node.radius));
  if (isNum(node.opacity)) push('opacity', String(node.opacity));
  if (Array.isArray(node.shadows)) {
    const shadows = node.shadows as ShadowLike[];
    push(text ? 'text-shadow' : 'box-shadow', text ? textShadowCss(shadows) : boxShadowsCss(shadows));
  }
  if (text) {
    push('font-family', fontFamilyCss(node.family));
    push('font-size', lengthCss(node.size));
    push('font-weight', fontWeightCss(node.weight));
    if (node.style === 'italic') push('font-style', 'italic');
    push('line-height', lineHeightCss(node.lineHeight));
    push('letter-spacing', letterSpacingCss(node.letterSpacing));
    push('color', colorCss(node.color));
    if (typeof node.align === 'string') push('text-align', node.align);
  }
  if (type === 'icon') push('color', colorCss(node.color));
  // Satu entri padding tidak valid → padding dilewati (bukan "16px  8px").
  const pad = paddingCss(node.padding);
  // Penempatan sel grid (v4) milik anak; ditulis apa adanya (parent tidak diketahui di sini).
  push('grid-column', gridLineCss(node.gridColumn));
  push('grid-row', gridLineCss(node.gridRow));
  const flex = node.layout === 'row' || node.layout === 'column';
  if (type === 'frame' && (flex || node.layout === 'grid')) {
    if (flex) {
      push('display', 'flex');
      push('flex-direction', node.layout as string);
    } else {
      push('display', 'grid');
      push('grid-template-columns', gridTemplateCss(node.gridTemplateColumns));
      push('grid-template-rows', gridTemplateCss(node.gridTemplateRows));
    }
    // Grid mengabaikan gap negatif (render layout.ts); flex tetap menyalin nilai tersimpan apa adanya.
    if (flex || !(isNum(node.gap) && node.gap < 0)) push('gap', lengthCss(node.gap));
    push('column-gap', lengthCss(node.columnGap));
    push('row-gap', lengthCss(node.rowGap));
    push('padding', pad);
    if (typeof node.align === 'string') push('align-items', ALIGN[node.align]);
    if (typeof node.justify === 'string') push('justify-content', JUSTIFY[node.justify]);
  } else if (type === 'frame') {
    push('padding', pad);
  }
  return out;
}

/** CSS satu deklarasi per baris: `prop: value;`. */
export function toCss(node: Node): string {
  return cssDeclarations(node)
    .map(([p, v]) => `${p}: ${v};`)
    .join('\n');
}

/** Nilai arbitrer Tailwind: spasi → `_`. `hint` (color/length) untuk utilitas yang ambigu bila nilainya var(). */
const arb = (v: string, hint?: 'color' | 'length') => `[${hint && v.startsWith('var(') ? `${hint}:` : ''}${v.replace(/\s+/g, '_')}]`;

/** Kelas Tailwind (nilai arbitrer bila perlu), mis. `w-[298px] bg-[#F97316]`. */
export function toTailwind(node: Node): string {
  const cls: string[] = [];
  const decls = new Map(cssDeclarations(node));
  const get = (p: string) => decls.get(p);
  const add = (prefix: string, p: string, hint?: 'color' | 'length') => {
    const v = get(p);
    if (v !== undefined) cls.push(`${prefix}-${arb(v, hint)}`);
  };
  add('w', 'width');
  add('h', 'height');
  if (get('position') === 'absolute') cls.push('absolute');
  add('left', 'left');
  add('top', 'top');
  const bg = get('background');
  if (bg !== undefined) cls.push(`bg-${arb(bg, /gradient\(/.test(bg) ? undefined : 'color')}`);
  for (const [p, v] of decls) {
    const m = /^border(?:-(top|right|bottom|left))?$/.exec(p);
    if (!m) continue;
    const side = m[1] ? `-${m[1][0]}` : '';
    const [w, , ...c] = v.split(' ');
    cls.push(`border${side}-${arb(w!, 'length')}`, `border${side}-${arb(c.join(' '), 'color')}`);
  }
  const radius = get('border-radius');
  if (radius !== undefined) {
    const parts = radius.split(' ');
    if (parts.length === 4) ['tl', 'tr', 'br', 'bl'].forEach((c, i) => cls.push(`rounded-${c}-${arb(parts[i]!)}`));
    else cls.push(`rounded-${arb(radius)}`);
  }
  add('opacity', 'opacity');
  add('shadow', 'box-shadow');
  const ts = get('text-shadow');
  if (ts !== undefined) cls.push(`[text-shadow:${ts.replace(/\s+/g, '_')}]`);
  const fam = get('font-family');
  if (fam !== undefined) cls.push(fam.startsWith('var(') ? `font-[family-name:${fam}]` : `font-['${fam.replace(/^"|"$/g, '').replace(/\s+/g, '_')}']`);
  add('text', 'font-size', 'length');
  const weight = get('font-weight');
  if (weight !== undefined) cls.push(weight.startsWith('var(') ? `font-[number:${weight}]` : `font-[${weight}]`);
  if (get('font-style') === 'italic') cls.push('italic');
  add('leading', 'line-height');
  add('tracking', 'letter-spacing');
  add('text', 'color', 'color');
  const ta = get('text-align');
  if (ta !== undefined) cls.push(`text-${ta}`);
  if (get('display') === 'flex') cls.push('flex', get('flex-direction') === 'column' ? 'flex-col' : 'flex-row');
  if (get('display') === 'grid') cls.push('grid');
  add('grid-cols', 'grid-template-columns');
  add('grid-rows', 'grid-template-rows');
  add('col', 'grid-column');
  add('row', 'grid-row');
  add('gap', 'gap');
  add('gap-x', 'column-gap');
  add('gap-y', 'row-gap');
  const pad = get('padding');
  if (pad !== undefined) {
    const p = pad.split(' ');
    if (p.length === 1) cls.push(`p-${arb(p[0]!)}`);
    else if (p.length === 2) cls.push(`py-${arb(p[0]!)}`, `px-${arb(p[1]!)}`);
    else if (p.length === 3) cls.push(`pt-${arb(p[0]!)}`, `px-${arb(p[1]!)}`, `pb-${arb(p[2]!)}`);
    else if (p.length === 4) ['pt', 'pr', 'pb', 'pl'].forEach((k, i) => cls.push(`${k}-${arb(p[i]!)}`));
  }
  const ai = get('align-items');
  if (ai !== undefined) cls.push(`items-${ai.replace('flex-', '')}`);
  const jc = get('justify-content');
  if (jc !== undefined) cls.push(`justify-${jc.replace('flex-', '').replace('space-', '')}`);
  return cls.join(' ');
}

/** Teks yang disalin untuk `format`. JSON = perilaku lama (node inspect apa adanya). */
export function copyAs(format: CopyFormat, node: Node): string {
  if (format === 'css') return toCss(node);
  if (format === 'tailwind') return toTailwind(node);
  return JSON.stringify(node, null, 2);
}
