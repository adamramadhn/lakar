// Efek canvas saat agen bekerja (spec-canvas-agent-effects, desain bagian 04 "Agents at work"). Murni, tanpa DOM:
// warna per sesi agen, pilihan node yang di-fade-in, jadwal stagger, antrean fade per board/rev, kursor yang sedang
// keluar, dan board yang sedang "Generating". Bagian DOM (Web Animations) ada di agentFx.ts.
import { harnessColor } from './activity.js';

/** Palet warna agen (urutan = urutan pemberian saat bertabrakan). Kelas CSS bernama sama (app.css). */
export const AGENT_COLORS = ['agent', 'codex', 'violet', 'emerald', 'pink'] as const;
export type AgentColor = (typeof AGENT_COLORS)[number];
const EXTRA: readonly AgentColor[] = ['violet', 'emerald', 'pink'];

/** Hash string kecil yang stabil (FNV-1a 32 bit). */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Warna pilihan sebuah harness: Codex → `codex`; Claude, klien MCP tanpa nama harness, atau tanpa identitas →
 * `agent` (oranye); harness lain → salah satu warna tambahan dari hash namanya (stabil antar-sesi).
 */
export function preferredColor(who: string | undefined): AgentColor {
  if (harnessColor(who) === 'codex') return 'codex';
  const w = who?.toLowerCase() ?? '';
  if (!w || w.includes('claude') || w === 'lakar-mcp') return 'agent';
  return EXTRA[hash(w) % EXTRA.length]!;
}

export type ColorSession = { id: string; createdAt: string; who: string | undefined };

/**
 * Warna per sesi: urut `createdAt` (lalu id), setiap sesi memakai warna pilihan harness-nya bila belum dipakai,
 * selain itu warna tambahan bebas pertama (violet, emerald, pink) supaya sesi Claude kedua tidak tampak seperti Codex,
 * lalu warna bebas mana pun. Palet habis → warna pilihan (boleh kembar).
 */
export function assignAgentColors(sessions: readonly ColorSession[]): Map<string, AgentColor> {
  const out = new Map<string, AgentColor>();
  const used = new Set<AgentColor>();
  const sorted = [...sessions].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const s of sorted) {
    const pref = preferredColor(s.who);
    const color = !used.has(pref) ? pref : (EXTRA.find((c) => !used.has(c)) ?? AGENT_COLORS.find((c) => !used.has(c)) ?? pref);
    used.add(color);
    out.set(s.id, color);
  }
  return out;
}

/** Maks elemen yang di-fade-in per execute (node teratas). */
export const FADE_MAX = 12;
/** Jeda stagger antar-elemen dan batas totalnya (ms). */
export const FADE_STAGGER_MS = 60;
export const FADE_STAGGER_MAX_MS = 480;
/** Umur entri antrean fade: lewat ini board yang baru di-mount tidak lagi memutar efek. */
export const FADE_TTL_MS = 10_000;
/** Toleransi jam: execute yang selesai sedikit sebelum canvas dibuka masih dihitung "sudah ada" (tanpa efek). */
export const FADE_SINCE_SLACK_MS = 1_000;

/**
 * Id yang tidak punya leluhur di himpunan `ids` (anak node baru ikut induknya, tidak dianimasikan sendiri).
 * `parentOf` mengembalikan id induk (undefined di akar). Urutan asal dipertahankan, maks `max`.
 */
