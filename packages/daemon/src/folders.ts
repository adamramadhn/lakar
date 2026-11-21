// Folder di Dashboard (aplikasi 10): metadata viewer di `<dataDir>/folders.json`, bukan direktori. Slug, path file,
// `/docs/open`, dan tool MCP tidak berubah; folder hanya mengelompokkan slug untuk halaman Files.
// Cache memori + antrean serial sendiri (tidak memakai `docLocks`): route file boleh memanggil kait di sini sambil
// memegang kunci dokumen, dan antrean ini tidak pernah meminta kunci dokumen, jadi tidak ada urutan kunci baru.
// Tulis atomik lewat `writeFileAtomic` (tanpa fsync). File rusak → disisihkan ke `folders.json.corrupt-<ms>`, lanjut kosong.
import { randomBytes } from 'node:crypto';
import { copyFile, mkdir, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { LakarError, SLUG_PATTERN, errorMessage } from '@lakar/schema';
import { writeFileAtomic } from './assets.js';

export const FOLDERS_FILE = 'folders.json';
/** Panjang maksimum nama folder (sesudah dipangkas). */
export const FOLDER_NAME_MAX = 60;
/** Id folder: `f` + 10 karakter [a-z0-9]; stabil, rename tidak mengubahnya. */
export const FOLDER_ID_PATTERN = /^f[a-z0-9]{10}$/;

export type Folder = { id: string; name: string; createdAt: string };
/** Isi `folders.json`; `membership` slug → id folder (satu slug paling banyak satu folder). */
type FolderData = { version: 1; folders: Folder[]; membership: Record<string, string> };

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function newFolderId(): string {
  const bytes = randomBytes(10);
  let id = 'f';
  for (const b of bytes) id += ID_CHARS[b % ID_CHARS.length];
  return id;
}

/** Nama dipangkas, 1–60 karakter; selain itu SCHEMA_INVALID. */
export function folderName(raw: string): string {
  const name = raw.trim();
  if (name.length < 1 || name.length > FOLDER_NAME_MAX) {
    throw new LakarError('SCHEMA_INVALID', `nama folder harus 1–${FOLDER_NAME_MAX} karakter`, { hint: 'mis. "Client work"' });
  }
  return name;
}

const empty = (): FolderData => ({ version: 1, folders: [], membership: {} });

/** Folder `slug` (null = root). Hanya properti milik sendiri: slug seperti `constructor` tidak membaca Object.prototype. */
export const memberOf = (membership: Readonly<Record<string, string>>, slug: string): string | null => (Object.hasOwn(membership, slug) ? membership[slug]! : null);

/** Validasi bentuk isi file; bentuk salah → undefined (dianggap rusak). Keanggotaan ke folder yang tidak ada dibuang. */
function decode(raw: unknown): FolderData | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const { folders, membership } = raw as { folders?: unknown; membership?: unknown };
  if (!Array.isArray(folders) || !membership || typeof membership !== 'object' || Array.isArray(membership)) return undefined;
  const out = empty();
  const ids = new Set<string>();
  for (const f of folders) {
    if (!f || typeof f !== 'object') return undefined;
    const { id, name, createdAt } = f as Record<string, unknown>;
    if (typeof id !== 'string' || !FOLDER_ID_PATTERN.test(id) || typeof name !== 'string' || typeof createdAt !== 'string' || ids.has(id)) return undefined;
    ids.add(id);
    out.folders.push({ id, name, createdAt });
  }
  for (const [slug, id] of Object.entries(membership as Record<string, unknown>)) {
    if (SLUG_PATTERN.test(slug) && typeof id === 'string' && ids.has(id)) out.membership[slug] = id;
  }
  return out;
}

/** Set keanggotaan `slug` (null = root); true bila berubah. */
function setMember(d: FolderData, slug: string, id: string | null): boolean {
  if (memberOf(d.membership, slug) === id) return false;
  if (id === null) delete d.membership[slug];
  else d.membership[slug] = id;
  return true;
}

const notFound = (id: string) => new LakarError('NOT_FOUND', `folder ${id} tidak ada`, { hint: 'pakai id dari GET /viewer/folders' });

