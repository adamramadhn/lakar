// Route paste (epic paste-vektor story 3–4, AD-15): satu importer per jenis (`paste/svg.ts`, `paste/html.ts`) dan satu
// jalur commit untuk dua pintu.
// - `POST /viewer/docs/:slug/paste` — viewer (guard Origin), respons membawa `inverse` untuk tumpukan undo (AD-8).
// - `POST /viewer/paste` — sesi MCP (tool `paste`), dokumen aktif sesi, tercatat di Activity (`TOOL_ROUTES`).
// Hasil importer = NodeInput yang di-commit sebagai op `add` berantai lewat `applyOps` (AD-2): satu paste = satu rev
// + satu entri riwayat. SVG/HTML mentah tidak pernah disimpan. HTML dirender di halaman Chromium terisolasi
// (`paste/html-page.ts`, lewat port `HtmlSnapshotter`) sebelum kunci dokumen diambil. Tanpa render/check board.
import type { FastifyInstance } from 'fastify';
import { touchedBoards } from '@lakar/check';
import { applyOps, transact, type DocumentLocks } from '@lakar/core';
import { LakarError, OPS_MAX, SESSION_HEADER, SLUG_PATTERN, resolveDocument, type DocOp, type LakarDocument } from '@lakar/schema';
import { z } from 'zod';
import { writeAsset } from './assets.js';
import { VIEWER_CLIENT, originOf, type ActivityBus } from './events.js';
import { locateNode } from './inspect.js';
import { HtmlImportError, importHtml, type FontLookup, type HtmlReport, type ImportedNode } from './paste/html.js';
import type { HtmlSnapshot } from './paste/html-page.js';
import { PASTE_NAME_MAX, SvgImportError, importSvg, type KeptAttr, type PasteDropped } from './paste/svg.js';
import { NO_ACTIVE_DOC_HINT, authorOf, type Sessions } from './sessions.js';
import type { DocStore } from './store.js';

export const PASTE_KINDS = ['svg', 'html'] as const;
export type PasteKind = (typeof PASTE_KINDS)[number];
/** Panjang `content` maksimum (karakter). */
export const PASTE_CONTENT_MAX = 1_000_000;
/** Batas body route paste (JSON dengan escape bisa lebih besar dari isinya). */
export const PASTE_BODY_LIMIT = 8 * 1024 * 1024;
export const PASTE_DEFAULT_DESCRIPTION = 'Paste SVG';
export const PASTE_HTML_DESCRIPTION = 'Paste HTML';
export const PASTE_DESCRIPTION_MAX = 200;
/** Lebar viewport HTML maksimum dan default (tujuan tanpa lebar angka). */
export const PASTE_WIDTH_MAX = 4096;
export const PASTE_DEFAULT_WIDTH = 1280;
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
    /** Lebar viewport HTML (px); default lebar tujuan. Diabaikan untuk SVG. */
    width: z.number().finite().min(1).max(PASTE_WIDTH_MAX).optional(),
  })
  .strict();
export type PasteBody = z.infer<typeof PasteBody>;
const PASTE_HINT = `kirim {content: '<svg …>' atau HTML, parentId: ID board/frame, x?, y?, name?, description?, kind?: 'svg'|'html', width?} (content maks ${PASTE_CONTENT_MAX} karakter)`;
const SVG_HINT = 'content harus dokumen SVG utuh berakar <svg> berisi path/rect/circle/ellipse/line/polyline/polygon';
const HTML_HINT = 'content harus potongan HTML dengan elemen atau teks yang terlihat (skrip tidak dijalankan, jaringan diblokir)';

export type SvgPasteReport = { kind: 'svg'; paths: number; kept: KeptAttr[]; dropped: PasteDropped[] };
export type PasteReport = SvgPasteReport | HtmlReport;

/** Port render HTML terisolasi (ChromiumRenderer.snapshotHtml); tidak ada → paste HTML `RENDER_FAILED`. */
export type HtmlSnapshotter = { snapshotHtml(html: string, opts: { width: number }): Promise<HtmlSnapshot> };

/** Validasi body (sama untuk kedua route). */
export function parsePasteBody(body: unknown): PasteBody {
  const parsed = PasteBody.safeParse(body);
  if (!parsed.success) {
    throw new LakarError('SCHEMA_INVALID', parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: PASTE_HINT });
  }
  return parsed.data;
}

type ParentLike = { id: string; type: string; layout?: unknown; width?: unknown; height?: unknown; padding?: unknown };

/**
 * Op paste: `add` akar (ref `paste`) lalu `add` tiap anak ke parent-nya. Kontainer di dalam pohon mendapat ref
 * `paste-1`, `paste-2`, … (urut pre-order); daun tanpa ref, jadi SVG satu tingkat tetap `add` ke `@paste`.
 * Di board atau frame `layout:'none'` akar absolut di `x`/`y` (default: tengah parent berukuran angka, selain itu
 * 0,0); di parent flow tanpa x/y.
 */
