// Pemuat data pustaka ikon terpasang (AD-9): lucide-static dan simple-icons dibaca dari node_modules
// paket ini (versi dipin persis di package.json). Tidak ada data ikon yang ditulis tangan.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { IconGlyphNode } from '@lakar/schema';

const require = createRequire(import.meta.url);

/** Direktori root paket `name` (naik dari entry yang di-resolve sampai package.json bernama `name`). */
export function packageRoot(name: string): string {
  let dir = dirname(require.resolve(name));
  for (;;) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest) && (JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string }).name === name) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error(`root paket ${name} tidak ditemukan`);
    dir = up;
  }
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const versionOf = (root: string) => readJson<{ version: string }>(join(root, 'package.json')).version;

/** `arrow-down-01` → `ArrowDown01` (nama ekspor ESM lucide-static). */
export const pascal = (kebab: string): string =>
  kebab
    .split('-')
    .map((p) => (p ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join('');

export type LucideData = {
  version: string;
  /** Nama kanonik → elemen glyph (grid 24, stroke). */
  nodes: Record<string, IconGlyphNode[]>;
  /** Nama kanonik → tag. */
  tags: Record<string, string[]>;
  /** Alias (nama lama, mis. `home`) → nama kanonik (`house`). */
  aliases: Map<string, string>;
};

export function loadLucide(): LucideData {
  const root = packageRoot('lucide-static');
  const nodes = readJson<Record<string, IconGlyphNode[]>>(join(root, 'icon-nodes.json'));
  const tags = readJson<Record<string, string[]>>(join(root, 'tags.json'));
  // `export { default as Home, default as House } from './icons/house.mjs';` → ekspor Pascal → file kanonik.
  const mjs = readFileSync(join(root, 'dist', 'esm', 'lucide-static.mjs'), 'utf8');
  const byExport = new Map<string, string>();
  for (const m of mjs.matchAll(/export\s*\{([^}]*)\}\s*from\s*['"]\.\/icons\/([a-z0-9-]+)\.mjs['"]/g)) {
    for (const part of m[1]!.split(',')) {
      const name = /default\s+as\s+(\w+)/.exec(part)?.[1];
      if (name) byExport.set(name, m[2]!);
    }
  }
  // File SVG yang tidak ada di icon-nodes = alias; dipetakan lewat nama ekspor Pascal-nya.
  const aliases = new Map<string, string>();
  for (const f of readdirSync(join(root, 'icons'))) {
    if (!f.endsWith('.svg')) continue;
    const name = f.slice(0, -4);
    if (Object.hasOwn(nodes, name)) continue;
    const target = byExport.get(pascal(name));
    if (!target || !Object.hasOwn(nodes, target)) throw new Error(`alias lucide ${name} tidak terpetakan ke ikon kanonik`);
    aliases.set(name, target);
  }
  return { version: versionOf(root), nodes, tags, aliases };
}

export type SimpleIcon = { slug: string; title: string; hex: string; tags: string[] };

export type SimpleIconsData = {
  version: string;
  icons: Map<string, SimpleIcon>;
  /** Path SVG (dibaca malas, di-cache). */
  path(slug: string): string | undefined;
};

type RawSimpleIcon = {
  slug: string;
  title: string;
  hex: string;
  aliases?: { aka?: string[]; old?: string[]; dup?: { title: string }[]; loc?: Record<string, string> };
};

export function loadSimpleIcons(): SimpleIconsData {
  // Paket ini punya `exports` (package.json tidak bisa di-resolve langsung): root dicari dari entry.
  const root = packageRoot('simple-icons');
  const raw = readJson<RawSimpleIcon[]>(join(root, 'data', 'simple-icons.json'));
  const icons = new Map<string, SimpleIcon>();
  for (const r of raw) {
    const a = r.aliases ?? {};
    const tags = [...(a.aka ?? []), ...(a.old ?? []), ...(a.dup ?? []).map((x) => x.title), ...Object.values(a.loc ?? {})];
    icons.set(r.slug, { slug: r.slug, title: r.title, hex: r.hex.toUpperCase(), tags });
  }
  const paths = new Map<string, string>();
  return {
    version: versionOf(root),
    icons,
    path(slug) {
      if (!icons.has(slug)) return undefined;
      let d = paths.get(slug);
      if (d === undefined) {
        const svg = readFileSync(join(root, 'icons', `${slug}.svg`), 'utf8');
        d = /<path\b[^>]*\sd="([^"]+)"/.exec(svg)?.[1];
        if (d === undefined) throw new Error(`simple-icons ${slug}: path SVG tidak ditemukan`);
        paths.set(slug, d);
      }
      return d;
    },
  };
}
