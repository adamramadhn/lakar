// Isi skill (`packages/skills/skills/*.md`): batas token, api.md mutakhir terhadap api.ts (AD-12), nama ikon
// di icons.md ada di katalog terpasang, klaim weight font sesuai registry, dan struktur blok kode.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderApiMarkdown } from '../packages/exec/src/api-md.ts';
import { IconCatalog } from '../packages/icons/src/index.ts';
import { FontRegistry } from '../packages/daemon/src/fonts.ts';
import { DOMAIN_SKILLS, OPTIONAL_SKILLS, SCREEN_SKILLS, SKILL_NAMES, SKILLS_DIR, estimateTokens, splitCode } from '../packages/skills/src/index.ts';
import { testLog } from './support/log.ts';

const read = (name: string) => readFileSync(join(SKILLS_DIR, `${name}.md`), 'utf8');
const REGEN = 'regenerasi: /opt/node-26/bin/pnpm build && /opt/node-26/bin/node scripts/gen-skill-api.mjs';

/**
 * Batas token (DESIGN.md §Turunan): core total; delapan domain total (ui juga prosa: memuat contoh); landing/mobile/webapp
 * prosa + total. Total muat per jenis layar (core + 8 domain + 1 jenis layar) ≤ LOAD_LIMIT; lewat batas → padatkan.
 * selection (dibaca hanya saat kerja dari seleksi, di luar muat per layar): spec-agen-4-variant-flow.
 * break-ui dan variants (opsional, di luar muat per layar): spec-design-skills-emil.
 */
const LIMITS = {
  core: { total: 2600 },
  layout: { total: 600 },
  typography: { total: 400 },
  color: { total: 550 },
  accessibility: { total: 400 },
  ui: { prose: 800, total: 1200 },
  interface: { total: 550 },
  writing: { total: 450 },
  review: { total: 550 },
  landing: { prose: 1100, total: 3200 },
  mobile: { prose: 1100, total: 3000 },
  webapp: { prose: 1000, total: 3000 },
  selection: { prose: 1200, total: 2600 },
  'break-ui': { total: 1800 },
  variants: { total: 1000 },
} as const;
/** Iterasi 6 story 2.16: 11.500 → 9.600 (biaya berpikir agen); turun saja, jangan naik. */
const LOAD_LIMIT = 9_600;

describe('skill: batas token (estimateTokens = karakter / 3.2)', () => {
  it.each(Object.entries(LIMITS))('%s', (name, lim) => {
    const md = read(name);
    const total = estimateTokens(md);
    const prose = estimateTokens(splitCode(md).prose);
    testLog(`[skills] ${name}.md: total ${total} token, prosa ${prose} token`);
    expect(total, `${name}.md total ${total} > ${lim.total}`).toBeLessThanOrEqual(lim.total);
    if ('prose' in lim) expect(prose, `${name}.md prosa ${prose} > ${lim.prose}`).toBeLessThanOrEqual(lim.prose);
  });

  it('setiap skill domain, jenis layar, selection, dan skill opsional punya batas', () => {
    expect(Object.keys(LIMITS).sort()).toEqual(['core', ...DOMAIN_SKILLS, ...SCREEN_SKILLS, 'selection', ...OPTIONAL_SKILLS].sort());
  });

  it('skill opsional di luar muat per jenis layar, berjudul "# Lakar: <nama>"', () => {
    for (const n of OPTIONAL_SKILLS) {
      expect([...DOMAIN_SKILLS, ...SCREEN_SKILLS, 'core'], n).not.toContain(n);
      expect(read(n).split(/\r?\n/)[0], n).toBe(`# Lakar: ${n}`);
    }
  });

  it.each(SCREEN_SKILLS)(`muat %s: core + 8 domain + skill jenis layar ≤ ${LOAD_LIMIT}`, (screen) => {
    const names = ['core', ...DOMAIN_SKILLS, screen];
    const total = names.reduce((a, n) => a + estimateTokens(read(n)), 0);
    testLog(`[skills] muat ${screen}: ${total} token (${names.join(' + ')})`);
    expect(total, `muat ${screen} ${total} > ${LOAD_LIMIT}`).toBeLessThanOrEqual(LOAD_LIMIT);
  });

  it('daftar skill: 17 nama, tanpa polish; domain berjudul "# Lakar: <nama>"', () => {
    expect(SKILL_NAMES).toHaveLength(17);
    expect(SKILL_NAMES).not.toContain('polish');
    for (const n of DOMAIN_SKILLS) expect(read(n).split('\n')[0], n).toBe(`# Lakar: ${n}`);
  });
});

describe('skill: api.md dihasilkan dari api.ts', () => {
  it('api.md sama persis dengan renderApiMarkdown()', () => {
    expect(read('api') === renderApiMarkdown(), `api.md basi; ${REGEN}`).toBe(true);
  });
  it('urut relevansi (bukan istilah lama)', () => {
    expect(read('api')).toMatch(/urut relevansi/i);
  });
});

