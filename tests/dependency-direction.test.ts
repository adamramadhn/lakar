import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  EDGES,
  allowedDeps,
  checkPackage,
  loadWorkspace,
  normalizeSpecifier,
  scanWorkspace,
  type PackageSource,
} from './dependency-direction.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

const pkg = (name: string, code: string, deps: Record<string, string> = {}): PackageSource => ({
  name,
  manifest: { dependencies: deps },
  files: { 'src/index.ts': code },
});

describe('arah dependensi: repo nyata', () => {
  const packages = loadWorkspace(root);

  it('menemukan 11 paket', () => {
    expect(packages.map((p) => p.name).sort()).toEqual(Object.keys(EDGES).sort());
    for (const p of packages) expect(Object.keys(p.files).length).toBeGreaterThan(0);
  });

  it('0 pelanggaran', () => {
    const violations = scanWorkspace(packages);
    const report = violations.map((v) => `${v.pkg} [${v.kind}] ${v.specifier} (${v.file})`).join('; ');
    expect(violations, `pelanggaran arah dependensi: ${report}`).toEqual([]);
  });
});

describe('arah dependensi: fixture pelanggaran', () => {
  it.each([
    ["import { readFile } from 'node:fs';", 'node:fs'],
    ["import { readFile } from 'fs';", 'fs'],
    ["const cp = require('child_process');", 'child_process'],
    ["const pw = await import('playwright-core');", 'playwright-core'],
    ["export * from 'node:fs/promises';", 'node:fs/promises'],
    ["import Fastify from 'fastify';", 'fastify'],
    ["import cors from '@fastify/cors';", '@fastify/cors'],
    ["import { Server } from '@modelcontextprotocol/sdk/server/index.js';", '@modelcontextprotocol/sdk/server/index.js'],
  ])('core: %s → io', (code, specifier) => {
    expect(checkPackage(pkg('core', code))).toEqual([
      { pkg: 'core', kind: 'io', specifier, file: 'src/index.ts' },
    ]);
  });

  it.each(['schema', 'ports', 'render'])('%s juga dilarang IO', (name) => {
    expect(checkPackage(pkg(name, "import 'node:path';"))).toMatchObject([{ pkg: name, kind: 'io' }]);
  });

  it("modul khusus-prefiks: 'sqlite' polos bukan IO, 'node:sqlite' IO", () => {
    expect(checkPackage(pkg('core', "import db from 'sqlite';"))).toEqual([]);
    expect(checkPackage(pkg('core', "import t from 'test';"))).toEqual([]);
    expect(checkPackage(pkg('core', "import { DatabaseSync } from 'node:sqlite';"))).toEqual([
      { pkg: 'core', kind: 'io', specifier: 'node:sqlite', file: 'src/index.ts' },
    ]);
  });

  it('import() dan require() dengan template literal terdeteksi', () => {
    expect(checkPackage(pkg('core', 'const fs = await import(`node:fs`);'))).toEqual([
      { pkg: 'core', kind: 'io', specifier: 'node:fs', file: 'src/index.ts' },
    ]);
    expect(checkPackage(pkg('render', 'const cp = require(`child_process`);'))).toMatchObject([
      { pkg: 'render', kind: 'io', specifier: 'child_process' },
    ]);
  });

  it('@types/node di manifest paket IO-terlarang → io', () => {
    const src: PackageSource = {
      name: 'schema',
      manifest: { devDependencies: { '@types/node': '26.6.6' } },
      files: { 'src/index.ts': '' },
    };
    expect(checkPackage(src)).toEqual([
      { pkg: 'schema', kind: 'io', specifier: '@types/node', file: 'package.json' },
    ]);
  });

  it('paket non-IO-terlarang (daemon) boleh builtin Node', () => {
    expect(checkPackage(pkg('daemon', "import { readFile } from 'node:fs';"))).toEqual([]);
  });

  it('mcp impor @lakar/core → direction', () => {
    expect(checkPackage(pkg('mcp', "import '@lakar/core';"))).toEqual([
      { pkg: 'mcp', kind: 'direction', specifier: '@lakar/core', file: 'src/index.ts' },
    ]);
  });

  it('mcp dengan dep @lakar/core di package.json → direction', () => {
    expect(checkPackage(pkg('mcp', '', { '@lakar/core': 'workspace:*' }))).toEqual([
      { pkg: 'mcp', kind: 'direction', specifier: '@lakar/core', file: 'package.json' },
    ]);
  });

  it('arah terbalik: schema impor @lakar/core → direction', () => {
    expect(checkPackage(pkg('schema', "import { x } from '@lakar/core';"))).toMatchObject([
      { pkg: 'schema', kind: 'direction', specifier: '@lakar/core' },
    ]);
  });

  it('render impor @lakar/icons → direction', () => {
    expect(checkPackage(pkg('render', "import type { Icon } from '@lakar/icons';"))).toMatchObject([
      { pkg: 'render', kind: 'direction', specifier: '@lakar/icons' },
    ]);
  });

  it('subpath @lakar/core/x dinormalisasi ke @lakar/core', () => {
    expect(normalizeSpecifier('@lakar/core/x')).toBe('@lakar/core');
    expect(normalizeSpecifier('node:fs/promises')).toBe('fs');
    expect(checkPackage(pkg('mcp', "import { y } from '@lakar/core/x';"))).toMatchObject([
      { pkg: 'mcp', kind: 'direction', specifier: '@lakar/core' },
    ]);
  });

  it('closure transitif diizinkan', () => {
    expect([...allowedDeps('daemon')].sort()).toEqual(
      ['check', 'core', 'exec', 'icons', 'ports', 'render', 'schema', 'skills'],
    );
    expect(checkPackage(pkg('exec', "import '@lakar/schema';"))).toEqual([]);
    expect(checkPackage(pkg('daemon', "import '@lakar/schema';"))).toEqual([]);
  });

  it('viewer boleh @lakar/render (pemetaan CSS tunggal AD-5), tetap dilarang core/exec/icons', () => {
    expect([...allowedDeps('viewer')].sort()).toEqual(['ports', 'render', 'schema']);
    expect(checkPackage(pkg('viewer', "import { colorCss } from '@lakar/render';"))).toEqual([]);
    for (const target of ['core', 'exec', 'icons']) {
      expect(checkPackage(pkg('viewer', `import { x } from '@lakar/${target}';`))).toMatchObject([
        { pkg: 'viewer', kind: 'direction', specifier: `@lakar/${target}` },
      ]);
    }
  });

  it('impor relatif dan pustaka non-IO tidak dilaporkan', () => {
    expect(checkPackage(pkg('core', "import { a } from './a.js';\nimport { z } from 'zod';"))).toEqual([]);
  });
});
