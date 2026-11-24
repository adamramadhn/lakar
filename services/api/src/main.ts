// Entry @lakar/api: `DATABASE_URL` wajib; `PORT` (default 8080), `HOST` (default 0.0.0.0 —
// service ini memang untuk dijangkau jaringan, berbeda dengan lakard yang loopback-saja),
// `LAKAR_API_KEY` (endpoint pemilik; kosong = endpoint pemilik hanya via session), `PUBLIC_BASE_URL`
// (mis. `https://share.example.com`) — satu-satunya sumber host untuk field `url` share, allowlist
// `return_to`, link verify magic, dan redirect_uri OAuth. URL ber-kredensial TIDAK pernah
// diturunkan dari Host/x-forwarded-proto klien: tanpa env ini login email/OAuth menjawab 501
// (route lain tetap jalan; field `url` share menjadi path relatif).
// Auth (spec-cloud-auth): `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`,
// `OAUTH_CALLBACK_BASE` (default PUBLIC_BASE_URL), `RESEND_API_KEY`+`EMAIL_FROM` untuk magic link
// (tanpa Resend → DEV_MAGIC_LINK=1 default: link dicetak ke log).
import { buildApi } from './app.js';
import { resendMailer, type AuthDeps, type SendMail } from './auth.js';
import { createPool, migrate } from './db.js';
import { PgShareRepo, PgUserRepo } from './repo.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('lakar-api: DATABASE_URL wajib diset (contoh postgres://user:pass@host:5432/db)');
  process.exit(1);
}
if (!process.env.LAKAR_API_KEY) {
  console.warn('lakar-api: LAKAR_API_KEY tidak diset — endpoint pemilik (/api/shares tulis) hanya via session akun');
}

const pool = createPool(url);
const applied = await migrate(pool);
if (applied.length) console.log(`lakar-api: migrasi diterapkan: ${applied.join(', ')}`);

// Deps auth dari env: provider OAuth yang env-nya lengkap + mailer Resend/log dev.
const oauthEnv = (name: 'GOOGLE' | 'GITHUB') => {
  const clientId = process.env[`${name}_CLIENT_ID`];
  const clientSecret = process.env[`${name}_CLIENT_SECRET`];
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
};
const sendMail: SendMail = process.env.RESEND_API_KEY
  ? resendMailer(process.env.RESEND_API_KEY, process.env.EMAIL_FROM ?? 'Lakar <onboarding@resend.dev>')
  : (to, subject, html) => {
      if (process.env.DEV_MAGIC_LINK === '0') {
        console.warn(`lakar-api: magic link untuk ${to} tidak dikirim (DEV_MAGIC_LINK=0 dan RESEND_API_KEY kosong)`);
        return;
      }
      console.log(`lakar-api: magic link (dev) untuk ${to} — ${subject}\n${html}`);
    };
const auth: AuthDeps = {
  userRepo: new PgUserRepo(pool),
  providers: { google: oauthEnv('GOOGLE'), github: oauthEnv('GITHUB') },
  sendMail,
  ...(process.env.PUBLIC_BASE_URL ? { publicBaseUrl: process.env.PUBLIC_BASE_URL } : {}),
  ...(process.env.OAUTH_CALLBACK_BASE ? { oauthCallbackBase: process.env.OAUTH_CALLBACK_BASE } : {}),
};

const app = buildApi({
  repo: new PgShareRepo(pool),
  auth,
  ...(process.env.LAKAR_API_KEY ? { apiKey: process.env.LAKAR_API_KEY } : {}),
  ...(process.env.PUBLIC_BASE_URL ? { publicBaseUrl: process.env.PUBLIC_BASE_URL } : {}),
  logger: true,
});
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';
await app.listen({ host, port });

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
