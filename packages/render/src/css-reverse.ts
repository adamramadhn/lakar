// Tabel kebalikan pemetaan CSS (AD-5, AD-15): nilai CSS (computed style Chromium, atau nilai tertulis untuk track
// grid) → nilai skema Lakar. Dipakai importer paste HTML di daemon; berada di sebelah `css.ts` supaya setiap arah
// pemetaan ditulis sekali. Murni: tanpa IO, tanpa DOM. Nilai yang tidak terpetakan → undefined (pemanggil
// melaporkannya). Format computed Chromium: warna `rgb()/rgba()`, panjang `px`, bayangan "warna x y blur spread".
import { ALIGN, JUSTIFY } from './css.js';
import { parseCssColor } from './css-vars.js';

const round = (n: number, d = 2): number => {
  const v = +n.toFixed(d);
  return Object.is(v, -0) ? 0 : v;
};

/** Pecah `s` pada `sep` di level atas (di luar kurung dan kutip). */
export function splitTopLevel(s: string, sep: ',' | ' '): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (sep === ' ' ? /\s/.test(ch) : ch === sep)) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  // Spasi: token kosong (spasi beruntun) dibuang; koma: bagian kosong dipertahankan (pemanggil menolaknya).
  return sep === ' ' ? out.filter(Boolean) : out.length === 1 && out[0] === '' ? [] : out;
}

