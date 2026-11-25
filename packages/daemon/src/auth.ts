// Route sign-in cloud lakard (spec-cloud-auth story C): `/viewer/auth/*` di bawah guard Origin
// `/viewer/*` otomatis (POST/DELETE tanpa Origin sesama daemon ditolak). Alur OAuth/magic:
// `start` membalas URL di service dengan `return_to` = callback loopback daemon ini + nonce
// `?state=` sekali-pakai (anti session-fixation: POST /viewer/auth/session hanya sah lewat
// alur start — POST langsung tanpa state pending ditolak, itulah tujuannya); service meng-302
// ke `return_to#token=<session>` — fragment tidak pernah sampai ke server, jadi HTML callback
// membawa script kecil yang membaca `location.hash`+`location.search`, membersihkan URL bar
// (replaceState), lalu POST {token,state} ke `/viewer/auth/session` (same-origin). Daemon
// memvalidasi nonce + token itu ke `GET /api/auth/me` (token opaque — tidak pernah diverifikasi
// lokal, tidak pernah dicatat) lalu menyimpan session.json (0600). Sign-in/out memancarkan
// event `auth` di stream `/viewer/events`.
import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { LakarError, errorMessage } from '@lakar/schema';
import { z } from 'zod';
import type { ActivityBus } from './events.js';
import { CLOUD_AUTH_TIMEOUT_MS, SessionStore, cloudBase, cloudProviders, cloudUserOf } from './session.js';

export type AuthRoutesOptions = {
  /** Store session `dataDir/session.json`. */
  store: SessionStore;
  /** Sumber konfigurasi cloud (default `process.env`); untuk tes. */
  env?: NodeJS.ProcessEnv;
  /** Fetch ke service (default `fetch` global); untuk tes. */
  fetchFn?: typeof fetch;
  /** Bus SSE untuk event `auth` (sign-in/out) — viewer memuat ulang blok Lakar Cloud. */
  activity?: ActivityBus;
  /** Port loopback daemon untuk `return_to` callback (fungsi: port bisa 0 di config sampai listen). */
  port: () => number;
};

const StartBody = z
  .object({
    provider: z.enum(['google', 'github', 'email']),
    email: z.email().optional(),
    return_to: z.string().min(1).optional(),
  })
  .strict();
const START_HINT = 'kirim {provider:"google"|"github"} atau {provider:"email", email}; return_to opsional (default callback lakard)';
const SessionBody = z.object({ token: z.string().min(1), state: z.string().min(1) }).strict();

const cloudMissing = () =>
  new LakarError('EXPORT_FAILED', 'LAKAR_CLOUD_URL tidak diset', {
    hint: 'set LAKAR_CLOUD_URL ke service @lakar/api lalu coba lagi; sign-in cloud butuh service itu',
  });

const CALLBACK_PATH = '/viewer/auth/callback';
const callbackUrl = (port: number) => `http://127.0.0.1:${port}${CALLBACK_PATH}`;

/**
 * `return_to` hanya boleh callback daemon ini PERSIS (host loopback + port terikat + path) —
 * bukan sembarang URL loopback. Loopback lain membiarkan proses lokal jahat meminta `{url}` yang
 * meng-302 browser ke portnya sendiri dan mencuri `#token` (open-redirect). `localhost` =
 * padanan 127.0.0.1. Query/hash pemanggil diabaikan — URL selalu dibangun ulang kanonik.
 */
const isDaemonCallback = (raw: string, port: number): boolean => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (url.origin === `http://127.0.0.1:${port}` || url.origin === `http://localhost:${port}`) && url.pathname === CALLBACK_PATH;
};

const resolveReturnTo = (raw: string | undefined, port: number): string => {
  if (raw !== undefined && !isDaemonCallback(raw, port)) {
    throw new LakarError('SCHEMA_INVALID', `return_to ${JSON.stringify(raw)} tidak diizinkan`, {
      hint: `kosongkan return_to (default callback lakard), atau pakai persis ${callbackUrl(port)}`,
    });
  }
  return callbackUrl(port);
};

type CloudReply = { status: number; ok: boolean; data: Record<string, unknown> | undefined; message?: string };

