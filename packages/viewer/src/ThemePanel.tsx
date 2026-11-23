// Panel Theme (epic token-tema story 3, desain 07 Theme & tokens: gXCqM/Ci5XZ, njMhO/IDR9G; komponen Token Type Item
// vQKzD). Panel melayang di kiri atas canvas, dibuka tombol Theme di sebelah Export. Kiri: jenis token + jumlah; kanan:
// tabel token jenis aktif dengan satu kolom per mode. Setiap aksi = satu permintaan ops lewat `onCommit` Viewer
// (History + undo per jendela, AD-7/AD-8); pembangun op di themeModel.ts (murni). Edit mengantre sampai rev commit
// sebelumnya tampil, supaya edit cepat kedua pada token yang sama dibangun dari definisi terbaru.
// Header: menu Import (CSS variables, DTCG tokens) dan Export (Copy tokens as CSS, Export/Copy DTCG JSON)
// (epic kode story 5 desain 09; impor/ekspor DTCG epic adopsi-open-pencil story 9 Section 11; TokensCss.tsx).
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { TOKEN_TYPES, type DocOp, type LakarDocument, type TokenType } from '@lakar/schema';
import { dtcgTokensJson } from '@lakar/codegen';
import { copyText } from './Connections';
import { withHex } from './designValues';
import { Icon } from './icons';
import { CopyTokensPopover } from './TokensCss';
import {
  addModeOps,
  addTokenOps,
  cellOf,
  countLabel,
  deleteTokenOps,
  firstType,
  modeLabel,
  newTokenName,
  renameModeOps,
  renameTokenOps,
  setCellOps,
  tokenGroups,
  TYPE_META,
  typeCounts,
  usageCounts,
  type Built,
  type ThemeDoc,
  type TokenDefLike,
} from './themeModel';

type Commit = (ops: DocOp[], description: string) => Promise<boolean>;
/** Batas tunggu rev commit sebelumnya sebelum antrean dilanjutkan (dokumen gagal dimuat ulang). */
const PENDING_MAX_MS = 3000;

/** Tombol Theme di kanan atas canvas, di kiri Export (desain q1ciy). */
export function ThemeButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`btn theme-btn canvas-overlay-ui${open ? ' active' : ''}`} aria-expanded={open} aria-haspopup="dialog" onClick={onToggle}>
      <Icon name="palette" size={14} />
      Theme
    </button>
  );
}

/**
 * Antrean commit: `run(build)` membangun op dari dokumen terbaru saat gilirannya tiba (sesudah rev commit
 * sebelumnya tampil). Build yang kini gagal/tanpa perubahan dilewati; commit gagal membuang antrean.
 */
function useCommitQueue(doc: ThemeDoc, rev: number, editable: boolean, onCommit: Commit) {
  const live = useRef({ doc, rev, editable, onCommit });
  live.current = { doc, rev, editable, onCommit };
  const queue = useRef<((d: ThemeDoc) => Built)[]>([]);
  const pending = useRef<{ rev: number; timer: ReturnType<typeof setTimeout> } | undefined>(undefined);
  const flush = useRef(() => {});
  flush.current = () => {
    if (pending.current) return;
    for (let job = queue.current.shift(); job; job = queue.current.shift()) {
      const cur = live.current;
      if (!cur.editable) {
        queue.current = [];
        return;
      }
      const built = job(cur.doc);
      if ('error' in built || built.ops.length === 0) continue;
      const timer = setTimeout(() => {
        if (pending.current?.timer !== timer) return;
        pending.current = undefined;
        flush.current();
      }, PENDING_MAX_MS);
      pending.current = { rev: cur.rev, timer };
      void cur.onCommit(built.ops, built.label).then((ok) => {
        if (ok || pending.current?.timer !== timer) return;
        clearTimeout(timer);
        pending.current = undefined;
        queue.current = [];
      });
      return;
    }
  };
  useEffect(() => {
    const p = pending.current;
    if (!p || p.rev === rev) return;
    clearTimeout(p.timer);
    pending.current = undefined;
    flush.current();
  }, [rev]);
  useEffect(() => () => clearTimeout(pending.current?.timer), []);
  return (build: (d: ThemeDoc) => Built) => {
    if (!live.current.editable) return;
    queue.current.push(build);
    flush.current();
  };
}