export function pasteOps(node: ImportedNode, parent: ParentLike, at: { x?: number; y?: number } = {}, size?: { width: number; height: number }): DocOp[] {
  const { children = [], ...root } = node;
  const absolute = parent.type === 'board' || (parent.type === 'frame' && (parent.layout ?? 'none') === 'none');
  if (absolute) {
    const center = (size: unknown, own: unknown) => (typeof size === 'number' && typeof own === 'number' ? Math.round((size - own) / 2) : 0);
    // Path tunggal dengan offset meet tidak terjadi (importer membungkusnya dalam frame), jadi x/y akar selalu milik paste.
    root.position = 'absolute';
    // Akar hug (HTML tanpa ukuran angka): ditengahkan dengan ukuran kotak hasil impor.
    root.x = at.x ?? center(parent.width, typeof root.width === 'number' ? root.width : size?.width);
    root.y = at.y ?? center(parent.height, typeof root.height === 'number' ? root.height : size?.height);
  } else {
    delete root.position;
    delete root.x;
    delete root.y;
  }
  const ops: DocOp[] = [{ op: 'add', parentId: parent.id, node: root, ref: ROOT_REF }];
  let seq = 0;
  const walk = (kids: readonly ImportedNode[], parentRef: string) => {
    for (const c of kids) {
      const { children: sub, ...rest } = c;
      if (sub?.length) {
        const ref = `${ROOT_REF}-${++seq}`;
        ops.push({ op: 'add', parentId: `@${parentRef}`, node: { ...rest }, ref });
        walk(sub, ref);
      } else ops.push({ op: 'add', parentId: `@${parentRef}`, node: { ...rest } });
    }
  };
  walk(children, ROOT_REF);
  return ops;
}

/** Jumlah node pohon impor. */
const countNodes = (n: ImportedNode): number => 1 + (n.children ?? []).reduce((a, c) => a + countNodes(c), 0);

/** Lebar viewport HTML default: lebar board, lebar frame angka dikurangi padding horizontal, atau 1280. */
export function htmlViewportWidth(parent: ParentLike | undefined): number {
  if (!parent || typeof parent.width !== 'number' || parent.width < 1) return PASTE_DEFAULT_WIDTH;
  if (parent.type !== 'frame') return Math.min(PASTE_WIDTH_MAX, parent.width);
  const p = parent.padding;
  const num = (v: unknown) => (typeof v === 'number' ? v : 0);
  const horiz = Array.isArray(p) ? (p.length === 2 ? 2 * num(p[1]) : num(p[1]) + num(p[3])) : 2 * num(p);
  return Math.min(PASTE_WIDTH_MAX, Math.max(1, parent.width - horiz));
}

type Actor = { sessionId: string; client?: string; agent?: string };

export type PasteRoutesOptions = {
  docs: Map<string, LakarDocument>;
  store: DocStore;
  docLocks: DocumentLocks;
  sessions: Sessions;
  activity?: ActivityBus;
  /** Render HTML terisolasi (Chromium daemon); tidak ada → paste HTML ditolak `RENDER_FAILED`. */
  html?: HtmlSnapshotter;
  /** Famili terdaftar (registry font) untuk pemetaan font HTML. */
  fonts?: FontLookup;
  /** Direktori data daemon (store aset untuk gambar data URI HTML). */
  dataDir?: string;
};

type Imported = { node: ImportedNode; report: PasteReport; assets: { sha: string; bytes: Buffer }[]; size?: { width: number; height: number } };

/** Parent paste di `doc`: board atau frame biasa; selain itu error yang sama untuk pra-cek dan cek di bawah kunci. */
function pasteParent(doc: LakarDocument | undefined, slug: string, parentId: string, onMissing: () => LakarError): ParentLike {
  if (!doc) throw onMissing();
  if (parentId.includes('/')) {
    throw new LakarError('SCHEMA_INVALID', `paste: parent ${parentId} adalah isi instance`, { hint: 'paste ke board atau frame biasa (bukan instance/isi instance)' });
  }
  const hit = locateNode(doc, parentId);
  if (!hit) throw new LakarError('NOT_FOUND', `paste: node ${parentId} tidak ada di dokumen ${slug}`, { hint: 'pakai ID board/frame dari list_boards atau seleksi' });
  const parent = hit.node as unknown as ParentLike;
  if (parent.type !== 'board' && parent.type !== 'frame') {
    throw new LakarError('SCHEMA_INVALID', `paste: parent ${parentId} bertipe ${parent.type}; harus board atau frame`, { hint: 'pilih board atau frame sebagai tujuan paste' });
  }
  return parent;
}

