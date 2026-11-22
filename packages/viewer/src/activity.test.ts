// Reducer aktivitas viewer dan klien stream (EventSource palsu, tanpa lakard).
import { describe, expect, it } from 'vitest';
import {
  BACKOFF_MS,
  activityReducer,
  callMeta,
  callTitle,
  connectActivity,
  harnessLabel,
  initialActivity,
  isLive,
  revChange,
  sessionsForSlug,
  type ActivityCall,
  type ActivityEvent,
  type ActivityState,
  type EventSourceLike,
} from './activity.ts';

const T0 = Date.parse('2026-11-21T10:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

let seq = 0;
const callEv = (call: Partial<ActivityCall> & Pick<ActivityCall, 'callId' | 'status'>): ActivityEvent => ({
  seq: ++seq,
  type: 'call',
  call: { session: 'sess0001', client: 'claude-code', tool: 'execute', slug: 'a', startedAt: iso(T0), ...call },
});
const run = (state: ActivityState, ...events: ActivityEvent[]) => events.reduce((s, event) => activityReducer(s, { type: 'event', event }), state);

describe('activityReducer', () => {
  it('running → done menggantikan baris yang sama (callId), executes naik sekali', () => {
    let s = run(initialActivity, callEv({ callId: 'c1', status: 'running', description: 'tambah kartu fitur' }));
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]!.status).toBe('running');
    expect(s.sessions.sess0001).toMatchObject({ id: 'sess0001', client: 'claude-code', executes: 0 });
    s = run(s, callEv({ callId: 'c1', status: 'done', durationMs: 800, rev: 4, boards: ['B1'], nodes: 3 }));
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]).toMatchObject({ status: 'done', durationMs: 800, rev: 4, description: 'tambah kartu fitur' });
    expect(s.sessions.sess0001!.executes).toBe(1);
    expect(s.sessions.sess0001!.lastAt).toBe(iso(T0 + 800));
  });

  it('warning dan error tersimpan dengan summary / error', () => {
    const s = run(
      initialActivity,
      callEv({ callId: 'w', status: 'running', tool: 'layout_check' }),
      callEv({ callId: 'w', status: 'warning', tool: 'layout_check', summary: { error: 1, warning: 1 } }),
      callEv({ callId: 'e', status: 'running' }),
      callEv({ callId: 'e', status: 'error', error: { code: 'EXEC_ERROR', message: 'x is not defined' } }),
    );
    expect(s.calls.map((c) => c.status)).toEqual(['warning', 'error']);
    expect(callMeta(s.calls[0]!, T0)).toBe('1 error · 1 warning');
    expect(callMeta(s.calls[1]!, T0)).toBe('EXEC_ERROR');
  });

  it('sesi dan call lakar-viewer tidak pernah masuk state', () => {
    let s = run(initialActivity, { seq: ++seq, type: 'session', session: { id: 'view0001', client: 'lakar-viewer', createdAt: iso(T0), executes: 0 } });
    s = run(s, callEv({ callId: 'v', status: 'running', session: 'view0001', client: 'lakar-viewer' }));
    expect(s.sessions).toEqual({});
    expect(s.calls).toEqual([]);
    s = activityReducer(s, {
      type: 'hello',
      hello: { sessions: [{ id: 'view0001', client: 'lakar-viewer', activeSlug: 'a', createdAt: iso(T0), executes: 0 }], recent: [] },
    });
    expect(sessionsForSlug(s, 'a', T0)).toEqual([]);
  });

  it('event lama / duplikat (seq ≤ terakhir) diabaikan', () => {
    const e = callEv({ callId: 'd', status: 'running' });
    const s1 = run(initialActivity, e);
    expect(run(s1, e)).toBe(s1);
  });

  it('hello membangun ulang state dari snapshot (reconnect / daemon restart, seq mulai lagi)', () => {
    const before = run(initialActivity, callEv({ callId: 'old', status: 'done' }));
    const s = activityReducer(before, {
      type: 'hello',
      hello: {
        sessions: [{ id: 'sessB', client: 'codex-cli', activeSlug: 'a', createdAt: iso(T0), executes: 7 }],
        recent: [{ seq: 1, type: 'call', call: { callId: 'n1', session: 'sessB', client: 'codex-cli', tool: 'execute', slug: 'a', status: 'done', startedAt: iso(T0), durationMs: 10, rev: 2 } }],
      },
    });
    expect(s.calls.map((c) => c.callId)).toEqual(['n1']);
    expect(s.seq).toBe(1);
    expect(s.connected).toBe(true);
    expect(s.sessions.sessB!.executes).toBe(7);
  });
});

