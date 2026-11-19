// Allocator ID per dokumen (AD-3). Tanpa IO.
import type { AnyNode, LakarDocument as Doc } from '@lakar/schema';
import { host } from './host.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Sumber acak 0..1 (inject untuk tes). Default: Web Crypto global, tanpa impor IO. */
export type RandomSource = () => number;
const cryptoRandom: RandomSource = () => {
  const buf = new Uint32Array(1);
  host.crypto.getRandomValues(buf);
  return buf[0]! / 0x1_0000_0000;
};

/** Allocator ID 8 karakter `[A-Za-z0-9]`, unik per dokumen. */
export class IdAllocator {
  readonly #used = new Set<string>();
  readonly #random: RandomSource;
  constructor(existing: Iterable<string> = [], random: RandomSource = cryptoRandom) {
    for (const id of existing) this.#used.add(id);
    this.#random = random;
  }
  next(): string {
    for (let attempt = 0; attempt < 1000; attempt++) {
      let id = '';
      for (let i = 0; i < 8; i++) id += ALPHABET[Math.floor(this.#random() * ALPHABET.length)];
      if (!this.#used.has(id)) {
        this.#used.add(id);
        return id;
      }
    }
    throw new Error('IdAllocator: gagal mendapat ID unik setelah 1000 percobaan');
  }
  static forDocument(doc: Doc, random?: RandomSource): IdAllocator {
    return new IdAllocator(collectIds(doc), random);
  }
}

export function collectIds(doc: Doc): string[] {
  const ids = [doc.id];
  const walk = (n: AnyNode) => {
    ids.push(n.id);
    if ('children' in n) n.children.forEach(walk);
  };
  for (const p of doc.pages) {
    ids.push(p.id);
    p.children.forEach(walk);
  }
  return ids;
}
