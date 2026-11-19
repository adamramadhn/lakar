// Ambang kontras check (`@lakar/schema` contrast-rules.ts) = DESIGN.md "Ambang kontras (WCAG 2.2 AA)" + baris LC-04 Lampiran A.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTRAST_MIN, CONTROL_PREFIXES, isLargeText, LARGE_TEXT, SCRIM_MIN_ALPHA, textContrastMin } from '../packages/schema/src/contrast-rules.ts';

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const DESIGN = root('_bmad-output/initiative-lakar/ux-lakar/DESIGN.md');

/** Angka Indonesia ("18,66", "0,5") → number. */
const n = (s: string): number => Number(s.replace(',', '.'));
const cells = (line: string): string[] => line.split('|').slice(1, -1).map((c) => c.trim());

describe('isLargeText / textContrastMin', () => {
  it('≥ 24px atau ≥ 18,66px dengan berat ≥ 700; placeholder selalu 4.5', () => {
    expect(isLargeText({ size: 24 })).toBe(true);
    expect(isLargeText({ size: 23 })).toBe(false);
    expect(isLargeText({ size: 18.66, weight: 700 })).toBe(true);
    expect(isLargeText({ size: 18.66, weight: 600 })).toBe(false);
    expect(isLargeText({ size: 18, weight: 700 })).toBe(false);
    expect(textContrastMin({ name: 'Placeholder', size: 32 })).toBe(CONTRAST_MIN.placeholder);
    expect(textContrastMin({ name: 'Judul', size: 32 })).toBe(CONTRAST_MIN.large);
    expect(textContrastMin({ name: 'Isi', size: 14 })).toBe(CONTRAST_MIN.text);
  });
});

describe.skipIf(!existsSync(DESIGN))('ambang kontras = DESIGN.md', () => {
  const md = existsSync(DESIGN) ? readFileSync(DESIGN, 'utf8').split('\n') : [];
  const start = md.findIndex((l) => l.startsWith('### Ambang kontras'));
  const table: string[][] = [];
  for (let i = start + 1; i < md.length && !md[i]!.startsWith('#'); i++) if (md[i]!.startsWith('| ') && !md[i]!.startsWith('| Elemen')) table.push(cells(md[i]!));
  const row = (re: RegExp) => {
    const r = table.find((c) => re.test(c[0]!));
    expect(r, `baris ${re} di tabel Ambang kontras`).toBeDefined();
    return r!;
  };
  const ratio = (s: string) => n(/^([\d,.]+):1/.exec(s)![1]!);

  it('tabel ditemukan', () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(table.length).toBeGreaterThanOrEqual(5);
  });

  it('teks besar: ≥ 24px, atau ≥ 18,66px dengan berat ≥ 700 → 3:1; teks biasa 4.5:1', () => {
    const large = row(/^Teks besar/);
    const m = /≥ (\d+)px, atau ≥ ([\d,]+)px dengan berat ≥ (\d+)/.exec(large[0]!);
    expect(m, large[0]).not.toBeNull();
    expect([n(m![1]!), n(m![2]!), n(m![3]!)]).toEqual([LARGE_TEXT.size, LARGE_TEXT.boldSize, LARGE_TEXT.boldWeight]);
    expect(ratio(large[1]!)).toBe(CONTRAST_MIN.large);
    expect(ratio(row(/^Teks biasa/)[1]!)).toBe(CONTRAST_MIN.text);
  });

  it('batas kontrol dan ikon tanpa label 3:1; kontrol = CONTROL_PREFIXES', () => {
    const r = row(/^Batas kontrol/);
    expect(ratio(r[1]!)).toBe(CONTRAST_MIN.nonText);
    expect([...r[0]!.matchAll(/`([^`]+)`/g)].map((x) => x[1])).toEqual([...CONTROL_PREFIXES]);
    expect(r[0]).toContain('ikon tanpa label');
  });

  it('placeholder 4.5:1; scrim fill solid ≥ 0,5', () => {
    expect(ratio(row(/^Placeholder/)[1]!)).toBe(CONTRAST_MIN.placeholder);
    const scrim = row(/foto, gradien, atau efek/);
    expect(n(/opacity ≥ ([\d,]+)/.exec(scrim[1]!)![1]!)).toBe(SCRIM_MIN_ALPHA);
  });

  it('baris LC-04 Lampiran A memakai angka yang sama, tanpa "belum dicek"', () => {
    const line = md.find((l) => l.startsWith('| LC-04 |'));
    expect(line, 'baris LC-04 Lampiran A').toBeDefined();
    const how = cells(line!)[3]!;
    const m = /Minimum ([\d.,]+):1, atau ([\d.,]+):1 untuk teks besar \(≥ (\d+)px, atau ≥ ([\d,]+)px dengan berat ≥ (\d+)/.exec(how);
    expect(m, how.slice(0, 200)).not.toBeNull();
    expect(m!.slice(1).map(n)).toEqual([CONTRAST_MIN.text, CONTRAST_MIN.large, LARGE_TEXT.size, LARGE_TEXT.boldSize, LARGE_TEXT.boldWeight]);
    expect(how).toContain(`\`Placeholder\` selalu ${CONTRAST_MIN.placeholder}:1`);
    expect(how).toContain(`< ${CONTRAST_MIN.nonText}:1`);
    expect(how).toContain(`≥ ${String(SCRIM_MIN_ALPHA).replace('.', ',')}`);
    for (const p of CONTROL_PREFIXES) expect(how).toContain(`\`${p}\``);
    expect(how).not.toMatch(/belum dicek/);
  });
});
