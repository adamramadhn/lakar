// Penyimpanan dokumen di <data>/docs: <slug>.lakar.json dan <slug>.history.jsonl. Hanya daemon yang
// menyentuh direktori ini (AD-1). Tahan kill (R1):
// - tulis dokumen: tmp → fsync → rename → fsync direktori;
// - commit: riwayat dulu (append + fsync), LALU dokumen; dokumen gagal ditulis → riwayat dipotong balik;
// - buka: tmp sisa dihapus, riwayat direkonsiliasi (baris parsial/rusak dan entri `rev > doc.rev` dibuang),
//   dokumen hasil migrasi ditulis balik.
// Kelola file (aplikasi 1): rename/archive/unarchive memindahkan dokumen lalu riwayat (rename atomik per file);
// arsip di <data>/docs/archive dengan pola nama yang sama.
// Snapshot (aplikasi 3): isi dokumen per rev di <dir>/.snapshots/<slug>/r<rev>.lakar.json (dir = docs atau
// docs/archive), ditulis atomik sesudah commit berhasil; gagal tulis hanya dicatat. Retensi SNAPSHOT_KEEP rev
// terakhir, dan total byte folder snapshot per dokumen maks SNAPSHOT_MAX_BYTES (snapshot tertua dibuang dulu; snapshot
// terbaru selalu disimpan). Rename/archive/unarchive memindahkan foldernya, remove menghapusnya.
import { mkdir, open, readFile, readdir, rename, rm, stat, truncate, type FileHandle } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { migrateDocument, parseDocument, type MigrationRegistry } from '@lakar/core';
import { LakarError, SLUG_PATTERN, errorMessage, type HistoryEntry, type LakarDocument } from '@lakar/schema';

export type DocStoreOptions = {
  /** Registri migrasi (default: registri resmi core). */
  migrations?: MigrationRegistry;
  /** Pengganti langkah migrasi (khusus tes write-back): mentah → dokumen versi kini. */
  migrate?: (raw: unknown) => unknown;
  /** Pencatat masalah non-fatal (snapshot gagal ditulis/dipindah). Default `console.warn`. */
  log?: (message: string) => void;
  /** Jumlah snapshot yang disimpan per dokumen (default `SNAPSHOT_KEEP`). */
  snapshotKeep?: number;
  /** Batas total byte snapshot per dokumen (default `SNAPSHOT_MAX_BYTES`). */
  snapshotMaxBytes?: number;
  /**
   * Ganti direktori dokumen (default `<dataDir>/docs`). Dipakai transport file (`lakar --file`): store
   * menunjuk langsung ke direktori tempat `.lakar.json` berada, apa pun nama induknya.
   */
  docsDir?: string;
  /**
   * Nama berkas dokumen tetap pengganti `<slug>.lakar.json` — transport file (`lakar --file`) pada
   * berkas yang namanya bukan slug valid (mis. `My Design.lakar.json`): slug = nama yang disanitasi,
   * berkas di disk tetap nama aslinya. Riwayat memakai nama asli juga
   * (`<nama tanpa .lakar.json>.history.jsonl`); folder snapshot tetap `.snapshots/<slug>/`.
   */
  docFile?: string;
};

/** Retensi snapshot: rev terakhir per dokumen. */
export const SNAPSHOT_KEEP = 200;
/** Retensi snapshot: total byte folder snapshot per dokumen (200 MB). */
export const SNAPSHOT_MAX_BYTES = 200 * 1024 * 1024;
const SNAPSHOTS_DIR = '.snapshots';
const SNAPSHOT_FILE = /^r(\d+)\.lakar\.json$/;

const DOC_SUFFIX = '.lakar.json';
const HISTORY_SUFFIX = '.history.jsonl';
const VERSIONS_SUFFIX = '.versions.json';

const isEnoent = (e: unknown) => (e as NodeJS.ErrnoException)?.code === 'ENOENT';

/** Tag versi bernama (spec-viewer-named-versions): label bebas yang menempel ke satu rev. */
export type VersionTag = { rev: number; name: string; at: string };

