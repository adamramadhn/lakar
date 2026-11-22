// Kehadiran agen (aplikasi 5): turunan murni dari stream aktivitas + indeks dokumen, tanpa DOM.
import { describe, expect, it } from 'vitest';
import { activityReducer, initialActivity, sessionsForSlug, type ActivityCall, type ActivityEvent, type ActivityState } from './activity.ts';
import type { NodeInfo } from './format.ts';
import { CHANGED_MAX, agentPresence, callLocation, layerMarks } from './presence.ts';

const T0 = Date.parse('2026-11-22T10:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

let seq = 0;
const ev = (call: Partial<ActivityCall> & Pick<ActivityCall, 'callId' | 'status'>): ActivityEvent => ({
  seq: ++seq,
  type: 'call',
  call: { session: 'sess0001', client: 'claude-code', tool: 'execute', slug: 'a', startedAt: iso(T0), ...call },
});
const run = (...events: ActivityEvent[]): ActivityState => events.reduce((s, event) => activityReducer(s, { type: 'event', event }), initialActivity);

const node = (id: string, boardId: string, parentId?: string): [string, NodeInfo] => [id, { id, name: `N ${id}`, type: id === boardId ? 'board' : 'frame', boardId, pageIndex: 0, path: [], parentId }];
const index = new Map<string, NodeInfo>([node('B1', 'B1'), node('B2', 'B2'), node('f1', 'B1', 'B1'), node('t1', 'B1', 'f1'), node('c1', 'B1', 'f1'), node('g1', 'B2', 'B2')]);

const presence = (state: ActivityState, now: number, idx = index) => agentPresence(sessionsForSlug(state, 'a', now), idx, now);

const execDone = (over: Partial<ActivityCall> = {}) =>
  ev({ callId: 'x1', status: 'done', durationMs: 500, rev: 1, created: ['c1'], boards: ['B1'], bounds: { B1: [0, 0, 390, 844], f1: [0, 0, 390, 200], c1: [16, 40, 120, 80] }, ...over });

describe('callLocation', () => {
  it('execute: id created pertama yang punya bounds, lalu non-board pertama, lalu board', () => {
    const base: ActivityCall = { callId: 'a', session: 's', tool: 'execute', status: 'done', startedAt: iso(T0), boards: ['B1'] };
    expect(callLocation({ ...base, created: ['zz', 'c1'], bounds: { B1: [0, 0, 1, 1], c1: [1, 2, 3, 4] } }, index)).toEqual({ boardId: 'B1', nodeId: 'c1', rect: [1, 2, 3, 4] });
    // created belum di indeks → dilewati; non-board pertama.
    expect(callLocation({ ...base, created: ['new'], bounds: { new: [0, 0, 1, 1], B1: [0, 0, 1, 1], t1: [5, 6, 7, 8] } }, index)).toEqual({ boardId: 'B1', nodeId: 't1', rect: [5, 6, 7, 8] });
    expect(callLocation({ ...base, bounds: { B1: [0, 0, 1, 1] } }, index)).toEqual({ boardId: 'B1' });
    // error / running → tanpa lokasi.
    expect(callLocation({ ...base, status: 'error', bounds: { c1: [1, 2, 3, 4] } }, index)).toBeUndefined();
    expect(callLocation({ ...base, status: 'running' }, index)).toBeUndefined();
  });

  it('inspect: target (bounds dari event); screenshot/export/layout_check: seluruh board target', () => {
    const base: ActivityCall = { callId: 'a', session: 's', tool: 'inspect', status: 'done', startedAt: iso(T0) };
    expect(callLocation({ ...base, target: 't1', bounds: { t1: [1, 1, 2, 2] } }, index)).toEqual({ boardId: 'B1', nodeId: 't1', rect: [1, 1, 2, 2] });
    expect(callLocation({ ...base, target: 't1' }, index)).toEqual({ boardId: 'B1', nodeId: 't1' });
    expect(callLocation({ ...base, target: 'B2' }, index)).toEqual({ boardId: 'B2' });
    expect(callLocation({ ...base, target: 'none' }, index)).toBeUndefined();
    expect(callLocation({ ...base, tool: 'screenshot', target: 'B2', boards: ['B2'] }, index)).toEqual({ boardId: 'B2' });
    expect(callLocation({ ...base, tool: 'export', target: 'g1' }, index)).toEqual({ boardId: 'B2' });
    expect(callLocation({ ...base, tool: 'layout_check', target: 'B1' }, index)).toEqual({ boardId: 'B1' });
    expect(callLocation({ ...base, tool: 'layout_check', boards: ['B1', 'B2'] }, index)).toBeUndefined();
    expect(callLocation({ ...base, tool: 'read_skill', target: 'webapp' }, index)).toBeUndefined();
  });
});

describe('agentPresence', () => {
  it('execute selesai membuat kartu → idle di c1, sorotan c1 (utama, created) + node berubah lain', () => {
    const now = T0 + 2000;
    const [p] = presence(run(ev({ callId: 'x1', status: 'running' }), execDone()), now);
    expect(p).toMatchObject({ session: 'sess0001', label: 'Claude Code', color: 'agent', working: false, boardId: 'B1', nodeId: 'c1', rect: [16, 40, 120, 80], primary: 'c1', changedKey: 'x1' });
    expect(p!.action).toBeUndefined();
    // Board tidak disorot; node utama dulu.
    expect(p!.changed).toEqual([
      { id: 'c1', boardId: 'B1', rect: [16, 40, 120, 80], created: true },
      { id: 'f1', boardId: 'B1', rect: [0, 0, 390, 200], created: false },
    ]);
  });

  it('execute baru mulai → kursor tetap di c1, working dengan aksi "execute · …"', () => {
    const now = T0 + 3000;
    const [p] = presence(run(execDone(), ev({ callId: 'x2', status: 'running', startedAt: iso(T0 + 2500), description: 'Add pricing cards' })), now);
    expect(p).toMatchObject({ working: true, action: 'execute · Add pricing cards', boardId: 'B1', nodeId: 'c1' });
  });

  it('execute pertama sesi masih running → tanpa kursor', () => {
    expect(presence(run(ev({ callId: 'x1', status: 'running' })), T0 + 100)).toEqual([]);
  });

  it('execute gagal → lokasi tidak berubah, tanpa sorotan', () => {
    const now = T0 + 4000;
    const s = run(
      ev({ callId: 'i1', tool: 'inspect', status: 'done', target: 't1', bounds: { t1: [1, 2, 3, 4] }, durationMs: 10 }),
      ev({ callId: 'x1', status: 'error', startedAt: iso(T0 + 1000), durationMs: 100, error: { code: 'EXEC_ERROR', message: 'x' } }),
    );
    const [p] = presence(s, now);
    expect(p).toMatchObject({ boardId: 'B1', nodeId: 't1', rect: [1, 2, 3, 4], changed: [] });
    expect(p!.changedKey).toBeUndefined();
  });

  it('execute > 10 dtk lalu (mis. hello sesudah reconnect) → tanpa sorotan; sesi tidak Live → tanpa kursor', () => {
    const s = run(execDone());
    const [p] = presence(s, T0 + 500 + 10_001);
    expect(p).toMatchObject({ nodeId: 'c1', changed: [] });
    expect(presence(s, T0 + 120_000)).toEqual([]);
  });

  it('node belum ada di indeks dilewati (muncul setelah dokumen dimuat ulang)', () => {
    const before = new Map([...index].filter(([id]) => id !== 'c1'));
    const [p] = presence(run(execDone()), T0 + 1000, before);
    expect(p).toMatchObject({ boardId: 'B1', nodeId: 'f1' });
    expect(p!.changed.map((c) => c.id)).toEqual(['f1']);
    expect(p!.primary).toBe('f1');
  });

  it('sorotan maksimal 12 node', () => {
    const many = new Map(index);
    const bounds: Record<string, [number, number, number, number]> = {};
    for (let i = 0; i < 20; i++) {
      many.set(`n${i}`, node(`n${i}`, 'B1')[1]);
      bounds[`n${i}`] = [i, i, 10, 10];
    }
    const [p] = presence(run(execDone({ created: [], bounds })), T0 + 1000, many);
    expect(p!.changed).toHaveLength(CHANGED_MAX);
  });

  it('Codex → warna codex; layout_check dengan board target → seluruh board', () => {
    const s = run(ev({ callId: 'l1', session: 'sess0002', client: 'codex-cli', tool: 'layout_check', target: 'B2', boards: ['B2'], status: 'warning', durationMs: 50 }));
    const [p] = presence(s, T0 + 1000);
    expect(p).toMatchObject({ label: 'Codex', color: 'codex', boardId: 'B2', working: false });
    expect(p!.nodeId).toBeUndefined();
  });
});

describe('layerMarks', () => {
  it('agent (node lokasi saat working) > created > changed', () => {
    const now = T0 + 3000;
    const working = presence(run(execDone(), ev({ callId: 'x2', status: 'running', startedAt: iso(T0 + 2500) })), now);
    expect(layerMarks(working)).toEqual(
      new Map([
        ['c1', { mark: 'agent', color: 'agent' }],
        ['f1', { mark: 'changed', color: 'agent', key: 'x1' }],
      ]),
    );
    const idle = presence(run(execDone()), T0 + 1000);
    expect(layerMarks(idle)).toEqual(
      new Map([
        ['c1', { mark: 'created', color: 'agent', key: 'x1' }],
        ['f1', { mark: 'changed', color: 'agent', key: 'x1' }],
      ]),
    );
  });

  it('Codex dan Claude Code menandai node yang sama → warna dan kunci dari sesi yang menang', () => {
    const s = run(
      // Claude Code: execute selesai mengubah t1 (changed).
      execDone({ created: [], bounds: { t1: [0, 0, 10, 10] } }),
      // Codex: inspect t1 lalu execute berjalan → agent di t1.
      ev({ callId: 'i9', session: 'sess0002', client: 'codex-cli', tool: 'inspect', target: 't1', status: 'done', durationMs: 5 }),
      ev({ callId: 'x9', session: 'sess0002', client: 'codex-cli', status: 'running', startedAt: iso(T0 + 1000) }),
    );
    const marks = layerMarks(presence(s, T0 + 1500));
    expect(marks.get('t1')).toEqual({ mark: 'agent', color: 'codex' });
    // Kebalikannya: Codex execute membuat t1 (created) mengalahkan changed dari Claude Code.
    const s2 = run(
      execDone({ created: [], bounds: { t1: [0, 0, 10, 10] } }),
      ev({ callId: 'x8', session: 'sess0002', client: 'codex-cli', status: 'done', durationMs: 5, created: ['t1'], bounds: { t1: [0, 0, 10, 10] } }),
    );
    expect(layerMarks(presence(s2, T0 + 1500)).get('t1')).toEqual({ mark: 'created', color: 'codex', key: 'x8' });
  });

  it('board yang dibuat execute → baris created, tanpa outline node', () => {
    const [p] = presence(run(execDone({ created: ['B2', 'g1'], boards: ['B2'], bounds: { B2: [0, 0, 390, 844], g1: [0, 0, 10, 10] } })), T0 + 1000);
    expect(p!.changed.map((c) => c.id)).toEqual(['g1']);
    expect(p!.createdBoards).toEqual(['B2']);
    expect(layerMarks([p!]).get('B2')).toEqual({ mark: 'created', color: 'agent', key: 'x1' });
  });
});

describe('primary', () => {
  it('inspect node lain sesudah execute (≤ 10 dtk) → primary tetap node execute, urutan changed tetap', () => {
    const now = T0 + 3000;
    const before = presence(run(execDone()), now)[0]!;
    const [p] = presence(run(execDone(), ev({ callId: 'i1', tool: 'inspect', target: 'g1', status: 'done', startedAt: iso(T0 + 1000), durationMs: 5 })), now);
    expect(p).toMatchObject({ boardId: 'B2', primary: 'c1' });
    expect(p!.changed).toEqual(before.changed);
  });
});
