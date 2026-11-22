// Seleksi efemeral (AD-9): bentuk alamat node yang boleh dikirim viewer dan dibaca agen. Alamat = ID tersimpan
// (8 karakter `[A-Za-z0-9]`) atau alamat komposit AD-12 `<instanceId>/<masterNodeId>[/…]`. Tidak pernah disimpan.

/** Alamat node: ID, atau ID-ID dipisah `/` (alamat komposit AD-12). */
export const NODE_ADDRESS_PATTERN = /^[A-Za-z0-9]{8}(?:\/[A-Za-z0-9]{8})*$/;

/** Jumlah alamat maksimum dalam satu seleksi. */
export const SELECTION_MAX = 500;

/** `true` bila `v` berbentuk alamat node yang sah (keberadaan node tidak dicek). */
export function isNodeAddress(v: unknown): v is string {
  return typeof v === 'string' && NODE_ADDRESS_PATTERN.test(v);
}
