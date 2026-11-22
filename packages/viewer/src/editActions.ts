// Aksi edit canvas (editor-canvas story 6, desain bagian 05 "Context menu" dan "Multi-select"): group, ungroup,
// duplikat, hapus, urutan z, align, distribute, nudge, pilih semua, dan edit teks. Tiap aksi menjadi satu plan berisi
// daftar `DocOp` untuk satu permintaan route ops (AD-7); invers dari respons route masuk tumpukan undo (AD-8).
// Murni: tanpa DOM dan tanpa IO. `scene` = pohon geometri board halaman aktif (gesture.ts, koordinat halaman).
import type { DocOp } from '@lakar/schema';
import { indexGeo, moveOps, unionBox, type Box, type GeoNode } from './gesture.js';

/** Bulat ke integer tanpa -0. */
const rnd = (v: number): number => Math.round(v) + 0;

export type AlignAction = 'align-left' | 'align-center' | 'align-right' | 'align-top' | 'align-middle' | 'align-bottom';
export type DistributeAction = 'distribute-h' | 'distribute-v';
export type EditAction = 'group' | 'ungroup' | 'duplicate' | 'delete' | 'forward' | 'backward' | AlignAction | DistributeAction;

export const ALIGN_ACTIONS: readonly AlignAction[] = ['align-left', 'align-center', 'align-right', 'align-top', 'align-middle', 'align-bottom'];
export const DISTRIBUTE_ACTIONS: readonly DistributeAction[] = ['distribute-h', 'distribute-v'];
export const EDIT_ACTIONS: readonly EditAction[] = ['group', 'ungroup', 'duplicate', 'delete', 'forward', 'backward', ...ALIGN_ACTIONS, ...DISTRIBUTE_ACTIONS];

/**
 * Plan satu aksi. `select`: seleksi sesudah sukses — `ids` langsung, atau `refs` (nama `ref` op add/duplicate yang
 * dipetakan lewat `refs` respons route). Tanpa `select` seleksi dipertahankan.
 */
export type EditPlan = { ops: DocOp[]; label: string; select?: { ids?: string[]; refs?: string[] } };
/** Hasil perencanaan: plan, pesan untuk pengguna (aksi tidak berlaku), atau undefined (tidak ada yang dikerjakan). */
export type PlanResult = EditPlan | { error: string } | undefined;

/** Batas `description` route ops. */
const LABEL_MAX = 200;
const label = (s: string): string => (s.length > LABEL_MAX ? `${s.slice(0, LABEL_MAX - 1)}…` : s);
const named = (verb: string, nodes: readonly GeoNode[]): string => label(nodes.length === 1 ? `${verb} ${nodes[0]!.name}` : `${verb} ${nodes.length} layers`);

/** Offset duplikat node absolut (satuan dokumen) dan jarak duplikat board di kanan aslinya. */
export const DUPLICATE_OFFSET = 10;
export const BOARD_GAP = 40;

/** Anggota seleksi yang ada di scene tanpa leluhur yang juga terpilih (urutan seleksi dipertahankan). */
export function topMost(index: ReadonlyMap<string, GeoNode>, ids: readonly string[]): GeoNode[] {
  const set = new Set(ids);
  const seen = new Set<string>();
  return ids.flatMap((id) => {
    const n = index.get(id);
    if (!n || seen.has(id)) return [];
    seen.add(id);
    for (let p = n.parentId; p; p = index.get(p)?.parentId) if (set.has(p)) return [];
    return [n];
  });
}

/** Saudara node (urutan dokumen): anak parent, atau board halaman untuk board. */
function siblingsOf(scene: readonly GeoNode[], index: ReadonlyMap<string, GeoNode>, n: GeoNode): readonly GeoNode[] {
  return n.parentId ? (index.get(n.parentId)?.children ?? []) : scene;
}

/** Asal koordinat x/y node absolut di parentnya (koordinat halaman) = kotak terukur − x/y tersimpan. */
const originOf = (n: GeoNode) => ({ x: n.box.x - n.x, y: n.box.y - n.y });

