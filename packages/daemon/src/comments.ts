// Komentar canvas untuk agen (story 9.3): thread di root dokumen (`comments`, skema v10). Jalur commit
// sama dengan pages.ts/agent-pages.ts: kunci dokumen → clone → `store.commit` (riwayat + snapshot atas
// nama sesi via `authorOf`) → salinan memori → `noteWrite`. Event aktivitas mengalir lewat TOOL_ROUTES.
// Komentar bukan node — ops `execute` tidak menyentuhnya; ikut rev/snapshot jadi Restore mengembalikan
// komentar saat itu. Route viewer untuk menulis/membalas komentar dari aplikasi datang di story 9.4.
import type { FastifyInstance, FastifyReply } from 'fastify';
import { IdAllocator, type DocumentLocks } from '@lakar/core';
import { COMMENT_TEXT_MAX, ID_PATTERN, LakarError, SESSION_HEADER, type AnyNode, type CommentAuthor, type CommentThread, type HistoryEntry, type LakarDocument } from '@lakar/schema';
import { z } from 'zod';
import { activePageIndex, authorOf, noteWrite, type Session } from './sessions.js';
import type { DocStore } from './store.js';
import type { ActiveDoc } from './agent-pages.js';

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
const ListBody = z
  .object({ status: z.enum(['open', 'resolved', 'all']).optional(), pageId: ThreadId.optional(), kind: z.enum(['user', 'agent']).optional() })
  .strict();
const CreateBody = z
  .object({ text: Text, nodeId: ThreadId.optional(), pageId: ThreadId.optional(), x: Coord.optional(), y: Coord.optional() })
  .strict();
const ReplyBody = z.object({ threadId: ThreadId, text: Text }).strict();
const ResolveBody = z.object({ threadId: ThreadId, resolved: z.boolean().optional() }).strict();

/** Penulis pesan: agen = harness sesi (`x-lakar-agent`, fallback nama klien); tanpa sesi = pengguna viewer. */
const authorFor = (session: Session | undefined): CommentAuthor =>
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

export function registerCommentRoutes(app: FastifyInstance, { docs, store, docLocks, activeDoc }: CommentRoutesOptions): void {
  /** Commit pola agent-pages: kunci → clone → mutate → rev+1 + riwayat + snapshot → memori → noteWrite. */
  const run = async <T>(slug: string, session: Session, mutate: (doc: LakarDocument) => { changed: boolean; description: string; extra: T }): Promise<{ slug: string; rev: number } & T> =>
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
    let threads = doc.comments ?? [];
    if (body.status && body.status !== 'all') threads = threads.filter((t) => t.status === body.status);
    if (body.pageId) threads = threads.filter((t) => t.pageId === body.pageId);
    if (body.kind) threads = threads.filter((t) => t.messages[0]!.author.kind === body.kind);
    const open = (doc.comments ?? []).filter((t) => t.status === 'open').length;
    return ok(reply, { docId: doc.id, slug, rev: doc.rev, total: (doc.comments ?? []).length, open, threads });
  });

  // Buat thread: pin di layer ({nodeId}) atau titik bebas ({x,y}; pageId opsional → halaman aktif sesi).
  app.post('/comments/create', async (req, reply) => {
    const { session, slug } = activeDoc(req.headers[SESSION_HEADER]);
    const body = parse(CreateBody, req.body, 'kirim {text, nodeId} (pin di layer) atau {text, x, y, pageId?} (titik bebas)');
    const data = await run(slug, session, (doc) => {
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
          pageId = doc.pages[activePageIndex(session, doc)]!.id;
        }
      }
      const thread: CommentThread = {
        id: IdAllocator.forDocument(doc).next(),
        pageId,
        ...(nodeId !== undefined ? { nodeId } : {}),
        x: x!,
        y: y!,
        status: 'open',
        messages: [{ author: authorFor(session), text: body.text, at: new Date().toISOString() }],
      };
      (doc.comments ??= []).push(thread);
      return { changed: true, description: `Added comment ${thread.id}`, extra: { thread } };
    });
    return ok(reply, data);
  });

  // Balas thread: {threadId, text}.
  app.post('/comments/reply', async (req, reply) => {
    const { session, slug } = activeDoc(req.headers[SESSION_HEADER]);
    const body = parse(ReplyBody, req.body, 'kirim {threadId, text}');
    const data = await run(slug, session, (doc) => {
      const t = findThread(doc, slug, body.threadId);
      const message = { author: authorFor(session), text: body.text, at: new Date().toISOString() };
      t.messages.push(message);
      return { changed: true, description: `Replied to comment ${body.threadId}`, extra: { threadId: body.threadId, message, thread: t } };
    });
    return ok(reply, data);
  });

  // Resolve / buka kembali: {threadId, resolved?} (default true). Idempoten — status sama → tanpa rev baru.
  app.post('/comments/resolve', async (req, reply) => {
    const { session, slug } = activeDoc(req.headers[SESSION_HEADER]);
    const body = parse(ResolveBody, req.body, 'kirim {threadId, resolved?} (default true)');
    const resolved = body.resolved ?? true;
    const data = await run(slug, session, (doc) => {
      const t = findThread(doc, slug, body.threadId);
      if ((t.status === 'resolved') === resolved) {
        return { changed: false, description: '', extra: { threadId: body.threadId, status: t.status, ...(t.resolvedAt ? { resolvedAt: t.resolvedAt } : {}) } };
      }
      t.status = resolved ? 'resolved' : 'open';
      if (resolved) t.resolvedAt = new Date().toISOString();
      else delete t.resolvedAt;
      return { changed: true, description: `${resolved ? 'Resolved' : 'Reopened'} comment ${body.threadId}`, extra: { threadId: body.threadId, status: t.status, ...(t.resolvedAt ? { resolvedAt: t.resolvedAt } : {}) } };
    });
    return ok(reply, data);
  });
}
