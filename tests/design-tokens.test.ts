// Angka token check (`@lakar/schema` design-tokens.ts) = prelude skill core.md (`TY`, baris "Jarak:") = frontmatter DESIGN.md.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  COMPONENT_SIZES,
  HOME_INDICATOR_INSET,
  KPI_LINE_HEIGHT_RATIO,
  KPI_SIZES,
  SPACING,
  SPACING_VALUES,
  TOUCH_MIN,
  TYPE_SCALE,
} from '../packages/schema/src/design-tokens.ts';

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const CORE = root('packages/skills/skills/core.md');
const DESIGN = root('_bmad-output/initiative-lakar/ux-lakar/DESIGN.md');

/** Nama `TY` di prelude → nama token DESIGN.md. */
const PRELUDE_NAME: Record<string, string> = { 'title-lg': 'mobile-title-lg', title: 'mobile-title', tab: 'tab-label' };

function preludeTY(): Record<string, { size: number; lineHeight: number; weight: number; letterSpacing: number }> {
  const md = readFileSync(CORE, 'utf8');
  const block = /```js\n\/\/ prelude\n([\s\S]*?)```/.exec(md)?.[1];
  expect(block, 'blok prelude core.md').toBeDefined();
  const lines = block!.split('\n');
  const r = lines.find((l) => l.startsWith('const R='));
  const start = lines.findIndex((l) => l.startsWith('const TY='));
  expect(r && start >= 0, 'baris const R= dan const TY=').toBe(true);
  // `TY` bisa berlanjut ke baris berikutnya sampai `};`.
  let end = start;
  while (!lines[end]!.trimEnd().endsWith('};')) end++;
  const ty = lines.slice(start, end + 1).join('\n');
  return new Function(`${r}\n${ty}\nreturn TY;`)() as ReturnType<typeof preludeTY>;
}

function preludeSpacing(): number[] {
  const md = readFileSync(CORE, 'utf8');
  const line = md.split('\n').find((l) => l.startsWith('- Jarak:'));
  expect(line, 'baris "- Jarak:" core.md').toBeDefined();
  const main = /- Jarak: ([\d, ]+)/.exec(line!)![1]!;
  const extra = /\(\+([\d, ]+) komponen kecil\)/.exec(line!)?.[1] ?? '';
  return [...main.split(','), ...extra.split(',')].map((s) => s.trim()).filter(Boolean).map(Number);
}

describe('token desain = prelude core.md', () => {
  it('TY: size/lineHeight/weight/letterSpacing sama dengan TYPE_SCALE', () => {
    const ty = preludeTY();
    const names = Object.keys(ty).map((k) => PRELUDE_NAME[k] ?? k);
    // Semua token kecuali `data` (tidak ada di prelude).
    expect(names.sort()).toEqual(Object.keys(TYPE_SCALE).filter((k) => k !== 'data').sort());
    for (const [k, v] of Object.entries(ty)) {
      const t = TYPE_SCALE[(PRELUDE_NAME[k] ?? k) as keyof typeof TYPE_SCALE];
      expect(v, k).toEqual({ size: t.size, lineHeight: t.lineHeight, weight: t.weight, letterSpacing: t.letterSpacing });
    }
  });

  it('baris "Jarak:" (+2, 6) = SPACING_VALUES', () => {
    expect(new Set(preludeSpacing())).toEqual(SPACING_VALUES);
  });
});

