// Settings → Updates (desain Section 11 `k6R96Q` Up to date, `ynWXN` Available, `b4i13` Check failed): kartu
// status versi (pola kartu lakard di Settings → Connections), section "What's new" saat ada update, dan
// "Automatic updates" (komponen Input mode select "Download updates": Automatically / Ask me first).
// Halaman ini hanya dirender di aplikasi desktop — tab Updates disembunyikan di browser (isDesktop).
import { useState } from 'react';
import { Icon } from './icons';
import { SettingsSection } from './SettingsGeneral';
import { checkForUpdate, getUpdatePolicy, installAndRelaunch, isDesktop, setUpdatePolicy, useUpdateState, type UpdatePolicy, type UpdateState, type UpdateStatus } from './updates';

const PILL: Record<UpdateStatus, { label: string; cls: string }> = {
  idle: { label: 'Checking…', cls: '' },
  checking: { label: 'Checking…', cls: '' },
  'up-to-date': { label: 'Up to date', cls: 'ok' },
  available: { label: 'Update available', cls: 'info' },
  downloading: { label: 'Downloading…', cls: 'info' },
  ready: { label: 'Ready to install', cls: 'info' },
  installing: { label: 'Installing…', cls: 'info' },
  failed: { label: 'Check failed', cls: 'error' },
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Tombol aksi kartu sesuai status: Check / Download and install / Restart now / Try again. */
function Action({ s }: { s: UpdateState }) {
  switch (s.status) {
    case 'available':
      return (
        <button type="button" className="btn primary" onClick={() => void installAndRelaunch()}>
          <Icon name="download" size={14} />
          Download and install
        </button>
      );
    case 'ready':
      return (
        <button type="button" className="btn primary" onClick={() => void installAndRelaunch()}>
          <Icon name="refresh" size={14} />
          Restart now
        </button>
      );
    case 'failed':
      return (
        <button type="button" className="btn" onClick={() => void checkForUpdate()}>
          <Icon name="refresh" size={14} />
          Try again
        </button>
      );
    case 'downloading':
    case 'installing':
    case 'checking':
      return null;
    default:
      return (
        <button type="button" className="btn" onClick={() => void checkForUpdate()}>
          <Icon name="refresh" size={14} />
          Check for updates
        </button>
      );
  }
}

/** Kartu status versi: ikon + "Lakar" + badge status + versi, tombol aksi; error/progress di baris bawah. */
function VersionCard({ s }: { s: UpdateState }) {
  const pill = PILL[s.status];
  // Status `installing` menutup dua fase (updates.ts `installPhase`): jalur manual masih mengunduh bytes,
  // jalur "ready" (bytes sudah ada) langsung memasang tanpa event channel.
  const downloading = s.status === 'downloading' || (s.status === 'installing' && s.installPhase === 'download');
  const progress = (s.status === 'downloading' || s.status === 'installing') && (
    <div className="conn-render" role="status">
      <Icon name="download" size={14} />
      <span>
        {downloading ? 'Downloading update…' : 'Installing update…'}
        {downloading && s.downloaded > 0 && ` · ${formatBytes(s.downloaded)}${s.total ? ` of ${formatBytes(s.total)}` : ''}`}
      </span>
    </div>
  );
  return (
    <div className="conn-card">
      <div className="conn-daemon">
        <span className="conn-daemon-icon">
          <Icon name="download" size={16} />
        </span>
        <div className="conn-daemon-text">
          <div className="conn-daemon-title">
            <strong>Lakar</strong>
            <span className={`status-pill${pill.cls ? ` ${pill.cls}` : ''}`}>{pill.label}</span>
          </div>
          <span className="conn-daemon-sub mono">
            {s.appVersion ? `v${s.appVersion}` : '…'}
            {(s.status === 'available' || s.status === 'downloading' || s.status === 'ready' || s.status === 'installing') && s.update ? ` → v${s.update.version}` : ''}
          </span>
        </div>
        <Action s={s} />
      </div>
      {progress}
      {s.status === 'failed' && s.error && (
        <div className="conn-render error" role="alert">
          <Icon name="alert" size={14} />
          <span>{s.error}</span>
        </div>
      )}
    </div>
  );
}

/** Select "Download updates" (komponen Input mode select): Automatically / Ask me first. */
function UpdatePolicySelect() {
  const [policy, setPolicy] = useState<UpdatePolicy>(() => getUpdatePolicy());
  return (
    <label className="field">
      <span className="field-label">Download updates</span>
      <select
        className="input select"
        value={policy}
        onChange={(e) => {
          const p = e.target.value === 'ask' ? 'ask' : 'auto';
          setPolicy(p);
          setUpdatePolicy(p);
        }}
      >
        <option value="auto">Automatically</option>
        <option value="ask">Ask me first</option>
      </select>
    </label>
  );
}

export function SettingsUpdates() {
  const s = useUpdateState();
  // Deep link `#/settings/updates` di browser biasa: halaman tidak bermakna tanpa IPC aplikasi → tidak dirender.
  if (!isDesktop()) return null;
  // Catatan rilis dari update yang pending, atau dari update yang baru dipasang ("See what's new" di banner).
  const notes = s.update?.notes ?? s.justUpdated?.notes;
  const notesVersion = s.update?.notes ? s.update.version : s.justUpdated?.version;
  return (
    <div className="settings-sections">
      <SettingsSection title="Version" description="The version of Lakar running on this computer.">
        <VersionCard s={s} />
      </SettingsSection>
      {notes && notesVersion && (
        <SettingsSection title={`What’s new in ${notesVersion}`} description="Release notes for this version.">
          <div className="update-notes">{notes}</div>
        </SettingsSection>
      )}
      <SettingsSection title="Automatic updates" description="Choose when Lakar downloads new versions. Installing always asks you first.">
        <UpdatePolicySelect />
      </SettingsSection>
    </div>
  );
}
