// Lapisan repo room (spec-collab-cloud story 3): interface `RoomRepo` + dua implementasi.
// `PgRoomRepo` dipakai service sungguhan (dites pg.test.ts saat DATABASE_URL ada); `MemoryRoomRepo`
// untuk tes unit tanpa Postgres. Kontrak sama: room archived diperlakukan seperti tidak ada
// (load/meta/appendOp → undefined/'missing'), dan `appendOp` adalah satu-satunya penulis doc+rev —
// `SELECT ... FOR UPDATE` pada baris room menjadikannya sequencer (rev monotonic tanpa gap).
// Story B spec-cloud-auth menambah `owner_id` (akun pemilik room) dan `sessionUser` — lookup
// READ-ONLY ke tabel `sessions`/`users` milik service api yang berbagi Postgres yang sama.
import type { Pool } from 'pg';
import type { LakarDocument } from '@lakar/schema';

/** Room baru: dua capability token — `token` (edit) dan `viewToken` (view-only). */
export type NewRoom = {
  token: string;
  viewToken: string;
  title: string;
  /** Dokumen tersimpan (unresolved), sudah divalidasi `parseDocument`. */
  doc: LakarDocument;
  /** Pemilik akun (id users service api); `undefined`/null = room era admin-key (workspace). */
  ownerId?: string;
};

/** Hasil load lewat capability token: `access` menandai token mana yang cocok. */
export type LoadedRoom = {
  token: string;
  viewToken: string;
  title: string;
  doc: LakarDocument;
  rev: number;
  createdAt: string;
  access: 'edit' | 'view';
};

/** Meta room untuk route pemilik (tanpa doc). `ownerId` null = era admin-key. */
export type RoomMeta = { token: string; viewToken: string; title: string; rev: number; createdAt: string; ownerId: string | null };

/** User pemilik session akun (hasil join sessions→users; hanya field yang sync butuhkan). */
export type SessionUser = { id: string; email: string; name: string | null };

/**
 * Tabel auth (`sessions`/`users`, milik service api) belum ada di database bersama — migrasi
 * api belum jalan. Lapisan app menerjemahkannya ke 501 NOT_SUPPORTED (bukan 500/401).
 */
export class AuthTablesMissing extends Error {
  constructor() {
    super('tabel sessions/users belum ada di database (migrasi auth service api belum jalan)');
    this.name = 'AuthTablesMissing';
  }
}

/**
 * Meta commit yang disimpan di room_ops. `peerName` advisori (klaim klien, tak diverifikasi);
 * `seed` + `at` adalah parameter commit deterministik — replay ops lewat
 * `transact(doc, ops, {random: seededRandom(seed), now: () => at})` mereproduksi ID mint identik.
 */
export type RoomOpMeta = { peerName: string; seed: string; at: Date };

/** Satu baris log op (append-only). */
export type RoomOpRow = { rev: number; ops: unknown; peerName: string; seed: string; at: string };

/**
 * Hasil commit satu revisi. 'stale' = rev room sudah bergerak (peer lain menang atau baseRev basi);
 * `rev` membawa rev terkini supaya pemanggil bisa menyuruh klien resync.
 */
export type AppendResult = { status: 'ok'; rev: number } | { status: 'stale'; rev: number } | { status: 'missing' };

