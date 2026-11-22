import { describe, expect, it } from 'vitest';
import type { DesignTarget } from './designModel.js';
import {
  addModeOps,
  addTokenOps,
  cellOf,
  countLabel,
  deleteTokenOps,
  effectiveMode,
  firstType,
  modeIcon,
  modeLabel,
  modeSlug,
  newTokenName,
  parseTokenValue,
  readThemeMode,
  renameModeOps,
  renameTokenOps,
  setCellOps,
  themeModeOps,
  tokenGroups,
  tokenUsage,
  typeCounts,
  usageCounts,
  type ThemeDoc,
  type TokenMap,
} from './themeModel.js';

const tokens: TokenMap = {
  'colors.bg': { type: 'color', value: '#FFFFFF', modes: { dark: '#0F0F0F' } },
  'colors.brand.primary': { type: 'color', value: '#F97316' },
  'radius.md': { type: 'radius', value: 12 },
  'spacing.4': { type: 'spacing', value: 16 },
  primary: { type: 'color', value: '#111111' },
};
const MODES = ['light', 'dark'];

const doc = (): ThemeDoc => ({
  tokens,
  tokenModes: MODES,
  pages: [
    {
      children: [
        {
          id: 'Board001',
          type: 'board',
          children: [
            { id: 'Frame001', type: 'frame', radius: { $token: 'radius.md' }, fills: [{ type: 'solid', color: { $token: 'colors.bg' } }] },
            {
              id: 'Rect0001',
              type: 'rect',
              radius: [{ $token: 'radius.md' }, 0, 0, 0],
              fills: [{ type: 'linear', angle: 90, stops: [{ color: { $token: 'colors.bg' }, offset: 0 }, { color: '#000000', offset: 1 }] }],
            },
          ],
        },
        { id: 'Board002', type: 'board', themeMode: 'dark', children: [{ id: 'Text0001', type: 'text', text: 'Hi', color: { $token: 'colors.bg' } }] },
      ],
    },
  ],
});

const board = (id: string, themeMode?: string): DesignTarget => ({
  id,
  type: 'board',
  name: id,
  stored: themeMode ? { themeMode } : {},
  resolved: {},
  parentLayout: undefined,
});

describe('daftar token', () => {
  it('menghitung per jenis dan memilih jenis awal', () => {
    expect(typeCounts(tokens)).toMatchObject({ color: 3, radius: 1, spacing: 1, fontSize: 0 });
    expect(firstType({ 'radius.md': { type: 'radius', value: 1 } })).toBe('radius');
    expect(firstType({})).toBe('color');
  });

  it('mengelompokkan per grup urut kemunculan dan menyaring nama', () => {
    expect(tokenGroups(tokens, 'color').map((g) => [g.group, g.rows.map((r) => r.name)])).toEqual([
      ['colors', ['colors.bg']],
      ['colors.brand', ['colors.brand.primary']],
      ['', ['primary']],
    ]);
    expect(tokenGroups(tokens, 'color', 'Brand').map((g) => g.group)).toEqual(['colors.brand']);
  });

  it('label badge, mode, dan slug mode', () => {
    expect(countLabel(tokens, MODES)).toBe('5 tokens · 2 modes');
    expect(countLabel({ a: { type: 'color', value: '#000000' } }, ['light'])).toBe('1 token · 1 mode');
    expect(countLabel({})).toBe('0 tokens');
    expect(modeLabel('high-contrast')).toBe('High contrast');
    expect(modeSlug('High contrast')).toBe('high-contrast');
    expect(modeSlug('  Dim!! ')).toBe('dim');
    expect(modeSlug('---')).toBeUndefined();
    expect(modeSlug('')).toBeUndefined();
  });

  it('sel default, mode, dan warisan', () => {
    const d = tokens['colors.bg']!;
    expect(cellOf(d, 'light', MODES)).toEqual({ value: '#FFFFFF', inherited: false });
    expect(cellOf(d, 'dark', MODES)).toEqual({ value: '#0F0F0F', inherited: false });
    expect(cellOf(tokens['spacing.4']!, 'dark', MODES)).toEqual({ value: 16, inherited: true });
    expect(cellOf(d, undefined, [])).toEqual({ value: '#FFFFFF', inherited: false });
  });

  it('nilai per tipe divalidasi skema', () => {
    expect(parseTokenValue('color', 'fafafa')).toBe('#FAFAFA');
    expect(parseTokenValue('color', 'zz')).toBeUndefined();
    expect(parseTokenValue('spacing', '-1')).toBeUndefined();
    expect(parseTokenValue('spacing', '12px')).toBe(12);
    expect(parseTokenValue('lineHeight', '0')).toBeUndefined();
    expect(parseTokenValue('letterSpacing', '-0.02')).toBe(-0.02);
    expect(parseTokenValue('fontWeight', '650')).toBeUndefined();
    expect(parseTokenValue('fontWeight', '700')).toBe(700);
    expect(parseTokenValue('fontFamily', '  Manrope ')).toBe('Manrope');
    expect(parseTokenValue('fontFamily', '  ')).toBeUndefined();
  });
});

