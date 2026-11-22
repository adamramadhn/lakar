/// <reference lib="dom" />
// Board hidup di canvas viewer (AD-6, editor-canvas story 3): dokumen ter-resolve (`resolveDocument`, AD-10) di-mount
// dengan `mountBoard` @lakar/render ke shadow root per board. Deps render (face font + glyph ikon) diambil dari daemon
// (`GET /viewer/render-deps`) dan di-cache per kunci; aset gambar dari `/assets/:hash` (origin sama).
// Bukan `renderBoard`: cek ketat FONT_MISSING/ICON_UNKNOWN dan ukur tetap milik render daemon (acuan piksel PNG).
// Font yang tidak dikenal tampil dengan fallback browser; ikon tanpa glyph tampil sebagai kotak kosong.
import { fontRequests, iconKey, iconRefs, mountBoard, type FontFaceSource } from '@lakar/render';
import type { IconGlyph, ResolvedBoardNode, ResolvedDocument } from '@lakar/schema';

/** Base URL aset gambar (sama dengan halaman render daemon). */
export const LIVE_ASSET_BASE = '/assets/';
/** Batas tunggu face termuat sebelum mount (face lambat/rusak tidak menahan board). */
export const FACE_WAIT_MS = 3000;

/** Kunci deps satu board: font `family:weight:style`, ikon `lib/nama` (format query `/viewer/render-deps`). */
export type DepKeys = { fonts: string[]; icons: string[] };
export type RenderDeps = { fonts: FontFaceSource[]; icons: IconGlyph[] };
/** Respons `/viewer/render-deps` (bentuk sama dengan `RenderDepsResult` api.ts). */
export type RenderDepsResult = RenderDeps & { missing: DepKeys };

export const fontDepKey = (f: { family: string; weight: number; style: string }): string => `${f.family}:${f.weight}:${f.style}`;

export function boardDepKeys(board: ResolvedBoardNode): DepKeys {
  return { fonts: fontRequests(board).map(fontDepKey), icons: iconRefs(board).map((r) => iconKey(r.lib, r.icon)) };
}

/**
 * Cache deps per kunci lintas board dan dokumen. Kunci yang sedang diambil tidak diminta dua kali; kunci yang
 * gagal diambil (offline/5xx) dibuang dari cache sehingga mount berikutnya mencoba lagi. Kunci yang dilaporkan
 * `missing` oleh daemon di-cache sebagai kosong (tidak diminta ulang).
 */
export class RenderDepsCache {
  readonly #fetch: (keys: DepKeys) => Promise<RenderDepsResult>;
  readonly #fonts = new Map<string, Promise<FontFaceSource[]>>();
  readonly #icons = new Map<string, Promise<IconGlyph[]>>();

  constructor(fetcher: (keys: DepKeys) => Promise<RenderDepsResult>) {
    this.#fetch = fetcher;
  }

