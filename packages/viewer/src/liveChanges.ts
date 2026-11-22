// Perubahan agen yang tampil live (epic agen-di-canvas story 3, desain bagian 06 "Agent on canvas"). Murni, tanpa
// DOM dan tanpa IO: rebase gestur lokal ke geometri sesudah board di-mount ulang (AD-7: commit tetap di atas rev
// terbaru), pelepasan pratinjau tertahan per rev, pembersihan seleksi dari node yang dihapus, target undo yang
// hilang (AD-8) dan teks toast "Undo skipped", serta turunan Activity (baris commit agen, seleksi dibaca agen).
import type { DocOp } from '@lakar/schema';
import { callEndMs, harnessLabel, type ActivityCall, type SessionView } from './activity.js';
import { resizeBox, unionBox, type Box, type GeoNode, type Handle, type Point } from './gesture.js';

type GeoIndex = ReadonlyMap<string, GeoNode>;

/**
 * Node gestur dicari ulang per id di geometri baru (x/y tersimpan dan kotak terbaru); node yang hilang atau tidak
 * lolos `keep` dibuang. Urutan asal dipertahankan.
 */
export function rebaseNodes(nodes: readonly GeoNode[], index: GeoIndex, keep: (n: GeoNode) => boolean = () => true): GeoNode[] {
  return nodes.flatMap((n) => {
    const m = index.get(n.id);
    return m && keep(m) ? [m] : [];
  });
}

/**
 * Resize sesudah mount ulang: anggota dicari ulang, `from` = gabungan kotak baru, `to` = `from` + Δ pointer (tanpa Δ
 * = belum bergerak). Semua anggota hilang → undefined (gestur batal).
 */
export function rebaseResize(members: readonly GeoNode[], index: GeoIndex, handle: Handle, delta: Point | undefined): { members: GeoNode[]; from: Box; to: Box } | undefined {
  const next = rebaseNodes(members, index);
  const from = unionBox(next.map((n) => n.box));
  if (!from) return undefined;
  return { members: next, from, to: delta ? resizeBox(from, handle, delta.x, delta.y) : from };
}

/** Node reorder sesudah mount ulang: harus masih ada, masih anak flow, dan punya parent. */
export function rebaseReorderNode(node: GeoNode, index: GeoIndex): GeoNode | undefined {
  const n = index.get(node.id);
  return n && !n.absolute && n.parentId ? n : undefined;
}

/** Jejak pratinjau tertahan: hitungan mount tiap board tersentuh saat ditahan/diterapkan ulang, dan rev commit. */
export type HeldTrack = { mounts: Readonly<Record<string, number>>; rev?: number | undefined };

/**
 * Nasib pratinjau tertahan sesudah commit:
 * - `release`: setiap board tersentuh sudah di-mount dari dokumen ber-rev ≥ rev commit, atau board sudah hilang;
 * - `reapply`: ada board yang di-mount ulang dari dokumen lebih lama (mis. commit agen yang tiba duluan) → DOM
 *   pratinjau sudah diganti, terapkan ulang;
 * - `keep`: belum ada yang berubah.
 */
export function heldStatus(h: HeldTrack, mounts: Readonly<Record<string, number>>, mountRevs: Readonly<Record<string, number>>, boardIds: ReadonlySet<string>): 'keep' | 'reapply' | 'release' {
  let reapply = false;
  let settled = true;
  for (const [b, n] of Object.entries(h.mounts)) {
    if (!boardIds.has(b)) continue;
    if (h.rev !== undefined && (mountRevs[b] ?? -1) >= h.rev) continue;
    settled = false;
    if ((mounts[b] ?? 0) !== n) reapply = true;
  }
  return settled ? 'release' : reapply ? 'reapply' : 'keep';
}

/**
 * Seleksi sesudah dokumen terkini berganti: id yang ada di dokumen sebelumnya tetapi hilang di dokumen baru dibuang
 * (dihapus agen atau jendela lain). Id yang belum pernah ada (node baru yang dipilih sebelum dokumennya termuat)
 * dibiarkan. Tidak berubah → array yang sama.
 */
export function pruneSelection(selection: readonly string[], prevHas: (id: string) => boolean, nextHas: (id: string) => boolean): readonly string[] {
  const next = selection.filter((id) => nextHas(id) || !prevHas(id));
  return next.length === selection.length ? selection : next;
}

/**
 * Id yang dirujuk op (`id`, `parentId`; rujukan `@ref` dilewati) tetapi tidak ada di dokumen terkini, urut pertama.
 * Id yang dibuat entri itu sendiri (`node.id` pada add/insert/replace, mis. invers ungroup) bukan target yang hilang.
 */
