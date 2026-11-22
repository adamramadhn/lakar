// Pemetaan CSS tunggal (AD-5): nilai node → nilai CSS, ditulis sekali di sini dan dipakai render
// (paint.ts, layout.ts), Copy as di viewer, dan nanti codegen. Murni: tanpa IO, tanpa DOM.
// Nilai literal dipetakan langsung; ref `{$token}` → `var(--…)` lewat satu fungsi nama variabel (AD-11).
// Render selalu mengirim nilai ter-resolve; Copy as/codegen boleh mengirim ref token atau nilai yang belum
// tervalidasi, jadi setiap fungsi menerima `unknown` dan mengembalikan undefined untuk nilai yang tak terpetakan.
// Format angka mengikuti render: angka apa adanya, tanpa pembulatan.

/** Referensi token tersimpan (`{$token:"colors.primary"}`). */
export type TokenRef = { readonly $token: string };

/** Deklarasi CSS `[properti, nilai]`. */
export type CssDecl = [prop: string, value: string];

export const isTokenRef = (v: unknown): v is TokenRef =>
  typeof v === 'object' && v !== null && typeof (v as { $token?: unknown }).$token === 'string';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Nama variabel CSS token: `colors.text-primary` → `--colors-text-primary` (AD-11). */
export const cssVarName = (token: string): string => `--${token.replace(/\./g, '-')}`;

/** Ref token → `var(--…)`. */
export const tokenVar = (token: string | TokenRef): string => `var(${cssVarName(typeof token === 'string' ? token : token.$token)})`;

/** Panjang: angka → `Npx`, token → var(); selain itu undefined. */
export function lengthCss(v: unknown): string | undefined {
  if (isNum(v)) return `${v}px`;
  if (isTokenRef(v)) return tokenVar(v);
  return undefined;
}

/** Warna: hex apa adanya (3 digit diperluas ke 6), token → var(); bukan string → undefined. */
export function colorCss(v: unknown): string | undefined {
  if (isTokenRef(v)) return tokenVar(v);
  if (typeof v !== 'string') return undefined;
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : v;
}

/** Pecahan 0..1 → persen (presisi 4 desimal, sama dengan render); bukan angka → `0%`. */
export const percentCss = (n: unknown): string => (isNum(n) ? `${+(n * 100).toFixed(4)}%` : '0%');

export type StopLike = { readonly offset?: unknown; readonly color?: unknown };

/** Stops gradien → `c1 o1%, c2 o2%`; warna tak terpetakan → `transparent`. */
export function stopsCss(stops: readonly StopLike[] | undefined): string {
  return (stops ?? []).map((s) => `${colorCss(s.color) ?? 'transparent'} ${percentCss(s.offset)}`).join(', ');
}

/** Titik pusat relatif kotak `[x, y]` → `x% y%`; tanpa pusat → tengah. */
const centerCss = (c: unknown): string => (Array.isArray(c) ? `${percentCss(c[0])} ${percentCss(c[1])}` : '50% 50%');

export type PaintLike = {
  readonly type?: unknown;
  readonly color?: unknown;
  readonly angle?: unknown;
  readonly center?: unknown;
  readonly radius?: unknown;
  readonly stops?: readonly StopLike[] | undefined;
};

/**
 * Satu fill solid/linear/radial/conic → satu lapisan CSS `background`; tipe lain (noise, mesh, image) → undefined
 * (milik paint.ts). `solo`: solid ditulis sebagai warna polos (satu-satunya lapisan, untuk kode); default
 * `linear-gradient(c, c)` seperti render (lapisan gambar yang bisa ditumpuk).
 */
export function gradientLayerCss(f: PaintLike, opts: { solo?: boolean } = {}): string | undefined {
  switch (f.type) {
    case 'solid': {
      const c = colorCss(f.color);
      if (!c) return undefined;
      return opts.solo ? c : `linear-gradient(${c}, ${c})`;
    }
    case 'linear':
      // Sudut CSS: 0 = ke atas, 90 = ke kanan, searah jarum jam.
      return `linear-gradient(${isNum(f.angle) ? f.angle : 180}deg, ${stopsCss(f.stops)})`;
    case 'radial': {
      const r = percentCss(isNum(f.radius) ? f.radius : 0.5);
      return `radial-gradient(${r} ${r} at ${centerCss(f.center)}, ${stopsCss(f.stops)})`;
    }
    case 'conic':
      // Sudut: 0 = atas, searah jarum jam (sama dengan CSS `from`).
      return `conic-gradient(from ${isNum(f.angle) ? f.angle : 0}deg at ${centerCss(f.center)}, ${stopsCss(f.stops)})`;
    default:
      return undefined;
  }
}

/**
 * fills → `background` untuk kode (Copy as, codegen): hanya lapisan yang terpetakan, `fills[0]` paling bawah
 * (lapisan CSS terakhir); satu lapisan solid ditulis sebagai warna polos.
 */
