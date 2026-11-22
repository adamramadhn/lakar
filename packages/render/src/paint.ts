/// <reference lib="dom" />
// Properti visual bersama → DOM (Design Notes story 8), dipakai board/frame/rect/ellipse/path/text/icon. Elemen node
// TIDAK pernah mendapat CSS `border`: tinta stroke bagian dalam memakai overlay internal (tanpa data-lakar-id),
// bagian luar memakai box-shadow spread. Semua nilai dan deklarasi berasal dari pemetaan tunggal css.ts (AD-5);
// yang tersisa di sini hanya bitmap mesh (canvas) dan penerapan ke DOM.
import type { ResolvedFill as Fill, ResolvedShadow as Shadow } from '@lakar/schema';
import { DEFAULT_ASSET_BASE, dropShadowFilterList, effectDecls, fillLayerCss, fillsBlendModeCss, strokeOverlayDecls, type CssDecl, type EffectsLike, type StrokeLike } from './css.js';
import { meshLayer } from './effects.js';

export { boxShadowWithStrokeCss as boxShadowCss, DEFAULT_ASSET_BASE, DROP_SHADOW_BLUR_FACTOR } from './css.js';

/** URL aset gambar: `assetBase` + sha256 (format sama dengan lapisan image di css.ts). */
export const assetUrl = (assetBase: string, assetId: string): string => `${assetBase}${assetId}`;

/** Konteks lapisan fill: prefiks aset, dokumen DOM (canvas mesh), dan ukuran kotak bila sudah tetap (px). */
export type FillContext = { assetBase: string; doc?: Document | undefined; width?: number | undefined; height?: number | undefined };

/** Terapkan deklarasi ke style elemen (urutan dipertahankan; deklarasi berikutnya menimpa yang sebelumnya). */
export function applyDecls(st: CSSStyleDeclaration, decls: readonly CssDecl[]): void {
  for (const [p, v] of decls) st.setProperty(p, v);
}

/** Satu fill → satu lapisan CSS `background`: mesh → bitmap canvas; lainnya dari css.ts. */
function fillLayer(f: Fill, fc: FillContext): string {
  if (f.type === 'mesh') {
    if (!fc.doc) throw new Error('fill mesh butuh dokumen DOM (canvas 2D)');
    return meshLayer(f, fc.width, fc.height, fc.doc);
  }
  return fillLayerCss(f, fc.assetBase ?? DEFAULT_ASSET_BASE)!;
}

/** fills → CSS `background` berlapis: `fills[0]` paling bawah (CSS: lapisan pertama paling atas). */
export function fillsBackground(fills: readonly Fill[] | undefined, ctx: string | FillContext): string | undefined {
  if (!fills || fills.length === 0) return undefined;
  const fc = typeof ctx === 'string' ? { assetBase: ctx } : ctx;
  return fills
    .map((f) => fillLayer(f, fc))
    .reverse()
    .join(', ');
}

/** `background-blend-mode` per lapisan (lihat css.ts `fillsBlendModeCss`). */
export const fillsBlendMode = (fills: readonly Fill[] | undefined): string | undefined => fillsBlendModeCss(fills);

/** Pasang fills ke style elemen: `background` + `background-blend-mode` (bila ada noise). */
export function applyFills(st: CSSStyleDeclaration, fills: readonly Fill[] | undefined, fc: FillContext): boolean {
  const bg = fillsBackground(fills, fc);
  if (!bg) return false;
  st.background = bg;
  const blend = fillsBlendMode(fills);
  if (blend) st.backgroundBlendMode = blend;
  return true;
}

/** Bentuk mask (ellipse busur, path): drop → `drop-shadow()`; spread dan inner tidak didukung. */
export const dropShadowFilters = (shadows: readonly Shadow[] | undefined): string[] => dropShadowFilterList(shadows);

/**
 * Overlay stroke box bagian dalam: div internal dengan deklarasi `strokeOverlayDecls`, ditambahkan terakhir
 * (di atas anak). Tanpa bagian dalam → undefined.
 */
export function strokeOverlay(d: Document, s: StrokeLike, radius: string | undefined): HTMLElement | undefined {
  const decls = strokeOverlayDecls(s, radius);
  if (!decls) return undefined;
  const el = d.createElement('div');
  applyDecls(el.style, decls);
  return el;
}

/** Efek bersama node anak (termasuk text/icon). */
export type Effects = EffectsLike;

/** Terapkan `effectDecls` (opacity, blend, filter, backdrop, transform). */
export function applyEffects(st: CSSStyleDeclaration, e: Effects, scrollY: number, filters: readonly string[] = []): void {
  applyDecls(st, effectDecls(e, scrollY, filters));
}
