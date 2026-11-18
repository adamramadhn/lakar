import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LakarError } from '@lakar/schema';
import { IconCatalog, PACKAGE, SEARCH_MAX_LIMIT, editDistance, packageRoot } from './index.js';

const cat = IconCatalog.load();
const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as { dependencies: Record<string, string> };

/** Saran dari pesan ICON_UNKNOWN (`…; saran: a, b, c`). */
const suggestionsOf = (message: string) => /saran: ([a-z0-9_, -]+)/.exec(message)![1]!.split(', ');

function unknown(lib: string, icon: string): LakarError {
  try {
    cat.canonical(lib, icon);
  } catch (e) {
    return e as LakarError;
  }
  throw new Error(`${lib}/${icon} diharapkan tidak dikenal`);
}

describe('@lakar/icons', () => {
  it('mengekspor nama paket; singleton', () => {
    expect(PACKAGE).toBe('@lakar/icons');
    expect(IconCatalog.load()).toBe(cat);
  });

  it('versi = pin package.json, dibaca dari paket terpasang', () => {
    expect(cat.versions).toEqual({ lucide: '1.74.0', 'simple-icons': '16.38.0' });
    expect(manifest.dependencies['lucide-static']).toBe(cat.versions.lucide);
    expect(manifest.dependencies['simple-icons']).toBe(cat.versions['simple-icons']);
    expect(JSON.parse(readFileSync(join(packageRoot('simple-icons'), 'package.json'), 'utf8')).version).toBe('16.38.0');
  });

  it('data asli: 2089 lucide kanonik, 312 alias semua terpetakan, 3472 simple-icons', () => {
    expect(cat.count('lucide')).toBe(2089);
    const aliases = cat.aliases();
    expect(aliases.size).toBe(312);
    for (const [alias, target] of aliases) {
      expect(cat.canonical('lucide', target).icon, alias).toBe(target);
      expect(cat.canonical('lucide', alias).icon, alias).toBe(target);
    }
    expect(cat.count('simple-icons')).toBe(3472);
  });

  it('alias → kanonik + versi', () => {
    expect(cat.canonical('lucide', 'home')).toEqual({ icon: 'house', version: '1.74.0' });
    expect(cat.canonical('lucide', 'more-horizontal')).toEqual({ icon: 'ellipsis', version: '1.74.0' });
    expect(cat.canonical('lucide', 'search')).toEqual({ icon: 'search', version: '1.74.0' });
    expect(cat.canonical('simple-icons', 'github')).toEqual({ icon: 'github', version: '16.38.0' });
    expect(cat.canonical('simple-icons', 'hive_blockchain').icon).toBe('hive_blockchain');
  });

  it.each([
    ['lucide', 'hoem'],
    ['lucide', 'zzzqx'],
    ['lucide', 'github'],
    ['simple-icons', 'house'],
    ['simple-icons', 'githu'],
  ])('ICON_UNKNOWN %s/%s: tepat 3 saran kanonik berbeda dari pustaka yang sama + hint iconSearch', (lib, icon) => {
    const e = unknown(lib, icon);
    expect(e).toBeInstanceOf(LakarError);
    expect(e.code).toBe('ICON_UNKNOWN');
    const s = suggestionsOf(e.message);
    expect(s).toHaveLength(3);
    expect(new Set(s).size).toBe(3);
    for (const x of s) expect(cat.canonical(lib, x).icon, x).toBe(x);
    expect(e.hint).toMatch(/iconSearch\(/);
    expect(e.hint).toMatch(/icon_search/);
  });

  it('saran: hoem → house; salah pustaka → hint lib yang benar', () => {
    expect(suggestionsOf(unknown('lucide', 'hoem').message)).toContain('house');
    expect(suggestionsOf(unknown('simple-icons', 'githu').message)).toContain('github');
    expect(unknown('lucide', 'github').hint).toContain("lib:'simple-icons'");
    expect(unknown('simple-icons', 'house').hint).toContain("lib:'lucide'");
    expect(unknown('lucide', 'zzzqx').hint).not.toContain("lib:'");
  });

  it('nama tak dikenal 100k karakter → ICON_UNKNOWN cepat dengan 3 saran', () => {
    const t = performance.now();
    const e = unknown('lucide', 'a'.repeat(100_000));
    expect(performance.now() - t).toBeLessThan(500);
    expect(e.code).toBe('ICON_UNKNOWN');
    expect(suggestionsOf(e.message)).toHaveLength(3);
  });

  it('query hanya pemisah → SCHEMA_INVALID', () => {
    for (const q of ['-', ' _ ', ' - ']) expect(() => cat.search(q), q).toThrow(expect.objectContaining({ code: 'SCHEMA_INVALID' }));
  });

  it('lib tak dikenal → SCHEMA_INVALID', () => {
    expect(() => cat.canonical('phosphor', 'x')).toThrow(expect.objectContaining({ code: 'SCHEMA_INVALID' }));
  });

  it('search: skor nama persis > awalan > token > tag; dumbbell pertama; gym memuat dumbbell', () => {
    expect(cat.search('dumbbell')[0]).toMatchObject({ lib: 'lucide', icon: 'dumbbell' });
    expect(cat.search('gym').map((m) => m.icon)).toContain('dumbbell');
    const arrows = cat.search('arrow right');
    expect(arrows[0]).toMatchObject({ lib: 'lucide', icon: 'arrow-right' });
    expect(cat.search('home')[0]).toMatchObject({ lib: 'lucide', icon: 'home', aliasOf: 'house' });
    expect(cat.search('github', { lib: 'simple-icons' })[0]).toMatchObject({ lib: 'simple-icons', icon: 'github', title: 'GitHub' });
    expect(cat.search('github', { lib: 'simple-icons' }).every((m) => m.lib === 'simple-icons')).toBe(true);
  });

  it('search: default 10, maks 50, deterministik; input tidak valid → SCHEMA_INVALID', () => {
    expect(cat.search('arrow')).toHaveLength(10);
    expect(cat.search('arrow', { limit: SEARCH_MAX_LIMIT })).toHaveLength(50);
    expect(cat.search('arrow', { limit: 50 })).toEqual(cat.search('arrow', { limit: 50 }));
    for (const bad of [() => cat.search(''), () => cat.search('  '), () => cat.search('x', { limit: 0 }), () => cat.search('x', { limit: 51 }), () => cat.search('x', { limit: 1.5 }), () => cat.search('x', { lib: 'feather' as never })]) {
      expect(bad).toThrow(expect.objectContaining({ code: 'SCHEMA_INVALID' }));
    }
    expect(cat.search('qqqqzzzz')).toEqual([]);
  });

  it('glyph: lucide stroke dari icon-nodes; simple-icons fill + warna brand; alias diterima', () => {
    const house = cat.glyph('lucide', 'house')!;
    expect(house).toMatchObject({ lib: 'lucide', icon: 'house', kind: 'stroke', viewBox: [0, 0, 24, 24] });
    expect(house.nodes.length).toBeGreaterThan(0);
    expect(house.nodes[0]![0]).toBe('path');
    expect(cat.glyph('lucide', 'home')).toMatchObject({ icon: 'home', nodes: house.nodes });
    const gh = cat.glyph('simple-icons', 'github')!;
    expect(gh).toMatchObject({ kind: 'fill', brandColor: '#181717' });
    expect(gh.nodes[0]![1].d).toMatch(/^M12/);
    expect(cat.glyph('simple-icons', 'whatsapp')!.brandColor).toBe('#25D366');
    expect(cat.glyph('lucide', 'nope')).toBeUndefined();
    expect(cat.glyph('phosphor', 'house')).toBeUndefined();
    expect(cat.glyphs([{ lib: 'lucide', icon: 'star' }, { lib: 'lucide', icon: 'nope' }]).map((g) => g.icon)).toEqual(['star']);
  });

  it('editDistance: transposisi = 1', () => {
    expect(editDistance('hoem', 'home')).toBe(1);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });
});
