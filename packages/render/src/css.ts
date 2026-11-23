// Pemetaan CSS tunggal (AD-5): nilai node → nilai CSS, ditulis sekali di sini dan dipakai render
// (paint.ts, layout.ts), Copy as di viewer, dan nanti codegen. Murni: tanpa IO, tanpa DOM.
// Nilai literal dipetakan langsung; ref `{$token}` → `var(--…)` lewat satu fungsi nama variabel (AD-11).
// Render selalu mengirim nilai ter-resolve; Copy as/codegen boleh mengirim ref token atau nilai yang belum
// tervalidasi, jadi setiap fungsi menerima `unknown` dan mengembalikan undefined untuk nilai yang tak terpetakan.
// Format angka mengikuti render: angka apa adanya, tanpa pembulatan.
import { NOISE_DEFAULTS, noiseLayer } from './effects.js';

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

// ---------------------------------------------------------------------------
// Grid (v4, AD-13): track bertipe → `grid-template-*`, penempatan → `grid-column`/`grid-row`.
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Satu ukuran track (tanpa minmax): angka → px, `{fr}` → `Nfr`, `'auto'`. */
function trackSizeCss(t: unknown): string | undefined {
  if (isNum(t)) return `${t}px`;
  if (t === 'auto') return 'auto';
  if (isObj(t) && isNum(t.fr)) return `${t.fr}fr`;
  return undefined;
}

/** Satu track: px | fr | auto | `{minmax:[min,max]}` → `minmax(min, max)`; tak terpetakan → undefined. */
export function gridTrackCss(t: unknown): string | undefined {
  if (isObj(t) && Array.isArray(t.minmax)) {
    const [lo, hi] = t.minmax.map(trackSizeCss);
    return t.minmax.length === 2 && lo && hi ? `minmax(${lo}, ${hi})` : undefined;
  }
  return trackSizeCss(t);
}

/** Template track → `grid-template-columns|rows` berspasi; kosong atau satu entri tak valid → undefined. */
export function gridTemplateCss(list: unknown): string | undefined {
  if (!Array.isArray(list) || !list.length) return undefined;
  const v = list.map(gridTrackCss);
  return v.every((x) => x !== undefined) ? v.join(' ') : undefined;
}

/**
 * Penempatan `{start?, end?, span?}` → nilai `grid-column`/`grid-row`: `2`, `1 / 3`, `span 2`, `2 / span 2`,
 * `auto / 3`. Tanpa kunci yang terpetakan → undefined.
 */
export function gridLineCss(p: unknown): string | undefined {
  if (!isObj(p)) return undefined;
  const start = isNum(p.start) ? String(p.start) : undefined;
  const end = isNum(p.end) ? String(p.end) : isNum(p.span) ? `span ${p.span}` : undefined;
  if (start && end) return `${start} / ${end}`;
  if (start) return start;
  if (end) return isNum(p.end) ? `auto / ${end}` : end;
  return undefined;
}

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

// ---------------------------------------------------------------------------
// Deklarasi node (AD-5, epic kode story 2): aturan tata letak, teks, efek, paint box, dan stroke ditulis sekali di
// sini sebagai `CssDecl[]`. Render (layout.ts, paint.ts) menerapkannya ke DOM dengan urutan yang sama; codegen
// menulisnya ke CSS/Tailwind. Render mengirim node ter-resolve (angka), codegen node tersimpan (angka atau ref token):
// angka menghasilkan string yang sama persis dengan render lama, ref token menjadi var(--…) atau calc(var(--…)).
// ---------------------------------------------------------------------------

/** Konteks layout parent: arah flow, `grid`, atau `none` (semua anak absolute). */
export type ParentLayout = 'row' | 'column' | 'grid' | 'none';

/** Properti sizing node (angka, ref token, `hug`, `fill`). */
export type SizingLike = {
  readonly width?: unknown;
  readonly height?: unknown;
  readonly minWidth?: unknown;
  readonly maxWidth?: unknown;
  readonly minHeight?: unknown;
  readonly maxHeight?: unknown;
};

