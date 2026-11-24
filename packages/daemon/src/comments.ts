// Komentar canvas untuk agen (story 9.3): thread di root dokumen (`comments`, skema v10). Jalur commit
// sama dengan pages.ts/agent-pages.ts: kunci dokumen → clone → `store.commit` (riwayat + snapshot atas
// nama sesi via `authorOf`) → salinan memori → `noteWrite`. Event aktivitas mengalir lewat TOOL_ROUTES.
// Komentar bukan node — ops `execute` tidak menyentuhnya; ikut rev/snapshot jadi Restore mengembalikan
// komentar saat itu. Route viewer untuk menulis/membalas komentar dari aplikasi (story 9.4) ada di
// `registerViewerCommentRoutes` di bawah: `/viewer/docs/:slug/comments*`, penulis `{kind:'user', name:'You'}`,
// riwayat atas nama `lakar-viewer`, dan event `change` edit manual (preHandler butuh sesi).
import type { FastifyInstance, FastifyReply } from 'fastify';
import { IdAllocator, type DocumentLocks } from '@lakar/core';
import { COMMENT_TEXT_MAX, ID_PATTERN, LakarError, SESSION_HEADER, SLUG_PATTERN, type AnyNode, type CommentAuthor, type CommentThread, type HistoryEntry, type LakarDocument } from '@lakar/schema';
import { z } from 'zod';
import { VIEWER_CLIENT, originOf, type ActivityBus } from './events.js';
import { activePageIndex, authorOf, noteWrite, type Session } from './sessions.js';
import type { DocStore } from './store.js';
import type { ActiveDoc } from './agent-pages.js';
import { peekDocument } from './viewer.js';

export type CommentRoutesOptions = {
  docs: Map<string, LakarDocument>;
  store: DocStore;
  docLocks: DocumentLocks;
  activeDoc: ActiveDoc;
};

const parse = <S extends z.ZodType>(schema: S, body: unknown, hint: string): z.output<S> => {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new LakarError('SCHEMA_INVALID', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint });
  return r.data;
};

const ok = (reply: FastifyReply, data: unknown) => reply.code(200).send({ ok: true, data });

const Text = z.string().transform((s) => s.trim()).pipe(z.string().min(1, 'text tidak boleh kosong').max(COMMENT_TEXT_MAX, `text maks ${COMMENT_TEXT_MAX} karakter`));
const Coord = z.number().finite();
const ThreadId = z.string().regex(ID_PATTERN);
export const ListBody = z
  .object({ status: z.enum(['open', 'resolved', 'all']).optional(), pageId: ThreadId.optional(), kind: z.enum(['user', 'agent']).optional() })
  .strict();
export const CreateBody = z
  .object({ text: Text, nodeId: ThreadId.optional(), pageId: ThreadId.optional(), x: Coord.optional(), y: Coord.optional() })
  .strict();
export const ReplyBody = z.object({ threadId: ThreadId, text: Text }).strict();
export const ResolveBody = z.object({ threadId: ThreadId, resolved: z.boolean().optional() }).strict();
export const DeleteBody = z.object({ threadId: ThreadId }).strict();

/** Penulis pesan: agen = harness sesi (`x-lakar-agent`, fallback nama klien); tanpa sesi = pengguna viewer. */
export const authorFor = (session: Session | undefined): CommentAuthor =>
  session ? { kind: 'agent', name: session.agent ?? session.client ?? 'agent' } : { kind: 'user', name: 'You' };

