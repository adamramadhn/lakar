// Tes `/viewer/auth/*` + SessionStore (spec-cloud-auth story C): fetch ke service tiruan
// (vi.stubGlobal) + env cloud (vi.stubEnv). Session disimpan ke dataDir/session.json (0600);
// korup → logged-out + dibersihkan. Event `auth` SSE ditangkap lewat ActivityBus.subscribeAll.
// Sign-in terikat nonce: `start` mencetak `?state=` di return_to; `/viewer/auth/session` wajib
// mengkonsumsinya (POST langsung/replay → 401) — anti session-fixation dan open-redirect.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer, loadConfig, type BusEvent, type Daemon } from './index.js';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const fakeRender = {
  screenshot: async () => new Uint8Array(PNG_1x1),
  measure: async () => ({ width: 1, height: 1, nodes: [], texts: [] }),
} as never;

const USER = { id: 'u-1', email: 'adi@example.com', name: 'Adi', avatarUrl: 'https://cdn.example/a.png' };
const SESSION = { token: 'sess-token-1', user: USER };

const okJson = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } });
const failJson = (status: number, message: string) => new Response(JSON.stringify({ ok: false, error: { message } }), { status, headers: { 'content-type': 'application/json' } });

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-auth-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

type Ctx = { daemon: Daemon; dataDir: string; post: (url: string, payload?: unknown) => Promise<any>; get: (url: string) => Promise<any>; events: BusEvent[] };

async function setup(): Promise<Ctx> {
  const dataDir = await mkdtemp(join(root, 'data-'));
  const daemon = buildServer({ config: { ...baseConfig, port: 0, dataDir }, render: fakeRender });
  const events: BusEvent[] = [];
  daemon.activity.subscribeAll((e) => events.push(e));
  const post = (url: string, payload?: unknown) => daemon.app.inject({ method: 'POST', url, ...(payload !== undefined ? { payload: payload as object } : {}) });
  const get = (url: string) => daemon.app.inject({ method: 'GET', url });
  return { daemon, dataDir, post, get, events };
}

const sessionPath = (t: Ctx) => join(t.dataDir, 'session.json');

describe('GET /viewer/auth/status', () => {
  it('tanpa LAKAR_CLOUD_URL → {signedIn:false, configured:false}', async () => {
    const t = await setup();
    vi.stubEnv('LAKAR_CLOUD_URL', '');
    const r = await t.get('/viewer/auth/status');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toEqual({ signedIn: false, configured: false });
  });

  it('session tersimpan → {signedIn:true, user} + providers dari service', async () => {
    const t = await setup();
    await t.daemon.cloudSession.save(SESSION);
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    vi.stubGlobal('fetch', async (url: string) => {
      expect(url).toBe('https://api.example/api/auth/providers');
      return okJson({ providers: ['google', 'email'] });
    });
    const r = await t.get('/viewer/auth/status');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toEqual({ signedIn: true, configured: true, host: 'api.example', user: USER, providers: ['google', 'email'] });
  });

  it('providers dicache ~30s — dua status berturut hanya satu fetch ke service', async () => {
    const t = await setup();
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    let n = 0;
    vi.stubGlobal('fetch', async () => {
      n++;
      return okJson({ providers: ['google'] });
    });
    const r1 = await t.get('/viewer/auth/status');
    const r2 = await t.get('/viewer/auth/status');
    expect(r1.json().data.providers).toEqual(['google']);
    expect(r2.json().data.providers).toEqual(['google']);
    expect(n).toBe(1);
  });

  it('service down → status tetap jujur (providers dihilangkan, bukan error)', async () => {
    const t = await setup();
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    vi.stubGlobal('fetch', async () => {
      throw new Error('ECONNREFUSED');
    });
    const r = await t.get('/viewer/auth/status');
    expect(r.json().data).toEqual({ signedIn: false, configured: true, host: 'api.example' });
  });

  it('session.json korup → signedIn:false dan file dibersihkan', async () => {
    const t = await setup();
    await writeFile(sessionPath(t), '{ini bukan json', 'utf8');
    vi.stubEnv('LAKAR_CLOUD_URL', '');
    const r = await t.get('/viewer/auth/status');
    expect(r.json().data).toEqual({ signedIn: false, configured: false });
    expect(existsSync(sessionPath(t))).toBe(false);
    // Bentuk valid tapi field wajib hilang juga korup.
    await writeFile(sessionPath(t), JSON.stringify({ token: 42, user: { id: 'u' } }), 'utf8');
    const r2 = await t.get('/viewer/auth/status');
    expect(r2.json().data.signedIn).toBe(false);
    expect(existsSync(sessionPath(t))).toBe(false);
  });
});

