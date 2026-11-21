// Copy as CSS/Tailwind/JSON (aplikasi 2): pemetaan murni node dari POST /inspect (properti tersimpan, token apa
// adanya, plus `bounds` terukur) ke teks yang disalin. Semantik nilai mengikuti packages/render (layout.ts,
// paint.ts): lineHeight px, letterSpacing em, sudut gradien CSS, padding angka | [v,h] | [t,r,b,l].
// Token `{$token:"colors.primary"}` → `var(--colors-primary)`. Fill image/noise/mesh dilewati (tidak ada padanan).

export type CopyFormat = 'css' | 'tailwind' | 'json';

type Node = Record<string, unknown> & { type?: string; bounds?: readonly number[] };
type Decl = [prop: string, value: string];

const isToken = (v: unknown): v is { $token: string } => typeof v === 'object' && v !== null && typeof (v as { $token?: unknown }).$token === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const round = (n: number) => String(Math.round(n * 100) / 100);
const tokenVar = (t: { $token: string }) => `var(--${t.$token.replace(/\./g, '-')})`;

/** Panjang px: angka → `16px`, token → var(); selain itu undefined. */
function len(v: unknown): string | undefined {
  if (isNum(v)) return `${round(v)}px`;
  if (isToken(v)) return tokenVar(v);
  return undefined;
}

/** Warna: hex (3 digit diperluas) apa adanya, token → var(). */
function color(v: unknown): string | undefined {
  if (isToken(v)) return tokenVar(v);
  if (typeof v !== 'string') return undefined;
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : v;
}

const pct = (n: unknown) => (isNum(n) ? `${round(n * 100)}%` : '0%');

type Stop = { offset?: unknown; color?: unknown };
type Paint = { type?: string; color?: unknown; angle?: unknown; center?: unknown; radius?: unknown; stops?: Stop[] };

const stopsCss = (stops: Stop[] | undefined) => (stops ?? []).map((s) => `${color(s.color) ?? 'transparent'} ${pct(s.offset)}`).join(', ');
const center = (c: unknown) => (Array.isArray(c) ? `${pct(c[0])} ${pct(c[1])}` : '50% 50%');

/** Satu fill → lapisan `background`; `solo` = satu-satunya lapisan (solid cukup ditulis warna). */
function fillLayer(f: Paint, solo: boolean): string | undefined {
  switch (f.type) {
    case 'solid': {
      const c = color(f.color);
      if (!c) return undefined;
      return solo ? c : `linear-gradient(${c}, ${c})`;
    }
    case 'linear':
      return `linear-gradient(${isNum(f.angle) ? round(f.angle) : 180}deg, ${stopsCss(f.stops)})`;
    case 'radial': {
      const r = isNum(f.radius) ? pct(f.radius) : '50%';
      return `radial-gradient(${r} ${r} at ${center(f.center)}, ${stopsCss(f.stops)})`;
    }
    case 'conic':
      return `conic-gradient(from ${isNum(f.angle) ? round(f.angle) : 0}deg at ${center(f.center)}, ${stopsCss(f.stops)})`;
    default:
      return undefined;
  }
}

/** Fills → nilai `background` (fill pertama paling bawah = lapisan CSS terakhir). */
function background(fills: unknown): string | undefined {
  if (!Array.isArray(fills)) return undefined;
  const usable = (fills as Paint[]).filter((f) => fillLayer(f, false) !== undefined);
  if (!usable.length) return undefined;
  return usable
    .map((f) => fillLayer(f, usable.length === 1)!)
    .reverse()
    .join(', ');
}

type Shadow = { type?: string; x?: unknown; y?: unknown; blur?: unknown; spread?: unknown; color?: unknown };
const shadowCss = (s: Shadow, text: boolean) =>
  text
    ? `${len(s.x) ?? '0px'} ${len(s.y) ?? '0px'} ${len(s.blur) ?? '0px'} ${color(s.color) ?? ''}`.trim()
    : `${s.type === 'inner' ? 'inset ' : ''}${len(s.x) ?? '0px'} ${len(s.y) ?? '0px'} ${len(s.blur) ?? '0px'} ${len(s.spread) ?? '0px'} ${color(s.color) ?? ''}`.trim();

