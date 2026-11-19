/// <reference lib="dom" />
// Aset gambar (Design Notes story 8): semua `assetId` di board dikumpulkan lalu dimuat + di-decode
// SEBELUM mount, supaya screenshot tidak menangkap gambar setengah jadi. Gagal → NOT_FOUND.
import type { ResolvedBoardNode as BoardNode, ResolvedChildNode as ChildNode, ResolvedFill as Fill } from '@lakar/schema';
import { assetUrl } from './paint.js';

/** Daftar unik `assetId` fill gambar di board dan semua node (urut kemunculan). */
export function assetIds(board: BoardNode): string[] {
  const out = new Set<string>();
  const add = (fills: readonly Fill[] | undefined) => {
    for (const f of fills ?? []) if (f.type === 'image') out.add(f.assetId);
  };
  const walk = (nodes: readonly ChildNode[]) => {
    for (const n of nodes) {
      if ('fills' in n) add(n.fills);
      if (n.type === 'frame') walk(n.children);
    }
  };
  add(board.fills);
  walk(board.children);
  return [...out];
}

/**
 * Muat + `decode()` semua aset untuk SATU render (tanpa cache antar-render: halaman daemon berumur
 * panjang). `images` dipegang pemanggil sampai render selesai; `failed` = assetId yang gagal.
 */
export async function decodeAssets(d: Document, ids: readonly string[], assetBase: string): Promise<{ failed: string[]; images: HTMLImageElement[] }> {
  const images: HTMLImageElement[] = [];
  const results = await Promise.all(
    ids.map(async (id) => {
      const img = new (d.defaultView!.Image)();
      img.src = assetUrl(assetBase, id);
      try {
        await img.decode();
        images.push(img);
        return undefined;
      } catch {
        return id;
      }
    }),
  );
  return { failed: results.filter((x): x is string => x !== undefined), images };
}

const DATA_URL_RE = /url\("(data:[^"]*)"\)/g;

/** URL `data:` unik di `background-image` inline `el` dan turunannya (bitmap mesh PNG, ubin SVG noise). */
export function inlineDataUrls(el: HTMLElement): string[] {
  const out = new Set<string>();
  for (const e of [el, ...el.querySelectorAll<HTMLElement | SVGElement>('*')]) {
    const bg = e.style?.backgroundImage;
    if (!bg || !bg.includes('data:')) continue;
    for (const m of bg.matchAll(DATA_URL_RE)) out.add(m[1]!);
  }
  return [...out];
}

/**
 * `decode()` bitmap efek (data URL) sesudah mount, sebelum ukur/screenshot, supaya lukisan pertama tidak menunggu
 * decode. Gagal decode diabaikan (bukan NOT_FOUND: datanya buatan render sendiri). `images` dipegang pemanggil.
 */
export async function decodeDataUrls(d: Document, urls: readonly string[]): Promise<HTMLImageElement[]> {
  const images: HTMLImageElement[] = [];
  await Promise.all(
    urls.map(async (url) => {
      const img = new (d.defaultView!.Image)();
      img.src = url;
      try {
        await img.decode();
        images.push(img);
      } catch {
        // abaikan
      }
    }),
  );
  return images;
}
