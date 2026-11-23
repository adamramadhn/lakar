// Tinggi terukur board `height:'hug'` (spec-board-hug-height). Tinggi board hug tidak tersimpan di dokumen; ia
// hasil render. Catatan ini menyimpan ukuran terakhir per (dokumen, rev) supaya jalur tanpa render (exec `place`,
// `measuredHeight`, `list_boards`, ukuran respons ekspor) memakai angka yang sama dengan render. Hanya memori.
import { glyphScan } from '@lakar/check';
import type { BoardMeasure, RenderPort } from '@lakar/ports';
import { isHugBoard, type ResolvedDocument } from '@lakar/schema';

type Entry = { rev: number; heights: Map<string, number> };

/** Board hug di dokumen (semua halaman). */
export function hugBoardIds(doc: Pick<ResolvedDocument, 'pages'>): string[] {
  return doc.pages.flatMap((p) => p.children.filter((b) => isHugBoard(b)).map((b) => b.id));
}

export class HugHeights {
  /** Kunci id dokumen (tahan rename slug). */
  readonly #docs = new Map<string, Entry>();

  /**
   * Catat ukuran `measures` (hanya board hug di `doc`) pada rev `doc.rev`. Ukuran board lain dari `baseRev` ikut
   * dipakai hanya bila catatan sebelumnya ada di `baseRev` (board yang tidak tersentuh tidak berubah tingginya).
   */
  record(doc: Pick<ResolvedDocument, 'id' | 'rev' | 'pages'>, measures: ReadonlyMap<string, Pick<BoardMeasure, 'height'>>, baseRev = doc.rev): void {
    const hug = new Set(hugBoardIds(doc));
    const prev = this.#docs.get(doc.id);
    const heights = new Map<string, number>();
    if (prev && (prev.rev === baseRev || prev.rev === doc.rev)) for (const [id, h] of prev.heights) if (hug.has(id)) heights.set(id, h);
    for (const [id, m] of measures) if (hug.has(id)) heights.set(id, m.height);
    this.#docs.set(doc.id, { rev: doc.rev, heights });
  }

  /** Tinggi tercatat untuk rev `doc.rev` (kosong bila catatan dari rev lain). */
  known(doc: Pick<ResolvedDocument, 'id' | 'rev'>): Map<string, number> {
    const e = this.#docs.get(doc.id);
    return e && e.rev === doc.rev ? new Map(e.heights) : new Map();
  }

  /**
   * Tinggi semua board hug `doc` pada rev-nya: yang belum tercatat diukur (render paralel). Board yang gagal dirender
   * (font/ikon/aset) dilewati: pemanggil memperlakukannya sebagai belum terukur, bukan error.
   */
  async ensure(render: RenderPort<ResolvedDocument>, doc: ResolvedDocument): Promise<Map<string, number>> {
    const have = this.known(doc);
    const missing = hugBoardIds(doc).filter((id) => !have.has(id));
    if (!missing.length) return have;
    const settled = await Promise.allSettled(
      missing.map((id) => {
        const board = doc.pages.flatMap((p) => p.children).find((b) => b.id === id)!;
        return render.measure(doc, id, { allowGlyphs: glyphScan(board).allowGlyphs });
      }),
    );
    const measured = new Map<string, Pick<BoardMeasure, 'height'>>();
    settled.forEach((r, i) => r.status === 'fulfilled' && measured.set(missing[i]!, r.value));
    this.record(doc, measured);
    return this.known(doc);
  }

  /** Tinggi board `b` untuk respons: angka apa adanya; hug = terukur (belum terukur → undefined). */
  static heightOf(b: { id: string; height: number | 'hug' }, heights: ReadonlyMap<string, number>): number | undefined {
    return typeof b.height === 'number' ? b.height : heights.get(b.id);
  }
}
