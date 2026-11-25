// Pembentuk error AD-11 bersama untuk route daemon. Pesan dan hint ditentukan pemanggil (teks yang dilihat agen).
import { LakarError, type ErrorCode } from '@lakar/schema';

/** NOT_FOUND tanpa retry. */
export const notFound = (message: string, hint: string): LakarError => new LakarError('NOT_FOUND', message, { hint });

/**
 * Kode error AD-11 → status HTTP route daemon. Dipakai handler error global (server.ts) dan penyalur
 * `ApiResult` dari transport room (rooms.ts `roomCall`).
 */
export const STATUS: Record<ErrorCode, number> = {
  SCHEMA_INVALID: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  NO_ACTIVE_DOC: 409,
  EXEC_TIMEOUT: 422,
  EXEC_ERROR: 422,
  ICON_UNKNOWN: 422,
  TOKEN_UNKNOWN: 422,
  FONT_MISSING: 422,
  RENDER_FAILED: 503,
  EXPORT_FAILED: 500,
  VERSION_MISMATCH: 409,
  // Dipakai transport file (`lakar --file`) dan route di atas dokumen room: fitur yang butuh render/jaringan/riwayat. 501 = not implemented.
  NOT_SUPPORTED: 501,
  // Dipakai transport server (`lakar --server`) dan room: capability token room menolak aksi (mis. token view menulis).
  FORBIDDEN: 403,
};
