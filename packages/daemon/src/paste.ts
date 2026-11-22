// Route paste (epic paste-vektor story 3, AD-15): satu importer (`paste/svg.ts`) dan satu jalur commit untuk dua pintu.
// - `POST /viewer/docs/:slug/paste` — viewer (guard Origin), respons membawa `inverse` untuk tumpukan undo (AD-8).
// - `POST /viewer/paste` — sesi MCP (tool `paste`), dokumen aktif sesi, tercatat di Activity (`TOOL_ROUTES`).
// Hasil importer = NodeInput yang di-commit sebagai op `add` berantai lewat `applyOps` (AD-2): satu paste = satu rev
// + satu entri riwayat. SVG mentah tidak pernah disimpan. Tanpa render/check (sama dengan route ops).
import type { FastifyInstance } from 'fastify';
import { touchedBoards } from '@lakar/check';
import { applyOps, transact, type DocumentLocks } from '@lakar/core';
import { LakarError, OPS_MAX, SESSION_HEADER, SLUG_PATTERN, resolveDocument, type DocOp, type LakarDocument } from '@lakar/schema';
import { z } from 'zod';
import { VIEWER_CLIENT, originOf, type ActivityBus } from './events.js';
import { locateNode } from './inspect.js';
import { PASTE_NAME_MAX, SvgImportError, importSvg, type ImportedNode, type KeptAttr, type PasteDropped } from './paste/svg.js';
import type { Sessions } from './sessions.js';
import type { DocStore } from './store.js';

export const PASTE_KINDS = ['svg'] as const;
/** Panjang `content` maksimum (karakter). */
export const PASTE_CONTENT_MAX = 1_000_000;
/** Batas body route paste (JSON dengan escape bisa lebih besar dari isinya). */
export const PASTE_BODY_LIMIT = 8 * 1024 * 1024;
export const PASTE_DEFAULT_DESCRIPTION = 'Paste SVG';
export const PASTE_DESCRIPTION_MAX = 200;
/** Ref lokal node akar di daftar op paste. */
const ROOT_REF = 'paste';

const PasteBody = z
  .object({
    kind: z.enum(PASTE_KINDS).optional(),
    content: z.string().min(1, 'content tidak boleh kosong').max(PASTE_CONTENT_MAX, `content maks ${PASTE_CONTENT_MAX} karakter`),
    parentId: z.string().min(1),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    name: z.string().trim().min(1).max(PASTE_NAME_MAX).optional(),
    description: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().min(1, 'description tidak boleh kosong').max(PASTE_DESCRIPTION_MAX, `description maks ${PASTE_DESCRIPTION_MAX} karakter`))
      .optional(),
  })
  .strict();
export type PasteBody = z.infer<typeof PasteBody>;
const PASTE_HINT = `kirim {content: '<svg …>', parentId: ID board/frame, x?, y?, name?, description?, kind?: 'svg'} (content maks ${PASTE_CONTENT_MAX} karakter)`;
const SVG_HINT = 'content harus dokumen SVG utuh berakar <svg> berisi path/rect/circle/ellipse/line/polyline/polygon';

export type PasteReport = { kind: 'svg'; paths: number; kept: KeptAttr[]; dropped: PasteDropped[] };

/** Validasi body (sama untuk kedua route). */
export function parsePasteBody(body: unknown): PasteBody {
  const parsed = PasteBody.safeParse(body);
  if (!parsed.success) {
    throw new LakarError('SCHEMA_INVALID', parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: PASTE_HINT });
  }
  return parsed.data;
}

/**
 * Op paste: `add` akar (ref `paste`) lalu `add` tiap anak ke `@paste`. Di board atau frame `layout:'none'` akar
 * absolut di `x`/`y` (default: tengah parent berukuran angka, selain itu 0,0); di parent flow tanpa x/y.
 */
export function pasteOps(node: ImportedNode, parent: { id: string; type: string; layout?: unknown; width?: unknown; height?: unknown }, at: { x?: number; y?: number } = {}): DocOp[] {
  const { children = [], ...root } = node;
  const absolute = parent.type === 'board' || (parent.type === 'frame' && (parent.layout ?? 'none') === 'none');
  if (absolute) {
    const center = (size: unknown, own: unknown) => (typeof size === 'number' && typeof own === 'number' ? Math.round((size - own) / 2) : 0);
    // Path tunggal dengan offset meet tidak terjadi (importer membungkusnya dalam frame), jadi x/y akar selalu milik paste.
    root.position = 'absolute';
    root.x = at.x ?? center(parent.width, root.width);
    root.y = at.y ?? center(parent.height, root.height);
  } else {
    delete root.position;
    delete root.x;
    delete root.y;
  }
  return [
    { op: 'add', parentId: parent.id, node: root, ref: ROOT_REF },
    ...children.map((c): DocOp => ({ op: 'add', parentId: `@${ROOT_REF}`, node: { ...c } })),
  ];
}

type Actor = { sessionId: string; client?: string };

export type PasteRoutesOptions = {
  docs: Map<string, LakarDocument>;
  store: DocStore;
  docLocks: DocumentLocks;
  sessions: Sessions;
  activity?: ActivityBus;
};

