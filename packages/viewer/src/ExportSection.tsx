// Seksi "Export" di tab Design (spec-viewer-merged-design-tab, desain viewer-panel-redesign.pen): preset baris ala
// Figma (skala + format + −, "+" tambah preset), kolom tujuan (folder + nama; ekstensi dari format), tombol "Export
// <nama>" yang menulis ke disk lewat POST /viewer/docs/:slug/export-file, row "Preview" (thumbnail lewat export PNG),
// dan row Code → dialog Export code. Bekerja pada layer terpilih (seleksi tunggal); tanpa seleksi → dinonaktifkan.
import { useEffect, useState } from 'react';
import { api, errorText } from './api';
import { Icon } from './icons';

export type ExportSel = { boardId: string; nodeId: string; name: string };

type Preset = { id: number; scale: 1 | 2; format: 'png' | 'svg'; suffix: string };

let presetSeq = 0;
const newPreset = (format: 'png' | 'svg'): Preset => ({ id: ++presetSeq, scale: format === 'svg' ? 1 : 2, format, suffix: format === 'svg' ? '' : '@2x' });

const slugifyName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'export';

type Status = { state: 'idle' } | { state: 'busy' } | { state: 'saved'; path: string } | { state: 'error'; message: string };

export function ExportSection({
  slug,
  sel,
  onExportCode,
}: {
  slug: string;
  /** Seleksi tunggal yang bisa diekspor; undefined = tanpa seleksi sah (dinonaktifkan). */
  sel: ExportSel | undefined;
  /** Buka dialog Export code untuk layer terpilih; undefined = disembunyikan. */
  onExportCode?: (() => void) | undefined;
}) {
  const [open, setOpen] = useState(true);
  const [presets, setPresets] = useState<readonly Preset[]>([newPreset('png'), newPreset('svg')]);
  const [dir, setDir] = useState('~/Downloads');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Nama default mengikuti layer terpilih; perubahan seleksi mereset status.
  useEffect(() => {
    setName(sel ? slugifyName(sel.name) : '');
    setStatus({ state: 'idle' });
    setPreviewUrl((u) => {
      if (u) URL.revokeObjectURL(u);
      return undefined;
    });
  }, [sel?.nodeId, sel?.name]);

  const run = async () => {
    if (!sel || !name.trim() || !dir.trim() || status.state === 'busy') return;
    setStatus({ state: 'busy' });
    try {
      for (const p of presets) {
        const fileName = `${name.trim()}${p.suffix}`;
        const r = await api.exportFile(slug, { boardId: sel.boardId, nodeId: sel.nodeId, scale: p.scale, format: p.format, dir: dir.trim(), name: fileName });
        setStatus({ state: 'saved', path: r.path });
      }
    } catch (e) {
      setStatus({ state: 'error', message: errorText(e) });
    }
  };

  const showPreview = async () => {
    if (!sel) return;
    if (previewUrl) {
      setPreviewOpen((o) => !o);
      return;
    }
    try {
      const { blob } = await api.exportPng(slug, sel.boardId, 1, sel.nodeId);
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewOpen(true);
    } catch {
      /* pratinjau gagal → biarkan row tertutup */
    }
  };

  const summary = presets.map((p) => `${p.format.toUpperCase()} ${p.scale}x`).join(' · ');
  return (
    <div className="export-section">
      <div className="dp-section-head">
        <button type="button" className="dp-section-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name="chevronDown" size={11} className={`dp-section-caret${open ? ' open' : ''}`} />
          <span className="dp-section-title">Export</span>
          <span className="dp-section-summary">{summary}</span>
        </button>
        <button
          type="button"
          className="dp-icon-btn boxed"
          title="Add export preset"
          aria-label="Add export preset"
          onClick={() => {
            setOpen(true);
            setPresets((p) => [...p, newPreset('png')]);
          }}
        >
          <Icon name="plus" size={13} />
        </button>
      </div>
      {open && (
        <div className="export-section-body">
          {presets.map((p) => (
            <div key={p.id} className="export-preset">
              <div className="segmented" role="radiogroup" aria-label="Scale">
                {([1, 2] as const).map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    role="radio"
                    aria-checked={p.scale === sc}
                    className={`segment${p.scale === sc ? ' active' : ''}`}
                    disabled={p.format === 'svg'}
                    onClick={() => setPresets((ps) => ps.map((q) => (q.id === p.id ? { ...q, scale: sc, suffix: sc === 1 ? '' : '@2x' } : q)))}
                  >
                    {sc}x
                  </button>
                ))}
              </div>
              <input
                className="input export-suffix"
                value={p.suffix}
                placeholder="Suffix"
                aria-label="File suffix"
                spellCheck={false}
                onChange={(e) => setPresets((ps) => ps.map((q) => (q.id === p.id ? { ...q, suffix: e.currentTarget.value } : q)))}
              />
              <select
                className="input select export-format"
                value={p.format}
                aria-label="Format"
                onChange={(e) => setPresets((ps) => ps.map((q) => (q.id === p.id ? { ...q, format: e.currentTarget.value as 'png' | 'svg' } : q)))}
              >
                <option value="png">PNG</option>
                <option value="svg">SVG</option>
              </select>
              <button
                type="button"
                className="theme-icon-btn"
                title="Remove preset"
                aria-label="Remove preset"
                disabled={presets.length <= 1}
                onClick={() => setPresets((ps) => ps.filter((q) => q.id !== p.id))}
              >
                <Icon name="minus" size={13} />
              </button>
            </div>
          ))}
          <div className="export-dest">
            <label className="export-dest-row">
              <span className="export-dest-label">Folder</span>
              <input className="input" value={dir} spellCheck={false} aria-label="Save folder" onChange={(e) => setDir(e.currentTarget.value)} />
            </label>
            <label className="export-dest-row">
              <span className="export-dest-label">Name</span>
              <input className="input" value={name} placeholder="file name" spellCheck={false} aria-label="File name" onChange={(e) => setName(e.currentTarget.value)} />
            </label>
          </div>
          <button
            type="button"
            className="btn primary export-run"
            disabled={!sel || !name.trim() || !dir.trim() || status.state === 'busy'}
            onClick={run}
            title={!sel ? 'Select a layer to export' : undefined}
          >
            {status.state === 'busy' ? <div className="spinner small" /> : <Icon name="download" size={14} />}
            {status.state === 'busy' ? 'Exporting…' : `Export ${sel?.name ?? 'selection'}`}
          </button>
          <button type="button" className="export-preview-toggle" aria-expanded={previewOpen} onClick={showPreview} disabled={!sel}>
            <Icon name="chevronDown" size={11} className={`dp-section-caret${previewOpen ? ' open' : ''}`} />
            Preview
          </button>
          {previewOpen && previewUrl && <img className="export-preview-img" src={previewUrl} alt={`Preview of ${sel?.name ?? 'selection'}`} />}
          {status.state === 'saved' && (
            <div className="export-note" role="status">
              <Icon name="circleCheck" size={13} />
              <span>
                Saved: <span className="mono">{status.path}</span>
              </span>
            </div>
          )}
          {status.state === 'error' && (
            <div className="export-note danger" role="alert">
              <Icon name="alert" size={13} />
              <span>{status.message}</span>
            </div>
          )}
          {onExportCode && (
            <div className="export-code-row">
              <span className="export-code-label">Code</span>
              <span className="export-code-target">React + Tailwind · TS</span>
              <button type="button" className="btn export-code-btn" disabled={!sel} onClick={onExportCode}>
                <Icon name="codeXml" size={14} />
                Export code…
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
