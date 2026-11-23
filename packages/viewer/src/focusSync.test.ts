import { describe, expect, it } from 'vitest';
import { openTabRequest, type StreamEvent } from './activity.js';
import { FocusReporter, attachFocusReporter } from './focusSync.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Pengirim palsu: setiap PUT menunggu sampai `settle` (urutan kedatangan = urutan `sent`). */
function harness() {
  const sent: { slug: string | null; keepalive?: boolean }[] = [];
  const waiting: { ok: () => void; fail: () => void }[] = [];
  const send = (slug: string | null, opts?: { keepalive?: boolean }) =>
    new Promise<void>((ok, fail) => {
      sent.push({ slug, ...(opts?.keepalive ? { keepalive: true } : {}) });
      if (opts?.keepalive) ok();
      else waiting.push({ ok, fail: () => fail(new Error('offline')) });
    });
  /** Selesaikan semua PUT yang sedang jalan (dan yang menyusul) sampai antrean kosong. */
  const drain = async (fail = false) => {
    while (waiting.length) {
      const w = waiting.shift()!;
      if (fail) w.fail();
      else w.ok();
      await tick();
    }
  };
  const slugs = () => sent.map((x) => x.slug);
  return { sent, send, drain, slugs, inflight: () => waiting.length };
}

describe('FocusReporter', () => {
  it('update hanya mengirim perubahan; refresh selalu mengirim nilai sekarang; dispose melepas dokumen', async () => {
    const h = harness();
    const r = new FocusReporter(h.send, 'a');
    r.update('a');
    await h.drain();
    expect(h.slugs()).toEqual(['a']);
    r.update('a');
    r.update(null);
    await h.drain();
    r.update('b');
    await h.drain();
    expect(h.slugs()).toEqual(['a', null, 'b']);
    r.refresh();
    await h.drain();
    expect(h.slugs()).toEqual(['a', null, 'b', 'b']);
    r.dispose();
    await h.drain();
    expect(h.slugs()).toEqual(['a', null, 'b', 'b', null]);
    r.update('c');
    r.refresh();
    r.dispose();
    await h.drain();
    expect(h.sent).toHaveLength(5);
  });

  it('serial: satu PUT dalam perjalanan; refresh lama lalu update baru tiba berurutan, hanya nilai terbaru yang menunggu', async () => {
    const h = harness();
    const r = new FocusReporter(h.send, 'a');
    r.refresh(); // jendela difokuskan: kirim 'a'
    r.update('b'); // hash berubah selagi PUT 'a' jalan → menunggu
    r.update('c'); // menggantikan 'b'
    expect(h.slugs()).toEqual(['a']);
    expect(h.inflight()).toBe(1);
    await h.drain();
    expect(h.slugs()).toEqual(['a', 'c']);
    // Nilai tunggu sama dengan kiriman terakhir → tidak dikirim lagi.
    r.update('d');
    r.update('c');
    await h.drain();
    expect(h.slugs()).toEqual(['a', 'c', 'd', 'c']);
    r.refresh();
    r.refresh();
    await h.drain();
    expect(h.slugs()).toEqual(['a', 'c', 'd', 'c', 'c']);
  });

  it('dispose tanpa dokumen terkirim tidak mengirim null', async () => {
    const h = harness();
    const r = new FocusReporter(h.send, null);
    r.update(null);
    r.dispose();
    await h.drain();
    expect(h.slugs()).toEqual([null]);
  });

  it('gagal kirim ditelan dan boleh dikirim lagi', async () => {
    const h = harness();
    const r = new FocusReporter(h.send, null);
    r.update('a');
    await h.drain(true);
    r.update('a');
    await h.drain();
    expect(h.slugs()).toEqual(['a', 'a']);
  });

  it('hide: null langsung dengan keepalive di luar antrean; sesudahnya update mengirim lagi', async () => {
    const h = harness();
    const r = new FocusReporter(h.send, 'a');
    r.refresh();
    r.update('b');
    r.hide();
    expect(h.sent).toEqual([{ slug: 'a' }, { slug: null, keepalive: true }]);
    await h.drain();
    expect(h.sent).toHaveLength(2); // 'b' yang menunggu dibuang
    r.update('b');
    await h.drain();
    expect(h.slugs()).toEqual(['a', null, 'b']);
  });
});

describe('attachFocusReporter', () => {
  it('kirim awal; jendela aktif lagi dan stream tersambung ulang → kirim ulang; dispose melepas pendengar + null', async () => {
    const h = harness();
    let reconnect: (() => void) | undefined;
    let activate: (() => void) | undefined;
    let offStream = 0;
    let offActivate = 0;
    const r = attachFocusReporter(
      'a',
      h.send,
      (l) => {
        reconnect = l.onReconnect;
        return () => void offStream++;
      },
      (fn) => {
        activate = fn;
        return () => void offActivate++;
      },
    );
    expect(h.slugs()).toEqual(['a']);
    await h.drain();
    activate!();
    await h.drain();
    reconnect!();
    await h.drain();
    expect(h.slugs()).toEqual(['a', 'a', 'a']);
    r.update(null);
    await h.drain();
    activate!();
    await h.drain();
    expect(h.slugs()).toEqual(['a', 'a', 'a', null, null]);
    r.update('b');
    await h.drain();
    r.dispose();
    await h.drain();
    expect(h.slugs()).toEqual(['a', 'a', 'a', null, null, 'b', null]);
    expect([offStream, offActivate]).toEqual([1, 1]);
  });
});

describe('openTabRequest', () => {
  const ev = (openTab: { slug: string; origin?: string }): StreamEvent => ({ seq: 1, type: 'openTab', openTab });
  it('untuk jendela ini atau tanpa origin → slug; jendela lain atau event lain → undefined', () => {
    expect(openTabRequest(ev({ slug: 'untitled' }), 'winA')).toBe('untitled');
    expect(openTabRequest(ev({ slug: 'untitled', origin: 'winA' }), 'winA')).toBe('untitled');
    expect(openTabRequest(ev({ slug: 'untitled', origin: 'winB' }), 'winA')).toBeUndefined();
    expect(openTabRequest(ev({ slug: '' }), 'winA')).toBeUndefined();
    expect(openTabRequest({ seq: 2, type: 'change', change: { kind: 'create', slug: 'x' } }, 'winA')).toBeUndefined();
  });
});
