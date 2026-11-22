// Logika murni op komponen (AD-12): alamat slot, pencarian instance per master, node hasil detach, dan
// pemetaan ulang kunci override/bind sesudah detach. Ekspansi tetap di @lakar/schema (AD-10). Tanpa IO.
import { ID_PATTERN, LakarError, NODE_ADDRESS_PATTERN, type AnyNode, type ChildNode, type DocOp, type ExpandedChildNode, type InstanceNode, type LakarDocument as Doc } from '@lakar/schema';
import { host } from './host.js';
import { findMaster, locate, subtree, type Location } from './tree.js';

/** Alamat komposit (`I/…`, minimal dua segmen ID). */
export const isComposite = (v: unknown): v is string => typeof v === 'string' && v.includes('/') && NODE_ADDRESS_PATTERN.test(v);

/** Target slot: instance tersimpan, nama slot, frame slot di master (tata letak efektif). */
export type SlotTarget = { instance: InstanceNode; name: string; frame: AnyNode | null; loc: Location };

const SLOT_HINT = 'parent slot = "<instanceId>/<idFrameSlotMaster>" (frame yang terdaftar di component.slots master); isi instance lain tidak bisa diberi anak';

/**
 * Resolusi alamat `I/F` sebagai slot instance `I` (F = `nodeId` slot di master). Bukan slot → SCHEMA_INVALID;
 * instance tidak ada → NOT_FOUND.
 */
export function slotTarget(doc: Doc, op: string, address: string): SlotTarget {
  const segs = address.split('/');
  const [iid, fid] = segs;
  const loc = locate(doc, iid!);
  if (!loc) throw new LakarError('NOT_FOUND', `${op}: instance ${iid} tidak ada`, { hint: SLOT_HINT });
  if (loc.node.type !== 'instance' || segs.length !== 2) {
    throw new LakarError('SCHEMA_INVALID', `${op}: ${address} bukan slot instance`, { hint: SLOT_HINT });
  }
  const inst = loc.node;
  const master = findMaster(doc, inst.componentId);
  const def = master && master.type !== 'instance' ? master.component?.slots.find((s) => s.nodeId === fid) : undefined;
  if (!def) throw new LakarError('SCHEMA_INVALID', `${op}: ${fid} bukan slot master ${inst.componentId}`, { hint: SLOT_HINT });
  const frame = locate(doc, def.nodeId)?.node ?? null;
  return { instance: inst, name: def.name, frame, loc };
}

/** Daftar isi slot (dibuat bila belum ada). */
export function slotList(t: SlotTarget): ChildNode[] {
  t.instance.slots ??= {};
  return (t.instance.slots[t.name] ??= []);
}

/**
 * Slot `name` yang menjadi kosong karena node terakhirnya keluar dihapus (kembali ke isi default master), sehingga
 * invers "sisip ke slot" memulihkan keadaan semula persis; `slots` kosong ikut dihapus. Slot lain tidak disentuh.
 */
export function pruneSlots(inst: InstanceNode, name: string): void {
  if (!inst.slots || inst.slots[name]?.length !== 0) return;
  delete inst.slots[name];
  if (Object.keys(inst.slots).length === 0) delete inst.slots;
}

/** Semua node tersimpan dokumen (pre-order, termasuk isi slot). */
export function allStored(doc: Doc): AnyNode[] {
  return doc.pages.flatMap((p) => p.children.flatMap((b) => subtree(b)));
}

/** ID instance tersimpan (urut dokumen) yang merujuk salah satu `masters`, di luar `exclude`. */
export function instancesOf(doc: Doc, masters: ReadonlySet<string>, exclude: ReadonlySet<string> = new Set()): string[] {
  if (!masters.size) return [];
  return allStored(doc)
    .filter((n) => n.type === 'instance' && masters.has(n.componentId) && !exclude.has(n.id))
    .map((n) => n.id);
}

