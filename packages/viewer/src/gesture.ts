// Matematika gestur canvas editor (editor-canvas story 4, desain bagian 05): hit-test pohon kotak, target klik per
// scope seleksi, marquee, resize 8 handle, skala multi-seleksi, indeks reorder anak flow, dan op hasil gestur.
// Murni: tanpa DOM dan tanpa IO. Semua kotak dalam koordinat halaman (board.x + posisi di board), satuan dokumen.
import type { DocOp } from '@lakar/schema';

/** Bulat ke integer tanpa -0. */
const rnd = (v: number): number => Math.round(v) + 0;

export type Box = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };
export type FlowLayout = 'row' | 'column';

/** Node terukur. `layout` = tata letak anaknya (board = kolom, frame = `layout ?? 'none'`; daun tanpa layout). */
export type GeoNode = {
  id: string;
  type: string;
  name: string;
  box: Box;
  parentId: string | undefined;
  /** Board atau node absolute (`position:'absolute'` / anak frame `none`): digeser lewat x/y. */
  absolute: boolean;
  /** x/y tersimpan (board: posisi di halaman; anak absolute: relatif parent; flow: 0). */
  x: number;
  y: number;
  layout: FlowLayout | 'grid' | 'none' | undefined;
  children: GeoNode[];
  /** Master atau instance tersimpan (epic komponen story 4); isi instance = alamat komposit (id memuat `/`). */
  component?: 'master' | 'instance' | undefined;
};

/** Node yang isinya bukan node tersimpan: instance (akar) dan isi instance (alamat komposit, AD-12). */
export const isLockedContainer = (n: GeoNode): boolean => n.component === 'instance' || n.id.includes('/');

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export const containsPoint = (b: Box, p: Point): boolean => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
export const intersects = (a: Box, b: Box): boolean => a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
export const containsBox = (outer: Box, inner: Box): boolean => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

/** Kotak dari dua titik (marquee). */
export const boxFrom = (a: Point, b: Point): Box => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });

export function unionBox(boxes: readonly Box[]): Box | undefined {
  if (!boxes.length) return undefined;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.w));
  const btm = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: btm - y };
}