describe('live / idle', () => {
  it('Live bila ada call running atau call terakhir < 60 dtk; selain itu Idle', () => {
    const done = { callId: 'x', session: 's', tool: 'execute', status: 'done', startedAt: iso(T0), durationMs: 1000 } as ActivityCall;
    expect(isLive([done], T0 + 30_000)).toBe(true);
    expect(isLive([done], T0 + 61_001)).toBe(false);
    expect(isLive([{ ...done, status: 'running', durationMs: undefined }], T0 + 3_600_000)).toBe(true);
    expect(isLive([], T0)).toBe(false);
  });

  it('sessionsForSlug: hanya sesi pada slug, Live dulu, call terbaru dulu', () => {
    const s = run(
      initialActivity,
      callEv({ callId: '1', status: 'done', session: 'idle0001', client: 'codex', startedAt: iso(T0 - 600_000) }),
      callEv({ callId: '2', status: 'done', session: 'live0001', startedAt: iso(T0 - 5_000) }),
      callEv({ callId: '3', status: 'running', session: 'live0001', startedAt: iso(T0 - 1_000), tool: 'layout_check' }),
      callEv({ callId: '4', status: 'done', session: 'other001', slug: 'b' }),
    );
    const views = sessionsForSlug(s, 'a', T0);
    expect(views.map((v) => [v.session.id, v.live])).toEqual([
      ['live0001', true],
      ['idle0001', false],
    ]);
    expect(views[0]!.calls.map((c) => c.callId)).toEqual(['3', '2']);
    expect(callMeta(views[0]!.calls[0]!, T0)).toBe('running 1.0s');
  });
});

describe('deteksi rev baru', () => {
  it('execute selesai pada slug terbuka dengan rev > rev tampil → rev + board tersentuh', () => {
    const e = callEv({ callId: 'r', status: 'done', rev: 5, boards: ['B1', 'B2'] });
    expect(revChange(e, 'a', 4)).toEqual({ rev: 5, boards: ['B1', 'B2'] });
    expect(revChange({ ...e, call: { ...(e as { call: ActivityCall }).call, status: 'warning' } } as ActivityEvent, 'a', 4)).toEqual({ rev: 5, boards: ['B1', 'B2'] });
  });
  it('rev sama/lebih lama, slug lain, running, error, viewer → tidak ada perubahan', () => {
    expect(revChange(callEv({ callId: 'a', status: 'done', rev: 4 }), 'a', 4)).toBeUndefined();
    expect(revChange(callEv({ callId: 'b', status: 'done', rev: 9, slug: 'b' }), 'a', 4)).toBeUndefined();
    expect(revChange(callEv({ callId: 'c', status: 'running', rev: 9 }), 'a', 4)).toBeUndefined();
    expect(revChange(callEv({ callId: 'd', status: 'error', rev: 9 }), 'a', 4)).toBeUndefined();
    expect(revChange(callEv({ callId: 'e', status: 'done', rev: 9, client: 'lakar-viewer' }), 'a', 4)).toBeUndefined();
  });
  it('Restore dari aplikasi (lakar-viewer, tool restore) → muat ulang semua board; tetap tidak tampil di Activity', () => {
    const e = callEv({ callId: 'rs', status: 'done', rev: 8, tool: 'restore', client: 'lakar-viewer', session: 'lakar-vi' });
    expect(revChange(e, 'a', 7)).toEqual({ rev: 8 });
    expect(revChange(e, 'a', 8)).toBeUndefined();
    expect(callTitle({ ...(e as { call: ActivityCall }).call, description: 'Restored r3' })).toBe('Restored r3');
    const s = activityReducer(initialActivity, { type: 'event', event: e });
    expect(s.calls).toEqual([]);
  });
  it('kelola halaman dari aplikasi (lakar-viewer, tool pages) → muat ulang; tidak tampil di Activity', () => {
    const e = callEv({ callId: 'pg', status: 'done', rev: 8, tool: 'pages', client: 'lakar-viewer', session: 'lakar-vi', description: 'Added page "Page 2"' });
    expect(revChange(e, 'a', 7)).toEqual({ rev: 8 });
    expect(callTitle((e as { call: ActivityCall }).call)).toBe('Added page "Page 2"');
    expect(activityReducer(initialActivity, { type: 'event', event: e }).calls).toEqual([]);
  });
  it('tool lain dengan rev lebih baru → muat ulang semua board (boards tidak diketahui)', () => {
    expect(revChange(callEv({ callId: 'f', status: 'done', rev: 6, tool: 'layout_check' }), 'a', 4)).toEqual({ rev: 6 });
  });
});

