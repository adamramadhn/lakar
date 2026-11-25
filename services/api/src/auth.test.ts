// Tes route auth @lakar/api (spec-cloud-auth story A) dengan MemoryShareRepo+MemoryUserRepo:
// providers, OAuth google/github lewat fetchFn mock (tanpa jaringan), magic link e2e lewat
// sendMail tangkap-link, /me + logout, dan scoping owner shares. Integrasi Pg ada di pg.test.ts.
import { describe, expect, it } from 'vitest';
import { createDocument } from '@lakar/core';
import { buildApi } from './app.js';
import { MemoryShareRepo, MemoryUserRepo } from './repo.js';
import type { AuthDeps, FetchFn } from './auth.js';

const KEY = 'test-key';
const AUTH = { authorization: `Bearer ${KEY}` };
const PUBLIC = 'https://share.example';
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const shareBody = () => ({
  title: 'My Landing',
  doc: createDocument(),
  boards: [{ id: 'b1', name: 'Board 1', x: 0, y: 0, w: 390, h: 844, pngB64: PNG_B64 }],
  permissions: { comment: true, download: true },
});

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Sent = { to: string; subject: string; html: string };

/** `baseUrl` null = service tanpa PUBLIC_BASE_URL (URL ber-kredensial tidak boleh dibentuk). */
function setup(auth: Partial<AuthDeps> = {}, baseUrl: string | null = PUBLIC) {
  const repo = new MemoryShareRepo();
  const userRepo = new MemoryUserRepo();
  const sent: Sent[] = [];
  const app = buildApi({
    repo,
    apiKey: KEY,
    ...(baseUrl !== null ? { publicBaseUrl: baseUrl } : {}),
    auth: {
      userRepo,
      providers: { google: { clientId: 'g-id', clientSecret: 'g-secret' }, github: { clientId: 'gh-id', clientSecret: 'gh-secret' } },
      sendMail: (to, subject, html) => {
        sent.push({ to, subject, html });
      },
      ...auth,
    },
  });
  const get = (url: string, headers: Record<string, string> = {}) => app.inject({ method: 'GET', url, headers });
  const post = (url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url, ...(payload !== undefined ? { payload: payload as object } : {}), headers });
  const patch = (url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method: 'PATCH', url, ...(payload !== undefined ? { payload: payload as object } : {}), headers });
  const del = (url: string, headers: Record<string, string> = {}) => app.inject({ method: 'DELETE', url, headers });
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  /** Sign in lewat magic link penuh (POST → tangkap token dari email → verify) → session token. */
  const signIn = async (email: string, returnTo = 'http://localhost:7466/viewer/auth/callback'): Promise<string> => {
    const r = await post('/api/auth/magic', { email, return_to: returnTo });
    expect(r.statusCode).toBe(200);
    const html = sent.at(-1)!.html;
    const token = /token=([A-Za-z0-9_-]+)/.exec(html)![1]!;
    const v = await get(`/api/auth/magic/verify?token=${token}&return_to=${encodeURIComponent(returnTo)}`);
    expect(v.statusCode, v.body).toBe(302);
    return /#token=(\S+)$/.exec(String(v.headers.location))![1]!;
  };
  /** OAuth /start → {state, cookie}: cookie nonce wajib dibawa ke callback (anti login-CSRF). */
  const oauthStart = async (provider: string, returnTo: string) => {
    const st = await get(`/api/auth/oauth/${provider}/start?return_to=${encodeURIComponent(returnTo)}`);
    expect(st.statusCode, st.body).toBe(302);
    const location = new URL(String(st.headers.location));
    const setCookie = String(st.headers['set-cookie'] ?? '');
    const cookie = /lakar_oauth_nonce=[^;\s]+/.exec(setCookie)![0]!;
    return { state: location.searchParams.get('state')!, cookie, location, setCookie };
  };
  return { repo, userRepo, sent, app, get, post, patch, del, bearer, signIn, oauthStart };
}

