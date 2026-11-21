// Folder di halaman Files (aplikasi 10; desain 02 "Files — Light/Dark", komponen Folder Item): Folder Item, menu
// folder (Open, Rename, Delete + dialog), dialog nama folder (New/Rename), dialog "Move to…", dan target seret-lepas.
// Folder hanya metadata viewer (`<dataDir>/folders.json`); file tidak pernah dihapus atau dipindah di disk.
import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { api, ApiError, errorText, type Folder } from './api';
import { Menu, type Item } from './FileMenu';
import { folderHash, folderMeta, memberOf } from './files';
import { Icon } from './icons';
import { Modal } from './NewFileDialog';

/** Tipe data seret kartu/baris file (isi: slug). */
export const DRAG_TYPE = 'application/x-lakar-slug';
export const FOLDER_NAME_MAX = 60;

/** Props seret untuk kartu/baris file. */
export function dragSource(slug: string) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      e.dataTransfer.setData(DRAG_TYPE, slug);
      e.dataTransfer.setData('text/plain', slug);
      e.dataTransfer.effectAllowed = 'move';
    },
  };
}

/** Target lepas file: `active` selama kartu diseret di atasnya; lepas → `onDrop(slug)`. */
export function useDropTarget(onDrop: (slug: string) => void) {
  const [active, setActive] = useState(false);
  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE);
  return {
    active,
    props: {
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!active) setActive(true);
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setActive(false);
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        setActive(false);
        const slug = e.dataTransfer.getData(DRAG_TYPE);
        if (!slug) return;
        e.preventDefault();
        onDrop(slug);
      },
    },
  };
}

