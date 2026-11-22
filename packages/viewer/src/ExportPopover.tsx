// Tombol Export di kanan atas kanvas + popover (desain `Viewer — Desktop — Export`): pilih board, skala 1x/2x,
// info ukuran, lalu "Export PNG". "Export code…" membuka dialog Export code (epic kode story 5) untuk board itu. Byte PNG dari POST /viewer/docs/:slug/export diunduh lewat `<a download>`;
// di aplikasi desktop unduhan itu ditangkap handler `on_download` Tauri dan disimpan ke folder Downloads OS.
import { useEffect, useRef, useState } from 'react';
import { api, errorText } from './api';
import type { CanvasBoard } from './Canvas';
import { Icon } from './icons';

type Status = { state: 'idle' } | { state: 'busy' } | { state: 'saved'; filename: string } | { state: 'error'; message: string };

/** Picu unduhan blob dengan nama `filename` (browser: folder unduhan; desktop: handler on_download). */
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Beri waktu webview mulai membaca blob sebelum URL dicabut.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function ExportButton({
  slug,
  boards,
  selectedBoardId,
  onExportCode,
}: {
  slug: string;
  boards: readonly CanvasBoard[];
  selectedBoardId: string | undefined;
  onExportCode?: ((boardId: string) => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [boardId, setBoardId] = useState<string | undefined>(undefined);
  // Default 2x seperti desain (`Viewer — Desktop — Export`).
  const [scale, setScale] = useState<1 | 2>(2);
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /** Setiap kali dibuka: default board terpilih, atau board pertama. */
  const toggle = () => {
    if (!open) {
      setBoardId(selectedBoardId && boards.some((b) => b.id === selectedBoardId) ? selectedBoardId : boards[0]?.id);
      setStatus({ state: 'idle' });
    }
    setOpen(!open);
  };
  const board = boards.find((b) => b.id === boardId) ?? boards[0];
  const run = async () => {
    if (!board || status.state === 'busy') return;
    setStatus({ state: 'busy' });
    try {
      const { blob, filename } = await api.exportPng(slug, board.id, scale);
      download(blob, filename);
      setStatus({ state: 'saved', filename });
    } catch (e) {
      setStatus({ state: 'error', message: errorText(e) });
    }
  };

  return (
    <div ref={root} className="export canvas-overlay-ui">
      <button type="button" className="btn export-btn" aria-expanded={open} aria-haspopup="dialog" disabled={boards.length === 0} onClick={toggle}>
        <Icon name="download" size={14} />
        Export
      </button>
      {open && (
        <div className="export-popover" role="dialog" aria-label="Export board">
          <strong className="export-title">Export board</strong>
          <label className="field">
            <span className="field-label">Board</span>
            <select
              className="input select"
              value={board?.id ?? ''}
              onChange={(e) => {
                setBoardId(e.target.value);
                setStatus({ state: 'idle' });
              }}
            >
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span className="field-label">Scale</span>
            <div className="segmented" role="radiogroup" aria-label="Scale">
              {([1, 2] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={scale === s}
                  className={`segment${scale === s ? ' active' : ''}`}
                  onClick={() => {
                    setScale(s);
                    setStatus({ state: 'idle' });
                  }}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
          {board && (
            <span className="export-size">
              PNG · {Math.round(board.width * scale)} × {Math.round(board.height * scale)} px
            </span>
          )}
          <button type="button" className="btn primary export-run" disabled={!board || status.state === 'busy'} onClick={run}>
            {status.state === 'busy' ? <div className="spinner small" /> : <Icon name="download" size={14} />}
            {status.state === 'busy' ? 'Exporting…' : 'Export PNG'}
          </button>
          {onExportCode && (
            <button
              type="button"
              className="btn export-run"
              disabled={!board}
              onClick={() => {
                if (!board) return;
                setOpen(false);
                onExportCode(board.id);
              }}
            >
              <Icon name="codeXml" size={14} />
              Export code…
            </button>
          )}
          {status.state === 'saved' && (
            <div className="export-note" role="status">
              <Icon name="circleCheck" size={13} />
              <span>
                Download started: <span className="mono">{status.filename}</span>
              </span>
            </div>
          )}
          {status.state === 'error' && (
            <div className="export-note danger" role="alert">
              <Icon name="alert" size={13} />
              <span>{status.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
