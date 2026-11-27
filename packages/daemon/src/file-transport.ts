// Transport file untuk MCP `lakar --file <path>` (spec-collab-cloud story 2): "daemon satu dokumen" —
// route tool yang sama dengan lakard dipetakan langsung ke `DocStore` + transaksi `@lakar/core` pada satu
// `.lakar.json`, tanpa sesi HTTP, tanpa render, tanpa jaringan, tanpa viewer. `open_doc` jadi no-op yang
// menandai file aktif (slug = basename file); panggilan tool pertama juga membuka dokumen otomatis.
// Tool yang butuh render (screenshot/export/layout_check/fix_check/paste/import_url/visual_diff),
// jaringan (photo_search, `photo()` di execute), atau viewer (get_selection) → error NOT_SUPPORTED dengan
// hint menjalankan lakard. Tulis selalu lewat `DocStore.commit` (riwayat + tulis atomik + snapshot sidecar).
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { touchedBoards } from '@lakar/check';
import { DocumentLocks, IdAllocator, applyOps, migrateDocument, parseDocument, transact } from '@lakar/core';
import { DEFAULT_MEMORY_BYTES, DEFAULT_TIMEOUT_MS, photoRefsInCode, runSnippet } from '@lakar/exec';
import { dtcgTokensJson, generateCode, parseDtcgTokens } from '@lakar/codegen';
import { IconCatalog } from '@lakar/icons';
import type { IconCatalogPort } from '@lakar/ports';
import { iconRefs, parseCssVariables } from '@lakar/render';
import {
  LAKAR_VERSION,
  LakarError,
  SCHEMA_VERSION,
  SLUG_PATTERN,
  errorMessage,
  findBoard,
  resolveDocument,
  type ApiResult,
  type HistoryEntry,
  type IconGlyph,
  type LakarDocument,
} from '@lakar/schema';
import { RETIRED_SKILLS, SKILL_NAMES, SKILLS_DIR, listSkills, readSkill } from '@lakar/skills';
import { z } from 'zod';
import { CLUSTERS_HINT, ClustersBody, SCOPE_HINT, ScopeBody, analyzeClusters, analyzeColors, analyzeTypography, requireBoard } from './analyze.js';
import { CreateBody as PageCreateBody, SwitchBody, TreeBody, outlineNode, pageSummary, resolvePageRef } from './agent-pages.js';
import { AgentSteps, BODY_HINT as STEPS_HINT, FIX_FORWARD, StepsBody, laterAuthor } from './agent-undo.js';
import { EXPORT_CODE_HINT, EXPORT_SVG_HINT, ExportCodeBody, ExportSvgBody, exportGlyphs, exportSvgNode, type CodeExportOptions } from './code-export.js';
import { slugify } from './files.js';
import {
  CreateBody as CommentCreateBody,
  DeleteBody,
  ListBody as CommentListBody,
  ReplyBody,
  ResolveBody,
  authorFor,
  filterThreads,
  mutateCreate,
  mutateDelete,
  mutateReply,
  mutateResolve,
  type Mutate,
} from './comments.js';
import { notFound } from './errors.js';
import { INSPECT_DEPTH_DEFAULT, WIP_PREFIX, inspectFit, locateNode } from './inspect.js';
import { defaultPageName } from './pages.js';
import {
  BoardsBody,
  DESCRIPTION_EXAMPLE,
  EXECUTE_BODY_HINT,
  EMPTY_CHANGES,
  ExecuteBody,
  ICON_SEARCH_HINT,
  IconSearchBody,
  InspectBody,
  ListDocumentsBody,
  NOT_COMMITTED,
  OPEN_HINT,
  OpenBody,
  SkillBody,
  applyEdits,
  descriptionProblem,
  nodeChanges,
} from './server.js';
import { activePageIndex, authorOf, logExecute, noteWrite, recallFailed, rememberFailed, setActiveDoc, type Session } from './sessions.js';
import { DocStore } from './store.js';

const DOC_SUFFIX = '.lakar.json';

/** Parser impor CSS variables / DTCG untuk `importCssVariables`/`importDtcgTokens` di execute (sama dengan daemon). */
const CSS_VARIABLES = { parse: parseCssVariables };
const DTCG = { parse: parseDtcgTokens };

/** Target respons tulis: sama dengan `targetOf` di server.ts (slug = nama). */
const targetOf = (slug: string, doc: LakarDocument) => ({ slug, name: slug, boardIds: doc.pages.flatMap((p) => p.children.map((b) => b.id)) });

/** Hint seragam untuk fitur yang hanya ada di lakard (render, jaringan, seleksi viewer). */
const NEED_DAEMON_HINT = 'tool ini butuh lakard (render/jaringan/viewer); jalankan `lakard` lalu pakai MCP tanpa --file';

const notSupported = (what: string) => new LakarError('NOT_SUPPORTED', `${what} tidak bisa jalan di mode file (lakar --file)`, { hint: NEED_DAEMON_HINT });

/** Route yang didukung mode file. Sisanya → NOT_SUPPORTED (semua route lain memang butuh lakard). */
export type FileTransportOptions = {
  /** Nama klien untuk entri riwayat dan penulis komentar (default `lakar-mcp`, sama dengan `CLIENT_NAME`). */
  client?: string;
  /** Katalog ikon (default `IconCatalog.load()` pada pemakaian pertama). */
  icons?: IconCatalogPort<string, IconGlyph>;
  /** Direktori file skill untuk `/skills/read` (default `SKILLS_DIR`). */
  skillsDir?: string;
  /** Batas waktu snippet execute (default `DEFAULT_TIMEOUT_MS` exec). */
  execTimeoutMs?: number;
  /** Batas memori snippet execute (default `DEFAULT_MEMORY_BYTES` exec). */
  execMemoryBytes?: number;
};

