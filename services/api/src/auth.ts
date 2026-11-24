// Route auth @lakar/api (spec-cloud-auth story A): `GET /api/auth/providers`, OAuth code flow
// google+github (start → 302 provider + cookie nonce, callback → session → 302 `return_to#token=`),
// magic link email (Resend di produksi, log di dev), `GET /api/auth/me`, `DELETE /api/auth/session`.
// Tanpa dep baru: pertukaran code + userinfo lewat `fetch` yang diinject (tes penuh tanpa
// jaringan), pengirim email lewat `sendMail` yang diinject. Token session opaque disimpan mentah
// di `sessions`; magic token disimpan sebagai hash sha256 di `magic_tokens`.
// Keamanan: URL ber-kredensial (link verify magic, redirect_uri OAuth) WAJIB dibentuk dari
// PUBLIC_BASE_URL/OAUTH_CALLBACK_BASE — tidak pernah dari Host/x-forwarded-proto klien; `state`
// OAuth diikat ke browser pemulai lewat cookie nonce HttpOnly; `return_to` hanya loopback atau
// tepat di bawah PUBLIC_BASE_URL.
import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiFail } from './routes.js';
import { MAGIC_TOKEN_TTL_MS, type User, type UserRepo } from './repo.js';

/** `fetch` yang bisa diinject untuk pertukaran OAuth + Resend (tes memakai mock). */
export type FetchFn = (url: string | URL, init?: RequestInit) => Promise<Response>;
/** Pengirim email diinject: `html` memuat link sign-in. Dev default = log ke console. */
export type SendMail = (to: string, subject: string, html: string) => Promise<void> | void;

export type OAuthClient = { clientId: string; clientSecret: string };
export type OAuthProvider = 'google' | 'github';
const PROVIDERS: readonly OAuthProvider[] = ['google', 'github'];

export type AuthDeps = {
  userRepo: UserRepo;
  /** Client OAuth per provider; provider tanpa entry → route-nya 501 NOT_SUPPORTED. */
  providers?: Partial<Record<OAuthProvider, OAuthClient>>;
  /** Basis URL publik service (allowlist `return_to` + pembentuk link verify/callback). */
  publicBaseUrl?: string;
  /** Basis redirect_uri OAuth; default `publicBaseUrl` (env OAUTH_CALLBACK_BASE = PUBLIC_BASE_URL). */
  oauthCallbackBase?: string;
  /** Pengirim magic link; tanpa ini link dicetak ke log (DEV_MAGIC_LINK=1, default dev). */
  sendMail?: SendMail;
  fetchFn?: FetchFn;
  /** Umur magic link (default 15 menit). */
  magicTtlMs?: number;
};

const unauthorized = (message = 'session tidak valid atau tidak ada') =>
  new ApiFail(401, 'UNAUTHORIZED', message, { hint: 'kirim header authorization: Bearer <session token>' });
const badRequest = (message: string, hint: string) => new ApiFail(400, 'BAD_REQUEST', message, { hint });
const forbidden = (message: string, hint: string) => new ApiFail(403, 'FORBIDDEN', message, { hint });
const notSupported = (provider: string) =>
  new ApiFail(501, 'NOT_SUPPORTED', `provider ${provider} tidak dikonfigurasi`, { hint: `set env client id/secret ${provider} di service; provider tersedia: GET /api/auth/providers` });

/** Allowlist `return_to` (anti open-redirect): loopback port berapa pun, atau tepat
 *  PUBLIC_BASE_URL / path di bawahnya. Jangan `startsWith(base)` polos —
 *  `https://share.example.evil.com` lolos prefix `https://share.example` dan token
 *  session di #fragment terbaca JS penyerang. */
const LOOPBACK_RE = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//;
export const returnToAllowed = (returnTo: string, publicBaseUrl?: string): boolean => {
  if (LOOPBACK_RE.test(returnTo)) return true;
  if (publicBaseUrl === undefined || publicBaseUrl.length === 0) return false;
  const base = publicBaseUrl.replace(/\/+$/, '');
  return returnTo === base || returnTo.startsWith(`${base}/`);
};

/** `return_to` dari query/body: lolos allowlist → dipakai; tak ada → PUBLIC_BASE_URL/; else 400. */
const resolveReturnTo = (raw: string | undefined, publicBaseUrl?: string): string => {
  if (raw !== undefined) {
    if (!returnToAllowed(raw, publicBaseUrl)) throw badRequest('return_to tidak diizinkan', 'return_to harus loopback (127.0.0.1/localhost) atau di bawah PUBLIC_BASE_URL');
    return raw;
  }
  if (publicBaseUrl) return `${publicBaseUrl}/`;
  throw badRequest('return_to wajib diisi', 'kirim return_to loopback/viewer, atau set PUBLIC_BASE_URL di service');
};

