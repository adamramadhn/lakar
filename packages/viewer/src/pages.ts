// Kelola halaman (aplikasi 8): logika murni panel Pages, terpisah dari komponen supaya bisa dites di Node.
/**
 * Indeks halaman aktif. Halaman dilacak per ID: tetap sama setelah reorder/rename. `pageId` tidak ada lagi
 * (dihapus) → tetangga: halaman sebelumnya, atau berikutnya bila yang dihapus halaman pertama. `lastIndex` =
 * indeks halaman aktif pada dokumen sebelumnya. Tanpa `pageId` (baru dibuka) → `lastIndex` (dari viewState).
 */
export function resolvePageIndex(pages: readonly { id: string }[], pageId: string | undefined, lastIndex: number): number {
  if (pages.length === 0) return 0;
  const clamp = (i: number) => Math.max(0, Math.min(i, pages.length - 1));
  if (pageId === undefined) return clamp(lastIndex);
  const i = pages.findIndex((p) => p.id === pageId);
  return i !== -1 ? i : clamp(lastIndex - 1);
}

/**
 * Indeks akhir halaman yang diseret dari `from` lalu dijatuhkan di celah `gap` (0..n: sebelum baris `gap`).
 * `undefined` = posisi tidak berubah.
 */
export function dropTarget(from: number, gap: number): number | undefined {
  const to = gap > from ? gap - 1 : gap;
  return to === from ? undefined : to;
}
