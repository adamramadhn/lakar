// Isi skill (`packages/skills/skills/*.md`): batas token, api.md mutakhir terhadap api.ts (AD-12), nama ikon
// di icons.md ada di katalog terpasang, klaim weight font sesuai registry, dan struktur blok kode.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderApiMarkdown } from '../packages/exec/src/api-md.ts';
import { HELPER_GLOBALS } from '../packages/exec/src/helpers.ts';
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

describe('skill: review memakai visual_diff (spec-agent-visual-diff)', () => {
  it('langkah execute perbaikan diikuti visual_diff; tetap dalam batas review', () => {
    const step = read('review').split(/\r?\n/).find((l) => l.startsWith('3. '))!;
    expect(step).toContain('`visual_diff`');
    expect(estimateTokens(read('review'))).toBeLessThanOrEqual(LIMITS.review.total);
  });
});

describe('skill: aturan pakai ulang komponen dan verifikasi layout (story 8.4, epic-adopsi-open-pencil)', () => {
  it.each([
    ['core', /pakai master yang ada[^\n]*jangan bangun ulang; isi lewat `props`[^\n]*override hanya tanpa prop/],
    ['selection', /ubah lewat `props` instance bila ada prop terikat[^\n]*override, hanya untuk properti tanpa prop/],
    ['layout', /`space-between`\/anak `fill` membagi sisa ruang; wadah hug tanpa sisa/],
    ['layout', /Rantai `fill`: tiap wadah perantara juga `fill`/],
    ['layout', /jangan tinggi tebakan, `clip`, atau saudara absolut manual/],
    ['review', /^4\. Sesudah `themeMode` board diganti[^\n]*cek geometri[^\n]*bukan hanya warna/m],
    ['break-ui', /^6\. Mode tema:[^\n]*salinan \(Alur 2\) per mode lain[^\n]*cek geometri, bukan hanya warna/m],
    ['break-ui', /^7\. Master:[^\n]*`props` instance[^\n]*cek ulang setiap board pemakainya/m],
  ] as const)('%s: %s', (name, rule) => {
    expect(read(name)).toMatch(rule);
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

  it('prelude bawaan sandbox (spec-skeleton-live-build): core.md satu blok // prelude (palet lewat keep), semua helper terdokumentasi, contoh tidak menulis ulang prelude', () => {
    const core = read('core');
    const preludes = splitCode(core).blocks.filter((b) => b.code.startsWith('// prelude'));
    expect(preludes).toHaveLength(1);
    expect(preludes[0]!.code).toMatch(/^Palette\(\{/m);
    // Palet ditulis utuh lewat Palette (dari nilai bawaan), tidak ditumpuk di atas palet sebelumnya.
    for (const name of SKILL_NAMES) for (const b of splitCode(read(name)).blocks) expect(b.code, `${name}.md`).not.toMatch(/Object\.assign\((C|FONT),/);
    expect(core).toContain('jangan ditulis ulang');
    for (const name of HELPER_GLOBALS) expect(core, name).toMatch(new RegExp(`(^|[^A-Za-z])${name}[ (]`, 'm'));
    for (const name of SKILL_NAMES) {
      for (const b of splitCode(read(name)).blocks) {
        expect(b.code, `${name}.md`).not.toMatch(/^\/\/ pakai prelude|^const (C|FONT|T|F|Row|Btn|Badge)=/m);
      }
    }
  });

  it('review: fix_check untuk fix aman check sebelum execute perbaikan (spec-check-autofix)', () => {
    expect(read('review')).toMatch(/`fix_check` \(fix aman `check`\), lalu satu execute perbaikan/);
  });

  it('bangun bertahap: skeleton dulu lalu satu blok per execute (spec-skeleton-live-build); board hug tumbuh sendiri (spec-board-hug-height)', () => {
    expect(read('core')).toContain('execute 1 = board + semua seksi/area rencana sebagai `Skel`');
    expect(read('core')).toContain('satu blok per execute');
    expect(read('landing')).toContain('Execute 1 = skeleton');
    const blocks = splitCode(read('landing')).blocks.filter((b) => b.lang === 'js');
    const [first, ...rest] = blocks;
    // Board landing height:'hug' lewat place(w,'hug'): tinggi tidak ditebak.
    expect(first!.code).toMatch(/type:'board'[^\n]*?height:'hug'/);
    expect(first!.code).toContain("place(1440,'hug')");
    expect(first!.code).toMatch(/name:'\[WIP\] /);
    // Execute skeleton: semua seksi sebagai Skel di keep.s, tanpa isi.
    expect(first!.code).toMatch(/keep\.s=\{[^}]*Skel\(/);
    expect(first!.code).not.toMatch(/\bT\(|\bBtn\(/);
    // Blok berikutnya kecil dan mengisi placeholder di tempat (Build) atau menambah ke seksi yang sudah diisi.
    const fills = rest.slice(0, -1);
    expect(fills.length).toBeGreaterThanOrEqual(5);
    for (const b of fills) expect(b.code).toMatch(/keep\.s\.\w+/);
    for (const b of fills) expect(b.code.split('\n').length, b.code.slice(0, 60)).toBeLessThanOrEqual(40);
    // Tidak ada execute yang mengisi atau menaikkan tinggi board (rencana PR #26 "tinggi + perkiraan" dicabut).
    for (const b of blocks) expect(b.code).not.toMatch(/update\(keep\.board,\s*\{[^}]*height/);
    expect(read('landing')).not.toMatch(/perkiraan seksi|tinggi pas/);
    // Webapp: execute 1 sidebar + header + skeleton, lalu KPI dan baris bawah diisi di tempat.
    const web = splitCode(read('webapp')).blocks.filter((b) => b.lang === 'js').map((b) => b.code);
    expect(web.map((c) => (/Skel\(/.test(c) ? 'skel' : /Build\(keep\.s\./.test(c) ? 'build' : '-'))).toEqual(['skel', 'build', 'build']);
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
