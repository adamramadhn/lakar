// Catatan hasil check terakhir per dokumen (aplikasi 11): kolom Checks di List view Dashboard tanpa menjalankan check
// baru. Diisi dari check yang sudah berjalan (execute: board tersentuh; layout_check). Hanya memori, hilang saat restart.
import type { LakarDocument } from '@lakar/schema';

export type CheckCounts = { error: number; warning: number };

type Entry = { rev: number; boards: Map<string, CheckCounts> };

export class CheckLedger {
  /** Kunci id dokumen (tahan rename slug). */
  readonly #docs = new Map<string, Entry>();

  /**
   * Catat hasil check `boards` pada rev `rev`. Hasil board lain ikut dipakai hanya bila catatan sebelumnya ada di
   * `baseRev` (rev sebelum perubahan): selain itu ada revisi tanpa check di antaranya, jadi catatan mulai baru.
   */
  record(docId: string, baseRev: number, rev: number, boards: readonly { id: string; summary: CheckCounts }[]): void {
    const prev = this.#docs.get(docId);
    const map = prev && prev.rev === baseRev ? new Map(prev.boards) : new Map<string, CheckCounts>();
    for (const b of boards) map.set(b.id, { error: b.summary.error, warning: b.summary.warning });
    this.#docs.set(docId, { rev, boards: map });
  }

  /** Jumlah temuan dokumen, hanya bila catatan ada di rev dokumen dan mencakup setiap board-nya. */
  forDoc(doc: Pick<LakarDocument, 'id' | 'rev'>, boardIds: readonly string[]): CheckCounts | undefined {
    const e = this.#docs.get(doc.id);
    if (!e || e.rev !== doc.rev || boardIds.length === 0) return undefined;
    const out: CheckCounts = { error: 0, warning: 0 };
    for (const id of boardIds) {
      const c = e.boards.get(id);
      if (!c) return undefined;
      out.error += c.error;
      out.warning += c.warning;
    }
    return out;
  }
}
