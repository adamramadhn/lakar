// Dialog "Import from URL" (epic adopsi open-pencil story 8, desain section 11): alamat halaman + preset lebar
// board, lalu daemon mengambil halaman secara eksplisit (anti-SSRF, 15 s/10 MB, tanpa skrip) dan melewatkannya ke
// pipeline HTML yang sama dengan paste. Pola mengikuti NewFileDialog: Modal (Escape/klik scrim, dikunci saat sibuk).
import { useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ApiError, type ImportUrlBody } from './api';
import { IMPORT_PRESETS, IMPORT_STEPS, validPageUrl, type ImportPresetId } from './importUrl';
import { Modal } from './NewFileDialog';

/** Dialog impor URL: dirender saat dibuka; `onSubmit` dipanggil dengan body route `…/import-url` (pageId = page aktif). */
export function ImportUrlDialog({
  busy,
  onSubmit,
  onClose,
}: {
  /** Sementara permintaan impor berjalan: field dikunci, langkah progres ditampilkan, Escape/scrim tak menutup. */
  busy: boolean;
  /** Dipanggil dengan body `POST /viewer/docs/:slug/import-url`; resolve → dialog tutup, reject → error ditampilkan. */
  onSubmit: (body: Omit<ImportUrlBody, 'pageId'>) => Promise<void>;
  /** Tutup dialog (unmount). */
  onClose: () => void;
}) {
  const [url, setUrl] = useState('');
  const [preset, setPreset] = useState<ImportPresetId>('desktop');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const locked = busy || submitting;
  const tryClose = () => {
    if (!locked) onClose();
  };
  const canSubmit = !locked && validPageUrl(url);

  const doSubmit = () => {
    if (!canSubmit) return;
    const p = IMPORT_PRESETS.find((x) => x.id === preset) ?? IMPORT_PRESETS[0];
    setError(null);
    setSubmitting(true);
    void onSubmit({ url: url.trim(), width: p.width, screen: p.screen })
      .then(() => onClose())
      .catch((err) => {
        setSubmitting(false);
        setError(err instanceof ApiError ? `${err.message}${err.hint ? ` ${err.hint}` : ''}` : err instanceof Error ? err.message : String(err));
      });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    doSubmit();
  };
  // Pola radiogroup seperti NewFileDialog: satu Tab stop (roving tabindex), panah memindah pilihan+fokus, Enter mengirim.
  const presetKey = (e: ReactKeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSubmit();
      return;
    }
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (i + d + IMPORT_PRESETS.length) % IMPORT_PRESETS.length;
    setPreset(IMPORT_PRESETS[next]!.id);
    (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  };

  return (
    <Modal label="Import from URL" onClose={tryClose}>
      <form onSubmit={submit}>
        <div className="modal-text">
          <h2>Import from URL</h2>
          <p>Fetch a public web page and turn it into a new board of editable layers.</p>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="import-url-input">
            Page address
          </label>
          <input
            id="import-url-input"
            className="input"
            type="url"
            placeholder="https://example.com"
            value={url}
            disabled={locked}
            data-autofocus
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
          />
          {!error && url.trim() !== '' && !validPageUrl(url) && <p className="field-hint danger">Enter an http(s) page address.</p>}
          {error && <p className="field-hint danger">{error}</p>}
        </div>
        <div className="field">
          <span className="field-label">Board width</span>
          <div className="presets" role="radiogroup" aria-label="Board width">
            {IMPORT_PRESETS.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={preset === p.id}
                tabIndex={preset === p.id ? 0 : -1}
                className={`preset${preset === p.id ? ' active' : ''}`}
                disabled={locked}
                onClick={() => setPreset(p.id)}
                onKeyDown={(e) => presetKey(e, i)}
              >
                <span className="preset-name">{p.label}</span>
                <span className="preset-size">{p.width} px</span>
              </button>
            ))}
          </div>
          <p className="field-hint">Fetches the page once, up to 15 s / 10 MB. Page scripts never run.</p>
        </div>
        {locked && (
          <ol className="import-steps muted-note" aria-label="Import progress">
            <li aria-hidden="true">
              <span className="spinner small" />
            </li>
            {IMPORT_STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        )}
        <div className="modal-buttons">
          <button type="button" className="btn" onClick={onClose} disabled={locked}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!canSubmit}>
            {error ? 'Try again' : 'Import page'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
