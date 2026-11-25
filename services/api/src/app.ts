// Builder app fastify @lakar/api — dipisah dari entry (main.ts) supaya tes bisa `app.inject`
// dengan repo tiruan (pola yang sama dengan buildServer di daemon).
import Fastify, { type FastifyInstance } from 'fastify';
import { LakarError } from '@lakar/schema';
import { ApiFail, registerShareRoutes, type ShareRoutesOptions } from './routes.js';
import { registerAuthRoutes, sessionOf, type AuthDeps } from './auth.js';
import type { ShareRepo } from './repo.js';

/** Kode ErrorCode daemon → status HTTP (subset yang mungkin lewat: validasi dokumen). */
const STATUS: Record<string, number> = {
  SCHEMA_INVALID: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VERSION_MISMATCH: 409,
};

export type ApiOptions = ShareRoutesOptions & {
  /** Batas body upload share (dokumen + PNG base64 bisa beberapa MB). */
  bodyLimit?: number;
  logger?: boolean;
  /** Deps auth (spec-cloud-auth): bila diisi, route `/api/auth/*` didaftarkan dan endpoint
   *  pemilik shares juga menerima Bearer session di samping admin key. */
  auth?: AuthDeps;
};

export function buildApi({ repo, apiKey, publicBaseUrl, auth, bodyLimit = 64 * 1024 * 1024, logger = false }: ApiOptions): FastifyInstance {
  const app = Fastify({ logger, bodyLimit });

  // Route tak dikenal tetap memakai envelope {ok:false,error} (bukan HTML/JSON default fastify).
  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'route tidak ada', hint: 'periksa path; endpoint share ada di bawah /api/shares', retryable: false } }),
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
      // Hormati statusCode fastify (413 body terlalu besar, 415 tipe media salah, 400 JSON rusak)
      // alih-alih meratakan semua ke 400 SCHEMA_INVALID.
      const code = e.statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : e.statusCode === 415 ? 'UNSUPPORTED_MEDIA_TYPE' : 'SCHEMA_INVALID';
      return reply
        .code(e.statusCode)
        .send({ ok: false, error: { code, message: e.message ?? 'permintaan tidak valid', hint: 'kirim body JSON sesuai API', retryable: false } });
    }
    req.log.error(err);
    return reply.code(500).send({ ok: false, error: { code: 'EXEC_ERROR', message: `kesalahan internal api: ${e.message ?? String(err)}`, hint: 'coba lagi; periksa log service', retryable: true } });
  });

  registerShareRoutes(app, {
    repo,
    ...(apiKey ? { apiKey } : {}),
    ...(publicBaseUrl ? { publicBaseUrl } : {}),
    ...(auth ? { sessionOf: sessionOf(auth.userRepo) } : {}),
  });
  if (auth) registerAuthRoutes(app, { ...auth, publicBaseUrl: auth.publicBaseUrl ?? publicBaseUrl });
  return app;
}

export type { ShareRepo };
export { MemoryShareRepo, MemoryUserRepo, PgShareRepo, PgUserRepo } from './repo.js';
export { registerAuthRoutes, resendMailer, sessionOf, type AuthDeps, type FetchFn, type SendMail } from './auth.js';
export { createPool, migrate, MIGRATIONS_DIR } from './db.js';
