// State tampilan per dokumen (memori sesi) untuk pindah tab.
import { describe, expect, it } from 'vitest';
import { dropViewState, getCamera, getViewState, moveViewState, saveCamera, saveViewState } from './viewState.ts';

describe('viewState', () => {
  it('simpan/ambil: halaman, seleksi, tab panel, kamera per halaman', () => {
    expect(getViewState('rt')).toBeUndefined();
    saveViewState('rt', { pageIndex: 2, selectedId: 'N1', panel: 'design' });
    saveCamera('rt', 'P1', { x: 10, y: 20, z: 1.5 });
    saveCamera('rt', 'P2', { x: -5, y: 0, z: 0.5 });
    expect(getViewState('rt')).toMatchObject({ pageIndex: 2, selectedId: 'N1', panel: 'design' });
    expect(getCamera('rt', 'P1')).toEqual({ x: 10, y: 20, z: 1.5 });
    expect(getCamera('rt', 'P2')).toEqual({ x: -5, y: 0, z: 0.5 });
    expect(getCamera('rt', 'P3')).toBeUndefined();
    // Kamera dulu, state sesudahnya: kamera tetap.
    saveCamera('cam-first', 'P1', { x: 1, y: 2, z: 3 });
    saveViewState('cam-first', { pageIndex: 0, selectedId: undefined, panel: 'activity' });
    expect(getCamera('cam-first', 'P1')).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('moveViewState: state pindah ke slug baru', () => {
    saveViewState('mv-a', { pageIndex: 1, selectedId: 'N', panel: 'history' });
    saveCamera('mv-a', 'P', { x: 1, y: 1, z: 1 });
    moveViewState('mv-a', 'mv-x');
    expect(getViewState('mv-a')).toBeUndefined();
    expect(getViewState('mv-x')).toMatchObject({ pageIndex: 1, selectedId: 'N', panel: 'history' });
    expect(getCamera('mv-x', 'P')).toEqual({ x: 1, y: 1, z: 1 });
  });

  it('moveViewState: target lama ditimpa; sumber tanpa state → target usang dibuang', () => {
    saveViewState('mv-b', { pageIndex: 3, selectedId: undefined, panel: 'history' });
    saveViewState('mv-y', { pageIndex: 9, selectedId: 'old', panel: 'design' });
    moveViewState('mv-b', 'mv-y');
    expect(getViewState('mv-y')).toMatchObject({ pageIndex: 3, panel: 'history' });

    saveViewState('mv-z', { pageIndex: 5, selectedId: 'stale', panel: 'history' });
    moveViewState('mv-none', 'mv-z');
    expect(getViewState('mv-z')).toBeUndefined();
  });

  it('dropViewState', () => {
    saveViewState('dr', { pageIndex: 1, selectedId: 'N', panel: 'design' });
    saveCamera('dr', 'P', { x: 0, y: 0, z: 1 });
    dropViewState('dr');
    expect(getViewState('dr')).toBeUndefined();
    expect(getCamera('dr', 'P')).toBeUndefined();
  });
});
