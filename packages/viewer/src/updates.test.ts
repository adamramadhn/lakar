// State machine updater viewer (pola theme.test.ts: window/localStorage dipalsukan, modul dimuat ulang per tes).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isDesktop, parseUpdatePolicy, UPDATED_KEY, UPDATE_POLICY_KEY } from './updates.ts';

type Cmd = [cmd: string, args: Record<string, unknown> | undefined];

const META = { version: '0.10.0', currentVersion: '0.9.0', notes: 'Catatan rilis', pubDate: '2026-11-23T00:00:00Z' };

class FakeChannel {
  onmessage: (e: unknown) => void = () => {};
  static instances: FakeChannel[] = [];
  constructor() {
    FakeChannel.instances.push(this);
  }
}

/** Pasang __TAURI__.core tiruan; `responses` = cmd → nilai (throw = lempar). Mengembalikan log panggilan. */
function tauri(responses: Record<string, unknown | (() => unknown)>): Cmd[] {
  const calls: Cmd[] = [];
  FakeChannel.instances = [];
  vi.stubGlobal('window', {
    __TAURI__: {
      core: {
        Channel: FakeChannel,
        invoke: (cmd: string, args?: Record<string, unknown>) => {
          calls.push([cmd, args]);
          const r = responses[cmd];
          const v = typeof r === 'function' ? r() : r;
          return v instanceof Error ? Promise.reject(v) : Promise.resolve(v);
        },
      },
    },
  });
  return calls;
}

let store: Map<string, string>;

