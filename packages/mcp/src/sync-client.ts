// Klien transport `lakar --server <url> --token <capabilityToken>` (spec-collab-cloud story 4):
// LakarTransport ketiga — membungkus koneksi WebSocket ke room `@lakar/sync` + mesin route
// `DocTransport` (@lakar/daemon) yang berjalan pada replika lokal. Baca → replika lokal (semantik
// identik mode file); tulis → ops `DocOp` mentah dikirim `{type:'ops', baseRev, ops}` → tunggu
// `ack`/`rejected`/`opError`. Tool render/jaringan/viewer → NOT_SUPPORTED (oleh DocTransport).
//
// KONTRAK DETERMINISTIK (protocol.ts @lakar/sync): ops broadcast dan ops sendiri (seed/`at` ada di
// `ack`) WAJIB diterapkan lewat `applySeeded` = transact(doc, ops, {random: seededRandom(seed),
// now: () => new Date(at)}). IdAllocator default akan menghasilkan ID berbeda → replika divergen.
// Replika divergen/gap rev → `{type:'resync'}` → welcome baru menggantikan seluruh state.
import WebSocket from 'ws';
import { DocTransport, applySeeded, type CommitBuild, type DocCommitOutcome, type DocTransportOptions } from '@lakar/daemon';
import { ErrorCode, LAKAR_VERSION, LakarDocument, LakarError, SCHEMA_VERSION, type ApiResult, type DocOp } from '@lakar/schema';
import { CLIENT_NAME, agentHeader, type AgentInfo, type LakarTransport } from './client.js';

// ---------------------------------------------------------------------------
// Pesan server → klien (mirror services/sync/src/protocol.ts — diduplikasi tipis
// supaya mode daemon/file tidak menarik modul @lakar/sync).
// ---------------------------------------------------------------------------

type PeerInfo = { peerId: string; name: string; kind: 'human' | 'agent'; access: 'edit' | 'view'; presence?: unknown; locks?: string[] };
type OpErrorBody = { code: string; message: string; hint?: string };

type ServerMessage =
  | { type: 'welcome'; peerId: string; rev: number; doc: unknown; peers: PeerInfo[] }
  | { type: 'peer_join'; peer: PeerInfo }
  | { type: 'peer_leave'; peerId: string }
  | { type: 'ack'; rev: number; refs: Record<string, string>; created: unknown[]; seed: string; at: string }
  | { type: 'ops'; rev: number; ops: DocOp[]; seed: string; at: string; from: { peerId: string; name: string; kind: string } }
  | { type: 'rejected'; rev: number }
  | { type: 'opError'; error: OpErrorBody }
  | { type: 'peer'; peerId: string; presence: unknown }
  | { type: 'locked'; peerId?: string; by?: string; nodeIds: string[] }
  | { type: 'unlocked'; peerId: string; nodeIds: string[] };

/** Kode close WS: token tak dikenal/salah (CLOSE_BAD_TOKEN di @lakar/sync). */
const CLOSE_BAD_TOKEN = 4001;

type PendingCommit = {
  /** Pembangun payload ops — dipanggil pada replika TERKINI setiap kali ops akan dikirim (DocTransport). */
  build: CommitBuild;
  /** Payload terakhir yang dikirim: ops + deskripsi + baseRev = rev dokumen dasar build (bukan replika kini). */
  built: { ops: DocOp[]; description: string; baseRev: number } | undefined;
  /** Sudah dicoba ulang sekali sesudah `rejected`+resync (maksimal satu retry). */
  retried: boolean;
  /** Menunggu welcome hasil `resync` sebelum payload dibangun ulang pada replika segar. */
  resend: boolean;
  /** Generasi kirim: `go` tertunda (sendDelayMs) dibatalkan bila pengiriman baru dijadwalkan. */
  gen: number;
  /** ack ter-ack tapi apply lokal gagal → menunggu welcome resync supaya outcome membawa doc ASLI (bounded). */
  awaitDoc: { created: unknown[]; refs: Record<string, string>; timer: NodeJS.Timeout } | undefined;
  resolve: (o: DocCommitOutcome) => void;
  reject: (e: unknown) => void;
};

