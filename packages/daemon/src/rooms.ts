// Jembatan room `@lakar/sync` di dalam lakard (spec-collab-cloud story 5): `RoomRegistry` memegang
// `RoomClient` per room yang digabung dan memetakannya sebagai slug `room-<token6>` sehingga seluruh
// route viewer/agent berjalan pada replika lokal — baca dari replika, tulis sebagai ops ke sequencer
// room. Dokumen room hanya hidup di memori (tidak pernah masuk DocStore); keluar (`leave`) menutup
// koneksi dan membuang entri.
//
// Peristiwa klien diteruskan ke `ActivityBus` (event `change` untuk rev baru, `peers`/`presence`
// untuk chip dan kursor peer di viewer) — stream `/viewer/events` yang sama, tanpa EventSource baru.
import type { FastifyReply } from 'fastify';
import { LakarError, SLUG_PATTERN, type LakarDocument } from '@lakar/schema';
import { z } from 'zod';
import type { DocTransport, DocTransportOptions } from './doc-transport.js';
import { STATUS } from './errors.js';
import type { ActivityBus } from './events.js';
import { normalizeRoomServer, RoomClient, type RoomClientOptions, type RoomPeer } from './room-client.js';

/** Prefiks slug dokumen room — pembeda dispatch dari dokumen lokal di seluruh route. */
export const ROOM_SLUG_PREFIX = 'room-';

/** Entri room yang terdaftar. */
export type RoomEntry = {
  slug: string;
  server: string;
  client: RoomClient;
  /** Transport level-dokumen (`DocTransport` di atas replika) — route agent didelegasikan ke sini. */
  transport: DocTransport;
  joinedAt: string;
  /** Perubahan replika terakhir (diperbarui hook onDoc) — `updatedAt` di daftar dokumen. */
  updatedAt: string;
};

/** Ringkasan satu room untuk `GET /viewer/docs` dan `/viewer/documents` (field `remote`/`server`/`peers` additive). */
export type RoomSummary = {
  slug: string;
  name: string;
  rev: number;
  updatedAt: string;
  remote: true;
  server: string;
  peers: number;
  connected: boolean;
};

export type RoomJoinResult = { slug: string; server: string; name: string; rev: number; peers: number; connected: boolean };

export type RoomRegistryOptions = {
  /** Bus aktivitas untuk event `change`/`peers`/`presence` (opsional; tes tanpa UI boleh kosong). */
  activity?: ActivityBus;
  /** Opsi diteruskan ke `DocTransport` (katalog ikon daemon). */
  transport?: DocTransportOptions;
  /** Nama peer kita di room (default 'Lakar'). */
  name?: string;
  /** Jenis peer yang dilaporkan (default 'human'). */
  kind?: 'human' | 'agent';
  /** Nama klien sesi `DocTransport` (default 'lakar-viewer'). */
  client?: string;
  /** Opsi `RoomClient` tambahan (hook tes reconnect/sendDelay). */
  clientOptions?: RoomClientOptions;
  /** Diff board tersentuh antar replika (default: `touchedBoards` + resolveDocument; tes bisa melewati). */
  touched?: (prev: LakarDocument, next: LakarDocument) => string[];
  /**
   * Slug terklaim di luar registry (dokumen lokal di memori/disk/arsip). Dipakai `#freeSlug` dua arah:
   * join tidak boleh menempelkan slug `room-*` di atas file lokal yang sudah ada.
   */
  claimed?: (slug: string) => boolean | Promise<boolean>;
  /** Dipanggil sesudah `leave` berhasil (pemilik registry melepas pin sesi/fokus/seleksi). */
  onLeave?: (slug: string) => void;
};

/** Waktu tunggu welcome pertama saat join (server tidak merespons → EXEC_ERROR, bukan hang). */
export const ROOM_JOIN_TIMEOUT_MS = 15_000;

/** 6 karakter pertama token → potongan slug aman (huruf kecil/angka/tanda hubung). */
const tokenSlug = (token: string): string => {
  const s = token
    .slice(0, 6)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/^-+|-+$/g, '');
  return s || 'x';
};

/**
 * Peta slug `room-*` → room aktif. `doc(slug)` mengembalikan replika terkini (dipakai `docOf` di
 * route baca); `get(slug)` untuk delegasi tulis lewat `transport`/`commitOps`.
 */
