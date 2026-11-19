// Pasangan tool_use → tool_result dari transkrip stream-json (murni). Dipakai pembacaan di luar waktu
// (slug Lakar, reconnect, emoji agen); loop metrik utama `stream-metrics.ts` punya pembacaan sendiri.
import type { TimedLine } from './stream-metrics.js';

/** Satu blok `tool_use` agen (pesan `assistant`). */
export type ToolUse = { t: number; id: string; name: string; input: any };

export type ToolEvent =
  | { kind: 'use'; use: ToolUse }
  /** Blok `tool_result` (pesan `user`) apa adanya, dengan `tool_use` pasangannya bila sudah terlihat. */
  | { kind: 'result'; t: number; block: any; use: ToolUse | undefined };

/**
 * Blok tool_use/tool_result berurutan. Baris non-JSON dan pesan tanpa `message.content` array dilewati;
 * pasangan dicari lewat `tool_use_id` → `id` tool_use sebelumnya.
 */
export function* toolEvents(lines: readonly TimedLine[]): Generator<ToolEvent> {
  const uses = new Map<string, ToolUse>();
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
      if (ev.type === 'assistant' && c?.type === 'tool_use') {
        const use: ToolUse = { t, id: String(c.id), name: String(c.name), input: c.input };
        uses.set(use.id, use);
        yield { kind: 'use', use };
      }
      if (ev.type === 'user' && c?.type === 'tool_result') yield { kind: 'result', t, block: c, use: uses.get(String(c.tool_use_id)) };
    }
  }
}