function planGroup(scene: readonly GeoNode[], index: ReadonlyMap<string, GeoNode>, ids: readonly string[]): PlanResult {
  const members = topMost(index, ids);
  if (!members.length) return undefined;
  if (members.some((m) => m.type === 'board')) return { error: "Boards can't be grouped" };
  const parentId = members[0]!.parentId;
  if (!parentId || members.some((m) => m.parentId !== parentId)) return { error: 'Select layers in the same parent to group' };
  const siblings = siblingsOf(scene, index, members[0]!);
  const at = (m: GeoNode) => siblings.findIndex((s) => s.id === m.id);
  const ordered = [...members].sort((a, b) => at(a) - at(b));
  const u = unionBox(ordered.map((m) => m.box))!;
  const flow = ordered.some((m) => !m.absolute);
  const anchor = flow ? at(ordered[0]!) : at(ordered[ordered.length - 1]!);
  const memberIds = new Set(ordered.map((m) => m.id));
  const finalIndex = siblings.filter((s, i) => i < anchor && !memberIds.has(s.id)).length;
  const frame: Record<string, unknown> = { type: 'frame', name: 'Group', layout: 'none', width: Math.max(1, rnd(u.w)), height: Math.max(1, rnd(u.h)) };
  // Asal frame: anggota absolut pertama memberi asal koordinat parent, jadi x/y anak = x/y lama − x/y frame (persis).
  let fx = rnd(u.x);
  let fy = rnd(u.y);
  if (!flow) {
    const o = originOf(ordered[0]!);
    fx = rnd(u.x - o.x);
    fy = rnd(u.y - o.y);
    Object.assign(frame, { position: 'absolute', x: fx, y: fy });
  }
  const ops: DocOp[] = [{ op: 'add', parentId, node: frame, ref: 'group' }];
  for (const m of ordered) {
    ops.push({ op: 'move', id: m.id, parentId: '@group' });
    const x = flow ? rnd(m.box.x - u.x) : rnd(m.box.x - originOf(ordered[0]!).x) - fx;
    const y = flow ? rnd(m.box.y - u.y) : rnd(m.box.y - originOf(ordered[0]!).y) - fy;
    ops.push({ op: 'update', id: m.id, patch: { position: 'absolute', x, y } });
  }
  ops.push({ op: 'move', id: '@group', parentId, index: finalIndex });
  return { ops, label: named('Group', ordered), select: { refs: ['group'] } };
}

function planUngroup(scene: readonly GeoNode[], index: ReadonlyMap<string, GeoNode>, ids: readonly string[]): PlanResult {
  // Frame kosong tidak di-ungroup (bukan hapus diam-diam berlabel "Ungroup").
  const frames = topMost(index, ids).filter((n) => n.type === 'frame' && n.parentId && n.children.length > 0);
  if (!frames.length) return undefined;
  // Per parent dari indeks terbesar: indeks frame lain di parent yang sama tidak bergeser.
  const at = (n: GeoNode) => siblingsOf(scene, index, n).findIndex((s) => s.id === n.id);
  const ordered = [...frames].sort((a, b) => (a.parentId === b.parentId ? at(b) - at(a) : a.parentId! < b.parentId! ? -1 : 1));
  const ops: DocOp[] = [];
  const lifted: string[] = [];
  for (const f of ordered) {
    const parent = index.get(f.parentId!)!;
    const i = at(f);
    const parentFlow = parent.layout === 'row' || parent.layout === 'column';
    const o = f.absolute ? originOf(f) : { x: parent.box.x, y: parent.box.y };
    f.children.forEach((c, k) => {
      ops.push({ op: 'move', id: c.id, parentId: parent.id, index: i + k });
      const staysFlow = !c.absolute && !f.absolute && parentFlow;
      if (!staysFlow) ops.push({ op: 'update', id: c.id, patch: { position: 'absolute', x: rnd(c.box.x - o.x), y: rnd(c.box.y - o.y) } });
      lifted.push(c.id);
    });
    ops.push({ op: 'remove', id: f.id });
  }
  return { ops, label: named('Ungroup', frames), select: { ids: lifted } };
}

function planDuplicate(index: ReadonlyMap<string, GeoNode>, ids: readonly string[]): PlanResult {
  const members = topMost(index, ids);
  if (!members.length) return undefined;
  const refs: string[] = [];
  const ops: DocOp[] = members.map((m, k) => {
    const ref = `dup${k}`;
    refs.push(ref);
    if (m.type === 'board') return { op: 'duplicate', id: m.id, patch: { x: rnd(m.x + m.box.w + BOARD_GAP) }, ref };
    if (m.absolute) return { op: 'duplicate', id: m.id, patch: { x: rnd(m.x + DUPLICATE_OFFSET), y: rnd(m.y + DUPLICATE_OFFSET) }, ref };
    return { op: 'duplicate', id: m.id, ref };
  });
  return { ops, label: named('Duplicate', members), select: { refs } };
}

