// Seleksi efemeral (AD-9, epic agen-di-canvas story 2). Viewer mengirim seleksi canvas lewat
// `PUT /viewer/docs/:slug/selection`; daemon menyimpannya hanya di memori per dokumen (tidak ke file, riwayat, atau
// rev) dan menyiarkan perubahan sebagai event `selection` di `/viewer/events`. Agen membacanya lewat tool MCP
// `get_selection` → `POST /viewer/selection` (sesi): alamat + ringkasan node (tipe, nama, board, bounds terukur).
// Route di bawah `/viewer/*` sehingga kena guard Origin di server.ts. Route lama tidak berubah (AD-4).
import type { FastifyInstance } from 'fastify';
import { glyphScan } from '@lakar/check';
import type { RenderPort } from '@lakar/ports';
import {
  LakarError,
  NODE_ADDRESS_PATTERN,
  SELECTION_MAX,
  SESSION_HEADER,
  SLUG_PATTERN,
  errorMessage,
  findBoard,
  resolveDocument,
  type LakarDocument,
  type ResolvedDocument,
} from '@lakar/schema';
import { z } from 'zod';
import { originOf, type ActivityBus, type DocChange } from './events.js';
import { boundsMap, locateNode, type BoundsTuple } from './inspect.js';
import type { FocusStore } from './focus.js';
import type { Sessions } from './sessions.js';
import type { DocStore } from './store.js';
import { peekDocument } from './viewer.js';

export type SelectionEntry = { addresses: string[]; origin?: string; updatedAt: string };

/** Alamat unik dengan urutan kemunculan pertama dipertahankan. */
export const dedupeAddresses = (addresses: readonly string[]): string[] => [...new Set(addresses)];

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Seleksi terakhir per slug, hanya di memori. Seleksi kosong = entri dihapus. Urutan Map = urutan perubahan
 * (entri yang berubah dipindah ke akhir), jadi `latest()` tidak bergantung pada resolusi jam.
 */