export type SyncClientOptions = {
  /** Nama join room (default: nama harness agen hasil `setAgent`, atau `lakar-mcp`). */
  name?: string;
  /** Backoff reconnect: awal (default 250ms), digandakan sampai `max` (default 30s), reset saat welcome. */
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  /** Hook tes: tunda pengiriman ops (ms) — memaksa race commit untuk menguji jalur `rejected`. */
  sendDelayMs?: number;
  /** Hook tes: dipanggil setiap kali klien meminta resync. */
  onResync?: () => void;
  /** Opsi diteruskan ke `DocTransport` (mis. katalog ikon palsu untuk tes). */
  transport?: DocTransportOptions;
};

/** Error retryable saat koneksi putus (server down / menyambung ulang). */
const unavailable = (url: string) =>
  new LakarError('EXEC_ERROR', `sync server ${url} tidak terjangkau (koneksi terputus, menyambung ulang)`, {
    hint: 'tool gagal sementara selama server down; koneksi tersambung kembali otomatis begitu server hidup',
    retryable: true,
  });

/** Token room adalah capability — di log/status hanya 6 karakter pertama + elipsis. */
export const maskToken = (token: string): string => `${token.slice(0, 6)}…`;

/**
 * `SyncClient` adalah `LakarTransport` untuk mode `--server`: menjaga replika dokumen room dan
 * menyalurkan `call(path, body)` ke `DocTransport` yang berjalan di atasnya.
 */
export class SyncClient implements LakarTransport {
  readonly url: string;
  readonly token: string;
  /** Mesin route (baca replika + tulis lewat ops) — sama dengan yang dipakai transport file/daemon. */
  readonly backend: DocTransport;
  readonly #opts: Required<Pick<SyncClientOptions, 'reconnectBaseMs' | 'reconnectMaxMs'>> & SyncClientOptions;
  #ws: WebSocket | undefined;
  #replica: { doc: LakarDocument; rev: number } | undefined;
  #peerId: string | undefined;
  readonly #peers = new Map<string, PeerInfo>();
  #connected = false;
  /** Error permanen (token salah / room diarsip): semua call menjawab ini, tanpa reconnect. */
  #fatal: { code: ErrorCode; message: string; hint?: string } | undefined;
  /** Rantai serial `#onMessage`: satu pesan diproses tuntas (termasuk await apply) sebelum berikutnya. */
  #tail: Promise<void> = Promise.resolve();
  #stopped = false;
  #attempt = 0;
  #timer: NodeJS.Timeout | undefined;
  /** Commit ops yang sedang menunggu jawaban server (satu in-flight; sisanya di `#queue`). */
  #pending: PendingCommit | undefined;
  readonly #queue: PendingCommit[] = [];
  /** Penyedia nama harness agen (dipakai nama join + diteruskan ke DocTransport). */
  #agentFn: (() => AgentInfo | undefined) | undefined;
  /** Penunggu `waitReady()` (resolve saat welcome, reject saat fatal). */
  readonly #readyWaiters: { resolve: () => void; reject: (e: Error) => void }[] = [];
  readonly #startedAt = new Date();