/** id → node untuk seluruh pohon. */
export function indexGeo(roots: readonly GeoNode[]): Map<string, GeoNode> {
  const out = new Map<string, GeoNode>();
  const walk = (n: GeoNode) => {
    out.set(n.id, n);
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

/**
 * Jalur hit dari board ke node terdalam yang memuat `p`. Di tiap tingkat menang anak terakhir yang memuat titik
 * (dilukis paling atas). Board meng-clip: anak di luar kotak board tidak kena.
 */
export function hitPath(boards: readonly GeoNode[], p: Point): GeoNode[] {
  const top = (list: readonly GeoNode[]) => {
    for (let i = list.length - 1; i >= 0; i--) if (containsPoint(list[i]!.box, p)) return list[i];
    return undefined;
  };
  const path: GeoNode[] = [];
  let cur = top(boards);
  while (cur) {
    path.push(cur);
    cur = top(cur.children);
  }
  return path;
}

export type PickMode = 'scope' | 'deep' | 'enter';

/**
 * Target klik dari jalur hit. `deep` (Ctrl/⌘) = terdalam. `enter` (dobel-klik) = anak node terpilih di jalur.
 * `scope` = node terdalam yang sudah terpilih atau saudara node terpilih (parent sama); tanpa itu anak langsung board.
 */
export function pickTarget(path: readonly GeoNode[], selected: ReadonlySet<string>, scopeParents: ReadonlySet<string>, mode: PickMode): GeoNode | undefined {
  if (!path.length) return undefined;
  if (mode === 'deep') return path[path.length - 1];
  if (mode === 'enter') {
    for (let i = path.length - 1; i >= 0; i--) if (selected.has(path[i]!.id)) return path[i + 1] ?? path[i];
  }
  for (let i = path.length - 1; i >= 1; i--) {
    const n = path[i]!;
    if (selected.has(n.id) || (n.parentId !== undefined && scopeParents.has(n.parentId))) return n;
  }
  return path[1] ?? path[0];
}

/** Shift-klik: tambah bila belum ada, buang bila sudah. */
export const toggleSelection = (sel: readonly string[], id: string): string[] => (sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]);

/**
 * Node yang dipilih marquee di antara `candidates`: kandidat yang memuat penuh marquee dan punya anak → turun ke
 * anaknya; selain itu kandidat yang beririsan dipilih (urutan dokumen).
 */
export function marqueeSelect(candidates: readonly GeoNode[], rect: Box): string[] {
  const out: string[] = [];
  for (const c of candidates) {
    if (!intersects(c.box, rect)) continue;
    if (c.children.length && !isLockedContainer(c) && containsBox(c.box, rect)) out.push(...marqueeSelect(c.children, rect));
    else out.push(c.id);
  }
  return out;
}

/** Kotak sesudah handle `h` ditarik (dx, dy); sisi seberang tetap, ukuran minimal `min`. */
export function resizeBox(start: Box, h: Handle, dx: number, dy: number, min = 1): Box {
  let { x, y, w, h: hh } = start;
  if (h.includes('e')) w = Math.max(min, start.w + dx);
  if (h.includes('s')) hh = Math.max(min, start.h + dy);
  if (h.includes('w')) {
    w = Math.max(min, start.w - dx);
    x = start.x + start.w - w;
  }
  if (h.includes('n')) {
    hh = Math.max(min, start.h - dy);
    y = start.y + start.h - hh;
  }
  return { x, y, w, h: hh };
}

/** Petakan kotak anggota dari bounding box `from` ke `to` (resize multi-seleksi). */
export function scaleBox(b: Box, from: Box, to: Box): Box {
  const sx = from.w > 0 ? to.w / from.w : 1;
  const sy = from.h > 0 ? to.h / from.h : 1;
  return { x: to.x + (b.x - from.x) * sx, y: to.y + (b.y - from.y) * sy, w: Math.max(1, b.w * sx), h: Math.max(1, b.h * sy) };
}

export const isFlowContainer = (n: GeoNode): boolean => n.layout === 'row' || n.layout === 'column';
/** Anak flow (ikut tata letak parent row/column), bisa diurutkan ulang. */
export const isFlowChild = (n: GeoNode): boolean => !n.absolute;

/**
 * Kontainer flow tujuan drop: kontainer flow terdalam di jalur hit yang bukan node itu sendiri atau turunannya.
 * Jalur berhenti di node yang di-drag (yang di bawahnya turunannya).
 */
export function dropContainer(path: readonly GeoNode[], draggedId: string): GeoNode | undefined {
  let found: GeoNode | undefined;
  for (const n of path) {
    if (n.id === draggedId) break;
    if (isFlowContainer(n) && !isLockedContainer(n)) found = n;
  }
  return found;
}

export type ReorderTarget = {
  containerId: string;
  /** Indeks akhir di antara anak kontainer sesudah node dilepas (arti `index` op `move`). */
  index: number;
  /** Posisi flow 1-based (hint "Move to position N"). */
  position: number;
  /** Bar drop (koordinat halaman). */
  bar: Box;
  /** Drop tidak mengubah apa pun (parent dan indeks sama). */
  noop: boolean;
};

/** Ketebalan bar drop (desain "Drop Indicator": 3px). */
const BAR = 3;

/** Indeks drop di `container` untuk node `dragged` dengan kursor `p` (sumbu = arah layout kontainer). */
export function reorderTarget(container: GeoNode, dragged: GeoNode, p: Point): ReorderTarget {
  const row = container.layout === 'row';
  const start = (b: Box) => (row ? b.x : b.y);
  const end = (b: Box) => (row ? b.x + b.w : b.y + b.h);
  const at = row ? p.x : p.y;
  const siblings = container.children.filter((c) => c.id !== dragged.id);
  const flow = siblings.filter(isFlowChild);
  const fi = flow.findIndex((c) => (start(c.box) + end(c.box)) / 2 > at);
  let index: number;
  let pos: number;
  if (fi >= 0) {
    const f = flow[fi]!;
    index = siblings.indexOf(f);
    const prev = flow[fi - 1];
    pos = prev ? (end(prev.box) + start(f.box)) / 2 : start(f.box) - BAR;
  } else {
    const last = flow[flow.length - 1];
    index = last ? siblings.indexOf(last) + 1 : siblings.length;
    pos = last ? end(last.box) + BAR : start(container.box) + BAR;
  }
  const c = container.box;
  const bar = row ? { x: pos - BAR / 2, y: c.y, w: BAR, h: c.h } : { x: c.x, y: pos - BAR / 2, w: c.w, h: BAR };
  const position = (fi >= 0 ? fi : flow.length) + 1;
  // Tanpa perubahan bila node tetap di kontainer yang sama pada urutan flow yang sama (anak absolute tidak dihitung).
  const orig = container.children.filter(isFlowChild).findIndex((x) => x.id === dragged.id);
  return { containerId: container.id, index, position, bar, noop: orig >= 0 && orig + 1 === position };
}

/** Op geser: node absolute/board dengan Δ (satuan dokumen), dibulatkan; node yang tidak berubah dilewati. */
export function moveOps(nodes: readonly GeoNode[], dx: number, dy: number): DocOp[] {
  const ops: DocOp[] = [];
  for (const n of nodes) {
    if (!n.absolute) continue;
    const x = rnd(n.x + dx);
    const y = rnd(n.y + dy);
    if (x !== n.x || y !== n.y) ops.push({ op: 'update', id: n.id, patch: { x, y } });
  }
  return ops;
}

/**
 * Op resize satu node dari kotak `from` ke `to`: `width/height` angka (icon: `size` = sisi terbesar); x/y ikut hanya
 * untuk node absolute/board. Kunci yang nilai bulatnya tidak berubah tidak dikirim (width `hug` tetap hug).
 */
export function resizeOp(n: GeoNode, from: Box, to: Box): DocOp | undefined {
  const patch: Record<string, number> = {};
  const w = Math.max(1, rnd(to.w));
  const h = Math.max(1, rnd(to.h));
  if (n.type === 'icon') {
    const size = Math.max(w, h);
    if (size !== rnd(Math.max(from.w, from.h))) patch.size = size;
  } else {
    if (w !== rnd(from.w)) patch.width = w;
    if (h !== rnd(from.h)) patch.height = h;
  }
  if (n.absolute) {
    const x = rnd(n.x + to.x - from.x);
    const y = rnd(n.y + to.y - from.y);
    if (x !== n.x) patch.x = x;
    if (y !== n.y) patch.y = y;
  }
  return Object.keys(patch).length ? { op: 'update', id: n.id, patch } : undefined;
}

/**
 * Kotak yang benar-benar dihasilkan resize: node flow tetap di posisinya (hanya width/height di-commit), icon
 * persegi (`size` = sisi terbesar). Dipakai pratinjau dan kotak tertahan agar sama dengan hasil commit.
 */
export function committedBox(n: GeoNode, b: Box): Box {
  const out = n.absolute ? { ...b } : { ...b, x: n.box.x, y: n.box.y };
  if (n.type === 'icon') out.w = out.h = Math.max(out.w, out.h);
  return out;
}

/** Teks hint reorder (desain "Drop Hint"). */
export const reorderHint = (position: number, parentName: string): string => `Move to position ${position} in ${parentName}`;

/** Teks badge ukuran: tunggal `W × H`, multi `N selected · W × H`. */
export function sizeBadge(count: number, b: Box): string {
  const size = `${rnd(b.w)} × ${rnd(b.h)}`;
  return count > 1 ? `${count} selected · ${size}` : size;
}