describe('label', () => {
  it('nama harness dari pola client', () => {
    expect(harnessLabel('claude-code')).toBe('Claude Code');
    expect(harnessLabel('codex-mcp-client')).toBe('Codex');
    expect(harnessLabel('lakar-mcp')).toBe('MCP agent');
    expect(harnessLabel('zed')).toBe('zed');
    expect(harnessLabel(undefined)).toBe('Agent');
  });
  it('judul dan meta tool call', () => {
    const base = { callId: 'x', session: 's', startedAt: iso(T0), status: 'done' } as const;
    expect(callTitle({ ...base, tool: 'execute', description: 'tambah hero' })).toBe('tambah hero');
    expect(callTitle({ ...base, tool: 'inspect', target: 'N1' }, (id) => (id === 'N1' ? 'Headline' : undefined))).toBe('Inspect Headline');
    expect(callTitle({ ...base, tool: 'layout_check' })).toBe('Check all boards');
    expect(callTitle({ ...base, tool: 'read_skill', target: 'webapp' })).toBe('Load webapp skill');
    expect(callMeta({ ...base, tool: 'execute', durationMs: 800, nodes: 3 }, T0)).toBe('0.8s · 3 nodes');
  });
});

/** EventSource palsu yang bisa dipicu dari tes. */
function fakeEventSource() {
  const instances: (EventSourceLike & { url: string; closed: boolean; emit: (type: string, data: unknown) => void; fail: () => void })[] = [];
  class FakeES implements EventSourceLike {
    onopen: ((ev: unknown) => void) | null = null;
    onerror: ((ev: unknown) => void) | null = null;
    closed = false;
    readonly listeners = new Map<string, ((ev: { data: string }) => void)[]>();
    constructor(readonly url: string) {
      instances.push(this as never);
    }
    addEventListener(type: string, l: (ev: { data: string }) => void) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), l]);
    }
    close() {
      this.closed = true;
    }
    emit(type: string, data: unknown) {
      for (const l of this.listeners.get(type) ?? []) l({ data: JSON.stringify(data) });
    }
    fail() {
      this.onerror?.({});
    }
  }
  return { FakeES, instances };
}

describe('connectActivity', () => {
  it('hello/event diteruskan; putus → reconnect dengan backoff; hello kedua memicu onReconnect; tutup → berhenti', () => {
    const { FakeES, instances } = fakeEventSource();
    const timers: { fn: () => void; ms: number }[] = [];
    const log: string[] = [];
    const stop = connectActivity(
      {
        onHello: (h) => log.push(`hello:${h.sessions.length}`),
        onEvent: (e) => log.push(`event:${e.seq}`),
        onConnection: (c) => log.push(`conn:${c}`),
        onReconnect: () => log.push('reconnect'),
      },
      { EventSource: FakeES, setTimeout: (fn, ms) => timers.push({ fn, ms }), clearTimeout: () => {} },
    );
    expect(instances).toHaveLength(1);
    expect(instances[0]!.url).toBe('/viewer/events');
    instances[0]!.emit('hello', { sessions: [], recent: [] });
    instances[0]!.emit('call', { seq: 1, type: 'call', call: {} });
    instances[0]!.fail();
    expect(instances[0]!.closed).toBe(true);
    expect(timers.map((t) => t.ms)).toEqual([BACKOFF_MS[0]]);
    timers[0]!.fn();
    instances[1]!.fail();
    expect(timers.map((t) => t.ms)).toEqual([BACKOFF_MS[0], BACKOFF_MS[1]]);
    timers[1]!.fn();
    instances[2]!.emit('hello', { sessions: [{}], recent: [] });
    expect(log).toEqual(['conn:true', 'hello:0', 'event:1', 'conn:false', 'conn:false', 'conn:true', 'hello:1', 'reconnect']);
    // Setelah sukses, backoff mulai lagi dari awal.
    instances[2]!.fail();
    expect(timers.at(-1)!.ms).toBe(BACKOFF_MS[0]);
    stop();
    timers.at(-1)!.fn();
    expect(instances).toHaveLength(3);
  });
});
