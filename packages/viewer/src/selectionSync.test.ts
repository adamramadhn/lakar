import { describe, expect, it } from 'vitest';
import { SELECTION_MAX } from '@lakar/schema';
import { SELECTION_DEBOUNCE_MS, SelectionReporter, attachSelectionReporter, reportable } from './selectionSync.js';

const A = 'Aaaaaaa1';
const B = 'Bbbbbbb2';

function harness(fail = false) {
  const sent: { slug: string; addresses: string[] }[] = [];
  const timers = new Map<number, () => void>();
  let next = 0;
  const r = new SelectionReporter(
    'kopi',
    async (slug, addresses) => {
      sent.push({ slug, addresses });
      if (fail) throw new Error('offline');
    },
    {
      setTimeout: (fn, ms) => {
        expect(ms).toBe(SELECTION_DEBOUNCE_MS);
        timers.set(++next, fn);
        return next;
      },
      clearTimeout: (h) => timers.delete(h as number),
    },
  );
  const flush = () => {
    const fns = [...timers.values()];
    timers.clear();
    for (const f of fns) f();
  };
  return { r, sent, timers, flush };
}

describe('SelectionReporter', () => {
  it('debounce: perubahan beruntun = satu kirim dengan seleksi terakhir', () => {
    const h = harness();
    h.r.update([A]);
    h.r.update([A, B]);
    expect(h.timers.size).toBe(1);
    expect(h.sent).toEqual([]);
    h.flush();
    expect(h.sent).toEqual([{ slug: 'kopi', addresses: [A, B] }]);
  });

  it('seleksi sama dengan yang terakhir terkirim tidak dikirim ulang; kosong awal tidak dikirim', () => {
    const h = harness();
    h.r.update([]);
    h.flush();
    expect(h.sent).toEqual([]);
    h.r.update([A]);
    h.flush();
    h.r.update([B]);
    h.r.update([A]);
    h.flush();
    expect(h.sent.map((s) => s.addresses)).toEqual([[A]]);
    h.r.update([]);
    h.flush();
    expect(h.sent.map((s) => s.addresses)).toEqual([[A], []]);
  });

  it('resend mengirim seleksi terkini segera (tanpa debounce); kosong tidak dikirim', () => {
    const h = harness();
    h.r.resend();
    expect(h.sent).toEqual([]);
    h.r.update([A]);
    h.flush();
    h.r.resend();
    expect(h.sent.map((s) => s.addresses)).toEqual([[A], [A]]);
  });

  it('dispose: jadwal batal; seleksi terkirim tidak kosong → kirim []; sesudahnya diam', () => {
    const h = harness();
    h.r.update([A]);
    h.flush();
    h.r.update([B]);
    h.r.dispose();
    expect(h.timers.size).toBe(0);
    expect(h.sent.map((s) => s.addresses)).toEqual([[A], []]);
    h.r.update([A]);
    h.r.resend();
    h.r.dispose();
    expect(h.sent).toHaveLength(2);
    const quiet = harness();
    quiet.r.dispose();
    expect(quiet.sent).toEqual([]);
  });

  it('gagal kirim diabaikan (tanpa unhandled rejection) dan seleksi yang sama boleh dikirim lagi', async () => {
    const h = harness(true);
    h.r.update([A]);
    h.flush();
    await new Promise((r) => setTimeout(r, 0));
    expect(h.sent).toHaveLength(1);
    h.r.update([A]);
    h.flush();
    expect(h.sent).toHaveLength(2);
  });

  it('attachSelectionReporter: seleksi awal + update terkirim, reconnect → kirim ulang, dispose → [] dan lepas listener', () => {
    const sent: string[][] = [];
    const timers: (() => void)[] = [];
    const listeners = new Set<{ onReconnect?: () => void }>();
    const a = attachSelectionReporter(
      'kopi',
      [A],
      async (_slug, addresses) => {
        sent.push(addresses);
      },
      (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      { setTimeout: (fn) => timers.push(fn), clearTimeout: () => {} },
    );
    timers.splice(0).forEach((f) => f());
    expect(sent).toEqual([[A]]);
    a.update([A, B]);
    timers.splice(0).forEach((f) => f());
    expect(sent.at(-1)).toEqual([A, B]);
    expect(listeners.size).toBe(1);
    for (const l of listeners) l.onReconnect?.();
    expect(sent).toEqual([[A], [A, B], [A, B]]);
    a.dispose();
    expect(sent.at(-1)).toEqual([]);
    expect(listeners.size).toBe(0);
  });

  it('reportable: buang bentuk tidak sah dan duplikat, maks SELECTION_MAX', () => {
    expect(reportable([A, 'page-1', A, `${A}/${B}`, ''])).toEqual([A, `${A}/${B}`]);
    const many = Array.from({ length: SELECTION_MAX + 5 }, (_, i) => `N${String(i).padStart(7, '0')}`);
    expect(reportable(many)).toHaveLength(SELECTION_MAX);
  });
});
