// Route share-link snapshot v1 (spec-collab-cloud story 1). Envelope AD-11 seperti daemon:
// {ok:true,data} | {ok:false,error:{code,message,hint,retryable}}. Kode UNAUTHORIZED/FORBIDDEN
// khusus service ini (di luar enum ErrorCode daemon); error `parseDocument` diteruskan sebagai
// SCHEMA_INVALID → 400. Tanpa akun: capability URL (token unguessable = izin publik) dan satu
// LAKAR_API_KEY untuk endpoint pemilik.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { parseDocument } from '@lakar/core';
import { LakarError, SLUG_PATTERN } from '@lakar/schema';
import { z } from 'zod';
import type { ShareRepo } from './repo.js';

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
  })
  .strict();

const CREATE_HINT = 'kirim {title, slug?, doc, boards:[{id,name,x,y,w,h,pngB64}], permissions:{comment,download}}';
const COMMENT_HINT = 'kirim {boardId, x, y, author, body, parentId?}; author maks 40, body maks 2000';

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
    });
    return ok(reply, { token, url: `${baseOf(req)}/api/shares/${token}` });
  });

  // Daftar share aktif (pemilik).
  app.get('/api/shares', async (req, reply) => {
    requireKey(req);
    return ok(reply, { shares: await repo.list() });
  });

  // Meta publik share (capability URL): judul, izin, boards + imageUrl, komentar aktif.
  app.get<{ Params: { token: string } }>('/api/shares/:token', async (req, reply) => {
    const meta = await metaOf(req.params.token);
    return ok(reply, {
      ...meta,
      commentsEnabled: meta.permissions.comment,
      boards: meta.boards.map((b) => ({ ...b, imageUrl: `/api/shares/${meta.token}/boards/${b.id}.png` })),
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
  app.get<{ Params: { token: string } }>('/api/shares/:token/comments', async (req, reply) => {
    const list = await repo.comments(req.params.token);
    if (!list) throw notFound(`share ${req.params.token}`);
    return ok(reply, { comments: list });
  });

  app.post<{ Params: { token: string } }>('/api/shares/:token/comments', async (req, reply) => {
    const meta = await metaOf(req.params.token);
    if (!meta.permissions.comment) throw forbidden(`komentar dimatikan untuk share ${meta.token}`, 'minta pemilik mengaktifkan izin komentar saat upload');
    const body = parse(CommentBody, req.body, COMMENT_HINT);
    if (!meta.boards.some((b) => b.id === body.boardId)) throw invalid(`board ${body.boardId} tidak ada di share ${meta.token}`, 'pakai id dari boards[] meta share');
    const res = await repo.addComment(meta.token, body);
    if (res.status === 'missing-share') throw notFound(`share ${meta.token}`);
    if (res.status === 'missing-parent') throw invalid(`parentId ${body.parentId} bukan komentar di share ${meta.token}`, 'pakai id komentar yang ada');
    return reply.code(201).send({ ok: true, data: res.comment });
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

  // Liveness + kesiapan DB.
  app.get('/healthz', async (_req, reply) => {
    if (await repo.ping()) return reply.code(200).send({ ok: true, db: 'up' });
    return reply.code(503).send({ ok: false, db: 'down' });
  });
}
