// Stream aktivitas viewer (Viewer B slice 2): satu event per tool call (mulai dan selesai) dan per sesi baru,
// disalurkan lewat SSE `GET /viewer/events`. Event dibentuk dari hook fastify (`preHandler`/`onSend`) di luar
// handler, jadi route lama, body respons, dan pesan error tidak berubah. Event hanya membawa id sesi publik
// (8 karakter pertama, seperti `/status`): id penuh adalah kredensial header `x-lakar-session`.
// Sinkron antar jendela: tulis dari aplikasi (kelola file, folder, execute sesi viewer) dipancarkan sebagai event
// `change` (jenis baru, di luar ring `hello`) dengan `origin` jendela pengirim (header `x-lakar-origin`), supaya
// jendela/tab viewer lain ikut memuat ulang dan jendela pengirim bisa mengabaikan gemanya sendiri.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ServerResponse } from 'node:http';
import { SESSION_HEADER } from '@lakar/schema';
import type { BoundsTuple } from './inspect.js';
import type { Session, Sessions } from './sessions.js';

/** Jumlah event terakhir yang diingat untuk snapshot `hello`. */
export const ACTIVITY_RING_MAX = 100;
/** Interval heartbeat SSE (`: ping`). */
export const ACTIVITY_HEARTBEAT_MS = 15_000;
/** Klien viewer sendiri: tidak dipancarkan (Activity hanya menampilkan agen, dan buffer tidak dibanjiri). */
export const VIEWER_CLIENT = 'lakar-viewer';
/** Header id jendela viewer pengirim (acak per jendela); diteruskan apa adanya di event `change`. */
export const ORIGIN_HEADER = 'x-lakar-origin';
const ORIGIN_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Id jendela dari header `x-lakar-origin`; tidak ada/tidak valid → undefined. */
export function originOf(headers: Record<string, string | string[] | undefined>): string | undefined {
  const v = headers[ORIGIN_HEADER];
  return typeof v === 'string' && ORIGIN_PATTERN.test(v) ? v : undefined;
}

/**
 * Header harness agen pada `POST /sessions` (spec-canvas-agent-effects): `clientInfo.name` MCP (mis. `claude-code`,
 * `codex-mcp-client`). Header, bukan field body: daemon lama mengabaikan header tak dikenal, sedangkan `SessionBody`
 * `.strict()` menolak field baru.
 */
export const AGENT_HEADER = 'x-lakar-agent';
const AGENT_PATTERN = /^[!-~](?:[ -~]{0,62}[!-~])?$/;

/** Nama harness yang sah (ASCII tampak, ≤ 64, tanpa spasi di ujung); juga dipakai saat membaca riwayat dari disk. */
export const isAgentName = (v: unknown): v is string => typeof v === 'string' && AGENT_PATTERN.test(v);

/** Nama harness dari header `x-lakar-agent` (ASCII tampak, ≤ 64); tidak ada/tidak valid → undefined. */
export function agentOf(headers: Record<string, string | string[] | undefined>): string | undefined {
  const v = headers[AGENT_HEADER];
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return AGENT_PATTERN.test(t) ? t : undefined;
}

/** Route POST lama → nama tool MCP. */
export const TOOL_ROUTES: Readonly<Record<string, string>> = {
  '/docs/open': 'open_doc',
  '/execute': 'execute',
  '/screenshot': 'screenshot',
  '/boards': 'list_boards',
  '/inspect': 'inspect',
  '/export': 'export',
  '/skills/read': 'read_skill',
  '/layout-check': 'layout_check',
  '/viewer/visual-diff': 'visual_diff',
  '/icons/search': 'icon_search',
  '/photos/search': 'photo_search',
  '/viewer/selection': 'get_selection',
  '/viewer/export-code': 'export_code',
  '/viewer/paste': 'paste',
  '/viewer/import-url': 'import_url',
  '/viewer/documents': 'list_documents',
  '/viewer/undo': 'undo',
  '/viewer/redo': 'redo',
  '/viewer/fix-check': 'fix_check',
  '/pages': 'list_pages',
  '/pages/switch': 'switch_page',
  '/pages/create': 'create_page',
  '/pages/tree': 'get_page_tree',
  '/comments': 'list_comments',
  '/comments/create': 'add_comment',
  '/comments/reply': 'reply_to_comment',
  '/comments/resolve': 'resolve_comment',
  '/comments/delete': 'delete_comment',
  '/analyze/colors': 'analyze_colors',
  '/analyze/typography': 'analyze_typography',
  '/analyze/clusters': 'analyze_clusters',
};

