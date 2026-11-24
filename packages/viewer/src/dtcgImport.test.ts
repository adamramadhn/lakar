// Rencana impor DTCG tokens (dialog Import DTCG): baris pratinjau (path/alias/tipe/nilai/status), mode, op satu commit.
import { describe, expect, it } from 'vitest';
import type { LakarDocument } from '@lakar/schema';
import { DTCG_IMPORT_MAX_CHARS, dtcgImportPlan } from './dtcgImport.js';

const doc = (extra: Record<string, unknown> = {}) => ({ schemaVersion: 8, id: 'Doc00001', rev: 1, pages: [{ id: 'Page0001', name: 'Page', children: [] }], ...extra }) as unknown as LakarDocument;

const JSON_DTCG = JSON.stringify({
  $extensions: { 'com.lakar': { tokenModes: ['light', 'dark'] } },
  colors: {
    bg: { $type: 'color', $value: '#ffffff', $extensions: { mode: { dark: '#0f0f0f' } } },
    link: { $type: 'color', $value: '{colors.bg}' },
  },
  radius: { card: { $type: 'dimension', $value: { value: 16, unit: 'px' }, $extensions: { 'com.lakar': { type: 'radius' } } } },
  effects: { shadow: { $type: 'shadow', $value: { x: 0 } } },
});

describe('dtcgImportPlan', () => {
  it('dokumen kosong: baris New/Unsupported dengan path+alias, op setTokenModes lalu setTokens', () => {
    const p = dtcgImportPlan(doc(), JSON_DTCG);
    expect(p.modes).toEqual(['light', 'dark']);
    expect(p.counts).toEqual({ new: 3, update: 0, skipped: 1 });
    expect(p.rows[0]).toEqual({
      status: 'new',
      path: 'colors.bg',
      token: 'colors.bg',
      type: 'color',
      values: [
        { value: '#ffffff', inherited: false },
        { value: '#0f0f0f', inherited: false },
      ],
    });
    expect(p.rows[1]).toMatchObject({ status: 'new', path: 'colors.link', type: 'color', alias: '{colors.bg}' });
    expect(p.rows[3]).toMatchObject({ status: 'unsupported', path: 'effects.shadow' });
    expect(p.ops).toEqual([
      { op: 'setTokenModes', modes: ['light', 'dark'] },
      {
        op: 'setTokens',
        tokens: {
          'colors.bg': { type: 'color', value: '#ffffff', modes: { dark: '#0f0f0f' } },
          'colors.link': { type: 'color', value: '#ffffff', modes: { dark: '#0f0f0f' } },
          'radius.card': { type: 'radius', value: 16 },
        },
      },
    ]);
    expect(p.label).toBe('Import 3 tokens from DTCG');
    expect(p.error).toBeUndefined();
  });

  it('token ada → Update; mode file ⊆ mode dokumen → tanpa op setTokenModes', () => {
    const d = doc({ tokens: { 'colors.bg': { type: 'color', value: '#000000' } }, tokenModes: ['light', 'dark'] });
    const p = dtcgImportPlan(d, JSON.stringify({ colors: { bg: { $type: 'color', $value: '#111111', $extensions: { mode: { dark: '#222222' } } } } }));
    expect(p.counts).toEqual({ new: 0, update: 1, skipped: 0 });
    expect(p.rows[0]).toMatchObject({ status: 'update', token: 'colors.bg' });
    expect(p.ops).toEqual([{ op: 'setTokens', tokens: { 'colors.bg': { type: 'color', value: '#111111', modes: { dark: '#222222' } } } }]);
    expect(p.label).toBe('Import 1 token from DTCG');
  });

  it('kosong → tanpa pesan; JSON rusak → pesan; tanpa token sah → pesan + tanpa op; terlalu besar → pesan ukuran', () => {
    expect(dtcgImportPlan(doc(), '  ')).toMatchObject({ ops: [], rows: [] });
    expect(dtcgImportPlan(doc(), '  ').error).toBeUndefined();
    expect(dtcgImportPlan(doc(), '{oops').error).toBeTruthy();
    const none = dtcgImportPlan(doc(), JSON.stringify({ a: { $type: 'shadow', $value: {} } }));
    expect(none.ops).toEqual([]);
    expect(none.error).toMatch(/^No DTCG tokens/);
    expect(none.counts.skipped).toBe(1);
    expect(dtcgImportPlan(doc(), 'a'.repeat(DTCG_IMPORT_MAX_CHARS + 1)).error).toMatch(/larger than 256 KB/);
  });
});
