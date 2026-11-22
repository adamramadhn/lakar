// Skema dokumen Lakar v3 (AD-2, AD-11, AD-15, AD-16): primitif, token, properti visual, katalog node, dokumen.
// v2 (story 22) menambah fill `conic`, `noise`, `mesh`; dokumen v1 dimigrasi identitas (`@lakar/core` MIGRATIONS[1]).
// v3 (epic model-dokumen story 2) mengganti token datar dengan token bertipe + mode tema; dokumen v2 dimigrasi
// lewat inferensi tipe (`@lakar/core` MIGRATIONS[2]).
// Satu sumber: tipe TS diturunkan dari zod di sini. Tanpa IO.
import { z } from 'zod';
import { LakarError } from './errors.js';
import { ICON_LIBS, ICON_NAME_PATTERN } from './icons.js';

export const SCHEMA_VERSION = 3 as const;

// ---------------------------------------------------------------------------
// Primitif
// ---------------------------------------------------------------------------

export const ID_PATTERN = /^[A-Za-z0-9]{8}$/;
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** ID aset gambar: hash sha256 hex huruf kecil (`<dataDir>/assets/<sha256>`). */
export const ASSET_ID_PATTERN = /^[a-f0-9]{64}$/;
export const TOKEN_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*$/;

/** Pesan issue warna; `zodToLakarError` memakainya untuk memilih hint warna. */
export const COLOR_MESSAGE = 'warna harus #RRGGBB atau #RRGGBBAA';
export const COLOR_HINT = 'warna ditulis hex #RRGGBB atau #RRGGBBAA (mis. "#1A1A1AFF"), atau referensi token {$token:"colors.nama"}; rgba()/nama warna tidak didukung';
export const XY_HINT = 'x/y hanya untuk board/node absolute (tambahkan position:"absolute" pada node, atau hapus x/y)';

export const Id = z.string().regex(ID_PATTERN, 'ID harus 8 karakter [A-Za-z0-9]');
export const Slug = z.string().regex(SLUG_PATTERN, `slug harus cocok ${SLUG_PATTERN.source}`);
export const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/, COLOR_MESSAGE);
const Name = z.string().min(1);
const Px = z.number().finite();
const Size = z.number().finite().nonnegative();
const Positive = z.number().finite().positive();
const Unit = z.number().min(0).max(1);

// ---------------------------------------------------------------------------
// Token (AD-16): disimpan sebagai referensi `{$token}`; di-resolve oleh `resolveTokens`.
// ---------------------------------------------------------------------------

export const TokenName = z
  .string()
  .max(64)
  .regex(TOKEN_NAME_PATTERN, 'nama token: segmen [a-z0-9-] dipisah titik, mis. "colors.text-primary"');
export const TokenRef = z.object({ $token: TokenName }).strict();
export type TokenRef = z.infer<typeof TokenRef>;
/** Nilai token datar (bentuk v2; masih diterima `setTokens` dan migrasi v2 â†’ v3). */
export const TokenValue = z.union([z.number().finite(), z.string().min(1)]);
export type TokenValue = z.infer<typeof TokenValue>;

/** Tipe token tertutup (AD-11). Urutan ini juga pemecah seri inferensi tipe (`@lakar/core` inferTokens). */
export const TOKEN_TYPES = ['color', 'radius', 'spacing', 'container', 'breakpoint', 'fontFamily', 'fontWeight', 'fontSize', 'lineHeight', 'letterSpacing'] as const;
export type TokenType = (typeof TOKEN_TYPES)[number];

export const MODE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const ModeName = z.string().regex(MODE_NAME_PATTERN, `nama mode harus cocok ${MODE_NAME_PATTERN.source}`);
/** Daftar mode dokumen: minimal satu, tanpa duplikat; elemen pertama = mode default. */
export const TokenModes = z
  .array(ModeName)
  .min(1)
  .refine((m) => new Set(m).size === m.length, 'tokenModes tidak boleh berisi nama ganda');

const Weight = z
  .number()
  .int()
  .min(100)
  .max(900)
  .refine((w) => w % 100 === 0, 'weight harus kelipatan 100 (100â€“900)');

const FontFamily = z.string().min(1);

