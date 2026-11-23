// Logika sidebar Viewer yang bisa dilipat: shortcut dan aturan toggle (spec-viewer-collapsible-panels).
import { describe, expect, it } from 'vitest';
import { shortcutAction } from './editActions.ts';
import { sidebarShortcut, toggleBoth, toggleSide } from './sidebars.ts';

const key = (code: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  key: '',
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('sidebarShortcut', () => {
  it('Ctrl/⌘+\\ = keduanya; Ctrl/⌘+Alt+[ / ] = kiri / kanan', () => {
    expect(sidebarShortcut(key('Backslash', { ctrlKey: true }))).toBe('both');
    expect(sidebarShortcut(key('Backslash', { metaKey: true }))).toBe('both');
    expect(sidebarShortcut(key('BracketLeft', { ctrlKey: true, altKey: true }))).toBe('left');
    expect(sidebarShortcut(key('BracketRight', { metaKey: true, altKey: true }))).toBe('right');
  });

  it('tanpa modifier, dengan Shift, atau Ctrl+[ tanpa Alt bukan shortcut sidebar', () => {
    expect(sidebarShortcut(key('Backslash'))).toBeUndefined();
    expect(sidebarShortcut(key('Backslash', { ctrlKey: true, shiftKey: true }))).toBeUndefined();
    expect(sidebarShortcut(key('BracketLeft', { ctrlKey: true }))).toBeUndefined();
    expect(sidebarShortcut(key('Backslash', { ctrlKey: true, altKey: true }))).toBeUndefined();
  });

  it('tidak bentrok dengan shortcut aksi edit', () => {
    for (const k of [key('Backslash', { ctrlKey: true }), key('BracketLeft', { ctrlKey: true, altKey: true }), key('BracketRight', { ctrlKey: true, altKey: true })]) {
      expect(shortcutAction(k)).toBeUndefined();
    }
  });
});

describe('toggle', () => {
  it('toggleSide membalik satu sisi', () => {
    expect(toggleSide({ left: false, right: false }, 'left')).toEqual({ left: true, right: false });
    expect(toggleSide({ left: true, right: true }, 'right')).toEqual({ left: true, right: false });
  });

  it('toggleBoth: ada yang terbuka → lipat keduanya; keduanya dilipat → buka keduanya', () => {
    expect(toggleBoth({ left: false, right: false })).toEqual({ left: true, right: true });
    expect(toggleBoth({ left: true, right: false })).toEqual({ left: true, right: true });
    expect(toggleBoth({ left: true, right: true })).toEqual({ left: false, right: false });
  });
});