const isVersionTag = (v: unknown): v is VersionTag => {
  const t = v as VersionTag;
  return typeof t === 'object' && t !== null && Number.isInteger(t.rev) && t.rev >= 1 && typeof t.name === 'string' && t.name.length > 0 && typeof t.at === 'string';
};

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

/** Hapus tmp sisa proses yang dibunuh untuk berkas `docName`/`historyName` di `dir`. */
async function removeTmp(dir: string, docName: string, historyName: string): Promise<void> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (e) {
    if (isEnoent(e)) return;
    throw e;
  }
  const prefixes = [`${docName}.`, `${historyName}.`];
  await Promise.all(names.filter((n) => n.endsWith('.tmp') && prefixes.some((p) => n.startsWith(p))).map((n) => rm(join(dir, n), { force: true })));
}

/**
 * fsync direktori agar entri (rename/buat file) tahan crash. Windows tidak mendukung fsync pada handle direktori
 * (selalu EPERM) dan NTFS sudah menjurnal metadata, jadi di sana no-op; tanpa ini setiap commit pertama dokumen
 * (New file, aplikasi desktop Windows) gagal. Platform lain tidak berubah.
 */
async function syncDir(dir: string): Promise<void> {
  if (process.platform === 'win32') return;
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
  readonly #log: (message: string) => void;
  readonly #keep: number;
  readonly #maxBytes: number;
  readonly #docFile: string | undefined;

  constructor(dataDir: string, opts: DocStoreOptions = {}) {
    this.docsDir = opts.docsDir ?? join(dataDir, 'docs');
    this.#migrate = opts.migrate ?? ((raw) => migrateDocument(raw, { migrations: opts.migrations }));
    this.#log = opts.log ?? ((m) => console.warn(m));
    this.#keep = Math.max(1, opts.snapshotKeep ?? SNAPSHOT_KEEP);
    this.#maxBytes = Math.max(0, opts.snapshotMaxBytes ?? SNAPSHOT_MAX_BYTES);
    this.#docFile = opts.docFile;
  }

  docPath(slug: string): string {
    return join(this.docsDir, this.#docFile ?? `${slug}.lakar.json`);
  }
  historyPath(slug: string): string {
    // docFile selalu berakhiran `.lakar.json` (divalidasi pemanggil) → riwayat = nama asli + .history.jsonl.
    return join(this.docsDir, this.#docFile !== undefined ? `${this.#docFile.slice(0, -DOC_SUFFIX.length)}${HISTORY_SUFFIX}` : `${slug}.history.jsonl`);
  }

  /** Sidecar versi bernama (spec-viewer-named-versions): `<slug>.versions.json` di docsDir. */
  versionsPath(slug: string): string {
    return join(this.docsDir, `${slug}${VERSIONS_SUFFIX}`);
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
    // Windows menolak ftruncate pada handle mode append (EPERM); potong lewat path (handle dibuka dengan share write).
    const cut = (n: number) => (process.platform === 'win32' ? truncate(hp, n) : h.truncate(n));
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
          await cut(before);
        }
      }
      try {
        await h.write(`${JSON.stringify(entry)}\n`);
        await h.sync();
      } catch (e) {
        await cut(before).catch(() => {});
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
    // Commit sudah berhasil: snapshot hanya pelengkap (History Restore/Compare), gagalnya tidak menggagalkan commit.
    try {
      await this.#writeSnapshot(slug, doc);
    } catch (e) {
      this.#log(`lakard: snapshot ${slug} r${doc.rev} gagal ditulis: ${errorMessage(e)}`);
    }
  }

  /** Folder snapshot `<dir>/.snapshots/<slug>` (dir = docs, atau arsip bila `archived`). */
  snapshotDir(slug: string, archived = false): string {
    return join(archived ? this.archiveDir : this.docsDir, SNAPSHOTS_DIR, slug);
  }
  snapshotPath(slug: string, rev: number, archived = false): string {
    return join(this.snapshotDir(slug, archived), `r${rev}${DOC_SUFFIX}`);
  }

  /** Rev yang punya snapshot (dokumen aktif). Folder belum ada → kosong. */
  async snapshotRevs(slug: string): Promise<Set<number>> {
    let names: string[];
    try {
      names = await readdir(this.snapshotDir(slug));
    } catch (e) {
      if (isEnoent(e) || (e as NodeJS.ErrnoException)?.code === 'ENOTDIR') return new Set();
      throw e;
    }
    const out = new Set<number>();
    for (const n of names) {
      const m = SNAPSHOT_FILE.exec(n);
      if (m) out.add(Number(m[1]));
    }
    return out;
  }

  /** Isi snapshot rev `rev` (dimigrasi ke versi kini, tanpa tulis balik); `undefined` bila tidak ada. */
  async readSnapshot(slug: string, rev: number): Promise<LakarDocument | undefined> {
    let text: string;
    try {
      text = await readFile(this.snapshotPath(slug, rev), 'utf8');
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return undefined;
      throw e;
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new LakarError('SCHEMA_INVALID', `snapshot ${slug} r${rev} bukan JSON valid: ${errorMessage(e)}`, { hint: 'pilih versi lain' });
    }
    return parseDocument(this.#migrate(json));
  }

  /**
   * Tulis `r<rev>.lakar.json` atomik, lalu buang snapshot di luar `#keep` rev terakhir dan snapshot tertua yang
   * membuat total byte melewati `#maxBytes`. Snapshot terbaru selalu disimpan walau sendirian melebihi batas.
   */
  async #writeSnapshot(slug: string, doc: LakarDocument): Promise<void> {
    const dir = this.snapshotDir(slug);
    await this.#writeAtomic(this.snapshotPath(slug, doc.rev), JSON.stringify(doc), dir);
    // Rev versi bernama di-pin: tidak masuk retensi jumlah maupun byte (spec-viewer-named-versions).
    const pinned = new Set((await this.readVersions(slug)).map((t) => t.rev));
    const revs = [...(await this.snapshotRevs(slug))].sort((a, b) => b - a).filter((r) => !pinned.has(r));
    const drop = revs.slice(this.#keep);
    let total = 0;
    for (const [i, r] of revs.slice(0, this.#keep).entries()) {
      let size: number;
      try {
        size = (await stat(this.snapshotPath(slug, r))).size;
      } catch (e) {
        if (isEnoent(e)) continue;
        throw e;
      }
      total += size;
      if (i > 0 && total > this.#maxBytes) drop.push(r);
    }
    await Promise.all(drop.map((r) => rm(this.snapshotPath(slug, r), { force: true })));
  }

  /** Pindahkan folder snapshot (best-effort): folder target yatim dibuang dulu; gagal hanya dicatat. */
  async #moveSnapshots(fromDir: string, from: string, toDir: string, to: string): Promise<void> {
    const src = join(fromDir, SNAPSHOTS_DIR, from);
    const dst = join(toDir, SNAPSHOTS_DIR, to);
    try {
      await rm(dst, { recursive: true, force: true });
      const exists = await stat(src).then(
        (s) => s.isDirectory(),
        () => false,
      );
      if (!exists) return;
      await mkdir(dirname(dst), { recursive: true });
      await rename(src, dst);
    } catch (e) {
      this.#log(`lakard: snapshot ${from} gagal dipindah ke ${to}: ${errorMessage(e)}`);
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
    await rm(join(dir, `${slug}${VERSIONS_SUFFIX}`), { force: true });
    await rm(this.snapshotDir(slug, archived), { recursive: true, force: true }).catch((e) => this.#log(`lakard: snapshot ${slug} gagal dihapus: ${errorMessage(e)}`));
    await removeTmp(dir, `${slug}${DOC_SUFFIX}`, `${slug}${HISTORY_SUFFIX}`);
    await syncDir(dir).catch(() => {});
  }

  /** Buang riwayat yatim `<slug>.history.jsonl` (dokumen belum ada) sebelum dokumen baru dibuat di slug itu. */
  async dropOrphanHistory(slug: string): Promise<void> {
    if (await this.exists(slug)) return;
    await rm(this.historyPath(slug), { force: true });
    await rm(this.versionsPath(slug), { force: true });
    await rm(this.snapshotDir(slug), { recursive: true, force: true });
  }

  /** Versi bernama yang tersimpan (sidecar rusak/kosong → []). */
  async readVersions(slug: string): Promise<VersionTag[]> {
    let text: string;
    try {
      text = await readFile(this.versionsPath(slug), 'utf8');
    } catch (e) {
      if (isEnoent(e)) return [];
      throw e;
    }
    try {
      const v = JSON.parse(text) as unknown;
      const list = (v as { versions?: unknown }).versions;
      return Array.isArray(list) ? (list.filter(isVersionTag) as VersionTag[]) : [];
    } catch {
      return [];
    }
  }

  /** Tulis ulang daftar versi bernama (atomik). */
  async writeVersions(slug: string, tags: readonly VersionTag[]): Promise<void> {
    if (tags.length === 0) {
      await rm(this.versionsPath(slug), { force: true });
      return;
    }
    await this.#writeAtomic(this.versionsPath(slug), `${JSON.stringify({ versions: tags }, null, 2)}
`);
  }

  /**
   * Tag `rev` dengan `name` (spec-viewer-named-versions): rev yang sama menimpa nama lama (rename).
   * Snapshot rev bertag dikecualikan dari retensi `#writeSnapshot`.
   */
  async addVersionTag(slug: string, rev: number, name: string): Promise<VersionTag> {
    const tags = (await this.readVersions(slug)).filter((t) => t.rev !== rev);
    const tag: VersionTag = { rev, name, at: new Date().toISOString() };
    tags.push(tag);
    tags.sort((a, b) => b.rev - a.rev);
    await this.writeVersions(slug, tags);
    return tag;
  }

  /** Hapus tag `rev`; tag tidak ada → false. */
  async removeVersionTag(slug: string, rev: number): Promise<boolean> {
    const tags = await this.readVersions(slug);
    const kept = tags.filter((t) => t.rev !== rev);
    if (kept.length === tags.length) return false;
    await this.writeVersions(slug, kept);
    return true;
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
    await removeTmp(fromDir, `${from}${DOC_SUFFIX}`, `${from}${HISTORY_SUFFIX}`);
    const hasHistory = await isFile(fromHist);
    const fromVers = join(fromDir, `${from}${VERSIONS_SUFFIX}`);
    const toVers = join(toDir, `${to}${VERSIONS_SUFFIX}`);
    const hasVersions = await isFile(fromVers);
    // Riwayat target tanpa dokumen = yatim (sisa penghapusan/kill): jangan sampai tercampur.
    if (!hasHistory) await rm(toHist, { force: true });
    if (!hasVersions) await rm(toVers, { force: true });
    // Dokumen dulu, lalu riwayat. Kill di antaranya: dokumen di slug baru tanpa riwayat (riwayat lama yatim di
    // slug asal dan dibuang saat slug itu dipakai lagi) — dokumen sendiri tidak pernah hilang.
    await rename(fromDoc, toDoc);
    if (hasHistory) await rename(fromHist, toHist);
    if (hasVersions) await rename(fromVers, toVers);
    await this.#moveSnapshots(fromDir, from, toDir, to);
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

  async #writeAtomic(target: string, content: string, dir = this.docsDir): Promise<void> {
    await mkdir(dir, { recursive: true });
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
    await syncDir(dir).catch(() => {});
  }

  /** Hapus tmp `<dokumen>/<riwayat>.*.tmp` sisa proses yang dibunuh (nama berkas asli bila `docFile`). */
  async #removeStaleTmp(slug: string): Promise<void> {
    await removeTmp(this.docsDir, basename(this.docPath(slug)), basename(this.historyPath(slug)));
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