/** Batas waktu panggilan upstream (token/userinfo provider, Resend) — jangan menggantung selamanya. */
const FETCH_TIMEOUT_MS = 15_000;

/** Profil hasil pertukaran OAuth — email wajib verified untuk auto-link (spec §Keamanan). */
type OAuthProfile = { subject: string; email: string; name?: string; avatarUrl?: string; emailVerified: boolean };

/** Gagal HTTP dari provider = masalah upstream (502 retryable), BUKAN 401 — kredensial
 *  peminta tidak salah, jangan sampai klien mengira session/code-nya yang ditolak. */
const upstream = (what: string, status: number) =>
  new ApiFail(502, 'UPSTREAM', `pertukaran OAuth gagal: ${what} menjawab HTTP ${status}`, { hint: 'gangguan sementara di provider; coba sign-in ulang', retryable: true });

const readJson = async (res: Response, what: string): Promise<Record<string, unknown>> => {
  if (!res.ok) throw upstream(what, res.status);
  return (await res.json()) as Record<string, unknown>;
};

/** Tukar `code` → access_token → profil ternormalisasi. Endpoint sesuai dokumentasi provider. */
async function oauthExchange(provider: OAuthProvider, client: OAuthClient, code: string, redirectUri: string, fetchFn: FetchFn): Promise<OAuthProfile> {
  const form = (extra: Record<string, string>) =>
    new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret, code, redirect_uri: redirectUri, ...extra }).toString();
  if (provider === 'google') {
    const tok = await readJson(
      await fetchFn('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form({ grant_type: 'authorization_code' }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }),
      'token google',
    );
    const info = await readJson(
      await fetchFn('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${String(tok.access_token ?? '')}` }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
      'userinfo google',
    );
    return {
      subject: String(info.sub ?? ''),
      email: String(info.email ?? ''),
      name: typeof info.name === 'string' ? info.name : undefined,
      avatarUrl: typeof info.picture === 'string' ? info.picture : undefined,
      emailVerified: info.email_verified === true,
    };
  }
  // github: accept application/json supaya respons token berupa JSON, lalu user + email primary.
  const ghHeaders = (token: string) => ({ accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'user-agent': 'lakar-api' });
  const tok = await readJson(
    await fetchFn('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: form({}),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }),
    'token github',
  );
  const access = String(tok.access_token ?? '');
  const user = await readJson(await fetchFn('https://api.github.com/user', { headers: ghHeaders(access), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }), 'user github');
  const emailsRes = await fetchFn('https://api.github.com/user/emails', { headers: ghHeaders(access), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!emailsRes.ok) throw upstream('user/emails github', emailsRes.status);
  const emails = (await emailsRes.json()) as { email: string; primary: boolean; verified: boolean }[];
  const primary = emails.find((e) => e.primary && e.verified);
  return {
    subject: String(user.id ?? ''),
    email: primary?.email ?? '',
    name: typeof user.name === 'string' ? user.name : undefined,
    avatarUrl: typeof user.avatar_url === 'string' ? user.avatar_url : undefined,
    emailVerified: primary !== undefined,
  };
}

const authorizeUrl = (provider: OAuthProvider, clientId: string, redirectUri: string, state: string): string => {
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, state });
  if (provider === 'google') {
    params.set('response_type', 'code');
    params.set('scope', 'openid email profile');
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  params.set('scope', 'read:user user:email');
  return `https://github.com/login/oauth/authorize?${params}`;
};

const MagicBody = z.object({ email: z.email(), return_to: z.string().min(1).optional() }).strict();
const MAGIC_HINT = 'kirim {email, return_to?}; return_to dibatasi loopback atau PUBLIC_BASE_URL';
/** Rate limit magic link: 5 permintaan / 15 menit — dua bucket dipakai sekaligus:
 *  `ip|email` (batasi satu sumber) DAN `email` murni (di belakang satu proxy semua klien
 *  berbagi IP, jadi bucket gabungan saja tidak melindungi email target dari DoS). */
const MAGIC_LIMIT = 5;
const MAGIC_WINDOW_MS = 15 * 60 * 1000;

/** Hash sha256-hex — dipakai untuk magic token dan nonce cookie OAuth. */
const sha256hex = (s: string): string => createHash('sha256').update(s).digest('hex');

/** Cookie nonce OAuth: mengikat `state` ke browser yang memulai flow (anti login-CSRF —
 *  tanpa ini penyerang bisa menyuapi korban callback dengan code+state miliknya dan korban
 *  masuk sebagai akun penyerang). Path dibatasi /api/auth; cookie dibawa browser sampai ke
 *  provider lalu kembali ke callback (SameSite=Lax → top-level GET boleh). */
const OAUTH_NONCE_COOKIE = 'lakar_oauth_nonce';
const OAUTH_NONCE_MAX_AGE_S = 600;

/** Nilai cookie `name` dari header Cookie (tanpa dep @fastify/cookie — satu cookie ini saja). */
const cookieValue = (req: FastifyRequest, name: string): string | undefined => {
  const header = req.headers.cookie;
  if (header === undefined) return undefined;
  return new RegExp(`(?:^|;\\s*)${name}=([^;\\s]+)`).exec(header)?.[1];
};

/** Session user dari header `authorization: Bearer <token>`; `undefined` = bukan session valid. */
export const sessionOf = (userRepo: UserRepo) => {
  return async (req: FastifyRequest): Promise<User | undefined> => {
    const m = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
    if (!m) return undefined;
    return userRepo.sessionUser(m[1]!);
  };
};

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps): void {
  const { userRepo } = deps;
  const fetchFn: FetchFn = deps.fetchFn ?? ((url, init) => fetch(url, init));
  const getSession = sessionOf(userRepo);
  // OAuth `state` sesaat (spec: "disimpan sesaat di cookie/tabel state") — map in-memory,
  // sekali pakai, kedaluwarsa 10 menit; restart service membatalkan flow yang sedang berjalan.
  // `nonceHash` mengikat state ke cookie browser pemulai flow (anti login-CSRF).
  const states = new Map<string, { provider: OAuthProvider; returnTo: string; nonceHash: string; expiresAt: number }>();
  const magicRate = new Map<string, number[]>();

  /** Buang entry kedaluwarsa dari `states` + `magicRate` — keduanya map nyata yang bisa
   *  membesar tanpa batas. Dipanggil malas saat insert + interval berkala (unref: tidak
   *  menahan proses tetap hidup). */
  const sweepEphemeral = (): void => {
    const now = Date.now();
    for (const [k, v] of states) if (v.expiresAt <= now) states.delete(k);
    for (const [k, v] of magicRate) {
      const kept = v.filter((t) => now - t < MAGIC_WINDOW_MS);
      if (kept.length === 0) magicRate.delete(k);
      else magicRate.set(k, kept);
    }
  };
  setInterval(sweepEphemeral, 5 * 60 * 1000).unref();

  /** Basis redirect_uri OAuth: OAUTH_CALLBACK_BASE > PUBLIC_BASE_URL. Wajib eksplisit —
   *  redirect_uri/callback adalah URL ber-kredensial (code provider kembali ke sini),
   *  jadi JANGAN pernah diturunkan dari header Host/x-forwarded-proto klien. */
  const callbackBase = (): string => {
    const base = deps.oauthCallbackBase ?? deps.publicBaseUrl;
    if (!base) {
      throw new ApiFail(501, 'NOT_SUPPORTED', 'PUBLIC_BASE_URL required for OAuth login', {
        hint: 'set PUBLIC_BASE_URL (atau OAUTH_CALLBACK_BASE) di service; login OAuth butuh redirect_uri publik yang stabil',
      });
    }
    return base.replace(/\/+$/, '');
  };
  const callbackUri = (provider: OAuthProvider): string => `${callbackBase()}/api/auth/oauth/${provider}/callback`;
  /** Basis link verify magic: sama — token ada di QUERY (tampak di log server tujuan),
   *  jadi link email tidak boleh dibentuk dari Host permintaan POST. */
  const publicBase = (): string => {
    if (!deps.publicBaseUrl) {
      throw new ApiFail(501, 'NOT_SUPPORTED', 'PUBLIC_BASE_URL required for email login', {
        hint: 'set PUBLIC_BASE_URL di service; magic link berisi token dan tidak boleh diturunkan dari header Host',
      });
    }
    return deps.publicBaseUrl.replace(/\/+$/, '');
  };
  /** Cookie nonce memakai Secure hanya bila basis publik https (dev http tetap jalan). */
  const secureCookie = (deps.oauthCallbackBase ?? deps.publicBaseUrl)?.startsWith('https') === true;

  const clientOf = (provider: string): { provider: OAuthProvider; client: OAuthClient } => {
    if (!(PROVIDERS as readonly string[]).includes(provider)) throw badRequest(`provider ${provider} tidak dikenal`, `provider yang didukung: ${PROVIDERS.join(', ')}`);
    const client = deps.providers?.[provider as OAuthProvider];
    if (!client) throw notSupported(provider);
    return { provider: provider as OAuthProvider, client };
  };

  const mailer: SendMail =
    deps.sendMail ??
    ((to, subject, html) => {
      // Dev fallback (DEV_MAGIC_LINK=1): link dicetak ke log supaya lokal jalan tanpa provider email.
      app.log.info({ to, subject }, 'lakar-api: magic link (dev fallback, tidak terkirim email)');
      app.log.info(html);
    });

  // Provider yang tersedia = env terkonfigurasi + selalu `email` (magic link).
  app.get('/api/auth/providers', async (_req, reply) => {
    const providers = PROVIDERS.filter((p) => deps.providers?.[p] !== undefined);
    return reply.code(200).send({ ok: true, data: { providers: [...providers, 'email'] } });
  });

  // OAuth start: 302 ke halaman consent provider; state + return_to disimpan sesaat di server,
  // dan nonce acak dikirim sebagai cookie HttpOnly untuk mengikat state ke browser ini.
  app.get<{ Params: { provider: string }; Querystring: { return_to?: string } }>('/api/auth/oauth/:provider/start', async (req, reply) => {
    const { provider, client } = clientOf(req.params.provider);
    const redirect = callbackUri(provider); // melempar 501 bila basis publik tidak dikonfigurasi
    const returnTo = resolveReturnTo(req.query.return_to, deps.publicBaseUrl);
    const state = randomBytes(16).toString('base64url');
    const nonce = randomBytes(16).toString('base64url');
    sweepEphemeral();
    states.set(state, { provider, returnTo, nonceHash: sha256hex(nonce), expiresAt: Date.now() + 10 * 60 * 1000 });
    reply.header('set-cookie', `${OAUTH_NONCE_COOKIE}=${nonce}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=${OAUTH_NONCE_MAX_AGE_S}${secureCookie ? '; Secure' : ''}`);
    return reply.redirect(authorizeUrl(provider, client.clientId, redirect, state));
  });

  // OAuth callback: verifikasi state + cookie nonce → tukar code → upsert user/identity →
  // session → 302 #token. Cookie nonce wajib cocok dengan state (state valid milik flow orang
  // lain tidak bisa "dipakai" browser ini → anti login-CSRF).
  app.get<{ Params: { provider: string }; Querystring: { code?: string; state?: string } }>('/api/auth/oauth/:provider/callback', async (req, reply) => {
    const { provider, client } = clientOf(req.params.provider);
    const redirect = callbackUri(provider); // 501 bila basis publik tidak dikonfigurasi (start pasti juga gagal)
    const { code, state } = req.query;
    const saved = state === undefined ? undefined : states.get(state);
    const nonce = cookieValue(req, OAUTH_NONCE_COOKIE);
    const nonceOk = saved !== undefined && nonce !== undefined && sha256hex(nonce) === saved.nonceHash;
    if (state !== undefined) states.delete(state); // state sekali pakai — salah pun hangus
    if (!code || !saved || saved.expiresAt <= Date.now() || saved.provider !== provider || !nonceOk) {
      throw badRequest('state atau code OAuth tidak valid', 'ulangi sign-in dari awal (GET /api/auth/oauth/:provider/start) di browser yang sama');
    }
    const profile = await oauthExchange(provider, client, code, redirect, fetchFn);
    if (!profile.subject || !profile.email || !profile.emailVerified) {
      throw forbidden(`email ${provider} tidak terverifikasi`, 'pakai akun provider dengan email verified; magic link tersedia lewat POST /api/auth/magic');
    }
    const user = await userRepo.upsertUserIdentity({ provider, subject: profile.subject, email: profile.email, name: profile.name, avatarUrl: profile.avatarUrl });
    const session = await userRepo.createSession(user.id, { ua: req.headers['user-agent'] });
    // Token di fragment: tidak masuk log akses/history server perantara.
    return reply.redirect(`${saved.returnTo}#token=${session.token}`);
  });

  // Magic link: SELALU 200 (anti-enumerasi). Rate limited → tetap 200 tanpa kirim (silent).
  // PUBLIC_BASE_URL wajib: link verify membawa token di query — tidak pernah dibentuk dari Host.
  app.post('/api/auth/magic', async (req, reply) => {
    const base = publicBase(); // 501 NOT_SUPPORTED bila PUBLIC_BASE_URL belum diset
    const parsed = MagicBody.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), MAGIC_HINT);
    const { email } = parsed.data;
    // return_to tak valid diabaikan diam-diam (bukan error — respons tetap identik).
    const returnTo = parsed.data.return_to !== undefined && returnToAllowed(parsed.data.return_to, deps.publicBaseUrl) ? parsed.data.return_to : undefined;
    const now = Date.now();
    sweepEphemeral();
    /** Bucket rate limit yang sudah dipangkas ke jendela aktif (tersimpan kembali ke map). */
    const bucket = (key: string): number[] => {
      const hits = (magicRate.get(key) ?? []).filter((t) => now - t < MAGIC_WINDOW_MS);
      magicRate.set(key, hits);
      return hits;
    };
    const lower = email.toLowerCase();
    const perEmail = bucket(`e|${lower}`);
    const perIpEmail = bucket(`${req.ip}|${lower}`);
    if (perEmail.length >= MAGIC_LIMIT || perIpEmail.length >= MAGIC_LIMIT) return reply.code(200).send({ ok: true, data: { sent: true } });
    perEmail.push(now);
    perIpEmail.push(now);
    const token = randomBytes(32).toString('base64url');
    await userRepo.createMagicToken(email, sha256hex(token), new Date(now + (deps.magicTtlMs ?? MAGIC_TOKEN_TTL_MS)));
    const verify = new URL(`${base}/api/auth/magic/verify`);
    verify.searchParams.set('token', token);
    if (returnTo !== undefined) verify.searchParams.set('return_to', returnTo);
    try {
      await mailer(email, 'Your Lakar sign-in link', `<p>Sign in to Lakar:</p><p><a href="${verify.toString().replaceAll('&', '&amp;')}">${verify.toString()}</a></p><p>This link expires in 15 minutes and can be used once.</p>`);
    } catch (e) {
      // Kegagalan mailer tidak membocorkan apa pun ke klien — respons tetap 200.
      req.log.warn(e, 'lakar-api: pengiriman magic link gagal');
    }
    return reply.code(200).send({ ok: true, data: { sent: true } });
  });

  // Verifikasi magic link: token sekali pakai → user + session → 302 `return_to#token=`.
  app.get<{ Querystring: { token?: string; return_to?: string } }>('/api/auth/magic/verify', async (req, reply) => {
    const { token } = req.query;
    if (!token) throw badRequest('token magic link tidak ada', 'pakai link dari email sign-in');
    // Validasi return_to SEBELUM consume: link hasil craft dengan return_to jahat tidak boleh
    // menghanguskan token satu kali pakai milik pemilik email.
    const returnTo = resolveReturnTo(req.query.return_to, deps.publicBaseUrl);
    const email = await userRepo.consumeMagicToken(sha256hex(token));
    if (email === undefined) throw unauthorized('magic link tidak valid, sudah dipakai, atau kedaluwarsa');
    // Magic link = bukti kepemilikan email → identity provider 'email' dengan subject = email.
    const user = await userRepo.upsertUserIdentity({ provider: 'email', subject: email, email });
    const session = await userRepo.createSession(user.id, { ua: req.headers['user-agent'] });
    return reply.redirect(`${returnTo}#token=${session.token}`);
  });

  // `GET /api/auth/me` — profil akun pemilik Bearer session.
  app.get('/api/auth/me', async (req, reply) => {
    const user = await getSession(req);
    if (!user) throw unauthorized();
    return reply.code(200).send({ ok: true, data: { user } });
  });

  // `DELETE /api/auth/session` — logout: cabut session Bearer yang dikirim (idempoten → 204).
  app.delete('/api/auth/session', async (req, reply) => {
    const m = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
    if (!m) throw unauthorized();
    await userRepo.revokeSession(m[1]!);
    return reply.code(204).send();
  });
}

/** Mailer Resend (produksi): `POST https://api.resend.com/emails` Bearer — tanpa dep baru. */
export const resendMailer =
  (apiKey: string, from: string, fetchFn: FetchFn = (url, init) => fetch(url, init)): SendMail =>
  async (to, subject, html) => {
    const res = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`resend menjawab HTTP ${res.status}`);
  };
