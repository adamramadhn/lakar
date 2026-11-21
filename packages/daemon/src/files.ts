// Route tulis kelola file dari aplikasi (aplikasi 1): New file, rename, duplicate, archive, unarchive, delete,
// dan daftar arsip di `/viewer/*`. Bentuk respons AD-11. Route dan tool MCP lama tidak berubah.
// Setiap operasi memegang kunci `#files` (alokasi slug serial) lalu kunci per slug yang disentuh (urut nama,
// tanpa deadlock), dan menjaga salinan memori `docs` serta `activeSlug` sesi tetap konsisten dengan disk.
// History (aplikasi 3): baca snapshot per rev (`GET /viewer/docs/:slug/revs/:rev`) dan Restore
// (`POST /viewer/docs/:slug/restore`), yang meng-commit isi snapshot sebagai rev baru di bawah kunci dokumen.
// Layer manual (aplikasi 4): unggah gambar `POST /viewer/assets` (byte mentah, maks 20 MB) ke store aset; node
// image sendiri disisipkan viewer lewat `/execute` biasa.
import type { FastifyInstance } from 'fastify';
import { IdAllocator, createDocument, transact, type DocumentLocks } from '@lakar/core';
import { LakarError, SLUG_PATTERN, errorMessage, type HistoryEntry, type LakarDocument } from '@lakar/schema';
import { z } from 'zod';
import { imageSize, writeAsset } from './assets.js';
import { VIEWER_CLIENT, publicSessionId, type ActivityBus, type ActivityCall } from './events.js';
import type { Sessions } from './sessions.js';
import type { DocStore } from './store.js';
import { peekDocument, summarize, type ViewerDocSummary } from './viewer.js';

/** Batas byte unggahan gambar `POST /viewer/assets` (route lain tetap 1 MB). */
export const ASSET_UPLOAD_MAX = 20 * 1024 * 1024;

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
const RestoreBody = z.object({ rev: z.number().int().nonnegative(), baseRev: z.number().int().nonnegative().optional() }).strict();
const REV_PARAM = /^(0|[1-9]\d{0,9})$/;