/** Skema nilai per tipe token; berlaku untuk `value` dan setiap nilai di `modes`. Tidak menerima string CSS. */
export const TOKEN_VALUE_SCHEMAS = {
  color: HexColor,
  radius: Size,
  spacing: Size,
  container: Size,
  breakpoint: Size,
  fontFamily: FontFamily,
  fontWeight: Weight,
  fontSize: Size,
  lineHeight: Positive,
  letterSpacing: Px,
} as const satisfies Record<TokenType, z.ZodType>;

/** True bila `value` sah untuk tipe token `type`. */
export const isTokenValueOf = (type: TokenType, value: unknown): boolean => TOKEN_VALUE_SCHEMAS[type].safeParse(value).success;

const tokenDef = <T extends TokenType>(type: T) =>
  z
    .object({
      type: z.literal(type),
      value: TOKEN_VALUE_SCHEMAS[type],
      /** Nilai per mode; kunci wajib ada di `tokenModes` dokumen. Mode tanpa nilai memakai `value`. */
      modes: z.record(ModeName, TOKEN_VALUE_SCHEMAS[type]).optional(),
    })
    .strict();

/** Definisi token bertipe (AD-11): `{type, value, modes?}`. */
export const TokenDef = z.discriminatedUnion('type', [
  tokenDef('color'),
  tokenDef('radius'),
  tokenDef('spacing'),
  tokenDef('container'),
  tokenDef('breakpoint'),
  tokenDef('fontFamily'),
  tokenDef('fontWeight'),
  tokenDef('fontSize'),
  tokenDef('lineHeight'),
  tokenDef('letterSpacing'),
]);
export type TokenDef = z.infer<typeof TokenDef>;
export const Tokens = z.record(TokenName, TokenDef);
export type Tokens = z.infer<typeof Tokens>;

/** Slot yang boleh berisi nilai langsung atau referensi token. */
export const tok = <S extends z.ZodType>(s: S) => z.union([s, TokenRef]);

export const Color = tok(HexColor);
export type Color = z.infer<typeof Color>;

// ---------------------------------------------------------------------------
// Enum
// ---------------------------------------------------------------------------

export const Screen = z.enum(['landing', 'app', 'mobile']);
export const Layout = z.enum(['none', 'row', 'column']);
export const Align = z.enum(['start', 'center', 'end', 'stretch']);
export const Justify = z.enum(['start', 'center', 'end', 'space-between']);
export const Blend = z.enum([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
]);
export const StrokeSide = z.enum(['top', 'right', 'bottom', 'left']);

/** Katalog node v1 tertutup (AD-15). */
export const NODE_TYPES = ['board', 'frame', 'text', 'rect', 'ellipse', 'path', 'icon'] as const;
export type NodeType = (typeof NODE_TYPES)[number];
export const CATALOG_HINT = `type harus salah satu katalog v1: ${NODE_TYPES.join(' | ')}`;

// ---------------------------------------------------------------------------
// Properti visual bersama
// ---------------------------------------------------------------------------

export const ColorStop = z.object({ offset: Unit, color: Color }).strict();
const Stops = z.array(ColorStop).min(2);

/** Batas fill efek (story 22). */
export const NOISE_SIZE_MIN = 0.5;
export const NOISE_SIZE_MAX = 8;
export const NOISE_SEED_MAX = 9999;
export const MESH_GRID_MIN = 2;
export const MESH_GRID_MAX = 5;
export const NOISE_BLENDS = ['normal', 'overlay', 'soft-light', 'multiply', 'screen'] as const;

const MeshGrid = z.number().int().min(MESH_GRID_MIN).max(MESH_GRID_MAX);
const MeshFill = z
  .object({
    type: z.literal('mesh'),
    columns: MeshGrid,
    rows: MeshGrid,
    /** Warna titik kendali baris demi baris (= columns Ã— rows). */
    colors: z.array(Color).min(4).max(MESH_GRID_MAX * MESH_GRID_MAX),
    /** Posisi titik kendali relatif kotak (= columns Ã— rows); default grid rata. */
    points: z.array(z.tuple([Unit, Unit])).min(4).max(MESH_GRID_MAX * MESH_GRID_MAX).optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    const n = f.columns * f.rows;
    if (f.colors.length !== n) ctx.addIssue({ code: 'custom', path: ['colors'], message: `mesh: colors harus ${n} warna (columns ${f.columns} Ã— rows ${f.rows}, baris demi baris), bukan ${f.colors.length}` });
    if (f.points && f.points.length !== n) ctx.addIssue({ code: 'custom', path: ['points'], message: `mesh: points harus ${n} titik [x,y] (columns Ã— rows), bukan ${f.points.length}` });
  });