/** Folder Item: 56px, ikon folder di kotak 32px, nama 13/500, meta 12, tombol "…". Juga target lepas file. */
export function FolderItem({
  folder,
  count,
  menuOpen,
  onMenu,
  onDropFile,
}: {
  folder: Folder;
  count: number;
  menuOpen: boolean;
  onMenu: (x: number, y: number) => void;
  onDropFile: (slug: string) => void;
}) {
  const drop = useDropTarget(onDropFile);
  const open = () => {
    location.hash = folderHash(folder.id);
  };
  return (
    <div
      className={`folder-item${menuOpen ? ' menu-open' : ''}${drop.active ? ' drop-target' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`Folder ${folder.name}, ${folderMeta(count)}`}
      onClick={open}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          onMenu(r.left + 16, r.top + 16);
        }
      }}
      {...drop.props}
    >
      <span className="folder-icon">
        <Icon name="folder" size={16} />
      </span>
      <span className="folder-info">
        <span className="folder-name">{folder.name}</span>
        <span className="folder-meta">{folderMeta(count)}</span>
      </span>
      <button
        type="button"
        className="icon-btn more-btn"
        aria-label="Folder actions"
        aria-haspopup="menu"
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e: MouseEvent<HTMLElement>) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          onMenu(r.left, r.bottom + 4);
        }}
      >
        <Icon name="ellipsis" size={15} />
      </button>
    </div>
  );
}

/** Nama folder valid: dipangkas 1–60 karakter. */
export const validFolderName = (name: string) => {
  const n = name.trim();
  return n.length >= 1 && n.length <= FOLDER_NAME_MAX;
};

/** Dialog New folder / Rename folder. Nama bentrok (tanpa peka huruf besar) ditolak sebelum dikirim. */
export function FolderNameDialog({ folder, folders, onClose }: { folder?: Folder; folders: readonly Folder[]; onClose: () => void }) {
  const [name, setName] = useState(folder?.name ?? 'Untitled folder');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const trimmed = name.trim();
  const clash = folders.find((f) => f.id !== folder?.id && f.name.toLowerCase() === trimmed.toLowerCase());
  const ok = validFolderName(name) && !clash && !busy;
  const title = folder ? 'Rename folder' : 'New folder';
  const submit = async () => {
    if (!ok) return;
    if (folder && trimmed === folder.name) return onClose();
    setBusy(true);
    setError(undefined);
    try {
      if (folder) await api.renameFolder(folder.id, trimmed);
      else await api.createFolder(trimmed);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'CONFLICT' ? `A folder named “${trimmed}” already exists.` : errorText(e));
      setBusy(false);
    }
  };
  return (
    <Modal label={title} onClose={onClose} className="small">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="modal-text">
          <h2>{title}</h2>
        </div>
        <label className="field">
          <span className="field-label">Name</span>
          <input data-autofocus className="input" value={name} maxLength={FOLDER_NAME_MAX} onChange={(e) => setName(e.target.value)} />
          {(clash || !trimmed) && <span className="field-hint danger">{clash ? `A folder named “${clash.name}” already exists.` : 'Enter a folder name.'}</span>}
        </label>
        {error && <div className="modal-error">{error}</div>}
        <div className="modal-buttons">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!ok}>
            {folder ? 'Rename' : 'Create folder'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteFolderDialog({ folder, count, onClose, onDeleted }: { folder: Folder; count: number; onClose: () => void; onDeleted?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const confirm = async () => {
    setBusy(true);
    try {
      await api.deleteFolder(folder.id);
      onClose();
      onDeleted?.();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Modal label="Delete folder" onClose={onClose} className="small confirm">
      <span className="confirm-icon">
        <Icon name="trash" size={18} />
      </span>
      <div className="modal-text">
        <h2>Delete folder “{folder.name}”?</h2>
        <p>{count > 0 ? `The ${folderMeta(count)} in this folder will move back to Files. No files are deleted.` : 'This folder is empty. No files are deleted.'}</p>
      </div>
      {error && <div className="modal-error">{error}</div>}
      <div className="modal-buttons">
        <button type="button" data-autofocus className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn danger" disabled={busy} onClick={() => void confirm()}>
          Delete folder
        </button>
      </div>
    </Modal>
  );
}

export type FolderMenuTarget = { id: string; x: number; y: number };

/** Menu folder (Open, Rename, Delete) + dialognya. `onDeleted`: mis. kembali ke Files bila folder yang dibuka dihapus. */
export function FolderMenu({
  target,
  folder,
  folders,
  count,
  fromHeader = false,
  onClose,
  onDeleted,
}: {
  target: FolderMenuTarget;
  folder: Folder;
  folders: readonly Folder[];
  count: number;
  /** Dibuka dari header halaman folder itu sendiri: tanpa "Open". */
  fromHeader?: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const [phase, setPhase] = useState<'menu' | 'rename' | 'delete'>('menu');
  if (phase === 'rename') return <FolderNameDialog folder={folder} folders={folders} onClose={onClose} />;
  if (phase === 'delete') return <DeleteFolderDialog folder={folder} count={count} onClose={onClose} {...(onDeleted ? { onDeleted } : {})} />;
  const items: Item[] = [
    ...(fromHeader
      ? []
      : [
          {
            label: 'Open',
            icon: 'arrowUpRight' as const,
            shortcut: '↵',
            run: () => {
              onClose();
              location.hash = folderHash(folder.id);
            },
          },
        ]),
    { label: 'Rename', icon: 'pencil', separator: !fromHeader, run: () => setPhase('rename') },
    { label: 'Delete', icon: 'trash', danger: true, run: () => setPhase('delete') },
  ];
  return <Menu x={target.x} y={target.y} items={items} onClose={onClose} />;
}

/**
 * Dialog "Move to…": pilihan "Files" (root) lalu setiap folder; tujuan saat ini ditandai. `folders`/`current`
 * opsional: tanpa itu (mis. dari Recents) daftar dimuat sendiri.
 */
export function MoveToDialog({ slug, folders: given, current: givenCurrent, onClose, onError }: { slug: string; folders?: readonly Folder[]; current?: string | null; onClose: () => void; onError: (message: string) => void }) {
  const [state, setState] = useState<{ folders: readonly Folder[]; current: string | null } | undefined>(given ? { folders: given, current: givenCurrent ?? null } : undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (given) return;
    api.listFolders().then(
      (s) => setState({ folders: s.folders, current: memberOf(s.membership, slug) }),
      (e: unknown) => setError(errorText(e)),
    );
  }, [given, slug]);
  const move = (folder: string | null) => {
    onClose();
    api.moveToFolder(slug, folder).catch((e: unknown) => onError(errorText(e)));
  };
  const options: { id: string | null; name: string; icon: 'file' | 'folder' }[] = [{ id: null, name: 'Files', icon: 'file' }, ...(state?.folders ?? []).map((f) => ({ id: f.id, name: f.name, icon: 'folder' as const }))];
  /** Fokus awal: pilihan aktif pertama; tidak ada → Cancel. */
  const first = state ? options.findIndex((o) => o.id !== state.current) : -1;
  const listRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Daftar yang dimuat sesudah Modal terbuka: pindahkan fokus begitu pilihan tampil.
  useEffect(() => {
    if (given || !state) return;
    (listRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? cancelRef.current)?.focus();
  }, [given, state]);
  return (
    <Modal label="Move to" onClose={onClose} className="small move-to">
      <div className="modal-text">
        <h2>Move “{slug}” to…</h2>
      </div>
      {error ? (
        <div className="modal-error">{error}</div>
      ) : !state ? (
        <div className="move-list" aria-busy="true">
          <div className="skeleton line" />
        </div>
      ) : (
        <div ref={listRef} className="move-list" role="group" aria-label="Destination">
          {options.map((o, i) => {
            const here = o.id === state.current;
            return (
              <button
                key={o.id ?? '#root'}
                type="button"
                {...(here ? { 'aria-current': 'location' as const } : {})}
                className={`move-option${here ? ' current' : ''}`}
                disabled={here}
                {...(i === first ? { 'data-autofocus': true } : {})}
                onClick={() => move(o.id)}
              >
                <Icon name={o.icon} size={15} />
                <span className="move-name">{o.name}</span>
                {here && <span className="move-current">Current</span>}
              </button>
            );
          })}
          {state.folders.length === 0 && <span className="move-empty">No folders yet. Create one with New folder on the Files page.</span>}
        </div>
      )}
      <div className="modal-buttons">
        <button ref={cancelRef} type="button" className="btn" onClick={onClose} {...(state && first < 0 ? { 'data-autofocus': true } : {})}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
