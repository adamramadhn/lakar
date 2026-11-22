// Antrean aksi props/slot komponen (epic komponen story 5): aksi dijalankan berurutan; pembangun op dievaluasi pada
// dokumen terbaru sesudah rev aksi sebelumnya dimuat, sehingga dua edit cepat tidak saling menimpa definisi master
// (`setComponent` menulis definisi utuh). Murni terhadap IO: semua efek (route ops, muat dokumen, toast, seleksi)
// disuntikkan Viewer, jadi urutan dan penanganan error bisa dites tanpa DOM.
import type { DocOp } from '@lakar/schema';

/** Hasil pembangun op: daftar op, error (toast tanpa request), atau undefined (tidak ada yang dikirim). */
export type BuildResult = DocOp[] | { error: string } | undefined;

export type QueueDeps<D, I> = {
  /** Dokumen tersimpan terbaru (undefined = belum dimuat). */
  latest: () => D | undefined;
  editable: () => boolean;
  info: (doc: D) => I;
  /** Satu permintaan ops; undefined bila gagal (toast milik pemanggil). */
  apply: (ops: DocOp[], label: string) => Promise<{ rev: number; refs: Readonly<Record<string, string>> } | undefined>;
  /** Selesai saat dokumen rev `rev` (atau lebih baru) dimuat, atau batas waktu habis. */
  waitRev: (rev: number) => Promise<void>;
  toast: (message: string) => void;
  select: (id: string) => void;
};

export type Enqueue<D, I> = (label: string, build: (doc: D, info: I) => BuildResult, select?: (refs: Readonly<Record<string, string>>) => string | undefined) => Promise<void>;

/** Antrean berurutan; janji yang dikembalikan selesai saat aksi itu selesai (tidak pernah ditolak). */
export function createActionQueue<D, I>(deps: QueueDeps<D, I>): Enqueue<D, I> {
  let tail: Promise<void> = Promise.resolve();
  return (label, build, select) => {
    const run = async () => {
      const doc = deps.latest();
      if (!deps.editable() || !doc) return;
      const ops = build(doc, deps.info(doc));
      if (!ops) return;
      if (!Array.isArray(ops)) {
        deps.toast(ops.error);
        return;
      }
      if (ops.length === 0) return;
      const r = await deps.apply(ops, label);
      if (!r) return;
      // Seleksi sesudah rev termuat: node baru/isi slot sudah dikenal indeks Viewer.
      await deps.waitRev(r.rev);
      const id = select?.(r.refs);
      if (id) deps.select(id);
    };
    // Kegagalan satu aksi (pembangun melempar, dsb.) tidak boleh mematikan aksi berikutnya.
    tail = tail.then(run).catch((e: unknown) => deps.toast(e instanceof Error ? e.message : String(e)));
    return tail;
  };
}
