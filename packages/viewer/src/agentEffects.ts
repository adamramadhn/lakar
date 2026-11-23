// Efek canvas saat agen bekerja (spec-canvas-agent-effects, desain bagian 04 "Agents at work"). Murni, tanpa DOM:
// warna per sesi agen, pilihan unit reveal bertahap dan jadwalnya, antrean fade per board/rev, kamera Follow ke seksi baru,
// kursor yang sedang keluar, dan board yang sedang "Generating". Bagian DOM (Web Animations) ada di agentFx.ts.
import { harnessColor, whoOf, type SessionView } from './activity.js';

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

/**
 * Warna sesi Live sebuah dokumen (`views` dari `sessionsForSlug`): satu sumber untuk kursor canvas, Layers, panel
 * Activity, dan badge Live, supaya sesi Claude kedua violet di semua tempat. Sesi idle tidak ikut dibagi.
 */
export function liveSessionColors(views: readonly SessionView[]): Map<string, AgentColor> {
  return assignAgentColors(views.filter((v) => v.live).map((v) => ({ id: v.session.id, createdAt: v.session.createdAt, who: whoOf(v.session) })));
}

/** Warna sebuah sesi: warna sesi Live bila ada, selain itu warna pilihan harness-nya (sesi idle/berakhir). */
export function sessionColor(colors: ReadonlyMap<string, AgentColor>, session: { id: string; client?: string | undefined; agent?: string | undefined }): AgentColor {
  return colors.get(session.id) ?? preferredColor(whoOf(session));
}

/** Umur entri antrean fade: lewat ini board yang baru di-mount tidak lagi memutar efek. */
export const FADE_TTL_MS = 10_000;
/** Toleransi jam: execute yang selesai sedikit sebelum canvas dibuka masih dihitung "sudah ada" (tanpa efek). */
export const FADE_SINCE_SLACK_MS = 1_000;

/**
 * Id yang tidak punya leluhur di himpunan `ids` (anak node baru ikut induknya, tidak dianimasikan sendiri).
 * `parentOf` mengembalikan id induk (undefined di akar). Urutan asal dipertahankan, maks `max`.
 */
