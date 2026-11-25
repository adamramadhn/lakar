// Route baca untuk viewer (Viewer B slice 1): daftar dan isi dokumen di `/viewer/*`, aset statis hasil build
// `packages/viewer` di `/app/*`. Route di file ini tidak menulis ke store atau salinan memori; route tulis viewer
// (kelola file, Restore, unggah gambar) ada di `files.ts`, dan edit layer memakai `/execute` biasa.
import type { FastifyInstance } from 'fastify';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateDocument, parseDocument } from '@lakar/core';
import { LakarError, SLUG_PATTERN, errorMessage, type HistoryEntry, type LakarDocument } from '@lakar/schema';
import type { CheckCounts, CheckLedger } from './checks.js';
import { notFound } from './errors.js';
import { VIEWER_CLIENT, isAgentName } from './events.js';
import type { RoomRegistry } from './rooms.js';
import type { Sessions } from './sessions.js';
import type { DocStore } from './store.js';

/** Default dist viewer: `packages/viewer/dist` (relatif terhadap `packages/daemon/{src,dist}`). */
export const VIEWER_DIST_DIR = fileURLToPath(new URL('../../viewer/dist/', import.meta.url));

export type ViewerDocSummary = {
  slug: string;
  rev: number;
  updatedAt: string;
  boardCount: number;
  firstBoardId: string | null;
  /** Waktu entri riwayat pertama (opsional; dokumen tanpa riwayat tidak punya). */
  createdAt?: string;
  /** Klien penulis entri riwayat terakhir (opsional; tidak diketahui untuk sesi lama yang sudah hilang). */
  lastClient?: string;
  /** Harness agen penulis entri riwayat terakhir (opsional; entri lama, entri aplikasi, dan klien tanpa header tidak punya). */
  lastAgent?: string;
  /** Hasil check terakhir yang mencakup semua board pada rev terkini (opsional; hanya memori daemon). */
  check?: CheckCounts;
  /** Dokumen room `@lakar/sync` yang digabung (spec-collab-cloud story 5; `server`/`peers`/`connected` ikut bila remote). */
  remote?: true;
  server?: string;
  peers?: number;
  connected?: boolean;
};

type DocMeta = Pick<ViewerDocSummary, 'createdAt' | 'lastClient' | 'lastAgent'>;

/** Entri riwayat untuk viewer: id sesi hanya versi publik (8 karakter), bukan kredensial penuh. */
export type ViewerHistoryEntry = {
  rev: number;
  description: string;
  opsSummary: string;
  /** Jumlah op dari `opsSummary` (`kind×n, …`). */
  opCount: number;
  at: string;
  session: string;
  /** Klien sesi bila sesi masih dikenal daemon (hilang setelah restart). */
  client?: string;
  /** Harness agen penulis (mis. `claude-code`), dari entri atau sesi yang masih dikenal; opsional. */
  agent?: string;
  /** Isi versi ini tersimpan sebagai snapshot (bisa dipratinjau, dibandingkan, dan dipulihkan). */
  snapshot?: boolean;
  /** Nama versi bernama yang menempel ke rev ini (spec-viewer-named-versions); snapshotnya di-pin. */
  label?: string;
};

export type ViewerRoutesOptions = {
  /** Salinan memori daemon (AD-1); dibaca saja. */
  docs: ReadonlyMap<string, LakarDocument>;
  store: DocStore;
  /** Sesi daemon (untuk nama klien di riwayat); dibaca saja. */
  sessions?: Sessions;
  /** Hasil check terakhir per dokumen (kolom Checks Dashboard); dibaca saja. */
  checks?: CheckLedger;
  /** Direktori hasil build viewer (berisi `index.html`). */
  distDir: string;
  /**
   * Sajikan viewer statis `/app` + `/app/*` (default true). Mode `--headless` mematikannya:
   * route `/viewer/*` tetap jalan (spec-collab-cloud story 6).
   */
  serveStatic?: boolean;
  /** Room `@lakar/sync` yang digabung (entri `remote` di daftar + replika untuk GET dokumen; story 5). */
  rooms?: RoomRegistry;
  /** Pencatat masalah non-fatal (file rusak dilewati). Default `console.warn`. */
  log?: (message: string) => void;
};

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const isEnoent = (e: unknown) => {
  const code = (e as NodeJS.ErrnoException)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR';
};

