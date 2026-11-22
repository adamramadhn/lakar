// Dashboard — Recents (desain bagian 01): sidebar + grid/list dokumen. Thumbnail = screenshot board pertama,
// dirender malas (hanya kartu yang terlihat) dan di-cache per `slug@rev`. Halaman Settings → Connections
// (`#/settings/connections`) memakai sidebar yang sama.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorText, OfflineError, type DaemonStatus, type DocSummary } from './api';
import { CONNECTIONS_HASH, openDoc } from './App';
import { Connections, copyText } from './Connections';
import { HARNESSES } from './harnesses';
import { relativeTime } from './format';
import { useRetry, useSeen } from './hooks';
import { Icon } from './icons';

type View = 'grid' | 'list';
const VIEW_KEY = 'lakar.viewer.view';

function loadView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

/** Thumbnail per `slug@rev` (memori viewer). */
const thumbs = new Map<string, Promise<string | null>>();
function thumbnail(doc: DocSummary): Promise<string | null> {
  if (!doc.firstBoardId) return Promise.resolve(null);
  const key = `${doc.slug}@${doc.rev}`;
  let hit = thumbs.get(key);
  if (!hit) {
    hit = api.screenshot(doc.slug, doc.rev, doc.firstBoardId).then((s) => s.url);
    hit.catch(() => thumbs.delete(key));
    thumbs.set(key, hit);
  }
  return hit;
}

function Thumb({ doc, size }: { doc: DocSummary; size: 'large' | 'mini' }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useRetry(() => failed && setAttempt((a) => a + 1));
  useEffect(() => {
    if (!seen) return;
    let live = true;
    setFailed(false);
    thumbnail(doc).then(
      (u) => live && setUrl(u),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [seen, doc, attempt]);
  return (
    <div ref={ref} className={`thumb ${size}`}>
      {url ? (
        <img src={url} alt="" draggable={false} />
      ) : failed ? (
        <Icon name="alert" size={size === 'large' ? 18 : 12} className="thumb-icon" />
      ) : url === null ? (
        <Icon name="board" size={size === 'large' ? 20 : 12} className="thumb-icon" />
      ) : (
        <div className="skeleton" />
      )}
    </div>
  );
}

const subtitle = (d: DocSummary) =>
  `${d.boardCount === 0 ? 'No boards yet' : `${d.boardCount} board${d.boardCount === 1 ? '' : 's'}`} · ${relativeTime(d.updatedAt)}`;

export type DashboardPage = 'recents' | 'connections';

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

export function Dashboard({ page = 'recents', menuOpen, onCloseMenu }: { page?: DashboardPage; menuOpen: boolean; onCloseMenu: () => void }) {
  const [docs, setDocs] = useState<DocSummary[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<DaemonStatus | undefined>(undefined);
  const [view, setView] = useState<View>(loadView);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    setError(undefined);
    api.listDocs().then(setDocs, (e) => {
      if (!(e instanceof OfflineError)) setError(errorText(e));
    });
    api.status().then(setStatus, () => {});
  }, []);
  useEffect(load, [load]);
  useRetry(load);
  // Dokumen baru dari agen muncul saat tab kembali aktif.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // penyimpanan tidak tersedia: tetap jalan
    }
  };

  const shown = useMemo(() => (docs ?? []).filter((d) => d.slug.includes(query.trim().toLowerCase())), [docs, query]);

  return (
    <div className="dashboard">
      {menuOpen && <div className="scrim" onClick={onCloseMenu} />}
      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <div className="sidebar-top">
          <div className="profile">
            <span className="avatar">L</span>
            <span className="profile-name">Lakar</span>
          </div>
          <label className="search">
            <Icon name="search" size={15} />
            <input type="search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search documents" />
          </label>
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
          <a className={`nav-item${page === 'connections' ? ' active' : ''}`} href={CONNECTIONS_HASH}>
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

      {page === 'connections' ? (
        <section className="main">
          <div className="main-header">
            <h1>Connections</h1>
          </div>
          <Connections />
        </section>
      ) : (
        <section className="main">
          <div className="main-header">
            <h1>Recents</h1>
            <div className="spacer" />
            <div className="view-toggle" role="group" aria-label="View">
              <button type="button" className={view === 'grid' ? 'active' : ''} aria-pressed={view === 'grid'} aria-label="Grid view" onClick={() => changeView('grid')}>
                <Icon name="layoutGrid" />
              </button>
              <button type="button" className={view === 'list' ? 'active' : ''} aria-pressed={view === 'list'} aria-label="List view" onClick={() => changeView('list')}>
                <Icon name="list" />
              </button>
            </div>
          </div>

          {error ? (
            <div className="empty-state">
              <Icon name="alert" size={22} />
              <strong>Couldn't load documents</strong>
              <span>{error}</span>
              <button type="button" className="btn" onClick={load}>
                <Icon name="refresh" size={14} /> Try again
              </button>
            </div>
          ) : docs === undefined ? (
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
          ) : docs.length === 0 ? (
            <div className="empty-state">
              <Icon name="file" size={22} />
              <strong>No designs yet</strong>
              <span>Ask your agent to create one with the lakar MCP tools. It will appear here.</span>
            </div>
          ) : shown.length === 0 ? (
            <div className="empty-state">
              <Icon name="search" size={22} />
              <strong>No results for “{query}”</strong>
              <span>Try a different name.</span>
            </div>
          ) : view === 'grid' ? (
            <div className="file-grid">
              {shown.map((d) => (
                <button key={d.slug} type="button" className="card" onClick={() => openDoc(d.slug)}>
                  <div className="card-header">
                    <span className="card-title">{d.slug}</span>
                    <span className="card-subtitle">{subtitle(d)}</span>
                  </div>
                  <Thumb doc={d} size="large" />
                </button>
              ))}
            </div>
          ) : (
            <div className="file-list" role="list">
              <div className="list-head">
                <span>Name</span>
                <span>Boards</span>
                <span>Revision</span>
                <span>Updated</span>
              </div>
              {shown.map((d) => (
                <button key={d.slug} type="button" role="listitem" className="list-row" onClick={() => openDoc(d.slug)}>
                  <span className="list-name">
                    <Thumb doc={d} size="mini" />
                    <span>{d.slug}</span>
                  </span>
                  <span>{d.boardCount}</span>
                  <span className="mono">r{d.rev}</span>
                  <span>{relativeTime(d.updatedAt)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
