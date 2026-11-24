// Konversi token ↔ JSON W3C DTCG (epic adopsi-open-pencil story 9): bentuk ekspor per tipe, determinisme,
// impor (tipe, mode, alias, skipped), dan round-trip lossless.
import { describe, expect, it } from 'vitest';
import { LakarError, type LakarDocument } from '@lakar/schema';
import { dtcgTokensJson, parseDtcgTokens } from './dtcg.js';

const doc = (extra: Record<string, unknown> = {}) => ({ schemaVersion: 8, id: 'Doc00001', rev: 1, pages: [{ id: 'Page0001', name: 'Page', children: [] }], ...extra }) as unknown as LakarDocument;

describe('dtcgTokensJson', () => {
  it('memetakan tipe: color/fontFamily/fontWeight 1:1; panjang → dimension px; letterSpacing → em; com.lakar.type untuk yang tidak 1:1', () => {
    const json = dtcgTokensJson(
      doc({
        tokenModes: ['light', 'dark'],
        tokens: {
          'colors.bg': { type: 'color', value: '#FFFFFF', modes: { dark: '#0F0F0F' } },
          'radius.md': { type: 'radius', value: 12 },
          'font.weight-bold': { type: 'fontWeight', value: 700 },
          'font.sans': { type: 'fontFamily', value: 'Inter' },
          'text.tracking': { type: 'letterSpacing', value: 0.02 },
        },
      }),
    );
    const o = JSON.parse(json);
    expect(o.$extensions['com.lakar'].tokenModes).toEqual(['light', 'dark']);
    expect(o.colors.bg).toEqual({ $type: 'color', $value: '#FFFFFF', $extensions: { mode: { dark: '#0F0F0F' } } });
    expect(o.radius.md).toEqual({ $type: 'dimension', $value: { value: 12, unit: 'px' }, $extensions: { 'com.lakar': { type: 'radius' } } });
    expect(o.font['weight-bold']).toEqual({ $type: 'fontWeight', $value: 700 });
    expect(o.font.sans).toEqual({ $type: 'fontFamily', $value: 'Inter' });
    expect(o.text.tracking).toEqual({ $type: 'dimension', $value: { value: 0.02, unit: 'em' }, $extensions: { 'com.lakar': { type: 'letterSpacing' } } });
  });

  it('deterministik: byte identik, indent 2, newline akhir; nama yang menimpa prefix grup ditulis datar', () => {
    const d = doc({ tokens: { a: { type: 'color', value: '#111111' }, 'a.b': { type: 'color', value: '#222222' }, 'a.b.c': { type: 'color', value: '#333333' } } });
    const json = dtcgTokensJson(d);
    expect(dtcgTokensJson(d)).toBe(json);
    expect(json.endsWith('}\n')).toBe(true);
    const o = JSON.parse(json);
    expect(o.a.$type).toBe('color');
    expect(o['a.b'].$value).toBe('#222222');
    expect(o['a.b.c'].$value).toBe('#333333');
    // Round-trip dari bentuk datar: path mengembalikan nama penuh.
    expect(parseDtcgTokens(json).entries.map((e) => e.token)).toEqual(['a', 'a.b', 'a.b.c']);
  });
});

