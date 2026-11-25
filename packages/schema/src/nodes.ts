// Skema dokumen Lakar v7 (AD-2, AD-11, AD-12, AD-13, AD-14, AD-15, AD-16): primitif, token, properti visual, katalog node, dokumen.
// v2 (story 22) menambah fill `conic`, `noise`, `mesh`; dokumen v1 dimigrasi identitas (`@lakar/core` MIGRATIONS[1]).
// v3 (epic model-dokumen story 2) mengganti token datar dengan token bertipe + mode tema; dokumen v2 dimigrasi
// lewat inferensi tipe (`@lakar/core` MIGRATIONS[2]).
// Satu sumber: tipe TS diturunkan dari zod di sini. Tanpa IO.
import { z } from 'zod';
import { LakarError } from './errors.js';
import { ICON_LIBS, ICON_NAME_PATTERN } from './icons.js';
import { componentIssues } from './component-issues.js';
import { NODE_ADDRESS_PATTERN } from './selection.js';

// v4 (epic editor-canvas story 7, AD-13) menambah `layout:'grid'` + track bertipe, `columnGap`/`rowGap`, dan
// penempatan anak `gridColumn`/`gridRow`; dokumen v3 dimigrasi identitas (`@lakar/core` MIGRATIONS[3]).
// v5 (epic komponen story 2, AD-12) menambah master `component {props, slots}` dan tipe node `instance`; dokumen v4
// dimigrasi identitas (`@lakar/core` MIGRATIONS[4]). Ekspansi instance ada di components.ts.
// v6 (epic paste-vektor story 2, AD-14) menambah atribut presentasi SVG bertipe pada node `path` (`fillRule`,
// `strokeLinecap`, `strokeLinejoin`, `strokeDasharray`, `strokeMiterlimit`) dan record `svg` terbatas allowlist;
// dokumen v5 dimigrasi identitas (`@lakar/core` MIGRATIONS[5]).
// v7 (epic paste-vektor story 4, AD-1) menambah `tag` semantik opsional (allowlist `HTML_TAGS`) pada frame dan text
// untuk ekspor kode; render canvas mengabaikannya. Dokumen v6 dimigrasi identitas (`@lakar/core` MIGRATIONS[6]).
// v8 (spec-board-hug-height) membolehkan `height:'hug'` pada board: tinggi board = tinggi isi flow, diukur saat render.
// Dokumen v7 (tinggi board selalu angka) dimigrasi identitas (`@lakar/core` MIGRATIONS[7]).
// v9 (story flex-wrap, epic adopsi-open-pencil) menambah `wrap?:boolean` pada frame (anak flex row/column membungkus
// ke baris berikut, CSS flex-wrap); dokumen v8 dimigrasi identitas (`@lakar/core` MIGRATIONS[8]).
// v10 (story komentar canvas, epic kolaborasi-agen) menambah `comments` opsional di root dokumen; dokumen v9
// dimigrasi identitas (`@lakar/core` MIGRATIONS[9]).
export const SCHEMA_VERSION = 11 as const;

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
export const Layout = z.enum(['none', 'row', 'column', 'grid']);
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
export const NODE_TYPES = ['board', 'frame', 'text', 'rect', 'ellipse', 'path', 'icon', 'instance'] as const;
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

// ---------------------------------------------------------------------------
// Grid (v4, AD-13): track bertipe (tanpa string CSS) dan penempatan anak. Pemetaan CSS di render css.ts.
// ---------------------------------------------------------------------------

/** Batas jumlah track per sumbu, nilai `span`, dan garis grid (±). */
export const GRID_TRACKS_MAX = 24;
export const GRID_SPAN_MAX = 24;
export const GRID_LINE_MAX = 25;

/** Track `fr`: `{fr: 1}` → `1fr`. */
export const GridFr = z.object({ fr: Positive }).strict();
/** Batas bawah minmax: px | 'auto' (CSS melarang fr sebagai min). */
const GridTrackMin = z.union([Size, z.literal('auto')]);
/** Batas atas minmax: px | fr | 'auto'. */
const GridTrackMax = z.union([Size, GridFr, z.literal('auto')]);
/** Satu track: angka (px) | `{fr}` | `'auto'` | `{minmax:[min, max]}`. */
export const GridTrack = z.union([Size, GridFr, z.literal('auto'), z.object({ minmax: z.tuple([GridTrackMin, GridTrackMax]) }).strict()]);
export type GridTrack = z.infer<typeof GridTrack>;
/** Template satu sumbu: 1..GRID_TRACKS_MAX track, ditulis apa adanya (tanpa repeat()). */
export const GridTemplate = z.array(GridTrack).min(1).max(GRID_TRACKS_MAX);
export type GridTemplate = z.infer<typeof GridTemplate>;

