// Updater aplikasi desktop (spec story 8.10; desain Section 11 "Settings — Updates" + banner Recents): state
// machine + store pola theme.ts. Viewer memanggil command aplikasi (`app_version`, `check_update`,
// `download_update`, `install_update`, `relaunch_app`) lewat `__TAURI__.core.invoke` — bukan JS plugin
// updater, karena viewer adalah origin remote dan tidak menerima injeksi JS plugin. Di browser (tanpa
// `__TAURI__`) seluruh UI Updates disembunyikan (`isDesktop` = false).
// Bytes unduhan disimpan aplikasi (PendingUpdate di Rust): "Restart now" memasang tanpa mengunduh ulang.
// `UPDATED_KEY` disimpan SEBELUM install: di Windows install keluar dari aplikasi di tengah jalan, sehingga
// penanda "baru diperbarui" tidak bisa ditulis sesudahnya (dihapus lagi bila install gagal).
// Tanpa impor relatif (pola theme.ts/files.ts): berkas ini dites langsung di Node lewat tsconfig.test.json
// (moduleResolution nodenext), sedangkan bundel viewer memakai moduleResolution bundler.
import { useSyncExternalStore } from 'react';

export type UpdatePolicy = 'auto' | 'ask';
export type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'installing' | 'failed';

/** Metadata update dari command `check_update`/`download_update` (camelCase dari UpdateMetadata Rust). */
export interface UpdateInfo {
  version: string;
  currentVersion: string;
  notes?: string;
  pubDate?: string;
}

export interface UpdateState {
  status: UpdateStatus;
  /** Update yang pending di aplikasi; null di browser/belum dicek/up-to-date. */
  update: UpdateInfo | null;
  /** Detail kegagalan terakhir (ditampilkan di kartu Settings). */
  error: string | undefined;
  downloaded: number;
  total: number | undefined;
  /** Fase saat status `installing`: `download` selama bytes mengalir (jalur manual), `install` sesudahnya / jalur bytes. */
  installPhase: 'download' | 'install' | undefined;
  /** Versi aplikasi yang berjalan (`app_version`); undefined di browser/gagal. */
  appVersion: string | undefined;
  /** Aplikasi baru saja diperbarui (banner "Updated to Lakar x.y" sampai di-Dismiss). */
  justUpdated: { version: string; notes?: string } | undefined;
}

export const UPDATE_POLICY_KEY = 'lakar.viewer.updatePolicy';
export const UPDATED_KEY = 'lakar.viewer.updatedTo';

/** Nilai tersimpan → kebijakan; selain `auto`/`ask` → `auto` (unduh di latar, pemasangan tetap minta persetujuan). */
export function parseUpdatePolicy(v: unknown): UpdatePolicy {
  return v === 'auto' || v === 'ask' ? v : 'auto';
}

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

/** `invoke` IPC Tauri (global `window.__TAURI__.core`, `withGlobalTauri`); salinan dari theme.ts `desktopInvoke`. */
function desktopInvoke(g: unknown): Invoke | undefined {
  const invoke = (g as { __TAURI__?: { core?: { invoke?: unknown } } } | undefined)?.__TAURI__?.core?.invoke;
  return typeof invoke === 'function' ? (invoke as Invoke) : undefined;
}
type DownloadEvent =
  | { event: 'started'; data?: { contentLength?: number } }
  | { event: 'progress'; data?: { chunkLength?: number } }
  | { event: 'finished'; data?: unknown };
type Channel = { onmessage: (e: DownloadEvent) => void };
type ChannelCtor = new () => Channel;

function win(): unknown {
  return typeof window !== 'undefined' ? window : undefined;
}

function invoke(): Invoke | undefined {
  return desktopInvoke(win());
}

function newChannel(onmessage: (e: DownloadEvent) => void): Channel | undefined {
  const ctor = (win() as { __TAURI__?: { core?: { Channel?: unknown } } } | undefined)?.__TAURI__?.core?.Channel;
  if (typeof ctor !== 'function') return undefined;
  const channel = new (ctor as ChannelCtor)();
  channel.onmessage = onmessage;
  return channel;
}

/** True bila viewer berjalan di aplikasi desktop Tauri (UI Updates hanya bermakna di sana). */
export function isDesktop(g: unknown = win()): boolean {
  return desktopInvoke(g) !== undefined;
}

let state: UpdateState = { status: 'idle', update: null, error: undefined, downloaded: 0, total: undefined, installPhase: undefined, appVersion: undefined, justUpdated: undefined };
const listeners = new Set<() => void>();

function set(partial: Partial<UpdateState>) {
  state = { ...state, ...partial };
  for (const l of listeners) l();
}