/**
 * Panggil JSON ke service auth `${base}<path>` dengan timeout. Error jaringan → EXPORT_FAILED
 * retryable; respons non-ok dikembalikan apa adanya (pemutus ada di route: 401 → UNAUTHORIZED,
 * sisanya → EXPORT_FAILED dengan pesan service). Token tidak pernah ikut pesan/hint.
 */
async function call(
  { fetchFn = fetch }: Pick<AuthRoutesOptions, 'fetchFn'>,
  base: string,
  path: string,
  init: { method: string; body?: string; authorization?: string },
): Promise<CloudReply> {
  let res: Response;
  try {
    res = await fetchFn(`${base}${path}`, {
      method: init.method,
      headers: { 'content-type': 'application/json', ...(init.authorization ? { authorization: init.authorization } : {}) },
      ...(init.body !== undefined ? { body: init.body } : {}),
      signal: AbortSignal.timeout(CLOUD_AUTH_TIMEOUT_MS),
    });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    throw new LakarError(
      'EXPORT_FAILED',
      timeout ? `service auth ${base} tidak merespons dalam ${CLOUD_AUTH_TIMEOUT_MS / 1000} detik` : `service auth ${base} tidak bisa dihubungi: ${errorMessage(e)}`,
      { hint: 'periksa service @lakar/api dan LAKAR_CLOUD_URL, lalu coba lagi', retryable: true },
    );
  }
  let payload: { ok?: boolean; data?: Record<string, unknown>; error?: { message?: string } };
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    payload = {};
  }
  return { status: res.status, ok: res.ok && payload.ok === true, data: payload.data, ...(payload.error?.message ? { message: payload.error.message } : {}) };
}

/** Error route untuk respons service non-ok yang bukan 401. */
const rejected = (what: string, r: CloudReply) =>
  new LakarError('EXPORT_FAILED', `service auth menolak ${what}: ${r.message ?? `HTTP ${r.status}`}`, {
    hint: 'periksa log service @lakar/api, lalu coba lagi',
    retryable: r.status >= 500,
  });

/**
 * HTML callback OAuth/magic (~30 baris): token tiba di `#token=` (fragment — tidak sampai server),
 * nonce pengikat di `?state=` (query). Script membaca keduanya, segera `replaceState` supaya
 * token tidak tertinggal di URL bar/history/screenshot, lalu POST {token,state} ke
 * `/viewer/auth/session` same-origin dan menampilkan status. Tanpa JS sign-in tidak bisa
 * diselesaikan manual (state tidak boleh dititipkan). Token tidak pernah ditulis ke markup/log.
 */
const callbackHtml = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lakar sign-in</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 3rem auto; max-width: 26rem; padding: 0 1rem; color: #222; }
  p { line-height: 1.5; }
