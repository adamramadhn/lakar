// Route impor halaman web dari URL (epic adopsi open-pencil story 8, desain section 11). Dua pintu, seperti paste:
// - `POST /viewer/docs/:slug/import-url` — viewer (guard Origin), respons membawa `inverse` untuk undo (AD-8).
// - `POST /viewer/import-url` — sesi MCP (tool `import_url`), dokumen aktif sesi, tercatat di Activity (`TOOL_ROUTES`).
// Alur: fetch halaman eksplisit (`url-fetch.ts`, anti-SSRF, 15 s/10 MB, tanpa skrip) → pipeline paste HTML yang sama
// (`snapshotHtml` terisolasi → `importHtml`) → board baru di halaman berisi hasil impor sebagai SATU transaksi
// (satu rev, satu entri riwayat, undo satu langkah). Board: lebar = lebar viewport, tinggi = tinggi konten,
// nama = name ?? <title> ?? host, posisi default kanan board terakhir +80, screen default dari lebar.
// Fetch berjalan di luar kunci dokumen (I/O lama); validasi halaman/slug diulang di dalam kunci.
import type { FastifyInstance } from 'fastify';
import { touchedBoards } from '@lakar/check';
import { applyOps, transact } from '@lakar/core';
import { LakarError, OPS_MAX, SESSION_HEADER, SLUG_PATTERN, resolveDocument, type DocOp } from '@lakar/schema';
import { z } from 'zod';
import { writeAsset } from './assets.js';
import { VIEWER_CLIENT, originOf } from './events.js';
import { NetError } from './photos/net.js';
import { HtmlImportError, importHtml } from './paste/html.js';
import { PASTE_NAME_MAX } from './paste/svg.js';
import { PASTE_DESCRIPTION_MAX, PASTE_WIDTH_MAX, countNodes, pasteOps, type Imported, type PasteRoutesOptions } from './paste.js';
import { NO_ACTIVE_DOC_HINT, authorOf, type Session } from './sessions.js';
import { URL_FETCH_URL_MAX, checkPageUrl, fetchPageHtml, type PageFetch } from './url-fetch.js';

/** Lebar board+viewport default bila `width` tidak dikirim (preset Desktop desain section 11). */
export const URL_IMPORT_DEFAULT_WIDTH = 1440;
/** Ref lokal board baru di daftar op impor. */
const BOARD_REF = 'import';
/** Ref lokal akar pohon hasil impor di dalam board (sama dengan paste). */
const ROOT_REF = 'paste';
export const URL_IMPORT_DEFAULT_DESCRIPTION = 'Import page';
const URL_IMPORT_URL_MAX = URL_FETCH_URL_MAX;

const UrlImportBody = z
  .object({
    url: z.string().trim().min(1, 'url tidak boleh kosong').max(URL_IMPORT_URL_MAX, `url maks ${URL_IMPORT_URL_MAX} karakter`),
    /** Halaman tujuan board baru (default halaman pertama). */
    pageId: z.string().min(1).optional(),
    /** Posisi board di halaman (default: kanan board terakhir + 80, y board terakhir). */
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    /** Nama board (default `<title>` halaman, lalu host). */
    name: z.string().trim().min(1).max(PASTE_NAME_MAX).optional(),
    description: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().min(1, 'description tidak boleh kosong').max(PASTE_DESCRIPTION_MAX, `description maks ${PASTE_DESCRIPTION_MAX} karakter`))
      .optional(),
    /** Lebar board = lebar viewport render (preset: 1440/768/375). */
    width: z.number().finite().min(1).max(PASTE_WIDTH_MAX).optional(),
    /** Jenis layar board (default dari lebar: ≥1024 landing, ≥600 app, selain itu mobile). */
    screen: z.enum(['landing', 'app', 'mobile']).optional(),
  })
  .strict();
export type UrlImportBody = z.infer<typeof UrlImportBody>;
const URL_IMPORT_HINT = `kirim {url: 'https://…', pageId?, x?, y?, name?, description?, width?, screen?: 'landing'|'app'|'mobile'} (url http(s) publik maks ${URL_IMPORT_URL_MAX} karakter)`;

export function parseUrlImportBody(body: unknown): UrlImportBody {
  const parsed = UrlImportBody.safeParse(body);
  if (!parsed.success) {
    throw new LakarError('SCHEMA_INVALID', parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: URL_IMPORT_HINT });
  }
  return parsed.data;
}

export type UrlImportRoutesOptions = PasteRoutesOptions & {
  /** Fetch halaman (default `fetchPageHtml`); tes menyuntik palsu tanpa menyentuh validasi `checkPageUrl`. */
  page?: PageFetch;
};

type Actor = { sessionId: string; client?: string; agent?: string; session?: Session };

