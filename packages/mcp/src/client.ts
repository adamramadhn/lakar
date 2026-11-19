// Klien HTTP ke lakard. mcp stateless (AD-1): semua state ada di daemon, di balik sessionId.
import { LAKAR_VERSION, SCHEMA_VERSION, SESSION_HEADER, VERSION_HINT, errorMessage, type ApiErrorBody, type ApiResult } from '@lakar/schema';

export { VERSION_HINT };

export const START_HINT =
  'jalankan service: systemctl --user start lakard (belum terpasang: bash /root/lakar/tools/lakard/install-service.sh; ' +
  'manual: /opt/node-26/bin/node /root/lakar/packages/daemon/dist/main.js)';
/** Nama klien yang dikirim saat membuat sesi. */
export const CLIENT_NAME = 'lakar-mcp';

export class DaemonUnavailableError extends Error {
  constructor(url: string, cause: unknown) {
    super(`lakard tidak menjawab di ${url} (${errorMessage(cause)}). ${START_HINT}`);
    this.name = 'DaemonUnavailableError';
  }
}

/** Versi lakard dan mcp berbeda: setiap tool (kecuali status) gagal sampai daemon di-restart. */
export class VersionMismatchError extends Error {
  readonly body: ApiErrorBody;
  constructor(body: ApiErrorBody) {
    super(formatError(body));
    this.name = 'VersionMismatchError';
    this.body = body;
  }
}

export type SessionInfo = { sessionId: string; version?: string; schemaVersion?: number };

export class DaemonClient {
  readonly url: string;
  /** Promise sesi dibagi semua pemanggil paralel; direset bila gagal atau 401. */
  #sessionPromise: Promise<string> | undefined;

  constructor(url: string) {
    this.url = url.replace(/\/+$/, '');
  }

  async #request<T>(path: string, body: unknown, session?: string, method: 'POST' | 'GET' = 'POST'): Promise<{ status: number; result: ApiResult<T> }> {
    let res: Response;
    try {
      res = await fetch(`${this.url}${path}`, {
        method,
        headers: method === 'POST' ? { 'content-type': 'application/json', ...(session ? { [SESSION_HEADER]: session } : {}) } : {},
        ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      throw new DaemonUnavailableError(this.url, (e as { cause?: unknown }).cause ?? e);
    }
    let result: ApiResult<T>;
    try {
      result = (await res.json()) as ApiResult<T>;
    } catch {
      throw new DaemonUnavailableError(this.url, new Error(`respons HTTP ${res.status} bukan JSON`));
    }
    // Bukan bentuk AD-11 (mis. 404 bawaan fastify dari lakard lama tanpa route ini) → error terformat, bukan TypeError.
    if (typeof (result as { ok?: unknown })?.ok !== 'boolean' || (!result.ok && typeof result.error?.code !== 'string')) {
      result = {
        ok: false,
        error:
          res.status === 404
            ? {
                code: 'VERSION_MISMATCH',
                message: `lakard di ${this.url} tidak mengenal ${method} ${path} (HTTP 404; kemungkinan versi lama, ${CLIENT_NAME} ${LAKAR_VERSION})`,
                hint: VERSION_HINT,
                retryable: false,
              }
            : { code: 'EXEC_ERROR', message: `respons lakard HTTP ${res.status} tidak berbentuk {ok, data|error}`, hint: VERSION_HINT, retryable: true },
      };
    }
    return { status: res.status, result };
  }

  /** GET /status (tanpa sesi). */
  async status<T>(): Promise<ApiResult<T>> {
    return (await this.#request<T>('/status', undefined, undefined, 'GET')).result;
  }

  /**
   * sessionId dibuat malas pada panggilan pertama (proses mcp tetap hidup walau daemon mati).
   * Versi mcp dikirim dan versi di respons dibandingkan; beda → VersionMismatchError (dicoba ulang
   * pada panggilan berikutnya karena daemon bisa di-restart).
   */
  #session(): Promise<string> {
    if (!this.#sessionPromise) {
      const p = (async () => {
        const { result } = await this.#request<SessionInfo>('/sessions', { client: CLIENT_NAME, version: LAKAR_VERSION, schemaVersion: SCHEMA_VERSION });
        if (!result.ok) {
          if (result.error.code === 'VERSION_MISMATCH') throw new VersionMismatchError(result.error);
          throw new Error(`gagal membuat sesi: ${result.error.message}`);
        }
        const { version, schemaVersion } = result.data;
        if (version !== LAKAR_VERSION || schemaVersion !== SCHEMA_VERSION) {
          throw new VersionMismatchError({
            code: 'VERSION_MISMATCH',
            message: `versi tidak cocok: lakard ${version ?? '(lama, tanpa versi)'} (schema ${schemaVersion ?? '?'}), ${CLIENT_NAME} ${LAKAR_VERSION} (schema ${SCHEMA_VERSION})`,
            hint: VERSION_HINT,
            retryable: false,
          });
        }
        return result.data.sessionId;
      })();
      this.#sessionPromise = p;
      p.catch(() => {
        if (this.#sessionPromise === p) this.#sessionPromise = undefined;
      });
    }
    return this.#sessionPromise;
  }

  /** Panggil endpoint daemon dalam sesi. Sesi hilang (daemon restart, HTTP 401) → sesi baru, ulang sekali. */
  async call<T>(path: string, body: unknown): Promise<ApiResult<T>> {
    const pending = this.#session();
    const first = await this.#request<T>(path, body, await pending);
    if (first.status !== 401) return first.result;
    if (this.#sessionPromise === pending) this.#sessionPromise = undefined;
    return (await this.#request<T>(path, body, await this.#session())).result;
  }
}

export function formatError(e: ApiErrorBody): string {
  return `${e.code}: ${e.message}${e.hint ? `\nhint: ${e.hint}` : ''}${e.editId ? `\neditId: ${e.editId}` : ''}${e.retryable ? '\n(retryable)' : ''}`;
}
