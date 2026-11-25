// State tampilan per dokumen (memori sesi, bukan localStorage): pindah tab me-remount Viewer, jadi halaman aktif,
// node terpilih, tab panel kanan, dan kamera per halaman disimpan di sini lalu dipulihkan saat tab dibuka lagi.

export type Camera = { x: number; y: number; z: number };
export type PanelTab = 'activity' | 'design' | 'prototype' | 'history';

export type ViewState = {
  pageIndex: number;
  selectedId: string | undefined;
  panel: PanelTab;
  /** Kamera kanvas per id halaman. */
  cameras: Map<string, Camera>;
};

const states = new Map<string, ViewState>();

const fresh = (): ViewState => ({ pageIndex: 0, selectedId: undefined, panel: 'activity', cameras: new Map() });

export const getViewState = (slug: string): ViewState | undefined => states.get(slug);

function entry(slug: string): ViewState {
  let s = states.get(slug);
  if (!s) {
    s = fresh();
    states.set(slug, s);
  }
  return s;
}

/** Simpan halaman, seleksi, dan tab panel kanan. */
export function saveViewState(slug: string, v: { pageIndex: number; selectedId: string | undefined; panel: PanelTab }) {
  const s = entry(slug);
  s.pageIndex = v.pageIndex;
  s.selectedId = v.selectedId;
  s.panel = v.panel;
}

export const getCamera = (slug: string, pageId: string): Camera | undefined => states.get(slug)?.cameras.get(pageId);

export function saveCamera(slug: string, pageId: string, cam: Camera) {
  entry(slug).cameras.set(pageId, cam);
}

/** Rename file: state ikut ke slug baru (state lama di slug baru, bila ada, ditimpa). */
export function moveViewState(from: string, to: string) {
  const s = states.get(from);
  states.delete(from);
  if (s) states.set(to, s);
  else states.delete(to);
}

/** Tab ditutup / file diarsip atau dihapus. */
export function dropViewState(slug: string) {
  states.delete(slug);
}
