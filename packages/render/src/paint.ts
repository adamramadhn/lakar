/// <reference lib="dom" />
// Properti visual bersama → CSS (Design Notes story 8), ditulis sekali di sini dan dipakai
// board/frame/rect/ellipse/path/text/icon. Elemen node TIDAK pernah mendapat CSS `border`: tinta stroke
// bagian dalam memakai overlay internal (tanpa data-lakar-id), bagian luar memakai box-shadow spread.
import type { ResolvedFill as Fill, ResolvedShadow as Shadow, ResolvedStroke as Stroke } from '@lakar/schema';

/** Prefiks URL aset default (daemon dan harness menyajikan `/assets/<sha256>`). */
export const DEFAULT_ASSET_BASE = '/assets/';

const px = (n: number) => `${n}px`;
const pct = (n: number) => `${+(n * 100).toFixed(4)}%`;

const stopsCss = (stops: readonly { offset: number; color: string }[]) => stops.map((s) => `${s.color} ${pct(s.offset)}`).join(', ');

/** URL aset gambar: `assetBase` + sha256. */
export const assetUrl = (assetBase: string, assetId: string): string => `${assetBase}${assetId}`;

/** Satu fill → satu lapisan CSS `background`. */
function fillLayer(f: Fill, assetBase: string): string {
  switch (f.type) {
    case 'solid':
      return `linear-gradient(${f.color}, ${f.color})`;
    case 'linear':
      // Sudut CSS: 0 = ke atas, 90 = ke kanan, searah jarum jam.
      return `linear-gradient(${f.angle}deg, ${stopsCss(f.stops)})`;
    case 'radial': {
      const [cx, cy] = f.center ?? [0.5, 0.5];
      const r = f.radius ?? 0.5;
      return `radial-gradient(${pct(r)} ${pct(r)} at ${pct(cx)} ${pct(cy)}, ${stopsCss(f.stops)})`;
    }
    case 'image': {
      const url = `url("${assetUrl(assetBase, f.assetId)}")`;
      switch (f.fit) {
        case 'cover':
        case 'contain':
          return `${url} center / ${f.fit} no-repeat`;
        case 'fill':
          return `${url} 0 0 / 100% 100% no-repeat`;
        case 'tile':
          return `${url} 0 0 / auto repeat`;
      }
    }
  }
}

/** fills → CSS `background` berlapis: `fills[0]` paling bawah (CSS: lapisan pertama paling atas). */
export function fillsBackground(fills: readonly Fill[] | undefined, assetBase: string): string | undefined {
  if (!fills || fills.length === 0) return undefined;
  return fills
    .map((f) => fillLayer(f, assetBase))
    .reverse()
    .join(', ');
}

/** radius angka | [tl,tr,br,bl] → `border-radius`. */
export function radiusCss(r: number | readonly number[] | undefined): string | undefined {
  if (r === undefined) return undefined;
  return typeof r === 'number' ? px(r) : r.map(px).join(' ');
}

type Side = 'top' | 'right' | 'bottom' | 'left';
const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

/** Lebar tinta stroke di dalam dan di luar tepi box. */
function strokeSplit(s: Stroke): { inside: number; outside: number } {
  if (s.align === 'inside') return { inside: s.width, outside: 0 };
  if (s.align === 'outside') return { inside: 0, outside: s.width };
  return { inside: s.width / 2, outside: s.width / 2 };
}

/** Bagian luar stroke box → box-shadow spread (semua sisi) atau offset ke arah sisi tertentu. */
function outerStrokeShadows(s: Stroke): string[] {
  const { outside: w } = strokeSplit(s);
  if (w <= 0) return [];
  const sides = s.sides ?? SIDES;
  if (sides.length === 4) return [`0 0 0 ${px(w)} ${s.color}`];
  const off: Record<Side, string> = { top: `0 ${px(-w)}`, right: `${px(w)} 0`, bottom: `0 ${px(w)}`, left: `${px(-w)} 0` };
  return sides.map((side) => `${off[side]} 0 0 ${s.color}`);
}

/** Bayangan box: drop → `x y blur spread c`, inner → `inset …`. Urutan array = urutan CSS (pertama di atas). */
function shadowCss(sh: Shadow): string {
  return `${sh.type === 'inner' ? 'inset ' : ''}${px(sh.x)} ${px(sh.y)} ${px(sh.blur)} ${px(sh.spread ?? 0)} ${sh.color}`;
}

