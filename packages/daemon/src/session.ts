// Session cloud lakard (spec-cloud-auth story C): token session pengguna disimpan di
// <dataDir>/session.json — BUKAN config.toml (bisa berubah sewaktu-waktu, mis. login ulang).
// Token opaque: daemon tidak pernah memverifikasinya secara lokal; validasi hanya lewat
// `GET {cloud}/api/auth/me` di service. File ditulis atomik (tmp + rename) dengan mode 0600;
// isi korup/tak dikenal → diperlakukan logged-out dan file dibersihkan supaya status jujur.
import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { LakarError, errorMessage } from '@lakar/schema';
import { writeFileAtomic } from './assets.js';

/** Profil akun dari respons `GET /api/auth/me` (`data.user`) — disimpan apa adanya di session.json. */
export type CloudUser = { id: string; email: string; name?: string; avatarUrl?: string };

/** Session yang tersimpan: token Bearer opaque + profil terakhir yang divalidasi service. */
export type CloudSession = { token: string; user: CloudUser };

/** Nama file session di dataDir (di luar `docs/` — bukan dokumen). */
export const SESSION_FILE = 'session.json';

const isEnoent = (e: unknown) => (e as NodeJS.ErrnoException)?.code === 'ENOENT';

const nonEmpty = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/**
 * Bentuk `data.user` service → `CloudUser` (null dinormalkan ke field tak ada). Bentuk tak
 * dikenal → undefined — dipakai `load` (korup) dan validasi respons `/api/auth/me` (rusak).
 */
export const cloudUserOf = (v: unknown): CloudUser | undefined => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const u = v as Record<string, unknown>;
  const id = nonEmpty(u.id);
  const email = nonEmpty(u.email);
  if (!id || !email) return undefined;
  const name = nonEmpty(u.name);
  const avatarUrl = nonEmpty(u.avatarUrl);
  return { id, email, ...(name ? { name } : {}), ...(avatarUrl ? { avatarUrl } : {}) };
};

const parseSession = (text: string): CloudSession | undefined => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return undefined;
  const s = json as Record<string, unknown>;
  const token = nonEmpty(s.token);
  const user = cloudUserOf(s.user);
  return token && user ? { token, user } : undefined;
};

/**
 * Store session cloud: satu file `session.json` di dataDir (pemilik tunggal daemon, AD-1).
 * `load` membaca ulang dari disk setiap panggil — file kecil dan panggilan cloud jarang,
 * jadi perubahan dari luar (hapus manual) langsung terlihat.
 */
export class SessionStore {
  readonly path: string;
  constructor(dataDir: string) {
    this.path = join(dataDir, SESSION_FILE);
  }

  /** Session tersimpan; tidak ada file ATAU isi korup → undefined (korup sekaligus dibersihkan). */
  async load(): Promise<CloudSession | undefined> {
    let text: string;
    try {
      text = await readFile(this.path, 'utf8');
    } catch (e) {
      if (isEnoent(e)) return undefined;
      throw e;
    }
    const session = parseSession(text);
    if (!session) {
      // File korup: jangan dipakai dan jangan dibaca ulang tiap status — hapus (best-effort).
      await rm(this.path, { force: true }).catch(() => {});
      return undefined;
    }
    return session;
  }

  /** Simpan session atomik mode 0600 (token = kredensial — tidak boleh terbaca pengguna lain). */
  async save(session: CloudSession): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFileAtomic(this.path, `${JSON.stringify(session, null, 2)}\n`, 0o600);
  }

  /** Hapus session (logout); idempoten — tidak ada file pun sukses. */
  async clear(): Promise<void> {
    await rm(this.path, { force: true });
  }
}

/** Basis URL service cloud (`LAKAR_CLOUD_URL` tanpa garis miring ujung); undefined = belum dikonfigurasi. */
export const cloudBase = (env: NodeJS.ProcessEnv): string | undefined => env.LAKAR_CLOUD_URL?.replace(/\/+$/, '') || undefined;

/**
 * Kredensial untuk panggilan cloud: `Bearer <session>` bila pengguna sign-in, jatuh ke
 * `Bearer <LAKAR_CLOUD_KEY>` (admin key, compat AD-4). `authorization` undefined = tanpa
 * kredensial — perilaku sama seperti sebelum auth. `session` dikembalikan supaya pemanggil bisa
 * membersihkan session basi saat service menjawab 401 (fallback env-key baru jalan panggil
 * berikutnya — respons kali ini tetap gagal jujur).
 */
export async function cloudAuth(
  store: SessionStore | undefined,
  env: NodeJS.ProcessEnv,
): Promise<{ authorization: string | undefined; session: CloudSession | undefined }> {
  const session = await store?.load();
  if (session) return { authorization: `Bearer ${session.token}`, session };
  const key = env.LAKAR_CLOUD_KEY;
  return { authorization: key ? `Bearer ${key}` : undefined, session: undefined };
}

/** Batas waktu panggilan ringan ke service auth (providers/me/magic/session). */
export const CLOUD_AUTH_TIMEOUT_MS = 15_000;

/**
 * Provider sign-in yang diiklankan service (`GET {base}/api/auth/providers` → `data.providers`,
 * mis. `['google','github','email']`). Kegagalan jaringan/service/bentuk → EXPORT_FAILED —
 * pemanggil `start` sengaja fail-closed (jangan menawarkan provider yang tidak diiklankan).
 */
export async function cloudProviders(fetchFn: typeof fetch, base: string): Promise<string[]> {
  let res: Response;
  try {
    res = await fetchFn(`${base}/api/auth/providers`, { signal: AbortSignal.timeout(CLOUD_AUTH_TIMEOUT_MS) });
  } catch (e) {
    throw new LakarError('EXPORT_FAILED', `service auth ${base} tidak bisa dihubungi: ${errorMessage(e)}`, {
      hint: 'periksa service @lakar/api dan LAKAR_CLOUD_URL, lalu coba lagi',
      retryable: true,
    });
  }
  let payload: { ok?: boolean; data?: { providers?: unknown } };
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    payload = {};
  }
  const list = payload.data?.providers;
  if (!res.ok || payload.ok !== true || !Array.isArray(list)) {
    throw new LakarError('EXPORT_FAILED', `service auth menjawab daftar provider tidak valid (HTTP ${res.status})`, {
      hint: 'periksa versi service @lakar/api (butuh GET /api/auth/providers), lalu coba lagi',
      retryable: res.status >= 500,
    });
  }
  return list.filter((p): p is string => typeof p === 'string' && p.length > 0);
}
