import { describe, expect, it } from 'vitest';
import type { DesignTarget, Raw } from './designModel.js';
import type { TokenMap } from './themeModel.js';
import {
  acceptsLabel,
  anyRef,
  applyTokenOps,
  createTokenOps,
  createValue,
  detachOps,
  fillColorSpec,
  pickerEmpty,
  pickerGroups,
  pickerHint,
  propSpec,
  radiusSpec,
  refAt,
  slotAccepts,
  specState,
  stopColorSpec,
  strokeSpec,
  tokenValueText,
} from './tokenPicker.js';

const tokens: TokenMap = {
  'colors.bg': { type: 'color', value: '#FFFFFF', modes: { dark: '#0F0F0F' } },
  'colors.surface': { type: 'color', value: '#1C1C1C' },
  'colors.brand.surface': { type: 'color', value: '#3B2414' },
  'radius.md': { type: 'radius', value: 12 },
  'space.4': { type: 'spacing', value: 16, modes: { dark: 20 } },
  'font.size.body': { type: 'fontSize', value: 16 },
  'font.family.ui': { type: 'fontFamily', value: 'Inter' },
};
const modes = ['light', 'dark'];

const target = (id: string, type: string, stored: Raw, mode?: string, resolved?: Raw): DesignTarget => ({
  id,
  type,
  name: id,
  stored: { id, type, ...stored },
  resolved: { id, type, ...(resolved ?? stored) },
  parentLayout: type === 'board' ? undefined : 'column',
  mode,
});
const names = (accepts: Parameters<typeof pickerGroups>[1], q = '') => pickerGroups(tokens, accepts, q, 'light', modes).flatMap((g) => g.rows.map((r) => r.name));
const opsOf = (b: ReturnType<typeof applyTokenOps>) => {
  if ('error' in b) throw new Error(b.error);
  return b.ops;
};

describe('saringan slot (tabel @lakar/schema)', () => {
  it('fill solid hanya menerima color', () => {
    const s = slotAccepts([target('R1', 'rect', { fills: [{ type: 'solid', color: '#FFFFFF' }] })], fillColorSpec(0).propPath);
    expect(s).toEqual({ accepts: ['color'], primary: 'color' });
    expect(names(s!.accepts)).toEqual(['colors.bg', 'colors.surface', 'colors.brand.surface']);
  });

  it('gap = grup panjang (radius, spacing, container, breakpoint), tanpa color', () => {
    const s = slotAccepts([target('F1', 'frame', { gap: 16 })], ['gap']);
    expect(s?.primary).toBe('spacing');
    expect(names(s!.accepts)).toEqual(['radius.md', 'space.4']);
    expect(acceptsLabel(s!.accepts)).toBe('Length');
  });

  it('radius utama radius; stop, stroke color/width, sudut', () => {
    expect(slotAccepts([target('R1', 'rect', {})], radiusSpec().propPath)?.primary).toBe('radius');
    expect(slotAccepts([target('R1', 'rect', {})], radiusSpec(1).propPath)?.primary).toBe('radius');
    expect(slotAccepts([target('R1', 'rect', {})], stopColorSpec(0, 1).propPath)?.accepts).toEqual(['color']);
    expect(slotAccepts([target('R1', 'rect', {})], strokeSpec('color', 'Stroke').propPath)?.accepts).toEqual(['color']);
    expect(slotAccepts([target('R1', 'rect', {})], strokeSpec('width', 'W').propPath)?.primary).toBe('spacing');
  });

  it('size: teks = fontSize, ikon = panjang; campuran teks + ikon = tanpa tipe bersama', () => {
    expect(slotAccepts([target('T1', 'text', {})], ['size'])?.accepts).toEqual(['fontSize']);
    expect(slotAccepts([target('I1', 'icon', {})], ['size'])?.accepts).not.toContain('fontSize');
    expect(slotAccepts([target('T1', 'text', {}), target('I1', 'icon', {})], ['size'])).toBeUndefined();
  });

  it('path tanpa slot (opacity) → tanpa picker', () => {
    expect(slotAccepts([target('R1', 'rect', {})], ['opacity'])).toBeUndefined();
  });
});