function planDelete(index: ReadonlyMap<string, GeoNode>, ids: readonly string[]): PlanResult {
  const members = topMost(index, ids);
  if (!members.length) return undefined;
  return { ops: members.map((m) => ({ op: 'remove', id: m.id })), label: named('Delete', members), select: { ids: [] } };
}

/** Satu langkah z: anggota terpilih bertukar dengan saudara tak terpilih di depan (forward) / belakang (backward). */
function planZOrder(scene: readonly GeoNode[], index: ReadonlyMap<string, GeoNode>, ids: readonly string[], dir: 'forward' | 'backward'): PlanResult {
  const members = topMost(index, ids);
  if (!members.length) return undefined;
  const sel = new Set(members.map((m) => m.id));
  const parents = [...new Set(members.map((m) => m.parentId ?? ''))];
  const ops: DocOp[] = [];
  for (const p of parents) {
    const order = (p ? (index.get(p)?.children ?? []) : scene).map((n) => n.id);
    const parentId = p || null;
    if (dir === 'forward') {
      for (let i = order.length - 2; i >= 0; i--) {
        if (sel.has(order[i]!) && !sel.has(order[i + 1]!)) {
          [order[i], order[i + 1]] = [order[i + 1]!, order[i]!];
          ops.push({ op: 'move', id: order[i + 1]!, parentId, index: i + 1 });
        }
      }
    } else {
      for (let i = 1; i < order.length; i++) {
        if (sel.has(order[i]!) && !sel.has(order[i - 1]!)) {
          [order[i], order[i - 1]] = [order[i - 1]!, order[i]!];
          ops.push({ op: 'move', id: order[i - 1]!, parentId, index: i - 1 });
        }
      }
    }
  }
  if (!ops.length) return undefined;
  return { ops, label: named(dir === 'forward' ? 'Bring forward' : 'Send backward', members) };
}

/** Kotak acuan align: bounding box seleksi (≥2), atau parent untuk satu node non-board. */
function alignReference(index: ReadonlyMap<string, GeoNode>, members: readonly GeoNode[]): Box | undefined {
  if (members.length >= 2) return unionBox(members.map((m) => m.box));
  const only = members[0];
  return only?.parentId ? index.get(only.parentId)?.box : undefined;
}

/** Op pindah node absolut/board ke kotak target (hanya sumbu yang berubah). */
function shiftOp(n: GeoNode, dx: number, dy: number): DocOp | undefined {
  const patch: Record<string, number> = {};
  const x = rnd(n.x + dx);
  const y = rnd(n.y + dy);
  if (x !== n.x) patch.x = x;
  if (y !== n.y) patch.y = y;
  return Object.keys(patch).length ? { op: 'update', id: n.id, patch } : undefined;
}

function planAlign(index: ReadonlyMap<string, GeoNode>, ids: readonly string[], kind: AlignAction): PlanResult {
  const members = topMost(index, ids);
  const ref = alignReference(index, members);
  if (!ref) return undefined;
  const ops: DocOp[] = [];
  for (const n of members) {
    if (!n.absolute) continue;
    const b = n.box;
    let dx = 0;
    let dy = 0;
    if (kind === 'align-left') dx = ref.x - b.x;
    else if (kind === 'align-center') dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
    else if (kind === 'align-right') dx = ref.x + ref.w - (b.x + b.w);
    else if (kind === 'align-top') dy = ref.y - b.y;
    else if (kind === 'align-middle') dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
    else dy = ref.y + ref.h - (b.y + b.h);
    const op = shiftOp(n, dx, dy);
    if (op) ops.push(op);
  }
  if (!ops.length) return undefined;
  const title = { 'align-left': 'Align left', 'align-center': 'Align center', 'align-right': 'Align right', 'align-top': 'Align top', 'align-middle': 'Align middle', 'align-bottom': 'Align bottom' }[kind];
  return { ops, label: named(title, members) };
}

