import { describe, expect, it } from 'vitest';
import { LakarError } from '@lakar/schema';
import { MIGRATIONS, createDocument, migrateDocument, parseDocument, type MigrationRegistry } from './index.js';

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(LakarError);
    return (e as LakarError).code;
  }
  return expect.unreachable('seharusnya melempar') as never;
};

/** Rantai 1→2→3 tiruan: v2 menambah `meta`, v3 mengganti nama `meta.note` → `meta.notes`. */
const chain: MigrationRegistry = {
  1: (d) => ({ ...d, schemaVersion: 2, meta: { note: 'v2' } }),
  2: (d) => {
    const meta = d.meta as { note: string };
    d.schemaVersion = 3; // boleh memutasi argumen (sudah salinan)
    d.meta = { notes: [meta.note, 'v3'] };
    return d;
  },
};

describe('migrateDocument', () => {
  it('registri resmi kosong; versi kini → apa adanya (objek yang sama)', () => {
    expect(Object.keys(MIGRATIONS)).toEqual([]);
    const doc = JSON.parse(JSON.stringify(createDocument()));
    expect(migrateDocument(doc)).toBe(doc);
  });

  it('rantai 1→2→3 dijalankan berurutan, input tidak dimutasi', () => {
    const raw = { schemaVersion: 1, id: 'Dddddddd' };
    const snapshot = structuredClone(raw);
    expect(migrateDocument(raw, { migrations: chain, target: 3 })).toEqual({ schemaVersion: 3, id: 'Dddddddd', meta: { notes: ['v2', 'v3'] } });
    expect(raw).toEqual(snapshot);
    expect(migrateDocument({ schemaVersion: 2, meta: { note: 'x' } }, { migrations: chain, target: 3 })).toEqual({ schemaVersion: 3, meta: { notes: ['x', 'v3'] } });
  });

  it('lebih baru dari target → VERSION_MISMATCH', () => {
    expect(codeOf(() => migrateDocument({ schemaVersion: 2 }))).toBe('VERSION_MISMATCH');
    expect(codeOf(() => parseDocument({ ...createDocument(), schemaVersion: 99 }))).toBe('VERSION_MISMATCH');
  });

  it('langkah hilang → VERSION_MISMATCH (sebelum langkah apa pun dijalankan)', () => {
    let ran = false;
    const gap: MigrationRegistry = {
      1: (d) => ((ran = true), { ...d, schemaVersion: 2 }),
    };
    expect(codeOf(() => migrateDocument({ schemaVersion: 1 }, { migrations: gap, target: 3 }))).toBe('VERSION_MISMATCH');
    expect(ran).toBe(false);
  });

  it.each([
    ['bukan objek', 'teks'],
    ['array', [1]],
    ['null', null],
    ['tanpa schemaVersion', { id: 'Dddddddd' }],
    ['versi 0', { schemaVersion: 0 }],
    ['versi pecahan', { schemaVersion: 1.5 }],
    ['versi string', { schemaVersion: '1' }],
  ])('%s → SCHEMA_INVALID', (_l, raw) => {
    expect(codeOf(() => migrateDocument(raw))).toBe('SCHEMA_INVALID');
  });

  it('langkah yang menghasilkan versi salah → Error biasa (bug migrasi)', () => {
    const bad: MigrationRegistry = { 1: (d) => ({ ...d, schemaVersion: 1 }) };
    expect(() => migrateDocument({ schemaVersion: 1 }, { migrations: bad, target: 2 })).toThrow(/migrasi 1 → 2/);
    try {
      migrateDocument({ schemaVersion: 1 }, { migrations: bad, target: 2 });
    } catch (e) {
      expect(e).not.toBeInstanceOf(LakarError);
    }
  });

  it('parseDocument = migrasi lalu validasi', () => {
    const doc = createDocument();
    expect(parseDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    expect(codeOf(() => parseDocument({ schemaVersion: 1, id: 'x' }))).toBe('SCHEMA_INVALID');
  });
});
