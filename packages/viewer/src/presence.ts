// Kehadiran agen di kanvas (aplikasi 5, desain bagian 04): turunan murni dari stream aktivitas per sesi Live —
// lokasi kursor (board + node), state working/idle, dan node yang baru diubah execute (sorotan "Just changed").
// Target execute yang masih berjalan tidak ditebak dari kode: kursor tetap di lokasi terakhir dengan state working.
import { callEndMs, callTitle, harnessLabel, whoOf, type ActivityCall, type SessionView } from './activity.js';
import { assignAgentColors, type AgentColor, type FadePlan } from './agentEffects.js';
import type { NodeInfo } from './format.js';

/** `[x, y, w, h]` relatif board. */
export type Rect = [number, number, number, number];
/** Jendela sorotan sesudah execute selesai. */
export const CHANGED_WINDOW_MS = 10_000;
/** Maksimum outline node berubah per execute. */
export const CHANGED_MAX = 12;

export type ChangedNode = { id: string; boardId: string; rect: Rect; created: boolean };

export type AgentPresence = {
  /** Id sesi publik. */
  session: string;
  /** Nama harness (Claude Code, Codex, …). */
  label: string;
  /** Warna sesi (palet `AGENT_COLORS`, unik per sesi selama palet cukup). */
  color: AgentColor;
  /** Ada call running pada dokumen ini. */
  working: boolean;
  /** Baris aksi saat working: `"{tool} · {judul call}"`. */
  action?: string;
  /** Board lokasi kursor. */
  boardId: string;
  /** Node lokasi (bukan board); tanpa nilai → kursor di tengah board. */
  nodeId?: string;
  /** Bounds node lokasi relatif board. */
  rect?: Rect;
  /** Node berubah/baru dari execute yang selesai ≤ `CHANGED_WINDOW_MS` lalu (maks 12, tanpa board). */
  changed: ChangedNode[];
  /** Board yang dibuat execute yang sama (hanya baris Layers `created`, tanpa outline). */
  createdBoards: string[];
  /** Kunci sorotan (callId execute): berubah → animasi diputar ulang. */
  changedKey?: string;
  /** Node utama sorotan. */
  primary?: string;
  /** Board yang disentuh execute sorotan (label board berganti tag "Just changed · {label}", story 3). */
  changedBoards: string[];
  /** Node baru pertama execute sorotan (tag "Added · {nama}", story 3). */
  added?: { id: string; name: string };
};

type Index = ReadonlyMap<string, NodeInfo>;
type Location = { boardId: string; nodeId?: string; rect?: Rect };

const isBoard = (index: Index, id: string) => index.get(id)?.boardId === id;
const finished = (c: ActivityCall) => c.status === 'done' || c.status === 'warning';

/** Lokasi dari node `id` (harus ada di indeks); board → seluruh board. */
function at(index: Index, id: string, rect: Rect | undefined): Location | undefined {
  const info = index.get(id);
  if (!info) return undefined;
  if (info.boardId === id) return { boardId: id };
  return { boardId: info.boardId, nodeId: id, ...(rect ? { rect } : {}) };
}

/** Lokasi yang ditunjuk satu call selesai, atau undefined bila call ini tidak punya lokasi. */
export function callLocation(c: ActivityCall, index: Index): Location | undefined {
  if (!finished(c)) return undefined;
  switch (c.tool) {
    case 'execute': {
      const bounds = c.bounds ?? {};
      const created = c.created?.find((id) => bounds[id] && index.has(id));
      if (created) return at(index, created, bounds[created]);
      const other = Object.keys(bounds).find((id) => index.has(id) && !isBoard(index, id));
      if (other) return at(index, other, bounds[other]);
      const board = c.boards?.[0];
      return board && isBoard(index, board) ? { boardId: board } : undefined;
    }
    case 'inspect':
      return c.target ? at(index, c.target, c.bounds?.[c.target]) : undefined;
    case 'screenshot':
    case 'export':
    case 'layout_check': {
      const info = c.target ? index.get(c.target) : undefined;
      return info ? { boardId: info.boardId } : undefined;
    }
    default:
      return undefined;
  }
}

