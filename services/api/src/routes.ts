// Route share-link snapshot v1 (spec-collab-cloud story 1). Envelope AD-11 seperti daemon:
// {ok:true,data} | {ok:false,error:{code,message,hint,retryable}}. Kode UNAUTHORIZED/FORBIDDEN
// khusus service ini (di luar enum ErrorCode daemon); error `parseDocument` diteruskan sebagai
// SCHEMA_INVALID → 400. Tanpa akun: capability URL (token unguessable = izin publik) dan satu
// LAKAR_API_KEY untuk endpoint pemilik.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from '@lakar/core';
import { LakarError, SLUG_PATTERN } from '@lakar/schema';
import { z } from 'zod';
import type { PublicComment, ShareComment, ShareRepo } from './repo.js';

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Error HTTP service: kode bebas (enum ErrorCode daemon tidak punya 401/403). */
export class ApiFail extends Error {
  readonly status: number;
  readonly code: string;
  readonly hint: string;
  readonly retryable: boolean;
  constructor(status: number, code: string, message: string, opts: { hint?: string; retryable?: boolean } = {}) {
    super(message);
    this.name = 'ApiFail';
    this.status = status;
    this.code = code;
    this.hint = opts.hint ?? '';
    this.retryable = opts.retryable ?? false;
  }
}

const unauthorized = () => new ApiFail(401, 'UNAUTHORIZED', 'API key tidak valid atau tidak ada', { hint: 'kirim header authorization: Bearer <LAKAR_API_KEY>' });
const forbidden = (message: string, hint: string) => new ApiFail(403, 'FORBIDDEN', message, { hint });
const notFound = (what: string) => new ApiFail(404, 'NOT_FOUND', `${what} tidak ada`, { hint: 'periksa URL share; share yang di-revoke tidak bisa diakses lagi' });
const invalid = (message: string, hint: string) => new ApiFail(400, 'SCHEMA_INVALID', message, { hint });

/** `expires_at` dari klien: ISO 8601 datetime (dengan offset) atau null ("Never"); bentuk lain
 *  (mis. "March 5" yang lolos Date.parse) → 400. */
const ExpiresAt = z.union([z.iso.datetime({ error: 'expiresAt harus datetime ISO 8601 (mis. 2026-12-24T00:00:00Z)' }), z.null()]);
/** Izin parsial untuk PATCH/PUT — kunci yang tidak dikirim dipertahankan (merge shallow di repo). */
const PermissionsPatch = z.object({ comment: z.boolean().optional(), download: z.boolean().optional() }).strict();
const BoardBody = z
  .object({
    id: z.string().min(1),
    name: z.string().max(200),
    x: z.number().finite(),
    y: z.number().finite(),
    w: z.number().positive().finite(),
    h: z.number().positive().finite(),
    pngB64: z.string().min(1),
  })
  .strict();
const CreateShareBody = z
  .object({
    title: z.string().min(1).max(200),
    slug: z.string().regex(SLUG_PATTERN).optional(),
    doc: z.record(z.string(), z.unknown()),
    boards: z.array(BoardBody).min(1).max(200),
    permissions: z.object({ comment: z.boolean(), download: z.boolean() }).strict(),
    expiresAt: ExpiresAt.optional(),
  })
  .strict();
const PatchShareBody = z
  .object({
    permissions: PermissionsPatch.optional(),
    expiresAt: ExpiresAt.optional(),
  })
  .strict();
const RefreshShareBody = z
  .object({
    title: z.string().min(1).max(200).optional(),
    slug: z.string().regex(SLUG_PATTERN).optional(),
    doc: z.record(z.string(), z.unknown()),
    boards: z.array(BoardBody).min(1).max(200),
    permissions: PermissionsPatch.optional(),
  })
  .strict();
const CommentBody = z
  .object({
    boardId: z.string().min(1),
    x: z.number().finite(),
    y: z.number().finite(),
    author: z.string().min(1).max(40),
    body: z.string().min(1).max(2000),
    parentId: z.number().int().positive().optional(),
    guestId: z.string().min(1).max(64).optional(),
  })
  .strict();
const CommentEditBody = z
  .object({
    guestId: z.string().min(1).max(64),
    body: z.string().min(1).max(2000),
  })
  .strict();
const CommentDeleteBody = z.object({ guestId: z.string().min(1).max(64) }).strict();

