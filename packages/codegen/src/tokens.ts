// File token (AD-11): CSS variables `:root` + `[data-theme="<mode>"]` per mode, dan tema Tailwind v4 (`@theme inline`).
// Nama variabel dari `cssVarName`, nilai dari `tokenValueCss` (`@lakar/render` css.ts), sehingga sama dengan
// Copy as, codegen, dan dapat diimpor ulang oleh `parseCssVariables`. Murni.
import { cssVarName, tokenValueCss, tokenVar } from '@lakar/render';
import type { LakarDocument, TokenDef, TokenType } from '@lakar/schema';

type TokenDoc = Pick<LakarDocument, 'tokens' | 'tokenModes'>;

const entries = (doc: TokenDoc): [string, TokenDef][] => Object.entries(doc.tokens ?? {}) as [string, TokenDef][];

/** Nilai efektif token di mode `mode` (`modes[mode] ?? value`). */
const valueIn = (t: TokenDef, mode: string | undefined): unknown => (mode !== undefined ? ((t.modes as Record<string, unknown> | undefined)?.[mode] ?? t.value) : t.value);

/** Pasangan token yang variabel CSS-nya sama (`a.b` dan `a-b`): `[variabel, nama[]]`. */
export function tokenVarCollisions(doc: TokenDoc): [string, string[]][] {
  const byVar = new Map<string, string[]>();
  for (const [name] of entries(doc)) {
    const v = cssVarName(name);
    byVar.set(v, [...(byVar.get(v) ?? []), name]);
  }
  return [...byVar].filter(([, names]) => names.length > 1);
}

function block(selector: string, decls: [string, string][]): string {
  return decls.length ? `${selector} {\n${decls.map(([p, v]) => `  ${p}: ${v};`).join('\n')}\n}\n` : `${selector} {}\n`;
}

/**
 * `tokens.css`: `:root` = nilai mode default (mode pertama `tokenModes`, atau `value` bila tanpa mode); setiap mode
 * lain → `[data-theme="m"]` berisi token yang nilainya berbeda dari `:root`. Urutan token = urutan tersimpan.
 */
export function tokensCss(doc: TokenDoc): string {
  const modes = doc.tokenModes ?? [];
  const def = modes[0];
  const list = entries(doc);
  const root: [string, string][] = [];
  const rootValue = new Map<string, string>();
  for (const [name, t] of list) {
    const v = tokenValueCss(t.type, valueIn(t, def));
    if (v === undefined) continue;
    root.push([cssVarName(name), v]);
    rootValue.set(name, v);
  }
  const out = [block(':root', root)];
  for (const mode of modes.slice(1)) {
    const decls: [string, string][] = [];
    for (const [name, t] of list) {
      const v = tokenValueCss(t.type, valueIn(t, mode));
      if (v !== undefined && v !== rootValue.get(name)) decls.push([cssVarName(name), v]);
    }
    if (decls.length) out.push(block(`[data-theme="${mode}"]`, decls));
  }
  return out.join('\n');
}

/** Namespace tema Tailwind v4 per tipe token. */
export const THEME_NAMESPACE: Readonly<Record<TokenType, string>> = {
  color: 'color',
  radius: 'radius',
  spacing: 'spacing',
  container: 'container',
  breakpoint: 'breakpoint',
  fontFamily: 'font',
  fontWeight: 'font-weight',
  fontSize: 'text',
  lineHeight: 'leading',
  letterSpacing: 'tracking',
};

/**
 * `theme.css` Tailwind v4: impor `tokens.css` lalu `@theme inline` yang memetakan token ke namespace tema
 * (`--color-primary: var(--colors-primary)`). Kunci = nama token tanpa segmen pertama (titik → `-`); bentrok dalam
 * satu namespace → nama penuh.
 */
export function tailwindThemeCss(doc: TokenDoc): string {
  const list = entries(doc);
  const short = (name: string) => {
    const segs = name.split('.');
    return (segs.length > 1 ? segs.slice(1) : segs).join('-');
  };
  const count = new Map<string, number>();
  for (const [name, t] of list) {
    const k = `${THEME_NAMESPACE[t.type]}|${short(name)}`;
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const lines = list.map(([name, t]) => {
    const ns = THEME_NAMESPACE[t.type];
    let key = count.get(`${ns}|${short(name)}`)! > 1 ? name.replace(/\./g, '-') : short(name);
    // Variabel tema tidak boleh sama dengan variabel token (`spacing.gap` → `--spacing-gap: var(--spacing-gap)` siklik).
    if (`--${ns}-${key}` === cssVarName(name)) key = name.replace(/\./g, '-');
    return `  --${ns}-${key}: ${tokenVar(name)};`;
  });
  return `@import "./tokens.css";\n\n@theme inline {\n${lines.join('\n')}${lines.length ? '\n' : ''}}\n`;
}
