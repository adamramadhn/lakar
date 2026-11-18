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
