// Tema viewer: nilai tersimpan, resolusi system, dan penerapan atribut `data-theme` (global DOM dipalsukan).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { desktopInvoke, parseTheme, resolveTheme } from './theme.ts';

describe('desktopInvoke', () => {
  it('hanya bila __TAURI__.core.invoke berupa fungsi', () => {
    const invoke = () => Promise.resolve();
    expect(desktopInvoke({ __TAURI__: { core: { invoke } } })).toBe(invoke);
    for (const g of [undefined, null, {}, { __TAURI__: {} }, { __TAURI__: { core: { invoke: 'x' } } }]) {
      expect(desktopInvoke(g)).toBeUndefined();
    }
  });
});

describe('parseTheme / resolveTheme', () => {
  it('nilai sah dipakai, selain itu system', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('system')).toBe('system');
    for (const v of ['blue', '', null, undefined, 1, 'Dark']) expect(parseTheme(v)).toBe('system');
  });
  it('system mengikuti OS; light/dark tidak', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('initTheme / setTheme', () => {
  let store: Map<string, string>;
  let throwOnAccess: boolean;
  let osDark: boolean;
  let mqListeners: (() => void)[];
  let winListeners: Map<string, ((e: unknown) => void)[]>;
  const html = { dataset: {} as Record<string, string> };

  beforeEach(() => {
    vi.resetModules();
    store = new Map();
    throwOnAccess = false;
    osDark = false;
    mqListeners = [];
    winListeners = new Map();
    html.dataset = {};
    const guard = () => {
      if (throwOnAccess) throw new Error('SecurityError');
    };
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (guard(), store.get(k) ?? null),
      setItem: (k: string, v: string) => (guard(), void store.set(k, v)),
    });
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return osDark;
      },
      addEventListener: (_: string, l: () => void) => mqListeners.push(l),
    }));
    vi.stubGlobal('document', { documentElement: html });
    vi.stubGlobal('window', {
      addEventListener: (t: string, l: (e: unknown) => void) => winListeners.set(t, [...(winListeners.get(t) ?? []), l]),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const load = () => import('./theme.ts');

  it('tersimpan light → terang walau OS gelap', async () => {
    store.set('lakar.viewer.theme', 'light');
    osDark = true;
    const t = await load();
    t.initTheme();
    expect(html.dataset.theme).toBe('light');
    expect(t.getThemePref()).toBe('light');
  });

  it('nilai rusak atau akses melempar → system', async () => {
    store.set('lakar.viewer.theme', 'blue');
    osDark = true;
    let t = await load();
    t.initTheme();
    expect(t.getThemePref()).toBe('system');
    expect(html.dataset.theme).toBe('dark');

    vi.resetModules();
    throwOnAccess = true;
    t = await load();
    t.initTheme();
    expect(t.getThemePref()).toBe('system');
    t.setTheme('dark'); // simpan gagal → tetap diterapkan
    expect(html.dataset.theme).toBe('dark');
  });

  it('system ikut perubahan OS; setTheme menyimpan dan memberi tahu', async () => {
    const t = await load();
    t.initTheme();
    expect(html.dataset.theme).toBe('light');
    osDark = true;
    for (const l of mqListeners) l();
    expect(html.dataset.theme).toBe('dark');

    expect(t.getThemePref()).toBe('system');
    t.setTheme('light');
    expect(t.getThemePref()).toBe('light');
    expect(store.get('lakar.viewer.theme')).toBe('light');
    expect(html.dataset.theme).toBe('light');
    for (const l of mqListeners) l(); // OS berubah tidak memengaruhi pilihan tetap
    expect(html.dataset.theme).toBe('light');
  });

  it('subscribeTheme: sekali per perubahan, termasuk storage key null', async () => {
    const t = await load();
    t.initTheme();
    let calls = 0;
    const stop = t.subscribeTheme(() => calls++);
    t.setTheme('dark');
    expect(calls).toBe(1);
    t.setTheme('dark');
    expect(calls).toBe(1);
    store.set('lakar.viewer.theme', 'light');
    for (const l of winListeners.get('storage') ?? []) l({ key: null });
    expect(calls).toBe(2);
    expect(t.getThemePref()).toBe('light');
    stop();
    t.setTheme('dark');
    expect(calls).toBe(2);
  });

  it('aplikasi desktop: pilihan dikirim ke set_ui_theme saat mulai dan saat berubah', async () => {
    const calls: unknown[] = [];
    const win = globalThis.window as unknown as Record<string, unknown>;
    win.__TAURI__ = { core: { invoke: (cmd: string, args: unknown) => (calls.push([cmd, args]), Promise.resolve()) } };
    store.set('lakar.viewer.theme', 'dark');
    const t = await load();
    t.initTheme();
    expect(calls).toEqual([['set_ui_theme', { theme: 'dark' }]]);
    t.setTheme('dark'); // tidak berubah → tidak dikirim lagi
    t.setTheme('system');
    expect(calls).toEqual([
      ['set_ui_theme', { theme: 'dark' }],
      ['set_ui_theme', { theme: 'system' }],
    ]);
  });

  it('aplikasi desktop: invoke menolak atau melempar → tema tetap diterapkan', async () => {
    const win = globalThis.window as unknown as Record<string, unknown>;
    win.__TAURI__ = {
      core: {
        invoke: (_: string, args: { theme: string }) => {
          if (args.theme === 'light') throw new Error('IPC');
          return Promise.reject(new Error('not allowed'));
        },
      },
    };
    const t = await load();
    t.initTheme();
    t.setTheme('light');
    expect(html.dataset.theme).toBe('light');
    t.setTheme('dark');
    expect(html.dataset.theme).toBe('dark');
  });

  it('perubahan dari tab lain (storage) ikut diterapkan', async () => {
    const t = await load();
    t.initTheme();
    store.set('lakar.viewer.theme', 'dark');
    for (const l of winListeners.get('storage') ?? []) l({ key: 'lakar.viewer.theme' });
    expect(t.getThemePref()).toBe('dark');
    expect(html.dataset.theme).toBe('dark');
    // kunci lain diabaikan
    store.set('lakar.viewer.theme', 'light');
    for (const l of winListeners.get('storage') ?? []) l({ key: 'lakar.viewer.view' });
    expect(t.getThemePref()).toBe('dark');
  });
});