export interface RoomRepo {
  create(room: NewRoom): Promise<void>;
  /** Muat room aktif lewat token edit atau view; `undefined` bila tak dikenal atau archived. */
  load(accessToken: string): Promise<LoadedRoom | undefined>;
  /** Meta room (token = edit token); `undefined` bila tak dikenal atau archived. */
  meta(token: string): Promise<RoomMeta | undefined>;
  /**
   * Commit ops: dalam satu transaksi, `SELECT ... FOR UPDATE` baris room; rev != baseRev → 'stale'
   * (doc tidak berubah); room archived/tak ada → 'missing'. Sukses: doc+rev ditulis dan satu baris
   * room_ops (ops + `meta` commit deterministik) ditambahkan, atomic.
   */
  appendOp(token: string, baseRev: number, doc: LakarDocument, ops: readonly unknown[], meta: RoomOpMeta): Promise<AppendResult>;
  /** Log op room mulai `fromRev` (inklusif), urut rev; `undefined` bila room tak ada. Untuk tes/restore. */
  opsLog(token: string, fromRev?: number): Promise<RoomOpRow[] | undefined>;
  /** Arsipkan room (semua akses ditutup). `false` bila tak dikenal atau sudah archived. */
  archive(token: string): Promise<boolean>;
  /**
   * Daftar meta room aktif, urut terbaru dulu. `ownerId` diset (session user) → hanya room
   * miliknya (owner NULL tidak pernah cocok — room workspace bukan milik user manapun);
   * `undefined` (admin) → semua room.
   */
  list(ownerId?: string): Promise<RoomMeta[]>;
  /**
   * Pemilik room (id users); `null` = room tanpa pemilik (era admin-key), `undefined` = room
   * tak dikenal/archived. Dipakai cek kepemilikan sebelum 403 — lihat requireRoomOwner di app.
   */
  ownerOf(token: string): Promise<string | null | undefined>;
  /**
   * User pemilik Bearer session yang masih hidup; `undefined` = token tak dikenal/kedaluwarsa.
   * READ-ONLY ke tabel milik api (sync tidak pernah menulis sessions/users). Bisa melempar
   * `AuthTablesMissing` bila migrasi auth api belum jalan di database bersama.
   */
  sessionUser(token: string): Promise<SessionUser | undefined>;
  /** Koneksi DB hidup (untuk /healthz; impl memori selalu true). */
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementasi Postgres (adaptor; SQL plain, tanpa ORM)
// ---------------------------------------------------------------------------

type RoomRow = { token: string; view_token: string; title: string; doc: LakarDocument; rev: number; created_at: Date; owner_id: string | null };

const toLoaded = (r: RoomRow, access: 'edit' | 'view'): LoadedRoom => ({
  token: r.token,
  viewToken: r.view_token,
  title: r.title,
  doc: r.doc,
  rev: r.rev,
  createdAt: r.created_at.toISOString(),
  access,
});

const toMeta = (r: Omit<RoomRow, 'doc'>): RoomMeta => ({ token: r.token, viewToken: r.view_token, title: r.title, rev: r.rev, createdAt: r.created_at.toISOString(), ownerId: r.owner_id });

export class PgRoomRepo implements RoomRepo {
  constructor(private readonly pool: Pool) {}

  async create(room: NewRoom): Promise<void> {
    await this.pool.query('INSERT INTO rooms (token, view_token, title, doc, rev, owner_id) VALUES ($1, $2, $3, $4, $5, $6)', [
      room.token,
      room.viewToken,
      room.title,
      JSON.stringify(room.doc),
      room.doc.rev,
      room.ownerId ?? null,
    ]);
  }

  async load(accessToken: string): Promise<LoadedRoom | undefined> {
    // Satu query untuk dua capability token; rev dan doc dibaca dalam statement yang sama.
    const { rows } = await this.pool.query<RoomRow & { access: 'edit' | 'view' }>(
      `SELECT token, view_token, title, doc, rev, created_at, owner_id,
              CASE WHEN token = $1 THEN 'edit' ELSE 'view' END AS access
       FROM rooms WHERE (token = $1 OR view_token = $1) AND archived_at IS NULL`,
      [accessToken],
    );
    const row = rows[0];
    return row ? toLoaded(row, row.access) : undefined;
  }

  async meta(token: string): Promise<RoomMeta | undefined> {
    // doc sengaja tidak di-SELECT: meta tidak membutuhkannya dan doc bisa besar.
    const { rows } = await this.pool.query<Omit<RoomRow, 'doc'>>('SELECT token, view_token, title, rev, created_at, owner_id FROM rooms WHERE token = $1 AND archived_at IS NULL', [token]);
    return rows[0] ? toMeta(rows[0]) : undefined;
  }

