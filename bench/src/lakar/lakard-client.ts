// Klien HTTP harness ke lakard (`DEFAULT_LAKARD_URL`), dipakai di luar waktu terukur. Bentuk respons AD-11 {ok, data|error}.
// Sengaja tidak mengimpor packages/mcp (arah dependensi bench → schema saja).
import { DEFAULT_LAKARD_URL, SESSION_HEADER, errorMessage, type Finding, type FindingSummary } from '@lakar/schema';

export type LakardStatus = {
  version: string;
  schemaVersion: number;
  pid: number;
  startedAt: string;
  dataDir: string;
  pool: { size: number; ready: number; recreated: number; browserVersion?: string } | null;
  icons: Record<string, string>;
  fonts?: { families: string[]; missing: string[] };
  node?: string;
};

export type LakardBoard = { id: string; name: string; page: string; width: number; height: number; x: number; y: number; screen?: string; expectedSize?: unknown; wip: boolean };
export type LayoutCheck = { docId: string; rev: number; boards: { id: string; name: string; summary: FindingSummary }[]; summary: FindingSummary; findings: Finding[] };
export type ExportResult = { path: string; id: string; name: string; rev: number; scale: number; width: number; height: number; bytes: number };

export class LakardError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
  }
}

type Fetch = typeof fetch;

export class LakardClient {
  #session: string | undefined;

  constructor(
    readonly baseUrl = DEFAULT_LAKARD_URL,
    readonly fetchImpl: Fetch = fetch,
  ) {}

  async #req<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.#session) headers[SESSION_HEADER] = this.#session;
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(120_000) });
    } catch (e) {
      throw new LakardError('UNREACHABLE', `lakard tidak menjawab di ${this.baseUrl}${path}: ${errorMessage(e)}`);
    }
    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new LakardError('BAD_RESPONSE', `${path}: respons bukan JSON (HTTP ${res.status})`);
    }
    if (!json?.ok) throw new LakardError(String(json?.error?.code ?? `HTTP_${res.status}`), String(json?.error?.message ?? 'galat tanpa pesan'));
    return json.data as T;
  }

  status(): Promise<LakardStatus> {
    return this.#req('GET', '/status');
  }

  /** Sesi harness sendiri (AD-17) dengan versi klien = versi bench (`@lakar/schema`). */
  async createSession(version: string, schemaVersion: number): Promise<string> {
    const d = await this.#req<{ sessionId: string }>('POST', '/sessions', { client: 'lakar-bench-harness', version, schemaVersion });
    this.#session = d.sessionId;
    return d.sessionId;
  }

  openDoc(slug: string): Promise<{ docId: string; slug: string; rev: number; created: boolean }> {
    return this.#req('POST', '/docs/open', { slug });
  }

  async boards(): Promise<{ docId: string; slug: string; rev: number; boards: LakardBoard[] }> {
    return this.#req('POST', '/boards', {});
  }

  layoutCheck(): Promise<LayoutCheck> {
    return this.#req('POST', '/layout-check', {});
  }

  exportPng(id: string): Promise<ExportResult> {
    return this.#req('POST', '/export', { id, scale: 1 });
  }
}