/** Frontmatter DESIGN.md: blok `key:` tingkat atas → baris anak (indentasi 2). */
function frontmatterSection(md: string, key: string): Map<string, string> {
  const fm = /^---\n([\s\S]*?)\n---/.exec(md)![1]!.split('\n');
  const out = new Map<string, string>();
  const i = fm.indexOf(`${key}:`);
  expect(i, `frontmatter ${key}`).toBeGreaterThanOrEqual(0);
  for (const l of fm.slice(i + 1)) {
    if (/^\S/.test(l)) break;
    const m = /^ {2}'?([\w-]+)'?:\s*(.*?)\s*(#.*)?$/.exec(l);
    if (m) out.set(m[1]!, m[2]!);
  }
  return out;
}

function componentField(md: string, comp: string, field: string): string | undefined {
  const fm = /^---\n([\s\S]*?)\n---/.exec(md)![1]!.split('\n');
  const i = fm.indexOf(`  ${comp}:`);
  if (i < 0) return undefined;
  for (const l of fm.slice(i + 1)) {
    if (!/^ {4}/.test(l)) break;
    const m = new RegExp(`^ {4}${field}:\\s*(.*?)\\s*(#.*)?$`).exec(l);
    if (m) return m[1];
  }
  return undefined;
}

const px = (s: string): number => Number(/(-?[\d.]+)px/.exec(s)![1]);

describe.skipIf(!existsSync(DESIGN))('token desain = frontmatter DESIGN.md', () => {
  const md = existsSync(DESIGN) ? readFileSync(DESIGN, 'utf8') : '';

  it('typography: size/lineHeight/weight = TYPE_SCALE; kpi = KPI_SIZES × 1.2', () => {
    const typo = frontmatterSection(md, 'typography');
    const kpi = typo.get('kpi')!;
    typo.delete('kpi');
    expect([...typo.keys()].sort()).toEqual(Object.keys(TYPE_SCALE).sort());
    for (const [k, v] of typo) {
      const t = TYPE_SCALE[k as keyof typeof TYPE_SCALE];
      expect(Number(/fontSize: (\d+)px/.exec(v)![1]), k).toBe(t.size);
      expect(Number(/lineHeight: (\d+)px/.exec(v)![1]), k).toBe(t.lineHeight);
      expect(Number(/fontWeight: '(\d+)'/.exec(v)![1]), k).toBe(t.weight);
      expect(Number(/letterSpacing: (-?[\d.]+)em/.exec(v)?.[1] ?? 0), k).toBe(t.letterSpacing);
    }
    expect(/fontSize: '([\d |]+)px'/.exec(kpi)![1]!.split('|').map((s) => Number(s.trim()))).toEqual([...KPI_SIZES]);
    expect(Number(/lineHeight: '([\d.]+)'/.exec(kpi)![1])).toBe(KPI_LINE_HEIGHT_RATIO);
  });

  it('spacing (tanpa page-margin-*/content-max) = SPACING', () => {
    const sp = frontmatterSection(md, 'spacing');
    const tokens = Object.fromEntries([...sp].filter(([k]) => !k.startsWith('page-margin-') && k !== 'content-max').map(([k, v]) => [k, px(v)]));
    expect(tokens).toEqual(SPACING);
  });

  it('ukuran komponen: icon-button, stepper, bilah bawah ⊂ modul', () => {
    const iconButton = px(componentField(md, 'icon-button', 'size')!);
    expect(iconButton).toBe(TOUCH_MIN);
    expect(COMPONENT_SIZES).toContain(iconButton);
    expect(COMPONENT_SIZES).toContain(px(componentField(md, 'stepper', 'button-size')!));
    expect(COMPONENT_SIZES).toContain(px(componentField(md, 'mobile-bottom-bar', 'button-height')!));
    expect(componentField(md, 'mobile-bottom-bar', 'padding')).toContain(`${HOME_INDICATOR_INSET}px`);
    expect(px(componentField(md, 'mobile-tab-bar', 'bottom-inset')!)).toBe(HOME_INDICATOR_INSET);
  });

  it('badge: height (md) dan height-sm = ukuran Badge prelude core.md (sm 20 / md 24, story 2.16)', () => {
    const m = /height:sm\?(\d+):(\d+)/.exec(readFileSync(CORE, 'utf8'));
    expect(m, 'Badge prelude height:sm?<sm>:<md>').not.toBeNull();
    expect(px(componentField(md, 'badge', 'height-sm')!)).toBe(Number(m![1]));
    expect(px(componentField(md, 'badge', 'height')!)).toBe(Number(m![2]));
  });
});
