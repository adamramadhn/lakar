// Lapisan repo share-link (spec-collab-cloud story 1): interface `ShareRepo` + dua implementasi.
// `PgShareRepo` dipakai service sungguhan (dites pg.test.ts saat DATABASE_URL ada); `MemoryShareRepo`
// untuk tes unit routes tanpa Postgres. Kedua impl menjaga kontrak yang sama: share yang di-revoke
// atau tidak dikenal diperlakukan sama (undefined / 'missing-share').
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
};

/** Meta publik satu share (tanpa doc/png). `undefined` dari repo untuk token tak dikenal atau revoked. */
export type ShareMeta = {
  token: string;
  slug: string;
  title: string;
  permissions: SharePermissions;
  createdAt: string;
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
  createdAt: string;
};

export type NewComment = { boardId: string; x: number; y: number; author: string; body: string; parentId?: number };

/** Hasil addComment: share hilang/di-revoke dan komentar induk tak dikenal dibedakan untuk mapping HTTP. */
export type AddCommentResult = { status: 'ok'; comment: ShareComment } | { status: 'missing-share' } | { status: 'missing-parent' };

export interface ShareRepo {
  create(share: NewShare): Promise<void>;
  /** Meta share aktif; `undefined` bila tak dikenal atau sudah di-revoke. */
  get(token: string): Promise<ShareMeta | undefined>;
  /** Semua share aktif, terbaru dulu (tanpa doc/png). */
  list(): Promise<ShareMeta[]>;
  /** Tandai revoked. `false` bila token tak dikenal atau sudah revoked. */
  revoke(token: string): Promise<boolean>;
  boardPng(token: string, boardId: string): Promise<Buffer | undefined>;
  /** Dokumen tersimpan untuk unduhan; `undefined` bila share tak aktif. */
  docJson(token: string): Promise<unknown | undefined>;
  comments(token: string): Promise<ShareComment[] | undefined>;
  addComment(token: string, c: NewComment): Promise<AddCommentResult>;
  /** Koneksi DB hidup (untuk /healthz; impl memori selalu true). */
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementasi Postgres (adaptor; SQL plain, tanpa ORM)
// ---------------------------------------------------------------------------

type ShareRow = { token: string; slug: string; title: string; permissions: SharePermissions; created_at: Date };
type BoardRow = { board_id: string; name: string; w: number; h: number };
type CommentRow = { id: string; board_id: string; x: number; y: number; author: string; body: string; parent_id: string | null; created_at: Date };
/** Baris LEFT JOIN comments: kolom c.* NULL semua saat share aktif belum punya komentar. */
type CommentJoinRow = { [K in keyof CommentRow]: CommentRow[K] | null };

const toMeta = (s: ShareRow, boards: BoardRow[]): ShareMeta => ({
  token: s.token,
  slug: s.slug,
  title: s.title,
  permissions: s.permissions,
  createdAt: s.created_at.toISOString(),
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
  createdAt: r.created_at.toISOString(),
});

export class PgShareRepo implements ShareRepo {
  constructor(private readonly pool: Pool) {}

  async create(share: NewShare): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO shares (token, slug, title, permissions, doc) VALUES ($1, $2, $3, $4, $5)', [
        share.token,
        share.slug,
        share.title,
        JSON.stringify(share.permissions),
        JSON.stringify(share.doc),
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

  async get(token: string): Promise<ShareMeta | undefined> {
    const { rows } = await this.pool.query<ShareRow>('SELECT token, slug, title, permissions, created_at FROM shares WHERE token = $1 AND revoked_at IS NULL', [token]);
    const share = rows[0];
    if (!share) return undefined;
    const boards = await this.pool.query<BoardRow>('SELECT board_id, name, w, h FROM share_boards WHERE token = $1 ORDER BY ord', [token]);
    return toMeta(share, boards.rows);
  }