/** NetError → LakarError: diblokir/format salah = input tidak valid; timeout/jaringan/HTTP sibuk = EXEC_ERROR retryable. */
function netToLakar(e: NetError): LakarError {
  return new LakarError(e.retryable ? 'EXEC_ERROR' : 'SCHEMA_INVALID', e.message, {
    hint: 'pakai URL http(s) publik; alamat lokal/privat ditolak, halaman >10 MB atau >15 detik dibatasi',
    retryable: e.retryable,
  });
}

/** Snapshot terisolasi + `importHtml` (jalur yang sama dengan paste HTML; skrip mati, jaringan halaman diblokir). */
async function importHtmlPage(opts: UrlImportRoutesOptions, html: string, width: number, name: string | undefined): Promise<Imported> {
  if (!opts.html) {
    throw new LakarError('RENDER_FAILED', 'impor halaman web butuh Chromium daemon, yang tidak tersedia di daemon ini', {
      hint: 'jalankan lakard dengan browser render (scripts/install-browser.sh atau LAKAR_BROWSER_CHANNEL)',
      retryable: false,
    });
  }
  const snap = await opts.html.snapshotHtml(html, { width });
  let imported;
  try {
    imported = importHtml(snap, { ...(name !== undefined ? { name } : {}), fonts: opts.fonts ?? (() => undefined) });
  } catch (e) {
    if (e instanceof HtmlImportError) throw new LakarError('SCHEMA_INVALID', e.message, { hint: 'halaman harus berisi elemen atau teks yang terlihat' });
    throw e;
  }
  const n = countNodes(imported.node);
  if (n > OPS_MAX - 1) {
    throw new LakarError('SCHEMA_INVALID', `halaman menghasilkan ${n} layer; maks ${OPS_MAX - 1} per impor`, { hint: 'pakai halaman yang lebih kecil atau impor sebagai paste per bagian' });
  }
  return { node: imported.node, report: imported.report, assets: imported.assets, size: { width: imported.width, height: imported.height } };
}

/** Jenis layar board dari lebar (konsisten dengan preset New file/BOARD_PRESETS). */
const screenOf = (width: number): 'landing' | 'app' | 'mobile' => (width >= 1024 ? 'landing' : width >= 600 ? 'app' : 'mobile');

/** Label riwayat default (dipotong aman di bawah batas). */
const describeImport = (title: string | undefined, finalUrl: string) => `Import page ${title ?? hostOf(finalUrl)}`.slice(0, 60);

const hostOf = (finalUrl: string): string => {
  try {
    return new URL(finalUrl).hostname;
  } catch {
    return finalUrl;
  }
};