  async appendOp(token: string, baseRev: number, doc: LakarDocument, ops: readonly unknown[], meta: RoomOpMeta): Promise<AppendResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // FOR UPDATE = sequencer per dokumen: commit lain (instance lain) menunggu baris ini,
      // lalu membaca rev terbaru — tidak ada dua commit pada rev yang sama.
      const { rows } = await client.query<{ rev: number; archived_at: Date | null }>('SELECT rev, archived_at FROM rooms WHERE token = $1 FOR UPDATE', [token]);
      const row = rows[0];
      if (!row || row.archived_at !== null) {
        await client.query('ROLLBACK');
        return { status: 'missing' };
      }
      if (row.rev !== baseRev) {
        await client.query('ROLLBACK');
        return { status: 'stale', rev: row.rev };
      }
      const rev = baseRev + 1;
      await client.query('UPDATE rooms SET doc = $2, rev = $3 WHERE token = $1', [token, JSON.stringify(doc), rev]);
      // seed + at = parameter commit deterministik yang sama dengan yang dipakai transact —
      // replay baris ini (transact dengan seededRandom(seed), now = at) mengembalikan doc identik.
      await client.query('INSERT INTO room_ops (room, rev, ops, peer_name, seed, at) VALUES ($1, $2, $3, $4, $5, $6)', [
        token,
        rev,
        JSON.stringify(ops),
        meta.peerName,
        meta.seed,
        meta.at,
      ]);
      await client.query('COMMIT');
      return { status: 'ok', rev };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async opsLog(token: string, fromRev = 0): Promise<RoomOpRow[] | undefined> {
    const { rows } = await this.pool.query<{ rev: number; ops: unknown; peer_name: string; seed: string; at: Date }>(
      `SELECT o.rev, o.ops, o.peer_name, o.seed, o.at FROM room_ops o JOIN rooms r ON r.token = o.room
       WHERE o.room = $1 AND o.rev >= $2 AND r.archived_at IS NULL ORDER BY o.rev`,
      [token, fromRev],
    );
    if (rows.length === 0 && !(await this.meta(token))) return undefined;
    return rows.map((r) => ({ rev: r.rev, ops: r.ops, peerName: r.peer_name, seed: r.seed, at: r.at.toISOString() }));
  }

  async archive(token: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('UPDATE rooms SET archived_at = now() WHERE token = $1 AND archived_at IS NULL', [token]);
    return (rowCount ?? 0) > 0;
  }

  async list(ownerId?: string): Promise<RoomMeta[]> {
    const { rows } = await this.pool.query<Omit<RoomRow, 'doc'>>(
      `SELECT token, view_token, title, rev, created_at, owner_id FROM rooms
       WHERE archived_at IS NULL${ownerId !== undefined ? ' AND owner_id = $1' : ''} ORDER BY created_at DESC`,
      ownerId !== undefined ? [ownerId] : [],
    );
    return rows.map(toMeta);
  }

  async ownerOf(token: string): Promise<string | null | undefined> {
    const { rows } = await this.pool.query<{ owner_id: string | null }>('SELECT owner_id FROM rooms WHERE token = $1 AND archived_at IS NULL', [token]);
    return rows[0] === undefined ? undefined : rows[0].owner_id;
  }

