// Efek canvas saat agen bekerja (spec-canvas-agent-effects): logika murni tanpa DOM.
import { describe, expect, it } from 'vitest';
import { activityReducer, harnessLabel, initialActivity, sessionsForSlug, whoOf, type ActivityCall, type ActivityEvent, type ActivityState } from './activity.ts';
import {
  AGENT_COLORS,
  FadeQueue,
  REVEAL_MAX_UNITS,
  REVEAL_MS,
  REVEAL_STEP_MS,
  REVEAL_TOTAL_MAX_MS,
  assignAgentColors,
  followCamera,
  generatingBoards,
  generatingText,
  preferredColor,
  regionVisible,
  revealSchedule,
  revealUnits,
  topmost,
  withExiting,
} from './agentEffects.ts';
import type { NodeInfo } from './format.ts';
import { agentPresence, fadePlans, followRect, pendingAgents } from './presence.ts';

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

  it('topmost: tanpa batas bawaan (reveal memilih unitnya sendiri)', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `n${i}`);
    expect(topmost(ids, () => undefined)).toHaveLength(40);
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
    // Dua execute sebelum board di-mount ulang → dua kelompok (Canvas menggabungkannya jadi satu reveal).
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

// ---- spec-progressive-live-build ----

/** Pohon uji: id + anak. */
type Tree = { id: string; children: Tree[] };
const t = (id: string, ...children: Tree[]): Tree => ({ id, children });
const leaf = (id: string) => t(id);
const count = (n: Tree): number => n.children.reduce((a, c) => a + 1 + count(c), 0);
const pick = (roots: Tree[], opts?: Parameters<typeof revealUnits>[3]) => {
  const r = revealUnits(roots, (n) => n.children, count, opts);
  return { units: r.units.map((u) => u.id), shells: r.shells.map((s) => [s.node.id, s.first] as const) };
};

/** Board landing kecil: Halaman → navbar (logo, 3 tautan, 2 tombol) + hero (teks + CTA, mockup 3 baris). */
function landing(): Tree {
  const btn = (id: string) => t(id, leaf(`${id}/label`));
  const row = (id: string) => t(id, leaf(`${id}/ikon`), leaf(`${id}/teks`), leaf(`${id}/status`));
  const nav = t('nav', t('logo', leaf('mark'), leaf('word')), t('links', leaf('l1'), leaf('l2'), leaf('l3')), t('act', btn('b1'), btn('b2')));
  const copy = t('copy', leaf('over'), leaf('h1'), leaf('sub'), t('cta', btn('c1'), btn('c2')), leaf('penguat'));
  const mock = t('mock', t('head', leaf('judul'), leaf('meta')), t('rows', row('r1'), row('r2'), row('r3')));
  return t('board', t('page', nav, t('hero', copy, mock)));
}

describe('reveal bertahap: pilihan unit', () => {
  it('board baru dipecah menjadi blok dalam urutan dokumen (atas → bawah); wadah yang dipecah jadi cangkang', () => {
    const { units, shells } = pick([landing()]);
    expect(units.length).toBeGreaterThan(5);
    expect(units.length).toBeLessThanOrEqual(REVEAL_MAX_UNITS);
    // Urutan dokumen terjaga: navbar dulu, lalu teks hero, lalu mockup.
    expect(units.indexOf('h1')).toBeLessThan(units.indexOf('sub'));
    expect(units.findIndex((u) => ['logo', 'links', 'act', 'nav'].includes(u))).toBe(0);
    expect(units.at(-1)).toMatch(/^(rows|r3|mock)$/);
    // Board, Halaman, dan hero tidak pernah menjadi satu blok besar.
    for (const big of ['board', 'page', 'hero']) expect(units).not.toContain(big);
    // Cangkang mulai bersama unit pertama di dalamnya.
    const first = new Map(shells);
    expect(first.get('board')).toBe(0);
    expect(first.get('page')).toBe(0);
    expect(first.get('hero')).toBe(units.findIndex((u) => !['logo', 'links', 'act', 'nav', 'mark', 'word', 'l1', 'l2', 'l3', 'b1', 'b2'].includes(u)));
  });

  it('anggaran kecil: berhenti memecah sebelum melewati max; atom (tombol, badge) tidak dipecah', () => {
    expect(pick([landing()], { max: 3 }).units).toEqual(['nav', 'copy', 'mock']);
    // Tombol dengan satu label = atom (turunan ≤ 3) walau anggaran cukup.
    expect(pick([t('cta', t('b1', leaf('l')), t('b2', leaf('l2')))]).units).toEqual(['b1', 'b2']);
    expect(pick([t('b1', leaf('l'))]).units).toEqual(['b1']);
  });

  it('kedalaman maks dari akar dihormati; akar sederhana tetap satu unit', () => {
    const deep = t('a', t('b', t('c', t('d', t('e', leaf('f'), leaf('g'), leaf('h'), leaf('i'))))));
    expect(pick([deep], { maxDepth: 2 }).units).toEqual(['c']);
    expect(pick([leaf('x'), leaf('y')]).units).toEqual(['x', 'y']);
  });

  it('seksi baru di board yang sudah ada: isi seksi jadi blok, bukan satu blok seksi', () => {
    const card = (id: string, n: number) => t(id, ...Array.from({ length: n }, (_, i) => leaf(`${id}.${i}`)));
    const sec = t('fitur', card('head', 3), t('grid', card('big', 6), t('side', card('k1', 4), card('k2', 4))));
    const { units } = pick([sec]);
    expect(units).not.toContain('fitur');
    expect(units.slice(0, 1)).toEqual(['head']);
    for (const w of ['grid', 'side']) expect(units).not.toContain(w);
    expect(units.indexOf('big.0')).toBeLessThan(units.indexOf('k1.0'));
    expect(units.indexOf('k1.0')).toBeLessThan(units.indexOf('k2.3'));
  });

  it('akar melebihi anggaran: hanya max akar pertama', () => {
    const roots = Array.from({ length: 40 }, (_, i) => leaf(`n${i}`));
    expect(pick(roots).units).toHaveLength(REVEAL_MAX_UNITS);
  });
});

