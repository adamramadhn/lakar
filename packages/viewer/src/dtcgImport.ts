// Model murni dialog Import DTCG tokens (epic adopsi-open-pencil story 9, desain Section 11). Parser JSON W3C DTCG
// yang sama dengan `importDtcgTokens` execute (`parseDtcgTokens` @lakar/codegen) dipanggil dengan keadaan dokumen
// (token + tokenModes), lalu hasilnya menjadi baris pratinjau dan op route ops: `setTokenModes` (bila mode berubah)
// lalu satu `setTokens` berisi definisi bertipe → satu commit, satu rev, bisa di-undo (AD-7/AD-8).
import { LakarError, errorMessage, type DocOp, type LakarDocument } from '@lakar/schema';
import { parseDtcgTokens } from '@lakar/codegen';
import type { ImportValue } from './cssImport.js';

/** Batas ukuran file JSON (sama dengan `importDtcgTokens` di execute). */
export const DTCG_IMPORT_MAX_CHARS = 256 * 1024;

export type DtcgImportRow =
  | { status: 'new' | 'update'; path: string; token: string; type: string; alias?: string; values: ImportValue[] }
  | { status: 'unsupported'; path: string; detail: string };

export type DtcgImportPlan = {
  /** Kolom mode tabel (`tokenModes` sesudah impor); kosong = satu kolom "Value". */
  modes: string[];
  rows: DtcgImportRow[];
  counts: { new: number; update: number; skipped: number };
  /** Op satu commit; kosong bila tidak ada yang bisa diimpor. */
  ops: DocOp[];
  /** Label History. */
  label: string;
  /** Pesan untuk pengguna bila impor tidak bisa dilakukan (input kosong → tanpa pesan). */
  error?: string;
};

const EMPTY: DtcgImportPlan = { modes: [], rows: [], counts: { new: 0, update: 0, skipped: 0 }, ops: [], label: '' };

/** Rencana impor `json` (isi file DTCG) ke `doc` (tanpa efek samping). */
export function dtcgImportPlan(doc: LakarDocument, json: string): DtcgImportPlan {
  if (!json.trim()) return EMPTY;
  if (json.length > DTCG_IMPORT_MAX_CHARS) return { ...EMPTY, error: `File is larger than ${DTCG_IMPORT_MAX_CHARS / 1024} KB. Import it in parts.` };
  let parsed: ReturnType<typeof parseDtcgTokens>;
  try {
    parsed = parseDtcgTokens(json, { tokens: doc.tokens ?? {}, ...(doc.tokenModes ? { modes: doc.tokenModes } : {}) });
  } catch (e) {
    return { ...EMPTY, error: e instanceof LakarError ? e.message : `Could not parse the DTCG file: ${errorMessage(e)}` };
  }
  const modes = [...(parsed.tokenModes ?? doc.tokenModes ?? [])];
  const rows: DtcgImportRow[] = parsed.entries.map((e) => ({
    status: e.status,
    path: e.path,
    token: e.token,
    type: e.type,
    ...(e.alias ? { alias: e.alias } : {}),
    // Nilai efektif per kolom = modes[m] ?? value (semantik Lakar); kolom tanpa mode sendiri = mewarisi `value`.
    values: (modes.length ? modes : [undefined]).map((m, i) => {
      const own = m !== undefined ? e.modes?.[m] : undefined;
      return own !== undefined ? { value: own, inherited: false } : { value: e.value, inherited: i > 0 };
    }),
  }));
  for (const s of parsed.skipped) rows.push({ status: 'unsupported', path: s.source, detail: s.detail });
  const counts = {
    new: parsed.entries.filter((e) => e.status === 'new').length,
    update: parsed.entries.filter((e) => e.status === 'update').length,
    skipped: parsed.skipped.length,
  };
  if (!parsed.entries.length) {
    return { ...EMPTY, modes, rows, counts, error: 'No DTCG tokens to import. Tokens need a $value inside groups whose names form the token path.' };
  }
  const ops: DocOp[] = [];
  if (parsed.tokenModes) ops.push({ op: 'setTokenModes', modes: parsed.tokenModes });
  ops.push({ op: 'setTokens', tokens: Object.fromEntries(parsed.entries.map((e) => [e.token, { type: e.type, value: e.value, ...(e.modes ? { modes: e.modes } : {}) }])) });
  const n = parsed.entries.length;
  return { modes, rows, counts, ops, label: `Import ${n} ${n === 1 ? 'token' : 'tokens'} from DTCG` };
}
