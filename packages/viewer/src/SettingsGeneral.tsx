// Settings (desain 02 "Settings — Dark/Light", tablet/mobile): judul (nama tab) + sub-nav General / Connections
// (desktop: kolom 200px di kiri; ≤768px: tab horizontal di atas). General berisi Appearance (Light / Dark / System,
// theme.ts) dan "About" dari `GET /status` (versi, channel, daemon, folder data + Copy build info + lisensi
// sumber terbuka — revisi About desain "Settings · About" section 11; halaman Updates belum ada). Profile,
// Language, Notifications sengaja tidak ada (aplikasi lokal tanpa akun, UI hanya bahasa Inggris).
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type DaemonStatus } from './api';
import { CopyButton, copyText } from './Connections';
import { CONNECTIONS_HASH, SETTINGS_HASH } from './files';
import { useRetry } from './hooks';
import { Icon, type IconName } from './icons';
import { Modal } from './NewFileDialog';
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

/** Baris About: kunci muted kiri + nilai kanan (mono untuk versi/path). */
function AboutRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="about-row">
      <span className="about-key">{label}</span>
      <span className="about-val">{children}</span>
    </div>
  );
}

/** Lisensi pihak ketiga utama yang dibundel (dialog "Open-source licenses"). */
const LICENSES: [string, string][] = [
  ['React & ReactDOM', 'MIT'],
  ['Vite', 'MIT'],
  ['Fastify', 'MIT'],
  ['zod', 'MIT'],
  ['Playwright (playwright-core)', 'Apache-2.0'],
  ['@modelcontextprotocol/sdk', 'MIT'],
  ['Lucide icons', 'ISC'],
];

function LicensesDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal label="Open-source licenses" onClose={onClose} className="small">
      <div className="modal-text">
        <h2>Open-source licenses</h2>
        <p>Lakar is built on these open-source packages.</p>
      </div>
      <ul className="lic-list">
        {LICENSES.map(([name, lic]) => (
          <li key={name}>
            <span className="lic-name">{name}</span>
            <span className="lic-lic">{lic}</span>
          </li>
        ))}
      </ul>
      <div className="modal-buttons">
        <button type="button" data-autofocus className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

/** "About" (desain "Settings · About"): versi/channel/daemon/data folder + Copy build info + lisensi. */
function About() {
  const [status, setStatus] = useState<StatusState>(undefined);
  const [licenses, setLicenses] = useState(false);
  const [copied, setCopied] = useState(false);
  const load = useCallback(() => {
    api.status().then(setStatus, () => setStatus(null));
  }, []);
  useEffect(load, [load]);
  useRetry(load);

  const buildInfo = status
    ? [`Lakar ${status.version}`, 'Channel: stable', `Daemon: lakard ${status.version}`, `Node: ${status.node ?? 'unknown'}`, `Data folder: ${status.dataDir}`].join('\n')
    : '';
  const copyBuild = async () => {
    try {
      await copyText(buildInfo);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard tidak tersedia: biarkan tombol tanpa umpan balik
    }
  };

  const value = (v: ReactNode) => (status === undefined ? <span className="skeleton line" /> : status === null ? <span className="settings-unavailable">Unavailable</span> : v);
  return (
    <>
      <div className="settings-about" aria-busy={status === undefined}>
        <AboutRow label="Version">{value(<span className="mono">{status?.version}</span>)}</AboutRow>
        <AboutRow label="Channel">{value('stable')}</AboutRow>
        <AboutRow label="Daemon">{value(<span className="mono">lakard {status?.version}</span>)}</AboutRow>
        <AboutRow label="Data folder">
          {value(
            <>
              <span className="mono settings-path" title={status?.dataDir}>
                {status?.dataDir}
              </span>
              {status && <CopyButton text={status.dataDir} />}
            </>,
          )}
        </AboutRow>
      </div>
      <div className="about-actions">
        <button type="button" className="btn" disabled={!status} onClick={() => void copyBuild()}>
          <Icon name={copied ? 'circleCheck' : 'copy'} size={15} />
          {copied ? 'Copied' : 'Copy build info'}
        </button>
        <button type="button" className="btn" onClick={() => setLicenses(true)}>
          Open-source licenses
        </button>
      </div>
      {licenses && <LicensesDialog onClose={() => setLicenses(false)} />}
    </>
  );
}

/** Settings → General. */
export function SettingsGeneral() {
  return (
    <div className="settings-sections">
      <SettingsSection title="Appearance" description="Choose how the app looks. System follows your OS setting.">
        <Appearance />
      </SettingsSection>
      <SettingsSection title="About" description="Lakar runs locally. Your files stay on this computer, served by lakard.">
        <About />
      </SettingsSection>
    </div>
  );
}
