// Transport dokumen ops untuk MCP `lakar --server` (spec-collab-cloud story 4): "FileTransport yang hidup".
// Route tool yang sama dengan mode file dipetakan ke dokumen replika yang dipelihara klien sync; bedanya
// SEMUA tulis diekspresikan sebagai `DocOp[]` lalu diserahkan ke `backend.commit(build)` — `build` adalah
// thunk yang membangun payload ops pada replika TERKINI (termasuk kirim ulang pasca-rejected+resync),
// bukan replay payload basi. Backend (SyncClient) mengirim ops ke room sync server dan menerapkannya ke
// replika setelah `ack`.
// Komentar dan halaman bukan node: mutasinya dijalankan pada salinan replika, hasilnya dikirim sebagai op
// level-dokumen `setComments`/`insertPage` (op baru di schema ops.ts — payload utuh, replay deterministik).
// Tool yang butuh render/jaringan/viewer → NOT_SUPPORTED sama seperti mode file.
import { randomUUID } from 'node:crypto';
import { touchedBoards } from '@lakar/check';
import { DocumentLocks, IdAllocator, applyOps, recordOps, transact } from '@lakar/core';
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
  seededRandom,
  type ApiResult,
  type CreatedEntry,
  type DocOp,
  type IconGlyph,
  type LakarDocument,
} from '@lakar/schema';
import { RETIRED_SKILLS, SKILL_NAMES, SKILLS_DIR, listSkills, readSkill } from '@lakar/skills';
import { z } from 'zod';
import { CLUSTERS_HINT, ClustersBody, SCOPE_HINT, ScopeBody, analyzeClusters, analyzeColors, analyzeTypography, requireBoard } from './analyze.js';
import { CreateBody as PageCreateBody, SwitchBody, TreeBody, outlineNode, pageSummary, resolvePageRef } from './agent-pages.js';
import { AgentSteps, BODY_HINT as STEPS_HINT, FIX_FORWARD, StepsBody } from './agent-undo.js';
import { EXPORT_CODE_HINT, ExportCodeBody, exportGlyphs, type CodeExportOptions } from './code-export.js';
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
import { activePageIndex, logExecute, noteWrite, recallFailed, rememberFailed, setActiveDoc, type Session } from './sessions.js';

/** Parser impor CSS variables / DTCG untuk `importCssVariables`/`importDtcgTokens` di execute (sama dengan daemon). */
const CSS_VARIABLES = { parse: parseCssVariables };
const DTCG = { parse: parseDtcgTokens };

/** Target respons tulis: sama dengan `targetOf` di server.ts (slug = nama). */
const targetOf = (slug: string, doc: LakarDocument) => ({ slug, name: slug, boardIds: doc.pages.flatMap((p) => p.children.map((b) => b.id)) });

/** Hint seragam untuk fitur yang hanya ada di lakard (render, jaringan, seleksi viewer). */
const NEED_DAEMON_HINT = 'tool ini butuh lakard (render/jaringan/viewer); jalankan `lakard` lalu pakai MCP tanpa --server';

const notSupported = (what: string) => new LakarError('NOT_SUPPORTED', `${what} tidak bisa jalan di mode server (lakar --server)`, { hint: NEED_DAEMON_HINT });

/** Hasil satu commit ops yang diterapkan backend (replika sesudah ack). */
export type DocCommitOutcome = {
  /** Dokumen tersimpan sesudah commit (rev baru). */
  doc: LakarDocument;
  /** Op invers commit (ID final — dipakai undo agen). */
  inverse: DocOp[];
  /** Entri `created` commit (ID final dari commit ber-seed). */
  created: CreatedEntry[];
  /** Ref lokal op → ID final (`refs` hasil applyOps). */
  refs: Record<string, string>;
};

/** Payload satu commit ops: op mentah + deskripsi riwayat. */
export type CommitPayload = { ops: DocOp[]; description: string };

