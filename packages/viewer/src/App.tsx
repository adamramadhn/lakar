// Kerangka aplikasi: title bar bertab, routing hash (`#/` Dashboard, `#/settings/connections` Connections,
// `#/d/<slug>` Viewer), banner offline.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { connection } from './api';
import { Dashboard } from './Dashboard';
import { Icon } from './icons';
import { OfflineBanner } from './OfflineBanner';
import { Viewer } from './Viewer';

type Route = { name: 'dashboard' } | { name: 'connections' } | { name: 'viewer'; slug: string };

/** Hash halaman Settings → Connections. */
export const CONNECTIONS_HASH = '#/settings/connections';

function parseRoute(hash: string): Route {
  if (/^#\/settings\/connections\/?$/.test(hash)) return { name: 'connections' };
  const m = /^#\/d\/([^/?#]+)/.exec(hash);
  if (m) {
    try {
      return { name: 'viewer', slug: decodeURIComponent(m[1]!) };
    } catch {
      // hash rusak → dashboard
    }
  }
  return { name: 'dashboard' };
}

export const openDoc = (slug: string) => {
  location.hash = `#/d/${encodeURIComponent(slug)}`;
};
export const openDashboard = () => {
  location.hash = '#/';
};

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  const [menuOpen, setMenuOpen] = useState(false);
  const offline = useSyncExternalStore(connection.subscribe, connection.isOffline);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute(location.hash));
      setMenuOpen(false);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.title = route.name === 'viewer' ? `${route.slug} · Lakar` : route.name === 'connections' ? 'Connections · Lakar' : 'Lakar';
  }, [route]);

  return (
    <div className="app">
      <header className="titlebar">
        <button className="titlebar-menu" type="button" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)}>
          <Icon name="menu" size={18} />
        </button>
        <nav className="tabs" aria-label="Open tabs">
          <a className={`tab${route.name !== 'viewer' ? ' active' : ''}`} href="#/">
            <Icon name="layoutGrid" size={14} />
            <span>Dashboard</span>
          </a>
          {route.name === 'viewer' && (
            <span className="tab active doc">
              <Icon name="file" size={14} />
              <span className="tab-label">{route.slug}</span>
              <a className="tab-close" href="#/" aria-label="Close tab">
                <Icon name="x" size={12} />
              </a>
            </span>
          )}
        </nav>
      </header>
      {offline && <OfflineBanner />}
      <main className="body">
        {route.name === 'viewer' ? (
          <Viewer key={route.slug} slug={route.slug} />
        ) : (
          <Dashboard page={route.name === 'connections' ? 'connections' : 'recents'} menuOpen={menuOpen} onCloseMenu={() => setMenuOpen(false)} />
        )}
      </main>
    </div>
  );
}
