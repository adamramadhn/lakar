// Sesi (AD-17): POST /sessions → sessionId, dikirim di header X-Lakar-Session.
import { randomUUID } from 'node:crypto';
import { LakarError } from '@lakar/schema';

export const SESSION_HEADER = 'x-lakar-session';

/** Sesi tidak ada/tidak dikenal. Ditandai struktural agar HTTP 401 tidak bergantung pada teks pesan. */
export class UnknownSessionError extends LakarError {}

export type Session = { id: string; activeSlug?: string; createdAt: string };

export class Sessions {
  readonly #map = new Map<string, Session>();
  create(): Session {
    const s: Session = { id: randomUUID(), createdAt: new Date().toISOString() };
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