export class RoomRegistry {
  readonly #opts: RoomRegistryOptions;
  readonly #rooms = new Map<string, RoomEntry>();
  /** Join yang sedang berjalan per (server, token) — join konkuren room yang sama memakai hasil yang sama. */
  readonly #joining = new Map<string, Promise<RoomJoinResult>>();
  /** `close()` sudah dipanggil: join yang selesai terlambat tidak boleh mendaftarkan room bocor. */
  #closed = false;

  constructor(opts: RoomRegistryOptions = {}) {
    this.#opts = opts;
  }

  /** `slug` adalah slug dokumen room (prefiks) DAN benar-benar terdaftar. */
  get(slug: string): RoomEntry | undefined {
    return this.#rooms.get(slug);
  }

  has(slug: string): boolean {
    return this.#rooms.has(slug);
  }

  /** Replika terkini dokumen room (undefined = bukan room/belum ada welcome). */
  doc(slug: string): LakarDocument | undefined {
    return this.#rooms.get(slug)?.client.replica;
  }

  /** Slug terklaim: room terdaftar atau milik dokumen lokal (memori/disk/arsip lewat `claimed`). */
  async #taken(slug: string): Promise<boolean> {
    return this.#rooms.has(slug) || (await this.#opts.claimed?.(slug)) === true;
  }

  /** Slug bebas `room-<token6>`; tabrakan (token lain, awalan sama, atau file lokal) → akhiran `-2`, `-3`, … */
  async #freeSlug(token: string): Promise<string> {
    const base = `${ROOM_SLUG_PREFIX}${tokenSlug(token)}`;
    if (!(await this.#taken(base))) return base;
    for (let n = 2; ; n++) {
      const s = `${base}-${n}`;
      if (!(await this.#taken(s))) return s;
    }
  }

  /**
   * Gabung room: `server` = origin http(s)/ws(s) (tanpa path), `token` = capability token room.
   * Idempotent per (server, token) dengan server TERNORMALISASI (userinfo/garis miring dibuang): join
   * ulang — serial maupun konkuren — mengembalikan entri/promise yang sama.
   * Gagal → LakarError AD-11 (token salah → FORBIDDEN; tak terjangkau → EXEC_ERROR retryable).
   */
  async join(server: string, token: string, peerName?: string): Promise<RoomJoinResult> {
    let normalized: string;
    try {
      normalized = normalizeRoomServer(server);
    } catch (e) {
      throw new LakarError('SCHEMA_INVALID', e instanceof Error ? e.message : String(e), { hint: 'server = origin ws(s):// atau http(s):// tanpa path; token = capability token room' });
    }
    const existing = [...this.#rooms.values()].find((r) => r.server === normalized && r.client.token === token);
    if (existing) return this.#result(existing);
    const key = `${normalized} ${token}`;
    const pending = this.#joining.get(key);
    if (pending) return pending;
    const p = this.#join(normalized, token, peerName).finally(() => this.#joining.delete(key));
    this.#joining.set(key, p);
    return p;
  }

  /** Join satu kali per percobaan; slug yang terklaim file lokal selama jeda welcome → coba slug berikutnya. */
  async #join(server: string, token: string, peerName?: string): Promise<RoomJoinResult> {
    for (let attempt = 1; ; attempt++) {
      const slug = await this.#freeSlug(token);
      const entry: RoomEntry = {
        slug,
        server,
        client: undefined as unknown as RoomClient,
        transport: undefined as unknown as DocTransport,
        joinedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      let client: RoomClient;
      try {
        client = new RoomClient(server, token, {
          name: peerName ?? this.#opts.name,
          kind: this.#opts.kind ?? 'human',
          client: this.#opts.client,
          slug,
          transport: this.#opts.transport,
          ...this.#opts.clientOptions,
          hooks: {
            ...this.#opts.clientOptions?.hooks,
            onDoc: (doc, prev) => {
              entry.updatedAt = new Date().toISOString();
              this.#opts.clientOptions?.hooks?.onDoc?.(doc, prev);
              // Board tersentuh dari diff replika lama→baru (sama dengan ops.ts) supaya viewer hanya me-render ulang itu.
              let boards: string[] | undefined;
              if (prev && this.#opts.touched) {
                try {
                  boards = this.#opts.touched(prev, doc);
                } catch {
                  boards = undefined;
                }
              }
              this.#opts.activity?.change({ kind: 'edit', slug, rev: doc.rev, ...(boards ? { boards } : {}) });
            },
            onPeers: (peers, connected) => {
              this.#opts.clientOptions?.hooks?.onPeers?.(peers, connected);
              this.#opts.activity?.peers({ slug, connected, peers, ...(client.peerId !== undefined ? { self: client.peerId } : {}) });
            },
            onPresence: (peerId, presence) => {
              this.#opts.clientOptions?.hooks?.onPresence?.(peerId, presence);
              this.#opts.activity?.presence({ slug, peerId, presence });
            },
            onFatal: (fatal) => {
              this.#opts.clientOptions?.hooks?.onFatal?.(fatal);
              this.#opts.activity?.peers({ slug, connected: false, peers: client.peerList, ...(client.peerId !== undefined ? { self: client.peerId } : {}) });
            },
          },
        });
      } catch (e) {
        throw new LakarError('SCHEMA_INVALID', e instanceof Error ? e.message : String(e), { hint: 'server = origin ws(s):// atau http(s):// tanpa path; token = capability token room' });
      }
      entry.client = client;
      entry.transport = client.backend;
      // Timer dibersihkan di `finally` (welcome bisa tiba lebih dulu — jangan biarkan reject yatim)
      // dan di-unref supaya tidak menahan proses hidup.
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          client.waitReady(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new LakarError('EXEC_ERROR', `sync server ${server} tidak merespons join (welcome tidak tiba dalam ${ROOM_JOIN_TIMEOUT_MS / 1000} detik)`, {
                    hint: 'periksa URL server dan token room, lalu coba lagi',
                    retryable: true,
                  }),
                ),
              ROOM_JOIN_TIMEOUT_MS,
            );
            timer.unref();
          }),
        ]);
      } catch (e) {
        client.close();
        const fatal = client.fatal;
        if (fatal) throw new LakarError(fatal.code, fatal.message, { hint: fatal.hint });
        throw e;
      } finally {
        clearTimeout(timer);
      }
      // Registry ditutup selama join berjalan (shutdown): jangan daftarkan klien yang tidak akan ditutup lagi.
      if (this.#closed) {
        client.close();
        throw new LakarError('EXEC_ERROR', 'lakard sedang berhenti — join dibatalkan', { hint: 'mulai ulang lakard lalu coba lagi', retryable: true });
      }
      // Balapan join-vs-buat: slug yang bebas saat `#freeSlug` bisa terklaim file lokal selama `waitReady`
      // (New file tidak memegang kunci registry) → tutup klien ini dan minta slug bebas baru.
      if (await this.#taken(slug)) {
        client.close();
        if (attempt >= 5) {
          throw new LakarError('CONFLICT', `slug ${slug} terus diperebutkan dokumen lokal`, { hint: 'tutup pembuatan file lokal yang berjalan lalu coba lagi', retryable: true });
        }
        continue;
      }
      this.#rooms.set(slug, entry);
      this.#opts.activity?.change({ kind: 'create', slug });
      return this.#result(entry);
    }
  }

  #result(entry: RoomEntry): RoomJoinResult {
    const doc = entry.client.replica;
    return {
      slug: entry.slug,
      server: entry.server,
      name: doc?.id ?? entry.slug,
      rev: entry.client.rev ?? 0,
      peers: entry.client.peers,
      connected: entry.client.connected,
    };
  }

  /** Keluar room: tutup koneksi + buang entri (replika ikut dibuang — dokumen room tidak pernah ditulis ke DocStore). */
  leave(slug: string): { slug: string; server: string } {
    const entry = this.#rooms.get(slug);
    if (!entry) {
      throw new LakarError('NOT_FOUND', `room ${slug} tidak sedang digabung`, { hint: 'lihat daftar di GET /viewer/docs (entri remote) atau gabung lewat POST /viewer/rooms/join' });
    }
    this.#rooms.delete(slug);
    entry.client.close();
    this.#opts.onLeave?.(slug);
    this.#opts.activity?.change({ kind: 'delete', slug });
    return { slug, server: entry.server };
  }

  /** Kirim presence klien ini ke peer room (kursor/seleksi viewer). No-op bila slug bukan room. */
  sendPresence(slug: string, presence: unknown): void {
    this.#rooms.get(slug)?.client.sendPresence(presence);
  }

  /** Ringkasan semua room aktif (urutan join) untuk daftar dokumen. */
  list(): RoomSummary[] {
    const out: RoomSummary[] = [];
    for (const entry of this.#rooms.values()) {
      out.push({
        slug: entry.slug,
        name: entry.client.replica?.id ?? entry.slug,
        rev: entry.client.rev ?? 0,
        updatedAt: entry.updatedAt,
        remote: true,
        server: entry.server,
        peers: entry.client.peers,
        connected: entry.client.connected,
      });
    }
    return out;
  }

  /** Tutup semua klien (shutdown daemon). */
  close(): void {
    this.#closed = true;
    for (const entry of this.#rooms.values()) entry.client.close();
    this.#rooms.clear();
  }
}

