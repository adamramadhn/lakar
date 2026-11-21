// Dashboard — Recents (desain bagian 01) dan halaman Files / Archive (bagian 02): sidebar + grid/list dokumen.
// Thumbnail = screenshot board pertama (Thumb.tsx). Search sidebar dengan dropdown hasil (Search.tsx).
// Kelola file: tombol New file, context menu kartu (klik kanan / "…" / pintasan F2, Del, Ctrl D); daftar
// dimuat ulang lewat `api.onDocsChanged`. Halaman Settings → General (`#/settings`) dan Connections
// (`#/settings/connections`) memakai sidebar yang sama.
// Mobile (aplikasi 9, desain "Mobile — List/Grid"): tombol New file jadi ikon "+", list tanpa header dengan baris dua
// baris (nama + "Edited …") dan thumbnail besar; `.list-sub`/label disembunyikan/ditampilkan lewat CSS.
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { api, errorText, OfflineError, type DaemonStatus, type DocSummary } from './api';
import { openDoc } from './App';
import { FileMenu, type MenuTarget } from './FileMenu';
import { byName, CONNECTIONS_HASH, SETTINGS_HASH } from './files';
import { Connections, copyText } from './Connections';
import { HARNESSES } from './harnesses';
import { relativeTime } from './format';
import { useRetry } from './hooks';
import { Icon } from './icons';
import { NewFileDialog } from './NewFileDialog';
import { Search } from './Search';
import { SettingsGeneral, SettingsLayout } from './SettingsGeneral';
import { docSubtitle, Thumb } from './Thumb';

type View = 'grid' | 'list';
const VIEW_KEY = 'lakar.viewer.view';

function loadView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

export type DashboardPage = 'recents' | 'files' | 'archive' | 'settings' | 'connections';

/** Tombol "Copy MCP config" kartu sidebar: salin config Claude Code; entry MCP tidak ada → buka Connections. */
function CopyMcpConfig() {
  const [state, setState] = useState<'idle' | 'copied'>('idle');
  const copy = async () => {
    try {
      const { mcp } = await api.connections();
      if (!mcp) {
        location.hash = CONNECTIONS_HASH;
        return;
      }
      await copyText(HARNESSES[0]!.snippet(mcp));
      setState('copied');
      setTimeout(() => setState('idle'), 1500);
    } catch {
      location.hash = CONNECTIONS_HASH;
    }
  };
  return (
    <button type="button" className="btn small connect-copy" onClick={copy}>
      <Icon name={state === 'copied' ? 'circleCheck' : 'copy'} size={13} />
      {state === 'copied' ? 'Copied' : 'Copy MCP config'}
    </button>
  );
}

type MenuState = MenuTarget & { dialog?: 'rename' | 'delete' };

/** Kartu/baris file: klik membuka (arsip: membuka menu), klik kanan / "…" membuka menu, pintasan F2, Del, Ctrl D. */
function fileHandlers(archived: boolean, setMenu: (m: MenuState) => void, onDuplicate: (slug: string) => void) {
  return (d: DocSummary) => {
    const menuAt = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setMenu({ slug: d.slug, x: e.clientX, y: e.clientY });
    };
    const menuBelow = (e: MouseEvent<HTMLElement>) => {
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      setMenu({ slug: d.slug, x: r.left, y: r.bottom + 4 });
    };
    const open = (e: MouseEvent<HTMLElement>) => {
      if (!archived) return openDoc(d.slug);
      setMenu({ slug: d.slug, x: e.clientX, y: e.clientY });
    };
    const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      const r = e.currentTarget.getBoundingClientRect();
      const at = { slug: d.slug, x: r.left + 16, y: r.top + 16 };
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (archived) setMenu(at);
        else openDoc(d.slug);
      } else if (e.key === 'F2' && !archived) {
        e.preventDefault();
        setMenu({ ...at, dialog: 'rename' });
      } else if (e.key === 'Delete') {
        e.preventDefault();
        setMenu({ ...at, dialog: 'delete' });
      } else if (e.key.toLowerCase() === 'd' && (e.ctrlKey || e.metaKey) && !archived) {
        e.preventDefault();
        onDuplicate(d.slug);
      } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        e.preventDefault();
        setMenu(at);
      }
    };
    return { role: 'button' as const, tabIndex: 0, onClick: open, onContextMenu: menuAt, onKeyDown, menuBelow };
  };
}

function MoreButton({ onClick }: { onClick: (e: MouseEvent<HTMLElement>) => void }) {
  return (
    <button type="button" className="icon-btn more-btn" aria-label="More actions" aria-haspopup="menu" onClick={onClick} onKeyDown={(e) => e.stopPropagation()}>
      <Icon name="ellipsis" size={16} />
    </button>
  );
}

