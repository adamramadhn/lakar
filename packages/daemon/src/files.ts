// Route tulis kelola file dari aplikasi (aplikasi 1): New file, rename, duplicate, archive, unarchive, delete,
// dan daftar arsip di `/viewer/*`. Bentuk respons AD-11. Route dan tool MCP lama tidak berubah.
// Setiap operasi memegang kunci `#files` (alokasi slug serial) lalu kunci per slug yang disentuh (urut nama,
// tanpa deadlock), dan menjaga salinan memori `docs` serta `activeSlug` sesi tetap konsisten dengan disk.
import type { FastifyInstance } from 'fastify';
import { IdAllocator, createDocument, transact, type DocumentLocks } from '@lakar/core';
import { LakarError, SLUG_PATTERN, errorMessage, type HistoryEntry, type LakarDocument } from '@lakar/schema';
import { z } from 'zod';
import { VIEWER_CLIENT } from './events.js';
import type { Sessions } from './sessions.js';
import type { DocStore } from './store.js';
import { peekDocument, summarize, type ViewerDocSummary } from './viewer.js';

/** Panjang maksimum slug (sama dengan `SLUG_PATTERN`). */
export const SLUG_MAX = 64;

/** Kunci global kelola file; `#` tidak valid di slug, jadi tidak bentrok dengan kunci dokumen. */
const FILES_LOCK = '#files';

/** Board awal New file per preset. Custom: lebar/tinggi 1..10000, screen `app`. */
export const BOARD_PRESETS = {
  desktop: { name: 'Desktop', width: 1440, height: 900, screen: 'landing' },
  tablet: { name: 'Tablet', width: 768, height: 1024, screen: 'app' },
  mobile: { name: 'Mobile', width: 375, height: 812, screen: 'mobile' },
} as const;

/**
 * Nama bebas → slug kebab-case (`My Landing` → `my-landing`): diakritik dibuang, huruf kecil, selain [a-z0-9]
 * jadi `-`, dipotong ke 64. Hasil kosong berarti nama tidak bisa dipakai. Salinan di packages/viewer/src/files.ts.
 */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');
}

/** `base` dengan sufiks `-n` (n ≥ 2), dipotong agar tetap ≤ 64 karakter. */
export function withSuffix(base: string, n: number): string {
  if (n <= 1) return base;
  const sfx = `-${n}`;
  return `${base.slice(0, SLUG_MAX - sfx.length).replace(/-+$/, '')}${sfx}`;
}

const NameField = z.string().max(200, 'name maks 200 karakter');
const CreateBody = z
  .object({
    name: NameField,
    board: z
      .discriminatedUnion('preset', [
        z.object({ preset: z.literal('desktop') }).strict(),
        z.object({ preset: z.literal('tablet') }).strict(),
        z.object({ preset: z.literal('mobile') }).strict(),
        z.object({ preset: z.literal('custom'), width: z.number().int().min(1).max(10000), height: z.number().int().min(1).max(10000) }).strict(),
      ])
      .optional(),
  })
  .strict();
const CREATE_HINT = "kirim {name, board?:{preset:'desktop'|'tablet'|'mobile'} | {preset:'custom', width, height}} (width/height 1–10000)";
const RenameBody = z.object({ name: NameField }).strict();
const DeleteQuery = z.object({ archived: z.enum(['true', 'false']).optional() }).strict();

export type FileRoutesOptions = {
  /** Salinan memori daemon (AD-1); diperbarui setiap operasi. */
  docs: Map<string, LakarDocument>;
  store: DocStore;
  sessions: Sessions;
  docLocks: DocumentLocks;
  /** Pencatat masalah non-fatal (file arsip rusak dilewati). Default `console.warn`. */
  log?: (message: string) => void;
};

const parse = <T>(schema: z.ZodType<T>, body: unknown, hint: string): T => {
  const r = schema.safeParse(body);
  if (!r.success) throw new LakarError('SCHEMA_INVALID', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint });
  return r.data;
};

const slugOf = (name: string): string => {
  const slug = slugify(name);
  if (!slug || !SLUG_PATTERN.test(slug)) {
    throw new LakarError('SCHEMA_INVALID', `nama ${JSON.stringify(name)} tidak menghasilkan nama file yang valid`, {
      hint: 'pakai huruf atau angka, mis. "My Landing" → my-landing',
    });
  }
  return slug;
};

