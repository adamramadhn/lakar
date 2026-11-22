// Model murni dialog Import CSS variables (epic kode story 5, desain 09 wvCMu/ngHGS). Parser CSS variables yang sama
// dengan `importCssVariables` execute (`parseCssVariables` @lakar/render, aturan spec-token-2) dipanggil dengan
// keadaan dokumen (token + tokenModes), lalu hasilnya menjadi baris pratinjau dan op route ops: `setTokenModes`
// (bila mode berubah) lalu satu `setTokens` berisi definisi bertipe → satu commit, satu rev, bisa di-undo (AD-7/AD-8).
import { cssVarName, parseCssVariables } from '@lakar/render';
import type { DocOp, LakarDocument } from '@lakar/schema';
import { modeLabel } from './themeModel.js';

/** Batas ukuran stylesheet (sama dengan `importCssVariables` di execute). */
export const CSS_IMPORT_MAX_CHARS = 256 * 1024;

export type ImportValue = { value: string | number; inherited: boolean };
export type ImportRow =
  | { status: 'new' | 'update'; variable: string; token: string; type: string; values: ImportValue[] }
  | { status: 'skipped'; variable: string; detail: string };

export type ImportPlan = {
  /** Kolom mode tabel (`tokenModes` sesudah impor); kosong = satu kolom "Value". */
  modes: string[];
  rows: ImportRow[];
  counts: { new: number; update: number; skipped: number };
  /** Selektor sumber → mode tujuan (baca-saja; `:root` = mode default). */
  selectors: { selector: string; mode: string; isDefault: boolean }[];
  /** Op satu commit; kosong bila tidak ada yang bisa diimpor. */
  ops: DocOp[];
  /** Label History. */
  label: string;
  /** Pesan untuk pengguna bila impor tidak bisa dilakukan (CSS kosong → tanpa pesan). */
  error?: string;
};

const EMPTY: ImportPlan = { modes: [], rows: [], counts: { new: 0, update: 0, skipped: 0 }, selectors: [], ops: [], label: '' };

/**
 * Selektor → mode untuk pratinjau, diturunkan dari hasil parser (bukan penafsiran CSS kedua): blok root = mode default,
 * `[data-theme="m"]` untuk setiap mode yang membawa nilai di entri hasil parse.
 */
function selectorsOf(entries: readonly { modes?: Readonly<Record<string, unknown>> }[], modes: readonly string[]): ImportPlan['selectors'] {
  if (!entries.length) return [];
  const def = modes[0] ?? 'light';
  const used = new Set(entries.flatMap((e) => Object.keys(e.modes ?? {})));
  return [
    { selector: ':root', mode: modeLabel(def), isDefault: true },
    ...modes.filter((m) => used.has(m)).map((m) => ({ selector: `[data-theme="${m}"]`, mode: modeLabel(m), isDefault: m === def })),
  ];
}

/** Rencana impor `css` ke `doc` (tanpa efek samping). */
export function importPlan(doc: LakarDocument, css: string): ImportPlan {
  if (!css.trim()) return EMPTY;
  if (css.length > CSS_IMPORT_MAX_CHARS) return { ...EMPTY, error: `Stylesheet is larger than ${CSS_IMPORT_MAX_CHARS / 1024} KB. Import it in parts.` };
  const parsed = parseCssVariables(css, { tokens: doc.tokens ?? {}, ...(doc.tokenModes ? { modes: doc.tokenModes } : {}) });
  const modes = [...(parsed.tokenModes ?? doc.tokenModes ?? [])];
  const rows: ImportRow[] = parsed.entries.map((e) => ({
    status: e.status,
    variable: e.variable,
    token: e.token,
    type: e.type,
    values: (modes.length ? modes : [undefined]).map((m, i) => {
      const own = m !== undefined && i > 0 ? e.modes?.[m] : undefined;
      return own !== undefined ? { value: own, inherited: false } : { value: e.value, inherited: i > 0 };
    }),
  }));
  for (const s of parsed.skipped) rows.push({ status: 'skipped', variable: s.source, detail: s.detail });
  const counts = {
    new: parsed.entries.filter((e) => e.status === 'new').length,
    update: parsed.entries.filter((e) => e.status === 'update').length,
    skipped: parsed.skipped.length,
  };
  const selectors = selectorsOf(parsed.entries, modes);
  if (!parsed.entries.length) return { ...EMPTY, rows, counts, selectors, modes, error: 'No CSS variables to import. Use custom properties (--name) in :root or [data-theme] blocks.' };
  const ops: DocOp[] = [];
  if (parsed.tokenModes) ops.push({ op: 'setTokenModes', modes: parsed.tokenModes });
  ops.push({ op: 'setTokens', tokens: Object.fromEntries(parsed.entries.map((e) => [e.token, { type: e.type, value: e.value, ...(e.modes ? { modes: e.modes } : {}) }])) });
  const n = parsed.entries.length;
  return { modes, rows, counts, selectors, ops, label: `Import ${n} ${n === 1 ? 'token' : 'tokens'} from CSS` };
}

/** Hint popover Copy tokens: `<token pertama> → --<variabel>`. */
export function tokenVarHint(doc: LakarDocument): string {
  const first = Object.keys(doc.tokens ?? {})[0];
  return first ? `${first} → ${cssVarName(first)}` : '';
}
