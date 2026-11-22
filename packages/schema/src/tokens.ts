// Resolusi token (AD-11, AD-16): tahap token di pipa `resolveDocument` (resolve.ts, AD-10); konsumen di luar schema
// memanggil `resolveDocument`, bukan fungsi ini (kecuali codegen nanti, yang memakai tahap ini terpisah).
// Di sini juga tabel jenis-slot ↔ tipe-token (AD-11), satu-satunya sumber untuk validasi tipe dan inferensi tipe.
import { z } from 'zod';
import { LakarError } from './errors.js';
import {
  LakarDocument,
  TokenModes,
  Tokens,
  tokenModeIssues,
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
  type TokenType,
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

// ---------------------------------------------------------------------------
// Tabel jenis-slot ↔ tipe-token (AD-11)
// ---------------------------------------------------------------------------

/**
 * Satu slot `tok()`: nama slot (untuk pesan), tipe token yang diterima, dan tipe utama (dipakai inferensi
 * tipe saat migrasi v2 → v3 dan saat `setTokens` datar membuat token baru).
 */
export type TokenSlot = { slot: string; accepts: readonly TokenType[]; primary: TokenType };

/** Grup panjang: token bertipe ini boleh saling dipakai di slot panjang mana pun. */
export const LENGTH_TOKEN_TYPES = ['radius', 'spacing', 'container', 'breakpoint'] as const satisfies readonly TokenType[];

const COLOR_ACCEPTS = ['color'] as const satisfies readonly TokenType[];
const slot = (name: string, accepts: readonly TokenType[], primary: TokenType = accepts[0]!): TokenSlot => ({ slot: name, accepts, primary });
const colorSlot = (name: string) => slot(name, COLOR_ACCEPTS);
const lengthSlot = (name: string, primary: TokenType = 'spacing') => slot(name, LENGTH_TOKEN_TYPES, primary);

const LENGTH_KEYS = new Set(['gap', 'columnGap', 'rowGap', 'padding', 'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight']);

/**
 * Slot sebuah ref token: `nodeType` = tipe node pemilik, `propPath` = path ref di dalam node
 * (mis. `['fills', 0, 'stops', 1, 'color']`, `['padding', 2]`, `['size']`). Undefined bila path bukan slot token.
 */
export function tokenSlot(nodeType: string, propPath: readonly (string | number)[]): TokenSlot | undefined {
  const [key, ...rest] = propPath;
  if (typeof key !== 'string') return undefined;
  switch (key) {
    case 'fills':
      if (rest.at(-1) === 'color') return colorSlot(rest[1] === 'stops' ? 'fills.stops.color' : 'fills.color');
      if (rest[1] === 'colors') return colorSlot('fills.colors');
      return undefined;
    case 'shadows':
      return rest.at(-1) === 'color' ? colorSlot('shadows.color') : undefined;
    case 'stroke':
      if (rest[0] === 'color') return colorSlot('stroke.color');
      if (rest[0] === 'width') return lengthSlot('stroke.width');
      return undefined;
    case 'color':
      return colorSlot('color');
    case 'radius':
      return lengthSlot('radius', 'radius');
    case 'size':
      return nodeType === 'text' ? slot('size', ['fontSize']) : lengthSlot('size');
    case 'family':
      return slot('family', ['fontFamily']);
    case 'weight':
      return slot('weight', ['fontWeight']);
    case 'lineHeight':
      return slot('lineHeight', ['lineHeight']);
    case 'letterSpacing':
      return slot('letterSpacing', ['letterSpacing']);
    default:
      return LENGTH_KEYS.has(key) ? lengthSlot(key) : undefined;
  }
}

/**
 * Satu pemakaian ref token di pohon halaman. `path` dari akar dokumen (`['pages', 0, 'children', 1, ...]`),
 * `page`/`board` = indeks board pemilik (mode tema), `slot` dari `tokenSlot` (undefined = bukan slot token).
 */
export type TokenUse = TokenRefLocation & { nodeType: string; propPath: (string | number)[]; slot: TokenSlot | undefined; page: number; board: number };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Semua ref token di `pages` beserta node pemilik dan slotnya (urut dokumen). Toleran terhadap input mentah. */
export function findTokenUses(pages: unknown): TokenUse[] {
  const out: TokenUse[] = [];
  const visit = (node: unknown, path: (string | number)[], page: number, board: number) => {
    if (!isObj(node)) return;
    const nodeType = typeof node.type === 'string' ? node.type : '';
    for (const [k, v] of Object.entries(node)) {
      if (k === 'children') continue;
      for (const ref of findTokenRefs(v)) {
        const propPath = [k, ...ref.path];
        out.push({ path: [...path, ...propPath], token: ref.token, nodeType, propPath, slot: tokenSlot(nodeType, propPath), page, board });
      }
    }
    if (Array.isArray(node.children)) node.children.forEach((c, i) => visit(c, [...path, 'children', i], page, board));
  };
  if (Array.isArray(pages)) {
    pages.forEach((p, pi) => {
      if (isObj(p) && Array.isArray(p.children)) p.children.forEach((b, bi) => visit(b, ['pages', pi, 'children', bi], pi, bi));
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Resolusi
// ---------------------------------------------------------------------------

export type ResolveTokensOptions = {
  /** Paksa satu mode untuk semua board (harus ada di `tokenModes`). Default: `themeMode` board, lalu mode pertama. */
  mode?: string;
};

const TokenHead = z.object({ tokens: Tokens.optional(), tokenModes: TokenModes.optional() });
const MODE_HINT = 'daftarkan mode dengan setTokenModes(["light","dark"]) lalu pakai nama itu di token.modes dan board.themeMode';

/**
 * Ganti setiap `{$token}` dengan nilainya untuk mode efektif board (`opts.mode` ?? `board.themeMode` ??
 * `tokenModes[0]`; nilai = `modes[mode]` ?? `value`), lalu parse ulang dengan skema yang sama. Sebelumnya tipe
 * token dicek terhadap tabel slot (token `color` di `padding` → SCHEMA_INVALID). Input tidak dimutasi.
 */
export function resolveTokens(doc: Doc, opts: ResolveTokensOptions = {}): ResolvedDocument {
  assertTokensKnown(doc);
  const head = TokenHead.safeParse({ tokens: doc.tokens, tokenModes: doc.tokenModes });
  if (!head.success) throw zodToLakarError(head.error, 'token tidak valid');
  const tokens = doc.tokens ?? {};
  const modes = doc.tokenModes;
  if (opts.mode !== undefined && !(modes ?? []).includes(opts.mode)) {
    throw new LakarError(
      'SCHEMA_INVALID',
      `resolveTokens: mode ${JSON.stringify(opts.mode)} ${modes ? `tidak ada di tokenModes [${modes.join(', ')}]` : 'tidak dikenal (dokumen tidak punya tokenModes)'}`,
      { hint: MODE_HINT },
    );
  }
  const modeIssues = tokenModeIssues(doc);
  if (modeIssues.length) {
    throw new LakarError('SCHEMA_INVALID', `mode tidak valid: ${modeIssues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, { hint: MODE_HINT });
  }
  const wrong = findTokenUses(doc.pages).filter((u) => u.slot && !u.slot.accepts.includes(tokens[u.token]!.type));
  if (wrong.length) {
    const parts = wrong.map((u) => `${u.path.join('.')}: token ${u.token} bertipe ${tokens[u.token]!.type}, slot ${u.slot!.slot} hanya menerima ${u.slot!.accepts.join('|')}`);
    throw new LakarError('SCHEMA_INVALID', `token salah tipe: ${parts.join('; ')}`, {
      hint: 'pakai token yang tipenya diterima slot (warna → color, radius/gap/padding/ukuran → radius|spacing|container|breakpoint, teks → fontSize/fontFamily/fontWeight/lineHeight/letterSpacing), atau tulis nilai langsung',
    });
  }
  const valueOf = (name: string, mode: string | undefined): unknown => {
    const t = tokens[name]!;
    return mode !== undefined && t.modes && Object.hasOwn(t.modes, mode) ? t.modes[mode] : t.value;
  };
  const replace = (v: unknown, mode: string | undefined): unknown => {
    if (isTokenRef(v)) return valueOf(v.$token, mode);
    if (Array.isArray(v)) return v.map((x) => replace(x, mode));
    if (typeof v === 'object' && v !== null) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, replace(x, mode)]));
    return v;
  };
  const modeOf = (b: BoardNode | undefined) => opts.mode ?? b?.themeMode ?? modes?.[0];
  const pages = doc.pages.map((p) => ({ ...p, children: p.children.map((b) => replace(b, modeOf(b))) }));
  const resolved = { ...doc, pages };
  const r = LakarDocument.safeParse(resolved);
  if (!r.success) {
    const refs = findTokenRefs(doc);
    const culprits = r.error.issues.flatMap((i) => {
      const under = (p: (string | number)[]) => i.path.every((seg, k) => String(p[k]) === String(seg));
      // Nilai efektif: mode board pemilik ref (path `pages.<p>.children.<b>...`) atau mode paksa.
      const board = (path: (string | number)[]) => doc.pages[Number(path[1])]?.children[Number(path[3])];
      return refs
        .filter((ref) => under(ref.path))
        .map((ref) => `${ref.path.join('.')} ← ${ref.token}=${JSON.stringify(valueOf(ref.token, modeOf(board(ref.path))))}`);
    });
    const e = zodToLakarError(r.error, 'token salah tipe');
    throw new LakarError('SCHEMA_INVALID', culprits.length ? `${e.message} [${[...new Set(culprits)].join('; ')}]` : e.message, {
      hint: 'nilai token tidak cocok dengan slot yang memakainya; pakai token dengan tipe yang sesuai (warna hex, angka px)',
    });
  }
  return r.data as ResolvedDocument;
}
