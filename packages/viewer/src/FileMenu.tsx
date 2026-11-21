// Context menu kartu file (desain 02 "Dashboard — Context Menu") + dialog Rename dan konfirmasi Delete
// ("Dashboard — Delete Confirm"). Recents/Files: Open, Rename, Duplicate, Copy link, Move to Archive, Delete.
// Archive: Unarchive, Delete. Folder/"Move to…" dan "Open in new tab" sengaja tidak ada.
import { useLayoutEffect, useRef, useState } from 'react';
import { api, errorText } from './api';
import { copyText } from './Connections';
import { docHash, docLink, slugify } from './files';
import { Icon, type IconName } from './icons';
import { Modal } from './NewFileDialog';

export type MenuTarget = { slug: string; x: number; y: number };
export type FileAction = 'rename' | 'delete' | 'duplicate' | 'archive';

export type Item = { label: string; icon: IconName; shortcut?: string; danger?: boolean; separator?: boolean; disabled?: boolean; title?: string; run: () => void };

export function Menu({ x, y, items, onClose }: { x: number; y: number; items: Item[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) });
    el.querySelector<HTMLElement>('[role=menuitem]:not(:disabled)')?.focus();
  }, [x, y]);
  const move = (d: number) => {
    const all = [...(ref.current?.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)') ?? [])];
    const i = all.indexOf(document.activeElement as HTMLElement);
    all[(i + d + all.length) % all.length]?.focus();
  };
  return (
    <div
      className="menu-layer"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={ref}
        className="menu"
        role="menu"
        style={pos}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || e.key === 'Tab') {
            e.preventDefault();
            onClose();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            move(1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            move(-1);
          }
        }}
      >
        {items.map((it) => (
          <div key={it.label} className="menu-group">
            {it.separator && <div className="menu-separator" role="separator" />}
            <button type="button" role="menuitem" className={`menu-item${it.danger ? ' danger' : ''}`} onClick={it.run} disabled={it.disabled} title={it.title}>
              <Icon name={it.icon} size={15} />
              <span className="menu-label">{it.label}</span>
              {it.shortcut && <span className="menu-shortcut">{it.shortcut}</span>}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RenameDialog({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [name, setName] = useState(slug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const next = slugify(name);
  const submit = async () => {
    if (!next || busy) return;
    if (next === slug) return onClose();
    setBusy(true);
    try {
      await api.renameFile(slug, name);
      onClose();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Modal label="Rename file" onClose={onClose} className="small">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="modal-text">
          <h2>Rename file</h2>
        </div>
        <label className="field">
          <span className="field-label">Name</span>
          <input data-autofocus className="input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          <span className={`field-hint${next ? '' : ' danger'}`}>
            {next ? (
              <>
                Saved as <span className="mono">{next}</span>
              </>
            ) : (
              'Use letters or numbers in the name.'
            )}
          </span>
        </label>
        {error && <div className="modal-error">{error}</div>}
        <div className="modal-buttons">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!next || busy}>
            Rename
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteDialog({ slug, archived, onClose }: { slug: string; archived: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const confirm = async () => {
    setBusy(true);
    try {
      await api.deleteFile(slug, archived);
      onClose();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Modal label="Delete file" onClose={onClose} className="small confirm">
      <span className="confirm-icon">
        <Icon name="trash" size={18} />
      </span>
      <div className="modal-text">
        <h2>Delete “{slug}”?</h2>
        <p>The file and its change history will be removed from this computer. This can't be undone.</p>
      </div>
      {error && <div className="modal-error">{error}</div>}
      <div className="modal-buttons">
        {/* Fokus awal di Cancel: Enter tidak langsung menghapus permanen. */}
        <button type="button" data-autofocus className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn danger" disabled={busy} onClick={() => void confirm()}>
          Delete file
        </button>
      </div>
    </Modal>
  );
}

/**
 * Menu + dialog untuk satu file. `target` dari klik kanan / tombol "…"; `dialog` langsung membuka Rename/Delete
 * (pintasan F2/Del di kartu). Error aksi tanpa dialog (duplicate, archive, …) dilaporkan lewat `onError`.
 */
export function FileMenu({
  target,
  dialog,
  archived,
  port,
  onClose,
  onError,
}: {
  target: MenuTarget;
  dialog?: 'rename' | 'delete';
  archived: boolean;
  port: number | undefined;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [phase, setPhase] = useState<'menu' | 'rename' | 'delete'>(dialog ?? 'menu');
  const { slug } = target;
  const act = (fn: () => Promise<unknown>) => () => {
    onClose();
    fn().catch((e: unknown) => onError(errorText(e)));
  };

  if (phase === 'rename') return <RenameDialog slug={slug} onClose={onClose} />;
  if (phase === 'delete') return <DeleteDialog slug={slug} archived={archived} onClose={onClose} />;

  const items: Item[] = archived
    ? [
        { label: 'Unarchive', icon: 'archiveRestore', run: act(() => api.unarchiveFile(slug)) },
        { label: 'Delete', icon: 'trash', shortcut: 'Del', danger: true, separator: true, run: () => setPhase('delete') },
      ]
    : [
        {
          label: 'Open',
          icon: 'arrowUpRight',
          shortcut: '↵',
          run: () => {
            onClose();
            location.hash = docHash(slug);
          },
        },
        { label: 'Rename', icon: 'pencil', shortcut: 'F2', separator: true, run: () => setPhase('rename') },
        { label: 'Duplicate', icon: 'copy', shortcut: 'Ctrl D', run: act(() => api.duplicateFile(slug)) },
        {
          label: 'Copy link',
          icon: 'link',
          run: act(async () => copyText(docLink(port ?? (Number(location.port) || 7466), slug))),
        },
        { label: 'Move to Archive', icon: 'archive', separator: true, run: act(() => api.archiveFile(slug)) },
        { label: 'Delete', icon: 'trash', shortcut: 'Del', danger: true, run: () => setPhase('delete') },
      ];
  return <Menu x={target.x} y={target.y} items={items} onClose={onClose} />;
}