export function missingTargets(ops: readonly DocOp[], has: (id: string) => boolean): string[] {
  const out: string[] = [];
  const own = new Set<string>();
  for (const o of ops) {
    const node = (o as { node?: unknown }).node;
    if (node && typeof node === 'object') {
      const walk = (n: { id?: unknown; children?: unknown }) => {
        if (typeof n.id === 'string') own.add(n.id);
        if (Array.isArray(n.children)) for (const c of n.children) if (c && typeof c === 'object') walk(c as typeof n);
      };
      walk(node as { id?: unknown; children?: unknown });
    }
  }
  for (const o of ops) {
    for (const k of ['id', 'parentId'] as const) {
      const v = (o as Record<string, unknown>)[k];
      if (typeof v === 'string' && !v.startsWith('@') && !own.has(v) && !has(v) && !out.includes(v)) out.push(v);
    }
  }
  return out;
}

/** Teks toast "Undo skipped" (desain Toast r69qO). */
export function undoSkippedText(dir: 'undo' | 'redo', agent: string | undefined, name: string | undefined): { title: string; description: string } {
  const verb = dir === 'undo' ? 'undone' : 'redone';
  const title = dir === 'undo' ? 'Undo skipped' : 'Redo skipped';
  const tail = `after your edit, so this step can’t be ${verb}.`;
  if (name && agent) return { title, description: `${agent} deleted “${name}” ${tail}` };
  if (name) return { title, description: `“${name}” was deleted ${tail}` };
  return { title, description: `This step can’t be ${verb} because a newer change replaced what it targets.` };
}

const committed = (c: ActivityCall) => c.tool === 'execute' && (c.status === 'done' || c.status === 'warning') && typeof c.rev === 'number';

/**
 * Nama harness dengan execute sukses terbaru pada dokumen ini (pelaku terdekat untuk toast undo). `since` (ms): hanya
 * execute yang selesai sesudah edit pengguna dicatat; tanpa itu (mis. node dihapus jendela lain) → undefined.
 */
export function lastAgentLabel(views: readonly SessionView[], since = -Infinity): string | undefined {
  let best: { at: number; label: string } | undefined;
  for (const v of views) {
    const c = v.calls.find(committed);
    if (!c) continue;
    const at = callEndMs(c);
    if (at < since) continue;
    if (!best || at > best.at) best = { at, label: harnessLabel(v.session.client) };
  }
  return best?.label;
}

/** Kegagalan permintaan undo/redo: `transient` = offline/5xx (entri dikembalikan); `message` = pesan error daemon. */
export type StepFailure = { transient: boolean; message?: string | undefined };

/**
 * Toast "Undo skipped" untuk undo/redo yang ditolak daemon (AD-8): setiap penolakan permanen (4xx) membuang entri dan
 * memakai toast ini; gagal sementara → undefined (toast lama, entri kembali). Nama = target op yang hilang dari dokumen
 * terkini, atau (dokumen belum termuat ulang) target yang disebut pesan error; agen dari `lastAgentLabel`.
 */
export function undoSkippedFor(
  dir: 'undo' | 'redo',
  ops: readonly DocOp[],
  failure: StepFailure,
  has: (id: string) => boolean,
  nameOf: (id: string) => string | undefined,
  agent: string | undefined,
): { title: string; description: string } | undefined {
  if (failure.transient) return undefined;
  const missing = missingTargets(ops, has);
  const msg = failure.message ?? '';
  const mentioned = missingTargets(ops, (id) => !new RegExp(`(^|[^A-Za-z0-9])${id}([^A-Za-z0-9]|$)`).test(msg));
  const name = (missing.length ? missing : mentioned).map(nameOf).find((n) => n !== undefined);
  return undoSkippedText(dir, name ? agent : undefined, name);
}

/**
 * Agent Commit Row (desain b53rG): call terbaru sebuah sesi berupa execute sukses ber-rev. Meta `rev N · K nodes
 * changed`; `locate` = node utama (dibuat lebih dulu, lalu node berubah), atau board pertama.
 */
export function commitRow(call: ActivityCall | undefined): { meta: string; locate: string | undefined } | undefined {
  // Execute dengan temuan check (status warning) tetap Tool Call Row biasa supaya peringatannya terlihat.
  if (!call || !committed(call) || call.status !== 'done') return undefined;
  const n = call.nodes;
  const meta = n !== undefined ? `rev ${call.rev} · ${n} node${n === 1 ? '' : 's'} changed` : `rev ${call.rev}`;
  // Node utama: dibuat lebih dulu, lalu node berubah yang bukan board, lalu board pertama.
  const boards = new Set(call.boards ?? []);
  const bounds = Object.keys(call.bounds ?? {});
  const locate = call.created?.find((id) => bounds.includes(id) && !boards.has(id)) ?? bounds.find((id) => !boards.has(id)) ?? call.boards?.[0] ?? bounds[0];
  return { meta, locate };
}

/** `get_selection` selesai terbaru sesi ini (baris konteks "… read your selection"). */
export function selectionRead(view: SessionView): ActivityCall | undefined {
  return view.calls.find((c) => c.tool === 'get_selection' && c.status === 'done');
}

/** Label badge canvas (desain RGOYW): `Selection shared with agents · {primer}` (+N untuk sisanya). */
export function shareBadgeText(primary: string | undefined, count: number): string {
  if (!primary) return 'Selection shared with agents';
  return `Selection shared with agents · ${primary}${count > 1 ? ` +${count - 1}` : ''}`;
}
