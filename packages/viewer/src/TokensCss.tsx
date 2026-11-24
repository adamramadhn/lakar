// Token ↔ CSS di panel Theme (epic kode story 5, desain 09): popover "Copy tokens" (w6iQk/SpvBC) menyalin
// `tokens.css` atau `theme.css` yang identik dengan hasil Export code (@lakar/codegen), dan dialog "Import CSS
// variables" (wvCMu/ngHGS) yang mempratinjau lalu meng-commit token dari stylesheet codebase (cssImport.ts).
import { useEffect, useMemo, useRef, useState } from 'react';
import { tailwindThemeCss, tokensCss } from '@lakar/codegen';
import type { DocOp, LakarDocument } from '@lakar/schema';
import { highlight, formatBytes, TOK_CLASS, type Tok } from './codeExport';
import { copyText } from './Connections';
import { CSS_IMPORT_MAX_CHARS, importPlan, tokenVarHint, type ImportRow } from './cssImport';
import { DTCG_IMPORT_MAX_CHARS, dtcgImportPlan, type DtcgImportRow } from './dtcgImport';
import { Icon } from './icons';
import { Modal } from './NewFileDialog';
import { modeLabel } from './themeModel';

/** Baris kode berwarna (tanpa nomor baris) untuk snippet kecil. */
function Snippet({ path, text, className = '' }: { path: string; text: string; className?: string }) {
  const lines = useMemo(() => highlight(path, text), [path, text]);
  return (
    <pre className={`code-snippet ${className}`}>
      {lines.map((toks: Tok[], i) => (
        <div key={i}>
          {toks.length === 0
            ? '\u00a0'
            : toks.map((t, j) =>
                TOK_CLASS[t.kind] ? (
                  <span key={j} className={TOK_CLASS[t.kind]}>
                    {t.text}
                  </span>
                ) : (
                  t.text
                ),
              )}
        </div>
      ))}
    </pre>
  );
}

const modeCount = (doc: LakarDocument) => (doc.tokenModes ?? []).length;
const tokensMeta = (doc: LakarDocument) => {
  const n = Object.keys(doc.tokens ?? {}).length;
  const m = modeCount(doc);
  return `${n} ${n === 1 ? 'token' : 'tokens'}${m ? ` · ${m} ${m === 1 ? 'mode' : 'modes'}` : ''}`;
};