export function topmost(ids: readonly string[], parentOf: (id: string) => string | undefined, max = FADE_MAX): string[] {
  const set = new Set(ids);
  const out: string[] = [];
  for (const id of ids) {
    let p = parentOf(id);
    let nested = false;
    // Batas langkah menjaga dari siklus (seharusnya tidak ada di pohon dokumen).
    for (let guard = 0; p !== undefined && guard < 256; guard++) {
      if (set.has(p)) {
        nested = true;
        break;
      }
      p = parentOf(p);
    }
    if (!nested && !out.includes(id)) out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

/** Delay elemen ke-`i` (stagger, dibatasi supaya execute besar tidak menunggu lama). */
export const staggerDelay = (i: number, step = FADE_STAGGER_MS, max = FADE_STAGGER_MAX_MS): number => Math.min(Math.max(0, i) * step, max);

/** Rencana fade dari satu execute agen: kunci (callId), rev hasil, waktu selesai, dan id node yang dibuat. */
export type FadePlan = { key: string; rev: number; endMs: number; ids: readonly string[] };

type FadeEntry = FadePlan & { at: number; boards: Set<string> };

/**
 * Antrean fade per canvas. `offer` mencatat rencana yang execute-nya selesai sesudah canvas dibuka (`since`), sekali
 * per kunci. `take(board, mountRev)` mengembalikan id dari rencana yang rev-nya sudah termuat di board itu dan belum
 * diputar untuk board tersebut; DOM memilih id yang memang ada di board.
 */
export class FadeQueue {
  readonly #since: number;
  readonly #ttl: number;
  readonly #entries = new Map<string, FadeEntry>();
  readonly #seen = new Set<string>();
  constructor(since: number, ttl = FADE_TTL_MS) {
    this.#since = since;
    this.#ttl = ttl;
  }
  /** Catat rencana; false bila lama (sebelum canvas dibuka), kosong, atau kuncinya sudah pernah dilihat. */
  offer(plan: FadePlan, now: number): boolean {
    if (this.#seen.has(plan.key)) return false;
    this.#seen.add(plan.key);
    if (!plan.ids.length || plan.endMs < this.#since - FADE_SINCE_SLACK_MS || now - plan.endMs > this.#ttl) return false;
    this.#entries.set(plan.key, { ...plan, at: now, boards: new Set() });
    return true;
  }
  /**
   * Id yang harus di-fade-in pada board `boardId` yang baru di-mount dari dokumen rev `mountRev`, satu kelompok per
   * execute (batas `FADE_MAX` berlaku per execute).
   */
  take(boardId: string, mountRev: number, now: number): string[][] {
    const out: string[][] = [];
    for (const [key, e] of this.#entries) {
      if (now - e.at > this.#ttl) {
        this.#entries.delete(key);
        continue;
      }
      if (mountRev < e.rev || e.boards.has(boardId)) continue;
      e.boards.add(boardId);
      out.push([...e.ids]);
    }
    return out;
  }
  /** Tandai rencana sebagai sudah ada tanpa memutarnya (snapshot `hello` sesudah reconnect). */
  prime(plans: readonly FadePlan[]): void {
    for (const p of plans) this.#seen.add(p.key);
  }
  get size(): number {
    return this.#entries.size;
  }
}

/** Item yang tampil, `goneAt` = saat hilang dari daftar terkini (sedang animasi keluar). */
export type Shown<T> = { key: string; value: T; goneAt?: number };

/**
 * Daftar tampil dengan item yang baru hilang tetap ada selama `exitMs` (animasi keluar kursor). Item terkini dulu
 * (urutan `current`), lalu item yang sedang keluar; item yang kembali sebelum habis langsung aktif lagi.
 */
export function withExiting<T>(prev: readonly Shown<T>[], current: readonly T[], keyOf: (t: T) => string, now: number, exitMs: number): Shown<T>[] {
  const out: Shown<T>[] = current.map((value) => ({ key: keyOf(value), value }));
  const live = new Set(out.map((s) => s.key));
  for (const p of prev) {
    if (live.has(p.key)) continue;
    const goneAt = p.goneAt ?? now;
    if (now - goneAt < exitMs) out.push({ key: p.key, value: p.value, goneAt });
  }
  return out;
}

/** Board yang sedang dikerjakan (presence working) → presence pertama yang menunjuknya. */
export function generatingBoards<P extends { working: boolean; boardId: string }>(presence: readonly P[]): Map<string, P> {
  const out = new Map<string, P>();
  for (const p of presence) if (p.working && !out.has(p.boardId)) out.set(p.boardId, p);
  return out;
}

/** Teks label board yang sedang dikerjakan (desain "✦ Generating · nama"). */
export const generatingText = (boardName: string): string => `✦ Generating · ${boardName}`;
