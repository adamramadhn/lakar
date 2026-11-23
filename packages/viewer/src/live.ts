// Badge "Live" Dashboard (desain 01 "File Card" / "List Row": badge Live + subjudul "Claude Code is editing…") dan
// daftar "Connected agents" Settings → Connections. Turunan murni dari stream aktivitas (activity.ts); tanpa React.
import { harnessColor, harnessLabel, isLive, VIEWER_CLIENT, whoOf, type ActivityState } from './activity.js';

export type LiveDoc = { label: string; color: 'agent' | 'codex'; running: boolean };

/** Dokumen yang sedang dikerjakan agen Live: slug → agen terbaru (call berjalan didahulukan). */
export function liveDocs(state: ActivityState, now: number): Map<string, LiveDoc> {
  const out = new Map<string, LiveDoc & { at: number }>();
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
    out.set(slug, { label: harnessLabel(whoOf(session)), color: harnessColor(whoOf(session)), running, at });
  }
  return new Map([...out].map(([slug, { label, color, running }]) => [slug, { label, color, running }]));
}

export type AgentRow = { id: string; label: string; color: 'agent' | 'codex'; live: boolean; executes: number; activeSlug?: string; lastAt?: string };

/** Sesi agen (bukan viewer) untuk "Connected agents": Live dulu, lalu yang terakhir aktif. */
export function agentRows(state: ActivityState, now: number): AgentRow[] {
  const rows: AgentRow[] = [];
  for (const s of Object.values(state.sessions)) {
    if (s.client === VIEWER_CLIENT) continue;
    const calls = state.calls.filter((c) => c.session === s.id);
    rows.push({
      id: s.id,
      label: harnessLabel(whoOf(s)),
      color: harnessColor(whoOf(s)),
      live: isLive(calls, now),
      executes: s.executes,
      ...(s.activeSlug ? { activeSlug: s.activeSlug } : {}),
      ...(s.lastAt ? { lastAt: s.lastAt } : {}),
    });
  }
  return rows.sort((a, b) => Number(b.live) - Number(a.live) || (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
}