/**
 * Pembangun payload commit: dipanggil backend pada replika TERKINI setiap kali ops akan dikirim —
 * termasuk kirim ulang pasca-`rejected`+resync — sehingga op turunan-konten (`setComments`, hasil
 * execute, `insertPage` ber-ID mint) selalu dibangun dari dokumen segar dan tidak menimpa edit peer
 * yang mendarat selama resync. Mengembalikan `null` = tidak ada yang perlu ditulis pada dokumen ini
 * (commit selesai tanpa rev baru, outcome = replika apa adanya). Boleh async (mis. preview execute).
 */
export type CommitBuild = (doc: LakarDocument) => CommitPayload | null | Promise<CommitPayload | null>;

/**
 * Backend untuk `DocTransport`: sumber dokumen tersimpan + cara men-commit ops. Diisi `SyncClient`
 * (replika + kirim `{type:'ops'}` ke room sync server); sengaja minimal supaya backend lain bisa
 * memakai mesin route yang sama kelak.
 */
export type DocTransportBackend = {
  /** Dokumen tersimpan terkini (replika). Boleh melempar bila belum siap — diteruskan ke pemanggil. */
  doc(): LakarDocument;
  /** Slug yang dilaporkan di respons (identitas dokumen, mis. `doc.id`). */
  slug(): string;
  /** Commit satu batch `DocOp` sebagai satu revisi; payload dibangun `build` per basis kirim. */
  commit(build: CommitBuild): Promise<DocCommitOutcome>;
};

