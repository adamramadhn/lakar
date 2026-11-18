// Klien HTTP ke lakard. mcp stateless (AD-1): semua state ada di daemon, di balik sessionId.
import type { ApiErrorBody, ApiResult } from '@lakar/schema';

export const START_HINT = 'jalankan daemon: /opt/node-26/bin/pnpm -C /root/lakar lakard (atau /opt/node-26/bin/node /root/lakar/packages/daemon/dist/main.js)';

export class DaemonUnavailableError extends Error {
  constructor(url: string, cause: unknown) {
    super(`lakard tidak menjawab di ${url} (${(cause as Error)?.message ?? String(cause)}). ${START_HINT}`);
    this.name = 'DaemonUnavailableError';
  }
}

export class DaemonClient {
  readonly url: string;
  /** Promise sesi dibagi semua pemanggil paralel; direset bila gagal atau 401. */
  #sessionPromise: Promise<string> | undefined;

  constructor(url: string) {
    this.url = url.replace(/\/+$/, '');
  }

  async #post<T>(path: string, body: unknown, session?: string): Promise<{ status: number; result: ApiResult<T> }> {
    let res: Response;
    try {
      res = await fetch(`${this.url}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(session ? { 'x-lakar-session': session } : {}) },
        body: JSON.stringify(body ?? {}),
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
    return { status: res.status, result };
  }

  /** sessionId dibuat malas pada panggilan pertama (proses mcp tetap hidup walau daemon mati). */
  #session(): Promise<string> {
    if (!this.#sessionPromise) {
      const p = (async () => {
        const { result } = await this.#post<{ sessionId: string }>('/sessions', {});
        if (!result.ok) throw new Error(`gagal membuat sesi: ${result.error.message}`);
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
    const first = await this.#post<T>(path, body, await pending);
    if (first.status !== 401) return first.result;
    if (this.#sessionPromise === pending) this.#sessionPromise = undefined;
    return (await this.#post<T>(path, body, await this.#session())).result;
  }
}

export function formatError(e: ApiErrorBody): string {
  return `${e.code}: ${e.message}${e.hint ? `\nhint: ${e.hint}` : ''}${e.editId ? `\neditId: ${e.editId}` : ''}${e.retryable ? '\n(retryable)' : ''}`;
}
