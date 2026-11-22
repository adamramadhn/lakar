/// <reference lib="dom" />
// Gestur editor di canvas live (editor-canvas story 4, desain bagian 05 "Editor"): klik/Shift/Ctrl/dobel-klik memilih
// node lewat hit-test geometri DOM live (`[data-lakar-id]` di shadow root), marquee, geser node absolute/board,
// urutkan ulang anak flow (termasuk pindah ke kontainer flow lain), dan resize 8 handle. Selama gestur hanya
// pratinjau lokal (gaya DOM sementara + overlay); satu `onCommit(ops)` di akhir gestur (AD-7). Escape membatalkan.
// Sesudah commit pratinjau ditahan sampai board tersentuh di-mount ulang dari rev baru (tanpa lompat balik).
// Hanya mouse/pen: pointer sentuh tidak masuk ke sini (Canvas mempertahankan pan/pinch/tap lama).
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { findBoard } from '@lakar/render';
import type { DocOp, ResolvedDocument } from '@lakar/schema';
import {
  boxFrom,
  committedBox,
  dropContainer,
  HANDLES,
  hitPath,
  indexGeo,
  marqueeSelect,
  moveOps,
  pickTarget,
  reorderHint,
  reorderTarget,
  resizeBox,
  resizeOp,
  scaleBox,
  sizeBadge,
  toggleSelection,
  unionBox,
  type Box,
  type GeoNode,
  type Handle,
  type Point,
  type ReorderTarget,
} from './gesture';
import { normalizeEditedText, textEditPlan } from './editActions';
import { Icon } from './icons';
import { liveElement, measureBoard, pageGeometry } from './liveGeometry';
import { CLICK_SLOP } from './sheet';
import type { Camera } from './viewState';

export type EditBoard = { id: string; name: string; x: number; y: number; width: number; height: number };

/** Pengubah gaya sementara: nilai asli tiap properti disimpan sekali, `restore` mengembalikan semuanya. */
function styleSaver() {
  const saved = new Map<HTMLElement, Map<string, string>>();
  return {
    set(el: HTMLElement, prop: string, value: string) {
      let m = saved.get(el);
      if (!m) saved.set(el, (m = new Map()));
      if (!m.has(prop)) m.set(prop, el.style.getPropertyValue(prop));
      el.style.setProperty(prop, value);
    },
    restore() {
      for (const [el, m] of saved) for (const [p, v] of m) (v ? el.style.setProperty(p, v) : el.style.removeProperty(p));
      saved.clear();
    },
  };
}
type Saver = ReturnType<typeof styleSaver>;

/** `mounts` = hitungan mount board tersentuh saat gestur mulai (mount ulang di tengah gestur membatalkannya). */
type Base = { pointer: number; c0: Point; p0: Point; moved: boolean; mounts?: Record<string, number> };
type Gesture =
  | (Base & { kind: 'press'; picked: GeoNode; ids: string[]; collapse: string | undefined })
  | (Base & { kind: 'marquee'; p: Point; picked: GeoNode | undefined; candidates: GeoNode[]; base: string[]; shift: boolean })
  | (Base & { kind: 'move'; d: Point; nodes: GeoNode[]; saver: Saver })
  | (Base & { kind: 'reorder'; p: Point; node: GeoNode; container: GeoNode | undefined; target: ReorderTarget | undefined; saver: Saver; ghost: HTMLElement | undefined })
  | (Base & { kind: 'resize'; handle: Handle; members: GeoNode[]; from: Box; to: Box; saver: Saver });

/** Pratinjau yang ditahan sesudah commit: berlaku sampai semua board tersentuh di-mount ulang. */
type Held = { mounts: Record<string, number>; boxes: Map<string, Box>; saver: Saver };

/** Jarak waktu maksimal dua tekan sebagai dobel-klik. */
const DOUBLE_MS = 400;

const HANDLE_CURSOR: Record<Handle, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' };