describe('edit sel', () => {
  it('ubah nilai default mempertahankan modes', () => {
    expect(setCellOps(tokens, 'colors.bg', 'light', '#fafafa', MODES)).toEqual({
      ops: [{ op: 'setTokens', tokens: { 'colors.bg': { type: 'color', value: '#FAFAFA', modes: { dark: '#0F0F0F' } } } }],
      label: 'Change token colors.bg',
    });
  });

  it('ubah dan kosongkan nilai mode', () => {
    const r = setCellOps(tokens, 'spacing.4', 'dark', '20', MODES);
    expect(r).toEqual({ ops: [{ op: 'setTokens', tokens: { 'spacing.4': { type: 'spacing', value: 16, modes: { dark: 20 } } } }], label: 'Change token spacing.4' });
    expect(setCellOps(tokens, 'colors.bg', 'dark', '', MODES)).toEqual({ ops: [{ op: 'setTokens', tokens: { 'colors.bg': { type: 'color', value: '#FFFFFF' } } }], label: 'Change token colors.bg' });
  });

  it('dokumen tanpa mode: kolom tunggal = value', () => {
    expect(setCellOps(tokens, 'radius.md', undefined, '8', [])).toEqual({ ops: [{ op: 'setTokens', tokens: { 'radius.md': { type: 'radius', value: 8 } } }], label: 'Change token radius.md' });
    expect(setCellOps(tokens, 'radius.md', undefined, '', [])).toHaveProperty('error');
  });

  it('ikon mode dan nama token di-trim', () => {
    expect([modeIcon('light'), modeIcon('dark'), modeIcon('high-contrast')]).toEqual(['sun', 'moon', 'contrast']);
    expect(addTokenOps(tokens, '  colors.extra ', 'color')).toEqual({ ops: [{ op: 'setTokens', tokens: { 'colors.extra': { type: 'color', value: '#D9D9D9' } } }], label: 'Add token colors.extra' });
    expect(renameTokenOps(tokens, 'colors.bg', ' colors.canvas ')).toEqual({ ops: [{ op: 'renameToken', from: 'colors.bg', to: 'colors.canvas' }], label: 'Rename token colors.bg to colors.canvas' });
  });

  it('nilai tidak sah, default kosong, dan nilai sama', () => {
    expect(setCellOps(tokens, 'colors.bg', 'light', 'zz', MODES)).toHaveProperty('error');
    expect(setCellOps(tokens, 'spacing.4', 'dark', '-1', MODES)).toHaveProperty('error');
    expect(setCellOps(tokens, 'colors.bg', 'light', '', MODES)).toHaveProperty('error');
    expect(setCellOps(tokens, 'colors.bg', 'light', 'ffffff', MODES)).toEqual({ ops: [], label: '' });
    expect(setCellOps(tokens, 'spacing.4', 'dark', '', MODES)).toEqual({ ops: [], label: '' });
    expect(setCellOps(tokens, 'missing', undefined, '1', MODES)).toHaveProperty('error');
  });
});

describe('token baru, ganti nama, hapus', () => {
  it('nama draf unik dari grup atau prefiks default', () => {
    expect(newTokenName(tokens, 'color')).toBe('colors.new');
    expect(newTokenName({ ...tokens, 'colors.new': { type: 'color', value: '#000000' } }, 'color')).toBe('colors.new-2');
    expect(newTokenName(tokens, 'fontSize')).toBe('font.size.new');
  });

  it('tambah token dengan nilai awal tipe', () => {
    expect(addTokenOps(tokens, 'font.size.huge', 'fontSize')).toEqual({ ops: [{ op: 'setTokens', tokens: { 'font.size.huge': { type: 'fontSize', value: 16 } } }], label: 'Add token font.size.huge' });
    expect(addTokenOps(tokens, 'Bad Name', 'color')).toHaveProperty('error');
    expect(addTokenOps(tokens, 'colors.bg', 'color')).toHaveProperty('error');
    expect(addTokenOps(tokens, `a.${'b'.repeat(70)}`, 'color')).toHaveProperty('error');
  });

  it('rename', () => {
    expect(renameTokenOps(tokens, 'colors.bg', 'colors.canvas')).toEqual({ ops: [{ op: 'renameToken', from: 'colors.bg', to: 'colors.canvas' }], label: 'Rename token colors.bg to colors.canvas' });
    expect(renameTokenOps(tokens, 'colors.bg', ' colors.bg ')).toEqual({ ops: [], label: '' });
    expect(renameTokenOps(tokens, 'colors.bg', 'radius.md')).toHaveProperty('error');
    expect(renameTokenOps(tokens, 'colors.bg', 'Colors')).toHaveProperty('error');
  });

  it('pemakaian = node unik', () => {
    expect(tokenUsage(doc(), 'radius.md')).toBe(2);
    expect(tokenUsage(doc(), 'colors.bg')).toBe(3);
    expect(tokenUsage(doc(), 'spacing.4')).toBe(0);
    expect(Object.fromEntries(usageCounts(doc()))).toEqual({ 'radius.md': 2, 'colors.bg': 3 });
  });

  it('hapus men-detach pemakai ke nilai mode efektif board, termasuk tuple dan stop', () => {
    expect(deleteTokenOps(doc(), 'radius.md')).toEqual({
      ops: [
        { op: 'update', id: 'Frame001', patch: { radius: 12 } },
        { op: 'update', id: 'Rect0001', patch: { radius: [12, 0, 0, 0] } },
        { op: 'setTokens', tokens: { 'radius.md': null } },
      ],
      label: 'Delete token radius.md',
    });
    const r = deleteTokenOps(doc(), 'colors.bg');
    expect(r).toEqual({
      ops: [
        { op: 'update', id: 'Frame001', patch: { fills: [{ type: 'solid', color: '#FFFFFF' }] } },
        {
          op: 'update',
          id: 'Rect0001',
          patch: { fills: [{ type: 'linear', angle: 90, stops: [{ color: '#FFFFFF', offset: 0 }, { color: '#000000', offset: 1 }] }] },
        },
        { op: 'update', id: 'Text0001', patch: { color: '#0F0F0F' } },
        { op: 'setTokens', tokens: { 'colors.bg': null } },
      ],
      label: 'Delete token colors.bg',
    });
    expect(deleteTokenOps(doc(), 'spacing.4')).toEqual({ ops: [{ op: 'setTokens', tokens: { 'spacing.4': null } }], label: 'Delete token spacing.4' });
    expect(deleteTokenOps(doc(), 'nope')).toHaveProperty('error');
  });
});