beforeEach(() => {
  vi.resetModules();
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

const load = () => import('./updates.ts');

describe('parseUpdatePolicy / isDesktop', () => {
  it('auto/ask dipakai, selain itu auto', () => {
    expect(parseUpdatePolicy('auto')).toBe('auto');
    expect(parseUpdatePolicy('ask')).toBe('ask');
    for (const v of ['manual', '', null, undefined, 1]) expect(parseUpdatePolicy(v)).toBe('auto');
  });
  it('isDesktop hanya bila __TAURI__.core.invoke ada', () => {
    tauri({});
    expect(isDesktop()).toBe(true);
    vi.unstubAllGlobals();
    expect(isDesktop()).toBe(false);
    expect(isDesktop({ __TAURI__: { core: {} } })).toBe(false);
  });
});

describe('checkForUpdate', () => {
  it('null → up-to-date tanpa update', async () => {
    const calls = tauri({ check_update: null });
    const u = await load();
    await u.checkForUpdate();
    expect(u.getUpdateState().status).toBe('up-to-date');
    expect(u.getUpdateState().update).toBeNull();
    expect(calls).toEqual([['check_update', undefined]]);
  });
  it('metadata → available dengan info update', async () => {
    tauri({ check_update: META });
    const u = await load();
    await u.checkForUpdate();
    expect(u.getUpdateState().status).toBe('available');
    expect(u.getUpdateState().update?.version).toBe('0.10.0');
  });
  it('gagal → failed dengan pesan; dicoba ulang bisa pulih', async () => {
    let ok = false;
    tauri({ check_update: () => (ok ? META : new Error('jaringan')) });
    const u = await load();
    await u.checkForUpdate();
    expect(u.getUpdateState().status).toBe('failed');
    expect(u.getUpdateState().error).toBe('jaringan');
    ok = true;
    await u.checkForUpdate();
    expect(u.getUpdateState().status).toBe('available');
  });
  it('tanpa __TAURI__ → no-op', async () => {
    const u = await load();
    await u.checkForUpdate();
    expect(u.getUpdateState().status).toBe('idle');
  });
});

describe('downloadUpdate', () => {
  it('progress lewat Channel; sukses → ready', async () => {
    const calls = tauri({ check_update: META, download_update: null });
    const u = await load();
    await u.checkForUpdate();
    const done = u.downloadUpdate();
    const channel = FakeChannel.instances.at(-1)!;
    channel.onmessage({ event: 'started', data: { contentLength: 100 } });
    channel.onmessage({ event: 'progress', data: { chunkLength: 40 } });
    channel.onmessage({ event: 'progress', data: { chunkLength: 60 } });
    channel.onmessage({ event: 'finished' });
    await done;
    expect(u.getUpdateState().status).toBe('ready');
    expect(u.getUpdateState().downloaded).toBe(100);
    expect(u.getUpdateState().total).toBe(100);
    const args = calls.find((c) => c[0] === 'download_update')?.[1];
    expect(args?.onProgress).toBe(channel);
  });
  it('gagal → failed tanpa banner (status bukan ready)', async () => {
    tauri({ check_update: META, download_update: new Error('unduhan gagal') });
    const u = await load();
    await u.checkForUpdate();
    await u.downloadUpdate();
    expect(u.getUpdateState().status).toBe('failed');
  });
  it('bukan dari available → tidak memanggil command', async () => {
    const calls = tauri({ check_update: null });
    const u = await load();
    await u.checkForUpdate();
    await u.downloadUpdate();
    expect(calls.map((c) => c[0])).toEqual(['check_update']);
  });
});

describe('installAndRelaunch', () => {
  it('ready → install_update + relaunch_app; penanda ditulis sebelum install', async () => {
    const calls = tauri({
      check_update: META,
      download_update: null,
      install_update: () => {
        // Penanda harus sudah ada saat install berjalan (Windows keluar di tengah install).
        expect(store.get(UPDATED_KEY)).toContain('0.10.0');
      },
      relaunch_app: null,
    });
    const u = await load();
    await u.checkForUpdate();
    await u.downloadUpdate();
    await u.installAndRelaunch();
    expect(calls.map((c) => c[0])).toEqual(['check_update', 'download_update', 'install_update', 'relaunch_app']);
    expect(JSON.parse(store.get(UPDATED_KEY)!)).toEqual({ version: '0.10.0', notes: 'Catatan rilis' });
  });
  it('gagal install → failed dan penanda dibersihkan', async () => {
    tauri({ check_update: META, install_update: new Error('gagal pasang') });
    const u = await load();
    await u.checkForUpdate();
    await u.installAndRelaunch();
    expect(u.getUpdateState().status).toBe('failed');
    expect(store.get(UPDATED_KEY)).toBeUndefined();
  });
});

describe('initUpdates + dismissUpdated', () => {
  it('versi tersimpan == versi berjalan → justUpdated; Dismiss menghapusnya', async () => {
    store.set(UPDATED_KEY, JSON.stringify({ version: '0.10.0', notes: 'n' }));
    tauri({ app_version: '0.10.0', check_update: null });
    const u = await load();
    u.initUpdates();
    await vi.waitFor(() => expect(u.getUpdateState().status).toBe('up-to-date'));
    expect(u.getUpdateState().justUpdated?.version).toBe('0.10.0');
    u.dismissUpdated();
    expect(u.getUpdateState().justUpdated).toBeUndefined();
    expect(store.get(UPDATED_KEY)).toBeUndefined();
  });
  it('versi tersimpan beda → penanda dibuang, tanpa banner', async () => {
    store.set(UPDATED_KEY, JSON.stringify({ version: '0.9.0' }));
    tauri({ app_version: '0.10.0', check_update: null });
    const u = await load();
    u.initUpdates();
    await vi.waitFor(() => expect(u.getUpdateState().status).toBe('up-to-date'));
    expect(u.getUpdateState().justUpdated).toBeUndefined();
    expect(store.get(UPDATED_KEY)).toBeUndefined();
  });
  it('kebijakan auto → download_update di latar; ask → berhenti di available', async () => {
    store.set(UPDATE_POLICY_KEY, 'auto');
    let calls = tauri({ app_version: '0.9.0', check_update: META, download_update: null });
    let u = await load();
    u.initUpdates();
    await vi.waitFor(() => expect(u.getUpdateState().status).toBe('ready'));
    expect(calls.map((c) => c[0])).toEqual(['app_version', 'check_update', 'download_update']);

    vi.resetModules();
    store.set(UPDATE_POLICY_KEY, 'ask');
    calls = tauri({ app_version: '0.9.0', check_update: META });
    u = await load();
    u.initUpdates();
    await vi.waitFor(() => expect(u.getUpdateState().status).toBe('available'));
    expect(calls.map((c) => c[0])).toEqual(['app_version', 'check_update']);
  });
  it('idempotent dan tanpa __TAURI__ tidak melakukan apa-apa', async () => {
    const u = await load();
    u.initUpdates();
    u.initUpdates();
    expect(u.getUpdateState().status).toBe('idle');
  });
});
