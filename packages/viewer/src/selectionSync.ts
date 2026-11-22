// Laporan seleksi canvas ke daemon (AD-9, epic agen-di-canvas story 2). Seleksi dikirim sesudah debounce, hanya bila
// berbeda dari yang terakhir terkirim; dikirim ulang saat stream `/viewer/events` tersambung lagi (daemon mungkin
// restart dan seleksinya kosong); dikosongkan saat Viewer ditutup. Gagal kirim diabaikan: seleksi bukan data dokumen.
import { SELECTION_MAX, isNodeAddress } from '@lakar/schema';

/** Jeda debounce sebelum seleksi dikirim. */
export const SELECTION_DEBOUNCE_MS = 150;

export type SelectionSend = (slug: string, addresses: string[]) => Promise<unknown>;

export type ReporterOptions = {
  debounceMs?: number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (h: unknown) => void;
};

/** Alamat yang boleh dikirim: bentuk sah, unik, maks `SELECTION_MAX`. */
export function reportable(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(isNodeAddress))].slice(0, SELECTION_MAX);
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export class SelectionReporter {
  readonly #slug: string;
  readonly #send: SelectionSend;
  readonly #ms: number;
  readonly #set: (fn: () => void, ms: number) => unknown;
  readonly #clear: (h: unknown) => void;
  /** Seleksi terkini dari Viewer. */
  #current: string[] = [];
  /** Seleksi terakhir yang dikirim (bukan berarti diterima). */
  #sent: string[] = [];
  #timer: unknown;
  #disposed = false;

  constructor(slug: string, send: SelectionSend, opts: ReporterOptions = {}) {
    this.#slug = slug;
    this.#send = send;
    this.#ms = opts.debounceMs ?? SELECTION_DEBOUNCE_MS;
    this.#set = opts.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
    this.#clear = opts.clearTimeout ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  /** Seleksi Viewer berubah: jadwalkan kirim (debounce). */
  update(ids: readonly string[]): void {
    if (this.#disposed) return;
    this.#current = reportable(ids);
    this.#cancel();
    this.#timer = this.#set(() => {
      this.#timer = undefined;
      if (!same(this.#current, this.#sent)) this.#push(this.#current);
    }, this.#ms);
  }

  /** Stream tersambung ulang: kirim ulang seleksi terkini bila tidak kosong (daemon baru tidak mengingatnya). */
  resend(): void {
    if (this.#disposed) return;
    this.#cancel();
    if (this.#current.length) this.#push(this.#current);
  }

  /** Viewer ditutup: batalkan jadwal; seleksi yang pernah dikirim tidak kosong → kosongkan di daemon. */
  dispose(): void {
    if (this.#disposed) return;
    this.#cancel();
    if (this.#sent.length) this.#push([]);
    this.#disposed = true;
  }

  #cancel() {
    if (this.#timer !== undefined) this.#clear(this.#timer);
    this.#timer = undefined;
  }

  #push(addresses: string[]) {
    const before = this.#sent;
    this.#sent = addresses;
    this.#send(this.#slug, addresses).catch(() => {
      // offline / dokumen hilang: seleksi bukan data dokumen, cukup diabaikan. Belum sampai → boleh dikirim lagi.
      if (this.#sent === addresses) this.#sent = before;
    });
  }
}

/**
 * Pasang reporter untuk Viewer dokumen `slug`: seleksi awal dikirim (debounce), stream tersambung ulang → kirim
 * ulang. Kembalikan `update` (seleksi berubah) dan `dispose` (Viewer ditutup). `listen` = `activityHub.listen`.
 */
export function attachSelectionReporter(
  slug: string,
  initial: readonly string[],
  send: SelectionSend,
  listen: (l: { onReconnect?: () => void }) => () => void,
  opts: ReporterOptions = {},
): { update: (ids: readonly string[]) => void; dispose: () => void } {
  const r = new SelectionReporter(slug, send, opts);
  r.update(initial);
  const off = listen({ onReconnect: () => r.resend() });
  return {
    update: (ids) => r.update(ids),
    dispose: () => {
      off();
      r.dispose();
    },
  };
}