export function useCanvasEdit({
  section,
  cam,
  boards,
  doc,
  active,
  hoverable,
  canEdit,
  selection,
  onSelectIds,
  onCommit,
}: {
  section: RefObject<HTMLElement | null>;
  cam: Camera;
  boards: readonly EditBoard[];
  /** Dokumen ter-resolve terkini (mode live); undefined = jalur PNG, gestur nonaktif. */
  doc: ResolvedDocument | undefined;
  /** Seleksi/hover lewat geometri live aktif (live, bukan pratinjau versi). */
  active: boolean;
  /** Outline hover tampil (tool Select tanpa Space). */
  hoverable: boolean;
  /** Gestur edit (geser/reorder/resize) boleh (editable, tool Select). */
  canEdit: boolean;
  selection: readonly string[];
  onSelectIds: (ids: string[]) => void;
  onCommit: ((ops: DocOp[], description: string) => Promise<boolean>) | undefined;
}) {
  const hosts = useRef(new Map<string, HTMLDivElement>());
  const [mounts, setMounts] = useState<Record<string, number>>({});
  const mountsRef = useRef(mounts);
  mountsRef.current = mounts;
  const onMounted = useCallback((id: string, host: HTMLDivElement) => {
    hosts.current.set(id, host);
    setMounts((m) => ({ ...m, [id]: (m[id] ?? 0) + 1 }));
  }, []);
  const [gesture, setGestureState] = useState<Gesture | null>(null);
  const gRef = useRef<Gesture | null>(null);
  const setGesture = (g: Gesture | null) => {
    gRef.current = g;
    setGestureState(g);
  };
  const [held, setHeld] = useState<Held | null>(null);
  const [hover, setHover] = useState<string | undefined>(undefined);
  const lastDown = useRef<{ t: number; x: number; y: number } | undefined>(undefined);
  /** `startTextEdit` render terakhir (dipanggil tertunda dari dobel-klik). */
  const startTextRef = useRef<(id: string) => boolean>(() => false);

  // Geometri per board di-cache per mount + posisi/ukuran board (pan/zoom tidak mengukur ulang).
  const cache = useRef(new Map<string, { key: string; geo: GeoNode | undefined }>());
  const geometry = (): GeoNode[] => {
    if (!active || !doc) return [];
    // Board belum ter-mount: stub tanpa anak (pageGeometry), aksi board tetap tahu posisinya.
    return pageGeometry(boards, (id) => {
      const b = boards.find((x) => x.id === id)!;
      const n = mounts[b.id] ?? 0;
      const key = `${n}:${b.x}:${b.y}:${b.width}:${b.height}`;
      let c = cache.current.get(b.id);
      if (!c || c.key !== key) {
        const host = hosts.current.get(b.id);
        const rb = findBoard(doc, b.id);
        c = { key, geo: host && rb && n > 0 ? measureBoard(host, rb, { x: b.x, y: b.y }) : undefined };
        cache.current.set(b.id, c);
      }
      return c.geo;
    });
  };
  const geo = geometry();
  const index = indexGeo(geo);
  const boardOf = (id: string): string | undefined => {
    let n = index.get(id);
    while (n?.parentId) n = index.get(n.parentId);
    return n?.id;
  };

  const toPage = (clientX: number, clientY: number): Point => {
    const r = section.current?.getBoundingClientRect();
    return { x: (clientX - (r?.left ?? 0) - cam.x) / cam.z, y: (clientY - (r?.top ?? 0) - cam.y) / cam.z };
  };

  const endGhost = (g: Gesture | null) => {
    if (g?.kind === 'reorder') g.ghost?.remove();
  };
  /** Batalkan gestur: pratinjau dipulihkan, tanpa request. */
  const cancel = useCallback(() => {
    const g = gRef.current;
    if (!g) return false;
    if (g.kind === 'move' || g.kind === 'reorder' || g.kind === 'resize') g.saver.restore();
    endGhost(g);
    setGesture(null);
    return true;
  }, []);

  // Board yang sedang digestur di-mount ulang (agen menulis): DOM pratinjau sudah diganti → gestur batal.
  // Pratinjau tertahan dilepas begitu semua board tersentuh di-mount ulang.
  useEffect(() => {
    const g = gRef.current;
    if (g?.mounts && Object.entries(g.mounts).some(([b, n]) => (mounts[b] ?? 0) !== n)) cancel();
    // Board yang sudah tidak ada di halaman (dihapus) dianggap selesai.
    setHeld((h) => (h && Object.entries(h.mounts).every(([b, n]) => (mounts[b] ?? 0) !== n || !boards.some((x) => x.id === b)) ? null : h));
  }, [mounts, boards, cancel]);
  useEffect(() => () => void cancel(), [cancel]);

  const mountsOf = (ids: readonly string[]): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const id of ids) {
      const b = boardOf(id);
      if (b) out[b] = mountsRef.current[b] ?? 0;
    }
    return out;
  };

  /** Commit satu gestur; pratinjau ditahan sampai mount ulang, dipulihkan bila gagal. */
  const commit = (ops: DocOp[], description: string, ids: readonly string[], boxes: Map<string, Box>, saver: Saver) => {
    if (!ops.length || !onCommit) {
      saver.restore();
      return;
    }
    // Hanya board yang benar-benar diubah op (anggota tanpa op tidak memicu mount ulang).
    const opIds = new Set(ops.flatMap((o) => ('id' in o ? [o.id] : [])));
    const h: Held = { mounts: mountsOf(ids.filter((id) => opIds.has(id))), boxes, saver };
    setHeld(h);
    void onCommit(ops, description).then((ok) => {
      if (ok) return;
      saver.restore();
      setHeld((cur) => (cur === h ? null : cur));
    });
  };

  const hostOf = (id: string) => {
    const b = boardOf(id);
    return b ? hosts.current.get(b) : undefined;
  };
  /** Anggota tanpa leluhur yang juga anggota (leluhur yang digeser membawa turunannya). */
  const topMost = (ids: readonly string[]): GeoNode[] => {
    const set = new Set(ids);
    return ids.flatMap((id) => {
      const n = index.get(id);
      if (!n) return [];
      for (let p = n.parentId; p; p = index.get(p)?.parentId) if (set.has(p)) return [];
      return [n];
    });
  };

  const startDrag = (g: Gesture & { kind: 'press' }, p: Point) => {
    const nodes = topMost(g.ids);
    const base = { pointer: g.pointer, c0: g.c0, p0: g.p0, moved: true };
    const single = nodes.length === 1 ? nodes[0]! : undefined;
    if (single && !single.absolute && single.parentId) {
      // Reorder di dalam grid belum didukung (ditunda): jangan sampai drop memindahkan anak grid ke leluhur flex.
      if (index.get(single.parentId)?.layout === 'grid') {
        setGesture(null);
        return;
      }
      const saver = styleSaver();
      const el = hostOf(single.id) && liveElement(hostOf(single.id)!, single.id);
      let ghost: HTMLElement | undefined;
      if (el && section.current) {
        ghost = dragGhost(el, single.box);
        section.current.appendChild(ghost);
        saver.set(el, 'opacity', '0.35');
      }
      setGesture(updateReorder({ ...base, kind: 'reorder', p, node: single, container: undefined, target: undefined, saver, ghost, mounts: mountsOf([single.id]) }, p));
      return;
    }
    const movable = nodes.filter((n) => n.absolute);
    if (!movable.length) {
      setGesture(null);
      return;
    }
    setGesture({ ...base, kind: 'move', d: { x: 0, y: 0 }, nodes: movable, saver: styleSaver(), mounts: mountsOf(movable.map((n) => n.id)) });
  };

  const updateReorder = (g: Gesture & { kind: 'reorder' }, p: Point): Gesture => {
    const path = hitPath(geo, p);
    const parent = g.node.parentId ? index.get(g.node.parentId) : undefined;
    const container = dropContainer(path, g.node.id) ?? (parent && (parent.layout === 'row' || parent.layout === 'column') ? parent : undefined);
    const target = container ? reorderTarget(container, g.node, p) : undefined;
    if (g.ghost) placeGhost(g.ghost, g.node.box, { x: p.x - g.p0.x, y: p.y - g.p0.y }, cam);
    return { ...g, p, container, target };
  };

  /** Pratinjau geser: elemen node absolute digeser lewat left/top (satuan board), board lewat kotak override. */
  const previewMove = (g: Gesture & { kind: 'move' }, d: Point) => {
    for (const n of g.nodes) {
      if (n.type === 'board') continue;
      const host = hostOf(n.id);
      const el = host && liveElement(host, n.id);
      if (!el) continue;
      g.saver.set(el, 'left', `${n.x + d.x}px`);
      g.saver.set(el, 'top', `${n.y + d.y}px`);
    }
  };
  const previewResize = (g: Gesture & { kind: 'resize' }, to: Box) => {
    for (const n of g.members) {
      const b = memberBox(g, n, to);
      const host = hostOf(n.id);
      const el = host && liveElement(host, n.id);
      if (!el) continue;
      const s = g.saver;
      s.set(el, 'width', `${b.w}px`);
      s.set(el, 'height', `${b.h}px`);
      if (n.type !== 'board') {
        s.set(el, 'flex', '0 0 auto');
        if (n.absolute) {
          s.set(el, 'left', `${n.x + b.x - n.box.x}px`);
          s.set(el, 'top', `${n.y + b.y - n.box.y}px`);
          s.set(el, 'right', 'auto');
          s.set(el, 'bottom', 'auto');
        }
      } else if (host) {
        s.set(host, 'width', `${b.w}px`);
        s.set(host, 'height', `${b.h}px`);
      }
    }
  };

  /** Kotak pratinjau per node selama gestur (koordinat halaman). */
  const previewBoxes = new Map<string, Box>();
  if (gesture?.kind === 'move') for (const n of gesture.nodes) previewBoxes.set(n.id, { ...n.box, x: n.box.x + gesture.d.x, y: n.box.y + gesture.d.y });
  if (gesture?.kind === 'resize') for (const n of gesture.members) previewBoxes.set(n.id, memberBox(gesture, n, gesture.to));
  const boxOf = (id: string): Box | undefined => previewBoxes.get(id) ?? held?.boxes.get(id) ?? index.get(id)?.box;
  /** Kotak board yang sedang digeser/di-resize (atau tertahan sesudah commit). */
  const boardBox = (id: string): Box | undefined => previewBoxes.get(id) ?? held?.boxes.get(id);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>): boolean => {
    if (!active) return false;
    const target = e.target as HTMLElement;
    const p = toPage(e.clientX, e.clientY);
    const c0 = { x: e.clientX, y: e.clientY };
    const base = { pointer: e.pointerId, c0, p0: p, moved: false };
    const sel = selection.filter((id) => index.has(id));
    const handle = target.closest<HTMLElement>('[data-handle]')?.dataset.handle as Handle | undefined;
    if (handle && canEdit && sel.length) {
      const members = topMost(sel);
      const from = unionBox(members.map((n) => n.box));
      if (from) {
        setGesture({ ...base, kind: 'resize', handle, members, from, to: from, saver: styleSaver(), mounts: mountsOf(members.map((n) => n.id)) });
        return true;
      }
    }
    const labelId = target.closest<HTMLElement>('[data-board-label]')?.dataset.boardLabel;
    const selSet = new Set(selection);
    const scope = new Set(selection.flatMap((id) => index.get(id)?.parentId ?? []));
    // Dobel-klik dideteksi sendiri (detail pointerdown selalu 0 di Chromium): dua tekan ≤ 400ms dan ≤ 4px.
    const last = lastDown.current;
    const double = last !== undefined && e.timeStamp - last.t <= DOUBLE_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) <= 4;
    lastDown.current = double ? undefined : { t: e.timeStamp, x: e.clientX, y: e.clientY };
    const mode = e.ctrlKey || e.metaKey ? 'deep' : double ? 'enter' : 'scope';
    const picked = labelId ? index.get(labelId) : pickTarget(hitPath(geo, p), selSet, scope, mode);
    setHover(undefined);
    // Dobel-klik teks → edit inline. Dimulai sesudah event mouse bawaan (fokus mousedown tidak langsung mem-blur-nya).
    if (double && !labelId && picked?.type === 'text' && canEdit) {
      e.preventDefault();
      const id = picked.id;
      onSelectIds([id]);
      setTimeout(() => startTextRef.current(id), 0);
      return true;
    }
    if (!picked || (picked.type === 'board' && !selSet.has(picked.id) && !labelId)) {
      setGesture({ ...base, kind: 'marquee', p, picked, candidates: picked ? picked.children : geo, base: e.shiftKey ? [...selection] : [], shift: e.shiftKey });
      return true;
    }
    let ids: string[];
    let collapse: string | undefined;
    if (e.shiftKey) {
      ids = toggleSelection(selection, picked.id);
      onSelectIds(ids);
      if (!ids.includes(picked.id)) ids = [];
    } else if (!selSet.has(picked.id)) {
      ids = [picked.id];
      onSelectIds(ids);
    } else {
      ids = [...selection];
      if (selection.length > 1) collapse = picked.id;
    }
    setGesture({ ...base, kind: 'press', picked, ids, collapse });
    return true;
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>): boolean => {
    const g = gRef.current;
    if (!g) {
      // Hover (desain "Hover Outline"): target klik di bawah kursor.
      if (active && hoverable && e.pointerType !== 'touch' && e.buttons === 0) {
        const p = toPage(e.clientX, e.clientY);
        const scope = new Set(selection.flatMap((id) => index.get(id)?.parentId ?? []));
        const t = (e.target as HTMLElement).closest('.canvas-overlay-ui, [data-handle]') ? undefined : pickTarget(hitPath(geo, p), new Set(selection), scope, e.ctrlKey || e.metaKey ? 'deep' : 'scope');
        const id = t && !selection.includes(t.id) ? t.id : undefined;
        if (id !== hover) setHover(id);
      }
      return false;
    }
    // Pointer lain (mis. jari kedua) bukan milik gestur ini: diteruskan ke Canvas.
    if (g.pointer !== e.pointerId) return false;
    const p = toPage(e.clientX, e.clientY);
    const moved = g.moved || Math.hypot(e.clientX - g.c0.x, e.clientY - g.c0.y) > CLICK_SLOP;
    if (!moved) return true;
    switch (g.kind) {
      case 'press':
        if (canEdit && g.ids.includes(g.picked.id)) startDrag(g, p);
        else setGesture({ ...g, moved: true });
        break;
      case 'marquee':
        setGesture({ ...g, moved: true, p });
        break;
      case 'move': {
        const d = { x: p.x - g.p0.x, y: p.y - g.p0.y };
        previewMove(g, d);
        setGesture({ ...g, d });
        break;
      }
      case 'reorder':
        setGesture(updateReorder(g, p));
        break;
      case 'resize': {
        const to = resizeBox(g.from, g.handle, p.x - g.p0.x, p.y - g.p0.y);
        previewResize(g, to);
        setGesture({ ...g, moved: true, to });
        break;
      }
    }
    return true;
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>): boolean => {
    const g = gRef.current;
    if (!g) return false;
    if (g.pointer !== e.pointerId) return false;
    setGesture(null);
    endGhost(g);
    switch (g.kind) {
      case 'press':
        if (!g.moved && g.collapse) onSelectIds([g.collapse]);
        break;
      case 'marquee': {
        if (!g.moved) {
          // Klik tanpa gerak: latar board → pilih board (Shift: tambah/kurangi); area kosong → kosongkan.
          if (g.picked) onSelectIds(g.shift ? toggleSelection(selection, g.picked.id) : [g.picked.id]);
          else if (!g.shift) onSelectIds([]);
          break;
        }
        const hits = marqueeSelect(g.candidates, boxFrom(g.p0, g.p));
        onSelectIds([...g.base, ...hits.filter((id) => !g.base.includes(id))]);
        break;
      }
      case 'move': {
        const ops = moveOps(g.nodes, g.d.x, g.d.y);
        const boxes = new Map(g.nodes.map((n) => [n.id, { ...n.box, x: n.box.x + g.d.x, y: n.box.y + g.d.y }] as const));
        commit(ops, g.nodes.length === 1 ? `Move ${g.nodes[0]!.name}` : `Move ${g.nodes.length} layers`, g.nodes.map((n) => n.id), boxes, g.saver);
        break;
      }
      case 'reorder': {
        const t = g.target;
        if (!t || t.noop) {
          g.saver.restore();
          break;
        }
        // Asli tetap redup sampai board di-mount ulang dengan urutan baru (tanpa lompat balik); gagal → dipulihkan.
        commit([{ op: 'move', id: g.node.id, parentId: t.containerId, index: t.index }], `Reorder ${g.node.name}`, [g.node.id], new Map(), g.saver);
        break;
      }
      case 'resize': {
        if (!g.moved) {
          g.saver.restore();
          break;
        }
        const boxes = new Map<string, Box>();
        const ops: DocOp[] = [];
        for (const n of g.members) {
          const b = memberBox(g, n, g.to);
          boxes.set(n.id, b);
          const op = resizeOp(n, n.box, b);
          if (op) ops.push(op);
        }
        commit(ops, g.members.length === 1 ? `Resize ${g.members[0]!.name}` : `Resize ${g.members.length} layers`, g.members.map((n) => n.id), boxes, g.saver);
        break;
      }
    }
    return true;
  };
  const onPointerCancel = (e: ReactPointerEvent<HTMLElement>): boolean => {
    const g = gRef.current;
    if (!g || g.pointer !== e.pointerId) return false;
    cancel();
    return true;
  };
  const onPointerLeave = () => setHover(undefined);

  // ---- Menu konteks (story 6) ----
  /**
   * Klik kanan di (clientX, clientY): target dipilih seperti klik biasa (scope seleksi); node yang sudah terpilih
   * mempertahankan seleksi banyak. Mengembalikan seleksi untuk menu (kosong = tanpa menu).
   */
  const contextSelect = (clientX: number, clientY: number): string[] => {
    if (!active) return [...selection];
    cancel();
    const p = toPage(clientX, clientY);
    const scope = new Set(selection.flatMap((id) => index.get(id)?.parentId ?? []));
    const picked = pickTarget(hitPath(geo, p), new Set(selection), scope, 'scope');
    if (!picked) {
      if (selection.length) onSelectIds([]);
      return [];
    }
    if (selection.includes(picked.id)) return [...selection];
    onSelectIds([picked.id]);
    return [picked.id];
  };

  // ---- Edit teks inline (story 6, desain "Text editing" UHOWY) ----
  // Elemen teks live di shadow root dijadikan contentEditable: tata letak, wrap, dan font persis sama dengan canvas.
  // Enter/blur = commit satu op `update {content}`; Shift+Enter = baris baru; Escape = batal (isi asli dipulihkan).
  const textRef = useRef<{ id: string; name: string; board: string; mount: number; el: HTMLElement; host: HTMLElement; original: string; saver: Saver; style: HTMLStyleElement; abort: AbortController } | null>(null);
  const [textId, setTextId] = useState<string | undefined>(undefined);
  const [, setTextTick] = useState(0);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const finishText = useCallback((commitIt: boolean) => {
    const t = textRef.current;
    if (!t) return;
    textRef.current = null;
    setTextId(undefined);
    t.abort.abort();
    const after = normalizeEditedText(t.el.innerText, t.el.lastChild?.nodeName === 'BR');
    t.el.removeAttribute('contenteditable');
    t.el.removeAttribute('data-lakar-editing');
    t.saver.restore();
    t.style.remove();
    if (t.el.isConnected) t.el.ownerDocument.getSelection()?.removeAllRanges();
    // Board di-mount ulang selama edit (agen menulis): elemen sudah diganti → batal tanpa request.
    const plan = commitIt && t.el.isConnected ? textEditPlan(t.id, t.name, t.original, after) : undefined;
    const commitFn = onCommitRef.current;
    if (!plan || !commitFn) {
      t.el.textContent = t.original;
      return;
    }
    t.el.textContent = after;
    void commitFn(plan.ops, plan.label).then((ok) => {
      if (!ok && t.el.isConnected) t.el.textContent = t.original;
    });
  }, []);
  useEffect(() => {
    const t = textRef.current;
    if (t && (mounts[t.board] ?? 0) !== t.mount) finishText(false);
  }, [mounts, finishText]);
  useEffect(() => () => finishText(false), [finishText]);

  /** Mulai edit teks `id` (teks live di halaman ini); false = tidak bisa (bukan teks, belum ter-mount, tidak editable). */
  const startTextEdit = (id: string): boolean => {
    if (!canEdit || textRef.current) return false;
    const n = index.get(id);
    const board = boardOf(id);
    const host = n?.type === 'text' ? hostOf(id) : undefined;
    const el = host && liveElement(host, id);
    if (!n || !board || !host || !el) return false;
    cancel();
    setHover(undefined);
    const saver = styleSaver();
    saver.set(host, 'pointer-events', 'auto');
    for (const [p, v] of [['pointer-events', 'auto'], ['user-select', 'text'], ['-webkit-user-select', 'text'], ['outline', 'none'], ['cursor', 'text']] as const) saver.set(el, p, v);
    const style = el.ownerDocument.createElement('style');
    // Highlight teks terseleksi dan caret sesuai desain (Text Selection #3B82F655, Caret accent).
    style.textContent = '[data-lakar-editing]::selection{background:#3B82F655}[data-lakar-editing]{caret-color:var(--accent,#3B82F6)}';
    host.shadowRoot?.appendChild(style);
    el.setAttribute('data-lakar-editing', '');
    try {
      el.contentEditable = 'plaintext-only';
    } catch {
      el.contentEditable = 'true';
    }
    const abort = new AbortController();
    const signal = abort.signal;
    // Tombol tidak diteruskan ke shortcut kanvas/Viewer (Delete, panah, Ctrl+A milik teks).
    el.addEventListener(
      'keydown',
      (e) => {
        e.stopPropagation();
        if (e.isComposing) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          finishText(false);
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          finishText(true);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          el.ownerDocument.execCommand('insertText', false, '\n');
        }
      },
      { signal },
    );
    el.addEventListener('keyup', (e) => e.stopPropagation(), { signal });
    el.addEventListener('pointerdown', (e) => e.stopPropagation(), { signal });
    el.addEventListener('input', () => setTextTick((v) => v + 1), { signal });
    // Jendela kehilangan fokus (alt-tab): edit tetap berjalan; fokus kembali ke teks saat jendela aktif lagi.
    el.addEventListener('blur', () => el.ownerDocument.hasFocus() && finishText(true), { signal });
    textRef.current = { id, name: n.name, board, mount: mountsRef.current[board] ?? 0, el, host, original: el.textContent ?? '', saver, style, abort };
    setTextId(id);
    el.focus({ preventScroll: true });
    el.ownerDocument.execCommand('selectAll');
    return true;
  };
  startTextRef.current = startTextEdit;
  /** Kotak teks yang sedang diedit (ikut tumbuh saat mengetik), koordinat halaman. */
  const textBox = (): Box | undefined => {
    const t = textRef.current;
    if (!t) return undefined;
    const b = boards.find((x) => x.id === t.board);
    const boardEl = liveElement(t.host, t.board);
    if (!b || !boardEl) return index.get(t.id)?.box;
    const br = boardEl.getBoundingClientRect();
    const k = b.width > 0 && br.width > 0 ? br.width / b.width : 1;
    const r = t.el.getBoundingClientRect();
    return { x: b.x + (r.left - br.left) / k, y: b.y + (r.top - br.top) / k, w: r.width / k, h: r.height / k };
  };

  // ---- Overlay ----
  const scr = (b: Box) => ({ left: cam.x + b.x * cam.z, top: cam.y + b.y * cam.z, width: Math.max(1, b.w * cam.z), height: Math.max(1, b.h * cam.z) });
  const overlay: ReactNode[] = [];
  if (active) {
    const reorder = gesture?.kind === 'reorder' ? gesture : undefined;
    const marquee = gesture?.kind === 'marquee' && gesture.moved ? gesture : undefined;
    if (hover && hoverable && !gesture && !textId) {
      const b = boxOf(hover);
      if (b) overlay.push(<div key="hover" className="edit-hover" style={scr(b)} />);
    }
    if (marquee) {
      const rect = boxFrom(marquee.p0, marquee.p);
      for (const id of marqueeSelect(marquee.candidates, rect)) {
        const b = boxOf(id);
        if (b) overlay.push(<div key={`mq:${id}`} className="edit-hover" style={scr(b)} />);
      }
      overlay.push(<div key="marquee" className="edit-marquee" style={scr(rect)} />);
    }
    const members = selection.flatMap((id) => {
      const b = boxOf(id);
      return b ? [{ id, b }] : [];
    });
    const bound = unionBox(members.map((m) => m.b));
    const tb = textId ? textBox() : undefined;
    if (tb) {
      // Desain "Text Edit Box": garis 1.5px accent, 0.75px di luar kotak teks, tanpa handle dan badge.
      overlay.push(<div key="text-edit" className="edit-text-box" style={scr({ x: tb.x - 0.75 / cam.z, y: tb.y - 0.75 / cam.z, w: tb.w + 1.5 / cam.z, h: tb.h + 1.5 / cam.z })} />);
    } else if (reorder) {
      overlay.push(<div key="ghost" className="edit-ghost-slot" style={scr(reorder.node.box)} />);
      if (reorder.container && reorder.target) {
        const c = reorder.container.box;
        const t = reorder.target;
        const row = reorder.container.layout === 'row';
        overlay.push(<div key="target" className="edit-drop-target" style={scr({ x: c.x - 4 / cam.z, y: c.y - 4 / cam.z, w: c.w + 8 / cam.z, h: c.h + 8 / cam.z })} />);
        overlay.push(
          <div key="bar" className={`edit-drop-bar ${row ? 'row' : 'column'}`} style={scr(t.bar)}>
            <i />
            <i />
          </div>,
        );
        const bs = scr(t.bar);
        const cs = scr(c);
        overlay.push(
          <div key="hint" className="edit-drop-hint" style={row ? { left: bs.left + bs.width / 2, top: cs.top + cs.height + 10 } : { left: cs.left + cs.width / 2, top: bs.top + bs.height + 8 }}>
            <Icon name={row ? 'arrowLeftRight' : 'arrowUpDown'} size={10} />
            {reorderHint(t.position, reorder.container.name)}
          </div>,
        );
      }
    } else if (bound && members.length) {
      if (members.length > 1) for (const m of members) overlay.push(<div key={`member:${m.id}`} className="edit-member" style={scr(m.b)} />);
      overlay.push(
        <SelectionBox key="selection" style={scr(bound)} handles={canEdit && !(gesture?.kind === 'move')} label={sizeBadge(members.length, bound)} />,
      );
    }
  }

  return {
    onMounted,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
    cancel,
    overlay,
    boardBox,
    dragging: gesture !== null && gesture.moved && gesture.kind !== 'marquee',
    /** Pohon geometri halaman (aksi edit story 6, editActions.ts). */
    scene: () => geo,
    /** Berubah tiap board di-mount ulang (geometri `scene` baru): pemilik ketersediaan aksi menghitung ulang. */
    sceneKey: boards.map((b) => `${b.id}:${mounts[b.id] ?? 0}`).join(','),
    contextSelect,
    startTextEdit,
    textEditing: textId !== undefined,
  };
}

