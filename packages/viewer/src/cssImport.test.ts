// Rencana impor CSS variables (dialog Import CSS variables): baris pratinjau, mode, ringkasan, op satu commit.
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type LakarDocument } from '@lakar/schema';
import { CSS_IMPORT_MAX_CHARS, importPlan, tokenVarHint } from './cssImport.js';

const doc = (extra: Record<string, unknown> = {}) => ({ schemaVersion: SCHEMA_VERSION, id: 'Doc00001', rev: 1, pages: [{ id: 'Page0001', name: 'Page', children: [] }], ...extra }) as unknown as LakarDocument;

const CSS = `:root {
  --colors-bg: #ffffff;
  --colors-brand-primary: #f97316;
  --radius-md: 12px;
  --space-4: 1rem;
  --font-sans: "Inter", sans-serif;
  --shadow-card: 0 8px 24px #0003;
}

[data-theme="dark"] {
  --colors-bg: #0f0f0f;
}`;

describe('importPlan', () => {
  it('dokumen tanpa token: baris New/Skipped, mode light + dark, op setTokenModes lalu setTokens', () => {
    const p = importPlan(doc(), CSS);
    expect(p.modes).toEqual(['light', 'dark']);
    expect(p.counts).toEqual({ new: 5, update: 0, skipped: 1 });
    expect(p.rows[0]).toEqual({ status: 'new', variable: '--colors-bg', token: 'colors.bg', type: 'color', values: [{ value: '#FFFFFF', inherited: false }, { value: '#0F0F0F', inherited: false }] });
    expect(p.rows[2]).toMatchObject({ token: 'radius.md', type: 'radius', values: [{ value: 12, inherited: false }, { value: 12, inherited: true }] });
    expect(p.rows.at(-1)).toMatchObject({ status: 'skipped', variable: '--shadow-card' });
    expect(p.selectors).toEqual([
      { selector: ':root', mode: 'Light', isDefault: true },
      { selector: '[data-theme="dark"]', mode: 'Dark', isDefault: false },
    ]);
    expect(p.ops).toEqual([
      { op: 'setTokenModes', modes: ['light', 'dark'] },
      {
        op: 'setTokens',
        tokens: {
          'colors.bg': { type: 'color', value: '#FFFFFF', modes: { dark: '#0F0F0F' } },
          'colors.brand.primary': { type: 'color', value: '#F97316' },
          'radius.md': { type: 'radius', value: 12 },
          'space.4': { type: 'spacing', value: 16 },
          'font.sans': { type: 'fontFamily', value: 'Inter' },
        },
      },
    ]);
    expect(p.label).toBe('Import 5 tokens from CSS');
    expect(p.error).toBeUndefined();
  });

  it('token ada → Update (nama dokumen dipakai), mode tidak berubah → tanpa setTokenModes', () => {
    const d = doc({ tokens: { 'colors.text-primary': { type: 'color', value: '#111111', modes: { dark: '#EEEEEE' } } }, tokenModes: ['light', 'dark'] });
    const p = importPlan(d, ':root { --colors-text-primary: #222222; }');
    expect(p.counts).toEqual({ new: 0, update: 1, skipped: 0 });
    expect(p.rows[0]).toMatchObject({ status: 'update', token: 'colors.text-primary' });
    expect(p.ops).toHaveLength(1);
    expect(p.ops[0]).toEqual({ op: 'setTokens', tokens: { 'colors.text-primary': { type: 'color', value: '#222222', modes: { dark: '#EEEEEE' } } } });
    expect(p.label).toBe('Import 1 token from CSS');
  });

  it('kosong → tanpa pesan; tanpa variabel sah → pesan + tanpa op; terlalu besar → pesan ukuran', () => {
    expect(importPlan(doc(), '   ')).toMatchObject({ ops: [], rows: [] });
    expect(importPlan(doc(), '   ').error).toBeUndefined();
    const none = importPlan(doc(), ':root { --shadow: 0 1px 2px #000; }');
    expect(none.ops).toEqual([]);
    expect(none.error).toMatch(/^No CSS variables to import/);
    expect(none.counts.skipped).toBe(1);
    expect(importPlan(doc(), 'a'.repeat(CSS_IMPORT_MAX_CHARS + 1)).error).toMatch(/larger than 256 KB/);
  });

  it('selektor dari hasil parser: blok dark tanpa nilai berbeda tidak ditampilkan; tanpa entri → kosong', () => {
    expect(importPlan(doc(), ':root { --radius-md: 12px; }').selectors).toEqual([{ selector: ':root', mode: 'Light', isDefault: true }]);
    expect(importPlan(doc(), ':root { --shadow: 0 1px 2px #000; }').selectors).toEqual([]);
  });

  it('tokenVarHint', () => {
    expect(tokenVarHint(doc({ tokens: { 'colors.bg': { type: 'color', value: '#FFFFFF' } } }))).toBe('colors.bg → --colors-bg');
    expect(tokenVarHint(doc())).toBe('');
  });
});