/** Node anak sejauh yang dibutuhkan deklarasi tata letak. */
export type ChildLike = SizingLike & {
  readonly type?: unknown;
  readonly position?: unknown;
  readonly x?: unknown;
  readonly y?: unknown;
  readonly gridColumn?: unknown;
  readonly gridRow?: unknown;
  readonly size?: unknown;
  readonly viewBox?: unknown;
  readonly wrap?: unknown;
};

const isLen = (v: unknown): boolean => lengthCss(v) !== undefined;

/** `wrap` teks: nilai tersimpan, atau default `wrap` bila width tetap/fill dan `auto` bila tidak diisi/hug. */
export function textWrapMode(n: { readonly wrap?: unknown; readonly width?: unknown }): 'auto' | 'wrap' | 'fixed' {
  if (n.wrap === 'auto' || n.wrap === 'wrap' || n.wrap === 'fixed') return n.wrap;
  return isLen(n.width) || n.width === 'fill' ? 'wrap' : 'auto';
}

/** Sizing efektif: icon `size`×`size`; path tanpa width/height atau hug → ukuran viewBox; teks `wrap` → tinggi hug. */
export function effectiveSizing(n: ChildLike): SizingLike {
  if (n.type === 'icon') return { width: n.size, height: n.size };
  if (n.type === 'path' && Array.isArray(n.viewBox)) {
    const vb = n.viewBox as readonly unknown[];
    return { ...n, width: n.width === undefined || n.width === 'hug' ? vb[2] : n.width, height: n.height === undefined || n.height === 'hug' ? vb[3] : n.height };
  }
  if (n.type === 'text' && textWrapMode(n) === 'wrap') return { ...n, height: 'hug' };
  return n;
}

/**
 * Deklarasi tata letak node anak terhadap parent-nya: `box-sizing`, `margin`, lalu salah satu dari absolute
 * (parent `none` atau `position:'absolute'`), item grid, atau flow flex; lalu min/max (menimpa `min-*:0` milik fill).
 * `negativeGap` (< 0, hanya anak flow ke-2 dst. di parent row/column): CSS `gap` menolak nilai negatif, jadi jarak
 * ditulis sebagai margin sisi awal (`margin: 0 0 0 g` di row, `margin: g 0 0 0` di column).
 */
export function childLayoutDecls(n: ChildLike, parent: ParentLayout, opts: { negativeGap?: number | undefined } = {}): CssDecl[] {
  const out: CssDecl[] = [['box-sizing', 'border-box']];
  const g = opts.negativeGap;
  const flow = (parent === 'row' || parent === 'column') && n.position !== 'absolute';
  if (flow && isNum(g) && g < 0) out.push(['margin', parent === 'row' ? `0 0 0 ${g}px` : `${g}px 0 0 0`]);
  else out.push(['margin', '0']);
  const z = effectiveSizing(n);
  if (parent === 'none' || n.position === 'absolute') absoluteDecls(out, n, z);
  else if (parent === 'grid') gridItemDecls(out, n, z);
  else flowDecls(out, z, parent);
  for (const [key, prop] of [
    ['minWidth', 'min-width'],
    ['maxWidth', 'max-width'],
    ['minHeight', 'min-height'],
    ['maxHeight', 'max-height'],
  ] as const) {
    const v = lengthCss(z[key]);
    if (v !== undefined) out.push([prop, v]);
  }
  return out;
}

/** Anak flow di parent flex. Sumbu utama = arah parent. */
function flowDecls(out: CssDecl[], z: SizingLike, layout: 'row' | 'column'): void {
  const mainKey = layout === 'row' ? 'width' : 'height';
  const crossKey = layout === 'row' ? 'height' : 'width';
  const main = lengthCss(z[mainKey]);
  if (main !== undefined) {
    out.push(['flex', `0 0 ${main}`], [mainKey, main]);
  } else if (z[mainKey] === 'fill') {
    out.push(['flex', '1 1 0px'], [layout === 'row' ? 'min-width' : 'min-height', '0']);
  } else {
    out.push(['flex', '0 0 auto']);
  }
  const cross = lengthCss(z[crossKey]);
  if (cross !== undefined) out.push([crossKey, cross]);
  else if (z[crossKey] === 'fill') out.push(['align-self', 'stretch'], [crossKey, 'auto']);
  else if (z[crossKey] === 'hug') out.push([crossKey, 'fit-content']);
  // tidak diisi → auto (ikut align parent)
}

