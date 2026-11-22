// Deskripsi tool `execute` di mcp harus menyebut setiap fungsi API exec (api.ts = satu-satunya sumber).
import { describe, expect, it } from 'vitest';
import { API, API_GLOBALS } from '../packages/exec/src/api.ts';
import { EXECUTE_DESCRIPTION, ICON_SEARCH_DESCRIPTION, LAYOUT_CHECK_DESCRIPTION } from '../packages/mcp/src/server.ts';
import { FORBIDDEN_PHRASES } from '../packages/schema/src/content-rules.ts';
import { CONTRAST_MIN, CONTROL_PREFIXES, LARGE_TEXT } from '../packages/schema/src/contrast-rules.ts';

describe('deskripsi tool execute', () => {
  it.each(Object.keys(API))('menyebut %s(', (name) => {
    expect(EXECUTE_DESCRIPTION).toContain(`${name}(`);
  });

  it('menyebut keep, console.log, value, editId/edits, dan description 3–8 kata', () => {
    expect(Object.keys(API_GLOBALS)).toEqual(['keep', 'console']);
    for (const s of ['keep', 'console.log', 'data.value', 'editId', 'edits', '3–8 kata']) expect(EXECUTE_DESCRIPTION).toContain(s);
  });

  it('menyebut ikon: icon_search, ICON_UNKNOWN, alias, strokeWidth grid 24 default 2, filled, default name/version', () => {
    for (const s of ['icon_search', 'ICON_UNKNOWN', 'alias', 'strokeWidth dalam unit grid 24 (default 2)', 'filled', "'Icon / <lib> / <icon>'", 'version diisi otomatis', 'logo brand']) {
      expect(EXECUTE_DESCRIPTION).toContain(s);
    }
    expect(ICON_SEARCH_DESCRIPTION).toContain('iconSearch(');
  });

  it('menyebut check/bounds: temuan tidak membatalkan commit, layout_check, render gagal tidak di-commit', () => {
    for (const s of ['check {boards, summary:{error, warning, gate, info', 'temuan info hanya di layout_check', 'bounds {id:[x,y,w,h]}', 'boundsTruncated', 'Temuan tidak membatalkan commit; perbaiki lalu execute lagi', 'layout_check', 'tidak di-commit']) {
      expect(EXECUTE_DESCRIPTION).toContain(s);
    }
  });

  it('layout_check menyebut LC-02c (non-teks meluap) dan LC-31 (rata di tepi bawah, daftar rata)', () => {
    for (const s of ['LC-02c non-teks', 'min(8, padding/2)', 'LC-31', 'baris terakhir daftar/tabel']) expect(LAYOUT_CHECK_DESCRIPTION).toContain(s);
  });

  it('layout_check menyebut LC-03, LC-06, LC-07, LC-08, LC-09, LC-10 (tipografi dan spacing)', () => {
    for (const s of ['LC-03 teks', 'LC-06 paragraf', 'LC-07 gap/padding', 'LC-08 ukuran', 'LC-09 > 2 keluarga', 'LC-10 target sentuh < 44×44']) expect(LAYOUT_CHECK_DESCRIPTION).toContain(s);
  });

  it('layout_check menyebut LC-04 dengan ambang dari modul: teks besar, placeholder, batas kontrol, ikon tanpa label, scrim', () => {
    for (const s of [
      `< ${CONTRAST_MIN.text}:1`,
      `≥ ${LARGE_TEXT.size} atau ≥ ${LARGE_TEXT.boldSize} berat ≥ ${LARGE_TEXT.boldWeight}: < ${CONTRAST_MIN.large}:1`,
      `'Placeholder' selalu ${CONTRAST_MIN.placeholder}:1`,
      'batas kontrol',
      'ikon tanpa label',
      'warning scrim',
      'opacity ≥ 0,5',
    ])
      expect(LAYOUT_CHECK_DESCRIPTION).toContain(s);
    for (const p of CONTROL_PREFIXES) expect(LAYOUT_CHECK_DESCRIPTION).toContain(`'${p} …'`);
    expect(LAYOUT_CHECK_DESCRIPTION).not.toContain('≥ 19 tebal');
  });

  it('layout_check menyebut LC-17 (seksi mirip) dan LC-19 dengan setiap frasa terlarang dari modul', () => {
    for (const s of ['LC-17 struktur seksi mirip', 'Jaccard ≥ 0,9', 'LC-19 frasa terlarang', "'Input / …' dan layer 'Label'"]) expect(LAYOUT_CHECK_DESCRIPTION).toContain(s);
    for (const p of [...FORBIDDEN_PHRASES.id, ...FORBIDDEN_PHRASES.en]) expect(LAYOUT_CHECK_DESCRIPTION).toContain(`"${p}"`);
  });
});