describe('reveal bertahap: jadwal', () => {
  it('jeda 60ms untuk sedikit unit; dipadatkan supaya total ≤ batas; satu unit tanpa jeda', () => {
    expect(revealSchedule(0).total).toBe(0);
    expect(revealSchedule(1)).toEqual({ step: 0, duration: REVEAL_MS, total: REVEAL_MS });
    expect(revealSchedule(6)).toMatchObject({ step: REVEAL_STEP_MS, total: REVEAL_MS + 5 * REVEAL_STEP_MS });
    for (const n of [16, 32, 200]) {
      const s = revealSchedule(n);
      expect(s.step).toBeLessThanOrEqual(REVEAL_STEP_MS);
      expect(s.total).toBeLessThanOrEqual(REVEAL_TOTAL_MAX_MS + 1e-9);
    }
    expect(revealSchedule(32).total).toBeCloseTo(REVEAL_TOTAL_MAX_MS);
    expect(REVEAL_TOTAL_MAX_MS).toBeGreaterThanOrEqual(1200);
    expect(REVEAL_TOTAL_MAX_MS).toBeLessThanOrEqual(1800);
  });
});

describe('Follow agent ke seksi baru', () => {
  const zoom = { min: 0.05, max: 8 };
  type R = [number, number, number, number];
  it('followRect: gabungan bounds node baru tanpa board; tanpa node baru atau beberapa board → undefined', () => {
    const bounds: Record<string, R> = { B: [0, 0, 1440, 2800], sec: [0, 948, 1440, 780], card: [80, 1100, 600, 300], old: [0, 0, 1440, 72] };
    const c = { boards: ['B'], created: ['sec', 'card', 'B'], bounds };
    expect(followRect(c)).toEqual([0, 948, 1440, 780]);
    expect(followRect({ ...c, created: [] })).toBeUndefined();
    expect(followRect({ ...c, boards: ['B', 'B2'] })).toBeUndefined();
    // Node baru tanpa bounds (dipotong batas 60) diabaikan.
    expect(followRect({ ...c, created: ['card', 'x'] })).toEqual([80, 1100, 600, 300]);
  });

  it('followCamera: seksi pendek dipusatkan dengan zoom tetap; seksi tinggi → tepi atasnya di atas viewport; lebar tidak muat → zoom-out', () => {
    const cam = { x: 0, y: 0, z: 0.5 };
    const sec = { x: 0, y: 948, width: 1440, height: 780 };
    const to = followCamera(sec, cam, 1200, 800, zoom);
    expect(to.z).toBe(0.5);
    expect(regionVisible(sec, to, 1200, 800)).toBe(true);
    expect(to.x + (sec.x + sec.width / 2) * to.z).toBeCloseTo(600);
    const tall = { x: 0, y: 948, width: 1440, height: 3000 };
    const t2 = followCamera(tall, cam, 1200, 800, zoom);
    expect(t2.z).toBe(0.5);
    expect(t2.y + tall.y * t2.z).toBe(56 + 24);
    const t3 = followCamera(sec, { x: 0, y: 0, z: 1 }, 1200, 800, zoom);
    expect(t3.z).toBeCloseTo((1200 - 112) / 1440);
    expect(regionVisible(sec, { x: 0, y: -1000, z: 0.5 }, 1200, 800)).toBe(false);
  });
});

