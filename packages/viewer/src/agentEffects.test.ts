// Efek canvas saat agen bekerja (spec-canvas-agent-effects): logika murni tanpa DOM.
import { describe, expect, it } from 'vitest';
import { activityReducer, harnessLabel, initialActivity, sessionsForSlug, whoOf, type ActivityCall, type ActivityEvent, type ActivityState } from './activity.ts';
import {
  AGENT_COLORS,
  FADE_STAGGER_MAX_MS,
  FadeQueue,
  assignAgentColors,
  generatingBoards,
  generatingText,
  preferredColor,
  staggerDelay,
  topmost,
  withExiting,
} from './agentEffects.ts';
import type { NodeInfo } from './format.ts';
import { agentPresence, fadePlans } from './presence.ts';

const T0 = Date.parse('2026-11-23T10:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

describe('identitas dan warna agen', () => {
  it('whoOf: agent mendahului client; harnessLabel mengenal harness umum', () => {
    expect(whoOf({ client: 'lakar-mcp', agent: 'claude-code' })).toBe('claude-code');
    expect(whoOf({ client: 'lakar-mcp' })).toBe('lakar-mcp');
    expect(harnessLabel(whoOf({ client: 'lakar-mcp', agent: 'claude-code' }))).toBe('Claude Code');
    expect(harnessLabel('codex-mcp-client')).toBe('Codex');
    expect(harnessLabel('gemini-cli-mcp-client')).toBe('Gemini CLI');
    expect(harnessLabel('zed')).toBe('zed');
  });

  it('preferredColor: Claude/MCP/tanpa nama → agent, Codex → codex, lainnya stabil dari hash', () => {
    expect(preferredColor('claude-code')).toBe('agent');
    expect(preferredColor('lakar-mcp')).toBe('agent');
    expect(preferredColor(undefined)).toBe('agent');
    expect(preferredColor('codex-mcp-client')).toBe('codex');
    const z = preferredColor('zed');
    expect(['violet', 'emerald', 'pink']).toContain(z);
    expect(preferredColor('zed')).toBe(z);
  });

  it('assignAgentColors: urut createdAt; tabrakan → warna tambahan bebas dulu; palet habis → warna pilihan', () => {
    const at = (s: number) => iso(T0 + s * 1000);
    const m = assignAgentColors([
      { id: 'b', createdAt: at(2), who: 'claude-code' },
      { id: 'a', createdAt: at(1), who: 'claude-code' },
      { id: 'c', createdAt: at(3), who: 'codex-mcp-client' },
    ]);
    expect(m.get('a')).toBe('agent');
    // Sesi Claude kedua tidak memakai biru Codex.
    expect(m.get('b')).toBe('violet');
    expect(m.get('c')).toBe('codex');
    const many = assignAgentColors(Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, createdAt: at(i), who: 'claude-code' })));
    expect([...many.values()].slice(0, 5)).toEqual(['agent', 'violet', 'emerald', 'pink', 'codex']);
    expect(new Set([...many.values()].slice(0, 5))).toEqual(new Set(AGENT_COLORS));
    expect(many.get('s5')).toBe('agent');
    // Deterministik: urutan masukan tidak berpengaruh.
    expect(assignAgentColors([...[{ id: 'x', createdAt: at(1), who: 'claude-code' }, { id: 'y', createdAt: at(1), who: 'claude-code' }]].reverse()).get('x')).toBe('agent');
  });
});

