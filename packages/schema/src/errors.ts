// Kontrak error AD-11: enum kode, bentuk respons, LakarError. Tanpa IO.
import { z } from 'zod';

export const ErrorCode = z.enum([
  'SCHEMA_INVALID',
  'NOT_FOUND',
  'CONFLICT',
  'NO_ACTIVE_DOC',
  'EXEC_TIMEOUT',
  'EXEC_ERROR',
  'ICON_UNKNOWN',
  'TOKEN_UNKNOWN',
  'FONT_MISSING',
  'RENDER_FAILED',
  'EXPORT_FAILED',
  'VERSION_MISMATCH',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export type ApiErrorBody = { code: ErrorCode; message: string; hint: string; retryable: boolean };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiErrorBody };

/** Error berkode AD-11. Dilempar lintas paket, dipetakan ke `{ok:false,error}` di tepi HTTP. */
export class LakarError extends Error {
  readonly code: ErrorCode;
  readonly hint: string;
  readonly retryable: boolean;
  constructor(code: ErrorCode, message: string, opts: { hint?: string; retryable?: boolean } = {}) {
    super(message);
    this.name = 'LakarError';
    this.code = code;
    this.hint = opts.hint ?? '';
    this.retryable = opts.retryable ?? false;
  }
  toBody(): ApiErrorBody {
    return { code: this.code, message: this.message, hint: this.hint, retryable: this.retryable };
  }
}
