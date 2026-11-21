// Klien lakard untuk viewer. Hanya endpoint baca: /viewer/*, /status, dan endpoint sesi (open, screenshot,
// inspect, layout-check) yang tidak mengubah dokumen. Bentuk respons AD-11: {ok:true,data} | {ok:false,error}.
import type { Finding, FindingSummary, LakarDocument } from '@lakar/schema';

/** Header sesi (sama dengan SESSION_HEADER @lakar/schema; disalin agar bundle tidak menarik zod). */
const SESSION_HEADER = 'x-lakar-session';
const CLIENT = 'lakar-viewer';

export type DocSummary = { slug: string; rev: number; updatedAt: string; boardCount: number; firstBoardId: string | null };
export type DaemonStatus = { version: string; host: string; port: number; dataDir: string };
export type Screenshot = { boardId: string; width: number; height: number; url: string };
export type InspectNode = Record<string, unknown> & { id: string; name: string; type?: string; bounds?: [number, number, number, number]; children?: InspectNode[]; childCount?: number };
export type InspectResult = { docId: string; rev: number; boardId: string; node: InspectNode; truncated?: boolean };
export type HistoryEntry = { rev: number; description: string; opsSummary: string; opCount: number; at: string; session: string; client?: string };
export type LayoutCheck = { docId: string; rev: number; boards: unknown; summary: FindingSummary; findings: Finding[]; ranAt: number };

/** lakard tidak bisa dihubungi (jaringan). */
export class OfflineError extends Error {}

/** Error AD-11 dari lakard. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// ---- Status koneksi (banner offline) ----

type Listener = () => void;
let offline = false;
const listeners = new Set<Listener>();
const retryListeners = new Set<Listener>();

function setOffline(v: boolean) {
  if (offline === v) return;
  offline = v;
  for (const l of listeners) l();
}
export const connection = {
  isOffline: () => offline,
  subscribe(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  /** Komponen yang memuat data mendaftar di sini; tombol Retry memanggil semuanya. */
  onRetry(l: Listener) {
    retryListeners.add(l);
    return () => {
      retryListeners.delete(l);
    };
  },
  retry() {
    for (const l of retryListeners) l();
  },
};

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, session?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(session ? { [SESSION_HEADER]: session } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (e) {
    setOffline(true);
    throw new OfflineError(e instanceof Error ? e.message : String(e));
  }
  let json: { ok: boolean; data?: T; error?: { code: string; message: string; hint: string } };
  try {
    json = await res.json();
  } catch {
    // Proxy/dev server tanpa lakard di belakangnya (502/504) dihitung offline.
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      setOffline(true);
      throw new OfflineError(`HTTP ${res.status}`);
    }
    setOffline(false);
    throw new ApiError('EXEC_ERROR', `respons lakard bukan JSON (HTTP ${res.status})`, 'periksa log lakard', res.status);
  }
  setOffline(false);
  if (!json.ok) {
    const err = json.error ?? { code: 'EXEC_ERROR', message: `HTTP ${res.status}`, hint: '' };
    throw new ApiError(err.code, err.message, err.hint, res.status);
  }
  return json.data as T;
}

// ---- Klien ----

class ViewerClient {
  #session: Promise<string> | undefined;
  /** Slug aktif sesi viewer (POST /docs/open memindahkannya). */
  #active: string | undefined;
  /** Slug yang terlihat di GET /viewer/docs: hanya ini yang boleh dibuka (open_doc membuat dokumen baru). */
  #known = new Set<string>();
  /** Antrean serial: open + permintaan dokumen tidak boleh saling menyela dalam satu sesi. */
  #queue: Promise<unknown> = Promise.resolve();
  /** Rev dokumen aktif menurut respons `/docs/open` terakhir. */
  #activeRev = -1;
  /** Screenshot per `slug@rev:boardId` (rev dari daemon). */
  #shots = new Map<string, Promise<Screenshot>>();
  /** Screenshot terbaru per `slug:boardId` dengan rev render-nya: board yang tidak berubah sejak `seenRev` dipakai ulang. */
  #latest = new Map<string, { rev: number; shot: Promise<Screenshot> }>();
  /** Permintaan screenshot yang sedang antre, per argumen pemanggil. */
  #pending = new Map<string, Promise<Screenshot>>();

  status() {
    return request<DaemonStatus>('GET', '/status');
  }

  async listDocs(): Promise<DocSummary[]> {
    const { docs } = await request<{ docs: DocSummary[] }>('GET', '/viewer/docs');
    this.#known = new Set(docs.map((d) => d.slug));
    return docs;
  }

  async getDoc(slug: string): Promise<LakarDocument> {
    const { doc } = await request<{ doc: LakarDocument }>('GET', `/viewer/docs/${encodeURIComponent(slug)}`);
    this.#known.add(slug);
    return doc;
  }

  /** Riwayat revisi dokumen (GET /viewer/docs/:slug/history), urut rev turun. */
  async getHistory(slug: string): Promise<HistoryEntry[]> {
    const { entries } = await request<{ entries: HistoryEntry[] }>('GET', `/viewer/docs/${encodeURIComponent(slug)}/history`);
    return entries;
  }

