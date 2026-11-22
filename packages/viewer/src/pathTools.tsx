/// <reference lib="dom" />
// Pen tool dan edit titik path di canvas live (epic paste-vektor story 5, desain bagian 10 DHXJM/Lwpld dan
// J7AmQi/S8w37; komponen Vector Anchor JZqLc, Bezier Handle NVyza). Model titik murni di pathEdit.ts; `d` diurai saat
// edit lalu ditulis kembali sebagai `d` (AD-14). Selama gestur hanya pratinjau lokal (overlay + `d` sementara di DOM
// live); satu commit ops per gestur/aksi (AD-7), undo lewat op invers milik Viewer (AD-8).
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { pathShape, shapeFillLayerDecls } from '@lakar/render';
import type { DocOp, ResolvedDocument } from '@lakar/schema';
import type { GeoNode, Point } from './gesture';
import { Icon } from './icons';
import {
  allRefs,
  anchorCount,
  canOpenAt,
  deletePoints,
  panelDelta,
  panelXY,
  pathEditable,
  pathEditOps,
  handlesOf,
  hitSegment,
  insertPoint,
  modelFromD,
  modelSegs,
  moveAnchors,
  moveHandle,
  openAt,
  penModel,
  penNode,
  pointType,
  refKey,
  sameRef,
  serializeModel,
  setPointType,
  validRef,
  viewMapping,
  type AnchorRef,
  type PathModel,
  type PenPoint,
  type PointType,
  type Pt,
} from './pathEdit';
import { CLICK_SLOP } from './sheet';
import type { Camera } from './viewState';

/** Radius hit anchor/handle dan jarak klik titik pertama (px layar). */
const HIT = 6;
/** Toleransi klik segmen untuk sisip titik (px layar). */
const SEG_HIT = 5;

/** Data grup Point panel Design (desain J7AmQi "Group Point"); aksi selalu memakai state terkini. */
export type PathEditPanel = {
  nodeId: string;
  total: number;
  selected: number;
  /** Titik tunggal terpilih: posisi px relatif kotak node. */
  point?: { x: number; y: number } | undefined;
  /** Tipe bersama titik terpilih (undefined = campuran/tanpa seleksi). */
  type?: PointType | undefined;
  canOpen: boolean;
  setX: (v: number) => void;
  setY: (v: number) => void;
  setType: (t: PointType) => void;
  remove: () => void;
  open: () => void;
};

type StoredPath = { id: string; name: string; type: 'path'; d: string; viewBox: [number, number, number, number]; width?: unknown; height?: unknown; x?: unknown; y?: unknown; rotation?: unknown } & Record<string, unknown>;

type Raw = Record<string, unknown>;
/** Node `id` di dokumen ter-resolve (alamat komposit ikut, AD-12) beserta leluhurnya (board → parent). */
function findNode(doc: ResolvedDocument, id: string): { node: Raw; ancestors: Raw[] } | undefined {
  const walk = (n: Raw, up: Raw[]): { node: Raw; ancestors: Raw[] } | undefined => {
    if (n.id === id) return { node: n, ancestors: up };
    for (const c of (n.children as Raw[] | undefined) ?? []) {
      const hit = walk(c, [...up, n]);
      if (hit) return hit;
    }
    return undefined;
  };
  for (const p of doc.pages) for (const b of p.children as unknown as Raw[]) {
    const hit = walk(b, []);
    if (hit) return hit;
  }
  return undefined;
}
const asPath = (n: Raw | undefined): StoredPath | undefined => (n && n.type === 'path' && typeof n.d === 'string' && Array.isArray(n.viewBox) ? (n as StoredPath) : undefined);

