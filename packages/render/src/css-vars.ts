// Impor CSS variables (epic token-tema story 2, AD-5, AD-11): stylesheet → token bertipe dengan nilai per mode.
// Kebalikan pemetaan token di css.ts: nama token dari variabel memakai `cssVarName` yang sama, sehingga
// `cssVarName(token) === variable` untuk setiap hasil. Murni: tanpa IO, tanpa DOM; hanya `import type` dari luar
// paket (aturan render). Dipakai `execute` (disuntikkan daemon lewat `CssVariablesPort`) dan dialog impor viewer.
// Validasi akhir nilai tetap di core (`setTokens`); di sini batas nilai per tipe dicek agar variabel yang tidak
// sah dilaporkan sebagai `skipped` alih-alih menggagalkan seluruh impor.
import type { CssTokenValue, CssVariableEntry, CssVariableSkip, CssVariableSkipReason, CssVariablesImport, CssVariablesParseOptions } from '@lakar/ports';
import type { TokenType } from '@lakar/schema';
import { cssVarName } from './css.js';

/** Salinan `TOKEN_NAME_PATTERN` @lakar/schema (render tidak boleh mengimpor nilai schema); tes menjaga kesamaannya. */
export const CSS_IMPORT_TOKEN_NAME = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*$/;
/** Salinan `MODE_NAME_PATTERN` @lakar/schema. */
export const CSS_IMPORT_MODE_NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;
const TOKEN_NAME_MAX = 64;
const VAR_BODY = /^[a-z0-9-]+$/;
/** 1rem (dan 1em di luar letterSpacing) = 16px. */
const REM_PX = 16;
const ALIAS_DEPTH = 10;

type Target = { kind: 'root' } | { kind: 'mode'; mode: string };
type Rule = { selector: string; body: string };

/** Buang komentar `/* … *\/` di luar string. */
function stripComments(css: string): string {
  let out = '';
  let quote = '';
  for (let i = 0; i < css.length; i++) {
    const c = css[i]!;
    if (quote) {
      out += c;
      if (c === '\\') out += css[++i] ?? '';
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'") {
      quote = c;
      out += c;
    } else if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? css.length : end + 1;
      out += ' ';
    } else out += c;
  }
  return out;
}

