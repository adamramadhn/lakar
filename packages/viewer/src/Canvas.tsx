// Canvas viewer: board di posisi x/y dokumen. Versi terkini = DOM hidup (editor-canvas story 3, AD-6): dokumen
// di-resolve sekali per objek dokumen (`resolveDocument`, AD-10), tiap board di-mount `mountBoard` ke shadow root
// (liveBoard.ts) dan diskalakan transform kamera; tanpa POST /screenshot. Pratinjau versi tetap PNG snapshot.
// Pan, zoom, Fit, seleksi, Export PNG (ExportPopover), dan tool sisip layer (aplikasi 4, di bawah). Di canvas live,
// seleksi banyak, marquee, geser, reorder, resize, dan Undo/Redo toolbar ada di canvasEdit.tsx (editor-canvas story 4).
// Mode pratinjau versi (History, aplikasi 3): board dari snapshot (POST revs/:rev/screenshot), banner
// "Previewing …" dengan Back to latest / Restore this version; Export, Checks, dan outline agen disembunyikan.
// Tool edit (batch 4) wajib nonaktif selama `preview` ada.
// Kehadiran agen (aplikasi 5, desain bagian 04): per sesi Live garis tepi board lokasi (putus-putus, berdenyut saat
// working), outline node lokasi saat working, outline "Just changed" sesudah execute, dan Agent Cursor yang meluncur
// di koordinat dokumen (pan/zoom tidak membuatnya tertinggal). Lapisan ini tidak menangkap pointer.
// Layer manual (aplikasi 4): tool sisip Frame (F), Rectangle (R), Ellipse (O), Text (T), Image (Shift+Ctrl/Cmd+K),
// Icon (I). Klik di board → `onInsert` dengan koordinat board; Frame di area kosong → koordinat halaman (board baru).
// Sesudah satu sisipan tool kembali ke Select. `editable` false (pratinjau versi, offline) → tool sisip nonaktif.
// Sentuh (aplikasi 9): dua jari = pinch-zoom di titik tengah + pan (sheet.ts `pinchCamera`); satu jari dengan tool
// Select/Hand = pan; tap (gerak ≤8px) = pilih/sisip seperti klik. Jari kedua dilepas → pan satu jari tanpa lompat.
// Paritas desain: state Waiting (kotak putus-putus + petunjuk `open_doc slug: …`), marker temuan layout_check
// (outline putus-putus + lingkaran di sudut kanan atas node/board), mode offline (board diredupkan + pill
// "Last synced …"), dan slot `overlay` untuk toast rollback / chip Follow dari Viewer. Jalur PNG (pratinjau versi,
// atau tanpa `doc`): PNG board lama tetap tampil sampai PNG rev baru selesai dimuat (tanpa kedip skeleton); jalur
// live: DOM lama tetap tampil sampai mount baru siap.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { findBoard } from '@lakar/render';
import { resolveDocument, type DocOp, type FindingLevel, type FindingSummary, type LakarDocument, type ResolvedDocument } from '@lakar/schema';
import { boardDepKeys, boardSignature, boardSource, ensureFaces, mountLive, RenderDepsCache } from './liveBoard';
import { api, errorText } from './api';
import { SelectionBox, useCanvasEdit } from './canvasEdit';
import { usePathTools, type PathEditPanel } from './pathTools';
import { INSERT_KINDS, type InsertKind } from './codegen';
import { COMPONENT_DRAG_TYPE, exitInstanceSelection, type ComponentInfo } from './componentModel';
import { ExportButton } from './ExportPopover';
import type { GeoNode } from './gesture';
import { useOffline, useRetry } from './hooks';
import { Icon, type IconName } from './icons';
import type { AgentPresence, Rect } from './presence';
import { pinchCamera, pointerIntent, TAP_SLOP, type Point } from './sheet';
import type { Camera } from './viewState';

export type CanvasBoard = { id: string; name: string; x: number; y: number; width: number; height: number };
export type Highlight = { boardId: string; bounds?: [number, number, number, number] };
/** Permintaan Follow agent: geser kamera ke board ini (sekali per `nonce`). */
export type Focus = { boardId: string; nonce: number };
/** Pratinjau versi lama: board dirender dari snapshot `rev`, kanvas baca-saja. */
export type CanvasPreview = {
  rev: number;
  label: string;
  /** Dokumen versi sedang dimuat (board yang tampil masih versi terkini). */
  loading?: boolean;
  /** Dokumen versi gagal dimuat. */
  error?: string;
  restoring?: boolean;
  /** Restore tersedia (versi lama bersnapshot). */
  canRestore: boolean;
  onBack: () => void;
  onRestore: () => void;
};
/** Titik sisip: dalam board (`boardId`, koordinat board) atau di halaman (tanpa board, koordinat halaman). */
export type InsertPoint = { boardId: string; x: number; y: number } | { boardId?: undefined; x: number; y: number };
/** Marker temuan layout_check: tanpa `bounds` = temuan pada board (lingkaran di sudut board saja). */
export type CanvasMarker = { nodeId: string; boardId: string; bounds?: [number, number, number, number]; level: FindingLevel };
type Tool = 'select' | 'hand' | 'pen' | InsertKind;
const isInsertTool = (t: Tool): t is InsertKind => t !== 'select' && t !== 'hand' && t !== 'pen';
/** Tool sisip atau Pen (kembali ke Select saat pratinjau/offline atau Escape). */
const isDrawTool = (t: Tool) => isInsertTool(t) || t === 'pen';
const TOOL_ICON: Record<InsertKind, IconName> = { frame: 'frame', rect: 'square', ellipse: 'circle', text: 'text', image: 'image', icon: 'shapes' };
const TOOL_KEYS: Record<string, InsertKind> = { f: 'frame', r: 'rect', o: 'ellipse', t: 'text', i: 'icon' };
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
/** Label shortcut untuk tooltip/menu (Image: Shift+Ctrl/⌘+K). */
export const shortcutLabel = (kind: InsertKind) => (kind === 'image' ? (isMac ? '⇧⌘K' : 'Ctrl Shift K') : (INSERT_KINDS.find((k) => k.kind === kind)?.key ?? ''));

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
/** Durasi luncur Agent Cursor (desain bagian 04: 400ms ease-out). */
const GLIDE_MS = 400;

