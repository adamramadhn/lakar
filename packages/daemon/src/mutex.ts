/** Mutex FIFO sederhana berbasis promise (adaptor Chromium). Kunci per dokumen: `DocumentLocks` di core. */
export class Mutex {
  #tail: Promise<void> = Promise.resolve();
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((r) => (release = r));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