/** Lookup minimal yang dibutuhkan registrar route (hindari dependensi pada bentuk registry penuh). */
export type RoomLookup = {
  get(slug: string): RoomEntry | undefined;
  doc(slug: string): LakarDocument | undefined;
};

/**
 * Delegasi route agent ke `DocTransport` room lalu petakan `ApiResult` ke respons HTTP.
 * `agent` (header x-lakar-agent) dipasang ke transport room per panggilan — sesi room dipakai
 * bersama, jadi label hanya informatif (komentar/riwayat atas nama agen terakhir pemanggil).
 */
export async function roomCall(room: RoomEntry, path: string, body: unknown, reply: FastifyReply, agent?: string): Promise<unknown> {
  if (agent !== undefined) room.transport.setAgent(() => agent);
  const r = await room.client.call(path, body);
  if (r.ok) return reply.code(200).send(r);
  return reply.code(STATUS[r.error.code] ?? 500).send(r);
}

// ---------------------------------------------------------------------------
// Route `/viewer/rooms/*` (guard Origin /viewer/* di server.ts berlaku otomatis untuk non-GET)
// ---------------------------------------------------------------------------

const JoinBody = z.object({ server: z.string().min(1), token: z.string().min(1), name: z.string().max(64).optional() }).strict();
const JOIN_HINT = 'kirim {server, token} (server = origin http(s)/ws(s) sync server, token = capability token room)';
const PresenceBody = z.object({ presence: z.unknown() }).strict();

