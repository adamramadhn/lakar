// Badge "Live" Dashboard (desain 01 "File Card" / "List Row": badge Live + subjudul "Claude Code is editing…") dan
// daftar "Connected agents" Settings → Connections. Turunan murni dari stream aktivitas (activity.ts); tanpa React.
// Warna = warna sesi Live per dokumen (`liveSessionColors`), sama dengan kursor canvas dan panel Activity
// (spec-agent-identity-history).
import { harnessLabel, isLive, sessionsForSlug, VIEWER_CLIENT, whoOf, type ActivitySession, type ActivityState } from './activity.js';
import { liveSessionColors, sessionColor, type AgentColor } from './agentEffects.js';

export type LiveDoc = { label: string; color: AgentColor; running: boolean };

const NO_COLORS: ReadonlyMap<string, AgentColor> = new Map();

/**
 * Warna sesi pada dokumen `slug`: pembagian warna sesi Live dokumen itu (dihitung sekali per slug lewat `cache`);
 * tanpa slug → warna pilihan harness.
 */
function colorOn(state: ActivityState, now: number, cache: Map<string, ReadonlyMap<string, AgentColor>>, session: ActivitySession, slug: string | undefined): AgentColor {
  if (!slug) return sessionColor(NO_COLORS, session);
  let colors = cache.get(slug);
  if (!colors) {
    colors = liveSessionColors(sessionsForSlug(state, slug, now));
    cache.set(slug, colors);
  }
  return sessionColor(colors, session);
}

/** Dokumen yang sedang dikerjakan agen Live: slug → agen terbaru (call berjalan didahulukan). */
export function liveDocs(state: ActivityState, now: number): Map<string, LiveDoc> {
  const out = new Map<string, LiveDoc & { at: number }>();
  const cache = new Map<string, ReadonlyMap<string, AgentColor>>();
  for (const session of Object.values(state.sessions)) {
    if (session.client === VIEWER_CLIENT) continue;
    const calls = state.calls.filter((c) => c.session === session.id);
    if (!isLive(calls, now)) continue;
    const last = calls[calls.length - 1];
    const slug = last?.slug ?? session.activeSlug;
    if (!slug) continue;
    const running = calls.some((c) => c.status === 'running' && (c.slug ?? session.activeSlug) === slug);
    const at = last ? Date.parse(last.startedAt) : 0;
    const prev = out.get(slug);
    if (prev && ((prev.running && !running) || (prev.running === running && prev.at >= at))) continue;
    out.set(slug, { label: harnessLabel(whoOf(session)), color: colorOn(state, now, cache, session, slug), running, at });
  }
  return new Map([...out].map(([slug, { label, color, running }]) => [slug, { label, color, running }]));
}

export type AgentRow = { id: string; label: string; color: AgentColor; live: boolean; executes: number; activeSlug?: string; lastAt?: string };

/** Sesi agen (bukan viewer) untuk "Connected agents": Live dulu, lalu yang terakhir aktif. */
export function agentRows(state: ActivityState, now: number): AgentRow[] {
  const rows: AgentRow[] = [];
  const cache = new Map<string, ReadonlyMap<string, AgentColor>>();
  for (const s of Object.values(state.sessions)) {
    if (s.client === VIEWER_CLIENT) continue;
    const calls = state.calls.filter((c) => c.session === s.id);
    const live = isLive(calls, now);
    // Dokumen tempat sesi Live terakhir bekerja (sama dengan liveDocs); sesi idle memakai warna pilihan harness.
    const slug = live ? (calls[calls.length - 1]?.slug ?? s.activeSlug) : undefined;
    rows.push({
      id: s.id,
      label: harnessLabel(whoOf(s)),
      color: colorOn(state, now, cache, s, slug),
      live,
      executes: s.executes,
      ...(s.activeSlug ? { activeSlug: s.activeSlug } : {}),
      ...(s.lastAt ? { lastAt: s.lastAt } : {}),
    });
  }
  return rows.sort((a, b) => Number(b.live) - Number(a.live) || (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
}