export type FileRoutesOptions = {
  /** Salinan memori daemon (AD-1); diperbarui setiap operasi. */
  docs: Map<string, LakarDocument>;
  store: DocStore;
  sessions: Sessions;
  docLocks: DocumentLocks;
  /** Bus aktivitas: Restore dipancarkan seperti tool call supaya viewer lain ikut memuat ulang. */
  activity?: ActivityBus;
  /** Direktori data daemon: unggahan gambar ditulis ke `<dataDir>/assets`. Tanpa ini route unggah tidak didaftarkan. */
  dataDir?: string;
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

/** Param rev `:rev` → bilangan bulat ≥ 0; selain itu SCHEMA_INVALID. */
export const parseRevParam = (raw: string): number => {
  if (!REV_PARAM.test(raw)) throw new LakarError('SCHEMA_INVALID', `rev tidak valid: ${JSON.stringify(raw)}`, { hint: 'pakai rev dari GET /viewer/docs/:slug/history' });
  return Number(raw);
};

const noSnapshot = (slug: string, rev: number) =>
  new LakarError('NOT_FOUND', `versi r${rev} dokumen ${slug} tidak punya snapshot`, { hint: 'versi ini dibuat sebelum snapshot tersedia' });

/**
 * Isi dokumen `slug` pada rev `rev` dari snapshot. Rev terkini tanpa snapshot memakai dokumen kini (bukan
 * rekonstruksi). Snapshot milik dokumen lain (id beda, mis. slug dipakai ulang) atau rev di atas rev kini
 * dianggap tidak ada. Dokumen tidak ada → NOT_FOUND.
 */
export async function readRevision(docs: ReadonlyMap<string, LakarDocument>, store: DocStore, slug: string, rev: number): Promise<LakarDocument> {
  const current = docs.get(slug) ?? (await peekDocument(store, slug));
  if (!current) throw new LakarError('NOT_FOUND', `dokumen ${slug} tidak ada`, { hint: 'pakai slug dari GET /viewer/docs' });
  if (rev > current.rev) throw noSnapshot(slug, rev);
  const snap = await store.readSnapshot(slug, rev);
  if (snap && snap.id === current.id && snap.rev === rev) return snap;
  if (rev === current.rev) return current;
  throw noSnapshot(slug, rev);
}

const historyEntry = (rev: number, description: string, opsSummary = ''): HistoryEntry => ({
  rev,
  sessionId: VIEWER_CLIENT,
  description,
  opsSummary,
  at: new Date().toISOString(),
});

export function registerFileRoutes(app: FastifyInstance, { docs, store, sessions, docLocks, activity, dataDir, log = (m) => console.warn(m) }: FileRoutesOptions): void {
  /** Jalankan `fn` memegang kunci setiap slug (urut, unik); `locked` memegang `#files` dulu. Kunci tidak reentrant. */
  const lockSlugs = <T>(slugs: string[], fn: () => Promise<T>): Promise<T> => {
    const keys = [...new Set(slugs)].sort();
    const step = (i: number): Promise<T> => (i === keys.length ? fn() : docLocks.run(keys[i]!, () => step(i + 1)));
    return step(0);
  };
  const locked = <T>(slugs: string[], fn: () => Promise<T>): Promise<T> => docLocks.run(FILES_LOCK, () => lockSlugs(slugs, fn));
  /** Slug terpakai: ada di memori (mis. baru dibuka agen) atau di disk. */
  const taken = async (slug: string) => docs.has(slug) || (await store.exists(slug));
  /** Slug tidak boleh dipakai file baru: terpakai, atau milik file di arsip (Unarchive nanti tidak bentrok). */
  const claimed = async (slug: string) => (await taken(slug)) || (await store.exists(slug, true));
  /** Slug pertama yang bebas (termasuk arsip): `base`, `base-2`, `base-3`, … */
  const freeSlug = async (base: string): Promise<string> => {
    for (let n = 1; ; n++) {
      const slug = withSuffix(base, n);
      if (!(await claimed(slug))) return slug;
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
        if (await claimed(slug)) throw new LakarError('CONFLICT', `dokumen ${slug} baru saja dibuat`, { hint: 'coba lagi', retryable: true });
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
      if (await store.exists(to, true)) throw new LakarError('CONFLICT', `dokumen ${to} sudah ada di arsip`, { hint: 'pilih nama lain, atau hapus file arsip itu dulu' });
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
        if (await claimed(slug)) throw new LakarError('CONFLICT', `dokumen ${slug} baru saja dibuat`, { hint: 'coba lagi', retryable: true });
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

  // Isi versi lama (snapshot) untuk pratinjau/Compare; tanpa snapshot → 404.
  app.get<{ Params: { slug: string; rev: string } }>('/viewer/docs/:slug/revs/:rev', async (req, reply) => {
    const { slug } = req.params;
    checkSlug(slug);
    const doc = await readRevision(docs, store, slug, parseRevParam(req.params.rev));
    return reply.code(200).send({ ok: true, data: { doc } });
  });

  // Restore: isi snapshot `rev` di-commit sebagai rev baru (jalur commit sama dengan execute), di bawah kunci
  // dokumen sehingga diserialkan dengan execute agen. Riwayat "Restored r<rev>" atas nama sesi viewer.
  let restoreSeq = 0;
  app.post<{ Params: { slug: string } }>('/viewer/docs/:slug/restore', async (req, reply) => {
    const { slug } = req.params;
    checkSlug(slug);
    const { rev, baseRev } = parse(RestoreBody, req.body, 'kirim {rev, baseRev?} (rev dari GET /viewer/docs/:slug/history; baseRev = rev terkini yang dilihat klien)');
    const description = `Restored r${rev}`;
    const t0 = Date.now();
    const call: ActivityCall = {
      callId: `restore-${t0.toString(36)}-${++restoreSeq}`,
      session: publicSessionId(VIEWER_CLIENT),
      client: VIEWER_CLIENT,
      tool: 'restore',
      slug,
      description,
      status: 'running',
      startedAt: new Date(t0).toISOString(),
    };
    activity?.emit({ type: 'call', call });
    try {
      const data = await docLocks.run(slug, async () => {
        // Dokumen belum dimuat (belum dibuka siapa pun): muat dari disk seperti open_doc.
        const current = docs.get(slug) ?? (await store.read(slug));
        if (!current) throw new LakarError('NOT_FOUND', `dokumen ${slug} tidak ada`, { hint: 'pakai slug dari GET /viewer/docs' });
        // Klien melihat versi yang sudah usang (agen menulis sesudahnya) → jangan timpa perubahan baru.
        if (baseRev !== undefined && current.rev !== baseRev) {
          throw new LakarError('CONFLICT', `dokumen ${slug} sudah berubah ke r${current.rev} (klien melihat r${baseRev})`, { hint: 'ada perubahan yang lebih baru; muat ulang riwayat lalu pilih versi lagi' });
        }
        if (rev === current.rev) throw new LakarError('CONFLICT', `r${rev} sudah versi terkini ${slug}`, { hint: 'pilih versi yang lebih lama untuk dipulihkan' });
        const snap = await readRevision(new Map([[slug, current]]), store, slug, rev);
        const next: LakarDocument = { ...structuredClone(snap), id: current.id, rev: current.rev + 1 };
        await store.commit(slug, next, historyEntry(next.rev, description, 'restore'));
        docs.set(slug, next);
        return { slug, rev: next.rev, restoredFrom: rev };
      });
      activity?.emit({ type: 'call', call: { ...call, status: 'done', durationMs: Date.now() - t0, rev: data.rev } });
      return reply.code(200).send({ ok: true, data });
    } catch (e) {
      const err = e instanceof LakarError ? { code: e.code, message: e.message } : { code: 'EXEC_ERROR', message: errorMessage(e) };
      activity?.emit({ type: 'call', call: { ...call, status: 'error', durationMs: Date.now() - t0, error: err } });
      throw e;
    }
  });

  // Unggah gambar (Image… di viewer): byte mentah (application/octet-stream atau image/*), maks 20 MB. Jenis
  // dikenali dari magic bytes (`rasterType` lewat `writeAsset`), bukan dari content-type. Parser dan batas byte
  // hanya berlaku di scope plugin ini, jadi route JSON lain tidak berubah.
  if (dataDir !== undefined) {
    const notImage = () =>
      new LakarError('SCHEMA_INVALID', 'file bukan gambar PNG, JPEG, WebP, atau GIF', { hint: 'pilih file png/jpeg/webp/gif (maks 20 MB)' });
    void app.register(async (scope) => {
      const raw = (_req: unknown, body: Buffer, done: (err: Error | null, body?: Buffer) => void) => done(null, body);
      scope.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: ASSET_UPLOAD_MAX }, raw);
      scope.addContentTypeParser(/^image\//, { parseAs: 'buffer', bodyLimit: ASSET_UPLOAD_MAX }, raw);
      scope.post(
        '/viewer/assets',
        {
          bodyLimit: ASSET_UPLOAD_MAX,
          // Body melebihi batas → 413 (handler global memetakan 4xx lain ke 400); error lain diteruskan ke handler induk.
          errorHandler: (err, _req, reply) => {
            if ((err as { statusCode?: number }).statusCode === 413) {
              return reply.code(413).send({
                ok: false,
                error: { code: 'SCHEMA_INVALID', message: 'gambar melebihi 20 MB', hint: 'perkecil gambar lalu unggah lagi (maks 20 MB)', retryable: false },
              });
            }
            throw err;
          },
        },
        async (req, reply) => {
          const body = req.body;
          if (!Buffer.isBuffer(body) || body.length === 0) throw notImage();
          const size = imageSize(body);
          if (!size) throw notImage();
          let saved;
          try {
            saved = await writeAsset(dataDir, body);
          } catch (e) {
            if (e instanceof Error && /raster/.test(e.message)) throw notImage();
            throw e;
          }
          return reply.code(200).send({ ok: true, data: { assetId: saved.sha, mime: saved.mime, width: size.width, height: size.height } });
        },
      );
    });
  }

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
