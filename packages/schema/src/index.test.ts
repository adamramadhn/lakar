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

  it('LakarDocument: schemaVersion = SCHEMA_VERSION (13) dan minimal 1 halaman; v1..v10 hanya lewat migrasi (@lakar/core)', () => {
    expect(SCHEMA_VERSION).toBe(13);
    const doc = { schemaVersion: SCHEMA_VERSION, id: 'Dddddddd', rev: 0, pages: [{ id: 'Pppppppp', name: 'Page 1', children: [] }] };
    expect(LakarDocument.safeParse(doc).success).toBe(true);
    expect(LakarDocument.safeParse({ ...doc, schemaVersion: 14 }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, schemaVersion: 10 }).success).toBe(false);
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

  it('fixRequest (v12): opsional; status open/done/failed/cancelled, agent+note opsional, field asing ditolak (strict)', () => {
    const doc = { schemaVersion: SCHEMA_VERSION, id: 'Dddddddd', rev: 0, pages: [{ id: 'Pppppppp', name: 'Page 1', children: [] }] };
    const msg = { author: { kind: 'user', name: 'You' }, text: 'halo', at: '2026-11-24T00:00:00Z' };
    const thread = { id: 'Ttttttt1', pageId: 'Pppppppp', x: 10, y: 20, status: 'open', messages: [msg] };
    const open = { status: 'open', at: '2026-11-24T01:00:00Z' };
    // Tanpa fixRequest dan tiap status valid; agent dan note opsional.
    expect(LakarDocument.safeParse({ ...doc, comments: [thread] }).success).toBe(true);
    expect(LakarDocument.safeParse({ ...doc, comments: [{ ...thread, fixRequest: open }] }).success).toBe(true);
    expect(LakarDocument.safeParse({ ...doc, comments: [{ ...thread, fixRequest: { status: 'done', agent: 'claude-code', at: 'x', note: 'selesai' } }] }).success).toBe(true);
    expect(LakarDocument.safeParse({ ...doc, comments: [{ ...thread, fixRequest: { status: 'failed', agent: 'codex', at: 'x', note: 'gagal' } }] }).success).toBe(true);
    expect(LakarDocument.safeParse({ ...doc, comments: [{ ...thread, fixRequest: { status: 'cancelled', at: 'x' } }] }).success).toBe(true);
    // Status asing, tanpa at, agent/note melebihi batas, dan field asing ditolak.
    expect(LakarDocument.safeParse({ ...doc, comments: [{ ...thread, fixRequest: { status: 'working', at: 'x' } }] }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, comments: [{ ...thread, fixRequest: { status: 'open' } }] }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, comments: [{ ...thread, fixRequest: { ...open, agent: 'a'.repeat(81) } }] }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, comments: [{ ...thread, fixRequest: { ...open, note: 'n'.repeat(4001) } }] }).success).toBe(false);
    expect(LakarDocument.safeParse({ ...doc, comments: [{ ...thread, fixRequest: { ...open, foo: 1 } }] }).success).toBe(false);
  });

  it('interactions/flows (v13): opsional; strict — navigate/back/openLink, trigger enum, transisi', () => {
    const doc = { schemaVersion: SCHEMA_VERSION, id: 'Dddddddd', rev: 0, pages: [{ id: 'Pppppppp', name: 'Page 1', children: [{ ...board, id: 'Bbbbbbb1', children: [] }] }] };
    const tap = { id: 'Intr0001', trigger: 'tap', action: { kind: 'navigate', boardId: 'Bbbbbbb1' } };
    const node = (interactions: unknown) => ({ type: 'rect', name: 'R', id: 'Rrrrrrr1', ...(interactions !== undefined ? { interactions } : {}) });
    const docWith = (children: unknown[], flows?: unknown) => ({ ...doc, pages: [{ id: 'Pppppppp', name: 'Page 1', children }], ...(flows !== undefined ? { flows } : {}) });
    // Node anak dan board boleh ber-interactions; bentuk lengkap dan minimal sama-sama sah.
    expect(LakarDocument.safeParse(docWith([{ ...board, id: 'Bbbbbbb1', children: [node([tap])] }])).success).toBe(true);
    expect(LakarDocument.safeParse(docWith([{ ...board, id: 'Bbbbbbb1', interactions: [{ ...tap, action: { kind: 'back' } }], children: [] }])).success).toBe(true);
    expect(LakarDocument.safeParse(docWith([{ ...board, id: 'Bbbbbbb1', children: [node([{ ...tap, transition: { kind: 'slide', direction: 'left', durationMs: 250, easing: 'ease-out' } }])] }])).success).toBe(true);
    expect(LakarDocument.safeParse(docWith([{ ...board, id: 'Bbbbbbb1', children: [node([{ ...tap, action: { kind: 'openLink', url: 'https://example.com' } }])] }])).success).toBe(true);
    // Trigger/aksi/kunci asing dan id pendek ditolak.
    expect(LakarDocument.safeParse(docWith([{ ...board, id: 'Bbbbbbb1', children: [node([{ ...tap, trigger: 'click' }])] }])).success).toBe(false);
    expect(LakarDocument.safeParse(docWith([{ ...board, id: 'Bbbbbbb1', children: [node([{ ...tap, action: { kind: 'scrollTo', nodeId: 'Rrrrrrr1' } }])] }])).success).toBe(false);
    expect(LakarDocument.safeParse(docWith([{ ...board, id: 'Bbbbbbb1', children: [node([{ ...tap, id: 'pendek' }])] }])).success).toBe(false);
    expect(LakarDocument.safeParse(docWith([{ ...board, id: 'Bbbbbbb1', children: [node([{ ...tap, foo: 1 }])] }])).success).toBe(false);
    // flows: {id, name, startBoardId}; strict.
    const flow = { id: 'Flow0001', name: 'Utama', startBoardId: 'Bbbbbbb1' };
    expect(LakarDocument.safeParse(docWith([{ ...board, id: 'Bbbbbbb1', children: [] }], [flow])).success).toBe(true);
    expect(LakarDocument.safeParse(docWith([{ ...board, id: 'Bbbbbbb1', children: [] }], [{ ...flow, foo: 1 }])).success).toBe(false);
    expect(LakarDocument.safeParse(docWith([{ ...board, id: 'Bbbbbbb1', children: [] }], [{ ...flow, startBoardId: 'x' }])).success).toBe(false);
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