export class FolderStore {
  readonly dataDir: string;
  readonly path: string;
  readonly log: (message: string) => void;
  #data: FolderData | undefined;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(dataDir: string, log: (message: string) => void = (m) => console.warn(m)) {
    this.dataDir = dataDir;
    this.path = join(dataDir, FOLDERS_FILE);
    this.log = log;
  }

  /** Jalankan `fn` berurutan (satu per satu) dengan data termuat. */
  #run<T>(fn: (data: FolderData) => Promise<T> | T): Promise<T> {
    const next = this.#queue.then(async () => fn(await this.#load()));
    this.#queue = next.catch(() => undefined);
    return next;
  }

  async #load(): Promise<FolderData> {
    if (this.#data) return this.#data;
    let text: string;
    try {
      text = await readFile(this.path, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return (this.#data = empty());
      throw e;
    }
    let data: FolderData | undefined;
    try {
      data = decode(JSON.parse(text));
    } catch {
      data = undefined;
    }
    if (!data) {
      // Salinan rusak harus aman sebelum tulis berikut menimpa file asli: rename, atau salin bila rename gagal;
      // keduanya gagal → error (jangan lanjut kosong).
      const aside = `${this.path}.corrupt-${Date.now()}`;
      try {
        await rename(this.path, aside);
      } catch (e) {
        try {
          await copyFile(this.path, aside);
        } catch (e2) {
          this.log(`lakard: ${FOLDERS_FILE} rusak dan gagal disisihkan (${errorMessage(e)}; ${errorMessage(e2)})`);
          throw e2;
        }
      }
      this.log(`lakard: ${FOLDERS_FILE} rusak, disimpan di ${aside}; folder mulai kosong`);
      data = empty();
    }
    return (this.#data = data);
  }

  /** Tulis `next` ke disk lalu jadikan cache (gagal tulis → cache lama tetap). */
  async #save(next: FolderData): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFileAtomic(this.path, `${JSON.stringify(next, null, 2)}\n`);
    this.#data = next;
  }

  /** Ubah salinan data; `fn` mengembalikan false bila tidak ada perubahan (tanpa tulis). */
  #mutate<T>(fn: (draft: FolderData) => { changed: boolean; result: T }): Promise<T> {
    return this.#run(async (data) => {
      const draft = structuredClone(data);
      const { changed, result } = fn(draft);
      if (changed) await this.#save(draft);
      return result;
    });
  }

  /** Folder urut nama + keanggotaan slug yang lolos `active` (slug aktif yang ada). */
  list(active: (slug: string) => Promise<boolean>): Promise<{ folders: Folder[]; membership: Record<string, string> }> {
    return this.#run(async (data) => {
      const membership: Record<string, string> = {};
      for (const [slug, id] of Object.entries(data.membership)) if (await active(slug)) membership[slug] = id;
      const folders = [...data.folders].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.createdAt.localeCompare(b.createdAt));
      return { folders, membership };
    });
  }

  create(rawName: string): Promise<Folder> {
    const name = folderName(rawName);
    return this.#mutate((d) => {
      this.#unique(d, name);
      let id = newFolderId();
      while (d.folders.some((f) => f.id === id)) id = newFolderId();
      const folder: Folder = { id, name, createdAt: new Date().toISOString() };
      d.folders.push(folder);
      return { changed: true, result: folder };
    });
  }

  rename(id: string, rawName: string): Promise<Folder> {
    const name = folderName(rawName);
    return this.#mutate((d) => {
      const folder = d.folders.find((f) => f.id === id);
      if (!folder) throw notFound(id);
      if (folder.name === name) return { changed: false, result: folder };
      this.#unique(d, name, id);
      folder.name = name;
      return { changed: true, result: folder };
    });
  }

  /** Hapus folder; file di dalamnya kembali ke root (tidak ada file yang dihapus). Mengembalikan slug yang dilepas. */
  remove(id: string): Promise<string[]> {
    return this.#mutate((d) => {
      const i = d.folders.findIndex((f) => f.id === id);
      if (i < 0) throw notFound(id);
      d.folders.splice(i, 1);
      const moved: string[] = [];
      for (const [slug, fid] of Object.entries(d.membership)) {
        if (fid !== id) continue;
        delete d.membership[slug];
        moved.push(slug);
      }
      return { changed: true, result: moved.sort() };
    });
  }

  /** Pindahkan `slug` ke folder `id` (null = root). Folder tidak ada → NOT_FOUND. Keberadaan slug diperiksa pemanggil. */
  move(slug: string, id: string | null): Promise<void> {
    return this.#mutate((d) => {
      if (id !== null && !d.folders.some((f) => f.id === id)) throw notFound(id);
      return { changed: setMember(d, slug, id), result: undefined };
    });
  }

  /** File di-rename: `to` mengikuti keanggotaan `from` (root → root, sisa lama `to` dibuang), `from` dilepas. */
  onRenamed(from: string, to: string): Promise<void> {
    return this.#mutate((d) => {
      if (from === to) return { changed: false, result: undefined };
      const changed = setMember(d, to, memberOf(d.membership, from));
      return { changed: setMember(d, from, null) || changed, result: undefined };
    });
  }

  /** File diarsipkan/dihapus/dibuat ulang/dipulihkan: keluar dari folder. */
  onRemoved(slug: string): Promise<void> {
    return this.#mutate((d) => ({ changed: setMember(d, slug, null), result: undefined }));
  }

  /** File diduplikasi: salinan mengikuti keanggotaan sumber (sumber di root → salinan di root). */
  onDuplicated(from: string, to: string): Promise<void> {
    return this.#mutate((d) => ({ changed: setMember(d, to, memberOf(d.membership, from)), result: undefined }));
  }

  #unique(d: FolderData, name: string, except?: string) {
    const key = name.toLowerCase();
    const clash = d.folders.find((f) => f.id !== except && f.name.toLowerCase() === key);
    if (clash) throw new LakarError('CONFLICT', `folder "${clash.name}" sudah ada`, { hint: 'pilih nama lain' });
  }
}