export const publicSessionId = (id: string) => id.slice(0, 8);

export type ActivitySession = {
  /** Id publik (8 karakter). */
  id: string;
  client?: string;
  /** Harness agen (`x-lakar-agent`), mis. `claude-code`; viewer memakainya untuk nama dan warna kursor. */
  agent?: string;
  activeSlug?: string;
  createdAt: string;
  lastAt?: string;
  executes: number;
};

/** Jumlah temuan check (error, warning). */
export type CallSummary = { error: number; warning: number };

export type CallStatus = 'running' | 'done' | 'warning' | 'error';

export type ActivityCall = {
  callId: string;
  /** Id sesi publik. */
  session: string;
  client?: string;
  /** Harness agen sesi (lihat `ActivitySession.agent`). */
  agent?: string;
  tool: string;
  slug?: string;
  /** Label execute (3–8 kata). */
  description?: string;
  /** Argumen ringkas: id node (inspect), board (screenshot), nama skill, query pencarian. */
  target?: string;
  status: CallStatus;
  startedAt: string;
  durationMs?: number;
  rev?: number;
  /** Id node yang dibuat execute. */
  created?: string[];
  /** Board tersentuh (execute) atau yang dicek (layout_check). */
  boards?: string[];
  /** Jumlah node berubah (execute) atau diperiksa. */
  nodes?: number;
  /**
   * Posisi terukur `[x, y, w, h]` relatif board per id node (execute: `data.bounds`, maks 60 entri; inspect: node
   * target). Dipakai viewer untuk kursor dan outline agen.
   */
  bounds?: Record<string, BoundsTuple>;
  summary?: CallSummary;
  error?: { code: string; message: string };
  /** Jendela viewer pengirim (hanya call dari aplikasi: restore, pages). */
  origin?: string;
};

/** Jenis perubahan dari aplikasi untuk sinkron antar jendela. */
export type ChangeKind = 'create' | 'rename' | 'duplicate' | 'archive' | 'unarchive' | 'delete' | 'folders' | 'edit';

/**
 * Perubahan dari aplikasi. `slug` = dokumen hasil (rename: slug baru, `from` = slug lama; duplicate: salinan,
 * `from` = sumber). `archived` (delete) = salinan arsip yang dihapus. `edit` = execute sesi viewer (rev + board
 * tersentuh). `folders` = metadata folder berubah (`slug` diisi untuk move).
 */
export type DocChange = {
  kind: ChangeKind;
  slug?: string;
  from?: string;
  archived?: boolean;
  rev?: number;
  boards?: string[];
  origin?: string;
};
export type ChangeEvent = { seq: number; type: 'change'; change: DocChange };

/** Seleksi canvas dokumen `slug` berubah (AD-9): alamat node terbaru, rev dokumen saat itu, jendela pengirim. */
export type DocSelection = { slug: string; addresses: string[]; rev?: number; origin?: string };
export type SelectionEvent = { seq: number; type: 'selection'; selection: DocSelection };

/**
 * Permintaan "buka tab" (spec-agent-open-doc): `open_doc` tanpa slug membuat dokumen baru saat tidak ada dokumen yang
 * difokuskan. `origin` = jendela yang terakhir melapor fokus (tanpa origin = jendela mana pun). Hanya permintaan.
 */