export const Fill = z.discriminatedUnion('type', [
  z.object({ type: z.literal('solid'), color: Color }).strict(),
  z.object({ type: z.literal('linear'), angle: Px, stops: Stops }).strict(),
  z.object({ type: z.literal('radial'), center: z.tuple([Unit, Unit]).optional(), radius: Positive.optional(), stops: Stops }).strict(),
  /** Gradien sudut (conic): angle derajat (0 = atas, searah jarum jam), center relatif kotak. */
  z.object({ type: z.literal('conic'), angle: Px.optional(), center: z.tuple([Unit, Unit]).optional(), stops: Stops }).strict(),
  /** Grain/noise ber-seed: ubin feTurbulence deterministik, dicampur ke lapisan di bawahnya dengan `blend`. */
  z
    .object({
      type: z.literal('noise'),
      opacity: Unit,
      size: z.number().finite().min(NOISE_SIZE_MIN).max(NOISE_SIZE_MAX).optional(),
      seed: z.number().int().min(0).max(NOISE_SEED_MAX).optional(),
      blend: z.enum(NOISE_BLENDS).optional(),
      mono: z.boolean().optional(),
    })
    .strict(),
  MeshFill,
  z
    .object({
      type: z.literal('image'),
      assetId: z.string().regex(ASSET_ID_PATTERN, 'assetId: hash sha256 hex 64 karakter'),
      fit: z.enum(['cover', 'contain', 'fill', 'tile']),
    })
    .strict(),
]);
export type Fill = z.infer<typeof Fill>;

export const Stroke = z
  .object({
    color: Color,
    width: tok(Size),
    align: z.enum(['inside', 'center', 'outside']),
    sides: z
      .array(StrokeSide)
      .min(1)
      .refine((s) => new Set(s).size === s.length, 'sides tidak boleh berulang')
      .optional(),
  })
  .strict();
export type Stroke = z.infer<typeof Stroke>;

const RadiusValue = tok(Size);
export const Radius = z.union([RadiusValue, z.tuple([RadiusValue, RadiusValue, RadiusValue, RadiusValue])]);

export const Shadow = z
  .object({
    type: z.enum(['drop', 'inner']).optional(),
    x: Px,
    y: Px,
    blur: Size,
    spread: Px.optional(),
    color: Color,
  })
  .strict();
export type Shadow = z.infer<typeof Shadow>;

/** Efek: dimiliki semua node anak (termasuk text dan icon). */
const effectShape = {
  opacity: Unit.optional(),
  blend: Blend.optional(),
  blur: Size.optional(),
  backdropBlur: Size.optional(),
  rotation: Px.optional(),
  shadows: z.array(Shadow).optional(),
};

/** Visual tanpa radius (ellipse, path). */
const paintShape = {
  fills: z.array(Fill).optional(),
  stroke: Stroke.optional(),
  ...effectShape,
};

const visualShape = { ...paintShape, radius: Radius.optional() };

// Sizing: angka (fixed) | 'hug' | 'fill' + batas min/max.
export const Dimension = z.union([tok(Size), z.literal('hug'), z.literal('fill')]);
const sizingShape = {
  width: Dimension.optional(),
  height: Dimension.optional(),
  minWidth: tok(Size).optional(),
  maxWidth: tok(Size).optional(),
  minHeight: tok(Size).optional(),
  maxHeight: tok(Size).optional(),
};

/** Posisi node anak: x/y hanya bersama position:'absolute' (lihat `xyOnlyWhenAbsolute`). */
const positionShape = {
  position: z.literal('absolute').optional(),
  x: Px.optional(),
  y: Px.optional(),
};

const childBase = { name: Name, ...positionShape };

const PadValue = tok(Size);
export const Padding = z.union([PadValue, z.tuple([PadValue, PadValue]), z.tuple([PadValue, PadValue, PadValue, PadValue])]);

