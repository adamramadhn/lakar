// Skema dokumen Lakar v1 (AD-2, AD-11, AD-15, AD-16). Satu sumber kebenaran; tanpa IO.
import { z } from 'zod';
import { LakarDocument, NodeInput } from './nodes.js';

export const PACKAGE = '@lakar/schema';

export * from './content-rules.js';
export * from './contrast-rules.js';
export * from './design-tokens.js';
export * from './errors.js';
export * from './findings.js';
export * from './glyphs.js';
export * from './icons.js';
export * from './nodes.js';
export * from './tokens.js';
export * from './version.js';

/** JSON Schema (draft 2020-12) yang dihasilkan dari zod — bukan ditulis tangan (AD-2). */
export function jsonSchemas(): { document: Record<string, unknown>; node: Record<string, unknown> } {
  return {
    document: z.toJSONSchema(LakarDocument) as Record<string, unknown>,
    node: z.toJSONSchema(NodeInput) as Record<string, unknown>,
  };
}
