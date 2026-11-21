// Layer manual (aplikasi 4): menu "+" di header Layers (desain "Add Layer Menu"), pemilih ikon (cari lewat
// /icons/search, hasil grid), dan toast gagal execute. Sisipan sendiri dijalankan Viewer lewat api.execute.
import { useEffect, useRef, useState } from 'react';
import { api, errorText, iconPreviewUrl, type IconResult } from './api';
import { shortcutLabel } from './Canvas';
import { INSERT_KINDS, type InsertKind } from './codegen';
import { Menu, type Item } from './FileMenu';
import { Icon, type IconName } from './icons';
import { Modal } from './NewFileDialog';

const MENU_ICON: Record<InsertKind, IconName> = { frame: 'frame', rect: 'square', ellipse: 'circle', text: 'text', image: 'image', icon: 'shapes' };

/** Tombol "+" header Layers + menu Add layer. Tanpa board (`hasBoard` false) hanya Frame (board baru) yang aktif. */
export function AddLayerButton({ disabled, disabledReason, hasBoard, onPick }: { disabled: boolean; disabledReason: string; hasBoard: boolean; onPick: (kind: InsertKind) => void }) {
  const [at, setAt] = useState<{ x: number; y: number } | undefined>(undefined);
  const items: Item[] = INSERT_KINDS.map(({ kind, label }) => {
    const needsBoard = kind !== 'frame' && !hasBoard;
    return {
      label: kind === 'image' || kind === 'icon' ? `${label}…` : label,
      icon: MENU_ICON[kind],
      shortcut: shortcutLabel(kind),
      separator: kind === 'image',
      disabled: needsBoard,
      ...(needsBoard ? { title: 'Add a frame first' } : {}),
      run: () => {
        setAt(undefined);
        onPick(kind);
      },
    };
  });
  return (
    <>
      <button
        type="button"
        className="add-layer-btn"
        aria-label="Add layer"
        title={disabled ? disabledReason : 'Add layer'}
        aria-haspopup="menu"
        aria-expanded={at !== undefined}
        disabled={disabled}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ x: r.left, y: r.bottom + 6 });
        }}
      >
        <Icon name="plus" size={14} />
      </button>
      {at && !disabled && <Menu x={at.x} y={at.y} items={items} onClose={() => setAt(undefined)} />}
    </>
  );
}

/** Pemilih ikon: kotak cari (default "star") dan grid hasil. Enter/klik memilih. */
export function IconPicker({ onPick, onClose }: { onPick: (icon: { lib: string; icon: string }) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<{ loading: boolean; results: IconResult[]; error?: string }>({ loading: true, results: [] });
  const seq = useRef(0);
  useEffect(() => {
    const q = query.trim() || 'star';
    const n = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(() => {
      api.iconSearch(q).then(
        (results) => n === seq.current && setState({ loading: false, results }),
        (e) => n === seq.current && setState({ loading: false, results: [], error: errorText(e) }),
      );
    }, 150);
    return () => clearTimeout(t);
  }, [query]);
  return (
    <Modal label="Insert icon" onClose={onClose} className="icon-picker">
      <div className="modal-text">
        <h2>Insert icon</h2>
      </div>
      <label className="icon-search">
        <Icon name="search" size={14} />
        <input
          data-autofocus
          value={query}
          placeholder="Search icons (lucide, brand logos)"
          aria-label="Search icons"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            const first = state.results[0];
            if (e.key === 'Enter' && first) onPick({ lib: first.lib, icon: first.aliasOf ?? first.icon });
          }}
        />
      </label>
      <div className="icon-grid" role="listbox" aria-label="Icons" aria-busy={state.loading}>
        {state.error ? (
          <div className="muted-note">{state.error}</div>
        ) : !state.loading && state.results.length === 0 ? (
          <div className="muted-note">No icons match “{query.trim()}”.</div>
        ) : (
          state.results.map((r) => {
            const icon = r.aliasOf ?? r.icon;
            return (
              <button key={`${r.lib}:${r.icon}`} type="button" role="option" aria-selected={false} className="icon-cell" title={`${r.lib} / ${icon}`} onClick={() => onPick({ lib: r.lib, icon })}>
                <img src={iconPreviewUrl(r.lib, icon)} alt="" width={22} height={22} draggable={false} />
                <span>{icon}</span>
              </button>
            );
          })
        )}
      </div>
      <div className="modal-buttons">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

/** Isi toast: kesalahan, info (mis. "Deleted …" dengan Undo), atau proses berjalan (tanpa tutup otomatis). */
export type ToastState = { message: string; kind: 'error' | 'info' | 'busy'; action?: { label: string; run: () => void } };

/** Lama toast tampil: 6 detik, atau 12 detik bila punya aksi (Undo) supaya sempat diklik. */
export const toastDuration = (toast: ToastState): number => (toast.action ? 12000 : 6000);

/**
 * Toast di bawah kanvas. error/info hilang sendiri (lihat `toastDuration`); hitungan berhenti selama kursor di atas
 * toast. `busy` bertahan sampai diganti.
 */
export function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  const { message, kind, action } = toast;
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (kind === 'busy' || hover) return;
    const t = setTimeout(onClose, toastDuration(toast));
    return () => clearTimeout(t);
  }, [toast, kind, hover, onClose]);
  return (
    <div className={`toast ${kind}`} role={kind === 'error' ? 'alert' : 'status'} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {kind === 'busy' ? <div className="spinner small" /> : <Icon name={kind === 'error' ? 'alert' : 'circleCheck'} size={15} />}
      <span className="toast-text">{message}</span>
      {action && (
        <button type="button" className="link-btn toast-action" onClick={action.run}>
          {action.label}
        </button>
      )}
      {kind !== 'busy' && (
        <button type="button" className="toast-close" aria-label="Dismiss" onClick={onClose}>
          <Icon name="x" size={13} />
        </button>
      )}
    </div>
  );
}