// ---------------------------------------------------------------------------
// Shape per tipe (input `add`: tanpa id, tanpa children). `.strict()` menolak kunci asing.
// ---------------------------------------------------------------------------

const boardShape = {
  type: z.literal('board'),
  name: Name,
  x: Px,
  y: Px,
  width: Size,
  height: Size,
  screen: Screen,
  expectedSize: z.object({ width: Size, height: Size }).strict().optional(),
  /** Board selalu clip (AD-15); ketiadaan = true. */
  clip: z.literal(true).optional(),
  fills: z.array(Fill).optional(),
  /** Mode tema board (AD-11); wajib ada di `tokenModes`. Ketiadaan = mode pertama `tokenModes`. */
  themeMode: ModeName.optional(),
};

const frameShape = {
  type: z.literal('frame'),
  ...childBase,
  layout: Layout.optional(),
  gap: tok(Px).optional(),
  padding: Padding.optional(),
  align: Align.optional(),
  justify: Justify.optional(),
  ...sizingShape,
  clip: z.boolean().optional(),
  scrollY: Size.optional(),
  ...visualShape,
};

const textShape = {
  type: z.literal('text'),
  ...childBase,
  content: z.string(),
  family: tok(FontFamily).optional(),
  weight: tok(Weight).optional(),
  style: z.enum(['normal', 'italic']).optional(),
  size: tok(Positive),
  lineHeight: tok(Positive).optional(),
  letterSpacing: tok(Px).optional(),
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
  wrap: z.enum(['auto', 'wrap', 'fixed']).optional(),
  numeric: z.enum(['proportional', 'tabular']).optional(),
  color: Color.optional(),
  ...sizingShape,
  ...effectShape,
};

const rectShape = {
  type: z.literal('rect'),
  ...childBase,
  ...sizingShape,
  ...visualShape,
};

const ellipseShape = {
  type: z.literal('ellipse'),
  ...childBase,
  ...sizingShape,
  ...paintShape,
  /** 0 = jam 12, positif searah jarum jam. */
  startDeg: Px.optional(),
  sweepDeg: z.number().min(-360).max(360).optional(),
  /** Rasio lubang dalam [0, 1). */
  inner: z.number().min(0).lt(1).optional(),
};

const pathShape = {
  type: z.literal('path'),
  ...childBase,
  d: z.string().min(1),
  viewBox: z.tuple([Px, Px, Positive, Positive]),
  ...sizingShape,
  ...paintShape,
};

const iconShape = {
  type: z.literal('icon'),
  ...childBase,
  lib: z.enum(ICON_LIBS),
  // `name` (dari childBase) = nama layer (AD-3, mis. "Icon / lucide / arrow-right"); nama ikon kanonik
  // pustaka disimpan terpisah di `icon` supaya tidak bertabrakan dengan nama layer (AD-9 Ã— AD-3).
  // `_` ada di beberapa slug simple-icons (mis. "hive_blockchain").
  icon: z.string().regex(ICON_NAME_PATTERN, 'nama ikon kanonik: huruf kecil/angka/tanda hubung/garis bawah, mis. "arrow-right"'),
  version: z.string().min(1).optional(),
  size: tok(Positive),
  color: Color.optional(),
  strokeWidth: Positive.optional(),
  filled: z.boolean().optional(),
  ...effectShape,
};

type Positioned = { position?: 'absolute' | undefined; x?: number | undefined; y?: number | undefined };
const xyOnlyWhenAbsolute = (v: Positioned, ctx: z.RefinementCtx) => {
  if (v.position !== 'absolute' && (v.x !== undefined || v.y !== undefined)) {
    ctx.addIssue({ code: 'custom', message: XY_HINT, path: [v.x !== undefined ? 'x' : 'y'] });
  }
};