const TITLES: Record<Exclude<DashboardPage, 'settings' | 'connections'>, string> = { recents: 'Recents', files: 'Files', archive: 'Archive' };

export function Dashboard({ page = 'recents', menuOpen, onCloseMenu }: { page?: DashboardPage; menuOpen: boolean; onCloseMenu: () => void }) {
  const [docs, setDocs] = useState<DocSummary[] | undefined>(undefined);
  const [archive, setArchive] = useState<DocSummary[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<DaemonStatus | undefined>(undefined);
  const [view, setView] = useState<View>(loadView);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<MenuState | undefined>(undefined);
  /** Nama awal dialog New file; `undefined` = dialog tertutup. */
  const [creating, setCreating] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const archivedPage = page === 'archive';
  const settingsPage = page === 'settings' || page === 'connections';

  const load = useCallback(() => {
    setError(undefined);
    const fail = (e: unknown) => {
      if (!(e instanceof OfflineError)) setError(errorText(e));
    };
    api.listDocs().then(setDocs, fail);
    if (page === 'archive') api.listArchive().then(setArchive, fail);
    api.status().then(setStatus, () => {});
  }, [page]);
  useEffect(load, [load]);
  useRetry(load);
  // Kelola file dari aplikasi → daftar langsung diperbarui tanpa reload.
  useEffect(() => api.onDocsChanged(load), [load]);
  // Dokumen baru dari agen muncul saat tab kembali aktif.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);
  useEffect(() => setMenu(undefined), [page]);

  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // penyimpanan tidak tersedia: tetap jalan
    }
  };

  const list = archivedPage ? archive : docs;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = (list ?? []).filter((d) => d.slug.includes(q));
    return page === 'files' ? byName(hit) : hit;
  }, [list, query, page]);
  // Slug arsip juga terpakai (server memberi sufiks agar Unarchive tidak bentrok); arsip hanya diketahui bila sudah
  // dimuat, selain itu pratinjau mengandalkan hasil server.
  const taken = useMemo(() => new Set([...(docs ?? []), ...(archive ?? [])].map((d) => d.slug)), [docs, archive]);
  const duplicate = useCallback((slug: string) => {
    api.duplicateFile(slug).catch((e: unknown) => setNotice(errorText(e)));
  }, []);
  const handlers = fileHandlers(archivedPage, setMenu, duplicate);

  const newFileBtn = (
    <button type="button" className="btn primary new-file-btn" aria-label="New file" onClick={() => setCreating('Untitled')}>
      <Icon name="plus" size={14} />
      <span className="btn-label">New file</span>
    </button>
  );

  return (
    <div className="dashboard">
      {menuOpen && <div className="scrim" onClick={onCloseMenu} />}
      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <div className="sidebar-top">
          <div className="profile">
            <span className="avatar">L</span>
            <span className="profile-name">Lakar</span>
          </div>
          <Search docs={error || archivedPage ? undefined : docs} query={query} onQuery={setQuery} onCreate={setCreating} />
          <nav className="nav">
            <a className={`nav-item${page === 'recents' ? ' active' : ''}`} href="#/">
              <Icon name="clock" size={16} />
              <span>Recents</span>
            </a>
          </nav>
        </div>
        <div className="sidebar-section">
          <div className="nav-item static">
            <Icon name="layers" size={16} />
            <span className="nav-strong">Local workspace</span>
            <span className="badge">Local</span>
          </div>
          <a className={`nav-item${page === 'files' ? ' active' : ''}`} href="#/files">
            <Icon name="file" size={16} />
            <span>Files</span>
          </a>
          <a className={`nav-item${page === 'archive' ? ' active' : ''}`} href="#/archive">
            <Icon name="archive" size={16} />
            <span>Archive</span>
          </a>
          <a className={`nav-item${settingsPage ? ' active' : ''}`} href={SETTINGS_HASH}>
            <Icon name="settings" size={16} />
            <span>Settings</span>
          </a>
        </div>
        <div className="connect-card">
          <div className="connect-title">
            <Icon name="plug" size={14} />
            Connect an agent
          </div>
          <p>Point Claude Code, Codex, or any ACP harness at the lakar MCP server. Designs show up here as the agent works.</p>
          <div className="connect-actions">
            <CopyMcpConfig />
            <a className="link-btn" href={CONNECTIONS_HASH}>
              All harnesses
            </a>
          </div>
        </div>
        <div className="sidebar-spacer" />
        <footer className="sidebar-footer">{status ? `lakard ${status.version} · ${status.host}:${status.port}` : 'lakard'}</footer>
      </aside>

      {settingsPage ? (
        <SettingsLayout tab={page === 'connections' ? 'connections' : 'general'}>{page === 'connections' ? <Connections /> : <SettingsGeneral />}</SettingsLayout>
      ) : (
        <section className="main">
          <div className="main-header">
            <h1>{TITLES[page]}</h1>
            <div className="spacer" />
            {!archivedPage && newFileBtn}
            {!(archivedPage && archive?.length === 0) && (
              <div className="view-toggle" role="group" aria-label="View">
                <button type="button" className={view === 'grid' ? 'active' : ''} aria-pressed={view === 'grid'} aria-label="Grid view" onClick={() => changeView('grid')}>
                  <Icon name="layoutGrid" />
                </button>
                <button type="button" className={view === 'list' ? 'active' : ''} aria-pressed={view === 'list'} aria-label="List view" onClick={() => changeView('list')}>
                  <Icon name="list" />
                </button>
              </div>
            )}
          </div>

          {notice && (
            <div className="notice" role="alert">
              <Icon name="alert" size={14} />
              <span>{notice}</span>
              <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setNotice(undefined)}>
                <Icon name="x" size={12} />
              </button>
            </div>
          )}

          {error ? (
            <div className="empty-state">
              <Icon name="alert" size={22} />
              <strong>Couldn't load documents</strong>
              <span>{error}</span>
              <button type="button" className="btn" onClick={load}>
                <Icon name="refresh" size={14} /> Try again
              </button>
            </div>
          ) : list === undefined ? (
            <div className="file-grid" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="card loading">
                  <div className="card-header">
                    <div className="skeleton line" />
                    <div className="skeleton line short" />
                  </div>
                  <div className="thumb large">
                    <div className="skeleton" />
                  </div>
                </div>
              ))}
            </div>
          ) : list.length === 0 ? (
            archivedPage ? (
              <div className="empty-state archive-empty">
                <span className="empty-icon">
                  <Icon name="archive" size={20} />
                </span>
                <strong>Nothing in archive</strong>
                <span>Archived files are hidden from Recents. You can restore them anytime.</span>
                <a className="btn" href="#/files">
                  <Icon name="file" size={14} /> Go to Files
                </a>
              </div>
            ) : (
              <div className="empty-state">
                <Icon name="file" size={22} />
                <strong>No designs yet</strong>
                <span>Create a file, or ask your agent to create one with the lakar MCP tools. It will appear here.</span>
                {newFileBtn}
              </div>
            )
          ) : shown.length === 0 ? (
            <div className="empty-state">
              <Icon name="search" size={22} />
              <strong>No results for “{query}”</strong>
              <span>Try a different name.</span>
              {!archivedPage && newFileBtn}
            </div>
          ) : view === 'grid' ? (
            <div className="file-grid">
              {shown.map((d) => {
                const { menuBelow, ...h } = handlers(d);
                return (
                  <div key={d.slug} className={`card${menu?.slug === d.slug ? ' menu-open' : ''}`} aria-label={d.slug} {...h}>
                    <div className="card-header">
                      <div className="card-title-row">
                        <span className="card-title">{d.slug}</span>
                        <MoreButton onClick={menuBelow} />
                      </div>
                      <span className="card-subtitle">{docSubtitle(d)}</span>
                    </div>
                    <Thumb doc={d} size="large" archived={archivedPage} />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="file-list" role="list">
              <div className="list-head">
                <span>Name</span>
                <span>Boards</span>
                <span>Revision</span>
                <span>Updated</span>
                <span />
              </div>
              {shown.map((d) => {
                const { menuBelow, ...h } = handlers(d);
                return (
                  <div key={d.slug} role="listitem">
                    <div className={`list-row${menu?.slug === d.slug ? ' menu-open' : ''}`} aria-label={d.slug} {...h}>
                      <span className="list-name">
                        <Thumb doc={d} size="mini" archived={archivedPage} />
                        <span className="list-text">
                          <span className="list-title">{d.slug}</span>
                          <span className="list-sub">Edited {relativeTime(d.updatedAt)}</span>
                        </span>
                      </span>
                      <span>{d.boardCount}</span>
                      <span className="mono">r{d.rev}</span>
                      <span>{relativeTime(d.updatedAt)}</span>
                      <MoreButton onClick={menuBelow} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
      {menu && (
        <FileMenu
          key={`${menu.slug}:${menu.x}:${menu.y}:${menu.dialog ?? ''}`}
          target={menu}
          {...(menu.dialog ? { dialog: menu.dialog } : {})}
          archived={archivedPage}
          port={status?.port}
          onClose={() => setMenu(undefined)}
          onError={setNotice}
        />
      )}
      {creating !== undefined && <NewFileDialog taken={taken} initialName={creating} onClose={() => setCreating(undefined)} />}
    </div>
  );
}