describe('skill: struktur', () => {
  it.each(SKILL_NAMES)('%s.md diawali judul, semua blok berpagar js atau text', (name) => {
    const md = read(name);
    expect(md.startsWith('# ')).toBe(true);
    const { blocks } = splitCode(md);
    for (const b of blocks) expect(['js', 'text'], `${name}.md blok berbahasa "${b.lang}"`).toContain(b.lang);
    expect((md.match(/^```/gm) ?? []).length).toBe(blocks.length * 2);
  });

  it('core.md punya tepat satu blok prelude (baris pertama // prelude); blok // pakai prelude ada di landing, mobile, dan webapp', () => {
    expect(splitCode(read('core')).blocks.filter((b) => b.code.startsWith('// prelude'))).toHaveLength(1);
    for (const name of ['landing', 'mobile', 'webapp']) expect(splitCode(read(name)).blocks.some((b) => b.code.startsWith('// pakai prelude')), name).toBe(true);
  });

  it('bangun bertahap (spec-progressive-live-build): landing satu execute per seksi, board mulai setinggi hero lalu tumbuh', () => {
    expect(read('core')).toContain('Bangun bertahap (canvas tumbuh live): satu execute per seksi/area');
    expect(read('landing')).toContain('Satu seksi per execute');
    const [first, second] = splitCode(read('landing')).blocks.filter((b) => b.lang === 'js');
    // Board pertama: ruang place() untuk tumbuh, tetapi tinggi awal setinggi navbar + hero (bukan 2000–6000 kosong).
    const height = Number(first!.code.match(/type:'board'[^\n]*?height:(\d+)/)?.[1]);
    expect(height).toBeLessThanOrEqual(1200);
    expect(first!.code).toMatch(/name:'\[WIP\] /);
    // Execute seksi berikutnya meninggikan board lebih dulu (isi baru tidak terpotong board).
    expect(second!.code.split('\n')[1]).toMatch(/^update\(keep\.board,\{height:/);
    // Webapp: execute 1 sidebar + header, execute 2 isi area kerja lewat keep.main.
    expect(splitCode(read('webapp')).blocks.filter((b) => b.lang === 'js').map((b) => /keep\.main/.test(b.code))).toEqual([true, true]);
  });

  it('klaim weight font di core.md sesuai registry font terpasang', () => {
    const line = read('core')
      .split('\n')
      .find((l) => l.startsWith('Font terpasang'));
    expect(line).toBeDefined();
    const claims = [...line!.matchAll(/([A-Z][A-Za-z ]+?) (\d{3})–(\d{3})/g)].map((m) => ({ family: m[1]!.trim(), lo: Number(m[2]), hi: Number(m[3]) }));
    const reg = FontRegistry.load();
    expect(claims.map((c) => c.family).sort()).toEqual(reg.families().sort());
    for (const c of claims) {
      const w = reg.entry(c.family)!.weights;
      expect([Math.min(...w), Math.max(...w)], c.family).toEqual([c.lo, c.hi]);
    }
  });
});

describe('skill: nama ikon di icons.md ada di katalog terpasang', () => {
  const cat = IconCatalog.load();
  const md = read('icons');
  const section = (head: string) => {
    const i = md.indexOf(head);
    expect(i, head).toBeGreaterThanOrEqual(0);
    const j = md.indexOf('\n## ', i + 1);
    return md.slice(i, j < 0 ? undefined : j);
  };
  const codes = (s: string) => [...s.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]!);

  it('tabel konsep → lucide: ≥ 80 baris, semua nama kanonik', () => {
    const rows = section('## Konsep').split('\n').filter((l) => /^\| [^-|][^|]* \| `/.test(l));
    expect(rows.length).toBeGreaterThanOrEqual(80);
    const bad = rows.map((r) => codes(r.split('|')[2]!)[0]!).filter((n) => cat.resolve('lucide', n) !== n);
    expect(bad).toEqual([]);
  });

  it('alias lama → kanonik sesuai katalog', () => {
    const rows = section('## Alias').split('\n').filter((l) => l.startsWith('| `'));
    expect(rows.length).toBeGreaterThanOrEqual(10);
    for (const r of rows) {
      const [, aliases, canon] = r.split('|');
      const target = codes(canon!)[0]!;
      expect(cat.resolve('lucide', target), target).toBe(target);
      for (const a of codes(aliases!)) expect(cat.resolve('lucide', a), a).toBe(target);
    }
  });

  it('logo brand simple-icons ada', () => {
    const names = codes(section('## Logo brand').split('\n').find((l) => l.startsWith('`'))!);
    expect(names.length).toBeGreaterThanOrEqual(10);
    expect(names.filter((n) => cat.resolve('simple-icons', n) !== n)).toEqual([]);
  });
});
