// Tool MCP `export_code` (epic kode story 5): `POST /viewer/export-code` (sesi, dokumen aktif) → file React + Tailwind
// atau React + CSS dari @lakar/codegen (AD-16). Generator dan resolusi glyph sama dengan dialog Export code viewer:
// `iconRefs` (dokumen ter-ekspansi) → `icons.glyph` katalog (route `/viewer/render-deps` memakai fungsi yang sama),
// lalu `generateCode` dengan opsi yang sama, jadi berkasnya identik byte. Route baru; route/tool lama tidak berubah (AD-4).
import type { FastifyInstance } from 'fastify';
import { dtcgTokensJson, generateCode, iconRefs, type CodegenOptions } from '@lakar/codegen';
import type { IconCatalogPort } from '@lakar/ports';
import { vectorToSvg } from '@lakar/render';
import { ICON_LIBS, LakarError, SESSION_HEADER, resolveDocument, type IconGlyph, type IconLib, type LakarDocument } from '@lakar/schema';
import { z } from 'zod';
import { notFound } from './errors.js';
import { locateNode } from './inspect.js';
import { NO_ACTIVE_DOC_HINT, type Sessions } from './sessions.js';

export const CODE_TARGETS = ['react-tailwind', 'react-css', 'dtcg'] as const;

export const ExportCodeBody = z
  .object({
    id: z.string().min(1).optional(),
    target: z.enum(CODE_TARGETS).optional(),
    components: z.boolean().optional(),
    tokens: z.boolean().optional(),
    typescript: z.boolean().optional(),
  })
  .strict();
export const EXPORT_CODE_HINT =
  "kirim {id?, target?, components?, tokens?, typescript?}: id board/node (default board pertama), target 'react-tailwind' (default), 'react-css', atau 'dtcg' (seluruh token dokumen sebagai tokens.json W3C DTCG), components/tokens/typescript boolean (default true)";

export type CodeExportOptions = Omit<CodegenOptions, 'icons' | 'assetBase' | 'componentName'>;

export const ExportSvgBody = z.object({ id: z.string().min(1).optional() }).strict();
export const EXPORT_SVG_HINT = "kirim {id?}: id board/node vektor (default board pertama); yang bisa diekspor: path, frame, board — layer lain dilaporkan di dropped; pakai export/screenshot untuk PNG";

export type ExportSvgData = {
  docId: string;
  slug: string;
  rev: number;
  id: string;
  name: string;
  type: string;
  bytes: number;
  dropped: string[];
  svg: string;
};

/**
 * Node board/frame/path → dokumen SVG mandiri (`vectorToSvg` AD-14, emitter yang sama dengan Export file viewer).
 * Node dicari di dokumen ter-resolve (alamat komposit isi instance `I/…` dikenali). Node lain (text/rect/ellipse/
 * icon) di dalam target tetap diekspor setia bila vektornya punya padanan; yang tidak → `dropped` ("<nodeId>.<prop>").
 */
export function exportSvgNode(stored: LakarDocument, slug: string, id: string | undefined): ExportSvgData {
  const target = id ?? stored.pages[0]?.children[0]?.id;
  if (!target) throw notFound(`dokumen ${slug} belum punya board`, 'buat board dulu lewat execute');
  const doc = resolveDocument(stored);
  const hit = locateNode(doc, target);
  if (!hit) throw notFound(`node ${target} tidak ada di dokumen ${slug}`, 'pakai ID dari created[] execute atau list_boards');
  const node = hit.node as { type?: string; name?: string };
  if (node.type !== 'board' && node.type !== 'frame' && node.type !== 'path') {
    throw new LakarError('EXPORT_FAILED', `node ${node.type ?? 'ini'} tidak bisa diekspor sebagai SVG`, {
      hint: 'SVG mendukung path, frame, dan board; pakai export/screenshot untuk PNG pada layer ini',
    });
  }
  const out = vectorToSvg(node as Parameters<typeof vectorToSvg>[0]);
  return {
    docId: stored.id,
    slug,
    rev: stored.rev,
    id: target,
    name: node.name ?? target,
    type: node.type,
    bytes: Buffer.byteLength(out.svg, 'utf8'),
    dropped: out.dropped.map((d) => `${d.nodeId}.${d.prop}`),
    svg: out.svg,
  };
}

/**
 * Glyph untuk ekspor `opts`: ikon yang diminta ekspor (termasuk varian enum dan isi instance, `iconRefs`) yang dikenal
 * katalog. Ikon tak dikenal dilewati → codegen menulis warning `icon-glyph-missing`.
 */
