// Canvas viewer: PNG per board dari POST /screenshot (renderer yang sama, AD-6) di posisi x/y dokumen.
// Pan, zoom, Fit, seleksi, dan Export PNG (ExportPopover); tidak ada edit.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { FindingSummary } from '@lakar/schema';
import { api, errorText } from './api';
import { ExportButton } from './ExportPopover';
import { useRetry } from './hooks';
import { Icon } from './icons';

export type CanvasBoard = { id: string; name: string; x: number; y: number; width: number; height: number };
export type Highlight = { boardId: string; bounds?: [number, number, number, number] };
/** Board yang sedang dikerjakan agen: garis tepi berdenyut + label agen. */
export type AgentMark = { session: string; boardId: string; label: string; color: 'agent' | 'codex'; running: boolean };
/** Permintaan Follow agent: geser kamera ke board ini (sekali per `nonce`). */
export type Focus = { boardId: string; nonce: number };
type Camera = { x: number; y: number; z: number };

const ZOOM_MIN = 0.05;
const ZOOM_MAX = 8;
const FIT_PAD = 56;
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

function fitCamera(boards: CanvasBoard[], w: number, h: number): Camera {
  if (!boards.length || w <= 0 || h <= 0) return { x: FIT_PAD, y: FIT_PAD, z: 1 };
  const minX = Math.min(...boards.map((b) => b.x));
  const minY = Math.min(...boards.map((b) => b.y));
  const maxX = Math.max(...boards.map((b) => b.x + b.width));
  const maxY = Math.max(...boards.map((b) => b.y + b.height));
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  // Ruang atas ekstra untuk label nama board.
  const z = clampZoom(Math.min(1, (w - FIT_PAD * 2) / bw, (h - FIT_PAD * 2 - 24) / bh));
  return { z, x: (w - bw * z) / 2 - minX * z, y: (h - bh * z) / 2 - minY * z + 12 };
}

/** Board terlihat utuh di viewport dengan kamera `c`? */
function boardVisible(b: CanvasBoard, c: Camera, w: number, h: number): boolean {
  const left = c.x + b.x * c.z;
  const top = c.y + b.y * c.z;
  return left >= 0 && top >= 18 && left + b.width * c.z <= w && top + b.height * c.z <= h;
}