export const BoardInput = z.object(boardShape).strict();
export const FrameInput = z.object(frameShape).strict().superRefine(xyOnlyWhenAbsolute);
export const TextInput = z.object(textShape).strict().superRefine(xyOnlyWhenAbsolute);
export const RectInput = z.object(rectShape).strict().superRefine(xyOnlyWhenAbsolute);
export const EllipseInput = z.object(ellipseShape).strict().superRefine(xyOnlyWhenAbsolute);
export const PathInput = z.object(pathShape).strict().superRefine(xyOnlyWhenAbsolute);
export const IconInput = z.object(iconShape).strict().superRefine(xyOnlyWhenAbsolute);
export const NodeInput = z.discriminatedUnion('type', [BoardInput, FrameInput, TextInput, RectInput, EllipseInput, PathInput, IconInput]);
export type BoardInput = z.infer<typeof BoardInput>;
export type FrameInput = z.infer<typeof FrameInput>;
export type TextInput = z.infer<typeof TextInput>;
export type RectInput = z.infer<typeof RectInput>;
export type EllipseInput = z.infer<typeof EllipseInput>;
export type PathInput = z.infer<typeof PathInput>;
export type IconInput = z.infer<typeof IconInput>;
export type NodeInput = z.infer<typeof NodeInput>;

// ---------------------------------------------------------------------------
// Node tersimpan: input + id (+ children untuk kontainer).
// ---------------------------------------------------------------------------

export type TextNode = TextInput & { id: string };
export type RectNode = RectInput & { id: string };
export type EllipseNode = EllipseInput & { id: string };
export type PathNode = PathInput & { id: string };
export type IconNode = IconInput & { id: string };
export type FrameNode = FrameInput & { id: string; children: ChildNode[] };
export type LeafNode = TextNode | RectNode | EllipseNode | PathNode | IconNode;
export type ChildNode = FrameNode | LeafNode;
export type BoardNode = BoardInput & { id: string; children: ChildNode[] };
export type AnyNode = BoardNode | ChildNode;

export const TextNode = z.object({ ...textShape, id: Id }).strict().superRefine(xyOnlyWhenAbsolute);
export const RectNode = z.object({ ...rectShape, id: Id }).strict().superRefine(xyOnlyWhenAbsolute);
export const EllipseNode = z.object({ ...ellipseShape, id: Id }).strict().superRefine(xyOnlyWhenAbsolute);
export const PathNode = z.object({ ...pathShape, id: Id }).strict().superRefine(xyOnlyWhenAbsolute);
export const IconNode = z.object({ ...iconShape, id: Id }).strict().superRefine(xyOnlyWhenAbsolute);
export const FrameNode: z.ZodType<FrameNode> = z
  .object({
    ...frameShape,
    id: Id,
    get children() {
      return z.array(ChildNode);
    },
  })
  .strict()
  .superRefine(xyOnlyWhenAbsolute);
// discriminatedUnion (bukan union biasa) supaya issue menunjuk path terdalam. FrameNode dianotasi
// `ZodType<T>` untuk memutus siklus tipe, jadi opsi di-cast; di runtime semuanya ZodObject.
const childOptions = [FrameNode, TextNode, RectNode, EllipseNode, PathNode, IconNode] as unknown as [typeof TextNode, ...(typeof TextNode)[]];
export const ChildNode = z.discriminatedUnion('type', childOptions) as unknown as z.ZodType<ChildNode>;
export const BoardNode: z.ZodType<BoardNode> = z.object({ ...boardShape, id: Id, children: z.array(ChildNode) }).strict();

export const Page = z.object({ id: Id, name: Name, children: z.array(BoardNode) }).strict();
export type Page = z.infer<typeof Page>;

export const LakarDocument = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: Id,
    rev: z.number().int().nonnegative(),
    /** Peta nama bertitik â†’ token bertipe. Opsional: dokumen tracer tanpa tokens tetap valid. */
    tokens: Tokens.optional(),
    /** Mode tema yang dideklarasikan (AD-11); elemen pertama = default. */
    tokenModes: TokenModes.optional(),
    pages: z.array(Page).min(1),
  })
  .strict()
  .superRefine((d, ctx) => {
    for (const i of tokenModeIssues(d)) ctx.addIssue({ code: 'custom', path: i.path, message: i.message });
  });
export type LakarDocument = z.infer<typeof LakarDocument>;

export type TokenModeIssue = { path: (string | number)[]; message: string };

/**
 * Konsistensi mode (AD-11): kunci `modes` token dan `themeMode` board wajib ada di `tokenModes`; tanpa
 * `tokenModes` keduanya dilarang. Dipakai `LakarDocument` dan `resolveTokens`.
 */
