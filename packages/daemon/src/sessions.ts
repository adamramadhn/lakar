// Sesi (AD-17): POST /sessions → sessionId, dikirim di header X-Lakar-Session.
// Per sesi daemon menyimpan `keep` snippet, snippet gagal (editId, LRU), dan log panggilan execute.
import { randomBytes, randomUUID } from 'node:crypto';
import { LakarError, type ErrorCode, type FindingSummary } from '@lakar/schema';

export const SESSION_HEADER = 'x-lakar-session';
/** Jumlah snippet gagal yang diingat per sesi (LRU). */
export const FAILED_MAX = 20;
/** Jumlah entri log execute per sesi. */
export const SESSION_LOG_MAX = 200;

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
  /** `keep` snippet; diganti hanya oleh execute sukses. */
  keep: Record<string, unknown>;
  /** editId → snippet gagal (urutan sisip = urutan LRU). */
  failed: Map<string, FailedSnippet>;
  log: ExecuteLogEntry[];
};

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** editId 8 karakter acak [A-Za-z0-9]. */
export function newEditId(): string {
  const bytes = randomBytes(8);
  let s = '';
  for (const b of bytes) s += ALNUM[b % ALNUM.length];
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
  session.log.push(entry);
  if (session.log.length > SESSION_LOG_MAX) session.log.splice(0, session.log.length - SESSION_LOG_MAX);
}

export class Sessions {
  readonly #map = new Map<string, Session>();
  create(): Session {
    const s: Session = { id: randomUUID(), createdAt: new Date().toISOString(), keep: {}, failed: new Map(), log: [] };
    this.#map.set(s.id, s);
    return s;
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
    return s;
  }
}
