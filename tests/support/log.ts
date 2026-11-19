// Log diagnostik tes (latensi, contoh output). Diam secara default; `LAKAR_TEST_LOG=1` menampilkannya.
export function testLog(...args: unknown[]): void {
  if (process.env.LAKAR_TEST_LOG) console.log(...args);
}
