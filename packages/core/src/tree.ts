// Navigasi pohon dokumen (halaman → board → node, termasuk isi slot instance, AD-12). Tanpa IO.
import type { AnyNode, BoardNode, ChildNode, FrameNode, InstanceNode, LakarDocument as Doc, Page } from '@lakar/schema';

export type Container = BoardNode | FrameNode;

/** Node berada di isi slot `name` milik `instance`. `address` = `<instanceId>/<frameSlotMaster>` (undefined bila slot yatim). */
export type SlotPlace = { instance: InstanceNode; name: string; address: string | undefined };

/** Lokasi node: wadah langsung (`siblings` = array anak halaman/board/frame atau isi slot), indeks, leluhur. */
export type Location = {
  node: AnyNode;
  page: Page;
  /**
   * `null` = node adalah board (anak halaman), atau isi slot yatim. Untuk isi slot: frame slot di master
   * (wadah tata letak efektif), bukan wadah penyimpanan; pakai `parentAddress` untuk alamat wadah.
   */
  parent: Container | null;
  siblings: AnyNode[];
  index: number;
  /** Leluhur tersimpan dari board sampai wadah langsung (instance pemilik slot ikut), tanpa node itu sendiri. */
  ancestors: AnyNode[];
  /** Ada bila node berada di isi slot instance. */
  slot?: SlotPlace;
};

export const isContainer = (n: AnyNode): n is Container => n.type === 'board' || n.type === 'frame';

/** Daftar isi slot instance (urut kunci). */
const slotLists = (n: AnyNode): [string, ChildNode[]][] => (n.type === 'instance' ? Object.entries(n.slots ?? {}) : []);

/** Master (node tersimpan ber-`component`) dengan id `id`, atau undefined. Master tidak pernah berada di isi slot. */
export function findMaster(doc: Doc, id: string): ChildNode | undefined {
  const loc = locate(doc, id, false);
  return loc && loc.node.type !== 'board' && loc.node.type !== 'instance' && loc.node.component !== undefined ? (loc.node as ChildNode) : undefined;
}

/** Frame slot `name` di master instance, beserta alamat slotnya. */
function slotPlace(doc: Doc, instance: InstanceNode, name: string): { place: SlotPlace; frame: FrameNode | null } {
  const master = findMaster(doc, instance.componentId);
  const def = master && 'component' in master ? master.component?.slots.find((s) => s.name === name) : undefined;
  const frameLoc = def ? locate(doc, def.nodeId, false) : undefined;
  const frame = frameLoc && frameLoc.node.type === 'frame' ? frameLoc.node : null;
  return { place: { instance, name, address: def ? `${instance.id}/${def.nodeId}` : undefined }, frame };
}

/** Cari node tersimpan `id` (termasuk isi slot). `resolveSlot` false = tanpa mencari frame slot di master (internal). */
export function locate(doc: Doc, id: string, resolveSlot = true): Location | undefined {
  const walk = (page: Page, list: AnyNode[], parent: Container | null, ancestors: AnyNode[]): Location | undefined => {
    for (let i = 0; i < list.length; i++) {
      const n = list[i]!;
      if (n.id === id) return { node: n, page, parent, siblings: list, index: i, ancestors };
      if (n.type === 'frame' || n.type === 'board') {
        const hit = walk(page, n.children, n, [...ancestors, n]);
        if (hit) return hit;
      }
      for (const [name, content] of slotLists(n)) {
        const hit = walk(page, content, null, [...ancestors, n]);
        if (hit) {
          // Isi slot langsung milik instance ini (slot yang lebih dalam sudah ditandai di tingkatnya sendiri).
          if (hit.siblings === content) hit.slot = { instance: n as InstanceNode, name, address: undefined };
          return hit;
        }
      }
    }
    return undefined;
  };
  for (const page of doc.pages) {
    const hit = walk(page, page.children, null, []);
    if (hit) {
      if (hit.slot && resolveSlot) {
        const { place, frame } = slotPlace(doc, hit.slot.instance, hit.slot.name);
        hit.slot = place;
        hit.parent = frame;
      }
      return hit;
    }
  }
  return undefined;
}

/** Alamat wadah lokasi untuk op `move`/`insert`: ID board/frame, alamat slot, atau `null` (board di halaman). */
export function parentAddress(loc: Location): string | null {
  if (loc.slot) return loc.slot.address ?? null;
  return loc.parent ? loc.parent.id : null;
}

/** Peta ID → {node, path nama dari board ke node} untuk seluruh dokumen, termasuk isi slot. */
export function indexNodes(doc: Doc): Map<string, { node: AnyNode; path: string[] }> {
  const out = new Map<string, { node: AnyNode; path: string[] }>();
  const walk = (n: AnyNode, prefix: string[]) => {
    const path = [...prefix, n.name];
    out.set(n.id, { node: n, path });
    if ('children' in n) for (const c of n.children) walk(c, path);
    for (const [, content] of slotLists(n)) for (const c of content) walk(c, path);
  };
  for (const p of doc.pages) for (const b of p.children) walk(b, []);
  return out;
}

/** Semua node dalam subtree (pre-order, termasuk akar dan isi slot instance). */
export function subtree(n: AnyNode): AnyNode[] {
  const out: AnyNode[] = [n];
  if ('children' in n) for (const c of n.children) out.push(...subtree(c));
  for (const [, content] of slotLists(n)) for (const c of content) out.push(...subtree(c));
  return out;
}
