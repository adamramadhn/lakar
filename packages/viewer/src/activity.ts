// Stream aktivitas dari lakard (`GET /viewer/events`, SSE): klien EventSource dengan reconnect + backoff, dan
// reducer murni sesi/tool call. Bentuk event disalin dari packages/daemon/src/events.ts (viewer tidak bergantung
// pada daemon). Sesi viewer sendiri (`lakar-viewer`) tidak pernah ditampilkan.
// Sinkron antar jendela: event `change` (tulis dari aplikasi di jendela lain: kelola file, folder, layer manual)
// tidak masuk state Activity; `remoteEffect`/`editChange` memutuskan reaksinya. `activityHub` berbagi satu
// EventSource per jendela untuk App (daftar, tab) dan Viewer (state Activity, muat ulang dokumen).

export const VIEWER_CLIENT = 'lakar-viewer';
/** Sesi dianggap Live bila ada call running atau call terakhir lebih baru dari ini. */
export const LIVE_WINDOW_MS = 60_000;
/** Call yang diingat reducer (semua sesi). */
export const CALLS_MAX = 300;

export type ActivitySession = { id: string; client?: string; activeSlug?: string; createdAt: string; lastAt?: string; executes: number };
export type CallStatus = 'running' | 'done' | 'warning' | 'error';
export type ActivityCall = {
  callId: string;
  session: string;
  client?: string;
  tool: string;
  slug?: string;
  description?: string;
  target?: string;
  status: CallStatus;
  startedAt: string;
  durationMs?: number;
  rev?: number;
  created?: string[];
  boards?: string[];
  nodes?: number;
  /** Posisi `[x, y, w, h]` relatif board per id node (execute dan inspect selesai). */
  bounds?: Record<string, [number, number, number, number]>;
  summary?: { error: number; warning: number };
  error?: { code: string; message: string };
  /** Jendela viewer pengirim (restore, pages). */
  origin?: string;
};
export type ActivityEvent = { seq: number; type: 'call'; call: ActivityCall } | { seq: number; type: 'session'; session: ActivitySession };
export type Hello = { sessions: ActivitySession[]; recent: ActivityEvent[] };

/** Perubahan dari aplikasi (salinan `DocChange` events.ts). */
export type DocChange = {
  kind: 'create' | 'rename' | 'duplicate' | 'archive' | 'unarchive' | 'delete' | 'folders' | 'edit';
  /** Dokumen hasil (rename: slug baru; duplicate: salinan). */
  slug?: string;
  /** Slug lama (rename) atau sumber (duplicate). */
  from?: string;
  /** delete: salinan arsip yang dihapus. */
  archived?: boolean;
  rev?: number;
  boards?: string[];
  origin?: string;
};
export type ChangeEvent = { seq: number; type: 'change'; change: DocChange };
/** Seleksi canvas dokumen berubah (AD-9; salinan `DocSelection` events.ts). */
export type DocSelection = { slug: string; addresses: string[]; rev?: number; origin?: string };
export type SelectionEvent = { seq: number; type: 'selection'; selection: DocSelection };
/** Semua event stream `/viewer/events` sesudah `hello`. */
export type StreamEvent = ActivityEvent | ChangeEvent | SelectionEvent;

// ---- Reducer ----

export type ActivityState = {
  /** Sesi per id publik (urutan sisip = urutan pertama terlihat). */
  sessions: Record<string, ActivitySession>;
  /** Call terbaru per callId, urut mulai (lama → baru). */
  calls: ActivityCall[];
  /** seq event terakhir yang diterapkan (event duplikat/lama diabaikan). */
  seq: number;
  connected: boolean;
};

export type ActivityAction = { type: 'hello'; hello: Hello } | { type: 'event'; event: StreamEvent } | { type: 'connection'; connected: boolean };

export const initialActivity: ActivityState = { sessions: {}, calls: [], seq: 0, connected: false };

