// Sesi (AD-17): POST /sessions → sessionId, dikirim di header X-Lakar-Session.
// Per sesi daemon menyimpan `keep` snippet, snippet gagal (editId, LRU), dan log panggilan execute.
import { randomBytes, randomUUID } from 'node:crypto';
import { LakarError, type ErrorCode, type FindingSummary } from '@lakar/schema';

/** Jumlah snippet gagal yang diingat per sesi (LRU). */
const FAILED_MAX = 20;
/** Jumlah entri log execute per sesi. */
const SESSION_LOG_MAX = 200;

/**
 * Hint NO_ACTIVE_DOC untuk semua tool berdokumen (spec-agent-open-doc). Sesudah daemon restart klien MCP mendapat sesi
 * baru tanpa pin: lanjutkan lewat slug dari `target` sebelumnya, bukan `open_doc {}` yang bisa mendarat di dokumen lain.
 */
export const NO_ACTIVE_DOC_HINT =
  'untuk melanjutkan dokumen yang sama (mis. sesudah daemon restart) panggil open_doc {slug} dengan slug dari target respons sebelumnya; selain itu open_doc {} untuk dokumen yang terbuka di aplikasi Lakar';

/** Sesi tidak ada/tidak dikenal. Ditandai struktural agar HTTP 401 tidak bergantung pada teks pesan. */
export class UnknownSessionError extends LakarError {}

export type FailedSnippet = { code: string; description?: string };
export type ExecuteLogEntry = {
  at: string;
  description: string;
  ok: boolean;
  code?: ErrorCode;
  rev: number;
  /** Durasi render + check board tersentuh (ms); tidak ada bila tidak ada check. */
  checkMs?: number;
  /** Ringkasan temuan check execute ini. */
  summary?: FindingSummary;
};

export type Session = {
  id: string;
  activeSlug?: string;
  createdAt: string;
  /** Aktivitas terakhir (permintaan bersesi apa pun). */
  lastAt?: string;
  /** Jumlah panggilan execute (sukses + gagal), tidak terpotong seperti `log`. */
  executes: number;
  /** Klien yang membuat sesi (mis. `lakar-mcp`), bila dikirim. */
  client?: string;
  /** `keep` snippet; diganti hanya oleh execute sukses. */
  keep: Record<string, unknown>;
  /** editId → snippet gagal (urutan sisip = urutan LRU). */
  failed: Map<string, FailedSnippet>;
  log: ExecuteLogEntry[];
};

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Byte di atas batas ini dibuang (rejection sampling): 248 = 4 × 62, jadi setiap karakter sama peluangnya. */
const UNBIASED_LIMIT = 256 - (256 % ALNUM.length);

/** editId 8 karakter acak [A-Za-z0-9], tanpa bias modulo. */
function newEditId(): string {
  let s = '';
  while (s.length < 8) {
    for (const b of randomBytes(8)) {
      if (b < UNBIASED_LIMIT && s.length < 8) s += ALNUM[b % ALNUM.length];
    }
  }
  return s;
}

/** Simpan snippet gagal; kembalikan editId baru. Entri tertua dibuang di atas `FAILED_MAX`. */
export function rememberFailed(session: Session, snippet: FailedSnippet): string {
  let id = newEditId();
  while (session.failed.has(id)) id = newEditId();
  session.failed.set(id, snippet);
  while (session.failed.size > FAILED_MAX) session.failed.delete(session.failed.keys().next().value!);
  return id;
}

/** Ambil snippet gagal dan tandai baru dipakai (LRU). */
export function recallFailed(session: Session, editId: string): FailedSnippet | undefined {
  const hit = session.failed.get(editId);
  if (hit) {
    session.failed.delete(editId);
    session.failed.set(editId, hit);
  }
  return hit;
}

export function logExecute(session: Session, entry: ExecuteLogEntry): void {
  session.executes++;
  session.log.push(entry);
  if (session.log.length > SESSION_LOG_MAX) session.log.splice(0, session.log.length - SESSION_LOG_MAX);
}

export class Sessions {
  readonly #map = new Map<string, Session>();
  create(client?: string): Session {
    const s: Session = { id: randomUUID(), createdAt: new Date().toISOString(), executes: 0, keep: {}, failed: new Map(), log: [], ...(client ? { client } : {}) };
    this.#map.set(s.id, s);
    return s;
  }
  get count(): number {
    return this.#map.size;
  }
  /** Sesi urut aktivitas terbaru (`lastAt` atau `createdAt`), maks `limit`. */
  recent(limit: number): Session[] {
    const at = (s: Session) => s.lastAt ?? s.createdAt;
    return [...this.#map.values()].sort((a, b) => (at(a) < at(b) ? 1 : at(a) > at(b) ? -1 : 0)).slice(0, limit);
  }
  /** Semua sesi (urutan pembuatan), tanpa efek samping. */
  all(): Session[] {
    return [...this.#map.values()];
  }
  /**
   * Alihkan `activeSlug` setiap sesi yang menunjuk `from` ke `to` (rename), atau kosongkan bila `to`
   * undefined (archive/delete: agen lalu mendapat NO_ACTIVE_DOC). Mengembalikan jumlah sesi yang diubah.
   */
  retarget(from: string, to: string | undefined): number {
    let n = 0;
    for (const s of this.#map.values()) {
      if (s.activeSlug !== from) continue;
      if (to === undefined) delete s.activeSlug;
      else s.activeSlug = to;
      n++;
    }
    return n;
  }
  /** Sesi dengan id penuh, tanpa efek samping. */
  byId(id: string): Session | undefined {
    return this.#map.get(id);
  }
  /** Sesi dari header tanpa efek samping (tidak mengubah `lastAt`, tidak melempar). */
  peek(header: string | string[] | undefined): Session | undefined {
    const id = Array.isArray(header) ? header[0] : header;
    return id ? this.#map.get(id) : undefined;
  }
  /** Sesi dari header; tidak ada/tidak dikenal → NOT_FOUND (HTTP 401) agar klien membuat sesi baru. */
  require(header: string | string[] | undefined): Session {
    const id = Array.isArray(header) ? header[0] : header;
    const s = id ? this.#map.get(id) : undefined;
    if (!s) {
      throw new UnknownSessionError('NOT_FOUND', id ? `sesi ${id} tidak dikenal (daemon mungkin di-restart)` : 'header X-Lakar-Session tidak ada', {
        hint: 'buat sesi baru dengan POST /sessions lalu panggil open_doc lagi',
      });
    }
    s.lastAt = new Date().toISOString();
    return s;
  }
}
