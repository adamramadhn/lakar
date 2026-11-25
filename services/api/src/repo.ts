// Lapisan repo share-link (spec-collab-cloud story 1): interface `ShareRepo` + dua implementasi.
// `PgShareRepo` dipakai service sungguhan (dites pg.test.ts saat DATABASE_URL ada); `MemoryShareRepo`
// untuk tes unit routes tanpa Postgres. Kedua impl menjaga kontrak yang sama: share yang di-revoke
// atau tidak dikenal diperlakukan sama (undefined / 'missing-share').
// `UserRepo` (spec-cloud-auth story A): akun users/identities/sessions/magic_tokens, kontrak sama
// untuk impl Pg dan memori.
import { randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

/** Izin snapshot: komentar tamu dan unduhan `.lakar.json` (view selalu ada — token = izin). */
export type SharePermissions = { comment: boolean; download: boolean };

/** Board hasil render lakard: geometri + PNG mentah (disimpan bytea, service tetap stateless). */
export type NewShareBoard = { id: string; name: string; x: number; y: number; w: number; h: number; png: Buffer };

export type NewShare = {
  token: string;
  slug: string;
  title: string;
  permissions: SharePermissions;
  /** Dokumen `.lakar.json` tervalidasi `parseDocument` (bentuk tersimpan, bukan resolved). */
  doc: unknown;
  boards: readonly NewShareBoard[];
  /** Batas kedaluwarsa link; `null` = "Never" (tidak pernah kedaluwarsa). Diisi route (default +30 hari). */
  expiresAt: Date | null;
  /** Pemilik akun (spec-cloud-auth); `undefined`/NULL = share era admin-key — tetap dikelola LAKAR_API_KEY. */
  ownerId?: string;
};

/** Meta publik satu share (tanpa doc/png). `undefined` dari repo untuk token tak dikenal, revoked, atau kedaluwarsa. */
export type ShareMeta = {
  token: string;
  slug: string;
  title: string;
  permissions: SharePermissions;
  createdAt: string;
  /** ISO waktu kedaluwarsa, `null` = tidak pernah kedaluwarsa. */
  expiresAt: string | null;
  /** Jumlah buka halaman tamu (hanya GET meta yang menghitung). */
  views: number;
  boards: { id: string; name: string; w: number; h: number }[];
};

export type ShareComment = {
  id: number;
  boardId: string;
  x: number;
  y: number;
  author: string;
  body: string;
  parentId?: number;
  /** UUID acak sisi klien (localStorage `lakar_guest_id`); hanya pemiliknya yang boleh edit/hapus.
   *  Internal repo — respons publik tidak men-serialize field ini (kepemilikan dibawa `mine`). */
  guestId?: string;
  createdAt: string;
};

/** Komentar dalam respons publik: tanpa `guestId` mentah; `mine` dihitung server dari
 *  header `x-lakar-guest-id` peminta (true = komentar milik browser yang meminta). */
export type PublicComment = Omit<ShareComment, 'guestId'> & { mine: boolean };

export type NewComment = { boardId: string; x: number; y: number; author: string; body: string; parentId?: number; guestId?: string };

/** Hasil addComment: share hilang/di-revoke dan komentar induk tak dikenal dibedakan untuk mapping HTTP. */
export type AddCommentResult = { status: 'ok'; comment: ShareComment } | { status: 'missing-share' } | { status: 'missing-parent' };

/** Hasil edit/hapus komentar tamu: 'missing' (share/komentar tak aktif), 'forbidden' (guestId bukan pemilik). */
export type CommentEditResult = { status: 'ok'; comment: ShareComment } | { status: 'missing' } | { status: 'forbidden' };
export type CommentDeleteResult = { status: 'ok' } | { status: 'missing' } | { status: 'forbidden' };

/** Bidang yang bisa diubah pemilik lewat PATCH (izin instan + kedaluwarsa); `permissions` di-merge shallow. */
export type SharePatch = { permissions?: Partial<SharePermissions>; expiresAt?: Date | null };

/** Snapshot pengganti untuk PUT refresh (doc + PNG baru, token tetap; judul/slug/izin opsional). */
export type ShareRefresh = { doc: unknown; boards: readonly NewShareBoard[]; title?: string; slug?: string; permissions?: Partial<SharePermissions> };

export interface ShareRepo {
  create(share: NewShare): Promise<void>;
  /** Meta share aktif; `undefined` bila tak dikenal, sudah di-revoke, atau kedaluwarsa. */
  get(token: string): Promise<ShareMeta | undefined>;
  /** Seperti `get` + menaikkan `views` (hanya untuk GET meta publik; PNG/komentar tidak menghitung). */
  countView(token: string): Promise<ShareMeta | undefined>;
  /** Semua share yang belum di-revoke, terbaru dulu (tanpa doc/png; share kedaluwarsa ikut tampil).
   *  `ownerId` terisi → hanya share milik user itu (tampilan session); kosong → semua (tampilan admin). */
  list(ownerId?: string): Promise<ShareMeta[]>;
  /** `owner_id` share yang belum di-revoke: string = user id pemilik, `null` = era admin-key (tanpa pemilik),
   *  `undefined` = token tak dikenal/sudah revoked. Dipakai scoping PATCH/PUT/DELETE session user. */
  ownerOf(token: string): Promise<string | null | undefined>;
  /** Terapkan `patch` pada share yang belum di-revoke (share kedaluwarsa boleh — PATCH bisa menghidupkannya lagi). */
  update(token: string, patch: SharePatch): Promise<ShareMeta | undefined>;
  /** Ganti doc+boards share yang belum di-revoke dalam satu transaksi. `false` bila revoked/tak dikenal. */
  refresh(token: string, snap: ShareRefresh): Promise<boolean>;
  /** Tandai revoked. `false` bila token tak dikenal atau sudah revoked. */
  revoke(token: string): Promise<boolean>;
  boardPng(token: string, boardId: string): Promise<Buffer | undefined>;
  /** Dokumen tersimpan untuk unduhan; `undefined` bila share tak aktif. */
  docJson(token: string): Promise<unknown | undefined>;
  comments(token: string): Promise<ShareComment[] | undefined>;
  addComment(token: string, c: NewComment): Promise<AddCommentResult>;
  /** Edit isi komentar; hanya pemilik `guestId` komentar itu. */
  updateComment(token: string, id: number, guestId: string, body: string): Promise<CommentEditResult>;
  /** Hapus komentar; hanya pemilik `guestId` komentar itu. */
  deleteComment(token: string, id: number, guestId: string): Promise<CommentDeleteResult>;
  /** Koneksi DB hidup (untuk /healthz; impl memori selalu true). */
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementasi Postgres (adaptor; SQL plain, tanpa ORM)
// ---------------------------------------------------------------------------

type ShareRow = { token: string; slug: string; title: string; permissions: SharePermissions; created_at: Date; expires_at: Date | null; views: number };
type BoardRow = { board_id: string; name: string; w: number; h: number };
type CommentRow = { id: string; board_id: string; x: number; y: number; author: string; body: string; parent_id: string | null; guest_id: string | null; created_at: Date };
/** Baris LEFT JOIN comments: kolom c.* NULL semua saat share aktif belum punya komentar. */
type CommentJoinRow = { [K in keyof CommentRow]: CommentRow[K] | null };

/** Kondisi "share masih hidup untuk publik": belum di-revoke dan belum kedaluwarsa (prefiks tabel opsional). */
const activeSql = (alias = '') => `${alias}revoked_at IS NULL AND (${alias}expires_at IS NULL OR ${alias}expires_at > now())`;
const ACTIVE_SQL = activeSql();
const META_COLS = 'token, slug, title, permissions, created_at, expires_at, views';

const toMeta = (s: ShareRow, boards: BoardRow[]): ShareMeta => ({
  token: s.token,
  slug: s.slug,
  title: s.title,
  permissions: s.permissions,
  createdAt: s.created_at.toISOString(),
  expiresAt: s.expires_at === null ? null : s.expires_at.toISOString(),
  views: s.views,
  boards: boards.map((b) => ({ id: b.board_id, name: b.name, w: b.w, h: b.h })),
});

const toComment = (r: CommentRow): ShareComment => ({
  id: Number(r.id),
  boardId: r.board_id,
  x: r.x,
  y: r.y,
  author: r.author,
  body: r.body,
  ...(r.parent_id !== null ? { parentId: Number(r.parent_id) } : {}),
  ...(r.guest_id !== null ? { guestId: r.guest_id } : {}),
  createdAt: r.created_at.toISOString(),
});

export class PgShareRepo implements ShareRepo {
  constructor(private readonly pool: Pool) {}

  async create(share: NewShare): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO shares (token, slug, title, permissions, doc, expires_at, owner_id) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
        share.token,
        share.slug,
        share.title,
        JSON.stringify(share.permissions),
        JSON.stringify(share.doc),
        share.expiresAt,
        share.ownerId ?? null,
      ]);
      for (const [i, b] of share.boards.entries()) {
        await client.query('INSERT INTO share_boards (token, board_id, ord, name, x, y, w, h, png) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)', [
          share.token,
          b.id,
          i,
          b.name,
          b.x,
          b.y,
          b.w,
          b.h,
          b.png,
        ]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  /** Meta share dari baris `shares` + boards; `active` false = tampilkan juga yang kedaluwarsa (tampilan pemilik). */
  private async metaRow(token: string, active: boolean): Promise<ShareMeta | undefined> {
    const { rows } = await this.pool.query<ShareRow>(`SELECT ${META_COLS} FROM shares WHERE token = $1 AND ${active ? ACTIVE_SQL : 'revoked_at IS NULL'}`, [token]);
    const share = rows[0];
    if (!share) return undefined;
    const boards = await this.pool.query<BoardRow>('SELECT board_id, name, w, h FROM share_boards WHERE token = $1 ORDER BY ord', [token]);
    return toMeta(share, boards.rows);
  }

  async get(token: string): Promise<ShareMeta | undefined> {
    return this.metaRow(token, true);
  }

  async countView(token: string): Promise<ShareMeta | undefined> {
    // Satu statement bersyarat: share revoked/kedaluwarsa menulis 0 baris → undefined (identik get()).
    const { rows } = await this.pool.query<ShareRow>(`UPDATE shares SET views = views + 1 WHERE token = $1 AND ${ACTIVE_SQL} RETURNING ${META_COLS}`, [token]);
    const share = rows[0];
    if (!share) return undefined;
    const boards = await this.pool.query<BoardRow>('SELECT board_id, name, w, h FROM share_boards WHERE token = $1 ORDER BY ord', [token]);
    return toMeta(share, boards.rows);
  }

  async list(ownerId?: string): Promise<ShareMeta[]> {
    const { rows } = await this.pool.query<ShareRow>(
      `SELECT ${META_COLS} FROM shares WHERE revoked_at IS NULL${ownerId !== undefined ? ' AND owner_id = $1' : ''} ORDER BY created_at DESC`,
      ownerId !== undefined ? [ownerId] : [],
    );
    const out: ShareMeta[] = [];
    for (const share of rows) {
      const boards = await this.pool.query<BoardRow>('SELECT board_id, name, w, h FROM share_boards WHERE token = $1 ORDER BY ord', [share.token]);
      out.push(toMeta(share, boards.rows));
    }
    return out;
  }

  async ownerOf(token: string): Promise<string | null | undefined> {
    const { rows } = await this.pool.query<{ owner_id: string | null }>('SELECT owner_id FROM shares WHERE token = $1 AND revoked_at IS NULL', [token]);
    return rows[0] === undefined ? undefined : rows[0].owner_id;
  }

  async update(token: string, patch: SharePatch): Promise<ShareMeta | undefined> {
    // `expiresAt` bisa diset null ("Never"), jadi klausa SET dibangun dinamis — COALESCE tidak bisa
    // membedakan "tidak dikirim" dari "set null".
    const sets: string[] = [];
    const params: unknown[] = [token];
    if (patch.permissions !== undefined) {
      // Merge shallow jsonb (`||`): kunci izin yang tidak dikirim dipertahankan.
      params.push(JSON.stringify(patch.permissions));
      sets.push(`permissions = permissions || $${params.length}::jsonb`);
    }
    if (patch.expiresAt !== undefined) {
      params.push(patch.expiresAt);
      sets.push(`expires_at = $${params.length}`);
    }
    if (sets.length) {
      const { rowCount } = await this.pool.query(`UPDATE shares SET ${sets.join(', ')} WHERE token = $1 AND revoked_at IS NULL`, params);
      if ((rowCount ?? 0) === 0) return undefined;
    }
    // Tampilan pemilik: share kedaluwarsa tetap kembali (meta membawa expiresAt untuk badge "expired").
    return this.metaRow(token, false);
  }

  async refresh(token: string, snap: ShareRefresh): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // created_at ikut maju: kolom ini dipakai UI sebagai "waktu snapshot terakhir" + umur link,
      // dan membuat link yang baru di-refresh naik ke atas daftar (ORDER BY created_at DESC).
      const { rowCount } = await client.query("UPDATE shares SET doc = $2, title = COALESCE($3, title), slug = COALESCE($4, slug), permissions = permissions || COALESCE($5, '{}'::jsonb), created_at = now() WHERE token = $1 AND revoked_at IS NULL", [
        token,
        JSON.stringify(snap.doc),
        snap.title ?? null,
        snap.slug ?? null,
        snap.permissions !== undefined ? JSON.stringify(snap.permissions) : null,
      ]);
      if ((rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query('DELETE FROM share_boards WHERE token = $1', [token]);
      for (const [i, b] of snap.boards.entries()) {
        await client.query('INSERT INTO share_boards (token, board_id, ord, name, x, y, w, h, png) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)', [
          token,
          b.id,
          i,
          b.name,
          b.x,
          b.y,
          b.w,
          b.h,
          b.png,
        ]);
      }
      // Komentar pada board yang hilang dari snapshot baru ikut dihapus (semantik "snapshot") —
      // pin-nya tidak punya gambar untuk ditambatkan. Balasannya terhapus lewat ON DELETE CASCADE.
      await client.query('DELETE FROM share_comments WHERE token = $1 AND NOT (board_id = ANY($2::text[]))', [token, snap.boards.map((b) => b.id)]);
      await client.query('COMMIT');
      return true;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async revoke(token: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('UPDATE shares SET revoked_at = now() WHERE token = $1 AND revoked_at IS NULL', [token]);
    return (rowCount ?? 0) > 0;
  }

  async boardPng(token: string, boardId: string): Promise<Buffer | undefined> {
    const { rows } = await this.pool.query<{ png: Buffer }>(
      `SELECT b.png FROM share_boards b JOIN shares s ON s.token = b.token WHERE b.token = $1 AND b.board_id = $2 AND ${activeSql('s.')}`,
      [token, boardId],
    );
    return rows[0]?.png;
  }

  async docJson(token: string): Promise<unknown | undefined> {
    const { rows } = await this.pool.query<{ doc: unknown }>(`SELECT doc FROM shares WHERE token = $1 AND ${ACTIVE_SQL}`, [token]);
    return rows[0]?.doc;
  }

  async comments(token: string): Promise<ShareComment[] | undefined> {
    // Satu query (bukan get() lalu SELECT terpisah) supaya revoke di antara dua baca tidak
    // membocorkan komentar — LEFT JOIN membedakan share hilang/revoked (0 baris) dari share
    // aktif tanpa komentar (1 baris dengan c.id NULL).
    const { rows } = await this.pool.query<CommentJoinRow>(
      `SELECT c.id, c.board_id, c.x, c.y, c.author, c.body, c.parent_id, c.guest_id, c.created_at
       FROM shares s LEFT JOIN share_comments c ON c.token = s.token
       WHERE s.token = $1 AND ${activeSql('s.')}
       ORDER BY c.created_at, c.id`,
      [token],
    );
    if (rows.length === 0) return undefined;
    // c.id NOT NULL (identity) — NULL hanya dari sisi kosong LEFT JOIN; kolom lain ikut non-null.
    return rows.filter((r): r is CommentRow => r.id !== null).map(toComment);
  }

  async addComment(token: string, c: NewComment): Promise<AddCommentResult> {
    if (c.parentId !== undefined) {
      const parent = await this.pool.query('SELECT 1 FROM share_comments WHERE id = $1 AND token = $2', [c.parentId, token]);
      if (parent.rowCount === 0) return { status: 'missing-parent' };
    }
    // INSERT bersyarat EXISTS: revoke yang mendarat sebelum statement ini membuat 0 baris
    // tertulis → 'missing-share' (tanpa jendela TOCTOU seperti pre-check get()).
    const { rows } = await this.pool.query<CommentRow>(
      `INSERT INTO share_comments (token, board_id, x, y, author, body, parent_id, guest_id)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8
       WHERE EXISTS (SELECT 1 FROM shares WHERE token = $1 AND ${ACTIVE_SQL})
       RETURNING id, board_id, x, y, author, body, parent_id, guest_id, created_at`,
      [token, c.boardId, c.x, c.y, c.author, c.body, c.parentId ?? null, c.guestId ?? null],
    );
    if (!rows[0]) return { status: 'missing-share' };
    return { status: 'ok', comment: toComment(rows[0]) };
  }

  /** Pre-check bersama untuk edit/hapus komentar tamu: membedakan share mati / komentar hilang / bukan pemilik. */
  private async commentGuard(token: string, id: number, guestId: string): Promise<{ status: 'ok' } | { status: 'missing' } | { status: 'forbidden' }> {
    const { rows } = await this.pool.query<{ guest_id: string | null; dead: boolean }>(
      `SELECT c.guest_id, (s.revoked_at IS NOT NULL OR (s.expires_at IS NOT NULL AND s.expires_at <= now())) AS dead
       FROM share_comments c JOIN shares s ON s.token = c.token
       WHERE c.id = $1 AND c.token = $2`,
      [id, token],
    );
    const row = rows[0];
    if (!row || row.dead) return { status: 'missing' };
    if (row.guest_id === null || row.guest_id !== guestId) return { status: 'forbidden' };
    return { status: 'ok' };
  }

  async updateComment(token: string, id: number, guestId: string, body: string): Promise<CommentEditResult> {
    const guard = await this.commentGuard(token, id, guestId);
    if (guard.status !== 'ok') return guard;
    const { rows } = await this.pool.query<CommentRow>(
      'UPDATE share_comments SET body = $3 WHERE id = $1 AND token = $2 RETURNING id, board_id, x, y, author, body, parent_id, guest_id, created_at',
      [id, token, body],
    );
    if (!rows[0]) return { status: 'missing' };
    return { status: 'ok', comment: toComment(rows[0]) };
  }

  async deleteComment(token: string, id: number, guestId: string): Promise<CommentDeleteResult> {
    const guard = await this.commentGuard(token, id, guestId);
    if (guard.status !== 'ok') return guard;
    const { rowCount } = await this.pool.query('DELETE FROM share_comments WHERE id = $1 AND token = $2', [id, token]);
    return (rowCount ?? 0) > 0 ? { status: 'ok' } : { status: 'missing' };
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
// Implementasi memori (tes unit; kontrak sama dengan PgShareRepo)
// ---------------------------------------------------------------------------

type StoredShare = NewShare & { createdAt: string; revoked: boolean; views: number };

export class MemoryShareRepo implements ShareRepo {
  private readonly shares = new Map<string, StoredShare>();
  private readonly commentsBy = new Map<string, ShareComment[]>();
  private nextCommentId = 1;
  /** Tes bisa mematikan DB tiruan (healthz down). */
  up = true;

  async create(share: NewShare): Promise<void> {
    this.shares.set(share.token, { ...share, boards: [...share.boards], createdAt: new Date().toISOString(), revoked: false, views: 0 });
  }

  /** Belum di-revoke (tampilan pemilik — share kedaluwarsa ikut). */
  private live(token: string): StoredShare | undefined {
    const s = this.shares.get(token);
    return s && !s.revoked ? s : undefined;
  }

  /** Hidup untuk publik: belum revoked dan belum kedaluwarsa. */
  private active(token: string): StoredShare | undefined {
    const s = this.live(token);
    return s && (s.expiresAt === null || s.expiresAt.getTime() > Date.now()) ? s : undefined;
  }

  private metaOf(s: StoredShare): ShareMeta {
    return {
      token: s.token,
      slug: s.slug,
      title: s.title,
      permissions: s.permissions,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt === null ? null : s.expiresAt.toISOString(),
      views: s.views,
      boards: s.boards.map((b) => ({ id: b.id, name: b.name, w: b.w, h: b.h })),
    };
  }

  async get(token: string): Promise<ShareMeta | undefined> {
    const s = this.active(token);
    return s ? this.metaOf(s) : undefined;
  }

  async countView(token: string): Promise<ShareMeta | undefined> {
    const s = this.active(token);
    if (!s) return undefined;
    s.views += 1;
    return this.metaOf(s);
  }

  async list(ownerId?: string): Promise<ShareMeta[]> {
    const out: ShareMeta[] = [];
    for (const s of this.shares.values()) {
      if (s.revoked) continue;
      // Session user hanya melihat miliknya (owner_id NULL tidak pernah cocok dengan user id).
      if (ownerId !== undefined && s.ownerId !== ownerId) continue;
      out.push(this.metaOf(s));
    }
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }

  async ownerOf(token: string): Promise<string | null | undefined> {
    const s = this.live(token);
    return s === undefined ? undefined : (s.ownerId ?? null);
  }

  async update(token: string, patch: SharePatch): Promise<ShareMeta | undefined> {
    const s = this.live(token);
    if (!s) return undefined;
    if (patch.permissions !== undefined) s.permissions = { ...s.permissions, ...patch.permissions };
    if (patch.expiresAt !== undefined) s.expiresAt = patch.expiresAt;
    return this.metaOf(s);
  }

  async refresh(token: string, snap: ShareRefresh): Promise<boolean> {
    const s = this.live(token);
    if (!s) return false;
    s.doc = snap.doc;
    s.boards = [...snap.boards];
    if (snap.title !== undefined) s.title = snap.title;
    if (snap.slug !== undefined) s.slug = snap.slug;
    if (snap.permissions !== undefined) s.permissions = { ...s.permissions, ...snap.permissions };
    // Paritas dengan Pg: created_at maju = "waktu snapshot terakhir" + umur link di UI.
    s.createdAt = new Date().toISOString();
    // Paritas dengan Pg: komentar pada board yang hilang dari snapshot baru dihapus (semantik snapshot).
    const keep = new Set(snap.boards.map((b) => b.id));
    this.dropCascade(token, new Set((this.commentsBy.get(token) ?? []).filter((c) => !keep.has(c.boardId)).map((c) => c.id)));
    return true;
  }

  async revoke(token: string): Promise<boolean> {
    const s = this.live(token);
    if (!s) return false;
    s.revoked = true;
    return true;
  }

  async boardPng(token: string, boardId: string): Promise<Buffer | undefined> {
    return this.active(token)?.boards.find((b) => b.id === boardId)?.png;
  }

  async docJson(token: string): Promise<unknown | undefined> {
    return this.active(token)?.doc;
  }

  async comments(token: string): Promise<ShareComment[] | undefined> {
    if (!this.active(token)) return undefined;
    return this.commentsBy.get(token) ?? [];
  }

  async addComment(token: string, c: NewComment): Promise<AddCommentResult> {
    if (!this.active(token)) return { status: 'missing-share' };
    const list = this.commentsBy.get(token) ?? [];
    if (c.parentId !== undefined && !list.some((x) => x.id === c.parentId)) return { status: 'missing-parent' };
    const comment: ShareComment = { id: this.nextCommentId++, ...c, createdAt: new Date().toISOString() };
    list.push(comment);
    this.commentsBy.set(token, list);
    return { status: 'ok', comment };
  }

  /** Pre-check edit/hapus komentar: share mati / komentar hilang → 'missing', guestId beda → 'forbidden'. */
  private commentGuard(token: string, id: number, guestId: string): { status: 'ok'; comment: ShareComment } | { status: 'missing' } | { status: 'forbidden' } {
    if (!this.active(token)) return { status: 'missing' };
    const comment = (this.commentsBy.get(token) ?? []).find((c) => c.id === id);
    if (!comment) return { status: 'missing' };
    if (comment.guestId === undefined || comment.guestId !== guestId) return { status: 'forbidden' };
    return { status: 'ok', comment };
  }

  async updateComment(token: string, id: number, guestId: string, body: string): Promise<CommentEditResult> {
    const guard = this.commentGuard(token, id, guestId);
    if (guard.status !== 'ok') return guard;
    guard.comment.body = body;
    return { status: 'ok', comment: guard.comment };
  }

  /** Hapus komentar dengan id di `gone` + balasannya transitif (paritas ON DELETE CASCADE Postgres). */
  private dropCascade(token: string, gone: Set<number>): void {
    if (gone.size === 0) return;
    const list = this.commentsBy.get(token) ?? [];
    for (let grew = true; grew; ) {
      grew = false;
      for (const c of list) {
        if (c.parentId !== undefined && gone.has(c.parentId) && !gone.has(c.id)) {
          gone.add(c.id);
          grew = true;
        }
      }
    }
    this.commentsBy.set(
      token,
      list.filter((c) => !gone.has(c.id)),
    );
  }

  async deleteComment(token: string, id: number, guestId: string): Promise<CommentDeleteResult> {
    const guard = this.commentGuard(token, id, guestId);
    if (guard.status !== 'ok') return guard;
    this.dropCascade(token, new Set([id]));
    return { status: 'ok' };
  }

  async ping(): Promise<boolean> {
    return this.up;
  }

  async close(): Promise<void> {}
}

// ---------------------------------------------------------------------------
// Repo akun (spec-cloud-auth story A): users + identities + sessions + magic_tokens.
// Token session disimpan MENTAH (opaque 32 byte base64url — bisa di-revoke per token);
// magic token disimpan sebagai HASH sha256 (link email sekali pakai).
// ---------------------------------------------------------------------------

/** Umur session default: 30 hari, rolling — tiap `sessionUser` yang sukses memperpanjang expires_at. */
export const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Umur magic link: 15 menit, sekali pakai. */
export const MAGIC_TOKEN_TTL_MS = 15 * 60 * 1000;

/** Akun publik: bentuk yang aman diserialkan ke klien (tanpa field internal). */
export type User = { id: string; email: string; name: string | null; avatarUrl: string | null; createdAt: string };

/** Profil hasil provider untuk upsert: `subject` = OAuth sub (google) / id (github) / email (magic). */
export type IdentityProfile = { provider: string; subject: string; email: string; name?: string | null; avatarUrl?: string | null };

export interface UserRepo {
  findUserByIdentity(provider: string, subject: string): Promise<User | undefined>;
  findUserByEmail(email: string): Promise<User | undefined>;
  /** Upsert link-by-email: identity (provider,subject) sudah ada → user-nya; else cari user by email
   *  dan tautkan identity baru; else buat user + identity. Selalu mengembalikan user. */
  upsertUserIdentity(profile: IdentityProfile): Promise<User>;
  /** Session opaque baru (token digenerate di sini); `ua` dicatat untuk audit tampilan perangkat. */
  createSession(userId: string, opts?: { ua?: string }): Promise<{ token: string; expiresAt: Date }>;
  /** User pemilik session yang masih hidup; `undefined` bila token tak dikenal/kedaluwarsa.
   *  Rolling: sukses memperpanjang expires_at satu TTL penuh. */
  sessionUser(token: string): Promise<User | undefined>;
  /** Cabut session (logout). `false` bila token tak dikenal. */
  revokeSession(token: string): Promise<boolean>;
  /** Simpan magic token SUDAH di-hash (sha256 hex) — token mentah tidak pernah menyentuh storage. */
  createMagicToken(email: string, hash: string, expiresAt: Date): Promise<void>;
  /** Tandai terpakai atomik; kembalikan email bila token masih berlaku dan belum dipakai, else `undefined`. */
  consumeMagicToken(hash: string): Promise<string | undefined>;
}

type UserRow = { id: string; email: string; name: string | null; avatar_url: string | null; created_at: Date };

const toUser = (r: UserRow): User => ({ id: r.id, email: String(r.email), name: r.name, avatarUrl: r.avatar_url, createdAt: r.created_at.toISOString() });

const USER_COLS = 'id, email, name, avatar_url, created_at';

export class PgUserRepo implements UserRepo {
  private readonly reaper: NodeJS.Timeout;

  constructor(
    private readonly pool: Pool,
    private readonly opts: { sessionTtlMs?: number } = {},
  ) {
    // Reap session + magic token kedaluwarsa tiap jam — keduanya tidak pernah dihapus
    // sendiri oleh query biasa, jadi tabel membesar tanpa batas. `unref` supaya timer
    // tidak menahan proses hidup; kegagalan (mis. pool sudah end) diabaikan.
    this.reaper = setInterval(() => {
      void this.reap().catch(() => {});
    }, 60 * 60 * 1000);
    this.reaper.unref();
  }

  /** Hapus baris mati: session lewat expires_at; magic token lewat expires_at atau sudah dipakai. */
  private async reap(): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE expires_at < now()');
    await this.pool.query('DELETE FROM magic_tokens WHERE expires_at < now() OR used_at IS NOT NULL');
  }

  private ttl(): number {
    return this.opts.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  }

  async findUserByIdentity(provider: string, subject: string): Promise<User | undefined> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT ${USER_COLS} FROM users u JOIN identities i ON i.user_id = u.id WHERE i.provider = $1 AND i.subject = $2`,
      [provider, subject],
    );
    return rows[0] === undefined ? undefined : toUser(rows[0]);
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    const { rows } = await this.pool.query<UserRow>(`SELECT ${USER_COLS} FROM users WHERE email = $1`, [email]);
    return rows[0] === undefined ? undefined : toUser(rows[0]);
  }

  async upsertUserIdentity(profile: IdentityProfile): Promise<User> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<UserRow>(`SELECT ${USER_COLS} FROM users u JOIN identities i ON i.user_id = u.id WHERE i.provider = $1 AND i.subject = $2`, [
        profile.provider,
        profile.subject,
      ]);
      let row = found.rows[0];
      if (!row) {
        // Link-by-email (email citext → case-insensitive): ON CONFLICT menangkap balapan user baru
        // dengan email sama; profil lama dipertahankan (COALESCE) bila provider tidak mengirim nama.
        const ins = await client.query<UserRow>(
          `INSERT INTO users (email, name, avatar_url) VALUES ($1, $2, $3)
           ON CONFLICT (email) DO UPDATE SET name = COALESCE(users.name, EXCLUDED.name), avatar_url = COALESCE(users.avatar_url, EXCLUDED.avatar_url)
           RETURNING ${USER_COLS}`,
          [profile.email, profile.name ?? null, profile.avatarUrl ?? null],
        );
        row = ins.rows[0]!;
        await client.query('INSERT INTO identities (user_id, provider, subject) VALUES ($1, $2, $3) ON CONFLICT (provider, subject) DO NOTHING', [
          row.id,
          profile.provider,
          profile.subject,
        ]);
      }
      await client.query('COMMIT');
      return toUser(row);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async createSession(userId: string, opts?: { ua?: string }): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttl());
    await this.pool.query('INSERT INTO sessions (token, user_id, expires_at, ua) VALUES ($1, $2, $3, $4)', [token, userId, expiresAt, opts?.ua ?? null]);
    return { token, expiresAt };
  }

  async sessionUser(token: string): Promise<User | undefined> {
    // Rolling expiry dalam satu UPDATE bersyarat: session mati menulis 0 baris → undefined.
    const { rows } = await this.pool.query<{ user_id: string }>('UPDATE sessions SET expires_at = $2 WHERE token = $1 AND expires_at > now() RETURNING user_id', [
      token,
      new Date(Date.now() + this.ttl()),
    ]);
    const hit = rows[0];
    if (!hit) return undefined;
    const { rows: users } = await this.pool.query<UserRow>(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [hit.user_id]);
    return users[0] === undefined ? undefined : toUser(users[0]);
  }

  async revokeSession(token: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('DELETE FROM sessions WHERE token = $1', [token]);
    return (rowCount ?? 0) > 0;
  }

  async createMagicToken(email: string, hash: string, expiresAt: Date): Promise<void> {
    await this.pool.query('INSERT INTO magic_tokens (hash, email, expires_at) VALUES ($1, $2, $3)', [hash, email, expiresAt]);
  }

  async consumeMagicToken(hash: string): Promise<string | undefined> {
    // UPDATE bersyarat: token terpakai/kedaluwarsa menulis 0 baris → undefined (sekali pakai, atomik).
    const { rows } = await this.pool.query<{ email: string }>('UPDATE magic_tokens SET used_at = now() WHERE hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING email', [hash]);
    return rows[0]?.email;
  }
}

type StoredUser = { id: string; email: string; name: string | null; avatarUrl: string | null; createdAt: string };
type StoredSession = { userId: string; expiresAt: Date };
type StoredMagic = { email: string; expiresAt: Date; usedAt?: Date };

export class MemoryUserRepo implements UserRepo {
  private readonly users = new Map<string, StoredUser>();
  private readonly userIdByEmail = new Map<string, string>();
  private readonly userIdByIdentity = new Map<string, string>();
  private readonly sessions = new Map<string, StoredSession>();
  private readonly magic = new Map<string, StoredMagic>();

  constructor(private readonly opts: { sessionTtlMs?: number } = {}) {}

  private ttl(): number {
    return this.opts.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  }

  private toUser(u: StoredUser): User {
    return { ...u };
  }

  async findUserByIdentity(provider: string, subject: string): Promise<User | undefined> {
    const id = this.userIdByIdentity.get(`${provider} ${subject}`);
    const u = id === undefined ? undefined : this.users.get(id);
    return u === undefined ? undefined : this.toUser(u);
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    // citext di Pg = case-insensitive; impl memori menormalkan ke lowercase.
    const id = this.userIdByEmail.get(email.toLowerCase());
    const u = id === undefined ? undefined : this.users.get(id);
    return u === undefined ? undefined : this.toUser(u);
  }

  async upsertUserIdentity(profile: IdentityProfile): Promise<User> {
    const key = `${profile.provider} ${profile.subject}`;
    const existing = this.userIdByIdentity.get(key);
    if (existing !== undefined) return this.toUser(this.users.get(existing)!);
    const emailKey = profile.email.toLowerCase();
    let id = this.userIdByEmail.get(emailKey);
    if (id === undefined) {
      id = randomUUID();
      const user: StoredUser = { id, email: profile.email, name: profile.name ?? null, avatarUrl: profile.avatarUrl ?? null, createdAt: new Date().toISOString() };
      this.users.set(id, user);
      this.userIdByEmail.set(emailKey, id);
    } else {
      // Paritas COALESCE Pg: profil lama dipertahankan bila provider tidak mengirim nama/avatar.
      const u = this.users.get(id)!;
      if (u.name === null && profile.name != null) u.name = profile.name;
      if (u.avatarUrl === null && profile.avatarUrl != null) u.avatarUrl = profile.avatarUrl;
    }
    this.userIdByIdentity.set(key, id);
    return this.toUser(this.users.get(id)!);
  }

  /** Sapu malas entry mati saat insert — map tidak membesar tanpa batas (paritas reaper Pg). */
  private sweepExpired(): void {
    const now = Date.now();
    for (const [t, s] of this.sessions) if (s.expiresAt.getTime() <= now) this.sessions.delete(t);
    for (const [h, m] of this.magic) if (m.usedAt !== undefined || m.expiresAt.getTime() <= now) this.magic.delete(h);
  }

  async createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttl());
    this.sweepExpired();
    this.sessions.set(token, { userId, expiresAt });
    return { token, expiresAt };
  }

  async sessionUser(token: string): Promise<User | undefined> {
    const s = this.sessions.get(token);
    if (!s) return undefined;
    if (s.expiresAt.getTime() <= Date.now()) {
      // Bersih malas — paritas reaper Pg (entry mati tidak menumpuk di map).
      this.sessions.delete(token);
      return undefined;
    }
    // Rolling expiry — paritas UPDATE Pg.
    s.expiresAt = new Date(Date.now() + this.ttl());
    const u = this.users.get(s.userId);
    return u === undefined ? undefined : this.toUser(u);
  }

  async revokeSession(token: string): Promise<boolean> {
    return this.sessions.delete(token);
  }

  async createMagicToken(email: string, hash: string, expiresAt: Date): Promise<void> {
    this.sweepExpired();
    this.magic.set(hash, { email, expiresAt });
  }

  async consumeMagicToken(hash: string): Promise<string | undefined> {
    const m = this.magic.get(hash);
    if (!m) return undefined;
    if (m.usedAt !== undefined || m.expiresAt.getTime() <= Date.now()) {
      // Bersih malas — paritas reaper Pg.
      this.magic.delete(hash);
      return undefined;
    }
    m.usedAt = new Date();
    return m.email;
  }
}