const isViewer = (client: string | undefined) => client === VIEWER_CLIENT;
/**
 * Restore dan kelola halaman dari aplikasi (tool `restore`/`pages`, client `lakar-viewer`) tidak tampil di
 * Activity, tetapi tetap mengubah dokumen: viewer lain (dan viewer yang sama) memuat ulang karenanya.
 */
export const isDocChangeFromViewer = (c: Pick<ActivityCall, 'client' | 'tool'>) => isViewer(c.client) && (c.tool === 'restore' || c.tool === 'pages');

function applyEvent(state: ActivityState, event: StreamEvent): ActivityState {
  if (event.seq <= state.seq) return state;
  const next: ActivityState = { ...state, seq: event.seq };
  // Perubahan dari aplikasi dan seleksi tidak tampil di Activity.
  if (event.type === 'change' || event.type === 'selection') return next;
  if (event.type === 'session') {
    if (isViewer(event.session.client)) return next;
    next.sessions = { ...state.sessions, [event.session.id]: { ...state.sessions[event.session.id], ...event.session } };
    return next;
  }
  const call = event.call;
  if (isViewer(call.client)) return next;
  const i = state.calls.findIndex((c) => c.callId === call.callId);
  const calls = i === -1 ? [...state.calls, call] : state.calls.map((c, j) => (j === i ? { ...c, ...call } : c));
  if (calls.length > CALLS_MAX) calls.splice(0, calls.length - CALLS_MAX);
  next.calls = calls;
  const prev = state.sessions[call.session];
  const at = call.status === 'running' ? call.startedAt : new Date(Date.parse(call.startedAt) + (call.durationMs ?? 0)).toISOString();
  const session: ActivitySession = {
    ...(prev ?? { id: call.session, createdAt: call.startedAt, executes: 0 }),
    ...(call.client ? { client: call.client } : {}),
    lastAt: prev?.lastAt && prev.lastAt > at ? prev.lastAt : at,
  };
  if (call.status !== 'running' && call.tool === 'open_doc' && call.slug) session.activeSlug = call.slug;
  if (call.status !== 'running' && call.tool === 'execute' && (i === -1 || state.calls[i]!.status === 'running')) session.executes = (prev?.executes ?? 0) + 1;
  next.sessions = { ...state.sessions, [call.session]: session };
  return next;
}

export function activityReducer(state: ActivityState, action: ActivityAction): ActivityState {
  switch (action.type) {
    case 'connection':
      return state.connected === action.connected ? state : { ...state, connected: action.connected };
    case 'hello': {
      // Snapshot penuh (sambung pertama atau reconnect, mungkin daemon restart): bangun ulang dari nol.
      let s: ActivityState = { sessions: {}, calls: [], seq: 0, connected: true };
      for (const x of action.hello.sessions) if (!isViewer(x.client)) s.sessions[x.id] = x;
      for (const e of action.hello.recent) s = applyEvent(s, e);
      // Snapshot sesi lebih otoritatif untuk executes/activeSlug daripada hasil replay.
      for (const x of action.hello.sessions) if (!isViewer(x.client) && s.sessions[x.id]) s.sessions[x.id] = { ...s.sessions[x.id]!, ...x, lastAt: maxIso(s.sessions[x.id]!.lastAt, x.lastAt) };
      return s;
    }
    case 'event':
      return applyEvent(state, action.event);
  }
}

const maxIso = (a: string | undefined, b: string | undefined) => (a && b ? (a > b ? a : b) : (a ?? b));

// ---- Selector ----

export type SessionView = {
  session: ActivitySession;
  /** Call untuk dokumen ini (dan call tanpa dokumen, mis. read_skill), terbaru dulu. */
  calls: ActivityCall[];
  live: boolean;
  running: boolean;
  /** Waktu call terakhir (ms) atau undefined. */
  lastCallAt: number | undefined;
};

export const callEndMs = (c: ActivityCall) => Date.parse(c.startedAt) + (c.durationMs ?? 0);

