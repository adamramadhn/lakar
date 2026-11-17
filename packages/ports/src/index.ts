// Kontrak antarmuka saja (hexagonal). `ports` tidak bergantung pada paket lain,
// jadi tipe dokumen diberikan sebagai parameter generik oleh pemakai.
export const PACKAGE = '@lakar/ports';

/** Render dokumen (sudah di-resolve) → PNG board. Adaptor: Chromium headless di daemon. */
export interface RenderPort<Doc = unknown> {
  /** PNG skala 1 (CSS px) dari board `boardId`. Gagal → LakarError `RENDER_FAILED` (retryable). */
  screenshot(doc: Doc, boardId: string): Promise<Uint8Array>;
}
