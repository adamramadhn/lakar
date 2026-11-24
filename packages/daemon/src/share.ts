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
import type { DocStore } from './store.js';
import { peekDocument } from './viewer.js';

const ShareBody = z
  .object({ permissions: z.object({ comment: z.boolean(), download: z.boolean() }).strict().optional() })
  .strict()
  .optional();
const SHARE_HINT = 'kirim {permissions?} dengan {comment?, download?} boolean; default keduanya true';

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

/**
 * Upload snapshot `slug` ke service share: resolve doc → render PNG per board → POST
 * `${LAKAR_CLOUD_URL}/api/shares` (Bearer `LAKAR_CLOUD_KEY`). Error jaringan/service dipetakan
 * ke LakarError: cloud tidak dikonfigurasi atau service mati tidak pernah mematikan daemon.
 */
export async function shareUpload(
  { docs, store, render, icons, env = process.env, fetchFn = fetch }: ShareRoutesOptions,
  slug: string,
  body: { permissions?: { comment: boolean; download: boolean } } | undefined,
): Promise<ShareUploadResult> {
  const cloudUrl = env.LAKAR_CLOUD_URL?.replace(/\/+$/, '');
  if (!cloudUrl) throw cloudMissing();
  const cloudKey = env.LAKAR_CLOUD_KEY;
  const stored = docs.get(slug) ?? (await peekDocument(store, slug));
  if (!stored) throw notFound(`dokumen ${slug} tidak ada`, 'pakai slug dari GET /viewer/docs');
  const doc = resolveDocument(stored);
  const boards = doc.pages.flatMap((p) => p.children);
  if (!boards.length) throw notFound(`dokumen ${slug} belum punya board`, 'buat board dulu lewat execute');
  const rendered: { id: string; name: string; x: number; y: number; w: number; h: number; pngB64: string }[] = [];
  for (const board of boards) {
    // AD-9: ikon tak dikenal katalog → ICON_UNKNOWN + saran sebelum render (sama dengan /export).
    for (const ref of iconRefs(board)) icons.canonical(ref.lib, ref.icon);
    const png = await render.screenshot(doc, board.id);
    // Ukuran dari PNG (skala 1 = px CSS) supaya board `height:'hug'` membawa tinggi terukurnya.
    const { width, height } = readPngSize(png);
    rendered.push({ id: board.id, name: board.name, x: board.x, y: board.y, w: width, h: height, pngB64: Buffer.from(png).toString('base64') });
  }
  const permissions = { comment: body?.permissions?.comment ?? true, download: body?.permissions?.download ?? true };
  const docJson = JSON.stringify(stored);
  // Penjaga ukuran pra-fetch: body pasti ditolak 413 service (bodyLimit 64 MB) — gagalkan jelas
  // dan non-retryable sebelum mengirim puluhan MB sia-sia.
  let projected = docJson.length + 256;
  for (const b of rendered) projected += b.pngB64.length + b.id.length + b.name.length + 128;
  if (projected > UPLOAD_BODY_LIMIT) {
    throw new LakarError('EXPORT_FAILED', `snapshot terlalu besar untuk diupload (~${Math.ceil(projected / 1024 / 1024)} MB, batas ~50 MB)`, {
      hint: 'kurangi jumlah atau ukuran board dokumen; bodyLimit service @lakar/api 64 MB',
    });
  }
  let res: Response;
  try {
    res = await fetchFn(`${cloudUrl}/api/shares`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cloudKey ? { authorization: `Bearer ${cloudKey}` } : {}) },
      // docJson dipakai ulang dari penjaga ukuran supaya dokumen besar tidak di-stringify dua kali.
      body: `{"title":${JSON.stringify(slug)},"slug":${JSON.stringify(slug)},"doc":${docJson},"boards":${JSON.stringify(rendered)},"permissions":${JSON.stringify(permissions)}}`,
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
  let payload: { ok?: boolean; data?: { token?: string; url?: string }; error?: { message?: string; hint?: string } };
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    payload = {};
  }
  if (!res.ok || payload.ok !== true || typeof payload.data?.token !== 'string' || typeof payload.data?.url !== 'string') {
    const detail = payload.error?.message ?? `HTTP ${res.status}`;
    throw new LakarError('EXPORT_FAILED', `service share menolak upload: ${detail}`, {
      hint: payload.error?.hint || (res.status === 401 ? 'periksa LAKAR_CLOUD_KEY' : 'periksa log service @lakar-api, lalu coba lagi'),
      retryable: res.status >= 500,
    });
  }
  return { token: payload.data.token, url: payload.data.url, boards: rendered.length };
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
}