describe('parseDtcgTokens', () => {
  it('mode di $extensions.mode, tipe dari com.lakar.type, alias di-resolve, urutan tokenModes dari com.lakar', () => {
    const parsed = parseDtcgTokens(
      JSON.stringify({
        $extensions: { 'com.lakar': { tokenModes: ['light', 'dark'] } },
        colors: {
          base: { $type: 'color', $value: '#123456', $extensions: { mode: { dark: '#654321' } } },
          accent: { $type: 'color', $value: '{colors.base}' },
        },
        spacing: { card: { $type: 'dimension', $value: { value: 1.5, unit: 'rem' }, $extensions: { 'com.lakar': { type: 'radius' } } } },
      }),
    );
    expect(parsed.tokenModes).toEqual(['light', 'dark']);
    expect(parsed.skipped).toEqual([]);
    const [bg, accent, card] = parsed.entries;
    expect(bg).toMatchObject({ token: 'colors.base', type: 'color', value: '#123456', modes: { dark: '#654321' }, status: 'new' });
    expect(accent).toMatchObject({ token: 'colors.accent', type: 'color', value: '#123456', alias: '{colors.base}' });
    expect(card).toMatchObject({ token: 'spacing.card', type: 'radius', value: 24 });
  });

  it('inferensi: dimension px → segmen nama (radius/fontSize/…), em → letterSpacing, number+weight → fontWeight, family array, keyword weight', () => {
    const parsed = parseDtcgTokens({
      'radius-md': { $type: 'dimension', $value: { value: 12, unit: 'px' } },
      'font-size-lg': { $type: 'dimension', $value: { value: 20, unit: 'px' } },
      leading: { $type: 'dimension', $value: { value: 24, unit: 'px' } },
      tracking: { $type: 'dimension', $value: { value: 0.05, unit: 'em' } },
      'font-weight-bold': { $type: 'number', $value: 700 },
      'font-weight-semi': { $type: 'fontWeight', $value: 'semi-bold' },
      'font-sans': { $type: 'fontFamily', $value: ['Inter', 'sans-serif'] },
    });
    expect(parsed.skipped).toEqual([]);
    expect(parsed.entries.map((e) => [e.token, e.type, e.value])).toEqual([
      ['radius-md', 'radius', 12],
      ['font-size-lg', 'fontSize', 20],
      ['leading', 'lineHeight', 24],
      ['tracking', 'letterSpacing', 0.05],
      ['font-weight-bold', 'fontWeight', 700],
      ['font-weight-semi', 'fontWeight', 600],
      ['font-sans', 'fontFamily', 'Inter, sans-serif'],
    ]);
  });

  it('skipped: tipe tak didukung, nilai tak valid, nama buruk, mode buruk, alias tak dikenal — bukan dibuang diam-diam', () => {
    const parsed = parseDtcgTokens({
      ok: { $type: 'color', $value: '#ABCDEF' },
      shadow: { $type: 'shadow', $value: { x: 0, y: 1 } },
      'font-typo': { $type: 'typography', $value: {} },
      'bad-color': { $type: 'color', $value: 'not-a-color' },
      'Bad Name': { $type: 'color', $value: '#000000' },
      'bad-mode': { $type: 'color', $value: '#000000', $extensions: { mode: { 'Dark Mode': '#111111' } } },
      'dangling-ref': { $type: 'color', $value: '{colors.unknown}' },
    });
    expect(parsed.entries.map((e) => e.token)).toEqual(['ok']);
    expect(parsed.skipped.map((s) => [s.source, s.reason])).toEqual([
      ['shadow', 'unsupported-type'],
      ['font-typo', 'unsupported-type'],
      ['bad-color', 'unsupported-value'],
      ['Bad Name', 'invalid-name'],
      ['bad-mode', 'invalid-mode'],
      ['dangling-ref', 'unknown-alias'],
    ]);
  });

  it('alias mode mengikuti nilai target per mode; alias siklus/dalam → unknown-alias', () => {
    const parsed = parseDtcgTokens({
      colors: {
        base: { $type: 'color', $value: '#111111', $extensions: { mode: { dark: '#222222' } } },
        alias: { $type: 'color', $value: '#333333', $extensions: { mode: { dark: '{colors.base}' } } },
        self: { $type: 'color', $value: '{colors.self}' },
      },
    });
    const alias = parsed.entries.find((e) => e.token === 'colors.alias')!;
    expect(alias.modes).toEqual({ dark: '#222222' });
    expect(parsed.skipped.map((s) => [s.source, s.reason])).toEqual([['colors.self', 'unknown-alias']]);
  });

  it('status update untuk token yang ada; tokenModes = null bila mode file ⊆ mode dokumen', () => {
    const parsed = parseDtcgTokens(
      { 'colors.bg': { $type: 'color', $value: '#111111', $extensions: { mode: { dark: '#222222' } } } },
      { tokens: { 'colors.bg': { type: 'color', value: '#000000' } }, modes: ['light', 'dark'] },
    );
    expect(parsed.entries[0]).toMatchObject({ status: 'update' });
    expect(parsed.tokenModes).toBeNull();
  });

  it('com.lakar.tokenModes ⊆ mode dokumen → null (mode dokumen dipertahankan); selisih → gabungan dokumen + baru', () => {
    const file = {
      $extensions: { 'com.lakar': { tokenModes: ['dark', 'light'] } },
      'colors.bg': { $type: 'color', $value: '#111111', $extensions: { mode: { dark: '#222222' } } },
    };
    // Urutan deklarasi berbeda tetapi ⊆ → dokumen tidak kehilangan mode/urutannya.
    expect(parseDtcgTokens(file, { modes: ['light', 'dark', 'contrast'] }).tokenModes).toBeNull();
    // File menyebut mode yang belum ada → digabung di belakang urutan dokumen.
    const grown = parseDtcgTokens({ ...file, $extensions: { 'com.lakar': { tokenModes: ['light', 'print'] } } }, { modes: ['light', 'dark'] });
    expect(grown.tokenModes).toEqual(['light', 'dark', 'print']);
    // Deklarasi kosong diabaikan; duplikat dirangkai ulang agar commit setTokenModes tidak gagal.
    expect(parseDtcgTokens({ $extensions: { 'com.lakar': { tokenModes: [] } }, ok: { $type: 'color', $value: '#fff' } }).tokenModes).toBeNull();
    expect(parseDtcgTokens({ $extensions: { 'com.lakar': { tokenModes: ['light', 'light'] } }, ok: { $type: 'color', $value: '#fff' } }).tokenModes).toEqual(['light']);
  });

  it('objek bertipe tanpa $value dilaporkan, bukan dibuang diam-diam; nama multi-kata ber-hyphen diinferensi', () => {
    const parsed = parseDtcgTokens({
      effects: { card: { $type: 'shadow' } },
      'line-height-lg': { $type: 'dimension', $value: { value: 28, unit: 'px' } },
      'letter-spacing-wide': { $type: 'dimension', $value: { value: 0.05, unit: 'em' } },
    });
    expect(parsed.skipped).toEqual([{ source: 'effects.card', reason: 'unsupported-value', detail: 'Token declares $type but has no $value.' }]);
    expect(parsed.entries.map((e) => [e.token, e.type, e.value])).toEqual([
      ['line-height-lg', 'lineHeight', 28],
      ['letter-spacing-wide', 'letterSpacing', 0.05],
    ]);
  });

  it('JSON rusak/non-objek → SCHEMA_INVALID', () => {
    expect(() => parseDtcgTokens('{oops')).toThrowError(LakarError);
    expect(() => parseDtcgTokens('42')).toThrowError(LakarError);
    for (const bad of ['{oops', '42', '[]', 'null']) {
      try {
        parseDtcgTokens(bad);
        expect.unreachable();
      } catch (e) {
        expect((e as LakarError).code).toBe('SCHEMA_INVALID');
      }
    }
  });

  it('round-trip corpus: token, tipe, nilai, modes, dan tokenModes identik', () => {
    const d = doc({
      tokenModes: ['light', 'dark'],
      tokens: {
        'colors.bg': { type: 'color', value: '#FFFFFF', modes: { dark: '#0F0F0F' } },
        'colors.accent': { type: 'color', value: '#2563EB', modes: { light: '#1D4ED8', dark: '#60A5FA' } },
        'radius.md': { type: 'radius', value: 12 },
        'spacing.4': { type: 'spacing', value: 16 },
        'container.card': { type: 'container', value: 360 },
        'breakpoint.md': { type: 'breakpoint', value: 768 },
        'font.sans': { type: 'fontFamily', value: 'Inter' },
        'font.weight-bold': { type: 'fontWeight', value: 700 },
        'font.size-lg': { type: 'fontSize', value: 20 },
        'leading.loose': { type: 'lineHeight', value: 28 },
        'tracking.wide': { type: 'letterSpacing', value: 0.04 },
      },
    });
    const parsed = parseDtcgTokens(dtcgTokensJson(d));
    expect(parsed.skipped).toEqual([]);
    expect(parsed.tokenModes).toEqual(['light', 'dark']);
    const rebuilt = Object.fromEntries(parsed.entries.map((e) => [e.token, { type: e.type, value: e.value, ...(e.modes ? { modes: e.modes } : {}) }]));
    expect(rebuilt).toEqual(d.tokens);
  });
});
