// Section Pages di panel kiri Viewer (aplikasi 8; desain 03 "Viewer" + komponen Page Row): header "Pages" + tombol
// "+", baris halaman (default: ikon file; aktif: latar surface-hover, ikon check, teks primer), rename inline
// (double-click / menu), menu konteks (Rename, Move up, Move down, Delete), dialog konfirmasi hapus, dan drag untuk
// mengurutkan dengan garis penanda posisi jatuh. Aksi tulis dijalankan Viewer (api + toast); panel hanya UI.
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Menu, type Item } from './FileMenu';
import { Icon } from './icons';
import { Modal } from './NewFileDialog';
import { dropTarget } from './pages';

export type PageItem = { id: string; name: string; boardCount: number };

const LAST_PAGE = 'A file needs at least one page';

export function PagesPanel({
  pages,
  activeId,
  editable,
  disabledReason,
  onSelect,
  onAdd,
  onRename,
  onMove,
  onDelete,
}: {
  pages: readonly PageItem[];
  activeId: string | undefined;
  /** false saat pratinjau versi atau offline: semua aksi tulis nonaktif. */
  editable: boolean;
  disabledReason: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onMove: (id: string, index: number) => void;
  /** Dipanggil sesudah konfirmasi; mengembalikan promise supaya dialog bisa menunggu. */
  onDelete: (id: string) => Promise<void>;
}) {
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | undefined>(undefined);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [deleteAsk, setDeleteAsk] = useState<PageItem | undefined>(undefined);
  /** ID halaman yang diseret dan celah jatuh (0..n: sebelum baris `gap`). Indeks asal dihitung ulang dari ID. */
  const [drag, setDrag] = useState<{ id: string; gap: number | undefined } | undefined>(undefined);
  const dragFrom = drag ? pages.findIndex((p) => p.id === drag.id) : -1;

  // Tidak bisa diedit lagi (pratinjau/offline) → tutup rename inline, menu, dan dialog hapus.
  useEffect(() => {
    if (editable) return;
    setEditingId(undefined);
    setMenu(undefined);
    setDrag(undefined);
    setDeleteAsk(undefined);
  }, [editable]);

  const menuItems = (id: string): Item[] => {
    const i = pages.findIndex((p) => p.id === id);
    const page = pages[i];
    if (!page) return [];
    const run = (fn: () => void) => () => {
      setMenu(undefined);
      fn();
    };
    const last = pages.length <= 1;
    return [
      { label: 'Rename', icon: 'pencil', run: run(() => setEditingId(id)) },
      { label: 'Move up', icon: 'arrowUp', disabled: i === 0, run: run(() => onMove(id, i - 1)) },
      { label: 'Move down', icon: 'arrowDown', disabled: i === pages.length - 1, run: run(() => onMove(id, i + 1)) },
      { label: 'Delete', icon: 'trash', danger: true, separator: true, disabled: last, ...(last ? { title: LAST_PAGE } : {}), run: run(() => setDeleteAsk(page)) },
    ];
  };

  /** Celah jatuh dari posisi kursor di baris `i`: separuh atas → sebelum, separuh bawah → sesudah. */
  const gapAt = (i: number, e: DragEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2 ? i : i + 1;
  };

  return (
    <div className="pages">
      <div className="section-header">
        <span className="section-label">Pages</span>
        <button type="button" className="add-layer-btn" aria-label="Add page" title={editable ? 'Add page' : disabledReason} disabled={!editable} onClick={onAdd}>
          <Icon name="plus" size={13} />
        </button>
      </div>
      <div className="page-list" onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setDrag((d) => d && { ...d, gap: undefined })}>
        {pages.map((p, i) => {
          const active = p.id === activeId;
          const indicator = drag?.gap !== undefined && dragFrom !== -1 && dropTarget(dragFrom, drag.gap) !== undefined ? drag.gap : undefined;
          const cls = `page-row${active ? ' active' : ''}${indicator === i ? ' drop-before' : ''}${indicator === i + 1 && i === pages.length - 1 ? ' drop-after' : ''}${dragFrom === i ? ' dragging' : ''}`;
          if (editingId === p.id) {
            return (
              <div key={p.id} className={cls}>
                <Icon name={active ? 'check' : 'file'} size={12} />
                <RenameInput
                  initial={p.name}
                  onDone={(name) => {
                    setEditingId(undefined);
                    if (name !== undefined && name !== p.name) onRename(p.id, name);
                  }}
                />
              </div>
            );
          }
          return (
            <button
              key={p.id}
              type="button"
              className={cls}
              aria-current={active ? 'page' : undefined}
              draggable={editable}
              onClick={() => onSelect(p.id)}
              onDoubleClick={() => editable && setEditingId(p.id)}
              onKeyDown={(e) => {
                if (e.key === 'F2' && editable) {
                  e.preventDefault();
                  setEditingId(p.id);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (editable) setMenu({ id: p.id, x: e.clientX, y: e.clientY });
              }}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', p.name);
                setDrag({ id: p.id, gap: undefined });
              }}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const gap = gapAt(i, e);
                if (gap !== drag.gap) setDrag({ ...drag, gap });
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (!drag) return;
                // Halaman dimuat ulang saat diseret: indeks asal dari ID; halaman hilang → batal.
                const from = pages.findIndex((x) => x.id === drag.id);
                setDrag(undefined);
                if (from === -1) return;
                const to = dropTarget(from, gapAt(i, e));
                if (to !== undefined) onMove(drag.id, to);
              }}
              onDragEnd={() => setDrag(undefined)}
            >
              <Icon name={active ? 'check' : 'file'} size={12} />
              <span className="page-name">{p.name}</span>
            </button>
          );
        })}
      </div>
      {menu && <Menu x={menu.x} y={menu.y} items={menuItems(menu.id)} onClose={() => setMenu(undefined)} />}
      {deleteAsk && <DeletePageDialog page={deleteAsk} onClose={() => setDeleteAsk(undefined)} onConfirm={() => onDelete(deleteAsk.id)} />}
    </div>
  );
}

/** Rename inline: Enter/blur simpan, Escape batal, kosong = batal. `onDone(undefined)` = batal. */
function RenameInput({ initial, onDone }: { initial: string; onDone: (name: string | undefined) => void }) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (name: string | undefined) => {
    if (done.current) return;
    done.current = true;
    const trimmed = name?.trim();
    onDone(trimmed ? trimmed : undefined);
  };
  return (
    <input
      ref={ref}
      className="page-rename"
      aria-label="Page name"
      value={value}
      maxLength={100}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(undefined);
        }
      }}
    />
  );
}

function DeletePageDialog({ page, onClose, onConfirm }: { page: PageItem; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const boards = page.boardCount === 0 ? 'This page has no boards.' : `${page.boardCount} ${page.boardCount === 1 ? 'board' : 'boards'} on this page will be deleted too.`;
  return (
    <Modal label="Delete page" onClose={() => !busy && onClose()} className="small confirm">
      <span className="confirm-icon">
        <Icon name="trash" size={18} />
      </span>
      <div className="modal-text">
        <h2>Delete “{page.name}”?</h2>
        <p>
          {boards} You can undo this from History.
        </p>
      </div>
      <div className="modal-buttons">
        {/* Fokus awal di Cancel: Enter tidak langsung menghapus. */}
        <button type="button" data-autofocus className="btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="btn danger"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            onConfirm().then(onClose, onClose);
          }}
        >
          Delete page
        </button>
      </div>
    </Modal>
  );
}
