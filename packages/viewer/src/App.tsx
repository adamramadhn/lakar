// Kerangka aplikasi: title bar bertab (TitleBar.tsx), routing hash (`#/` Recents, `#/files`, `#/archive`,
// `#/settings/connections` Connections, `#/d/<slug>` Viewer; lihat `parseRoute` di files.ts), banner offline.
// Tab dokumen (aplikasi 7): daftar slug di localStorage (`TABS_KEY`); membuka dokumen menambah/mengaktifkan tabnya,
// Close lewat x / klik tengah / Ctrl/Cmd+W. Rename/archive/delete dari aplikasi (`api.onFileEvent`) ikut ke tab.
// Hanya Viewer tab aktif yang ter-mount; state tampilan per dokumen disimpan di viewState.ts.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api, connection } from './api';
import { Dashboard } from './Dashboard';
import { docHash, parseRoute, type Route } from './files';
import { NewFileDialog } from './NewFileDialog';
import { OfflineBanner } from './OfflineBanner';
import { applyFileEvent, closeTab, onOpenInNewTab, openTab, pruneTabs, readTabs, serializeTabs, TABS_KEY } from './tabs';
import { TitleBar } from './TitleBar';
import { dropViewState, moveViewState } from './viewState';
import { Viewer } from './Viewer';

/** Hash halaman Settings → Connections. */
export const CONNECTIONS_HASH = '#/settings/connections';

export const openDoc = (slug: string) => {
  location.hash = docHash(slug);
};
export const openDashboard = () => {
  location.hash = '#/';
};

function loadTabs(): string[] {
  try {
    return readTabs(localStorage.getItem(TABS_KEY));
  } catch {
    return [];
  }
}

/** Ganti hash tanpa entri history baru; `hashchange` tidak dipicu, jadi route diperbarui pemanggil. */
function replaceHash(hash: string) {
  history.replaceState(history.state, '', hash);
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  const [tabs, setTabs] = useState<string[]>(() => (route.name === 'viewer' ? openTab(loadTabs(), route.slug) : loadTabs()));
  const [menuOpen, setMenuOpen] = useState(false);
  const [creating, setCreating] = useState<ReadonlySet<string> | undefined>(undefined);
  const offline = useSyncExternalStore(connection.subscribe, connection.isOffline);
  const active = route.name === 'viewer' ? route.slug : undefined;
  // Ref untuk pendengar event (tanpa daftar ulang tiap render).
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute(location.hash));
      setMenuOpen(false);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Membuka dokumen (kartu, Open, hash) → tab aktif bila sudah ada, kalau belum ditambah di akhir.
  useEffect(() => {
    if (route.name === 'viewer') setTabs((t) => openTab(t, route.slug));
  }, [route]);

  useEffect(() => {
    try {
      localStorage.setItem(TABS_KEY, serializeTabs(tabs));
    } catch {
      // penyimpanan tidak tersedia: tab hanya untuk sesi ini
    }
  }, [tabs]);

  // Saat mulai: buang tab yang dokumennya sudah tidak ada (dokumen yang sedang tampil tetap, Viewer menampilkan error-nya).
  useEffect(() => {
    api.listDocs().then(
      (docs) => setTabs((t) => pruneTabs(t, new Set(docs.map((d) => d.slug)), activeRef.current)),
      () => {},
    );
  }, []);

  useEffect(() => {
    const titles: Record<Route['name'], string> = { recents: 'Lakar', files: 'Files · Lakar', archive: 'Archive · Lakar', connections: 'Connections · Lakar', viewer: 'Lakar' };
    document.title = route.name === 'viewer' ? `${route.slug} · Lakar` : titles[route.name];
  }, [route]);

  /** Terapkan daftar tab baru; `navigate` → tampilkan `next` (Dashboard bila undefined) tanpa entri history baru. */
  const apply = useCallback((next: string[], navigate: boolean, slug: string | undefined) => {
    tabsRef.current = next;
    setTabs(next);
    if (navigate) {
      const hash = slug !== undefined ? docHash(slug) : '#/';
      replaceHash(hash);
      setRoute(parseRoute(hash));
    }
  }, []);

  const close = useCallback(
    (slug: string) => {
      const r = closeTab(tabsRef.current, slug, activeRef.current);
      dropViewState(slug);
      // Tab tetangga atau Dashboard menggantikan entri history tab yang ditutup.
      apply(r.tabs, activeRef.current === slug, r.next);
    },
    [apply],
  );

  useEffect(() => onOpenInNewTab((slug) => setTabs((t) => openTab(t, slug))), []);

  // Rename/archive/delete dari aplikasi (keputusan di `applyFileEvent`). Perubahan oleh agen lewat MCP sengaja tidak disinkronkan.
  useEffect(
    () =>
      api.onFileEvent((e) => {
        const r = applyFileEvent(tabsRef.current, activeRef.current, e);
        if (r.view.type === 'move') moveViewState(r.view.from, r.view.to);
        else if (r.view.type === 'drop') dropViewState(r.view.slug);
        apply(r.tabs, r.navigate, r.next);
      }),
    [apply],
  );

  // Ctrl/Cmd+W menutup tab dokumen aktif. Abaikan auto-repeat, kolom ketik, dan dialog/menu terbuka.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'w') return;
      const slug = activeRef.current;
      const t = e.target;
      const editable = t instanceof HTMLElement && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable);
      if (slug === undefined || e.repeat || editable || document.querySelector('.modal-scrim, .menu-layer')) return;
      e.preventDefault();
      close(slug);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // "+": dialog New file. Slug terpakai (aktif + arsip) dimuat sekali; gagal → pratinjau mengandalkan server.
  const startNew = () => {
    setCreating(new Set());
    Promise.all([api.listDocs(), api.listArchive()]).then(
      ([docs, archive]) => setCreating((c) => (c ? new Set([...docs, ...archive].map((d) => d.slug)) : c)),
      () => {},
    );
  };

  return (
    <div className="app">
      <TitleBar tabs={tabs} active={active} onMenu={() => setMenuOpen((v) => !v)} onClose={close} onNew={startNew} />
      {offline && <OfflineBanner />}
      <main className="body">
        {route.name === 'viewer' ? (
          <Viewer key={route.slug} slug={route.slug} />
        ) : (
          <Dashboard page={route.name} menuOpen={menuOpen} onCloseMenu={() => setMenuOpen(false)} />
        )}
      </main>
      {creating && <NewFileDialog taken={creating} onClose={() => setCreating(undefined)} />}
    </div>
  );
}
