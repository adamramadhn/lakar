// Route baca-saja untuk viewer (Viewer B slice 1): daftar dan isi dokumen di `/viewer/*`, aset statis
// hasil build `packages/viewer` di `/app/*`. Tidak ada yang menulis ke store atau mengubah salinan memori.
import type { FastifyInstance } from 'fastify';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateDocument, parseDocument } from '@lakar/core';
import { LakarError, SLUG_PATTERN, errorMessage, type LakarDocument } from '@lakar/schema';
import { notFound } from './errors.js';
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
};

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
};

export type ViewerRoutesOptions = {
  /** Salinan memori daemon (AD-1); dibaca saja. */
  docs: ReadonlyMap<string, LakarDocument>;
  store: DocStore;
  /** Sesi daemon (untuk nama klien di riwayat); dibaca saja. */
  sessions?: Sessions;
  /** Direktori hasil build viewer (berisi `index.html`). */
  distDir: string;
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
async function peekDocument(store: DocStore, slug: string): Promise<LakarDocument | undefined> {
  let text: string;
  try {
    text = await readFile(store.docPath(slug), 'utf8');
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

const summarize = (slug: string, doc: LakarDocument, mtimeMs: number): ViewerDocSummary => ({
  slug,
  rev: doc.rev,
  updatedAt: new Date(mtimeMs).toISOString(),
  boardCount: doc.pages.reduce((n, p) => n + p.children.length, 0),
  firstBoardId: doc.pages.find((p) => p.children.length > 0)?.children[0]?.id ?? null,
});

export function registerViewerRoutes(app: FastifyInstance, { docs, store, sessions, distDir, log = (m) => console.warn(m) }: ViewerRoutesOptions): void {
  const root = resolve(distDir);
  /** Ringkasan dokumen dari file per `slug@mtime`: file yang tidak berubah tidak di-parse ulang. */
  const cache = new Map<string, { mtimeMs: number; summary: ViewerDocSummary }>();

  app.get('/viewer/docs', async (_req, reply) => {
    const entries = await store.list();
    const out: ViewerDocSummary[] = [];
    for (const { slug, mtimeMs } of entries) {
      const mem = docs.get(slug);
      if (mem) {
        out.push(summarize(slug, mem, mtimeMs));
        continue;
      }
      const hit = cache.get(slug);
      if (hit && hit.mtimeMs === mtimeMs) {
        out.push(hit.summary);
        continue;
      }
      try {
        const doc = await peekDocument(store, slug);
        if (!doc) continue; // terhapus di antara list dan baca
        const summary = summarize(slug, doc, mtimeMs);
        cache.set(slug, { mtimeMs, summary });
        out.push(summary);
      } catch (e) {
        cache.delete(slug);
        log(`lakard: viewer melewati ${slug}.lakar.json: ${errorMessage(e)}`);
      }
    }
    out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.slug.localeCompare(b.slug)));
    return reply.code(200).send({ ok: true, data: { docs: out } });
  });

  app.get<{ Params: { slug: string } }>('/viewer/docs/:slug', async (req, reply) => {
    const { slug } = req.params;
    if (!SLUG_PATTERN.test(slug)) throw invalidSlug(slug);
    const doc = docs.get(slug) ?? (await peekDocument(store, slug));
    if (!doc) throw docNotFound(slug);
    return reply.code(200).send({ ok: true, data: { doc } });
  });

  // Riwayat revisi (baca-saja): urut rev turun; baris rusak dilewati oleh `readHistory`.
  app.get<{ Params: { slug: string } }>('/viewer/docs/:slug/history', async (req, reply) => {
    const { slug } = req.params;
    if (!SLUG_PATTERN.test(slug)) throw invalidSlug(slug);
    if (!docs.has(slug)) {
      const exists = await stat(store.docPath(slug)).then(
        (s) => s.isFile(),
        () => false,
      );
      if (!exists) throw docNotFound(slug);
    }
    const history = await store.readHistory(slug);
    const entries: ViewerHistoryEntry[] = history
      // `isHistoryEntry` store hanya memeriksa rev/opsSummary: lewati baris tanpa field yang dipakai di sini.
      .filter((h) => typeof h.sessionId === 'string' && typeof h.at === 'string' && typeof h.description === 'string')
      .map((h) => {
        const client = sessions?.byId(h.sessionId)?.client;
        return {
          rev: h.rev,
          description: h.description,
          opsSummary: h.opsSummary,
          opCount: opCountOf(h.opsSummary),
          at: h.at,
          session: h.sessionId.slice(0, 8),
          ...(client ? { client } : {}),
        };
      })
      .sort((a, b) => b.rev - a.rev);
    return reply.code(200).send({ ok: true, data: { entries } });
  });

  // Viewer statis. `/app` → `/app/` supaya path relatif aset benar.
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