type RoomRoutesOptions = { rooms: RoomRegistry };

/**
 * `POST /viewer/rooms/join {server, token, name?}` → `{slug, server, name, rev, peers, connected}`.
 * `POST /viewer/rooms/:slug/leave` → `{slug, server}`.
 * `PUT /viewer/rooms/:slug/presence {presence}` → siarkan presence klien ini ke peer (kursor/seleksi).
 * `GET /viewer/rooms/:slug/peers` → daftar peer + status koneksi (polling awal; sisanya event `peers`).
 */
export function registerRoomRoutes(app: import('fastify').FastifyInstance, { rooms }: RoomRoutesOptions): void {
  app.post('/viewer/rooms/join', async (req, reply) => {
    const parsed = JoinBody.safeParse(req.body);
    if (!parsed.success) {
      throw new LakarError('SCHEMA_INVALID', parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: JOIN_HINT });
    }
    const { server, token, name } = parsed.data;
    const r = await rooms.join(server, token, name);
    return reply.code(200).send({ ok: true, data: r });
  });

  app.post('/viewer/rooms/:slug/leave', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    if (!SLUG_PATTERN.test(slug)) throw new LakarError('NOT_FOUND', `room ${slug} tidak ada`, { hint: 'pakai slug dari GET /viewer/docs' });
    const r = rooms.leave(slug);
    return reply.code(200).send({ ok: true, data: r });
  });

  app.put('/viewer/rooms/:slug/presence', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const parsed = PresenceBody.safeParse(req.body);
    if (!parsed.success) {
      throw new LakarError('SCHEMA_INVALID', parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: 'kirim {presence} (objek bebas: {cursor:{x,y}, selection:[…], name, kind})' });
    }
    if (!rooms.has(slug)) throw new LakarError('NOT_FOUND', `room ${slug} tidak sedang digabung`, { hint: 'gabung lewat POST /viewer/rooms/join' });
    rooms.sendPresence(slug, parsed.data.presence);
    return reply.code(200).send({ ok: true, data: { slug } });
  });

  app.get('/viewer/rooms/:slug/peers', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const entry = rooms.get(slug);
    if (!entry) throw new LakarError('NOT_FOUND', `room ${slug} tidak sedang digabung`, { hint: 'gabung lewat POST /viewer/rooms/join' });
    const peers: RoomPeer[] = entry.client.peerList;
    return reply.code(200).send({ ok: true, data: { slug, connected: entry.client.connected, peers, self: entry.client.peerId } });
  });
}
