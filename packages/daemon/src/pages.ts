// Route tulis kelola halaman dari aplikasi (aplikasi 8): tambah, rename, pindah urutan, dan hapus halaman di
// `/viewer/docs/:slug/pages…`. Jalur commit sama dengan Restore (files.ts): kunci dokumen → `store.commit`
// (riwayat + snapshot) → salinan memori `docs`, riwayat atas nama sesi viewer, event aktivitas `tool:'pages'`
// supaya viewer lain memuat ulang. Bentuk respons AD-11 `{ok, data:{slug, rev, pageId}}`. Sandbox `/execute`
// dan tool MCP tidak berubah.
import type { FastifyInstance } from 'fastify';
import { IdAllocator, type DocumentLocks } from '@lakar/core';
import { ID_PATTERN, LakarError, SLUG_PATTERN, errorMessage, type HistoryEntry, type LakarDocument } from '@lakar/schema';
import { z } from 'zod';
import { VIEWER_CLIENT, publicSessionId, type ActivityBus, type ActivityCall } from './events.js';
import type { DocStore } from './store.js';

/** Panjang maksimum nama halaman (sesudah trim). */
export const PAGE_NAME_MAX = 100;

const PageName = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1, 'nama halaman tidak boleh kosong').max(PAGE_NAME_MAX, `nama halaman maks ${PAGE_NAME_MAX} karakter`));
const AddBody = z.object({ name: PageName.optional() }).strict();
const RenameBody = z.object({ name: PageName }).strict();
const MoveBody = z.object({ index: z.number().int() }).strict();

export type PageRoutesOptions = {
  /** Salinan memori daemon (AD-1); diperbarui setiap operasi. */
  docs: Map<string, LakarDocument>;
  store: DocStore;
  docLocks: DocumentLocks;
  /** Bus aktivitas: operasi halaman dipancarkan seperti tool call supaya viewer lain ikut memuat ulang. */
  activity?: ActivityBus;
};

const parse = <S extends z.ZodType>(schema: S, body: unknown, hint: string): z.output<S> => {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new LakarError('SCHEMA_INVALID', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint });
  return r.data;
};

const checkSlug = (slug: string) => {
  if (!SLUG_PATTERN.test(slug)) {
    throw new LakarError('SCHEMA_INVALID', `slug tidak valid: ${JSON.stringify(slug)}`, {
      hint: `slug harus cocok pola ${SLUG_PATTERN.source} (huruf kecil, angka, tanda hubung; maks 64)`,
    });
  }
};

/** Salinan `historyEntry` files.ts (files.ts sengaja tidak disentuh). */
const historyEntry = (rev: number, description: string, opsSummary: string): HistoryEntry => ({
  rev,
  sessionId: VIEWER_CLIENT,
  description,
  opsSummary,
  at: new Date().toISOString(),
});

/** Nama default "Page N": N mulai dari jumlah halaman + 1, naik sampai nama belum dipakai. */
export function defaultPageName(pages: readonly { name: string }[]): string {
  const used = new Set(pages.map((p) => p.name));
  for (let n = pages.length + 1; ; n++) {
    const name = `Page ${n}`;
    if (!used.has(name)) return name;
  }
}

/** Hasil mutasi: dokumen baru (tanpa rev; diisi `run`) + deskripsi riwayat, atau `null` = tanpa perubahan. */
type Mutation = { next: LakarDocument; description: string } | null;