/** Popover Copy tokens: format CSS variables (`tokens.css`) atau Tailwind theme (`theme.css`). */
export function CopyTokensPopover({ doc, onClose }: { doc: LakarDocument; onClose: () => void }) {
  const [format, setFormat] = useState<'css' | 'tailwind'>('css');
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const text = format === 'css' ? tokensCss(doc) : tailwindThemeCss(doc);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!ref.current?.contains(t) && !t.closest('.theme-copy-btn')) onClose();
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [onClose]);
  const copy = async () => {
    try {
      await copyText(text);
      setFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setFailed(true);
    }
  };
  return (
    <div ref={ref} className="tokens-pop" role="dialog" aria-label="Copy tokens">
      <div className="tokens-pop-head">
        <strong>Copy tokens</strong>
        <small>{tokensMeta(doc)}</small>
      </div>
      <div className="segmented" role="radiogroup" aria-label="Format">
        {(
          [
            ['css', 'CSS variables'],
            ['tailwind', 'Tailwind theme'],
          ] as const
        ).map(([f, label]) => (
          <button key={f} type="button" role="radio" aria-checked={format === f} className={`segment${format === f ? ' active' : ''}`} onClick={() => setFormat(f)}>
            {label}
          </button>
        ))}
      </div>
      <Snippet path={format === 'css' ? 'tokens.css' : 'theme.css'} text={text} className="tokens-pop-code" />
      <div className="tokens-pop-foot">
        <small className={failed ? 'danger' : undefined}>{failed ? 'Clipboard is not available.' : tokenVarHint(doc)}</small>
        <button type="button" className="btn primary small" onClick={() => void copy()}>
          <Icon name={copied ? 'check' : 'copy'} size={13} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

const isColor = (v: string | number) => typeof v === 'string' && /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(v);
const STATUS_LABEL: Record<ImportRow['status'], string> = { new: 'New', update: 'Update', skipped: 'Skipped' };

/**
 * Dialog Import CSS variables. Pratinjau dihitung dari dokumen terkini; Import → `onImport(build)` dengan pembangun op
 * yang dijalankan pemanggil pada dokumen terbaru, satu permintaan ops = satu rev. `onImport` mengembalikan pesan galat
 * (atau undefined bila sukses): dialog hanya ditutup sesudah commit berhasil, galat ditampilkan di footer.
 */
export function ImportCssDialog({
  doc,
  editable,
  onImport,
  onClose,
}: {
  doc: LakarDocument;
  editable: boolean;
  onImport: (build: (d: LakarDocument) => { ops: DocOp[]; label: string } | { error: string }) => Promise<string | undefined>;
  onClose: () => void;
}) {
  const [source, setSource] = useState<'paste' | 'file'>('paste');
  const [pasted, setPasted] = useState('');
  const [file, setFile] = useState<{ name: string; size: number; text: string } | undefined>(undefined);
  const [fileError, setFileError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [commitError, setCommitError] = useState<string | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);
  const css = source === 'paste' ? pasted : (file?.text ?? '');
  const plan = useMemo(() => importPlan(doc, css), [doc, css]);
  const n = plan.counts.new + plan.counts.update;
  const columns = plan.modes.length ? plan.modes : [undefined];
  const grid = { gridTemplateColumns: `minmax(140px, 190px) minmax(120px, 1fr) 80px repeat(${columns.length}, 84px) 72px` };
  const skippedNotes = plan.rows.filter((r): r is Extract<ImportRow, { status: 'skipped' }> => r.status === 'skipped');

  const pick = async (f: File | undefined) => {
    if (!f) return;
    // Batas karakter diperiksa sebelum membaca: UTF-8 ≤ 4 byte per karakter.
    if (f.size > CSS_IMPORT_MAX_CHARS * 4) {
      setFile(undefined);
      setFileError(`${f.name} is larger than ${CSS_IMPORT_MAX_CHARS / 1024} KB. Import it in parts.`);
      return;
    }
    try {
      setFile({ name: f.name, size: f.size, text: await f.text() });
      setFileError(undefined);
    } catch {
      setFileError(`Could not read ${f.name}.`);
    }
  };
  const submit = async () => {
    if (!n || !editable || busy) return;
    setBusy(true);
    setCommitError(undefined);
    const error = await onImport((d) => {
      const p = importPlan(d, css);
      return p.ops.length ? { ops: p.ops, label: p.label } : { error: p.error ?? 'No CSS variables to import.' };
    });
    setBusy(false);
    if (error) setCommitError(error);
    else onClose();
  };

  return (
    <Modal label="Import CSS variables" onClose={onClose} className="css-import-dialog">
      <header className="code-header">
        <Icon name="fileDown" size={16} />
        <div className="code-titles">
          <h2>Import CSS variables</h2>
          <span>Create typed tokens from a stylesheet in your codebase. Nothing changes until you import.</span>
        </div>
        <span className="code-spacer" />
        <button type="button" className="dp-icon-btn boxed" aria-label="Close" title="Close" onClick={onClose}>
          <Icon name="x" size={14} />
        </button>
      </header>
      <div className="code-body">
        <div className="css-import-source">
          <div className="segmented" role="radiogroup" aria-label="Source">
            {(
              [
                ['paste', 'Paste CSS', 'clipboard'],
                ['file', 'Choose file', 'file'],
              ] as const
            ).map(([s, label, icon]) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={source === s}
                className={`segment${source === s ? ' active' : ''}`}
                onClick={() => {
                  setSource(s);
                  if (s === 'file' && !file) input.current?.click();
                }}
              >
                <Icon name={icon} size={13} />
                {label}
              </button>
            ))}
          </div>
          <input
            ref={input}
            type="file"
            accept=".css,text/css"
            hidden
            onChange={(e) => {
              void pick(e.currentTarget.files?.[0]);
              // Kosongkan agar memilih berkas yang sama lagi (sesudah diedit) tetap memicu onChange.
              e.currentTarget.value = '';
            }}
          />
          {source === 'paste' ? (
            <textarea
              className="css-import-text mono"
              value={pasted}
              spellCheck={false}
              aria-label="CSS"
              placeholder={':root {\n  --colors-bg: #ffffff;\n}\n[data-theme="dark"] {\n  --colors-bg: #0f0f0f;\n}'}
              onChange={(e) => setPasted(e.currentTarget.value)}
              data-autofocus=""
            />
          ) : (
            <>
              <button type="button" className="css-import-chip" onClick={() => input.current?.click()}>
                <Icon name="fileType" size={13} />
                <span className="mono">{file?.name ?? 'Choose a .css file'}</span>
                {file && <small>{formatBytes(file.size)}</small>}
              </button>
              {fileError && (
                <small className="danger" role="alert">
                  {fileError}
                </small>
              )}
              {file && file.text.length <= CSS_IMPORT_MAX_CHARS && <Snippet path="source.css" text={file.text} className="css-import-code" />}
            </>
          )}
        </div>
        <div className="css-import-preview">
          {plan.selectors.length > 0 && (
            <div className="css-import-modes">
              <span className="field-label">Modes</span>
              {plan.selectors.map((s) => (
                <div key={s.selector} className="css-import-mode">
                  <span className="css-import-sel mono">{s.selector}</span>
                  <Icon name="arrowRight" size={13} />
                  <span className="css-import-target">
                    <small>Mode</small>
                    {s.mode}
                    {s.isDefault ? ' · default' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="css-import-table" role="table" aria-label="Tokens to import">
            <div className="css-import-row head" role="row" style={grid}>
              <span role="columnheader">Variable</span>
              <span role="columnheader">Token</span>
              <span role="columnheader">Type</span>
              {columns.map((m) => (
                <span key={m ?? '__value'} role="columnheader">
                  {m ? modeLabel(m) : 'Value'}
                </span>
              ))}
              <span role="columnheader">Status</span>
            </div>
            {plan.rows.length === 0 && <div className="css-import-empty">{plan.error ?? 'Paste a stylesheet or choose a .css file to preview its tokens.'}</div>}
            {plan.rows.map((r, i) => (
              <div key={`${r.variable}-${i}`} className={`css-import-row ${r.status}`} role="row" style={grid}>
                <span className="mono var" role="cell" title={r.variable}>
                  {r.variable}
                </span>
                <span className="mono" role="cell">
                  {r.status === 'skipped' ? '—' : r.token}
                </span>
                <span role="cell">{r.status === 'skipped' ? '—' : r.type}</span>
                {columns.map((m, j) => {
                  const v = r.status === 'skipped' ? undefined : r.values[j];
                  return (
                    <span key={m ?? '__value'} className={`mono${v?.inherited ? ' inherited' : ''}`} role="cell">
                      {v && isColor(v.value) && <i className="css-import-swatch" style={{ background: String(v.value) }} />}
                      {v ? String(v.value) : '—'}
                    </span>
                  );
                })}
                <span role="cell">
                  <span className={`css-import-status ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                </span>
              </div>
            ))}
            {skippedNotes.length > 0 && (
              <div className="css-import-note">
                <Icon name="alert" size={13} />
                <span>
                  {skippedNotes.map((s) => `${s.variable}: ${s.detail}`).join(' ')} Existing tokens with the same name are updated; their layers keep the reference.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      <footer className="code-footer">
        <span className="css-import-stat">
          <i className="dot success" />
          {plan.counts.new} new
        </span>
        <span className="css-import-stat">
          <i className="dot accent" />
          {plan.counts.update} update
        </span>
        <span className="css-import-stat">
          <i className="dot warning" />
          {plan.counts.skipped} skipped
        </span>
        {(commitError ?? (plan.rows.length > 0 ? plan.error : undefined)) && (
          <small className="danger" role="alert">
            {commitError ?? plan.error}
          </small>
        )}
        <span className="code-spacer" />
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        {editable && (
          <button type="button" className="btn primary" disabled={!n || busy} onClick={() => void submit()}>
            <Icon name="fileDown" size={14} />
            {n ? `Import ${n} ${n === 1 ? 'token' : 'tokens'}` : 'Import'}
          </button>
        )}
      </footer>
    </Modal>
  );
}

const DTCG_STATUS_LABEL: Record<DtcgImportRow['status'], string> = { new: 'New', update: 'Update', unsupported: 'Unsupported' };

/**
 * Dialog Import DTCG tokens (Section 11). Sama dengan `ImportCssDialog`: pratinjau dihitung dari dokumen terkini dan
 * `onImport` men-commit satu set op (setTokenModes + setTokens) pada dokumen terbaru → satu rev, bisa di-undo.
 */
export function ImportDtcgDialog({
  doc,
  editable,
  onImport,
  onClose,
}: {
  doc: LakarDocument;
  editable: boolean;
  onImport: (build: (d: LakarDocument) => { ops: DocOp[]; label: string } | { error: string }) => Promise<string | undefined>;
  onClose: () => void;
}) {
  const [source, setSource] = useState<'paste' | 'file'>('paste');
  const [pasted, setPasted] = useState('');
  const [file, setFile] = useState<{ name: string; size: number; text: string } | undefined>(undefined);
  const [fileError, setFileError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [commitError, setCommitError] = useState<string | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);
  const json = source === 'paste' ? pasted : (file?.text ?? '');
  const plan = useMemo(() => dtcgImportPlan(doc, json), [doc, json]);
  const n = plan.counts.new + plan.counts.update;
  const columns = plan.modes.length ? plan.modes : [undefined];
  const grid = { gridTemplateColumns: `minmax(140px, 210px) 96px 88px repeat(${columns.length}, 84px) 92px` };
  const skippedNotes = plan.rows.filter((r): r is Extract<DtcgImportRow, { status: 'unsupported' }> => r.status === 'unsupported');

  const pick = async (f: File | undefined) => {
    if (!f) return;
    // Batas karakter diperiksa sebelum membaca: UTF-8 ≤ 4 byte per karakter.
    if (f.size > DTCG_IMPORT_MAX_CHARS * 4) {
      setFile(undefined);
      setFileError(`${f.name} is larger than ${DTCG_IMPORT_MAX_CHARS / 1024} KB. Import it in parts.`);
      return;
    }
    try {
      setFile({ name: f.name, size: f.size, text: await f.text() });
      setFileError(undefined);
    } catch {
      setFileError(`Could not read ${f.name}.`);
    }
  };
  const submit = async () => {
    if (!n || !editable || busy) return;
    setBusy(true);
    setCommitError(undefined);
    const error = await onImport((d) => {
      const p = dtcgImportPlan(d, json);
      return p.ops.length ? { ops: p.ops, label: p.label } : { error: p.error ?? 'No DTCG tokens to import.' };
    });
    setBusy(false);
    if (error) setCommitError(error);
    else onClose();
  };

  return (
    <Modal label="Import DTCG tokens" onClose={onClose} className="css-import-dialog dtcg-import-dialog">
      <header className="code-header">
        <Icon name="fileDown" size={16} />
        <div className="code-titles">
          <h2>Import DTCG tokens</h2>
          <span>Bring design tokens from a W3C DTCG JSON file. Nothing changes until you import.</span>
        </div>
        <span className="code-spacer" />
        <button type="button" className="dp-icon-btn boxed" aria-label="Close" title="Close" onClick={onClose}>
          <Icon name="x" size={14} />
        </button>
      </header>
      <div className="code-body">
        <div className="css-import-source">
          <div className="segmented" role="radiogroup" aria-label="Source">
            {(
              [
                ['paste', 'Paste JSON', 'clipboard'],
                ['file', 'Choose file', 'file'],
              ] as const
            ).map(([s, label, icon]) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={source === s}
                className={`segment${source === s ? ' active' : ''}`}
                onClick={() => {
                  setSource(s);
                  if (s === 'file' && !file) input.current?.click();
                }}
              >
                <Icon name={icon} size={13} />
                {label}
              </button>
            ))}
          </div>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              void pick(e.currentTarget.files?.[0]);
              e.currentTarget.value = '';
            }}
          />
          {source === 'paste' ? (
            <textarea
              className="css-import-text mono"
              value={pasted}
              spellCheck={false}
              aria-label="DTCG JSON"
              placeholder={'{\n  "colors": {\n    "bg": {\n      "$type": "color",\n      "$value": "#FFFFFF"\n    }\n  }\n}'}
              onChange={(e) => setPasted(e.currentTarget.value)}
              data-autofocus=""
            />
          ) : (
            <>
              <button type="button" className="css-import-chip" onClick={() => input.current?.click()}>
                <Icon name="fileCode" size={13} />
                <span className="mono">{file?.name ?? 'Choose a .json file'}</span>
                {file && <small>{formatBytes(file.size)}</small>}
              </button>
              {fileError && (
                <small className="danger" role="alert">
                  {fileError}
                </small>
              )}
              {file && file.text.length <= DTCG_IMPORT_MAX_CHARS && <Snippet path="tokens.json" text={file.text} className="css-import-code" />}
            </>
          )}
        </div>
        <div className="css-import-preview">
          {plan.modes.length > 0 && (
            <div className="css-import-modes">
              <span className="field-label">Modes</span>
              {plan.modes.map((m, i) => (
                <div key={m} className="css-import-mode">
                  <span className="css-import-sel mono">$extensions.mode</span>
                  <Icon name="arrowRight" size={13} />
                  <span className="css-import-target">
                    <small>Mode</small>
                    {modeLabel(m)}
                    {i === 0 ? ' · default' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="css-import-table" role="table" aria-label="Tokens to import">
            <div className="css-import-row head" role="row" style={grid}>
              <span role="columnheader">Path</span>
              <span role="columnheader">Alias</span>
              <span role="columnheader">Type</span>
              {columns.map((m) => (
                <span key={m ?? '__value'} role="columnheader">
                  {m ? modeLabel(m) : 'Value'}
                </span>
              ))}
              <span role="columnheader">Status</span>
            </div>
            {plan.rows.length === 0 && <div className="css-import-empty">{plan.error ?? 'Paste DTCG JSON or choose a .json file to preview its tokens.'}</div>}
            {plan.rows.map((r, i) => (
              <div key={`${r.path}-${i}`} className={`css-import-row ${r.status}`} role="row" style={grid}>
                <span className="mono var" role="cell" title={r.path}>
                  {r.path}
                </span>
                <span className="mono" role="cell">
                  {r.status === 'unsupported' ? '—' : (r.alias ?? '—')}
                </span>
                <span role="cell">{r.status === 'unsupported' ? '—' : r.type}</span>
                {columns.map((m, j) => {
                  const v = r.status === 'unsupported' ? undefined : r.values[j];
                  return (
                    <span key={m ?? '__value'} className={`mono${v?.inherited ? ' inherited' : ''}`} role="cell">
                      {v && isColor(v.value) && <i className="css-import-swatch" style={{ background: String(v.value) }} />}
                      {v ? String(v.value) : '—'}
                    </span>
                  );
                })}
                <span role="cell">
                  <span className={`css-import-status ${r.status}`}>{DTCG_STATUS_LABEL[r.status]}</span>
                </span>
              </div>
            ))}
            {skippedNotes.length > 0 && (
              <div className="css-import-note">
                <Icon name="alert" size={13} />
                <span>
                  {skippedNotes.map((s) => `${s.path}: ${s.detail}`).join(' ')} Existing tokens with the same name are updated; their layers keep the reference.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      <footer className="code-footer">
        <span className="css-import-stat">
          <i className="dot success" />
          {plan.counts.new} new
        </span>
        <span className="css-import-stat">
          <i className="dot accent" />
          {plan.counts.update} update
        </span>
        <span className="css-import-stat">
          <i className="dot warning" />
          {plan.counts.skipped} unsupported
        </span>
        {(commitError ?? (plan.rows.length > 0 ? plan.error : undefined)) && (
          <small className="danger" role="alert">
            {commitError ?? plan.error}
          </small>
        )}
        <span className="code-spacer" />
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        {editable && (
          <button type="button" className="btn primary" disabled={!n || busy} onClick={() => void submit()}>
            <Icon name="fileDown" size={14} />
            {n ? `Import ${n} ${n === 1 ? 'token' : 'tokens'}` : 'Import'}
          </button>
        )}
      </footer>
    </Modal>
  );
}
