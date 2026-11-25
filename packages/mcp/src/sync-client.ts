// Klien transport `lakar --server <url> --token <capabilityToken>` (spec-collab-cloud story 4):
// LakarTransport ketiga — wrapper tipis di atas `RoomClient` (@lakar/daemon), yang memegang koneksi
// WebSocket ke room `@lakar/sync` + mesin route `DocTransport` pada replika lokal. Sejak story 5
// inti transport tinggal di daemon (room-client.ts) agar lakard sendiri bisa bergabung ke room;
// file ini hanya memetakan API mcp (nama peer/kind agent, status, LakarTransport) ke RoomClient
// tanpa mengubah perilaku publik.
import { RoomClient, maskToken, type RoomClientOptions } from '@lakar/daemon';
import type { DocTransport } from '@lakar/daemon';
import type { ApiResult, LakarDocument } from '@lakar/schema';
import { CLIENT_NAME, agentHeader, type AgentInfo, type LakarTransport } from './client.js';

/** Token room adalah capability — di log/status hanya 6 karakter pertama + elipsis. */
export { maskToken };

/** Opsi `SyncClient` — diteruskan apa adanya ke `RoomClient`. */
export type SyncClientOptions = RoomClientOptions;

/**
 * `SyncClient` adalah `LakarTransport` untuk mode `--server`: bergabung ke room sebagai peer
 * `agent` atas nama harness (`setAgent`) dan menyalurkan `call(path, body)` ke `DocTransport`
 * yang berjalan di atas replika lokal.
 */
export class SyncClient implements LakarTransport {
  readonly url: string;
  readonly token: string;
  /** Mesin route (baca replika + tulis lewat ops) — sama dengan yang dipakai transport file/daemon. */
  readonly backend: DocTransport;
  readonly #room: RoomClient;

  constructor(url: string, token: string, options: SyncClientOptions = {}) {
    this.#room = new RoomClient(url, token, {
      ...options,
      kind: 'agent',
      client: CLIENT_NAME,
      name: options.name ?? CLIENT_NAME,
      // slug() default RoomClient = doc.id replika — bentuk target slug tool identik dengan mode file.
    });
    this.url = this.#room.url;
    this.token = this.#room.token;
    this.backend = this.#room.backend;
  }

  // -------------------------------------------------------------------------
  // LakarTransport
  // -------------------------------------------------------------------------

  /** Penyedia clientInfo agen → nama join + penulis komentar (sama dengan FileClient). */
  setAgent(provider: () => AgentInfo | undefined): void {
    this.#room.setAgent(() => agentHeader(provider()));
  }

  /** Status transport server (bentuk `/status` + field `transport:'server'`, server, room, rev, peers). */
  async status<T>(): Promise<ApiResult<T>> {
    const r = await this.#room.status<T>();
    if (r.ok) {
      (r.data as { hint?: string }).hint =
        "mode server tanpa renderer: board height:'hug' tidak terukur (height 0) — atur x/y eksplisit; tool render/jaringan → NOT_SUPPORTED";
    }
    return r;
  }

  /** Route tool → DocTransport pada replika (error jelas saat fatal/terputus). */
  call<T>(path: string, body: unknown = {}): Promise<ApiResult<T>> {
    return this.#room.call<T>(path, body);
  }

  // -------------------------------------------------------------------------
  // Akses tes/diagnostik
  // -------------------------------------------------------------------------

  /** Replika dokumen tersimpan terkini (undefined sebelum welcome pertama). */
  get doc(): LakarDocument | undefined {
    return this.#room.replica;
  }

  /** Rev replika (sama dengan `doc.rev`). */
  get rev(): number | undefined {
    return this.#room.rev;
  }

  /** Jumlah peer di room termasuk klien ini. */
  get peers(): number {
    return this.#room.peers;
  }

  /** true bila koneksi WS hidup dan welcome sudah diterima. */
  get connected(): boolean {
    return this.#room.connected;
  }

  /** Tunggu welcome pertama/berikutnya (tes). Reject saat fatal (token salah) atau klien ditutup. */
  waitReady(): Promise<void> {
    return this.#room.waitReady();
  }

  /** Hentikan klien: tutup WS, tolak commit tertunda + waiter waitReady, matikan reconnect. */
  close(): void {
    this.#room.close();
  }
}