/**
 * Anak flow di sel grid (v4): angka → px; `fill` → regang di sel (justify/align-self stretch, min 0); `hug` →
 * fit-content; tidak diisi → default CSS grid. Penempatan `gridColumn`/`gridRow` hanya di sini.
 */
function gridItemDecls(out: CssDecl[], n: ChildLike, z: SizingLike): void {
  for (const [key, self, min] of [
    ['width', 'justify-self', 'min-width'],
    ['height', 'align-self', 'min-height'],
  ] as const) {
    const v = z[key];
    const len = lengthCss(v);
    if (len !== undefined) out.push([key, len]);
    else if (v === 'fill') out.push([self, 'stretch'], [key, 'auto'], [min, '0']);
    else if (v === 'hug') out.push([key, 'fit-content']);
  }
  const col = gridLineCss(n.gridColumn);
  const row = gridLineCss(n.gridRow);
  if (col) out.push(['grid-column', col]);
  if (row) out.push(['grid-row', row]);
}

/** Anak absolute (atau anak frame `none`): left/top relatif border-box parent, keluar dari flow. */
function absoluteDecls(out: CssDecl[], n: ChildLike, z: SizingLike): void {
  out.push(['position', 'absolute'], ['left', lengthCss(n.x ?? 0) ?? '0px'], ['top', lengthCss(n.y ?? 0) ?? '0px'], ['flex', '0 0 auto']);
  for (const [key, end] of [
    ['width', 'right'],
    ['height', 'bottom'],
  ] as const) {
    const v = z[key];
    const len = lengthCss(v);
    if (len !== undefined) out.push([key, len]);
    else if (v === 'fill') out.push([end, '0']);
    // hug/tidak diisi → ukuran konten sendiri, TIDAK diperas lebar containing block (bukan fit-content).
    else out.push([key, 'max-content']);
  }
}

/**
 * Reset gaya bawaan browser (UA) untuk elemen bertag semantik (v7, AD-1), ditulis codegen sebelum deklarasi node.
 * Hanya longhand yang sama dengan properti deklarasi node (`padding`, `background-color`, `font-*`, `color`), supaya
 * `mergeDecls` membuang reset yang ditimpa node dan Tailwind tidak bergantung pada urutan kelas. Margin selalu 0 lewat
 * `childLayoutDecls`; tag lain tidak butuh reset. Render canvas tidak memakai tag.
 */
export function tagResetDecls(tag: unknown): CssDecl[] {
  switch (tag) {
    case 'ul':
    case 'ol':
      return [
        ['list-style', 'none'],
        ['padding', '0'],
      ];
    case 'li':
      return [['list-style', 'none']];
    case 'button':
      return [
        ['background-color', 'transparent'],
        ['border-width', '0'],
        ['padding', '0'],
        ['font-family', 'inherit'],
        ['font-size', 'inherit'],
        ['font-weight', 'inherit'],
        ['font-style', 'inherit'],
        ['line-height', 'inherit'],
        ['letter-spacing', 'inherit'],
        ['color', 'inherit'],
        ['text-align', 'inherit'],
      ];
    case 'a':
      return [
        ['color', 'inherit'],
        ['text-decoration', 'none'],
      ];
    default:
      return [];
  }
}

/** Board: kolom flex dari kiri atas, ukuran tetap, selalu clip, blend anak dibatasi pada isi board. Latar terpisah. */
export function boardDecls(b: { readonly width?: unknown; readonly height?: unknown }): CssDecl[] {
  return [
    ['position', 'relative'],
    ['box-sizing', 'border-box'],
    ['width', lengthCss(b.width) ?? '0px'],
    // `height:'hug'` (v8): tinggi = isi flow (anak absolute tidak menambah tinggi); diukur dari DOM setelah mount.
    ['height', b.height === 'hug' ? 'auto' : (lengthCss(b.height) ?? '0px')],
    ['overflow', 'hidden'],
    ['isolation', 'isolate'],
    ['display', 'flex'],
    ['flex-direction', 'column'],
    ['align-items', 'flex-start'],
    ['justify-content', 'flex-start'],
  ];
}

