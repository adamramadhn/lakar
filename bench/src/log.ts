// Utilitas CLI bench bersama (pen.dev, Lakar, putaran): log stderr, Abort preflight, cap waktu seri, JSON kanonik, sleep.

/** Kegagalan preflight/harness yang menghentikan perintah dengan exit 1 (bukan crash). */
export class Abort extends Error {}

export const log = (m: string): void => {
  process.stderr.write(`bench: ${m}\n`);
};

/** `20261117T231042Z` dari tanggal (UTC, tanpa milidetik). */
export function stamp(d = new Date()): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/** JSON dengan kunci objek terurut (perbandingan konfigurasi). */
export function canonical(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonical).join(',')}]`;
  if (x && typeof x === 'object')
    return `{${Object.keys(x)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((x as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(x);
}

/** Jeda `ms` milidetik (satu helper untuk semua tunggu-ulang harness). */
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