/** Pecah `s` pada `sep` di kedalaman kurung 0 dan di luar string. */
function splitTop(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quote) {
      cur += c;
      if (c === '\\') cur += s[++i] ?? '';
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    else if (c === sep && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  parts.push(cur);
  return parts;
}

/** Aturan tingkat atas `prelude { body }` (string dihormati); at-rule dikembalikan terpisah. */
function topRules(css: string): { rules: Rule[]; atRules: string[] } {
  const rules: Rule[] = [];
  const atRules: string[] = [];
  let i = 0;
  let prelude = '';
  let quote = '';
  while (i < css.length) {
    const c = css[i]!;
    if (quote) {
      prelude += c;
      if (c === '\\') prelude += css[++i] ?? '';
      else if (c === quote) quote = '';
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      prelude += c;
      i++;
    } else if (c === ';' || c === '}') {
      if (c === ';' && prelude.trim().startsWith('@')) atRules.push(prelude.trim());
      prelude = '';
      i++;
    } else if (c === '{') {
      let depth = 1;
      let j = i + 1;
      let q = '';
      for (; j < css.length && depth > 0; j++) {
        const d = css[j]!;
        if (q) {
          if (d === '\\') j++;
          else if (d === q) q = '';
        } else if (d === '"' || d === "'") q = d;
        else if (d === '{') depth++;
        else if (d === '}') depth--;
      }
      const sel = prelude.trim().replace(/\s+/g, ' ');
      const body = css.slice(i + 1, depth === 0 ? j - 1 : j);
      if (sel.startsWith('@')) atRules.push(sel);
      else if (sel) rules.push({ selector: sel, body });
      prelude = '';
      i = j;
    } else {
      prelude += c;
      i++;
    }
  }
  return { rules, atRules };
}

const MODE_SELECTOR = /^(?::root|html)?\[\s*data-theme\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s"']+))\s*\]$/i;

function classify(selector: string): Target | 'unsupported-selector' | 'invalid-mode' {
  const s = selector.trim();
  if (/^(?::root|html|:host)$/i.test(s)) return { kind: 'root' };
  const m = MODE_SELECTOR.exec(s);
  if (!m) return 'unsupported-selector';
  const mode = m[1] ?? m[2] ?? m[3] ?? '';
  return CSS_IMPORT_MODE_NAME.test(mode) ? { kind: 'mode', mode } : 'invalid-mode';
}

// ---------------------------------------------------------------------------
// Nilai
// ---------------------------------------------------------------------------

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const hex2 = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0').toUpperCase();
const toHex = (r: number, g: number, b: number, a: number) => {
  const aa = hex2(a * 255);
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${aa === 'FF' ? '' : aa}`;
};
const NAMED_COLORS: Record<string, string> = { transparent: '#00000000', white: '#FFFFFF', black: '#000000' };

/** Argumen fungsi warna: `a, b, c[, d]` atau `a b c[ / d]`. */
function colorArgs(inner: string): string[] | undefined {
  const parts = inner.includes(',') ? inner.split(',') : inner.replace('/', ' / ').trim().split(/\s+/);
  const clean = parts.map((p) => p.trim()).filter((p) => p !== '/');
  if (!inner.includes(',') && clean.length === 4 && !inner.includes('/')) return undefined;
  return clean.length === 3 || clean.length === 4 ? clean : undefined;
}

function num(s: string, unit = ''): number | undefined {
  if (!s.endsWith(unit)) return undefined;
  const t = unit ? s.slice(0, -unit.length) : s;
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(t)) return undefined;
  return Number(t);
}
const alpha = (s: string | undefined): number | undefined => {
  if (s === undefined) return 1;
  const p = num(s, '%');
  const v = p !== undefined ? p / 100 : num(s);
  return v === undefined ? undefined : clamp(v, 0, 1);
};

/** Warna CSS → `#RRGGBB`/`#RRGGBBAA` huruf besar; selain hex, rgb[a], hsl[a], transparent/white/black → undefined. */
export function parseCssColor(raw: string): string | undefined {
  const v = raw.trim().toLowerCase();
  if (Object.hasOwn(NAMED_COLORS, v)) return NAMED_COLORS[v];
  const h = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v);
  if (h) {
    const d = h[1]!.length <= 4 ? [...h[1]!].map((c) => c + c).join('') : h[1]!;
    return `#${d.length === 8 && d.endsWith('ff') ? d.slice(0, 6) : d}`.toUpperCase();
  }
  const f = /^(rgba?|hsla?)\((.*)\)$/.exec(v);
  if (!f) return undefined;
  const args = colorArgs(f[2]!);
  if (!args) return undefined;
  const a = alpha(args[3]);
  if (a === undefined) return undefined;
  if (f[1]!.startsWith('rgb')) {
    const ch = args.slice(0, 3).map((s) => {
      const p = num(s, '%');
      return p !== undefined ? (p / 100) * 255 : num(s);
    });
    if (ch.some((c) => c === undefined)) return undefined;
    return toHex(ch[0]!, ch[1]!, ch[2]!, a);
  }
  const hue = num(args[0]!, 'deg') ?? num(args[0]!);
  const s = num(args[1]!, '%');
  const l = num(args[2]!, '%');
  if (hue === undefined || s === undefined || l === undefined) return undefined;
  const sat = clamp(s, 0, 100) / 100;
  const lig = clamp(l, 0, 100) / 100;
  const k = (n: number) => (n + (((hue % 360) + 360) % 360) / 30) % 12;
  const c = sat * Math.min(lig, 1 - lig);
  const ch = (n: number) => (lig - c * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))) * 255;
  return toHex(ch(0), ch(8), ch(4), a);
}

