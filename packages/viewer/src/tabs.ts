// Logika murni daftar tab dokumen di title bar (tanpa React/DOM, tanpa impor relatif: dites langsung di Node).
// Daftar = slug berurutan, tanpa duplikat; disimpan App di localStorage (`TABS_KEY`) sebagai array JSON.

export const TABS_KEY = 'lakar.viewer.tabs';

/** Isi localStorage → daftar tab. JSON rusak / bukan array string → `[]`; duplikat dibuang. */
export function readTabs(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed) || !parsed.every((s): s is string => typeof s === 'string' && s.length > 0)) return [];
  return [...new Set(parsed)];
}

export const serializeTabs = (tabs: readonly string[]): string => JSON.stringify(tabs);

/** Buka `slug`: sudah ada → daftar sama (referensi sama), belum → ditambah di akhir. */
export function openTab(tabs: readonly string[], slug: string): string[] {
  return tabs.includes(slug) ? (tabs as string[]) : [...tabs, slug];
}

/**
 * Tutup `slug`. `next` = slug yang tampil sesudahnya (`undefined` = Dashboard): bila yang ditutup tab aktif →
 * tetangga kanan, lalu kiri, lalu Dashboard; bila bukan → `active` tetap.
 */
export function closeTab(tabs: readonly string[], slug: string, active: string | undefined): { tabs: string[]; next: string | undefined } {
  const i = tabs.indexOf(slug);
  const rest = tabs.filter((s) => s !== slug);
  if (slug !== active) return { tabs: rest, next: active };
  if (i < 0) return { tabs: rest, next: undefined };
  return { tabs: rest, next: tabs[i + 1] ?? tabs[i - 1] };
}

/** Rename `from` → `to` di tempat; `to` yang sudah ada di posisi lain dibuang (tanpa duplikat). */
export function renameTab(tabs: readonly string[], from: string, to: string): string[] {
  if (from === to || !tabs.includes(from)) return tabs as string[];
  return tabs.filter((s) => s !== to).map((s) => (s === from ? to : s));
}

/** Buang tab yang slug-nya tidak ada di `existing`; `keep` (mis. dokumen yang sedang tampil) dipertahankan. */
export function pruneTabs(tabs: readonly string[], existing: ReadonlySet<string>, keep?: string): string[] {
  const next = tabs.filter((s) => s === keep || existing.has(s));
  return next.length === tabs.length ? (tabs as string[]) : next;
}

/** Event kelola file dari aplikasi (bentuk sama dengan `FileEvent` api.ts; disalin agar tabs.ts tanpa impor relatif). */
export type TabFileEvent = ({ type: 'rename'; from: string; to: string } | { type: 'archive'; slug: string } | { type: 'delete'; slug: string; archived: boolean }) & {
  /** Terjadi di jendela lain. */
  remote?: boolean;
};

export type FileEventResult = {
  tabs: string[];
  /** Route aktif berubah: `next` = slug yang tampil (`undefined` = Dashboard). */
  navigate: boolean;
  next: string | undefined;
  /** Aksi state tampilan (viewState.ts). */
  view: { type: 'move'; from: string; to: string } | { type: 'drop'; slug: string } | { type: 'none' };
};

/**
 * Akibat rename/archive/delete pada tab. Rename → tab diganti di tempat, state tampilan ikut pindah, route ikut bila
 * aktif. Archive / delete file aktif (bukan arsip) → tab ditutup seperti `closeTab`, state tampilan dibuang.
 * Delete salinan arsip → tidak ada perubahan (slug arsip bukan tab). Archive/delete dari jendela lain pada tab
 * aktif → tab dibiarkan: Viewer menampilkan pesan dengan jalan kembali (`requestCloseTab`), bukan berpindah diam-diam.
 */
export function applyFileEvent(tabs: readonly string[], active: string | undefined, e: TabFileEvent): FileEventResult {
  if (e.type === 'rename') {
    const moving = active === e.from;
    return { tabs: renameTab(tabs, e.from, e.to), navigate: moving, next: moving ? e.to : active, view: { type: 'move', from: e.from, to: e.to } };
  }
  if (e.type === 'delete' && e.archived) return { tabs: tabs as string[], navigate: false, next: active, view: { type: 'none' } };
  if (e.remote && e.slug === active) return { tabs: tabs as string[], navigate: false, next: active, view: { type: 'none' } };
  const r = closeTab(tabs, e.slug, active);
  return { tabs: r.tabs, navigate: active === e.slug, next: r.next, view: { type: 'drop', slug: e.slug } };
}

// ---- "Open in new tab": bus kecil tanpa React (FileMenu memancarkan, App mendengar) ----

const newTabListeners = new Set<(slug: string) => void>();

/** Tambah tab dokumen tanpa berpindah halaman (context menu kartu). */
export function openInNewTab(slug: string) {
  for (const l of newTabListeners) l(slug);
}

/** Dengarkan permintaan "Open in new tab"; kembalikan fungsi pelepas. */
export function onOpenInNewTab(l: (slug: string) => void): () => void {
  newTabListeners.add(l);
  return () => {
    newTabListeners.delete(l);
  };
}

// ---- "Tutup tab lalu buka X": bus kecil tanpa React (Viewer memancarkan, App mendengar) ----

const closeListeners = new Set<(slug: string, hash: string) => void>();

/** Tutup tab `slug` lalu tampilkan `hash` (mis. `#/` Dashboard, `#/archive`). */
export function requestCloseTab(slug: string, hash: string) {
  for (const l of closeListeners) l(slug, hash);
}

/** Dengarkan permintaan tutup tab; kembalikan fungsi pelepas. */
export function onRequestCloseTab(l: (slug: string, hash: string) => void): () => void {
  closeListeners.add(l);
  return () => {
    closeListeners.delete(l);
  };
}