  /** Deps untuk `keys`; kunci yang gagal diambil dilewati (hasil sebagian, `complete: false`). */
  async ensure(keys: DepKeys): Promise<RenderDeps & { complete: boolean }> {
    const fonts = [...new Set(keys.fonts)].filter((k) => !this.#fonts.has(k));
    const icons = [...new Set(keys.icons)].filter((k) => !this.#icons.has(k));
    if (fonts.length || icons.length) {
      const req = this.#fetch({ fonts, icons });
      for (const k of fonts) {
        const p = req.then((r) => r.fonts.filter((f) => fontDepKey(f) === k));
        p.catch(() => this.#fonts.get(k) === p && this.#fonts.delete(k));
        this.#fonts.set(k, p);
      }
      for (const k of icons) {
        const p = req.then((r) => r.icons.filter((g) => iconKey(g.lib, g.icon) === k));
        p.catch(() => this.#icons.get(k) === p && this.#icons.delete(k));
        this.#icons.set(k, p);
      }
    }
    let complete = true;
    const settle = async <T>(p: Promise<T[]> | undefined): Promise<T[]> => {
      try {
        return p ? await p : [];
      } catch {
        complete = false;
        return [];
      }
    };
    // Promise diambil sebelum menunggu: entri gagal dibuang dari cache begitu ditolak.
    const fontPs = [...new Set(keys.fonts)].map((k) => this.#fonts.get(k));
    const iconPs = [...new Set(keys.icons)].map((k) => this.#icons.get(k));
    const outFonts = (await Promise.all(fontPs.map((p) => settle(p)))).flat();
    const outIcons = (await Promise.all(iconPs.map((p) => settle(p)))).flat();
    return { fonts: outFonts, icons: outIcons, complete };
  }
}

// FontFace per face (url + range) sekali per dokumen viewer; face gagal dibuang agar dicoba lagi.
const faces = new Map<string, FontFace>();
const faceKey = (f: FontFaceSource) => `${fontDepKey(f)}|${f.url}|${f.unicodeRange ?? ''}`;

/**
 * Daftarkan face ke `document.fonts` (berlaku juga di shadow tree) dan tunggu termuat, maks `FACE_WAIT_MS`.
 * Gagal tidak melempar: teks tampil dengan fallback browser.
 */
export async function ensureFaces(d: Document, list: readonly FontFaceSource[], waitMs = FACE_WAIT_MS): Promise<void> {
  const loads: Promise<unknown>[] = [];
  for (const src of list) {
    const k = faceKey(src);
    let face = faces.get(k);
    if (!face) {
      face = new FontFace(src.family, `url(${JSON.stringify(src.url)}) format("woff2")`, {
        weight: String(src.weight),
        style: src.style,
        ...(src.unicodeRange ? { unicodeRange: src.unicodeRange } : {}),
      });
      faces.set(k, face);
      d.fonts.add(face);
      const f = face;
      f.load().catch(() => {
        d.fonts.delete(f);
        if (faces.get(k) === f) faces.delete(k);
      });
    }
    if (face.status !== 'loaded') loads.push(face.loaded.catch(() => undefined));
  }
  if (!loads.length) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([Promise.all(loads), new Promise((r) => (timer = setTimeout(r, waitMs)))]);
  clearTimeout(timer);
}

/** Gaya shadow root: lepas dari CSS aplikasi, setara halaman render daemon (`margin:0`, gaya UA). */
const SHADOW_CSS = ':host{all:initial;display:block;contain:layout paint}.root{position:relative}';

/**
 * Mount board `boardId` dari dokumen ter-resolve ke shadow root `host` (dibuat sekali, open). Isi lama diganti.
 * Mengembalikan elemen board (`[data-lakar-id=boardId]`). Board tidak ada → exception dari `mountBoard`.
 */
export function mountLive(host: HTMLElement, doc: ResolvedDocument, boardId: string, deps: RenderDeps): HTMLElement {
  const d = host.ownerDocument;
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  let root = shadow.querySelector<HTMLElement>('.root');
  if (!root) {
    const style = d.createElement('style');
    style.textContent = SHADOW_CSS;
    root = d.createElement('div');
    root.className = 'root';
    shadow.replaceChildren(style, root);
  }
  return mountBoard(doc, boardId, root, { assetBase: LIVE_ASSET_BASE, icons: deps.icons });
}

/**
 * Sumber gambar board di canvas: DOM hidup hanya untuk versi terkini dengan dokumen termuat; pratinjau versi
 * (History) dan canvas tanpa dokumen memakai PNG (AD-6).
 */
export const boardSource = (hasDoc: boolean, previewing: boolean): 'live' | 'snapshot' => (hasDoc && !previewing ? 'live' : 'snapshot');

/** Tanda tangan isi board ter-resolve: board di-mount ulang hanya bila berubah. */
export const boardSignature = (board: ResolvedBoardNode | undefined): string => (board ? JSON.stringify(board) : '');