function planDistribute(index: ReadonlyMap<string, GeoNode>, ids: readonly string[], kind: DistributeAction): PlanResult {
  const nodes = topMost(index, ids).filter((n) => n.absolute);
  if (nodes.length < 3) return undefined;
  const h = kind === 'distribute-h';
  const start = (b: Box) => (h ? b.x : b.y);
  const size = (b: Box) => (h ? b.w : b.h);
  const sorted = [...nodes].sort((a, b) => start(a.box) - start(b.box) || a.id.localeCompare(b.id));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const span = start(last.box) + size(last.box) - start(first.box);
  const gap = (span - sorted.reduce((s, n) => s + size(n.box), 0)) / (sorted.length - 1);
  const ops: DocOp[] = [];
  let cursor = start(first.box) + size(first.box) + gap;
  for (const n of sorted.slice(1, -1)) {
    const d = cursor - start(n.box);
    const op = shiftOp(n, h ? d : 0, h ? 0 : d);
    if (op) ops.push(op);
    cursor += size(n.box) + gap;
  }
  if (!ops.length) return undefined;
  return { ops, label: named(h ? 'Distribute horizontally' : 'Distribute vertically', sorted) };
}

/** Rencana aksi `kind` untuk seleksi `ids` di `scene`. */
export function planAction(kind: EditAction, scene: readonly GeoNode[], ids: readonly string[]): PlanResult {
  const index = indexGeo(scene);
  switch (kind) {
    case 'group':
      return planGroup(scene, index, ids);
    case 'ungroup':
      return planUngroup(scene, index, ids);
    case 'duplicate':
      return planDuplicate(index, ids);
    case 'delete':
      return planDelete(index, ids);
    case 'forward':
    case 'backward':
      return planZOrder(scene, index, ids, kind);
    case 'distribute-h':
    case 'distribute-v':
      return planDistribute(index, ids, kind);
    default:
      return planAlign(index, ids, kind);
  }
}

/**
 * Ketersediaan aksi untuk menu/panel: struktural (aksi berlaku untuk seleksi ini), bukan "akan mengubah sesuatu" —
 * kecuali urutan z yang nonaktif bila seleksi sudah paling depan/belakang.
 */
export function actionState(scene: readonly GeoNode[], ids: readonly string[]): Record<EditAction, boolean> {
  const index = indexGeo(scene);
  const members = topMost(index, ids);
  const any = members.length > 0;
  const absolute = members.filter((m) => m.absolute);
  const parent = members[0]?.parentId;
  const canAlign = absolute.length > 0 && (members.length >= 2 || (members.length === 1 && parent !== undefined));
  const out = {} as Record<EditAction, boolean>;
  for (const a of ALIGN_ACTIONS) out[a] = canAlign;
  for (const a of DISTRIBUTE_ACTIONS) out[a] = absolute.length >= 3;
  out.group = any && members.every((m) => m.type !== 'board' && m.parentId !== undefined && m.parentId === parent);
  out.ungroup = members.some((m) => m.type === 'frame' && m.parentId !== undefined && m.children.length > 0);
  out.duplicate = any;
  out.delete = any;
  out.forward = planZOrder(scene, index, ids, 'forward') !== undefined;
  out.backward = planZOrder(scene, index, ids, 'backward') !== undefined;
  return out;
}

/** Node yang bisa di-nudge: x/y tersimpan dibaca pemanggil dari dokumen terkini (bukan geometri yang bisa basi). */
export type NudgeNode = { id: string; name: string; absolute: boolean; x: number; y: number };
/** Nudge panah: Δ untuk node absolut/board; node flow diabaikan. */
export function nudgeOps(nodes: readonly NudgeNode[], dx: number, dy: number): EditPlan | undefined {
  const movable = nodes.filter((n) => n.absolute);
  const ops = moveOps(movable.map((n) => ({ id: n.id, type: '', name: n.name, box: { x: 0, y: 0, w: 0, h: 0 }, parentId: undefined, absolute: true, x: n.x, y: n.y, layout: undefined, children: [] })), dx, dy);
  if (!ops.length) return undefined;
  return { ops, label: label(movable.length === 1 ? `Nudge ${movable[0]!.name}` : `Nudge ${movable.length} layers`) };
}

/**
 * Node nudge dari seleksi: anggota teratas di scene, x/y dari dokumen tersimpan (`stored`, bukan geometri yang basi
 * sampai board di-mount ulang); node absolut tanpa x/y tersimpan = 0; node yang tidak ada di dokumen → geometri.
 */
