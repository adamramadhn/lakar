// Share-link snapshot v1 (spec-collab-cloud story 1): `POST /viewer/docs/:slug/share` me-render PNG
// tiap board lewat pipeline RenderPort yang sama dengan `/export`, lalu POST ke service @lakar/api
// (`LAKAR_CLOUD_URL` + `LAKAR_CLOUD_KEY`). Route di bawah `/viewer/*` → guard Origin otomatis.
// Tanpa akun: service mengembalikan capability URL `{token,url}` yang diteruskan apa adanya.
import type { FastifyInstance } from 'fastify';
import type { IconCatalogPort, RenderPort } from '@lakar/ports';
import { iconRefs } from '@lakar/render';
import { LakarError, SLUG_PATTERN, errorMessage, resolveDocument, type IconGlyph, type LakarDocument, type ResolvedDocument } from '@lakar/schema';
import { z } from 'zod';
import { notFound } from './errors.js';
import { readPngSize } from './png.js';
import { cloudAuth, type SessionStore } from './session.js';
import type { DocStore } from './store.js';
import { peekDocument } from './viewer.js';

const ShareBody = z
  .object({ permissions: z.object({ comment: z.boolean(), download: z.boolean() }).strict().optional() })
  .strict()
  .optional();
const SHARE_HINT = 'kirim {permissions?} dengan {comment?, download?} boolean; default keduanya true';
const PatchShareBody = z
  .object({
    permissions: z.object({ comment: z.boolean().optional(), download: z.boolean().optional() }).strict().optional(),
    // ISO 8601 datetime saja — service menolak bentuk lain (selaras dengan ExpiresAt di @lakar/api).
    expiresAt: z.union([z.iso.datetime({ error: 'expiresAt harus datetime ISO 8601 (mis. 2026-12-24T00:00:00Z)' }), z.null()]).optional(),
  })
  .strict();
const PATCH_SHARE_HINT = 'kirim {permissions?: {comment?, download?}, expiresAt?: "<ISO>" | null}; null = tidak pernah kedaluwarsa';
const RefreshShareBody = z.object({ slug: z.string() }).strict();
const REFRESH_SHARE_HINT = 'kirim {slug} — dokumen lokal yang di-render ulang untuk snapshot share ini';

export type ShareRoutesOptions = {
  /** Salinan memori daemon (AD-1); dibaca saja. */
  docs: ReadonlyMap<string, LakarDocument>;
  store: DocStore;
  render: RenderPort<ResolvedDocument>;
  icons: IconCatalogPort<string, IconGlyph>;
  /** Sumber konfigurasi cloud (default `process.env`); untuk tes. */
  env?: NodeJS.ProcessEnv;
  /** Fetch ke service (default `fetch` global); untuk tes. */
  fetchFn?: typeof fetch;
  /**
   * Session cloud pengguna (spec-cloud-auth story C): Bearer session diprioritaskan di atas
   * `LAKAR_CLOUD_KEY` untuk semua panggilan service. Kosong → perilaku lama (key env saja).
   */
  session?: SessionStore;
};

export type ShareUploadResult = { token: string; url: string; boards: number };

const cloudMissing = () =>
  new LakarError('EXPORT_FAILED', 'LAKAR_CLOUD_URL tidak diset', {
    hint: 'set LAKAR_CLOUD_URL (dan LAKAR_CLOUD_KEY) ke service @lakar/api lalu coba lagi',
  });

/** Batas total fetch upload (render board tetap di luar batas ini). */
const UPLOAD_TIMEOUT_MS = 60_000;
/** Proyeksi kasar body upload (doc JSON + pngB64 + overhead field); bodyLimit service 64 MB. */
const UPLOAD_BODY_LIMIT = 50 * 1024 * 1024;

type Snapshot = {
  stored: LakarDocument;
  boards: { id: string; name: string; x: number; y: number; w: number; h: number; pngB64: string }[];
};

