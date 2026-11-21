// Penyimpanan dokumen di <data>/docs: <slug>.lakar.json dan <slug>.history.jsonl. Hanya daemon yang
// menyentuh direktori ini (AD-1). Tahan kill (R1):
// - tulis dokumen: tmp → fsync → rename → fsync direktori;
// - commit: riwayat dulu (append + fsync), LALU dokumen; dokumen gagal ditulis → riwayat dipotong balik;
// - buka: tmp sisa dihapus, riwayat direkonsiliasi (baris parsial/rusak dan entri `rev > doc.rev` dibuang),
//   dokumen hasil migrasi ditulis balik.
// Kelola file (aplikasi 1): rename/archive/unarchive memindahkan dokumen lalu riwayat (rename atomik per file);
// arsip di <data>/docs/archive dengan pola nama yang sama.
import { mkdir, open, readFile, readdir, rename, rm, stat, truncate, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { migrateDocument, parseDocument, type MigrationRegistry } from '@lakar/core';
import { LakarError, SLUG_PATTERN, errorMessage, type HistoryEntry, type LakarDocument } from '@lakar/schema';

export type DocStoreOptions = {
  /** Registri migrasi (default: registri resmi core). */
  migrations?: MigrationRegistry;
  /** Pengganti langkah migrasi (khusus tes write-back): mentah → dokumen versi kini. */
  migrate?: (raw: unknown) => unknown;
};

const DOC_SUFFIX = '.lakar.json';
const HISTORY_SUFFIX = '.history.jsonl';

const isEnoent = (e: unknown) => (e as NodeJS.ErrnoException)?.code === 'ENOENT';

const notFoundDoc = (slug: string, archived: boolean) =>
  new LakarError('NOT_FOUND', `dokumen ${slug} tidak ada${archived ? ' di arsip' : ''}`, {
    hint: archived ? 'pakai slug dari GET /viewer/archive' : 'pakai slug dari GET /viewer/docs',
  });

/** `<slug>.lakar.json` dengan slug valid di `dir` beserta mtime; direktori belum ada → `[]`. */
async function listDocsIn(dir: string): Promise<{ slug: string; mtimeMs: number }[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (e) {
    if (isEnoent(e)) return [];
    throw e;
  }
  const out: { slug: string; mtimeMs: number }[] = [];
  for (const name of names) {
    if (!name.endsWith(DOC_SUFFIX)) continue;
    const slug = name.slice(0, -DOC_SUFFIX.length);
    if (!SLUG_PATTERN.test(slug)) continue;
    try {
      const st = await stat(join(dir, name));
      if (st.isFile()) out.push({ slug, mtimeMs: st.mtimeMs });
    } catch (e) {
      // Terhapus di antara readdir dan stat: lewati.
      if (!isEnoent(e)) throw e;
    }
  }
  return out;
}

/** Hapus tmp sisa proses yang dibunuh milik `slug` di `dir`. */
async function removeTmp(dir: string, slug: string): Promise<void> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (e) {
    if (isEnoent(e)) return;
    throw e;
  }
  const prefixes = [`${slug}${DOC_SUFFIX}.`, `${slug}${HISTORY_SUFFIX}.`];
  await Promise.all(names.filter((n) => n.endsWith('.tmp') && prefixes.some((p) => n.startsWith(p))).map((n) => rm(join(dir, n), { force: true })));
}

async function syncDir(dir: string): Promise<void> {
  const h = await open(dir, 'r');
  try {
    await h.sync();
  } finally {
    await h.close();
  }
}

/** Offset akhir baris lengkap terakhir (setelah '\n' terakhir) di file berukuran `size`; 0 bila tidak ada. */
async function lastLineEnd(h: FileHandle, size: number): Promise<number> {
  const chunk = Buffer.alloc(64 * 1024);
  let end = size;
  while (end > 0) {
    const start = Math.max(0, end - chunk.length);
    const { bytesRead } = await h.read(chunk, 0, end - start, start);
    const nl = chunk.subarray(0, bytesRead).lastIndexOf(0x0a);
    if (nl >= 0) return start + nl + 1;
    end = start;
  }
  return 0;
}