export function exportGlyphs(doc: LakarDocument, opts: CodeExportOptions, icons: Pick<IconCatalogPort<string, IconGlyph>, 'glyph'>): IconGlyph[] {
  const out: IconGlyph[] = [];
  for (const r of iconRefs(doc, opts)) {
    if (!(ICON_LIBS as readonly string[]).includes(r.lib)) continue;
    const g = icons.glyph(r.lib as IconLib, r.icon);
    if (g) out.push(g);
  }
  return out;
}

export type CodeExportRoutesOptions = {
  docs: Map<string, LakarDocument>;
  sessions: Sessions;
  icons: IconCatalogPort<string, IconGlyph>;
  /** Room `@lakar/sync` yang digabung: dokumen aktif bisa berupa replika room. */
  rooms?: { doc(slug: string): LakarDocument | undefined };
};

export function registerCodeExportRoutes(app: FastifyInstance, { docs, sessions, icons, rooms }: CodeExportRoutesOptions): void {
  app.post('/viewer/export-code', async (req, reply) => {
    const session = sessions.require(req.headers[SESSION_HEADER]);
    if (!session.activeSlug) {
      throw new LakarError('NO_ACTIVE_DOC', 'sesi ini belum punya dokumen aktif', { hint: NO_ACTIVE_DOC_HINT });
    }
    const slug = session.activeSlug;
    const parsed = ExportCodeBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new LakarError('SCHEMA_INVALID', parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: EXPORT_CODE_HINT });
    }
    const body = parsed.data;
    const stored = (docs.get(slug) ?? rooms?.doc(slug))!;
    const target = body.target ?? 'react-tailwind';
    if (target === 'dtcg') {
      // Token tingkat dokumen: satu berkas tokens.json W3C DTCG (tanpa resolusi node).
      const contents = dtcgTokensJson(stored);
      const files = [{ path: 'tokens.json', contents, bytes: Buffer.byteLength(contents, 'utf8') }];
      return reply.code(200).send({ ok: true, data: { docId: stored.id, slug, rev: stored.rev, id: null, name: null, target, files, warnings: [] } });
    }
    // Board pertama = aturan yang sama dengan `export`/`screenshot` (anak pertama halaman pertama).
    const id = body.id ?? stored.pages[0]?.children[0]?.id;
    if (!id) throw notFound(`dokumen ${slug} belum punya board`, 'buat board dulu lewat execute');
    // Alamat komposit (isi instance) di-resolve codegen sendiri; ID tersimpan dicek di sini agar pesannya sama dengan export.
    const hit = id.includes('/') ? undefined : locateNode(stored, id);
    if (!id.includes('/') && !hit) throw notFound(`node ${id} tidak ada di dokumen ${slug}`, 'pakai ID dari created[] execute atau list_boards');
    const opts: CodeExportOptions = {
      nodeId: id,
      target,
      ...(body.components !== undefined ? { components: body.components } : {}),
      ...(body.tokens !== undefined ? { tokens: body.tokens } : {}),
      ...(body.typescript !== undefined ? { typescript: body.typescript } : {}),
    };
    const result = generateCode(stored, { ...opts, icons: exportGlyphs(stored, opts, icons) });
    const files = result.files.map((f) => ({ path: f.path, contents: f.contents, bytes: Buffer.byteLength(f.contents, 'utf8') }));
    return reply.code(200).send({
      ok: true,
      data: { docId: stored.id, slug, rev: stored.rev, id, name: hit?.node.name ?? id, target, files, warnings: result.warnings },
    });
  });

  // Tool MCP `export_svg`: SVG vektor node sebagai teks respons (bukan berkas di disk seperti /export-file).
  app.post('/viewer/export-svg', async (req, reply) => {
    const session = sessions.require(req.headers[SESSION_HEADER]);
    if (!session.activeSlug) {
      throw new LakarError('NO_ACTIVE_DOC', 'sesi ini belum punya dokumen aktif', { hint: NO_ACTIVE_DOC_HINT });
    }
    const slug = session.activeSlug;
    const parsed = ExportSvgBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new LakarError('SCHEMA_INVALID', parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: EXPORT_SVG_HINT });
    }
    const stored = (docs.get(slug) ?? rooms?.doc(slug))!;
    return reply.code(200).send({ ok: true, data: exportSvgNode(stored, slug, parsed.data.id) });
  });
}
