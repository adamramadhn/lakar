/** Mutex FIFO sederhana berbasis promise. */
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

/** Satu mutex per kunci (mis. per dokumen, AD-4). */
export class KeyedMutex {
  readonly #locks = new Map<string, Mutex>();
  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    let m = this.#locks.get(key);
    if (!m) this.#locks.set(key, (m = new Mutex()));
    return m.run(fn);
  }
}