  #sessionId(): Promise<string> {
    this.#session ??= request<{ sessionId: string }>('POST', '/sessions', { client: CLIENT }).then(
      (d) => d.sessionId,
      (e) => {
        this.#session = undefined;
        throw e;
      },
    );
    return this.#session;
  }

  /**
   * Jalankan `fn` dengan sesi yang dokumen aktifnya `slug`; `fn` menerima rev dari respons `/docs/open`.
   * `minRev` (rev yang sudah dilihat pemanggil) lebih baru dari rev aktif → buka ulang untuk rev terkini.
   * Sesi hilang (daemon restart, 401) → buat ulang sekali.
   */
  #withDoc<T>(slug: string, fn: (session: string, rev: number) => Promise<T>, minRev = -1): Promise<T> {
    const run = async (): Promise<T> => {
      if (!this.#known.has(slug)) {
        await this.listDocs();
        if (!this.#known.has(slug)) throw docGone(slug);
      }
      for (let attempt = 0; ; attempt++) {
        const session = await this.#sessionId();
        try {
          if (this.#active !== slug || this.#activeRev < minRev) {
            this.#active = undefined;
            // open_doc membuat dokumen bila slug tidak ada: pastikan dokumen masih ada tepat sebelum membuka.
            try {
              await request('GET', `/viewer/docs/${encodeURIComponent(slug)}`);
            } catch (e) {
              if (e instanceof ApiError && e.code === 'NOT_FOUND') {
                this.#known.delete(slug);
                throw docGone(slug);
              }
              throw e;
            }
            const opened = await request<{ rev: number }>('POST', '/docs/open', { slug }, session);
            this.#active = slug;
            this.#activeRev = opened.rev;
          }
          return await fn(session, this.#activeRev);
        } catch (e) {
          if (attempt === 0 && e instanceof ApiError && e.status === 401) {
            this.#session = undefined;
            this.#active = undefined;
            continue;
          }
          throw e;
        }
      }
    };
    const next = this.#queue.then(run, run);
    this.#queue = next.catch(() => undefined);
    return next;
  }

  /**
   * PNG board (renderer yang sama dengan bench, AD-6), di-cache per `slug@rev:boardId` dengan rev yang
   * benar-benar dirender daemon (respons `/docs/open`), bukan rev dari pemanggil (`seenRev` hanya petunjuk).
   * `seenRev` = rev terakhir board ini berubah: PNG yang dirender pada rev ≥ `seenRev` masih benar dan dipakai ulang,
   * jadi saat rev dokumen naik hanya board tersentuh yang dirender ulang.
   */
  screenshot(slug: string, seenRev: number, boardId: string): Promise<Screenshot> {
    const latest = this.#latest.get(`${slug}:${boardId}`);
    if (latest && latest.rev >= seenRev) return latest.shot;
    const pendingKey = `${slug}@${seenRev}:${boardId}`;
    let pending = this.#pending.get(pendingKey);
    if (!pending) {
      pending = this.#withDoc(
        slug,
        (s, rev) => {
          const key = `${slug}@${rev}:${boardId}`;
          let hit = this.#shots.get(key);
          if (!hit) {
            hit = request<{ boardId: string; width: number; height: number; mimeType: string; png: string }>('POST', '/screenshot', { boardId }, s).then((d) => ({
              boardId: d.boardId,
              width: d.width,
              height: d.height,
              url: pngUrl(d.png),
            }));
            const latestKey = `${slug}:${boardId}`;
            const entry = { rev, shot: hit };
            hit.catch(() => {
              this.#shots.delete(key);
              if (this.#latest.get(latestKey) === entry) this.#latest.delete(latestKey);
            });
            this.#shots.set(key, hit);
            const prev = this.#latest.get(latestKey);
            if (!prev || prev.rev <= rev) this.#latest.set(latestKey, entry);
          }
          return hit;
        },
        seenRev,
      );
      const done = () => this.#pending.delete(pendingKey);
      pending.then(done, done);
      this.#pending.set(pendingKey, pending);
    }
    return pending;
  }

  inspect(slug: string, id: string, depth = 0): Promise<InspectResult> {
    return this.#withDoc(slug, (s) => request<InspectResult>('POST', '/inspect', { id, depth }, s));
  }

  layoutCheck(slug: string): Promise<LayoutCheck> {
    return this.#withDoc(slug, async (s) => ({ ...(await request<Omit<LayoutCheck, 'ranAt'>>('POST', '/layout-check', {}, s)), ranAt: Date.now() }));
  }
}

const docGone = (slug: string) => new ApiError('NOT_FOUND', `dokumen ${slug} tidak ada`, 'pilih dokumen dari Dashboard', 404);

function pngUrl(base64: string): string {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
}

export const api = new ViewerClient();

export function errorText(e: unknown): string {
  if (e instanceof OfflineError) return "Can't reach lakard";
  if (e instanceof ApiError) return e.hint ? `${e.message} (${e.hint})` : e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