const GridLine = z
  .number()
  .int()
  .min(-GRID_LINE_MAX)
  .max(GRID_LINE_MAX)
  .refine((n) => n !== 0, 'garis grid tidak boleh 0 (mulai dari 1; negatif dihitung dari ujung)');
/** Penempatan anak di parent grid: `{start?, end?, span?}`; minimal satu kunci, `end` dan `span` tidak bersamaan. */
export const GridPlacement = z
  .object({ start: GridLine.optional(), end: GridLine.optional(), span: z.number().int().min(1).max(GRID_SPAN_MAX).optional() })
  .strict()
  .refine((p) => p.start !== undefined || p.end !== undefined || p.span !== undefined, 'penempatan grid butuh start, end, atau span')
  .refine((p) => !(p.end !== undefined && p.span !== undefined), 'penempatan grid: pakai end atau span, tidak keduanya');
export type GridPlacement = z.infer<typeof GridPlacement>;

/** Penempatan sel: hanya berlaku di parent `layout:'grid'` untuk anak flow (selain itu diabaikan render). */
const gridItemShape = {
  gridColumn: GridPlacement.optional(),
  gridRow: GridPlacement.optional(),
};

const childBase = { name: Name, ...positionShape, ...gridItemShape };

/**
 * Tag semantik HTML untuk ekspor (v7, AD-1): hanya tag yang reset UA-nya ditulis codegen (`tagResetDecls` di render
 * css.ts). Render canvas tidak memakainya. Diisi importer HTML (story 4) atau agen.
 */
export const HTML_TAGS = ['header', 'nav', 'main', 'section', 'article', 'aside', 'footer', 'figure', 'figcaption', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'button', 'a'] as const;
export type HtmlTag = (typeof HTML_TAGS)[number];
const tagShape = { tag: z.enum(HTML_TAGS).optional() };

// ---------------------------------------------------------------------------
// Komponen (v5, AD-12): master = node anak non-instance yang membawa `component`; instance = tipe node `instance`.
// Ekspansi dan validasi lintas node ada di components.ts.
// ---------------------------------------------------------------------------

/** Nama prop/slot komponen: aman menjadi nama prop React (AD-16). */
export const COMPONENT_NAME_PATTERN = /^[a-z][A-Za-z0-9]{0,31}$/;
export const COMPONENT_PROPS_MAX = 64;
export const COMPONENT_SLOTS_MAX = 32;
export const COMPONENT_BINDS_MAX = 32;
export const ENUM_OPTIONS_MAX = 32;
/** Pseudo-properti bind boolean: `false` menghapus node terikat dari hasil ekspansi. */
export const VISIBLE_BIND = 'visible';

const ComponentName = z.string().regex(COMPONENT_NAME_PATTERN, `nama prop/slot komponen harus cocok ${COMPONENT_NAME_PATTERN.source} (mis. "title", "showBadge")`);
/** Properti node yang boleh di-override/di-bind (diisi setelah semua shape didefinisikan; dipakai saat parse). */
const overridableSet = new Set<string>();
const OverridableKey = z.string().refine((p) => overridableSet.has(p), {
  message: 'properti tidak bisa di-override/di-bind (type, id, children, dan component dilarang; pakai nama properti node)',
});
const BindProp = z.string().refine((p) => p === VISIBLE_BIND || overridableSet.has(p), {
  message: `bind.prop harus properti node (mis. "content", "fills") atau "${VISIBLE_BIND}"`,
});
export const ComponentBind = z.object({ nodeId: Id, prop: BindProp }).strict();
export type ComponentBind = z.infer<typeof ComponentBind>;
const Binds = z.array(ComponentBind).max(COMPONENT_BINDS_MAX);

