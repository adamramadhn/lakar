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

  it('enum ErrorCode AD-11 berisi 13 kode (NOT_SUPPORTED untuk transport file)', () => {
    expect(ErrorCode.options).toHaveLength(13);
    expect(ErrorCode.options).toContain('VERSION_MISMATCH');
    expect(ErrorCode.options).toContain('NOT_SUPPORTED');
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
    ['frame wrap true (v9)', { type: 'frame', name: 'F', layout: 'row', wrap: true }, true],
    ['frame wrap false (v9)', { type: 'frame', name: 'F', layout: 'row', wrap: false }, true],
    ['frame wrap bukan boolean ditolak', { type: 'frame', name: 'F', layout: 'row', wrap: 'wrap' }, false],
    ['frame wrap null ditolak', { type: 'frame', name: 'F', layout: 'row', wrap: null }, false],
    ['wrap di node lain ditolak', { type: 'rect', name: 'R', wrap: true }, false],
    ['wrap true di text ditolak (enum auto|wrap|fixed)', { type: 'text', name: 'T', content: 'x', size: 14, wrap: true }, false],
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

  it('LakarDocument: schemaVersion = SCHEMA_VERSION (10) dan minimal 1 halaman; v1..v9 hanya lewat migrasi (@lakar/core)', () => {
    expect(SCHEMA_VERSION).toBe(10);
    const doc = { schemaVersion: SCHEMA_VERSION, id: 'Dddddddd', rev: 0, pages: [{ id: 'Pppppppp', name: 'Page 1', children: [] }] };
    expect(LakarDocument.safeParse(doc).success).toBe(true);
    expect(LakarDocument.safeParse({ ...doc, schemaVersion: 11 }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, schemaVersion: 9 }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, schemaVersion: 8 }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, schemaVersion: 7 }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, schemaVersion: 6 }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, schemaVersion: 5 }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, schemaVersion: 4 }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, schemaVersion: 3 }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, schemaVersion: 2 }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, schemaVersion: 1 }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, pages: [] }).success).toBe(false);
  });

  it('comments (v10): opsional; thread strict — pin layer/titik bebas, status open/resolved, resolvedAt opsional', () => {
    const doc = { schemaVersion: SCHEMA_VERSION, id: 'Dddddddd', rev: 0, pages: [{ id: 'Pppppppp', name: 'Page 1', children: [] }] };
    const msg = { author: { kind: 'agent', name: 'claude-code' }, text: 'halo', at: '2026-11-24T00:00:00Z' };
    const thread = { id: 'Ttttttt1', pageId: 'Pppppppp', x: 10, y: 20, status: 'open', messages: [msg] };
    expect(LakarDocument.safeParse({ ...doc, comments: [thread] }).success).toBe(true);
    expect(LakarDocument.safeParse({ ...doc, comments: [{ ...thread, nodeId: 'Nnnnnnn1' }] }).success).toBe(true);
    expect(LakarDocument.safeParse({ ...doc, comments: [{ ...thread, status: 'resolved', resolvedAt: '2026-11-24T01:00:00Z' }] }).success).toBe(true);
    // Status asing, pesan kosong, field asing, dan komentar non-array ditolak (strict).
    expect(LakarDocument.safeParse({ ...doc, comments: [{ ...thread, status: 'closed' }] }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, comments: [{ ...thread, messages: [] }] }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, comments: [{ ...thread, foo: 1 }] }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, comments: [{ ...thread, messages: [{ ...msg, author: { kind: 'robot', name: 'x' } }] }] }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, comments: {} }).success).toBe(false);
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