export function topmost(ids: readonly string[], parentOf: (id: string) => string | undefined, max = Number.POSITIVE_INFINITY): string[] {
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

// ---- Reveal bertahap (spec-progressive-live-build) ----
// Node baru satu execute tidak lagi muncul sebagai satu blok: akar baru (`topmost`) dipecah menjadi "blok" (baris,
// kartu, judul, gambar) dalam urutan dokumen, lalu blok-blok itu masuk satu per satu dari atas ke bawah. Wadah yang
// dipecah (board baru, `Halaman`, seksi) menjadi "cangkang": hanya opacity singkat, supaya latar seksi tidak meloncat
// sebelum isinya.

/** Maks unit yang dianimasikan per reveal (bukan ribuan daun). */
export const REVEAL_MAX_UNITS = 32;
/** Kedalaman pecah maks dari akar baru: board → Halaman → seksi → baris/grid → kartu. */
export const REVEAL_MAX_DEPTH = 4;
/** Node dengan turunan ≤ ini tetap satu unit (tombol, badge, ikon + teks). */
export const REVEAL_ATOM = 3;
/** Durasi satu unit, jeda antar-unit maks, dan batas total reveal (ms). Riset: g-build 650ms, Paper 300ms. */
export const REVEAL_MS = 600;
export const REVEAL_STEP_MS = 60;
export const REVEAL_TOTAL_MAX_MS = 1500;
/** Durasi fade cangkang (opacity saja). */
export const REVEAL_SHELL_MS = 240;

/** Hasil pemilihan unit: unit dalam urutan dokumen, dan cangkang dengan indeks unit pertama di dalamnya. */
export type RevealPick<T> = { units: T[]; shells: { node: T; first: number }[] };

/**
 * Pecah akar baru menjadi unit reveal. Mulai dari `roots` (urutan dokumen); selama anggaran cukup, unit terbesar
 * (jumlah turunan `size`) yang masih boleh dipecah (kedalaman < `maxDepth`, punya anak, lebih besar dari atom, dan
 * hasilnya ≤ `max` unit) diganti anak-anaknya di tempat yang sama, sehingga urutan dokumen terjaga. Node yang dipecah
 * menjadi cangkang. Murni: `kids` dan `size` disediakan pemanggil (DOM di agentFx.ts, objek biasa di tes).
 */
export function revealUnits<T>(
  roots: readonly T[],
  kids: (t: T) => readonly T[],
  size: (t: T) => number,
  opts: { max?: number; maxDepth?: number; atom?: number } = {},
): RevealPick<T> {
  const max = opts.max ?? REVEAL_MAX_UNITS;
  const maxDepth = opts.maxDepth ?? REVEAL_MAX_DEPTH;
  const atom = opts.atom ?? REVEAL_ATOM;
  type Item = { node: T; depth: number; shells: number[] };
  // Akar melebihi anggaran: hanya `max` akar pertama yang dianimasikan; sisanya langsung tampil.
  let items: Item[] = roots.slice(0, max).map((node) => ({ node, depth: 0, shells: [] }));
  const shells: { node: T; first: number }[] = [];
  for (;;) {
    let best = -1;
    let bestSize = -1;
    items.forEach((it, i) => {
      if (it.depth >= maxDepth) return;
      const s = size(it.node);
      if (s <= atom || s <= bestSize) return;
      const k = kids(it.node).length;
      if (k === 0 || items.length - 1 + k > max) return;
      best = i;
      bestSize = s;
    });
    if (best < 0) break;
    const it = items[best]!;
    const shell = shells.push({ node: it.node, first: Number.POSITIVE_INFINITY }) - 1;
    const children = kids(it.node).map((node) => ({ node, depth: it.depth + 1, shells: [...it.shells, shell] }));
    items = [...items.slice(0, best), ...children, ...items.slice(best + 1)];
  }
  items.forEach((it, i) => {
    for (const s of it.shells) shells[s]!.first = Math.min(shells[s]!.first, i);
  });
  return { units: items.map((it) => it.node), shells: shells.map((s) => ({ node: s.node, first: Number.isFinite(s.first) ? s.first : 0 })) };
}

/**
 * Jadwal reveal `n` unit: jeda antar-unit `REVEAL_STEP_MS`, dipadatkan supaya unit terakhir selesai ≤
 * `REVEAL_TOTAL_MAX_MS` (execute besar tidak membuat pengguna menunggu).
 */
export function revealSchedule(n: number): { step: number; duration: number; total: number } {
  const duration = REVEAL_MS;
  const step = n <= 1 ? 0 : Math.min(REVEAL_STEP_MS, (REVEAL_TOTAL_MAX_MS - duration) / (n - 1));
  return { step, duration, total: n <= 0 ? 0 : (n - 1) * step + duration };
}

// ---- Follow agent ke seksi baru (spec-progressive-live-build) ----

/** Wilayah dokumen (koordinat halaman). */
export type Region = { x: number; y: number; width: number; height: number };
type Cam = { x: number; y: number; z: number };
const FOLLOW_PAD = 56;
/** Ruang atas untuk label board. */
const FOLLOW_LABEL = 24;

/** Wilayah terlihat utuh di viewport `w × h` dengan kamera `c`? */
export function regionVisible(r: Region, c: Cam, w: number, h: number): boolean {
  const left = c.x + r.x * c.z;
  const top = c.y + r.y * c.z;
  return left >= 0 && top >= 18 && left + r.width * c.z <= w && top + r.height * c.z <= h;
}

/**
 * Kamera Follow untuk seksi baru: zoom saat ini dipertahankan kecuali lebar wilayah tidak muat (tidak di-zoom-out
 * demi tinggi). Wilayah muat setinggi viewport → dipusatkan; lebih tinggi → tepi atasnya di bawah label board, supaya
 * awal seksi baru yang terlihat.
 */
export function followCamera(r: Region, c: Cam, w: number, h: number, zoom: { min: number; max: number }): Cam {
  const z = Math.min(zoom.max, Math.max(zoom.min, Math.min(c.z, (w - FOLLOW_PAD * 2) / Math.max(1, r.width))));
  const x = w / 2 - (r.x + r.width / 2) * z;
  const fits = r.height * z <= h - FOLLOW_PAD * 2 - FOLLOW_LABEL;
  const y = fits ? h / 2 - (r.y + r.height / 2) * z + FOLLOW_LABEL / 2 : FOLLOW_PAD + FOLLOW_LABEL - r.y * z;
  return { x, y, z };
}

// ---- Follow berirama untuk banyak execute kecil (spec-skeleton-live-build) ----

/** Jarak minimum antar-geser kamera Follow; target yang tiba lebih cepat digabung (yang terbaru dipakai). */
export const FOLLOW_SETTLE_MS = 1200;
/** Bagian tinggi viewport yang cukup memperlihatkan blok tinggi (blok kecil harus terlihat utuh). */
const FOLLOW_VISIBLE_H = 0.4;
/** Bagian lebar viewport yang cukup untuk wilayah lebar (seksi selebar board). */
const FOLLOW_VISIBLE_W = 0.8;

/**
 * Wilayah cukup terlihat sehingga Follow tidak perlu menggeser kamera: bagian yang terlihat (di bawah label board)
 * ≥ min(tinggi wilayah, 40% viewport) dan ≥ min(lebar wilayah, 80% viewport). Blok kecil di seksi yang sudah
 * terlihat → diam; blok yang terpotong tepi atau di luar layar → geser.
 */
export function regionInView(r: Region, c: Cam, w: number, h: number): boolean {
  const left = c.x + r.x * c.z;
  const top = c.y + r.y * c.z;
  const rw = r.width * c.z;
  const rh = r.height * c.z;
  const visW = Math.min(left + rw, w) - Math.max(left, 0);
  const visH = Math.min(top + rh, h) - Math.max(top, 18);
  return visW >= Math.min(rw, w * FOLLOW_VISIBLE_W) - 1 && visH >= Math.min(rh, (h - 18) * FOLLOW_VISIBLE_H) - 1;
}

/** Board (atau wilayah) beririsan dengan viewport sama sekali. */
export function regionTouchesView(r: Region, c: Cam, w: number, h: number): boolean {
  const left = c.x + r.x * c.z;
  const top = c.y + r.y * c.z;
  return left < w && top < h && left + r.width * c.z > 0 && top + r.height * c.z > 0;
}

/** Sisa tunggu sebelum geser Follow berikutnya boleh dimulai (0 = sekarang). */
export const followWait = (lastPanAt: number | undefined, now: number): number => (lastPanAt === undefined ? 0 : Math.max(0, lastPanAt + FOLLOW_SETTLE_MS - now));

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
   * execute (Canvas menggabungkannya menjadi satu reveal per mount).
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

/**
 * Board yang sedang dikerjakan → presence pertama yang menunjuknya: working (call berjalan), lalu building (board
 * `[WIP] ` di antara execute, spec-progressive-live-build). Working menang bila dua sesi menunjuk board yang sama.
 */
export function generatingBoards<P extends { working: boolean; building?: boolean | undefined; boardId: string }>(presence: readonly P[]): Map<string, P> {
  const out = new Map<string, P>();
  for (const p of presence) if (p.working && !out.has(p.boardId)) out.set(p.boardId, p);
  for (const p of presence) if (p.building && !out.has(p.boardId)) out.set(p.boardId, p);
  return out;
}

/** Teks label board yang sedang dikerjakan (desain "✦ Generating · nama"). */
export const generatingText = (boardName: string): string => `✦ Generating · ${boardName}`;