/** Validasi segera terhadap dokumen tampil: error → string (input tetap terbuka), sah → antre, undefined. */
type Submit = (text: string) => string | undefined;

/**
 * Input sel/nama: Enter commit (error → tetap terbuka), blur commit, Escape batal. Teks tidak berubah tidak di-commit,
 * kecuali Enter dengan `submitUnchanged` (draf token baru: nama usulan diterima apa adanya).
 */
function CellInput({
  initial,
  placeholder,
  label,
  onSubmit,
  onClose,
  className,
  invalid,
  submitUnchanged,
}: {
  initial: string;
  placeholder?: string;
  label: string;
  onSubmit: Submit;
  onClose: () => void;
  className?: string;
  invalid?: boolean;
  submitUnchanged?: boolean;
}) {
  const [text, setText] = useState(initial);
  const done = useRef(false);
  const finish = (commit: boolean, keepOnError: boolean) => {
    if (done.current) return;
    if (commit && (text !== initial || (submitUnchanged && keepOnError))) {
      const err = onSubmit(text);
      if (err && keepOnError) return;
    }
    done.current = true;
    onClose();
  };
  return (
    <input
      className={`theme-input${invalid ? ' invalid' : ''}${className ? ` ${className}` : ''}`}
      value={text}
      placeholder={placeholder}
      aria-label={label}
      spellCheck={false}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true, true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(false, false);
        }
      }}
      onBlur={() => finish(true, false)}
    />
  );
}

