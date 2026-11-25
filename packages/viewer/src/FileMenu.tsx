// Context menu kartu file (desain 02 "Dashboard — Context Menu") + dialog Rename dan konfirmasi Delete
// ("Dashboard — Delete Confirm"). Recents/Files: Open, Open in new tab, Rename, Duplicate, Copy link, Move to Archive, Delete.
// "Open in new tab" (aplikasi 7) menambah tab title bar tanpa berpindah halaman.
// "Move to…" (aplikasi 10) di antara Copy link dan Move to Archive: dialog pilih "Files" (root) atau folder.
// Archive: Unarchive, Delete.
import { useLayoutEffect, useRef, useState } from 'react';
import { api, errorText, type Folder } from './api';
import { copyText } from './Connections';
import { docHash, docLink, fileErrorText, slugify, type FileOp } from './files';
import { MoveToDialog } from './Folders';
import { Icon, type IconName } from './icons';
import { Modal } from './NewFileDialog';
import { openInNewTab } from './tabs';

export type MenuTarget = { slug: string; x: number; y: number };
export type FileAction = 'rename' | 'delete' | 'duplicate' | 'archive';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * Pintasan kartu/baris file (dipegang tautan judul): label menu, nilai `aria-keyshortcuts`, dan tooltip. Ctrl D di
 * macOS = ⌘D (Dashboard menerima keduanya).
 */
export const SHORTCUT = {
  rename: { label: 'F2', aria: 'F2' },
  duplicate: { label: IS_MAC ? '⌘D' : 'Ctrl D', aria: IS_MAC ? 'Meta+D' : 'Control+D' },
  delete: { label: 'Del', aria: 'Delete' },
  open: { label: '↵', aria: 'Enter' },
  file: {
    aria: `Enter F2 ${IS_MAC ? 'Meta+D' : 'Control+D'} Delete Shift+F10`,
    title: `Open (Enter) · Rename (F2) · Duplicate (${IS_MAC ? '⌘D' : 'Ctrl+D'}) · Delete (Del) · More (Shift+F10)`,
  },
  archived: { aria: 'Delete Shift+F10', title: 'Actions (Enter) · Delete (Del)' },
} as const;

/** `icon` kosong → ruang kosong selebar ikon; `checked` → ikon centang + `menuitemradio`. `keys` = `aria-keyshortcuts`. */
/** `heading` = judul bagian di atas item; `key` = kunci React bila label bisa kembar (mis. nama layer). */
export type Item = { label: string; key?: string; heading?: string; icon?: IconName; shortcut?: string; keys?: string; checked?: boolean; danger?: boolean; separator?: boolean; disabled?: boolean; title?: string; run: () => void };

