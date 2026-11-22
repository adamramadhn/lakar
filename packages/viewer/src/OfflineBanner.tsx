// Banner saat lakard tidak bisa dihubungi (desain "Viewer — Desktop — Offline"): merah, perintah restart, Retry.
import { useState } from 'react';
import { connection } from './api';
import { Icon } from './icons';

const RESTART = 'systemctl --user restart lakard';

export function OfflineBanner() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(RESTART);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard tidak tersedia (konteks tidak aman): abaikan
    }
  };
  return (
    <div className="offline-banner" role="alert">
      <Icon name="wifiOff" size={16} className="offline-icon" />
      <div className="offline-text">
        <strong>Can't reach lakard at {location.origin}</strong>
        <span>Agent changes won't show here until it's back. Your file is safe on disk.</span>
      </div>
      <div className="offline-command">
        <code>{RESTART}</code>
        <button type="button" className="icon-btn" aria-label="Copy command" onClick={copy}>
          <Icon name={copied ? 'circleCheck' : 'copy'} size={13} />
        </button>
      </div>
      <button type="button" className="btn primary" onClick={() => connection.retry()}>
        <Icon name="refresh" size={14} />
        Retry
      </button>
    </div>
  );
}