const ALIGN: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };
const JUSTIFY: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', 'space-between': 'space-between' };

/** Ukuran: angka/token tersimpan; hug/fill → ukuran terukur (bounds) bila ada. */
function size(v: unknown, measured: number | undefined): string | undefined {
  return len(v) ?? (isNum(measured) ? `${round(measured)}px` : undefined);
}

/** Deklarasi CSS node (urutan: ukuran, posisi, fill, stroke, radius, opacity, shadow, teks, layout flex). */
export function cssDeclarations(node: Node): Decl[] {
  const out: Decl[] = [];
  const type = node.type;
  const text = type === 'text';
  const b = node.bounds;
  const push = (p: string, v: string | undefined) => v !== undefined && v !== '' && out.push([p, v]);

  if (type === 'icon') {
    push('width', len(node.size));
    push('height', len(node.size));
  } else {
    push('width', size(node.width, b?.[2]));
    push('height', size(node.height, b?.[3]));
  }
  if (node.position === 'absolute') {
    push('position', 'absolute');
    push('left', len(node.x));
    push('top', len(node.y));
  }
  if (!text && type !== 'icon') push('background', background(node.fills));
  const stroke = node.stroke as { color?: unknown; width?: unknown; sides?: unknown } | undefined;
  if (stroke && typeof stroke === 'object') {
    const w = len(stroke.width);
    const c = color(stroke.color);
    if (w && c) {
      const v = `${w} solid ${c}`;
      if (Array.isArray(stroke.sides)) for (const s of stroke.sides) push(`border-${String(s)}`, v);
      else push('border', v);
    }
  }
  if (Array.isArray(node.radius)) {
    const v = node.radius.map(len);
    if (v.every(Boolean)) push('border-radius', v.join(' '));
  } else push('border-radius', len(node.radius));
  if (isNum(node.opacity)) push('opacity', round(node.opacity));
  if (Array.isArray(node.shadows) && node.shadows.length) {
    const list = (node.shadows as Shadow[]).filter((s) => !(text && s.type === 'inner')).map((s) => shadowCss(s, text));
    if (list.length) push(text ? 'text-shadow' : 'box-shadow', list.join(', '));
  }
  if (text) {
    const fam = isToken(node.family) ? tokenVar(node.family) : typeof node.family === 'string' ? (/[\s,'"]/.test(node.family) ? `"${node.family}"` : node.family) : undefined;
    push('font-family', fam);
    push('font-size', len(node.size));
    push('font-weight', isNum(node.weight) ? String(node.weight) : isToken(node.weight) ? tokenVar(node.weight) : undefined);
    if (node.style === 'italic') push('font-style', 'italic');
    push('line-height', len(node.lineHeight));
    push('letter-spacing', isNum(node.letterSpacing) ? `${round(node.letterSpacing)}em` : isToken(node.letterSpacing) ? tokenVar(node.letterSpacing) : undefined);
    push('color', color(node.color));
    if (typeof node.align === 'string') push('text-align', node.align);
  }
  if (type === 'icon') push('color', color(node.color));
  if (type === 'frame' && (node.layout === 'row' || node.layout === 'column')) {
    push('display', 'flex');
    push('flex-direction', node.layout);
    push('gap', len(node.gap));
    const pad = Array.isArray(node.padding) ? (node.padding.map(len).every(Boolean) ? node.padding.map(len).join(' ') : undefined) : len(node.padding);
    push('padding', pad);
    if (typeof node.align === 'string') push('align-items', ALIGN[node.align]);
    if (typeof node.justify === 'string') push('justify-content', JUSTIFY[node.justify]);
  } else if (type === 'frame' && node.padding !== undefined) {
    push('padding', Array.isArray(node.padding) ? node.padding.map(len).join(' ') : len(node.padding));
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
  add('gap', 'gap');
  const pad = get('padding');
  if (pad !== undefined) {
    const p = pad.split(' ');
    if (p.length === 1) cls.push(`p-${arb(p[0]!)}`);
    else if (p.length === 2) cls.push(`py-${arb(p[0]!)}`, `px-${arb(p[1]!)}`);
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