export function registerPageRoutes(app: FastifyInstance, { docs, store, docLocks, activity }: PageRoutesOptions): void {
  let seq = 0;

  const pageIndexOf = (doc: LakarDocument, slug: string, pageId: string): number => {
    const i = ID_PATTERN.test(pageId) ? doc.pages.findIndex((p) => p.id === pageId) : -1;
    if (i === -1) throw new LakarError('NOT_FOUND', `halaman ${pageId} tidak ada di dokumen ${slug}`, { hint: 'muat ulang dokumen lalu pilih halaman lagi' });
    return i;
  };

  /**
   * Jalankan `mutate` di bawah kunci dokumen lalu commit (rev+1, satu entri riwayat, snapshot). `mutate`
   * mengembalikan `null` bila tidak ada perubahan: rev tetap, tanpa riwayat. Event aktivitas running→done/error.
   */
  const run = async (slug: string, label: string, mutate: (doc: LakarDocument) => { mutation: Mutation; pageId: string }) => {
    const t0 = Date.now();
    const call: ActivityCall = {
      callId: `pages-${t0.toString(36)}-${++seq}`,
      session: publicSessionId(VIEWER_CLIENT),
      client: VIEWER_CLIENT,
      tool: 'pages',
      slug,
      description: label,
      status: 'running',
      startedAt: new Date(t0).toISOString(),
    };
    activity?.emit({ type: 'call', call });
    try {
      const data = await docLocks.run(slug, async () => {
        // Dokumen belum dimuat (belum dibuka siapa pun): muat dari disk seperti open_doc.
        const current = docs.get(slug) ?? (await store.read(slug));
        if (!current) throw new LakarError('NOT_FOUND', `dokumen ${slug} tidak ada`, { hint: 'pakai slug dari GET /viewer/docs' });
        const { mutation, pageId } = mutate(structuredClone(current));
        if (!mutation) return { slug, rev: current.rev, pageId, description: undefined as string | undefined };
        const next: LakarDocument = { ...mutation.next, id: current.id, rev: current.rev + 1 };
        await store.commit(slug, next, historyEntry(next.rev, mutation.description, 'pages'));
        docs.set(slug, next);
        return { slug, rev: next.rev, pageId, description: mutation.description as string | undefined };
      });
      const { description, ...out } = data;
      activity?.emit({ type: 'call', call: { ...call, ...(description ? { description } : {}), status: 'done', durationMs: Date.now() - t0, rev: out.rev } });
      return out;
    } catch (e) {
      const err = e instanceof LakarError ? { code: e.code, message: e.message } : { code: 'EXEC_ERROR', message: errorMessage(e) };
      activity?.emit({ type: 'call', call: { ...call, status: 'error', durationMs: Date.now() - t0, error: err } });
      throw e;
    }
  };

  // Tambah halaman di akhir; nama default "Page N".
  app.post<{ Params: { slug: string } }>('/viewer/docs/:slug/pages', async (req, reply) => {
    const { slug } = req.params;
    checkSlug(slug);
    const body = parse(AddBody, req.body, 'kirim {name?} (1–100 karakter)');
    const data = await run(slug, 'Add page', (doc) => {
      const name = body.name ?? defaultPageName(doc.pages);
      const pageId = IdAllocator.forDocument(doc).next();
      doc.pages.push({ id: pageId, name, children: [] });
      return { mutation: { next: doc, description: `Added page ${JSON.stringify(name)}` }, pageId };
    });
    return reply.code(200).send({ ok: true, data });
  });

  // Rename: nama di-trim, 1–100 karakter. Nama sama → tanpa rev baru (seperti move ke indeks sama).
  app.post<{ Params: { slug: string; pageId: string } }>('/viewer/docs/:slug/pages/:pageId/rename', async (req, reply) => {
    const { slug, pageId } = req.params;
    checkSlug(slug);
    const { name } = parse(RenameBody, req.body, 'kirim {name} (1–100 karakter)');
    const data = await run(slug, 'Rename page', (doc) => {
      const i = pageIndexOf(doc, slug, pageId);
      if (doc.pages[i]!.name === name) return { mutation: null, pageId };
      doc.pages[i]!.name = name;
      return { mutation: { next: doc, description: `Renamed page to ${JSON.stringify(name)}` }, pageId };
    });
    return reply.code(200).send({ ok: true, data });
  });

  // Pindah ke indeks 0..n-1; indeks sama → tanpa rev baru.
  app.post<{ Params: { slug: string; pageId: string } }>('/viewer/docs/:slug/pages/:pageId/move', async (req, reply) => {
    const { slug, pageId } = req.params;
    checkSlug(slug);
    const { index } = parse(MoveBody, req.body, 'kirim {index} (bilangan bulat 0..jumlah halaman − 1)');
    const data = await run(slug, 'Move page', (doc) => {
      const from = pageIndexOf(doc, slug, pageId);
      if (index < 0 || index >= doc.pages.length) {
        throw new LakarError('SCHEMA_INVALID', `index harus 0..${doc.pages.length - 1}, bukan ${index}`, { hint: 'index = posisi akhir halaman di daftar' });
      }
      if (index === from) return { mutation: null, pageId };
      const [page] = doc.pages.splice(from, 1);
      doc.pages.splice(index, 0, page!);
      return { mutation: { next: doc, description: `Moved page ${JSON.stringify(page!.name)}` }, pageId };
    });
    return reply.code(200).send({ ok: true, data });
  });

  // Hapus halaman beserta board-nya; halaman terakhir → CONFLICT. Undo lewat Restore di History.
  app.delete<{ Params: { slug: string; pageId: string } }>('/viewer/docs/:slug/pages/:pageId', async (req, reply) => {
    const { slug, pageId } = req.params;
    checkSlug(slug);
    const data = await run(slug, 'Delete page', (doc) => {
      const i = pageIndexOf(doc, slug, pageId);
      if (doc.pages.length === 1) throw new LakarError('CONFLICT', `halaman ${pageId} adalah satu-satunya halaman ${slug}`, { hint: 'dokumen butuh setidaknya satu halaman' });
      const [page] = doc.pages.splice(i, 1);
      return { mutation: { next: doc, description: `Deleted page ${JSON.stringify(page!.name)}` }, pageId };
    });
    return reply.code(200).send({ ok: true, data });
  });
}