export type DocOpenRequest = { slug: string; origin?: string };
export type OpenTabEvent = { seq: number; type: 'openTab'; openTab: DocOpenRequest };

/**
 * Daftar peer room `slug` atau status koneksinya berubah (spec-collab-cloud story 5). `peers` = daftar
 * penuh terkini termasuk klien kita sendiri; `connected` false = WS room putus (peer tetap, tandai redup).
 */
export type RoomPeer = { peerId: string; name: string; kind: 'human' | 'agent'; access: 'edit' | 'view'; presence?: unknown };
/** `self` = peerId koneksi kita saat ini (baru tiap welcome/reconnect) — viewer memakainya untuk menandai chip sendiri. */
export type RoomPeers = { slug: string; connected: boolean; peers: RoomPeer[]; self?: string };
export type PeersEvent = { seq: number; type: 'peers'; peers: RoomPeers };

/** Presence satu peer room berubah (kursor/seleksi jarak jauh); `presence` = payload bebas yang dikirim peer. */
export type RoomPresence = { slug: string; peerId: string; presence: unknown };
export type PresenceEvent = { seq: number; type: 'presence'; presence: RoomPresence };

/**
 * Status sign-in cloud berubah (spec-cloud-auth story C): sign-in/out di `/viewer/auth/*` supaya
 * semua jendela viewer memuat ulang blok Lakar Cloud. `user` hanya ada saat `signedIn`.
 */
export type CloudAuthState = { signedIn: boolean; user?: { id: string; email: string; name?: string; avatarUrl?: string } };
export type AuthEvent = { seq: number; type: 'auth'; auth: CloudAuthState };

export type ActivityEvent = { seq: number; type: 'call'; call: ActivityCall } | { seq: number; type: 'session'; session: ActivitySession };
type ActivityPayload = { type: 'call'; call: ActivityCall } | { type: 'session'; session: ActivitySession };

/** Semua event bus: aktivitas (masuk ring) + perubahan aplikasi, seleksi, buka tab, room, dan auth (tidak masuk ring). */
export type BusEvent = ActivityEvent | ChangeEvent | SelectionEvent | OpenTabEvent | PeersEvent | PresenceEvent | AuthEvent;
export type ActivityListener = (event: ActivityEvent) => void;
export type BusListener = (event: BusEvent) => void;

/**
 * Bus event dalam proses: ring buffer `ACTIVITY_RING_MAX` + pelanggan. Event `change` hanya disiarkan (seq ikut
 * naik) ke pelanggan `subscribeAll` (stream SSE) dan tidak disimpan di ring: bentuk `hello` dan pelanggan
 * `subscribe` lama tetap, dan viewer yang tersambung ulang memuat ulang penuh.
 */