/** Live = ada call running atau call terakhir < `LIVE_WINDOW_MS`; selain itu Idle. */
export function isLive(calls: readonly ActivityCall[], now: number): boolean {
  if (calls.some((c) => c.status === 'running')) return true;
  const last = Math.max(-Infinity, ...calls.map((c) => (c.status === 'running' ? Date.parse(c.startedAt) : callEndMs(c))));
  return Number.isFinite(last) && now - last < LIVE_WINDOW_MS;
}

/** Sesi yang relevan untuk `slug` (dokumen aktif sesi atau pernah memanggil tool pada slug), Live dulu. */
export function sessionsForSlug(state: ActivityState, slug: string, now: number): SessionView[] {
  const out: SessionView[] = [];
  for (const session of Object.values(state.sessions)) {
    if (isViewer(session.client)) continue;
    const all = state.calls.filter((c) => c.session === session.id);
    const onSlug = all.filter((c) => c.slug === slug || (c.slug === undefined && session.activeSlug === slug));
    if (session.activeSlug !== slug && !onSlug.some((c) => c.slug === slug)) continue;
    const last = all.length ? Math.max(...all.map((c) => (c.status === 'running' ? Date.parse(c.startedAt) : callEndMs(c)))) : undefined;
    out.push({ session, calls: [...onSlug].reverse(), live: isLive(all, now), running: all.some((c) => c.status === 'running'), lastCallAt: last });
  }
  return out.sort((a, b) => Number(b.live) - Number(a.live) || (b.lastCallAt ?? 0) - (a.lastCallAt ?? 0));
}

/**
 * Event selesai yang membuat dokumen `slug` yang tampil (rev `shownRev`) usang: rev baru dan board tersentuh.
 * `boards` hanya diketahui dari execute (`check.boards`) dan paste; tool lain → `undefined` (muat ulang semua board).
 */
export function revChange(event: StreamEvent, slug: string, shownRev: number): { rev: number; boards?: string[] } | undefined {
  if (event.type !== 'call') return undefined;
  const c = event.call;
  if ((isViewer(c.client) && !isDocChangeFromViewer(c)) || c.status === 'running' || c.status === 'error' || c.slug !== slug) return undefined;
  if (typeof c.rev !== 'number' || c.rev <= shownRev) return undefined;
  return c.tool === 'execute' || c.tool === 'paste' ? { rev: c.rev, boards: c.boards ?? [] } : { rev: c.rev };
}

// ---- Sinkron antar jendela ----

/** Event kelola file untuk tab (bentuk sama dengan `FileEvent` api.ts, plus `remote`). */
export type RemoteFileEvent = { type: 'rename'; from: string; to: string; remote: true } | { type: 'archive'; slug: string; remote: true } | { type: 'delete'; slug: string; archived: boolean; remote: true };

/** Reaksi jendela ini atas perubahan dari jendela lain. */
export type RemoteEffect = {
  /** Slug yang cache dokumen/screenshot-nya dibuang (dokumen pindah/hilang/dibuat ulang). */
  invalidate: string[];
  /** Diteruskan ke pendengar tab (rename/archive/delete). */
  fileEvent?: RemoteFileEvent;
};

/**
 * Perubahan `change` dari jendela lain → reaksi jendela ini; gema jendela sendiri (`origin` sama) → undefined
 * (jendela pengirim sudah memuat ulang sendiri). Semua reaksi memuat ulang daftar (Dashboard, folder, thumbnail).
 */
