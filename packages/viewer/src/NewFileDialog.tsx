// Dialog New file (desain 02 "Dashboard — New File"): nama + board awal (Desktop, Tablet, Mobile, Custom),
// pratinjau slug. Sukses → viewer membuka `#/d/<slug>`. Dibuka dari halaman folder (`folder`) → file baru masuk folder itu. `Modal` dipakai juga oleh dialog di FileMenu.tsx.
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { api, errorText } from './api';
import { docHash, fileErrorText, previewSlug, PRESETS, SIZE_MAX, validSize, type BoardChoice, type PresetId } from './files';
import { Icon, type IconName } from './icons';

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog modal: scrim, Escape/klik scrim menutup, fokus awal di elemen `[data-autofocus]`, Tab berputar di dalam
 * dialog, dan fokus kembali ke elemen pemicu saat ditutup.
 */
export function Modal({ label, onClose, children, className = '', role = 'dialog' }: { label: string; onClose: () => void; children: ReactNode; className?: string; role?: 'dialog' | 'alertdialog' }) {
  const ref = useRef<HTMLDivElement>(null);
  // `onClose` sering inline (berubah tiap render induk): simpan di ref supaya fokus/select hanya sekali saat dibuka.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = ref.current?.querySelector<HTMLElement>('[data-autofocus]');
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // Pemicu (mis. tombol "…" atau tautan kartu) masih ada → fokus kembali ke sana.
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, []);
  const trap = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const all = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((x) => x.offsetParent !== null);
    if (all.length === 0) return;
    const first = all[0]!;
    const last = all[all.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal ${className}`} role={role} aria-modal="true" aria-label={label} onKeyDown={trap}>
        {children}
      </div>
    </div>
  );
}

const PRESET_ICON: Record<PresetId, IconName> = { desktop: 'board', tablet: 'tablet', mobile: 'smartphone', custom: 'fit' };

/** `initialName`: nama awal (default `Untitled`; dari Search tanpa hasil = query). `folder`: id folder tujuan file baru. */
export function NewFileDialog({ taken, onClose, initialName = 'Untitled', folder }: { taken: ReadonlySet<string>; onClose: () => void; initialName?: string; folder?: string }) {
  const [name, setName] = useState(initialName);
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
      if (folder) {
        // File sudah dibuat: gagal masuk folder tidak membatalkannya (file tetap di root).
        await api.moveToFolder(r.slug, folder).catch(() => undefined);
      }
      onClose();
      location.hash = docHash(r.slug);
    } catch (e) {
      setError(fileErrorText(e, 'create', slug, errorText));
      setBusy(false);
    }
  };
  // Pola radiogroup: ←/→/↑/↓ memindah pilihan (fokus ikut); Enter mengirim form seperti di kolom Name.
  const presetKey = (e: ReactKeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
      return;
    }
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (i + d + PRESETS.length) % PRESETS.length;
    setPreset(PRESETS[next]!.id);
    (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
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
            {PRESETS.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={preset === p.id}
                tabIndex={preset === p.id ? 0 : -1}
                className={`preset${preset === p.id ? ' active' : ''}`}
                onClick={() => setPreset(p.id)}
                onKeyDown={(e) => presetKey(e, i)}
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
        {error && (
          <div className="modal-error" role="alert">
            {error}
          </div>
        )}
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
