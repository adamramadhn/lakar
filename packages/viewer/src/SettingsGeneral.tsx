// Settings (desain 02 "Settings — Dark/Light", tablet/mobile): judul (nama tab) + sub-nav General / Connections
// (desktop: kolom 200px di kiri; ≤768px: tab horizontal di atas). General berisi Appearance (Light / Dark / System,
// theme.ts) dan bagian lokal dari `GET /status` (folder data, alamat server, versi). Profile, Language, Notifications
// sengaja tidak ada (aplikasi lokal tanpa akun, UI hanya bahasa Inggris, isi Notifications belum didesain).
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type DaemonStatus } from './api';
import { CopyButton } from './Connections';
import { CONNECTIONS_HASH, SETTINGS_HASH } from './files';
import { useRetry } from './hooks';
import { Icon, type IconName } from './icons';
import { THEME_PREFS, useTheme, type ThemePref } from './theme';

export type SettingsTab = 'general' | 'connections';

const TABS: { id: SettingsTab; label: string; icon: IconName; href: string }[] = [
  { id: 'general', label: 'General', icon: 'settings', href: SETTINGS_HASH },
  { id: 'connections', label: 'Connections', icon: 'plug', href: CONNECTIONS_HASH },
];

/** Kerangka halaman Settings: judul, sub-nav/tab, isi. */
export function SettingsLayout({ tab, children }: { tab: SettingsTab; children: ReactNode }) {
  return (
    <section className="main settings-main">
      <div className="main-header">
        {/* Desain: judul halaman mengikuti tab ("Settings" / "Connections"). */}
        <h1>{tab === 'connections' ? 'Connections' : 'Settings'}</h1>
      </div>
      <div className="settings-body">
        <nav className="settings-nav" aria-label="Settings">
          {TABS.map((t) => (
            <a key={t.id} href={t.href} className={`settings-nav-item${t.id === tab ? ' active' : ''}`} aria-current={t.id === tab ? 'page' : undefined}>
              <Icon name={t.icon} size={16} />
              <span>{t.label}</span>
            </a>
          ))}
        </nav>
        <div className="settings-content">{children}</div>
      </div>
    </section>
  );
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <div className="settings-intro">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="settings-fields">{children}</div>
    </section>
  );
}

const THEME_LABEL: Record<ThemePref, string> = { light: 'Light', dark: 'Dark', system: 'System' };

/** Pratinjau mini tema (sidebar + dua blok isi); System = separuh terang, separuh gelap. */
function ThemePreview({ pref }: { pref: ThemePref }) {
  return (
    <span className={`theme-preview ${pref}`} aria-hidden="true">
      <span className="tp-side" />
      <span className="tp-content">
        <span className="tp-block" />
        <span className="tp-block" />
      </span>
    </span>
  );
}

function Appearance() {
  const [pref, setPref] = useTheme();
  return (
    <div className="theme-options" role="radiogroup" aria-label="Theme">
      {THEME_PREFS.map((p) => (
        <button key={p} type="button" role="radio" aria-checked={pref === p} className={`theme-option${pref === p ? ' active' : ''}`} onClick={() => setPref(p)}>
          <ThemePreview pref={p} />
          <span className="theme-label">
            <span className="radio" />
            {THEME_LABEL[p]}
          </span>
        </button>
      ))}
    </div>
  );
}

/** `undefined` = memuat, `null` = gagal / offline. */
type StatusState = DaemonStatus | null | undefined;

function LocalInfo() {
  const [status, setStatus] = useState<StatusState>(undefined);
  const load = useCallback(() => {
    api.status().then(setStatus, () => setStatus(null));
  }, []);
  useEffect(load, [load]);
  useRetry(load);

  const value = (v: ReactNode) => (status === undefined ? <span className="skeleton line" /> : status === null ? <span className="settings-unavailable">Unavailable</span> : v);
  return (
    <dl className="settings-info" aria-busy={status === undefined}>
      <div className="settings-row">
        <dt>Data folder</dt>
        <dd>
          {value(
            <>
              <span className="mono settings-path" title={status?.dataDir}>
                {status?.dataDir}
              </span>
              {status && <CopyButton text={status.dataDir} />}
            </>,
          )}
        </dd>
      </div>
      <div className="settings-row">
        <dt>Server</dt>
        <dd>{value(<span className="mono">{status ? `${status.host}:${status.port}` : ''}</span>)}</dd>
      </div>
      <div className="settings-row">
        <dt>Version</dt>
        <dd>{value(<span className="mono">{status ? `lakard ${status.version}` : ''}</span>)}</dd>
      </div>
    </dl>
  );
}

/** Settings → General. */
export function SettingsGeneral() {
  return (
    <div className="settings-sections">
      <SettingsSection title="Appearance" description="Choose how the app looks. System follows your OS setting.">
        <Appearance />
      </SettingsSection>
      <SettingsSection title="This computer" description="Lakar runs locally. Your files stay in this folder, served by lakard.">
        <LocalInfo />
      </SettingsSection>
    </div>
  );
}