  async list(): Promise<ShareMeta[]> {
    const { rows } = await this.pool.query<ShareRow>('SELECT token, slug, title, permissions, created_at FROM shares WHERE revoked_at IS NULL ORDER BY created_at DESC');
    const out: ShareMeta[] = [];
    for (const share of rows) {
      const boards = await this.pool.query<BoardRow>('SELECT board_id, name, w, h FROM share_boards WHERE token = $1 ORDER BY ord', [share.token]);
      out.push(toMeta(share, boards.rows));
    }
    return out;
  }

  async revoke(token: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('UPDATE shares SET revoked_at = now() WHERE token = $1 AND revoked_at IS NULL', [token]);
    return (rowCount ?? 0) > 0;
  }

  async boardPng(token: string, boardId: string): Promise<Buffer | undefined> {
    const { rows } = await this.pool.query<{ png: Buffer }>(
      'SELECT b.png FROM share_boards b JOIN shares s ON s.token = b.token WHERE b.token = $1 AND b.board_id = $2 AND s.revoked_at IS NULL',
      [token, boardId],
    );
    return rows[0]?.png;
  }

  async docJson(token: string): Promise<unknown | undefined> {
    const { rows } = await this.pool.query<{ doc: unknown }>('SELECT doc FROM shares WHERE token = $1 AND revoked_at IS NULL', [token]);
    return rows[0]?.doc;
  }

  async comments(token: string): Promise<ShareComment[] | undefined> {
    // Satu query (bukan get() lalu SELECT terpisah) supaya revoke di antara dua baca tidak
    // membocorkan komentar — LEFT JOIN membedakan share hilang/revoked (0 baris) dari share
    // aktif tanpa komentar (1 baris dengan c.id NULL).
    const { rows } = await this.pool.query<CommentJoinRow>(
      `SELECT c.id, c.board_id, c.x, c.y, c.author, c.body, c.parent_id, c.created_at
       FROM shares s LEFT JOIN share_comments c ON c.token = s.token
       WHERE s.token = $1 AND s.revoked_at IS NULL
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
      `INSERT INTO share_comments (token, board_id, x, y, author, body, parent_id)
       SELECT $1, $2, $3, $4, $5, $6, $7
       WHERE EXISTS (SELECT 1 FROM shares WHERE token = $1 AND revoked_at IS NULL)
       RETURNING id, board_id, x, y, author, body, parent_id, created_at`,
      [token, c.boardId, c.x, c.y, c.author, c.body, c.parentId ?? null],
    );
    if (!rows[0]) return { status: 'missing-share' };
    return { status: 'ok', comment: toComment(rows[0]) };
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

type StoredShare = NewShare & { createdAt: string; revoked: boolean };

export class MemoryShareRepo implements ShareRepo {
  private readonly shares = new Map<string, StoredShare>();
  private readonly commentsBy = new Map<string, ShareComment[]>();
  private nextCommentId = 1;
  /** Tes bisa mematikan DB tiruan (healthz down). */
  up = true;

  async create(share: NewShare): Promise<void> {
    this.shares.set(share.token, { ...share, boards: [...share.boards], createdAt: new Date().toISOString(), revoked: false });
  }

  private active(token: string): StoredShare | undefined {
    const s = this.shares.get(token);
    return s && !s.revoked ? s : undefined;
  }

  async get(token: string): Promise<ShareMeta | undefined> {
    const s = this.active(token);
    if (!s) return undefined;
    return {
      token: s.token,
      slug: s.slug,
      title: s.title,
      permissions: s.permissions,
      createdAt: s.createdAt,
      boards: s.boards.map((b) => ({ id: b.id, name: b.name, w: b.w, h: b.h })),
    };
  }

  async list(): Promise<ShareMeta[]> {
    const out: ShareMeta[] = [];
    for (const s of this.shares.values()) if (!s.revoked) out.push((await this.get(s.token))!);
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }

  async revoke(token: string): Promise<boolean> {
    const s = this.active(token);
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

  async ping(): Promise<boolean> {
    return this.up;
  }

  async close(): Promise<void> {}
}
