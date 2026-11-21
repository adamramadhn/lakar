// HTTP API lakard (fastify, 127.0.0.1). Bentuk respons AD-11: {ok:true,data} | {ok:false,error}.
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { changedNodeIds, touchedBoards, boundsOf, glyphScan } from '@lakar/check';
import { DocumentLocks, createDocument, transact } from '@lakar/core';
import { photoRefsInCode, runSnippet } from '@lakar/exec';
import { IconCatalog } from '@lakar/icons';
import type { IconCatalogPort, RenderPort } from '@lakar/ports';
import { iconRefs } from '@lakar/render';
import { SKILL_NAMES, SKILLS_DIR, listSkills, readSkill } from '@lakar/skills';
import {
  ICON_LIBS,
  ICON_SEARCH_MAX_LIMIT,
  LAKAR_VERSION,
  LakarError,
  SCHEMA_VERSION,
  SLUG_PATTERN,
  SESSION_HEADER,
  errorMessage,
  VERSION_HINT,
  findBoard,
  resolveTokens,
  summarizeFindings,
  type ApiErrorBody,
  type ErrorCode,
  type IconGlyph,
  type LakarDocument,
  type ResolvedDocument,
} from '@lakar/schema';
import { z } from 'zod';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { readAsset } from './assets.js';
import { PhotoService, SEARCH_LIMIT_MAX } from './photos/service.js';
import { notFound } from './errors.js';
import { runCheck } from './check.js';
import { readRenderModule, RENDER_PAGE_HTML } from './chromium.js';
import type { DaemonConfig } from './config.js';
import { FontRegistry } from './fonts.js';
import { INSPECT_DEPTH_DEFAULT, INSPECT_DEPTH_MAX, WIP_PREFIX, boundsMap, inspectFit, locateNode } from './inspect.js';
import { readPngSize } from './png.js';
import { Sessions, UnknownSessionError, logExecute, recallFailed, rememberFailed } from './sessions.js';
import { DocStore } from './store.js';
import { ActivityBus, registerActivityHooks } from './events.js';
import { VIEWER_DIST_DIR, registerViewerRoutes } from './viewer.js';

const STATUS: Record<ErrorCode, number> = {
  SCHEMA_INVALID: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  NO_ACTIVE_DOC: 409,
  EXEC_TIMEOUT: 422,
  EXEC_ERROR: 422,
  ICON_UNKNOWN: 422,
  TOKEN_UNKNOWN: 422,
  FONT_MISSING: 422,
  RENDER_FAILED: 503,
  EXPORT_FAILED: 500,
  VERSION_MISMATCH: 409,
};

/** Route statis (modul render, font, aset): `<what> tidak ada`. */
const fileNotFound = (what: string) => notFound(`${what} tidak ada`, 'periksa path');

/** assetId fill gambar di subtree `n` (untuk catatan placeholder aset jarak jauh). */
function imageAssetIds(n: unknown, out: Set<string> = new Set()): Set<string> {
  const node = n as { fills?: { type?: string; assetId?: string }[]; children?: unknown[] };
  for (const f of node.fills ?? []) if (f.type === 'image' && typeof f.assetId === 'string') out.add(f.assetId);
  for (const c of node.children ?? []) imageAssetIds(c, out);
  return out;
}

/** Board pertama di halaman pertama: default screenshot/export tanpa id. */
const firstBoardId = (doc: { pages: readonly { children: readonly { id: string }[] }[] }): string | undefined => doc.pages[0]?.children[0]?.id;

const OpenBody = z.object({ slug: z.string() });
const ExecuteBody = z
  .object({
    code: z.string().min(1).optional(),
    description: z.string().optional(),
    editId: z.string().optional(),
    edits: z.array(z.object({ find: z.string().min(1), replace: z.string() }).strict()).optional(),
  })
  .strict();
const EXECUTE_BODY_HINT =
  "kirim {code, description} (description 3–8 kata, mis. 'tambah hero landing kopi') atau perbaikan {editId, edits:[{find, replace}], description?}";
const DESCRIPTION_EXAMPLE = "mis. description: 'tambah hero landing kopi'";