export function nudgeNodes(scene: readonly GeoNode[], ids: readonly string[], stored: (id: string) => Record<string, unknown> | undefined): NudgeNode[] {
  return topMost(indexGeo(scene), ids).map((g) => {
    const s = stored(g.id);
    const num = (v: unknown, fallback: number) => (typeof v === 'number' ? v : s ? 0 : fallback);
    return { id: g.id, name: g.name, absolute: g.absolute, x: num(s?.x, g.x), y: num(s?.y, g.y) };
  });
}

/** Seleksi sesudah plan sukses: `ids` langsung, `refs` dipetakan lewat `refs` respons; undefined = tetap. */
export function selectionAfter(plan: EditPlan, refs: Readonly<Record<string, string>>): string[] | undefined {
  const s = plan.select;
  if (s?.ids) return [...s.ids];
  if (s?.refs) return s.refs.flatMap((r) => (refs[r] ? [refs[r]!] : []));
  return undefined;
}

/** Bentuk event keyboard yang dibaca `shortcutAction`. */
export type ShortcutKey = { key: string; code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean };
const ALIGN_CODES: Record<string, EditAction> = { KeyA: 'align-left', KeyH: 'align-center', KeyD: 'align-right', KeyW: 'align-top', KeyV: 'align-middle', KeyS: 'align-bottom' };
const DISTRIBUTE_CODES: Record<string, EditAction> = { KeyH: 'distribute-h', KeyV: 'distribute-v' };
const ARROWS: Record<string, readonly [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/**
 * Shortcut aksi: Delete/Backspace, Ctrl/⌘+G (Shift = ungroup), Ctrl/⌘+D, Ctrl/⌘+] / [, Alt+A/H/D/W/V/S align,
 * Alt+Shift+H/V distribute (lewat `code`, aman untuk Alt di macOS), Ctrl/⌘+A pilih semua, panah (Shift = 10px) nudge.
 */
export function shortcutAction(e: ShortcutKey): { action: EditAction } | { selectAll: true } | { nudge: readonly [number, number] } | undefined {
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (!mod && !e.altKey && !e.shiftKey && (e.key === 'Delete' || e.key === 'Backspace')) return { action: 'delete' };
  if (mod && !e.altKey) {
    if (k === 'g') return { action: e.shiftKey ? 'ungroup' : 'group' };
    if (e.shiftKey) return undefined;
    if (k === 'd') return { action: 'duplicate' };
    if (e.code === 'BracketRight') return { action: 'forward' };
    if (e.code === 'BracketLeft') return { action: 'backward' };
    if (k === 'a') return { selectAll: true };
    return undefined;
  }
  if (e.altKey && !mod) {
    const a = (e.shiftKey ? DISTRIBUTE_CODES : ALIGN_CODES)[e.code];
    return a ? { action: a } : undefined;
  }
  const arrow = ARROWS[e.key];
  if (arrow && !mod && !e.altKey) {
    const step = e.shiftKey ? 10 : 1;
    return { nudge: [arrow[0] * step, arrow[1] * step] };
  }
  return undefined;
}

/** Ctrl+A: kosong → semua board; board primer → anaknya (atau board itu bila kosong); node → semua saudaranya. */
export function selectAllIds(scene: readonly GeoNode[], ids: readonly string[]): string[] {
  const index = indexGeo(scene);
  const primary = [...ids].reverse().map((id) => index.get(id)).find((n) => n !== undefined);
  if (!primary) return scene.map((b) => b.id);
  if (primary.type === 'board') return primary.children.length ? primary.children.map((c) => c.id) : [primary.id];
  return siblingsOf(scene, index, primary).map((n) => n.id);
}

/** Commit edit teks inline: isi sama atau kosong → tanpa op (batal). */
export function textEditPlan(id: string, name: string, before: string, after: string): EditPlan | undefined {
  if (after === before || after.trim() === '') return undefined;
  return { ops: [{ op: 'update', id, patch: { content: after } }], label: label(`Edit text ${name}`) };
}

/** Normalisasi `innerText` elemen contentEditable: CRLF → LF, satu `\n` penutup sisa `<br>` dibuang. */
export function normalizeEditedText(raw: string, endsWithBreak: boolean): string {
  const t = raw.replace(/\r\n?/g, '\n');
  return endsWithBreak && t.endsWith('\n') ? t.slice(0, -1) : t;
}