/** Resolve + render PNG per board `slug` — bahan bersama untuk upload (POST) dan refresh (PUT). */
async function renderSnapshot({ docs, store, render, icons }: ShareRoutesOptions, slug: string): Promise<Snapshot> {
  const stored = docs.get(slug) ?? (await peekDocument(store, slug));
  if (!stored) throw notFound(`dokumen ${slug} tidak ada`, 'pakai slug dari GET /viewer/docs');
  const doc = resolveDocument(stored);
  const boards = doc.pages.flatMap((p) => p.children);
  if (!boards.length) throw notFound(`dokumen ${slug} belum punya board`, 'buat board dulu lewat execute');
  const rendered: Snapshot['boards'] = [];
  for (const board of boards) {
    // AD-9: ikon tak dikenal katalog → ICON_UNKNOWN + saran sebelum render (sama dengan /export).
    for (const ref of iconRefs(board)) icons.canonical(ref.lib, ref.icon);
    const png = await render.screenshot(doc, board.id);
    // Ukuran dari PNG (skala 1 = px CSS) supaya board `height:'hug'` membawa tinggi terukurnya.
    const { width, height } = readPngSize(png);
    rendered.push({ id: board.id, name: board.name, x: board.x, y: board.y, w: width, h: height, pngB64: Buffer.from(png).toString('base64') });
  }
  return { stored, boards: rendered };
}

/** Proyeksi kasar body upload (doc JSON + pngB64 + overhead field); bodyLimit service 64 MB. */
function assertBodySize(docJson: string, boards: Snapshot['boards']) {
  let projected = docJson.length + 256;
  for (const b of boards) projected += b.pngB64.length + b.id.length + b.name.length + 128;
  if (projected > UPLOAD_BODY_LIMIT) {
    throw new LakarError('EXPORT_FAILED', `snapshot terlalu besar untuk diupload (~${Math.ceil(projected / 1024 / 1024)} MB, batas ~50 MB)`, {
      hint: 'kurangi jumlah atau ukuran board dokumen; bodyLimit service @lakar/api 64 MB',
    });
  }
}

/**
 * Panggil JSON ke service share: `${LAKAR_CLOUD_URL}<path>` (Bearer session sign-in, jatuh ke
 * `LAKAR_CLOUD_KEY` — compat AD-4), timeout total. Error jaringan/service dipetakan ke LakarError
 * EXPORT_FAILED — cloud tidak dikonfigurasi atau service mati tidak pernah mematikan daemon.
 */