/** Label riwayat wajib 3–8 kata (AD-7). */
function descriptionProblem(description: string | undefined): string | undefined {
  if (description === undefined || !description.trim()) return 'description wajib diisi (label riwayat 3–8 kata)';
  const words = description.trim().split(/\s+/).length;
  if (words < 3 || words > 8) return `description harus 3–8 kata, bukan ${words} kata: ${JSON.stringify(description)}`;
  return undefined;
}

/** Terapkan edit find/replace berurutan; setiap `find` harus muncul tepat sekali di teks saat itu. */
function applyEdits(code: string, edits: { find: string; replace: string }[]): string {
  let out = code;
  edits.forEach(({ find, replace }, i) => {
    let count = 0;
    let at = -1;
    for (let pos = out.indexOf(find); pos !== -1; pos = out.indexOf(find, pos + 1)) {
      if (count === 0) at = pos;
      count++;
    }
    if (count !== 1) {
      throw new LakarError(
        'SCHEMA_INVALID',
        count === 0 ? `edits[${i}].find tidak ditemukan di snippet: ${JSON.stringify(find)}` : `edits[${i}].find muncul ${count} kali di snippet (harus tepat sekali): ${JSON.stringify(find)}`,
        {
          hint:
            count === 0
              ? 'find harus potongan teks persis dari snippet (termasuk spasi dan tanda kutip), setelah edit sebelumnya diterapkan; editId tetap berlaku'
              : 'perpanjang find dengan teks di sekitarnya agar unik; editId tetap berlaku',
        },
      );
    }
    out = out.slice(0, at) + replace + out.slice(at + find.length);
  });
  return out;
}
const ScreenshotBody = z.object({ boardId: z.string().optional(), nodeId: z.string().optional() }).strict().optional();
const SCREENSHOT_HINT = 'kirim {boardId?} (board; kosong = board pertama) ATAU {nodeId} (potret satu node), bukan keduanya';
const SessionBody = z.object({ client: z.string().max(64).optional(), version: z.string().max(64).optional(), schemaVersion: z.number().int().optional() }).strict().optional();
const InspectBody = z.object({ id: z.string().min(1), depth: z.number().int().min(0).max(INSPECT_DEPTH_MAX).optional() }).strict();
const ExportBody = z.object({ id: z.string().min(1).optional(), scale: z.union([z.literal(1), z.literal(2)]).optional() }).strict().optional();
const BoardsBody = z.object({}).strict().optional();
const SkillBody = z.object({ name: z.string().optional() }).strict().optional();
/** Maks sesi yang ditampilkan di `/status`. */
export const STATUS_SESSIONS_MAX = 10;
const LayoutCheckBody = z.object({ boardId: z.string().optional() }).strict().optional();
/** Batas entri `bounds` di respons execute. */
const BOUNDS_MAX = 60;
const NOT_COMMITTED = 'dokumen tidak di-commit (board tersentuh gagal dirender untuk check)';
const IconSearchBody = z
  .object({
    query: z.string().trim().min(1, 'query wajib (string tidak kosong)'),
    lib: z.enum(ICON_LIBS).optional(),
    limit: z.number().int().min(1).max(ICON_SEARCH_MAX_LIMIT).optional(),
  })
  .strict();
const PhotoSearchBody = z
  .object({
    query: z.string().trim().min(1, 'query wajib (string tidak kosong)').max(100, 'query maks 100 karakter'),
    orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
    limit: z.number().int().min(1).max(SEARCH_LIMIT_MAX).optional(),
    preview: z.boolean().optional(),
  })
  .strict();
const PHOTO_SEARCH_HINT = `kirim {query, orientation?, limit?, preview?}, mis. {query:'kamar hotel', orientation:'landscape'}; limit 1–${SEARCH_LIMIT_MAX} (default 6)`;
const ICON_SEARCH_HINT = "kirim {query, lib?, limit?}, mis. {query:'dumbbell'} atau {query:'github', lib:'simple-icons'}; limit 1–50 (default 10)";

export type BuildOptions = {
  config: DaemonConfig;
  render: RenderPort<ResolvedDocument>;
  /** Registry font yang disajikan di `/fonts/...` (default: dimuat dari paket Fontsource). */
  fonts?: FontRegistry;
  /** Katalog ikon (default: lucide-static + simple-icons terpasang). */
  icons?: IconCatalogPort<string, IconGlyph>;
  /** Direktori file skill (default `SKILLS_DIR` @lakar/skills). */
  skillsDir?: string;
  /** Layanan foto stok (default: Unsplash → Wikimedia → Openverse dengan key dari `config.unsplashKeyFile`). */
  photos?: PhotoService;
  /** Interval heartbeat SSE `/viewer/events` (default 15 dtk; untuk test). */
  activityHeartbeatMs?: number;
};