describe('mode', () => {
  it('tambah mode', () => {
    expect(addModeOps(doc(), 'High contrast')).toEqual({ ops: [{ op: 'setTokenModes', modes: ['light', 'dark', 'high-contrast'] }], label: 'Add mode high-contrast' });
    expect(addModeOps({ pages: [] }, 'dark')).toEqual({ ops: [{ op: 'setTokenModes', modes: ['light', 'dark'] }], label: 'Add mode dark' });
    expect(addModeOps({ pages: [] }, 'Light')).toEqual({ ops: [{ op: 'setTokenModes', modes: ['light'] }], label: 'Add mode light' });
    expect(addModeOps(doc(), 'Dark')).toHaveProperty('error');
    expect(addModeOps(doc(), '!!')).toHaveProperty('error');
  });

  it('ganti nama mode: daftar, kunci modes token, themeMode board', () => {
    const d = doc();
    d.tokens = { ...tokens, 'spacing.4': { type: 'spacing', value: 16, modes: { dark: 20 } } };
    expect(renameModeOps(d, 'dark', 'Night')).toEqual({
      ops: [
        { op: 'setTokenModes', modes: ['light', 'night'] },
        {
          op: 'setTokens',
          tokens: {
            'colors.bg': { type: 'color', value: '#FFFFFF', modes: { night: '#0F0F0F' } },
            'spacing.4': { type: 'spacing', value: 16, modes: { night: 20 } },
          },
        },
        { op: 'update', id: 'Board002', patch: { themeMode: 'night' } },
      ],
      label: 'Rename mode dark to night',
    });
    expect(renameModeOps(d, 'light', 'Day')).toEqual({ ops: [{ op: 'setTokenModes', modes: ['day', 'dark'] }], label: 'Rename mode light to day' });
    expect(renameModeOps(d, 'dark', 'dark')).toEqual({ ops: [], label: '' });
    expect(renameModeOps(d, 'dark', 'light')).toHaveProperty('error');
    expect(renameModeOps(d, 'dim', 'x')).toHaveProperty('error');
  });

  it('themeMode board: mode pertama = hapus, campuran = undefined', () => {
    expect(readThemeMode([board('B1'), board('B2', 'light')], MODES)).toBe('light');
    expect(readThemeMode([board('B1'), board('B2', 'dark')], MODES)).toBeUndefined();
    expect(themeModeOps([board('B1')], 'dark', MODES)).toEqual([{ op: 'update', id: 'B1', patch: { themeMode: 'dark' } }]);
    expect(themeModeOps([board('B1', 'dark'), board('B2')], 'light', MODES)).toEqual([{ op: 'update', id: 'B1', patch: { themeMode: null } }]);
    expect(themeModeOps([board('B1', 'dark')], 'dark', MODES)).toEqual([]);
  });
});

describe('effectiveMode (mode aktif board untuk Design panel, detach, dan hapus token)', () => {
  it('themeMode board, lalu mode pertama, lalu undefined tanpa mode', () => {
    expect(effectiveMode({ type: 'board', themeMode: 'dark' }, ['light', 'dark'])).toBe('dark');
    expect(effectiveMode({ type: 'board' }, ['light', 'dark'])).toBe('light');
    expect(effectiveMode(undefined, ['light', 'dark'])).toBe('light');
    expect(effectiveMode({ type: 'board' }, undefined)).toBeUndefined();
  });
});