/** `box-shadow` box: stroke luar (paling atas) lalu shadows sesuai urutan. */
export function boxShadowCss(stroke: Stroke | undefined, shadows: readonly Shadow[] | undefined): string | undefined {
  const list = [...(stroke ? outerStrokeShadows(stroke) : []), ...(shadows ?? []).map(shadowCss)];
  return list.length ? list.join(', ') : undefined;
}

/** Text: drop → `text-shadow` (blur sama semantiknya dengan box-shadow); inner diabaikan. */
export function textShadowCss(shadows: readonly Shadow[] | undefined): string | undefined {
  const drop = (shadows ?? []).filter((s) => s.type !== 'inner');
  return drop.length ? drop.map((s) => `${px(s.x)} ${px(s.y)} ${px(s.blur)} ${s.color}`).join(', ') : undefined;
}

/**
 * Faktor `drop-shadow()` agar σ sama dengan box-shadow (σ = blur/2). Chromium menafsirkan panjang blur
 * `drop-shadow()` sebagai σ langsung, jadi blur/2 (dikunci tes `bayangan-path-vs-rect`).
 */
export const DROP_SHADOW_BLUR_FACTOR = 0.5;

/** Bentuk mask (ellipse busur, path): drop → `drop-shadow()`; spread dan inner tidak didukung. */
export function dropShadowFilters(shadows: readonly Shadow[] | undefined): string[] {
  return (shadows ?? [])
    .filter((s) => s.type !== 'inner')
    .map((s) => `drop-shadow(${px(s.x)} ${px(s.y)} ${px(s.blur * DROP_SHADOW_BLUR_FACTOR)} ${s.color})`);
}

/**
 * Overlay stroke box bagian dalam: div internal absolute inset 0, border hanya pada `sides`, radius sama,
 * ditambahkan terakhir (di atas anak). Tanpa bagian dalam → undefined.
 */
export function strokeOverlay(d: Document, s: Stroke, radius: string | undefined): HTMLElement | undefined {
  const { inside: w } = strokeSplit(s);
  if (w <= 0) return undefined;
  const el = d.createElement('div');
  const st = el.style;
  st.position = 'absolute';
  st.inset = '0';
  st.boxSizing = 'border-box';
  st.pointerEvents = 'none';
  st.margin = '0';
  st.zIndex = 'auto';
  if (radius) st.borderRadius = radius;
  const sides = s.sides ?? SIDES;
  for (const side of SIDES) {
    // Satu-satunya pemakaian `border` di render: elemen overlay internal tanpa data-lakar-id.
    if (sides.includes(side)) st.setProperty(`border-${side}`, `${px(w)} solid ${s.color}`);
  }
  return el;
}

/** Efek bersama node anak (termasuk text/icon). */
export type Effects = {
  opacity?: number | undefined;
  blend?: string | undefined;
  blur?: number | undefined;
  backdropBlur?: number | undefined;
  rotation?: number | undefined;
};

/**
 * opacity, blend, blur (σ = blur/2), backdropBlur (σ sama), dan transform `translateY(-scrollY) rotate(r)`
 * (origin tengah, tidak memengaruhi layout). `filters` awal (mis. drop-shadow) mendahului blur.
 */
export function applyEffects(st: CSSStyleDeclaration, e: Effects, scrollY: number, filters: readonly string[] = []): void {
  if (e.opacity !== undefined && e.opacity < 1) st.opacity = String(e.opacity);
  if (e.blend && e.blend !== 'normal') st.mixBlendMode = e.blend;
  const filter = [...filters];
  if (e.blur) filter.push(`blur(${px(e.blur / 2)})`);
  if (filter.length) st.filter = filter.join(' ');
  if (e.backdropBlur) st.backdropFilter = `blur(${px(e.backdropBlur / 2)})`;
  const transform: string[] = [];
  if (scrollY) transform.push(`translateY(${px(-scrollY)})`);
  if (e.rotation) transform.push(`rotate(${e.rotation}deg)`);
  if (transform.length) {
    st.transform = transform.join(' ');
    st.transformOrigin = '50% 50%';
  }
}