describe('daftar picker', () => {
  it('grup urut kemunculan, nilai mode aktif terformat', () => {
    const g = pickerGroups(tokens, ['color'], '', 'dark', modes);
    expect(g.map((x) => x.group)).toEqual(['colors', 'colors.brand']);
    expect(g[0]!.rows[0]).toEqual({ name: 'colors.bg', type: 'color', value: '#0F0F0F', text: '0F0F0F' });
    expect(pickerGroups(tokens, ['spacing'], '', 'dark', modes)[0]!.rows[0]!.text).toBe('20');
  });

  it('cari memuat nama; kosong punya teks', () => {
    expect(names(['color'], 'sur')).toEqual(['colors.surface', 'colors.brand.surface']);
    expect(names(['color'], 'zzz')).toEqual([]);
    expect(pickerEmpty(['color'], 'zzz')).toBe('No tokens match “zzz”.');
    expect(pickerEmpty(['fontWeight'], '')).toBe('No font weight tokens yet.');
  });

  it('hint mode', () => {
    expect(pickerHint(['color'], 'dark', modes)).toBe('Color tokens · values for Dark');
    expect(pickerHint(['radius', 'spacing', 'container', 'breakpoint'], undefined, [])).toBe('Length tokens');
    expect(tokenValueText(tokens['space.4']!, 'dark', modes)).toBe('20');
  });
});

describe('pasang token', () => {
  it('gap literal → ref; node yang sudah memakainya tanpa op', () => {
    const ts = [target('F1', 'frame', { gap: 16 }), target('F2', 'frame', { gap: { $token: 'space.4' } })];
    const b = applyTokenOps(ts, propSpec('gap', 'Gap'), 'space.4');
    expect(b).toEqual({ ops: [{ op: 'update', id: 'F1', patch: { gap: { $token: 'space.4' } } }], label: 'Apply token space.4' });
    expect(applyTokenOps([ts[1]!], propSpec('gap', 'Gap'), 'space.4')).toEqual({ ops: [], label: '' });
  });

  it('fill[0] solid diganti ref, fill lain tetap', () => {
    const fills = [{ type: 'solid', color: '#FFFFFF' }, { type: 'solid', color: '#000000' }];
    const ops = opsOf(applyTokenOps([target('R1', 'rect', { fills })], fillColorSpec(0), 'colors.bg'));
    expect(ops).toEqual([{ op: 'update', id: 'R1', patch: { fills: [{ type: 'solid', color: { $token: 'colors.bg' } }, fills[1]] } }]);
  });

  it('stop gradien dan stroke', () => {
    const fills = [{ type: 'linear', angle: 90, stops: [{ offset: 0, color: '#FF0000' }, { offset: 1, color: '#000000' }] }];
    const ops = opsOf(applyTokenOps([target('R1', 'rect', { fills })], stopColorSpec(0, 1), 'colors.bg'));
    expect((ops[0] as unknown as { patch: { fills: { stops: unknown[] }[] } }).patch.fills[0]!.stops[1]).toEqual({ offset: 1, color: { $token: 'colors.bg' } });
    const stroke = { color: '#000000', width: 1, align: 'inside' };
    expect(opsOf(applyTokenOps([target('R1', 'rect', { stroke })], strokeSpec('width', 'W'), 'space.4'))).toEqual([
      { op: 'update', id: 'R1', patch: { stroke: { ...stroke, width: { $token: 'space.4' } } } },
    ]);
  });

  it('sudut TR dari radius tunggal → tuple', () => {
    const ops = opsOf(applyTokenOps([target('R1', 'rect', { radius: 8 })], radiusSpec(1), 'radius.md'));
    expect(ops).toEqual([{ op: 'update', id: 'R1', patch: { radius: [8, { $token: 'radius.md' }, 8, 8] } }]);
  });
});

describe('detach', () => {
  const bgFill = (id: string, mode: string) => target(id, 'rect', { fills: [{ type: 'solid', color: { $token: 'colors.bg' } }] }, mode);

  it('literal = nilai mode efektif board pemilik', () => {
    const b = detachOps([bgFill('R1', 'dark')], fillColorSpec(0), tokens, modes);
    expect(b).toEqual({ ops: [{ op: 'update', id: 'R1', patch: { fills: [{ type: 'solid', color: '#0F0F0F' }] } }], label: 'Detach token colors.bg' });
  });

  it('multi: literal per mode masing-masing, satu daftar op', () => {
    const ops = opsOf(detachOps([bgFill('R1', 'light'), bgFill('R2', 'dark')], fillColorSpec(0), tokens, modes));
    expect(ops.map((o) => (o as unknown as { patch: { fills: { color: string }[] } }).patch.fills[0]!.color)).toEqual(['#FFFFFF', '#0F0F0F']);
  });

  it('node literal dilewati; tanpa ref → tanpa op; dokumen tanpa mode = value', () => {
    const lit = target('R3', 'rect', { radius: 4 });
    expect(detachOps([lit], radiusSpec(), tokens, modes)).toEqual({ ops: [], label: '' });
    expect(anyRef([lit], radiusSpec().read)).toBe(false);
    const gap = target('F1', 'frame', { gap: { $token: 'space.4' } });
    expect(opsOf(detachOps([gap, lit], propSpec('gap', 'Gap'), tokens, []))).toEqual([{ op: 'update', id: 'F1', patch: { gap: 16 } }]);
    expect(anyRef([gap, lit], propSpec('gap', 'Gap').read)).toBe(true);
  });
});