/** Pratinjau `d` di elemen live node: semua `<path>` + mask lapisan fill; `restore` mengembalikan aslinya. */
function previewer() {
  const saved: { el: Element; attr?: string; style?: string; value: string | null }[] = [];
  // Nilai asli disimpan sekali per elemen + kunci.
  const remember = (el: Element, key: string, read: () => string | null, entry: { attr?: string; style?: string }) => {
    if (saved.some((s) => s.el === el && (s.attr ?? s.style) === key)) return;
    saved.push({ el, ...entry, value: read() });
  };
  return {
    apply(el: HTMLElement, node: StoredPath, d: string) {
      for (const p of el.querySelectorAll('path')) {
        remember(p, 'd', () => p.getAttribute('d'), { attr: 'd' });
        p.setAttribute('d', d);
      }
      const mask = shapeFillLayerDecls(pathShape({ ...node, d } as never)).find(([k]) => k === 'mask-image')?.[1];
      if (!mask) return;
      for (const c of el.children) {
        if (!(c instanceof HTMLElement) || !c.style.getPropertyValue('mask-image')) continue;
        remember(c, 'mask-image', () => c.style.getPropertyValue('mask-image'), { style: 'mask-image' });
        c.style.setProperty('mask-image', mask);
      }
    },
    restore() {
      for (const s of saved.splice(0)) {
        if (!s.el.isConnected) continue;
        if (s.attr) (s.value === null ? s.el.removeAttribute(s.attr) : s.el.setAttribute(s.attr, s.value));
        else if (s.style && s.el instanceof HTMLElement) s.el.style.setProperty(s.style, s.value ?? '');
      }
    },
  };
}
type Previewer = ReturnType<typeof previewer>;

type Pen = { boardId: string; origin: Point; points: PenPoint[]; drag?: { pointer: number; c0: Point; idx: number; moved: boolean } | undefined };
type EditGesture =
  | { kind: 'anchor'; pointer: number; c0: Point; p0: Point; base: PathModel; refs: AnchorRef[]; moved: boolean; model?: PathModel; collapse?: AnchorRef | undefined }
  | { kind: 'handle'; pointer: number; c0: Point; base: PathModel; ref: AnchorRef; side: 'in' | 'out'; moved: boolean; model?: PathModel };