export function Menu({ x, y, items, onClose, up }: { x: number; y: number; items: Item[]; onClose: () => void; /** `up` = jangkar tepi bawah di `y` (menu membuka ke atas, mis. toolbar di bawah kanvas). */ up?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>(() => (up ? { left: x, bottom: window.innerHeight - y } : { left: x, top: y }));
  // Menu ditutup → fokus kembali ke pemicu (tautan kartu, tombol "…") bila masih ada.
  useLayoutEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (before?.isConnected && !ref.current?.contains(before)) before.focus({ preventScroll: true });
    };
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
    // `up`: menu tumbuh ke atas dari jangkar `y`, diklem supaya tepi atasnya tetap ≥ 8px dari atas jendela.
    setPos(up ? { left, bottom: Math.max(8, Math.min(window.innerHeight - y, window.innerHeight - r.height - 8)) } : { left, top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) });
    (el.querySelector<HTMLElement>('[aria-checked=true]') ?? el.querySelector<HTMLElement>('.menu-item:not(:disabled)'))?.focus();
  }, [x, y, up]);
  const move = (d: number) => {
    const all = [...(ref.current?.querySelectorAll<HTMLElement>('.menu-item:not(:disabled)') ?? [])];
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
          } else if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            const all = [...(ref.current?.querySelectorAll<HTMLElement>('.menu-item:not(:disabled)') ?? [])];
            (e.key === 'Home' ? all[0] : all[all.length - 1])?.focus();
          }
        }}
      >
        {items.map((it) => (
          <div key={it.key ?? it.label} className="menu-group" role="none">
            {it.separator && <div className="menu-separator" role="separator" />}
            {it.heading && <div className="menu-heading">{it.heading}</div>}
            <button
              type="button"
              role={it.checked === undefined ? 'menuitem' : 'menuitemradio'}
              {...(it.checked !== undefined ? { 'aria-checked': it.checked } : {})}
              {...(it.keys ? { 'aria-keyshortcuts': it.keys } : {})}
              className={`menu-item${it.danger ? ' danger' : ''}`}
              onClick={it.run}
              disabled={it.disabled}
              title={it.title}
            >
              {it.icon || it.checked ? <Icon name={it.icon ?? 'check'} size={15} /> : <span className="menu-icon-space" />}
              <span className="menu-label">{it.label}</span>
              {it.shortcut && (
                <span className="menu-shortcut" aria-hidden="true">
                  {it.shortcut}
                </span>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** `taken`: slug aktif + arsip yang sudah dimuat; bentrok ditolak sebelum dikirim (daemon tetap memeriksa). */
function RenameDialog({ slug, taken, onClose }: { slug: string; taken: ReadonlySet<string>; onClose: () => void }) {
  const [name, setName] = useState(slug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const next = slugify(name);
  const clash = !!next && next !== slug && taken.has(next);
  const submit = async () => {
    if (!next || busy || clash) return;
    if (next === slug) return onClose();
    setBusy(true);
    setError(undefined);
    try {
      await api.renameFile(slug, name);
      onClose();
    } catch (e) {
      setError(fileErrorText(e, 'rename', next, errorText));
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
          <input
            data-autofocus
            className="input"
            value={name}
            maxLength={200}
            onChange={(e) => {
              setName(e.target.value);
              setError(undefined);
            }}
            aria-invalid={!next || clash}
            aria-describedby="rename-hint"
          />
          <span id="rename-hint" className={`field-hint${next && !clash ? '' : ' danger'}`}>
            {!next ? (
              'Use letters or numbers in the name.'
            ) : clash ? (
              <>
                A file named <span className="mono">{next}</span> already exists.
              </>
            ) : (
              <>
                Saved as <span className="mono">{next}</span>
              </>
            )}
          </span>
        </label>
        {error && (
          <div className="modal-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-buttons">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!next || busy || clash}>
            {busy ? 'Renaming…' : 'Rename'}
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
    setError(undefined);
    try {
      await api.deleteFile(slug, archived);
      onClose();
    } catch (e) {
      setError(fileErrorText(e, 'delete', slug, errorText));
      setBusy(false);
    }
  };
  return (
    <Modal label="Delete file" onClose={onClose} className="small confirm" role="alertdialog">
      <span className="confirm-icon">
        <Icon name="trash" size={18} />
      </span>
      <div className="modal-text">
        <h2>Delete “{slug}”?</h2>
        <p>The file and its change history will be removed from this computer. This can't be undone.</p>
      </div>
      {error && (
        <div className="modal-error" role="alert">
          {error}
        </div>
      )}
      <div className="modal-buttons">
        {/* Fokus awal di Cancel: Enter tidak langsung menghapus permanen. */}
        <button type="button" data-autofocus className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn danger" disabled={busy} onClick={() => void confirm()}>
          {busy ? 'Deleting…' : 'Delete file'}
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
  remote = false,
  port,
  folders,
  folderOf,
  taken = EMPTY,
  onClose,
  onError,
}: {
  target: MenuTarget;
  dialog?: 'rename' | 'delete';
  archived: boolean;
  /** Dokumen remote room `@lakar/sync` (collab story 5): operasi file lokal (rename/dst.) tidak berlaku → menu ringkas + Leave room. */
  remote?: boolean;
  port: number | undefined;
  /** Slug terpakai (aktif + arsip yang dimuat) untuk validasi Rename. */
  taken?: ReadonlySet<string>;
  /** Folder yang sudah dimuat (halaman Files); tanpa ini dialog "Move to…" memuat sendiri. */
  folders?: readonly Folder[];
  /** Folder file ini saat ini (null = root); dipakai bersama `folders`. */
  folderOf?: string | null;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [phase, setPhase] = useState<'menu' | 'rename' | 'delete' | 'move'>(dialog ?? 'menu');
  const { slug } = target;
  const act = (op: FileOp, fn: () => Promise<unknown>) => () => {
    onClose();
    fn().catch((e: unknown) => onError(fileErrorText(e, op, slug, errorText)));
  };

  if (phase === 'rename') return <RenameDialog slug={slug} taken={taken} onClose={onClose} />;
  if (phase === 'delete') return <DeleteDialog slug={slug} archived={archived} onClose={onClose} />;
  if (phase === 'move') return <MoveToDialog slug={slug} {...(folders ? { folders, current: folderOf ?? null } : {})} onClose={onClose} onError={onError} />;

  const items: Item[] = remote
    ? [
        // Room remote (collab story 5): rename/duplicate/archive/move/delete menolak daemon (501) — yang berlaku hanya Leave room.
        {
          label: 'Open',
          icon: 'arrowUpRight',
          shortcut: SHORTCUT.open.label,
          keys: SHORTCUT.open.aria,
          run: () => {
            onClose();
            location.hash = docHash(slug);
          },
        },
        {
          label: 'Open in new tab',
          icon: 'externalLink',
          run: () => {
            onClose();
            openInNewTab(slug);
          },
        },
        {
          label: 'Copy link',
          icon: 'link',
          run: act('copy', async () => copyText(docLink(port ?? (Number(location.port) || 7466), slug))),
        },
        {
          label: 'Leave room',
          icon: 'wifiOff',
          danger: true,
          separator: true,
          run: act('leave', async () => {
            await api.leaveRoom(slug);
            location.hash = '#/';
          }),
        },
      ]
    : archived
    ? [
        { label: 'Unarchive', icon: 'archiveRestore', run: act('unarchive', () => api.unarchiveFile(slug)) },
        { label: 'Delete', icon: 'trash', shortcut: SHORTCUT.delete.label, keys: SHORTCUT.delete.aria, danger: true, separator: true, run: () => setPhase('delete') },
      ]
    : [
        {
          label: 'Open',
          icon: 'arrowUpRight',
          shortcut: SHORTCUT.open.label,
          keys: SHORTCUT.open.aria,
          run: () => {
            onClose();
            location.hash = docHash(slug);
          },
        },
        {
          label: 'Open in new tab',
          icon: 'externalLink',
          run: () => {
            onClose();
            openInNewTab(slug);
          },
        },
        { label: 'Rename', icon: 'pencil', shortcut: SHORTCUT.rename.label, keys: SHORTCUT.rename.aria, separator: true, run: () => setPhase('rename') },
        { label: 'Duplicate', icon: 'copy', shortcut: SHORTCUT.duplicate.label, keys: SHORTCUT.duplicate.aria, run: act('duplicate', () => api.duplicateFile(slug)) },
        {
          label: 'Copy link',
          icon: 'link',
          run: act('copy', async () => copyText(docLink(port ?? (Number(location.port) || 7466), slug))),
        },
        { label: 'Move to…', icon: 'folderInput', run: () => setPhase('move') },
        { label: 'Move to Archive', icon: 'archive', separator: true, run: act('archive', () => api.archiveFile(slug)) },
        { label: 'Delete', icon: 'trash', shortcut: SHORTCUT.delete.label, keys: SHORTCUT.delete.aria, danger: true, run: () => setPhase('delete') },
      ];
  return <Menu x={target.x} y={target.y} items={items} onClose={onClose} />;
}

const EMPTY: ReadonlySet<string> = new Set();