const isHistoryEntry = (v: unknown): v is HistoryEntry =>
  typeof v === 'object' && v !== null && Number.isInteger((v as { rev?: unknown }).rev) && typeof (v as { opsSummary?: unknown }).opsSummary === 'string';

export class DocStore {
  readonly docsDir: string;
  readonly #migrate: (raw: unknown) => unknown;

  constructor(dataDir: string, opts: DocStoreOptions = {}) {
    this.docsDir = join(dataDir, 'docs');
    this.#migrate = opts.migrate ?? ((raw) => migrateDocument(raw, { migrations: opts.migrations }));
  }

  docPath(slug: string): string {
    return join(this.docsDir, `${slug}.lakar.json`);
  }
  historyPath(slug: string): string {
    return join(this.docsDir, `${slug}.history.jsonl`);
  }

  /**
   * Baca dokumen; `undefined` bila belum ada. File rusak → SCHEMA_INVALID; versi lebih baru → VERSION_MISMATCH.
   * Sekaligus memulihkan sisa kill: hapus tmp, rekonsiliasi riwayat, tulis balik hasil migrasi.
   */
  async read(slug: string): Promise<LakarDocument | undefined> {
    await this.#removeStaleTmp(slug);
    let text: string;
    try {
      text = await readFile(this.docPath(slug), 'utf8');
    } catch (e) {
      if (isEnoent(e)) return undefined;
      throw e;
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new LakarError('SCHEMA_INVALID', `file dokumen ${slug}.lakar.json bukan JSON valid: ${errorMessage(e)}`, {
        hint: 'pulihkan file dari cadangan atau buka slug lain',
      });
    }
    let doc: LakarDocument;
    let migrated: unknown;
    try {
      migrated = this.#migrate(json);
      doc = parseDocument(migrated);
    } catch (e) {
      // VERSION_MISMATCH (dokumen lebih baru / migrasi hilang) bukan file rusak: teruskan dengan hint pembaruan.
      if (e instanceof LakarError && e.code !== 'VERSION_MISMATCH') {
        throw new LakarError(e.code, `file dokumen ${slug}.lakar.json rusak: ${e.message}`, { hint: 'pulihkan file dari cadangan atau buka slug lain' });
      }
      throw e;
    }
    if (migrated !== json) await this.write(slug, doc);
    await this.#reconcileHistory(slug, doc.rev);
    return doc;
  }

  /** Tulis dokumen atomik: tmp di direktori yang sama → fsync → rename → fsync direktori. */
  async write(slug: string, doc: LakarDocument): Promise<void> {
    await this.#writeAtomic(this.docPath(slug), `${JSON.stringify(doc, null, 2)}\n`);
  }

  /**
   * Simpan satu revisi: riwayat dulu (perbaiki ekor parsial, append, fsync), lalu dokumen. Bila tulis
   * dokumen gagal, riwayat dipotong kembali ke ukuran sebelumnya. Kill di titik mana pun dipulihkan `read`.
   */
  async commit(slug: string, doc: LakarDocument, entry: HistoryEntry): Promise<void> {
    await mkdir(this.docsDir, { recursive: true });
    const hp = this.historyPath(slug);
    const h = await open(hp, 'a+');
    let before: number;
    let fresh: boolean;
    try {
      const { size } = await h.stat();
      fresh = size === 0;
      before = size;
      if (size > 0) {
        const last = Buffer.alloc(1);
        await h.read(last, 0, 1, size - 1);
        if (last[0] !== 0x0a) {
          before = await lastLineEnd(h, size);
          await h.truncate(before);
        }
      }
      try {
        await h.write(`${JSON.stringify(entry)}\n`);
        await h.sync();
      } catch (e) {
        await h.truncate(before).catch(() => {});
        throw e;
      }
    } finally {
      await h.close();
    }
    if (fresh) await syncDir(this.docsDir);
    try {
      await this.write(slug, doc);
    } catch (e) {
      await truncate(hp, before).catch(() => {});
      throw e;
    }
  }