/** Swatch warna token: color picker native, commit sekali saat picker ditutup (event `change`). */
function TokenSwatch({ color, disabled, label, onPick }: { color: string; disabled: boolean; label: string; onPick: (hex: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const solid = /^#[0-9a-f]{6}/i.test(color) ? color.slice(0, 7).toLowerCase() : '#000000';
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onChange = () => pick.current(el.value);
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, [solid]);
  return (
    <label className={`dp-swatch${disabled ? ' disabled' : ''}`} title={label}>
      <i style={{ background: color }} />
      <input ref={ref} type="color" defaultValue={solid} key={solid} disabled={disabled} aria-label={label} />
    </label>
  );
}

type Editing = { kind: 'cell'; name: string; mode: string | undefined } | { kind: 'name'; name: string } | { kind: 'mode'; mode: string } | { kind: 'newMode' } | undefined;

/**
 * `onImportCss`: buka dialog Import CSS variables. Dialog dirender Viewer di luar pohon Canvas: modal di-portal ke body
 * tidak boleh menerima event React gestur canvas (`.canvas-overlay-ui` diperiksa lewat DOM, bukan pohon React).
 */
export function ThemePanel({
  doc,
  rev,
  editable,
  onCommit,
  onClose,
  onImportCss,
  onImportDtcg,
  importOpen = false,
}: {
  doc: LakarDocument;
  rev: number;
  editable: boolean;
  onCommit: Commit;
  onClose: () => void;
  onImportCss?: (() => void) | undefined;
  onImportDtcg?: (() => void) | undefined;
  importOpen?: boolean;
}) {
  const head = doc as unknown as ThemeDoc;
  const tokens = head.tokens ?? {};
  const modes = head.tokenModes ?? [];
  const run = useCommitQueue(head, rev, editable, onCommit);
  const [type, setType] = useState<TokenType>(() => firstType(tokens));
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<Editing>(undefined);
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | undefined>(undefined);
  const [confirm, setConfirm] = useState<{ name: string; top: number } | undefined>(undefined);
  const [copyOpen, setCopyOpen] = useState(false);
  const [menu, setMenu] = useState<'import' | 'export' | undefined>(undefined);
  const [copiedDtcg, setCopiedDtcg] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const counts = useMemo(() => typeCounts(tokens), [tokens]);
  const usage = useMemo(() => usageCounts(head), [head]);
  const groups = tokenGroups(tokens, type, filter);
  const meta = TYPE_META[type];
  /** Kolom nilai: satu per mode; dokumen tanpa mode = satu kolom "Value" (`undefined`). */
  const columns: (string | undefined)[] = modes.length ? [...modes] : [undefined];
  const grid = { gridTemplateColumns: `minmax(150px, 230px) repeat(${columns.length + (editing?.kind === 'newMode' ? 1 : 0)}, minmax(72px, 1fr)) 36px` };

  // Escape menutup popover lalu panel; Escape di input ditangani input itu sendiri (batal edit).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Dialog impor (modal) menangani Escape sendiri.
      if (importOpen) return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      // Hanya fokus di dalam panel atau tanpa fokus (body); panel tersembunyi (lebar mobile) tidak menelan Escape.
      const el = root.current;
      if (!el || el.offsetParent === null || !(t instanceof Node) || (t !== document.body && !el.contains(t))) return;
      e.stopPropagation();
      if (confirm) setConfirm(undefined);
      else if (menu) setMenu(undefined);
      else if (copyOpen) setCopyOpen(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [confirm, copyOpen, menu, importOpen, onClose]);
  // Klik di luar popover hapus menutupnya.
  useEffect(() => {
    if (!confirm) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.theme-confirm')) setConfirm(undefined);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [confirm]);
  // Klik di luar menu header menutupnya.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.theme-menu-wrap')) setMenu(undefined);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [menu]);
  // Baca-saja (offline): tutup semua edit.
  useEffect(() => {
    if (editable) return;
    setEditing(undefined);
    setDraft(undefined);
    setConfirm(undefined);
  }, [editable]);

  /** Buka satu editor; pesan error edit sebelumnya dibuang (garis merah hanya untuk input yang gagal). */
  const startEdit = (e: NonNullable<Editing>) => {
    setError(undefined);
    setEditing(e);
  };
  /** Validasi sekarang lalu antre pembangun yang sama terhadap dokumen terbaru. */
  const submit = (build: (d: ThemeDoc) => Built): string | undefined => {
    const now = build(head);
    if ('error' in now) {
      setError(now.error);
      return now.error;
    }
    setError(undefined);
    if (now.ops.length) run(build);
    return undefined;
  };
  const pickType = (t: TokenType) => {
    setType(t);
    setDraft(undefined);
    setEditing(undefined);
    setError(undefined);
  };
  const startDraft = () => {
    if (!editable) return;
    setEditing(undefined);
    setFilter('');
    setDraft(newTokenName(tokens, type));
    setError(undefined);
  };

  const valueCell = (name: string, def: TokenDefLike, mode: string | undefined): ReactNode => {
    const cell = cellOf(def, mode, modes);
    const isEditing = editing?.kind === 'cell' && editing.name === name && editing.mode === mode;
    const colLabel = mode ? modeLabel(mode) : 'Value';
    if (isEditing) {
      return (
        <CellInput
          label={`${name} ${colLabel}`}
          initial={meta.format(cell.value)}
          // Nilai tidak sah → kolom kembali ke nilai lama (pesan di footer), tanpa request.
          onSubmit={(t) => void submit((d) => setCellOps(d.tokens, name, mode, t, d.tokenModes))}
          onClose={() => setEditing(undefined)}
        />
      );
    }
    const open = () => editable && startEdit({ kind: 'cell', name, mode });
    if (cell.inherited) {
      return (
        <button type="button" className="theme-inherited" disabled={!editable} title={`Uses the ${modeLabel(modes[0] ?? '')} value. Click to set a ${colLabel} value.`} onClick={open}>
          = {modeLabel(modes[0] ?? '')}
        </button>
      );
    }
    if (def.type === 'color') {
      const color = String(cell.value);
      return (
        <>
          <TokenSwatch
            color={color}
            disabled={!editable}
            label={`${name} ${colLabel} color`}
            onPick={(hex) => submit((d) => setCellOps(d.tokens, name, mode, withHex(cellOf(d.tokens?.[name] ?? def, mode, d.tokenModes).value, hex), d.tokenModes))}
          />
          <button type="button" className="theme-value plain" disabled={!editable} onClick={open} aria-label={`Edit ${name} ${colLabel}`}>
            {meta.format(color)}
          </button>
        </>
      );
    }
    return (
      <button type="button" className="theme-value" disabled={!editable} onClick={open} aria-label={`Edit ${name} ${colLabel}`}>
        {meta.format(cell.value)}
      </button>
    );
  };

  const confirmDef = confirm ? tokens[confirm.name] : undefined;
  const confirmUses = confirm ? (usage.get(confirm.name) ?? 0) : 0;
  return (
    <div ref={root} className="theme-panel canvas-overlay-ui canvas-scroll-ui" role="dialog" aria-label="Theme">
      <header className="theme-header">
        <Icon name="palette" size={15} />
        <strong>Theme</strong>
        <span className="badge">{countLabel(tokens, modes)}</span>
        <span className="theme-spacer" />
        {editable && (onImportCss || onImportDtcg) && (
          <span className="theme-menu-wrap">
            <button
              type="button"
              className={`btn small theme-menu-btn${menu === 'import' ? ' active' : ''}`}
              aria-expanded={menu === 'import'}
              aria-haspopup="menu"
              onClick={() => {
                setCopyOpen(false);
                setMenu((m) => (m === 'import' ? undefined : 'import'));
              }}
            >
              <Icon name="fileDown" size={13} />
              Import
              <Icon name="chevronDown" size={11} />
            </button>
            {menu === 'import' && (
              <div className="theme-menu" role="menu" aria-label="Import tokens">
                {onImportCss && (
                  <button
                    type="button"
                    role="menuitem"
                    className="theme-menu-item"
                    onClick={() => {
                      setMenu(undefined);
                      onImportCss();
                    }}
                  >
                    CSS variables…
                  </button>
                )}
                {onImportDtcg && (
                  <button
                    type="button"
                    role="menuitem"
                    className="theme-menu-item"
                    onClick={() => {
                      setMenu(undefined);
                      onImportDtcg();
                    }}
                  >
                    DTCG tokens (.json)…
                  </button>
                )}
              </div>
            )}
          </span>
        )}
        <span className="theme-menu-wrap">
          <button
            type="button"
            className={`btn small theme-menu-btn${menu === 'export' || copyOpen ? ' active' : ''}`}
            aria-expanded={menu === 'export' || copyOpen}
            aria-haspopup="menu"
            disabled={Object.keys(tokens).length === 0}
            title={Object.keys(tokens).length === 0 ? 'No tokens yet' : undefined}
            onClick={() => {
              setCopyOpen(false);
              setMenu((m) => (m === 'export' ? undefined : 'export'));
            }}
          >
            <Icon name={copiedDtcg ? 'check' : 'download'} size={13} />
            {copiedDtcg ? 'Copied' : 'Export'}
            <Icon name="chevronDown" size={11} />
          </button>
          {menu === 'export' && (
            <div className="theme-menu" role="menu" aria-label="Export tokens">
              <button
                type="button"
                role="menuitem"
                className="theme-menu-item theme-copy-btn"
                onClick={() => {
                  setMenu(undefined);
                  setCopyOpen(true);
                }}
              >
                Copy tokens as CSS
              </button>
              <button
                type="button"
                role="menuitem"
                className="theme-menu-item"
                onClick={() => {
                  setMenu(undefined);
                  const blob = new Blob([dtcgTokensJson(doc)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'tokens.json';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export DTCG JSON
              </button>
              <button
                type="button"
                role="menuitem"
                className="theme-menu-item"
                onClick={() => {
                  setMenu(undefined);
                  void copyText(dtcgTokensJson(doc))
                    .then(() => {
                      setCopiedDtcg(true);
                      setTimeout(() => setCopiedDtcg(false), 1500);
                    })
                    .catch(() => {});
                }}
              >
                Copy DTCG JSON
              </button>
            </div>
          )}
        </span>
        {copyOpen && <CopyTokensPopover doc={doc} onClose={() => setCopyOpen(false)} />}
        <button type="button" className="dp-icon-btn boxed" title="Close" aria-label="Close Theme" onClick={onClose}>
          <Icon name="x" size={14} />
        </button>
      </header>
      <div className="theme-body">
        <nav className="theme-types" aria-label="Token types">
          <span className="theme-types-label">TYPES</span>
          {TOKEN_TYPES.map((t) => (
            <button key={t} type="button" className={`theme-type${t === type ? ' active' : ''}`} aria-pressed={t === type} onClick={() => pickType(t)}>
              <Icon name={TYPE_META[t].icon} size={14} />
              <span className="theme-type-label">{TYPE_META[t].label}</span>
              <span className="theme-type-count">{counts[t]}</span>
            </button>
          ))}
        </nav>
        <div className="theme-table">
          <div className="theme-toolbar">
            <label className="theme-filter">
              <Icon name="search" size={13} />
              <input value={filter} placeholder={`Filter ${meta.label.toLowerCase()} tokens`} aria-label="Filter tokens" spellCheck={false} onChange={(e) => setFilter(e.currentTarget.value)} />
            </label>
            <button type="button" className="btn small" disabled={!editable} onClick={startDraft}>
              <Icon name="plus" size={13} />
              New token
            </button>
          </div>
          <div className="theme-row theme-head" style={grid}>
            <span className="theme-cell">Name</span>
            {columns.map((m, i) => (
              <span key={m ?? '__value'} className="theme-cell theme-mode">
                {m !== undefined && editing?.kind === 'mode' && editing.mode === m ? (
                  <CellInput
                    className="mode"
                    label={`Rename mode ${modeLabel(m)}`}
                    initial={modeLabel(m)}
                    onSubmit={(t) => submit((d) => renameModeOps(d, m, t))}
                    onClose={() => setEditing(undefined)}
                    invalid={error !== undefined}
                  />
                ) : (
                  <button type="button" className="theme-mode-label" disabled={!editable || m === undefined} title={m === undefined ? undefined : 'Rename mode'} onClick={() => m !== undefined && startEdit({ kind: 'mode', mode: m })}>
                    {m === undefined ? 'Value' : modeLabel(m)}
                  </button>
                )}
                {m !== undefined && i === 0 && <span className="badge small">Default</span>}
              </span>
            ))}
            {editing?.kind === 'newMode' && (
              <span className="theme-cell theme-mode">
                <CellInput className="mode" label="New mode name" initial="" placeholder="New mode" onSubmit={(t) => submit((d) => addModeOps(d, t))} onClose={() => setEditing(undefined)} invalid={error !== undefined} />
              </span>
            )}
            <span className="theme-cell theme-actions">
              <button type="button" className="theme-icon-btn" title="Add mode" aria-label="Add mode" disabled={!editable} onClick={() => startEdit({ kind: 'newMode' })}>
                <Icon name="plus" size={13} />
              </button>
            </span>
          </div>
          <div className="theme-rows">
            {groups.length === 0 && draft === undefined && (
              <div className="theme-empty">{filter ? `No ${meta.label.toLowerCase()} tokens match “${filter}”.` : `No ${meta.label.toLowerCase()} tokens yet.`}</div>
            )}
            {groups.map((g) => (
              <Fragment key={g.group}>
                {g.group && (
                  <button
                    type="button"
                    className={`theme-group${collapsed.has(g.group) ? ' collapsed' : ''}`}
                    aria-expanded={!collapsed.has(g.group)}
                    onClick={() =>
                      setCollapsed((c) => {
                        const n = new Set(c);
                        if (!n.delete(g.group)) n.add(g.group);
                        return n;
                      })
                    }
                  >
                    <Icon name="chevronDown" size={11} />
                    <span>{g.group}</span>
                  </button>
                )}
                {!collapsed.has(g.group) &&
                  g.rows.map(({ name, def }) => {
                    const uses = usage.get(name) ?? 0;
                    return (
                      <div key={name} className={`theme-row theme-token${confirm?.name === name ? ' selected' : ''}`} style={grid} data-token={name}>
                        <span className="theme-cell theme-name">
                          {def.type !== 'color' && <Icon name={meta.icon} size={12} className="theme-name-icon" />}
                          {editing?.kind === 'name' && editing.name === name ? (
                            <CellInput label={`Rename ${name}`} initial={name} onSubmit={(t) => submit((d) => renameTokenOps(d.tokens, name, t))} onClose={() => setEditing(undefined)} invalid={error !== undefined} />
                          ) : (
                            <>
                              <button type="button" className="theme-name-text" disabled={!editable} title={editable ? 'Rename token' : name} onClick={() => startEdit({ kind: 'name', name })}>
                                {name}
                              </button>
                              <span className="theme-usage">{uses === 1 ? '1 layer' : `${uses} layers`}</span>
                            </>
                          )}
                        </span>
                        {columns.map((m) => (
                          <span key={m ?? '__value'} className="theme-cell">
                            {valueCell(name, def, m)}
                          </span>
                        ))}
                        {editing?.kind === 'newMode' && <span className="theme-cell" />}
                        <span className="theme-cell theme-actions">
                          <button
                            type="button"
                            className="theme-icon-btn danger"
                            title="Delete token"
                            aria-label={`Delete ${name}`}
                            disabled={!editable}
                            onClick={(e) => {
                              const box = root.current?.getBoundingClientRect();
                              const r = e.currentTarget.getBoundingClientRect();
                              // Di bawah baris; baris dekat dasar panel → popover naik agar tidak terpotong.
                              setConfirm({ name, top: box ? Math.max(58, Math.min(r.bottom - box.top + 6, box.height - 176)) : 0 });
                            }}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </span>
                      </div>
                    );
                  })}
              </Fragment>
            ))}
            {draft !== undefined && (
              <div className="theme-row theme-token draft" style={grid}>
                <span className="theme-cell theme-name">
                  {type !== 'color' && <Icon name={meta.icon} size={12} className="theme-name-icon" />}
                  <CellInput
                    label="New token name"
                    initial={draft}
                    submitUnchanged
                    onSubmit={(t) => submit((d) => addTokenOps(d.tokens, t, type))}
                    onClose={() => setDraft(undefined)}
                    invalid={error !== undefined}
                  />
                </span>
                {columns.map((m, i) => (
                  <span key={m ?? '__value'} className="theme-cell">
                    {i === 0 ? <span className="theme-value static">{meta.format(meta.initial)}</span> : <span className="theme-inherited static">= {modeLabel(modes[0] ?? '')}</span>}
                  </span>
                ))}
                {editing?.kind === 'newMode' && <span className="theme-cell" />}
                <span className="theme-cell theme-actions" />
              </div>
            )}
          </div>
          <footer className="theme-footer">
            <button type="button" className="theme-add" disabled={!editable} onClick={startDraft}>
              <Icon name="plus" size={13} />
              New {meta.label.toLowerCase()} token
            </button>
            <span className="theme-spacer" />
            {error ? (
              <span className="theme-error" role="alert">
                {error}
              </span>
            ) : !editable ? (
              <span className="theme-hint">
                <Icon name="lock" size={12} /> Read only while lakard is offline.
              </span>
            ) : (
              modes.length > 1 && <span className="theme-hint">Empty mode cells use the default mode value.</span>
            )}
          </footer>
        </div>
      </div>
      {confirm && confirmDef && (
        <div className="theme-confirm" role="alertdialog" aria-label={`Delete ${confirm.name}`} style={{ top: confirm.top }}>
          <strong>Delete {confirm.name}?</strong>
          <p>
            {confirmUses === 0
              ? 'No layers use this token. You can undo this.'
              : `${confirmUses === 1 ? '1 layer uses' : `${confirmUses} layers use`} this token. ${confirmUses === 1 ? 'It keeps its' : 'They keep their'} current value as a plain ${TYPE_META[confirmDef.type].plain} (detached). You can undo this.`}
          </p>
          <div className="theme-confirm-buttons">
            <button type="button" className="btn small" autoFocus onClick={() => setConfirm(undefined)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn small danger"
              onClick={() => {
                const name = confirm.name;
                setConfirm(undefined);
                submit((d) => deleteTokenOps(d, name));
              }}
            >
              Delete token
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
