// core dikompilasi tanpa lib DOM/@types/node; API global standar (Web Crypto, structuredClone)
// diakses lewat tipe minimal ini, bukan impor modul IO.
export const host = globalThis as unknown as {
  structuredClone<T>(v: T): T;
  crypto: { getRandomValues(a: Uint32Array): Uint32Array };
};
