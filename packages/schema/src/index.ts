// Skema dokumen Lakar (AD-2, AD-15) — irisan tracer: board / frame / text.
// Satu sumber: tipe TS diturunkan dari zod di sini. Tanpa IO.
import { z } from 'zod';

export const PACKAGE = '@lakar/schema';
export const SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Error (AD-11)
// ---------------------------------------------------------------------------

export const ErrorCode = z.enum([
  'SCHEMA_INVALID',
  'NOT_FOUND',
  'CONFLICT',
  'NO_ACTIVE_DOC',
  'EXEC_TIMEOUT',
  'EXEC_ERROR',
  'ICON_UNKNOWN',
  'TOKEN_UNKNOWN',
  'FONT_MISSING',
  'RENDER_FAILED',
  'EXPORT_FAILED',
  'VERSION_MISMATCH',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export type ApiErrorBody = { code: ErrorCode; message: string; hint: string; retryable: boolean };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiErrorBody };

/** Error berkode AD-11. Dilempar lintas paket, dipetakan ke `{ok:false,error}` di tepi HTTP. */
export class LakarError extends Error {
  readonly code: ErrorCode;
  readonly hint: string;
  readonly retryable: boolean;
  constructor(code: ErrorCode, message: string, opts: { hint?: string; retryable?: boolean } = {}) {
    super(message);
    this.name = 'LakarError';
    this.code = code;
    this.hint = opts.hint ?? '';
    this.retryable = opts.retryable ?? false;
  }
  toBody(): ApiErrorBody {
    return { code: this.code, message: this.message, hint: this.hint, retryable: this.retryable };
  }
}

// ---------------------------------------------------------------------------
// Primitif
// ---------------------------------------------------------------------------

export const ID_PATTERN = /^[A-Za-z0-9]{8}$/;
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const Id = z.string().regex(ID_PATTERN, 'ID harus 8 karakter [A-Za-z0-9]');
export const Slug = z.string().regex(SLUG_PATTERN, `slug harus cocok ${SLUG_PATTERN.source}`);
export const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/, 'warna harus #RRGGBB atau #RRGGBBAA');
const Name = z.string().min(1);
const Px = z.number().finite();
const Size = z.number().finite().nonnegative();

export const Screen = z.enum(['landing', 'app', 'mobile']);
export const Layout = z.enum(['none', 'row', 'column']);
export const Align = z.enum(['start', 'center', 'end', 'stretch']);
export const Justify = z.enum(['start', 'center', 'end', 'space-between']);

export const XY_HINT = 'x/y hanya untuk board/node absolute (tambahkan position:"absolute" pada frame, atau hapus x/y)';

// ---------------------------------------------------------------------------
// Input node (yang dikirim snippet ke `add`): tanpa id, tanpa children.
// `.strict()` menolak kunci asing, termasuk x/y pada node flow.
// ---------------------------------------------------------------------------

const boardShape = {
  type: z.literal('board'),
  name: Name,
  x: Px,
  y: Px,
  width: Size,
  height: Size,
  screen: Screen,
};

const frameShape = {
  type: z.literal('frame'),
  name: Name,
  layout: Layout.optional(),
  gap: Px.optional(),
  padding: Size.optional(),
  align: Align.optional(),
  justify: Justify.optional(),
  width: Size.optional(),
  height: Size.optional(),
  position: z.literal('absolute').optional(),
  x: Px.optional(),
  y: Px.optional(),
};

const textShape = {
  type: z.literal('text'),
  name: Name,
  content: z.string(),
  size: z.number().finite().positive(),
  color: HexColor.optional(),
};

const xyOnlyWhenAbsolute = (v: { position?: 'absolute' | undefined; x?: number | undefined; y?: number | undefined }, ctx: z.RefinementCtx) => {
  if (v.position !== 'absolute' && (v.x !== undefined || v.y !== undefined)) {
    ctx.addIssue({ code: 'custom', message: XY_HINT, path: [v.x !== undefined ? 'x' : 'y'] });
  }
};

export const BoardInput = z.object(boardShape).strict();
export const FrameInput = z.object(frameShape).strict().superRefine(xyOnlyWhenAbsolute);
export const TextInput = z.object(textShape).strict();
export const NodeInput = z.discriminatedUnion('type', [BoardInput, FrameInput, TextInput]);
export type BoardInput = z.infer<typeof BoardInput>;
export type FrameInput = z.infer<typeof FrameInput>;
export type TextInput = z.infer<typeof TextInput>;
export type NodeInput = z.infer<typeof NodeInput>;

// ---------------------------------------------------------------------------
// Node tersimpan: input + id (+ children untuk kontainer).
// ---------------------------------------------------------------------------

export type TextNode = TextInput & { id: string };
export type FrameNode = FrameInput & { id: string; children: ChildNode[] };
export type ChildNode = FrameNode | TextNode;
export type BoardNode = BoardInput & { id: string; children: ChildNode[] };
export type AnyNode = BoardNode | ChildNode;

export const TextNode: z.ZodType<TextNode> = z.object({ ...textShape, id: Id }).strict();
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
export const ChildNode: z.ZodType<ChildNode> = z.union([FrameNode, TextNode]);
export const BoardNode: z.ZodType<BoardNode> = z
  .object({ ...boardShape, id: Id, children: z.array(ChildNode) })
  .strict();

export const Page = z.object({ id: Id, name: Name, children: z.array(BoardNode) }).strict();
export type Page = z.infer<typeof Page>;

export const LakarDocument = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: Id,
    rev: z.number().int().nonnegative(),
    pages: z.array(Page).min(1),
  })
  .strict();
export type LakarDocument = z.infer<typeof LakarDocument>;

export type HistoryEntry = {
  rev: number;
  sessionId: string;
  description: string;
  opsSummary: string;
  at: string;
};

export type CreatedEntry = { id: string; name: string; path: string };

/** Ringkas issue zod jadi satu baris + hint (dipakai core/daemon untuk SCHEMA_INVALID). */
export function zodToLakarError(err: z.ZodError, context: string): LakarError {
  const issues = err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  const xyIssue = err.issues.some(
    (i) =>
      i.message === XY_HINT ||
      (i.code === 'unrecognized_keys' && (i.keys.includes('x') || i.keys.includes('y'))),
  );
  return new LakarError('SCHEMA_INVALID', `${context}: ${issues.join('; ')}`, {
    hint: xyIssue ? XY_HINT : 'periksa properti node terhadap skema Lakar (board/frame/text)',
  });
}