const CREATE_HINT = 'kirim {title, slug?, doc, boards:[{id,name,x,y,w,h,pngB64}], permissions:{comment,download}, expiresAt?}';
const PATCH_HINT = 'kirim {permissions?: {comment?, download?}, expiresAt?: "<ISO>" | null}; null = tidak pernah kedaluwarsa';
const COMMENT_HINT = 'kirim {boardId, x, y, author, body, parentId?, guestId?}; author maks 40, body maks 2000';
const COMMENT_EDIT_HINT = 'kirim {guestId, body}; guestId = UUID dari localStorage lakar_guest_id pemilik komentar';
const COMMENT_DELETE_HINT = 'kirim {guestId} di body; guestId = UUID dari localStorage lakar_guest_id pemilik komentar';

/** Kedaluwarsa default link baru bila `expiresAt` tidak dikirim: 30 hari. */
const DEFAULT_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

const parse = <T>(schema: z.ZodType<T>, body: unknown, hint: string): T => {
  const r = schema.safeParse(body);
  if (!r.success) throw invalid(r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), hint);
  return r.data;
};

/** Decode PNG base64 + periksa magic bytes (penangkap input rusak sebelum bytea). */
const pngOf = (b64: string, boardId: string): Buffer => {
  const buf = Buffer.from(b64, 'base64');
  const ok = buf.length > PNG_SIG.length && PNG_SIG.every((v, i) => buf[i] === v);
  if (!ok) throw invalid(`boards[].pngB64 untuk board ${boardId} bukan PNG valid`, CREATE_HINT);
  return buf;
};

// ---- Guest page statis (plan-share-link-ui): bundle vanilla di `public/`, dibaca sekali lalu di-cache. ----

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const publicCache = new Map<string, Buffer>();
/** Baca `services/api/public/<name>`; di-cache di memori (aset statis, deploy baru = proses baru). */
const publicFile = (name: string): Buffer => {
  let hit = publicCache.get(name);
  if (!hit) {
    hit = readFileSync(join(PUBLIC_DIR, name));
    publicCache.set(name, hit);
  }
  return hit;
};

/** Header keamanan halaman tamu: semua aset same-origin (HTML/CSS/JS/PNG), tanpa inline;
 *  `frame-ancestors 'self'` supaya snapshot tidak bisa di-embed lintas origin (clickjacking). */
const SHARE_PAGE_HEADERS = {
  'content-security-policy':
    "default-src 'self'; img-src 'self' data: blob:; connect-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
} as const;

const sendShareAsset = (reply: FastifyReply, name: string, type: string) =>
  reply.type(type).header('cache-control', 'no-cache').header('x-content-type-options', 'nosniff').send(publicFile(name));

/** Token capability: 24 byte → 32 char base64url (≥21). */
export const newShareToken = (): string => randomBytes(24).toString('base64url');

export type ShareRoutesOptions = {
  repo: ShareRepo;
  /** API key endpoint pemilik; kosong/undefined = semua endpoint pemilik 401. */
  apiKey?: string;
  /** Basis URL publik untuk field `url` (default: Host header permintaan). */
  publicBaseUrl?: string;
};