/**
 * Backend transport file: `call(path, body)` + `status()` dengan bentuk `ApiResult` yang sama dengan
 * `DaemonClient`. Konstruktor memvalidasi file sinkron — file hilang / JSON rusak / skema tak dikenal
 * → `Error` dengan pesan jelas (gagal start).
 */
export class FileTransport {
  /** Path absolut file `.lakar.json` yang di-edit. */
  readonly file: string;
  /** Slug dokumen = basename tanpa `.lakar.json`, disanitasi (`slugify`) supaya selalu valid. */
  readonly slug: string;
  readonly #store: DocStore;
  #cached: LakarDocument | undefined;
  /** mtime berkas saat baca/tulis terakhir — dasar deteksi tulis dari proses lain sebelum commit. */
  #mtimeMs: number | undefined;
  readonly #locks = new DocumentLocks();
  readonly #session: Session;
  readonly #steps = new AgentSteps();
  readonly #skillsDir: string;
  readonly #execTimeoutMs: number;
  readonly #execMemoryBytes: number;
  readonly #iconsOpt: IconCatalogPort<string, IconGlyph> | undefined;
  #icons: IconCatalogPort<string, IconGlyph> | undefined;
  /** Penyedia nama harness agen (diset `setAgent` sesudah initialize MCP). */
  #agentFn: (() => string | undefined) | undefined;
  readonly #startedAt = new Date();

