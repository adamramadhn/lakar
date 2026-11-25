// Undo/redo agen (spec-agent-undo): tool MCP `undo`/`redo` membatalkan atau mengulang langkah sesi agen itu sendiri,
// tidak pernah langkah pengguna atau sesi lain. Satu langkah = satu commit execute/paste sesi. Mekanisme: op invers
// commit (AD-8, `CommitResult.inverse`) disimpan per sesi per dokumen, lalu dijalankan sebagai commit baru lewat
// transaksi core, seperti undo viewer. Gerbang basi sederhana: rev dokumen harus sama dengan rev terakhir yang ditulis
// sesi ini (`head`); ada rev lain sesudahnya (pengguna, agen lain, restore) → ditolak, agen memperbaiki maju lewat
// execute. Tumpukan hanya di memori (seperti sesi): hilang saat daemon restart.
//
// Route baru (AD-4, di bawah `/viewer/*`): `POST /viewer/undo` dan `POST /viewer/redo` dengan header sesi, body
// `{steps?}`. Event Activity (`undo`/`redo`) dipancarkan hook `TOOL_ROUTES`, jadi viewer memuat ulang seperti execute.
import type { FastifyInstance } from 'fastify';
import { touchedBoards } from '@lakar/check';
import { applyOps, transact, type DocumentLocks } from '@lakar/core';
import { iconRefs } from '@lakar/render';
import { LakarError, SESSION_HEADER, findBoard, resolveDocument, type DocOp, type HistoryEntry, type LakarDocument } from '@lakar/schema';
import { z } from 'zod';
import { VIEWER_CLIENT, agentOf } from './events.js';
import { roomCall, type RoomRegistry } from './rooms.js';
import { NO_ACTIVE_DOC_HINT, authorOf, noteWrite, type Session, type Sessions } from './sessions.js';
import type { DocStore } from './store.js';

/** Jumlah langkah yang diingat per sesi per dokumen (langkah tertua dibuang). */
export const AGENT_UNDO_MAX = 50;

export type UndoDir = 'undo' | 'redo';
/** Jenis tulis agen untuk `onAgentWrite`: langkah baru (execute, paste, kelak fix_check) atau commit undo/redo. */
export type AgentWriteKind = 'step' | UndoDir;

/** Satu langkah di tumpukan: op yang dijalankan saat langkah ini diambil, dan label riwayat langkah asal. */
type Step = { ops: DocOp[]; description: string };
/** Tumpukan satu sesi pada satu dokumen. `head` = rev terakhir yang ditulis sesi ini pada dokumen itu. */
type DocSteps = { head: number; undo: Step[]; redo: Step[] };

/**
 * Tumpukan undo/redo agen per sesi (WeakMap: ikut umur objek sesi) per id dokumen (tahan rename slug). Invarian:
 * setiap tumpukan membentuk rantai rev bersambung yang berujung di `head`, jadi undo hanya perlu memeriksa
 * `doc.rev === head`.
 */
export class AgentSteps {
  readonly #by = new WeakMap<Session, Map<string, DocSteps>>();

  /** Tumpukan sesi pada dokumen `docId`, bila ada. */
  of(session: Session, docId: string): DocSteps | undefined {
    return this.#by.get(session)?.get(docId);
  }

  /**
   * Hook tulis agen tunggal (spec-agent-visual-diff X1). Setiap commit atas nama sesi agen memanggil ini: execute,
   * paste agen, undo/redo agen, dan kelak `fix_check` (#33). Dua pelacak dijaga sinkron di satu tempat:
   * - dasar `visual_diff` (`session.bases`): `baseRev` = rev sebelum tulis ini, untuk semua jenis;
   * - tumpukan undo: hanya `kind:'step'` (route undo/redo mengelola tumpukannya sendiri per commit).
   * `inverse` = op invers commit (kosong untuk undo/redo), `label` = label riwayat langkah.
   */
  onAgentWrite(session: Session, docId: string, baseRev: number, rev: number, inverse: DocOp[], label: string, kind: AgentWriteKind = 'step'): void {
    noteWrite(session, docId, baseRev);
    if (kind === 'step') this.#record(session, docId, baseRev, rev, inverse, label);
  }

