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
  'NOT_SUPPORTED',
  'FORBIDDEN',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** `editId` (AD-7): ada hanya bila snippet gagal dan bisa diperbaiki lewat `execute({editId, edits})`. */
export type ApiErrorBody = { code: ErrorCode; message: string; hint: string; retryable: boolean; editId?: string };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiErrorBody };

/** Error berkode AD-11. Dilempar lintas paket, dipetakan ke `{ok:false,error}` di tepi HTTP. */
export class LakarError extends Error {
  readonly code: ErrorCode;
  readonly hint: string;
  readonly retryable: boolean;
  readonly editId: string | undefined;
  constructor(code: ErrorCode, message: string, opts: { hint?: string; retryable?: boolean; editId?: string } = {}) {
    super(message);
    this.name = 'LakarError';
    this.code = code;
    this.hint = opts.hint ?? '';
    this.retryable = opts.retryable ?? false;
    this.editId = opts.editId;
  }
  toBody(): ApiErrorBody {
    const body: ApiErrorBody = { code: this.code, message: this.message, hint: this.hint, retryable: this.retryable };
    if (this.editId !== undefined) body.editId = this.editId;
    return body;
  }
}

/**
 * Pesan dari nilai yang dilempar: `message` bila berupa string (Error, atau objek mirip Error), selain itu
 * `String(e)`. Untuk `Error` biasa sama persis dengan `e.message`.
 */
export function errorMessage(e: unknown): string {
  const m = (e as { message?: unknown } | null | undefined)?.message;
  return typeof m === 'string' ? m : String(e);
}
