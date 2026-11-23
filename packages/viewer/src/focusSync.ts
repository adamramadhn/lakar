// Laporan dokumen yang tampil di jendela ini ke daemon (spec-agent-open-doc): `open_doc` tanpa slug memakai dokumen
// yang terakhir difokuskan pengguna. Jendela melapor saat dokumen yang tampil berubah (null = Dashboard), saat jendela
// kembali difokuskan atau terlihat (jendela ini menjadi fokus terbaru), dan saat stream `/viewer/events` tersambung
// lagi (daemon mungkin restart dan fokusnya kosong). Jendela ditutup → null. Gagal kirim ditelan: fokus bukan data
// dokumen.

export type FocusSend = (slug: string | null, opts?: { keepalive?: boolean }) => Promise<unknown>;

/**
 * Laporan diserialkan: satu PUT dalam perjalanan. Nilai yang datang selama itu menunggu (hanya yang terbaru); saat
 * PUT selesai, nilai tunggu dikirim bila berbeda dari kiriman terakhir. Jadi `refresh` lama dan `update` baru tidak
 * bisa tiba terbalik di daemon.
 */
export class FocusReporter {
  readonly #send: FocusSend;
  /** Dokumen yang tampil sekarang (null = tidak ada). */
  #current: string | null;
  /** Nilai terakhir yang dikirim atau sedang dikirim (undefined = belum pernah). */
  #sent: string | null | undefined;
  #inflight = false;
  /** Nilai terbaru yang menunggu PUT sebelumnya selesai. */
  #pending: { slug: string | null } | undefined;
  #disposed = false;

  constructor(send: FocusSend, initial: string | null) {
    this.#send = send;
    this.#current = initial;
  }

  /** Dokumen yang tampil berubah: kirim bila berbeda dari kiriman terakhir (atau yang menunggu). */
  update(slug: string | null): void {
    if (this.#disposed) return;
    this.#current = slug;
    const latest = this.#pending ? this.#pending.slug : this.#sent;
    if (slug !== latest) this.#push(slug);
  }

  /** Jendela difokuskan/terlihat lagi, atau stream tersambung ulang: kirim ulang nilai sekarang apa pun isinya. */
  refresh(): void {
    if (this.#disposed) return;
    this.#push(this.#current);
  }

  /** Halaman ditutup/masuk bfcache: lepas dokumen sekarang juga dengan `keepalive`, di luar antrean. */
  hide(): void {
    if (this.#disposed) return;
    this.#current = null;
    this.#pending = undefined;
    this.#sent = null;
    this.#send(null, { keepalive: true }).catch(() => {});
  }

  /** Jendela ditutup: dokumen yang pernah dilaporkan dilepas. */
  dispose(): void {
    if (this.#disposed) return;
    const latest = this.#pending ? this.#pending.slug : this.#sent;
    if (latest !== undefined && latest !== null) this.#push(null);
    this.#disposed = true;
  }

  #push(slug: string | null) {
    if (this.#inflight) {
      this.#pending = { slug };
      return;
    }
    const before = this.#sent;
    this.#sent = slug;
    this.#inflight = true;
    const settle = (ok: boolean) => {
      // Gagal (offline / dokumen tidak ada): belum sampai → boleh dikirim lagi pada perubahan berikutnya.
      if (!ok && this.#sent === slug) this.#sent = before;
      this.#inflight = false;
      const next = this.#pending;
      this.#pending = undefined;
      if (next && next.slug !== this.#sent) this.#push(next.slug);
    };
    this.#send(slug).then(
      () => settle(true),
      () => settle(false),
    );
  }
}

/** Sumber "jendela aktif lagi" (focus jendela, visibilitychange → visible); kembalikan pelepas. */
export type ActivateSource = (fn: () => void) => () => void;

/** Sumber bawaan browser: `focus` jendela dan `visibilitychange` ke terlihat. */
export const windowActivate: ActivateSource = (fn) => {
  const onVisible = () => {
    if (document.visibilityState === 'visible') fn();
  };
  window.addEventListener('focus', fn);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('focus', fn);
    document.removeEventListener('visibilitychange', onVisible);
  };
};

/**
 * Pasang reporter untuk jendela ini: nilai awal dikirim langsung, jendela aktif lagi atau stream tersambung ulang →
 * kirim ulang. `listen` = `activityHub.listen`. Kembalikan `update` (dokumen tampil berubah), `hide` (pagehide), dan `dispose`.
 */
export function attachFocusReporter(
  initial: string | null,
  send: FocusSend,
  listen: (l: { onReconnect?: () => void }) => () => void,
  activate: ActivateSource,
): { update: (slug: string | null) => void; hide: () => void; dispose: () => void } {
  const r = new FocusReporter(send, initial);
  r.refresh();
  const offStream = listen({ onReconnect: () => r.refresh() });
  const offActivate = activate(() => r.refresh());
  return {
    update: (slug) => r.update(slug),
    hide: () => r.hide(),
    dispose: () => {
      offStream();
      offActivate();
      r.dispose();
    },
  };
}
