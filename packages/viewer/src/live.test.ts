// Badge Live Dashboard + daftar Connected agents: turunan murni dari stream aktivitas.
import { describe, expect, it } from 'vitest';
import { activityReducer, initialActivity, LIVE_WINDOW_MS, type ActivityCall, type ActivitySession, type ActivityState } from './activity.ts';
import { agentRows, liveDocs } from './live.ts';

const T0 = Date.parse('2026-11-22T10:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

function state(sessions: ActivitySession[], calls: Partial<ActivityCall>[]): ActivityState {
  let s = activityReducer(initialActivity, { type: 'hello', hello: { sessions, recent: [] } });
  calls.forEach((c, i) => {
    s = activityReducer(s, {
      type: 'event',
      event: { seq: i + 1, type: 'call', call: { callId: `c${i}`, session: 's1', tool: 'execute', status: 'done', startedAt: iso(T0), durationMs: 100, ...c } },
    });
  });
  return s;
}

const claude: ActivitySession = { id: 's1', client: 'claude-code', activeSlug: 'a', createdAt: iso(T0), lastAt: iso(T0), executes: 3 };
const codex: ActivitySession = { id: 's2', client: 'codex-cli', activeSlug: 'b', createdAt: iso(T0), lastAt: iso(T0 - 600_000), executes: 1 };
const viewer: ActivitySession = { id: 's3', client: 'lakar-viewer', activeSlug: 'a', createdAt: iso(T0), executes: 9 };

describe('liveDocs', () => {
  it('call berjalan → running; selesai < jendela Live → Live tanpa running; lewat jendela → tidak tampil', () => {
    const running = state([claude], [{ status: 'running', slug: 'a' }]);
    expect(liveDocs(running, T0 + 1000).get('a')).toEqual({ label: 'Claude Code', color: 'agent', running: true });
    const done = state([claude], [{ slug: 'a' }]);
    expect(liveDocs(done, T0 + 1000).get('a')).toEqual({ label: 'Claude Code', color: 'agent', running: false });
    expect(liveDocs(done, T0 + LIVE_WINDOW_MS + 1000).size).toBe(0);
  });
  it('call tanpa slug memakai dokumen aktif sesi; sesi viewer diabaikan', () => {
    const s = state([claude, viewer], [{ slug: undefined, tool: 'read_skill' }, { session: 's3', client: 'lakar-viewer', slug: 'a', status: 'running' }]);
    expect([...liveDocs(s, T0 + 1000).keys()]).toEqual(['a']);
    expect(liveDocs(s, T0 + 1000).get('a')?.running).toBe(false);
  });
});

describe('agentRows', () => {
  it('Live dulu, lalu terakhir aktif; viewer tidak ikut; label dan warna harness', () => {
    const s = state([codex, viewer, claude], [{ slug: 'a' }]);
    expect(agentRows(s, T0 + 1000)).toEqual([
      // Reducer aktivitas memajukan lastAt ke akhir call terakhir dan menghitung execute yang selesai (3 + 1).
      { id: 's1', label: 'Claude Code', color: 'agent', live: true, executes: 4, activeSlug: 'a', lastAt: iso(T0 + 100) },
      { id: 's2', label: 'Codex', color: 'codex', live: false, executes: 1, activeSlug: 'b', lastAt: iso(T0 - 600_000) },
    ]);
  });
});
