// Jembatan aplikasi desktop (Tauri): viewer mengenali `window.__TAURI__.core.invoke` (`withGlobalTauri`),
// pola yang sama dengan theme.ts `desktopInvoke` dan updates.ts. Di webview desktop `window.open` adalah
// no-op (new-window ditolak bawaan), jadi URL eksternal — mis. alur sign-in OAuth — dibuka di browser
// sistem lewat plugin opener (`plugin:opener|open_url`; izin `opener:default` di viewer-window.json).
// Tanpa impor relatif: modul ini aman dites langsung di Node.

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

/** `invoke` IPC Tauri bila viewer berjalan di aplikasi desktop; `undefined` di browser biasa. */
export function tauriInvoke(): Invoke | undefined {
  const g = typeof window !== 'undefined' ? window : undefined;
  const invoke = (g as { __TAURI__?: { core?: { invoke?: unknown } } } | undefined)?.__TAURI__?.core?.invoke;
  return typeof invoke === 'function' ? (invoke as Invoke) : undefined;
}

/** `true` di aplikasi desktop Tauri — `window.open` no-op di sana, jadi jangan buka jendela kosong. */
export const isDesktop = (): boolean => tauriInvoke() !== undefined;

/**
 * Buka `url` di browser sistem dari aplikasi desktop (plugin opener; hanya skema yang diizinkan
 * `opener:default` — http/https/mailto/tel). Tanpa `__TAURI__` → no-op (pemanggil browser memakai
 * `window.open` sendiri agar tetap dalam user activation).
 */
export async function openExternal(url: string): Promise<void> {
  await tauriInvoke()?.('plugin:opener|open_url', { url });
}

/**
 * Kembalikan fokus ke jendela Lakar sesudah sign-in OAuth selesai di browser (spec-first-run-signin
 * S5) — pengguna tidak perlu mencari jendela sendiri. Best-effort: tanpa `__TAURI__` atau izin
 * `core:window:allow-set-focus` tidak ada → no-op, error diabaikan.
 */
export async function focusWindow(): Promise<void> {
  try {
    const g = typeof window !== 'undefined' ? (window as { __TAURI__?: { window?: { getCurrentWindow?: () => { setFocus(): Promise<void> } } } }) : undefined;
    await g?.__TAURI__?.window?.getCurrentWindow?.().setFocus();
  } catch {
    // izin capability belum ada di build lama / platform menolak — abaikan
  }
}