export function remoteEffect(change: DocChange, origin: string): RemoteEffect | undefined {
  if (change.origin !== undefined && change.origin === origin) return undefined;
  const slug = change.slug;
  switch (change.kind) {
    case 'rename':
      return slug && change.from ? { invalidate: [change.from, slug], fileEvent: { type: 'rename', from: change.from, to: slug, remote: true } } : { invalidate: [] };
    case 'archive':
      return slug ? { invalidate: [slug], fileEvent: { type: 'archive', slug, remote: true } } : { invalidate: [] };
    case 'delete':
      if (!slug) return { invalidate: [] };
      return change.archived ? { invalidate: [], fileEvent: { type: 'delete', slug, archived: true, remote: true } } : { invalidate: [slug], fileEvent: { type: 'delete', slug, archived: false, remote: true } };
    case 'create':
    case 'duplicate':
    case 'unarchive':
      // Slug bisa dipakai ulang (dokumen lama dihapus lalu dibuat lagi): jangan pakai cache lama.
      return { invalidate: slug ? [slug] : [] };
    case 'folders':
    case 'edit':
      return { invalidate: [] };
    default:
      return undefined;
  }
}

/** Restore/kelola halaman (event call aplikasi) dari jendela lain yang selesai → daftar perlu dimuat ulang. */
export function remoteDocCall(event: StreamEvent, origin: string): boolean {
  if (event.type !== 'call') return false;
  const c = event.call;
  return isDocChangeFromViewer(c) && c.status === 'done' && c.origin !== origin;
}

/**
 * Event `change` `edit` (layer manual dari jendela lain) yang membuat dokumen `slug` (rev `shownRev`) usang:
 * rev baru dan board tersentuh. Gema jendela sendiri diabaikan (sudah dimuat ulang sesudah execute).
 */
export function editChange(event: StreamEvent, slug: string, shownRev: number, origin: string): { rev: number; boards: string[] } | undefined {
  if (event.type !== 'change') return undefined;
  const c = event.change;
  if (c.kind !== 'edit' || c.slug !== slug || (c.origin !== undefined && c.origin === origin)) return undefined;
  if (typeof c.rev !== 'number' || c.rev <= shownRev) return undefined;
  return { rev: c.rev, boards: c.boards ?? [] };
}

/** Dokumen `slug` yang sedang dibuka diarsip/dihapus di jendela lain → alasan; selain itu undefined. */
export function goneReason(event: StreamEvent, slug: string, origin: string): 'archived' | 'deleted' | undefined {
  if (event.type !== 'change') return undefined;
  const c = event.change;
  if (c.slug !== slug || (c.origin !== undefined && c.origin === origin)) return undefined;
  if (c.kind === 'archive') return 'archived';
  if (c.kind === 'delete' && !c.archived) return 'deleted';
  return undefined;
}

/** Slug `slug` muncul lagi (dibuat, dipulihkan dari arsip, duplikat, atau hasil rename) → muat ulang. */
export function slugAppeared(event: StreamEvent, slug: string): boolean {
  if (event.type !== 'change') return false;
  const c = event.change;
  return c.slug === slug && (c.kind === 'create' || c.kind === 'unarchive' || c.kind === 'duplicate' || c.kind === 'rename');
}

// ---- Label ----

/** Nama harness dari pola client: `claude` → Claude Code, `codex` → Codex, `lakar-mcp` → MCP agent. */
export function harnessLabel(client: string | undefined): string {
  if (!client) return 'Agent';
  const c = client.toLowerCase();
  if (c.includes('claude')) return 'Claude Code';
  if (c.includes('codex')) return 'Codex';
  if (c === 'lakar-mcp') return 'MCP agent';
  // Kelola file dari aplikasi (New file, Duplicate) mencatat riwayat atas nama viewer.
  if (c === 'lakar-viewer') return 'You';
  return client;
}

/** Warna agen: Codex = `--codex`, lainnya `--agent`. */
export const harnessColor = (client: string | undefined) => (client?.toLowerCase().includes('codex') ? 'codex' : 'agent');

