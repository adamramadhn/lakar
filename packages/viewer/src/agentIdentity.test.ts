// Identitas dan warna agen di luar canvas (spec-agent-identity-history): warna sesi Live yang sama untuk canvas,
// panel Activity, badge Live, dan Connections; nama harness dari `agent` untuk History, Last agent, dan header file.
import { describe, expect, it } from 'vitest';
import { activityReducer, initialActivity, sessionsForSlug, type ActivityCall, type ActivitySession, type ActivityState } from './activity.ts';
import { liveSessionColors, sessionColor } from './agentEffects.ts';
import { fileMeta } from './history.ts';
import { lastAgentView } from './listColumns.ts';
import { agentRows, liveDocs } from './live.ts';
import { agentPresence } from './presence.ts';
import type { NodeInfo } from './format.ts';

const T0 = Date.parse('2026-11-23T10:00:00.000Z');
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

// Dua sesi Claude Code di dokumen `a` (yang lebih tua oranye, kedua violet) + Codex di dokumen `b`.
const first: ActivitySession = { id: 's1', client: 'lakar-mcp', agent: 'claude-code', activeSlug: 'a', createdAt: iso(T0 - 2000), executes: 0 };
const second: ActivitySession = { id: 's2', client: 'lakar-mcp', agent: 'claude-code', activeSlug: 'a', createdAt: iso(T0 - 1000), executes: 0 };
const codex: ActivitySession = { id: 's3', client: 'lakar-mcp', agent: 'codex-mcp-client', activeSlug: 'b', createdAt: iso(T0), executes: 0 };
const twoClaudes = () =>
  state(
    [first, second, codex],
    [
      { session: 's1', slug: 'a', tool: 'inspect', target: 'B1' },
      { session: 's2', slug: 'a', tool: 'inspect', target: 'B1' },
      { session: 's2', slug: 'a', status: 'running' },
      { session: 's3', slug: 'b' },
    ],
  );

/** Sama tanpa call yang masih berjalan (bisa menjadi idle). */
const finished = () =>
  state(
    [first, second, codex],
    [
      { session: 's1', slug: 'a' },
      { session: 's2', slug: 'a' },
      { session: 's3', slug: 'b' },
    ],
  );

describe('liveSessionColors / sessionColor', () => {
  it('sesi Claude kedua violet; sesi idle tidak dibagi dan memakai warna pilihan harness', () => {
    const s = twoClaudes();
    const colors = liveSessionColors(sessionsForSlug(s, 'a', T0 + 1000));
    expect(colors).toEqual(
      new Map([
        ['s1', 'agent'],
        ['s2', 'violet'],
      ]),
    );
    // Codex bukan sesi dokumen `a`: warna pilihan harness.
    expect(sessionColor(colors, codex)).toBe('codex');
    // Semua idle → peta kosong; sesi tetap mendapat warna pilihan (sesi lama "MCP agent" tanpa `agent` → oranye).
    expect(liveSessionColors(sessionsForSlug(finished(), 'a', T0 + 3_600_000)).size).toBe(0);
    expect(sessionColor(new Map(), { id: 'x', client: 'lakar-mcp' })).toBe('agent');
  });

  it('warna panel/badge sama dengan kursor canvas', () => {
    const s = twoClaudes();
    const now = T0 + 1000;
    const index = new Map<string, NodeInfo>([['B1', { id: 'B1', name: 'Home', type: 'board', boardId: 'B1', pageIndex: 0, path: [], parentId: undefined }]]);
    const presence = agentPresence(sessionsForSlug(s, 'a', now), index, now);
    const live = liveDocs(s, now);
    const byId = new Map(presence.map((p) => [p.session, p.color]));
    expect(byId.get('s2')).toBe('violet');
    // Badge Live dokumen `a` = sesi yang sedang berjalan (s2), warnanya sama dengan kursornya.
    expect(live.get('a')).toEqual({ label: 'Claude Code', color: byId.get('s2'), running: true });
    expect(live.get('b')).toEqual({ label: 'Codex', color: 'codex', running: false });
  });

  it('Connections: sesi Live memakai warna sesi dokumennya, sesi idle warna harness', () => {
    const rows = agentRows(twoClaudes(), T0 + 1000);
    expect(Object.fromEntries(rows.map((r) => [r.id, r.color]))).toEqual({ s1: 'agent', s2: 'violet', s3: 'codex' });
    const idle = agentRows(finished(), T0 + 3_600_000);
    expect(Object.fromEntries(idle.map((r) => [r.id, r.color]))).toEqual({ s1: 'agent', s2: 'agent', s3: 'codex' });
  });
});

describe('nama harness di History, Last agent, dan header file', () => {
  it('lastAgentView: agent didahulukan atas client; viewer tetap You; tanpa keduanya → tidak diketahui', () => {
    expect(lastAgentView('lakar-mcp', 'claude-code')).toEqual({ label: 'Claude Code', initial: 'C', kind: 'agent' });
    expect(lastAgentView('lakar-mcp', 'codex-mcp-client')).toEqual({ label: 'Codex', initial: 'X', kind: 'codex' });
    // Entri lama tanpa agent: perilaku lama.
    expect(lastAgentView('lakar-mcp')).toEqual({ label: 'MCP agent', initial: 'M', kind: 'agent' });
    expect(lastAgentView('lakar-mcp', undefined)).toEqual({ label: 'MCP agent', initial: 'M', kind: 'agent' });
    expect(lastAgentView('lakar-viewer', 'claude-code')).toEqual({ label: 'You', initial: 'Y', kind: 'user' });
    expect(lastAgentView(undefined, 'claude-code')).toEqual({ label: 'Claude Code', initial: 'C', kind: 'agent' });
    expect(lastAgentView(undefined, undefined)).toBeUndefined();
  });

  it('fileMeta: agent didahulukan atas client', () => {
    const label = (c: string | undefined) => (c === 'claude-code' ? 'Claude Code' : c === 'lakar-mcp' ? 'MCP agent' : (c ?? 'Agent'));
    const ago = () => 'just now';
    expect(fileMeta({ count: 2, top: { at: 'x', client: 'lakar-mcp', agent: 'claude-code' } }, 1, 0, ago, label)).toBe('Updated just now by Claude Code');
    expect(fileMeta({ count: 2, top: { at: 'x', client: 'lakar-mcp' } }, 1, 0, ago, label)).toBe('Updated just now by MCP agent');
  });
});