/** Kamera yang memusatkan board `b`; zoom saat ini dipertahankan kecuali board tidak muat. */
function focusCamera(b: CanvasBoard, c: Camera, w: number, h: number): Camera {
  const z = clampZoom(Math.min(c.z, (w - FIT_PAD * 2) / Math.max(1, b.width), (h - FIT_PAD * 2 - 24) / Math.max(1, b.height)));
  return { z, x: w / 2 - (b.x + b.width / 2) * z, y: h / 2 - (b.y + b.height / 2) * z + 12 };
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Durasi geser kamera Follow agent (desain bagian 04: 500ms). */
const FOLLOW_MS = 500;

function BoardImage({ slug, rev, board }: { slug: string; rev: number; board: CanvasBoard }) {
  const [state, setState] = useState<{ url?: string; error?: string }>({});
  const [attempt, setAttempt] = useState(0);
  useRetry(() => state.error && setAttempt((a) => a + 1));
  useEffect(() => {
    let live = true;
    setState({});
    api.screenshot(slug, rev, board.id).then(
      (s) => live && setState({ url: s.url }),
      (e) => live && setState({ error: errorText(e) }),
    );
    return () => {
      live = false;
    };
  }, [slug, rev, board.id, attempt]);
  if (state.url) return <img src={state.url} alt={board.name} draggable={false} />;
  if (state.error)
    return (
      <div className="board-error">
        <Icon name="alert" size={16} />
        <span>{state.error}</span>
      </div>
    );
  return <div className="skeleton" />;
}

export function Canvas({
  slug,
  rev,
  boardRevs,
  boards,
  agents,
  focus,
  onFocused,
  highlight,
  summary,
  checksLoading,
  onSelect,
  onOpenChecks,
}: {
  slug: string;
  rev: number;
  /** Rev terakhir board berubah (default `rev`): board yang tidak tersentuh tidak dirender ulang. */
  boardRevs?: Readonly<Record<string, number>>;
  boards: CanvasBoard[];
  agents?: readonly AgentMark[];
  focus?: Focus | undefined;
  onFocused?: (nonce: number) => void;
  highlight: Highlight | undefined;
  summary: FindingSummary | undefined;
  checksLoading: boolean;
  onSelect: (id: string | undefined) => void;
  onOpenChecks: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState<Camera>({ x: 0, y: 0, z: 1 });
  const [fitted, setFitted] = useState(false);
  const [tool, setTool] = useState<'select' | 'hand'>('select');
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const drag = useRef<{ x: number; y: number; cam: Camera; moved: boolean; pan: boolean; target: string | undefined } | null>(null);
  const camRef = useRef(cam);
  camRef.current = cam;
  const anim = useRef<number | undefined>(undefined);
  const stopAnim = useCallback(() => {
    if (anim.current !== undefined) cancelAnimationFrame(anim.current);
    anim.current = undefined;
  }, []);
  useEffect(() => stopAnim, [stopAnim]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (anim.current !== undefined) cancelAnimationFrame(anim.current);
    anim.current = undefined;
    setCam(fitCamera(boards, size.w, size.h));
  }, [boards, size]);
  // Board pertama muncul (0 → >0, mis. setelah dokumen dimuat ulang): fit ulang.
  const prevCount = useRef(boards.length);
  useEffect(() => {
    if (prevCount.current === 0 && boards.length > 0) setFitted(false);
    prevCount.current = boards.length;
  }, [boards.length]);
  useEffect(() => {
    if (!fitted && size.w > 0) {
      fit();
      setFitted(true);
    }
  }, [fitted, size, fit]);

  // Follow agent: geser ke board yang berubah bila belum terlihat utuh (500ms ease-out; reduced motion → langsung).
  useEffect(() => {
    if (!focus || !fitted || size.w <= 0) return;
    const b = boards.find((x) => x.id === focus.boardId);
    if (!b) return;
    onFocused?.(focus.nonce);
    const from = camRef.current;
    if (boardVisible(b, from, size.w, size.h)) return;
    const to = focusCamera(b, from, size.w, size.h);
    stopAnim();
    if (reducedMotion()) {
      setCam(to);
      return;
    }
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / FOLLOW_MS);
      const e = 1 - (1 - k) ** 3;
      setCam({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z: from.z + (to.z - from.z) * e });
      anim.current = k < 1 ? requestAnimationFrame(step) : undefined;
    };
    anim.current = requestAnimationFrame(step);
  }, [focus, fitted, size, boards, onFocused, stopAnim]);

  const zoomAt = useCallback((factor: number, sx: number, sy: number) => {
    stopAnim();
    setCam((c) => {
      const z = clampZoom(c.z * factor);
      const k = z / c.z;
      return { z, x: sx - (sx - c.x) * k, y: sy - (sy - c.y) * k };
    });
  }, []);

  // Wheel: ctrl/⌘ (atau pinch) = zoom di kursor, selain itu pan. Listener non-pasif supaya halaman tidak ikut zoom.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopAnim();
      const r = el.getBoundingClientRect();
      // deltaMode: 0 piksel, 1 baris (Firefox), 2 halaman.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-dy * 0.01), e.clientX - r.left, e.clientY - r.top);
      else setCam((c) => ({ ...c, x: c.x - dx, y: c.y - dy }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, stopAnim]);

  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return false;
      return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable || t.closest('[role="treeitem"]') !== null;
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space') {
        setSpaceHeld(true);
        if (e.target === document.body) e.preventDefault();
      } else if (e.key === 'v' || e.key === 'V') setTool('select');
      else if (e.key === 'h' || e.key === 'H') setTool('hand');
      else if (e.key === '!' || (e.shiftKey && e.code === 'Digit1')) fit();
      else if (e.key === '+' || e.key === '=') zoomAt(1.25, size.w / 2, size.h / 2);
      else if (e.key === '-') zoomAt(1 / 1.25, size.w / 2, size.h / 2);
      else if (e.key === 'Escape') onSelect(undefined);
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpaceHeld(false);
    const blur = () => setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [fit, zoomAt, size, onSelect]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.canvas-overlay-ui')) return;
    const pan = tool === 'hand' || spaceHeld || e.button === 1;
    if (e.button !== 0 && e.button !== 1) return;
    stopAnim();
    const boardEl = (e.target as HTMLElement).closest<HTMLElement>('[data-board]');
    drag.current = { x: e.clientX, y: e.clientY, cam, moved: false, pan, target: boardEl?.dataset.board };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pan) setPanning(true);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 3) d.moved = true;
    if (d.pan && d.moved) setCam({ ...d.cam, x: d.cam.x + dx, y: d.cam.y + dy });
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setPanning(false);
    if (d && !d.pan && !d.moved) onSelect(d.target);
  };
  /** Gestur dibatalkan (mis. sistem mengambil alih pointer): bersihkan tanpa memilih apa pun. */
  const onPointerCancel = () => {
    drag.current = null;
    setPanning(false);
  };

  const center = () => [size.w / 2, size.h / 2] as const;
  const boardById = new Map(boards.map((b) => [b.id, b]));
  const hb = highlight ? boardById.get(highlight.boardId) : undefined;
  const hRect =
    hb && highlight
      ? highlight.bounds
        ? { x: hb.x + highlight.bounds[0], y: hb.y + highlight.bounds[1], w: highlight.bounds[2], h: highlight.bounds[3] }
        : { x: hb.x, y: hb.y, w: hb.width, h: hb.height }
      : undefined;
  const handMode = tool === 'hand' || spaceHeld;

  return (
    <section
      ref={ref}
      className={`canvas${handMode ? ' hand' : ''}${panning ? ' panning' : ''}`}
      aria-label="Canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {boards.length === 0 && (
        <div className="canvas-waiting">
          <div className="spinner" />
          <strong>Waiting for the agent</strong>
          <span>This page has no boards yet. They'll appear here after the agent's next execute.</span>
        </div>
      )}
      {boards.map((b) => {
        const left = cam.x + b.x * cam.z;
        const top = cam.y + b.y * cam.z;
        const selected = highlight?.boardId === b.id && !highlight.bounds;
        return (
          <div key={b.id}>
            <div className={`board-label${highlight?.boardId === b.id ? ' active' : ''}`} style={{ left, top: top - 18, maxWidth: Math.max(40, b.width * cam.z) }}>
              {b.name}
            </div>
            <div className={`board${selected ? ' selected' : ''}`} data-board={b.id} style={{ left, top, width: b.width * cam.z, height: b.height * cam.z }}>
              <BoardImage slug={slug} rev={Math.min(rev, boardRevs?.[b.id] ?? rev)} board={b} />
            </div>
          </div>
        );
      })}
      {(agents ?? []).map((a) => {
        const b = boardById.get(a.boardId);
        if (!b) return null;
        const left = cam.x + b.x * cam.z;
        const top = cam.y + b.y * cam.z;
        return (
          <div key={`${a.session}:${a.boardId}`} className={`agent-outline ${a.color}${a.running ? ' working' : ''}`} style={{ left: left - 3, top: top - 3, width: b.width * cam.z + 6, height: b.height * cam.z + 6 }}>
            <span className="agent-label">{a.label}</span>
          </div>
        );
      })}
      {hRect && (
        <div
          className="selection"
          style={{ left: cam.x + hRect.x * cam.z, top: cam.y + hRect.y * cam.z, width: Math.max(1, hRect.w * cam.z), height: Math.max(1, hRect.h * cam.z) }}
        >
          <i className="handle tl" />
          <i className="handle tr" />
          <i className="handle bl" />
          <i className="handle br" />
          <span className="size-badge">
            {Math.round(hRect.w)} × {Math.round(hRect.h)}
          </span>
        </div>
      )}

      {(summary || checksLoading) && (
        <button type="button" className="checks-pill canvas-overlay-ui" onClick={onOpenChecks}>
          <Icon name="shieldCheck" size={15} />
          <span className="mono-label">layout_check</span>
          {summary ? (
            <>
              <span className="count">
                <i className="dot danger" />
                {summary.error}
              </span>
              <span className="count">
                <i className="dot warning" />
                {summary.warning}
              </span>
            </>
          ) : (
            <span className="count muted">…</span>
          )}
        </button>
      )}

      <ExportButton slug={slug} boards={boards} selectedBoardId={highlight?.boardId} />

      <div className="view-controls canvas-overlay-ui" role="toolbar" aria-label="View controls">
        <button type="button" className={`tool${tool === 'select' ? ' active' : ''}`} aria-label="Select (V)" title="Select (V)" aria-pressed={tool === 'select'} onClick={() => setTool('select')}>
          <Icon name="pointer" />
        </button>
        <button type="button" className={`tool${tool === 'hand' ? ' active' : ''}`} aria-label="Hand (H)" title="Hand (H)" aria-pressed={tool === 'hand'} onClick={() => setTool('hand')}>
          <Icon name="hand" />
        </button>
        <span className="divider" />
        <button type="button" className="tool" aria-label="Zoom out" title="Zoom out (-)" onClick={() => zoomAt(1 / 1.25, ...center())}>
          <Icon name="minus" />
        </button>
        <span className="zoom-level">{Math.round(cam.z * 100)}%</span>
        <button type="button" className="tool" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomAt(1.25, ...center())}>
          <Icon name="plus" />
        </button>
        <button type="button" className="tool" aria-label="Fit" title="Fit (Shift+1)" onClick={fit}>
          <Icon name="fit" />
        </button>
      </div>
    </section>
  );
}
