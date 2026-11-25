// Settings → Updates (desain Section 11 `k6R96Q` Up to date, `ynWXN` Available, `b4i13` Check failed): kartu
// status versi (pola kartu lakard di Settings → Connections), section "What's new" saat ada update, dan
// "Automatic updates" (komponen Input mode select "Download updates": Automatically / Ask me first).
// Halaman ini hanya dirender di aplikasi desktop — tab Updates disembunyikan di browser (isDesktop).
import { useState } from 'react';
import { Icon } from './icons';
import { SettingsSection } from './SettingsGeneral';
import { changeUpdateChannel, checkForUpdate, displayVersion, getUpdatePolicy, installAndRelaunch, isDesktop, isNightlyVersion, setUpdatePolicy, updateErrorText, useUpdateState, type UpdateChannel, type UpdatePolicy, type UpdateState, type UpdateStatus } from './updates';

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
            {isNightlyVersion(s.appVersion) && <span className="status-pill">Nightly</span>}
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
      {s.status === 'failed' && updateErrorText(s.error, s.channel) && (
        <div className="conn-render error" role="alert">
          <Icon name="alert" size={14} />
          <span>{updateErrorText(s.error, s.channel)}</span>
        </div>
      )}
    </div>
  );
}

/** Segmented Stable/Nightly + baris catatan sesuai matriks C1–C10 (spec-update-channel). Channel
 * disimpan di sisi aplikasi (`set_update_channel`); ganti channel langsung memeriksa ulang. */
function UpdateChannelPicker({ s }: { s: UpdateState }) {
  const disabled = s.status === 'checking' || s.status === 'downloading' || s.status === 'installing';
  const channels: { id: UpdateChannel; label: string }[] = [
    { id: 'stable', label: 'Stable' },
    { id: 'nightly', label: 'Nightly' },
  ];
  // Baris bantuan dasar (C1–C3): deskripsi channel + catatan khusus "stable di atas build nightly".
  const base =
    s.channel === 'nightly'
      ? { icon: 'alert' as const, text: 'Pre-release builds — may be unstable. A new build ships every night.' }
      : isNightlyVersion(s.appVersion) && s.status !== 'available' && s.status !== 'downloading' && s.status !== 'ready' && s.status !== 'installing'
        ? { icon: 'info' as const, text: "You're on a nightly build that's newer than the latest stable release. You'll get the next stable release when it's out." }
        : { icon: undefined, text: 'Tested releases. Recommended for most people.' };
  return (
    <div className="update-channel">
      <div className="segmented update-channel-segmented" role="radiogroup" aria-label="Update channel">
        {channels.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={s.channel === c.id}
            disabled={disabled}
            className={`segment${s.channel === c.id ? ' active' : ''}`}
            onClick={() => void changeUpdateChannel(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      {s.channelError === 'save' && (
        <div className="update-channel-note error" role="alert">
          <Icon name="alert" size={14} />
          <span>Couldn’t change the update channel. Try again.</span>
        </div>
      )}
      {s.status === 'ready' && (
        <div className="update-channel-note" role="note">
          <Icon name="info" size={14} />
          <span>Switching channels discards the update that’s ready to install.</span>
        </div>
      )}
      {disabled && s.status !== 'checking' && (
        <div className="update-channel-note" role="note">
          <Icon name="info" size={14} />
          <span>You can switch channels after the current update finishes.</span>
        </div>
      )}
      <div className="update-channel-note">
        {base.icon && <Icon name={base.icon} size={14} />}
        <span>{base.text}</span>
      </div>
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
      {s.channel !== undefined && (
        <SettingsSection title="Update channel" description="Choose which builds this computer receives.">
          <UpdateChannelPicker s={s} />
        </SettingsSection>
      )}
      {notes && notesVersion && (
        <SettingsSection title={`What’s new in ${displayVersion(notesVersion)}`} description="Release notes for this version.">
          <div className="update-notes">{notes}</div>
        </SettingsSection>
      )}
      <SettingsSection title="Automatic updates" description="Choose when Lakar downloads new versions. Installing always asks you first.">
        <UpdatePolicySelect />
      </SettingsSection>
    </div>
  );
}