  async sessionUser(token: string): Promise<SessionUser | undefined> {
    try {
      const { rows } = await this.pool.query<{ id: string; email: string; name: string | null }>(
        'SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1 AND s.expires_at > now()',
        [token],
      );
      const r = rows[0];
      return r ? { id: r.id, email: String(r.email), name: r.name } : undefined;
    } catch (e) {
      // 42P01 (undefined_table): tabel sessions/users milik api belum termigrasi di database
      // bersama — bukan kesalahan runtime biasa; laporkan supaya app menjawab 501 NOT_SUPPORTED.
      if ((e as { code?: string }).code === '42P01') throw new AuthTablesMissing();
      throw e;
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// ---------------------------------------------------------------------------
// Implementasi memori (tes unit; kontrak sama dengan PgRoomRepo)
// ---------------------------------------------------------------------------

type StoredRoom = { token: string; viewToken: string; title: string; doc: LakarDocument; rev: number; createdAt: string; ownerId: string | null; archived: boolean };
type StoredSession = { user: SessionUser; expiresAt: number | undefined };

export class MemoryRoomRepo implements RoomRepo {
  private readonly rooms = new Map<string, StoredRoom>();
  private readonly opsBy = new Map<string, RoomOpRow[]>();
  private readonly sessions = new Map<string, StoredSession>();
  /** Tes bisa mematikan DB tiruan (healthz down). */
  up = true;
  /** Tes bisa meniadakan tabel auth tiruan (migrasi api belum jalan → 501 NOT_SUPPORTED). */
  authReady = true;

  /** Helper tes (bukan bagian kontrak RoomRepo): tanam session untuk user tiruan.
   *  `expiresAt` epoch ms; kosong = tidak pernah kedaluwarsa. */
  seedSession(token: string, user: SessionUser, expiresAt?: number): void {
    this.sessions.set(token, { user, expiresAt });
  }

  async create(room: NewRoom): Promise<void> {
    if (this.rooms.has(room.token)) throw new Error(`room ${room.token} sudah ada`);
    this.rooms.set(room.token, {
      token: room.token,
      viewToken: room.viewToken,
      title: room.title,
      doc: room.doc,
      rev: room.doc.rev,
      createdAt: new Date().toISOString(),
      ownerId: room.ownerId ?? null,
      archived: false,
    });
    this.opsBy.set(room.token, []);
  }

  private active(token: string): StoredRoom | undefined {
    const r = this.rooms.get(token);
    return r && !r.archived ? r : undefined;
  }

  async load(accessToken: string): Promise<LoadedRoom | undefined> {
    for (const r of this.rooms.values()) {
      if (r.archived) continue;
      if (r.token === accessToken || r.viewToken === accessToken) {
        return { token: r.token, viewToken: r.viewToken, title: r.title, doc: r.doc, rev: r.rev, createdAt: r.createdAt, access: r.token === accessToken ? 'edit' : 'view' };
      }
    }
    return undefined;
  }

  async meta(token: string): Promise<RoomMeta | undefined> {
    const r = this.active(token);
    return r ? { token: r.token, viewToken: r.viewToken, title: r.title, rev: r.rev, createdAt: r.createdAt, ownerId: r.ownerId } : undefined;
  }

  async appendOp(token: string, baseRev: number, doc: LakarDocument, ops: readonly unknown[], meta: RoomOpMeta): Promise<AppendResult> {
    const r = this.rooms.get(token);
    if (!r || r.archived) return { status: 'missing' };
    if (r.rev !== baseRev) return { status: 'stale', rev: r.rev };
    const rev = baseRev + 1;
    r.doc = doc;
    r.rev = rev;
    this.opsBy.get(token)!.push({ rev, ops: [...ops], peerName: meta.peerName, seed: meta.seed, at: meta.at.toISOString() });
    return { status: 'ok', rev };
  }

  async opsLog(token: string, fromRev = 0): Promise<RoomOpRow[] | undefined> {
    if (!this.active(token)) return undefined;
    return (this.opsBy.get(token) ?? []).filter((o) => o.rev >= fromRev).map((o) => ({ ...o }));
  }

  async archive(token: string): Promise<boolean> {
    const r = this.active(token);
    if (!r) return false;
    r.archived = true;
    return true;
  }

  async list(ownerId?: string): Promise<RoomMeta[]> {
    const out: RoomMeta[] = [];
    for (const r of this.rooms.values()) {
      if (r.archived) continue;
      // Session user hanya melihat miliknya (owner NULL tidak pernah cocok dengan user id).
      if (ownerId !== undefined && r.ownerId !== ownerId) continue;
      out.push({ token: r.token, viewToken: r.viewToken, title: r.title, rev: r.rev, createdAt: r.createdAt, ownerId: r.ownerId });
    }
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }

  async ownerOf(token: string): Promise<string | null | undefined> {
    const r = this.active(token);
    return r === undefined ? undefined : r.ownerId;
  }

  async sessionUser(token: string): Promise<SessionUser | undefined> {
    if (!this.authReady) throw new AuthTablesMissing();
    const s = this.sessions.get(token);
    if (!s || (s.expiresAt !== undefined && s.expiresAt <= Date.now())) return undefined;
    return s.user;
  }

  async ping(): Promise<boolean> {
    return this.up;
  }

  async close(): Promise<void> {}
}