export type Daemon = {
  app: FastifyInstance;
  store: DocStore;
  sessions: Sessions;
  fonts: FontRegistry;
  icons: IconCatalogPort<string, IconGlyph>;
  photos: PhotoService;
  /** Bus event aktivitas viewer (`GET /viewer/events`). */
  activity: ActivityBus;
  startedAt: string;
};

export function buildServer({
  config,
  render,
  fonts = FontRegistry.load(),
  icons = IconCatalog.load(),
  skillsDir = SKILLS_DIR,
  photos = new PhotoService({ dataDir: config.dataDir, keyFile: config.pexelsKeyFile, unsplashKeyFile: config.unsplashKeyFile, unsplashAppName: config.unsplashAppName }),
  activityHeartbeatMs,
}: BuildOptions): Daemon {
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  const startedAt = new Date();
  const store = new DocStore(config.dataDir);
  const sessions = new Sessions();
  const activity = new ActivityBus();
  const docLocks = new DocumentLocks();
  /** Daemon pemilik tunggal (AD-1): salinan terkini per slug. */
  const docs = new Map<string, LakarDocument>();

  const ok = (reply: FastifyReply, data: unknown) => reply.code(200).send({ ok: true, data });
  /** Catatan aditif: foto jarak jauh yang tampil sebagai placeholder (cache dingin + jaringan gagal). */
  const placeholderNote = (node: unknown): { photos?: { placeholders: string[]; note: string } } => {
    const ids = photos.placeholders(imageAssetIds(node));
    return ids.length
      ? { photos: { placeholders: ids, note: 'foto jarak jauh belum bisa diambil (jaringan); tampil sebagai bidang warna foto, ulangi screenshot/export nanti' } }
      : {};
  };
  const fail = (reply: FastifyReply, err: ApiErrorBody, status: number) => reply.code(status).send({ ok: false, error: err });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof LakarError) {
      // Sesi tidak dikenal → 401 supaya klien tahu harus membuat sesi baru.
      const status = err instanceof UnknownSessionError ? 401 : STATUS[err.code];
      return fail(reply, err.toBody(), status);
    }
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return fail(reply, { code: 'SCHEMA_INVALID', message: e.message ?? 'permintaan tidak valid', hint: 'kirim body JSON sesuai API', retryable: false }, 400);
    }
    req.log.error(err);
    return fail(
      reply,
      { code: 'EXEC_ERROR', message: `kesalahan internal daemon: ${errorMessage(err)}`, hint: 'coba lagi; periksa log lakard', retryable: true },
      500,
    );
  });

  // Stream aktivitas viewer (Viewer B slice 2): hook di luar handler + `GET /viewer/events`. Didaftarkan
  // sebelum route supaya hook berlaku untuk semua route tool.
  registerActivityHooks(app, { sessions, bus: activity, ...(activityHeartbeatMs !== undefined ? { heartbeatMs: activityHeartbeatMs } : {}) });

  const parse = <T>(schema: z.ZodType<T>, body: unknown, hint: string): T => {
    const r = schema.safeParse(body);
    if (!r.success) {
      throw new LakarError('SCHEMA_INVALID', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint });
    }
    return r.data;
  };

  const activeDoc = (header: string | string[] | undefined) => {
    const session = sessions.require(header);
    if (!session.activeSlug) {
      throw new LakarError('NO_ACTIVE_DOC', 'sesi ini belum punya dokumen aktif', { hint: 'panggil open_doc {slug} terlebih dahulu' });
    }
    const slug = session.activeSlug;
    return { session, slug };
  };

  const nodeNotFound = (id: string, slug: string) => notFound(`node ${id} tidak ada di dokumen ${slug}`, 'pakai ID dari created[] execute atau list_boards');

  /** Ikon dokumen lama yang tidak dikenal katalog → ICON_UNKNOWN + 3 saran sebelum render (AD-9). */
  const assertIcons = (board: Parameters<typeof iconRefs>[0]) => {
    for (const r of iconRefs(board)) icons.canonical(r.lib, r.icon);
  };

  // Status daemon tanpa sesi (AD-11 `status`): versi, pool render, font, ikon, sesi.
  app.get('/status', async (_req, reply) => {
    const addr = app.server.address();
    const port = addr && typeof addr === 'object' ? addr.port : config.port;
    return ok(reply, {
      version: LAKAR_VERSION,
      schemaVersion: SCHEMA_VERSION,
      node: process.version,
      pid: process.pid,
      startedAt: startedAt.toISOString(),
      uptimeSec: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      host: config.host,
      port,
      dataDir: config.dataDir,
      pool: render.status?.() ?? null,
      fonts: { families: fonts.families(), missing: [...fonts.missing] },
      icons: { ...icons.versions },
      photos: photos.status(),
      sessions: {
        count: sessions.count,
        active: sessions.recent(STATUS_SESSIONS_MAX).map((x) => ({
          id: x.id.slice(0, 8),
          ...(x.activeSlug ? { activeSlug: x.activeSlug } : {}),
          createdAt: x.createdAt,
          ...(x.lastAt ? { lastAt: x.lastAt } : {}),
          executes: x.executes,
        })),
      },
    });
  });

  // Sesi baru (AD-17). Klien yang mengirim version/schemaVersion yang berbeda → VERSION_MISMATCH.
  app.post('/sessions', async (req, reply) => {
    const body = parse(SessionBody, req.body ?? undefined, 'kirim {client?, version?, schemaVersion?}');
    const versionDiff = body?.version !== undefined && body.version !== LAKAR_VERSION;
    const schemaDiff = body?.schemaVersion !== undefined && body.schemaVersion !== SCHEMA_VERSION;
    if (versionDiff || schemaDiff) {
      const who = body?.client ?? 'klien';
      throw new LakarError(
        'VERSION_MISMATCH',
        `versi tidak cocok: lakard ${LAKAR_VERSION} (schema ${SCHEMA_VERSION}), ${who} ${body?.version ?? '?'} (schema ${body?.schemaVersion ?? '?'})`,
        { hint: VERSION_HINT },
      );
    }
    return ok(reply, { sessionId: sessions.create(body?.client).id, version: LAKAR_VERSION, schemaVersion: SCHEMA_VERSION });
  });

  app.post('/docs/open', async (req, reply) => {
    const session = sessions.require(req.headers[SESSION_HEADER]);
    const { slug } = parse(OpenBody, req.body, 'kirim {slug}');
    if (!SLUG_PATTERN.test(slug)) {
      throw new LakarError('SCHEMA_INVALID', `slug tidak valid: ${JSON.stringify(slug)}`, {
        hint: `slug harus cocok pola ${SLUG_PATTERN.source} (huruf kecil, angka, tanda hubung; maks 64)`,
      });
    }
    const result = await docLocks.run(slug, async () => {
      let doc = docs.get(slug);
      let created = false;
      if (!doc) {
        doc = await store.read(slug);
        if (!doc) {
          doc = createDocument();
          await store.write(slug, doc);
          created = true;
        }
        docs.set(slug, doc);
      }
      return { docId: doc.id, slug, rev: doc.rev, created };
    });
    session.activeSlug = slug;
    return ok(reply, result);
  });

  app.post('/execute', async (req, reply) => {
    const { session, slug } = activeDoc(req.headers[SESSION_HEADER]);
    const body = parse(ExecuteBody, req.body, EXECUTE_BODY_HINT);
    if (body.code !== undefined && body.editId !== undefined) {
      throw new LakarError('SCHEMA_INVALID', 'kirim code ATAU editId, bukan keduanya', {
        hint: 'snippet baru → {code, description}; perbaikan snippet gagal → {editId, edits:[{find, replace}]}',
      });
    }
    if (body.code === undefined && body.editId === undefined) {
      throw new LakarError('SCHEMA_INVALID', 'code atau editId wajib', { hint: EXECUTE_BODY_HINT });
    }
    if (body.edits !== undefined && body.editId === undefined) {
      throw new LakarError('SCHEMA_INVALID', 'edits hanya berlaku bersama editId', { hint: 'kirim {editId, edits:[{find, replace}]} dengan editId dari error execute sebelumnya' });
    }

    // 1. Resolusi kode.
    let code: string;
    let description: string | undefined;
    if (body.editId !== undefined) {
      const prev = recallFailed(session, body.editId);
      if (!prev) {
        throw notFound(
          `editId ${body.editId} tidak dikenal di sesi ini`,
          'editId hanya berlaku di sesi yang sama dan hilang saat daemon restart; kirim ulang snippet lengkap: execute({code, description})',
        );
      }
      code = applyEdits(prev.code, body.edits ?? []);
      description = body.description ?? prev.description;
    } else {
      code = body.code!;
      description = body.description;
    }

    // Gagal setelah kode diketahui: simpan snippet, beri editId agar bisa diperbaiki tanpa mengirim ulang.
    const failWith = (err: LakarError, rev: number, extraHint?: string): LakarError => {
      const editId = rememberFailed(session, { code, description });
      logExecute(session, { at: new Date().toISOString(), description: description ?? '', ok: false, code: err.code, rev });
      const repair = `perbaiki tanpa mengirim ulang kode: execute({editId:'${editId}', edits:[{find:'<potongan lama persis>', replace:'<pengganti>'}]})`;
      const hint = [err.hint, extraHint ?? repair].filter(Boolean).join('; ');
      return new LakarError(err.code, err.message, { hint, retryable: err.retryable, editId });
    };

    // 2. Validasi description.
    const problem = descriptionProblem(description);
    if (problem) {
      throw failWith(new LakarError('SCHEMA_INVALID', problem, { hint: DESCRIPTION_EXAMPLE }), docs.get(slug)!.rev, 'kirim ulang tanpa kode: execute({editId, description})');
    }
    const label = description!.trim();

    // 3. Pre-impor foto literal `photo('<ref>')` (AD-7/AD-10): jaringan hanya di sini, di luar kunci dokumen.
    const refs = photoRefsInCode(code);
    if (refs.length) {
      try {
        await photos.importRefs(refs, { docId: docs.get(slug)!.id });
      } catch (e) {
        if (e instanceof LakarError) throw failWith(e, docs.get(slug)!.rev);
        throw e;
      }
    }

    // 4. Transaksi + snippet → commit → simpan → keep.
    const data = await docLocks.run(slug, async () => {
      const doc = docs.get(slug)!;
      let committed;
      try {
        // AD-4: error tak tertangkap di snippet → lempar di dalam body → rollback penuh oleh `transact`.
        committed = await transact(doc, { sessionId: session.id, description: label }, async (tx) => {
          const run = await runSnippet(code, tx, { timeoutMs: config.execTimeoutMs, memoryBytes: config.execMemoryBytes, keep: session.keep, icons, photos });
          if (!run.ok) throw run.error;
          return run;
        });
      } catch (e) {
        if (e instanceof LakarError) throw failWith(e, doc.rev);
        throw e;
      }
      const run = committed.value;
      let result = { docId: doc.id, rev: doc.rev, created: committed.created };
      let checked: { check: unknown; bounds: unknown; boundsTruncated?: number; checkMs: number; summary: ReturnType<typeof summarizeFindings> } | undefined;
      // Tanpa op sukses (snippet baca-saja): tidak ada revisi baru, file dan riwayat tidak disentuh, tanpa check.
      if (committed.entry !== null) {
        // AD-8: render board tersentuh pada salinan kerja + check sekali, LALU commit. Temuan tidak
        // menolak commit; error render (dokumen tidak bisa dirender) → rollback (belum ditulis).
        const t0 = performance.now();
        const before = resolveTokens(doc);
        const after = resolveTokens(committed.doc);
        const touched = touchedBoards(before, after);
        let ran;
        try {
          for (const id of touched) for (const r of iconRefs(findBoard(after, id)!)) icons.canonical(r.lib, r.icon);
          ran = await runCheck(render, after, touched);
        } catch (e) {
          if (e instanceof LakarError) {
            throw failWith(new LakarError(e.code, e.message, { hint: [e.hint, NOT_COMMITTED].filter(Boolean).join('; '), retryable: e.retryable }), doc.rev);
          }
          throw e;
        }
        const ids = [...touched, ...committed.created.map((c) => c.id), ...changedNodeIds(before, after, touched)];
        const { bounds, truncated } = boundsOf(ran.measures, ids, BOUNDS_MAX);
        const summary = summarizeFindings(ran.findings);
        checked = {
          check: { boards: touched, summary, findings: ran.findings },
          bounds,
          ...(truncated > 0 ? { boundsTruncated: truncated } : {}),
          checkMs: Math.round((performance.now() - t0) * 10) / 10,
          summary,
        };
        await store.commit(slug, committed.doc, committed.entry);
        docs.set(slug, committed.doc);
        result = { docId: committed.doc.id, rev: committed.doc.rev, created: committed.created };
      }
      session.keep = run.keep;
      logExecute(session, {
        at: new Date().toISOString(),
        description: label,
        ok: true,
        rev: result.rev,
        ...(checked ? { checkMs: checked.checkMs, summary: checked.summary } : {}),
      });
      return {
        ...result,
        ...(run.value !== undefined ? { value: run.value } : {}),
        ...(run.valueTruncated ? { valueTruncated: true } : {}),
        ...(run.logs.length ? { logs: run.logs.join('\n') } : {}),
        ...(checked
          ? { check: checked.check, bounds: checked.bounds, ...(checked.boundsTruncated !== undefined ? { boundsTruncated: checked.boundsTruncated } : {}) }
          : {}),
      };
    });
    return ok(reply, data);
  });

  app.post('/screenshot', async (req, reply) => {
    const { slug } = activeDoc(req.headers[SESSION_HEADER]);
    const body = parse(ScreenshotBody, req.body ?? undefined, SCREENSHOT_HINT);
    if (body?.boardId !== undefined && body.nodeId !== undefined) {
      throw new LakarError('SCHEMA_INVALID', 'kirim boardId ATAU nodeId, bukan keduanya', { hint: SCREENSHOT_HINT });
    }
    // AD-6/AD-16: render hanya menerima dokumen ter-resolve; token diselesaikan di daemon.
    const doc = resolveTokens(docs.get(slug)!);
    if (body?.nodeId !== undefined) {
      const hit = locateNode(doc, body.nodeId);
      if (!hit) throw nodeNotFound(body.nodeId, slug);
      assertIcons(hit.board);
      const png = await render.screenshot(doc, hit.board.id, hit.node.id === hit.board.id ? {} : { nodeId: hit.node.id });
      const size = readPngSize(png);
      return ok(reply, { boardId: hit.board.id, nodeId: hit.node.id, ...size, mimeType: 'image/png', png: Buffer.from(png).toString('base64'), ...placeholderNote(hit.node) });
    }
    const boardId = body?.boardId ?? firstBoardId(doc);
    const board = boardId ? findBoard(doc, boardId) : undefined;
    if (!boardId || !board) {
      throw boardId
        ? notFound(`board ${boardId} tidak ada di dokumen ${slug}`, 'pakai ID board dari created[] execute')
        : notFound(`dokumen ${slug} belum punya board`, 'buat board dulu lewat execute: add(null,{type:"board",...})');
    }
    // AD-9: ikon yang tidak dikenal katalog (mis. dokumen lama di disk) → ICON_UNKNOWN + 3 saran sebelum render.
    assertIcons(board);
    const png = await render.screenshot(doc, board.id);
    return ok(reply, { boardId: board.id, width: board.width, height: board.height, mimeType: 'image/png', png: Buffer.from(png).toString('base64'), ...placeholderNote(board) });
  });

  // Daftar board dokumen aktif (AD-11 `list_boards`).
  app.post('/boards', async (req, reply) => {
    const { slug } = activeDoc(req.headers[SESSION_HEADER]);
    parse(BoardsBody, req.body ?? undefined, 'kirim {} (tanpa argumen)');
    const stored = docs.get(slug)!;
    const resolved = resolveTokens(stored);
    const boards = resolved.pages.flatMap((p) =>
      p.children.map((b) => ({
        id: b.id,
        name: b.name,
        page: p.name,
        screen: b.screen,
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        ...(b.expectedSize ? { expectedSize: b.expectedSize } : {}),
        wip: b.name.startsWith(WIP_PREFIX),
        childCount: b.children.length,
      })),
    );
    return ok(reply, { docId: stored.id, slug, rev: stored.rev, boards });
  });

  // Inspect node/board (AD-11): properti tersimpan (token apa adanya) + bounds terukur + anak sampai depth.
  app.post('/inspect', async (req, reply) => {
    const { slug } = activeDoc(req.headers[SESSION_HEADER]);
    const body = parse(InspectBody, req.body, `kirim {id, depth?} (depth 0–${INSPECT_DEPTH_MAX}, default ${INSPECT_DEPTH_DEFAULT})`);
    const stored = docs.get(slug)!;
    const resolved = resolveTokens(stored);
    const hit = locateNode(stored, body.id);
    const rBoard = hit ? findBoard(resolved, hit.board.id) : undefined;
    if (!hit || !rBoard) throw nodeNotFound(body.id, slug);
    assertIcons(rBoard);
    // allowGlyphs (AD-8): teks dengan emoji/glyph ikon tetap terukur; temuannya milik layout_check.
    const measure = await render.measure(resolved, rBoard.id, { allowGlyphs: glyphScan(rBoard).allowGlyphs });
    const fit = inspectFit(hit.node, boundsMap(rBoard.id, measure), body.depth ?? INSPECT_DEPTH_DEFAULT);
    return ok(reply, { docId: stored.id, rev: stored.rev, boardId: rBoard.id, node: fit.node, ...(fit.truncated ? { truncated: true, depth: fit.depth } : {}) });
  });

  // Export PNG ke disk (AD-11 `export`): `<dataDir>/exports/<slug>/<id>-r<rev>@<scale>x.png`, tulis atomik.
  app.post('/export', async (req, reply) => {
    const { slug } = activeDoc(req.headers[SESSION_HEADER]);
    const body = parse(ExportBody, req.body ?? undefined, 'kirim {id?, scale?}: id board/node (default board pertama), scale 1 atau 2 (default 1)');
    const stored = docs.get(slug)!;
    const doc = resolveTokens(stored);
    const id = body?.id ?? firstBoardId(doc);
    if (!id) throw notFound(`dokumen ${slug} belum punya board`, 'buat board dulu lewat execute');
    const hit = locateNode(doc, id);
    if (!hit) throw nodeNotFound(id, slug);
    assertIcons(hit.board);
    const scale = body?.scale ?? 1;
    const png = await render.screenshot(doc, hit.board.id, { scale, ...(hit.node.id !== hit.board.id ? { nodeId: hit.node.id } : {}) });
    const { width, height } = readPngSize(png);
    const dir = join(config.dataDir, 'exports', slug);
    const path = join(dir, `${id}-r${stored.rev}@${scale}x.png`);
    const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(tmp, png);
      await rename(tmp, path);
    } catch (e) {
      await rm(tmp, { force: true }).catch(() => {});
      throw new LakarError('EXPORT_FAILED', `gagal menulis ${path}: ${errorMessage(e)}`, {
        hint: `periksa izin dan ruang disk ${join(config.dataDir, 'exports')}; coba lagi`,
        retryable: true,
      });
    }
    return ok(reply, { path, id, name: hit.node.name, rev: stored.rev, scale, width, height, bytes: png.byteLength, ...placeholderNote(hit.node) });
  });

  // Skill (AD-11 `read_skill`): tanpa name → daftar; nama di luar daftar / file belum ada → NOT_FOUND.
  app.post('/skills/read', async (req, reply) => {
    sessions.require(req.headers[SESSION_HEADER]);
    const body = parse(SkillBody, req.body ?? undefined, `kirim {name?}; name salah satu: ${SKILL_NAMES.join(', ')}`);
    const skills = listSkills(skillsDir);
    if (body?.name === undefined) return ok(reply, { skills });
    const content = await readSkill(body.name, skillsDir);
    if (content === undefined) {
      const available = skills.filter((x) => x.available).map((x) => x.name);
      throw notFound(
        `skill ${JSON.stringify(body.name)} tidak ada`,
        `skill dikenal: ${SKILL_NAMES.join(', ')}; tersedia: ${available.length ? available.join(', ') : '-'}`,
      );
    }
    return ok(reply, { name: body.name, content });
  });

  // Check G0 penuh (AD-8) pada board dokumen aktif. Dokumen immutable: dibaca tanpa kunci.
  app.post('/layout-check', async (req, reply) => {
    const { slug } = activeDoc(req.headers[SESSION_HEADER]);
    const body = parse(LayoutCheckBody, req.body ?? undefined, 'kirim {boardId?} (tanpa boardId = semua board dokumen aktif)');
    const stored = docs.get(slug)!;
    const doc = resolveTokens(stored);
    let boardIds: string[];
    if (body?.boardId !== undefined) {
      if (!findBoard(doc, body.boardId)) {
        throw notFound(
          `board ${body.boardId} tidak ada di dokumen ${slug}`,
          'pakai ID board dari created[] execute, atau panggil layout_check tanpa boardId untuk semua board',
        );
      }
      boardIds = [body.boardId];
    } else boardIds = doc.pages.flatMap((p) => p.children.map((b) => b.id));
    for (const id of boardIds) assertIcons(findBoard(doc, id)!);
    const ran = await runCheck(render, doc, boardIds);
    return ok(reply, { docId: stored.id, rev: stored.rev, boards: ran.boards, summary: summarizeFindings(ran.findings), findings: ran.findings });
  });

  // Pencarian ikon (AD-9): tanpa dokumen aktif, sesi wajib seperti endpoint lain.
  app.post('/icons/search', async (req, reply) => {
    sessions.require(req.headers[SESSION_HEADER]);
    const body = parse(IconSearchBody, req.body, ICON_SEARCH_HINT);
    const results = icons.search(body.query, { ...(body.lib ? { lib: body.lib } : {}), ...(body.limit !== undefined ? { limit: body.limit } : {}) });
    return ok(reply, { query: body.query, results });
  });

  // Pencarian foto stok: kandidat beratribusi + thumbnail pratinjau (base64). Pakai lewat photo('<ref>') di execute.
  app.post('/photos/search', async (req, reply) => {
    sessions.require(req.headers[SESSION_HEADER]);
    const body = parse(PhotoSearchBody, req.body, PHOTO_SEARCH_HINT);
    const res = await photos.search({
      query: body.query,
      ...(body.orientation ? { orientation: body.orientation } : {}),
      ...(body.limit !== undefined ? { limit: body.limit } : {}),
      ...(body.preview !== undefined ? { preview: body.preview } : {}),
    });
    return ok(reply, res);
  });

  // Halaman render untuk Chromium (dimuat oleh adaptor ChromiumRenderer).
  app.get('/render/page', async (_req, reply) => reply.type('text/html; charset=utf-8').send(RENDER_PAGE_HTML));
  app.get<{ Params: { file: string } }>('/render/:file', async (req, reply) => {
    const js = await readRenderModule(req.params.file);
    if (js === undefined) throw fileNotFound(`modul render ${req.params.file}`);
    return reply.type('text/javascript; charset=utf-8').send(js);
  });
  // Font lokal (AD-10): hanya file woff2 milik registry; path lain → 404.
  app.get<{ Params: { pkg: string; file: string } }>('/fonts/:pkg/:file', async (req, reply) => {
    const path = fonts.filePath(req.params.pkg, req.params.file);
    if (!path) throw fileNotFound(`font ${req.params.pkg}/${req.params.file}`);
    return reply.type('font/woff2').header('cache-control', 'public, max-age=31536000, immutable').send(await readFile(path));
  });

  // Viewer baca-saja (Viewer B slice 1): `/viewer/*` dan `/app/*`. Route lama tidak berubah.
  registerViewerRoutes(app, { docs, store, sessions, distDir: config.viewerDir ?? VIEWER_DIST_DIR });

  // Aset gambar (story 8): `<dataDir>/assets/<sha256>`, hanya raster dari magic bytes; lainnya → 404.
  // Aset jarak jauh (Unsplash): meta tanpa byte di `assets/`, disajikan dari cache render daemon (hotlink resmi saat
  // miss); cache dingin + jaringan gagal → placeholder berwarna foto (`no-store`, dicatat untuk respons screenshot/export).
  app.get<{ Params: { hash: string } }>('/assets/:hash', async (req, reply) => {
    const asset = await readAsset(config.dataDir, req.params.hash);
    if (asset) return reply.type(asset.type).header('cache-control', 'public, max-age=31536000, immutable').send(asset.body);
    const remote = await photos.remoteAsset(req.params.hash);
    if (!remote) throw fileNotFound(`aset ${req.params.hash}`);
    return reply.type(remote.type).header('cache-control', remote.placeholder ? 'no-store' : 'no-cache').send(remote.body);
  });

  return { app, store, sessions, fonts, icons, photos, activity, startedAt: startedAt.toISOString() };
}