describe('POST /viewer/auth/start', () => {
  it('provider google diiklankan → {url} oauth/start dengan return_to callback loopback + state nonce', async () => {
    const t = await setup();
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      return okJson({ providers: ['google', 'github', 'email'] });
    });
    const r = await t.post('/viewer/auth/start', { provider: 'google' });
    expect(r.statusCode, r.body).toBe(200);
    expect(calls).toEqual(['https://api.example/api/auth/providers']);
    const url = new URL(r.json().data.url);
    expect(`${url.origin}${url.pathname}`).toBe('https://api.example/api/auth/oauth/google/start');
    const returnTo = new URL(url.searchParams.get('return_to')!);
    expect(`${returnTo.origin}${returnTo.pathname}`).toBe('http://127.0.0.1:0/viewer/auth/callback');
    expect(returnTo.searchParams.get('state')).toBeTruthy();
  });

  it('daemon listen port acak → return_to memakai port terikat asli (bukan 0)', async () => {
    const dataDir = await mkdtemp(join(root, 'data-'));
    const daemon = buildServer({ config: { ...baseConfig, port: 0, dataDir }, render: fakeRender });
    await daemon.app.listen({ port: 0, host: '127.0.0.1' });
    try {
      const addr = daemon.app.server.address();
      const bound = addr && typeof addr === 'object' ? addr.port : 0;
      expect(bound).toBeGreaterThan(0);
      vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
      vi.stubGlobal('fetch', async () => okJson({ providers: ['google'] }));
      const r = await daemon.app.inject({ method: 'POST', url: '/viewer/auth/start', payload: { provider: 'google' } });
      expect(r.statusCode, r.body).toBe(200);
      const returnTo = new URL(new URL(r.json().data.url).searchParams.get('return_to')!);
      expect(`${returnTo.origin}${returnTo.pathname}`).toBe(`http://127.0.0.1:${bound}/viewer/auth/callback`);
      expect(returnTo.searchParams.get('state')).toBeTruthy();
      // return_to eksplisit ke port terikat asli juga diterima.
      const ok = await daemon.app.inject({
        method: 'POST',
        url: '/viewer/auth/start',
        payload: { provider: 'google', return_to: `http://127.0.0.1:${bound}/viewer/auth/callback` },
      });
      expect(ok.statusCode, ok.body).toBe(200);
      // Port lain — walau masih loopback — ditolak (open-redirect ke proses lokal lain).
      const other = await daemon.app.inject({
        method: 'POST',
        url: '/viewer/auth/start',
        payload: { provider: 'google', return_to: `http://127.0.0.1:${bound + 1}/viewer/auth/callback` },
      });
      expect(other.statusCode).toBe(400);
    } finally {
      await daemon.app.close();
    }
  });

  it('provider tak diiklankan → 400; cloud tak diset → EXPORT_FAILED; return_to non-loopback → 400', async () => {
    const t = await setup();
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    vi.stubGlobal('fetch', async () => okJson({ providers: ['email'] }));
    const r = await t.post('/viewer/auth/start', { provider: 'github' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('SCHEMA_INVALID');
    expect(r.json().error.hint).toContain('email');
    // Cloud tak diset → EXPORT_FAILED (tanpa fetch).
    vi.stubEnv('LAKAR_CLOUD_URL', '');
    const off = await t.post('/viewer/auth/start', { provider: 'google' });
    expect(off.statusCode).toBe(500);
    expect(off.json().error.code).toBe('EXPORT_FAILED');
    // return_to harus callback daemon persis.
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    const evil = await t.post('/viewer/auth/start', { provider: 'google', return_to: 'https://evil.example/cb' });
    expect(evil.statusCode).toBe(400);
  });

  it('return_to: port+path callback daemon (127.0.0.1/localhost) → 200; port/path/skema lain → 400', async () => {
    const t = await setup();
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    vi.stubGlobal('fetch', async () => okJson({ providers: ['google'] }));
    // Port bound = config.port = 0 di tes inject — callback persis daemon diterima di kedua hostname.
    for (const rt of ['http://127.0.0.1:0/viewer/auth/callback', 'http://localhost:0/viewer/auth/callback']) {
      const r = await t.post('/viewer/auth/start', { provider: 'google', return_to: rt });
      expect(r.statusCode, `${rt}: ${r.body}`).toBe(200);
    }
    for (const rt of [
      'http://127.0.0.1:9999/viewer/auth/callback', // port lain — proses lokal lain
      'http://localhost:9999/viewer/auth/callback',
      'http://127.0.0.1:0/viewer/auth/other', // path lain
      'http://127.0.0.1:0/', // root
      'https://127.0.0.1:0/viewer/auth/callback', // skema lain
      'http://evil.example/viewer/auth/callback', // host lain
    ]) {
      const r = await t.post('/viewer/auth/start', { provider: 'google', return_to: rt });
      expect(r.statusCode, `${rt}: ${r.body}`).toBe(400);
      expect(r.json().error.code).toBe('SCHEMA_INVALID');
    }
  });

  it('provider email (diiklankan) → proxy POST /api/auth/magic {email, return_to+state} → {sent:true}; tanpa email → 400; tak diiklankan → 400', async () => {
    const t = await setup();
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/api/auth/providers')) return okJson({ providers: ['email', 'google'] });
      return okJson({ sent: true });
    });
    const r = await t.post('/viewer/auth/start', { provider: 'email', email: 'adi@example.com' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toEqual({ sent: true });
    expect(calls.map((c) => c.url)).toEqual(['https://api.example/api/auth/providers', 'https://api.example/api/auth/magic']);
    const magic = calls.find((c) => c.url.endsWith('/api/auth/magic'))!;
    expect(magic.init!.method).toBe('POST');
    const sentBody = JSON.parse(magic.init!.body as string);
    expect(sentBody.email).toBe('adi@example.com');
    const returnTo = new URL(sentBody.return_to);
    expect(`${returnTo.origin}${returnTo.pathname}`).toBe('http://127.0.0.1:0/viewer/auth/callback');
    expect(returnTo.searchParams.get('state')).toBeTruthy();
    const missing = await t.post('/viewer/auth/start', { provider: 'email' });
    expect(missing.statusCode).toBe(400);
    // Email tak diiklankan service → 400 (simetri dengan google/github).
    vi.stubGlobal('fetch', async () => okJson({ providers: ['google'] }));
    const notAdvertised = await t.post('/viewer/auth/start', { provider: 'email', email: 'adi@example.com' });
    expect(notAdvertised.statusCode).toBe(400);
    expect(notAdvertised.json().error.code).toBe('SCHEMA_INVALID');
  });
});

