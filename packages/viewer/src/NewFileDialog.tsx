// Dialog New file (desain 02 "Dashboard — New File"): nama + board awal (Desktop, Tablet, Mobile, Custom),
// pratinjau slug. Sukses → viewer membuka `#/d/<slug>`. `Modal` dipakai juga oleh dialog di FileMenu.tsx.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, errorText } from './api';
import { docHash, previewSlug, PRESETS, SIZE_MAX, validSize, type BoardChoice, type PresetId } from './files';
import { Icon, type IconName } from './icons';

/** Dialog modal: scrim, Escape/klik scrim menutup, fokus awal di elemen `[data-autofocus]`. */
export function Modal({ label, onClose, children, className = '' }: { label: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // `onClose` sering inline (berubah tiap render induk): simpan di ref supaya fokus/select hanya sekali saat dibuka.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[data-autofocus]');
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

const PRESET_ICON: Record<PresetId, IconName> = { desktop: 'board', tablet: 'tablet', mobile: 'smartphone', custom: 'fit' };

export function NewFileDialog({ taken, onClose }: { taken: ReadonlySet<string>; onClose: () => void }) {
  const [name, setName] = useState('Untitled');
  const [preset, setPreset] = useState<PresetId>('desktop');
  const [width, setWidth] = useState('1440');
  const [height, setHeight] = useState('900');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const slug = previewSlug(name, taken);
  const w = Number(width);
  const h = Number(height);
  const sizeOk = preset !== 'custom' || (validSize(w) && validSize(h));
  const canCreate = !!slug && sizeOk && !busy;

  const submit = async () => {
    if (!canCreate) return;
    const board: BoardChoice = preset === 'custom' ? { preset, width: w, height: h } : { preset };
    setBusy(true);
    setError(undefined);
    try {
      const r = await api.createFile(name, board);
      onClose();
      location.hash = docHash(r.slug);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <Modal label="New file" onClose={onClose} className="new-file">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="modal-text">
          <h2>New file</h2>
          <p>Start from an empty board. You can edit it here, and connected agents can keep working on it.</p>
        </div>
        <label className="field">
          <span className="field-label">Name</span>
          <input data-autofocus className="input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} aria-describedby="new-file-slug" />
          <span id="new-file-slug" className={`field-hint${slug ? '' : ' danger'}`}>
            {slug ? (
              <>
                Saved as <span className="mono">{slug}</span>
              </>
            ) : (
              'Use letters or numbers in the name.'
            )}
          </span>
        </label>
        <div className="field">
          <span className="field-label">Starting board</span>
          <div className="presets" role="radiogroup" aria-label="Starting board">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={preset === p.id}
                className={`preset${preset === p.id ? ' active' : ''}`}
                onClick={() => setPreset(p.id)}
              >
                <Icon name={PRESET_ICON[p.id]} size={18} />
                <span className="preset-name">{p.label}</span>
                <span className="preset-size">{p.width ? `${p.width} × ${p.height}` : 'Any size'}</span>
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="custom-size">
              <label>
                <span>W</span>
                <input className="input" type="number" min={1} max={SIZE_MAX} step={1} value={width} onChange={(e) => setWidth(e.target.value)} aria-label="Width" />
              </label>
              <label>
                <span>H</span>
                <input className="input" type="number" min={1} max={SIZE_MAX} step={1} value={height} onChange={(e) => setHeight(e.target.value)} aria-label="Height" />
              </label>
              {!sizeOk && <span className="field-hint danger">1–{SIZE_MAX} px</span>}
            </div>
          )}
        </div>
        {error && <div className="modal-error">{error}</div>}
        <div className="modal-buttons">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!canCreate}>
            {busy ? 'Creating…' : 'Create file'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