describe('fade-in node baru', () => {
  const parent: Record<string, string | undefined> = { B: undefined, card: 'B', title: 'card', icon: 'title', other: 'B', deep: 'other' };
  const parentOf = (id: string) => parent[id];

  it('topmost: anak dari node yang juga baru ikut induknya; urutan tetap; maks', () => {
    expect(topmost(['card', 'title', 'icon', 'deep'], parentOf)).toEqual(['card', 'deep']);
    expect(topmost(['icon', 'card'], parentOf)).toEqual(['card']);
    expect(topmost(['B', 'card', 'other'], parentOf)).toEqual(['B']);
    expect(topmost(['card', 'deep', 'other'], parentOf, 1)).toEqual(['card']);
    expect(topmost(['card', 'card'], parentOf)).toEqual(['card']);
  });

  it('staggerDelay: 60ms per elemen, dibatasi', () => {
    expect([0, 1, 2].map((i) => staggerDelay(i))).toEqual([0, 60, 120]);
    expect(staggerDelay(100)).toBe(FADE_STAGGER_MAX_MS);
    expect(staggerDelay(-1)).toBe(0);
  });

  it('FadeQueue: hanya execute sesudah canvas dibuka; diputar saat board termuat dari rev itu, sekali per board', () => {
    const q = new FadeQueue(T0);
    // Selesai 3 dtk sebelum canvas dibuka (dokumen dibuka / reconnect) → tidak diputar.
    expect(q.offer({ key: 'old', rev: 1, endMs: T0 - 3000, ids: ['a'] }, T0)).toBe(false);
    expect(q.offer({ key: 'x1', rev: 3, endMs: T0 + 500, ids: ['card', 'title'] }, T0 + 600)).toBe(true);
    // Kunci sama datang lagi (event diproses ulang) → diabaikan.
    expect(q.offer({ key: 'x1', rev: 3, endMs: T0 + 500, ids: ['card'] }, T0 + 700)).toBe(false);
    // Board masih dari rev lama → belum.
    expect(q.take('B', 2, T0 + 800)).toEqual([]);
    expect(q.take('B', 3, T0 + 900)).toEqual([['card', 'title']]);
    // Mount ulang board yang sama (mis. edit berikutnya) → tidak diputar lagi.
    expect(q.take('B', 4, T0 + 1000)).toEqual([]);
    // Board lain yang di-mount dari rev itu boleh menerima (DOM menyaring id yang ada).
    expect(q.take('B2', 4, T0 + 1000)).toEqual([['card', 'title']]);
    // Dua execute sebelum board di-mount ulang → dua kelompok (batas 12 per execute).
    expect(q.offer({ key: 'x4', rev: 7, endMs: T0 + 1100, ids: ['p'] }, T0 + 1100)).toBe(true);
    expect(q.offer({ key: 'x5', rev: 8, endMs: T0 + 1200, ids: ['q'] }, T0 + 1200)).toBe(true);
    expect(q.take('B', 8, T0 + 1300)).toEqual([['p'], ['q']]);
    // Snapshot sesudah reconnect: dicatat tanpa diputar.
    q.prime([{ key: 'x6', rev: 9, endMs: T0 + 1400, ids: ['r'] }]);
    expect(q.offer({ key: 'x6', rev: 9, endMs: T0 + 1400, ids: ['r'] }, T0 + 1500)).toBe(false);
    // Kosong → tidak dicatat; kedaluwarsa → dibuang.
    expect(q.offer({ key: 'x2', rev: 5, endMs: T0 + 2000, ids: [] }, T0 + 2000)).toBe(false);
    expect(q.offer({ key: 'x3', rev: 6, endMs: T0 + 3000, ids: ['n'] }, T0 + 3000)).toBe(true);
    expect(q.take('C', 6, T0 + 3000 + 20_000)).toEqual([]);
    expect(q.size).toBe(0);
  });

  it('fadePlans: execute selesai terbaru per sesi yang membuat node dan punya rev; gagal/running/tanpa created → tidak ada', () => {
    let seq = 0;
    const ev = (call: Partial<ActivityCall> & Pick<ActivityCall, 'callId' | 'status'>, session = 'sess0001'): ActivityEvent => ({
      seq: ++seq,
      type: 'call',
      call: { session, client: 'lakar-mcp', agent: 'claude-code', tool: 'execute', slug: 'a', startedAt: iso(T0), ...call },
    });
    const state = [
      ev({ callId: 'x1', status: 'done', durationMs: 400, rev: 2, created: ['card'] }),
      ev({ callId: 'y1', status: 'error', durationMs: 100 }, 'sess0002'),
      ev({ callId: 'z1', status: 'done', durationMs: 100, rev: 3 }, 'sess0003'),
    ].reduce<ActivityState>((s, event) => activityReducer(s, { type: 'event', event }), initialActivity);
    const views = sessionsForSlug(state, 'a', T0 + 1000);
    expect(fadePlans(views)).toEqual([{ key: 'x1', rev: 2, endMs: T0 + 400, ids: ['card'] }]);
    // Sesi mewarisi agent dari call (event session bisa terlewat).
    expect(state.sessions.sess0001?.agent).toBe('claude-code');
  });
});

