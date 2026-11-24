// Route halaman untuk agen (story 9.2): daftar halaman, halaman aktif sesi, pindah halaman, buat halaman,
// dan outline pohon halaman. Berbeda dengan pages.ts (route `/viewer/*` milik aplikasi): `switch_page` hanya
// mengubah state SESI (tanpa rev, tanpa riwayat, tanpa memindahkan fokus viewer), dan `create_page` mencatat
// riwayat atas nama sesi agen (`authorOf`), bukan `lakar-viewer`. Event aktivitas mengalir lewat TOOL_ROUTES.
import type { FastifyInstance, FastifyReply } from 'fastify';
import { IdAllocator, type DocumentLocks } from '@lakar/core';
import { ID_PATTERN, LakarError, SESSION_HEADER, resolveDocument, type AnyNode, type HistoryEntry, type LakarDocument, type Page } from '@lakar/schema';
import { z } from 'zod';
import { INSPECT_DEPTH_DEFAULT, INSPECT_DEPTH_MAX } from './inspect.js';
import { NO_ACTIVE_DOC_HINT, activePageIndex, authorOf, noteWrite, type Session } from './sessions.js';
import type { DocStore } from './store.js';
import { PAGE_NAME_MAX, defaultPageName } from './pages.js';

/** Resolver sesi+dokumen aktif (definisi di server.ts; sama seperti registerVisualDiffRoutes). */
export type ActiveDoc = (header: string | string[] | undefined) => { session: Session; slug: string };

export type AgentPageRoutesOptions = {
  /** Salinan memori daemon (AD-1). */
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

const PageName = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1, 'nama halaman tidak boleh kosong').max(PAGE_NAME_MAX, `nama halaman maks ${PAGE_NAME_MAX} karakter`));
export const SwitchBody = z.object({ page: z.string().min(1, 'page tidak boleh kosong') }).strict();
export const CreateBody = z.object({ name: PageName.optional() }).strict();
export const TreeBody = z
  .object({
    page: z.string().min(1).optional(),
    depth: z.number().int().min(0).max(INSPECT_DEPTH_MAX).optional(),
  })
  .strict();

/** Ringkasan satu halaman untuk respons list/switch/tree. */
export const pageSummary = <P extends { id: string; name: string; children: readonly unknown[] }>(p: P, index: number) => ({ id: p.id, name: p.name, index, boards: p.children.length });

/**
 * Halaman dari nama ATAU id (open-pencil `switch_page` menerima keduanya). Id dicek dulu; nama tidak
 * unik → SCHEMA_INVALID (pakai id). Tidak ditemukan → NOT_FOUND dengan hint list_pages.
 */
export function resolvePageRef<P extends { id: string; name: string }>(doc: { pages: readonly P[] }, ref: string, slug: string): { page: P; index: number } {
  if (ID_PATTERN.test(ref)) {
    const index = doc.pages.findIndex((p) => p.id === ref);
    if (index !== -1) return { page: doc.pages[index]!, index };
  }
  const byName = doc.pages.map((p, i) => ({ p, i })).filter(({ p }) => p.name === ref);
  if (byName.length > 1) {
    throw new LakarError('SCHEMA_INVALID', `nama halaman ${JSON.stringify(ref)} dipakai ${byName.length} halaman di ${slug}`, {
      hint: 'pakai id halaman dari list_pages, bukan nama',
    });
  }
  if (byName.length === 1) return { page: byName[0]!.p, index: byName[0]!.i };
  const names = doc.pages.map((p) => p.name).join(', ');
  throw new LakarError('NOT_FOUND', `halaman ${JSON.stringify(ref)} tidak ada di dokumen ${slug}`, {
    hint: `lihat daftar dengan list_pages; halaman di dokumen ini: ${names}`,
  });
}

/** Panjang `content` teks maksimum di outline (hemat token). */
const CONTENT_MAX = 120;

/**
 * Outline ringkas sebuah node: id/type/name + geometri tersimpan + `content` teks terpotong; anak sampai
 * `depth`, lebih dalam → `childCount`. Mengembalikan `{node, truncated}` (`truncated` = ada pemotongan depth).
 */
export function outlineNode(n: AnyNode, depth: number): { node: Record<string, unknown>; truncated: boolean } {
  const out: Record<string, unknown> = { id: n.id, type: n.type, name: n.name };
  const rec = n as unknown as Record<string, unknown>;
  for (const k of ['x', 'y', 'width', 'height', 'layout', 'component'] as const) {
    if (rec[k] !== undefined) out[k] = rec[k];
  }
  if (typeof rec.content === 'string') {
    out.content = rec.content.length > CONTENT_MAX ? `${rec.content.slice(0, CONTENT_MAX)}…` : rec.content;
  }
  let truncated = false;
  const kids = 'children' in n ? (n.children as readonly AnyNode[]) : undefined;
  if (kids?.length) {
    if (depth > 0) {
      out.children = kids.map((c) => {
        const r = outlineNode(c, depth - 1);
        truncated ||= r.truncated;
        return r.node;
      });
    } else {
      out.childCount = kids.length;
      truncated = true;
    }
  }
  return { node: out, truncated };
}

