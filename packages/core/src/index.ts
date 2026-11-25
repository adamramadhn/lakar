// Inti dokumen Lakar: allocator ID, transaksi operasi, kunci per dokumen, migrasi (AD-2, AD-3, AD-4). Tanpa IO.
import { SCHEMA_VERSION, type LakarDocument as Doc } from '@lakar/schema';
import { IdAllocator, type RandomSource } from './ids.js';

export const PACKAGE = '@lakar/core';

export { IdAllocator, collectIds, type RandomSource } from './ids.js';
export { DocumentLocks } from './locks.js';
export { isPlainObject } from './object.js';
export { applyOps, recordOps, type ApplyOpsResult } from './ops.js';
export { MIGRATIONS, migrateDocument, parseDocument, type MigrateOptions, type Migration, type MigrationRegistry, type RawDocument } from './migrate.js';
export { inferTokenType, inferTokens, tokenTypeOfValue, type InferredTokens } from './tokens-infer.js';
export {
  beginTransaction,
  transact,
  type CommitResult,
  type OpKind,
  type TransactOptions,
  type Transaction,
  type TransactionOptions,
} from './transaction.js';

/** Dokumen kosong: satu halaman, rev 0. */
export function createDocument(random?: RandomSource): Doc {
  const ids = new IdAllocator([], random);
  return { schemaVersion: SCHEMA_VERSION, id: ids.next(), rev: 0, tokens: {}, pages: [{ id: ids.next(), name: 'Page 1', children: [] }] };
}