/**
 * Anak langsung board `height:'hug'` (render dan codegen): anak flow `height:'fill'` diperlakukan hug. Board hug tidak
 * punya tinggi untuk dibagi (siklus hug/fill); tanpa ini `flex: 1 1 0px` membuat wadah fill (mis. `Halaman`) runtuh
 * ke 0. Board fixed dan anak absolute dikembalikan apa adanya (objek yang sama).
 */
export function hugBoardChild<T extends { readonly height?: unknown; readonly position?: unknown }>(board: { readonly height?: unknown }, c: T): T {
  return board.height === 'hug' && c.height === 'fill' && c.position !== 'absolute' ? { ...c, height: 'hug' } : c;
}

/** Latar board tanpa fill. */
export const BOARD_DEFAULT_BACKGROUND = '#FFFFFF';

export type FrameLike = {
  readonly layout?: unknown;
  readonly gap?: unknown;
  readonly columnGap?: unknown;
  readonly rowGap?: unknown;
  readonly wrap?: unknown;
  readonly align?: unknown;
  readonly justify?: unknown;
  readonly padding?: unknown;
  readonly clip?: unknown;
  readonly gridTemplateColumns?: unknown;
  readonly gridTemplateRows?: unknown;
};

/** Layout frame efektif (`none` bila tidak diisi). */
export const frameLayout = (n: { readonly layout?: unknown }): ParentLayout =>
  n.layout === 'row' || n.layout === 'column' || n.layout === 'grid' ? n.layout : 'none';

/**
 * Deklarasi milik frame (tanpa paint): acuan anak absolute, display/arah atau template grid, gap (negatif tidak
 * ditulis; lihat `childLayoutDecls`), gap per sumbu, align/justify, padding, clip.
 */
export function frameDecls(n: FrameLike): CssDecl[] {
  const out: CssDecl[] = [['position', 'relative']]; // acuan anak absolute (border-box = padding-box: tanpa border)
  const layout = frameLayout(n);
  if (layout === 'none') {
    out.push(['display', 'block']);
  } else {
    if (layout === 'grid') {
      out.push(['display', 'grid']);
      const cols = gridTemplateCss(n.gridTemplateColumns);
      const rows = gridTemplateCss(n.gridTemplateRows);
      if (cols) out.push(['grid-template-columns', cols]);
      if (rows) out.push(['grid-template-rows', rows]);
    } else {
      out.push(['display', 'flex'], ['flex-direction', layout]);
      // `wrap` (v9): hanya boolean true → flex-wrap; layout none/grid mengabaikannya, nowrap tidak ditulis.
      if (n.wrap === true) out.push(['flex-wrap', 'wrap']);
    }
    if ((isNum(n.gap) && n.gap >= 0) || isTokenRef(n.gap)) out.push(['gap', lengthCss(n.gap)!]);
    // Gap per sumbu menimpa `gap` (CSS column-gap/row-gap; berlaku juga di flex).
    const cg = lengthCss(n.columnGap);
    const rg = lengthCss(n.rowGap);
    if (cg !== undefined) out.push(['column-gap', cg]);
    if (rg !== undefined) out.push(['row-gap', rg]);
    // Grid: align → align-items (posisi item di sel), justify → justify-content (distribusi track); peta sama.
    if (typeof n.align === 'string' && ALIGN[n.align]) out.push(['align-items', ALIGN[n.align]!]);
    if (typeof n.justify === 'string' && JUSTIFY[n.justify]) out.push(['justify-content', JUSTIFY[n.justify]!]);
  }
  const pad = paddingCss(n.padding);
  if (pad !== undefined) out.push(['padding', pad]);
  if (n.clip === true) out.push(['overflow', 'hidden']);
  return out;
}

export type TextLike = {
  readonly weight?: unknown;
  readonly style?: unknown;
  readonly size?: unknown;
  readonly lineHeight?: unknown;
  readonly letterSpacing?: unknown;
  readonly align?: unknown;
  readonly numeric?: unknown;
  readonly color?: unknown;
  readonly shadows?: readonly ShadowLike[] | undefined;
  readonly wrap?: unknown;
  readonly width?: unknown;
};