/** Kotak akhir anggota resize sebagaimana di-commit (`committedBox`): tunggal = kotak handle, multi = diskalakan. */
const memberBox = (g: { members: readonly GeoNode[]; from: Box }, n: GeoNode, to: Box): Box => committedBox(n, g.members.length === 1 ? to : scaleBox(n.box, g.from, to));

/** Kotak seleksi (desain "Selection"): garis 1.5px accent, 8 handle putih, badge ukuran di bawah. */
export function SelectionBox({ style, handles, label }: { style: CSSProperties; handles: boolean; label: string }) {
  return (
    <div className="selection" style={style}>
      {HANDLES.map((h) => (
        <i key={h} className={`handle ${h}${handles ? ' active' : ''}`} data-handle={handles ? h : undefined} style={handles ? { cursor: HANDLE_CURSOR[h] } : undefined} />
      ))}
      <span className="size-badge">{label}</span>
    </div>
  );
}

/** Klon node untuk pratinjau drag reorder (desain "Drag Preview": opacity 0.92 + bayangan), di shadow root sendiri. */
function dragGhost(el: HTMLElement, box: Box): HTMLElement {
  const wrap = el.ownerDocument.createElement('div');
  wrap.className = 'edit-drag-preview';
  const shadow = wrap.attachShadow({ mode: 'open' });
  const style = el.ownerDocument.createElement('style');
  style.textContent = ':host{all:initial;display:block}';
  const inner = el.ownerDocument.createElement('div');
  inner.style.cssText = `position:relative;width:${box.w}px;height:${box.h}px;transform-origin:0 0`;
  const clone = el.cloneNode(true) as HTMLElement;
  Object.assign(clone.style, { position: 'absolute', left: '0', top: '0', right: 'auto', bottom: 'auto', margin: '0', width: `${box.w}px`, height: `${box.h}px`, opacity: '1' });
  inner.appendChild(clone);
  shadow.replaceChildren(style, inner);
  return wrap;
}
function placeGhost(ghost: HTMLElement, box: Box, d: Point, cam: Camera) {
  ghost.style.left = `${cam.x + (box.x + d.x) * cam.z}px`;
  ghost.style.top = `${cam.y + (box.y + d.y) * cam.z}px`;
  const inner = ghost.shadowRoot?.lastElementChild as HTMLElement | null;
  if (inner) inner.style.transform = `scale(${cam.z})`;
  ghost.style.width = `${box.w * cam.z}px`;
  ghost.style.height = `${box.h * cam.z}px`;
}
