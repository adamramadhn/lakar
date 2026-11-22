// Inferensi tipe token (AD-11): satu fungsi murni dipakai migrasi v2 → v3 (`MIGRATIONS[2]`) dan commit
// (`setTokens` dengan nilai datar untuk token baru). Tanpa IO; input tidak dimutasi.
import { HexColor, TOKEN_TYPES, findTokenUses, isTokenValueOf, type TokenType, type TokenUse } from '@lakar/schema';
import { isPlainObject } from './object.js';

/** Tipe dari nilai saja (token yang tidak dirujuk): hex → color, string lain → fontFamily, angka ≥ 0 → spacing, < 0 → letterSpacing. */
export function tokenTypeOfValue(value: string | number): TokenType {
  if (typeof value === 'string') return HexColor.safeParse(value).success ? 'color' : 'fontFamily';
  return value < 0 ? 'letterSpacing' : 'spacing';
}

/**
 * Tipe token yang dirujuk `uses`: tipe utama slot yang paling sering muncul; seri dipecah urutan `TOKEN_TYPES`.
 * Kandidat yang tidak menerima `value` dilewati; tanpa kandidat sah (atau tanpa ref ber-slot) → `tokenTypeOfValue`.
 */
export function inferTokenType(value: string | number, uses: readonly Pick<TokenUse, 'slot'>[]): TokenType {
  const counts = new Map<TokenType, number>();
  for (const u of uses) if (u.slot) counts.set(u.slot.primary, (counts.get(u.slot.primary) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1] || TOKEN_TYPES.indexOf(a[0]) - TOKEN_TYPES.indexOf(b[0]));
  for (const [type] of ranked) if (isTokenValueOf(type, value)) return type;
  return tokenTypeOfValue(value);
}

export type InferredTokens = {
  /** Token bertipe `{type, value}` untuk setiap entri datar (entri bukan string/angka dibiarkan apa adanya). */
  tokens: Record<string, unknown>;
  /** Salinan `pages` dengan ref dari slot yang tidak menerima tipe terpilih diganti nilai literal (detach). */
  pages: unknown;
  /** Jumlah ref yang di-detach. */
  detached: number;
};

const pathKey = (p: readonly (string | number)[]) => p.join('\u0000');

/**
 * Beri tipe pada token datar `flat` berdasarkan pemakaiannya di `pages` (AD-11), lalu detach ref yang slotnya
 * tidak menerima tipe itu. Hanya ref ke nama di `flat` yang diperhatikan; `pages` boleh mentah (dokumen v2).
 */
export function inferTokens(flat: Readonly<Record<string, unknown>>, pages: unknown): InferredTokens {
  const uses = findTokenUses(pages);
  const byName = new Map<string, TokenUse[]>();
  for (const u of uses) {
    if (!Object.hasOwn(flat, u.token)) continue;
    const list = byName.get(u.token);
    if (list) list.push(u);
    else byName.set(u.token, [u]);
  }
  const tokens: Record<string, unknown> = {};
  const detach = new Map<string, string | number>();
  for (const [name, value] of Object.entries(flat)) {
    if (typeof value !== 'string' && typeof value !== 'number') {
      tokens[name] = value;
      continue;
    }
    const refs = byName.get(name) ?? [];
    const type = inferTokenType(value, refs);
    tokens[name] = { type, value };
    for (const u of refs) if (u.slot && !u.slot.accepts.includes(type)) detach.set(pathKey(u.path.slice(1)), value);
  }
  if (detach.size === 0) return { tokens, pages, detached: 0 };
  // `findTokenUses` memberi path dari akar dokumen (`pages`, …); di sini path relatif `pages`.
  const rebuild = (v: unknown, path: (string | number)[]): unknown => {
    const hit = detach.get(pathKey(path));
    if (hit !== undefined) return hit;
    if (Array.isArray(v)) return v.map((x, i) => rebuild(x, [...path, i]));
    if (isPlainObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rebuild(x, [...path, k])]));
    return v;
  };
  return { tokens, pages: rebuild(pages, []), detached: detach.size };
}