/** Panjang `Npx` (atau `0`) → angka px; selain itu undefined. */
export function cssPx(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const m = /^(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(px)?$/i.exec(v.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || (!m[2] && n !== 0)) return undefined;
  return round(n, 4);
}

/** Warna CSS → hex skema (`#RRGGBB`/`#RRGGBBAA`); `transparent` → `#00000000`; tak terpetakan → undefined. */
export function cssColorHex(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const s = v.trim().toLowerCase();
  if (s === 'transparent') return '#00000000';
  return parseCssColor(s);
}

/** Hex dengan alpha 00 (tidak terlihat). */
export const isClearHex = (hex: string): boolean => /^#[0-9A-F]{6}00$/i.test(hex);

export type ShadowValue = { type?: 'inner'; x: number; y: number; blur: number; spread?: number; color: string };

function shadowList(v: string, withSpread: boolean): ShadowValue[] | undefined {
  const s = v.trim();
  if (s === 'none' || s === '') return [];
  const out: ShadowValue[] = [];
  for (const item of splitTopLevel(s, ',')) {
    const parts = splitTopLevel(item, ' ');
    let color: string | undefined;
    let inset = false;
    const lens: number[] = [];
    for (const p of parts) {
      if (p === 'inset') inset = true;
      else if (cssPx(p) !== undefined) lens.push(cssPx(p)!);
      else if (color === undefined && cssColorHex(p)) color = cssColorHex(p);
      else return undefined;
    }
    if (lens.length < 2 || lens.length > (withSpread ? 4 : 3) || (inset && !withSpread)) return undefined;
    const blur = lens[2] ?? 0;
    if (blur < 0) return undefined;
    const sh: ShadowValue = { x: lens[0]!, y: lens[1]!, blur, color: color ?? '#000000' };
    if (inset) sh.type = 'inner';
    if (withSpread && lens[3]) sh.spread = lens[3];
    if (!isClearHex(sh.color)) out.push(sh);
  }
  return out;
}

/** `box-shadow` computed → bayangan skema (urutan sama; pertama di atas). `none` → []; tak terpetakan → undefined. */
export const boxShadowsFromCss = (v: string): ShadowValue[] | undefined => shadowList(v, true);

/** `text-shadow` computed → bayangan drop skema; tak terpetakan → undefined. */
export const textShadowsFromCss = (v: string): ShadowValue[] | undefined => shadowList(v, false);

export type StopValue = { offset: number; color: string };
export type GradientFill = { type: 'linear'; angle: number; stops: StopValue[] } | { type: 'conic'; angle?: number; center?: [number, number]; stops: StopValue[] };

/** Stop gradien CSS (`warna [p%] [p%]`) → stop skema; posisi hilang diinterpolasi seperti CSS. */
function parseStops(items: readonly string[]): StopValue[] | undefined {
  const raw: { color: string; at?: number }[] = [];
  for (const it of items) {
    const parts = splitTopLevel(it, ' ');
    const color = cssColorHex(parts[0]);
    if (!color) return undefined;
    const pos = parts.slice(1).map((p) => (/^-?\d*\.?\d+%$/.test(p) ? Number(p.slice(0, -1)) / 100 : NaN));
    if (pos.some((p) => !Number.isFinite(p))) return undefined;
    if (!pos.length) raw.push({ color });
    else for (const p of pos) raw.push({ color, at: p });
  }
  if (raw.length < 2) return undefined;
  if (raw[0]!.at === undefined) raw[0]!.at = 0;
  if (raw[raw.length - 1]!.at === undefined) raw[raw.length - 1]!.at = 1;
  // Posisi monoton (CSS: posisi lebih kecil dari sebelumnya dinaikkan), lalu isi celah secara merata.
  let max = -Infinity;
  for (const r of raw) if (r.at !== undefined) r.at = max = Math.max(max, r.at);
  for (let i = 0; i < raw.length; i++) {
    if (raw[i]!.at !== undefined) continue;
    let j = i;
    while (raw[j]!.at === undefined) j++;
    const a = raw[i - 1]!.at!;
    const b = raw[j]!.at!;
    for (let k = i; k < j; k++) raw[k]!.at = a + ((b - a) * (k - i + 1)) / (j - i + 1);
  }
  if (raw.some((r) => r.at! < 0 || r.at! > 1)) return undefined;
  return raw.map((r) => ({ offset: round(r.at!, 4), color: r.color }));
}

/** Sudut CSS (`90deg`, `0.25turn`, `1.57rad`, `100grad`) → derajat. */
function angleDeg(s: string): number | undefined {
  const m = /^(-?\d*\.?\d+)(deg|turn|rad|grad)$/.exec(s.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  const k = m[2] === 'deg' ? 1 : m[2] === 'turn' ? 360 : m[2] === 'grad' ? 0.9 : 180 / Math.PI;
  return round(n * k, 4);
}

/** Arah `to <sisi|sudut>` → sudut CSS; sudut bergantung rasio kotak (garis 0%/100% melewati sudut kotak). */
function toDirection(words: string, box: { w: number; h: number }): number | undefined {
  const w = words.trim().split(/\s+/).sort().join(' ');
  const side: Record<string, number> = { top: 0, right: 90, bottom: 180, left: 270 };
  if (side[w] !== undefined) return side[w];
  const a = (Math.atan2(Math.max(box.h, 1e-9), Math.max(box.w, 1e-9)) * 180) / Math.PI;
  const corner: Record<string, number> = { 'right top': a, 'bottom right': 180 - a, 'bottom left': 180 + a, 'left top': 360 - a };
  return corner[w] !== undefined ? round(corner[w]!, 4) : undefined;
}

/** Persen posisi (`50%`, `left`, `center`, …) → pecahan 0..1. */
function positionFrac(s: string, axis: 'x' | 'y'): number | undefined {
  const k: Record<string, number> = axis === 'x' ? { left: 0, center: 0.5, right: 1 } : { top: 0, center: 0.5, bottom: 1 };
  if (k[s] !== undefined) return k[s];
  return /^-?\d*\.?\d+%$/.test(s) ? Number(s.slice(0, -1)) / 100 : undefined;
}

/**
 * Satu lapisan `background-image` gradien → fill skema: `linear-gradient` (sudut atau `to …`) dan `conic-gradient`
 * (`from`, `at` persen). Radial/repeating/url → undefined (pemanggil melaporkan atau menanganinya sendiri).
 */
export function gradientFromCss(layer: string, box: { w: number; h: number }): GradientFill | undefined {
  const m = /^(linear|conic)-gradient\((.*)\)$/s.exec(layer.trim());
  if (!m) return undefined;
  const args = splitTopLevel(m[2]!, ',');
  if (m[1] === 'linear') {
    let angle = 180;
    const first = args[0] ?? '';
    if (first.startsWith('to ')) {
      const a = toDirection(first.slice(3), box);
      if (a === undefined) return undefined;
      angle = a;
      args.shift();
    } else if (angleDeg(first) !== undefined) {
      angle = angleDeg(first)!;
      args.shift();
    }
    const stops = parseStops(args);
    return stops ? { type: 'linear', angle, stops } : undefined;
  }
  const head = args[0] ?? '';
  let angle: number | undefined;
  let center: [number, number] | undefined;
  if (/^(from|at)\s/.test(head)) {
    const fm = /^(?:from\s+(\S+))?\s*(?:at\s+(\S+)(?:\s+(\S+))?)?$/.exec(head);
    if (!fm) return undefined;
    if (fm[1]) {
      angle = angleDeg(fm[1]);
      if (angle === undefined) return undefined;
    }
    if (fm[2]) {
      const x = positionFrac(fm[2], 'x');
      const y = positionFrac(fm[3] ?? 'center', 'y');
      if (x === undefined || y === undefined || x < 0 || x > 1 || y < 0 || y > 1) return undefined;
      center = [round(x, 4), round(y, 4)];
    }
    args.shift();
  }
  const stops = parseStops(args);
  if (!stops) return undefined;
  return { type: 'conic', ...(angle ? { angle } : {}), ...(center && (center[0] !== 0.5 || center[1] !== 0.5) ? { center } : {}), stops };
}

/**
 * Empat sudut `border-*-radius` computed (`8px`, `8px 4px`, `50%`) → radius skema (angka bila sama, selain itu
 * `[tl, tr, br, bl]`). Persen dihitung dari kotak; sudut elips memakai sumbu terkecil (`lossy`).
 */
export function radiusFromCss(corners: readonly string[], box: { w: number; h: number }): { radius?: number | [number, number, number, number]; lossy: boolean } {
  let lossy = false;
  const px = (s: string, size: number) => (/^-?\d*\.?\d+%$/.test(s) ? (Number(s.slice(0, -1)) / 100) * size : cssPx(s));
  const vals = corners.map((c) => {
    const [a = '0px', b = a] = c.trim().split(/\s+/);
    const x = px(a, box.w);
    const y = px(b, box.h);
    if (x === undefined || y === undefined) {
      lossy = true;
      return 0;
    }
    if (Math.abs(x - y) > 0.5) lossy = true;
    return round(Math.max(0, Math.min(x, y)));
  });
  if (vals.length !== 4 || vals.every((v) => v === 0)) return { lossy };
  return { radius: vals.every((v) => v === vals[0]) ? vals[0]! : [vals[0]!, vals[1]!, vals[2]!, vals[3]!], lossy };
}

const invert = (m: Readonly<Record<string, string>>): Record<string, string> => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));

