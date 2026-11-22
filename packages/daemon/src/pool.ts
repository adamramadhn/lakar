// Pool render AD-18: satu chromium-headless-shell, N halaman hangat, sewa eksklusif FIFO.
// - Setiap sewa memegang satu slot sampai selesai; batas waktu host per sewa, antrean dibatasi 2× nilai itu.
// - Kegagalan halaman (crash/close/evaluate gagal/lewat batas waktu) → HANYA slot itu dibuang dan dibuat ulang.
// - Browser putus → browser + semua halaman dibuat ulang.
// - LakarError dari isi sewa (FONT_MISSING / NOT_FOUND / ICON_UNKNOWN / SCHEMA_INVALID) = kesalahan dokumen:
//   halaman tetap dipakai.
import type { RenderStatus } from '@lakar/ports';
import { LakarError, errorMessage } from '@lakar/schema';
import type { Browser, Page } from 'playwright-core';

export type PoolOptions = {
  size: number;
  timeoutMs: number;
  /** Jalankan browser baru. */
  launch(): Promise<Browser>;
  /** Buka halaman render siap pakai (`__lakarReady`) dengan rasio piksel `dpr`. */
  openPage(browser: Browser, dpr: 1 | 2): Promise<Page>;
};

/**
 * Kegagalan menjalankan browser yang pesannya sudah jelas untuk pengguna (mis. "Chrome atau Edge tidak ditemukan"):
 * pool memakai pesannya apa adanya di `lastError`, tanpa awalan "browser gagal dijalankan:".
 */
export class BrowserLaunchError extends Error {
  override name = 'BrowserLaunchError';
}

type Slot = {
  index: number;
  /** Naik setiap slot dibuang: sewa lama (mis. yang lewat batas waktu) tidak boleh menyentuh halaman baru. */
  gen: number;
  page: Page | undefined;
  /** Halaman DPR 2 milik slot (dibuat malas, disewa bersama slotnya). */
  page2: Page | undefined;
  busy: boolean;
  /** Halaman crash/tertutup saat disewa: dibuang begitu sewa dilepas. */
  dead: boolean;
  /** Pernah punya halaman: pembuatan berikutnya dihitung `recreated`. */
  hadPage: boolean;
  creating: Promise<Page> | undefined;
  /** Pembuatan halaman DPR 2 yang sedang berjalan (satu per slot; panggilan `page2()` paralel berbagi). */
  creating2: Promise<Page> | undefined;
};

/** Akses halaman selama sewa. */
export type Lease = {
  /** Halaman DPR 1 slot ini. */
  page: Page;
  /** Halaman DPR 2 slot ini (dibuat malas). */
  page2(): Promise<Page>;
};

type Waiter = { resolve(slot: Slot): void; reject(e: Error): void; timer: NodeJS.Timeout };

const RETRY_HINT = 'coba lagi; bila terus gagal jalankan scripts/install-browser.sh lalu systemctl --user restart lakard';

const renderFailed = (message: string) => new LakarError('RENDER_FAILED', message, { hint: RETRY_HINT, retryable: true });

const firstLine = (e: unknown) => errorMessage(e).split('\n')[0]!;

export class RenderPool {
  readonly #opts: PoolOptions;
  readonly #slots: Slot[];
  readonly #waiters: Waiter[] = [];
  #browser: Browser | undefined;
  #browserPromise: Promise<Browser> | undefined;
  #browserVersion: string | undefined;
  #recreated = 0;
  #peakBusy = 0;
  #lastError: string | undefined;
  #closed = false;

