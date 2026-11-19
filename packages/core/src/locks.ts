// Kunci async per dokumen (AD-4): satu kunci dipegang dari awal snippet sampai commit/rollback.
// Murni (Promise saja), tanpa IO.

/** Antrian FIFO per kunci. Kunci berbeda tidak saling menunggu; kunci dilepas juga saat `fn` melempar. */
export class DocumentLocks {
  readonly #tails = new Map<string, Promise<void>>();

  async run<T>(key: string, fn: () => T | Promise<T>): Promise<T> {
    const prev = this.#tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => (release = r));
    const tail = prev.then(() => mine);
    this.#tails.set(key, tail);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      // Bersihkan entri bila tidak ada yang mengantre di belakang kita (peta tidak tumbuh tanpa batas).
      if (this.#tails.get(key) === tail) this.#tails.delete(key);
    }
  }

  /** Jumlah kunci yang sedang dipegang atau diantre. */
  get size(): number {
    return this.#tails.size;
  }
}
