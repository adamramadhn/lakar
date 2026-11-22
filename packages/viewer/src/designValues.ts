// Nilai panel Design (editor-canvas story 5): parsing teks kolom → nilai skema dan format nilai skema → teks kolom.
// Murni (tanpa DOM/React) supaya bisa dites. Semantik mengikuti skema v3 dan render css.ts (AD-1, AD-5):
// `lineHeight` px, `letterSpacing` pecahan em, warna hex `#RRGGBB[AA]`, padding 1/2/4 nilai.

export type TokenRef = { $token: string };

/** Nilai berbentuk ref token `{$token: nama}` (AD-11). */
export const isTokenRef = (v: unknown): v is TokenRef =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && typeof (v as { $token?: unknown }).$token === 'string';

/** Bulatkan ke 2 desimal (tampilan dan hasil scrub). */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Angka → teks kolom (maks 2 desimal, tanpa nol di belakang). */
export const formatNumber = (n: number): string => String(round2(n));

export type NumberRules = { min?: number; max?: number; int?: boolean };

/** Teks kolom → angka. Menerima satuan `px` di belakang. Kosong/tak valid/di luar batas → undefined. */
export function parseNumber(text: string, rules: NumberRules = {}): number | undefined {
  const t = text.trim().replace(/px$/i, '').trim();
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return undefined;
  let n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  if (rules.int) n = Math.round(n);
  if (rules.min !== undefined && n < rules.min) return undefined;
  if (rules.max !== undefined && n > rules.max) return undefined;
  return n;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** `50%` / `50` → 0.5 (di-clamp 0–1). Tak valid → undefined. */
export function parsePercent(text: string): number | undefined {
  const n = parseNumber(text.trim().replace(/%$/, ''));
  return n === undefined ? undefined : clamp01(round2(n) / 100);
}

/** 0.5 → `50%`. */
export const formatPercent = (unit: number): string => `${Math.round(unit * 100)}%`;

/** Teks hex (3/6/8 digit, boleh tanpa `#`) → `#RRGGBB` / `#RRGGBBAA` huruf besar. */
export function parseHex(text: string): string | undefined {
  const t = text.trim().replace(/^#/, '');
  if (!/^([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(t)) return undefined;
  const full = t.length === 3 ? [...t].map((c) => c + c).join('') : t;
  return `#${full.toUpperCase()}`;
}

/** `#RRGGBB[AA]` → `{hex: 'RRGGBB', alpha: 0..1}`; bukan hex → undefined. */
export function splitHex(color: unknown): { hex: string; alpha: number } | undefined {
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color)) return undefined;
  const hex = color.slice(1, 7).toUpperCase();
  const alpha = color.length === 9 ? round2(parseInt(color.slice(7, 9), 16) / 255) : 1;
  return { hex, alpha };
}

/** Hex 6 digit (dengan/tanpa `#`) + alpha → `#RRGGBB` (alpha 1) atau `#RRGGBBAA`. */
export function joinHex(hex: string, alpha: number): string {
  const h = hex.replace(/^#/, '').slice(0, 6).toUpperCase();
  const a = clamp01(alpha);
  if (a >= 1) return `#${h}`;
  return `#${h}${Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase()}`;
}

/** Ganti bagian RGB warna, pertahankan byte alpha lama apa adanya (input 8 digit menang). */
export function withHex(prev: unknown, nextHex: string): string {
  const next = parseHex(nextHex);
  if (!next) return nextHex;
  if (next.length === 9) return next;
  // Byte alpha disalin, bukan dibangun ulang dari alpha terbulatkan (mis. 0x81 tidak boleh jadi 0x82).
  return typeof prev === 'string' && splitHex(prev) && prev.length === 9 ? `${next}${prev.slice(7, 9).toUpperCase()}` : next;
}

/**
 * Warna baru dari perubahan hex (alpha lama dipertahankan) atau alpha (RGB lama dipertahankan) terhadap warna
 * resolve `prev`; `prev` bukan hex (token tak ter-resolve, kosong) dianggap `#000000`. Hex tak valid → undefined.
 */
export function changeColor(prev: unknown, change: { hex?: string; alpha?: number }): string | undefined {
  if (change.hex !== undefined) return parseHex(change.hex) ? withHex(prev, change.hex) : undefined;
  if (change.alpha !== undefined) return joinHex(splitHex(prev)?.hex ?? '000000', change.alpha);
  return undefined;
}

type Pad = number | TokenRef;
export type PaddingValue = Pad | [Pad, Pad] | [Pad, Pad, Pad, Pad];

const TOKEN_TEXT = /^\$([a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*)$/;

/**
 * `8` | `8 16` | `8 16 8 16` (pemisah spasi/koma) → padding skema; `$nama` = ref token (bentuk tampil `formatPadding`,
 * jadi sisi bertoken tetap ref saat sisi lain diedit). 3 nilai/negatif/tak valid → undefined.
 */
export function parsePadding(text: string): PaddingValue | undefined {
  const parts = text.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length !== 1 && parts.length !== 2 && parts.length !== 4) return undefined;
  const nums = parts.map((p): Pad | undefined => {
    const tok = TOKEN_TEXT.exec(p);
    return tok ? { $token: tok[1]! } : parseNumber(p, { min: 0 });
  });
  if (nums.some((n) => n === undefined)) return undefined;
  const v = nums as Pad[];
  if (v.length === 1) return v[0]!;
  if (v.length === 2) return [v[0]!, v[1]!];
  return [v[0]!, v[1]!, v[2]!, v[3]!];
}

/** Padding skema → teks (`8 16`); token di dalam tuple → `$nama`. */
export function formatPadding(v: unknown): string {
  const one = (x: unknown) => (typeof x === 'number' ? formatNumber(x) : isTokenRef(x) ? `$${x.$token}` : '0');
  if (Array.isArray(v)) return v.map(one).join(' ');
  return v === undefined ? '0' : one(v);
}

export type ShadowSpec = { type: 'drop' | 'inner'; x: number; y: number; blur: number; spread?: number };

/** `[drop|inner] x y blur [spread]` → bagian geometri shadow; blur negatif/tak valid → undefined. */
export function parseShadow(text: string, fallbackType: 'drop' | 'inner' = 'drop'): ShadowSpec | undefined {
  const parts = text.trim().split(/[\s,]+/).filter(Boolean);
  let type = fallbackType;
  const head = parts[0]?.toLowerCase();
  if (head === 'drop' || head === 'inner') {
    type = head;
    parts.shift();
  }
  if (parts.length !== 3 && parts.length !== 4) return undefined;
  const nums = parts.map((p) => parseNumber(p));
  if (nums.some((n) => n === undefined)) return undefined;
  const [x, y, blur, spread] = nums as number[];
  if (blur! < 0) return undefined;
  return { type, x: x!, y: y!, blur: blur!, ...(spread !== undefined ? { spread } : {}) };
}

/** Shadow → `Drop  0 8 24` (spread hanya bila ada dan bukan 0). */
export function formatShadow(s: { type?: string | undefined; x?: unknown; y?: unknown; blur?: unknown; spread?: unknown }): string {
  const n = (v: unknown) => (typeof v === 'number' ? formatNumber(v) : '0');
  const label = s.type === 'inner' ? 'Inner' : 'Drop';
  const spread = typeof s.spread === 'number' && s.spread !== 0 ? ` ${n(s.spread)}` : '';
  return `${label}  ${n(s.x)} ${n(s.y)} ${n(s.blur)}${spread}`;
}

/** Nama bobot font untuk Select Weight. */
export const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi Bold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
};

/** Persamaan dalam (JSON-like): dipakai untuk "Mixed" dan melewati patch tanpa perubahan. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => sameValue(x, bb[i]));
  }
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