/** `align-items` computed → `align` skema (kebalikan `ALIGN`); `normal`/`stretch` → `stretch`. */
export function alignFromCss(v: string): string | undefined {
  const s = v.trim().replace(/^(safe|unsafe)\s+/, '');
  // `flow-start`/`flow-end`: serialisasi computed Chromium untuk `flex-start`/`flex-end` pada align-self.
  const alias: Record<string, string> = { normal: 'stretch', start: 'start', 'self-start': 'start', 'flow-start': 'start', end: 'end', 'self-end': 'end', 'flow-end': 'end' };
  return invert(ALIGN)[s] ?? alias[s];
}

/** `justify-content` computed → `justify` skema (kebalikan `JUSTIFY`); `normal`/`start`/`left` → `start`. */
export function justifyFromCss(v: string): string | undefined {
  const s = v.trim().replace(/^(safe|unsafe)\s+/, '');
  const alias: Record<string, string> = { normal: 'start', start: 'start', left: 'start', 'flow-start': 'start', end: 'end', right: 'end', 'flow-end': 'end' };
  return invert(JUSTIFY)[s] ?? alias[s];
}

export type TrackValue = number | 'auto' | { fr: number } | { minmax: [number | 'auto', number | 'auto' | { fr: number }] };

/** Satu ukuran track tertulis (`120px`, `1fr`, `auto`, `0`). */
function trackSize(s: string): number | 'auto' | { fr: number } | undefined {
  if (s === 'auto') return 'auto';
  const fr = /^(\d*\.?\d+)fr$/.exec(s);
  if (fr) return Number(fr[1]) > 0 ? { fr: round(Number(fr[1]), 4) } : undefined;
  const px = cssPx(s);
  return px !== undefined && px >= 0 ? px : undefined;
}