/** Kehadiran tiap sesi Live yang punya lokasi pada dokumen ini. `views` dari `sessionsForSlug` (call terbaru dulu). */
export function agentPresence(views: readonly SessionView[], index: Index, now: number): AgentPresence[] {
  const out: AgentPresence[] = [];
  const nameOf = (id: string) => index.get(id)?.name;
  // Warna dibagi antar-sesi Live saja: sesi lama yang sudah idle tidak mengambil warna harness sesi baru.
  const colors = assignAgentColors(views.filter((v) => v.live).map((v) => ({ id: v.session.id, createdAt: v.session.createdAt, who: whoOf(v.session) })));
  for (const v of views) {
    if (!v.live) continue;
    let loc: Location | undefined;
    for (const c of v.calls) {
      loc = callLocation(c, index);
      if (loc) break;
    }
    if (!loc) continue;
    const running = v.calls.find((c) => c.status === 'running');
    const p: AgentPresence = {
      session: v.session.id,
      label: harnessLabel(whoOf(v.session)),
      color: colors.get(v.session.id) ?? 'agent',
      working: running !== undefined,
      ...(running ? { action: `${running.tool} · ${callTitle(running, nameOf)}` } : {}),
      ...loc,
      changed: [],
      createdBoards: [],
      changedBoards: [],
    };
    // Sorotan: execute selesai terbaru, bila sukses dan masih dalam jendela 10 dtk (gagal → tanpa sorotan).
    const exec = v.calls.find((c) => c.tool === 'execute' && c.status !== 'running');
    if (exec && finished(exec) && now - callEndMs(exec) <= CHANGED_WINDOW_MS) {
      const bounds = exec.bounds ?? {};
      // Node utama dari execute itu sendiri (bukan dari call lokasi terbaru, mis. inspect sesudahnya).
      const lead = callLocation(exec, index)?.nodeId;
      const all = Object.keys(bounds).filter((id) => index.has(id) && !isBoard(index, id));
      // Node utama selalu termasuk (urutan pertama, stagger dimulai darinya).
      const ids = lead && all.includes(lead) ? [lead, ...all.filter((id) => id !== lead)] : all;
      const created = new Set(exec.created ?? []);
      p.changed = ids.slice(0, CHANGED_MAX).map((id) => ({ id, boardId: index.get(id)!.boardId, rect: bounds[id]!, created: created.has(id) }));
      // Board baru: hanya umpan balik baris Layers (tanpa outline node).
      p.createdBoards = [...created].filter((id) => isBoard(index, id));
      // Board tersentuh juga menyalakan sorotan (execute yang hanya menghapus node tetap memberi tag "Just changed").
      const touched = (exec.boards ?? []).filter((id) => isBoard(index, id));
      if (p.changed.length || p.createdBoards.length || touched.length) p.changedKey = exec.callId;
      const primary = p.changed.length ? (lead && ids.includes(lead) ? lead : p.changed[0]!.id) : undefined;
      if (primary) p.primary = primary;
      if (p.changedKey) p.changedBoards = [...new Set([...touched, ...p.changed.map((c) => c.boardId)])].filter((id) => isBoard(index, id));
      const added = p.changed.find((c) => c.created);
      if (added) p.added = { id: added.id, name: nameOf(added.id) ?? added.id };
    }
    out.push(p);
  }
  return out;
}

export type LayerMark = 'agent' | 'created' | 'changed';
const RANK: Record<LayerMark, number> = { agent: 3, created: 2, changed: 1 };

/** Tanda baris: warna dan kunci dari sesi yang menang (kunci = `changedKey` untuk created/changed). */
export type LayerMarkInfo = { mark: LayerMark; color: AgentColor; key?: string };

/** State baris Layers: node lokasi saat working → agent; node/board baru → created; node berubah lain → changed. */
export function layerMarks(presence: readonly AgentPresence[]): Map<string, LayerMarkInfo> {
  const out = new Map<string, LayerMarkInfo>();
  const put = (id: string, mark: LayerMark, p: AgentPresence) => {
    const prev = out.get(id);
    if (prev && RANK[mark] <= RANK[prev.mark]) return;
    out.set(id, { mark, color: p.color, ...(mark !== 'agent' && p.changedKey ? { key: p.changedKey } : {}) });
  };
  for (const p of presence) {
    if (p.working) put(p.nodeId ?? p.boardId, 'agent', p);
    for (const c of p.changed) put(c.id, c.created ? 'created' : 'changed', p);
    for (const id of p.createdBoards) put(id, 'created', p);
  }
  return out;
}

/**
 * Rencana fade-in node baru (spec-canvas-agent-effects): execute selesai terbaru tiap sesi yang membuat node dan
 * punya rev. Tanpa indeks dokumen: event tiba sebelum dokumen termuat ulang, jadi node baru belum ada di indeks.
 * Lama/baru disaring `FadeQueue` (hanya execute yang selesai sesudah canvas dibuka).
 */
export function fadePlans(views: readonly SessionView[]): FadePlan[] {
  const out: FadePlan[] = [];
  for (const v of views) {
    const exec = v.calls.find((c) => c.tool === 'execute' && c.status !== 'running');
    if (!exec || !finished(exec) || !exec.created?.length || typeof exec.rev !== 'number') continue;
    out.push({ key: exec.callId, rev: exec.rev, endMs: callEndMs(exec), ids: exec.created });
  }
  return out;
}
