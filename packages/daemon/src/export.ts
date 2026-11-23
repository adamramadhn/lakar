// Export PNG dari aplikasi (aplikasi 2): `POST /viewer/docs/:slug/export` {boardId, scale} → byte PNG mentah
// sebagai lampiran. Merender lewat RenderPort yang sama dengan `/export`, tanpa sesi dan tanpa menulis ke disk
// (`<dataDir>/exports` tetap milik route `/export` lama).
// Screenshot versi lama (aplikasi 3): `POST /viewer/docs/:slug/revs/:rev/screenshot` {boardId} merender snapshot
// tanpa menyimpannya ke salinan memori; bentuk respons sama dengan `/screenshot`.
import type { FastifyInstance } from 'fastify';
import type { IconCatalogPort, RenderPort } from '@lakar/ports';
import { iconRefs } from '@lakar/render';
import { LakarError, SLUG_PATTERN, findBoard, resolveDocument, type IconGlyph, type LakarDocument, type ResolvedDocument } from '@lakar/schema';
import { z } from 'zod';
import { notFound } from './errors.js';
import { locateNode } from './inspect.js';
import { readPngSize } from './png.js';
import { parseRevParam, readRevision, slugify } from './files.js';
import type { DocStore } from './store.js';
import { peekDocument } from './viewer.js';

const ExportBody = z
  .object({ boardId: z.string().min(1), scale: z.union([z.literal(1), z.literal(2)]), nodeId: z.string().min(1).optional() })
  .strict();
const RevShotBody = z.object({ boardId: z.string().min(1) }).strict();
const EXPORT_HINT = 'kirim {boardId, scale}: boardId dari dokumen, scale 1 atau 2; nodeId opsional = node di dalam board itu';

export type ExportRoutesOptions = {
  docs: Map<string, LakarDocument>;
  store: DocStore;
  render: RenderPort<ResolvedDocument>;
  icons: IconCatalogPort<string, IconGlyph>;
};

/** Nama file unduhan `<slug>-<board-name>@<scale>x.png`; nama board di-slugify (kosong → id board). */
export function exportFileName(slug: string, board: { id: string; name: string }, scale: 1 | 2): string {
  const name = slugify(board.name) || slugify(board.id) || 'board';
  return `${slug}-${name}@${scale}x.png`;
}

export function registerExportRoutes(app: FastifyInstance, { docs, store, render, icons }: ExportRoutesOptions): void {
  app.post<{ Params: { slug: string } }>('/viewer/docs/:slug/export', async (req, reply) => {
    const { slug } = req.params;
    if (!SLUG_PATTERN.test(slug)) {
      throw new LakarError('SCHEMA_INVALID', `slug tidak valid: ${JSON.stringify(slug)}`, { hint: `slug harus cocok pola ${SLUG_PATTERN.source}` });
    }
    const r = ExportBody.safeParse(req.body);
    if (!r.success) {
      throw new LakarError('SCHEMA_INVALID', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: EXPORT_HINT });
    }
    const { boardId, scale, nodeId } = r.data;
    const stored = docs.get(slug) ?? (await peekDocument(store, slug));
    if (!stored) throw notFound(`dokumen ${slug} tidak ada`, 'pakai slug dari GET /viewer/docs');
    const doc = resolveDocument(stored);
    const board = findBoard(doc, boardId);
    if (!board) throw notFound(`board ${boardId} tidak ada di dokumen ${slug}`, 'pilih board lain');
    // Copy as PNG (story 8.7): nodeId opsional = satu node tersimpan di dalam board (locateNode di dokumen
    // tersimpan hanya me-resolve id tersimpan, bukan alamat komposit `a/b` isi instance). Node board lain → 404.
    const hit = nodeId === undefined ? undefined : locateNode(stored, nodeId);
    if (nodeId !== undefined && (!hit || hit.board.id !== board.id)) {
      throw notFound(`node ${nodeId} tidak ada di board ${boardId} dokumen ${slug}`, 'pilih node di dalam board itu');
    }
    // AD-9: ikon yang tidak dikenal katalog → ICON_UNKNOWN sebelum render.
    for (const ref of iconRefs(board)) icons.canonical(ref.lib, ref.icon);
    const png = await render.screenshot(doc, board.id, { scale, ...(hit && hit.node.id !== board.id ? { nodeId: hit.node.id } : {}) });
    return reply
      .code(200)
      .header('content-type', 'image/png')
      .header('content-disposition', `attachment; filename="${exportFileName(slug, hit?.node ?? board, scale)}"`)
      .header('cache-control', 'no-store')
      .send(Buffer.from(png));
  });

  app.post<{ Params: { slug: string; rev: string } }>('/viewer/docs/:slug/revs/:rev/screenshot', async (req, reply) => {
    const { slug } = req.params;
    if (!SLUG_PATTERN.test(slug)) {
      throw new LakarError('SCHEMA_INVALID', `slug tidak valid: ${JSON.stringify(slug)}`, { hint: `slug harus cocok pola ${SLUG_PATTERN.source}` });
    }
    const rev = parseRevParam(req.params.rev);
    const r = RevShotBody.safeParse(req.body);
    if (!r.success) {
      throw new LakarError('SCHEMA_INVALID', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: 'kirim {boardId} dari dokumen versi itu' });
    }
    const doc = resolveDocument(await readRevision(docs, store, slug, rev));
    const board = findBoard(doc, r.data.boardId);
    if (!board) throw notFound(`board ${r.data.boardId} tidak ada di dokumen ${slug} r${rev}`, 'pilih board dari versi itu');
    for (const ref of iconRefs(board)) icons.canonical(ref.lib, ref.icon);
    const png = await render.screenshot(doc, board.id);
    // Board hug: ukuran = hasil render (PNG skala 1 = px CSS).
    const dims = typeof board.height === 'number' ? { width: board.width, height: board.height } : readPngSize(png);
    return reply.code(200).send({ ok: true, data: { boardId: board.id, ...dims, mimeType: 'image/png', png: Buffer.from(png).toString('base64') } });
  });
}