/** ID master di subtree `n`. */
export function mastersIn(n: AnyNode): Set<string> {
  return new Set(subtree(n).filter((x) => x.type !== 'board' && x.type !== 'instance' && x.component !== undefined).map((x) => x.id));
}

/**
 * Node biasa hasil detach dari ekspansi `expanded` milik `inst`: setiap node turunan master mendapat ID baru;
 * isi slot milik `inst` (akar beralamat id tersimpan polos) diganti node tersimpannya utuh. `map` = alamat → ID baru.
 */
export function detachedNode(expanded: ExpandedChildNode, inst: InstanceNode, next: () => string): { node: ChildNode; map: Map<string, string>; fresh: string[] } {
  const stored = new Map<string, ChildNode>();
  for (const list of Object.values(inst.slots ?? {})) for (const c of list) stored.set(c.id, c);
  const map = new Map<string, string>();
  const fresh: string[] = [];
  const build = (n: ExpandedChildNode): ChildNode => {
    const keep = n.id !== inst.id && ID_PATTERN.test(n.id) ? stored.get(n.id) : undefined;
    if (keep) return host.structuredClone(keep);
    const id = next();
    map.set(n.id, id);
    fresh.push(id);
    const out = { ...host.structuredClone({ ...n, children: undefined }), id } as Record<string, unknown>;
    delete out.children;
    if (n.type === 'frame') out.children = n.children.map(build);
    return out as unknown as ChildNode;
  };
  return { node: build(expanded), map, fresh };
}

/**
 * Petakan kunci override instance lain yang melewati `instId` (`…/instId/x`) dan `binds`/`slots` master yang
 * menunjuk `instId` ke ID hasil detach (`map`). Mutasi di tempat; mengembalikan op `update` pemulih (nilai lama).
 */
export function remapAfterDetach(doc: Doc, instId: string, map: ReadonlyMap<string, string>): DocOp[] {
  const restore: DocOp[] = [];
  const root = map.get(instId);
  for (const n of allStored(doc)) {
    if (n.type === 'instance' && n.id !== instId && n.overrides) {
      const old = n.overrides;
      let changed = false;
      const next: typeof old = {};
      for (const [key, patch] of Object.entries(old)) {
        const segs = key.split('/');
        const at = segs.indexOf(instId);
        const mapped = at >= 0 ? map.get(segs.slice(at).join('/')) : undefined;
        if (mapped) {
          next[[...segs.slice(0, at), mapped].join('/')] = patch;
          changed = true;
        } else next[key] = patch;
      }
      if (changed) {
        restore.push({ op: 'update', id: n.id, patch: { overrides: host.structuredClone(old) } });
        n.overrides = next;
      }
    }
    if (root && n.type !== 'board' && n.type !== 'instance' && n.component) {
      const c = n.component;
      const hits = c.props.some((p) => p.binds.some((b) => b.nodeId === instId)) || c.slots.some((s) => s.nodeId === instId);
      if (hits) {
        restore.push({ op: 'update', id: n.id, patch: { component: host.structuredClone(c) } });
        n.component = {
          props: c.props.map((p) => ({ ...p, binds: p.binds.map((b) => (b.nodeId === instId ? { ...b, nodeId: root } : b)) })) as typeof c.props,
          slots: c.slots.map((s) => (s.nodeId === instId ? { ...s, nodeId: root } : s)),
        };
      }
    }
  }
  return restore;
}

/** Petakan `binds`/`slots` master salinan `duplicate` (ID lama → ID salinan). */
export function remapComponentIds(n: AnyNode, map: ReadonlyMap<string, string>): void {
  if (n.type === 'board' || n.type === 'instance' || !n.component) return;
  const c = n.component;
  const m = (id: string) => map.get(id) ?? id;
  n.component = {
    props: c.props.map((p) => ({ ...p, binds: p.binds.map((b) => ({ ...b, nodeId: m(b.nodeId) })) })) as typeof c.props,
    slots: c.slots.map((s) => ({ ...s, nodeId: m(s.nodeId) })),
  };
}