  constructor(file: string, options: FileTransportOptions = {}) {
    this.file = resolve(file);
    const base = basename(this.file);
    if (!base.endsWith(DOC_SUFFIX)) {
      throw new Error(`transport file: --file harus menunjuk berkas ${DOC_SUFFIX}, bukan ${JSON.stringify(base)}`);
    }
    // Slug = basename yang disanitasi (`My Design.lakar.json` → `my-design`); berkas di disk tetap nama aslinya.
    this.slug = slugify(base.slice(0, -DOC_SUFFIX.length));
    if (!SLUG_PATTERN.test(this.slug)) {
      throw new Error(`transport file: nama file ${JSON.stringify(base)} tidak menghasilkan slug valid (huruf/angka/tanda hubung) — ganti nama berkas`);
    }
    const dir = dirname(this.file);
    this.#store = new DocStore(dir, { docsDir: dir, docFile: base });
    this.#skillsDir = options.skillsDir ?? SKILLS_DIR;
    this.#execTimeoutMs = options.execTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#execMemoryBytes = options.execMemoryBytes ?? DEFAULT_MEMORY_BYTES;
    this.#iconsOpt = options.icons;
    this.#session = {
      id: randomUUID(),
      createdAt: this.#startedAt.toISOString(),
      executes: 0,
      keep: {},
      failed: new Map(),
      log: [],
      client: options.client ?? 'lakar-mcp',
    };
    // Validasi awal sinkron (pesan sama dengan DocStore.read): file hilang/JSON rusak/skema rusak → gagal start.
    let text: string;
    try {
      text = readFileSync(this.file, 'utf8');
    } catch (e) {
      throw new Error(`transport file: tidak bisa membaca ${this.file}: ${errorMessage(e)}`);
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error(`transport file: file ${base} bukan JSON valid: ${errorMessage(e)}`);
    }
    try {
      parseDocument(migrateDocument(json));
    } catch (e) {
      if (e instanceof LakarError && e.code === 'VERSION_MISMATCH') {
        throw new Error(`transport file: ${base}: ${e.message}${e.hint ? ` (${e.hint})` : ''}`);
      }
      throw new Error(`transport file: file ${base} rusak: ${errorMessage(e)}`);
    }
  }

  /** Sambungkan nama harness agen (sudah disanitasi pemanggil) — dipakai penulis komentar + field `agent` riwayat. */
  setAgent(provider: () => string | undefined): void {
    this.#agentFn = provider;
  }

  /** Dokumen dari salinan memori; dimuat dari disk sekali (rekonsiliasi riwayat + write-back migrasi via DocStore.read). */
  async #doc(): Promise<LakarDocument> {
    if (this.#cached === undefined) {
      const doc = await this.#store.read(this.slug);
      if (!doc) throw this.#fileGone();
      this.#cached = doc;
      this.#mtimeMs = await this.#fileMtime();
    }
    return this.#cached;
  }

  /** Error berkas hilang (satu bentuk untuk semua titik baca/stat). */
  #fileGone(): LakarError {
    return notFound(`file ${basename(this.file)} tidak ada lagi`, `buat ulang ${this.file}, atau jalankan ulang lakar --file`);
  }

  /** mtime berkas dokumen (ms); ENOENT → `undefined` (berkas terhapus sesudah dimuat). */
  async #fileMtime(): Promise<number | undefined> {
    try {
      return (await stat(this.file)).mtimeMs;
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return undefined;
      throw e;
    }
  }

  /**
   * Gerbang tulis lintas proses — dipanggil DI DALAM kunci `#locks` sebelum setiap commit:
   * mtime berubah sejak baca/tulis terakhir → baca ulang dari disk; rev di disk beda dari cache →
   * CONFLICT (edit eksternal tidak ditimpa); rev sama → cache disegarkan (berkas bisa ditulis ulang
   * pada rev yang sama) lalu lanjut. Bukan locking penuh — mempersempit jendela balapan saja.
   */
  async #guardExternal(): Promise<LakarDocument> {
    const cached = await this.#doc();
    const before = await this.#fileMtime();
    if (before === undefined) throw this.#fileGone();
    if (before === this.#mtimeMs) return cached;
    const onDisk = await this.#store.read(this.slug);
    if (!onDisk) throw this.#fileGone();
    // mtime baru dicatat HANYA setelah lolos — CONFLICT harus berulang di panggilan berikutnya,
    // bukan ditandai "sudah dilihat" lalu menimpa edit eksternal.
    if (onDisk.rev !== cached.rev) {
      throw new LakarError('CONFLICT', `file ${basename(this.file)} berubah di luar proses ini (disk rev ${onDisk.rev}, sesi ini rev ${cached.rev})`, {
        hint: 'jalankan ulang lakar --file agar perubahan eksternal termuat, lalu ulangi perubahan sesi ini; edit eksternal tidak ditimpa',
        retryable: false,
      });
    }
    this.#mtimeMs = await this.#fileMtime();
    this.#cached = onDisk;
    return onDisk;
  }

  /** Commit lewat DocStore lalu catat mtime baru — tulis sendiri tidak boleh terbaca sebagai konflik. */
  async #write(slug: string, doc: LakarDocument, entry: HistoryEntry): Promise<void> {
    await this.#store.commit(slug, doc, entry);
    this.#mtimeMs = await this.#fileMtime();
  }

  /** Mode file: tepat satu dokumen — otomatis aktif pada pemakaian pertama (open_doc otomatis). */
  #active(): string {
    if (this.#session.activeSlug !== this.slug) setActiveDoc(this.#session, this.slug);
    return this.slug;
  }

  /** Katalog ikon malas (pemakaian pertama). */
  #iconCatalog(): IconCatalogPort<string, IconGlyph> {
    return (this.#icons ??= this.#iconsOpt ?? IconCatalog.load());
  }

  /** Field penulis riwayat atas nama sesi (agent diperbarui di `call`). */
  #author(): { client?: string; agent?: string } {
    return authorOf(this.#session);
  }

  /** Status transport (bentuk `/status` daemon + field file). */
  async status<T>(): Promise<ApiResult<T>> {
    const doc = this.#cached;
    const s = this.#session;
    return {
      ok: true,
      data: {
        version: LAKAR_VERSION,
        schemaVersion: SCHEMA_VERSION,
        node: process.version,
        pid: process.pid,
        startedAt: this.#startedAt.toISOString(),
        uptimeSec: Math.floor((Date.now() - this.#startedAt.getTime()) / 1000),
        transport: 'file',
        file: this.file,
        slug: this.slug,
        ...(doc ? { rev: doc.rev } : {}),
        hint: "mode file tanpa renderer: board height:'hug' tidak terukur (height 0) dan place(w,'hug')/place({near}) bisa menumpuk board — atur x/y eksplisit atau jalankan lakard",
        sessions: {
          count: 1,
          active: [
            {
              id: s.id.slice(0, 8),
              ...(s.activeSlug ? { activeSlug: s.activeSlug } : {}),
              createdAt: s.createdAt,
              executes: s.executes,
            },
          ],
        },
      } as T,
    };
  }

  /**
   * Panggil route tool dalam bentuk `ApiResult` (sama dengan `DaemonClient.call`): LakarError →
   * `{ok:false,error}` berkode sama; error tak terduga → EXEC_ERROR.
   */
  async call<T>(path: string, body: unknown): Promise<ApiResult<T>> {
    // Nama agen baru tersedia sesudah initialize MCP — diperbarui pada setiap panggilan.
    const agent = this.#agentFn?.();
    if (agent) this.#session.agent = agent;
    try {
      const data = await this.#dispatch(path, body ?? {});
      return { ok: true, data: data as T };
    } catch (e) {
      if (e instanceof LakarError) return { ok: false, error: e.toBody() };
      return {
        ok: false,
        error: { code: 'EXEC_ERROR', message: `kesalahan internal transport file: ${errorMessage(e)}`, hint: 'coba lagi; periksa log lakar', retryable: true },
      };
    }
  }

  async #dispatch(path: string, body: unknown): Promise<unknown> {
    switch (path) {
      case '/sessions':
        return { sessionId: this.#session.id, version: LAKAR_VERSION, schemaVersion: SCHEMA_VERSION };
      case '/docs/open':
        return this.#openDoc(body);
      case '/viewer/documents':
        return this.#documents(body);
      case '/boards':
        return this.#boards(body);
      case '/inspect':
        return this.#inspect(body);
      case '/pages':
        return this.#pages(body);
      case '/pages/switch':
        return this.#switchPage(body);
      case '/pages/create':
        return this.#createPage(body);
      case '/pages/tree':
        return this.#pageTree(body);
      case '/comments':
        return this.#comments(body);
      case '/comments/create':
        return this.#commentCreate(body);
      case '/comments/reply':
        return this.#commentReply(body);
      case '/comments/resolve':
        return this.#commentResolve(body);
      case '/comments/delete':
        return this.#commentDelete(body);
      case '/analyze/colors':
        return this.#analyze(body, ScopeBody, SCOPE_HINT, (doc, b) => analyzeColors(doc, b.boardId));
      case '/analyze/typography':
        return this.#analyze(body, ScopeBody, SCOPE_HINT, (doc, b) => analyzeTypography(doc, b.boardId));
      case '/analyze/clusters':
        return this.#analyze(body, ClustersBody, CLUSTERS_HINT, (doc, b) => analyzeClusters(doc, b.boardId, b.min ?? 3));
      case '/execute':
        return this.#execute(body);
      case '/icons/search':
        return this.#iconSearch(body);
      case '/skills/read':
        return this.#skillRead(body);
      case '/viewer/export-code':
        return this.#exportCode(body);
      case '/viewer/export-svg':
        return this.#exportSvg(body);
      case '/viewer/undo':
        return this.#undoRedo('undo', body);
      case '/viewer/redo':
        return this.#undoRedo('redo', body);
      default:
        throw notSupported(`route ${path}`);
    }
  }

  // -------------------------------------------------------------------------
  // Dokumen
  // -------------------------------------------------------------------------

  /** open_doc: menandai file sebagai dokumen aktif sesi (slug lain → NOT_FOUND; file tidak pernah dibuat di sini). */
  async #openDoc(rawBody: unknown): Promise<unknown> {
    const body = this.#parse(OpenBody, rawBody, OPEN_HINT);
    if (body.slug !== undefined) {
      if (!SLUG_PATTERN.test(body.slug)) {
        throw new LakarError('SCHEMA_INVALID', `slug tidak valid: ${JSON.stringify(body.slug)}`, {
          hint: `slug harus cocok pola ${SLUG_PATTERN.source} (huruf kecil, angka, tanda hubung; maks 64)`,
        });
      }
      if (body.slug !== this.slug) {
        throw notFound(
          `dokumen ${body.slug} tidak ada di mode file`,
          `mode file terkunci ke ${this.file} — pakai slug ${JSON.stringify(this.slug)} atau jalankan MCP tanpa --file lewat lakard untuk dokumen lain`,
        );
      }
    }
    const slug = this.#active();
    const doc = await this.#doc();
    return {
      docId: doc.id,
      slug,
      rev: doc.rev,
      created: false,
      source: body.slug !== undefined ? 'slug' : 'file',
      target: targetOf(slug, doc),
      viewerOpen: false,
      hint: "mode file: tidak ada aplikasi Lakar terhubung — untuk pratinjau live buka file ini di aplikasi Lakar (atau jalankan lakard). Tanpa renderer, board height:'hug' tidak terukur (height 0) dan place(w,'hug')/place({near}) bisa menumpuk board — atur x/y eksplisit",
    };
  }

  /** list_documents: daftar satu entri — file ini. */
  async #documents(rawBody: unknown): Promise<unknown> {
    this.#parse(ListDocumentsBody, rawBody ?? undefined, 'kirim {} (tanpa argumen)');
    const slug = this.#active();
    const doc = await this.#doc();
    const mtime = await this.#fileMtime();
    if (mtime === undefined) throw this.#fileGone();
    const documents = [
      { slug, name: slug, rev: doc.rev, updatedAt: new Date(mtime).toISOString(), open: false, focused: false, active: true as const },
    ];
    return { documents, focused: null, active: slug };
  }

  /** list_boards: seperti daemon tetapi tanpa render — board `height:'hug'` belum terukur → height 0. */
  async #boards(rawBody: unknown): Promise<unknown> {
    const slug = this.#active();
    this.#parse(BoardsBody, rawBody ?? undefined, 'kirim {} (tanpa argumen)');
    const stored = await this.#doc();
    const resolved = resolveDocument(stored);
    const boards = resolved.pages.flatMap((p) =>
      p.children.map((b) => ({
        id: b.id,
        name: b.name,
        page: p.name,
        screen: b.screen,
        x: b.x,
        y: b.y,
        width: b.width,
        // Board hug: tinggi terukur butuh render — di mode file selalu belum terukur (0 + heightMode).
        height: typeof b.height === 'number' ? b.height : 0,
        ...(b.height === 'hug' ? { heightMode: 'hug' as const } : {}),
        ...(b.expectedSize ? { expectedSize: b.expectedSize } : {}),
        wip: b.name.startsWith(WIP_PREFIX),
        childCount: b.children.length,
      })),
    );
    return { docId: stored.id, slug, rev: stored.rev, boards };
  }

  /** inspect: properti tersimpan + anak sampai depth — tanpa `bounds` (butuh render). */
  async #inspect(rawBody: unknown): Promise<unknown> {
    const slug = this.#active();
    const body = this.#parse(InspectBody, rawBody, `kirim {id, depth?} (depth 0–6, default ${INSPECT_DEPTH_DEFAULT})`);
    const stored = await this.#doc();
    const hit = locateNode(stored, body.id);
    // Paritas daemon: node ada tapi board pemiliknya gagal resolve → NOT_FOUND yang sama.
    if (!hit || !findBoard(resolveDocument(stored), hit.board.id)) {
      throw notFound(`node ${body.id} tidak ada di dokumen ${slug}`, 'pakai ID dari created[] execute atau list_boards');
    }
    // Bounds butuh render — mode file mengirim pohon apa adanya (tanpa `bounds`).
    const fit = inspectFit(hit.node, new Map(), body.depth ?? INSPECT_DEPTH_DEFAULT);
    return { docId: stored.id, rev: stored.rev, boardId: hit.board.id, node: fit.node, ...(fit.truncated ? { truncated: true, depth: fit.depth } : {}) };
  }

  // -------------------------------------------------------------------------
  // Halaman (paritas agent-pages.ts; tanpa event aktivitas — tidak ada viewer)
  // -------------------------------------------------------------------------

  async #pages(rawBody: unknown): Promise<unknown> {
    this.#active();
    this.#parse(z.object({}).strict(), rawBody, 'kirim {} (tanpa argumen)');
    const doc = await this.#doc();
    const i = activePageIndex(this.#session, doc);
    return { docId: doc.id, rev: doc.rev, pages: doc.pages.map(pageSummary), active: pageSummary(doc.pages[i]!, i) };
  }

  async #switchPage(rawBody: unknown): Promise<unknown> {
    const slug = this.#active();
    const body = this.#parse(SwitchBody, rawBody, 'kirim {page} (nama atau id halaman dari list_pages)');
    const doc = await this.#doc();
    const { page, index } = resolvePageRef(doc, body.page.trim(), slug);
    const previousId = doc.pages[activePageIndex(this.#session, doc)]!.id;
    this.#session.activePage = page.id;
    return { docId: doc.id, rev: doc.rev, page: pageSummary(page, index), previous: { id: previousId } };
  }

  async #createPage(rawBody: unknown): Promise<unknown> {
    const slug = this.#active();
    const body = this.#parse(PageCreateBody, rawBody, 'kirim {name?} (1–100 karakter; kosongkan untuk "Page N")');
    const data = await this.#locks.run(slug, async () => {
      const doc = await this.#guardExternal();
      const name = body.name ?? defaultPageName(doc.pages);
      const next = structuredClone(doc);
      const pageId = IdAllocator.forDocument(next).next();
      next.pages.push({ id: pageId, name, children: [] });
      const committed: LakarDocument = { ...next, id: doc.id, rev: doc.rev + 1 };
      const entry: HistoryEntry = {
        rev: committed.rev,
        sessionId: this.#session.id,
        ...this.#author(),
        description: `Added page ${JSON.stringify(name)}`,
        opsSummary: 'pages',
        at: new Date().toISOString(),
      };
      await this.#write(slug, committed, entry);
      this.#cached = committed;
      noteWrite(this.#session, committed.id, doc.rev);
      return { slug, rev: committed.rev, page: { id: pageId, name, index: committed.pages.length - 1, boards: 0 } };
    });
    this.#session.activePage = data.page.id;
    return data;
  }

  async #pageTree(rawBody: unknown): Promise<unknown> {
    const slug = this.#active();
    const body = this.#parse(TreeBody, rawBody, `kirim {page?, depth?} (page = nama/id halaman; depth 0–6, default ${INSPECT_DEPTH_DEFAULT})`);
    const doc = await this.#doc();
    const resolved = resolveDocument(doc);
    const { page, index } =
      body.page !== undefined
        ? resolvePageRef(resolved, body.page.trim(), slug)
        : (() => {
            const i = activePageIndex(this.#session, resolved);
            return { page: resolved.pages[i]!, index: i };
          })();
    const depth = body.depth ?? INSPECT_DEPTH_DEFAULT;
    let truncated = false;
    const children = page.children.map((b) => {
      const r = outlineNode(b, depth);
      truncated ||= r.truncated;
      return r.node;
    });
    return { docId: doc.id, rev: doc.rev, page: pageSummary(page, index), children, ...(truncated ? { truncated: true, depth } : {}) };
  }

  // -------------------------------------------------------------------------
  // Komentar (paritas comments.ts)
  // -------------------------------------------------------------------------

  /** Commit pola `run` route komentar: kunci → gerbang eksternal → clone → mutate → rev+1 + riwayat → memori → noteWrite. */
  async #commit<T>(mutate: Mutate<T>): Promise<{ slug: string; rev: number } & T> {
    const slug = this.slug;
    return this.#locks.run(slug, async () => {
      const doc = await this.#guardExternal();
      const next = structuredClone(doc);
      const { changed, description, extra } = mutate(next);
      if (!changed) return { slug, rev: doc.rev, ...extra };
      const committed: LakarDocument = { ...next, id: doc.id, rev: doc.rev + 1 };
      const entry: HistoryEntry = {
        rev: committed.rev,
        sessionId: this.#session.id,
        ...this.#author(),
        description,
        opsSummary: 'comments',
        at: new Date().toISOString(),
      };
      await this.#write(slug, committed, entry);
      this.#cached = committed;
      noteWrite(this.#session, committed.id, doc.rev);
      return { slug, rev: committed.rev, ...extra };
    });
  }

  async #comments(rawBody: unknown): Promise<unknown> {
    const slug = this.#active();
    const body = this.#parse(CommentListBody, rawBody, 'kirim {status?, pageId?, kind?} (semua opsional)');
    const doc = await this.#doc();
    const open = (doc.comments ?? []).filter((t) => t.status === 'open').length;
    return { docId: doc.id, slug, rev: doc.rev, total: (doc.comments ?? []).length, open, threads: filterThreads(doc, body) };
  }

  async #commentCreate(rawBody: unknown): Promise<unknown> {
    const slug = this.#active();
    const body = this.#parse(CommentCreateBody, rawBody, 'kirim {text, nodeId} (pin di layer) atau {text, x, y, pageId?} (titik bebas)');
    return this.#commit(mutateCreate(slug, body, authorFor(this.#session), (doc) => activePageIndex(this.#session, doc)));
  }

  async #commentReply(rawBody: unknown): Promise<unknown> {
    const slug = this.#active();
    const body = this.#parse(ReplyBody, rawBody, 'kirim {threadId, text}');
    return this.#commit(mutateReply(slug, body, authorFor(this.#session)));
  }

  async #commentResolve(rawBody: unknown): Promise<unknown> {
    const slug = this.#active();
    const body = this.#parse(ResolveBody, rawBody, 'kirim {threadId, resolved?} (default true)');
    return this.#commit(mutateResolve(slug, body.threadId, body.resolved ?? true));
  }

  async #commentDelete(rawBody: unknown): Promise<unknown> {
    const slug = this.#active();
    const body = this.#parse(DeleteBody, rawBody, 'kirim {threadId}');
    return this.#commit(mutateDelete(slug, body.threadId));
  }

  // -------------------------------------------------------------------------
  // Audit desain (paritas analyze.ts; baca-saja pada dokumen tersimpan)
  // -------------------------------------------------------------------------

  async #analyze<B extends { boardId?: string }>(rawBody: unknown, schema: z.ZodType<B>, hint: string, run: (doc: LakarDocument, body: B) => Record<string, unknown>): Promise<unknown> {
    const slug = this.#active();
    const body = this.#parse(schema, rawBody, hint);
    const doc = await this.#doc();
    requireBoard(doc, body.boardId, slug);
    return { docId: doc.id, slug, rev: doc.rev, ...run(doc, body) };
  }

  // -------------------------------------------------------------------------
  // Execute (paritas route /execute; tanpa render check — board tersentuh hanya divalidasi ikon)
  // -------------------------------------------------------------------------

  async #execute(rawBody: unknown): Promise<unknown> {
    const slug = this.#active();
    const session = this.#session;
    const body = this.#parse(ExecuteBody, rawBody, EXECUTE_BODY_HINT);
    if (body.code !== undefined && body.editId !== undefined) {
      throw new LakarError('SCHEMA_INVALID', 'kirim code ATAU editId, bukan keduanya', {
        hint: 'snippet baru → {code, description}; perbaikan snippet gagal → {editId, edits:[{find, replace}]}',
      });
    }
    if (body.code === undefined && body.editId === undefined) {
      throw new LakarError('SCHEMA_INVALID', 'code atau editId wajib', { hint: EXECUTE_BODY_HINT });
    }
    if (body.edits !== undefined && body.editId === undefined) {
      throw new LakarError('SCHEMA_INVALID', 'edits hanya berlaku bersama editId', { hint: 'kirim {editId, edits:[{find, replace}]} dengan editId dari error execute sebelumnya' });
    }

    // 1. Resolusi kode (editId → snippet gagal + edits berurutan).
    let code: string;
    let description: string | undefined;
    if (body.editId !== undefined) {
      const prev = recallFailed(session, body.editId);
      if (!prev) {
        throw notFound(
          `editId ${body.editId} tidak dikenal di sesi ini`,
          'editId hanya berlaku di sesi yang sama dan hilang saat proses berhenti; kirim ulang snippet lengkap: execute({code, description})',
        );
      }
      code = applyEdits(prev.code, body.edits ?? []);
      description = body.description ?? prev.description;
    } else {
      code = body.code!;
      description = body.description;
    }

    // Gagal setelah kode diketahui: simpan snippet, beri editId agar bisa diperbaiki tanpa mengirim ulang.
    const failWith = (err: LakarError, rev: number, extraHint?: string): LakarError => {
      const editId = rememberFailed(session, { code, description });
      logExecute(session, { at: new Date().toISOString(), description: description ?? '', ok: false, code: err.code, rev });
      const repair = `perbaiki tanpa mengirim ulang kode: execute({editId:'${editId}', edits:[{find:'<potongan lama persis>', replace:'<pengganti>'}]})`;
      const hint = [err.hint, extraHint ?? repair].filter(Boolean).join('; ');
      return new LakarError(err.code, err.message, { hint, retryable: err.retryable, editId });
    };

    // 2. Validasi description.
    const docNow = await this.#doc();
    const problem = descriptionProblem(description);
    if (problem) {
      throw failWith(new LakarError('SCHEMA_INVALID', problem, { hint: DESCRIPTION_EXAMPLE }), docNow.rev, 'kirim ulang tanpa kode: execute({editId, description})');
    }
    const label = description!.trim();

    // 3. `photo('<ref>')` butuh layanan foto stok daemon (jaringan + cache) — tidak ada di mode file.
    const refs = photoRefsInCode(code);
    if (refs.length) {
      throw failWith(
        new LakarError('NOT_SUPPORTED', `photo() butuh impor foto stok yang hanya berjalan di lakard (ref: ${refs.join(', ')})`, {
          hint: 'jalankan execute ini lewat lakard (MCP tanpa --file), atau ganti photo() dengan blok warna/assetId lokal',
        }),
        docNow.rev,
      );
    }

    // 4. Transaksi + snippet → commit → simpan → keep (tanpa render check — tidak ada renderer di mode file).
    return this.#locks.run(slug, async () => {
      const doc = await this.#guardExternal();
      const activePageId = doc.pages[activePageIndex(session, doc)]!.id;
      let committed;
      try {
        committed = await transact(doc, { sessionId: session.id, description: label }, async (tx) => {
          const run = await runSnippet(code, tx, {
            timeoutMs: this.#execTimeoutMs,
            memoryBytes: this.#execMemoryBytes,
            keep: session.keep,
            icons: this.#iconCatalog(),
            cssVariables: CSS_VARIABLES,
            dtcg: DTCG,
            activePageId,
          });
          if (!run.ok) throw run.error;
          return run;
        });
      } catch (e) {
        if (e instanceof LakarError) throw failWith(e, doc.rev);
        throw e;
      }
      const run = committed.value;
      // Tanpa op sukses (snippet baca-saja): tidak ada revisi baru, file dan riwayat tidak disentuh.
      if (committed.entry === null) {
        if (body.dryRun === true) {
          return {
            docId: doc.id,
            slug,
            rev: doc.rev,
            dryRun: true,
            changes: EMPTY_CHANGES,
            created: committed.created,
            target: targetOf(slug, doc),
            ...(run.value !== undefined ? { value: run.value } : {}),
            ...(run.valueTruncated ? { valueTruncated: true } : {}),
            ...(run.logs.length ? { logs: run.logs.join('\n') } : {}),
          };
        }
        session.keep = run.keep;
        return {
          docId: doc.id,
          rev: doc.rev,
          created: committed.created,
          target: targetOf(slug, doc),
          ...(run.value !== undefined ? { value: run.value } : {}),
          ...(run.valueTruncated ? { valueTruncated: true } : {}),
          ...(run.logs.length ? { logs: run.logs.join('\n') } : {}),
        };
      }
      // Gerbang pra-commit tanpa render: ikon di board tersentuh harus dikenal katalog (sama dengan daemon).
      const before = resolveDocument(doc);
      const after = resolveDocument(committed.doc);
      const touched = touchedBoards(before, after);
      try {
        for (const id of touched) for (const r of iconRefs(findBoard(after, id)!)) this.#iconCatalog().canonical(r.lib, r.icon);
      } catch (e) {
        if (e instanceof LakarError) {
          throw failWith(new LakarError(e.code, e.message, { hint: [e.hint, NOT_COMMITTED].filter(Boolean).join('; '), retryable: e.retryable }), doc.rev);
        }
        throw e;
      }
      if (body.dryRun === true) {
        return {
          docId: doc.id,
          slug,
          rev: doc.rev,
          dryRun: true,
          changes: nodeChanges(doc, committed.doc),
          created: committed.created,
          target: targetOf(slug, doc),
          ...(run.value !== undefined ? { value: run.value } : {}),
          ...(run.valueTruncated ? { valueTruncated: true } : {}),
          ...(run.logs.length ? { logs: run.logs.join('\n') } : {}),
        };
      }
      await this.#write(slug, committed.doc, { ...committed.entry, ...this.#author() });
      this.#cached = committed.doc;
      // Hook tulis agen tunggal: langkah undo + dasar visual_diff (sama dengan route daemon).
      this.#steps.onAgentWrite(session, committed.doc.id, doc.rev, committed.doc.rev, committed.inverse, label);
      session.keep = run.keep;
      logExecute(session, { at: new Date().toISOString(), description: label, ok: true, rev: committed.doc.rev });
      return {
        docId: committed.doc.id,
        rev: committed.doc.rev,
        created: committed.created,
        target: targetOf(slug, committed.doc),
        ...(run.value !== undefined ? { value: run.value } : {}),
        ...(run.valueTruncated ? { valueTruncated: true } : {}),
        ...(run.logs.length ? { logs: run.logs.join('\n') } : {}),
      };
    });
  }

  // -------------------------------------------------------------------------
  // Ikon + skill + ekspor kode
  // -------------------------------------------------------------------------

  async #iconSearch(rawBody: unknown): Promise<unknown> {
    const body = this.#parse(IconSearchBody, rawBody, ICON_SEARCH_HINT);
    const results = this.#iconCatalog().search(body.query, { ...(body.lib ? { lib: body.lib } : {}), ...(body.limit !== undefined ? { limit: body.limit } : {}) });
    return { query: body.query, results };
  }

  async #skillRead(rawBody: unknown): Promise<unknown> {
    const body = this.#parse(SkillBody, rawBody ?? undefined, `kirim {name?}; name salah satu: ${SKILL_NAMES.join(', ')}`);
    const skills = listSkills(this.#skillsDir);
    if (body?.name === undefined) return { skills };
    const content = await readSkill(body.name, this.#skillsDir);
    if (content === undefined) {
      const available = skills.filter((x) => x.available).map((x) => x.name);
      const retired = Object.hasOwn(RETIRED_SKILLS, body.name) ? `: ${RETIRED_SKILLS[body.name as keyof typeof RETIRED_SKILLS]}` : '';
      throw notFound(
        `skill ${JSON.stringify(body.name)} tidak ada${retired}`,
        `skill dikenal: ${SKILL_NAMES.join(', ')}; tersedia: ${available.length ? available.join(', ') : '-'}`,
      );
    }
    return { name: body.name, content };
  }

  /** export_code (codegen murni — tanpa render; paritas route `/viewer/export-code`). */
  async #exportCode(rawBody: unknown): Promise<unknown> {
    const slug = this.#active();
    const body = this.#parse(ExportCodeBody, rawBody ?? {}, EXPORT_CODE_HINT);
    const stored = await this.#doc();
    const target = body.target ?? 'react-tailwind';
    if (target === 'dtcg') {
      const contents = dtcgTokensJson(stored);
      const files = [{ path: 'tokens.json', contents, bytes: Buffer.byteLength(contents, 'utf8') }];
      return { docId: stored.id, slug, rev: stored.rev, id: null, name: null, target, files, warnings: [] };
    }
    const id = body.id ?? stored.pages[0]?.children[0]?.id;
    if (!id) throw notFound(`dokumen ${slug} belum punya board`, 'buat board dulu lewat execute');
    const hit = id.includes('/') ? undefined : locateNode(stored, id);
    if (!id.includes('/') && !hit) throw notFound(`node ${id} tidak ada di dokumen ${slug}`, 'pakai ID dari created[] execute atau list_boards');
    const opts: CodeExportOptions = {
      nodeId: id,
      target,
      ...(body.components !== undefined ? { components: body.components } : {}),
      ...(body.tokens !== undefined ? { tokens: body.tokens } : {}),
      ...(body.typescript !== undefined ? { typescript: body.typescript } : {}),
    };
    const result = generateCode(stored, { ...opts, icons: exportGlyphs(stored, opts, this.#iconCatalog()) });
    const files = result.files.map((f) => ({ path: f.path, contents: f.contents, bytes: Buffer.byteLength(f.contents, 'utf8') }));
    return { docId: stored.id, slug, rev: stored.rev, id, name: hit?.node.name ?? id, target, files, warnings: result.warnings };
  }

  /** export_svg (vectorToSvg murni — tanpa render; paritas route `/viewer/export-svg`). */
  async #exportSvg(rawBody: unknown): Promise<unknown> {
    const slug = this.#active();
    const body = this.#parse(ExportSvgBody, rawBody ?? {}, EXPORT_SVG_HINT);
    return exportSvgNode(await this.#doc(), slug, body.id);
  }

  // -------------------------------------------------------------------------
  // Undo/redo agen (paritas agent-undo.ts; satu commit per langkah)
  // -------------------------------------------------------------------------

  async #undoRedo(dir: 'undo' | 'redo', rawBody: unknown): Promise<unknown> {
    const session = this.#session;
    const parsed = StepsBody.safeParse(rawBody ?? undefined);
    if (!parsed.success) {
      throw new LakarError('SCHEMA_INVALID', parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: STEPS_HINT });
    }
    const n = parsed.data?.steps ?? 1;
    const slug = this.#active();
    const other = dir === 'undo' ? 'redo' : 'undo';
    const Verb = dir === 'undo' ? 'Undo' : 'Redo';
    return this.#locks.run(slug, async () => {
      const current = await this.#guardExternal();
      const ds = this.#steps.of(session, current.id);
      const stack = ds?.[dir] ?? [];
      if (!ds || stack.length === 0) {
        throw new LakarError('NOT_FOUND', `tidak ada langkah sesi ini untuk di-${dir} di dokumen ${slug}`, {
          hint:
            dir === 'undo'
              ? `undo hanya mencakup execute/paste sesi ini pada dokumen aktif sejak proses berjalan (bukan langkah pengguna atau agen lain); ${FIX_FORWARD}`
              : 'redo hanya mengulang langkah yang baru di-undo sesi ini; execute/paste baru mengosongkan redo',
        });
      }
      if (current.rev !== ds.head) {
        const { who, entry } = await laterAuthor(this.#store, slug, ds.head);
        const what = entry ? ` (rev ${entry.rev}, "${entry.description}")` : '';
        this.#steps.drop(session, current.id);
        throw new LakarError('CONFLICT', `${dir} ditolak: ${who} mengedit dokumen ${slug} sesudah langkah terakhir sesi ini${what}; dokumen kini rev ${current.rev}`, {
          hint: `agen tidak pernah membatalkan edit pengguna atau sesi lain; ${FIX_FORWARD}`,
        });
      }
      if (n > stack.length) {
        throw new LakarError('NOT_FOUND', `hanya ${stack.length} langkah yang bisa di-${dir}, diminta ${n}`, { hint: `${dir} {steps:${stack.length}} atau kurang` });
      }
      const done: { description: string; rev: number }[] = [];
      const boards = new Set<string>();
      let doc = current;
      try {
        for (let i = 0; i < n; i++) {
          const step = stack[stack.length - 1]!;
          const committed = await transact(doc, { sessionId: session.id, description: `${Verb}: ${step.description}` }, (tx) => applyOps(tx, step.ops));
          if (committed.entry === null) throw new Error(`${dir}: op langkah tidak berefek`);
          const before = resolveDocument(doc);
          const after = resolveDocument(committed.doc);
          const touched = touchedBoards(before, after);
          for (const id of touched) for (const r of iconRefs(findBoard(after, id)!)) this.#iconCatalog().canonical(r.lib, r.icon);
          await this.#write(slug, committed.doc, { ...committed.entry, ...this.#author() });
          this.#cached = committed.doc;
          stack.pop();
          ds[other].push({ ops: committed.inverse, description: step.description });
          ds.head = committed.doc.rev;
          for (const b of touched) boards.add(b);
          done.push({ description: step.description, rev: committed.doc.rev });
          doc = committed.doc;
        }
      } finally {
        if (doc.rev !== current.rev) this.#steps.onAgentWrite(session, current.id, current.rev, doc.rev, [], Verb, dir);
      }
      return {
        docId: doc.id,
        slug,
        rev: doc.rev,
        [dir === 'undo' ? 'undone' : 'redone']: done,
        boards: [...boards],
        available: { undo: ds.undo.length, redo: ds.redo.length },
        target: targetOf(slug, doc),
      };
    });
  }

  #parse<T>(schema: z.ZodType<T>, body: unknown, hint: string): T {
    const r = schema.safeParse(body);
    if (!r.success) {
      throw new LakarError('SCHEMA_INVALID', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint });
    }
    return r.data;
  }
}