describe('GET /api/auth/providers', () => {
  it('provider env terkonfigurasi + selalu email; tanpa provider → hanya email', async () => {
    const t = setup();
    expect((await t.get('/api/auth/providers')).json().data.providers).toEqual(['google', 'github', 'email']);
    const bare = setup({ providers: {} });
    expect((await bare.get('/api/auth/providers')).json().data.providers).toEqual(['email']);
  });
});

describe('magic link', () => {
  it('POST → 200 + email terkirim; verify → 302 return_to#token; me → user; token kedua kali → 401', async () => {
    const t = setup();
    const session = await t.signIn('ada@contoh.id');
    const me = await t.get('/api/auth/me', t.bearer(session));
    expect(me.statusCode).toBe(200);
    expect(me.json().data.user).toMatchObject({ email: 'ada@contoh.id' });
    expect(t.sent[0]!.to).toBe('ada@contoh.id');
    // Link hanya sekali pakai: verify token yang sama lagi → 401.
    const token = /token=([A-Za-z0-9_-]+)/.exec(t.sent[0]!.html)![1]!;
    const again = await t.get(`/api/auth/magic/verify?token=${token}&return_to=${encodeURIComponent('http://localhost:7466/viewer/auth/callback')}`);
    expect(again.statusCode).toBe(401);
    expect(again.json().error.code).toBe('UNAUTHORIZED');
  });

  it('POST selalu 200 (anti-enumerasi); token tak dikenal → verify 401; return_to jahat → verify 400 tanpa membakar token', async () => {
    const t = setup();
    expect((await t.post('/api/auth/magic', { email: 'x@y.zz' })).statusCode).toBe(200);
    expect(t.sent).toHaveLength(1);
    expect((await t.get('/api/auth/magic/verify?token=ngasal&return_to=http://localhost:1/')).statusCode).toBe(401);
    // return_to di luar allowlist → 400; token yang sah belum terpakai (bisa verify ulang benar).
    const token = /token=([A-Za-z0-9_-]+)/.exec(t.sent[0]!.html)![1]!;
    const evil = await t.get(`/api/auth/magic/verify?token=${token}&return_to=${encodeURIComponent('https://evil.example/cb')}`);
    expect(evil.statusCode).toBe(400);
    const ok = await t.get(`/api/auth/magic/verify?token=${token}&return_to=${encodeURIComponent(`${PUBLIC}/cb`)}`);
    expect(ok.statusCode).toBe(302);
  });

  it('rate limit 5/15 mnt per email → respons tetap 200 tapi email berhenti dikirim (silent)', async () => {
    const t = setup();
    for (let i = 0; i < 7; i++) {
      const r = await t.post('/api/auth/magic', { email: 'spam@x.test', return_to: 'http://127.0.0.1:1/cb' });
      expect(r.statusCode).toBe(200);
    }
    expect(t.sent).toHaveLength(5);
    // Email beda → bucket beda, tetap terkirim.
    await t.post('/api/auth/magic', { email: 'lain@x.test', return_to: 'http://127.0.0.1:1/cb' });
    expect(t.sent).toHaveLength(6);
  });
});

describe('session (me + logout)', () => {
  it('me tanpa Bearer / token ngawur → 401; logout → 204 lalu me 401; logout tanpa Bearer → 401', async () => {
    const t = setup();
    expect((await t.get('/api/auth/me')).statusCode).toBe(401);
    expect((await t.get('/api/auth/me', t.bearer('bukan-session'))).statusCode).toBe(401);
    const session = await t.signIn('me@x.test');
    expect((await t.get('/api/auth/me', t.bearer(session))).statusCode).toBe(200);
    expect((await t.del('/api/auth/session')).statusCode).toBe(401);
    expect((await t.del('/api/auth/session', t.bearer(session))).statusCode).toBe(204);
    expect((await t.get('/api/auth/me', t.bearer(session))).statusCode).toBe(401);
  });

  it('login magic dengan email yang sama → user yang sama (identity provider email)', async () => {
    const t = setup();
    const s1 = await t.signIn('Sama@X.Test');
    const s2 = await t.signIn('sama@x.test');
    const u1 = (await t.get('/api/auth/me', t.bearer(s1))).json().data.user;
    const u2 = (await t.get('/api/auth/me', t.bearer(s2))).json().data.user;
    expect(u1.id).toBe(u2.id);
  });
});