export function usePathTools({
  section,
  cam,
  doc,
  boards,
  penActive,
  canEdit,
  selection,
  onCommit,
  onCommitCreate,
  onPenDone,
  nodeGeo,
  liveEl,
  onPanel,
}: {
  section: RefObject<HTMLElement | null>;
  cam: Camera;
  doc: ResolvedDocument | undefined;
  boards: readonly { id: string; x: number; y: number; width: number; height: number }[];
  /** Tool Pen aktif (live, editable). */
  penActive: boolean;
  /** Edit titik boleh (live, editable, tool Select). */
  canEdit: boolean;
  selection: readonly string[];
  onCommit: ((ops: DocOp[], description: string) => Promise<number | undefined>) | undefined;
  /** Commit yang membuat node (pen): id node baru (dipilih pemanggil), undefined bila gagal. */
  onCommitCreate: ((ops: DocOp[], description: string) => Promise<string | undefined>) | undefined;
  /** Path pen selesai/batal: tool kembali ke Select. */
  onPenDone: () => void;
  nodeGeo: (id: string) => GeoNode | undefined;
  liveEl: (id: string) => HTMLElement | undefined;
  onPanel?: ((p: PathEditPanel | undefined) => void) | undefined;
}) {
  const toPage = (clientX: number, clientY: number): Point => {
    const r = section.current?.getBoundingClientRect();
    return { x: (clientX - (r?.left ?? 0) - cam.x) / cam.z, y: (clientY - (r?.top ?? 0) - cam.y) / cam.z };
  };
  const scr = (p: Pt): Pt => ({ x: cam.x + p.x * cam.z, y: cam.y + p.y * cam.z });

  // ---- Pen ----
  const [pen, setPenState] = useState<Pen | null>(null);
  const penRef = useRef<Pen | null>(null);
  const setPen = (p: Pen | null) => {
    penRef.current = p;
    setPenState(p);
  };
  const [hoverPage, setHoverPage] = useState<Point | undefined>(undefined);
  useEffect(() => {
    if (!penActive && penRef.current) setPen(null);
  }, [penActive]);

  const nearFirst = (p: Pen, page: Point) => {
    const f = p.points[0];
    if (!f || p.points.length < 2) return false;
    const a = scr({ x: f.p.x + p.origin.x, y: f.p.y + p.origin.y });
    const b = scr(page);
    return Math.hypot(a.x - b.x, a.y - b.y) <= HIT;
  };
  const finishPen = (closed: boolean) => {
    const p = penRef.current;
    setPen(null);
    const node = p ? penNode(p.points, closed) : undefined;
    if (!p || !node || !onCommitCreate) {
      onPenDone();
      return;
    }
    void onCommitCreate([{ op: 'add', parentId: p.boardId, node, ref: 'pen' }], 'Draw path');
    onPenDone();
  };
  /** Penjalan keyboard pen dengan closure render terkini (listener capture hanya dipasang sekali per mode). */
  const penKeys = useRef({ finish: finishPen, cancel: () => {} });
  penKeys.current = {
    finish: finishPen,
    cancel: () => {
      setPen(null);
      onPenDone();
    },
  };
  const penDown = (e: ReactPointerEvent<HTMLElement>): boolean => {
    const page = toPage(e.clientX, e.clientY);
    const cur = penRef.current;
    if (cur) {
      if (nearFirst(cur, page)) {
        finishPen(true);
        return true;
      }
      const rel = { x: page.x - cur.origin.x, y: page.y - cur.origin.y };
      // Klik di atas titik terakhir (mis. dobel-klik) tidak menambah titik berimpit.
      const last = cur.points[cur.points.length - 1]!;
      const ls = scr({ x: last.p.x + cur.origin.x, y: last.p.y + cur.origin.y });
      if (Math.hypot(ls.x - (cam.x + page.x * cam.z), ls.y - (cam.y + page.y * cam.z)) <= HIT / 2) return true;
      setPen({ ...cur, points: [...cur.points, { p: rel }], drag: { pointer: e.pointerId, c0: { x: e.clientX, y: e.clientY }, idx: cur.points.length, moved: false } });
      return true;
    }
    // Titik pertama: board teratas di bawah kursor menjadi parent; di luar board diabaikan (tool tetap aktif).
    const b = [...boards].reverse().find((x) => page.x >= x.x && page.x <= x.x + x.width && page.y >= x.y && page.y <= x.y + x.height);
    if (!b) return true;
    const origin = { x: b.x, y: b.y };
    setPen({ boardId: b.id, origin, points: [{ p: { x: page.x - origin.x, y: page.y - origin.y } }], drag: { pointer: e.pointerId, c0: { x: e.clientX, y: e.clientY }, idx: 0, moved: false } });
    return true;
  };
  const penMove = (e: ReactPointerEvent<HTMLElement>): boolean => {
    const page = toPage(e.clientX, e.clientY);
    setHoverPage(page);
    const cur = penRef.current;
    const d = cur?.drag;
    if (!cur || !d || d.pointer !== e.pointerId) return true;
    const moved = d.moved || Math.hypot(e.clientX - d.c0.x, e.clientY - d.c0.y) > CLICK_SLOP;
    if (!moved) return true;
    const points = cur.points.map((q, i) => (i === d.idx ? { ...q, out: { x: page.x - cur.origin.x, y: page.y - cur.origin.y } } : q));
    setPen({ ...cur, points, drag: { ...d, moved } });
    return true;
  };
  const penUp = (e: ReactPointerEvent<HTMLElement>): boolean => {
    const cur = penRef.current;
    if (cur?.drag && cur.drag.pointer === e.pointerId) setPen({ ...cur, drag: undefined });
    return true;
  };

  // ---- Edit titik ----
  const [editing, setEditingState] = useState<{ id: string; sel: AnchorRef[] } | null>(null);
  const editRef = useRef(editing);
  const setEditing = (v: { id: string; sel: AnchorRef[] } | null) => {
    editRef.current = v;
    setEditingState(v);
  };
  const [gesture, setGestureState] = useState<EditGesture | null>(null);
  const gRef = useRef<EditGesture | null>(null);
  const setGesture = (g: EditGesture | null) => {
    gRef.current = g;
    setGestureState(g);
  };
  const [hoverSeg, setHoverSeg] = useState<Pt | undefined>(undefined);
  const preview = useRef<Previewer>(previewer());

  const node = editing && doc ? asPath(findNode(doc, editing.id)?.node) : undefined;
  const geo = editing ? nodeGeo(editing.id) : undefined;
  const model = useMemo<PathModel | undefined>(() => {
    if (!node) return undefined;
    try {
      return modelFromD(node.d);
    } catch {
      return undefined;
    }
  }, [node?.d]);
  // Hasil commit terakhir ditahan sampai dokumen membawa `d` baru (overlay tidak lompat balik); gagal → dilepas.
  const [held, setHeld] = useState<{ from: string; model: PathModel } | null>(null);
  const current = held && node && held.from === node.d ? held.model : model;
  // Dokumen membawa `d` lain (commit sendiri tiba, agen, atau undo): tahanan dilepas, sehingga undo yang
  // mengembalikan `d` lama tidak memunculkan lagi model hasil edit.
  useEffect(() => {
    if (held && node && held.from !== node.d) setHeld(null);
  }, [held, node?.d]);
  const shown = gesture?.model ?? current;
  const map = node && geo ? viewMapping(node.viewBox, geo.box) : undefined;

  const exit = useCallback(() => {
    if (gRef.current) {
      preview.current.restore();
      setGesture(null);
    }
    setHoverSeg(undefined);
    setEditing(null);
  }, []);
  // Keluar bila seleksi berganti, node hilang/bukan path lagi, atau edit tidak lagi boleh.
  useEffect(() => {
    if (!editing) return;
    if (!canEdit || selection.length !== 1 || selection[0] !== editing.id || (doc && !node)) exit();
  }, [editing, canEdit, selection, doc, node, exit]);
  // Rev baru (agen, undo): indeks seleksi di luar jangkauan dibuang.
  useEffect(() => {
    const ed = editRef.current;
    if (!ed || !model) return;
    const sel = ed.sel.filter((r) => validRef(model, r));
    if (sel.length !== ed.sel.length) setEditing({ ...ed, sel });
  }, [model]);

  const enter = (id: string): boolean => {
    const found = canEdit && doc ? findNode(doc, id) : undefined;
    if (!found || !pathEditable(found.node, found.ancestors) || !nodeGeo(id)) return false;
    setEditing({ id, sel: [] });
    return true;
  };

  /** Commit hasil edit titik; pratinjau DOM dipulihkan bila gagal. */
  const commitModel = (next: PathModel, label: string, keepPreview = false) => {
    const ed = editRef.current;
    if (!ed || !node || !geo || !onCommit) {
      preview.current.restore();
      return;
    }
    const ops = current ? pathEditOps({ ...node, id: ed.id }, current, next, geo.box, geo.absolute) : null;
    if (!ops) {
      preview.current.restore();
      return;
    }
    const update = ops[0]!.op === 'update' ? (ops[0] as Extract<DocOp, { op: 'update' }>).patch : undefined;
    if (!update) exit();
    const pv = preview.current;
    preview.current = previewer();
    if (!keepPreview) {
      const el = liveEl(ed.id);
      if (el && update) pv.apply(el, node, update.d as string);
    }
    const hold = { from: node.d, model: next };
    if (update) setHeld(hold);
    void onCommit(ops, label).then((rev) => {
      if (rev !== undefined) return;
      pv.restore();
      setHeld((h) => (h === hold ? null : h));
    });
  };
  const nameOf = () => node?.name ?? 'path';

  const editDown = (e: ReactPointerEvent<HTMLElement>): boolean => {
    const ed = editRef.current;
    if (!ed || !shown || !map) return false;
    const page = toPage(e.clientX, e.clientY);
    const at = scr(page);
    const dist = (q: Pt) => {
      const s = scr(map.toPage(q));
      return Math.hypot(s.x - at.x, s.y - at.y);
    };
    const c0 = { x: e.clientX, y: e.clientY };
    // Handle titik terpilih lebih dulu (di atas anchor).
    for (const r of ed.sel) {
      if (!validRef(shown, r)) continue;
      const h = handlesOf(shown, r);
      for (const side of ['in', 'out'] as const) {
        const q = h[side];
        if (q && dist(q) <= HIT) {
          setGesture({ kind: 'handle', pointer: e.pointerId, c0, base: shown, ref: r, side, moved: false });
          return true;
        }
      }
    }
    const anchor = allRefs(shown).find((r) => dist(shown[r.s]!.pts[r.i]!) <= HIT);
    if (anchor) {
      const has = ed.sel.some((r) => sameRef(r, anchor));
      const sel = e.shiftKey ? (has ? ed.sel.filter((r) => !sameRef(r, anchor)) : [...ed.sel, anchor]) : has ? ed.sel : [anchor];
      setEditing({ ...ed, sel });
      const refs = sel.some((r) => sameRef(r, anchor)) ? sel : [];
      setGesture({ kind: 'anchor', pointer: e.pointerId, c0, p0: page, base: shown, refs, moved: false, collapse: !e.shiftKey && has && sel.length > 1 ? anchor : undefined });
      return true;
    }
    const seg = hitSegment(shown, (q) => scr(map.toPage(q)), at, SEG_HIT);
    if (seg) {
      const r = insertPoint(shown, seg.s, seg.seg, seg.t);
      setEditing({ ...ed, sel: [r.ref] });
      commitModel(r.model, `Add point to ${nameOf()}`);
      return true;
    }
    // Di luar path: mode edit selesai, klik diteruskan ke seleksi biasa.
    exit();
    return false;
  };
  const editMove = (e: ReactPointerEvent<HTMLElement>): boolean => {
    const g = gRef.current;
    if (!g) {
      if (editRef.current && shown && map && e.buttons === 0) {
        const at = scr(toPage(e.clientX, e.clientY));
        const onAnchor = allRefs(shown).some((r) => {
          const s = scr(map.toPage(shown[r.s]!.pts[r.i]!));
          return Math.hypot(s.x - at.x, s.y - at.y) <= HIT;
        });
        const seg = onAnchor ? undefined : hitSegment(shown, (q) => scr(map.toPage(q)), at, SEG_HIT);
        const next = seg ? map.fromPage({ x: (seg.at.x - cam.x) / cam.z, y: (seg.at.y - cam.y) / cam.z }) : undefined;
        if (next || hoverSeg) setHoverSeg(next);
      }
      return false;
    }
    if (g.pointer !== e.pointerId || !map || !node) return true;
    const moved = g.moved || Math.hypot(e.clientX - g.c0.x, e.clientY - g.c0.y) > CLICK_SLOP;
    if (!moved) return true;
    const page = toPage(e.clientX, e.clientY);
    let next: PathModel;
    if (g.kind === 'anchor') {
      if (!g.refs.length) return true;
      next = moveAnchors(g.base, g.refs, (page.x - g.p0.x) / map.sx, (page.y - g.p0.y) / map.sy);
    } else next = moveHandle(g.base, g.ref, g.side, map.fromPage(page), e.altKey);
    const el = editRef.current && liveEl(editRef.current.id);
    if (el) preview.current.apply(el, node, serializeModel(next));
    setGesture({ ...g, moved: true, model: next });
    return true;
  };
  const editUp = (e: ReactPointerEvent<HTMLElement>): boolean => {
    const g = gRef.current;
    if (!g || g.pointer !== e.pointerId) return false;
    setGesture(null);
    if (!g.moved || !g.model) {
      const ed = editRef.current;
      if (g.kind === 'anchor' && g.collapse && ed) setEditing({ ...ed, sel: [g.collapse] });
      return true;
    }
    // `d` berubah di tengah gestur (agen, undo): hasil dari basis lama tidak boleh menimpanya.
    if (!current || serializeModel(g.base) !== serializeModel(current)) {
      preview.current.restore();
      return true;
    }
    commitModel(g.model, `Edit path ${nameOf()}`, true);
    return true;
  };
  const editCancel = (e: ReactPointerEvent<HTMLElement>): boolean => {
    const g = gRef.current;
    if (!g || g.pointer !== e.pointerId) return false;
    preview.current.restore();
    setGesture(null);
    return true;
  };

  // ---- Aksi (panel + keyboard) ----
  const live = useRef({ model: current, node, geo, editing, map });
  live.current = { model: current, node, geo, editing, map };
  const act = useRef({
    remove: () => {},
    open: () => {},
    setType: (_t: PointType) => {},
    setXY: (_x: number | undefined, _y: number | undefined) => {},
    nudge: (_dx: number, _dy: number) => {},
  });
  act.current = {
    remove: () => {
      const { model: m, editing: ed } = live.current;
      if (!m || !ed?.sel.length) return;
      const next = deletePoints(m, ed.sel);
      setEditing({ ...ed, sel: [] });
      commitModel(next, `Delete point from ${nameOf()}`);
    },
    open: () => {
      const { model: m, editing: ed } = live.current;
      const r = ed?.sel.length === 1 ? ed.sel[0]! : undefined;
      if (!m || !ed || !r || !canOpenAt(m, r)) return;
      setEditing({ ...ed, sel: [] });
      commitModel(openAt(m, r), `Open path ${nameOf()}`);
    },
    setType: (t) => {
      const { model: m, editing: ed } = live.current;
      if (!m || !ed?.sel.length) return;
      commitModel(setPointType(m, ed.sel, t), 'Change point type');
    },
    setXY: (x, y) => {
      const { model: m, editing: ed, map: mp } = live.current;
      const r = ed?.sel.length === 1 ? ed.sel[0]! : undefined;
      if (!m || !ed || !r || !mp || !validRef(m, r)) return;
      const vb = live.current.node?.viewBox;
      if (!vb) return;
      const { x: dx, y: dy } = panelDelta(m[r.s]!.pts[r.i]!, vb, mp, x, y);
      if (!dx && !dy) return;
      commitModel(moveAnchors(m, [r], dx, dy), `Edit path ${nameOf()}`);
    },
    nudge: (dx, dy) => {
      const { model: m, editing: ed, map: mp } = live.current;
      if (!m || !ed?.sel.length || !mp) return;
      commitModel(moveAnchors(m, ed.sel, dx / mp.sx, dy / mp.sy), `Edit path ${nameOf()}`);
    },
  };

  // Keyboard selama mode edit/pen (fase capture): shortcut Viewer/Canvas (hapus/nudge node, Escape) tidak berjalan.
  useEffect(() => {
    if (!editing && !pen) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.composedPath()[0];
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable)) return;
      if (document.querySelector('.modal-scrim, .menu-layer')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const cur = penRef.current;
      if (cur) {
        // Delete/Backspace membuang titik terakhir (titik terakhir habis = batal); panah ditahan supaya node terpilih
        // tidak terhapus atau tergeser di tengah menggambar.
        if (e.key === 'Enter') penKeys.current.finish(false);
        else if (e.key === 'Escape') penKeys.current.cancel();
        else if (e.key === 'Delete' || e.key === 'Backspace') {
          if (cur.points.length > 1) setPen({ ...cur, points: cur.points.slice(0, -1), drag: undefined });
          else penKeys.current.cancel();
        } else if (!e.key.startsWith('Arrow')) return;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (!editRef.current) return;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'Escape' || e.key === 'Enter') exit();
      else if (e.key === 'Delete' || e.key === 'Backspace') act.current.remove();
      else if (e.key === 'ArrowLeft') act.current.nudge(-step, 0);
      else if (e.key === 'ArrowRight') act.current.nudge(step, 0);
      else if (e.key === 'ArrowUp') act.current.nudge(0, -step);
      else if (e.key === 'ArrowDown') act.current.nudge(0, step);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [editing !== null, pen !== null]);

  // ---- Panel ----
  const sel = editing?.sel ?? [];
  const single = sel.length === 1 && current && validRef(current, sel[0]!) ? sel[0]! : undefined;
  const types = current ? [...new Set(sel.filter((r) => validRef(current, r)).map((r) => pointType(current, r)))] : [];
  const panel: Omit<PathEditPanel, 'setX' | 'setY' | 'setType' | 'remove' | 'open'> | undefined =
    editing && current && node && map
      ? {
          nodeId: editing.id,
          total: anchorCount(current),
          selected: sel.length,
          point: single ? panelXY(current[single.s]!.pts[single.i]!, node.viewBox, map) : undefined,
          type: types.length === 1 ? types[0] : undefined,
          canOpen: single !== undefined && canOpenAt(current, single),
        }
      : undefined;
  const panelKey = panel ? JSON.stringify(panel) : '';
  const onPanelRef = useRef(onPanel);
  onPanelRef.current = onPanel;
  useEffect(() => {
    onPanelRef.current?.(
      panel && {
        ...panel,
        setX: (v) => act.current.setXY(v, undefined),
        setY: (v) => act.current.setXY(undefined, v),
        setType: (t) => act.current.setType(t),
        remove: () => act.current.remove(),
        open: () => act.current.open(),
      },
    );
  }, [panelKey]);
  useEffect(() => () => onPanelRef.current?.(undefined), []);

  // ---- Overlay ----
  const overlay: ReactNode[] = [];
  const svg: ReactNode[] = [];
  const dOf = (m: PathModel, toScreen: (q: Pt) => Pt) =>
    modelSegs(m)
      .map((s) => {
        const a = s.args as number[];
        const pts: string[] = [];
        for (let i = 0; i + 1 < a.length; i += 2) {
          const q = toScreen({ x: a[i]!, y: a[i + 1]! });
          pts.push(`${q.x.toFixed(2)} ${q.y.toFixed(2)}`);
        }
        return s.cmd + pts.join(' ');
      })
      .join('');
  const handleLine = (key: string, a: Pt, b: Pt) => svg.push(<line key={key} className="pv-handle-line" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />);
  const anchorRect = (key: string, p: Pt, selected: boolean) => svg.push(<rect key={key} className={`pv-anchor${selected ? ' selected' : ''}`} x={p.x - 4} y={p.y - 4} width={8} height={8} />);
  const handleDot = (key: string, p: Pt) => svg.push(<circle key={key} className="pv-handle" cx={p.x} cy={p.y} r={3.5} />);

  if (pen) {
    const toS = (q: Pt) => scr({ x: q.x + pen.origin.x, y: q.y + pen.origin.y });
    const m = penModel(pen.points, false);
    if (pen.points.length > 1) {
      const d = dOf(m, toS);
      svg.push(<path key="pen-drawn" className="pv-drawn" d={d} />);
      svg.push(<path key="pen-sel" className="pv-outline" d={d} />);
    }
    const last = pen.points[pen.points.length - 1];
    const closing = hoverPage ? nearFirst(pen, hoverPage) : false;
    if (last && hoverPage && !pen.drag) {
      const a = toS(last.p);
      const target = closing ? toS(pen.points[0]!.p) : scr(hoverPage);
      if (last.out) {
        const c = toS(last.out);
        svg.push(<path key="pen-next" className="pv-preview" d={`M${a.x} ${a.y}C${c.x} ${c.y} ${target.x} ${target.y} ${target.x} ${target.y}`} />);
      } else svg.push(<line key="pen-next" className="pv-preview" x1={a.x} y1={a.y} x2={target.x} y2={target.y} />);
    }
    if (closing) {
      const f = toS(pen.points[0]!.p);
      svg.push(<circle key="pen-close" className="pv-close" cx={f.x} cy={f.y} r={7} />);
    }
    pen.points.forEach((q, i) => {
      const p = toS(q.p);
      if (q.out) {
        const o = toS(q.out);
        const inn = toS({ x: 2 * q.p.x - q.out.x, y: 2 * q.p.y - q.out.y });
        handleLine(`hl-o${i}`, p, o);
        handleLine(`hl-i${i}`, p, inn);
        handleDot(`h-o${i}`, o);
        handleDot(`h-i${i}`, inn);
      }
      anchorRect(`a${i}`, p, i === pen.points.length - 1);
    });
    if (closing && hoverPage) {
      const s = scr(hoverPage);
      overlay.push(
        <div key="pen-tip" className="pen-cursor-tip" style={{ left: s.x + 4, top: s.y + 22 }}>
          Click to close path
        </div>,
      );
    }
  }
  if (penActive) {
    overlay.push(
      <div key="pen-hint" className="path-banner canvas-overlay-ui" role="status">
        <Icon name="penTool" size={13} className="path-banner-icon" />
        <span className="path-banner-text">Click to add a point · Drag to curve · Click the first point to close</span>
        <span className="path-banner-divider" />
        <span className="path-banner-keys">Enter finish · Esc cancel</span>
      </div>,
    );
  }
  if (editing && shown && map) {
    const toS = (q: Pt) => scr(map.toPage(q));
    svg.push(<path key="edit-outline" className="pv-outline" d={dOf(shown, toS)} />);
    const selKeys = new Set(sel.map(refKey));
    for (const r of sel) {
      if (!validRef(shown, r)) continue;
      const p = toS(shown[r.s]!.pts[r.i]!);
      const h = handlesOf(shown, r);
      for (const side of ['in', 'out'] as const) {
        const q = h[side];
        if (!q) continue;
        const s = toS(q);
        handleLine(`hl-${refKey(r)}-${side}`, p, s);
        handleDot(`h-${refKey(r)}-${side}`, s);
      }
    }
    for (const r of allRefs(shown)) anchorRect(`a-${refKey(r)}`, toS(shown[r.s]!.pts[r.i]!), selKeys.has(refKey(r)));
    if (hoverSeg && !gesture) {
      const s = toS(hoverSeg);
      overlay.push(
        <div key="add-point" className="path-add-point" style={{ left: s.x - 9, top: s.y - 9 }}>
          <Icon name="plus" size={12} />
        </div>,
      );
    }
    overlay.push(
      <div key="edit-banner" className="path-banner canvas-overlay-ui" role="status">
        <Icon name="spline" size={13} className="path-banner-icon" />
        <strong className="path-banner-title">Editing path</strong>
        <span className="path-banner-text">Click a segment to add a point · Delete removes the point</span>
        <span className="path-banner-divider" />
        <span className="path-banner-keys">Esc or Enter to finish</span>
      </div>,
    );
  }
  if (svg.length)
    overlay.unshift(
      <svg key="path-overlay" className="path-overlay" aria-hidden="true">
        {svg}
      </svg>,
    );

  return {
    overlay,
    editingId: editing?.id,
    penDrawing: pen !== null,
    enter,
    exit,
    pen: { onPointerDown: penDown, onPointerMove: penMove, onPointerUp: penUp, onPointerCancel: penUp, onPointerLeave: () => setHoverPage(undefined) },
    edit: { onPointerDown: editDown, onPointerMove: editMove, onPointerUp: editUp, onPointerCancel: editCancel },
  };
}