export const ComponentProp = z.discriminatedUnion('type', [
  z.object({ name: ComponentName, type: z.literal('text'), default: z.string(), binds: Binds }).strict(),
  z.object({ name: ComponentName, type: z.literal('boolean'), default: z.boolean(), binds: Binds }).strict(),
  z
    .object({
      name: ComponentName,
      type: z.literal('enum'),
      options: z
        .array(z.string().min(1))
        .min(1)
        .max(ENUM_OPTIONS_MAX)
        .refine((o) => new Set(o).size === o.length, 'options enum tidak boleh berulang'),
      default: z.string().min(1),
      binds: Binds,
    })
    .strict()
    .refine((p) => p.options.includes(p.default), { message: 'default enum harus salah satu options', path: ['default'] }),
]);
export type ComponentProp = z.infer<typeof ComponentProp>;
export const ComponentSlot = z.object({ name: ComponentName, nodeId: Id }).strict();
export type ComponentSlot = z.infer<typeof ComponentSlot>;

/** Definisi master: props dan slots (keduanya wajib, boleh kosong); nama unik di gabungan props + slots. */
export const ComponentDef = z
  .object({ props: z.array(ComponentProp).max(COMPONENT_PROPS_MAX), slots: z.array(ComponentSlot).max(COMPONENT_SLOTS_MAX) })
  .strict()
  .superRefine((c, ctx) => {
    const seen = new Set<string>();
    const names: [string, (string | number)[]][] = [
      ...c.props.map((p, i): [string, (string | number)[]] => [p.name, ['props', i, 'name']]),
      ...c.slots.map((s, i): [string, (string | number)[]] => [s.name, ['slots', i, 'name']]),
    ];
    for (const [n, path] of names) {
      if (seen.has(n)) ctx.addIssue({ code: 'custom', path, message: `nama prop/slot komponen ${JSON.stringify(n)} dipakai lebih dari sekali` });
      seen.add(n);
    }
  });
export type ComponentDef = z.infer<typeof ComponentDef>;

/** Kunci `component` pada shape node yang boleh menjadi master. */
const masterShape = { component: ComponentDef.optional() };

/** Kunci override: id node master, atau path relatif ke dalam instance bersarang (`<J>/<U>`). */
const OverrideKey = z.string().regex(NODE_ADDRESS_PATTERN, 'kunci override: id node master atau path id dipisah "/" (mis. "Ab12Cd34/Ef56Gh78")');
/** Nilai props instance. */
export const InstancePropValue = z.union([z.string(), z.boolean()]);

/** Shape instance tanpa `slots` (slots berisi node tersimpan, didefinisikan per keluarga skema). */
const instanceShape = {
  type: z.literal('instance'),
  ...childBase,
  componentId: Id,
  props: z.record(ComponentName, InstancePropValue).optional(),
  /** `{kunci: {properti: nilai}}`; `null` menghapus properti master. Nilai divalidasi pada node hasil ekspansi. */
  overrides: z.record(OverrideKey, z.record(OverridableKey, z.unknown())).optional(),
};

const PadValue = tok(Size);
export const Padding = z.union([PadValue, z.tuple([PadValue, PadValue]), z.tuple([PadValue, PadValue, PadValue, PadValue])]);

// ---------------------------------------------------------------------------
// Shape per tipe (input `add`: tanpa id, tanpa children). `.strict()` menolak kunci asing.
// ---------------------------------------------------------------------------

/** Tinggi board: angka (tetap) atau `'hug'` (v8): ikut isi flow, diukur saat render; tanpa isi = 0. */
export const BoardHeight = z.union([Size, z.literal('hug')]);
export type BoardHeight = z.infer<typeof BoardHeight>;
/** Board ber-`height:'hug'`? (struktural: dipakai juga untuk board ter-resolve dan view). */
export const isHugBoard = (b: { readonly height?: unknown }): boolean => b.height === 'hug';

const boardShape = {
  type: z.literal('board'),
  name: Name,
  x: Px,
  y: Px,
  width: Size,
  height: BoardHeight,
  screen: Screen,
  expectedSize: z.object({ width: Size, height: Size }).strict().optional(),
  /** Board selalu clip (AD-15); ketiadaan = true. */
  clip: z.literal(true).optional(),
  fills: z.array(Fill).optional(),
  /** Mode tema board (AD-11); wajib ada di `tokenModes`. Ketiadaan = mode pertama `tokenModes`. */
  themeMode: ModeName.optional(),
  /** Grup section bernama (v11, spec-section-groups): nama grup kanvas pembungkus board; ketiadaan = tanpa section. */
  section: z.string().min(1).max(120).optional(),
};

