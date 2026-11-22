// Tes korpus dokumen (spine model-dokumen AD-3): setiap fixture `tests/fixtures/docs/v<n>/*.lakar.json` wajib
// bermigrasi ke SCHEMA_VERSION, lolos validasi, dan lolos resolve token. Render ada di `packages/render/test/corpus.test.ts`.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseDocument } from '../packages/core/src/index.ts';
import { NODE_TYPES, resolveTokens, SCHEMA_VERSION } from '../packages/schema/src/index.ts';
import { boardsOf, loadDocCorpus, missingVersions, type CorpusDoc } from './support/doc-corpus.ts';

const corpus = loadDocCorpus();

/** Kode LakarError yang dilempar `fn` (kelas bisa berasal dari salinan dist/src berbeda, jadi cek `code`). */
function thrownCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

type LooseNode = { type?: unknown; fills?: unknown; children?: unknown };
/** Semua node (board dan seluruh turunannya) di semua halaman dokumen mentah atau ter-parse. */
function allNodes(doc: unknown): LooseNode[] {
  const out: LooseNode[] = [];
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const n of list as LooseNode[]) {
      out.push(n);
      walk(n.children);
    }
  };
  for (const p of ((doc as { pages?: unknown }).pages as { children?: unknown }[] | undefined) ?? []) walk(p.children);
  return out;
}
/** Tipe fill yang dipakai node. */
const fillTypes = (n: LooseNode): string[] => (Array.isArray(n.fills) ? (n.fills as { type?: unknown }[]).map((f) => String(f.type)) : []);

const FILL_TYPES = ['solid', 'linear', 'radial', 'conic', 'noise', 'mesh', 'image'] as const;
const V2_ONLY_FILLS = new Set(['conic', 'noise', 'mesh']);

describe('korpus dokumen: cakupan versi', () => {
  it('setiap versi 1..SCHEMA_VERSION punya minimal satu fixture', () => {
    expect(missingVersions(corpus, SCHEMA_VERSION), 'versi tanpa fixture di tests/fixtures/docs').toEqual([]);
  });

  it('missingVersions mendeteksi versi yang kosong', () => {
    expect(missingVersions([{ version: 1 }], 3)).toEqual([2, 3]);
    expect(missingVersions([], 1)).toEqual([1]);
  });

  it('tidak ada fixture dengan versi di atas SCHEMA_VERSION', () => {
    expect(corpus.filter((d) => d.version > SCHEMA_VERSION).map((d) => d.path)).toEqual([]);
  });
});

describe('korpus dokumen: migrasi, validasi, resolve token', () => {
  it.each(corpus.map((d): [string, CorpusDoc] => [`v${d.version}/${d.name}`, d]))('%s', (_label, d) => {
    let doc;
    try {
      doc = parseDocument(d.raw);
    } catch (e) {
      throw new Error(`${d.path}: parseDocument gagal: ${(e as Error).message}`);
    }
    expect(doc.schemaVersion, d.path).toBe(SCHEMA_VERSION);
    try {
      resolveTokens(doc);
    } catch (e) {
      throw new Error(`${d.path}: resolveTokens gagal: ${(e as Error).message}`);
    }
  });

  it('fixture rusak (pages: []) ditolak SCHEMA_INVALID', () => {
    const broken = { ...structuredClone(corpus[0]!.raw), pages: [] };
    expect(thrownCode(() => parseDocument(broken))).toBe('SCHEMA_INVALID');
  });

  it('fixture v1 tidak memakai fill khusus v2 (conic/noise/mesh)', () => {
    const offenders = corpus
      .filter((d) => d.version === 1)
      .flatMap((d) => allNodes(d.raw).flatMap((n) => fillTypes(n).filter((t) => V2_ONLY_FILLS.has(t)).map((t) => `${d.path}: fill ${t}`)));
    expect(offenders).toEqual([]);
  });

  it('gabungan korpus mencakup semua tipe node dan semua jenis fill', () => {
    const nodes = corpus.flatMap((d) => allNodes(parseDocument(d.raw)));
    const types = new Set(nodes.map((n) => String(n.type)));
    const fills = new Set(nodes.flatMap(fillTypes));
    expect(NODE_TYPES.filter((t) => !types.has(t)), 'tipe node tanpa fixture').toEqual([]);
    expect(FILL_TYPES.filter((t) => !fills.has(t)), 'jenis fill tanpa fixture').toEqual([]);
  });

  it('boardsOf mengembalikan board dari semua halaman', () => {
    const d = corpus.find((x) => x.version === 1 && x.name === 'landing-dua-halaman')!;
    const doc = parseDocument(d.raw);
    expect(doc.pages.length).toBeGreaterThanOrEqual(2);
    const boards = boardsOf(doc);
    expect(boards.length).toBe(doc.pages.reduce((n, p) => n + p.children.length, 0));
    expect(new Set(boards.map((b) => b.page))).toEqual(new Set(doc.pages.map((p) => p.name)));
  });

  it('migrasi tidak memutasi raw fixture', () => {
    const v1 = corpus.find((d) => d.version === 1)!;
    const before = JSON.stringify(v1.raw);
    parseDocument(v1.raw);
    expect(JSON.stringify(v1.raw)).toBe(before);
  });
});

describe('korpus dokumen: loader', () => {
  let tmp: string | undefined;
  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  const write = (rel: string, body: string) => {
    tmp ??= mkdtempSync(join(tmpdir(), 'lakar-corpus-'));
    const path = join(tmp, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
    return path;
  };

  it('folder ≠ schemaVersion → error menyebut path file', () => {
    write('v1/ok.lakar.json', JSON.stringify({ schemaVersion: 1 }));
    const bad = write('v1/salah-folder.lakar.json', JSON.stringify({ schemaVersion: 2 }));
    expect(() => loadDocCorpus(tmp)).toThrow(bad);
  });

  it('JSON rusak → error menyebut path file', () => {
    const bad = write('v2/rusak.lakar.json', '{ "schemaVersion": 2, ');
    expect(() => loadDocCorpus(tmp)).toThrow(bad);
  });

  it('membaca v<n>/*.lakar.json saja, urut versi lalu nama', () => {
    write('v2/b.lakar.json', JSON.stringify({ schemaVersion: 2 }));
    write('v2/a.lakar.json', JSON.stringify({ schemaVersion: 2 }));
    write('v1/z.lakar.json', JSON.stringify({ schemaVersion: 1 }));
    write('v1/catatan.json', '{}');
    write('assets/x.lakar.json', '{}');
    expect(loadDocCorpus(tmp).map((d) => `${d.version}/${d.name}`)).toEqual(['1/z', '2/a', '2/b']);
  });

  it('fixture tidak valid di v2 → tes validasi menyebut nama file', () => {
    const bad = write('v2/node-asing.lakar.json', JSON.stringify({ ...corpus.find((d) => d.version === 2)!.raw, pages: [] }));
    const [d] = loadDocCorpus(tmp);
    expect(d!.path).toBe(bad);
    expect(d!.name).toBe('node-asing');
    expect(thrownCode(() => parseDocument(d!.raw))).toBe('SCHEMA_INVALID');
  });
});