/**
 * Template grid tertulis (`repeat(3, 1fr)`, `200px minmax(0, 1fr) auto`) → track skema (kebalikan `gridTemplateCss`).
 * Nama garis, `auto-fill`/`auto-fit`, persen, dan fungsi lain → undefined. Maks `max` track.
 */
export function gridTemplateFromCss(v: string, max = 24): TrackValue[] | undefined {
  const s = v.trim();
  if (!s || s === 'none') return undefined;
  const out: TrackValue[] = [];
  const one = (tok: string): TrackValue | undefined => {
    const mm = /^minmax\((.*)\)$/.exec(tok);
    if (mm) {
      const [a, b, extra] = splitTopLevel(mm[1]!, ',');
      if (a === undefined || b === undefined || extra !== undefined) return undefined;
      const lo = trackSize(a);
      const hi = trackSize(b);
      if (lo === undefined || hi === undefined || typeof lo === 'object') return undefined;
      return { minmax: [lo, hi] };
    }
    return trackSize(tok);
  };
  for (const tok of splitTopLevel(s, ' ')) {
    const rep = /^repeat\((.*)\)$/.exec(tok);
    if (rep) {
      const [count, ...rest] = splitTopLevel(rep[1]!, ',');
      const n = /^\d+$/.test(count ?? '') ? Number(count) : NaN;
      if (!(n >= 1) || rest.length !== 1) return undefined;
      const inner = splitTopLevel(rest[0]!, ' ').map(one);
      if (inner.some((x) => x === undefined)) return undefined;
      // Cek batas sebelum mengisi: `repeat(10000000, 1fr)` tidak boleh membangun jutaan track.
      if (out.length + n * inner.length > max) return undefined;
      for (let i = 0; i < n; i++) out.push(...(inner as TrackValue[]));
    } else {
      const t = one(tok);
      if (t === undefined) return undefined;
      out.push(t);
    }
    if (out.length > max) return undefined;
  }
  return out.length ? out : undefined;
}

/** Template computed (track terpakai, `258.6px 258.7px`) → track px; selain px → undefined. */
export function gridTracksFromPx(v: string, max = 24): number[] | undefined {
  const parts = splitTopLevel(v.trim(), ' ');
  if (!parts.length || parts.length > max) return undefined;
  const px = parts.map(cssPx);
  return px.every((x) => x !== undefined && x >= 0) ? (px as number[]).map((x) => round(x)) : undefined;
}

export type PlacementValue = { start?: number; end?: number; span?: number };

