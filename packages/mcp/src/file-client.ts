// Klien transport file untuk `lakar --file <path>`: membungkus `FileTransport` (@lakar/daemon) supaya
// server MCP bisa memakai `call(path, body)` + `status()` + `setAgent()` yang sama dengan `DaemonClient`,
// tanpa proses lakard sama sekali (spec-collab-cloud story 2).
import { FileTransport, type FileTransportOptions } from '@lakar/daemon';
import type { ApiResult } from '@lakar/schema';
import { CLIENT_NAME, agentHeader, type AgentInfo, type LakarTransport } from './client.js';

/** `FileClient` adalah `LakarTransport` untuk mode file: `call()` meneruskan ke `FileTransport`. */
export class FileClient implements LakarTransport {
  /** Backend route-per-route pada satu `.lakar.json` (DocStore + transaksi core, tanpa HTTP). */
  readonly backend: FileTransport;

  constructor(file: string, options: FileTransportOptions = {}) {
    this.backend = new FileTransport(file, { client: CLIENT_NAME, ...options });
  }

  /** Penyedia clientInfo agen → nama harness yang disanitasi (sama dengan header `x-lakar-agent`). */
  setAgent(provider: () => AgentInfo | undefined): void {
    this.backend.setAgent(() => agentHeader(provider()));
  }

  /** Status transport file (bentuk `/status` + field `transport:'file'`, `file`, `slug`). */
  async status<T>(): Promise<ApiResult<T>> {
    return this.backend.status<T>();
  }

  /** Meneruskan route tool ke backend; hasil `ApiResult` sama persis dengan respons daemon. */
  async call<T>(path: string, body: unknown = {}): Promise<ApiResult<T>> {
    return this.backend.call<T>(path, body);
  }
}
