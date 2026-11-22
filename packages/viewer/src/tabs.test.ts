// Logika tab title bar: matriks I/O spec aplikasi 7.
import { describe, expect, it } from 'vitest';
import { applyFileEvent, closeTab, onOpenInNewTab, openInNewTab, openTab, pruneTabs, readTabs, renameTab, serializeTabs } from './tabs.ts';

describe('openTab', () => {
  it('buka lagi tab yang ada → tidak duplikat', () => {
    const tabs = ['a', 'b'];
    expect(openTab(tabs, 'a')).toBe(tabs);
  });
  it('tab baru di akhir', () => {
    expect(openTab(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });
});

describe('closeTab', () => {
  it('tutup aktif → tetangga kanan', () => {
    expect(closeTab(['a', 'b', 'c'], 'b', 'b')).toEqual({ tabs: ['a', 'c'], next: 'c' });
  });
  it('tutup aktif terakhir → kiri', () => {
    expect(closeTab(['a', 'b', 'c'], 'c', 'c')).toEqual({ tabs: ['a', 'b'], next: 'b' });
  });
  it('satu-satunya → Dashboard', () => {
    expect(closeTab(['a'], 'a', 'a')).toEqual({ tabs: [], next: undefined });
  });
  it('tutup bukan aktif → aktif tetap', () => {
    expect(closeTab(['a', 'b', 'c'], 'a', 'c')).toEqual({ tabs: ['b', 'c'], next: 'c' });
    expect(closeTab(['a', 'b'], 'a', undefined)).toEqual({ tabs: ['b'], next: undefined });
  });
});

describe('renameTab', () => {
  it('ganti di tempat', () => {
    expect(renameTab(['a', 'b'], 'a', 'x')).toEqual(['x', 'b']);
  });
  it('target sudah ada → buang duplikat', () => {
    expect(renameTab(['a', 'b', 'x'], 'a', 'x')).toEqual(['x', 'b']);
  });
  it('slug tidak ada di daftar → tetap', () => {
    const tabs = ['a'];
    expect(renameTab(tabs, 'z', 'y')).toBe(tabs);
  });
});

describe('readTabs / serializeTabs', () => {
  it('reload: localStorage + hash dokumen', () => {
    expect(openTab(readTabs(serializeTabs(['a', 'b'])), 'c')).toEqual(['a', 'b', 'c']);
  });
  it.each([null, '', '{', '{"a":1}', '[1,2]', '["a",3]', '[""]', 'null'])('rusak %j → []', (raw) => {
    expect(readTabs(raw)).toEqual([]);
  });
  it('duplikat dibuang', () => {
    expect(readTabs('["a","b","a"]')).toEqual(['a', 'b']);
  });
});

describe('pruneTabs', () => {
  it('slug yang tidak ada lagi dibuang, `keep` dipertahankan', () => {
    expect(pruneTabs(['a', 'b', 'c'], new Set(['a']))).toEqual(['a']);
    expect(pruneTabs(['a', 'b', 'c'], new Set(['a']), 'c')).toEqual(['a', 'c']);
  });
});

describe('applyFileEvent', () => {
  it('rename tab aktif → tab diganti, route ikut, state pindah', () => {
    expect(applyFileEvent(['a', 'b'], 'a', { type: 'rename', from: 'a', to: 'x' })).toEqual({
      tabs: ['x', 'b'],
      navigate: true,
      next: 'x',
      view: { type: 'move', from: 'a', to: 'x' },
    });
  });
  it('rename bukan aktif → route tetap', () => {
    expect(applyFileEvent(['a', 'b'], 'b', { type: 'rename', from: 'a', to: 'x' })).toEqual({
      tabs: ['x', 'b'],
      navigate: false,
      next: 'b',
      view: { type: 'move', from: 'a', to: 'x' },
    });
  });
  it('archive tab aktif → tutup, pindah ke tetangga, state dibuang', () => {
    expect(applyFileEvent(['a', 'b', 'c'], 'b', { type: 'archive', slug: 'b' })).toEqual({
      tabs: ['a', 'c'],
      navigate: true,
      next: 'c',
      view: { type: 'drop', slug: 'b' },
    });
  });
  it('delete file aktif (archived:false) bukan tab aktif → tutup tanpa pindah route', () => {
    expect(applyFileEvent(['a', 'b'], undefined, { type: 'delete', slug: 'a', archived: false })).toEqual({
      tabs: ['b'],
      navigate: false,
      next: undefined,
      view: { type: 'drop', slug: 'a' },
    });
  });
  it('delete salinan arsip (archived:true) → tidak ada perubahan', () => {
    const tabs = ['a', 'b'];
    const r = applyFileEvent(tabs, 'a', { type: 'delete', slug: 'a', archived: true });
    expect(r).toEqual({ tabs: ['a', 'b'], navigate: false, next: 'a', view: { type: 'none' } });
    expect(r.tabs).toBe(tabs);
  });
});

describe('openInNewTab', () => {
  it('pendengar menerima slug; sesudah dilepas tidak lagi', () => {
    const got: string[] = [];
    const off = onOpenInNewTab((s) => got.push(s));
    openInNewTab('a');
    off();
    openInNewTab('b');
    expect(got).toEqual(['a']);
  });
});