describe('kehadiran per agen', () => {
  const node = (id: string, boardId: string): [string, NodeInfo] => [id, { id, name: `N ${id}`, type: id === boardId ? 'board' : 'frame', boardId, pageIndex: 0, path: [], parentId: id === boardId ? undefined : boardId }];
  const index = new Map<string, NodeInfo>([node('B1', 'B1'), node('B2', 'B2'), node('c1', 'B1'), node('c2', 'B2')]);

  it('dua sesi Claude Code + Codex: warna berbeda, nama harness dari agent, board Generating dari sesi working', () => {
    let seq = 0;
    const ev = (session: string, agent: string, call: Partial<ActivityCall> & Pick<ActivityCall, 'callId' | 'status'>): ActivityEvent => ({
      seq: ++seq,
      type: 'call',
      call: { session, client: 'lakar-mcp', agent, tool: 'inspect', slug: 'a', startedAt: iso(T0 + seq), ...call },
    });
    const state = [
      ev('s1', 'claude-code', { callId: 'a1', status: 'done', target: 'c1', durationMs: 5 }),
      ev('s2', 'claude-code', { callId: 'b1', status: 'done', target: 'c2', durationMs: 5 }),
      ev('s3', 'codex-mcp-client', { callId: 'c1', status: 'done', target: 'B2', durationMs: 5 }),
      ev('s1', 'claude-code', { callId: 'a2', status: 'running', tool: 'execute', description: 'Add cards' }),
    ].reduce<ActivityState>((s, event) => activityReducer(s, { type: 'event', event }), initialActivity);
    const ps = agentPresence(sessionsForSlug(state, 'a', T0 + 1000), index, T0 + 1000);
    const by = new Map(ps.map((p) => [p.session, p]));
    expect(by.get('s1')).toMatchObject({ label: 'Claude Code', color: 'agent', working: true, boardId: 'B1' });
    expect(by.get('s2')).toMatchObject({ label: 'Claude Code', color: 'violet', working: false });
    expect(by.get('s3')).toMatchObject({ label: 'Codex', color: 'codex' });
    const gen = generatingBoards(ps);
    expect([...gen.keys()]).toEqual(['B1']);
    expect(gen.get('B1')?.session).toBe('s1');
    expect(generatingText('Home')).toBe('✦ Generating · Home');
  });
});

describe('withExiting (kursor keluar)', () => {
  const key = (s: string) => s;
  it('item hilang tetap tampil selama exitMs dengan goneAt; kembali → aktif lagi', () => {
    let shown = withExiting<string>([], ['a', 'b'], key, 0, 180);
    expect(shown).toEqual([{ key: 'a', value: 'a' }, { key: 'b', value: 'b' }]);
    shown = withExiting(shown, ['a'], key, 100, 180);
    expect(shown).toEqual([{ key: 'a', value: 'a' }, { key: 'b', value: 'b', goneAt: 100 }]);
    // goneAt tidak di-reset di render berikutnya.
    shown = withExiting(shown, ['a'], key, 200, 180);
    expect(shown[1]).toEqual({ key: 'b', value: 'b', goneAt: 100 });
    shown = withExiting(shown, ['a'], key, 280, 180);
    expect(shown).toEqual([{ key: 'a', value: 'a' }]);
    shown = withExiting(withExiting(shown, [], key, 300, 180), ['a'], key, 350, 180);
    expect(shown).toEqual([{ key: 'a', value: 'a' }]);
  });
});

describe('warna hanya dibagi antar-sesi Live', () => {
  it('sesi Claude lama yang idle tidak mengambil oranye dari sesi Claude baru', () => {
    let seq = 0;
    const ev = (session: string, at: number, call: Partial<ActivityCall> & Pick<ActivityCall, 'callId' | 'status'>): ActivityEvent => ({
      seq: ++seq,
      type: 'call',
      call: { session, client: 'lakar-mcp', agent: 'claude-code', tool: 'inspect', slug: 'a', target: 'B1', startedAt: iso(at), durationMs: 5, ...call },
    });
    const state = [ev('old1', T0 - 600_000, { callId: 'o1', status: 'done' }), ev('new1', T0, { callId: 'n1', status: 'done' })].reduce<ActivityState>(
      (s, event) => activityReducer(s, { type: 'event', event }),
      initialActivity,
    );
    const index = new Map<string, NodeInfo>([['B1', { id: 'B1', name: 'Home', type: 'board', boardId: 'B1', pageIndex: 0, path: [], parentId: undefined }]]);
    const ps = agentPresence(sessionsForSlug(state, 'a', T0 + 1000), index, T0 + 1000);
    expect(ps.map((p) => [p.session, p.color])).toEqual([['new1', 'agent']]);
  });
});