export function tokenModeIssues(doc: {
  tokens?: Readonly<Record<string, { modes?: Readonly<Record<string, unknown>> | undefined }>> | undefined;
  tokenModes?: readonly string[] | undefined;
  pages: readonly { children: readonly { themeMode?: string | undefined }[] }[];
}): TokenModeIssue[] {
  const out: TokenModeIssue[] = [];
  const declared = doc.tokenModes;
  const known = new Set(declared ?? []);
  const why = (m: string) =>
    declared ? `mode ${JSON.stringify(m)} tidak ada di tokenModes [${declared.join(', ')}]` : `mode ${JSON.stringify(m)} dipakai tetapi dokumen tidak punya tokenModes`;
  for (const [name, def] of Object.entries(doc.tokens ?? {})) {
    for (const m of Object.keys(def.modes ?? {})) if (!known.has(m)) out.push({ path: ['tokens', name, 'modes', m], message: why(m) });
  }
  doc.pages.forEach((p, pi) =>
    p.children.forEach((b, bi) => {
      if (b.themeMode !== undefined && !known.has(b.themeMode)) out.push({ path: ['pages', pi, 'children', bi, 'themeMode'], message: why(b.themeMode) });
    }),
  );
  return out;
}

/**
 * Board `boardId` di halaman mana pun (generik: dokumen tersimpan maupun ter-resolve), atau undefined.
 * Render memegang salinannya sendiri (dist render dimuat di Chromium tanpa bundler).
 */
export function findBoard<B extends { id: string }>(doc: { pages: readonly { children: readonly B[] }[] }, boardId: string): B | undefined {
  for (const p of doc.pages) for (const b of p.children) if (b.id === boardId) return b;
  return undefined;
}

export type HistoryEntry = {
  rev: number;
  sessionId: string;
  description: string;
  opsSummary: string;
  at: string;
  /** Klien sesi penulis (opsional; entri lama dan entri aplikasi tanpa field ini). */
  client?: string;
};

/** `path` = list nama dari board ke node (nama boleh memuat " / "); hanya untuk dibaca, alamat op tetap `id`. */
export type CreatedEntry = { id: string; name: string; path: string[] };

// ---------------------------------------------------------------------------
// Pemetaan issue zod â†’ LakarError SCHEMA_INVALID
// ---------------------------------------------------------------------------

type Issue = z.core.$ZodIssue;

function* walkIssues(issues: readonly Issue[]): Generator<Issue> {
  for (const i of issues) {
    yield i;
    if (i.code === 'invalid_union') for (const branch of i.errors) yield* walkIssues(branch);
  }
}

function describe(i: Issue): string {
  const path = i.path.join('.') || '(root)';
  if (i.code === 'invalid_union' && i.errors.length > 0) {
    const nested = [...new Set(i.errors.flat().map((e) => e.message))];
    return `${path}: ${nested.join(' | ')}`;
  }
  return `${path}: ${i.message}`;
}

/** Ringkas issue zod jadi satu baris + hint (dipakai core/daemon untuk SCHEMA_INVALID). Prioritas hint: x/y, warna, katalog. */
export function zodToLakarError(err: z.ZodError, context: string): LakarError {
  const all = [...walkIssues(err.issues)];
  // x/y pada node flow terdeteksi lewat refinement XY_HINT di setiap tipe anak (board punya x/y di shape-nya).
  const xyIssue = all.some((i) => i.message === XY_HINT);
  const colorIssue = all.some((i) => i.message === COLOR_MESSAGE);
  // Hanya discriminator node (bukan mis. Fill yang juga discriminatedUnion pada `type`).
  const catalogIssue = all.some(
    (i) =>
      i.code === 'invalid_union' &&
      i.errors.length === 0 &&
      i.path.at(-1) === 'type' &&
      ((i as { options?: unknown[] }).options ?? []).includes('rect'),
  );
  const hint = xyIssue
    ? XY_HINT
    : colorIssue
      ? COLOR_HINT
      : catalogIssue
        ? CATALOG_HINT
        : `periksa properti node terhadap skema Lakar v1 (${NODE_TYPES.join('/')})`;
  return new LakarError('SCHEMA_INVALID', `${context}: ${err.issues.map(describe).join('; ')}`, { hint });
}