/** `grid-*-start` + `grid-*-end` computed → penempatan skema (kebalikan `gridLineCss`); `auto/auto` → {}; nama → undefined. */
export function gridPlacementFromCss(start: string, end: string): PlacementValue | undefined {
  // Batas skema GridPlacement (garis ±25, span ≤ 24); di luar itu → undefined (importer jatuh ke posisi tetap).
  const line = (s: string) => (/^-?\d+$/.test(s) && Number(s) !== 0 && Math.abs(Number(s)) <= 25 ? Number(s) : undefined);
  const span = (s: string) => {
    const m = /^span (\d+)$/.exec(s);
    return m && Number(m[1]) >= 1 && Number(m[1]) <= 24 ? Number(m[1]) : undefined;
  };
  const a = start.trim();
  const b = end.trim();
  const out: PlacementValue = {};
  if (a !== 'auto') {
    if (line(a) !== undefined) out.start = line(a)!;
    else if (span(a) !== undefined && b === 'auto') return { span: span(a)! };
    else return undefined;
  }
  if (b !== 'auto') {
    if (line(b) !== undefined) out.end = line(b)!;
    else if (span(b) !== undefined) out.span = span(b)!;
    else return undefined;
  }
  return out;
}

/** Nilai `mix-blend-mode` yang punya padanan `blend` skema (nama CSS sama). */
export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const;

export const blendFromCss = (v: string): string | undefined => ((BLEND_MODES as readonly string[]).includes(v.trim()) ? v.trim() : undefined);

/** `filter`/`backdrop-filter` → blur skema (2σ, kebalikan `effectDecls`); `none` → 0; fungsi lain → undefined. */
export function blurFromFilterCss(v: string): number | undefined {
  const s = v.trim();
  if (s === 'none' || s === '') return 0;
  const m = /^blur\(([^)]*)\)$/.exec(s);
  const px = m ? cssPx(m[1]) : undefined;
  return px !== undefined && px >= 0 ? round(px * 2, 4) : undefined;
}

/** `transform` computed → rotasi derajat (matrix rotasi murni tanpa translasi/skala); `none` → 0; lainnya undefined. */
export function rotationFromTransformCss(v: string): number | undefined {
  const s = v.trim();
  if (s === 'none') return 0;
  const m = /^matrix\(([^)]*)\)$/.exec(s);
  if (!m) return undefined;
  const n = m[1]!.split(',').map((x) => Number(x.trim()));
  if (n.length !== 6 || n.some((x) => !Number.isFinite(x))) return undefined;
  const [a, b, c, d, e, f] = n as [number, number, number, number, number, number];
  const eps = 1e-4;
  if (Math.abs(a - d) > eps || Math.abs(b + c) > eps || Math.abs(a * a + b * b - 1) > 1e-3 || Math.abs(e) > eps || Math.abs(f) > eps) return undefined;
  return round((Math.atan2(b, a) * 180) / Math.PI, 2);
}

/** `font-weight` computed (1..1000) → kelipatan 100 terdekat (100..900). */
export function fontWeightFromCss(v: string): number | undefined {
  const n = Number(v.trim());
  if (!Number.isFinite(n) || n < 1 || n > 1000) return undefined;
  return Math.min(900, Math.max(100, Math.round(n / 100) * 100));
}

/** `letter-spacing` px → pecahan ukuran font (kebalikan `letterSpacingCss`); `normal`/0 → undefined. */
export function letterSpacingFromCss(v: string, size: number): number | undefined {
  const px = cssPx(v);
  return px && size > 0 ? round(px / size, 4) : undefined;
}

/** `line-height` computed px → lineHeight skema (kebalikan `lineHeightCss`); `normal` → undefined. */
export function lineHeightFromCss(v: string): number | undefined {
  const px = cssPx(v);
  return px !== undefined && px > 0 ? round(px, 2) : undefined;
}

/** `text-align` computed → align teks skema; `start`/`left` → undefined (default). */
export function textAlignFromCss(v: string): 'center' | 'right' | 'justify' | undefined {
  const s = v.trim();
  if (s === 'center' || s === '-webkit-center') return 'center';
  if (s === 'right' || s === 'end' || s === '-webkit-right') return 'right';
  if (s === 'justify') return 'justify';
  return undefined;
}