/** Impor sesuai `kind` (HTML: render terisolasi di luar kunci dokumen). */
async function importContent(opts: PasteRoutesOptions, slug: string, body: PasteBody, onMissing: () => LakarError): Promise<Imported> {
  if ((body.kind ?? 'svg') === 'svg') {
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
    return { node: imported.node, report: { kind: 'svg', paths: imported.paths, kept: imported.kept, dropped: imported.dropped }, assets: [] };
  }
  if (!opts.html) {
    throw new LakarError('RENDER_FAILED', 'paste HTML butuh Chromium daemon, yang tidak tersedia di daemon ini', {
      hint: 'jalankan lakard dengan browser render (scripts/install-browser.sh atau LAKAR_BROWSER_CHANNEL); paste SVG tetap bisa',
      retryable: false,
    });
  }
  // Pra-cek tanpa kunci sebelum render Chromium (mahal): dokumen dan parent salah gagal cepat dengan error yang sama.
  // Lebar viewport dari parent ter-resolve (token padding/lebar menjadi angka). Parent divalidasi ulang di bawah kunci.
  const current = opts.docs.get(slug) ?? (await opts.store.read(slug));
  pasteParent(current, slug, body.parentId, onMissing);
  const resolvedParent = locateNode(resolveDocument(current!), body.parentId)?.node as unknown as ParentLike | undefined;
  const width = Math.round(body.width ?? htmlViewportWidth(resolvedParent));
  const snap = await opts.html.snapshotHtml(body.content, { width });
  let imported;
  try {
    imported = importHtml(snap, { ...(body.name !== undefined ? { name: body.name } : {}), fonts: opts.fonts ?? (() => undefined) });
  } catch (e) {
    if (e instanceof HtmlImportError) throw new LakarError('SCHEMA_INVALID', e.message, { hint: HTML_HINT });
    throw e;
  }
  const n = countNodes(imported.node);
  if (n > OPS_MAX) {
    throw new LakarError('SCHEMA_INVALID', `HTML menghasilkan ${n} layer; maks ${OPS_MAX} per paste`, { hint: 'paste potongan HTML yang lebih kecil' });
  }
  return { node: imported.node, report: imported.report, assets: imported.assets, size: { width: imported.width, height: imported.height } };
}

/** Impor + commit di bawah kunci slug. Dokumen belum dimuat → dibaca dari disk (seperti route ops). */
async function commitPaste(opts: PasteRoutesOptions, slug: string, body: PasteBody, actor: Actor, onMissing: () => LakarError) {
  const imported = await importContent(opts, slug, body, onMissing);
  const description = body.description ?? ((body.kind ?? 'svg') === 'html' ? PASTE_HTML_DESCRIPTION : PASTE_DEFAULT_DESCRIPTION);
  return opts.docLocks.run(slug, async () => {
    const current = opts.docs.get(slug) ?? (await opts.store.read(slug));
    const parent = pasteParent(current, slug, body.parentId, onMissing);
    const ops = pasteOps(imported.node, parent, { ...(body.x !== undefined ? { x: body.x } : {}), ...(body.y !== undefined ? { y: body.y } : {}) }, imported.size);
    // Aset gambar (content-addressed) ditulis sebelum transaksi; bila commit gagal, aset yatim tidak merusak apa pun.
    if (imported.assets.length) {
      if (!opts.dataDir) throw new LakarError('RENDER_FAILED', 'store aset tidak tersedia untuk gambar HTML', { hint: 'jalankan lakard dengan dataDir', retryable: false });
      for (const a of imported.assets) await writeAsset(opts.dataDir, a.bytes);
    }
    const committed = await transact(current!, { sessionId: actor.sessionId, description }, (tx) => applyOps(tx, ops));
    const entry = committed.entry!;
    const boards = touchedBoards(resolveDocument(current!), resolveDocument(committed.doc));
    await opts.store.commit(slug, committed.doc, { ...entry, ...authorOf(actor) });
    opts.docs.set(slug, committed.doc);
    return { doc: committed.doc, created: committed.created, inverse: committed.inverse, refs: committed.value.refs, nodeId: committed.value.refs[ROOT_REF]!, boards, report: imported.report };
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
    const noDoc = () => new LakarError('NO_ACTIVE_DOC', 'sesi ini belum punya dokumen aktif', { hint: NO_ACTIVE_DOC_HINT });
    const slug = session.activeSlug;
    if (!slug) throw noDoc();
    const body = parsePasteBody(req.body);
    const r = await commitPaste(opts, slug, body, { sessionId: session.id, ...authorOf(session) }, noDoc);
    return reply.code(200).send({
      ok: true,
      data: {
        docId: r.doc.id,
        slug,
        rev: r.doc.rev,
        created: r.created,
        nodeId: r.nodeId,
        boards: r.boards,
        report: r.report,
        // Target tulis (spec-agent-open-doc), sama dengan execute.
        target: { slug, name: slug, boardIds: r.doc.pages.flatMap((p) => p.children.map((b) => b.id)) },
      },
    });
  });
}
