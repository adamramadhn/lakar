// Loader korpus dokumen (spine model-dokumen AD-3): `tests/fixtures/docs/v<n>/*.lakar.json`. Dipakai bersama oleh
// tes murni (`tests/doc-corpus.test.ts`) dan tes render (`packages/render/test/corpus.test.ts`). Tanpa validasi skema:
// loader hanya memastikan JSON terbaca dan folder versi cocok dengan `schemaVersion` di file.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Akar korpus: `tests/fixtures/docs`. */
export const DOC_CORPUS_DIR = join(HERE, '..', 'fixtures', 'docs');
/** Folder aset korpus: `<sha256>.png`, dirujuk fill `image` lewat `assetId`. */
export const DOC_CORPUS_ASSETS_DIR = join(DOC_CORPUS_DIR, 'assets');

export type CorpusDoc = {
  /** Versi dari nama folder `v<n>` (= `raw.schemaVersion`). */
  version: number;
  /** Nama file tanpa `.lakar.json`. */
  name: string;
  /** Path absolut file. */
  path: string;
  /** Isi JSON apa adanya (belum dimigrasi). */
  raw: Record<string, unknown>;
};

const VERSION_DIR = /^v([1-9][0-9]*)$/;
const DOC_FILE = /\.lakar\.json$/;

/**
 * Baca semua `v<n>/*.lakar.json` di `root`, urut versi lalu nama. Melempar Error yang menyebut path bila JSON
 * rusak, isi bukan objek, atau `schemaVersion` di file ≠ `n` dari foldernya.
 */
export function loadDocCorpus(root: string = DOC_CORPUS_DIR): CorpusDoc[] {
  const out: CorpusDoc[] = [];
  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && VERSION_DIR.test(d.name))
    .map((d) => ({ dir: d.name, version: Number(VERSION_DIR.exec(d.name)![1]) }))
    .sort((a, b) => a.version - b.version);
  for (const { dir, version } of dirs) {
    const files = readdirSync(join(root, dir))
      .filter((f) => DOC_FILE.test(f))
      .sort();
    for (const file of files) {
      const path = join(root, dir, file);
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(path, 'utf8'));
      } catch (e) {
        throw new Error(`korpus ${path}: JSON rusak (${(e as Error).message})`);
      }
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error(`korpus ${path}: isi harus objek JSON dokumen Lakar`);
      const sv = (raw as Record<string, unknown>).schemaVersion;
      if (sv !== version) throw new Error(`korpus ${path}: schemaVersion ${JSON.stringify(sv)} tidak cocok dengan folder ${dir}`);
      out.push({ version, name: file.replace(DOC_FILE, ''), path, raw: raw as Record<string, unknown> });
    }
  }
  return out;
}

/** Versi 1..`latest` yang tidak punya satu fixture pun di korpus. */
export function missingVersions(docs: readonly Pick<CorpusDoc, 'version'>[], latest: number): number[] {
  const have = new Set(docs.map((d) => d.version));
  return Array.from({ length: latest }, (_, i) => i + 1).filter((v) => !have.has(v));
}

/** Semua board di dokumen (lintas halaman), untuk tes render per board. */
export function boardsOf(doc: { pages: readonly { name: string; children: readonly { id: string; name: string }[] }[] }): { page: string; id: string; name: string }[] {
  return doc.pages.flatMap((p) => p.children.map((b) => ({ page: p.name, id: b.id, name: b.name })));
}