  /**
   * Slug dokumen yang ada di `docsDir` beserta mtime file (untuk daftar viewer). Hanya `<slug>.lakar.json`
   * dengan slug valid; tmp, riwayat, dan file lain diabaikan. Direktori belum ada → `[]`.
   */
  async list(): Promise<{ slug: string; mtimeMs: number }[]> {
    return listDocsIn(this.docsDir);
  }

  /** Direktori arsip: `<dataDir>/docs/archive`, pola nama file sama dengan `docsDir`. */
  get archiveDir(): string {
    return join(this.docsDir, 'archive');
  }
  archivedDocPath(slug: string): string {
    return join(this.archiveDir, `${slug}${DOC_SUFFIX}`);
  }

  /** True bila `<slug>.lakar.json` ada (aktif, atau di arsip bila `archived`). */
  async exists(slug: string, archived = false): Promise<boolean> {
    try {
      return (await stat(archived ? this.archivedDocPath(slug) : this.docPath(slug))).isFile();
    } catch (e) {
      if (isEnoent(e)) return false;
      throw e;
    }
  }

  /**
   * Ganti slug: pindahkan dokumen lalu riwayat. Target sudah ada → CONFLICT; sumber tidak ada → NOT_FOUND.
   * Riwayat yatim milik target (tanpa dokumen) dibuang dulu supaya tidak tercampur dengan dokumen yang masuk.
   */
  async rename(from: string, to: string): Promise<void> {
    await this.#move(this.docsDir, from, this.docsDir, to, 'dokumen');
  }

  /** Pindahkan dokumen + riwayat ke arsip. Slug yang sama sudah ada di arsip → CONFLICT. */
  async archive(slug: string): Promise<void> {
    await this.#move(this.docsDir, slug, this.archiveDir, slug, 'arsip');
  }

  /** Kembalikan dokumen + riwayat dari arsip. Slug sudah dipakai dokumen aktif → CONFLICT. */
  async unarchive(slug: string): Promise<void> {
    await this.#move(this.archiveDir, slug, this.docsDir, slug, 'dokumen');
  }

  /**
   * Hapus dokumen + riwayat (permanen; aktif, atau di arsip bila `archived`). Dokumen dihapus dulu supaya
   * hilang dari daftar walau penghapusan riwayat gagal. Dokumen tidak ada → NOT_FOUND.
   */
  async remove(slug: string, archived = false): Promise<void> {
    const dir = archived ? this.archiveDir : this.docsDir;
    if (!(await this.exists(slug, archived))) throw notFoundDoc(slug, archived);
    await rm(join(dir, `${slug}${DOC_SUFFIX}`));
    await rm(join(dir, `${slug}${HISTORY_SUFFIX}`), { force: true });
    await removeTmp(dir, slug);
    await syncDir(dir).catch(() => {});
  }

  /** Buang riwayat yatim `<slug>.history.jsonl` (dokumen belum ada) sebelum dokumen baru dibuat di slug itu. */
  async dropOrphanHistory(slug: string): Promise<void> {
    if (await this.exists(slug)) return;
    await rm(this.historyPath(slug), { force: true });
  }

  /** Seperti `list`, untuk direktori arsip. */
  async listArchive(): Promise<{ slug: string; mtimeMs: number }[]> {
    return listDocsIn(this.archiveDir);
  }

