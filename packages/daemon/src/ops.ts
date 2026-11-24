// Route ops viewer (AD-7, AD-8): `POST /viewer/docs/:slug/ops` menjalankan daftar op JSON (`DocOp`) sebagai satu
// transaksi core di bawah kunci dokumen. Semua-atau-tidak: op gagal → rollback, error op pertama dikembalikan.
// Sukses → satu rev + satu entri riwayat (sesi dan klien `lakar-viewer`) + snapshot lewat `store.commit`, lalu event
// `change` jenis `edit` (seperti execute sesi viewer). Respons membawa `inverse`: op yang, dikirim ke route ini,
// membatalkan commit tersebut (undo/redo viewer tanpa restore rev). Tanpa render/check; ikon board tersentuh dicek
// katalog seperti `/execute`. Route lama dan sandbox execute tidak berubah.
import type { FastifyInstance } from 'fastify';
import { touchedBoards } from '@lakar/check';
import { applyOps, transact, type DocumentLocks } from '@lakar/core';
import { iconRefs } from '@lakar/render';
import { LakarError, OPS_MAX, SLUG_PATTERN, findBoard, resolveDocument, type DocOp, type LakarDocument } from '@lakar/schema';
import { z } from 'zod';
import { VIEWER_CLIENT, originOf, type ActivityBus } from './events.js';
import type { RoomRegistry } from './rooms.js';
import type { DocStore } from './store.js';

/** Deskripsi riwayat bila klien tidak mengirim `description`. */
export const OPS_DEFAULT_DESCRIPTION = 'Edited in app';
export const OPS_DESCRIPTION_MAX = 200;

const OpsBody = z
  .object({
    ops: z.array(z.unknown()).min(1, 'ops tidak boleh kosong').max(OPS_MAX, `ops maks ${OPS_MAX} per permintaan`),
    description: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().min(1, 'description tidak boleh kosong').max(OPS_DESCRIPTION_MAX, `description maks ${OPS_DESCRIPTION_MAX} karakter`))
      .optional(),
  })
  .strict();
const OPS_BODY_HINT = `kirim {ops:[{op:"update", id, patch}, …] (1–${OPS_MAX}), description?} (description 1–${OPS_DESCRIPTION_MAX} karakter)`;

export type OpsRoutesOptions = {
  /** Salinan memori daemon (AD-1); diperbarui setiap commit. */
  docs: Map<string, LakarDocument>;
  store: DocStore;
  docLocks: DocumentLocks;
  /** Bus aktivitas: commit dipancarkan sebagai `change` `edit` supaya jendela viewer lain memuat ulang. */
  activity?: ActivityBus;
  /** Katalog ikon: nama ikon di board tersentuh harus dikenal (ICON_UNKNOWN), seperti `/execute`. */
  icons: { canonical(lib: string, icon: string): unknown };
  /** Room `@lakar/sync` yang digabung: ops di slug room divalidasi lalu di-commit lewat klien room. */
  rooms?: RoomRegistry;
};

export function registerOpsRoutes(app: FastifyInstance, { docs, store, docLocks, activity, icons, rooms }: OpsRoutesOptions): void {
  app.post<{ Params: { slug: string } }>('/viewer/docs/:slug/ops', async (req, reply) => {
    const { slug } = req.params;
    if (!SLUG_PATTERN.test(slug)) {
      throw new LakarError('SCHEMA_INVALID', `slug tidak valid: ${JSON.stringify(slug)}`, {
        hint: `slug harus cocok pola ${SLUG_PATTERN.source} (huruf kecil, angka, tanda hubung; maks 64)`,
      });
    }
    const parsed = OpsBody.safeParse(req.body);
    if (!parsed.success) {
      throw new LakarError('SCHEMA_INVALID', parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: OPS_BODY_HINT });
    }
    const { ops, description = OPS_DEFAULT_DESCRIPTION } = parsed.data;
    // Slug room: validasi ops pada replika (rollback tidak mengirim apa pun), gerbang ikon, lalu commit ke
    // sequencer room. Event `change` edit dipancarkan RoomRegistry lewat hook `onDoc` saat ack diterapkan
    // ke replika — jangan emit ganda di sini (rev dan board tersentuh sama-sama sudah dicakup di sana).
    const room = rooms?.get(slug);
    if (room) {
      const base = room.client.doc();
      const preview = await transact(base, { sessionId: VIEWER_CLIENT, description }, (tx) => applyOps(tx, ops));
      const after = resolveDocument(preview.doc);
      const boards = touchedBoards(resolveDocument(base), after);
      for (const id of boards) for (const r of iconRefs(findBoard(after, id)!)) icons.canonical(r.lib, r.icon);
      const r = await room.client.commitOps(ops as DocOp[], description);
      return reply.code(200).send({ ok: true, data: { slug, rev: r.doc.rev, created: r.created, inverse: r.inverse, refs: r.refs } });
    }
    const data = await docLocks.run(slug, async () => {
      // Dokumen belum dimuat (belum dibuka siapa pun): muat dari disk seperti open_doc.
      const current = docs.get(slug) ?? (await store.read(slug));
      if (!current) throw new LakarError('NOT_FOUND', `dokumen ${slug} tidak ada`, { hint: 'pakai slug dari GET /viewer/docs' });
      const committed = await transact(current, { sessionId: VIEWER_CLIENT, description }, (tx) => applyOps(tx, ops));
      // Setiap op sukses dihitung, jadi daftar ops yang tidak kosong selalu menghasilkan entri.
      const entry = committed.entry!;
      const after = resolveDocument(committed.doc);
      const boards = touchedBoards(resolveDocument(current), after);
      for (const id of boards) for (const r of iconRefs(findBoard(after, id)!)) icons.canonical(r.lib, r.icon);
      await store.commit(slug, committed.doc, { ...entry, client: VIEWER_CLIENT });
      docs.set(slug, committed.doc);
      return { slug, rev: committed.doc.rev, created: committed.created, inverse: committed.inverse, refs: committed.value.refs, boards };
    });
    const { boards, ...out } = data;
    const origin = originOf(req.headers);
    activity?.change({ kind: 'edit', slug, rev: out.rev, boards, ...(origin ? { origin } : {}) });
    return reply.code(200).send({ ok: true, data: out });
  });
}