async function cloudCall(
  { env = process.env, fetchFn = fetch, session }: ShareRoutesOptions,
  path: string,
  init: { method: string; body?: string },
): Promise<Record<string, unknown> | undefined> {
  const cloudUrl = env.LAKAR_CLOUD_URL?.replace(/\/+$/, '');
  if (!cloudUrl) throw cloudMissing();
  const { authorization, session: used } = await cloudAuth(session, env);
  let res: Response;
  try {
    res = await fetchFn(`${cloudUrl}${path}`, {
      method: init.method,
      headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
      ...(init.body !== undefined ? { body: init.body } : {}),
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    throw new LakarError(
      'EXPORT_FAILED',
      timeout ? `service share ${cloudUrl} tidak merespons dalam ${UPLOAD_TIMEOUT_MS / 1000} detik` : `service share ${cloudUrl} tidak bisa dihubungi: ${errorMessage(e)}`,
      {
        hint: 'periksa service @lakar/api dan LAKAR_CLOUD_URL, lalu coba lagi',
        retryable: true,
      },
    );
  }
  let payload: { ok?: boolean; data?: Record<string, unknown>; error?: { message?: string; hint?: string } };
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    payload = {};
  }
  // DELETE → 204 tanpa body.
  if (res.status === 204) return undefined;
  if (!res.ok || payload.ok !== true) {
    const detail = payload.error?.message ?? `HTTP ${res.status}`;
    // 401 dengan Bearer session = session.json basi (kedaluwarsa/dicabut): bersihkan supaya
    // panggilan berikutnya jatuh ke LAKAR_CLOUD_KEY atau memaksa sign-in ulang — jangan biarkan
    // session mati terus dipakai.
    if (res.status === 401 && used) await session?.clear().catch(() => {});
    throw new LakarError('EXPORT_FAILED', `service share menolak ${init.method} ${path}: ${detail}`, {
      hint:
        payload.error?.hint ||
        (res.status === 401
          ? used
            ? 'token session kedaluwarsa atau dicabut — sign in ulang dari aplikasi Lakar, atau periksa LAKAR_CLOUD_KEY'
            : 'periksa LAKAR_CLOUD_KEY'
          : 'periksa log service @lakar-api, lalu coba lagi'),
      retryable: res.status >= 500,
    });
  }
  return payload.data;
}

/**
 * Upload snapshot `slug` ke service share: render PNG per board → POST `${LAKAR_CLOUD_URL}/api/shares`.
 * Service mengembalikan capability URL `{token,url}` (halaman tamu `/s/:token`) yang diteruskan apa adanya.
 */
export async function shareUpload(
  opts: ShareRoutesOptions,
  slug: string,
  body: { permissions?: { comment: boolean; download: boolean } } | undefined,
): Promise<ShareUploadResult> {
  const { stored, boards: rendered } = await renderSnapshot(opts, slug);
  const permissions = { comment: body?.permissions?.comment ?? true, download: body?.permissions?.download ?? true };
  const docJson = JSON.stringify(stored);
  assertBodySize(docJson, rendered);
  const data = await cloudCall(
    opts,
    '/api/shares',
    {
      method: 'POST',
      body: `{"title":${JSON.stringify(slug)},"slug":${JSON.stringify(slug)},"doc":${docJson},"boards":${JSON.stringify(rendered)},"permissions":${JSON.stringify(permissions)}}`,
    },
  );
  const token = typeof data?.token === 'string' ? data.token : undefined;
  const url = typeof data?.url === 'string' ? data.url : undefined;
  if (!token || !url) {
    throw new LakarError('EXPORT_FAILED', 'service share menjawab upload tanpa token/url', { hint: 'periksa versi service @lakar/api', retryable: true });
  }
  return { token, url, boards: rendered.length };
}

/** Satu baris share untuk dialog viewer: meta service + `url` halaman tamu dari LAKAR_CLOUD_URL. */
export type ShareListEntry = Record<string, unknown> & { token: string; url: string };
export type ShareListResult = { configured: boolean; host?: string; shares: ShareListEntry[] };

/** `GET /viewer/docs/:slug/shares`: daftar share service yang slug-nya = dokumen ini. */
export async function shareList(opts: ShareRoutesOptions, slug: string): Promise<ShareListResult> {
  const cloudUrl = (opts.env ?? process.env).LAKAR_CLOUD_URL?.replace(/\/+$/, '');
  if (!cloudUrl) return { configured: false, shares: [] };
  const data = await cloudCall(opts, '/api/shares', { method: 'GET' });
  // Service yang menjawab ok:true tapi `shares` bukan array = respons rusak → EXPORT_FAILED
  // (lebih baik daripada TypeError .filter yang tidak bermakna).
  const raw = data?.shares;
  if (raw !== undefined && !Array.isArray(raw)) {
    throw new LakarError('EXPORT_FAILED', 'service share menjawab daftar tanpa array `shares`', { hint: 'periksa versi service @lakar/api', retryable: true });
  }
  const all = (raw ?? []) as Record<string, unknown>[];
  const host = new URL(cloudUrl).host;
  const shares = all
    .filter((s) => s.slug === slug && typeof s.token === 'string')
    .map((s) => ({ ...s, url: `${cloudUrl}/s/${s.token as string}` }));
  return { configured: true, host, shares: shares as ShareListEntry[] };
}

/** `PATCH /viewer/shares/:token`: teruskan patch izin/kedaluwarsa ke service (kunci di daemon). */
export async function sharePatch(opts: ShareRoutesOptions, token: string, body: z.infer<typeof PatchShareBody>): Promise<Record<string, unknown>> {
  const data = await cloudCall(opts, `/api/shares/${encodeURIComponent(token)}`, { method: 'PATCH', body: JSON.stringify(body) });
  return data ?? {};
}

/** `DELETE /viewer/shares/:token`: revoke — semua GET publik share itu langsung 404. */
export async function shareDelete(opts: ShareRoutesOptions, token: string): Promise<void> {
  await cloudCall(opts, `/api/shares/${encodeURIComponent(token)}`, { method: 'DELETE' });
}

/**
 * `POST /viewer/shares/:token/refresh` ("Update snapshot"): render ulang dokumen `slug` lalu
 * PUT ke service — token/URL dan komentar tetap, board PNG + doc diganti dalam satu transaksi.
 */
export async function shareRefresh(opts: ShareRoutesOptions, slug: string, token: string): Promise<ShareUploadResult> {
  const { stored, boards: rendered } = await renderSnapshot(opts, slug);
  const docJson = JSON.stringify(stored);
  assertBodySize(docJson, rendered);
  const data = await cloudCall(opts, `/api/shares/${encodeURIComponent(token)}`, {
    method: 'PUT',
    body: `{"title":${JSON.stringify(slug)},"slug":${JSON.stringify(slug)},"doc":${docJson},"boards":${JSON.stringify(rendered)}}`,
  });
  const url = typeof data?.url === 'string' ? data.url : undefined;
  if (!url) {
    throw new LakarError('EXPORT_FAILED', 'service share menjawab refresh tanpa url', { hint: 'periksa versi service @lakar/api', retryable: true });
  }
  return { token, url, boards: rendered.length };
}

export function registerShareRoutes(app: FastifyInstance, opts: ShareRoutesOptions): void {
  app.post<{ Params: { slug: string } }>('/viewer/docs/:slug/share', async (req, reply) => {
    const { slug } = req.params;
    if (!SLUG_PATTERN.test(slug)) {
      throw new LakarError('SCHEMA_INVALID', `slug tidak valid: ${JSON.stringify(slug)}`, { hint: `slug harus cocok pola ${SLUG_PATTERN.source}` });
    }
    const r = ShareBody.safeParse(req.body ?? undefined);
    if (!r.success) {
      throw new LakarError('SCHEMA_INVALID', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: SHARE_HINT });
    }
    return reply.code(200).send({ ok: true, data: await shareUpload(opts, slug, r.data) });
  });

  // Proxy dialog Share (plan-share-link-ui): semua meneruskan ke service dengan kunci dari env
  // (viewer tidak pernah memegang LAKAR_CLOUD_KEY). Route `/viewer/*` → guard Origin otomatis.

  app.get<{ Params: { slug: string } }>('/viewer/docs/:slug/shares', async (req, reply) => {
    const { slug } = req.params;
    if (!SLUG_PATTERN.test(slug)) {
      throw new LakarError('SCHEMA_INVALID', `slug tidak valid: ${JSON.stringify(slug)}`, { hint: `slug harus cocok pola ${SLUG_PATTERN.source}` });
    }
    return reply.code(200).send({ ok: true, data: await shareList(opts, slug) });
  });

  app.patch<{ Params: { token: string } }>('/viewer/shares/:token', async (req, reply) => {
    const r = PatchShareBody.safeParse(req.body ?? {});
    if (!r.success) {
      throw new LakarError('SCHEMA_INVALID', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: PATCH_SHARE_HINT });
    }
    return reply.code(200).send({ ok: true, data: await sharePatch(opts, req.params.token, r.data) });
  });

  app.delete<{ Params: { token: string } }>('/viewer/shares/:token', async (req, reply) => {
    await shareDelete(opts, req.params.token);
    return reply.code(200).send({ ok: true, data: { token: req.params.token, revoked: true } });
  });

  app.post<{ Params: { token: string } }>('/viewer/shares/:token/refresh', async (req, reply) => {
    const r = RefreshShareBody.safeParse(req.body);
    if (!r.success) {
      throw new LakarError('SCHEMA_INVALID', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: REFRESH_SHARE_HINT });
    }
    const { slug } = r.data;
    if (!SLUG_PATTERN.test(slug)) {
      throw new LakarError('SCHEMA_INVALID', `slug tidak valid: ${JSON.stringify(slug)}`, { hint: `slug harus cocok pola ${SLUG_PATTERN.source}` });
    }
    return reply.code(200).send({ ok: true, data: await shareRefresh(opts, slug, req.params.token) });
  });
}
