// Statistik ringkas untuk baseline (median 3 run, golden-set §Prosedur 2).
export function median(xs: readonly number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function min(xs: readonly number[]): number | undefined {
  return xs.length ? Math.min(...xs) : undefined;
}

export function max(xs: readonly number[]): number | undefined {
  return xs.length ? Math.max(...xs) : undefined;
}

export type Summary = { n: number; median: number | undefined; min: number | undefined; max: number | undefined };

export function summarize(xs: readonly number[]): Summary {
  return { n: xs.length, median: median(xs), min: min(xs), max: max(xs) };
}