export function backgroundCss(fills: unknown): string | undefined {
  if (!Array.isArray(fills)) return undefined;
  const usable = (fills as PaintLike[]).filter((f) => gradientLayerCss(f) !== undefined);
  if (!usable.length) return undefined;
  const solo = usable.length === 1;
  return usable
    .map((f) => gradientLayerCss(f, { solo })!)
    .reverse()
    .join(', ');
}

/** Daftar panjang (semua entri valid) → shorthand berspasi; satu entri tak valid → undefined. */
function lengthList(list: readonly unknown[]): string | undefined {
  const v = list.map(lengthCss);
  return v.every((x) => x !== undefined) ? v.join(' ') : undefined;
}

/** radius angka | [tl,tr,br,bl] → `border-radius`. */
export function radiusCss(r: unknown): string | undefined {
  return Array.isArray(r) ? lengthList(r) : lengthCss(r);
}

/** padding angka | [v,h] | [t,r,b,l] → CSS shorthand dengan urutan yang sama; entri tak valid → undefined. */
export function paddingCss(p: unknown): string | undefined {
  return Array.isArray(p) ? lengthList(p) : lengthCss(p);
}

export type ShadowLike = {
  readonly type?: unknown;
  readonly x?: unknown;
  readonly y?: unknown;
  readonly blur?: unknown;
  readonly spread?: unknown;
  readonly color?: unknown;
};

/** Bayangan box: drop → `x y blur spread c`, inner → `inset …`. */
export function shadowCss(sh: ShadowLike): string {
  const l = (v: unknown) => lengthCss(v) ?? '0px';
  return `${sh.type === 'inner' ? 'inset ' : ''}${l(sh.x)} ${l(sh.y)} ${l(sh.blur)} ${l(sh.spread)} ${colorCss(sh.color) ?? ''}`.trim();
}

/** Daftar bayangan box → nilai `box-shadow` (urutan array = urutan CSS, pertama di atas). */
export function boxShadowsCss(shadows: readonly ShadowLike[] | undefined): string | undefined {
  return shadows?.length ? shadows.map(shadowCss).join(', ') : undefined;
}

/** Bayangan teks: drop → `x y blur c` (blur sama semantiknya dengan box-shadow). */
export function textShadowItemCss(sh: ShadowLike): string {
  const l = (v: unknown) => lengthCss(v) ?? '0px';
  return `${l(sh.x)} ${l(sh.y)} ${l(sh.blur)} ${colorCss(sh.color) ?? ''}`.trim();
}

/** Text: drop → `text-shadow`; inner diabaikan. */
export function textShadowCss(shadows: readonly ShadowLike[] | undefined): string | undefined {
  const drop = (shadows ?? []).filter((s) => s.type !== 'inner');
  return drop.length ? drop.map(textShadowItemCss).join(', ') : undefined;
}

/** letterSpacing (pecahan ukuran font) → `em`; token → var(). */
export function letterSpacingCss(v: unknown): string | undefined {
  if (isNum(v)) return `${v}em`;
  if (isTokenRef(v)) return tokenVar(v);
  return undefined;
}

/** lineHeight → `px` (bukan rasio); token → var(). */
export const lineHeightCss = (v: unknown): string | undefined => lengthCss(v);

/** fontWeight angka → `600`; token → var(). */
export function fontWeightCss(v: unknown): string | undefined {
  if (isNum(v)) return String(v);
  if (isTokenRef(v)) return tokenVar(v);
  return undefined;
}

/**
 * font-family untuk kode: kutip minimal (nama berspasi/koma/kutip → `"…"`), token → var(). Render tidak memakai
 * ini (render memakai `cssFamily` di fonts.ts: satu keluarga terdaftar, selalu dikutip).
 */
export function fontFamilyCss(v: unknown): string | undefined {
  if (isTokenRef(v)) return tokenVar(v);
  if (typeof v !== 'string') return undefined;
  return /[\s,'"]/.test(v) ? `"${v}"` : v;
}

/** align flex (skema) → `align-items`. */
export const ALIGN: Readonly<Record<string, string>> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };
/** justify flex (skema) → `justify-content`. */
export const JUSTIFY: Readonly<Record<string, string>> = { start: 'flex-start', center: 'center', end: 'flex-end', 'space-between': 'space-between' };

/**
 * Stroke sebagai CSS `border` untuk kode (Copy as, codegen): `w solid c` di semua sisi atau per `sides`.
 * Render TIDAK memakai ini (overlay/box-shadow karena semantik `align`, lihat paint.ts).
 */
export function strokeBorderDecls(stroke: unknown): CssDecl[] {
  if (!stroke || typeof stroke !== 'object') return [];
  const s = stroke as { color?: unknown; width?: unknown; sides?: unknown };
  const w = lengthCss(s.width);
  const c = colorCss(s.color);
  if (!w || !c) return [];
  const v = `${w} solid ${c}`;
  return Array.isArray(s.sides) ? s.sides.map((side): CssDecl => [`border-${String(side)}`, v]) : [['border', v]];
}