/** Warna teks tanpa `color`. */
export const DEFAULT_TEXT_COLOR = '#000000';

/**
 * Deklarasi milik teks. `family` = nilai `font-family` dari pemanggil (render: satu keluarga terdaftar lewat
 * `cssFamily`; kode: `fontFamilyCss`). Bobot/gaya default 400/normal (sama dengan `DEFAULT_FONT`).
 */
export function textDecls(n: TextLike, family: string): CssDecl[] {
  const out: CssDecl[] = [
    ['font-family', family],
    ['font-weight', fontWeightCss(n.weight ?? 400) ?? '400'],
    ['font-style', n.style === 'italic' ? 'italic' : 'normal'],
    ['font-size', lengthCss(n.size) ?? '16px'],
  ];
  const lh = lineHeightCss(n.lineHeight);
  const ls = letterSpacingCss(n.letterSpacing);
  if (lh !== undefined) out.push(['line-height', lh]);
  if (ls !== undefined) out.push(['letter-spacing', ls]);
  if (typeof n.align === 'string') out.push(['text-align', n.align]);
  if (n.numeric === 'tabular') out.push(['font-variant-numeric', 'tabular-nums']);
  out.push(['color', colorCss(n.color ?? DEFAULT_TEXT_COLOR) ?? DEFAULT_TEXT_COLOR]);
  const shadow = textShadowCss(n.shadows);
  if (shadow) out.push(['text-shadow', shadow]);
  const wrap = textWrapMode(n);
  if (wrap === 'auto') out.push(['white-space', 'pre']);
  else out.push(['white-space', 'pre-wrap'], ['overflow-wrap', 'break-word']);
  // `fixed`: overflow tidak dipotong agar teks yang meluber tetap terlihat.
  if (wrap === 'fixed') out.push(['overflow', 'visible']);
  return out;
}

export type EffectsLike = {
  readonly opacity?: unknown;
  readonly blend?: unknown;
  readonly blur?: unknown;
  readonly backdropBlur?: unknown;
  readonly rotation?: unknown;
};

/**
 * Efek bersama node anak: opacity (< 1), blend, filter (`filters` awal seperti drop-shadow mendahului blur;
 * σ = blur/2), backdropBlur, dan transform `translateY(-scrollY) rotate(r)` (origin tengah).
 */
export function effectDecls(e: EffectsLike, scrollY = 0, filters: readonly string[] = []): CssDecl[] {
  const out: CssDecl[] = [];
  if (isNum(e.opacity) && e.opacity < 1) out.push(['opacity', String(e.opacity)]);
  if (typeof e.blend === 'string' && e.blend !== 'normal') out.push(['mix-blend-mode', e.blend]);
  const filter = [...filters];
  if (isNum(e.blur) && e.blur) filter.push(`blur(${e.blur / 2}px)`);
  if (filter.length) out.push(['filter', filter.join(' ')]);
  if (isNum(e.backdropBlur) && e.backdropBlur) out.push(['backdrop-filter', `blur(${e.backdropBlur / 2}px)`]);
  const transform: string[] = [];
  if (scrollY) transform.push(`translateY(${-scrollY}px)`);
  if (isNum(e.rotation) && e.rotation) transform.push(`rotate(${e.rotation}deg)`);
  if (transform.length) out.push(['transform', transform.join(' ')], ['transform-origin', '50% 50%']);
  return out;
}

/**
 * Faktor `drop-shadow()` agar σ sama dengan box-shadow (σ = blur/2). Chromium menafsirkan panjang blur
 * `drop-shadow()` sebagai σ langsung, jadi blur/2 (dikunci tes `bayangan-path-vs-rect`).
 */
export const DROP_SHADOW_BLUR_FACTOR = 0.5;

/** Bentuk mask (ellipse busur, path, ikon): drop → `drop-shadow()`; spread dan inner tidak didukung. */
export function dropShadowFilterList(shadows: readonly ShadowLike[] | undefined): string[] {
  const n = (v: unknown) => (isNum(v) ? v : 0);
  return (shadows ?? [])
    .filter((s) => s.type !== 'inner')
    .map((s) => `drop-shadow(${n(s.x)}px ${n(s.y)}px ${n(s.blur) * DROP_SHADOW_BLUR_FACTOR}px ${colorCss(s.color) ?? ''})`);
}

