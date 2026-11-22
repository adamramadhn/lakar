// Deklarasi CSS → kelas Tailwind v4. Utilitas hanya dipakai bila menghasilkan properti dan nilai yang persis sama
// (kata kunci, atau nilai arbitrer `prefix-[v]`); selain itu properti arbitrer `[prop:v]`. Murni.

/** Utilitas kata kunci: properti → nilai → kelas. */
const KEYWORD: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  position: { absolute: 'absolute', relative: 'relative' },
  display: { flex: 'flex', grid: 'grid', block: 'block' },
  'flex-direction': { row: 'flex-row', column: 'flex-col' },
  'box-sizing': { 'border-box': 'box-border' },
  overflow: { hidden: 'overflow-hidden', visible: 'overflow-visible' },
  isolation: { isolate: 'isolate' },
  'align-items': { 'flex-start': 'items-start', center: 'items-center', 'flex-end': 'items-end', stretch: 'items-stretch' },
  'justify-content': { 'flex-start': 'justify-start', center: 'justify-center', 'flex-end': 'justify-end', 'space-between': 'justify-between' },
  'align-self': { stretch: 'self-stretch' },
  'justify-self': { stretch: 'justify-self-stretch' },
  'font-style': { italic: 'italic', normal: 'not-italic' },
  'text-align': { left: 'text-left', center: 'text-center', right: 'text-right', justify: 'text-justify' },
  'white-space': { pre: 'whitespace-pre', 'pre-wrap': 'whitespace-pre-wrap' },
  'pointer-events': { none: 'pointer-events-none' },
  'z-index': { auto: 'z-auto' },
  'mix-blend-mode': Object.fromEntries(
    ['multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'].map((b) => [
      b,
      `mix-blend-${b}`,
    ]),
  ),
};

/** Utilitas nilai arbitrer: properti → prefiks (+ petunjuk tipe untuk nilai `var()` pada utilitas ambigu). */
const ARBITRARY: Readonly<Record<string, readonly [prefix: string, hint?: 'color' | 'length']>> = {
  width: ['w'],
  height: ['h'],
  'min-width': ['min-w'],
  'max-width': ['max-w'],
  'min-height': ['min-h'],
  'max-height': ['max-h'],
  left: ['left'],
  top: ['top'],
  right: ['right'],
  bottom: ['bottom'],
  inset: ['inset'],
  margin: ['m'],
  flex: ['flex'],
  gap: ['gap'],
  'column-gap': ['gap-x'],
  'row-gap': ['gap-y'],
  padding: ['p'],
  'grid-template-columns': ['grid-cols'],
  'grid-template-rows': ['grid-rows'],
  'grid-column': ['col'],
  'grid-row': ['row'],
  'border-radius': ['rounded'],
  opacity: ['opacity'],
  'background-color': ['bg', 'color'],
  color: ['text', 'color'],
  'font-size': ['text', 'length'],
  'line-height': ['leading'],
  'letter-spacing': ['tracking'],
};

/** Nilai arbitrer Tailwind: `_` → `\_`, spasi → `_`, kutip ganda → kutip tunggal (aman di atribut JSX). */
export const arbitraryValue = (v: string): string => v.replace(/_/g, '\\_').replace(/\s+/g, '_').replace(/"/g, "'");

/** Satu deklarasi → satu kelas Tailwind v4. */
export function declToTailwind(prop: string, value: string): string {
  const kw = KEYWORD[prop]?.[value];
  if (kw) return kw;
  if (prop === 'font-weight' && /^\d+$/.test(value)) return `font-[${value}]`;
  const arb = ARBITRARY[prop];
  if (arb) {
    const [prefix, hint] = arb;
    return `${prefix}-[${hint && value.startsWith('var(') ? `${hint}:` : ''}${arbitraryValue(value)}]`;
  }
  return `[${prop}:${arbitraryValue(value)}]`;
}

/**
 * Deklarasi yang ditulis ke prop `style` React di target Tailwind: url() data/aset, dan nilai berkutip tunggal atau
 * berkarakter `&{}<>`, backtick, atau `$` (tidak bisa ditulis sebagai kelas arbitrer di atribut JSX polos tanpa merusak nilai/pemindai, atau di dalam template `String.raw` pada ekspresi kelas).
 */
export const needsInlineStyle = (value: string): boolean => /url\(|['&{}<>`$]/.test(value);
