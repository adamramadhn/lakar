/// <reference lib="dom" />
// Reveal bertahap node baru dari agen di board hidup (spec-progressive-live-build, menggantikan fade-in 12 node teratas
// dari spec-canvas-agent-effects). Web Animations API langsung pada elemen di shadow root board: tidak menyuntik CSS,
// tidak mengubah dokumen, dan hanya opacity/translate/filter (tanpa layout). Pemilihan unit dan jadwal stagger ada di
// agentEffects.ts (murni).
import { REVEAL_SHELL_MS, revealSchedule, revealUnits, topmost } from './agentEffects';

/** Easing, jarak naik, dan blur awal (riset §2: g-build translateY 14px, Paper cubic-bezier(.16,1,.3,1)). */
export const FADE_EASING = 'cubic-bezier(.16,1,.3,1)';
export const FADE_RISE_PX = 12;
export const FADE_BLUR_PX = 4;

const ID_ATTR = 'data-lakar-id';
const NODE_SELECTOR = (id: string) => `[${ID_ATTR}="${CSS.escape(id)}"]`;

/** Animasi reveal yang masih berjalan per host board (diselesaikan saat reveal baru dimulai). */
const running = new WeakMap<HTMLElement, Animation[]>();

/** Induk node terdekat di DOM board (elemen ber-`data-lakar-id` di atasnya). */
function domParentId(el: Element): string | undefined {
  return el.parentElement?.closest(`[${ID_ATTR}]`)?.getAttribute(ID_ATTR) ?? undefined;
}

/** Anak node langsung: elemen ber-id terdekat di bawah `el` (pembungkus tanpa id dilewati). */
function nodeKids(el: Element): Element[] {
  const out: Element[] = [];
  const walk = (p: Element) => {
    for (const c of p.children) {
      if (c.hasAttribute(ID_ATTR)) out.push(c);
      else walk(c);
    }
  };
  walk(el);
  return out;
}

/** Selesaikan reveal yang masih berjalan di board `host` (elemen langsung ke keadaan akhir). */
export function finishReveal(host: HTMLElement): void {
  for (const a of running.get(host) ?? []) {
    try {
      a.finish();
    } catch {
      // Elemen sudah lepas (board di-mount ulang) atau animasi tak berujung: abaikan.
    }
  }
  running.delete(host);
}

/**
 * Putar reveal bertahap untuk `ids` (node baru satu atau beberapa execute) yang ada di board `host` (shadow root dari
 * `mountLive`). Akar baru dipecah menjadi unit (`revealUnits`), unit masuk berurutan dari atas (urutan dokumen) dengan
 * opacity + naik + blur; wadah yang dipecah hanya fade opacity. Reveal sebelumnya di board yang sama diselesaikan
 * dulu. Reduced motion → tidak ada animasi. Mengembalikan jumlah unit yang dianimasikan.
 */
export function animateReveal(host: HTMLElement, ids: readonly string[], reduced: boolean): number {
  const root = host.shadowRoot;
  if (reduced || !root || !ids.length) return 0;
  const els = new Map<string, HTMLElement>();
  for (const id of ids) {
    const el = root.querySelector<HTMLElement>(NODE_SELECTOR(id));
    if (el && typeof el.animate === 'function') els.set(id, el);
  }
  if (!els.size) return 0;
  // Urutan dokumen (bukan urutan `created`): unit atas masuk lebih dulu.
  const present = [...root.querySelectorAll<HTMLElement>(`[${ID_ATTR}]`)].map((el) => el.getAttribute(ID_ATTR)!).filter((id) => els.has(id));
  const roots = topmost(present, (id) => {
    const el = els.get(id) ?? root.querySelector(NODE_SELECTOR(id));
    return el ? domParentId(el) : undefined;
  }).map((id) => els.get(id)!);
  const sizes = new Map<Element, number>();
  const size = (el: Element) => sizes.get(el) ?? sizes.set(el, el.querySelectorAll(`[${ID_ATTR}]`).length).get(el)!;
  const kidsOf = new Map<Element, Element[]>();
  const kids = (el: Element) => kidsOf.get(el) ?? kidsOf.set(el, nodeKids(el)).get(el)!;
  const { units, shells } = revealUnits<Element>(roots, kids, size);
  finishReveal(host);
  const { step, duration } = revealSchedule(units.length);
  const anims: Animation[] = [];
  for (const { node, first } of shells) {
    const opacity = getComputedStyle(node).opacity || '1';
    anims.push(node.animate([{ opacity: 0 }, { opacity }], { duration: REVEAL_SHELL_MS, easing: FADE_EASING, delay: first * step, fill: 'backwards' }));
  }
  units.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const opacity = cs.opacity || '1';
    // Filter milik node (mis. blur/drop-shadow dari dokumen) tidak ditimpa: tanpa blur masuk untuk elemen itu.
    const ownFilter = cs.filter && cs.filter !== 'none';
    const from: Keyframe = { opacity: 0, translate: `0 ${FADE_RISE_PX}px`, ...(ownFilter ? {} : { filter: `blur(${FADE_BLUR_PX}px)` }) };
    const to: Keyframe = { opacity, translate: '0 0', ...(ownFilter ? {} : { filter: 'blur(0px)' }) };
    anims.push(el.animate([from, to], { duration, easing: FADE_EASING, delay: i * step, fill: 'backwards' }));
  });
  running.set(host, anims);
  return units.length;
}