async function commitUrlImport(opts: UrlImportRoutesOptions, slug: string, body: UrlImportBody, actor: Actor, onMissing: () => LakarError) {
  // Pra-cek dokumen+pageId SEBELUM fetch (seperti pasteParent di commitPaste): tujuan salah gagal cepat tanpa jaringan.
  const pre = opts.docs.get(slug) ?? (await opts.store.read(slug));
  if (!pre) throw onMissing();
  if (body.pageId && !resolveDocument(pre).pages.some((p) => p.id === body.pageId)) {
    throw new LakarError('NOT_FOUND', `halaman ${body.pageId} tidak ada di dokumen ${slug}`, { hint: 'pakai pageId dari dokumen (list_boards/inspect)' });
  }
  // Fetch di luar kunci dokumen: hanya atas permintaan eksplisit ini; skrip tidak dijalankan (murni GET HTML).
  // `checkPageUrl` dipanggil di route juga (bukan hanya di dalam fetcher default): `opts.page` yang
  // diinjeksikan host lain tetap tunduk pada validasi skema/kredensial/literal-IP yang sama.
  const page = await Promise.resolve()
    .then(() => {
      checkPageUrl(body.url);
      return (opts.page ?? fetchPageHtml)(body.url);
    })
    .catch((e: unknown) => {
      throw e instanceof NetError ? netToLakar(e) : e;
    });
  const width = Math.round(body.width ?? URL_IMPORT_DEFAULT_WIDTH);
  const imported = await importHtmlPage(opts, page.html, width, body.name);
  const description = body.description ?? describeImport(page.title, page.finalUrl);
  return opts.docLocks.run(slug, async () => {
    const current = opts.docs.get(slug) ?? (await opts.store.read(slug));
    if (!current) throw onMissing();
    const doc = resolveDocument(current);
    const target = body.pageId ? doc.pages.find((p) => p.id === body.pageId) : doc.pages[0];
    if (!target) {
      throw new LakarError('NOT_FOUND', `halaman ${body.pageId} tidak ada di dokumen ${slug}`, { hint: 'pakai pageId dari dokumen (list_boards/inspect)' });
    }
    const last = target.children.at(-1) as { x?: unknown; y?: unknown; width?: unknown } | undefined;
    const bx = Math.round(body.x ?? (last ? (typeof last.x === 'number' ? last.x : 0) + (typeof last.width === 'number' ? last.width : 0) + 80 : 0));
    const by = Math.round(body.y ?? (typeof last?.y === 'number' ? last.y : 0));
    const height = Math.max(1, Math.round(imported.size?.height ?? 800));
    const name = (body.name ?? page.title ?? hostOf(page.finalUrl)).slice(0, PASTE_NAME_MAX);
    const board = { type: 'board', name, x: bx, y: by, width, height, screen: body.screen ?? screenOf(width), fills: [{ type: 'solid', color: '#FFFFFF' }] };
    const ops: DocOp[] = [
      { op: 'add', parentId: target.id, node: board, ref: BOARD_REF },
      // Akar impor dipin di kiri-atas board (0,0): lebar board = lebar viewport, jadi akar memenuhi lebarnya.
      ...pasteOps(imported.node, { id: `@${BOARD_REF}`, type: 'board', width, height }, { x: 0, y: 0 }, imported.size),
    ];
    // Aset gambar (content-addressed) ditulis sebelum transaksi; bila commit gagal, aset yatim tidak merusak apa pun.
    if (imported.assets.length) {
      if (!opts.dataDir) throw new LakarError('RENDER_FAILED', 'store aset tidak tersedia untuk gambar HTML', { hint: 'jalankan lakard dengan dataDir', retryable: false });
      for (const a of imported.assets) await writeAsset(opts.dataDir, a.bytes);
    }
    const committed = await transact(current, { sessionId: actor.sessionId, description }, (tx) => applyOps(tx, ops));
    const entry = committed.entry!;
    const boards = touchedBoards(doc, resolveDocument(committed.doc));
    await opts.store.commit(slug, committed.doc, { ...entry, ...authorOf(actor) });
    opts.docs.set(slug, committed.doc);
    if (actor.session) opts.agentSteps?.onAgentWrite(actor.session, committed.doc.id, current.rev, committed.doc.rev, committed.inverse, description);
    const meta = { url: body.url, finalUrl: page.finalUrl, ...(page.title ? { title: page.title } : {}) };
    return {
      doc: committed.doc,
      created: committed.created,
      inverse: committed.inverse,
      refs: committed.value.refs,
      nodeId: committed.value.refs[ROOT_REF]!,
      boardId: committed.value.refs[BOARD_REF]!,
      boards,
      report: imported.report,
      page: meta,
    };
  });
}

export function registerUrlImportRoutes(app: FastifyInstance, opts: UrlImportRoutesOptions): void {
  app.post<{ Params: { slug: string } }>('/viewer/docs/:slug/import-url', async (req, reply) => {
    const { slug } = req.params;
    if (!SLUG_PATTERN.test(slug)) {
      throw new LakarError('SCHEMA_INVALID', `slug tidak valid: ${JSON.stringify(slug)}`, {
        hint: `slug harus cocok pola ${SLUG_PATTERN.source} (huruf kecil, angka, tanda hubung; maks 64)`,
      });
    }
    const body = parseUrlImportBody(req.body);
    const r = await commitUrlImport(opts, slug, body, { sessionId: VIEWER_CLIENT, client: VIEWER_CLIENT }, () =>
      new LakarError('NOT_FOUND', `dokumen ${slug} tidak ada`, { hint: 'pakai slug dari GET /viewer/docs' }),
    );
    const origin = originOf(req.headers);
    opts.activity?.change({ kind: 'edit', slug, rev: r.doc.rev, boards: r.boards, ...(origin ? { origin } : {}) });
    return reply.code(200).send({ ok: true, data: { slug, rev: r.doc.rev, created: r.created, inverse: r.inverse, refs: r.refs, nodeId: r.nodeId, boardId: r.boardId, report: r.report, page: r.page } });
  });

  app.post('/viewer/import-url', async (req, reply) => {
    const session = opts.sessions.require(req.headers[SESSION_HEADER]);
    const noDoc = () => new LakarError('NO_ACTIVE_DOC', 'sesi ini belum punya dokumen aktif', { hint: NO_ACTIVE_DOC_HINT });
    const slug = session.activeSlug;
    if (!slug) throw noDoc();
    const body = parseUrlImportBody(req.body);
    const r = await commitUrlImport(opts, slug, body, { sessionId: session.id, ...authorOf(session), session }, noDoc);
    return reply.code(200).send({
      ok: true,
      data: {
        docId: r.doc.id,
        slug,
        rev: r.doc.rev,
        created: r.created,
        nodeId: r.nodeId,
        boardId: r.boardId,
        boards: r.boards,
        report: r.report,
        page: r.page,
        // Target tulis (spec-agent-open-doc), sama dengan execute/paste.
        target: { slug, name: slug, boardIds: r.doc.pages.flatMap((p) => p.children.map((b) => b.id)) },
      },
    });
  });
}