export function registerAgentPageRoutes(app: FastifyInstance, { docs, store, docLocks, activeDoc }: AgentPageRoutesOptions): void {
  // Daftar halaman + halaman aktif sesi. Tanpa argumen.
  app.post('/pages', async (req, reply) => {
    const { session, slug } = activeDoc(req.headers[SESSION_HEADER]);
    parse(z.object({}).strict(), req.body, 'kirim {} (tanpa argumen)');
    const doc = docs.get(slug)!;
    const i = activePageIndex(session, doc);
    return ok(reply, { docId: doc.id, rev: doc.rev, pages: doc.pages.map(pageSummary), active: pageSummary(doc.pages[i]!, i) });
  });

  // Pindah halaman aktif sesi: {page} = nama atau id. State sesi — tanpa rev/riwayat.
  app.post('/pages/switch', async (req, reply) => {
    const { session, slug } = activeDoc(req.headers[SESSION_HEADER]);
    const body = parse(SwitchBody, req.body, 'kirim {page} (nama atau id halaman dari list_pages)');
    const doc = docs.get(slug)!;
    const { page, index } = resolvePageRef(doc, body.page.trim(), slug);
    const previousId = doc.pages[activePageIndex(session, doc)]!.id;
    session.activePage = page.id;
    return ok(reply, { docId: doc.id, rev: doc.rev, page: pageSummary(page, index), previous: { id: previousId } });
  });

  // Buat halaman di akhir dan jadikan aktif sesi. Riwayat atas nama sesi agen (bukan lakar-viewer).
  app.post('/pages/create', async (req, reply) => {
    const { session, slug } = activeDoc(req.headers[SESSION_HEADER]);
    const body = parse(CreateBody, req.body, 'kirim {name?} (1–100 karakter; kosongkan untuk "Page N")');
    const data = await docLocks.run(slug, async () => {
      const doc = docs.get(slug);
      if (!doc) throw new LakarError('NO_ACTIVE_DOC', 'sesi ini belum punya dokumen aktif', { hint: NO_ACTIVE_DOC_HINT });
      const name = body.name ?? defaultPageName(doc.pages);
      const next = structuredClone(doc);
      const pageId = IdAllocator.forDocument(next).next();
      next.pages.push({ id: pageId, name, children: [] });
      const committed: LakarDocument = { ...next, id: doc.id, rev: doc.rev + 1 };
      const entry: HistoryEntry = { rev: committed.rev, sessionId: session.id, ...authorOf(session), description: `Added page ${JSON.stringify(name)}`, opsSummary: 'pages', at: new Date().toISOString() };
      await store.commit(slug, committed, entry);
      docs.set(slug, committed);
      noteWrite(session, committed.id, doc.rev);
      return { slug, rev: committed.rev, page: { id: pageId, name, index: committed.pages.length - 1, boards: 0 } };
    });
    session.activePage = data.page.id;
    return ok(reply, data);
  });

  // Outline pohon halaman: {page?} (nama/id, default halaman aktif sesi), {depth?} 0..6 (default 2).
  app.post('/pages/tree', async (req, reply) => {
    const { session, slug } = activeDoc(req.headers[SESSION_HEADER]);
    const body = parse(TreeBody, req.body, `kirim {page?, depth?} (page = nama/id halaman; depth 0–${INSPECT_DEPTH_MAX}, default ${INSPECT_DEPTH_DEFAULT})`);
    const doc = docs.get(slug)!;
    const resolved = resolveDocument(doc);
    const { page, index } = body.page !== undefined ? resolvePageRef(resolved, body.page.trim(), slug) : (() => { const i = activePageIndex(session, resolved); return { page: resolved.pages[i]!, index: i }; })();
    const depth = body.depth ?? INSPECT_DEPTH_DEFAULT;
    let truncated = false;
    const children = page.children.map((b) => {
      const r = outlineNode(b, depth);
      truncated ||= r.truncated;
      return r.node;
    });
    return ok(reply, {
      docId: doc.id,
      rev: doc.rev,
      page: pageSummary(page as Page, index),
      children,
      ...(truncated ? { truncated: true, depth } : {}),
    });
  });
}
