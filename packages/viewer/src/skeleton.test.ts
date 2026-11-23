// Placeholder skeleton (spec-skeleton-live-build): pilihan placeholder, CSS shadow root, dan deteksi "baru diisi".
import { describe, expect, it } from 'vitest';
import type { ResolvedBoardNode } from '@lakar/schema';
import { FOLLOW_SETTLE_MS, followWait, regionInView, regionTouchesView } from './agentEffects.ts';
import { filledSince, SKELETON_FILL_MS, SKELETON_STAGGER_MS, SKELETON_SWEEP_MS, skeletonCss, skeletonEntries, skeletonLabel } from './skeleton.ts';

const fr = (id: string, name: string, children: unknown[] = []) => ({ type: 'frame', id, name, children });
const board = (children: unknown[]) => ({ type: 'board', id: 'Board001', name: '[WIP] B', children }) as unknown as ResolvedBoardNode;

describe('skeletonEntries / skeletonLabel', () => {
  it('placeholder teratas dalam urutan dokumen; isi placeholder tidak dihitung; label tanpa prefiks dan "Seksi / "', () => {
    const b = board([fr('Halaman1', 'Halaman', [fr('Skel0001', '[Skeleton] Navbar'), fr('Skel0002', '[Skeleton] Seksi / Jadwal sangrai', [fr('Skel0003', '[Skeleton] Dalam')]), fr('Hero0001', 'Seksi / Hero')])]);
    expect(skeletonEntries(b)).toEqual([
      { id: 'Skel0001', label: 'Navbar' },
      { id: 'Skel0002', label: 'Jadwal sangrai' },
    ]);
    expect(skeletonEntries(undefined)).toEqual([]);
    expect(skeletonLabel('[Skeleton] ')).toBe('Section');
  });
});

describe('skeletonCss', () => {
  it('kosong tanpa placeholder dan tanpa yang baru diisi', () => {
    expect(skeletonCss([])).toBe('');
  });

  it('sapuan transform saja, ≤ 3 dtk, stagger per placeholder, hanya saat Generating; label di-escape', () => {
    const css = skeletonCss([
      { id: 'Skel0001', label: 'Hero' },
      { id: 'Skel0002', label: 'Kata "kutip" \\ baris\nbaru' },
    ]);
    expect(SKELETON_SWEEP_MS).toBeLessThanOrEqual(3000);
    expect(css).toContain(`animation:lakar-skel-sweep ${SKELETON_SWEEP_MS}ms linear 0ms infinite`);
    expect(css).toContain(`animation:lakar-skel-sweep ${SKELETON_SWEEP_MS}ms linear ${SKELETON_STAGGER_MS}ms infinite`);
    expect(css).toContain('content:"Kata \\"kutip\\" \\\\ baris baru"');
    // Keyframes hanya transform/opacity.
    for (const m of css.matchAll(/@keyframes [\w-]+\{(.*)\}/g)) expect(m[1]!.replace(/(transform|opacity):[^;}]+/g, '')).not.toMatch(/[a-z-]+:/);
    expect(css.match(/::after\{/g)).toHaveLength(3); // 2 sapuan + blok reduced motion
    expect(css).toMatch(/:host\(\[data-generating\]\) \[data-lakar-id="Skel0001"\]::after/);
  });

  it('baru diisi: tint memudar sekali, tanpa label; reduced motion mematikannya', () => {
    const css = skeletonCss([], ['Skel0001']);
    expect(css).toContain(`[data-lakar-id="Skel0001"]::before{`);
    expect(css).toContain(`animation:lakar-skel-out ${SKELETON_FILL_MS}ms cubic-bezier(.16,1,.3,1) forwards`);
    expect(css).toMatch(/@media \(prefers-reduced-motion:reduce\)\{\[data-lakar-id="Skel0001"\]::before\{display:none/);
  });
});

describe('filledSince', () => {
  it('placeholder sebelumnya yang masih ada tetapi bukan placeholder lagi', () => {
    const now = [{ id: 'Skel0002', label: 'Menu' }];
    expect(filledSince(new Set(['Skel0001', 'Skel0002', 'Gone0001']), now, (id: string) => id !== 'Gone0001')).toEqual(['Skel0001']);
    expect(filledSince(new Set(), now, () => true)).toEqual([]);
  });
});

describe('Follow berirama (regionInView, regionTouchesView, followWait)', () => {
  const cam = { x: 0, y: 0, z: 1 };
  it('blok kecil harus terlihat utuh; blok tinggi cukup ≥ 40% viewport; lebar cukup 80%', () => {
    expect(regionInView({ x: 0, y: 100, width: 400, height: 60 }, cam, 800, 600)).toBe(true);
    expect(regionInView({ x: 0, y: 570, width: 400, height: 60 }, cam, 800, 600)).toBe(false);
    expect(regionInView({ x: 0, y: 300, width: 400, height: 900 }, cam, 800, 600)).toBe(true);
    expect(regionInView({ x: 0, y: 450, width: 400, height: 900 }, cam, 800, 600)).toBe(false);
    expect(regionInView({ x: -100, y: 100, width: 1440, height: 200 }, cam, 800, 600)).toBe(true);
    expect(regionInView({ x: -900, y: 100, width: 1440, height: 200 }, cam, 800, 600)).toBe(false);
  });
  it('board beririsan viewport', () => {
    expect(regionTouchesView({ x: 0, y: 500, width: 400, height: 2000 }, cam, 800, 600)).toBe(true);
    expect(regionTouchesView({ x: 0, y: 700, width: 400, height: 2000 }, cam, 800, 600)).toBe(false);
  });
  it('geseran berjarak ≥ FOLLOW_SETTLE_MS', () => {
    expect(followWait(undefined, 5000)).toBe(0);
    expect(followWait(5000, 5400)).toBe(FOLLOW_SETTLE_MS - 400);
    expect(followWait(5000, 5000 + FOLLOW_SETTLE_MS + 1)).toBe(0);
  });
});