type Entry = { node: AnyNode; pageId: string };
/** Cari node di seluruh halaman dokumen (untuk pin komentar di layer). */
function locateNode(doc: LakarDocument, id: string): Entry | undefined {
  const visit = (n: AnyNode, pageId: string): Entry | undefined => {
    if (n.id === id) return { node: n, pageId };
    if ('children' in n) for (const c of n.children) { const hit = visit(c, pageId); if (hit) return hit; }
    return undefined;
  };
  for (const p of doc.pages) for (const b of p.children) { const hit = visit(b, p.id); if (hit) return hit; }
  return undefined;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const findThread = (doc: LakarDocument, slug: string, threadId: string): CommentThread => {
  const t = (doc.comments ?? []).find((c) => c.id === threadId);
  if (!t) throw new LakarError('NOT_FOUND', `thread ${threadId} tidak ada di dokumen ${slug}`, { hint: 'pakai threadId dari list_comments' });
  return t;
};

/** Isi `doc` hasil clone; `changed:false` = tanpa rev baru (resolve idempoten). */
export type Mutate<T> = (doc: LakarDocument) => { changed: boolean; description: string; extra: T };

/**
 * Mutasi create (dipakai route agen dan viewer): pin di layer (`nodeId` → halaman node, x/y default posisi node
 * tersimpan) atau titik bebas (`x`,`y` wajib; `pageId` atau halaman dari `pageIndex` — sesi agen / halaman pertama).
 */
export const mutateCreate =
  (slug: string, body: z.output<typeof CreateBody>, author: CommentAuthor, pageIndex: (doc: LakarDocument) => number): Mutate<{ thread: CommentThread }> =>
  (doc) => {
    let pageId: string;
    let nodeId: string | undefined;
    let x = body.x;
    let y = body.y;
    if (body.nodeId !== undefined) {
      const hit = locateNode(doc, body.nodeId);
      if (!hit) throw new LakarError('NOT_FOUND', `node ${body.nodeId} tidak ada di dokumen ${slug}`, { hint: 'pakai id dari inspect/get_page_tree' });
      nodeId = body.nodeId;
      pageId = hit.pageId;
      const rec = hit.node as unknown as Record<string, unknown>;
      x ??= num(rec.x);
      y ??= num(rec.y);
    } else {
      if (x === undefined || y === undefined) {
        throw new LakarError('SCHEMA_INVALID', 'komentar titik bebas wajib {x, y}', { hint: 'kirim {text, nodeId} untuk pin di layer atau {text, x, y, pageId?} untuk titik bebas' });
      }
      if (body.pageId !== undefined) {
        if (!doc.pages.some((p) => p.id === body.pageId)) throw new LakarError('NOT_FOUND', `halaman ${body.pageId} tidak ada di dokumen ${slug}`, { hint: 'pakai pageId dari list_pages' });
        pageId = body.pageId;
      } else {
        pageId = doc.pages[pageIndex(doc)]!.id;
      }
    }
    const thread: CommentThread = {
      id: IdAllocator.forDocument(doc).next(),
      pageId,
      ...(nodeId !== undefined ? { nodeId } : {}),
      x: x!,
      y: y!,
      status: 'open',
      messages: [{ author, text: body.text, at: new Date().toISOString() }],
    };
    (doc.comments ??= []).push(thread);
    return { changed: true, description: `Added comment ${thread.id}`, extra: { thread } };
  };

/** Mutasi reply: pesan baru di akhir thread. */
export const mutateReply =
  (slug: string, body: z.output<typeof ReplyBody>, author: CommentAuthor): Mutate<{ threadId: string; message: CommentThread['messages'][number]; thread: CommentThread }> =>
  (doc) => {
    const t = findThread(doc, slug, body.threadId);
    const message = { author, text: body.text, at: new Date().toISOString() };
    t.messages.push(message);
    return { changed: true, description: `Replied to comment ${body.threadId}`, extra: { threadId: body.threadId, message, thread: t } };
  };

/** Mutasi resolve/reopen: idempoten — status sama → tanpa rev baru. */
export const mutateResolve =
  (slug: string, threadId: string, resolved: boolean): Mutate<{ threadId: string; status: CommentThread['status']; resolvedAt?: string }> =>
  (doc) => {
    const t = findThread(doc, slug, threadId);
    if ((t.status === 'resolved') === resolved) {
      return { changed: false, description: '', extra: { threadId, status: t.status, ...(t.resolvedAt ? { resolvedAt: t.resolvedAt } : {}) } };
    }
    t.status = resolved ? 'resolved' : 'open';
    if (resolved) t.resolvedAt = new Date().toISOString();
    else delete t.resolvedAt;
    return { changed: true, description: `${resolved ? 'Resolved' : 'Reopened'} comment ${threadId}`, extra: { threadId, status: t.status, ...(t.resolvedAt ? { resolvedAt: t.resolvedAt } : {}) } };
  };

/** Mutasi delete: thread dihapus permanen dari dokumen (restore lewat History bila perlu). Thread asing → 404. */
export const mutateDelete =
  (slug: string, threadId: string): Mutate<{ threadId: string }> =>
  (doc) => {
    const idx = (doc.comments ?? []).findIndex((c) => c.id === threadId);
    if (idx < 0) throw new LakarError('NOT_FOUND', `thread komentar ${threadId} tidak ada di dokumen ${slug}`, { hint: 'pakai threadId dari list_comments' });
    doc.comments!.splice(idx, 1);
    if (doc.comments!.length === 0) delete doc.comments;
    return { changed: true, description: `Deleted comment ${threadId}`, extra: { threadId } };
  };

/** Daftar thread `doc` dengan filter ListBody (dipakai route agen dan viewer). */
export const filterThreads = (doc: LakarDocument, body: z.output<typeof ListBody>): CommentThread[] => {
  let threads = doc.comments ?? [];
  if (body.status && body.status !== 'all') threads = threads.filter((t) => t.status === body.status);
  if (body.pageId) threads = threads.filter((t) => t.pageId === body.pageId);
  if (body.kind) threads = threads.filter((t) => t.messages[0]!.author.kind === body.kind);
  return threads;
};

export function registerCommentRoutes(app: FastifyInstance, { docs, store, docLocks, activeDoc }: CommentRoutesOptions): void {
  /** Commit pola agent-pages: kunci → clone → mutate → rev+1 + riwayat + snapshot → memori → noteWrite. */
  const run = async <T>(slug: string, session: Session, mutate: Mutate<T>): Promise<{ slug: string; rev: number } & T> =>
    docLocks.run(slug, async () => {
      const doc = docs.get(slug)!;
      const next = structuredClone(doc);
      const { changed, description, extra } = mutate(next);
      if (!changed) return { slug, rev: doc.rev, ...extra };
      const committed: LakarDocument = { ...next, id: doc.id, rev: doc.rev + 1 };
      const entry: HistoryEntry = { rev: committed.rev, sessionId: session.id, ...authorOf(session), description, opsSummary: 'comments', at: new Date().toISOString() };
      await store.commit(slug, committed, entry);
      docs.set(slug, committed);
      noteWrite(session, committed.id, doc.rev);
      return { slug, rev: committed.rev, ...extra };
    });

  // Daftar thread di dokumen aktif; filter status (open/resolved/all), pageId, kind penulis pembuka.
  app.post('/comments', async (req, reply) => {
    const { slug } = activeDoc(req.headers[SESSION_HEADER]);
    const body = parse(ListBody, req.body, 'kirim {status?, pageId?, kind?} (semua opsional)');
    const doc = docs.get(slug)!;
    const open = (doc.comments ?? []).filter((t) => t.status === 'open').length;
    return ok(reply, { docId: doc.id, slug, rev: doc.rev, total: (doc.comments ?? []).length, open, threads: filterThreads(doc, body) });
  });

  // Buat thread: pin di layer ({nodeId}) atau titik bebas ({x,y}; pageId opsional → halaman aktif sesi).
  app.post('/comments/create', async (req, reply) => {
    const { session, slug } = activeDoc(req.headers[SESSION_HEADER]);
    const body = parse(CreateBody, req.body, 'kirim {text, nodeId} (pin di layer) atau {text, x, y, pageId?} (titik bebas)');
    const data = await run(slug, session, mutateCreate(slug, body, authorFor(session), (doc) => activePageIndex(session, doc)));
    return ok(reply, data);
  });

  // Balas thread: {threadId, text}.
  app.post('/comments/reply', async (req, reply) => {
    const { session, slug } = activeDoc(req.headers[SESSION_HEADER]);
    const body = parse(ReplyBody, req.body, 'kirim {threadId, text}');
    const data = await run(slug, session, mutateReply(slug, body, authorFor(session)));
    return ok(reply, data);
  });

  // Resolve / buka kembali: {threadId, resolved?} (default true). Idempoten — status sama → tanpa rev baru.
  app.post('/comments/resolve', async (req, reply) => {
    const { session, slug } = activeDoc(req.headers[SESSION_HEADER]);
    const body = parse(ResolveBody, req.body, 'kirim {threadId, resolved?} (default true)');
    const data = await run(slug, session, mutateResolve(slug, body.threadId, body.resolved ?? true));
    return ok(reply, data);
  });

  // Hapus thread permanen (bukan resolve — dokumen kehilangan threadnya; restore lewat History).
  app.post('/comments/delete', async (req, reply) => {
    const { session, slug } = activeDoc(req.headers[SESSION_HEADER]);
    const body = parse(DeleteBody, req.body, 'kirim {threadId}');
    const data = await run(slug, session, mutateDelete(slug, body.threadId));
    return ok(reply, data);
  });
}

export type ViewerCommentRoutesOptions = {
  docs: Map<string, LakarDocument>;
  store: DocStore;
  docLocks: DocumentLocks;
  /** Bus aktivitas: tulis komentar sukses memancarkan `change` edit supaya jendela viewer lain memuat ulang. */
  activity?: ActivityBus;
};

/** Thread di respons list viewer: nama halaman/layer untuk panel komentar (aditif; dokumen tersimpan tidak berubah). */
export type ViewerCommentThread = CommentThread & { pageName?: string; nodeName?: string };

/**
 * Route komentar aplikasi (`/viewer/docs/:slug/comments*`, story 9.4). Mutasi dan validasi sama dengan route
 * agen (`mutateCreate`/`mutateReply`/`mutateResolve`); bedanya dokumen dari param `slug` (bukan sesi), penulis
 * selalu pengguna (`authorFor(undefined)` = `{kind:'user', name:'You'}`), riwayat `lakar-viewer` seperti kelola
 * file, pageId default halaman pertama, dan event `change` edit dipancarkan manual (preHandler butuh sesi).
 */
export function registerViewerCommentRoutes(app: FastifyInstance, { docs, store, docLocks, activity }: ViewerCommentRoutesOptions): void {
  const checkSlug = (slug: string) => {
    if (!SLUG_PATTERN.test(slug)) {
      throw new LakarError('SCHEMA_INVALID', `slug tidak valid: ${JSON.stringify(slug)}`, {
        hint: `slug harus cocok pola ${SLUG_PATTERN.source} (huruf kecil, angka, tanda hubung; maks 64)`,
      });
    }
  };
  const notFound = (slug: string) => new LakarError('NOT_FOUND', `dokumen ${slug} tidak ada`, { hint: 'pakai slug dari GET /viewer/docs' });
  // Paritas `noteWrite` route agen: viewer tidak punya sesi, jadi basis tulis disimpan di objek bersama ini.
  const viewerWrites: Pick<Session, 'bases'> = {};

  /** Commit pola `run` route agen, atas nama viewer: kunci → clone → mutate → riwayat `lakar-viewer` → memori. */
  const run = async <T>(slug: string, mutate: Mutate<T>): Promise<{ slug: string; rev: number; changed: boolean } & T> =>
    docLocks.run(slug, async () => {
      const doc = docs.get(slug) ?? (await store.read(slug));
      if (!doc) throw notFound(slug);
      const next = structuredClone(doc);
      const { changed, description, extra } = mutate(next);
      if (!changed) return { slug, rev: doc.rev, changed: false, ...extra };
      const committed: LakarDocument = { ...next, id: doc.id, rev: doc.rev + 1 };
      const entry: HistoryEntry = { rev: committed.rev, sessionId: VIEWER_CLIENT, client: VIEWER_CLIENT, description, opsSummary: 'comments', at: new Date().toISOString() };
      await store.commit(slug, committed, entry);
      docs.set(slug, committed);
      noteWrite(viewerWrites, committed.id, doc.rev);
      return { slug, rev: committed.rev, changed: true, ...extra };
    });

  /** Event `change` edit untuk jendela lain hanya bila rev naik (resolve idempoten tidak memancarkan apa pun). */
  const notify = (headers: Record<string, string | string[] | undefined>, data: { slug: string; rev: number; changed: boolean }) => {
    if (!data.changed) return;
    const origin = originOf(headers);
    activity?.change({ kind: 'edit', slug: data.slug, rev: data.rev, ...(origin ? { origin } : {}) });
  };

  // Daftar thread (bentuk respons route agen + nama halaman/layer untuk panel). Dokumen dari disk bila belum dimuat.
  app.post<{ Params: { slug: string } }>('/viewer/docs/:slug/comments', async (req, reply) => {
    const { slug } = req.params;
    checkSlug(slug);
    const body = parse(ListBody, req.body, 'kirim {status?, pageId?, kind?} (semua opsional)');
    const doc = docs.get(slug) ?? (await peekDocument(store, slug));
    if (!doc) throw notFound(slug);
    const threads: ViewerCommentThread[] = filterThreads(doc, body).map((t) => {
      const pageName = doc.pages.find((p) => p.id === t.pageId)?.name;
      const entry = t.nodeId !== undefined ? locateNode(doc, t.nodeId) : undefined;
      const nodeName = entry ? (entry.node as { name?: string }).name : undefined;
      return { ...t, ...(pageName ? { pageName } : {}), ...(nodeName ? { nodeName } : {}) };
    });
    const open = (doc.comments ?? []).filter((t) => t.status === 'open').length;
    return ok(reply, { docId: doc.id, slug, rev: doc.rev, total: (doc.comments ?? []).length, open, threads });
  });

  // Buat thread dari aplikasi: pin di layer ({nodeId}) atau titik bebas ({x,y}; pageId → halaman pertama).
  app.post<{ Params: { slug: string } }>('/viewer/docs/:slug/comments/create', async (req, reply) => {
    const { slug } = req.params;
    checkSlug(slug);
    const body = parse(CreateBody, req.body, 'kirim {text, nodeId} (pin di layer) atau {text, x, y, pageId?} (titik bebas)');
    const data = await run(slug, mutateCreate(slug, body, authorFor(undefined), () => 0));
    notify(req.headers, data);
    return ok(reply, { slug: data.slug, rev: data.rev, thread: data.thread });
  });

  // Balas thread dari aplikasi.
  app.post<{ Params: { slug: string } }>('/viewer/docs/:slug/comments/reply', async (req, reply) => {
    const { slug } = req.params;
    checkSlug(slug);
    const body = parse(ReplyBody, req.body, 'kirim {threadId, text}');
    const data = await run(slug, mutateReply(slug, body, authorFor(undefined)));
    notify(req.headers, data);
    return ok(reply, { slug: data.slug, rev: data.rev, threadId: data.threadId, message: data.message, thread: data.thread });
  });

  // Resolve / buka kembali dari aplikasi: {threadId, resolved?} (default true). Idempoten.
  app.post<{ Params: { slug: string } }>('/viewer/docs/:slug/comments/resolve', async (req, reply) => {
    const { slug } = req.params;
    checkSlug(slug);
    const body = parse(ResolveBody, req.body, 'kirim {threadId, resolved?} (default true)');
    const data = await run(slug, mutateResolve(slug, body.threadId, body.resolved ?? true));
    notify(req.headers, data);
    return ok(reply, { slug: data.slug, rev: data.rev, threadId: data.threadId, status: data.status, ...(data.resolvedAt ? { resolvedAt: data.resolvedAt } : {}) });
  });

  // Hapus thread permanen dari aplikasi.
  app.post<{ Params: { slug: string } }>('/viewer/docs/:slug/comments/delete', async (req, reply) => {
    const { slug } = req.params;
    checkSlug(slug);
    const body = parse(DeleteBody, req.body, 'kirim {threadId}');
    const data = await run(slug, mutateDelete(slug, body.threadId));
    notify(req.headers, data);
    return ok(reply, { slug: data.slug, rev: data.rev, threadId: data.threadId });
  });
}
