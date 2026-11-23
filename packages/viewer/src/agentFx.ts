/// <reference lib="dom" />
// Fade-in node baru dari agen di board hidup (spec-canvas-agent-effects, desain bagian 04 "New nodes fade in").
// Web Animations API langsung pada elemen di shadow root board: tidak menyuntik CSS, tidak mengubah dokumen, dan
// hanya opacity/translate/filter (tanpa layout). Pemilihan node (teratas, maks 12) dan stagger dari agentEffects.ts.
import { FADE_MAX, staggerDelay, topmost } from './agentEffects';

/** Durasi, easing, jarak naik, dan blur awal (riset: 300–650ms, 4–14px, cubic-bezier(.16,1,.3,1)). */
export const FADE_MS = 500;
export const FADE_EASING = 'cubic-bezier(.16,1,.3,1)';
export const FADE_RISE_PX = 10;
export const FADE_BLUR_PX = 4;

const NODE_SELECTOR = (id: string) => `[data-lakar-id="${CSS.escape(id)}"]`;

/** Induk node terdekat di DOM board (elemen ber-`data-lakar-id` di atasnya). */
function domParentId(el: Element): string | undefined {
  return el.parentElement?.closest('[data-lakar-id]')?.getAttribute('data-lakar-id') ?? undefined;
}

/**
 * Putar fade-in untuk `ids` (satu execute) yang ada di board `host` (shadow root dari `mountLive`). Anak dari node
 * yang juga baru ikut induknya. Reduced motion → tidak ada animasi. Mengembalikan jumlah elemen yang dianimasikan.
 */
export function animateFadeIn(host: HTMLElement, ids: readonly string[], reduced: boolean): number {
  const root = host.shadowRoot;
  if (reduced || !root || !ids.length) return 0;
  const els = new Map<string, HTMLElement>();
  for (const id of ids) {
    const el = root.querySelector<HTMLElement>(NODE_SELECTOR(id));
    if (el && typeof el.animate === 'function') els.set(id, el);
  }
  if (!els.size) return 0;
  const present = [...els.keys()];
  const parents = new Map(present.map((id) => [id, domParentId(els.get(id)!)]));
  const picked = topmost(present, (id) => parents.get(id) ?? domParentIdOf(root, id), FADE_MAX);
  picked.forEach((id, i) => {
    const el = els.get(id)!;
    const cs = getComputedStyle(el);
    const opacity = cs.opacity || '1';
    // Filter milik node (mis. blur/drop-shadow dari dokumen) tidak ditimpa: tanpa blur masuk untuk elemen itu.
    const ownFilter = cs.filter && cs.filter !== 'none';
    const from: Keyframe = { opacity: 0, translate: `0 ${FADE_RISE_PX}px`, ...(ownFilter ? {} : { filter: `blur(${FADE_BLUR_PX}px)` }) };
    const to: Keyframe = { opacity, translate: '0 0', ...(ownFilter ? {} : { filter: 'blur(0px)' }) };
    el.animate([from, to], { duration: FADE_MS, easing: FADE_EASING, delay: staggerDelay(i), fill: 'backwards' });
  });
  return picked.length;
}

/** Induk id yang tidak termasuk `ids` (dicari ulang di DOM untuk rantai leluhur `topmost`). */
function domParentIdOf(root: ShadowRoot, id: string): string | undefined {
  const el = root.querySelector(NODE_SELECTOR(id));
  return el ? domParentId(el) : undefined;
}