export function subscribeUpdates(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const getUpdateState = (): UpdateState => state;

/** State updater reaktif (Settings → Updates, banner Recents). */
export function useUpdateState(): UpdateState {
  return useSyncExternalStore(subscribeUpdates, getUpdateState, getUpdateState);
}

export function getUpdatePolicy(): UpdatePolicy {
  try {
    return parseUpdatePolicy(localStorage.getItem(UPDATE_POLICY_KEY));
  } catch {
    return 'auto';
  }
}

export function setUpdatePolicy(p: UpdatePolicy): void {
  try {
    localStorage.setItem(UPDATE_POLICY_KEY, p);
  } catch {
    // penyimpanan tidak tersedia
  }
}

function readUpdated(): { version: string; notes?: string } | undefined {
  try {
    const raw = localStorage.getItem(UPDATED_KEY);
    if (!raw) return undefined;
    const v = JSON.parse(raw) as { version?: unknown; notes?: unknown };
    return typeof v.version === 'string' && v.version ? { version: v.version, ...(typeof v.notes === 'string' ? { notes: v.notes } : {}) } : undefined;
  } catch {
    return undefined;
  }
}

/** Simpan penanda "baru diperbarui ke versi ini" (dibaca saat init sesudah restart). */
function rememberUpdated(u: UpdateInfo) {
  try {
    localStorage.setItem(UPDATED_KEY, JSON.stringify({ version: u.version, ...(u.notes ? { notes: u.notes } : {}) }));
  } catch {
    // penyimpanan tidak tersedia
  }
}

function clearUpdated() {
  try {
    localStorage.removeItem(UPDATED_KEY);
  } catch {
    // penyimpanan tidak tersedia
  }
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const busy = () => state.status === 'checking' || state.status === 'downloading' || state.status === 'installing';

/** `check_update`: null → "up-to-date", metadata → "available" (update disimpan pending di aplikasi). */
export async function checkForUpdate(): Promise<void> {
  const call = invoke();
  if (!call || busy()) return;
  set({ status: 'checking', error: undefined });
  try {
    const meta = (await call('check_update')) as UpdateInfo | null;
    if (meta) set({ status: 'available', update: meta, downloaded: 0, total: undefined });
    else set({ status: 'up-to-date', update: null });
  } catch (e) {
    set({ status: 'failed', error: errText(e) });
  }
}

/** `download_update`: unduh di latar (kebijakan `auto`); sukses → "ready" (banner "Restart now" di Recents). */
export async function downloadUpdate(): Promise<void> {
  const call = invoke();
  if (!call || state.status !== 'available') return;
  set({ status: 'downloading', error: undefined, downloaded: 0, total: undefined });
  try {
    // Channel dibuat di dalam try: konstruktor yang melempar (core.Channel tidak ada) → status `failed`.
    const channel = newChannel(onDownloadEvent);
    await call('download_update', { onProgress: channel });
    set({ status: 'ready' });
  } catch (e) {
    set({ status: 'failed', error: errText(e) });
  }
}

/** `install_update` + `relaunch_app`: dari "ready" memasang bytes yang sudah terunduh; dari "available" unduh +
 * pasang dalam satu langkah (progress lewat Channel). Di Windows install keluar sendiri; relaunch dipanggil
 * untuk macOS/Linux. Penanda UPDATED_KEY ditulis sebelum install (lihat komentar berkas). */
export async function installAndRelaunch(): Promise<void> {
  const call = invoke();
  const update = state.update;
  if (!call || !update || (state.status !== 'available' && state.status !== 'ready')) return;
  // downloaded/total direset: jalur bytes (ready) tidak mengirim event channel, dan jalur manual dimulai dari nol
  // — tanpa reset kartu menampilkan progress unduhan sebelumnya yang basi. `installPhase` membedakan kedua jalur
  // untuk label kartu (download → install).
  set({ status: 'installing', error: undefined, downloaded: 0, total: undefined, installPhase: state.status === 'available' ? 'download' : 'install' });
  rememberUpdated(update);
  try {
    const channel = newChannel(onDownloadEvent);
    await call('install_update', { onProgress: channel });
    await call('relaunch_app');
  } catch (e) {
    clearUpdated();
    set({ status: 'failed', error: errText(e) });
  }
}

/** Tutup banner "Updated to Lakar x.y" permanen (penanda dihapus, tidak muncul lagi). */
export function dismissUpdated(): void {
  clearUpdated();
  set({ justUpdated: undefined });
}

function onDownloadEvent(e: DownloadEvent) {
  if (e.event === 'started') set({ total: e.data?.contentLength, downloaded: 0 });
  else if (e.event === 'progress') set({ downloaded: state.downloaded + (e.data?.chunkLength ?? 0) });
  else if (e.event === 'finished') set({ downloaded: state.total ?? state.downloaded, installPhase: 'install' });
}

let inited = false;

/**
 * Sekali saat App mount (idempotent): baca versi aplikasi + penanda "baru diperbarui", lalu cek update.
 * Kebijakan `auto` mengunduh update di latar (banner muncul saat siap; pemasangan tetap lewat tombol).
 * Di browser tidak melakukan apa-apa.
 */
export function initUpdates(): void {
  if (inited) return;
  inited = true;
  const call = invoke();
  if (!call) return;
  void (async () => {
    try {
      const appVersion = (await call('app_version')) as string;
      const saved = readUpdated();
      // Banner hanya bila versi tersimpan == versi berjalan; versi beda (gagal/rollback) → penanda dibuang.
      const justUpdated = saved && saved.version === appVersion ? saved : undefined;
      if (saved && !justUpdated) clearUpdated();
      set({ appVersion, justUpdated });
    } catch {
      // versi tidak diketahui: cek update tetap dicoba
    }
    await checkForUpdate();
    if (state.status === 'available' && getUpdatePolicy() === 'auto') void downloadUpdate();
  })();
}