type Side = 'top' | 'right' | 'bottom' | 'left';
const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

/** Panjang stroke: angka (px) atau ekspresi CSS (token). */
type StrokeLen = { n?: number; css: string };

const lenOf = (n: number): StrokeLen => ({ n, css: `${n}px` });
const negLen = (l: StrokeLen): string => (l.n !== undefined ? `${-l.n}px` : `calc(-1 * ${l.css})`);

export type StrokeLike = { readonly color?: unknown; readonly width?: unknown; readonly align?: unknown; readonly sides?: unknown };

/** Tinta stroke box di dalam dan di luar tepi (tidak ada = 0). Token: setengah lebar `center` → `calc(var / 2)`. */
function strokeSplit(s: StrokeLike): { inside?: StrokeLen; outside?: StrokeLen } {
  if (isNum(s.width)) {
    const w = s.width;
    const inside = s.align === 'inside' ? w : s.align === 'outside' ? 0 : w / 2;
    const outside = s.align === 'inside' ? 0 : s.align === 'outside' ? w : w / 2;
    return { ...(inside > 0 ? { inside: lenOf(inside) } : {}), ...(outside > 0 ? { outside: lenOf(outside) } : {}) };
  }
  if (!isTokenRef(s.width)) return {};
  const v = tokenVar(s.width);
  const half = { css: `calc(${v} / 2)` };
  if (s.align === 'inside') return { inside: { css: v } };
  if (s.align === 'outside') return { outside: { css: v } };
  return { inside: half, outside: half };
}

const strokeSides = (s: StrokeLike): readonly Side[] => (Array.isArray(s.sides) ? (s.sides as Side[]) : SIDES);

/** Bagian luar stroke box → box-shadow spread (semua sisi) atau offset ke arah sisi tertentu. */
function outerStrokeShadows(s: StrokeLike): string[] {
  const w = strokeSplit(s).outside;
  const c = colorCss(s.color);
  if (!w || !c) return [];
  const sides = strokeSides(s);
  if (sides.length === 4) return [`0 0 0 ${w.css} ${c}`];
  const off: Record<Side, string> = { top: `0 ${negLen(w)}`, right: `${w.css} 0`, bottom: `0 ${w.css}`, left: `${negLen(w)} 0` };
  return sides.map((side) => `${off[side]} 0 0 ${c}`);
}

/** `box-shadow` box: stroke luar (paling atas) lalu shadows sesuai urutan. */
export function boxShadowWithStrokeCss(stroke: StrokeLike | undefined, shadows: readonly ShadowLike[] | undefined): string | undefined {
  const own = boxShadowsCss(shadows);
  const list = [...(stroke ? outerStrokeShadows(stroke) : []), ...(own ? [own] : [])];
  return list.length ? list.join(', ') : undefined;
}

/** Paint box tanpa latar: `border-radius` lalu `box-shadow` (stroke luar + shadows). */
export function boxPaintDecls(
  n: { readonly stroke?: StrokeLike | undefined; readonly shadows?: readonly ShadowLike[] | undefined },
  radius: string | undefined,
): CssDecl[] {
  const out: CssDecl[] = [];
  if (radius) out.push(['border-radius', radius]);
  const shadow = boxShadowWithStrokeCss(n.stroke, n.shadows);
  if (shadow) out.push(['box-shadow', shadow]);
  return out;
}

/**
 * Overlay stroke box bagian dalam (render: div internal terakhir; kode: `::after`): absolute inset 0, border hanya
 * pada `sides`, radius sama, di atas anak. Tanpa bagian dalam → undefined.
 */
