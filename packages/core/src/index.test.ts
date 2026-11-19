import { describe, expect, it } from 'vitest';
import { ID_PATTERN, LakarError, type LakarDocument } from '@lakar/schema';
import { IdAllocator, PACKAGE, beginTransaction, collectIds, createDocument, parseDocument } from './index.js';

const boardIn = { type: 'board', name: 'Tracer', x: 0, y: 0, width: 390, height: 844, screen: 'mobile' };
const fixedNow = () => new Date('2026-11-17T00:00:00.000Z');

describe('@lakar/core', () => {
  it('mengekspor nama paket', () => {
    expect(PACKAGE).toBe('@lakar/core');
  });

  it('createDocument: 1 halaman, rev 0, valid', () => {
    const doc = createDocument();
    expect(doc.rev).toBe(0);
    expect(doc.pages).toHaveLength(1);
    expect(parseDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it('parseDocument: rusak → SCHEMA_INVALID', () => {
    expect(() => parseDocument({ schemaVersion: 1 })).toThrow(LakarError);
    try {
      parseDocument({ nope: true });
    } catch (e) {
      expect((e as LakarError).code).toBe('SCHEMA_INVALID');
    }
  });

  it('IdAllocator: 8 karakter, unik, menghindari ID yang ada', () => {
    const a = new IdAllocator();
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const id = a.next();
      expect(id).toMatch(ID_PATTERN);
      seen.add(id);
    }
    expect(seen.size).toBe(2000);
    // sumber acak konstan: ID pertama sama dengan yang sudah ada → harus berbeda / gagal jelas
    const constant = new IdAllocator(['AAAAAAAA'], () => 0);
    expect(() => constant.next()).toThrow(/unik/);
  });

  it('commit: rev +1, entri riwayat, created berupa list (nama ganda tetap ada)', () => {
    const doc = createDocument();
    const before = structuredClone(doc);
    const tx = beginTransaction(doc, { sessionId: 's1', now: fixedNow });
    const b = tx.add(null, boardIn);
    const f = tx.add(b, { type: 'frame', name: 'Isi', layout: 'column', gap: 8 });
    tx.add(f, { type: 'text', name: 'Judul', content: 'A', size: 32 });
    tx.add(f, { type: 'text', name: 'Judul', content: 'B', size: 32 });
    const r = tx.commit('tracer board');
    expect(r.doc.rev).toBe(1);
    expect(r.entry).toEqual({ rev: 1, sessionId: 's1', description: 'tracer board', opsSummary: 'add×4', at: '2026-11-17T00:00:00.000Z' });
    expect(r.created.map((c) => c.path)).toEqual([['Tracer'], ['Tracer', 'Isi'], ['Tracer', 'Isi', 'Judul'], ['Tracer', 'Isi', 'Judul']]);
    expect(new Set(r.created.map((c) => c.id)).size).toBe(4);
    expect(parseDocument(r.doc)).toEqual(r.doc);
    expect(doc).toEqual(before); // dokumen asli tidak dimutasi
    expect(tx.open).toBe(false);
    expect(() => tx.add(null, boardIn)).toThrow(/ditutup/);
  });

  it('ID baru tidak bertabrakan dengan ID dokumen yang ada', () => {
    let doc: LakarDocument = createDocument();
    for (let i = 0; i < 3; i++) {
      const tx = beginTransaction(doc, { sessionId: 's' });
      tx.add(null, boardIn);
      doc = tx.commit('x').doc;
    }
    const ids = collectIds(doc);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rollback: dokumen asli utuh', () => {
    const doc = createDocument();
    const before = structuredClone(doc);
    const tx = beginTransaction(doc, { sessionId: 's' });
    tx.add(null, boardIn);
    tx.rollback();
    expect(doc).toEqual(before);
    expect(tx.open).toBe(false);
  });

  it.each([
    ['text di halaman', null, { type: 'text', name: 'T', content: 'a', size: 12 }, 'SCHEMA_INVALID'],
    ['x pada text flow', 'BOARD', { type: 'text', name: 'T', content: 'a', size: 12, x: 10 }, 'SCHEMA_INVALID'],
    ['parent tidak ada', 'ZZZZZZZZ', { type: 'text', name: 'T', content: 'a', size: 12 }, 'NOT_FOUND'],
    ['board di dalam board', 'BOARD', boardIn, 'SCHEMA_INVALID'],
  ])('add ditolak: %s', (_l, parent, node, code) => {
    const tx = beginTransaction(createDocument(), { sessionId: 's' });
    const b = tx.add(null, boardIn);
    const parentId = parent === 'BOARD' ? b : parent;
    try {
      tx.add(parentId, node);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(LakarError);
      expect((e as LakarError).code).toBe(code);
    }
  });

  it('createDocument berisi tokens kosong', () => {
    expect(createDocument().tokens).toEqual({});
  });

  it.each([
    ['text', { type: 'text', name: 'T', content: 'a', size: 12 }],
    ['rect', { type: 'rect', name: 'R', width: 10, height: 10 }],
    ['ellipse', { type: 'ellipse', name: 'E', width: 10, height: 10, inner: 0.5 }],
    ['path', { type: 'path', name: 'P', d: 'M0 0L1 1', viewBox: [0, 0, 1, 1] }],
    ['icon', { type: 'icon', name: 'Icon / lucide / house', icon: 'house', lib: 'lucide', size: 16 }],
  ])('add daun %s: tanpa children, valid, dan tidak bisa menjadi parent', (type, node) => {
    const tx = beginTransaction(createDocument(), { sessionId: 's' });
    const b = tx.add(null, boardIn);
    const f = tx.add(b, { type: 'frame', name: 'F' });
    const leaf = tx.add(f, node);
    try {
      tx.add(leaf, { type: 'rect', name: 'Anak' });
      expect.unreachable();
    } catch (e) {
      expect((e as LakarError).code).toBe('SCHEMA_INVALID');
      expect((e as LakarError).message).toContain(type);
    }
    const r = tx.commit('daun');
    const stored = (r.doc.pages[0]!.children[0]!.children[0] as { children: Record<string, unknown>[] }).children[0]!;
    expect(stored).toEqual({ ...node, id: leaf });
    expect('children' in stored).toBe(false);
    expect(parseDocument(r.doc)).toEqual(r.doc);
  });

  it('commit dengan token tak dikenal → TOKEN_UNKNOWN, transaksi tertutup, dokumen asli utuh', () => {
    const doc = createDocument();
    const before = structuredClone(doc);
    const tx = beginTransaction(doc, { sessionId: 's' });
    const b = tx.add(null, boardIn);
    tx.add(b, { type: 'text', name: 'T', content: 'a', size: 12, color: { $token: 'colors.text-primary' } });
    try {
      tx.commit('token');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(LakarError);
      expect((e as LakarError).code).toBe('TOKEN_UNKNOWN');
      expect((e as LakarError).message).toContain('colors.text-primary');
    }
    expect(tx.open).toBe(false);
    expect(doc).toEqual(before);
  });

  it('commit dengan token salah tipe → SCHEMA_INVALID, transaksi tertutup, dokumen asli utuh', () => {
    const doc = { ...createDocument(), tokens: { 'spacing.2': 16 } };
    const before = structuredClone(doc);
    const tx = beginTransaction(doc, { sessionId: 's' });
    const b = tx.add(null, boardIn);
    tx.add(b, { type: 'text', name: 'T', content: 'a', size: 12, color: { $token: 'spacing.2' } });
    try {
      tx.commit('token');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(LakarError);
      expect((e as LakarError).code).toBe('SCHEMA_INVALID');
      expect((e as LakarError).message).toContain('spacing.2');
    }
    expect(tx.open).toBe(false);
    expect(doc).toEqual(before);
  });

  it('commit dengan token yang terdefinisi: ref disimpan apa adanya', () => {
    const doc = { ...createDocument(), tokens: { 'colors.text-primary': '#1A1A1A' } };
    const tx = beginTransaction(doc, { sessionId: 's' });
    const b = tx.add(null, boardIn);
    tx.add(b, { type: 'text', name: 'T', content: 'a', size: 12, color: { $token: 'colors.text-primary' } });
    const r = tx.commit('token');
    expect(r.doc.pages[0]!.children[0]!.children[0]).toMatchObject({ color: { $token: 'colors.text-primary' } });
  });
});