/**
 * Posisi (koordinat dokumen) yang meluncur ke (tx, ty) dalam `GLIDE_MS` ease-out; reduced motion → lompat.
 * Posisi awal = target pertama (kursor yang baru tampil tidak meluncur dari mana pun).
 */
function useGlide(tx: number, ty: number): { x: number; y: number } {
  const [pos, setPos] = useState({ x: tx, y: ty });
  const posRef = useRef(pos);
  posRef.current = pos;
  useEffect(() => {
    const from = posRef.current;
    if (from.x === tx && from.y === ty) return;
    if (reducedMotion()) {
      setPos({ x: tx, y: ty });
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / GLIDE_MS);
      const e = 1 - (1 - k) ** 3;
      setPos({ x: from.x + (tx - from.x) * e, y: from.y + (ty - from.y) * e });
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [tx, ty]);
  return pos;
}

/** Agent Cursor (komponen desain): pointer + tag warna harness; working → spinner, nama, baris aksi mono. */
function AgentCursor({ p, x, y, cam }: { p: AgentPresence; x: number; y: number; cam: Camera }) {
  const pos = useGlide(x, y);
  return (
    <div className={`agent-cursor ${p.color}${p.working ? ' working' : ''}`} style={{ transform: `translate(${cam.x + pos.x * cam.z}px, ${cam.y + pos.y * cam.z}px)` }}>
      <svg className="agent-cursor-pointer" width="16" height="18" viewBox="0 0 16 18" aria-hidden="true">
        <path d="M1 1 L1 15 L5 11.5 L8 17 L10.5 15.8 L7.6 10.4 L13 10.4 Z" />
      </svg>
      <div className="agent-cursor-tag">
        <div className="agent-cursor-name">
          {p.working && <span className="agent-cursor-spinner" />}
          <span>{p.label}</span>
        </div>
        {p.working && p.action && (
          <div key={p.action} className="agent-cursor-action">
            {p.action}
          </div>
        )}
      </div>
    </div>
  );
}

/** Gaya kotak node (bounds relatif board) di layar. */
function nodeBox(b: CanvasBoard, r: Rect, cam: Camera) {
  // Radius dari tinggi node di satuan board (tidak berubah saat zoom).
  return { left: cam.x + (b.x + r[0]) * cam.z, top: cam.y + (b.y + r[1]) * cam.z, width: Math.max(1, r[2] * cam.z), height: Math.max(1, r[3] * cam.z), borderRadius: r[3] < 48 ? 4 : 8 };
}

/** Lapisan kehadiran agen: outline board, outline node (working / Just changed), dan kursor. */
function AgentLayer({ presence, boardById, cam }: { presence: readonly AgentPresence[]; boardById: ReadonlyMap<string, CanvasBoard>; cam: Camera }) {
  return (
    <div className="agent-layer" aria-hidden="true">
      {presence.map((p) => {
        const b = boardById.get(p.boardId);
        if (!b) return null;
        return (
          <div key={`outline:${p.session}`} className={`agent-outline ${p.color}${p.working ? ' working' : ''}`} style={{ left: cam.x + b.x * cam.z - 4, top: cam.y + b.y * cam.z - 4, width: b.width * cam.z + 8, height: b.height * cam.z + 8 }} />
        );
      })}
      {presence.map((p) => {
        const b = boardById.get(p.boardId);
        if (!b || !p.working || !p.rect) return null;
        return <div key={`node:${p.session}`} className={`agent-node-outline ${p.color} working`} style={nodeBox(b, p.rect, cam)} />;
      })}
      {presence.flatMap((p) =>
        p.changed.map((c, i) => {
          const b = boardById.get(c.boardId);
          if (!b) return null;
          return (
            <div key={`changed:${p.session}:${p.changedKey}:${c.id}`} className={`agent-node-outline ${p.color} changed${c.created ? ' created' : ''}`} style={{ ...nodeBox(b, c.rect, cam), animationDelay: `${i * 40}ms` }}>
              {/* Change Highlight Tag (desain u43MYm): node baru pertama → "Added · nama". */}
              {p.added?.id === c.id && (
                <span className="change-tag in-node">
                  <Icon name="plus" size={10} />
                  Added · {p.added.name}
                </span>
              )}
            </div>
          );
        }),
      )}
      {presence.map((p) => {
        const b = boardById.get(p.boardId);
        if (!b) return null;
        const x = b.x + (p.rect ? p.rect[0] + p.rect[2] / 2 : b.width / 2);
        const y = b.y + (p.rect ? p.rect[1] + p.rect[3] / 2 : b.height / 2);
        return <AgentCursor key={`cursor:${p.session}`} p={p} x={x} y={y} cam={cam} />;
      })}
    </div>
  );
}

function BoardImage({ slug, rev, board, previewRev }: { slug: string; rev: number; board: CanvasBoard; previewRev?: number | undefined }) {
  const [state, setState] = useState<{ url?: string; error?: string }>({});
  const [attempt, setAttempt] = useState(0);
  useRetry(() => state.error && setAttempt((a) => a + 1));
  useEffect(() => {
    let live = true;
    // PNG sebelumnya tetap tampil sampai yang baru tiba; hanya error lama yang dibuang.
    setState((s) => (s.url ? { url: s.url } : {}));
    (previewRev !== undefined ? api.revScreenshot(slug, previewRev, board.id) : api.screenshot(slug, rev, board.id)).then(
      (s) => live && setState({ url: s.url }),
      (e) => live && setState({ error: errorText(e) }),
    );
    return () => {
      live = false;
    };
  }, [slug, rev, board.id, attempt, previewRev]);
  if (state.url) return <img src={state.url} alt={board.name} draggable={false} />;
  if (state.error) return <BoardError message={state.error} />;
  return <div className="skeleton" />;
}

function BoardError({ message }: { message: string }) {
  return (
    <div className="board-error">
      <Icon name="alert" size={16} />
      <span>{message}</span>
    </div>
  );
}

/** Deps render (font + glyph) bersama semua board live, di-cache per kunci (liveBoard.ts). */
const liveDeps = new RenderDepsCache((keys) => api.renderDeps(keys));

/** Hasil `resolveDocument` dokumen terkini (AD-10), atau pesan error. */
type LiveDoc = { ok: true; doc: ResolvedDocument } | { ok: false; error: string };

/**
 * Board sebagai DOM hidup (AD-6): `mountBoard` ke shadow root host berukuran natural, diskalakan `transform` kamera.
 * Mount ulang hanya bila isi board ter-resolve berubah (tanda tangan); DOM lama tetap tampil sampai yang baru siap.
 * Deps gagal diambil (offline) → board tetap di-mount, lalu dicoba lagi saat koneksi pulih (otomatis
 * atau tombol Retry, `useRetry`).
 */
const BoardLive = memo(function BoardLive({
  live,
  board,
  zoom,
  onMounted,
}: {
  live: LiveDoc;
  board: CanvasBoard;
  zoom: number;
  /** Mount selesai (geometri seleksi/gestur diukur ulang). */
  onMounted?: ((boardId: string, host: HTMLDivElement, rev: number) => void) | undefined;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ mounted?: boolean; error?: string; partial?: boolean }>({});
  const [attempt, setAttempt] = useState(0);
  useRetry(() => state.partial && setAttempt((a) => a + 1));
  // Koneksi pulih tanpa tombol Retry: deps yang gagal dicoba lagi.
  const offline = useOffline();
  useEffect(() => {
    if (!offline && state.partial) setAttempt((a) => a + 1);
  }, [offline]);
  const resolved = live.ok ? findBoard(live.doc, board.id) : undefined;
  // Resolve gagal: pesan error ikut tanda tangan supaya error baru menggantikan yang lama.
  const signature = useMemo(() => (live.ok ? boardSignature(resolved) : `error:${live.error}`), [live, resolved]);
  const liveRef = useRef(live);
  liveRef.current = live;
  const onMountedRef = useRef(onMounted);
  onMountedRef.current = onMounted;
  useEffect(() => {
    const cur = liveRef.current;
    if (!cur.ok) {
      setState({ error: cur.error });
      return;
    }
    const target = findBoard(cur.doc, board.id);
    const el = host.current;
    if (!target || !el) return;
    let current = true;
    (async () => {
      const deps = await liveDeps.ensure(boardDepKeys(target));
      await ensureFaces(el.ownerDocument, deps.fonts);
      if (!current) return;
      mountLive(el, cur.doc, board.id, deps);
      setState({ mounted: true, ...(deps.complete ? {} : { partial: true }) });
      onMountedRef.current?.(board.id, el, cur.doc.rev);
    })().catch((e) => current && setState({ error: errorText(e) }));
    return () => {
      current = false;
    };
    // Hanya isi board (tanda tangan) yang memicu mount; objek dokumen baru dengan board sama tidak.
  }, [signature, board.id, attempt]);
  return (
    <>
      <div
        ref={host}
        className="board-live"
        data-live-board={board.id}
        style={{ width: board.width, height: board.height, transform: `scale(${zoom})`, visibility: state.mounted && !state.error ? 'visible' : 'hidden' }}
      />
      {state.error ? <BoardError message={state.error} /> : !state.mounted && <div className="skeleton" />}
    </>
  );
});

export function Canvas({
  slug,
  rev,
  boardRevs,
  boards,
  presence,
  focus,
  onFocused,
  highlight,
  summary,
  checksLoading,
  onSelect,
  onOpenChecks,
  onExportCode,
  preview,
  editable = false,
  onInsert,
  camera,
  onCamera,
  docEmpty = false,
  stale,
  markers,
  onMarker,
  overlay,
  doc,
  selection = [],
  onSelectIds,
  onCommit,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  sceneRef,
  onSceneChange,
  onContextMenu,
  shareBadge,
  actions,
  components,
  onDropComponent,
  pastedTag,
  onCommitCreate,
  onPathEdit,
}: {
  /** Commit yang membuat node (Pen tool, epic paste-vektor story 5): id node baru, undefined bila gagal. */
  onCommitCreate?: ((ops: DocOp[], description: string) => Promise<string | undefined>) | undefined;
  /** Mode edit titik path berubah: data grup Point panel Design (undefined = tidak sedang mengedit). */
  onPathEdit?: ((p: PathEditPanel | undefined) => void) | undefined;
  /** Label "Pasted · nama" node hasil paste HTML (desain rkIyP). */
  pastedTag?: { id: string; label: string } | undefined;
  /** Info komponen dokumen tersimpan (epic komponen story 4): penanda master/instance dan tag di canvas live. */
  components?: ComponentInfo | undefined;
  /** Kartu Assets dilepas di canvas: id master dan titik halaman (koordinat dokumen). */
  onDropComponent?: (componentId: string, at: Point) => void;
  /** Diisi Canvas: pohon geometri halaman untuk aksi edit (story 6). */
  sceneRef?: MutableRefObject<(() => GeoNode[]) | null>;
  /** Geometri `sceneRef` berubah (board di-mount ulang): pemanggil menghitung ulang ketersediaan aksi. */
  onSceneChange?: () => void;
  /** Klik kanan di canvas live: target dipilih seperti klik (`ids` = seleksi menu); pemanggil membuka menu di (x, y). */
  onContextMenu?: (x: number, y: number, ids: string[]) => void;
  /** Node terpilih (urutan pilih; terakhir = primer). Seleksi canvas live dan Layers memakai state yang sama. */
  selection?: readonly string[];
  /** Seleksi baru dari klik/Shift-klik/marquee di canvas live. */
  onSelectIds?: (ids: string[]) => void;
  /** Commit satu gestur (geser/reorder/resize/teks) lewat route ops: rev commit, atau undefined bila gagal (pratinjau dipulihkan). */
  onCommit?: (ops: DocOp[], description: string) => Promise<number | undefined>;
  /** Label badge "Selection shared with agents" di kiri atas (story 3); undefined = tidak tampil. */
  shareBadge?: string | undefined;
  /** Tombol tambahan di kiri Export (kanan atas kanvas), mis. Theme (epic token-tema story 3). */
  actions?: ReactNode;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  /** Dokumen tersimpan terkini: board versi terkini di-mount sebagai DOM hidup dari `resolveDocument(doc)`. */
  doc?: LakarDocument | undefined;
  /** Dokumen belum punya board sama sekali (state Waiting desain); false = hanya halaman ini yang kosong. */
  docEmpty?: boolean;
  /** lakard offline: teks "Last synced …" dan board diredupkan. */
  stale?: string | undefined;
  /** Marker temuan layout_check di halaman ini. */
  markers?: readonly CanvasMarker[];
  /** Klik marker: pilih node temuan. */
  onMarker?: (nodeId: string) => void;
  /** Elemen tambahan di atas kanvas (toast rollback, chip Follow). */
  overlay?: ReactNode;
  /** Kamera tersimpan (pindah tab, viewState.ts): dipakai saat mount, tanpa auto-fit. */
  camera?: Camera | undefined;
  /** Kamera berubah: disimpan pemanggil per halaman. */
  onCamera?: (c: Camera) => void;
  slug: string;
  rev: number;
  /** Rev terakhir board berubah (default `rev`): board yang tidak tersentuh tidak dirender ulang. */
  boardRevs?: Readonly<Record<string, number>>;
  boards: CanvasBoard[];
  /** Kehadiran agen per sesi Live (disembunyikan saat pratinjau versi). */
  presence?: readonly AgentPresence[];
  focus?: Focus | undefined;
  onFocused?: (nonce: number) => void;
  highlight: Highlight | undefined;
  summary: FindingSummary | undefined;
  checksLoading: boolean;
  onSelect: (id: string | undefined) => void;
  onOpenChecks: () => void;
  /** Dialog Export code untuk board (popover Export, epic kode story 5). */
  onExportCode?: ((boardId: string) => void) | undefined;
  /** Pratinjau versi lama (History); `undefined` = versi terkini. */
  preview?: CanvasPreview | undefined;
  /** Tool sisip aktif (bukan pratinjau, daemon online). */
  editable?: boolean;
  /** Klik dengan tool sisip: board di bawah kursor (koordinat board) atau halaman (hanya Frame). */
  onInsert?: (kind: InsertKind, at: InsertPoint) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Sekali per objek dokumen (bukan per frame kamera); error resolve tampil di setiap board.
  const live = useMemo<LiveDoc | undefined>(() => {
    if (!doc) return undefined;
    try {
      return { ok: true, doc: resolveDocument(doc) };
    } catch (e) {
      return { ok: false, error: errorText(e) };
    }
  }, [doc]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState<Camera>(() => camera ?? { x: 0, y: 0, z: 1 });
  const [fitted, setFitted] = useState(camera !== undefined);
  const onCameraRef = useRef(onCamera);
  onCameraRef.current = onCamera;
  // Simpan hanya sesudah auto-fit (kamera awal 0,0,1 bukan pilihan pengguna).
  useEffect(() => {
    if (fitted) onCameraRef.current?.(cam);
  }, [cam, fitted]);
  const [tool, setTool] = useState<Tool>('select');
  const canInsert = editable && !preview && onInsert !== undefined;
  // Pratinjau/offline: tool sisip yang aktif kembali ke Select.
  useEffect(() => {
    if (!canInsert) setTool((t) => (isDrawTool(t) ? 'select' : t));
  }, [canInsert]);
  const [spaceHeld, setSpaceHeld] = useState(false);
  // Seleksi + gestur editor di canvas live (canvasEdit.tsx); jalur PNG (pratinjau versi) memakai klik board lama.
  const liveActive = live?.ok === true && !preview;
  const selectIds = useCallback((ids: string[]) => (onSelectIds ? onSelectIds(ids) : onSelect(ids[ids.length - 1])), [onSelectIds, onSelect]);
  // Pen tool dan edit titik path (pathTools.tsx, epic paste-vektor story 5). Geometri/elemen live dibaca lewat hook
  // edit (dipanggil sesudahnya), jadi diakses lewat ref.
  const editRef = useRef<{ nodeGeo: (id: string) => GeoNode | undefined; liveEl: (id: string) => HTMLElement | undefined } | null>(null);
  const canPen = canInsert && liveActive && onCommitCreate !== undefined;
  const paths = usePathTools({
    section: ref,
    cam,
    doc: live?.ok ? live.doc : undefined,
    boards,
    penActive: tool === 'pen' && canPen,
    canEdit: editable && !preview && liveActive && tool === 'select' && onCommit !== undefined,
    selection,
    onCommit,
    onCommitCreate,
    onPenDone: () => setTool('select'),
    nodeGeo: (id) => editRef.current?.nodeGeo(id),
    liveEl: (id) => editRef.current?.liveEl(id),
    onPanel: onPathEdit,
  });
  const pathMode = paths.editingId !== undefined || paths.penDrawing;
  const edit = useCanvasEdit({
    section: ref,
    cam,
    boards,
    doc: live?.ok ? live.doc : undefined,
    active: liveActive,
    hoverable: tool === 'select' && !spaceHeld,
    canEdit: editable && !preview && tool === 'select' && !spaceHeld && onCommit !== undefined,
    selection,
    onSelectIds: selectIds,
    onCommit,
    components,
    pastedTag,
    onEnterPath: (id) => paths.enter(id),
    pathEditing: pathMode,
  });
  editRef.current = edit;
  /** Seleksi terkini untuk listener keyboard (Escape keluar dari isi instance). */
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const cancelEdit = edit.cancel;
  if (sceneRef) sceneRef.current = edit.scene;
  const onSceneChangeRef = useRef(onSceneChange);
  onSceneChangeRef.current = onSceneChange;
  useEffect(() => onSceneChangeRef.current?.(), [edit.sceneKey]);
  /** Enter dengan satu teks terpilih → edit inline (nilai render terakhir untuk listener keyboard). */
  const enterText = useRef<() => boolean>(() => false);
  enterText.current = () => selection.length === 1 && (edit.startTextEdit(selection[0]!) || paths.enter(selection[0]!));
  const [panning, setPanning] = useState(false);
  /** Satu pointer: `pan` = gerak menggeser kamera, `tap` = lepas tanpa gerak memilih/menyisip. */
  const drag = useRef<{ id: number; x: number; y: number; cam: Camera; moved: boolean; pan: boolean; tap: boolean; slop: number; target: string | undefined } | null>(null);
  /** Pointer sentuh aktif (koordinat client) dan pinch dua jari yang sedang berjalan. */
  const touches = useRef(new Map<number, Point>());
  const pinch = useRef<{ ids: [number, number]; a0: Point; b0: Point; cam: Camera; left: number; top: number } | null>(null);
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
      // Panel melayang yang bisa di-scroll (Theme): wheel men-scroll panel, bukan kamera.
      // Ctrl/⌘ + wheel (pinch) tetap ditahan agar halaman tidak ikut zoom.
      if (e.target instanceof Element && e.target.closest('.canvas-scroll-ui')) {
        if (e.ctrlKey || e.metaKey) e.preventDefault();
        return;
      }
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
      // Target asli di dalam shadow root (teks yang diedit inline), bukan host hasil retarget.
      const t = e.composedPath()[0] ?? e.target;
      if (!(t instanceof HTMLElement)) return false;
      return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable || t.closest('[role="treeitem"]') !== null;
    };
    const down = (e: KeyboardEvent) => {
      // Dialog atau menu terbuka: shortcut kanvas tidak berlaku.
      if (typing(e) || document.querySelector('.modal-scrim, .menu-layer')) return;
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        if (canInsert) {
          e.preventDefault();
          setTool('image');
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const insertKey = TOOL_KEYS[e.key.toLowerCase()];
      if (e.code === 'Space') {
        setSpaceHeld(true);
        if (e.target === document.body) e.preventDefault();
      } else if (e.key === 'v' || e.key === 'V') setTool('select');
      else if (e.key === 'h' || e.key === 'H') setTool('hand');
      else if (insertKey && !e.shiftKey) {
        if (canInsert) setTool(insertKey);
      } else if ((e.key === 'p' || e.key === 'P') && !e.shiftKey) {
        if (canPen) setTool('pen');
      }
      else if (e.key === 'Enter' && !e.shiftKey) {
        // Satu teks terpilih → edit inline; preventDefault supaya Enter tidak masuk ke teks yang baru difokus.
        // Tombol/tautan yang fokus tetap memakai Enter-nya sendiri.
        if (e.target instanceof Element && e.target.closest('button, a, [role="menuitem"]')) return;
        if (enterText.current()) e.preventDefault();
      } else if (e.key === '!' || (e.shiftKey && e.code === 'Digit1')) fit();
      else if (e.key === '+' || e.key === '=') zoomAt(1.25, size.w / 2, size.h / 2);
      else if (e.key === '-') zoomAt(1 / 1.25, size.w / 2, size.h / 2);
      else if (e.key === 'Escape') {
        // Gestur berjalan: hanya dibatalkan (seleksi tetap).
        if (cancelEdit()) return;
        setTool((t) => (isDrawTool(t) ? 'select' : t));
        // Isi instance terpilih (alamat komposit, desain dQRib "Esc to exit instance"): naik ke instance terluar.
        const exited = exitInstanceSelection(selectionRef.current);
        if (exited) {
          selectIds(exited);
          return;
        }
        onSelect(undefined);
      }
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
  }, [fit, zoomAt, size, onSelect, selectIds, canInsert, canPen, cancelEdit]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.canvas-overlay-ui')) return;
    // Di dalam teks yang sedang diedit inline: caret/seleksi bawaan, bukan gestur kanvas.
    if (e.nativeEvent.composedPath().some((n) => n instanceof HTMLElement && n.isContentEditable)) return;
    const touch = e.pointerType === 'touch';
    if (e.button !== 0 && e.button !== 1) return;
    stopAnim();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (touch) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        // Jari kedua: mulai pinch dari kamera sekarang; tap jari pertama batal.
        const [[ia, a], [ib, b]] = [...touches.current] as [[number, Point], [number, Point]];
        const r = e.currentTarget.getBoundingClientRect();
        pinch.current = { ids: [ia, ib], a0: a, b0: b, cam: camRef.current, left: r.left, top: r.top };
        drag.current = null;
        setPanning(true);
        return;
      }
      if (touches.current.size > 2) return;
    }
    // Sentuh: satu jari menggeser di Select/Hand; tap tetap memilih (Select) atau menyisip (tool sisip).
    const { pan, tap, slop } = pointerIntent({ touch, tool, spaceHeld, button: e.button });
    // Pen tool (mouse/pen pointer): titik path baru; edit titik path mendahului seleksi biasa.
    if (!touch && tool === 'pen' && canPen && !pan && e.button === 0 && paths.pen.onPointerDown(e)) return;
    if (!touch && tool === 'select' && !pan && e.button === 0 && paths.editingId && paths.edit.onPointerDown(e)) return;
    // Mouse/pen dengan tool Select di canvas live: seleksi, marquee, dan gestur edit (sentuh tidak pernah ke sini).
    if (!touch && tool === 'select' && !pan && e.button === 0 && edit.onPointerDown(e)) return;
    const boardEl = (e.target as HTMLElement).closest<HTMLElement>('[data-board]');
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, cam: camRef.current, moved: false, pan, tap, slop, target: boardEl?.dataset.board };
    if (pan && !touch) setPanning(true);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current;
    if (p) {
      const a1 = touches.current.get(p.ids[0]);
      const b1 = touches.current.get(p.ids[1]);
      if (!a1 || !b1) return;
      const rel = (q: Point) => ({ x: q.x - p.left, y: q.y - p.top });
      const next = pinchCamera(p.cam, rel(p.a0), rel(p.b0), rel(a1), rel(b1), clampZoom);
      // Langsung ke ref: jari kedua bisa lepas sebelum render, handoff pan memakai kamera ini.
      camRef.current = next;
      setCam(next);
      return;
    }
    if (tool === 'pen' && canPen && e.pointerType !== 'touch' && !drag.current) {
      paths.pen.onPointerMove(e);
      return;
    }
    if (paths.edit.onPointerMove(e)) return;
    if (edit.onPointerMove(e)) return;
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > d.slop) {
      d.moved = true;
      if (d.pan) setPanning(true);
    }
    if (d.pan && d.moved) setCam({ ...d.cam, x: d.cam.x + dx, y: d.cam.y + dy });
  };
  /** Pointer sentuh lepas: pinch berakhir → jari tersisa lanjut menggeser dari posisinya sekarang (tanpa lompat). */
  const releaseTouch = (pointerId: number): boolean => {
    if (!touches.current.delete(pointerId)) return false;
    const p = pinch.current;
    if (p && (p.ids[0] === pointerId || p.ids[1] === pointerId)) {
      pinch.current = null;
      const rest = [...touches.current][0];
      if (rest) drag.current = { id: rest[0], x: rest[1].x, y: rest[1].y, cam: camRef.current, moved: true, pan: true, tap: false, slop: TAP_SLOP, target: undefined };
      else setPanning(false);
      return true;
    }
    return p !== null;
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (releaseTouch(e.pointerId)) return;
    if (tool === 'pen' && canPen && e.pointerType !== 'touch' && !drag.current) {
      paths.pen.onPointerUp(e);
      return;
    }
    if (paths.edit.onPointerUp(e)) return;
    if (edit.onPointerUp(e)) return;
    const d = drag.current;
    if (d && d.id !== e.pointerId) return;
    drag.current = null;
    setPanning(false);
    if (!d || d.moved || !d.tap) return;
    if (isInsertTool(tool)) {
      insertAt(tool, d.x, d.y, d.target);
      return;
    }
    onSelect(d.target);
  };
  /** Klik tool sisip di (clientX, clientY): koordinat board = (clientX − kiri kanvas − cam.x)/z − board.x. */
  const insertAt = (kind: InsertKind, clientX: number, clientY: number, boardId: string | undefined) => {
    const el = ref.current;
    if (!el || !canInsert) return;
    const r = el.getBoundingClientRect();
    const px = (clientX - r.left - cam.x) / cam.z;
    const py = (clientY - r.top - cam.y) / cam.z;
    const b = boardId ? boards.find((x) => x.id === boardId) : undefined;
    if (b) onInsert?.(kind, { boardId: b.id, x: Math.round(px - b.x), y: Math.round(py - b.y) });
    else if (kind === 'frame') onInsert?.(kind, { x: Math.round(px), y: Math.round(py) });
    else return; // tipe lain butuh board: klik di luar board diabaikan, tool tetap aktif
    setTool('select');
  };
  /** Gestur dibatalkan (mis. sistem mengambil alih pointer): jari pinch → jari tersisa lanjut menggeser; selain itu bersihkan tanpa memilih. */
  const onPointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (releaseTouch(e.pointerId)) return;
    if (tool === 'pen' && canPen && e.pointerType !== 'touch') paths.pen.onPointerCancel(e);
    if (paths.edit.onPointerCancel(e)) return;
    if (edit.onPointerCancel(e)) return;
    if (drag.current && drag.current.id !== e.pointerId) return;
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
  /** Rev snapshot yang dirender board: hanya setelah dokumen versi itu termuat (board-nya milik versi itu). */
  const previewRev = preview && !preview.loading && !preview.error ? preview.rev : undefined;

  return (
    <section
      ref={ref}
      className={`canvas${handMode ? ' hand' : isDrawTool(tool) ? ' inserting' : ''}${panning ? ' panning' : ''}${preview ? ' previewing' : ''}${stale !== undefined ? ' stale' : ''}${liveActive ? ' live-edit' : ''}${edit.dragging ? ' dragging' : ''}`}
      aria-label="Canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={() => {
        edit.onPointerLeave();
        paths.pen.onPointerLeave();
      }}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest('.canvas-overlay-ui') || e.nativeEvent.composedPath().some((n) => n instanceof HTMLElement && n.isContentEditable)) return;
        if (!onContextMenu) return;
        e.preventDefault();
        // Pratinjau versi (jalur PNG): menu dengan seleksi saat ini, item nonaktif (Viewer: tidak editable).
        const ids = liveActive ? edit.contextSelect(e.clientX, e.clientY) : [...selection];
        if (ids.length) onContextMenu(e.clientX, e.clientY, ids);
      }}
      // Kartu komponen dari Assets (desain C2xbUQ "Drag a component onto the canvas"): hanya canvas live yang bisa diedit.
      onDragOver={(e) => {
        if (!onDropComponent || !liveActive || !editable || !e.dataTransfer.types.includes(COMPONENT_DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(COMPONENT_DRAG_TYPE);
        if (!id || !onDropComponent || !liveActive || !editable) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        onDropComponent(id, { x: (e.clientX - r.left - cam.x) / cam.z, y: (e.clientY - r.top - cam.y) / cam.z });
      }}
    >
      {boards.length === 0 && !preview && (
        <div className="canvas-waiting">
          <div className="waiting-board">
            {docEmpty ? <Icon name="loaderCircle" size={22} className="spin" /> : <Icon name="frame" size={22} />}
          </div>
          <strong>{docEmpty ? 'Waiting for your agent' : 'This page is empty'}</strong>
          <span>{docEmpty ? 'This file is open in lakard. Boards appear here as soon as your agent runs execute.' : 'Boards appear here as soon as your agent runs execute, or add one with the Frame tool.'}</span>
          {docEmpty && (
            <code className="waiting-hint">
              open_doc <span>slug: {slug}</span>
            </code>
          )}
        </div>
      )}
      {boards.map((b) => {
        // Board yang sedang digeser/di-resize (atau menunggu mount rev baru): kotak pratinjau.
        const ob = edit.boardBox(b.id);
        const bw = ob?.w ?? b.width;
        const bh = ob?.h ?? b.height;
        const left = cam.x + (ob?.x ?? b.x) * cam.z;
        const top = cam.y + (ob?.y ?? b.y) * cam.z;
        const selected = highlight?.boardId === b.id && !highlight.bounds;
        // Board baru ditulis agen (story 3, desain iVbC4): label berganti tag "Just changed · Agen" selama 1.5 dtk.
        const changedBy = preview ? undefined : presence?.find((p) => p.changedKey && p.changedBoards.includes(b.id));
        return (
          <div key={b.id}>
            <div
              key={changedBy ? `label:${changedBy.session}:${changedBy.changedKey}` : 'label'}
              className={`board-label${highlight?.boardId === b.id ? ' active' : ''}${changedBy ? ' swapped' : ''}`}
              data-board-label={b.id}
              style={{ left, top: top - 18, maxWidth: Math.max(40, bw * cam.z) }}
            >
              {b.name}
            </div>
            {changedBy && (
              <div key={`tag:${changedBy.session}:${changedBy.changedKey}`} className={`change-tag board-tag ${changedBy.color}`} aria-hidden="true" style={{ left, top: top - 20 }}>
                <Icon name="sparkles" size={10} />
                Just changed · {changedBy.label}
              </div>
            )}
            <div className={`board${selected ? ' selected' : ''}`} data-board={b.id} style={{ left, top, width: bw * cam.z, height: bh * cam.z }}>
              {live && boardSource(live !== undefined, preview !== undefined) === 'live' ? (
                <BoardLive live={live} board={b} zoom={cam.z} onMounted={edit.onMounted} />
              ) : (
                <BoardImage slug={slug} rev={Math.min(rev, boardRevs?.[b.id] ?? rev)} board={b} previewRev={previewRev} />
              )}
            </div>
          </div>
        );
      })}
      {liveActive
        ? [...edit.overlay, ...paths.overlay]
        : hRect && (
            <SelectionBox
              style={{ left: cam.x + hRect.x * cam.z, top: cam.y + hRect.y * cam.z, width: Math.max(1, hRect.w * cam.z), height: Math.max(1, hRect.h * cam.z) }}
              handles={false}
              label={`${Math.round(hRect.w)} × ${Math.round(hRect.h)}`}
            />
          )}

      {markers && markers.length > 0 && (
        <div className="marker-layer">
          {markers.map((m) => {
            const b = boardById.get(m.boardId);
            if (!b) return null;
            const r = m.bounds ? nodeBox(b, m.bounds, cam) : undefined;
            const right = r ? r.left + r.width : cam.x + (b.x + b.width) * cam.z;
            const top = r ? r.top : cam.y + b.y * cam.z;
            return (
              <div key={m.nodeId}>
                {r && <div className={`finding-outline ${m.level}`} style={{ left: r.left, top: r.top, width: r.width, height: r.height }} />}
                <button
                  type="button"
                  className={`finding-marker canvas-overlay-ui ${m.level}`}
                  style={{ left: right - 10, top: top - 10 }}
                  aria-label={m.level === 'error' ? 'Layout error: show in Checks' : 'Layout warning: show in Checks'}
                  title="Show in Checks"
                  onClick={() => onMarker?.(m.nodeId)}
                >
                  <Icon name="alert" size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!preview && presence && presence.length > 0 && <AgentLayer presence={presence} boardById={boardById} cam={cam} />}

      {stale !== undefined && (
        <div className="stale-pill" role="status">
          <Icon name="clock" size={13} />
          Last synced {stale}
        </div>
      )}
      {overlay}

      {shareBadge && !preview && (
        <div className="share-badge canvas-share-badge" role="status" title="Agents can read this selection with get_selection">
          <Icon name="radio" size={12} />
          <span>{shareBadge}</span>
        </div>
      )}

      {preview && <PreviewBanner preview={preview} />}

      {!preview && (summary || checksLoading) && (
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

      {!preview && (
        <div className="canvas-actions">
          {actions}
          <ExportButton slug={slug} boards={boards} selectedBoardId={highlight?.boardId} onExportCode={onExportCode} />
        </div>
      )}

      <div className="view-controls canvas-overlay-ui" role="toolbar" aria-label="View controls">
        <button type="button" className={`tool${tool === 'select' ? ' active' : ''}`} aria-label="Select (V)" title="Select (V)" aria-pressed={tool === 'select'} onClick={() => setTool('select')}>
          <Icon name="pointer" />
        </button>
        <button type="button" className={`tool${tool === 'hand' ? ' active' : ''}`} aria-label="Hand (H)" title="Hand (H)" aria-pressed={tool === 'hand'} onClick={() => setTool('hand')}>
          <Icon name="hand" />
        </button>
        <span className="divider" />
        {INSERT_KINDS.map(({ kind, label }) => {
          const tip = `${label} (${shortcutLabel(kind)})`;
          return (
            <button
              key={kind}
              type="button"
              className={`tool${tool === kind ? ' active' : ''}`}
              aria-label={tip}
              title={canInsert ? tip : preview ? `${label}: not available while previewing a version` : `${label}: lakard is offline`}
              aria-pressed={tool === kind}
              disabled={!canInsert}
              onClick={() => setTool(tool === kind ? 'select' : kind)}
            >
              <Icon name={TOOL_ICON[kind]} />
            </button>
          );
        })}
        <button
          type="button"
          className={`tool${tool === 'pen' ? ' active' : ''}`}
          aria-label="Pen (P)"
          title={canPen ? 'Pen (P)' : preview ? 'Pen: not available while previewing a version' : !editable ? 'Pen: lakard is offline' : 'Pen: available once the canvas has rendered'}
          aria-pressed={tool === 'pen'}
          disabled={!canPen}
          onClick={() => setTool(tool === 'pen' ? 'select' : 'pen')}
        >
          <Icon name="penTool" />
        </button>
        <span className="divider" />
        <button type="button" className="tool zoom-btn" aria-label="Zoom out" title="Zoom out (-)" onClick={() => zoomAt(1 / 1.25, ...center())}>
          <Icon name="minus" />
        </button>
        <span className="zoom-level">{Math.round(cam.z * 100)}%</span>
        <button type="button" className="tool zoom-btn" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomAt(1.25, ...center())}>
          <Icon name="plus" />
        </button>
        <button type="button" className="tool" aria-label="Fit" title="Fit (Shift+1)" onClick={fit}>
          <Icon name="fit" />
        </button>
        {(onUndo || onRedo) && (
          <>
            <span className="divider" />
            <button type="button" className="tool" aria-label="Undo" title={isMac ? 'Undo (⌘Z)' : 'Undo (Ctrl+Z)'} disabled={!canUndo} onClick={onUndo}>
              <Icon name="undo2" />
            </button>
            <button type="button" className="tool" aria-label="Redo" title={isMac ? 'Redo (⇧⌘Z)' : 'Redo (Ctrl+Shift+Z)'} disabled={!canRedo} onClick={onRedo}>
              <Icon name="redo2" />
            </button>
          </>
        )}
      </div>
    </section>
  );
}

/** Banner pratinjau versi (desain "Viewer — Desktop — History": Version Banner). */
function PreviewBanner({ preview }: { preview: CanvasPreview }) {
  return (
    <div className="version-banner canvas-overlay-ui" role="status">
      <Icon name={preview.error ? 'alert' : 'history'} size={14} className="version-banner-icon" />
      <span className="version-banner-text" title={preview.label}>
        {preview.error ? `Couldn't load this version: ${preview.error}` : preview.loading ? `${preview.label} · loading…` : preview.label}
      </span>
      <button type="button" className="btn small" onClick={preview.onBack}>
        Back to live
      </button>
      <button
        type="button"
        className="btn small primary"
        disabled={!preview.canRestore || preview.restoring || preview.loading || preview.error !== undefined}
        title={preview.canRestore ? undefined : 'No snapshot for this version'}
        onClick={preview.onRestore}
      >
        <Icon name="rotateCcw" size={13} /> {preview.restoring ? 'Restoring…' : 'Restore this version'}
      </button>
    </div>
  );
}