export function strokeOverlayDecls(s: StrokeLike | undefined, radius: string | undefined): CssDecl[] | undefined {
  if (!s) return undefined;
  const w = strokeSplit(s).inside;
  const c = colorCss(s.color);
  if (!w || !c) return undefined;
  const out: CssDecl[] = [
    ['position', 'absolute'],
    ['inset', '0'],
    ['box-sizing', 'border-box'],
    ['pointer-events', 'none'],
    ['margin', '0'],
    ['z-index', 'auto'],
  ];
  if (radius) out.push(['border-radius', radius]);
  const sides = strokeSides(s);
  for (const side of SIDES) if (sides.includes(side)) out.push([`border-${side}`, `${w.css} solid ${c}`]);
  return out;
}

export type FillLike = PaintLike & {
  readonly assetId?: unknown;
  readonly fit?: unknown;
  readonly opacity?: unknown;
  readonly size?: unknown;
  readonly seed?: unknown;
  readonly blend?: unknown;
  readonly mono?: unknown;
};

/** Prefiks URL aset default (daemon dan harness menyajikan `/assets/<sha256>`). */
export const DEFAULT_ASSET_BASE = '/assets/';

/**
 * Satu fill → satu lapisan `background` berlapis (solid → `linear-gradient(c, c)`): solid/gradien, image, noise.
 * Mesh butuh bitmap canvas (milik paint.ts) → undefined.
 */
export function fillLayerCss(f: FillLike, assetBase: string = DEFAULT_ASSET_BASE): string | undefined {
  switch (f.type) {
    case 'image': {
      if (typeof f.assetId !== 'string') return undefined;
      const url = `url("${assetBase}${f.assetId}")`;
      switch (f.fit) {
        case 'cover':
        case 'contain':
          return `${url} center / ${f.fit} no-repeat`;
        case 'fill':
          return `${url} 0 0 / 100% 100% no-repeat`;
        case 'tile':
          return `${url} 0 0 / auto repeat`;
      }
      return undefined;
    }
    case 'noise':
      return noiseLayer(f as Parameters<typeof noiseLayer>[0]);
    default:
      return gradientLayerCss(f);
  }
}

/**
 * `background-blend-mode` per lapisan (urutan CSS = fills terbalik): noise memakai `blend`-nya (default overlay),
 * lapisan lain normal. Tanpa noise → undefined.
 */
export function fillsBlendModeCss(fills: readonly FillLike[] | undefined): string | undefined {
  if (!fills?.some((f) => f.type === 'noise')) return undefined;
  return fills
    .map((f) => (f.type === 'noise' ? (typeof f.blend === 'string' ? f.blend : NOISE_DEFAULTS.blend) : 'normal'))
    .reverse()
    .join(', ');
}

/**
 * Latar untuk kode (codegen): satu fill solid → `background-color`; selain itu `background` berlapis yang sama
 * dengan render (+ `background-blend-mode` bila ada noise). Fill tanpa padanan CSS (mesh) dilewati dan dihitung di
 * `skipped`.
 */
export function codeBackgroundDecls(fills: unknown, assetBase: string = DEFAULT_ASSET_BASE): { decls: CssDecl[]; skipped: number } {
  if (!Array.isArray(fills) || !fills.length) return { decls: [], skipped: 0 };
  const usable = (fills as FillLike[]).filter((f) => fillLayerCss(f, assetBase) !== undefined);
  const skipped = fills.length - usable.length;
  if (!usable.length) return { decls: [], skipped };
  if (usable.length === 1 && usable[0]!.type === 'solid') return { decls: [['background-color', gradientLayerCss(usable[0]!, { solo: true })!]], skipped };
  const decls: CssDecl[] = [['background', usable.map((f) => fillLayerCss(f, assetBase)!).reverse().join(', ')]];
  const blend = fillsBlendModeCss(usable);
  if (blend) decls.push(['background-blend-mode', blend]);
  return { decls, skipped };
}

/** Nilai token (AD-11) → nilai CSS variabel: warna hex, panjang px, bobot angka, family, letterSpacing em. */
export function tokenValueCss(type: string, value: unknown): string | undefined {
  switch (type) {
    case 'color':
      return colorCss(value);
    case 'fontWeight':
      return fontWeightCss(value);
    case 'fontFamily':
      return fontFamilyCss(value);
    case 'letterSpacing':
      return letterSpacingCss(value);
    default:
      return lengthCss(value);
  }
}

