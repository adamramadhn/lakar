// Fixture transkrip stream-json `claude -p` untuk tes bench (bukan bagian dist bench).
import type { TimedLine } from '../../bench/src/stream-metrics.ts';

/** Event → baris bercap waktu `i * stepMs`. */
export const timedLines = (evs: unknown[], stepMs: number): TimedLine[] => evs.map((e, i) => ({ t: i * stepMs, line: JSON.stringify(e) }));

/** Pesan `assistant` berisi satu blok `tool_use`. */
export const toolUseEvent = (id: string, name: string, input: unknown) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } });

/** Pesan `user` berisi satu blok `tool_result`; `is_error` hanya ditulis bila diberikan. */
export const toolResultEvent = (id: string, content: unknown, isError?: boolean) => ({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: id, ...(isError !== undefined ? { is_error: isError } : {}), content }] },
});
