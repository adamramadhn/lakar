// Toast paste SVG dan Paste Report (epic paste-vektor story 3; desain G0vf1/nE6dL memakai Toast r69qO, Details
// membuka Paste Report w2am0). Paste HTML (story 4, desain rkIyP/GXHxW) langsung membuka Paste Report. Toast naik 8px dalam 200ms dan hilang sendiri sesudah 6 dtk (berhenti saat di-hover);
// report tetap terbuka sampai ditutup. Teks dari paste.ts (murni).
import { useEffect, useState } from 'react';
import { copyText } from './Connections';
import { Icon } from './icons';
import { pasteDescription, pasteReportDescription, pasteReportItems, pasteReportText, pasteTitle, type PasteReport } from './paste';
import { UNDO_SKIPPED_MS } from './UndoSkippedToast';

export type PasteToastState = { key: number; report: PasteReport; layer: string; nodeId?: string | undefined; /** Judul toast pengganti (impor URL: "Imported N layers from host"). */ title?: string; /** Label aksi undo pengganti ("Undo import"). */ undoLabel?: string };

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function PasteToast({ toast, onUndo, onClose }: { toast: PasteToastState; onUndo: () => void; onClose: () => void }) {
  const [hover, setHover] = useState(false);
  const [details, setDetails] = useState(toast.report.kind === 'html');
  const [copied, setCopied] = useState<'ok' | 'failed' | undefined>(undefined);
  useEffect(() => {
    if (hover || details) return;
    const t = setTimeout(onClose, UNDO_SKIPPED_MS);
    return () => clearTimeout(t);
  }, [toast.key, hover, details, onClose]);
  const { report, layer } = toast;
  const undo = () => {
    onUndo();
    onClose();
  };
  if (details) {
    const items = pasteReportItems(report);
    return (
      <div className="paste-report canvas-overlay-ui" role="region" aria-label="Paste report">
        <div className="paste-report-head">
          <span className="undo-skipped-icon paste-icon">
            <Icon name="clipboardCheck" size={14} />
          </span>
          <div className="undo-skipped-body">
            <strong>{toast.title ?? pasteTitle(report)}</strong>
            <span className="undo-skipped-text">{pasteReportDescription(report, layer)}</span>
          </div>
          <button type="button" className="toast-close" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        {items.length > 0 && (
          <div className="paste-report-dropped">
            <div className="paste-report-label">
              <Icon name="alert" size={12} />
              <span>Not imported ({items.length})</span>
            </div>
            {items.map((it) => (
              <div className="paste-report-item" key={it.what}>
                <Icon name={it.icon} size={13} />
                <div>
                  <span className="paste-report-what">{it.what}</span>
                  <span className="paste-report-why">{it.why}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="paste-report-actions">
          <button type="button" className="link-btn accent" onClick={undo}>
            {toast.undoLabel ?? 'Undo paste'}
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() =>
              void copyText(pasteReportText(report, layer)).then(
                () => setCopied('ok'),
                () => setCopied('failed'),
              )
            }
          >
            {copied === 'ok' ? 'Copied' : copied === 'failed' ? 'Clipboard is not available' : 'Copy report'}
          </button>
          <span className="paste-report-spacer" />
          <kbd className="paste-report-shortcut">{IS_MAC ? '⌘Z' : 'Ctrl+Z'}</kbd>
        </div>
      </div>
    );
  }
  return (
    <div className="undo-skipped paste-toast canvas-overlay-ui" role="status" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <span className="undo-skipped-icon paste-icon">
        <Icon name="fileCode" size={14} />
      </span>
      <div className="undo-skipped-body">
        <strong>{toast.title ?? pasteTitle(report)}</strong>
        <span className="undo-skipped-text">{pasteDescription(report)}</span>
        <span className="undo-skipped-actions">
          <button type="button" className="link-btn accent" onClick={undo}>
            {toast.undoLabel ?? 'Undo paste'}
          </button>
          <button type="button" className="link-btn" onClick={() => setDetails(true)}>
            Details
          </button>
        </span>
      </div>
      <button type="button" className="toast-close" aria-label="Close" onClick={onClose}>
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}