  /** Buang tumpukan sesi pada dokumen `docId` (rantai tidak bisa dipulihkan lagi). */
  drop(session: Session, docId: string): void {
    this.#by.get(session)?.delete(docId);
  }

  /**
   * Catat commit langkah baru sesi dari `baseRev` ke `rev`. Redo selalu dikosongkan. Ada rev lain di antara langkah
   * sebelumnya dan langkah ini (`baseRev !== head`) → rantai putus: tumpukan lama dibuang seluruhnya (langkah lama tidak
   * bisa di-undo tanpa ikut membatalkan perubahan orang lain). Invers kosong (commit tanpa efek) tidak menjadi
   * langkah, tetapi `head` tetap maju.
   */
  #record(session: Session, docId: string, baseRev: number, rev: number, inverse: DocOp[], description: string): void {
    let perDoc = this.#by.get(session);
    if (!perDoc) this.#by.set(session, (perDoc = new Map()));
    const prev = perDoc.get(docId);
    if (prev && prev.head !== baseRev) perDoc.delete(docId);
    const undo = perDoc.get(docId)?.undo ?? [];
    if (inverse.length) undo.push({ ops: inverse, description });
    if (undo.length > AGENT_UNDO_MAX) undo.splice(0, undo.length - AGENT_UNDO_MAX);
    perDoc.set(docId, { head: rev, undo, redo: [] });
  }
}

export const StepsBody = z.object({ steps: z.number().int().min(1).max(AGENT_UNDO_MAX).optional() }).strict().optional();
export const BODY_HINT = `kirim {steps?} (bilangan bulat 1–${AGENT_UNDO_MAX}, default 1)`;

export const FIX_FORWARD = 'inspect/list_boards untuk melihat keadaan kini, lalu perbaiki maju lewat execute';

/** Siapa yang menulis rev pertama sesudah `head` (untuk pesan penolakan); riwayat tak terbaca → generik. */
export async function laterAuthor(store: DocStore, slug: string, head: number): Promise<{ who: string; entry?: HistoryEntry }> {
  let entries: HistoryEntry[] = [];
  try {
    entries = await store.readHistory(slug);
  } catch {
    entries = [];
  }
  const entry = entries.find((e) => e.rev > head);
  if (!entry) return { who: 'perubahan lain' };
  if (entry.client === VIEWER_CLIENT || entry.sessionId === VIEWER_CLIENT) return { who: 'pengguna (aplikasi Lakar)', entry };
  return { who: `agen lain (${entry.agent ?? entry.client ?? 'sesi lain'})`, entry };
}

export type AgentUndoRoutesOptions = {
  docs: Map<string, LakarDocument>;
  store: DocStore;
  docLocks: DocumentLocks;
  sessions: Sessions;
  steps: AgentSteps;
  /** Katalog ikon: board tersentuh dicek seperti route ops (ICON_UNKNOWN). */
  icons: { canonical(lib: string, icon: string): unknown };
  /** Room `@lakar/sync` yang digabung: undo/redo didelegasikan ke DocTransport room. */
  rooms?: RoomRegistry;
};

