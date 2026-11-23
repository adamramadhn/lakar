// Banner update di Recents (desain Section 11 `vQY8e` ready / `mOkHY` updated), pola Offline Banner:
// - "ready" (accent-soft): update auto-terunduh menunggu restart — What's new + Restart now.
// - "updated" (nada success): aplikasi baru saja diperbarui — See what's new + Dismiss (permanen).
// Di browser komponen tidak merender apa-apa (updater hanya ada di aplikasi desktop).
import { UPDATES_HASH } from './files';
import { Icon } from './icons';
import { dismissUpdated, installAndRelaunch, isDesktop, useUpdateState } from './updates';

export function UpdateBanner() {
  const s = useUpdateState();
  if (!isDesktop()) return null;
  if (s.status === 'ready' && s.update) {
    return (
      <div className="update-banner accent" role="status">
        <Icon name="download" size={16} className="update-icon" />
        <div className="update-text">
          <strong>Lakar {s.update.version} is ready to install</strong>
          <span>Restart to finish updating.</span>
        </div>
        <a className="btn" href={UPDATES_HASH}>
          What’s new
        </a>
        <button type="button" className="btn primary" onClick={() => void installAndRelaunch()}>
          <Icon name="refresh" size={14} />
          Restart now
        </button>
      </div>
    );
  }
  if (s.justUpdated) {
    return (
      <div className="update-banner success" role="status">
        <Icon name="circleCheck" size={16} className="update-icon" />
        <div className="update-text">
          <strong>Updated to Lakar {s.justUpdated.version}</strong>
        </div>
        <a className="btn" href={UPDATES_HASH}>
          See what’s new
        </a>
        <button type="button" className="btn" onClick={dismissUpdated}>
          Dismiss
        </button>
      </div>
    );
  }
  return null;
}