const frameShape = {
  type: z.literal('frame'),
  ...childBase,
  ...masterShape,
  ...tagShape,
  layout: Layout.optional(),
  gap: tok(Px).optional(),
  padding: Padding.optional(),
  align: Align.optional(),
  justify: Justify.optional(),
  /** Track kolom/baris untuk `layout:'grid'` (diabaikan di layout lain). */
  gridTemplateColumns: GridTemplate.optional(),
  gridTemplateRows: GridTemplate.optional(),
  /** Gap per sumbu (CSS column-gap/row-gap); menimpa `gap` di sumbu itu. */
  columnGap: tok(Size).optional(),
  rowGap: tok(Size).optional(),
  /** v9: `true` = anak flex membungkus ke baris berikut (CSS flex-wrap: wrap); hanya bermakna di layout row/column. */
  wrap: z.boolean().optional(),
  ...sizingShape,
  clip: z.boolean().optional(),
  scrollY: Size.optional(),
  ...visualShape,
};

const textShape = {
  type: z.literal('text'),
  ...childBase,
  ...masterShape,
  ...tagShape,
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
  ...masterShape,
  ...sizingShape,
  ...visualShape,
};

const ellipseShape = {
  type: z.literal('ellipse'),
  ...childBase,
  ...masterShape,
  ...sizingShape,
  ...paintShape,
  /** 0 = jam 12, positif searah jarum jam. */
  startDeg: Px.optional(),
  sweepDeg: z.number().min(-360).max(360).optional(),
  /** Rasio lubang dalam [0, 1). */
  inner: z.number().min(0).lt(1).optional(),
};

// ---------------------------------------------------------------------------
// Vektor (v6, AD-14): atribut presentasi SVG bertipe + allowlist `svg`. Pemetaan ke atribut SVG di render css.ts
// (`vectorSvgAttrs`). Panjang stroke (dash, dashoffset) dalam px seperti `stroke.width` (stroke non-scaling).
// ---------------------------------------------------------------------------

export const FILL_RULES = ['nonzero', 'evenodd'] as const;
export const STROKE_LINECAPS = ['butt', 'round', 'square'] as const;
export const STROKE_LINEJOINS = ['miter', 'round', 'bevel'] as const;
export const STROKE_DASH_MAX = 16;
export const STROKE_MITERLIMIT_MAX = 100;

const OPACITY_ATTR = /^(?:(?:0|1)(?:\.0+)?|0?\.\d+|(?:100(?:\.0+)?|\d{1,2}(?:\.\d+)?)%)$/;
/** Pola nilai per atribut allowlist `svg` (tanpa `url()`, tanpa string bebas). */
export const SVG_ATTR_PATTERNS = {
  'fill-opacity': OPACITY_ATTR,
  'paint-order': /^(?:normal|(fill|stroke|markers)(?: (?!\1)(fill|stroke|markers)(?: (?!\1|\2)(?:fill|stroke|markers))?)?)$/,
  'shape-rendering': /^(?:auto|optimizeSpeed|crispEdges|geometricPrecision)$/,
  'stroke-dashoffset': /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px)?$/,
  'stroke-opacity': OPACITY_ATTR,
} as const;
export type SvgPresentationAttr = keyof typeof SVG_ATTR_PATTERNS;
/** Allowlist atribut presentasi SVG yang belum punya properti bertipe (urut abjad). */
export const SVG_PRESENTATION_ATTRS = Object.keys(SVG_ATTR_PATTERNS) as SvgPresentationAttr[];
const SVG_ALLOWLIST_MESSAGE = `atribut svg harus salah satu allowlist: ${SVG_PRESENTATION_ATTRS.join(', ')}`;
export const SvgAttrs = z.strictObject(
  Object.fromEntries(
    SVG_PRESENTATION_ATTRS.map((k) => [k, z.string().regex(SVG_ATTR_PATTERNS[k], `svg ${k}: nilai tidak sah untuk atribut ini`).optional()]),
  ) as { [K in SvgPresentationAttr]: z.ZodOptional<z.ZodString> },
  { error: (i) => (i.code === 'unrecognized_keys' ? `${SVG_ALLOWLIST_MESSAGE} (bukan ${i.keys.join(', ')})` : undefined) },
);
export type SvgAttrs = z.infer<typeof SvgAttrs>;

