// Tool MCP `export_code` (epic kode story 5): `POST /viewer/export-code` (sesi, dokumen aktif) → file React + Tailwind
// atau React + CSS dari @lakar/codegen (AD-16). Generator dan resolusi glyph sama dengan dialog Export code viewer:
// `iconRefs` (dokumen ter-ekspansi) → `icons.glyph` katalog (route `/viewer/render-deps` memakai fungsi yang sama),
// lalu `generateCode` dengan opsi yang sama, jadi berkasnya identik byte. Route baru; route/tool lama tidak berubah (AD-4).
import type { FastifyInstance } from 'fastify';
import { generateCode, iconRefs, type CodegenOptions } from '@lakar/codegen';
import type { IconCatalogPort } from '@lakar/ports';
import { ICON_LIBS, LakarError, SESSION_HEADER, type IconGlyph, type IconLib, type LakarDocument } from '@lakar/schema';
import { z } from 'zod';
import { notFound } from './errors.js';
import { locateNode } from './inspect.js';
import { NO_ACTIVE_DOC_HINT, type Sessions } from './sessions.js';

export const CODE_TARGETS = ['react-tailwind', 'react-css'] as const;

const Body = z
  .object({
    id: z.string().min(1).optional(),
    target: z.enum(CODE_TARGETS).optional(),
    components: z.boolean().optional(),
    tokens: z.boolean().optional(),
    typescript: z.boolean().optional(),
  })
  .strict();
const HINT =
  "kirim {id?, target?, components?, tokens?, typescript?}: id board/node (default board pertama), target 'react-tailwind' (default) atau 'react-css', components/tokens/typescript boolean (default true)";

export type CodeExportOptions = Omit<CodegenOptions, 'icons' | 'assetBase' | 'componentName'>;

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
};

export function registerCodeExportRoutes(app: FastifyInstance, { docs, sessions, icons }: CodeExportRoutesOptions): void {
  app.post('/viewer/export-code', async (req, reply) => {
    const session = sessions.require(req.headers[SESSION_HEADER]);
    if (!session.activeSlug) {
      throw new LakarError('NO_ACTIVE_DOC', 'sesi ini belum punya dokumen aktif', { hint: NO_ACTIVE_DOC_HINT });
    }
    const slug = session.activeSlug;
    const parsed = Body.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new LakarError('SCHEMA_INVALID', parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: HINT });
    }
    const body = parsed.data;
    const stored = docs.get(slug)!;
    // Board pertama = aturan yang sama dengan `export`/`screenshot` (anak pertama halaman pertama).
    const id = body.id ?? stored.pages[0]?.children[0]?.id;
    if (!id) throw notFound(`dokumen ${slug} belum punya board`, 'buat board dulu lewat execute');
    // Alamat komposit (isi instance) di-resolve codegen sendiri; ID tersimpan dicek di sini agar pesannya sama dengan export.
    const hit = id.includes('/') ? undefined : locateNode(stored, id);
    if (!id.includes('/') && !hit) throw notFound(`node ${id} tidak ada di dokumen ${slug}`, 'pakai ID dari created[] execute atau list_boards');
    const target = body.target ?? 'react-tailwind';
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
}
