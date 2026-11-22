import { describe, expect, it } from 'vitest';
import {
  BoardNode,
  ErrorCode,
  FrameInput,
  LakarDocument,
  LakarError,
  NodeInput,
  PACKAGE,
  SCHEMA_VERSION,
  Slug,
  XY_HINT,
  zodToLakarError,
} from './index.js';

const board = { type: 'board', name: 'B', x: 0, y: 0, width: 390, height: 844, screen: 'mobile' } as const;

describe('@lakar/schema', () => {
  it('mengekspor nama paket', () => {
    expect(PACKAGE).toBe('@lakar/schema');
  });

  it('enum ErrorCode AD-11 berisi 12 kode', () => {
    expect(ErrorCode.options).toHaveLength(12);
    expect(ErrorCode.options).toContain('VERSION_MISMATCH');
  });

  it.each([
    ['board valid', board, true],
    ['board tanpa screen', { ...board, screen: undefined }, false],
    ['board screen asing', { ...board, screen: 'tablet' }, false],
    ['text valid', { type: 'text', name: 'T', content: 'hai', size: 16 }, true],
    ['text warna hex8', { type: 'text', name: 'T', content: 'hai', size: 16, color: '#11223344' }, true],
    ['text warna rgba ditolak', { type: 'text', name: 'T', content: 'hai', size: 16, color: 'rgba(0,0,0,1)' }, false],
    ['text dengan family (v1)', { type: 'text', name: 'T', content: 'a', size: 16, family: 'Inter' }, true],
    ['text dengan x ditolak (flow)', { type: 'text', name: 'T', content: 'a', size: 16, x: 10 }, false],
    ['text tanpa name ditolak', { type: 'text', content: 'a', size: 16 }, false],
    ['frame flow', { type: 'frame', name: 'F', layout: 'row', gap: -4, padding: 8, align: 'center', justify: 'space-between' }, true],
    ['frame flow dengan x ditolak', { type: 'frame', name: 'F', x: 1 }, false],
    ['frame absolute dengan x/y', { type: 'frame', name: 'F', position: 'absolute', x: 1, y: 2 }, true],
    ['frame layout asing', { type: 'frame', name: 'F', layout: 'wrap' }, false],
    ['rect kini dalam katalog', { type: 'rect', name: 'R' }, true],
    ['tipe asing', { type: 'image', name: 'I' }, false],
  ])('NodeInput: %s', (_label, input, ok) => {
    expect(NodeInput.safeParse(input).success).toBe(ok);
  });

  it('x pada node flow → SCHEMA_INVALID dengan hint x/y', () => {
    const r = NodeInput.safeParse({ type: 'text', name: 'T', content: 'a', size: 16, x: 10 });
    expect(r.success).toBe(false);
    const e = zodToLakarError(r.error!, 'add');
    expect(e).toBeInstanceOf(LakarError);
    expect(e.code).toBe('SCHEMA_INVALID');
    expect(e.hint).toBe(XY_HINT);
    const f = FrameInput.safeParse({ type: 'frame', name: 'F', y: 3 });
    expect(zodToLakarError(f.error!, 'add').hint).toBe(XY_HINT);
  });

  it('BoardNode rekursif (frame dalam frame)', () => {
    const node = {
      ...board,
      id: 'AAAAAAAA',
      children: [{ type: 'frame', name: 'F', id: 'BBBBBBBB', children: [{ type: 'text', name: 'T', id: 'CCCCCCCC', content: 'x', size: 12 }] }],
    };
    expect(BoardNode.safeParse(node).success).toBe(true);
    expect(BoardNode.safeParse({ ...node, id: 'short' }).success).toBe(false);
  });

  it('LakarDocument: schemaVersion = SCHEMA_VERSION (7) dan minimal 1 halaman; v1..v6 hanya lewat migrasi (@lakar/core)', () => {
    expect(SCHEMA_VERSION).toBe(7);
    const doc = { schemaVersion: SCHEMA_VERSION, id: 'Dddddddd', rev: 0, pages: [{ id: 'Pppppppp', name: 'Page 1', children: [] }] };
    expect(LakarDocument.safeParse(doc).success).toBe(true);
    expect(LakarDocument.safeParse({ ...doc, schemaVersion: 8 }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, schemaVersion: 6 }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, schemaVersion: 5 }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, schemaVersion: 4 }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, schemaVersion: 3 }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, schemaVersion: 2 }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, schemaVersion: 1 }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, pages: [] }).success).toBe(false);
  });

  it.each([
    ['tracer-a', true],
    ['a', true],
    ['../x', false],
    ['A B', false],
    ['', false],
    ['-a', false],
    ['a'.repeat(65), false],
  ])('Slug %j → %s', (slug, ok) => {
    expect(Slug.safeParse(slug).success).toBe(ok);
  });
});