const googleFetch = (profile: Record<string, unknown>): FetchFn => async (url) => {
  const u = String(url);
  if (u.includes('oauth2.googleapis.com/token')) return jsonRes({ access_token: 'g-tok' });
  if (u.includes('openidconnect.googleapis.com')) return jsonRes(profile);
  throw new Error(`fetch tak terduga: ${u}`);
};

describe('OAuth google', () => {
  it('start → 302 consent URL + cookie nonce; callback (cookie + fetch mock) → 302 return_to#token → me OK', async () => {
    const t = setup({ fetchFn: googleFetch({ sub: 'g-1', email: 'u@x.com', name: 'User Satu', picture: 'https://p/x', email_verified: true }) });
    const { state, cookie, location: authUrl, setCookie } = await t.oauthStart('google', 'http://localhost:7466/viewer/auth/callback');
    expect(authUrl.origin + authUrl.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(authUrl.searchParams.get('client_id')).toBe('g-id');
    expect(authUrl.searchParams.get('redirect_uri')).toBe(`${PUBLIC}/api/auth/oauth/google/callback`);
    // Cookie pengikat state: HttpOnly + SameSite=Lax + Path=/api/auth + Secure (basis https).
    expect(setCookie).toMatch(/lakar_oauth_nonce=[^;\s]+; Path=\/api\/auth; HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
    const cb = await t.get(`/api/auth/oauth/google/callback?code=kode&state=${state}`, { cookie });
    expect(cb.statusCode, cb.body).toBe(302);
    const loc = String(cb.headers.location);
    expect(loc).toMatch(/^http:\/\/localhost:7466\/viewer\/auth\/callback#token=[A-Za-z0-9_-]+$/);
    const session = /#token=(\S+)$/.exec(loc)![1]!;
    const me = (await t.get('/api/auth/me', t.bearer(session))).json().data.user;
    expect(me).toMatchObject({ email: 'u@x.com', name: 'User Satu', avatarUrl: 'https://p/x' });
  });

  it('state salah/hangus → 400; provider tak dikonfigurasi → 501; email unverified → 403', async () => {
    const t = setup({ fetchFn: googleFetch({ sub: 'g-2', email: 'u@x.com', email_verified: true }) });
    expect((await t.get('/api/auth/oauth/google/callback?code=c&state=salah')).statusCode).toBe(400);
    // Provider env kosong → 501 NOT_SUPPORTED pada start dan callback.
    const bare = setup({ providers: {} });
    expect((await bare.get('/api/auth/oauth/github/start?return_to=http://localhost:1/')).statusCode).toBe(501);
    expect((await bare.get('/api/auth/oauth/github/callback?code=c&state=s')).statusCode).toBe(501);
    // Provider tak dikenal sama sekali → 400.
    expect((await t.get('/api/auth/oauth/linkedin/start?return_to=http://localhost:1/')).statusCode).toBe(400);
    // Email provider tidak verified → 403 (tidak boleh auto-link).
    const unv = setup({ fetchFn: googleFetch({ sub: 'g-3', email: 'u@x.com', email_verified: false }) });
    const { state, cookie } = await unv.oauthStart('google', 'http://localhost:9/cb');
    expect((await unv.get(`/api/auth/oauth/google/callback?code=c&state=${state}`, { cookie })).statusCode).toBe(403);
  });

  it('return_to di luar allowlist → 400 di start (anti open-redirect)', async () => {
    const t = setup();
    for (const bad of [
      'https://evil.example/cb',
      'javascript:alert(1)',
      'http://127.0.0.1.evil.com/',
      // Prefix-domain jahat: startsWith(PUBLIC_BASE_URL) polos dulu meloloskan ini
      // (open redirect — token #fragment terbaca JS penyerang).
      `${PUBLIC}.evil.com/cb`,
      `${PUBLIC}.evil.com/`,
      `${PUBLIC}@evil.com/`,
      `${PUBLIC}-phish.net/`,
    ]) {
      expect((await t.get(`/api/auth/oauth/google/start?return_to=${encodeURIComponent(bad)}`)).statusCode, bad).toBe(400);
    }
    for (const good of ['http://127.0.0.1:7466/x', 'http://localhost:5173/', PUBLIC, `${PUBLIC}/`, `${PUBLIC}/cb`]) {
      expect((await t.get(`/api/auth/oauth/google/start?return_to=${encodeURIComponent(good)}`)).statusCode, good).toBe(302);
    }
  });

  it('cookie nonce: callback tanpa cookie / cookie salah → 400 (state sah milik flow lain tidak bisa dibajak — login CSRF)', async () => {
    const t = setup({ fetchFn: googleFetch({ sub: 'g-csrf', email: 'v@x.com', email_verified: true }) });
    // Callback tanpa header Cookie → 400.
    const s1 = await t.oauthStart('google', 'http://localhost:7466/cb');
    expect((await t.get(`/api/auth/oauth/google/callback?code=c&state=${s1.state}`)).statusCode).toBe(400);
    // Cookie nonce berbeda dari yang di-set server → 400 (state juga hangus).
    const s2 = await t.oauthStart('google', 'http://localhost:7466/cb');
    expect((await t.get(`/api/auth/oauth/google/callback?code=c&state=${s2.state}`, { cookie: 'lakar_oauth_nonce=ngawur' })).statusCode).toBe(400);
    // State milik flow browser A tidak bisa dipakai dengan cookie flow browser B.
    const s3a = await t.oauthStart('google', 'http://localhost:7466/cb');
    const s3b = await t.oauthStart('google', 'http://localhost:7466/cb');
    expect((await t.get(`/api/auth/oauth/google/callback?code=c&state=${s3a.state}`, { cookie: s3b.cookie })).statusCode).toBe(400);
    // Flow penuh dengan pasangan state+cookie yang benar → 302.
    const { state, cookie } = await t.oauthStart('google', 'http://localhost:7466/cb');
    expect((await t.get(`/api/auth/oauth/google/callback?code=c&state=${state}`, { cookie })).statusCode).toBe(302);
  });

  it('provider OAuth menjawab non-2xx → 502 UPSTREAM retryable (bukan 401)', async () => {
    const fetchFn: FetchFn = async (url) => {
      if (String(url).includes('oauth2.googleapis.com/token')) return jsonRes({ error: 'upstream sibuk' }, 500);
      throw new Error('fetch tak terduga');
    };
    const t = setup({ fetchFn });
    const { state, cookie } = await t.oauthStart('google', 'http://localhost:7466/cb');
    const cb = await t.get(`/api/auth/oauth/google/callback?code=c&state=${state}`, { cookie });
    expect(cb.statusCode, cb.body).toBe(502);
    expect(cb.json().error.code).toBe('UPSTREAM');
    expect(cb.json().error.retryable).toBe(true);
  });
});

describe('OAuth github', () => {
  it('code → user + /user/emails (primary+verified); subject = id github; link-by-email dengan user lama', async () => {
    const fetchFn: FetchFn = async (url) => {
      const u = String(url);
      if (u.includes('login/oauth/access_token')) return jsonRes({ access_token: 'gh-tok' });
      if (u.endsWith('api.github.com/user')) return jsonRes({ id: 4242, name: 'GH User', avatar_url: 'https://a/x' });
      if (u.endsWith('api.github.com/user/emails')) return jsonRes([{ email: 'lain@x.com', primary: false, verified: true }, { email: 'gh@x.com', primary: true, verified: true }]);
      throw new Error(`fetch tak terduga: ${u}`);
    };
    const t = setup({ fetchFn });
    // User lama via magic dengan email sama → login github me-link ke user yang sama.
    const sMagic = await t.signIn('gh@x.com');
    const { state, cookie, location: loc } = await t.oauthStart('github', 'http://localhost:7466/cb');
    expect(loc.origin + loc.pathname).toBe('https://github.com/login/oauth/authorize');
    const cb = await t.get(`/api/auth/oauth/github/callback?code=kode&state=${state}`, { cookie });
    expect(cb.statusCode, cb.body).toBe(302);
    const sGh = /#token=(\S+)$/.exec(String(cb.headers.location))![1]!;
    const uMagic = (await t.get('/api/auth/me', t.bearer(sMagic))).json().data.user;
    const uGh = (await t.get('/api/auth/me', t.bearer(sGh))).json().data.user;
    expect(uGh.id).toBe(uMagic.id);
    expect(uGh).toMatchObject({ email: 'gh@x.com', name: 'GH User' });
  });

  it('tanpa email primary+verified → 403', async () => {
    const fetchFn: FetchFn = async (url) => {
      const u = String(url);
      if (u.includes('login/oauth/access_token')) return jsonRes({ access_token: 'gh-tok' });
      if (u.endsWith('api.github.com/user')) return jsonRes({ id: 7 });
      if (u.endsWith('api.github.com/user/emails')) return jsonRes([{ email: 'x@y.zz', primary: true, verified: false }]);
      throw new Error(`fetch tak terduga: ${u}`);
    };
    const t = setup({ fetchFn });
    const { state, cookie } = await t.oauthStart('github', 'http://localhost:9/cb');
    const cb = await t.get(`/api/auth/oauth/github/callback?code=c&state=${state}`, { cookie });
    expect(cb.statusCode).toBe(403);
  });
});

describe('ownership shares (session vs admin key)', () => {
  it('create via session → owner_id user; list session hanya miliknya; user lain PATCH/DELETE → 403; admin key tetap penuh', async () => {
    const t = setup();
    const sA = await t.signIn('a@x.test');
    const sB = await t.signIn('b@x.test');
    // User A membuat share via session.
    const made = await t.post('/api/shares', shareBody(), t.bearer(sA));
    expect(made.statusCode, made.body).toBe(200);
    const token = made.json().data.token;
    // List: A melihat miliknya; B kosong; admin melihat semua.
    expect((await t.get('/api/shares', t.bearer(sA))).json().data.shares.map((x: { token: string }) => x.token)).toEqual([token]);
    expect((await t.get('/api/shares', t.bearer(sB))).json().data.shares).toEqual([]);
    // User lain → 403 pada PATCH/PUT/DELETE; dirinya sendiri → boleh.
    expect((await t.patch(`/api/shares/${token}`, { permissions: { download: false } }, t.bearer(sB))).statusCode).toBe(403);
    expect((await t.del(`/api/shares/${token}`, t.bearer(sB))).statusCode).toBe(403);
    expect((await t.app.inject({ method: 'PUT', url: `/api/shares/${token}`, payload: { doc: createDocument(), boards: shareBody().boards }, headers: t.bearer(sB) })).statusCode).toBe(403);
    expect((await t.patch(`/api/shares/${token}`, { permissions: { download: false } }, t.bearer(sA))).statusCode).toBe(200);
    // Admin key kompatibel penuh: lihat semua, ubah share milik user, buat share tanpa owner.
    expect((await t.patch(`/api/shares/${token}`, { permissions: { download: true } }, AUTH)).statusCode).toBe(200);
    const adminMade = await t.post('/api/shares', shareBody(), AUTH);
    expect(adminMade.statusCode).toBe(200);
    const adminToken = adminMade.json().data.token;
    expect((await t.get('/api/shares', AUTH)).json().data.shares).toHaveLength(2);
    // Share era admin (owner NULL) tidak tampil di list user dan tidak bisa diubah user.
    expect((await t.get('/api/shares', t.bearer(sA))).json().data.shares).toHaveLength(1);
    expect((await t.del(`/api/shares/${adminToken}`, t.bearer(sA))).statusCode).toBe(403);
    // Lookup publik tidak berubah: meta share tetap tanpa auth.
    expect((await t.get(`/api/shares/${token}`)).statusCode).toBe(200);
    expect((await t.get(`/api/shares/${adminToken}`)).statusCode).toBe(200);
    // Tanpa kredensial → 401 seperti sebelumnya.
    expect((await t.get('/api/shares')).statusCode).toBe(401);
    expect((await t.del(`/api/shares/${token}`)).statusCode).toBe(401);
  });
});

describe('tanpa PUBLIC_BASE_URL (URL ber-kredensial tidak boleh dari Host)', () => {
  it('POST magic → 501 NOT_SUPPORTED; OAuth start/callback → 501; route lain tetap jalan', async () => {
    const t = setup({}, null);
    const magic = await t.post('/api/auth/magic', { email: 'a@x.test' });
    expect(magic.statusCode, magic.body).toBe(501);
    expect(magic.json().error.code).toBe('NOT_SUPPORTED');
    expect(t.sent).toHaveLength(0); // link verify tidak pernah dibentuk dari header Host
    expect((await t.get(`/api/auth/oauth/google/start?return_to=${encodeURIComponent('http://localhost:1/cb')}`)).statusCode).toBe(501);
    expect((await t.get('/api/auth/oauth/google/callback?code=c&state=s')).statusCode).toBe(501);
    // Route lain tidak terpengaruh: providers, shares admin, verify token ngawur → 401.
    expect((await t.get('/api/auth/providers')).json().data.providers).toEqual(['google', 'github', 'email']);
    const made = await t.post('/api/shares', shareBody(), AUTH);
    expect(made.statusCode, made.body).toBe(200);
    // Field `url` = path relatif (token capability tidak pernah digabung host dari request).
    const { token, url } = made.json().data as { token: string; url: string };
    expect(url).toBe(`/s/${token}`);
    expect((await t.get(`/api/shares/${token}`)).statusCode).toBe(200);
    expect((await t.get('/api/auth/magic/verify?token=zzz&return_to=http://localhost:1/')).statusCode).toBe(401);
  });

  it('magic verify dengan return_to prefix-domain jahat → 400 tanpa membakar token', async () => {
    const t = setup();
    await t.post('/api/auth/magic', { email: 'pref@x.test' });
    const token = /token=([A-Za-z0-9_-]+)/.exec(t.sent[0]!.html)![1]!;
    expect((await t.get(`/api/auth/magic/verify?token=${token}&return_to=${encodeURIComponent(`${PUBLIC}.evil.com/cb`)}`)).statusCode).toBe(400);
    // Token masih hidup — verify ulang dengan return_to sah → 302.
    expect((await t.get(`/api/auth/magic/verify?token=${token}&return_to=${encodeURIComponent(`${PUBLIC}/cb`)}`)).statusCode).toBe(302);
  });
});

describe('rate limit magic per-email', () => {
  it('bucket email murni berlaku lintas IP (di belakang satu proxy semua klien berbagi IP tidak bisa jadi celah DoS)', async () => {
    const t = setup();
    const email = 'target@x.test';
    const postFrom = (ip: string, to: string) => t.app.inject({ method: 'POST', url: '/api/auth/magic', payload: { email: to }, remoteAddress: ip });
    // IP A menghabiskan jatah: 5 terkirim, ke-6 silent.
    for (let i = 0; i < 6; i++) expect((await postFrom('10.0.0.1', email)).statusCode).toBe(200);
    expect(t.sent).toHaveLength(5);
    // IP lain (attacker rotate source), email sama → bucket per-email sudah penuh → tetap diam.
    await postFrom('10.0.0.2', email);
    await postFrom('10.0.0.3', email);
    expect(t.sent).toHaveLength(5);
    // Email lain dari IP baru tetap terkirim (bukan lockout global).
    await postFrom('10.0.0.2', 'korban-lain@x.test');
    expect(t.sent).toHaveLength(6);
  });
});
