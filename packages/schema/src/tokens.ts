// Resolusi token (AD-16): satu fungsi murni dipakai daemon (sebelum render), core (saat commit), dan check.
import { LakarError } from './errors.js';
import {
  LakarDocument,
  zodToLakarError,
  type BoardNode,
  type ChildNode,
  type EllipseNode,
  type Fill,
  type FrameNode,
  type IconNode,
  type LakarDocument as Doc,
  type PathNode,
  type RectNode,
  type Shadow,
  type Stroke,
  type TextNode,
  type TokenRef,
} from './nodes.js';

/** Tipe mapped rekursif: menghapus cabang `TokenRef` dari setiap slot `tok()`. */
export type Resolved<T> = T extends TokenRef ? never : T extends object ? { [K in keyof T]: Resolved<T[K]> } : T;

export type ResolvedDocument = Resolved<Doc>;
export type ResolvedBoardNode = Resolved<BoardNode>;
export type ResolvedChildNode = Resolved<ChildNode>;
export type ResolvedFrameNode = Resolved<FrameNode>;
export type ResolvedTextNode = Resolved<TextNode>;
export type ResolvedRectNode = Resolved<RectNode>;
export type ResolvedEllipseNode = Resolved<EllipseNode>;
export type ResolvedPathNode = Resolved<PathNode>;
export type ResolvedIconNode = Resolved<IconNode>;
export type ResolvedFill = Resolved<Fill>;
export type ResolvedStroke = Resolved<Stroke>;
export type ResolvedShadow = Resolved<Shadow>;

export type TokenRefLocation = { path: (string | number)[]; token: string };

const isTokenRef = (v: unknown): v is TokenRef =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 1 && typeof (v as { $token?: unknown }).$token === 'string';

/** Semua referensi `{$token}` di dalam nilai JSON, beserta path-nya (urut kemunculan). */
export function findTokenRefs(value: unknown): TokenRefLocation[] {
  const out: TokenRefLocation[] = [];
  const walk = (v: unknown, path: (string | number)[]) => {
    if (isTokenRef(v)) {
      out.push({ path, token: v.$token });
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, [...path, i]));
    } else if (typeof v === 'object' && v !== null) {
      for (const [k, x] of Object.entries(v)) walk(x, [...path, k]);
    }
  };
  walk(value, []);
  return out;
}

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j]!;
      prev[j] = Math.min(up + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length]!;
}

/** Hingga 3 nama token terdekat (dipakai untuk saran TOKEN_UNKNOWN). */
export function suggestTokens(name: string, known: Iterable<string>, limit = 3): string[] {
  return [...known]
    .map((k) => ({ k, d: distance(name, k) }))
    .sort((a, b) => a.d - b.d || a.k.localeCompare(b.k))
    .slice(0, limit)
    .map((x) => x.k);
}

/** Lempar TOKEN_UNKNOWN bila ada referensi ke token yang tidak didefinisikan (semua nama dilaporkan). */
export function assertTokensKnown(doc: Doc): void {
  const tokens = doc.tokens ?? {};
  const unknown = [...new Set(findTokenRefs(doc.pages).map((r) => r.token).filter((t) => !Object.hasOwn(tokens, t)))];
  if (unknown.length === 0) return;
  const known = Object.keys(tokens);
  const parts = unknown.map((t) => {
    const s = suggestTokens(t, known);
    return s.length ? `${t} (mungkin: ${s.join(', ')})` : t;
  });
  throw new LakarError('TOKEN_UNKNOWN', `token tidak dikenal: ${parts.join('; ')}`, {
    hint: known.length
      ? 'pakai nama token yang ada di dokumen.tokens, atau tulis nilai langsung'
      : 'dokumen belum punya tokens; tulis nilai langsung (mis. "#1A1A1A", 16) atau definisikan token dulu',
  });
}

/**
 * Ganti setiap `{$token}` dengan nilainya, lalu parse ulang dengan skema yang sama: cabang non-token di setiap
 * slot sekaligus menjadi cek tipe (token `16` di slot warna → SCHEMA_INVALID). Input tidak dimutasi.
 */
export function resolveTokens(doc: Doc): ResolvedDocument {
  assertTokensKnown(doc);
  const tokens = doc.tokens ?? {};
  const replace = (v: unknown): unknown => {
    if (isTokenRef(v)) return tokens[v.$token];
    if (Array.isArray(v)) return v.map(replace);
    if (typeof v === 'object' && v !== null) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, replace(x)]));
    return v;
  };
  const resolved = { ...doc, pages: replace(doc.pages) };
  const r = LakarDocument.safeParse(resolved);
  if (!r.success) {
    const refs = findTokenRefs(doc);
    const culprits = r.error.issues.flatMap((i) => {
      const under = (p: (string | number)[]) => i.path.every((seg, k) => String(p[k]) === String(seg));
      return refs.filter((ref) => under(ref.path)).map((ref) => `${ref.path.join('.')} ← ${ref.token}=${JSON.stringify(tokens[ref.token])}`);
    });
    const e = zodToLakarError(r.error, 'token salah tipe');
    throw new LakarError('SCHEMA_INVALID', culprits.length ? `${e.message} [${[...new Set(culprits)].join('; ')}]` : e.message, {
      hint: 'nilai token tidak cocok dengan slot yang memakainya; pakai token dengan tipe yang sesuai (warna hex, angka px)',
    });
  }
  return r.data as ResolvedDocument;
}