const vectorShape = {
  fillRule: z.enum(FILL_RULES).optional(),
  strokeLinecap: z.enum(STROKE_LINECAPS).optional(),
  strokeLinejoin: z.enum(STROKE_LINEJOINS).optional(),
  strokeDasharray: z.array(Size).min(1).max(STROKE_DASH_MAX).optional(),
  strokeMiterlimit: z.number().finite().min(1).max(STROKE_MITERLIMIT_MAX).optional(),
  svg: SvgAttrs.optional(),
};

const pathShape = {
  type: z.literal('path'),
  ...childBase,
  ...masterShape,
  d: z.string().min(1),
  viewBox: z.tuple([Px, Px, Positive, Positive]),
  ...sizingShape,
  ...paintShape,
  ...vectorShape,
};

const iconShape = {
  type: z.literal('icon'),
  ...childBase,
  ...masterShape,
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
export type BoardInput = z.infer<typeof BoardInput>;
export type FrameInput = z.infer<typeof FrameInput>;
export type TextInput = z.infer<typeof TextInput>;
export type RectInput = z.infer<typeof RectInput>;
export type EllipseInput = z.infer<typeof EllipseInput>;
export type PathInput = z.infer<typeof PathInput>;
export type IconInput = z.infer<typeof IconInput>;
type InstanceFields = z.infer<z.ZodObject<typeof instanceShape>>;
/** Instance (AD-12): `slots` berisi node tersimpan (dengan id) per nama slot; isi master tidak pernah disimpan terurai. */
export type InstanceInput = InstanceFields & { slots?: Record<string, ChildNode[]> | undefined };

// Kunci yang boleh di-override/di-bind: semua kunci shape node anak kecuali type/id/children/component.
for (const shape of [frameShape, textShape, rectShape, ellipseShape, pathShape, iconShape]) {
  for (const k of Object.keys(shape)) if (k !== 'type' && k !== 'component') overridableSet.add(k);
}
/** Properti yang boleh menjadi kunci override instance dan target bind prop (urut abjad). */
export const OVERRIDABLE_PROPS: readonly string[] = Object.freeze([...overridableSet].sort());

// ---------------------------------------------------------------------------
// Node tersimpan: input + id (+ children untuk kontainer, + slots untuk instance).
// ---------------------------------------------------------------------------

export type TextNode = TextInput & { id: string };
export type RectNode = RectInput & { id: string };
export type EllipseNode = EllipseInput & { id: string };
export type PathNode = PathInput & { id: string };
export type IconNode = IconInput & { id: string };
export type InstanceNode = InstanceInput & { id: string };
export type FrameNode = FrameInput & { id: string; children: ChildNode[] };
export type LeafNode = TextNode | RectNode | EllipseNode | PathNode | IconNode;
export type ChildNode = FrameNode | LeafNode | InstanceNode;
export type BoardNode = BoardInput & { id: string; children: ChildNode[] };
export type AnyNode = BoardNode | ChildNode;
export type NodeInput = BoardInput | FrameInput | TextInput | RectInput | EllipseInput | PathInput | IconInput | InstanceInput;

/**
 * Node hasil ekspansi instance (AD-10/AD-12): tanpa `instance`; `id` boleh alamat komposit `<instanceId>/<masterNodeId>…`.
 * Bentuk ini yang diterima render, check, dan canvas (lewat `resolveDocument`).
 */
export type ExpandedFrameNode = FrameInput & { id: string; children: ExpandedChildNode[] };
export type ExpandedChildNode = ExpandedFrameNode | LeafNode;
export type ExpandedBoardNode = BoardInput & { id: string; children: ExpandedChildNode[] };
export type ExpandedPage = { id: string; name: string; children: ExpandedBoardNode[] };

/** Alamat node pada dokumen ter-ekspansi: id tersimpan atau alamat komposit. */
const Address = z.string().regex(NODE_ADDRESS_PATTERN, 'alamat node: ID 8 karakter [A-Za-z0-9] atau ID dipisah "/"');

/** Keluarga skema kontainer (frame, instance, union anak, board, page) di atas skema leaf yang diberikan. */
function nodeBranch(id: z.ZodString, leaves: readonly z.ZodType[], withInstance: boolean) {
  // Diisi sesudah frame/instance; getter rekursif baru membacanya saat parse.
  let child: z.ZodType;
  const frame = z
    .object({
      ...frameShape,
      id,
      get children() {
        return z.array(child);
      },
    })
    .strict()
    .superRefine(xyOnlyWhenAbsolute);
  const instance = z
    .object({
      ...instanceShape,
      id,
      get slots() {
        return z.record(ComponentName, z.array(child)).optional();
      },
    })
    .strict()
    .superRefine(xyOnlyWhenAbsolute);
  // discriminatedUnion (bukan union biasa) supaya issue menunjuk path terdalam; opsi di-cast (siklus tipe).
  const options = [frame, ...leaves, ...(withInstance ? [instance] : [])] as unknown as [typeof TextInput, ...(typeof TextInput)[]];
  child = z.discriminatedUnion('type', options);
  const board = z.object({ ...boardShape, id, children: z.array(child) }).strict();
  const page = z.object({ id: Id, name: Name, children: z.array(board) }).strict();
  return { frame, instance, child, board, page };
}

export const TextNode = z.object({ ...textShape, id: Id }).strict().superRefine(xyOnlyWhenAbsolute);
export const RectNode = z.object({ ...rectShape, id: Id }).strict().superRefine(xyOnlyWhenAbsolute);
export const EllipseNode = z.object({ ...ellipseShape, id: Id }).strict().superRefine(xyOnlyWhenAbsolute);
export const PathNode = z.object({ ...pathShape, id: Id }).strict().superRefine(xyOnlyWhenAbsolute);
export const IconNode = z.object({ ...iconShape, id: Id }).strict().superRefine(xyOnlyWhenAbsolute);
const stored = nodeBranch(Id, [TextNode, RectNode, EllipseNode, PathNode, IconNode], true);
export const FrameNode = stored.frame as unknown as z.ZodType<FrameNode>;
export const InstanceNode = stored.instance as unknown as z.ZodType<InstanceNode>;
export const ChildNode = stored.child as unknown as z.ZodType<ChildNode>;
export const BoardNode = stored.board as unknown as z.ZodType<BoardNode>;

/** Input instance (`add`/`update`): shape instance + `slots` berisi node tersimpan. */
export const InstanceInput = z
  .object({
    ...instanceShape,
    get slots() {
      return z.record(ComponentName, z.array(ChildNode)).optional();
    },
  })
  .strict()
  .superRefine(xyOnlyWhenAbsolute);
export const NodeInput = z.discriminatedUnion('type', [
  BoardInput,
  FrameInput,
  TextInput,
  RectInput,
  EllipseInput,
  PathInput,
  IconInput,
  InstanceInput,
] as unknown as [typeof TextInput, ...(typeof TextInput)[]]) as unknown as z.ZodType<NodeInput>;

export const Page = z.object({ id: Id, name: Name, children: z.array(BoardNode) }).strict();
export type Page = z.infer<typeof Page>;

// ---------------------------------------------------------------------------
// Komentar canvas (v10, epic kolaborasi-agen)
// ---------------------------------------------------------------------------

/** Penulis pesan komentar: `user` (aplikasi) atau `agent` (sesi MCP; `name` = harness, mis. "Claude Code"). */
export const CommentAuthor = z.object({ kind: z.enum(['user', 'agent']), name: z.string().min(1).max(80) }).strict();
export type CommentAuthor = z.infer<typeof CommentAuthor>;

/** Panjang maksimum satu pesan komentar (karakter). */
export const COMMENT_TEXT_MAX = 4000;

export const CommentMessage = z
  .object({ author: CommentAuthor, text: z.string().min(1).max(COMMENT_TEXT_MAX), at: z.string().min(1) })
  .strict();
export type CommentMessage = z.infer<typeof CommentMessage>;

/**
 * Thread komentar di canvas: `nodeId` = pin di layer (komentar mengikuti layer itu di UI), tanpa `nodeId` = pin
 * bebas. `x,y` selalu disimpan dalam koordinat halaman — untuk pin layer ini posisi pin saat komentar dibuat
 * (fallback bila layer dihapus/dipindah). `resolvedAt` ada hanya saat `status:'resolved'`.
 */
export const CommentThread = z
  .object({
    id: Id,
    pageId: Id,
    nodeId: Id.optional(),
    x: z.number().finite(),
    y: z.number().finite(),
    status: z.enum(['open', 'resolved']),
    resolvedAt: z.string().optional(),
    messages: z.array(CommentMessage).min(1),
  })
  .strict();
export type CommentThread = z.infer<typeof CommentThread>;

const documentShape = {
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Id,
  rev: z.number().int().nonnegative(),
  /** Peta nama bertitik → token bertipe. Opsional: dokumen tracer tanpa tokens tetap valid. */
  tokens: Tokens.optional(),
  /** Mode tema yang dideklarasikan (AD-11); elemen pertama = default. */
  tokenModes: TokenModes.optional(),
  /** Thread komentar canvas (v10); opsional — dokumen tanpa komentar tetap valid. */
  comments: z.array(CommentThread).optional(),
};

export const LakarDocument = z
  .object({ ...documentShape, pages: z.array(Page).min(1) })
  .strict()
  .superRefine((d, ctx) => {
    for (const i of tokenModeIssues(d)) ctx.addIssue({ code: 'custom', path: i.path, message: i.message });
    for (const i of componentIssues(d)) ctx.addIssue({ code: 'custom', path: i.path, message: i.message });
  });
export type LakarDocument = z.infer<typeof LakarDocument>;
export type ExpandedDocument = Omit<LakarDocument, 'pages'> & { pages: ExpandedPage[] };

const expandedLeaves = [
  z.object({ ...textShape, id: Address }).strict().superRefine(xyOnlyWhenAbsolute),
  z.object({ ...rectShape, id: Address }).strict().superRefine(xyOnlyWhenAbsolute),
  z.object({ ...ellipseShape, id: Address }).strict().superRefine(xyOnlyWhenAbsolute),
  z.object({ ...pathShape, id: Address }).strict().superRefine(xyOnlyWhenAbsolute),
  z.object({ ...iconShape, id: Address }).strict().superRefine(xyOnlyWhenAbsolute),
];
const expanded = nodeBranch(Address, expandedLeaves, false);

/**
 * Skema dangkal node hasil ekspansi per tipe (tanpa `children`, id = alamat). Dipakai ekspansi untuk menguji
 * nilai bind/override per node: nilai yang membuat node tidak sah diabaikan dan dilaporkan (AD-12).
 */
export const EXPANDED_NODE_SHALLOW: Readonly<Record<string, z.ZodType>> = Object.freeze({
  frame: z.object({ ...frameShape, id: Address }).strict().superRefine(xyOnlyWhenAbsolute),
  text: expandedLeaves[0]!,
  rect: expandedLeaves[1]!,
  ellipse: expandedLeaves[2]!,
  path: expandedLeaves[3]!,
  icon: expandedLeaves[4]!,
});

/** Kunci milik node instance sendiri; kunci lain pada `update(instanceId, …)` menjadi override akar. */
export const INSTANCE_KEYS: readonly string[] = Object.freeze([...Object.keys(instanceShape), 'slots']);

/**
 * Dokumen ter-ekspansi (hasil `expandInstances`): sama dengan `LakarDocument`, tetapi id node boleh alamat
 * komposit dan tipe `instance` tidak ada. Validasi komponen (siklus, master) sudah dijalankan pada dokumen tersimpan.
 */
export const ExpandedLakarDocument = z
  .object({ ...documentShape, pages: z.array(expanded.page).min(1) })
  .strict()
  .superRefine((d, ctx) => {
    for (const i of tokenModeIssues(d)) ctx.addIssue({ code: 'custom', path: i.path, message: i.message });
  }) as unknown as z.ZodType<ExpandedDocument>;

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
  /** Harness agen sesi penulis (`x-lakar-agent`, mis. `claude-code`; opsional, sejak spec-agent-identity-history). */
  agent?: string;
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
