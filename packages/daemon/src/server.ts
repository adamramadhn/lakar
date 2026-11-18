// HTTP API lakard (fastify, 127.0.0.1). Bentuk respons AD-11: {ok:true,data} | {ok:false,error}.
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { DocumentLocks, createDocument, transact } from '@lakar/core';
import { runSnippet } from '@lakar/exec';
import type { RenderPort } from '@lakar/ports';
import { findBoard } from '@lakar/render';
import {
  LakarError,
  SLUG_PATTERN,
  resolveTokens,
  type ApiErrorBody,
  type ErrorCode,
  type LakarDocument,
  type ResolvedDocument,
} from '@lakar/schema';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { readAsset } from './assets.js';
import { readRenderModule, RENDER_PAGE_HTML } from './chromium.js';
import type { DaemonConfig } from './config.js';
import { FontRegistry } from './fonts.js';
import { SESSION_HEADER, Sessions, UnknownSessionError, logExecute, recallFailed, rememberFailed } from './sessions.js';
import { DocStore } from './store.js';

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

const notFound = (what: string) => new LakarError('NOT_FOUND', `${what} tidak ada`, { hint: 'periksa path' });

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
const ScreenshotBody = z.object({ boardId: z.string().optional() }).optional();

export type BuildOptions = {
  config: DaemonConfig;
  render: RenderPort<ResolvedDocument>;
  /** Registry font yang disajikan di `/fonts/...` (default: dimuat dari paket Fontsource). */
  fonts?: FontRegistry;
};

export type Daemon = { app: FastifyInstance; store: DocStore; sessions: Sessions; fonts: FontRegistry };

export function buildServer({ config, render, fonts = FontRegistry.load() }: BuildOptions): Daemon {
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  const store = new DocStore(config.dataDir);
  const sessions = new Sessions();
  const docLocks = new DocumentLocks();
  /** Daemon pemilik tunggal (AD-1): salinan terkini per slug. */
  const docs = new Map<string, LakarDocument>();

  const ok = (reply: FastifyReply, data: unknown) => reply.code(200).send({ ok: true, data });
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
      { code: 'EXEC_ERROR', message: `kesalahan internal daemon: ${e.message ?? String(err)}`, hint: 'coba lagi; periksa log lakard', retryable: true },
      500,
    );
  });

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

  app.post('/sessions', async (_req, reply) => ok(reply, { sessionId: sessions.create().id }));

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
        throw new LakarError('NOT_FOUND', `editId ${body.editId} tidak dikenal di sesi ini`, {
          hint: 'editId hanya berlaku di sesi yang sama dan hilang saat daemon restart; kirim ulang snippet lengkap: execute({code, description})',
        });
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

    // 3. Transaksi + snippet → commit → simpan → keep.
    const data = await docLocks.run(slug, async () => {
      const doc = docs.get(slug)!;
      let committed;
      try {
        // AD-4: error tak tertangkap di snippet → lempar di dalam body → rollback penuh oleh `transact`.
        committed = await transact(doc, { sessionId: session.id, description: label }, async (tx) => {
          const run = await runSnippet(code, tx, { timeoutMs: config.execTimeoutMs, memoryBytes: config.execMemoryBytes, keep: session.keep });
          if (!run.ok) throw run.error;
          return run;
        });
      } catch (e) {
        if (e instanceof LakarError) throw failWith(e, doc.rev);
        throw e;
      }
      const run = committed.value;
      let result = { docId: doc.id, rev: doc.rev, created: committed.created };
      // Tanpa op sukses (snippet baca-saja): tidak ada revisi baru, file dan riwayat tidak disentuh.
      if (committed.entry !== null) {
        await store.commit(slug, committed.doc, committed.entry);
        docs.set(slug, committed.doc);
        result = { docId: committed.doc.id, rev: committed.doc.rev, created: committed.created };
      }
      session.keep = run.keep;
      logExecute(session, { at: new Date().toISOString(), description: label, ok: true, rev: result.rev });
      return {
        ...result,
        ...(run.value !== undefined ? { value: run.value } : {}),
        ...(run.valueTruncated ? { valueTruncated: true } : {}),
        ...(run.logs.length ? { logs: run.logs.join('\n') } : {}),
      };
    });
    return ok(reply, data);
  });

  app.post('/screenshot', async (req, reply) => {
    const { slug } = activeDoc(req.headers[SESSION_HEADER]);
    const body = parse(ScreenshotBody, req.body ?? undefined, 'kirim {boardId?}');
    // AD-6/AD-16: render hanya menerima dokumen ter-resolve; token diselesaikan di daemon.
    const doc = resolveTokens(docs.get(slug)!);
    const boardId = body?.boardId ?? doc.pages[0]?.children[0]?.id;
    const board = boardId ? findBoard(doc, boardId) : undefined;
    if (!boardId || !board) {
      throw new LakarError('NOT_FOUND', boardId ? `board ${boardId} tidak ada di dokumen ${slug}` : `dokumen ${slug} belum punya board`, {
        hint: boardId ? 'pakai ID board dari created[] execute' : 'buat board dulu lewat execute: add(null,{type:"board",...})',
      });
    }
    const png = await render.screenshot(doc, board.id);
    return ok(reply, { boardId: board.id, width: board.width, height: board.height, mimeType: 'image/png', png: Buffer.from(png).toString('base64') });
  });

  // Halaman render untuk Chromium (dimuat oleh adaptor ChromiumRenderer).
  app.get('/render/page', async (_req, reply) => reply.type('text/html; charset=utf-8').send(RENDER_PAGE_HTML));
  app.get<{ Params: { file: string } }>('/render/:file', async (req, reply) => {
    const js = await readRenderModule(req.params.file);
    if (js === undefined) throw notFound(`modul render ${req.params.file}`);
    return reply.type('text/javascript; charset=utf-8').send(js);
  });
  // Font lokal (AD-10): hanya file woff2 milik registry; path lain → 404.
  app.get<{ Params: { pkg: string; file: string } }>('/fonts/:pkg/:file', async (req, reply) => {
    const path = fonts.filePath(req.params.pkg, req.params.file);
    if (!path) throw notFound(`font ${req.params.pkg}/${req.params.file}`);
    return reply.type('font/woff2').header('cache-control', 'public, max-age=31536000, immutable').send(await readFile(path));
  });

  // Aset gambar (story 8): `<dataDir>/assets/<sha256>`, hanya raster dari magic bytes; lainnya → 404.
  app.get<{ Params: { hash: string } }>('/assets/:hash', async (req, reply) => {
    const asset = await readAsset(config.dataDir, req.params.hash);
    if (!asset) throw notFound(`aset ${req.params.hash}`);
    return reply.type(asset.type).header('cache-control', 'public, max-age=31536000, immutable').send(asset.body);
  });

  return { app, store, sessions, fonts };
}
