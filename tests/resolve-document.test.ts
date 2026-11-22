// Penjaga pipa resolusi (spine model-dokumen AD-10): kode produksi di luar `packages/schema` tidak boleh memanggil
// tahap `resolveTokens` atau `expandInstances` sendiri; semua konsumen lewat `resolveDocument`. File tes dan
// `packages/render/test` dikecualikan.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Pemanggilan atau impor tahap `resolveTokens`/`expandInstances` (termasuk alias `resolveTokens as x`). */
const CALL = /\b(?:resolveTokens|expandInstances)\s*\(/;
const IMPORT = /\bimport\b[^;]*?\{[^}]*\b(?:resolveTokens|expandInstances)\b[^}]*\}[^;]*?from\b/s;

/** True bila sumber memakai tahap `resolveTokens` langsung. */
export function usesResolveTokens(text: string): boolean {
  return CALL.test(text) || IMPORT.test(text);
}

const SOURCE = /\.(?:m|c)?tsx?$/;
const TEST = /\.test\.(?:m|c)?tsx?$/;

/** File sumber produksi `packages/<p>/src/**` (non-tes) di luar `packages/schema`, path relatif root (pakai `/`). */
export function productionSources(repoRoot: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (SOURCE.test(entry) && !TEST.test(entry) && !entry.endsWith('.d.ts')) out.push(relative(repoRoot, p).split(sep).join('/'));
    }
  };
  const pkgs = join(repoRoot, 'packages');
  for (const name of readdirSync(pkgs)) {
    if (name === 'schema') continue;
    const src = join(pkgs, name, 'src');
    if (existsSync(src)) walk(src);
  }
  return out.sort();
}

/** Path file (dari `files`) yang memakai `resolveTokens` langsung. */
export function violations(files: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(([, text]) => usesResolveTokens(text))
    .map(([path]) => path);
}

describe('pipa resolveDocument: repo nyata', () => {
  const files = productionSources(root);

  it('memindai kode produksi daemon, core, dan render', () => {
    expect(files).toContain('packages/daemon/src/server.ts');
    expect(files).toContain('packages/daemon/src/export.ts');
    expect(files).toContain('packages/core/src/transaction.ts');
    expect(files).toContain('packages/render/src/index.ts');
    expect(files.some((f) => f.startsWith('packages/schema/'))).toBe(false);
    expect(files.some((f) => TEST.test(f))).toBe(false);
  });

  it('tidak ada kode produksi di luar packages/schema yang memanggil resolveTokens', () => {
    // Pengecualian AD-10: codegen menerima dokumen tersimpan dan boleh memanggil `expandInstances` saja.
    const map = Object.fromEntries(files.filter((f) => !f.startsWith('packages/codegen/')).map((f) => [f, readFileSync(join(root, f), 'utf8')]));
    const bad = violations(map);
    expect(bad, `pakai resolveDocument (AD-10), bukan resolveTokens/expandInstances, di: ${bad.join(', ')}`).toEqual([]);
  });
});

describe('pipa resolveDocument: codegen (AD-10)', () => {
  it('codegen boleh expandInstances tetapi tidak resolveTokens', () => {
    const files = productionSources(root).filter((f) => f.startsWith('packages/codegen/'));
    expect(files).toContain('packages/codegen/src/tree.ts');
    for (const f of files) {
      const text = readFileSync(join(root, f), 'utf8');
      expect(/\bresolveTokens\b/.test(text), `${f} memakai resolveTokens`).toBe(false);
    }
  });
});

describe('pipa resolveDocument: fixture pelanggaran', () => {
  it('pemanggilan resolveTokens( terdeteksi dan path file disebut', () => {
    const files = {
      'packages/daemon/src/contoh.ts': "import { resolveDocument } from '@lakar/schema';\nconst d = resolveTokens(stored);\n",
      'packages/core/src/bersih.ts': "import { resolveDocument } from '@lakar/schema';\nconst d = resolveDocument(stored);\n",
    };
    expect(violations(files)).toEqual(['packages/daemon/src/contoh.ts']);
  });

  it.each([
    ['panggilan dengan spasi', 'const d = resolveTokens (doc, { mode });'],
    ['impor bernama', "import { LakarError, resolveTokens } from '@lakar/schema';"],
    ['impor dengan alias', "import {\n  resolveTokens as rt,\n} from '@lakar/schema';"],
    ['panggilan tahap ekspansi', 'const e = expandInstances(doc);'],
    ['impor tahap ekspansi', "import { expandInstances } from '@lakar/schema';"],
  ])('%s → terdeteksi', (_name, code) => {
    expect(usesResolveTokens(code)).toBe(true);
  });

  it.each([
    ['resolveDocument', 'const d = resolveDocument(doc);'],
    ['tipe ResolveTokensOptions', "import type { ResolveTokensOptions } from '@lakar/schema';"],
    ['nama di komentar tanpa panggilan', '// tahap `resolveTokens` dipanggil di dalam resolveDocument'],
  ])('%s → tidak terdeteksi', (_name, code) => {
    expect(usesResolveTokens(code)).toBe(false);
  });
});