describe('detach slot lain', () => {
  it('Radius All dari tuple 4 sudut ber-token sama: terbaca sebagai ref, detach = literal tunggal', () => {
    const ref = { $token: 'radius.md' };
    const ts = [target('R1', 'rect', { radius: [ref, ref, ref, ref] })];
    expect(refAt(specState(ts, radiusSpec()))).toBe('radius.md');
    expect(anyRef(ts, radiusSpec().read)).toBe(true);
    expect(opsOf(detachOps(ts, radiusSpec(), tokens, modes))).toEqual([{ op: 'update', id: 'R1', patch: { radius: 12 } }]);
  });

  it('stop gradien dan warna stroke: literal mode efektif', () => {
    const fills = [{ type: 'linear', angle: 90, stops: [{ offset: 0, color: { $token: 'colors.bg' } }, { offset: 1, color: '#000000' }] }];
    const ops = opsOf(detachOps([target('R1', 'rect', { fills }, 'dark')], stopColorSpec(0, 0), tokens, modes));
    expect((ops[0] as unknown as { patch: { fills: { stops: { color: unknown }[] }[] } }).patch.fills[0]!.stops[0]!.color).toBe('#0F0F0F');
    const stroke = { color: { $token: 'colors.bg' }, width: 1, align: 'inside' };
    expect(opsOf(detachOps([target('R1', 'rect', { stroke }, 'light')], strokeSpec('color', 'Stroke'), tokens, modes))).toEqual([
      { op: 'update', id: 'R1', patch: { stroke: { ...stroke, color: '#FFFFFF' } } },
    ]);
  });

  it('dua token berbeda di seleksi → label "Detach tokens"', () => {
    const ts = [target('F1', 'frame', { gap: { $token: 'space.4' } }), target('F2', 'frame', { gap: { $token: 'radius.md' } })];
    const b = detachOps(ts, propSpec('gap', 'Gap'), tokens, modes);
    expect('error' in b ? b.error : b.label).toBe('Detach tokens');
    expect(opsOf(b)).toHaveLength(2);
  });
});

describe('buat token dari nilai', () => {
  it('radius 12 → setTokens + pasang ref dalam satu daftar op', () => {
    const ts = [target('R1', 'rect', { radius: 12 })];
    const b = createTokenOps(tokens, ' radius.card ', 'radius', specState(ts, radiusSpec()), ts, radiusSpec());
    expect(b).toEqual({
      ops: [
        { op: 'setTokens', tokens: { 'radius.card': { type: 'radius', value: 12 } } },
        { op: 'update', id: 'R1', patch: { radius: { $token: 'radius.card' } } },
      ],
      label: 'Create token radius.card',
    });
  });

  it('dari field ber-token: nilai resolve mode aktif', () => {
    const ts = [target('F1', 'frame', { gap: { $token: 'space.4' } }, 'dark', { gap: 20 })];
    const state = specState(ts, propSpec('gap', 'Gap'));
    expect(refAt(state)).toBe('space.4');
    expect(createValue(state, 'spacing')).toBe(20);
    const ops = opsOf(createTokenOps(tokens, 'space.card', 'spacing', state, ts, propSpec('gap', 'Gap')));
    expect(ops[0]).toEqual({ op: 'setTokens', tokens: { 'space.card': { type: 'spacing', value: 20 } } });
  });

  it('nama ada/tidak sah, nilai campuran atau tidak sah → error', () => {
    const ts = [target('R1', 'rect', { radius: 12 })];
    const st = specState(ts, radiusSpec());
    expect(createTokenOps(tokens, 'radius.md', 'radius', st, ts, radiusSpec())).toEqual({ error: 'radius.md already exists.' });
    expect('error' in createTokenOps(tokens, 'Bad Name', 'radius', st, ts, radiusSpec())).toBe(true);
    const mixed = [target('R1', 'rect', { radius: 12 }), target('R2', 'rect', { radius: 4 })];
    expect(createValue(specState(mixed, radiusSpec()), 'radius')).toBeUndefined();
    expect(createTokenOps(tokens, 'radius.x', 'radius', specState(mixed, radiusSpec()), mixed, radiusSpec())).toEqual({ error: 'Selected layers have different values.' });
    const hug = [target('F1', 'frame', { width: 'hug' })];
    expect(createValue(specState(hug, propSpec('width', 'Width')), 'spacing')).toBeUndefined();
    const tuple = [target('R1', 'rect', { radius: [1, 2, 3, 4] })];
    expect(createValue(specState(tuple, radiusSpec()), 'radius')).toBeUndefined();
  });
});
