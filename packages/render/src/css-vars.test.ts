// Parser impor CSS variables (epic token-tema story 2): matriks spec-token-2-read-api, murni tanpa Chromium.
import { describe, expect, it } from 'vitest';
import { cssVarName } from './css.js';
import { parseCssColor, parseCssVariables } from './css-vars.js';

const byToken = (css: string, opts?: Parameters<typeof parseCssVariables>[1]) => {
  const r = parseCssVariables(css, opts);
  return { ...r, t: Object.fromEntries(r.entries.map((e) => [e.token, e])) };
};
const reasons = (r: ReturnType<typeof parseCssVariables>) => Object.fromEntries(r.skipped.map((s) => [s.source, s.reason]));

const DESIGN_CSS = `
/* src/styles/tokens.css */
:root {
  --colors-bg: #ffffff;
  --colors-surface: #f7f7f7;
  --colors-brand-primary: #f97316;
  --radius-md: 12px;
  --space-4: 16px;
  --font-sans: "Inter", sans-serif;
  --shadow-card: 0 8px 24px #0003;
}
[data-theme="dark"] {
  --colors-bg: #0f0f0f;
  --colors-surface: #1c1c1c;
  --colors-brand-primary: #fb923c;
}`;

describe('parseCssVariables', () => {
  it('contoh desain dialog impor: tipe, nama, mode, dan skip bayangan', () => {
    const r = byToken(DESIGN_CSS);
    expect(r.entries.map((e) => e.token)).toEqual(['colors.bg', 'colors.surface', 'colors.brand.primary', 'radius.md', 'space.4', 'font.sans']);
    expect(r.t['colors.bg']).toEqual({ variable: '--colors-bg', token: 'colors.bg', type: 'color', value: '#FFFFFF', modes: { dark: '#0F0F0F' }, status: 'new' });
    expect(r.t['radius.md']).toMatchObject({ type: 'radius', value: 12 });
    expect(r.t['space.4']).toMatchObject({ type: 'spacing', value: 16 });
    expect(r.t['font.sans']).toMatchObject({ type: 'fontFamily', value: 'Inter' });
    expect(r.t['radius.md']!.modes).toBeUndefined();
    expect(r.tokenModes).toEqual(['light', 'dark']);
    expect(reasons(r)).toEqual({ '--shadow-card': 'unsupported-value' });
    for (const e of r.entries) expect(cssVarName(e.token)).toBe(e.variable);
  });

  it('token dokumen yang sudah ada dipakai ulang (status update, tipe lama dipertahankan)', () => {
    const r = byToken(':root { --colors-text-primary: #111; --space-4: 1rem; }', { tokens: { 'colors.text-primary': { type: 'color' }, 'space.4': { type: 'radius' } } });
    expect(r.t['colors.text-primary']).toMatchObject({ variable: '--colors-text-primary', status: 'update', value: '#111111' });
    expect(r.t['space.4']).toMatchObject({ type: 'radius', value: 16, status: 'update' });
  });

  it('nama tidak sah dan selektor/at-rule tidak didukung dilaporkan; sisanya tetap diimpor', () => {
    const r = parseCssVariables(':root { --Brand: #fff; --ok-a: #000; --a--b: 4px; --_x: 1px } .dark { --a: 1px } @media (prefers-color-scheme: dark) { :root { --c: #000 } } [data-theme="Dark Mode"] { --ok-a: #fff }');
    expect(r.entries.map((e) => e.token)).toEqual(['ok.a', 'a--b']);
    expect(reasons(r)).toMatchObject({ '--Brand': 'invalid-name', '--_x': 'invalid-name', '.dark': 'unsupported-selector', '@media (prefers-color-scheme: dark)': 'unsupported-selector', '[data-theme="Dark Mode"]': 'invalid-mode' });
    for (const s of r.skipped) expect(s.detail.length).toBeGreaterThan(10);
  });

  it('mode tanpa blok root: mode pertama jadi default', () => {
    const r = byToken("[data-theme=light] { --c: #fff } [data-theme='dark'] { --c: #000 }");
    expect(r.t.c).toMatchObject({ value: '#FFFFFF', modes: { dark: '#000000' } });
    expect(r.tokenModes).toEqual(['light', 'dark']);
  });

  it('root satu aturan dengan mode → mode itu default; mode lama dokumen dipertahankan', () => {
    const r = byToken(':root, [data-theme="day"] { --c: #fff } [data-theme="night"] { --c: #000 }');
    expect(r.tokenModes).toEqual(['day', 'night']);
    expect(r.t.c!.modes).toEqual({ night: '#000000' });
    expect(parseCssVariables(':root { --c: #fff } [data-theme=dark] { --c: #000 }', { modes: ['light', 'dark'] }).tokenModes).toBeNull();
    expect(parseCssVariables(':root { --c: #fff } [data-theme=sepia] { --c: #eee }', { modes: ['light', 'dark'] }).tokenModes).toEqual(['light', 'dark', 'sepia']);
    // Root + blok light terpisah: root = mode light (nilai light yang beda masuk modes.light).
    const light = byToken(':root { --c: #fff } [data-theme=light] { --c: #eee } [data-theme=dark] { --c: #000 }');
    expect(light.tokenModes).toEqual(['light', 'dark']);
    expect(light.t.c).toMatchObject({ value: '#FFFFFF', modes: { light: '#EEEEEE', dark: '#000000' } });
    expect(parseCssVariables(':root { --c: #fff } [data-theme=light] { --c: #eee }').tokenModes).toEqual(['light']);
    expect(parseCssVariables(':root { --c: #fff }').tokenModes).toBeNull();
  });

  it('satuan dan petunjuk nama', () => {
    const r = byToken(':root { --text-lg: 1.25rem; --leading-tight: 1.25; --leading-6: 24px; --tracking-wide: 0.05em; --font-weight-bold: 700; --font-weight-normal: normal; --breakpoint-md: 768px; --container-lg: 64rem; --rounded-full: 9999px; --font-mono: ui-monospace, monospace; --z-10: 10; --opacity: 50%; --tracking-px: 1px; --font-base: 16px }');
    expect(r.t['text.lg']).toMatchObject({ type: 'fontSize', value: 20 });
    expect(r.t['leading.6']).toMatchObject({ type: 'lineHeight', value: 24 });
    expect(r.t['tracking.wide']).toMatchObject({ type: 'letterSpacing', value: 0.05 });
    expect(r.t['font.weight.bold']).toMatchObject({ type: 'fontWeight', value: 700 });
    expect(r.t['font.weight.normal']).toMatchObject({ type: 'fontWeight', value: 400 });
    expect(r.t['breakpoint.md']).toMatchObject({ type: 'breakpoint', value: 768 });
    expect(r.t['container.lg']).toMatchObject({ type: 'container', value: 1024 });
    expect(r.t['rounded.full']).toMatchObject({ type: 'radius', value: 9999 });
    expect(r.t['font.mono']).toMatchObject({ type: 'fontFamily', value: 'ui-monospace' });
    expect(r.t['font.base']).toMatchObject({ type: 'fontSize', value: 16 });
    expect(reasons(r)).toEqual({ '--leading-tight': 'unsupported-value', '--z-10': 'unsupported-value', '--opacity': 'unsupported-value', '--tracking-px': 'unsupported-value' });
    expect(r.skipped.find((s) => s.source === '--leading-tight')!.detail).toContain('line-height');
  });

  it('alias var() mengikuti mode; alias tak dikenal dilewati', () => {
    const r = byToken(':root { --a: #111; --b: var(--a); --c: var(--nope) } [data-theme=dark] { --a: #eee }');
    expect(r.t.b).toMatchObject({ type: 'color', value: '#111111', modes: { dark: '#EEEEEE' } });
    expect(reasons(r)).toEqual({ '--c': 'unsupported-value' });
    expect(reasons(parseCssVariables(':root { --a: var(--b); --b: var(--a) }'))).toEqual({ '--a': 'unsupported-value', '--b': 'unsupported-value' });
  });

  it('nilai mode beda jenis → mixed-values; komentar, !important, dan deklarasi berulang', () => {
    const r = byToken(':root { --c: #fff; /* --x: 1px; */ --s: 4px !important; --s: 8px; --q: "a;b" } [data-theme=dark] { --c: 12px }');
    expect(reasons(r)).toMatchObject({ '--c': 'mixed-values' });
    expect(r.t.s).toMatchObject({ value: 8 });
    expect(r.t.x).toBeUndefined();
    expect(r.t.q).toMatchObject({ type: 'fontFamily', value: 'a;b' });
  });

  it('token dokumen bertipe sama digabung: mode yang tidak disebut CSS tetap, value lama dipakai tanpa nilai root', () => {
    const tokens = { 'colors.bg': { type: 'color', value: '#FFFFFF', modes: { dark: '#0F0F0F', dim: '#333333' } } };
    // Root + dim: value baru, dim dari CSS, dark tetap.
    expect(byToken(':root { --colors-bg: #fafafa } [data-theme=dim] { --colors-bg: #222 }', { tokens, modes: ['light', 'dark', 'dim'] }).t['colors.bg']).toMatchObject({
      value: '#FAFAFA',
      modes: { dark: '#0F0F0F', dim: '#222222' },
      status: 'update',
    });
    // Mode dark disebut CSS tanpa nilai variabel ini → nilai root berlaku di dark (mode lama dihapus).
    expect(byToken(':root { --colors-bg: #fafafa } [data-theme=dark] { --other-a: #000 }', { tokens, modes: ['light', 'dark', 'dim'] }).t['colors.bg']!.modes).toEqual({ dim: '#333333' });
    // File khusus dark (tanpa root): value lama tetap, dark diperbarui.
    expect(byToken('[data-theme=dark] { --colors-bg: #000 }', { tokens, modes: ['light', 'dark', 'dim'] }).t['colors.bg']).toMatchObject({
      value: '#FFFFFF',
      modes: { dark: '#000000', dim: '#333333' },
    });
    // Tipe berbeda: tidak digabung.
    expect(byToken(':root { --colors-bg: 4px }', { tokens }).t['colors.bg']).toEqual({ variable: '--colors-bg', token: 'colors.bg', type: 'spacing', value: 4, status: 'update' });
  });

  it('CSS tidak rapi: } dan ; liar di tingkat atas tidak menelan aturan berikutnya', () => {
    const r = byToken(':root { --a: #111 }; } [data-theme=dark] { --a: #eee }');
    expect(r.t.a).toMatchObject({ value: '#111111', modes: { dark: '#EEEEEE' } });
    expect(r.skipped).toEqual([]);
  });

  it('tanpa variabel → tanpa entri', () => {
    expect(parseCssVariables('body { color: red }')).toEqual({ entries: [], tokenModes: null, skipped: [{ source: 'body', reason: 'unsupported-selector', detail: expect.any(String) }] });
    expect(parseCssVariables('')).toEqual({ entries: [], tokenModes: null, skipped: [] });
  });
});

describe('parseCssColor', () => {
  it.each([
    ['#fff', '#FFFFFF'],
    ['#ffff', '#FFFFFF'],
    ['#0003', '#00000033'],
    ['#11223344', '#11223344'],
    ['rgb(255, 0, 0)', '#FF0000'],
    ['rgba(255,0,0,0.5)', '#FF000080'],
    ['rgb(255 0 0 / 50%)', '#FF000080'],
    ['rgb(100% 0% 0%)', '#FF0000'],
    ['hsl(0, 100%, 50%)', '#FF0000'],
    ['hsl(120deg 100% 25%)', '#008000'],
    ['transparent', '#00000000'],
    ['WHITE', '#FFFFFF'],
    ['rgba(0, 0, 0, 0.999)', '#000000'],
    ['#112233ff', '#112233'],
  ])('%s → %s', (raw, hex) => expect(parseCssColor(raw)).toBe(hex));

  it.each(['red', 'oklch(0.7 0.1 200)', '#12', 'rgb(1,2)', 'var(--a)', 'rgb(1 2 3 4)'])('%s → undefined', (raw) => expect(parseCssColor(raw)).toBeUndefined());
});