</style>
<p id="m">Signing in…</p>
<noscript><p>JavaScript is off — sign-in cannot be completed without it. Restart sign-in from Lakar.</p></noscript>
<script>
var m = document.getElementById('m');
var t = new URLSearchParams(location.hash.slice(1)).get('token');
var s = new URLSearchParams(location.search).get('state');
// Bersihkan token+state dari URL bar secepat mungkin — jangan tertinggal di history/screenshot.
history.replaceState(null, '', location.pathname);
if (!t || !s) {
  m.textContent = 'Sign-in failed: this link is incomplete. Restart sign-in from Lakar.';
} else {
  fetch('/viewer/auth/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: t, state: s }) })
    .then(function (r) {
      m.textContent = r.ok ? 'Signed in — you can close this tab.' : 'Sign-in failed: the session was rejected. Restart sign-in from Lakar.';
    })
    .catch(function () {
      m.textContent = 'Sign-in failed: lakard is unreachable. Try again or restart sign-in from Lakar.';
    });
}
</script>`;

export function registerAuthRoutes(app: FastifyInstance, opts: AuthRoutesOptions): void {
  const { store } = opts;
  const env = () => opts.env ?? process.env;
  const fetchFn = () => opts.fetchFn ?? fetch;

  // Nonce sekali-pakai pengikat sign-in (anti session-fixation): `start` mencetak dan menyelipkan
  // di `return_to?state=`; script callback meng-echo; `/viewer/auth/session` mengkonsumsi (hapus —
  // replay/state asing → 401). TTL ~10 menit, disapu malas di tiap akses — tanpa timer.
  const NONCE_TTL_MS = 10 * 60 * 1000;
  const pending = new Map<string, number>();
  const sweep = () => {
    const now = Date.now();
    for (const [nonce, exp] of pending) if (exp <= now) pending.delete(nonce);
  };
  const mintNonce = (): string => {
    sweep();
    const nonce = randomBytes(24).toString('base64url');
    pending.set(nonce, Date.now() + NONCE_TTL_MS);
    return nonce;
  };
  /** Konsumsi nonce: ada & belum kedaluwarsa → true (langsung dihapus — sekali pakai); else false. */
  const consumeNonce = (nonce: string): boolean => {
    sweep();
    const exp = pending.get(nonce);
    if (exp === undefined) return false;
    pending.delete(nonce);
    return exp > Date.now();
  };

  // Cache pendek `/api/auth/providers` (~30s, per base): `/viewer/auth/status` dipanggil viewer
  // tiap render blok Lakar Cloud — tanpa cache setiap panggil memukul service (timeout 15s saat
  // service lambat). Hanya keberhasilan yang dicache — kegagalan dicoba ulang di panggil berikut.
  const PROVIDERS_TTL_MS = 30_000;
  let providersCache: { base: string; providers: string[]; at: number } | undefined;
  const cachedProviders = async (base: string): Promise<string[]> => {
    const hit = providersCache;
    if (hit && hit.base === base && Date.now() - hit.at < PROVIDERS_TTL_MS) return hit.providers;
    const providers = await cloudProviders(fetchFn(), base);
    providersCache = { base, providers, at: Date.now() };
    return providers;
  };

  // `GET /viewer/auth/status` → status jujur: `configured` = cloud URL diset; `host` = host service
  // (aditif — viewer menampilkannya di blok Lakar Cloud); `user` dari session.json (cache — tidak
  // memanggil service); `providers` best-effort bila service menjawab.
  app.get('/viewer/auth/status', async (_req, reply) => {
    const base = cloudBase(env());
    const session = await store.load();
    let providers: string[] | undefined;
    if (base) {
      try {
        providers = await cachedProviders(base);
      } catch {
        // Service tak terjangkau: providers tidak diketahui — field dihilangkan, bukan dibohongi.
      }
    }
    // `host` aditif untuk tampilan viewer; LAKAR_CLOUD_URL tanpa skema (bukan URL valid) → field dihilangkan.
    let host: string | undefined;
    if (base) {
      try {
        host = new URL(base).host;
      } catch {
        host = undefined;
      }
    }
    return reply.code(200).send({
      ok: true,
      data: { signedIn: session !== undefined, configured: base !== undefined, ...(host ? { host } : {}), ...(session ? { user: session.user } : {}), ...(providers ? { providers } : {}) },
    });
  });

  // `POST /viewer/auth/start` → `{url}` OAuth (viewer membukanya di browser sistem) atau `{sent}`
  // untuk magic link email. `return_to` hanya boleh callback daemon ini sendiri (anti
  // open-redirect) dan selalu membawa `?state=` nonce sekali-pakai. Provider — termasuk `email` —
  // divalidasi dulu ke `/api/auth/providers` — fail-closed bila service tidak mengiklankannya
  // (env provider belum diset di sana).
  app.post('/viewer/auth/start', async (req, reply) => {
    const r = StartBody.safeParse(req.body ?? {});
    if (!r.success) {
      throw new LakarError('SCHEMA_INVALID', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: START_HINT });
    }
    const body = r.data;
    const base = cloudBase(env());
    if (!base) throw cloudMissing();
    if (body.provider === 'email' && !body.email) {
      throw new LakarError('SCHEMA_INVALID', 'email wajib untuk provider "email"', { hint: START_HINT });
    }
    const returnTo = `${resolveReturnTo(body.return_to, opts.port())}?state=${mintNonce()}`;
    const providers = await cloudProviders(fetchFn(), base);
    if (!providers.includes(body.provider)) {
      throw new LakarError('SCHEMA_INVALID', `provider ${body.provider} tidak tersedia di service`, {
        hint: `provider yang diiklankan service: ${providers.join(', ') || '(tidak ada)'} — periksa env OAuth di @lakar/api`,
      });
    }
    if (body.provider === 'email') {
      const res = await call(opts, base, '/api/auth/magic', { method: 'POST', body: JSON.stringify({ email: body.email, return_to: returnTo }) });
      if (!res.ok) throw rejected('magic link', res);
      return reply.code(200).send({ ok: true, data: { sent: true } });
    }
    return reply.code(200).send({ ok: true, data: { url: `${base}/api/auth/oauth/${body.provider}/start?return_to=${encodeURIComponent(returnTo)}` } });
  });

  // `GET /viewer/auth/callback` — target redirect service (`return_to#token=`). GET baca-saja:
  // guard Origin tidak berlaku, dan CSP ketat (script inline kecil → 'unsafe-inline' script-src).
  app.get('/viewer/auth/callback', async (_req, reply) => {
    return reply
      .type('text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      .header('content-security-policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'")
      .send(callbackHtml);
  });

  // `POST /viewer/auth/session {token,state}` (internal — dari script callback): `state` harus
  // nonce pending hasil `start` (sekali pakai — replay/state asing → 401). Fail-closed: POST
  // langsung tanpa lewat `start` tidak mungkin diterima; itulah tujuannya — proses lokal lain
  // tidak bisa menitipkan session akunnya (session fixation). Setelah nonce cocok, token
  // divalidasi ke `GET /api/auth/me` → simpan session.json 0600 → event `auth`. Token invalid →
  // 401 UNAUTHORIZED (token tidak pernah dicatat di pesan error).
  app.post('/viewer/auth/session', async (req, reply) => {
    const r = SessionBody.safeParse(req.body ?? {});
    if (!r.success) {
      throw new LakarError('SCHEMA_INVALID', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: 'kirim {token,state} — pasangan dari callback sign-in; POST langsung tanpa start tidak diterima' });
    }
    if (!consumeNonce(r.data.state)) {
      return reply.code(401).send({ ok: false, error: { code: 'UNAUTHORIZED', message: 'state sign-in tidak dikenal atau sudah dipakai', hint: 'ulangi sign-in dari aplikasi Lakar — /viewer/auth/session hanya sah lewat callback dari /viewer/auth/start', retryable: false } });
    }
    const base = cloudBase(env());
    if (!base) throw cloudMissing();
    const res = await call(opts, base, '/api/auth/me', { method: 'GET', authorization: `Bearer ${r.data.token}` });
    if (res.status === 401) {
      return reply.code(401).send({ ok: false, error: { code: 'UNAUTHORIZED', message: 'session tidak valid atau kedaluwarsa', hint: 'ulangi sign-in dari aplikasi Lakar', retryable: false } });
    }
    if (!res.ok) throw rejected('validasi session', res);
    const user = cloudUserOf(res.data?.user);
    if (!user) {
      throw new LakarError('EXPORT_FAILED', 'service auth menjawab /api/auth/me tanpa profil user', { hint: 'periksa versi service @lakar/api, lalu coba lagi', retryable: true });
    }
    await store.save({ token: r.data.token, user });
    opts.activity?.auth({ signedIn: true, user });
    return reply.code(200).send({ ok: true, data: { signedIn: true, user } });
  });

  // `POST /viewer/auth/logout` → cabut session di service (best-effort) + hapus session.json +
  // event `auth`. Idempoten: tanpa session pun 200.
  app.post('/viewer/auth/logout', async (_req, reply) => {
    const session = await store.load();
    const base = cloudBase(env());
    if (session && base) {
      // Best-effort: service down/session sudah dicabut tidak boleh menggagalkan logout lokal.
      try {
        await fetchFn()(`${base}/api/auth/session`, { method: 'DELETE', headers: { authorization: `Bearer ${session.token}` }, signal: AbortSignal.timeout(CLOUD_AUTH_TIMEOUT_MS) });
      } catch {
        // diabaikan — session lokal tetap dihapus
      }
    }
    await store.clear();
    opts.activity?.auth({ signedIn: false });
    return reply.code(200).send({ ok: true, data: { signedIn: false } });
  });
}