const invalidSlug = (slug: string) =>
  new LakarError('SCHEMA_INVALID', `slug tidak valid: ${JSON.stringify(slug)}`, {
    hint: `slug harus cocok pola ${SLUG_PATTERN.source} (huruf kecil, angka, tanda hubung; maks 64)`,
  });

const docNotFound = (slug: string) => notFound(`dokumen ${slug} tidak ada`, 'pakai slug dari GET /viewer/docs');

/**
 * Baca dokumen dari file tanpa efek samping (berbeda dengan `DocStore.read`, yang bisa menulis balik hasil
 * migrasi dan merapikan riwayat). `undefined` bila file tidak ada; file rusak → LakarError.
 */
export async function peekDocument(store: DocStore, slug: string, archived = false): Promise<LakarDocument | undefined> {
  let text: string;
  try {
    text = await readFile(archived ? store.archivedDocPath(slug) : store.docPath(slug), 'utf8');
  } catch (e) {
    if (isEnoent(e)) return undefined;
    throw e;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new LakarError('SCHEMA_INVALID', `file dokumen ${slug}.lakar.json bukan JSON valid: ${errorMessage(e)}`, {
      hint: 'pulihkan file dari cadangan atau buka slug lain',
    });
  }
  return parseDocument(migrateDocument(json));
}

/** Jumlah op dari `kind×n, …`; bagian tanpa `×n` dihitung satu. */
export function opCountOf(opsSummary: string): number {
  let n = 0;
  for (const part of opsSummary.split(',')) {
    const t = part.trim();
    if (!t) continue;
    const m = /×(\d+)$/.exec(t);
    n += m ? Number(m[1]) : 1;
  }
  return n;
}

export const summarize = (slug: string, doc: LakarDocument, mtimeMs: number): ViewerDocSummary => ({
  slug,
  rev: doc.rev,
  updatedAt: new Date(mtimeMs).toISOString(),
  boardCount: doc.pages.reduce((n, p) => n + p.children.length, 0),
  firstBoardId: doc.pages.find((p) => p.children.length > 0)?.children[0]?.id ?? null,
});

const boardIdsOf = (doc: LakarDocument) => doc.pages.flatMap((p) => p.children.map((b) => b.id));

/**
 * Klien penulis entri riwayat: `client` yang tercatat di entri (execute sejak aplikasi 11), lalu sesi yang masih
 * dikenal, lalu id sesi tetap `lakar-viewer` (kelola file dari aplikasi).
 */
export function historyClient(h: Pick<HistoryEntry, 'sessionId' | 'client'>, sessions?: Sessions): string | undefined {
  if (typeof h.client === 'string' && h.client) return h.client;
  return sessions?.byId(h.sessionId)?.client ?? (h.sessionId === VIEWER_CLIENT ? VIEWER_CLIENT : undefined);
}

/**
 * Harness agen penulis entri riwayat: `agent` yang tercatat di entri (sejak spec-agent-identity-history, divalidasi
 * ulang karena dibaca dari disk), lalu sesi yang masih dikenal. Entri aplikasi (`lakar-viewer`) tidak punya agen.
 */
export function historyAgent(h: Pick<HistoryEntry, 'sessionId' | 'agent'>, sessions?: Sessions): string | undefined {
  if (h.sessionId === VIEWER_CLIENT) return undefined;
  if (isAgentName(h.agent)) return h.agent;
  return sessions?.byId(h.sessionId)?.agent;
}

/** Created (entri pertama) dan Last agent (entri terakhir) dari riwayat; entri tanpa `sessionId`/`at` dilewati. */
export function historyMeta(history: readonly HistoryEntry[], sessions?: Sessions): DocMeta {
  const valid = history.filter((h) => typeof h.sessionId === 'string' && typeof h.at === 'string');
  const first = valid[0];
  const last = valid.at(-1);
  const client = last ? historyClient(last, sessions) : undefined;
  const agent = last ? historyAgent(last, sessions) : undefined;
  return { ...(first ? { createdAt: first.at } : {}), ...(client ? { lastClient: client } : {}), ...(agent ? { lastAgent: agent } : {}) };
}