export class ActivityBus {
  readonly #ring: ActivityEvent[] = [];
  /** Pelanggan; `all` = juga menerima event `change`. */
  readonly #listeners = new Map<BusListener, { all: boolean }>();
  readonly #max: number;
  #seq = 0;
  /** Jumlah stream viewer (`GET /viewer/events`) yang terbuka. */
  #viewers = 0;
  /** Stream terbuka per origin jendela (`?origin=`); origin tanpa stream tidak ada di sini. */
  readonly #viewerOrigins = new Map<string, number>();
  constructor(max = ACTIVITY_RING_MAX) {
    this.#max = max;
  }
  emit(payload: ActivityPayload): ActivityEvent {
    const event = { seq: ++this.#seq, ...payload } as ActivityEvent;
    this.#ring.push(event);
    if (this.#ring.length > this.#max) this.#ring.splice(0, this.#ring.length - this.#max);
    this.#broadcast(event);
    return event;
  }
  /** Siarkan perubahan dari aplikasi (tanpa ring). Field kosong dibuang. */
  change(change: DocChange): ChangeEvent {
    const clean = Object.fromEntries(Object.entries(change).filter(([, v]) => v !== undefined)) as DocChange;
    const event: ChangeEvent = { seq: ++this.#seq, type: 'change', change: clean };
    this.#broadcast(event);
    return event;
  }
  /** Siarkan perubahan seleksi (AD-9; tanpa ring, hanya pelanggan `subscribeAll`). Field kosong dibuang. */
  selection(selection: DocSelection): SelectionEvent {
    const clean = Object.fromEntries(Object.entries(selection).filter(([, v]) => v !== undefined)) as DocSelection;
    const event: SelectionEvent = { seq: ++this.#seq, type: 'selection', selection: clean };
    this.#broadcast(event);
    return event;
  }
  /** Siarkan perubahan peer/koneksi room (story 5; tanpa ring, hanya pelanggan `subscribeAll`). */
  peers(peers: RoomPeers): PeersEvent {
    const clean = Object.fromEntries(Object.entries(peers).filter(([, v]) => v !== undefined)) as RoomPeers;
    const event: PeersEvent = { seq: ++this.#seq, type: 'peers', peers: clean };
    this.#broadcast(event);
    return event;
  }
  /** Siarkan presence satu peer room (tanpa ring, hanya pelanggan `subscribeAll`). */
  presence(presence: RoomPresence): PresenceEvent {
    const event: PresenceEvent = { seq: ++this.#seq, type: 'presence', presence };
    this.#broadcast(event);
    return event;
  }
  /** Siarkan perubahan status sign-in cloud (story C; tanpa ring, hanya pelanggan `subscribeAll`). */
  auth(auth: CloudAuthState): AuthEvent {
    const clean = Object.fromEntries(Object.entries(auth).filter(([, v]) => v !== undefined)) as CloudAuthState;
    const event: AuthEvent = { seq: ++this.#seq, type: 'auth', auth: clean };
    this.#broadcast(event);
    return event;
  }
  /** Minta viewer membuka tab dokumen (tanpa ring, hanya pelanggan `subscribeAll`). Field kosong dibuang. */
  openTab(request: DocOpenRequest): OpenTabEvent {
    const clean = Object.fromEntries(Object.entries(request).filter(([, v]) => v !== undefined)) as DocOpenRequest;
    const event: OpenTabEvent = { seq: ++this.#seq, type: 'openTab', openTab: clean };
    this.#broadcast(event);
    return event;
  }
  /**
   * Catat satu stream viewer terbuka (origin jendela bila dikirim); kembalikan fungsi penutupnya (idempoten). Penutup
   * mengembalikan true bila itu stream terakhir origin tersebut (fokus jendela itu boleh dibuang).
   */
  attachViewer(origin?: string): () => boolean {
    this.#viewers++;
    if (origin !== undefined) this.#viewerOrigins.set(origin, (this.#viewerOrigins.get(origin) ?? 0) + 1);
    let done = false;
    return () => {
      if (done) return false;
      done = true;
      this.#viewers--;
      if (origin === undefined) return false;
      const n = (this.#viewerOrigins.get(origin) ?? 1) - 1;
      if (n > 0) {
        this.#viewerOrigins.set(origin, n);
        return false;
      }
      this.#viewerOrigins.delete(origin);
      return true;
    };
  }
  /** Jendela `origin` masih punya stream terbuka. */
  hasViewer(origin: string): boolean {
    return this.#viewerOrigins.has(origin);
  }
  /** Jumlah stream viewer yang terbuka (0 = aplikasi Lakar tidak berjalan atau belum tersambung). */
  get viewerCount(): number {
    return this.#viewers;
  }
  #broadcast(event: BusEvent): void {
    for (const [l, { all }] of [...this.#listeners]) {
      if ((event.type === 'change' || event.type === 'selection' || event.type === 'openTab' || event.type === 'peers' || event.type === 'presence' || event.type === 'auth') && !all) continue;
      try {
        l(event);
      } catch {
        // pelanggan rusak tidak boleh memutus pelanggan lain
      }
    }
  }
  /** Event terakhir (maks `ACTIVITY_RING_MAX`), urut lama → baru. */
  recent(): ActivityEvent[] {
    return [...this.#ring];
  }
  /** Event aktivitas (call, session). */
  subscribe(l: ActivityListener): () => void {
    return this.#add(l as BusListener, false);
  }
  /** Event aktivitas + event `change`, `selection`, `openTab`, `peers`, `presence`, dan `auth`. */
  subscribeAll(l: BusListener): () => void {
    return this.#add(l, true);
  }
  #add(l: BusListener, all: boolean): () => void {
    this.#listeners.set(l, { all });
    return () => {
      this.#listeners.delete(l);
    };
  }
  get listenerCount(): number {
    return this.#listeners.size;
  }
}

export const sessionSnapshot = (s: Session): ActivitySession => ({
  id: publicSessionId(s.id),
  ...(s.client ? { client: s.client } : {}),
  ...(s.agent ? { agent: s.agent } : {}),
  ...(s.activeSlug ? { activeSlug: s.activeSlug } : {}),
  createdAt: s.createdAt,
  ...(s.lastAt ? { lastAt: s.lastAt } : {}),
  executes: s.executes,
});

type Pending = { call: ActivityCall; t0: number; sessionId: string; emitted: boolean; boardId?: string; viewer?: { slug: string; origin?: string } };

/** Respons berisi PNG base64: tidak di-parse saat sukses (hasil cukup dari status HTTP). */
const BINARY_TOOLS = new Set(['screenshot', 'export']);

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
const asSummary = (v: unknown): CallSummary | undefined => {
  const o = obj(v);
  return o && typeof o.error === 'number' && typeof o.warning === 'number' ? { error: o.error, warning: o.warning } : undefined;
};
const isTuple = (v: unknown): v is BoundsTuple => Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
/** Peta id → tuple 4 angka; entri tidak valid dibuang, peta kosong → undefined. */
const boundsRecord = (v: unknown): Record<string, BoundsTuple> | undefined => {
  const o = obj(v);
  if (!o) return undefined;
  const out: Record<string, BoundsTuple> = {};
  for (const [id, b] of Object.entries(o)) if (id && isTuple(b)) out[id] = [b[0], b[1], b[2], b[3]];
  return Object.keys(out).length ? out : undefined;
};
const ids = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = v.map((x) => (typeof x === 'string' ? x : str(obj(x)?.id))).filter((x): x is string => x !== undefined);
  return out;
};

/** URL untuk target Activity: host + path saja (query, fragment, dan kredensial dibuang). */
const urlTarget = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    return `${u.host}${u.pathname}`;
  } catch {
    return raw;
  }
};

/** Argumen ringkas per tool dari body permintaan. */
function targetOf(tool: string, body: Record<string, unknown> | undefined): string | undefined {
  if (!body) return undefined;
  switch (tool) {
    case 'inspect':
      return str(body.id);
    case 'screenshot':
    case 'visual_diff':
      return str(body.boardId) ?? str(body.nodeId);
    case 'export':
    case 'export_code':
      return str(body.id);
    case 'paste':
      return str(body.parentId);
    case 'import_url':
      // Query/kredensial tidak dicatat di Activity (bisa memuat token sementara di URL bertanda tangan).
      return urlTarget(str(body.url));
    case 'layout_check':
    case 'fix_check':
      return str(body.boardId);
    case 'read_skill':
      return str(body.name);
    case 'switch_page':
    case 'get_page_tree':
      return str(body.page);
    case 'create_page':
      return str(body.name);
    case 'add_comment':
      return str(body.nodeId) ?? str(body.pageId);
    case 'reply_to_comment':
    case 'resolve_comment':
      return str(body.threadId);
    case 'icon_search':
    case 'photo_search':
      return str(body.query);
    default:
      return undefined;
  }
}

/** Lengkapi call dengan hasil respons AD-11. */
function finish(call: ActivityCall, statusCode: number, json: unknown): ActivityCall {
  const body = obj(json);
  if (!body || body.ok !== true) {
    const err = obj(body?.error);
    return {
      ...call,
      status: 'error',
      error: { code: str(err?.code) ?? 'EXEC_ERROR', message: str(err?.message) ?? `HTTP ${statusCode}` },
    };
  }
  const data = obj(body.data) ?? {};
  const out: ActivityCall = { ...call, status: 'done' };
  if (typeof data.rev === 'number') out.rev = data.rev;
  switch (call.tool) {
    case 'open_doc':
      if (str(data.slug)) out.slug = str(data.slug);
      break;
    case 'execute': {
      const created = ids(data.created);
      if (created) out.created = created;
      const check = obj(data.check);
      const boards = ids(check?.boards);
      if (boards) out.boards = boards;
      const bounds = obj(data.bounds);
      if (bounds) out.nodes = Object.keys(bounds).length + (typeof data.boundsTruncated === 'number' ? data.boundsTruncated : 0);
      const rects = boundsRecord(bounds);
      if (rects) out.bounds = rects;
      const summary = asSummary(check?.summary);
      if (summary) out.summary = summary;
      break;
    }
    case 'undo':
    case 'redo': {
      // spec-agent-undo: judul baris = label riwayat langkah ("Undo: …"), board tersentuh untuk muat ulang viewer.
      const steps = Array.isArray(data.undone) ? data.undone : Array.isArray(data.redone) ? data.redone : [];
      const verb = call.tool === 'undo' ? 'Undo' : 'Redo';
      const first = str(obj(steps[0])?.description);
      if (steps.length === 1 && first) out.description = `${verb}: ${first}`;
      else if (steps.length > 1) out.description = `${verb} ${steps.length} steps`;
      const boards = ids(data.boards);
      if (boards) out.boards = boards;
      break;
    }
    case 'layout_check':
    case 'fix_check': {
      const boards = ids(data.boards);
      if (boards) out.boards = boards;
      const summary = asSummary(data.summary);
      if (summary) out.summary = summary;
      break;
    }
    case 'inspect': {
      const node = obj(data.node);
      const id = str(node?.id);
      if (id) out.nodes = 1;
      const b = node?.bounds;
      if (id && isTuple(b)) out.bounds = { [id]: [b[0], b[1], b[2], b[3]] };
      if (str(data.boardId)) out.boards = [str(data.boardId)!];
      break;
    }
    case 'list_boards':
      if (Array.isArray(data.boards)) out.nodes = data.boards.length;
      break;
    case 'list_documents':
      if (Array.isArray(data.documents)) out.nodes = data.documents.length;
      break;
    case 'paste': {
      // Paste agen (epic paste-vektor story 3): node baru dan board tersentuh, seperti execute.
      const created = ids(data.created);
      if (created) {
        out.created = created;
        out.nodes = created.length;
      }
      const boards = ids(data.boards);
      if (boards) out.boards = boards;
      break;
    }
    case 'get_selection': {
      // Viewer menampilkan "… read your selection: {nama}" (agen-di-canvas story 3): dokumen yang benar-benar dibaca
      // (fallback bisa berbeda dari dokumen aktif sesi), alamat primer (terakhir dipilih), dan jumlah alamat.
      if (str(data.slug)) out.slug = str(data.slug);
      const addresses = Array.isArray(data.addresses) ? data.addresses.filter((a): a is string => typeof a === 'string') : undefined;
      if (addresses?.length) out.target = addresses[addresses.length - 1]!;
      if (addresses) out.nodes = addresses.length;
      break;
    }
  }
  if (out.summary && out.summary.error + out.summary.warning > 0) out.status = 'warning';
  return out;
}

export type ActivityHooksOptions = {
  sessions: Sessions;
  bus: ActivityBus;
  /** Interval heartbeat SSE (default 15 dtk). */
  heartbeatMs?: number;
  now?: () => number;
  /** Dokumen yang difokuskan viewer: slug event `running` untuk `open_doc` tanpa slug. */
  focusedSlug?: () => string | undefined;
  /** Stream terakhir jendela `origin` tertutup (jendela ditutup/di-reload): fokus jendela itu dibuang. */
  onViewerGone?: (origin: string) => void;
};

/**
 * Hook event (`preHandler`/`onSend`/`onResponse`) untuk route tool lama + route SSE `GET /viewer/events`.
 * Sesi tidak dikenal di `preHandler` → tidak ada event (handler menjawab 401). Event `running` selalu
 * dipasangkan: `onSend` menutupnya dari respons, `onResponse` menutup sisa (mis. koneksi putus) sebagai error.
 */
export function registerActivityHooks(app: FastifyInstance, { sessions, bus, heartbeatMs = ACTIVITY_HEARTBEAT_MS, now = Date.now, focusedSlug, onViewerGone }: ActivityHooksOptions): void {
  const pending = new WeakMap<FastifyRequest, Pending>();
  let nextCall = 0;
  const callPrefix = Math.random().toString(36).slice(2, 8);

  const routeUrl = (req: FastifyRequest) => req.routeOptions.url;

  app.addHook('preHandler', async (req) => {
    if (req.method !== 'POST') return;
    const tool = TOOL_ROUTES[routeUrl(req) ?? ''];
    if (!tool) return;
    const session = sessions.peek(req.headers[SESSION_HEADER]);
    if (!session) return;
    if (session.client === VIEWER_CLIENT) {
      // Execute dari aplikasi (layer manual): tidak tampil di Activity, tetapi jendela lain perlu memuat ulang.
      if (tool === 'execute' && session.activeSlug) {
        const origin = originOf(req.headers);
        const call: ActivityCall = { callId: '', session: publicSessionId(session.id), client: VIEWER_CLIENT, tool, status: 'running', startedAt: '' };
        pending.set(req, { call, t0: now(), sessionId: session.id, emitted: false, viewer: { slug: session.activeSlug, ...(origin ? { origin } : {}) } });
      }
      return;
    }
    const body = obj(req.body);
    let description: string | undefined;
    if (tool === 'execute') {
      description = str(body?.description);
      const editId = str(body?.editId);
      if (description === undefined && editId) description = str(session.failed.get(editId)?.description);
      description = description?.trim() || undefined;
    }
    // open_doc tanpa slug memakai dokumen fokus viewer (bila ada); dokumen baru baru diketahui di event selesai.
    const slug = tool === 'open_doc' ? (str(body?.slug) ?? focusedSlug?.()) : session.activeSlug;
    const target = targetOf(tool, body);
    const t0 = now();
    const call: ActivityCall = {
      callId: `${callPrefix}-${++nextCall}`,
      session: publicSessionId(session.id),
      ...(session.client ? { client: session.client } : {}),
      ...(session.agent ? { agent: session.agent } : {}),
      tool,
      ...(slug ? { slug } : {}),
      ...(description ? { description } : {}),
      ...(target ? { target } : {}),
      status: 'running',
      startedAt: new Date(t0).toISOString(),
    };
    const boardId = tool === 'screenshot' ? str(body?.boardId) : undefined;
    pending.set(req, { call, t0, sessionId: session.id, emitted: false, ...(boardId ? { boardId } : {}) });
    bus.emit({ type: 'call', call });
  });

  app.addHook('onSend', async (req, reply, payload) => {
    if (req.method !== 'POST') return payload;
    const url = routeUrl(req);
    if (url === '/sessions') {
      if (reply.statusCode === 200 && typeof payload === 'string') {
        try {
          const id = str(obj(obj(JSON.parse(payload))?.data)?.sessionId);
          const s = id ? sessions.byId(id) : undefined;
          if (s && s.client !== VIEWER_CLIENT) bus.emit({ type: 'session', session: sessionSnapshot(s) });
        } catch {
          // payload bukan JSON: abaikan
        }
      }
      return payload;
    }
    const p = pending.get(req);
    if (!p || p.emitted) return payload;
    p.emitted = true;
    if (p.viewer) {
      // Sesi viewer: hanya execute sukses yang dipancarkan, sebagai `change` jenis `edit`.
      if (reply.statusCode !== 200 || typeof payload !== 'string') return payload;
      try {
        const body = obj(JSON.parse(payload));
        const data = obj(body?.data);
        if (body?.ok === true && data && typeof data.rev === 'number') {
          const boards = ids(obj(data.check)?.boards);
          bus.change({ kind: 'edit', slug: p.viewer.slug, rev: data.rev, ...(boards ? { boards } : {}), ...(p.viewer.origin ? { origin: p.viewer.origin } : {}) });
        }
      } catch {
        // payload bukan JSON: abaikan
      }
      return payload;
    }
    const timed = { ...p.call, durationMs: Math.max(0, Math.round(now() - p.t0)) };
    let done: ActivityCall;
    if (BINARY_TOOLS.has(p.call.tool) && reply.statusCode === 200) {
      done = { ...timed, status: 'done', ...(p.boardId ? { boards: [p.boardId] } : {}) };
    } else {
      let json: unknown;
      try {
        json = typeof payload === 'string' ? JSON.parse(payload) : Buffer.isBuffer(payload) ? JSON.parse(payload.toString('utf8')) : undefined;
      } catch {
        json = undefined;
      }
      done = finish(timed, reply.statusCode, json);
    }
    bus.emit({ type: 'call', call: done });
    return payload;
  });

  // Jaring pengaman: request yang tidak melewati onSend (mis. klien memutus koneksi).
  app.addHook('onResponse', async (req) => {
    const p = pending.get(req);
    if (!p || p.emitted) return;
    p.emitted = true;
    if (p.viewer) return;
    bus.emit({
      type: 'call',
      call: { ...p.call, status: 'error', durationMs: Math.max(0, Math.round(now() - p.t0)), error: { code: 'EXEC_ERROR', message: 'koneksi ditutup sebelum respons terkirim' } },
    });
  });

  /** Stream SSE yang terbuka; ditutup saat server ditutup supaya `app.close()` tidak menggantung. */
  const streams = new Set<ServerResponse>();
  app.addHook('preClose', async () => {
    for (const res of streams) res.end();
    streams.clear();
  });

  app.get('/viewer/events', (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-content-type-options': 'nosniff',
    });
    const write = (event: string, data: unknown) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const hello = {
      sessions: sessions
        .all()
        .filter((s) => s.client !== VIEWER_CLIENT)
        .map(sessionSnapshot),
      recent: bus.recent(),
    };
    write('hello', hello);
    streams.add(res);
    // Origin jendela (`?origin=`, pola sama dengan header `x-lakar-origin`): umur fokus jendela = umur stream ini.
    const raw = (req.query as Record<string, unknown> | undefined)?.origin;
    const origin = typeof raw === 'string' && ORIGIN_PATTERN.test(raw) ? raw : undefined;
    const detachViewer = bus.attachViewer(origin);
    const unsubscribe = bus.subscribeAll((e) => write(e.type, e));
    const ping = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, heartbeatMs);
    ping.unref?.();
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(ping);
      unsubscribe();
      if (detachViewer() && origin !== undefined) onViewerGone?.(origin);
      streams.delete(res);
    };
    req.raw.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
  });
}
