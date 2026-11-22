// Penjaga arah dependensi spine Lakar (hexagonal). Pemindai murni berbasis regex:
// gerbang kasar, bukan parser penuh. Aturan didefinisikan sekali di file ini.
import { builtinModules } from 'node:module';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Edge langsung dari diagram spine. Yang diizinkan = closure transitifnya. */
export const EDGES: Readonly<Record<string, readonly string[]>> = {
  schema: [],
  ports: [],
  skills: [],
  core: ['schema'],
  render: ['schema', 'ports'],
  check: ['schema', 'ports'],
  exec: ['core', 'ports'],
  icons: ['schema'],
  daemon: ['core', 'exec', 'render', 'check', 'icons', 'skills'],
  mcp: ['schema'],
  bench: ['schema'],
  viewer: ['schema', 'render'],
};

/** Paket yang tidak boleh menyentuh IO (builtin Node atau pustaka IO). */
export const IO_FORBIDDEN: ReadonlySet<string> = new Set(['schema', 'ports', 'core', 'render']);

/** Pustaka IO terlarang; entri berakhiran `/*` berarti seluruh scope. */
export const IO_LIBRARIES: readonly string[] = [
  'playwright-core',
  'fastify',
  '@fastify/*',
  '@modelcontextprotocol/*',
  '@types/node',
];

const SCOPE = '@lakar/';
// Hanya entri tanpa prefiks: modul khusus-prefiks (`node:sqlite`, `node:test`) tidak boleh menjadikan
// nama npm polos (`sqlite`, `test`) dianggap builtin. Specifier `node:*` ditangani di isIo.
const BUILTINS = new Set(builtinModules.filter((m) => !m.startsWith('node:')).map((m) => m.split('/')[0]!));

export type Violation = { pkg: string; kind: 'direction' | 'io'; specifier: string; file: string };

export type PackageSource = {
  name: string;
  /** Isi package.json (sudah di-parse). */
  manifest: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
  /** path relatif → isi file .ts */
  files: Record<string, string>;
};

export function allowedDeps(pkg: string): Set<string> {
  const seen = new Set<string>();
  const stack = [...(EDGES[pkg] ?? [])];
  while (stack.length) {
    const d = stack.pop()!;
    if (seen.has(d)) continue;
    seen.add(d);
    stack.push(...(EDGES[d] ?? []));
  }
  return seen;
}

/** Normalisasi: `node:fs/promises` → `fs`, `@lakar/core/x` → `@lakar/core`, `a/b` → `a`. */
export function normalizeSpecifier(spec: string): string {
  if (spec.startsWith('node:')) return spec.slice(5).split('/')[0]!;
  if (spec.startsWith('@')) return spec.split('/').slice(0, 2).join('/');
  return spec.split('/')[0]!;
}

const SPEC_PATTERNS = [
  /\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, // import x from '..', export * from '..'
  /\bimport\s*['"]([^'"]+)['"]/g, // import '..'
  /\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g, // import('..')
  /\brequire\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g, // require('..')
];

export function extractSpecifiers(source: string): string[] {
  const out: string[] = [];
  for (const re of SPEC_PATTERNS) for (const m of source.matchAll(re)) out.push(m[1]!);
  return out;
}

function isIo(raw: string): boolean {
  if (raw.startsWith('node:')) return true;
  const norm = normalizeSpecifier(raw);
  if (BUILTINS.has(norm)) return true;
  return IO_LIBRARIES.some((lib) => (lib.endsWith('/*') ? norm.startsWith(lib.slice(0, -1)) : norm === lib));
}

export function checkPackage(src: PackageSource): Violation[] {
  const { name: pkg } = src;
  const allowed = allowedDeps(pkg);
  const out: Violation[] = [];
  const checkDirection = (raw: string, file: string) => {
    const norm = normalizeSpecifier(raw);
    if (!norm.startsWith(SCOPE)) return;
    const target = norm.slice(SCOPE.length);
    if (target !== pkg && !allowed.has(target)) out.push({ pkg, kind: 'direction', specifier: norm, file });
  };
  const m = src.manifest;
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const) {
    for (const dep of Object.keys(m[field] ?? {})) {
      checkDirection(dep, 'package.json');
      if (IO_FORBIDDEN.has(pkg) && isIo(dep)) out.push({ pkg, kind: 'io', specifier: dep, file: 'package.json' });
    }
  }
  for (const [file, text] of Object.entries(src.files)) {
    for (const raw of extractSpecifiers(text)) {
      if (raw.startsWith('.') || raw.startsWith('/')) continue;
      checkDirection(raw, file);
      if (IO_FORBIDDEN.has(pkg) && isIo(raw)) out.push({ pkg, kind: 'io', specifier: raw, file });
    }
  }
  return out;
}

function walkTs(dir: string, base: string, acc: Record<string, string>): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walkTs(p, base, acc);
    else if (/\.(?:m|c)?tsx?$/.test(entry)) acc[p.slice(base.length + 1)] = readFileSync(p, 'utf8');
  }
}

/** Baca semua paket workspace (`packages/*` + `bench`) dari disk. */
export function loadWorkspace(root: string): PackageSource[] {
  const dirs = [
    ...readdirSync(join(root, 'packages')).map((d) => join(root, 'packages', d)),
    join(root, 'bench'),
  ].filter((d) => existsSync(join(d, 'package.json')));
  return dirs.map((dir) => {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const name = String(manifest.name).replace(SCOPE, '');
    const files: Record<string, string> = {};
    walkTs(join(dir, 'src'), dir, files);
    return { name, manifest, files };
  });
}

export function scanWorkspace(packages: PackageSource[]): Violation[] {
  const out: Violation[] = [];
  for (const p of packages) {
    if (!(p.name in EDGES)) {
      out.push({ pkg: p.name, kind: 'direction', specifier: `@lakar/${p.name} (paket tidak dikenal di EDGES)`, file: 'package.json' });
      continue;
    }
    out.push(...checkPackage(p));
  }
  return out;
}