  constructor(url: string, token: string, options: SyncClientOptions = {}) {
    if (!token) throw new Error('lakar --server butuh capability token room: --token <token> (atau env LAKAR_TOKEN)');
    this.token = token;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`lakar --server: URL tidak valid ${JSON.stringify(url)} (contoh: wss://sync.lakar.dev atau http://127.0.0.1:7575)`);
    }
    const proto = { 'http:': 'ws:', 'https:': 'wss:', 'ws:': 'ws:', 'wss:': 'wss:' }[parsed.protocol];
    if (!proto) throw new Error(`lakar --server: protokol ${parsed.protocol} tidak didukung — pakai ws(s):// atau http(s)://`);
    parsed.protocol = proto;
    // Path non-root akan dijatuhkan URL join `/room/<token>` — gagal cepat, bukan loop reconnect diam-diam.
    if (parsed.pathname !== '/') {
      throw new Error(`lakar --server: URL ${JSON.stringify(url)} berisi path ${JSON.stringify(parsed.pathname)} — pakai origin saja, mis. ${parsed.origin}`);
    }
    this.url = parsed.toString().replace(/\/+$/, '');
    // Destruktur dengan default (bukan spread sesudahnya): `reconnectBaseMs: undefined` eksplisit
    // tidak menimpa default → tanpa NaN pada jadwal backoff.
    const { reconnectBaseMs = 250, reconnectMaxMs = 30_000 } = options;
    this.#opts = { ...options, reconnectBaseMs, reconnectMaxMs };
    this.backend = new DocTransport(
      {
        doc: () => {
          if (!this.#replica) throw unavailable(this.url);
          return this.#replica.doc;
        },
        slug: () => this.#replica?.doc.id ?? 'room',
        commit: (build) => this.#commit(build),
      },
      { client: CLIENT_NAME, ...options.transport },
    );
    this.#connect();
  }

  /** Nama peer saat join: nama harness agen yang disanitasi, fallback `name`/CLIENT_NAME. */
  #peerName(): string {
    try {
      return agentHeader(this.#agentFn?.()) ?? this.#opts.name ?? CLIENT_NAME;
    } catch {
      return this.#opts.name ?? CLIENT_NAME;
    }
  }

  /** URL WS join: `/room/<token>?name=<peer>&kind=agent`. */
  #wsUrl(): string {
    const u = new URL(`${this.url}/room/${encodeURIComponent(this.token)}`);
    u.searchParams.set('name', this.#peerName());
    u.searchParams.set('kind', 'agent');
    return u.toString();
  }

  /** Buka koneksi WS baru (dipanggil ulang oleh penjadwal reconnect). */
  #connect(): void {
    if (this.#stopped || this.#fatal) return;
    const ws = new WebSocket(this.#wsUrl());
    this.#ws = ws;
    // Serial: handler async tidak boleh berjalan bersamaan — apply yang tersuspend tidak boleh
    // memasang replika basi DI ATAS welcome/resync yang sudah memasang state lebih baru.
    ws.on('message', (raw) => {
      this.#tail = this.#tail.then(() => this.#onMessage(raw)).catch(() => {});
    });
    ws.on('close', (code) => this.#onClose(code));
    // Error socket tanpa listener membunuh proses; event close selalu menyusul.
    ws.on('error', () => {});
  }

  /** Penjadwalan reconnect dengan backoff eksponensial (reset percobaan saat welcome). */
  #scheduleReconnect(): void {
    if (this.#stopped || this.#fatal) return;
    const delay = Math.min(this.#opts.reconnectBaseMs * 2 ** this.#attempt, this.#opts.reconnectMaxMs);
    this.#attempt += 1;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#connect();
    }, delay);
    this.#timer.unref();
  }

  /** Minta state segar: server menjawab welcome baru yang menggantikan replika + daftar peer. */
  #resync(): void {
    this.#opts.onResync?.();
    this.#send({ type: 'resync' });
  }

  #send(msg: Record<string, unknown>): void {
    if (this.#ws?.readyState === WebSocket.OPEN) this.#ws.send(JSON.stringify(msg));
  }

  /**
   * Terapkan ops pada replika dengan kontrak deterministik (seed + at). Gagal apply atau gap rev →
   * replika divergen → resync (welcome baru mengoreksi state).
   */
  async #applyOps(ops: DocOp[], seed: string, at: string): Promise<DocCommitOutcome | undefined> {
    const base = this.#replica;
    if (!base) return undefined;
    try {
      const outcome = await applySeeded(base.doc, ops, seed, at, `mcp-${this.#peerId ?? 'join'}`, 'sync broadcast');
      // Stale-apply guard: replika diganti selama apply (welcome/resync lebih baru) → hasil basi
      // dibuang; state welcome sudah authoritative, resync berjaga-jaga bila ada yang terlewat.
      if (this.#replica !== base) {
        this.#resync();
        return undefined;
      }
      this.#replica = { doc: outcome.doc, rev: outcome.doc.rev };
      return outcome;
    } catch {
      this.#resync();
      return undefined;
    }
  }

  async #onMessage(raw: unknown): Promise<void> {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(String(raw)) as ServerMessage;
    } catch {
      return;
    }
    switch (msg.type) {
      case 'welcome': {
        // Dokumen room dipastikan skema terkini oleh server (create menolak versi lama); validasi
        // `LakarDocument.parse` di sini menangkap skew skema mcp/server secara eksplisit (→ fatal).
        let doc: LakarDocument;
        try {
          doc = LakarDocument.parse(msg.doc);
        } catch (e) {
          this.#fatal = {
            code: 'VERSION_MISMATCH',
            message: `dokumen room tidak cocok dengan skema mcp ini: ${e instanceof LakarError ? e.message : String(e)}`,
            hint: 'perbarui lakar (mcp) atau simpan dokumen dengan versi terkini',
          };
          this.#ws?.close();
          return;
        }
        this.#replica = { doc, rev: msg.rev };
        this.#peerId = msg.peerId;
        this.#peers.clear();
        for (const p of msg.peers) this.#peers.set(p.peerId, p);
        this.#connected = true;
        this.#attempt = 0;
        for (const w of this.#readyWaiters.splice(0)) w.resolve();
        const pending = this.#pending;
        if (pending?.awaitDoc) {
          // Welcome resync untuk commit yang apply-nya gagal pasca-ack: kembalikan doc ASLI
          // (bukan doc tiruan) supaya rev/docId yang diteruskan ke respons tool selalu valid.
          const { created, refs, timer } = pending.awaitDoc;
          clearTimeout(timer);
          pending.awaitDoc = undefined;
          this.#pending = undefined;
          pending.resolve({ doc, inverse: [], created: created as DocCommitOutcome['created'], refs });
          this.#pump();
        } else if (pending?.resend) {
          // Commit yang ditolak (`rejected`) dikirim ulang dengan payload BARU pada replika segar — SEKALI.
          pending.resend = false;
          this.#sendOps(pending);
        }
        return;
      }
      case 'ops': {
        if (!this.#replica) return;
        if (msg.rev !== this.#replica.rev + 1) {
          // Gap rev = broadcast terlewat → resync alih-alih menerapkan di atas state basi.
          this.#resync();
          return;
        }
        await this.#applyOps(msg.ops, msg.seed, msg.at);
        return;
      }
      case 'ack': {
        const pending = this.#pending;
        if (!pending) return;
        if (this.#replica && this.#replica.rev !== msg.rev - 1) {
          // Replika meleset dari rev yang di-ack (broadcast terlewat) → resync dan gagalkan commit.
          this.#pending = undefined;
          this.#resync();
          pending.reject(new LakarError('CONFLICT', 'replika tertinggal dari rev ack server; dokumen disegarkan lewat resync', { hint: 'ulangi perubahan ini', retryable: true }));
          this.#pump();
          return;
        }
        const outcome = await this.#applyOps(pending.built?.ops ?? [], msg.seed, msg.at);
        if (outcome) {
          this.#pending = undefined;
          pending.resolve({ ...outcome, created: msg.created as DocCommitOutcome['created'], refs: msg.refs });
          this.#pump();
          return;
        }
        // Apply lokal gagal → resync sudah diminta dari #applyOps; ops tetap ter-commit di server.
        // Tunggu welcome resync (bounded 10s) supaya outcome.doc = doc ASLI, bukan replika tiruan.
        pending.awaitDoc = {
          created: msg.created,
          refs: msg.refs,
          timer: setTimeout(() => {
            if (this.#pending !== pending || !pending.awaitDoc) return;
            pending.awaitDoc = undefined;
            this.#pending = undefined;
            pending.reject(
              new LakarError('EXEC_ERROR', 'commit ter-ack server tetapi state segar (resync) tidak tiba dalam 10 detik', {
                hint: 'perubahan mungkin sudah diterapkan server; inspect/list_boards untuk keadaan kini',
                retryable: true,
              }),
            );
            this.#pump();
          }, 10_000),
        };
        pending.awaitDoc.timer.unref();
        return;
      }
      case 'rejected': {
        const pending = this.#pending;
        if (!pending) return;
        if (!pending.retried) {
          // baseRev basi: resync lalu BANGUN ULANG payload pada replika segar SEKALI (retry kedua →
          // CONFLICT). Ops lama tidak di-replay verbatim — op turunan-konten (setComments, execute)
          // dibangun dari doc segar supaya tidak menimpa edit peer yang mendarat selama resync.
          pending.retried = true;
          pending.resend = true;
          pending.built = undefined;
          this.#resync();
          return;
        }
        this.#pending = undefined;
        pending.reject(
          new LakarError('CONFLICT', `ops ditolak server dua kali (rev room kini ${msg.rev}) — dokumen disegarkan`, {
            hint: 'perubahan lain lebih dulu masuk; inspect/list_boards untuk keadaan kini lalu ulangi',
            retryable: false,
          }),
        );
        this.#pump();
        return;
      }
      case 'opError': {
        const pending = this.#pending;
        this.#pending = undefined;
        // Kode wire dari server divalidasi ke enum — kode asing dipetakan ke EXEC_ERROR retryable.
        const parsed = ErrorCode.safeParse(msg.error.code);
        const code = parsed.success ? parsed.data : 'EXEC_ERROR';
        pending?.reject(
          new LakarError(code, msg.error.message, {
            hint: msg.error.hint,
            retryable: code === 'EXEC_ERROR',
          }),
        );
        this.#pump();
        return;
      }
      case 'locked': {
        // Bentuk penolakan (`by`): ops kita menyentuh node yang di-lock peer lain (advisory, TTL 2s).
        if (msg.by !== undefined && this.#pending) {
          const pending = this.#pending;
          this.#pending = undefined;
          pending.reject(
            new LakarError('CONFLICT', `ops menyentuh node yang sedang di-lock peer ${msg.by} (${msg.nodeIds.join(', ')})`, {
              hint: 'lock bersifat sementara (TTL 2 detik); ulangi sebentar lagi',
              retryable: true,
            }),
          );
          this.#pump();
        }
        return;
      }
      case 'peer_join':
        this.#peers.set(msg.peer.peerId, msg.peer);
        return;
      case 'peer_leave':
        this.#peers.delete(msg.peerId);
        return;
      case 'peer': {
        const p = this.#peers.get(msg.peerId);
        if (p) p.presence = msg.presence;
        return;
      }
      case 'unlocked':
        return;
      default:
        return;
    }
  }

  /** Tolak commit di udara + antrean (koneksi putus, fatal, atau klien ditutup). Idempotent. */
  #failInFlight(err: Error): void {
    const pending = this.#pending;
    this.#pending = undefined;
    if (pending?.awaitDoc) {
      clearTimeout(pending.awaitDoc.timer);
      pending.awaitDoc = undefined;
    }
    pending?.reject(err);
    for (const p of this.#queue.splice(0)) p.reject(err);
  }

  #onClose(code: number): void {
    this.#connected = false;
    this.#ws = undefined;
    if (!this.#stopped && code === CLOSE_BAD_TOKEN) {
      // Token salah/room tidak ada = permanen: cek SEBELUM gagal generik supaya commit di udara
      // dan waiter waitReady dijawab FORBIDDEN (bukan EXEC_ERROR "tidak terjangkau").
      this.#fatal = {
        code: 'FORBIDDEN',
        message: 'token join ditolak sync server (room tidak ada, token salah, atau room sudah diarsip)',
        hint: 'pakai token room dari respons create (field `token` untuk edit, `viewToken` untuk baca) lewat --token atau LAKAR_TOKEN',
      };
      const err = new LakarError('FORBIDDEN', this.#fatal.message, { hint: this.#fatal.hint });
      this.#failInFlight(err);
      for (const w of this.#readyWaiters.splice(0)) w.reject(err);
      return;
    }
    // Commit di udara dan antrean gagal retryable — kondisi dokumen tidak berubah dari sisi klien.
    this.#failInFlight(unavailable(this.url));
    if (this.#stopped) return;
    this.#scheduleReconnect();
  }

  /** Antre commit ops (FIFO satu in-flight); dipanggil DocTransport lewat `backend.commit`. */
  #commit(build: CommitBuild): Promise<DocCommitOutcome> {
    if (this.#fatal) return Promise.reject(new LakarError(this.#fatal.code, this.#fatal.message, { hint: this.#fatal.hint }));
    if (!this.#connected || !this.#replica) return Promise.reject(unavailable(this.url));
    return new Promise<DocCommitOutcome>((resolve, reject) => {
      const pending: PendingCommit = { build, built: undefined, retried: false, resend: false, gen: 0, awaitDoc: undefined, resolve, reject };
      if (this.#pending) {
        // Jalur tulis sudah diserialkan DocumentLocks DocTransport — antre defensif bila pemakaian lain.
        this.#queue.push(pending);
        return;
      }
      this.#pending = pending;
      this.#sendOps(pending);
    });
  }

  /** Proses antrean commit berikutnya (dipanggil tiap settle: ack/rejected/opError/locked). */
  #pump(): void {
    if (this.#pending || !this.#connected) return;
    const next = this.#queue.shift();
    if (!next) return;
    this.#pending = next;
    this.#sendOps(next);
  }

  /**
   * Bangun payload ops pada replika terkini lalu kirim `{type:'ops', baseRev, ops, desc}`.
   * `baseRev` SELALU rev dokumen yang dipakai `build` (ditangkap sebelum await) — broadcast yang
   * mendarat antara build dan kirim paling-paling membuat server menjawab `rejected` (resync +
   * build ulang di replika segar), tidak pernah ops dibangun di R dikirim dengan baseRev R+1.
   */
  #sendOps(pending: PendingCommit): void {
    const gen = ++pending.gen;
    const go = async () => {
      if (this.#pending !== pending || pending.gen !== gen || pending.resend) return;
      const base = this.#replica?.doc;
      if (!base) return;
      let payload;
      try {
        payload = await pending.build(base);
      } catch (e) {
        // Payload gagal dibangun pada replika ini (mutator/preview melempar) → gagalkan commit, bukan kirim.
        if (this.#pending === pending) {
          this.#pending = undefined;
          pending.reject(e);
          this.#pump();
        }
        return;
      }
      if (this.#pending !== pending || pending.gen !== gen || pending.resend || !this.#replica) return;
      if (payload === null) {
        // Tidak ada yang perlu ditulis pada replika segar (mis. resolve idempoten pasca-resync):
        // commit selesai tanpa rev baru, outcome = replika apa adanya (doc asli, bukan tiruan).
        const { doc } = this.#replica;
        this.#pending = undefined;
        pending.resolve({ doc, inverse: [], created: [], refs: {} });
        this.#pump();
        return;
      }
      pending.built = { ...payload, baseRev: base.rev };
      const send = () => {
        if (this.#pending !== pending || pending.gen !== gen || pending.resend || pending.built === undefined) return;
        this.#send({ type: 'ops', baseRev: pending.built.baseRev, ops: pending.built.ops, desc: pending.built.description });
      };
      // Payload dibangun SEGERA (basis = intent pemanggil); hanya pengiriman yang ditunda hook tes.
      const delay = this.#opts.sendDelayMs;
      if (delay === undefined) send();
      else setTimeout(send, delay).unref();
    };
    void go();
  }

  // -------------------------------------------------------------------------
  // LakarTransport
  // -------------------------------------------------------------------------

  /** Penyedia clientInfo agen → nama join + penulis komentar (sama dengan FileClient). */
  setAgent(provider: () => AgentInfo | undefined): void {
    this.#agentFn = provider;
    this.backend.setAgent(() => agentHeader(provider()));
  }

  /** Status transport server (bentuk `/status` + field `transport:'server'`, server, room, rev, peers). */
  async status<T>(): Promise<ApiResult<T>> {
    return {
      ok: true,
      data: {
        version: LAKAR_VERSION,
        schemaVersion: SCHEMA_VERSION,
        node: process.version,
        pid: process.pid,
        startedAt: this.#startedAt.toISOString(),
        uptimeSec: Math.floor((Date.now() - this.#startedAt.getTime()) / 1000),
        transport: 'server',
        server: this.url,
        room: maskToken(this.token),
        connected: this.#connected,
        ...(this.#replica ? { rev: this.#replica.rev } : {}),
        peers: this.#peers.size,
        hint: "mode server tanpa renderer: board height:'hug' tidak terukur (height 0) — atur x/y eksplisit; tool render/jaringan → NOT_SUPPORTED",
      } as T,
    };
  }

  /** Route tool → DocTransport pada replika (error jelas saat fatal/terputus). */
  async call<T>(path: string, body: unknown = {}): Promise<ApiResult<T>> {
    if (this.#fatal) {
      return { ok: false, error: { code: this.#fatal.code, message: this.#fatal.message, hint: this.#fatal.hint ?? '', retryable: false } };
    }
    if (!this.#connected || !this.#replica) {
      const e = unavailable(this.url);
      return { ok: false, error: { code: e.code, message: e.message, hint: e.hint, retryable: true } };
    }
    return this.backend.call<T>(path, body);
  }

  // -------------------------------------------------------------------------
  // Akses tes/diagnostik
  // -------------------------------------------------------------------------

  /** Replika dokumen tersimpan terkini (undefined sebelum welcome pertama). */
  get doc(): LakarDocument | undefined {
    return this.#replica?.doc;
  }

  /** Rev replika (sama dengan `doc.rev`). */
  get rev(): number | undefined {
    return this.#replica?.rev;
  }

  /** Jumlah peer di room termasuk klien ini. */
  get peers(): number {
    return this.#peers.size;
  }

  /** true bila koneksi WS hidup dan welcome sudah diterima. */
  get connected(): boolean {
    return this.#connected;
  }

  /** Tunggu welcome pertama/berikutnya (tes). Reject saat fatal (token salah) atau klien ditutup. */
  waitReady(): Promise<void> {
    if (this.#fatal) return Promise.reject(new Error(this.#fatal.message));
    if (this.#connected) return Promise.resolve();
    return new Promise((resolve, reject) => this.#readyWaiters.push({ resolve, reject }));
  }

  /** Hentikan klien: tutup WS, tolak commit tertunda + waiter waitReady, matikan reconnect. */
  close(): void {
    this.#stopped = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    // Ditolak eksplisit di sini (bukan hanya lewat #onClose): ws mungkin belum pernah OPEN sehingga
    // event close tidak selalu terpicu — waiter dan commit jangan sampai menggantung selamanya.
    this.#failInFlight(unavailable(this.url));
    for (const w of this.#readyWaiters.splice(0)) w.reject(new Error('SyncClient ditutup sebelum welcome'));
    this.#ws?.close();
    this.#ws = undefined;
  }
}