/**
 * Spesifikasi elemen SVG murni (ikon, stroke bentuk): render membangun DOM darinya, codegen menulis JSX.
 * `attrs` = atribut SVG apa adanya; `style` = deklarasi CSS (dipakai untuk nilai token, yang tidak sah sebagai
 * atribut presentasi).
 */
export type SvgSpec = { tag: string; attrs: [name: string, value: string][]; style: CssDecl[]; children: SvgSpec[] };

/** Atribut SVG `[nama, nilai]`. */
export type SvgAttr = [name: string, value: string];

export type VectorLike = {
  readonly fillRule?: unknown;
  readonly strokeLinecap?: unknown;
  readonly strokeLinejoin?: unknown;
  readonly strokeDasharray?: unknown;
  readonly strokeMiterlimit?: unknown;
  readonly svg?: unknown;
};

/** Atribut vektor node path yang sudah dipetakan ke SVG (AD-14). */
export type VectorSvgAttrs = {
  /** `fill-rule` mask fill, clipPath stroke inside, dan mask stroke outside. */
  rule: 'nonzero' | 'evenodd';
  /** Atribut tambahan path mask fill (`fill-opacity`, `shape-rendering`). */
  fill: SvgAttr[];
  /** Atribut path stroke: `stroke-linejoin` selalu pertama (default `miter`), lalu yang diisi. */
  stroke: SvgAttr[];
  /** `paint-order` menaruh stroke sebelum fill → overlay stroke di bawah lapisan fill. */
  strokeUnder: boolean;
};

const CAPS = new Set(['butt', 'round', 'square']);
const JOINS = new Set(['miter', 'round', 'bevel']);
const svgNum = (n: number) => String(+n.toFixed(6));

/** `paint-order` → stroke dilukis sebelum fill? Kata yang tidak disebut menyusul urutan bawaan fill, stroke, markers. */
export function strokeBeforeFill(order: unknown): boolean {
  if (typeof order !== 'string' || order.trim() === 'normal') return false;
  const listed = order.trim().split(/\s+/);
  const full = [...listed, ...['fill', 'stroke', 'markers'].filter((k) => !listed.includes(k))];
  return full.indexOf('stroke') < full.indexOf('fill');
}

/**
 * Pemetaan tunggal properti vektor path → atribut SVG (AD-5, AD-14), dipakai render, codegen, dan serializer ekspor.
 * Nilai tak terpetakan dilewati. Node tanpa properti vektor → `{rule:'nonzero', fill:[], stroke:[['stroke-linejoin','miter']]}`.
 */
export function vectorSvgAttrs(n: VectorLike): VectorSvgAttrs {
  const svg = (typeof n.svg === 'object' && n.svg !== null ? n.svg : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof svg[k] === 'string' ? (svg[k] as string) : undefined);
  const fill: SvgAttr[] = [];
  const stroke: SvgAttr[] = [['stroke-linejoin', typeof n.strokeLinejoin === 'string' && JOINS.has(n.strokeLinejoin) ? n.strokeLinejoin : 'miter']];
  if (typeof n.strokeLinecap === 'string' && CAPS.has(n.strokeLinecap)) stroke.push(['stroke-linecap', n.strokeLinecap]);
  if (isNum(n.strokeMiterlimit)) stroke.push(['stroke-miterlimit', svgNum(n.strokeMiterlimit)]);
  if (Array.isArray(n.strokeDasharray) && n.strokeDasharray.length && n.strokeDasharray.every(isNum)) {
    stroke.push(['stroke-dasharray', (n.strokeDasharray as number[]).map(svgNum).join(' ')]);
  }
  for (const k of ['stroke-dashoffset', 'stroke-opacity']) {
    const v = str(k);
    if (v !== undefined) stroke.push([k, v]);
  }
  const fo = str('fill-opacity');
  if (fo !== undefined) fill.push(['fill-opacity', fo]);
  const sr = str('shape-rendering');
  if (sr !== undefined) {
    fill.push(['shape-rendering', sr]);
    stroke.push(['shape-rendering', sr]);
  }
  return { rule: n.fillRule === 'evenodd' ? 'evenodd' : 'nonzero', fill, stroke, strokeUnder: strokeBeforeFill(svg['paint-order']) };
}
