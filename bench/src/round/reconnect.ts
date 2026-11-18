// Reconnect per run (murni), dilaporkan terpisah dan tidak dikurangkan dari waktu (golden-set §Prosedur 3).
import type { DaemonState } from '../lakar/run.js';
import type { TimedLine } from '../stream-metrics.js';
import type { SystemdInfo } from '../sys.js';

export type ReconnectEvent = { kind: string; detail: string };
export type ToolErrorHit = { tool: string; ms: number | undefined; snippet: string };
export type Reconnect = { count: number; affectedMs: number; events: ReconnectEvent[]; toolErrors: ToolErrorHit[] };

const LAKAR_ERROR = /RENDER_FAILED|VERSION_MISMATCH|lakard tidak menjawab/;
/** Pola putus transport MCP/klien (kedua alat). Error snippet biasa (mis. node tidak ditemukan) bukan reconnect. */
export const TRANSPORT_ERROR = /not connected|disconnect|connection closed|ECONNREFUSED|ECONNRESET|EPIPE|socket hang up|MCP error -32000/i;

function resultText(c: any): string {
  if (typeof c?.content === 'string') return c.content;
  if (Array.isArray(c?.content)) return c.content.filter((x: any) => x?.type === 'text').map((x: any) => String(x.text)).join('\n');
  return '';
}

/** tool_result yang cocok `match`, dengan ms tool_use → tool_result. */
export function toolResultHits(lines: readonly TimedLine[], match: (c: any, text: string) => boolean): ToolErrorHit[] {
  const uses = new Map<string, { name: string; t: number }>();
  const out: ToolErrorHit[] = [];
  for (const { t, line } of lines) {
    let ev: any;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    const content = ev?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (ev.type === 'assistant' && c?.type === 'tool_use') uses.set(String(c.id), { name: String(c.name), t });
      if (ev.type === 'user' && c?.type === 'tool_result') {
        const text = resultText(c);
        if (!match(c, text)) continue;
        const u = uses.get(String(c.tool_use_id));
        out.push({ tool: u?.name ?? '?', ms: u ? Math.round(t - u.t) : undefined, snippet: text.replace(/\s+/g, ' ').slice(0, 200) });
      }
    }
  }
  return out;
}

const sum = (hits: ToolErrorHit[]) => hits.reduce((s, h) => s + (h.ms ?? 0), 0);

function systemdEvents(unit: string, before: SystemdInfo | undefined, after: SystemdInfo | undefined): ReconnectEvent[] {
  if (!before || !after) return [];
  const out: ReconnectEvent[] = [];
  if (before.NRestarts !== after.NRestarts) out.push({ kind: `${unit} NRestarts`, detail: `${before.NRestarts} → ${after.NRestarts}` });
  if (before.ActiveEnterTimestamp !== after.ActiveEnterTimestamp) out.push({ kind: `${unit} ActiveEnterTimestamp`, detail: `${before.ActiveEnterTimestamp} → ${after.ActiveEnterTimestamp}` });
  return out;
}

/** Lakar: lakard restart (pid/startedAt/NRestarts), halaman Chromium dibuat ulang (`recreated` naik), tool_result error berkode. */
export function lakarReconnect(before: DaemonState | undefined, after: DaemonState | undefined, lines: readonly TimedLine[]): Reconnect {
  const events: ReconnectEvent[] = [];
  if (before && after) {
    if (before.pid !== after.pid) events.push({ kind: 'lakard pid', detail: `${before.pid} → ${after.pid ?? '(tidak menjawab)'}` });
    if (before.startedAt !== after.startedAt) events.push({ kind: 'lakard startedAt', detail: `${before.startedAt} → ${after.startedAt ?? '(tidak menjawab)'}` });
    events.push(...systemdEvents('lakard', before.systemd, after.systemd).filter((e) => e.kind.endsWith('NRestarts')));
    if (before.recreated !== undefined && after.recreated !== undefined && after.recreated > before.recreated) {
      events.push({ kind: 'halaman Chromium dibuat ulang', detail: `recreated ${before.recreated} → ${after.recreated}` });
    }
  }
  const toolErrors = toolResultHits(lines, (c, text) => c?.is_error === true && (LAKAR_ERROR.test(text) || TRANSPORT_ERROR.test(text)));
  return { count: events.length + toolErrors.length, affectedMs: sum(toolErrors), events, toolErrors };
}

/** pen.dev: NRestarts/ActiveEnterTimestamp pen-desktop berubah, tool_result `is_error` berpola putus transport. */
export function pendevReconnect(before: SystemdInfo | undefined, after: SystemdInfo | undefined, lines: readonly TimedLine[]): Reconnect {
  const events = systemdEvents('pen-desktop', before, after);
  const toolErrors = toolResultHits(lines, (c, text) => c?.is_error === true && TRANSPORT_ERROR.test(text));
  return { count: events.length + toolErrors.length, affectedMs: sum(toolErrors), events, toolErrors };
}