const checkSlug = (slug: string) => {
  if (!SLUG_PATTERN.test(slug)) {
    throw new LakarError('SCHEMA_INVALID', `slug tidak valid: ${JSON.stringify(slug)}`, {
      hint: `slug harus cocok pola ${SLUG_PATTERN.source} (huruf kecil, angka, tanda hubung; maks 64)`,
    });
  }
};

const historyEntry = (rev: number, description: string, opsSummary = ''): HistoryEntry => ({
  rev,
  sessionId: VIEWER_CLIENT,
  description,
  opsSummary,
  at: new Date().toISOString(),
});

export function registerFileRoutes(app: FastifyInstance, { docs, store, sessions, docLocks, log = (m) => console.warn(m) }: FileRoutesOptions): void {
  /** Jalankan `fn` memegang kunci setiap slug (urut, unik); `locked` memegang `#files` dulu. Kunci tidak reentrant. */
  const lockSlugs = <T>(slugs: string[], fn: () => Promise<T>): Promise<T> => {
    const keys = [...new Set(slugs)].sort();
    const step = (i: number): Promise<T> => (i === keys.length ? fn() : docLocks.run(keys[i]!, () => step(i + 1)));
    return step(0);
  };
  const locked = <T>(slugs: string[], fn: () => Promise<T>): Promise<T> => docLocks.run(FILES_LOCK, () => lockSlugs(slugs, fn));
  /** Slug terpakai: ada di memori (mis. baru dibuka agen) atau di disk. */
  const taken = async (slug: string) => docs.has(slug) || (await store.exists(slug));
  /** Slug pertama yang bebas: `base`, `base-2`, `base-3`, … */
  const freeSlug = async (base: string): Promise<string> => {
    for (let n = 1; ; n++) {
      const slug = withSuffix(base, n);
      if (!(await taken(slug))) return slug;
    }
  };
  const mustExist = async (slug: string) => {
    if (!(await taken(slug))) throw new LakarError('NOT_FOUND', `dokumen ${slug} tidak ada`, { hint: 'pakai slug dari GET /viewer/docs' });
  };

  // New file: dokumen baru dengan satu board preset (fill putih), satu entri riwayat "Created file", rev 1.
  app.post('/viewer/docs', async (req, reply) => {
    const body = parse(CreateBody, req.body, CREATE_HINT);
    const base = slugOf(body.name);
    const board = body.board ?? { preset: 'desktop' as const };
    const spec = board.preset === 'custom' ? { name: 'Custom', width: board.width, height: board.height, screen: 'app' as const } : BOARD_PRESETS[board.preset];
    const data = await docLocks.run(FILES_LOCK, async () => {
      const slug = await freeSlug(base);
      return docLocks.run(slug, async () => {
        // Agen bisa membuka slug ini di antara pemeriksaan dan kunci (open tidak memegang `#files`).
        if (await taken(slug)) throw new LakarError('CONFLICT', `dokumen ${slug} baru saja dibuat`, { hint: 'coba lagi', retryable: true });
        const committed = await transact(createDocument(), { sessionId: VIEWER_CLIENT, description: 'Created file' }, (tx) => {
          tx.add(null, { type: 'board', name: spec.name, x: 0, y: 0, width: spec.width, height: spec.height, screen: spec.screen, fills: [{ type: 'solid', color: '#FFFFFF' }] });
        });
        await store.dropOrphanHistory(slug);
        await store.commit(slug, committed.doc, committed.entry!);
        docs.set(slug, committed.doc);
        return { slug, rev: committed.doc.rev };
      });
    });
    return reply.code(200).send({ ok: true, data });
  });

  // Rename: slug baru dari nama; target sudah ada → CONFLICT. Sesi yang membuka slug lama ikut pindah.
  app.post<{ Params: { slug: string } }>('/viewer/docs/:slug/rename', async (req, reply) => {
    const from = req.params.slug;
    checkSlug(from);
    const to = slugOf(parse(RenameBody, req.body, 'kirim {name}').name);
    const data = await locked([from, to], async () => {
      await mustExist(from);
      if (to === from) return { slug: to, from };
      if (await taken(to)) throw new LakarError('CONFLICT', `dokumen ${to} sudah ada`, { hint: 'pilih nama lain' });
      await store.rename(from, to);
      const mem = docs.get(from);
      docs.delete(from);
      if (mem) docs.set(to, mem);
      sessions.retarget(from, to);
      return { slug: to, from };
    });
    return reply.code(200).send({ ok: true, data });
  });

  // Duplicate: `<slug>-copy` (atau `-copy-2`, …), id dokumen baru, rev 0, riwayat baru "Duplicated from <slug>".
  app.post<{ Params: { slug: string } }>('/viewer/docs/:slug/duplicate', async (req, reply) => {
    const from = req.params.slug;
    checkSlug(from);
    const data = await docLocks.run(FILES_LOCK, async () => {
      const slug = await freeSlug(`${from.slice(0, SLUG_MAX - 5).replace(/-+$/, '')}-copy`);
      return lockSlugs([from, slug], async () => {
        const src = docs.get(from) ?? (await peekDocument(store, from));
        if (!src) throw new LakarError('NOT_FOUND', `dokumen ${from} tidak ada`, { hint: 'pakai slug dari GET /viewer/docs' });
        if (await taken(slug)) throw new LakarError('CONFLICT', `dokumen ${slug} baru saja dibuat`, { hint: 'coba lagi', retryable: true });
        const copy: LakarDocument = { ...structuredClone(src), id: IdAllocator.forDocument(src).next(), rev: 0 };
        await store.dropOrphanHistory(slug);
        await store.commit(slug, copy, historyEntry(0, `Duplicated from ${from}`));
        return { slug, rev: 0 };
      });
    });
    return reply.code(200).send({ ok: true, data });
  });

  // Archive: pindah ke <docs>/archive; salinan memori dibuang dan sesi yang membukanya dikosongkan.
  app.post<{ Params: { slug: string } }>('/viewer/docs/:slug/archive', async (req, reply) => {
    const { slug } = req.params;
    checkSlug(slug);
    await locked([slug], async () => {
      await store.archive(slug);
      docs.delete(slug);
      sessions.retarget(slug, undefined);
    });
    return reply.code(200).send({ ok: true, data: { slug } });
  });

  // Unarchive: kembali ke daftar; slug sudah dipakai → CONFLICT.
  app.post<{ Params: { slug: string } }>('/viewer/docs/:slug/unarchive', async (req, reply) => {
    const { slug } = req.params;
    checkSlug(slug);
    await locked([slug], async () => {
      if (docs.has(slug)) throw new LakarError('CONFLICT', `dokumen ${slug} sudah ada`, { hint: 'ganti nama atau hapus dokumen aktif itu dulu' });
      await store.unarchive(slug);
    });
    return reply.code(200).send({ ok: true, data: { slug } });
  });

  // Delete permanen (dokumen + riwayat). `?archived=true` menghapus dari arsip.
  app.delete<{ Params: { slug: string }; Querystring: Record<string, string> }>('/viewer/docs/:slug', async (req, reply) => {
    const { slug } = req.params;
    checkSlug(slug);
    const archived = parse(DeleteQuery, req.query ?? {}, 'query opsional: archived=true untuk menghapus dari arsip').archived === 'true';
    await locked([slug], async () => {
      if (archived) {
        await store.remove(slug, true);
        return;
      }
      if (!(await store.exists(slug))) {
        // Dokumen hanya di memori (file dihapus dari luar): cukup lupakan.
        if (!docs.has(slug)) throw new LakarError('NOT_FOUND', `dokumen ${slug} tidak ada`, { hint: 'pakai slug dari GET /viewer/docs' });
      } else await store.remove(slug);
      docs.delete(slug);
      sessions.retarget(slug, undefined);
    });
    return reply.code(200).send({ ok: true, data: { slug, deleted: true } });
  });

  // Daftar arsip: bentuk sama dengan GET /viewer/docs, urut terakhir diubah.
  app.get('/viewer/archive', async (_req, reply) => {
    const out: ViewerDocSummary[] = [];
    for (const { slug, mtimeMs } of await store.listArchive()) {
      try {
        const doc = await peekDocument(store, slug, true);
        if (doc) out.push(summarize(slug, doc, mtimeMs));
      } catch (e) {
        log(`lakard: arsip melewati ${slug}.lakar.json: ${errorMessage(e)}`);
      }
    }
    out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.slug.localeCompare(b.slug)));
    return reply.code(200).send({ ok: true, data: { docs: out } });
  });
}
