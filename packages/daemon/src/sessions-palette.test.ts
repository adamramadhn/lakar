// Palet helper bawaan per dokumen (spec-skeleton-live-build): open_doc ke dokumen lain menghapus keep.C/keep.FONT.
import { describe, expect, it } from 'vitest';
import { Sessions, setActiveDoc } from './sessions.js';

describe('setActiveDoc', () => {
  it('pindah dokumen: palet dihapus, keep lain tetap; dokumen sama: tidak berubah', () => {
    const s = new Sessions().create('lakar-mcp');
    setActiveDoc(s, 'a');
    s.keep = { C: { acc: '#2DD4BF' }, FONT: { h: 'Manrope' }, board: 'Brd00001' };
    setActiveDoc(s, 'a');
    expect(s.keep).toEqual({ C: { acc: '#2DD4BF' }, FONT: { h: 'Manrope' }, board: 'Brd00001' });
    setActiveDoc(s, 'b');
    expect(s.activeSlug).toBe('b');
    expect(s.keep).toEqual({ board: 'Brd00001' });
  });

  it('open_doc pertama sesi (belum ada dokumen aktif) juga mulai tanpa palet', () => {
    const s = new Sessions().create();
    s.keep = { C: { acc: '#000000' } };
    setActiveDoc(s, 'a');
    expect(s.keep).toEqual({});
  });
});