export function registerViewerRoutes(app: FastifyInstance, { docs, store, sessions, checks, distDir, serveStatic = true, rooms, log = (m) => console.warn(m) }: ViewerRoutesOptions): void {
  const root = resolve(distDir);
  /** Ringkasan dokumen dari file per `slug@mtime`: file yang tidak berubah tidak di-parse ulang. */
  const cache = new Map<string, { mtimeMs: number; summary: ViewerDocSummary; docId: string; boardIds: string[] }>();
  /**
   * Meta riwayat per `slug@mtime` (juga untuk dokumen di memori): setiap commit menulis riwayat lalu dokumen,
   * jadi mtime dokumen berubah setiap riwayat bertambah.
   */
  const metaCache = new Map<string, { mtimeMs: number; meta: DocMeta }>();
  const metaOf = async (slug: string, mtimeMs: number): Promise<DocMeta> => {
    const hit = metaCache.get(slug);
    if (hit && hit.mtimeMs === mtimeMs) return hit.meta;
    try {
      const meta = historyMeta(await store.readHistory(slug), sessions);
      metaCache.set(slug, { mtimeMs, meta });
      return meta;
    } catch (e) {
      log(`lakard: viewer tidak bisa membaca riwayat ${slug}: ${errorMessage(e)}`);
      return {};
    }
  };
  // Check dihitung per permintaan: layout_check tidak menulis file, jadi tidak tertangkap mtime.
  const withCheck = (summary: ViewerDocSummary, doc: { id: string; rev: number }, boardIds: readonly string[]): ViewerDocSummary => {
    const check = checks?.forDoc(doc, boardIds);
    return check ? { ...summary, check } : summary;
  };

  app.get('/viewer/docs', async (_req, reply) => {
    const entries = await store.list();
    const out: ViewerDocSummary[] = [];
    for (const { slug, mtimeMs } of entries) {
      const mem = docs.get(slug);
      if (mem) {
        out.push(withCheck({ ...summarize(slug, mem, mtimeMs), ...(await metaOf(slug, mtimeMs)) }, mem, boardIdsOf(mem)));
        continue;
      }
      const hit = cache.get(slug);
      if (hit && hit.mtimeMs === mtimeMs) {
        out.push(withCheck(hit.summary, { id: hit.docId, rev: hit.summary.rev }, hit.boardIds));
        continue;
      }
      try {
        const doc = await peekDocument(store, slug);
        if (!doc) continue; // terhapus di antara list dan baca
        const summary = { ...summarize(slug, doc, mtimeMs), ...(await metaOf(slug, mtimeMs)) };
        const boardIds = boardIdsOf(doc);
        cache.set(slug, { mtimeMs, summary, docId: doc.id, boardIds });
        out.push(withCheck(summary, doc, boardIds));
      } catch (e) {
        cache.delete(slug);
        log(`lakard: viewer melewati ${slug}.lakar.json: ${errorMessage(e)}`);
      }
    }
    // Room yang digabung muncul di Dashboard dengan penanda remote (tanpa riwayat/meta/check lokal).
    for (const r of rooms?.list() ?? []) {
      const doc = rooms?.doc(r.slug);
      out.push({
        slug: r.slug,
        rev: r.rev,
        updatedAt: r.updatedAt,
        boardCount: doc?.pages.reduce((n, p) => n + p.children.length, 0) ?? 0,
        firstBoardId: doc?.pages.find((p) => p.children.length > 0)?.children[0]?.id ?? null,
        remote: true,
        server: r.server,
        peers: r.peers,
        connected: r.connected,
      });
    }
    out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.slug.localeCompare(b.slug)));
    return reply.code(200).send({ ok: true, data: { docs: out } });
  });

  app.get<{ Params: { slug: string } }>('/viewer/docs/:slug', async (req, reply) => {
    const { slug } = req.params;
    if (!SLUG_PATTERN.test(slug)) throw invalidSlug(slug);
    const doc = rooms?.doc(slug) ?? docs.get(slug) ?? (await peekDocument(store, slug));
    if (!doc) throw docNotFound(slug);
    return reply.code(200).send({ ok: true, data: { doc } });
  });

  // Riwayat revisi (baca-saja): urut rev turun; baris rusak dilewati oleh `readHistory`.
  app.get<{ Params: { slug: string } }>('/viewer/docs/:slug/history', async (req, reply) => {
    const { slug } = req.params;
    if (!SLUG_PATTERN.test(slug)) throw invalidSlug(slug);
    // Dokumen room tidak punya riwayat di daemon (riwayat room = tanggung jawab sync server).
    if (rooms?.doc(slug)) return reply.code(200).send({ ok: true, data: { entries: [] } });
    if (!docs.has(slug)) {
      const exists = await stat(store.docPath(slug)).then(
        (s) => s.isFile(),
        () => false,
      );
      if (!exists) throw docNotFound(slug);
    }
    const history = await store.readHistory(slug);
    const snapshots = await store.snapshotRevs(slug);
    // Versi bernama (spec-viewer-named-versions): entri bertag membawa `label`.
    const labels = new Map((await store.readVersions(slug)).map((t) => [t.rev, t.name]));
    const entries: ViewerHistoryEntry[] = history
      // `isHistoryEntry` store hanya memeriksa rev/opsSummary: lewati baris tanpa field yang dipakai di sini.
      .filter((h) => typeof h.sessionId === 'string' && typeof h.at === 'string' && typeof h.description === 'string')
      .map((h) => {
        // Entri dari aplikasi (kelola file) memakai id sesi tetap `lakar-viewer`.
        const client = historyClient(h, sessions);
        const agent = historyAgent(h, sessions);
        return {
          rev: h.rev,
          description: h.description,
          opsSummary: h.opsSummary,
          opCount: opCountOf(h.opsSummary),
          at: h.at,
          session: h.sessionId.slice(0, 8),
          ...(client ? { client } : {}),
          ...(agent ? { agent } : {}),
          // Opsional: hanya ditulis bila ada (bentuk entri lama tidak berubah).
          ...(snapshots.has(h.rev) ? { snapshot: true } : {}),
          ...(labels.has(h.rev) ? { label: labels.get(h.rev) } : {}),
        };
      })
      .sort((a, b) => b.rev - a.rev);
    return reply.code(200).send({ ok: true, data: { entries } });
  });

  // Viewer statis. `/app` → `/app/` supaya path relatif aset benar. Mode --headless tidak menyajikannya.
  if (serveStatic) {
    app.get('/app', async (_req, reply) => reply.redirect('/app/', 302));
    app.get<{ Params: { '*': string } }>('/app/*', async (req, reply) => {
      const rel = req.params['*'] || 'index.html';
      const indexPath = resolve(root, 'index.html');
      if (rel.includes('\0')) throw notFound(`file viewer ${JSON.stringify(rel)} tidak ada`, 'periksa path');
      const target = resolve(root, rel);
      if (target !== root && !target.startsWith(root + sep)) {
        throw notFound(`file viewer ${JSON.stringify(rel)} tidak ada`, 'periksa path');
      }
      const built = await stat(indexPath).then(
        (s) => s.isFile(),
        () => false,
      );
      if (!built) throw notFound(`viewer belum dibangun (${indexPath} tidak ada)`, 'jalankan pnpm build');
      let body: Buffer;
      try {
        body = await readFile(target);
      } catch (e) {
        if (isEnoent(e)) throw notFound(`file viewer ${JSON.stringify(rel)} tidak ada`, 'periksa path');
        throw e;
      }
      const type = MIME[extname(target).toLowerCase()] ?? 'application/octet-stream';
      // Aset Vite ber-hash → immutable; index.html selalu divalidasi ulang.
      const cache = rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
      return reply.type(type).header('cache-control', cache).header('x-content-type-options', 'nosniff').send(body);
    });
  }
}
