// Kotak Search sidebar + dropdown hasil (desain 02 "Dashboard — Search" / "Search No Results"). Pola ARIA combobox:
// ↑/↓ memindah baris aktif (melingkar), Enter membuka file, Escape pertama menutup dropdown dan Escape berikutnya
// mengosongkan query. Dropdown di-portal ke <body> dengan posisi `fixed` dari rect kotak Search supaya tidak terpotong
// `overflow` sidebar. Filter grid tetap memakai query yang sama (dipegang Dashboard).
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { DocSummary } from './api';
import { openDoc } from './App';
import { searchDocs, wrapIndex } from './files';
import { Icon } from './icons';
import { docSubtitle, Thumb } from './Thumb';

const WIDTH = 340;
const GAP = 6;
const MARGIN = 8;

type Pos = { left: number; top: number; width: number; maxHeight: number };

export function Search({
  docs,
  query,
  onQuery,
  onCreate,
}: {
  /** File aktif; `undefined` = belum dimuat / gagal → dropdown tidak tampil. */
  docs: DocSummary[] | undefined;
  query: string;
  onQuery: (q: string) => void;
  /** Tombol "New file “q”" saat tanpa hasil. */
  onCreate: (name: string) => void;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const boxRef = useRef<HTMLLabelElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<Pos | undefined>(undefined);

  const q = query.trim();
  const results = docs ? searchDocs(docs, q, 8) : [];
  const shown = open && q !== '' && docs !== undefined;
  const current = Math.min(active, Math.max(0, results.length - 1));
  const activeDoc = shown ? results[current] : undefined;

  // Posisi dropdown mengikuti kotak Search (scroll sidebar, ubah ukuran jendela, drawer mobile).
  useLayoutEffect(() => {
    if (!shown) return;
    const place = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.max(0, Math.min(WIDTH, window.innerWidth - r.left - MARGIN));
      const top = r.bottom + GAP;
      setPos({ left: r.left, top, width, maxHeight: Math.max(120, window.innerHeight - top - MARGIN) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    // Drawer sidebar mobile bergeser lewat transisi transform: ikuti sampai diam.
    const el = boxRef.current?.closest('.sidebar');
    el?.addEventListener('transitionend', place);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      el?.removeEventListener('transitionend', place);
    };
  }, [shown]);

  // Baris aktif selalu terlihat saat bernavigasi dengan keyboard.
  useEffect(() => {
    if (activeDoc) document.getElementById(`${id}-opt-${current}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeDoc, current, id]);

  const close = () => setOpen(false);
  // Dibuka dari keadaan tertutup (fokus, klik, ↓): mulai lagi dari baris pertama.
  const reopen = () => {
    if (!open) setActive(0);
    setOpen(true);
  };
  const openFile = (d: DocSummary) => {
    close();
    openDoc(d.slug);
  };
  const create = () => {
    close();
    onCreate(q);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return; // IME: Enter/↑↓ milik komposisi
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!shown) {
        reopen();
        return;
      }
      setActive(wrapIndex(current, results.length, e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Enter') {
      if (!shown) return;
      e.preventDefault();
      if (activeDoc) openFile(activeDoc);
      else if (results.length === 0 && q) create();
    } else if (e.key === 'Escape') {
      // Hanya bila ada yang ditutup/dikosongkan; cegah input type=search mengosongkan diri pada Escape pertama.
      if (!shown && !query) return;
      e.preventDefault();
      e.stopPropagation();
      if (shown) close();
      else onQuery('');
    }
  };

  const dropdown =
    shown && pos
      ? createPortal(
          <div
            className="search-pop"
            style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight }}
            // Klik di dalam dropdown tidak memindahkan fokus dari input (blur menutup dropdown).
            onMouseDown={(e) => e.preventDefault()}
          >
            {results.length > 0 ? (
              <>
                <div className="search-label" id={`${id}-label`}>
                  Files
                </div>
                <div className="search-list" id={listId} role="listbox" aria-labelledby={`${id}-label`}>
                  {results.map((d, i) => (
                    <div
                      key={d.slug}
                      id={`${id}-opt-${i}`}
                      role="option"
                      aria-selected={i === current}
                      className={`search-option${i === current ? ' active' : ''}`}
                      onMouseMove={() => i !== current && setActive(i)}
                      onClick={() => openFile(d)}
                    >
                      <Thumb doc={d} size="mini" />
                      <span className="search-option-text">
                        <span className="search-option-title">{d.slug}</span>
                        <span className="search-option-sub">{docSubtitle(d)}</span>
                      </span>
                      {i === current && (
                        <span className="search-enter" aria-hidden="true">
                          ↵
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="search-footer" aria-hidden="true">
                  <span>↑↓ navigate</span>
                  <span>↵ open</span>
                  <span>esc close</span>
                </div>
              </>
            ) : (
              <>
                <div className="search-empty" role="status">
                  <Icon name="searchX" size={20} />
                  <strong>No files match “{q}”</strong>
                  <span>Create it as a new file, or ask your agent.</span>
                  <button type="button" className="btn" onClick={create}>
                    <Icon name="plus" size={14} />
                    New file “{q}”
                  </button>
                </div>
                <div className="search-footer" aria-hidden="true">
                  <span>↵ create</span>
                  <span>esc close</span>
                </div>
              </>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <label ref={boxRef} className="search">
        <Icon name="search" size={15} />
        <input
          type="search"
          placeholder="Search"
          value={query}
          role="combobox"
          aria-label="Search documents"
          aria-autocomplete="list"
          aria-expanded={shown}
          aria-controls={shown && results.length > 0 ? listId : undefined}
          aria-activedescendant={activeDoc ? `${id}-opt-${current}` : undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            onQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={reopen}
          onClick={reopen}
          onBlur={close}
          onKeyDown={onKeyDown}
        />
        {shown && (
          <kbd className="search-hint" aria-hidden="true">
            esc
          </kbd>
        )}
      </label>
      {dropdown}
    </>
  );
}