  constructor(opts: PoolOptions) {
    this.#opts = opts;
    this.#slots = Array.from({ length: opts.size }, (_, index) => ({
      index,
      gen: 0,
      page: undefined,
      page2: undefined,
      busy: false,
      dead: false,
      hadPage: false,
      creating: undefined,
      creating2: undefined,
    }));
  }

  /** Buat semua halaman hangat. Tidak pernah melempar: gagal → `lastError`, permintaan → RENDER_FAILED. */
  async warm(): Promise<void> {
    await Promise.all(this.#slots.map((s) => (s.busy ? undefined : this.#ensurePage(s).catch(() => {}))));
  }

  status(): RenderStatus {
    const ready = this.#slots.filter((s) => this.#live(s)).length;
    const busy = this.#slots.filter((s) => s.busy).length;
    return {
      size: this.#slots.length,
      ready,
      idle: this.#slots.filter((s) => !s.busy && this.#live(s)).length,
      busy,
      waiting: this.#waiters.length,
      recreated: this.#recreated,
      peakBusy: this.#peakBusy,
      ...(this.#browserVersion ? { browserVersion: this.#browserVersion } : {}),
      ...(this.#lastError ? { lastError: this.#lastError } : {}),
    };
  }

  /**
   * Sewa satu halaman eksklusif untuk `fn`. Batas waktu host `timeoutMs` mencakup penyiapan halaman + `fn`.
   * Error non-LakarError atau lewat batas waktu → slot dibuang (dibuat ulang di latar) dan RENDER_FAILED retryable.
   */
  async lease<T>(fn: (lease: Lease) => Promise<T>): Promise<T> {
    if (this.#closed) throw renderFailed('pool render sudah ditutup');
    const slot = await this.#acquire();
    const gen = slot.gen;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new LeaseTimeout(this.#opts.timeoutMs)), this.#opts.timeoutMs);
    });
    const work = (async () => {
      const page = await this.#ensurePage(slot);
      if (slot.gen !== gen) throw new Error('slot dibuang selama penyiapan');
      const lease: Lease = {
        page,
        page2: () => this.#ensurePage2(slot, gen),
      };
      return fn(lease);
    })();
    work.catch(() => {}); // pemenang race bisa timeout; hasil sewa lama dibuang tanpa unhandled rejection
    try {
      return await Promise.race([work, timeout]);
    } catch (e) {
      // Kesalahan dokumen: halaman sehat, tetap dipakai.
      if (e instanceof LakarError && e.code !== 'RENDER_FAILED') throw e;
      const message =
        e instanceof LeaseTimeout
          ? `render melewati batas waktu ${this.#opts.timeoutMs} ms; halaman dibuat ulang`
          : e instanceof BrowserLaunchError
            ? e.message
            : `render Chromium gagal: ${firstLine(e)}`;
      this.#lastError = message;
      this.#discard(slot);
      throw renderFailed(message);
    } finally {
      clearTimeout(timer);
      this.#release(slot);
    }
  }

  async close(): Promise<void> {
    this.#closed = true;
    for (const w of this.#waiters.splice(0)) {
      clearTimeout(w.timer);
      w.reject(renderFailed('pool render ditutup'));
    }
    for (const s of this.#slots) {
      s.gen++;
      s.page = undefined;
      s.page2 = undefined;
      s.creating2 = undefined;
    }
    const b = this.#browser ?? (await this.#browserPromise?.catch(() => undefined));
    this.#browser = undefined;
    this.#browserPromise = undefined;
    if (b) await b.close().catch(() => {});
  }

  #live(s: Slot): boolean {
    return !!s.page && !s.dead && !s.page.isClosed() && !!this.#browser?.isConnected();
  }

  #acquire(): Promise<Slot> {
    const idle = this.#slots.filter((s) => !s.busy);
    const slot = idle.find((s) => this.#live(s)) ?? idle[0];
    if (slot && this.#waiters.length === 0) {
      this.#markBusy(slot);
      return Promise.resolve(slot);
    }
    const waitMs = 2 * this.#opts.timeoutMs;
    return new Promise<Slot>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const i = this.#waiters.indexOf(waiter);
          if (i >= 0) this.#waiters.splice(i, 1);
          reject(renderFailed(`antrean render penuh: tidak ada halaman bebas dalam ${waitMs} ms`));
        }, waitMs),
      };
      this.#waiters.push(waiter);
    });
  }

  #markBusy(slot: Slot): void {
    slot.busy = true;
    this.#peakBusy = Math.max(this.#peakBusy, this.#slots.filter((s) => s.busy).length);
  }

  #release(slot: Slot): void {
    if (slot.dead) this.#discard(slot);
    const next = this.#waiters.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve(slot); // slot tetap sibuk, langsung diserahkan (FIFO)
      return;
    }
    slot.busy = false;
  }

  /** Buang halaman slot (hanya slot ini); buat ulang di latar agar pool kembali penuh. */
  #discard(slot: Slot): void {
    slot.gen++;
    slot.dead = false;
    const pages = [slot.page, slot.page2];
    slot.page = undefined;
    slot.page2 = undefined;
    slot.creating = undefined;
    slot.creating2 = undefined;
    for (const p of pages) if (p) void p.context().close().catch(() => {});
    if (!this.#closed) void this.#ensurePage(slot).catch(() => {});
  }

  #ensureBrowser(): Promise<Browser> {
    if (this.#browser?.isConnected()) return Promise.resolve(this.#browser);
    if (!this.#browserPromise) {
      const p = (async () => {
        const b = await this.#opts.launch();
        if (this.#closed) {
          await b.close().catch(() => {});
          throw new Error('pool render ditutup');
        }
        this.#browser = b;
        this.#browserVersion = b.version();
        b.on('disconnected', () => this.#onDisconnected(b));
        return b;
      })();
      this.#browserPromise = p;
      p.catch((e: unknown) => {
        this.#lastError = e instanceof BrowserLaunchError ? e.message : `browser gagal dijalankan: ${firstLine(e)}`;
        if (this.#browserPromise === p) this.#browserPromise = undefined;
      });
    }
    return this.#browserPromise;
  }

  /** Browser putus: semua halaman dibuat ulang bersama browser baru. */
  #onDisconnected(b: Browser): void {
    if (this.#browser !== b) return;
    this.#browser = undefined;
    this.#browserPromise = undefined;
    if (this.#closed) return;
    this.#lastError = 'browser Chromium terputus; browser dan semua halaman dibuat ulang';
    for (const s of this.#slots) {
      // Slot sibuk gagal sendiri (evaluate menolak) lalu dibuang lewat jalur sewa.
      if (s.busy) continue;
      this.#discard(s);
    }
  }

  #ensurePage(slot: Slot): Promise<Page> {
    if (this.#live(slot)) return Promise.resolve(slot.page!);
    if (!slot.creating) {
      const gen = slot.gen;
      const p = (async () => {
        const browser = await this.#ensureBrowser();
        const page = await this.#opts.openPage(browser, 1);
        if (slot.gen !== gen || this.#closed) {
          await page.context().close().catch(() => {});
          throw new Error('slot dibuang selama pembuatan halaman');
        }
        if (slot.hadPage) this.#recreated++;
        slot.hadPage = true;
        slot.page = this.#watch(slot, page);
        return page;
      })();
      slot.creating = p;
      const clear = () => {
        if (slot.creating === p) slot.creating = undefined;
      };
      p.then(clear, (e: unknown) => {
        clear();
        if (slot.gen === gen) this.#lastError = e instanceof BrowserLaunchError ? e.message : `halaman render gagal dibuat: ${firstLine(e)}`;
      });
    }
    return slot.creating;
  }

  /**
   * Halaman DPR 2 slot untuk sewa generasi `gen`. Halaman dibuka ke variabel lokal dan baru disimpan di slot bila
   * generasinya masih sama; slot yang dibuang selama pembukaan → halaman itu ditutup (tidak bocor). Panggilan
   * paralel berbagi satu promise sehingga hanya satu context yang dibuka.
   */
  #ensurePage2(slot: Slot, gen: number): Promise<Page> {
    if (slot.gen !== gen) return Promise.reject(new Error('slot sudah dibuang'));
    if (slot.page2 && !slot.page2.isClosed()) return Promise.resolve(slot.page2);
    if (!slot.creating2) {
      const p = (async () => {
        const page = await this.#opts.openPage(await this.#ensureBrowser(), 2);
        if (slot.gen !== gen || this.#closed) {
          await page.context().close().catch(() => {});
          throw new Error('slot sudah dibuang');
        }
        slot.page2 = this.#watch(slot, page);
        return page;
      })();
      slot.creating2 = p;
      const clear = () => {
        if (slot.creating2 === p) slot.creating2 = undefined;
      };
      p.then(clear, clear);
    }
    return slot.creating2;
  }

  /** Halaman crash/tertutup di luar sewa → slot dibuang dan dibuat ulang. Saat disewa: sewa itu yang gagal. */
  #watch(slot: Slot, page: Page): Page {
    const gen = slot.gen;
    const onDead = (why: string) => {
      if (slot.gen !== gen || this.#closed) return;
      if (slot.page !== page && slot.page2 !== page) return;
      this.#lastError = `halaman render ${why}`;
      if (slot.busy) slot.dead = true;
      else this.#discard(slot);
    };
    page.on('crash', () => onDead('crash'));
    page.on('close', () => onDead('tertutup'));
    return page;
  }
}

class LeaseTimeout extends Error {
  constructor(ms: number) {
    super(`sewa melewati ${ms} ms`);
  }
}
