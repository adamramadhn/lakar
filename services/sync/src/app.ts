// Builder app fastify @lakar/sync — REST pemilik (Bearer LAKAR_API_KEY) + route WS room.
// Dipisah dari entry (main.ts) supaya tes bisa memakai repo memori + listen ephemeral.
// Envelope {ok,data|error} sama dengan daemon dan @lakar/api.
import Fastify, { LogController, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { isPlainObject, parseDocument } from '@lakar/core';
import { LakarError, SCHEMA_VERSION } from '@lakar/schema';
import { z } from 'zod';
import { RoomManager } from './rooms.js';
import { registerWsRoute } from './ws.js';
import type { RoomRepo } from './repo.js';

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
const notFound = (what: string) => new ApiFail(404, 'NOT_FOUND', `${what} tidak ada`, { hint: 'periksa token; room yang diarsip tidak bisa diakses lagi' });
const invalid = (message: string, hint: string) => new ApiFail(400, 'SCHEMA_INVALID', message, { hint });

/** Kode ErrorCode daemon → status HTTP (subset yang mungkin lewat: validasi dokumen/ops). */
const STATUS: Record<string, number> = {
  SCHEMA_INVALID: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VERSION_MISMATCH: 409,
};

const CreateRoomBody = z
  .object({
    title: z.string().min(1).max(200),
    doc: z.record(z.string(), z.unknown()),
    /** Token desain awal: digabung ke `doc.tokens` sebelum validasi create (kemudahan upload). */
    tokens: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
const CREATE_HINT = 'kirim {title, doc, tokens?}; doc = dokumen .lakar.json utuh (schemaVersion terkini)';

const parse = <T>(schema: z.ZodType<T>, body: unknown, hint: string): T => {
  const r = schema.safeParse(body);
  if (!r.success) throw invalid(r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), hint);
  return r.data;
};

/** Token capability: 24 byte → 32 char base64url. */
export const newRoomToken = (): string => randomBytes(24).toString('base64url');

export type SyncOptions = {
  repo: RoomRepo;
  /** API key endpoint pemilik; kosong/undefined = semua endpoint pemilik 401. */
  apiKey?: string;
  /** Manager room bawaan; tes bisa menyuntikkan sendiri untuk mengamati state. */
  rooms?: RoomManager;
  bodyLimit?: number;
  logger?: boolean;
};

export function buildSync({ repo, apiKey, rooms, bodyLimit = 16 * 1024 * 1024, logger = false }: SyncOptions): FastifyInstance {
  const app = Fastify({
    logger,
    bodyLimit,
    // Token join ada di URL WS — request logging untuk /room/* dimatikan supaya tidak bocor ke log.
    logController: new LogController({ disableRequestLogging: (req) => (req.url ?? '').startsWith('/room/') }),
  });
  const roomManager = rooms ?? new RoomManager(repo);

  // Route tak dikenal tetap memakai envelope {ok:false,error} (bukan HTML/JSON default fastify).
  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'route tidak ada', hint: 'endpoint room ada di /api/rooms; klien bergabung lewat WS /room/:token', retryable: false } }),
  );

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiFail) {
      return reply.code(err.status).send({ ok: false, error: { code: err.code, message: err.message, hint: err.hint, retryable: err.retryable } });
    }
    if (err instanceof LakarError) {
      return reply.code(STATUS[err.code] ?? 500).send({ ok: false, error: err.toBody() });
    }
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      // Hormati statusCode fastify (413 body terlalu besar, 415 tipe media salah, 400 JSON rusak).
      const code = e.statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : e.statusCode === 415 ? 'UNSUPPORTED_MEDIA_TYPE' : 'SCHEMA_INVALID';
      return reply.code(e.statusCode).send({ ok: false, error: { code, message: e.message ?? 'permintaan tidak valid', hint: 'kirim body JSON sesuai API', retryable: false } });
    }
    req.log.error(err);
    return reply.code(500).send({ ok: false, error: { code: 'EXEC_ERROR', message: `kesalahan internal sync: ${e.message ?? String(err)}`, hint: 'coba lagi; periksa log service', retryable: true } });
  });

  const ok = (reply: FastifyReply, data: unknown) => reply.code(200).send({ ok: true, data });
  const requireKey = (req: FastifyRequest) => {
    // timingSafeEqual supaya perbandingan key tidak bocor lewat waktu respons; panjang dicek dulu
    // (timingSafeEqual melempar bila beda panjang — selisih panjang sendiri bukan rahasia).
    const expected = Buffer.from(`Bearer ${apiKey ?? ''}`, 'utf8');
    const given = Buffer.from(req.headers.authorization ?? '', 'utf8');
    if (!apiKey || given.length !== expected.length || !timingSafeEqual(given, expected)) throw unauthorized();
  };

  // Buat room (pemilik): doc divalidasi penuh `parseDocument` sebelum disimpan — doc harus sudah
  // schemaVersion terkini (server tidak memigrasi). `tokens` opsional digabung ke doc.tokens dulu.
  app.post('/api/rooms', async (req, reply) => {
    requireKey(req);
    const body = parse(CreateRoomBody, req.body, CREATE_HINT);
    const raw = body.tokens && isPlainObject(body.doc.tokens) ? { ...body.doc, tokens: { ...body.doc.tokens, ...body.tokens } } : body.tokens ? { ...body.doc, tokens: body.tokens } : body.doc;
    // Server tidak memigrasi skema dokumen: doc harus sudah versi terkini (parseDocument saja
    // akan memigrasi versi lama secara diam-diam — dicek eksplisit di sini).
    if (raw.schemaVersion !== SCHEMA_VERSION) {
      throw invalid(`doc.schemaVersion harus ${SCHEMA_VERSION} (versi terkini), bukan ${JSON.stringify(raw.schemaVersion) ?? 'undefined'}`, 'buka dan simpan dokumen dengan Lakar versi terkini dulu; server tidak memigrasi dokumen');
    }
    let doc;
    try {
      doc = parseDocument(raw);
    } catch (e) {
      if (e instanceof LakarError) throw invalid(`doc tidak valid: ${e.message}`, 'kirim dokumen .lakar.json terkini (server tidak memigrasi versi lama)');
      throw e;
    }
    const token = newRoomToken();
    const viewToken = newRoomToken();
    await repo.create({ token, viewToken, title: body.title, doc });
    // Bersihkan tanda arsip basi di RoomManager (praktis mustahil — token acak, tapi murah).
    roomManager.created(token);
    return ok(reply, { token, viewToken, rev: doc.rev });
  });

  // Meta room (pemilik).
  app.get<{ Params: { token: string } }>('/api/rooms/:token', async (req, reply) => {
    requireKey(req);
    const meta = await repo.meta(req.params.token);
    if (!meta) throw notFound(`room ${req.params.token}`);
    return ok(reply, meta);
  });

  // Arsipkan room (pemilik): semua peer diputus (close 4000) dan room tak bisa diakses lagi.
  app.delete<{ Params: { token: string } }>('/api/rooms/:token', async (req, reply) => {
    requireKey(req);
    if (!(await repo.archive(req.params.token))) throw notFound(`room ${req.params.token}`);
    await roomManager.closeRoom(req.params.token);
    return ok(reply, { token: req.params.token });
  });

  app.get('/healthz', async (_req, reply) => {
    if (await repo.ping()) return ok(reply, { status: 'ok' });
    return reply.code(503).send({ ok: false, error: { code: 'EXEC_ERROR', message: 'database tidak terjangkau', hint: 'periksa DATABASE_URL', retryable: true } });
  });

  // Route WS didaftarkan di konteks plugin terpisah yang dimuat SETELAH @fastify/websocket:
  // hook onRoute plugin hanya melihat route yang dibuat setelah plugin termuat, jadi route
  // {websocket:true} di level root (sebelum plugin jalan) akan tetap jadi route HTTP biasa.
  // maxPayload membatasi satu frame WS ke 1 MiB (ops doc mentah jauh di bawah itu).
  app.register(websocket, { options: { maxPayload: 1 << 20 } });
  app.register(async (instance) => {
    registerWsRoute(instance, { rooms: roomManager });
  });
  app.addHook('onClose', async () => {
    await roomManager.close();
  });
  return app;
}
