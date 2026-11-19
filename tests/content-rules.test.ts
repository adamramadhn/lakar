// Frasa terlarang check (`@lakar/schema` content-rules.ts) = DESIGN.md "Frasa terlarang" = skill polish.md.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FORBIDDEN_PHRASES, forbiddenPhrasesIn } from '../packages/schema/src/content-rules.ts';

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const POLISH = root('packages/skills/skills/polish.md');
const DESIGN = root('_bmad-output/initiative-lakar/ux-lakar/DESIGN.md');

const quoted = (line: string): string[] => [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);

describe('frasa terlarang = polish.md', () => {
  it('baris "Frasa terlarang (kata utuh)" = id + en, urut', () => {
    const line = readFileSync(POLISH, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('Frasa terlarang (kata utuh):'));
    expect(line, 'baris "Frasa terlarang (kata utuh):" polish.md').toBeDefined();
    expect(quoted(line!)).toEqual([...FORBIDDEN_PHRASES.id, ...FORBIDDEN_PHRASES.en]);
  });
});

describe.skipIf(!existsSync(DESIGN))('frasa terlarang = DESIGN.md', () => {
  const md = existsSync(DESIGN) ? readFileSync(DESIGN, 'utf8').split('\n') : [];
  for (const lang of ['id', 'en'] as const) {
    it(`- **${lang}:** = FORBIDDEN_PHRASES.${lang}`, () => {
      const line = md.find((l) => l.startsWith(`- **${lang}:** "`));
      expect(line, `baris - **${lang}:** DESIGN.md`).toBeDefined();
      expect(quoted(line!)).toEqual([...FORBIDDEN_PHRASES[lang]]);
    });
  }
});

describe('forbiddenPhrasesIn', () => {
  const hits = (s: string) => forbiddenPhrasesIn(s).map((h) => `${h.phrase} (${h.lang})`);
  it('kata utuh, tanpa beda huruf, spasi ganda, tanda hubung', () => {
    expect(hits('Pelajari Lebih Lanjut →')).toEqual(['pelajari lebih lanjut (id)']);
    expect(hits('Unlock your data.')).toEqual(['unlock (en)']);
    expect(hits('Klik  di\nsini')).toEqual(['klik di sini (id)']);
    expect(hits('next-level')).toEqual(['next-level (en)']);
    expect(hits('next‑level tools, seamless!')).toEqual(['seamless (en)', 'next-level (en)']);
    expect(hits('(learn more)')).toEqual(['learn more (en)']);
  });
  it('bukan kata utuh → tidak ada', () => {
    for (const s of ['unlocked', 'Seamlessly', 'pelajari lebih lanjutan', 'reunlock', 'unlock_2', 'nextlevel', '']) expect(hits(s), s).toEqual([]);
  });
});
