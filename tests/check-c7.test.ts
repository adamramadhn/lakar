// Penjaga C7: teks check, temuan, hint, dan deskripsi MCP hanya memakai bahasa aturan produk.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const FORBIDDEN = /golden|juri|rubrik|Lampiran B|skor|pen\.dev|benchmark/i;

const files = [
  ...readdirSync(join(ROOT, 'packages/check/src'))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => join('packages/check/src', f)),
  'packages/schema/src/findings.ts',
  'packages/daemon/src/check.ts',
  'packages/mcp/src/server.ts',
];

describe('C7: bahasa aturan produk di check, temuan, dan deskripsi MCP', () => {
  it('daftar file tidak kosong', () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it.each(files)('%s tanpa istilah terlarang', (f) => {
    const text = readFileSync(join(ROOT, f), 'utf8');
    const hits = text.split('\n').flatMap((line, i) => (FORBIDDEN.test(line) ? [`${i + 1}: ${line.trim()}`] : []));
    expect(hits).toEqual([]);
  });
});