export function registerShareRoutes(app: FastifyInstance, { repo, apiKey, publicBaseUrl }: ShareRoutesOptions): void {
  const ok = (reply: FastifyReply, data: unknown) => reply.code(200).send({ ok: true, data });
  const requireKey = (req: FastifyRequest) => {
    // timingSafeEqual supaya perbandingan key tidak bocor lewat waktu respons; panjang dicek dulu
    // (timingSafeEqual melempar bila beda panjang — selisih panjang sendiri bukan rahasia).
    const expected = Buffer.from(`Bearer ${apiKey ?? ''}`, 'utf8');
    const given = Buffer.from(req.headers.authorization ?? '', 'utf8');
    if (!apiKey || given.length !== expected.length || !timingSafeEqual(given, expected)) throw unauthorized();
  };
  /** Basis URL publik: env `PUBLIC_BASE_URL` > proto `x-forwarded-proto` (satu hop proxy
   *  tepercaya, mis. TLS terminator) + header Host. Deploy di belakang proxy umum: set
   *  PUBLIC_BASE_URL eksplisit supaya field `url` tidak bergantung header klien. */
  const baseOf = (req: FastifyRequest) => {
    if (publicBaseUrl) return publicBaseUrl;
    const fwd = req.headers['x-forwarded-proto'];
    const proto = (typeof fwd === 'string' ? fwd.split(',')[0]!.trim() : '') === 'https' ? 'https' : 'http';
    return `${proto}://${req.headers.host ?? 'localhost'}`;
  };
  const metaOf = async (token: string) => (await repo.get(token)) ?? Promise.reject(notFound(`share ${token}`));

  /** guestId peminta dari header `x-lakar-guest-id` (UUID di localStorage klien) — dasar flag `mine`. */
  const requesterOf = (req: FastifyRequest): string | undefined => {
    const h = req.headers['x-lakar-guest-id'];
    return typeof h === 'string' && h.length > 0 ? h : undefined;
  };
  /** Proyeksi komentar ke bentuk publik: `guest_id` mentah tidak pernah diserialkan (tamu lain bisa
   *  menyalahgunakannya untuk edit/hapus); kepemilikan dibawa `mine` yang dihitung di server. */
  const toPublicComment = (c: ShareComment, requester?: string): PublicComment => {
    const { guestId, ...rest } = c;
    return { ...rest, mine: guestId !== undefined && guestId === requester };
  };

  // Upload snapshot dari lakard (pemilik). Dokumen divalidasi penuh `parseDocument` sebelum disimpan.
  app.post('/api/shares', async (req, reply) => {
    requireKey(req);
    const body = parse(CreateShareBody, req.body, CREATE_HINT);
    // board_id ganda akan gagal PK (token, board_id) dengan 500 — tangkap duluan sebagai 400.
    const boardIds = body.boards.map((b) => b.id);
    if (new Set(boardIds).size !== boardIds.length) throw invalid('boards[].id ganda: tiap board harus punya id unik', CREATE_HINT);
    let doc: unknown;
    try {
      doc = parseDocument(body.doc);
    } catch (e) {
      if (e instanceof LakarError) throw invalid(`doc tidak valid: ${e.message}`, 'kirim dokumen .lakar.json hasil POST /viewer/docs/:slug/share di lakard');
      throw e;
    }
    const token = newShareToken();
    await repo.create({
      token,
      slug: body.slug ?? 'share',
      title: body.title,
      permissions: body.permissions,
      doc,
      boards: body.boards.map((b) => ({ id: b.id, name: b.name, x: b.x, y: b.y, w: b.w, h: b.h, png: pngOf(b.pngB64, b.id) })),
      // Default +30 hari; "Never" → klien mengirim expiresAt:null.
      expiresAt: body.expiresAt === undefined ? new Date(Date.now() + DEFAULT_EXPIRY_MS) : body.expiresAt === null ? null : new Date(body.expiresAt),
    });
    return ok(reply, { token, url: `${baseOf(req)}/s/${token}` });
  });

  // Daftar share aktif (pemilik).
  app.get('/api/shares', async (req, reply) => {
    requireKey(req);
    return ok(reply, { shares: await repo.list() });
  });

  // PATCH izin/kedaluwarsa (pemilik): berlaku instan tanpa re-upload; url ikut meta terbaru.
  app.patch<{ Params: { token: string } }>('/api/shares/:token', async (req, reply) => {
    requireKey(req);
    const body = parse(PatchShareBody, req.body, PATCH_HINT);
    const meta = await repo.update(req.params.token, {
      ...(body.permissions !== undefined ? { permissions: body.permissions } : {}),
      ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt === null ? null : new Date(body.expiresAt) } : {}),
    });
    if (!meta) throw notFound(`share ${req.params.token}`);
    return ok(reply, { ...meta, url: `${baseOf(req)}/s/${meta.token}` });
  });

  // PUT snapshot baru (pemilik, "Update snapshot"): ganti doc+PNG dalam satu transaksi, token/URL
  // dan komentar tetap. Body sama POST dengan title/slug/permissions opsional (dipertahankan).
  app.put<{ Params: { token: string } }>('/api/shares/:token', async (req, reply) => {
    requireKey(req);
    const body = parse(RefreshShareBody, req.body, CREATE_HINT);
    const boardIds = body.boards.map((b) => b.id);
    if (new Set(boardIds).size !== boardIds.length) throw invalid('boards[].id ganda: tiap board harus punya id unik', CREATE_HINT);
    let doc: unknown;
    try {
      doc = parseDocument(body.doc);
    } catch (e) {
      if (e instanceof LakarError) throw invalid(`doc tidak valid: ${e.message}`, 'kirim dokumen .lakar.json hasil POST /viewer/docs/:slug/share di lakard');
      throw e;
    }
    const done = await repo.refresh(req.params.token, {
      doc,
      boards: body.boards.map((b) => ({ id: b.id, name: b.name, x: b.x, y: b.y, w: b.w, h: b.h, png: pngOf(b.pngB64, b.id) })),
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.slug !== undefined ? { slug: body.slug } : {}),
      ...(body.permissions !== undefined ? { permissions: body.permissions } : {}),
    });
    if (!done) throw notFound(`share ${req.params.token}`);
    return ok(reply, { token: req.params.token, url: `${baseOf(req)}/s/${req.params.token}` });
  });

  // Meta publik share (capability URL): judul, izin, boards + imageUrl, komentar aktif, kedaluwarsa,
  // dan `views` — satu-satunya endpoint yang menaikkan penghitung tampilan (bukan PNG/komentar).
  app.get<{ Params: { token: string } }>('/api/shares/:token', async (req, reply) => {
    const meta = await repo.countView(req.params.token);
    if (!meta) throw notFound(`share ${req.params.token}`);
    return ok(reply, {
      ...meta,
      commentsEnabled: meta.permissions.comment,
      // boardId string bebas dari upload — di-encode supaya tidak mematahkan path URL.
      boards: meta.boards.map((b) => ({ ...b, imageUrl: `/api/shares/${meta.token}/boards/${encodeURIComponent(b.id)}.png` })),
    });
  });

  // PNG board (publik). Bukan `immutable`: share bisa di-revoke, jadi cache dibatasi 5 menit +
  // must-revalidate; ETag lemah per (token, board) supaya revalidasi murah (304 tanpa body).
  app.get<{ Params: { token: string; boardId: string } }>('/api/shares/:token/boards/:boardId.png', async (req, reply) => {
    const png = await repo.boardPng(req.params.token, req.params.boardId);
    if (!png) throw notFound(`board ${req.params.boardId} di share ${req.params.token}`);
    // boardId dari upload (string bebas) — base64url supaya aman di dalam tanda kutip ETag.
    const etag = `W/"${req.params.token}-${Buffer.from(req.params.boardId, 'utf8').toString('base64url')}"`;
    const inm = req.headers['if-none-match'];
    if (inm && inm.split(',').some((t) => t.trim() === etag || t.trim() === '*')) {
      return reply.code(304).header('etag', etag).header('cache-control', 'public, max-age=300, must-revalidate').send();
    }
    return reply.type('image/png').header('cache-control', 'public, max-age=300, must-revalidate').header('etag', etag).send(png);
  });

  // Komentar tamu (publik): daftar dan tambah pin. Izin comment off → 403; share revoked → 404.
  // GET membaca `x-lakar-guest-id` peminta untuk mengisi `mine` per komentar.
  app.get<{ Params: { token: string } }>('/api/shares/:token/comments', async (req, reply) => {
    const list = await repo.comments(req.params.token);
    if (!list) throw notFound(`share ${req.params.token}`);
    const requester = requesterOf(req);
    return ok(reply, { comments: list.map((c) => toPublicComment(c, requester)) });
  });

  app.post<{ Params: { token: string } }>('/api/shares/:token/comments', async (req, reply) => {
    const meta = await metaOf(req.params.token);
    if (!meta.permissions.comment) throw forbidden(`komentar dimatikan untuk share ${meta.token}`, 'minta pemilik mengaktifkan izin komentar saat upload');
    const body = parse(CommentBody, req.body, COMMENT_HINT);
    const board = meta.boards.find((b) => b.id === body.boardId);
    if (!board) throw invalid(`board ${body.boardId} tidak ada di share ${meta.token}`, 'pakai id dari boards[] meta share');
    // Pin di luar batas board → 400 (pin hasil craft yang melayang di atas UI ditolak, bukan di-clamp).
    if (body.x < 0 || body.x > board.w || body.y < 0 || body.y > board.h) {
      throw invalid(`pin komentar (${body.x}, ${body.y}) di luar board ${body.boardId} (${board.w}×${board.h})`, 'koordinat pin harus di dalam board: 0≤x≤w dan 0≤y≤h');
    }
    const res = await repo.addComment(meta.token, body);
    if (res.status === 'missing-share') throw notFound(`share ${meta.token}`);
    if (res.status === 'missing-parent') throw invalid(`parentId ${body.parentId} bukan komentar di share ${meta.token}`, 'pakai id komentar yang ada');
    return reply.code(201).send({ ok: true, data: toPublicComment(res.comment, requesterOf(req) ?? body.guestId) });
  });

  // Edit/hapus komentar tamu (publik): hanya pemilik `guestId` komentar itu (UUID di localStorage
  // klien — tanpa akun, jadi guestId = bukti kepemilikan). Sengaja tidak digate izin comment:
  // tamu tetap boleh memperbaiki/menghapus tulisannya walau pemilik baru mematikan komentar.
  const commentIdOf = (raw: string, token: string): number => {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) throw invalid(`id komentar ${raw} tidak valid di share ${token}`, 'pakai id angka dari respons comments');
    return id;
  };

  app.patch<{ Params: { token: string; id: string } }>('/api/shares/:token/comments/:id', async (req, reply) => {
    const id = commentIdOf(req.params.id, req.params.token);
    const body = parse(CommentEditBody, req.body, COMMENT_EDIT_HINT);
    const res = await repo.updateComment(req.params.token, id, body.guestId, body.body);
    if (res.status === 'missing') throw notFound(`komentar ${id} di share ${req.params.token}`);
    if (res.status === 'forbidden') throw forbidden(`komentar ${id} bukan milik guestId ini`, 'hanya komentar yang dibuat dari browser ini yang bisa diedit');
    return ok(reply, toPublicComment(res.comment, requesterOf(req) ?? body.guestId));
  });

  app.delete<{ Params: { token: string; id: string } }>('/api/shares/:token/comments/:id', async (req, reply) => {
    const id = commentIdOf(req.params.id, req.params.token);
    // guestId hanya lewat body — kredensial tidak boleh nongol di URL (log akses/proxy).
    const body = parse(CommentDeleteBody, req.body, COMMENT_DELETE_HINT);
    const res = await repo.deleteComment(req.params.token, id, body.guestId);
    if (res.status === 'missing') throw notFound(`komentar ${id} di share ${req.params.token}`);
    if (res.status === 'forbidden') throw forbidden(`komentar ${id} bukan milik guestId ini`, 'hanya komentar yang dibuat dari browser ini yang bisa dihapus');
    return reply.code(204).send();
  });

  // Unduhan `.lakar.json` (publik, bila izin download on): lampiran bernama <slug>.lakar.json.
  app.get<{ Params: { token: string } }>('/api/shares/:token/download', async (req, reply) => {
    const meta = await metaOf(req.params.token);
    if (!meta.permissions.download) throw forbidden(`unduhan dimatikan untuk share ${meta.token}`, 'minta pemilik mengaktifkan izin unduhan saat upload');
    const doc = await repo.docJson(meta.token);
    if (doc === undefined) throw notFound(`share ${meta.token}`);
    return reply
      .type('application/json; charset=utf-8')
      .header('content-disposition', `attachment; filename="${meta.slug}.lakar.json"`)
      .header('cache-control', 'no-store')
      .send(JSON.stringify(doc, null, 2));
  });

  // Revoke (pemilik): semua GET publik share itu langsung 404.
  app.delete<{ Params: { token: string } }>('/api/shares/:token', async (req, reply) => {
    requireKey(req);
    if (!(await repo.revoke(req.params.token))) throw notFound(`share ${req.params.token}`);
    return reply.code(204).send();
  });

  // ---- Guest page (plan-share-link-ui): bundle statis `public/` di `/s/*`. ----
  // `GET /s/:token` menyajikan shell HTML yang sama untuk semua token: share mati (revoked/
  // kedaluwarsa/unknown) tetap menerima shell-nya dengan status 404 — JS halaman lalu merender
  // state "link doesn't work" yang identik ketiga-tiganya (tanpa bocor doc/nama pemilik).

  app.get('/s/share.css', async (_req, reply) => sendShareAsset(reply, 'share.css', 'text/css; charset=utf-8'));
  app.get('/s/share.js', async (_req, reply) => sendShareAsset(reply, 'share.js', 'text/javascript; charset=utf-8'));

  app.get<{ Params: { token: string } }>('/s/:token', async (req, reply) => {
    // repo.get (bukan countView): view baru dihitung saat JS halaman fetch meta.
    const meta = await repo.get(req.params.token);
    const r = reply.type('text/html; charset=utf-8').header('cache-control', 'no-store');
    for (const [k, v] of Object.entries(SHARE_PAGE_HEADERS)) r.header(k, v);
    if (!meta) r.code(404);
    return r.send(publicFile('share.html'));
  });

  // Liveness + kesiapan DB.
  app.get('/healthz', async (_req, reply) => {
    if (await repo.ping()) return reply.code(200).send({ ok: true, db: 'up' });
    return reply.code(503).send({ ok: false, db: 'down' });
  });
}