const secs = (ms: number) => (ms < 10_000 ? `${(Math.round(ms / 100) / 10).toFixed(1)}s` : `${Math.round(ms / 1000)}s`);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Judul baris tool call. `nameOf` memetakan id node ke nama (Layers). */
export function callTitle(c: ActivityCall, nameOf: (id: string) => string | undefined = () => undefined): string {
  const t = c.target ? (nameOf(c.target) ?? c.target) : undefined;
  switch (c.tool) {
    case 'execute':
      return c.description ?? 'Run snippet';
    case 'layout_check':
      return t ? `Check ${t}` : 'Check all boards';
    case 'inspect':
      return t ? `Inspect ${t}` : 'Inspect node';
    case 'screenshot':
      return t ? `Screenshot ${t}` : 'Screenshot first board';
    case 'export':
      return t ? `Export ${t}` : 'Export first board';
    case 'export_code':
      return t ? `Export code for ${t}` : 'Export code for first board';
    case 'open_doc':
      return c.slug ? `Open ${c.slug}` : 'Open document';
    case 'restore':
      return c.description ?? 'Restore version';
    case 'pages':
      return c.description ?? 'Edit pages';
    case 'list_boards':
      return 'List boards';
    case 'get_selection':
      return 'Read selection';
    case 'paste':
      return 'Paste SVG';
    case 'read_skill':
      return t ? `Load ${t} skill` : 'List skills';
    case 'icon_search':
      return t ? `Search icons “${t}”` : 'Search icons';
    case 'photo_search':
      return t ? `Search photos “${t}”` : 'Search photos';
    default:
      return c.tool;
  }
}

/** Keterangan baris: durasi, jumlah node, temuan, atau error. */
export function callMeta(c: ActivityCall, now: number): string {
  if (c.status === 'running') return `running ${secs(Math.max(0, now - Date.parse(c.startedAt)))}`;
  if (c.status === 'error') return c.error ? `${c.error.code}` : 'failed';
  if (c.status === 'warning' && c.summary) {
    const parts = [c.summary.error ? plural(c.summary.error, 'error') : '', c.summary.warning ? plural(c.summary.warning, 'warning') : ''].filter(Boolean);
    return parts.join(' · ');
  }
  const parts: string[] = [];
  if (c.durationMs !== undefined && (c.tool === 'execute' || c.tool === 'layout_check' || c.tool === 'screenshot' || c.tool === 'export')) parts.push(secs(c.durationMs));
  if (c.nodes !== undefined) parts.push(plural(c.nodes, 'node'));
  if (c.tool === 'layout_check' && c.summary) parts.push('no findings');
  if (c.rev !== undefined && c.tool === 'open_doc') parts.push(`rev ${c.rev}`);
  return parts.join(' · ');
}

/** Waktu ringkas di kanan baris: now / 12s / 3m / 2h. */
export function shortAgo(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 5) return 'now';
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

// ---- Klien stream ----

export type EventSourceLike = {
  onopen: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  addEventListener(type: string, listener: (ev: { data: string }) => void): void;
  close(): void;
};
export type EventSourceCtor = new (url: string) => EventSourceLike;

export type StreamHandlers = {
  onHello: (hello: Hello) => void;
  onEvent: (event: StreamEvent) => void;
  onConnection: (connected: boolean) => void;
  /** Stream tersambung lagi setelah putus: dokumen perlu dimuat ulang (event yang hilang tidak diputar ulang). */
  onReconnect?: () => void;
};

export const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000] as const;

/**
 * Sambung ke `/viewer/events`; putus → tutup dan sambung ulang dengan backoff (1, 2, 4, 8, 15 dtk, lalu 15).
 * Kembalikan fungsi penutup.
 */