export type DocTransportOptions = {
  /** Nama klien untuk entri riwayat dan penulis komentar (default `lakar-mcp`). */
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
 * Mesin route transport ops: `call(path, body)` dengan bentuk `ApiResult` yang sama dengan `DaemonClient`.
 * Paritas `FileTransport` untuk semua route non-render; persistensi sepenuhnya lewat `DocTransportBackend`.
 */
export class DocTransport {
  readonly #backend: DocTransportBackend;
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

  constructor(backend: DocTransportBackend, options: DocTransportOptions = {}) {
    this.#backend = backend;
    this.#skillsDir = options.skillsDir ?? SKILLS_DIR;
    this.#execTimeoutMs = options.execTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#execMemoryBytes = options.execMemoryBytes ?? DEFAULT_MEMORY_BYTES;
    this.#iconsOpt = options.icons;
    this.#session = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      executes: 0,
      keep: {},
      failed: new Map(),
      log: [],
      client: options.client ?? 'lakar-mcp',
    };
  }

  /** Sambungkan nama harness agen (sudah disanitasi pemanggil) — dipakai penulis komentar + field `agent` riwayat. */
  setAgent(provider: () => string | undefined): void {
    this.#agentFn = provider;
  }

  get slug(): string {
    return this.#backend.slug();
  }

  /** Dokumen tersimpan terkini dari backend (replika). */
  #doc(): LakarDocument {
    return this.#backend.doc();
  }

  /** Mode server: tepat satu dokumen (room) — otomatis aktif pada pemakaian pertama (open_doc otomatis). */
  #active(): string {
    if (this.#session.activeSlug !== this.slug) setActiveDoc(this.#session, this.slug);
    return this.slug;
  }

  /** Katalog ikon malas (pemakaian pertama). */
  #iconCatalog(): IconCatalogPort<string, IconGlyph> {
    return (this.#icons ??= this.#iconsOpt ?? IconCatalog.load());
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
        error: { code: 'EXEC_ERROR', message: `kesalahan internal transport server: ${errorMessage(e)}`, hint: 'coba lagi; periksa log lakar', retryable: true },
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

  /** open_doc: menandai room sebagai dokumen aktif sesi (slug lain → NOT_FOUND). */
  async #openDoc(rawBody: unknown): Promise<unknown> {
    const body = this.#parse(OpenBody, rawBody, OPEN_HINT);
    const slug = this.slug;
    // Paritas daemon/FileTransport: slug tidak valid → SCHEMA_INVALID (bukan NOT_FOUND dokumen lain).
    if (body.slug !== undefined && !SLUG_PATTERN.test(body.slug)) {
      throw new LakarError('SCHEMA_INVALID', `slug tidak valid: ${JSON.stringify(body.slug)}`, {
        hint: `slug harus cocok pola ${SLUG_PATTERN.source} (huruf kecil, angka, tanda hubung; maks 64)`,
      });
    }
    if (body.slug !== undefined && body.slug !== slug) {
      throw notFound(
        `dokumen ${body.slug} tidak ada di mode server`,
        `mode server terkunci ke room ini (slug ${JSON.stringify(slug)}) — jalankan MCP tanpa --server lewat lakard untuk dokumen lain`,
      );
    }
    const s = this.#active();
    const doc = this.#doc();
    return {
      docId: doc.id,
      slug: s,
      rev: doc.rev,
      created: false,
      source: body.slug !== undefined ? 'slug' : 'server',
      target: targetOf(s, doc),
      viewerOpen: false,
      hint: "mode server: slice langsung terlihat di semua peer room. Tanpa renderer, board height:'hug' tidak terukur (height 0) dan place(w,'hug')/place({near}) bisa menumpuk board — atur x/y eksplisit",
    };
  }

  /** list_documents: daftar satu entri — room ini. */
  async #documents(rawBody: unknown): Promise<unknown> {
    this.#parse(ListDocumentsBody, rawBody ?? undefined, 'kirim {} (tanpa argumen)');
    const slug = this.#active();
    const doc = this.#doc();
    const documents = [{ slug, name: slug, rev: doc.rev, updatedAt: new Date().toISOString(), open: false, focused: false, active: true as const }];
    return { documents, focused: null, active: slug };
  }

  /** list_boards: seperti daemon tetapi tanpa render — board `height:'hug'` belum terukur → height 0. */
  async #boards(rawBody: unknown): Promise<unknown> {
    const slug = this.#active();
    this.#parse(BoardsBody, rawBody ?? undefined, 'kirim {} (tanpa argumen)');
    const stored = this.#doc();
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
        // Board hug: tinggi terukur butuh render — di mode server selalu belum terukur (0 + heightMode).
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
    const stored = this.#doc();
    const hit = locateNode(stored, body.id);
    // Paritas daemon: node ada tapi board pemiliknya gagal resolve → NOT_FOUND yang sama.
    if (!hit || !findBoard(resolveDocument(stored), hit.board.id)) {
      throw notFound(`node ${body.id} tidak ada di dokumen ${slug}`, 'pakai ID dari created[] execute atau list_boards');
    }
    // Bounds butuh render — mode server mengirim pohon apa adanya (tanpa `bounds`).
    const fit = inspectFit(hit.node, new Map(), body.depth ?? INSPECT_DEPTH_DEFAULT);
    return { docId: stored.id, rev: stored.rev, boardId: hit.board.id, node: fit.node, ...(fit.truncated ? { truncated: true, depth: fit.depth } : {}) };
  }

  // -------------------------------------------------------------------------
  // Halaman (paritas agent-pages.ts; tulis lewat op level-dokumen insertPage)
  // -------------------------------------------------------------------------

  async #pages(rawBody: unknown): Promise<unknown> {
    this.#active();
    this.#parse(z.object({}).strict(), rawBody, 'kirim {} (tanpa argumen)');
    const doc = this.#doc();
    const i = activePageIndex(this.#session, doc);
    return { docId: doc.id, rev: doc.rev, pages: doc.pages.map(pageSummary), active: pageSummary(doc.pages[i]!, i) };
  }

  async #switchPage(rawBody: unknown): Promise<unknown> {
    const slug = this.#active();
    const body = this.#parse(SwitchBody, rawBody, 'kirim {page} (nama atau id halaman dari list_pages)');
    const doc = this.#doc();
    const { page, index } = resolvePageRef(doc, body.page.trim(), slug);
    const previousId = doc.pages[activePageIndex(this.#session, doc)]!.id;
    this.#session.activePage = page.id;
    return { docId: doc.id, rev: doc.rev, page: pageSummary(page, index), previous: { id: previousId } };
  }

  async #createPage(rawBody: unknown): Promise<unknown> {
    const slug = this.#active();
    const body = this.#parse(PageCreateBody, rawBody, 'kirim {name?} (1–100 karakter; kosongkan untuk "Page N")');
    const data = await this.#locks.run(slug, async () => {
      const doc = this.#doc();
      const name = body.name ?? defaultPageName(doc.pages);
      // ID halaman + index di-mint klien pada replika terkini dan dibawa utuh di payload insertPage —
      // replay deterministik tanpa seed. Retry pasca-resync me-mint ulang supaya ID tidak menabrak
      // halaman yang dibuat peer selama jeda.
      let pageId = '';
      let index = doc.pages.length;
      const outcome = await this.#backend.commit((base) => {
        pageId = IdAllocator.forDocument(base).next();
        index = base.pages.length;
        return { ops: [{ op: 'insertPage', page: { id: pageId, name, children: [] }, index }], description: `Added page ${JSON.stringify(name)}` };
      });
      noteWrite(this.#session, outcome.doc.id, doc.rev);
      return { slug, rev: outcome.doc.rev, page: { id: pageId, name, index, boards: 0 } };
    });
    this.#session.activePage = data.page.id;
    return data;
  }

  async #pageTree(rawBody: unknown): Promise<unknown> {
    const slug = this.#active();
    const body = this.#parse(TreeBody, rawBody, `kirim {page?, depth?} (page = nama/id halaman; depth 0–6, default ${INSPECT_DEPTH_DEFAULT})`);
    const doc = this.#doc();
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
  // Komentar (paritas comments.ts; mutasi pada salinan → op setComments)
  // -------------------------------------------------------------------------

  /**
   * Commit pola `run` route komentar: kunci → thunk mutate → op `setComments` utuh → `backend.commit`
   * → noteWrite. Mutator dijalankan ulang oleh backend pada replika TERKINI setiap kali ops dikirim
   * (setComments adalah replace array penuh — payload basi akan menimpa komentar peer yang mendarat
   * selama resync). `extra` respons diambil dari build terakhir (yang benar-benar terkirim).
   * `changed:false` → thunk null → commit selesai tanpa rev baru.
   */
  async #commit<T>(mutate: Mutate<T>): Promise<{ slug: string; rev: number } & T> {
    const slug = this.slug;
    return this.#locks.run(slug, async () => {
      const doc = this.#doc();
      let latest: { changed: boolean; description: string; extra: T } | undefined;
      const outcome = await this.#backend.commit((base) => {
        const next = structuredClone(base);
        const m = mutate(next);
        latest = m;
        if (!m.changed) return null;
        return { ops: [{ op: 'setComments', comments: (next.comments ?? null) as Record<string, unknown>[] | null }], description: m.description };
      });
      const m = latest!;
      if (!m.changed) return { slug, rev: outcome.doc.rev, ...m.extra };
      noteWrite(this.#session, outcome.doc.id, doc.rev);
      return { slug, rev: outcome.doc.rev, ...m.extra };
    });
  }

  async #comments(rawBody: unknown): Promise<unknown> {
    const slug = this.#active();
    const body = this.#parse(CommentListBody, rawBody, 'kirim {status?, pageId?, kind?} (semua opsional)');
    const doc = this.#doc();
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
    const doc = this.#doc();
    requireBoard(doc, body.boardId, slug);
    return { docId: doc.id, slug, rev: doc.rev, ...run(doc, body) };
  }

  // -------------------------------------------------------------------------
  // Execute (paritas route /execute; snippet → DocOp[] via recordOps → backend.commit)
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
    const docNow = this.#doc();
    const problem = descriptionProblem(description);
    if (problem) {
      throw failWith(new LakarError('SCHEMA_INVALID', problem, { hint: DESCRIPTION_EXAMPLE }), docNow.rev, 'kirim ulang tanpa kode: execute({editId, description})');
    }
    const label = description!.trim();

    // 3. `photo('<ref>')` butuh layanan foto stok daemon (jaringan + cache) — tidak ada di mode server.
    const refs = photoRefsInCode(code);
    if (refs.length) {
      throw failWith(
        new LakarError('NOT_SUPPORTED', `photo() butuh impor foto stok yang hanya berjalan di lakard (ref: ${refs.join(', ')})`, {
          hint: 'jalankan execute ini lewat lakard (MCP tanpa --server), atau ganti photo() dengan blok warna/assetId lokal',
        }),
        docNow.rev,
      );
    }

    // 4. Snippet → ops pada replika (recordOps), lalu commit ops ke backend (server yang menerapkannya).
    return this.#locks.run(slug, async () => {
      const doc = this.#doc();
      // Pembangun preview+ops pada satu objek replika. Preview lokal memakai IdAllocator default:
      // doc hasilnya HANYA untuk validasi/dryRun — ID final datang dari commit ber-seed di backend.
      const buildOne = async (fresh: LakarDocument) => {
        const activePageId = fresh.pages[activePageIndex(session, fresh)]!.id;
        const preview = await transact(fresh, { sessionId: session.id, description: label }, async (tx) => {
          const { tx: rtx, ops } = recordOps(tx);
          const run = await runSnippet(code, rtx, {
            timeoutMs: this.#execTimeoutMs,
            memoryBytes: this.#execMemoryBytes,
            keep: session.keep,
            icons: this.#iconCatalog(),
            cssVariables: CSS_VARIABLES,
            dtcg: DTCG,
            activePageId,
          });
          if (!run.ok) throw run.error;
          return { run, ops };
        });
        const { run, ops } = preview.value;
        // Gerbang pra-commit tanpa render: ikon di board tersentuh harus dikenal katalog (sama dengan daemon).
        if (ops.length) {
          const before = resolveDocument(fresh);
          const after = resolveDocument(preview.doc);
          try {
            for (const id of touchedBoards(before, after)) for (const r of iconRefs(findBoard(after, id)!)) this.#iconCatalog().canonical(r.lib, r.icon);
          } catch (e) {
            if (e instanceof LakarError) {
              throw new LakarError(e.code, e.message, { hint: [e.hint, NOT_COMMITTED].filter(Boolean).join('; '), retryable: e.retryable });
            }
            throw e;
          }
        }
        return { run, ops, preview };
      };
      // Cache per objek replika (WeakMap: replika diganti utuh saat apply/welcome). Broadcast yang
      // mendarat selama preview/commit memindahkan replika ke objek baru → build ulang di sana
      // (re-run snippet + gerbang ikon), TIDAK me-replay ops basi di atas base baru.
      const cache = new WeakMap<LakarDocument, ReturnType<typeof buildOne>>();
      const build = (fresh: LakarDocument) => {
        let p = cache.get(fresh);
        if (!p) {
          p = buildOne(fresh);
          cache.set(fresh, p);
        }
        return p;
      };
      let first;
      try {
        first = await build(doc);
      } catch (e) {
        if (e instanceof LakarError) throw failWith(e, doc.rev);
        throw e;
      }
      const { run, ops, preview } = first;
      // Tanpa op (snippet baca-saja): tidak ada revisi baru — identik `committed.entry === null` di mode file.
      if (ops.length === 0) {
        if (body.dryRun === true) {
          return {
            docId: doc.id,
            slug,
            rev: doc.rev,
            dryRun: true,
            changes: EMPTY_CHANGES,
            created: preview.created,
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
          created: preview.created,
          target: targetOf(slug, doc),
          ...(run.value !== undefined ? { value: run.value } : {}),
          ...(run.valueTruncated ? { valueTruncated: true } : {}),
          ...(run.logs.length ? { logs: run.logs.join('\n') } : {}),
        };
      }
      if (body.dryRun === true) {
        // Perubahan dihitung pada preview (ID lokal — dryRun spekulatif, tidak di-commit ke mana pun).
        return {
          docId: doc.id,
          slug,
          rev: doc.rev,
          dryRun: true,
          changes: nodeChanges(doc, preview.doc),
          created: preview.created,
          target: targetOf(slug, preview.doc),
          ...(run.value !== undefined ? { value: run.value } : {}),
          ...(run.valueTruncated ? { valueTruncated: true } : {}),
          ...(run.logs.length ? { logs: run.logs.join('\n') } : {}),
        };
      }
      // Build terakhir yang benar-benar dikirim backend (bisa rebuild pada replika lebih segar saat retry).
      let sent = first;
      let outcome;
      try {
        outcome = await this.#backend.commit(async (fresh) => {
          const b = await build(fresh);
          sent = b;
          return b.ops.length ? { ops: b.ops, description: label } : null;
        });
      } catch (e) {
        if (e instanceof LakarError) throw failWith(e, doc.rev);
        throw e;
      }
      const sentRun = sent.run;
      // Hook tulis agen tunggal: langkah undo (invers ber-ID final) + dasar visual_diff (sama dengan route daemon).
      this.#steps.onAgentWrite(session, outcome.doc.id, doc.rev, outcome.doc.rev, outcome.inverse, label);
      session.keep = sentRun.keep;
      logExecute(session, { at: new Date().toISOString(), description: label, ok: true, rev: outcome.doc.rev });
      return {
        docId: outcome.doc.id,
        rev: outcome.doc.rev,
        created: outcome.created,
        target: targetOf(slug, outcome.doc),
        ...(sentRun.value !== undefined ? { value: sentRun.value } : {}),
        ...(sentRun.valueTruncated ? { valueTruncated: true } : {}),
        ...(sentRun.logs.length ? { logs: sentRun.logs.join('\n') } : {}),
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
    const stored = this.#doc();
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

  // -------------------------------------------------------------------------
  // Undo/redo agen (paritas agent-undo.ts; setiap langkah = satu commit ops)
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
      const current = this.#doc();
      const ds = this.#steps.of(session, current.id);
      const stack = ds?.[dir] ?? [];
      if (!ds || stack.length === 0) {
        throw new LakarError('NOT_FOUND', `tidak ada langkah sesi ini untuk di-${dir} di dokumen ${slug}`, {
          hint:
            dir === 'undo'
              ? `undo hanya mencakup execute/paste sesi ini pada dokumen aktif sejak proses berjalan (bukan langkah peer atau agen lain); ${FIX_FORWARD}`
              : 'redo hanya mengulang langkah yang baru di-undo sesi ini; execute/paste baru mengosongkan redo',
        });
      }
      if (current.rev !== ds.head) {
        // Tanpa akses riwayat room di sini: siapa penulis rev berikutnya tidak bisa disebutkan.
        this.#steps.drop(session, current.id);
        throw new LakarError('CONFLICT', `${dir} ditolak: peer lain mengedit dokumen ${slug} sesudah langkah terakhir sesi ini; dokumen kini rev ${current.rev}`, {
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
          const outcome = await this.#backend.commit(async (base) => {
            // Paritas daemon (agent-undo.ts): preview-apply op langkah pada replika, lalu ikon di
            // board tersentuh diverifikasi katalog SEBELUM ops dikirim. Dicek ulang saat rebuild
            // pasca-resync (basis baru bisa membuat apply/cek ikon berbeda hasilnya).
            const preview = await transact(base, { sessionId: session.id, description: `${Verb}: ${step.description}` }, (tx) => applyOps(tx, step.ops));
            const before = resolveDocument(base);
            const after = resolveDocument(preview.doc);
            for (const id of touchedBoards(before, after)) for (const r of iconRefs(findBoard(after, id)!)) this.#iconCatalog().canonical(r.lib, r.icon);
            return { ops: step.ops, description: `${Verb}: ${step.description}` };
          });
          // Board tersentuh untuk respons (paritas): hitung dari dokumen sebelum/sesudah commit.
          const before = resolveDocument(doc);
          const after = resolveDocument(outcome.doc);
          for (const b of touchedBoards(before, after)) boards.add(b);
          stack.pop();
          ds[other].push({ ops: outcome.inverse, description: step.description });
          ds.head = outcome.doc.rev;
          done.push({ description: step.description, rev: outcome.doc.rev });
          doc = outcome.doc;
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

/**
 * Terapkan satu batch ops pada `doc` dengan kontrak deterministik protokol sync (seed + stempel commit):
 * dipakai `SyncClient` untuk menerapkan ops broadcast DAN ops sendiri (seed/`at` dari `ack`/`ops`).
 */
export async function applySeeded(doc: LakarDocument, ops: DocOp[], seed: string, at: string, sessionId: string, description: string): Promise<DocCommitOutcome> {
  const committed = await transact(
    doc,
    { sessionId, description, random: seededRandom(seed), now: () => new Date(at) },
    (tx) => applyOps(tx, ops),
  );
  return { doc: committed.doc, inverse: committed.inverse, created: committed.created, refs: committed.value.refs };
}