export function registerAgentUndoRoutes(app: FastifyInstance, { docs, store, docLocks, sessions, steps, icons, rooms }: AgentUndoRoutesOptions): void {
  for (const dir of ['undo', 'redo'] as const) {
    const other: UndoDir = dir === 'undo' ? 'redo' : 'undo';
    const Verb = dir === 'undo' ? 'Undo' : 'Redo';
    app.post(`/viewer/${dir}`, async (req, reply) => {
      const session = sessions.require(req.headers[SESSION_HEADER]);
      const parsed = StepsBody.safeParse(req.body ?? undefined);
      if (!parsed.success) {
        throw new LakarError('SCHEMA_INVALID', parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: BODY_HINT });
      }
      const n = parsed.data?.steps ?? 1;
      const slug = session.activeSlug;
      if (!slug) throw new LakarError('NO_ACTIVE_DOC', 'sesi ini belum punya dokumen aktif', { hint: NO_ACTIVE_DOC_HINT });
      const room = rooms?.get(slug);
      if (room) {
        // Undo/redo room dijalankan sequencer (DocTransport /undo|/redo); tumpukan undo lokal tidak dipakai.
        return roomCall(room, `/${dir}`, { ...(parsed.data?.steps !== undefined ? { steps: n } : {}) }, reply, agentOf(req.headers));
      }
      const data = await docLocks.run(slug, async () => {
        const current = docs.get(slug) ?? (await store.read(slug));
        if (!current) throw new LakarError('NO_ACTIVE_DOC', `dokumen ${slug} tidak ada lagi`, { hint: NO_ACTIVE_DOC_HINT });
        const ds = steps.of(session, current.id);
        const stack = ds?.[dir] ?? [];
        if (!ds || stack.length === 0) {
          throw new LakarError('NOT_FOUND', `tidak ada langkah sesi ini untuk di-${dir} di dokumen ${slug}`, {
            hint:
              dir === 'undo'
                ? `undo hanya mencakup execute/paste sesi ini pada dokumen aktif sejak daemon berjalan (bukan langkah pengguna atau agen lain); ${FIX_FORWARD}`
                : 'redo hanya mengulang langkah yang baru di-undo sesi ini; execute/paste baru mengosongkan redo',
          });
        }
        if (current.rev !== ds.head) {
          const { who, entry } = await laterAuthor(store, slug, ds.head);
          const what = entry ? ` (rev ${entry.rev}, "${entry.description}")` : '';
          // Rantai putus permanen: tumpukan dibuang supaya panggilan berikutnya jujur NOT_FOUND (review 31-1).
          steps.drop(session, current.id);
          throw new LakarError('CONFLICT', `${dir} ditolak: ${who} mengedit dokumen ${slug} sesudah langkah terakhir sesi ini${what}; dokumen kini rev ${current.rev}`, {
            hint: `agen tidak pernah membatalkan edit pengguna atau sesi lain; ${FIX_FORWARD}`,
          });
        }
        if (n > stack.length) {
          throw new LakarError('NOT_FOUND', `hanya ${stack.length} langkah yang bisa di-${dir}, diminta ${n}`, { hint: `${dir} {steps:${stack.length}} atau kurang` });
        }
        const done: { description: string; rev: number }[] = [];
        const boards = new Set<string>();
        let doc = current;
        // Satu commit per langkah (satu rev, satu entri riwayat), semuanya di bawah satu kunci dokumen. Seluruh panggilan
        // (juga bila gagal di tengah) dicatat sekali lewat hook tulis agen: dasar visual_diff = rev sebelum undo/redo ini.
        try {
          for (let i = 0; i < n; i++) {
            const step = stack[stack.length - 1]!;
            const committed = await transact(doc, { sessionId: session.id, description: `${Verb}: ${step.description}` }, (tx) => applyOps(tx, step.ops));
            if (committed.entry === null) throw new Error(`${dir}: op langkah tidak berefek`);
            const before = resolveDocument(doc);
            const after = resolveDocument(committed.doc);
            const touched = touchedBoards(before, after);
            for (const id of touched) for (const r of iconRefs(findBoard(after, id)!)) icons.canonical(r.lib, r.icon);
            await store.commit(slug, committed.doc, { ...committed.entry, ...authorOf(session) });
            docs.set(slug, committed.doc);
            // Tumpukan diperbarui per commit: gagal di langkah berikutnya tidak membuat rantai tidak sinkron.
            stack.pop();
            ds[other].push({ ops: committed.inverse, description: step.description });
            ds.head = committed.doc.rev;
            for (const b of touched) boards.add(b);
            done.push({ description: step.description, rev: committed.doc.rev });
            doc = committed.doc;
          }
        } finally {
          if (doc.rev !== current.rev) steps.onAgentWrite(session, current.id, current.rev, doc.rev, [], Verb, dir);
        }
        return {
          docId: doc.id,
          slug,
          rev: doc.rev,
          [dir === 'undo' ? 'undone' : 'redone']: done,
          boards: [...boards],
          available: { undo: ds.undo.length, redo: ds.redo.length },
          target: { slug, name: slug, boardIds: doc.pages.flatMap((p) => p.children.map((b) => b.id)) },
        };
      });
      return reply.code(200).send({ ok: true, data });
    });
  }
}