  async #move(fromDir: string, from: string, toDir: string, to: string, where: string): Promise<void> {
    const fromDoc = join(fromDir, `${from}${DOC_SUFFIX}`);
    const toDoc = join(toDir, `${to}${DOC_SUFFIX}`);
    const fromHist = join(fromDir, `${from}${HISTORY_SUFFIX}`);
    const toHist = join(toDir, `${to}${HISTORY_SUFFIX}`);
    const isFile = (p: string) =>
      stat(p).then(
        (s) => s.isFile(),
        (e) => {
          if (isEnoent(e)) return false;
          throw e;
        },
      );
    if (!(await isFile(fromDoc))) throw notFoundDoc(from, fromDir !== this.docsDir);
    if (await isFile(toDoc)) {
      throw new LakarError('CONFLICT', `${where} ${to} sudah ada`, {
        hint: where === 'arsip' ? `hapus ${to} dari arsip dulu, atau ganti nama dokumen` : 'pilih nama lain',
      });
    }
    await mkdir(toDir, { recursive: true });
    await removeTmp(fromDir, from);
    const hasHistory = await isFile(fromHist);
    // Riwayat target tanpa dokumen = yatim (sisa penghapusan/kill): jangan sampai tercampur.
    if (!hasHistory) await rm(toHist, { force: true });
    // Dokumen dulu, lalu riwayat. Kill di antaranya: dokumen di slug baru tanpa riwayat (riwayat lama yatim di
    // slug asal dan dibuang saat slug itu dipakai lagi) — dokumen sendiri tidak pernah hilang.
    await rename(fromDoc, toDoc);
    if (hasHistory) await rename(fromHist, toHist);
    await syncDir(toDir).catch(() => {});
    if (toDir !== fromDir) await syncDir(fromDir).catch(() => {});
  }

  /** Entri riwayat yang terbaca (baris rusak dilewati). */
  async readHistory(slug: string): Promise<HistoryEntry[]> {
    let text: string;
    try {
      text = await readFile(this.historyPath(slug), 'utf8');
    } catch (e) {
      if (isEnoent(e)) return [];
      throw e;
    }
    const out: HistoryEntry[] = [];
    for (const line of text.split('\n')) {
      if (!line) continue;
      try {
        const v = JSON.parse(line) as unknown;
        if (isHistoryEntry(v)) out.push(v);
      } catch {
        // baris rusak dilewati
      }
    }
    return out;
  }

  async #writeAtomic(target: string, content: string): Promise<void> {
    await mkdir(this.docsDir, { recursive: true });
    const tmp = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      const h = await open(tmp, 'w');
      try {
        await h.writeFile(content, 'utf8');
        await h.sync();
      } finally {
        await h.close();
      }
      await rename(tmp, target);
    } catch (e) {
      await rm(tmp, { force: true }).catch(() => {});
      throw e;
    }
    // Rename sudah terjadi: fsync direktori best-effort, kegagalannya bukan kegagalan tulis.
    await syncDir(this.docsDir).catch(() => {});
  }

  /** Hapus `<slug>.lakar.json.*.tmp` / `<slug>.history.jsonl.*.tmp` sisa proses yang dibunuh. */
  async #removeStaleTmp(slug: string): Promise<void> {
    await removeTmp(this.docsDir, slug);
  }

  /** Buang baris parsial/rusak dan entri `rev > docRev`; tulis ulang atomik bila ada yang dibuang. */
  async #reconcileHistory(slug: string, docRev: number): Promise<void> {
    let text: string;
    try {
      text = await readFile(this.historyPath(slug), 'utf8');
    } catch (e) {
      if (isEnoent(e)) return;
      throw e;
    }
    const lines = text.split('\n');
    // Elemen terakhir: '' bila file berakhir '\n', selain itu baris parsial (dibuang).
    const complete = lines.slice(0, -1);
    const kept = complete.filter((line) => {
      try {
        const v = JSON.parse(line) as unknown;
        return isHistoryEntry(v) && v.rev <= docRev;
      } catch {
        return false;
      }
    });
    if (kept.length === complete.length && lines.at(-1) === '') return;
    await this.#writeAtomic(this.historyPath(slug), kept.map((l) => `${l}\n`).join(''));
  }
}
