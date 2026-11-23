// Dokumen yang difokuskan viewer (spec-agent-open-doc). Setiap jendela viewer melaporkan dokumen yang sedang tampil
// lewat `PUT /viewer/focus {slug|null}` (null = jendela kembali ke Dashboard atau ditutup); daemon menyimpannya hanya
// di memori per origin jendela (header `x-lakar-origin`), tidak ke dokumen, riwayat, atau rev. `open_doc` tanpa slug
// memakai fokus terakhir; `list_documents` menandai dokumen yang terbuka dan yang difokuskan. Pola sama dengan
// `SelectionStore` (AD-9): urutan Map = urutan perubahan, jadi `current()` tidak bergantung pada resolusi jam.
// Route di bawah `/viewer/*` sehingga kena guard Origin di server.ts. Tanpa sesi.
import type { FastifyInstance } from 'fastify';
import { LakarError, SLUG_PATTERN } from '@lakar/schema';
import { z } from 'zod';
import { originOf, type DocChange } from './events.js';
import type { DocStore } from './store.js';

/** Kunci jendela tanpa header origin (CLI, tes): tetap satu entri, tidak bentrok dengan origin sah (pola `[A-Za-z0-9_-]`). */
const NO_ORIGIN = '#';

/** Fokus per jendela, hanya di memori. Entri yang terakhir berubah = fokus terkini. */
export class FocusStore {
  readonly #byOrigin = new Map<string, string>();
  #lastOrigin: string | undefined;

  /**
   * Laporan jendela `origin`: `slug` = dokumen yang tampil, `null` = tidak ada (entri jendela itu dihapus; jendela lain
   * tetap). Laporan dengan slug yang sama tetap memindah entri ke akhir: jendela yang baru difokuskan menang.
   */
  set(origin: string | undefined, slug: string | null): void {
    const key = origin ?? NO_ORIGIN;
    this.#byOrigin.delete(key);
    if (slug !== null) this.#byOrigin.set(key, slug);
    if (origin !== undefined) this.#lastOrigin = origin;
  }

  /** Dokumen yang terakhir difokuskan di jendela mana pun. */
  current(): string | undefined {
    let last: string | undefined;
    for (const slug of this.#byOrigin.values()) last = slug;
    return last;
  }

  /** Dokumen `slug` sedang tampil di salah satu jendela. */
  isOpen(slug: string): boolean {
    for (const s of this.#byOrigin.values()) if (s === slug) return true;
    return false;
  }

  /** Jendela yang terakhir melapor (termasuk laporan `null`): tujuan permintaan "buka tab". */
  lastOrigin(): string | undefined {
    return this.#lastOrigin;
  }

  /** Jendela `origin` hilang (stream-nya tertutup): entri dan status jendela terakhirnya dibuang. */
  drop(origin: string): void {
    this.#byOrigin.delete(origin);
    if (this.#lastOrigin === origin) this.#lastOrigin = undefined;
  }

  get size(): number {
    return this.#byOrigin.size;
  }

  /** Perubahan file dari aplikasi: rename → slug baru; archive/delete dokumen aktif → entri dibuang. */
  onFileChange(c: DocChange): void {
    if (c.kind === 'rename' && c.from && c.slug) {
      for (const [k, s] of this.#byOrigin) if (s === c.from) this.#byOrigin.set(k, c.slug);
    }
    if ((c.kind === 'archive' || c.kind === 'delete') && c.slug && !c.archived) {
      for (const [k, s] of [...this.#byOrigin]) if (s === c.slug) this.#byOrigin.delete(k);
    }
  }
}

const PutBody = z.object({ slug: z.string().nullable() }).strict();
const PUT_HINT = 'kirim {slug} (dokumen yang tampil di jendela ini) atau {slug:null} (Dashboard)';

export type FocusRoutesOptions = {
  docs: ReadonlyMap<string, unknown>;
  store: DocStore;
  focus: FocusStore;
};

export function registerFocusRoutes(app: FastifyInstance, { docs, store, focus }: FocusRoutesOptions): void {
  app.put('/viewer/focus', async (req, reply) => {
    const parsed = PutBody.safeParse(req.body);
    if (!parsed.success) {
      throw new LakarError('SCHEMA_INVALID', parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: PUT_HINT });
    }
    const { slug } = parsed.data;
    if (slug !== null) {
      if (!SLUG_PATTERN.test(slug)) {
        throw new LakarError('SCHEMA_INVALID', `slug tidak valid: ${JSON.stringify(slug)}`, {
          hint: `slug harus cocok pola ${SLUG_PATTERN.source} (huruf kecil, angka, tanda hubung; maks 64)`,
        });
      }
      if (!docs.has(slug) && !(await store.exists(slug))) throw new LakarError('NOT_FOUND', `dokumen ${slug} tidak ada`, { hint: 'pakai slug dari GET /viewer/docs' });
    }
    focus.set(originOf(req.headers), slug);
    return reply.code(200).send({ ok: true, data: { slug, focused: focus.current() ?? null } });
  });
}
