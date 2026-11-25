// Title bar (desain "Title Bar" Dashboard/Viewer): menu (mobile) · tab Dashboard · tab dokumen · "+" · spacer
// (drag region) · tombol jendela. Tombol jendela hanya di aplikasi desktop (`window.__TAURI__.window`, tanpa
// dependensi @tauri-apps/api); macOS memakai traffic lights native (titleBarStyle Overlay) → padding kiri.
// Nama file TitleBar.tsx (bukan Tabs.tsx): tabs.ts sudah ada dan sistem file Windows/macOS tidak membedakan huruf besar.
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { docHash } from './files';
import { Icon } from './icons';

/** Bagian API jendela Tauri yang dipakai (global `window.__TAURI__.window`, `withGlobalTauri`). */
type TauriWindow = {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
};

function tauriWindow(): TauriWindow | undefined {
  const g = (window as unknown as { __TAURI__?: { window?: { getCurrentWindow?: () => TauriWindow } } }).__TAURI__;
  try {
    return g?.window?.getCurrentWindow?.();
  } catch {
    return undefined;
  }
}

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);

/** Gaya kontrol jendela: browser (tanpa), macOS (traffic lights native), Windows/Linux (tombol sendiri). */
function chromeKind(): { win: TauriWindow | undefined; mac: boolean } {
  const win = tauriWindow();
  return { win: win && !isMac ? win : undefined, mac: !!win && isMac };
}

/** Perintah jendela gagal (mis. izin capability tidak ada): abaikan, jangan memutus UI. */
const ignore = (p: Promise<unknown>) => void p.catch(() => {});

function WindowControls({ win }: { win: TauriWindow }) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    let live = true;
    // Tanpa izin event listen: cek ulang tiap ukuran jendela berubah.
    const check = () => win.isMaximized().then((m) => live && setMaximized(m), () => {});
    check();
    window.addEventListener('resize', check);
    return () => {
      live = false;
      window.removeEventListener('resize', check);
    };
  }, [win]);
  return (
    <div className="window-controls">
      <button type="button" className="window-btn" aria-label="Minimize" onClick={() => ignore(win.minimize())}>
        <Icon name="minus" size={16} />
      </button>
      <button type="button" className="window-btn" aria-label={maximized ? 'Restore' : 'Maximize'} onClick={() => ignore(win.toggleMaximize())}>
        <Icon name={maximized ? 'copy' : 'square'} size={13} />
      </button>
      <button type="button" className="window-btn close" aria-label="Close" onClick={() => ignore(win.close())}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

export function TitleBar({
  tabs,
  active,
  onMenu,
  onClose,
  onNew,
  minimal,
}: {
  tabs: readonly string[];
  /** Slug dokumen yang tampil; `undefined` = Dashboard. */
  active: string | undefined;
  onMenu: () => void;
  onClose: (slug: string) => void;
  onNew: () => void;
  /** Mode gate first-run: tanpa menu/tabs/"+" — drag region & tombol jendela tetap (spec-first-run-signin). */
  minimal?: boolean;
}) {
  const [{ win, mac }] = useState(chromeKind);
  const navRef = useRef<HTMLElement>(null);
  // Tab aktif selalu terlihat di strip yang bisa digulir horizontal.
  useEffect(() => {
    navRef.current?.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active, tabs]);
  const middleClose = (slug: string) => (e: MouseEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    onClose(slug);
  };
  return (
    <header className={`titlebar${mac ? ' mac' : ''}${minimal ? ' minimal' : ''}`} data-tauri-drag-region>
      {!minimal && (
        <button className="titlebar-menu" type="button" aria-label="Menu" onClick={onMenu}>
          <Icon name="menu" size={18} />
        </button>
      )}
      {!minimal && (
        <nav ref={navRef} className="tabs" aria-label="Open tabs" data-tauri-drag-region>
          <a className={`tab${active === undefined ? ' active' : ''}`} href="#/" aria-current={active === undefined ? 'page' : undefined}>
            <Icon name="layoutGrid" size={14} />
            <span>Dashboard</span>
          </a>
          {tabs.map((slug) => (
            <span
              key={slug}
              className={`tab doc${slug === active ? ' active' : ''}`}
              title={slug}
              // Klik tengah: cegah autoscroll di mousedown, tutup di auxclick.
              onMouseDown={(e) => e.button === 1 && e.preventDefault()}
              onAuxClick={middleClose(slug)}
            >
              <a className="tab-link" href={docHash(slug)} aria-current={slug === active ? 'page' : undefined}>
                <Icon name="file" size={14} />
                <span className="tab-label">{slug}</span>
              </a>
              <button type="button" className="tab-close" aria-label={`Close ${slug}`} onClick={() => onClose(slug)}>
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
        </nav>
      )}
      {!minimal && (
        <button type="button" className="tab-new" aria-label="New file" title="New file" onClick={onNew}>
          <Icon name="plus" size={16} />
        </button>
      )}
      <div className="titlebar-spacer" data-tauri-drag-region />
      {win && <WindowControls win={win} />}
    </header>
  );
}