export class SelectionStore {
  readonly #bySlug = new Map<string, SelectionEntry>();
  readonly #now: () => number;
  constructor(now: () => number = Date.now) {
    this.#now = now;
  }
  /**
   * Simpan seleksi; `changed` = isi berbeda dari sebelumnya (event hanya untuk perubahan). Isi sama → entri lama
   * tetap (waktu dan pemilik tidak berubah). Kosong dari jendela lain (origin berbeda dengan pemilik seleksi) tidak
   * menghapus seleksi jendela pemilik: jendela yang ditutup tidak menyapu seleksi jendela lain yang masih tampil.
   */
  set(slug: string, addresses: readonly string[], origin?: string): { entry: SelectionEntry; changed: boolean } {
    const list = dedupeAddresses(addresses);
    const prev = this.#bySlug.get(slug);
    if (prev && sameList(prev.addresses, list)) return { entry: prev, changed: false };
    if (prev && !list.length && origin && prev.origin && prev.origin !== origin) return { entry: prev, changed: false };
    if (!prev && !list.length) return { entry: { addresses: [], updatedAt: new Date(this.#now()).toISOString() }, changed: false };
    const entry: SelectionEntry = { addresses: list, ...(origin ? { origin } : {}), updatedAt: new Date(this.#now()).toISOString() };
    this.#bySlug.delete(slug);
    if (list.length) this.#bySlug.set(slug, entry);
    return { entry, changed: true };
  }
  get(slug: string): SelectionEntry | undefined {
    return this.#bySlug.get(slug);
  }
  clear(slug: string): void {
    this.#bySlug.delete(slug);
  }
  /** Slug dengan seleksi yang paling akhir berubah. */
  latest(): string | undefined {
    let last: string | undefined;
    for (const slug of this.#bySlug.keys()) last = slug;
    return last;
  }
  get size(): number {
    return this.#bySlug.size;
  }
  /**
   * Perubahan file dari aplikasi: seleksi slug yang di-rename (slug lama), diarsipkan, atau dihapus dibuang.
   * `delete` dengan `archived: true` = salinan di arsip yang dihapus; dokumen aktif ber-slug sama tidak tersentuh.
   */
  onFileChange(c: DocChange): void {
    if (c.kind === 'rename' && c.from) this.clear(c.from);
    if ((c.kind === 'archive' || c.kind === 'delete') && c.slug && !c.archived) this.clear(c.slug);
  }
}

export type SelectedNode = { address: string; id: string; type: string; name: string; boardId: string; bounds?: BoundsTuple };
export type Unmeasured = { boardId: string; code: string; message: string };
export type SelectionSummary = { nodes: SelectedNode[]; missing: string[] };

type AnyNode = { id: string; name: string; type?: string; children?: readonly AnyNode[] };

/**
 * Ringkasan murni: alamat yang ditemukan di dokumen tersimpan → node (tipe, nama, board, bounds dari `measured`
 * per board bila ada); sisanya (node terhapus, alamat komposit yang belum bisa diurai) → `missing`.
 */
export function summarizeSelection(
  doc: { pages: readonly { id: string; name: string; children: readonly AnyNode[] }[] },
  addresses: readonly string[],
  measured: ReadonlyMap<string, ReadonlyMap<string, BoundsTuple>> = new Map(),
): SelectionSummary {
  const nodes: SelectedNode[] = [];
  const missing: string[] = [];
  for (const address of addresses) {
    const hit = address.includes('/') ? undefined : locateNode(doc, address);
    if (!hit) {
      missing.push(address);
      continue;
    }
    const bounds = measured.get(hit.board.id)?.get(hit.node.id);
    const type = (hit.node as AnyNode).type;
    nodes.push({ address, id: hit.node.id, type: typeof type === 'string' ? type : 'board', name: hit.node.name, boardId: hit.board.id, ...(bounds ? { bounds } : {}) });
  }
  return { nodes, missing };
}

const PutBody = z
  .object({
    addresses: z
      .array(z.string().regex(NODE_ADDRESS_PATTERN, 'alamat node harus ID 8 karakter [A-Za-z0-9] atau alamat komposit id/id'))
      .max(SELECTION_MAX, `maks ${SELECTION_MAX} alamat`),
  })
  .strict();
const PUT_HINT = `kirim {addresses:[id, …]} (0–${SELECTION_MAX} alamat; [] mengosongkan seleksi)`;
const ReadBody = z.object({ slug: z.string().optional() }).strict().optional();
const READ_HINT = 'kirim {slug?} (kosong = dokumen aktif sesi, dokumen yang terbuka di viewer, atau dokumen dengan seleksi terakhir)';

export type SelectionRoutesOptions = {
  docs: Map<string, LakarDocument>;
  store: DocStore;
  sessions: Sessions;
  selections: SelectionStore;
  /** Dokumen yang difokuskan viewer: fallback sebelum seleksi terakhir untuk sesi tanpa dokumen aktif. */
  focus?: FocusStore;
  activity?: ActivityBus;
  render: RenderPort<ResolvedDocument>;
  /** Ikon board yang tidak dikenal katalog → ICON_UNKNOWN (seperti inspect) sebelum render. */
  assertIcons: (board: ResolvedDocument['pages'][number]['children'][number]) => void;
  /** Room `@lakar/sync` yang digabung: slug room membaca replika. */
  rooms?: { doc(slug: string): LakarDocument | undefined };
};

const zodMessage = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');

export function registerSelectionRoutes(app: FastifyInstance, { docs, store, sessions, selections, focus, activity, render, assertIcons, rooms }: SelectionRoutesOptions): void {
  const checkSlug = (slug: string) => {
    if (!SLUG_PATTERN.test(slug)) {
      throw new LakarError('SCHEMA_INVALID', `slug tidak valid: ${JSON.stringify(slug)}`, {
        hint: `slug harus cocok pola ${SLUG_PATTERN.source} (huruf kecil, angka, tanda hubung; maks 64)`,
      });
    }
  };
  /**
   * Dokumen terkini: salinan memori daemon, atau dari disk bila belum dimuat. `peekDocument` tanpa efek samping
   * (tanpa kunci, jadi tidak boleh menulis balik migrasi/riwayat seperti `DocStore.read`) dan tanpa di-cache.
   */
  const loadDoc = async (slug: string): Promise<LakarDocument> => {
    const doc = docs.get(slug) ?? rooms?.doc(slug) ?? (await peekDocument(store, slug));
    if (!doc) throw new LakarError('NOT_FOUND', `dokumen ${slug} tidak ada`, { hint: 'pakai slug dari GET /viewer/docs' });
    return doc;
  };

  app.put<{ Params: { slug: string } }>('/viewer/docs/:slug/selection', async (req, reply) => {
    const { slug } = req.params;
    checkSlug(slug);
    const parsed = PutBody.safeParse(req.body);
    if (!parsed.success) throw new LakarError('SCHEMA_INVALID', zodMessage(parsed.error), { hint: PUT_HINT });
    const doc = await loadDoc(slug);
    const origin = originOf(req.headers);
    const { entry, changed } = selections.set(slug, parsed.data.addresses, origin);
    if (changed) activity?.selection({ slug, addresses: entry.addresses, rev: doc.rev, ...(origin ? { origin } : {}) });
    return reply.code(200).send({ ok: true, data: { slug, rev: doc.rev, addresses: entry.addresses } });
  });

  app.get<{ Params: { slug: string } }>('/viewer/docs/:slug/selection', async (req, reply) => {
    const { slug } = req.params;
    checkSlug(slug);
    const doc = await loadDoc(slug);
    const e = selections.get(slug);
    return reply.code(200).send({ ok: true, data: { slug, rev: doc.rev, addresses: e?.addresses ?? [], ...(e ? { updatedAt: e.updatedAt } : {}) } });
  });

  // Tool MCP get_selection (sesi).
  app.post('/viewer/selection', async (req, reply) => {
    const session = sessions.require(req.headers[SESSION_HEADER]);
    const parsed = ReadBody.safeParse(req.body ?? undefined);
    if (!parsed.success) throw new LakarError('SCHEMA_INVALID', zodMessage(parsed.error), { hint: READ_HINT });
    const slug = parsed.data?.slug ?? session.activeSlug ?? focus?.current() ?? selections.latest();
    if (!slug) {
      throw new LakarError('NO_ACTIVE_DOC', 'sesi ini belum punya dokumen aktif, tidak ada dokumen terbuka di viewer, dan belum ada seleksi', {
        hint: 'minta pengguna membuka dokumen atau memilih node di aplikasi Lakar, atau panggil open_doc {} lalu get_selection lagi',
      });
    }
    checkSlug(slug);
    const stored = await loadDoc(slug);
    const e = selections.get(slug);
    const addresses = e?.addresses ?? [];
    const first = summarizeSelection(stored, addresses);
    const measured = new Map<string, Map<string, BoundsTuple>>();
    const unmeasured: Unmeasured[] = [];
    if (first.nodes.length) {
      const resolved = resolveDocument(stored);
      for (const boardId of new Set(first.nodes.map((n) => n.boardId))) {
        const board = findBoard(resolved, boardId);
        if (!board) continue;
        try {
          assertIcons(board);
          const m = await render.measure(resolved, boardId, { allowGlyphs: glyphScan(board).allowGlyphs });
          measured.set(boardId, boundsMap(boardId, m));
        } catch (err) {
          const code = err instanceof LakarError ? err.code : 'EXEC_ERROR';
          unmeasured.push({ boardId, code, message: errorMessage(err) });
        }
      }
    }
    const { nodes, missing } = summarizeSelection(stored, addresses, measured);
    return reply.code(200).send({
      ok: true,
      data: {
        slug,
        rev: stored.rev,
        addresses,
        nodes,
        ...(missing.length ? { missing } : {}),
        ...(unmeasured.length ? { unmeasured } : {}),
        ...(e ? { updatedAt: e.updatedAt } : {}),
      },
    });
  });
}
