// Panel kanan Viewer yang di mobile (<768px, desain "Viewer — Mobile — …") menjadi bottom sheet: elemen
// `aside.side-panel` yang sama (desktop/tablet tidak berubah; grabber dan ringkasan check mini disembunyikan CSS).
// State terkontrol collapsed / half / full (sheet.ts); drag grabber atau strip tab → tinggi mengikuti jari, lepas →
// snap ke state terdekat, pointercancel → kembali ke state semula; tap grabber → collapsed ↔ half (full → half). Tinggi yang tampil ditulis ke `--sheet-h` pada
// elemen induk (.viewer) supaya toolbar kanvas dan toast duduk di atas sheet.
import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { FindingSummary } from '@lakar/schema';
import { grabberTap, sheetHeights, snapSheet, type SheetState } from './sheet';

/** Sama dengan media query mobile di app.css (lihat juga konstanta tinggi di sheet.ts). */
export const MOBILE_QUERY = '(max-width: 767.98px)';
const isMobile = () => typeof matchMedia === 'function' && matchMedia(MOBILE_QUERY).matches;
/** Gerak minimal (px) sebelum sentuhan di strip tab dianggap drag (di bawahnya tetap tap tab). */
const DRAG_SLOP = 6;

export type SheetTab<T extends string> = { id: T; label: string };

export function BottomSheet<T extends string>({
  state,
  onState,
  tabs,
  tab,
  onTab,
  summary,
  onChecks,
  children,
}: {
  state: SheetState;
  onState: (s: SheetState) => void;
  tabs: readonly SheetTab<T>[];
  tab: T;
  onTab: (t: T) => void;
  /** Ringkasan layout_check: badge di tab Checks (desktop/tablet) dan hitungan mini di strip tab (mobile). */
  summary: FindingSummary | undefined;
  onChecks: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; h0: number; viewerH: number; moved: boolean; fromTabs: boolean } | null>(null);
  const [dragH, setDragH] = useState<number | undefined>(undefined);
  /** Drag dari strip tab baru selesai: klik yang menyusul (tab di bawah jari) diabaikan. */
  const suppressClick = useRef(false);

  // Tinggi sheet yang tampil (termasuk saat transisi) → `--sheet-h` di .viewer.
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const write = () => parent.style.setProperty('--sheet-h', `${el.offsetHeight}px`);
    const ro = new ResizeObserver(write);
    ro.observe(el);
    write();
    return () => {
      ro.disconnect();
      parent.style.removeProperty('--sheet-h');
    };
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el || !isMobile() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    // Area sheet = viewer dikurangi top bar mobile (sheet full tidak menutupi Back/History).
    const parent = el.parentElement;
    const topbar = parent?.querySelector<HTMLElement>(':scope > .viewer-topbar')?.offsetHeight ?? 0;
    drag.current = { y: e.clientY, h0: el.getBoundingClientRect().height, viewerH: (parent?.clientHeight ?? 0) - topbar, moved: false, fromTabs: e.currentTarget.classList.contains('panel-tabs') };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    // Mouse dilepas di luar sebelum melewati slop (tanpa pointerup di sini): drag basi dibuang.
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      drag.current = null;
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.abs(dy) <= DRAG_SLOP) return;
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const h = sheetHeights(d.viewerH);
    setDragH(Math.min(h.full, Math.max(h.collapsed, d.h0 - dy)));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      if (!d.fromTabs) onState(grabberTap(state));
      return;
    }
    suppressClick.current = d.fromTabs;
    setDragH(undefined);
    onState(snapSheet(d.h0 - (e.clientY - d.y), d.viewerH));
  };
  const onPointerCancel = () => {
    drag.current = null;
    setDragH(undefined);
  };
  const dragProps = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };

  return (
    <aside ref={ref} className={`side-panel sheet-${state}${dragH !== undefined ? ' dragging' : ''}`} style={dragH !== undefined ? { height: dragH } : undefined}>
      <div className="sheet-grabber" aria-hidden="true" {...dragProps}>
        <i />
      </div>
      <div
        className="panel-tabs"
        role="tablist"
        {...dragProps}
        onClickCapture={(e) => {
          if (!suppressClick.current) return;
          suppressClick.current = false;
          // Klik keyboard (Enter/Space, detail 0) bukan sisa drag.
          if (e.detail !== 0) e.stopPropagation();
        }}
        onPointerDownCapture={() => {
          suppressClick.current = false;
        }}
      >
        {tabs.map((t) => {
          // Badge jumlah temuan di tab Checks (desktop/tablet; pengganti pill layout_check di kanvas). Mobile memakai
          // ringkasan `.sheet-checks` di strip, jadi badge disembunyikan CSS di sana.
          const found = t.id === 'checks' && summary ? summary.error + summary.warning : 0;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`panel-tab tab-${t.id}${tab === t.id ? ' active' : ''}`}
              title={found && summary ? `${summary.error} errors, ${summary.warning} warnings` : undefined}
              onClick={() => onTab(t.id)}
            >
              {t.label}
              {found > 0 && summary && <span className={`tab-badge ${summary.error > 0 ? 'danger' : 'warning'}`}>{found}</span>}
            </button>
          );
        })}
        {summary && (
          <button type="button" className="sheet-checks" aria-label={`Checks: ${summary.error} errors, ${summary.warning} warnings`} onClick={onChecks}>
            <span className="count">
              <i className="dot danger" />
              {summary.error}
            </span>
            <span className="count">
              <i className="dot warning" />
              {summary.warning}
            </span>
          </button>
        )}
      </div>
      {children}
    </aside>
  );
}