/** Impor + commit di bawah kunci slug. Dokumen belum dimuat → dibaca dari disk (seperti route ops). */
async function commitPaste(opts: PasteRoutesOptions, slug: string, body: PasteBody, actor: Actor, onMissing: () => LakarError) {
  let imported;
  try {
    imported = importSvg(body.content, body.name !== undefined ? { name: body.name } : {});
  } catch (e) {
    if (e instanceof SvgImportError) throw new LakarError('SCHEMA_INVALID', e.message, { hint: SVG_HINT });
    throw e;
  }
  if (imported.paths > OPS_MAX - 1) {
    throw new LakarError('SCHEMA_INVALID', `SVG berisi ${imported.paths} bentuk; maks ${OPS_MAX - 1} per paste`, { hint: 'pecah SVG menjadi beberapa paste' });
  }
  const description = body.description ?? PASTE_DEFAULT_DESCRIPTION;
  return opts.docLocks.run(slug, async () => {
    const current = opts.docs.get(slug) ?? (await opts.store.read(slug));
    if (!current) throw onMissing();
    if (body.parentId.includes('/')) {
      throw new LakarError('SCHEMA_INVALID', `paste: parent ${body.parentId} adalah isi instance`, { hint: 'paste ke board atau frame biasa (bukan instance/isi instance)' });
    }
    const hit = locateNode(current, body.parentId);
    if (!hit) throw new LakarError('NOT_FOUND', `paste: node ${body.parentId} tidak ada di dokumen ${slug}`, { hint: 'pakai ID board/frame dari list_boards atau seleksi' });
    const parent = hit.node as unknown as { id: string; type: string; layout?: unknown; width?: unknown; height?: unknown };
    if (parent.type !== 'board' && parent.type !== 'frame') {
      throw new LakarError('SCHEMA_INVALID', `paste: parent ${body.parentId} bertipe ${parent.type}; harus board atau frame`, { hint: 'pilih board atau frame sebagai tujuan paste' });
    }
    const ops = pasteOps(imported.node, parent, { ...(body.x !== undefined ? { x: body.x } : {}), ...(body.y !== undefined ? { y: body.y } : {}) });
    const committed = await transact(current, { sessionId: actor.sessionId, description }, (tx) => applyOps(tx, ops));
    const entry = committed.entry!;
    const boards = touchedBoards(resolveDocument(current), resolveDocument(committed.doc));
    await opts.store.commit(slug, committed.doc, actor.client ? { ...entry, client: actor.client } : entry);
    opts.docs.set(slug, committed.doc);
    const report: PasteReport = { kind: 'svg', paths: imported.paths, kept: imported.kept, dropped: imported.dropped };
    return { doc: committed.doc, created: committed.created, inverse: committed.inverse, refs: committed.value.refs, nodeId: committed.value.refs[ROOT_REF]!, boards, report };
  });
}

export function registerPasteRoutes(app: FastifyInstance, opts: PasteRoutesOptions): void {
  app.post<{ Params: { slug: string } }>('/viewer/docs/:slug/paste', { bodyLimit: PASTE_BODY_LIMIT }, async (req, reply) => {
    const { slug } = req.params;
    if (!SLUG_PATTERN.test(slug)) {
      throw new LakarError('SCHEMA_INVALID', `slug tidak valid: ${JSON.stringify(slug)}`, {
        hint: `slug harus cocok pola ${SLUG_PATTERN.source} (huruf kecil, angka, tanda hubung; maks 64)`,
      });
    }
    const body = parsePasteBody(req.body);
    const r = await commitPaste(opts, slug, body, { sessionId: VIEWER_CLIENT, client: VIEWER_CLIENT }, () =>
      new LakarError('NOT_FOUND', `dokumen ${slug} tidak ada`, { hint: 'pakai slug dari GET /viewer/docs' }),
    );
    const origin = originOf(req.headers);
    opts.activity?.change({ kind: 'edit', slug, rev: r.doc.rev, boards: r.boards, ...(origin ? { origin } : {}) });
    return reply.code(200).send({ ok: true, data: { slug, rev: r.doc.rev, created: r.created, inverse: r.inverse, refs: r.refs, nodeId: r.nodeId, report: r.report } });
  });

  app.post('/viewer/paste', { bodyLimit: PASTE_BODY_LIMIT }, async (req, reply) => {
    const session = opts.sessions.require(req.headers[SESSION_HEADER]);
    const noDoc = () => new LakarError('NO_ACTIVE_DOC', 'sesi ini belum punya dokumen aktif', { hint: 'panggil open_doc {slug} terlebih dahulu' });
    const slug = session.activeSlug;
    if (!slug) throw noDoc();
    const body = parsePasteBody(req.body);
    const r = await commitPaste(opts, slug, body, { sessionId: session.id, ...(session.client ? { client: session.client } : {}) }, noDoc);
    return reply.code(200).send({ ok: true, data: { docId: r.doc.id, slug, rev: r.doc.rev, created: r.created, nodeId: r.nodeId, boards: r.boards, report: r.report } });
  });
}