/** Item daftar font-family: string berkutip atau rangkaian identifier. */
function familyItems(raw: string): string[] | undefined {
  const items = splitTop(raw, ',').map((s) => s.trim());
  const out: string[] = [];
  for (const it of items) {
    const q = /^(["'])(.*)\1$/.exec(it);
    if (q && q[2]!.trim()) out.push(q[2]!.trim());
    else if (/^[A-Za-z][A-Za-z0-9 _-]*$/.test(it)) out.push(it.replace(/\s+/g, ' '));
    else return undefined;
  }
  return out.length ? out : undefined;
}

type Length = { n: number; unit: '' | 'px' | 'rem' | 'em' };
function parseLength(raw: string): Length | undefined {
  const m = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em)?$/i.exec(raw.trim());
  return m ? { n: Number(m[1]), unit: (m[2]?.toLowerCase() ?? '') as Length['unit'] } : undefined;
}
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** Panjang → px: px apa adanya, rem/em ×16, tanpa unit hanya 0. */
function lengthPx(raw: string): number | undefined {
  const l = parseLength(raw);
  if (!l) return undefined;
  if (l.unit === '') return l.n === 0 ? 0 : undefined;
  return round4(l.unit === 'px' ? l.n : l.n * REM_PX);
}

/** Konversi nilai mentah ke nilai token bertipe; undefined bila tidak sah untuk tipe itu (batas skema v3). */
function convert(type: TokenType, raw: string): CssTokenValue | undefined {
  switch (type) {
    case 'color':
      return parseCssColor(raw);
    case 'fontFamily':
      return familyItems(raw)?.[0];
    case 'fontWeight': {
      const k = raw.trim().toLowerCase();
      if (k === 'normal') return 400;
      if (k === 'bold') return 700;
      const n = /^\d+$/.test(k) ? Number(k) : NaN;
      return n >= 100 && n <= 900 && n % 100 === 0 ? n : undefined;
    }
    case 'lineHeight': {
      const l = parseLength(raw);
      if (!l || (l.unit !== 'px' && l.unit !== 'rem')) return undefined;
      const px = round4(l.unit === 'px' ? l.n : l.n * REM_PX);
      return px > 0 ? px : undefined;
    }
    case 'letterSpacing': {
      const l = parseLength(raw);
      if (!l) return undefined;
      if (l.unit === 'em') return l.n;
      return l.n === 0 ? 0 : undefined;
    }
    default: {
      const px = lengthPx(raw);
      return px !== undefined && px >= 0 ? px : undefined;
    }
  }
}

/** Tipe dari nilai dan petunjuk nama variabel (segmen `-`); undefined = tidak terpetakan. */
function guessType(body: string, raw: string): TokenType | undefined {
  if (parseCssColor(raw)) return 'color';
  const seg = body.split('-');
  const has = (...w: string[]) => w.some((x) => seg.includes(x));
  const pair = (a: string, b: string) => seg.some((x, i) => x === a && seg[i + 1] === b);
  const len = parseLength(raw);
  if (pair('font', 'weight') || has('weight', 'fw')) return 'fontWeight';
  if (pair('line', 'height') || has('leading', 'lh')) return 'lineHeight';
  if (pair('letter', 'spacing') || has('tracking')) return 'letterSpacing';
  if (pair('font', 'size') || has('text', 'fs')) return 'fontSize';
  if (has('radius', 'rounded')) return 'radius';
  if (has('breakpoint', 'bp', 'screen', 'screens')) return 'breakpoint';
  if (has('container')) return 'container';
  if (has('font', 'family', 'typeface')) return familyItems(raw) ? 'fontFamily' : len ? 'fontSize' : undefined;
  if (has('spacing', 'space', 'gap', 'padding', 'margin', 'inset', 'size')) return 'spacing';
  if (len && len.unit) return 'spacing';
  if (/["',]/.test(raw) && familyItems(raw)) return 'fontFamily';
  return undefined;
}

const TOKEN_TYPE_NAMES: readonly string[] = ['color', 'radius', 'spacing', 'container', 'breakpoint', 'fontFamily', 'fontWeight', 'fontSize', 'lineHeight', 'letterSpacing'];
const short = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}...` : s);

/** Nama token untuk variabel: token dokumen dengan variabel sama, lalu `-` → `.`, lalu apa adanya. */
function tokenNameFor(variable: string, existing: ReadonlyMap<string, string>): string | undefined {
  const hit = existing.get(variable);
  if (hit) return hit;
  const body = variable.slice(2);
  const ok = (n: string) => n.length <= TOKEN_NAME_MAX && CSS_IMPORT_TOKEN_NAME.test(n) && cssVarName(n) === variable;
  const dotted = body.replace(/-/g, '.');
  if (ok(dotted)) return dotted;
  return ok(body) ? body : undefined;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse stylesheet CSS variables menjadi token bertipe (aturan lengkap: spec-token-2-read-api). Blok `:root`/`html`/
 * `:host` = nilai default (`value`), `[data-theme=X]` = nilai mode `X`. `opts` = keadaan dokumen: nama token yang
 * sudah ada dipakai ulang (status `update`), dan `tokenModes` dipakai untuk rencana mode.
 */
export function parseCssVariables(css: string, opts: CssVariablesParseOptions = {}): CssVariablesImport {
  const skipped: CssVariableSkip[] = [];
  const seenSkip = new Set<string>();
  const skip = (source: string, reason: CssVariableSkipReason, detail: string) => {
    const key = `${source}\u0000${reason}`;
    if (seenSkip.has(key)) return;
    seenSkip.add(key);
    skipped.push({ source, reason, detail });
  };
  const root = new Map<string, string>();
  const modeVals = new Map<string, Map<string, string>>();
  const found: string[] = [];
  const order = new Set<string>();
  let rootMode: string | undefined;

  const { rules, atRules } = topRules(stripComments(css));
  for (const at of atRules) skip(short(at), 'unsupported-selector', 'At-rules are not imported; move variables to :root or [data-theme] blocks.');
  for (const rule of rules) {
    const targets: Target[] = [];
    for (const sel of splitTop(rule.selector, ',').map((s) => s.trim()).filter(Boolean)) {
      const t = classify(sel);
      if (t === 'unsupported-selector') skip(short(sel), t, 'Only :root and [data-theme="…"] blocks are imported.');
      else if (t === 'invalid-mode') skip(short(sel), t, 'Mode names must use lowercase letters, digits and hyphens (max 32).');
      else targets.push(t);
    }
    if (!targets.length) continue;
    const isRoot = targets.some((t) => t.kind === 'root');
    for (const t of targets) {
      if (t.kind !== 'mode') continue;
      if (!found.includes(t.mode)) found.push(t.mode);
      if (isRoot && rootMode === undefined) rootMode = t.mode;
    }
    for (const decl of splitTop(rule.body, ';')) {
      const colon = decl.indexOf(':');
      if (colon < 0) continue;
      const prop = decl.slice(0, colon).trim();
      if (!prop.startsWith('--') || decl.includes('{')) continue;
      const value = decl
        .slice(colon + 1)
        .replace(/\s*!\s*important\s*$/i, '')
        .trim();
      order.add(prop);
      for (const t of targets) {
        if (t.kind === 'root') root.set(prop, value);
        else {
          if (!modeVals.has(t.mode)) modeVals.set(t.mode, new Map());
          modeVals.get(t.mode)!.set(prop, value);
        }
      }
    }
  }

  const hasRoot = root.size > 0;
  // Root tanpa mode senama: root = mode `light` bila CSS punya blok light (nilai light yang beda masuk modes.light).
  const defaultMode = rootMode ?? (hasRoot ? (found.includes('light') ? 'light' : undefined) : found[0]);
  const existing = opts.tokens ?? {};
  const existingByVar = new Map<string, string>();
  for (const n of Object.keys(existing)) if (!existingByVar.has(cssVarName(n))) existingByVar.set(cssVarName(n), n);

  /** Nilai mentah variabel di satu mode (undefined = root), dengan alias `var(--x)` di-resolve. */
  const rawOf = (prop: string, mode: string | undefined, depth = 0): string | undefined | null => {
    const v = (mode !== undefined ? modeVals.get(mode)?.get(prop) : undefined) ?? root.get(prop);
    if (v === undefined) return undefined;
    const alias = /^var\(\s*(--[A-Za-z0-9_-]+)\s*\)$/.exec(v);
    if (!alias) return v;
    if (depth >= ALIAS_DEPTH) return null;
    return rawOf(alias[1]!, mode, depth + 1) ?? null;
  };

  const entries: CssVariableEntry[] = [];
  for (const variable of order) {
    const body = variable.slice(2);
    if (!VAR_BODY.test(body)) {
      skip(variable, 'invalid-name', 'Variable names must use lowercase letters, digits and hyphens.');
      continue;
    }
    const token = tokenNameFor(variable, existingByVar);
    if (!token) {
      skip(variable, 'invalid-name', 'This variable name cannot become a token name.');
      continue;
    }
    // Nilai per sumber: root (bila ada) lalu setiap mode yang mendefinisikan variabel ini sendiri.
    const sources: { mode: string | undefined; raw: string | null }[] = [];
    if (root.has(variable)) sources.push({ mode: undefined, raw: rawOf(variable, undefined) ?? null });
    // Alias root (`--b: var(--a)`) mengikuti nilai `--a` di setiap mode, seperti cascade CSS.
    const rootAlias = /^var\(/.test(root.get(variable) ?? '');
    for (const m of found) if (rootAlias || modeVals.get(m)?.has(variable)) sources.push({ mode: m, raw: rawOf(variable, m) ?? null });
    if (sources.some((s) => s.raw === null)) {
      skip(variable, 'unsupported-value', 'References an unknown variable.');
      continue;
    }
    const raws = sources as { mode: string | undefined; raw: string }[];
    if (raws.some((s) => !s.raw)) {
      skip(variable, 'unsupported-value', 'Empty value.');
      continue;
    }
    const oldType = existing[token]?.type;
    let guessed: TokenType | undefined =
      oldType !== undefined && TOKEN_TYPE_NAMES.includes(oldType) && raws.every((s) => convert(oldType as TokenType, s.raw) !== undefined) ? (oldType as TokenType) : undefined;
    guessed ??= guessType(body, raws[0]!.raw);
    const type = guessed;
    if (!type) {
      skip(variable, 'unsupported-value', `"${short(raws[0]!.raw)}" is not a supported token value.`);
      continue;
    }
    const values = raws.map((s) => ({ mode: s.mode, value: convert(type, s.raw) }));
    const bad = values.findIndex((v) => v.value === undefined);
    if (bad === 0) {
      const unitless = type === 'lineHeight' && parseLength(raws[0]!.raw)?.unit === '';
      skip(variable, 'unsupported-value', unitless ? 'Unitless line-height needs a font size; use px or rem.' : `"${short(raws[0]!.raw)}" is not a valid ${type} value.`);
      continue;
    }
    if (bad > 0) {
      skip(variable, 'mixed-values', `Value for mode "${values[bad]!.mode}" is not a valid ${type} value.`);
      continue;
    }
    const byMode = new Map(values.filter((v) => v.mode !== undefined).map((v) => [v.mode!, v.value!]));
    const rootValue = values.find((v) => v.mode === undefined)?.value;
    // Token dokumen bertipe sama digabung (keputusan review): nilai yang disebut CSS menimpa, mode yang tidak
    // disebut CSS tetap, dan `value` lama dipakai bila CSS tidak punya nilai root untuk variabel ini.
    const old = existing[token];
    const keep = old !== undefined && old.type === type;
    const value = rootValue ?? (keep ? old.value : undefined) ?? (defaultMode !== undefined ? byMode.get(defaultMode) : undefined) ?? values[0]!.value!;
    const modes: Record<string, CssTokenValue> = keep && old.modes ? { ...old.modes } : {};
    for (const m of found) {
      const v = byMode.get(m);
      if (v !== undefined) modes[m] = v;
      else if (rootValue !== undefined) delete modes[m];
    }
    for (const m of Object.keys(modes)) if (modes[m] === value) delete modes[m];
    entries.push({ variable, token, type, value, ...(Object.keys(modes).length ? { modes } : {}), status: Object.hasOwn(existing, token) ? 'update' : 'new' });
  }

  return { entries, tokenModes: planModes(opts.modes, found, defaultMode), skipped };
}

/** Rencana `tokenModes` (null = tidak berubah); lihat Boundaries spec-token-2-read-api. */
function planModes(existing: readonly string[] | undefined, found: readonly string[], defaultMode: string | undefined): string[] | null {
  if (!found.length) return null;
  if (existing && existing.length) {
    const add = [...(defaultMode !== undefined ? [defaultMode] : []), ...found].filter((m, i, a) => !existing.includes(m) && a.indexOf(m) === i);
    return add.length ? [...existing, ...add] : null;
  }
  const d = defaultMode ?? 'light';
  return [d, ...found.filter((m) => m !== d)];
}