export function connectActivity(handlers: StreamHandlers, opts: { url?: string; EventSource?: EventSourceCtor; setTimeout?: (fn: () => void, ms: number) => unknown; clearTimeout?: (h: unknown) => void } = {}): () => void {
  const url = opts.url ?? '/viewer/events';
  const ES = opts.EventSource ?? (globalThis as unknown as { EventSource?: EventSourceCtor }).EventSource;
  const set = opts.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
  const clear = opts.clearTimeout ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>));
  if (!ES) return () => {};
  let es: EventSourceLike | undefined;
  let timer: unknown;
  let failures = 0;
  let everConnected = false;
  let stopped = false;

  const open = () => {
    if (stopped) return;
    const src = new ES(url);
    es = src;
    src.addEventListener('hello', (ev) => {
      let hello: Hello;
      try {
        hello = JSON.parse(ev.data) as Hello;
      } catch {
        return;
      }
      const reconnect = everConnected;
      everConnected = true;
      failures = 0;
      handlers.onConnection(true);
      handlers.onHello(hello);
      if (reconnect) handlers.onReconnect?.();
    });
    const onData = (ev: { data: string }) => {
      try {
        handlers.onEvent(JSON.parse(ev.data) as StreamEvent);
      } catch {
        // event rusak dilewati
      }
    };
    src.addEventListener('call', onData);
    src.addEventListener('session', onData);
    src.addEventListener('change', onData);
    src.addEventListener('selection', onData);
    src.onerror = () => {
      if (stopped || es !== src) return;
      src.close();
      es = undefined;
      handlers.onConnection(false);
      const delay = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)]!;
      failures++;
      timer = set(open, delay);
    };
  };
  open();
  return () => {
    stopped = true;
    if (timer !== undefined) clear(timer);
    es?.close();
    es = undefined;
  };
}

// ---- Hub: satu stream per jendela ----

export type HubListener = {
  /** Setiap event sesudah `hello` (call, session, change, selection). */
  onEvent?: (event: StreamEvent) => void;
  /** Stream tersambung lagi (event yang hilang tidak diputar ulang): muat ulang. */
  onReconnect?: () => void;
};

/**
 * Satu EventSource `/viewer/events` dibagi App dan Viewer (batas koneksi HTTP/1.1 per host kecil, dan tiap
 * tab browser sudah memakai satu). State Activity direduksi di sini sehingga Viewer yang baru dipasang langsung
 * melihat sesi/call terkini tanpa menunggu `hello` baru. Tersambung selama ada pelanggan (state atau event).
 */
export class ActivityHub {
  #state: ActivityState = initialActivity;
  readonly #stateListeners = new Set<() => void>();
  readonly #listeners = new Set<HubListener>();
  #close: (() => void) | undefined;
  readonly #connect: (handlers: StreamHandlers) => () => void;

  constructor(connect: (handlers: StreamHandlers) => () => void = (h) => connectActivity(h)) {
    this.#connect = connect;
  }

  getState = (): ActivityState => this.#state;

  /** Untuk `useSyncExternalStore`. */
  subscribeState = (l: () => void): (() => void) => {
    this.#stateListeners.add(l);
    this.#ensure();
    return () => {
      this.#stateListeners.delete(l);
      this.#release();
    };
  };

  listen(l: HubListener): () => void {
    this.#listeners.add(l);
    this.#ensure();
    return () => {
      this.#listeners.delete(l);
      this.#release();
    };
  }

  get connected(): boolean {
    return this.#close !== undefined;
  }

  #dispatch(action: ActivityAction) {
    const next = activityReducer(this.#state, action);
    if (next === this.#state) return;
    this.#state = next;
    for (const l of [...this.#stateListeners]) l();
  }

  #ensure() {
    if (this.#close) return;
    this.#close = this.#connect({
      onHello: (hello) => this.#dispatch({ type: 'hello', hello }),
      onEvent: (event) => {
        this.#dispatch({ type: 'event', event });
        for (const l of [...this.#listeners]) l.onEvent?.(event);
      },
      onConnection: (connected) => this.#dispatch({ type: 'connection', connected }),
      onReconnect: () => {
        for (const l of [...this.#listeners]) l.onReconnect?.();
      },
    });
  }

  #release() {
    if (this.#stateListeners.size || this.#listeners.size || !this.#close) return;
    this.#close();
    this.#close = undefined;
    this.#state = initialActivity;
  }
}

export const activityHub = new ActivityHub();