describe('GET /viewer/auth/callback', () => {
  it('HTML kecil: JS membaca #token + ?state, replaceState membersihkan URL, lalu POST /viewer/auth/session; token tidak ada di markup', async () => {
    const t = await setup();
    const r = await t.get('/viewer/auth/callback');
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/html');
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
    expect(r.headers['content-security-policy']).toContain("connect-src 'self'");
    const html = r.body as string;
    expect(html).toContain('location.hash');
    expect(html).toContain('location.search');
    expect(html).toContain('replaceState');
    expect(html).toContain('/viewer/auth/session');
    expect(html).toContain('state');
    expect(html).toContain('Signed in');
    expect(html).not.toContain('sess-token');
  });
});

describe('POST /viewer/auth/session', () => {
  /** Jalankan `start` lalu ambil nonce `state` dari return_to — satu-satunya cara sah membuat session. */
  const mintState = async (t: Ctx): Promise<string> => {
    const r = await t.post('/viewer/auth/start', { provider: 'google' });
    expect(r.statusCode, r.body).toBe(200);
    const returnTo = new URL(new URL(r.json().data.url).searchParams.get('return_to')!);
    const state = returnTo.searchParams.get('state');
    expect(state).toBeTruthy();
    return state!;
  };

  it('alur start→state→session: /me Bearer → session.json 0600 + event auth + {signedIn:true,user}; replay → 401', async () => {
    const t = await setup();
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return url.endsWith('/api/auth/providers') ? okJson({ providers: ['google'] }) : okJson({ user: USER });
    });
    const state = await mintState(t);
    const r = await t.post('/viewer/auth/session', { token: 'sess-token-1', state });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toEqual({ signedIn: true, user: USER });
    const me = calls.find((c) => c.url.endsWith('/api/auth/me'))!;
    expect((me.init!.headers as Record<string, string>).authorization).toBe('Bearer sess-token-1');
    // File tersimpan 0600 dengan isi session penuh.
    const st = await stat(sessionPath(t));
    expect(st.mode & 0o777).toBe(0o600);
    expect(await t.daemon.cloudSession.load()).toEqual(SESSION);
    // Event `auth` SSE dipancarkan.
    expect(t.events.filter((e) => e.type === 'auth')).toEqual([expect.objectContaining({ type: 'auth', auth: { signedIn: true, user: USER } })]);
    // Replay state yang sama → 401 (nonce sekali pakai).
    const replay = await t.post('/viewer/auth/session', { token: 'sess-token-1', state });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.code).toBe('UNAUTHORIZED');
  });

  it('state asing/tak dikenal → 401; tanpa state → 400; Origin lintas situs → 403', async () => {
    const t = await setup();
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    vi.stubGlobal('fetch', async () => okJson({ providers: ['google'] }));
    // POST langsung tanpa lewat start: state ngawur → 401 (fail-closed — anti session fixation).
    const bogus = await t.post('/viewer/auth/session', { token: 'sess-token-1', state: 'ngawur' });
    expect(bogus.statusCode).toBe(401);
    expect(bogus.json().error.code).toBe('UNAUTHORIZED');
    expect(existsSync(sessionPath(t))).toBe(false);
    // Tanpa state sama sekali → 400 schema.
    const noState = await t.post('/viewer/auth/session', { token: 'sess-token-1' });
    expect(noState.statusCode).toBe(400);
    // Origin lintas situs → 403 (guard /viewer/* CSRF) walau body valid — browser jahat tidak
    // bisa menitipkan session lewat POST.
    const cross = await t.daemon.app.inject({
      method: 'POST',
      url: '/viewer/auth/session',
      payload: { token: 'sess-token-1', state: 'ngawur' },
      headers: { origin: 'https://evil.example' },
    });
    expect(cross.statusCode).toBe(403);
    expect(existsSync(sessionPath(t))).toBe(false);
  });

  it('token invalid (/me → 401) → 401 UNAUTHORIZED, tidak ada file; tanpa cloud → EXPORT_FAILED', async () => {
    const t = await setup();
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    vi.stubGlobal('fetch', async (url: string) =>
      url.endsWith('/api/auth/providers') ? okJson({ providers: ['google'] }) : failJson(401, 'session tidak valid atau tidak ada'),
    );
    const state = await mintState(t);
    const r = await t.post('/viewer/auth/session', { token: 'salah', state });
    expect(r.statusCode).toBe(401);
    expect(r.json().error.code).toBe('UNAUTHORIZED');
    expect(JSON.stringify(r.body)).not.toContain('salah');
    expect(existsSync(sessionPath(t))).toBe(false);
    // Cloud dilepas setelah start: nonce dikonsumsi lalu EXPORT_FAILED.
    const state2 = await mintState(t);
    vi.stubEnv('LAKAR_CLOUD_URL', '');
    const off = await t.post('/viewer/auth/session', { token: 'apa', state: state2 });
    expect(off.statusCode).toBe(500);
    expect(off.json().error.code).toBe('EXPORT_FAILED');
  });
});

