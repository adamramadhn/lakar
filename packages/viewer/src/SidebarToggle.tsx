// Sidebar Viewer yang bisa dilipat (spec-viewer-collapsible-panels): state + gerak (`useSidebars`) dan tombol toggle
// di canvas (desain bagian 04 "Panel toggles", komponen "Panel Toggle").
//
// Gerak (tabel motion WHm4A): panel selalu melayang (`position: absolute`) selama bergerak, jadi kanvas hanya
// di-resize sekali per toggle, tidak per frame.
// - Collapse: kolom grid langsung ditutup (kanvas mengambil ruangnya), panel slide keluar di atasnya 200ms.
// - Expand: panel slide masuk di atas kanvas 240ms, lalu kolom grid dibuka.
// - Toolbar kanvas dan grup Export/Theme pindah ke tengah/tepi baru lewat FLIP `translate` 240ms.
// - Kurva cubic-bezier(.32,.72,0,1) (drawer). Toggle lagi di tengah gerak → transisi CSS berbalik dari posisinya.
// - Shortcut keyboard dan prefers-reduced-motion: instan (tanpa slide, tanpa FLIP).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Icon } from './icons';
import { EXPAND_MS, OPEN_SIDEBARS, readSidebars, toggleBoth, toggleSide, writeSidebars, type SidebarSide, type Sidebars } from './sidebars';

export const EASE_DRAWER = 'cubic-bezier(0.32, 0.72, 0, 1)';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
/** Elemen overlay kanvas yang posisinya ikut lebar kanvas: dianimasikan FLIP saat kolom grid berubah. */
const FLIP_TARGETS = '.view-controls, .canvas-actions';

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia(REDUCED_MOTION).matches;

export type SidebarControl = {
  /** Sisi yang dilipat (state tersimpan). */
  collapsed: Sidebars;
  /** Kelas tata letak untuk `.viewer`. */
  className: string;
  /** Toggle satu sisi atau keduanya; `instant` = tanpa gerak (shortcut keyboard). */
  toggle: (side: SidebarSide | 'both', instant?: boolean) => void;
};

export function useSidebars(rootRef: RefObject<HTMLElement | null>): SidebarControl {
  const [collapsed, setCollapsed] = useState(readSidebars);
  /** Sisi yang sedang slide masuk: panel masih melayang, kolom grid baru dibuka sesudah EXPAND_MS. */
  const [opening, setOpening] = useState<Sidebars>(OPEN_SIDEBARS);
  /** Toggle terakhir tanpa gerak (shortcut / reduced motion): transisi panel dimatikan. */
  const [instant, setInstant] = useState(false);
  const state = useRef(collapsed);
  const timers = useRef<Partial<Record<SidebarSide, ReturnType<typeof setTimeout>>>>({});
  /** Posisi elemen FLIP sebelum kolom grid berubah; dipakai sekali di layout effect berikutnya. */
  const flipFrom = useRef<Map<Element, number> | undefined>(undefined);

  useEffect(
    () => () => {
      for (const t of Object.values(timers.current)) clearTimeout(t);
    },
    [],
  );

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const m = new Map<Element, number>();
    for (const el of root.querySelectorAll(FLIP_TARGETS)) m.set(el, el.getBoundingClientRect().left);
    flipFrom.current = m;
  }, [rootRef]);

  // FLIP: kolom grid sudah berubah di render ini → geser elemen dari posisi lama ke posisi baru (hanya `translate`).
  useLayoutEffect(() => {
    const from = flipFrom.current;
    if (!from) return;
    flipFrom.current = undefined;
    for (const [el, left] of from) {
      if (!el.isConnected) continue;
      const dx = left - el.getBoundingClientRect().left;
      if (Math.abs(dx) < 0.5) continue;
      el.animate({ translate: [`${dx}px 0`, '0 0'] }, { duration: EXPAND_MS, easing: EASE_DRAWER });
    }
  });

  const toggle = useCallback(
    (side: SidebarSide | 'both', viaKeyboard = false) => {
      const prev = state.current;
      const next = side === 'both' ? toggleBoth(prev) : toggleSide(prev, side);
      if (next.left === prev.left && next.right === prev.right) return;
      const skip = viaKeyboard || reducedMotion();
      state.current = next;
      writeSidebars(next);
      setInstant(skip);
      setCollapsed(next);
      for (const s of ['left', 'right'] as const) {
        if (next[s] === prev[s]) continue;
        clearTimeout(timers.current[s]);
        delete timers.current[s];
        if (next[s] || skip) {
          // Collapse (atau expand instan): kolom grid berubah sekarang.
          if (!skip) measure();
          setOpening((o) => (o[s] ? { ...o, [s]: false } : o));
          continue;
        }
        // Expand bergerak: kolom dibuka sesudah slide selesai.
        setOpening((o) => ({ ...o, [s]: true }));
        timers.current[s] = setTimeout(() => {
          delete timers.current[s];
          measure();
          setOpening((o) => ({ ...o, [s]: false }));
        }, EXPAND_MS);
      }
    },
    [measure],
  );

  const cls = (s: SidebarSide) => `${collapsed[s] ? ` ${s}-collapsed` : ''}${collapsed[s] || opening[s] ? ` ${s}-float` : ''}`;
  return { collapsed, className: `${cls('left')}${cls('right')}${instant ? ' panels-instant' : ''}`, toggle };
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const SHORTCUT: Record<SidebarSide, string> = isMac ? { left: '⌥⌘[', right: '⌥⌘]' } : { left: 'Ctrl+Alt+[', right: 'Ctrl+Alt+]' };

/** Tombol toggle sidebar (komponen "Panel Toggle"): ikon menunjukkan aksi (tutup saat terbuka, buka saat dilipat). */
export function SidebarToggle({ side, collapsed, onToggle }: { side: SidebarSide; collapsed: boolean; onToggle: () => void }) {
  const label = `${collapsed ? 'Show' : 'Hide'} ${side} sidebar`;
  const icon = side === 'left' ? (collapsed ? 'panelLeftOpen' : 'panelLeftClose') : collapsed ? 'panelRightOpen' : 'panelRightClose';
  return (
    <button type="button" className={`panel-toggle ${side} canvas-overlay-ui`} aria-label={label} title={`${label} (${SHORTCUT[side]})`} aria-expanded={!collapsed} onClick={onToggle}>
      <Icon name={icon} size={16} />
    </button>
  );
}