describe('label Generating di antara execute dan pada execute pertama', () => {
  const index = new Map<string, NodeInfo>([
    ['W1', { id: 'W1', name: '[WIP] Kopi / Beranda · landing', type: 'board', boardId: 'W1', pageIndex: 0, path: [], parentId: undefined }],
    ['s1', { id: 's1', name: 'Seksi / Hero', type: 'frame', boardId: 'W1', pageIndex: 0, path: [], parentId: 'W1' }],
  ]);
  let seq = 0;
  const ev = (call: Partial<ActivityCall> & Pick<ActivityCall, 'callId' | 'status'>, session = 'sx'): ActivityEvent => ({
    seq: ++seq,
    type: 'call',
    call: { session, client: 'lakar-mcp', agent: 'claude-code', tool: 'execute', slug: 'a', startedAt: iso(T0), ...call },
  });
  const sessionEv = (id: string, activeSlug: string): ActivityEvent => ({
    seq: ++seq,
    type: 'session',
    session: { id, client: 'lakar-mcp', agent: 'claude-code', createdAt: iso(T0 - 1000), activeSlug, executes: 0 },
  });
  const reduce = (events: ActivityEvent[]) => events.reduce<ActivityState>((s, event) => activityReducer(s, { type: 'event', event }), initialActivity);
  const built = (session = 'sx') => ev({ callId: `e1${session}`, status: 'done', durationMs: 900, rev: 3, created: ['W1', 's1'], boards: ['W1'], bounds: { W1: [0, 0, 1440, 960], s1: [0, 72, 1440, 876] } }, session);

  it('board [WIP] dari execute terakhir: building di antara call → Generating tetap; selesai (tanpa [WIP]) atau pindah dokumen → tidak', () => {
    const st = reduce([sessionEv('sx', 'a'), built()]);
    const ps = agentPresence(sessionsForSlug(st, 'a', T0 + 20_000), index, T0 + 20_000);
    expect(ps[0]).toMatchObject({ working: false, building: true, boardId: 'W1' });
    expect([...generatingBoards(ps).keys()]).toEqual(['W1']);
    // Board selesai (tanpa [WIP]) → tidak building.
    const done = new Map(index);
    done.set('W1', { ...index.get('W1')!, name: 'Kopi / Beranda · landing' });
    expect(agentPresence(sessionsForSlug(st, 'a', T0 + 20_000), done, T0 + 20_000)[0]?.building).toBeUndefined();
    // Sesi pindah dokumen → tidak building.
    const moved = reduce([sessionEv('sx', 'a'), built(), sessionEv('sx', 'b')]);
    expect(agentPresence(sessionsForSlug(moved, 'a', T0 + 20_000), index, T0 + 20_000)[0]?.building).toBeUndefined();
    // Sesi idle (> 60 dtk) → tanpa presence.
    expect(agentPresence(sessionsForSlug(st, 'a', T0 + 120_000), index, T0 + 120_000)).toEqual([]);
  });

  it('working menang atas building bila dua sesi menunjuk board yang sama', () => {
    const st = reduce([sessionEv('sx', 'a'), sessionEv('sz', 'a'), built('sx'), built('sz'), ev({ callId: 'r', status: 'running' }, 'sz')]);
    const ps = agentPresence(sessionsForSlug(st, 'a', T0 + 2000), index, T0 + 2000);
    expect(generatingBoards(ps).get('W1')?.session).toBe('sz');
  });

  it('pendingAgents: execute pertama berjalan tanpa lokasi → label tingkat dokumen tanpa menebak board; sesudah punya lokasi → tidak', () => {
    const first = reduce([sessionEv('sy', 'a'), ev({ callId: 'p1', status: 'running', description: 'Build navbar and hero' }, 'sy')]);
    const views = sessionsForSlug(first, 'a', T0 + 500);
    expect(pendingAgents(views, index)).toEqual([{ session: 'sy', label: 'Claude Code', color: 'agent', action: 'Build navbar and hero' }]);
    expect(agentPresence(views, index, T0 + 500)).toEqual([]);
    const later = reduce([
      sessionEv('sy', 'a'),
      ev({ callId: 'p1', status: 'done', durationMs: 900, rev: 3, created: ['s1'], boards: ['W1'], bounds: { s1: [0, 72, 1440, 876] } }, 'sy'),
      ev({ callId: 'p2', status: 'running', description: 'Add features' }, 'sy'),
    ]);
    expect(pendingAgents(sessionsForSlug(later, 'a', T0 + 1500), index)).toEqual([]);
    expect(agentPresence(sessionsForSlug(later, 'a', T0 + 1500), index, T0 + 1500)[0]).toMatchObject({ working: true, boardId: 'W1' });
    // Bukan execute (mis. screenshot pertama) → tidak ada label.
    const shot = reduce([sessionEv('sq', 'a'), ev({ callId: 'q1', status: 'running', tool: 'screenshot' }, 'sq')]);
    expect(pendingAgents(sessionsForSlug(shot, 'a', T0 + 500), index)).toEqual([]);
  });
});