describe('POST /viewer/auth/logout', () => {
  it('session ada → DELETE /api/auth/session best-effort + file terhapus + event; tanpa session → 200 idempoten', async () => {
    const t = await setup();
    await t.daemon.cloudSession.save(SESSION);
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 204 });
    });
    const r = await t.post('/viewer/auth/logout', {});
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toEqual({ signedIn: false });
    expect(calls[0]!.url).toBe('https://api.example/api/auth/session');
    expect(calls[0]!.init!.method).toBe('DELETE');
    expect((calls[0]!.init!.headers as Record<string, string>).authorization).toBe('Bearer sess-token-1');
    expect(existsSync(sessionPath(t))).toBe(false);
    expect(t.events.filter((e) => e.type === 'auth')).toEqual([expect.objectContaining({ type: 'auth', auth: { signedIn: false } })]);
    // Logout kedua (tanpa session) tetap 200; service down tidak menggagalkan.
    vi.stubGlobal('fetch', async () => {
      throw new Error('ECONNREFUSED');
    });
    const again = await t.post('/viewer/auth/logout', {});
    expect(again.statusCode).toBe(200);
  });
});

describe('kredensial cloud (compat AD-4)', () => {
  it('session diprioritaskan di atas LAKAR_CLOUD_KEY pada panggilan share', async () => {
    const t = await setup();
    const slug = (await t.post('/viewer/docs', { name: 'My Landing' }).then((r: any) => r.json().data.slug)) as string;
    await t.daemon.cloudSession.save(SESSION);
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    vi.stubEnv('LAKAR_CLOUD_KEY', 'kunci-admin');
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return okJson({ token: 'tok_1', url: 'https://api.example/s/tok_1' });
    });
    const r = await t.post(`/viewer/docs/${slug}/share`, {});
    expect(r.statusCode, r.body).toBe(200);
    expect((calls[0]!.init!.headers as Record<string, string>).authorization).toBe('Bearer sess-token-1');
    // Setelah logout → jatuh ke LAKAR_CLOUD_KEY (perilaku lama).
    await t.daemon.cloudSession.clear();
    const r2 = await t.post(`/viewer/docs/${slug}/share`, {});
    expect(r2.statusCode).toBe(200);
    expect((calls[1]!.init!.headers as Record<string, string>).authorization).toBe('Bearer kunci-admin');
  });

  it('session.json korup saat share → file dibersihkan dan panggilan jatuh ke LAKAR_CLOUD_KEY', async () => {
    const t = await setup();
    const slug = (await t.post('/viewer/docs', { name: 'My Landing' }).then((r: any) => r.json().data.slug)) as string;
    await writeFile(sessionPath(t), '{ini bukan json', 'utf8');
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    vi.stubEnv('LAKAR_CLOUD_KEY', 'kunci-admin');
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return okJson({ token: 'tok_1', url: 'https://api.example/s/tok_1' });
    });
    const r = await t.post(`/viewer/docs/${slug}/share`, {});
    expect(r.statusCode, r.body).toBe(200);
    expect(existsSync(sessionPath(t))).toBe(false);
    expect((calls[0]!.init!.headers as Record<string, string>).authorization).toBe('Bearer kunci-admin');
  });

  it('share 401 dengan Bearer session → hint sign-in ulang + session.json dibersihkan; panggil berikut → env key', async () => {
    const t = await setup();
    const slug = (await t.post('/viewer/docs', { name: 'My Landing' }).then((r: any) => r.json().data.slug)) as string;
    await t.daemon.cloudSession.save(SESSION);
    vi.stubEnv('LAKAR_CLOUD_URL', 'https://api.example');
    vi.stubEnv('LAKAR_CLOUD_KEY', 'kunci-admin');
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      // Panggilan pertama (Bearer session) → 401; berikutnya (env key) → sukses.
      return calls.length === 1 ? failJson(401, 'token tidak valid') : okJson({ token: 'tok_2', url: 'https://api.example/s/tok_2' });
    });
    const r = await t.post(`/viewer/docs/${slug}/share`, {});
    expect(r.statusCode).toBe(500);
    expect(r.json().error.code).toBe('EXPORT_FAILED');
    expect(r.json().error.hint).toContain('sign in ulang');
    expect((calls[0]!.init!.headers as Record<string, string>).authorization).toBe('Bearer sess-token-1');
    // Session basi dibersihkan — panggilan berikutnya langsung pakai LAKAR_CLOUD_KEY.
    expect(existsSync(sessionPath(t))).toBe(false);
    const r2 = await t.post(`/viewer/docs/${slug}/share`, {});
    expect(r2.statusCode, r2.body).toBe(200);
    expect((calls[1]!.init!.headers as Record<string, string>).authorization).toBe('Bearer kunci-admin');
  });
});
