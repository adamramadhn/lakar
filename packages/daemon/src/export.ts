// Export PNG dari aplikasi (aplikasi 2): `POST /viewer/docs/:slug/export` {boardId, scale} → byte PNG mentah
// sebagai lampiran. Merender lewat RenderPort yang sama dengan `/export`, tanpa sesi dan tanpa menulis ke disk
// (`<dataDir>/exports` tetap milik route `/export` lama).
// Screenshot versi lama (aplikasi 3): `POST /viewer/docs/:slug/revs/:rev/screenshot` {boardId} merender snapshot
// tanpa menyimpannya ke salinan memori; bentuk respons sama dengan `/screenshot`.
import type { FastifyInstance } from 'fastify';
import type { IconCatalogPort, RenderPort } from '@lakar/ports';
import { iconRefs, vectorToSvg } from '@lakar/render';
import { homedir } from 'node:os';
import { stat, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';
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
const ExportFileBody = z
  .object({
    boardId: z.string().min(1),
    nodeId: z.string().min(1).optional(),
    scale: z.union([z.literal(1), z.literal(2)]),
    format: z.enum(['png', 'svg']),
    dir: z.string().min(1),
    name: z.string().min(1),
  })
  .strict();
const EXPORT_HINT = 'kirim {boardId, scale}: boardId dari dokumen, scale 1 atau 2; nodeId opsional = node di dalam board itu';
const EXPORT_FILE_HINT =
  'kirim {boardId, scale, format, dir, name}: format png|svg; dir absolut (atau ~) ke folder tujuan; name tanpa ekstensi/separator';

export type ExportRoutesOptions = {
  docs: Map<string, LakarDocument>;
  store: DocStore;
  render: RenderPort<ResolvedDocument>;
  icons: IconCatalogPort<string, IconGlyph>;
  /** Room `@lakar/sync` yang digabung: slug room mengekspor replika (tanpa snapshot revisi). */
  rooms?: { doc(slug: string): LakarDocument | undefined; has(slug: string): boolean };
};

/** Nama file unduhan `<slug>-<board-name>@<scale>x.png`; nama board di-slugify (kosong → id board). */
export function exportFileName(slug: string, board: { id: string; name: string }, scale: 1 | 2): string {
  const name = slugify(board.name) || slugify(board.id) || 'board';
  return `${slug}-${name}@${scale}x.png`;
}

export function registerExportRoutes(app: FastifyInstance, { docs, store, render, icons, rooms }: ExportRoutesOptions): void {
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
    const stored = docs.get(slug) ?? rooms?.doc(slug) ?? (await peekDocument(store, slug));
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
    if (rooms?.has(slug)) throw notFound(`dokumen room ${slug} tidak punya snapshot revisi`, 'dokumen room tidak menyimpan riwayat lokal');
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

  // Ekspor seleksi ke berkas di disk (seksi Export tab Design, spec-viewer-merged-design-tab): PNG hasil render atau
  // SVG vektor (`vectorToSvg`, AD-14). Daemon menulis langsung (localhost satu pengguna): `dir` absolut/`~`, `name`
  // basename tanpa ekstensi (ekstensi dari `format`); konflik nama → suffix `-1`, `-2`, … Node tak bisa di-SVG-kan
  // (bukan path/frame) → EXPORT_FAILED berhint PNG.
  app.post<{ Params: { slug: string } }>('/viewer/docs/:slug/export-file', async (req, reply) => {
    const { slug } = req.params;
    if (!SLUG_PATTERN.test(slug)) {
      throw new LakarError('SCHEMA_INVALID', `slug tidak valid: ${JSON.stringify(slug)}`, { hint: `slug harus cocok pola ${SLUG_PATTERN.source}` });
    }
    const r = ExportFileBody.safeParse(req.body);
    if (!r.success) {
      throw new LakarError('SCHEMA_INVALID', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: EXPORT_FILE_HINT });
    }
    const { boardId, nodeId, scale, format, dir, name } = r.data;
    const stored = docs.get(slug) ?? (await peekDocument(store, slug));
    if (!stored) throw notFound(`dokumen ${slug} tidak ada`, 'pakai slug dari GET /viewer/docs');
    const doc = resolveDocument(stored);
    const board = findBoard(doc, boardId);
    if (!board) throw notFound(`board ${boardId} tidak ada di dokumen ${slug}`, 'pilih board lain');
    const hit = nodeId === undefined ? undefined : locateNode(doc, nodeId);
    if (nodeId !== undefined && (!hit || hit.board.id !== board.id)) {
      throw notFound(`node ${nodeId} tidak ada di board ${boardId} dokumen ${slug}`, 'pilih node di dalam board itu');
    }
    const target = hit?.node ?? board;
    // Sanitasi tujuan: dir absolut (≈ diperluas), name basename tanpa ekstensi format.
    if (!isAbsolute(dir) && dir !== '~' && !dir.startsWith('~/')) {
      throw new LakarError('SCHEMA_INVALID', `dir harus path absolut atau ~: ${JSON.stringify(dir)}`, { hint: EXPORT_FILE_HINT });
    }
    const dirAbs = resolve(dir === '~' ? homedir() : dir.startsWith('~/') ? join(homedir(), dir.slice(2)) : dir);
    if (name !== basename(name) || name === '.' || name === '..' || name.startsWith('.')) {
      throw new LakarError('SCHEMA_INVALID', `name harus nama berkas polos: ${JSON.stringify(name)}`, { hint: EXPORT_FILE_HINT });
    }
    const base = name.replace(new RegExp(`\\.${format}$`, 'i'), '');
    const st = await stat(dirAbs).catch(() => undefined);
    if (!st?.isDirectory()) {
      throw new LakarError('NOT_FOUND', `folder tujuan tidak ada: ${dirAbs}`, { hint: 'buat foldernya dulu atau pilih folder lain' });
    }
    let bytes: Buffer;
    let dropped: { nodeId: string; prop: string }[] = [];
    if (format === 'svg') {
      const ttype = (target as { type?: string }).type;
      if (ttype !== 'path' && ttype !== 'frame' && ttype !== 'board') {
        throw new LakarError('EXPORT_FAILED', `node ${ttype ?? 'ini'} tidak bisa diekspor sebagai SVG`, { hint: 'SVG mendukung path dan frame; pakai format png untuk layer ini' });
      }
      for (const ref of iconRefs(board)) icons.canonical(ref.lib, ref.icon);
      const out = vectorToSvg(target as Parameters<typeof vectorToSvg>[0]);
      bytes = Buffer.from(out.svg, 'utf8');
      dropped = out.dropped;
    } else {
      const storedHit = nodeId === undefined ? undefined : locateNode(stored, nodeId);
      for (const ref of iconRefs(board)) icons.canonical(ref.lib, ref.icon);
      const png = await render.screenshot(doc, board.id, { scale, ...(storedHit && storedHit.node.id !== board.id ? { nodeId: storedHit.node.id } : {}) });
      bytes = Buffer.from(png);
    }
    let file = join(dirAbs, `${base}.${format}`);
    for (let i = 1; ; i++) {
      const exists = await stat(file).catch(() => undefined);
      if (!exists) break;
      file = join(dirAbs, `${base}-${i}.${format}`);
    }
    await writeFile(file, bytes);
    return reply.code(200).send({ ok: true, data: { path: file, bytes: bytes.length, dropped: dropped.map((d) => `${d.nodeId}.${d.prop}`) } });
  });
}
