// Toast "Undo skipped" (epic agen-di-canvas story 3, desain Toast r69qO di bagian 06): entri undo/redo yang op
// inversnya ditolak karena perubahan lain (mis. agen menghapus node target) dibuang tanpa undo sebagian (AD-8).
// Naik 8px dalam 200ms, hilang sendiri sesudah 6 dtk (berhenti selama kursor di atasnya).
import { useEffect, useState } from 'react';
import { Icon } from './icons';

/** Lama toast tampil (motion card c8ILCm: 200ms / 6s). */
export const UNDO_SKIPPED_MS = 6000;

export type UndoSkipped = { key: number; title: string; description: string };

export function UndoSkippedToast({ toast, onHistory, onClose }: { toast: UndoSkipped; onHistory: () => void; onClose: () => void }) {
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (hover) return;
    const t = setTimeout(onClose, UNDO_SKIPPED_MS);
    return () => clearTimeout(t);
  }, [toast.key, hover, onClose]);
  return (
    <div className="undo-skipped canvas-overlay-ui" role="alert" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <span className="undo-skipped-icon">
        <Icon name="undo2" size={14} />
      </span>
      <div className="undo-skipped-body">
        <strong>{toast.title}</strong>
        <span className="undo-skipped-text">{toast.description}</span>
        <span className="undo-skipped-actions">
          <button
            type="button"
            className="link-btn accent"
            onClick={() => {
              onHistory();
              onClose();
            }}
          >
            View in History
          </button>
          <button type="button" className="link-btn" onClick={onClose}>
            Dismiss
          </button>
        </span>
      </div>
      <button type="button" className="toast-close" aria-label="Close" onClick={onClose}>
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}
