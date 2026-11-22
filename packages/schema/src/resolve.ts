// Pipa resolusi dokumen (AD-10): satu-satunya pintu dari dokumen tersimpan ke dokumen ter-resolve.
import { attachInstanceIssues, expandInstances, instanceIssues } from './components.js';
import type { LakarDocument } from './nodes.js';
import { assertTokensKnown, resolveTokens, type ResolvedDocument } from './tokens.js';

export type ResolveDocumentOptions = {
  /** Paksa satu mode tema untuk semua board (harus ada di `tokenModes`). Lihat `resolveTokens`. */
  mode?: string;
};

/**
 * Resolusi dokumen tersimpan menjadi dokumen ter-resolve (AD-10). Urutan tahap:
 * 1. ekspansi instance (AD-12) lewat `expandInstances`: instance diurai menjadi salinan master beralamat komposit;
 *    referensi basi (override yatim dsb.) dilaporkan lewat `instanceIssues(hasil)`;
 * 2. resolve token untuk mode aktif (AD-11) lewat `resolveTokens`.
 * Sebelum tahap 1, ref token di seluruh dokumen tersimpan dicek (TOKEN_UNKNOWN), termasuk di override yatim.
 *
 * Render, check, daemon, dan canvas viewer wajib memakai fungsi ini. Konsumen tidak boleh menulis ulang atau
 * memanggil tahap mana pun sendiri-sendiri (dijaga `tests/resolve-document.test.ts`); tahap tetap diekspor
 * terpisah hanya untuk codegen (AD-10). Murni: input tidak dimutasi; error sama dengan tahap yang melemparnya.
 */
export function resolveDocument(doc: LakarDocument, opts: ResolveDocumentOptions = {}): ResolvedDocument {
  assertTokensKnown(doc);
  const expanded = expandInstances(doc);
  return attachInstanceIssues(resolveTokens(expanded, opts), instanceIssues(expanded));
}
