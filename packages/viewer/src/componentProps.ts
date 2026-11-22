// Props dan slot komponen di panel Design (epic komponen story 5, desain 08 Components: C2xbUQ/yjpLy grup Component,
// xTIr4/rmfSe grup Instance, Prop Row zbNXr). Murni: model baris panel dan `DocOp` dibangun dari dokumen tersimpan
// terbaru. Definisi master ditulis utuh lewat `setComponent`, nilai prop instance lewat `update(I, {props})`, dan isi
// slot lewat `add`/`move` ke alamat slot `I/<frameSlot>` (story 3, AD-12); invers dari core (AD-8).
import { Align, Blend, COMPONENT_NAME_PATTERN, Justify, Layout, VISIBLE_BIND, type ComponentDef, type ComponentProp, type DocOp, type LakarDocument } from '@lakar/schema';
import { instanceRootOf, isComposite, type ComponentInfo } from './componentModel.js';

type Raw = Record<string, unknown> & { id: string; name: string; type: string; children?: Raw[] };
export type PropType = ComponentProp['type'];
type Bind = { nodeId: string; prop: string };

/** Node tersimpan berdasarkan ID, termasuk isi slot instance. */
export function findStored(doc: LakarDocument, id: string): Raw | undefined {
  let hit: Raw | undefined;
  const walk = (n: Raw) => {
    if (hit) return;
    if (n.id === id) {
      hit = n;
      return;
    }
    for (const c of n.children ?? []) walk(c);
    if (n.type === 'instance') for (const list of Object.values((n.slots ?? {}) as Record<string, Raw[]>)) for (const c of list ?? []) walk(c);
  };
  for (const p of doc.pages) for (const b of p.children as unknown as Raw[]) walk(b);
  return hit;
}

/** Definisi komponen master (salinan dangkal aman: dipakai sebagai dasar definisi baru). */
export function masterDef(doc: LakarDocument, masterId: string): ComponentDef | undefined {
  const n = findStored(doc, masterId);
  return n && n.type !== 'instance' && n.component ? (n.component as ComponentDef) : undefined;
}

export type LayerOption = { id: string; name: string; type: string; depth: number; root: boolean };

/** Master + turunan tersimpannya (rantai children, tanpa isi instance bersarang), urut dokumen. */
export function masterLayers(doc: LakarDocument, masterId: string): LayerOption[] {
  const root = findStored(doc, masterId);
  if (!root) return [];
  const out: LayerOption[] = [];
  const walk = (n: Raw, depth: number) => {
    out.push({ id: n.id, name: n.name, type: n.type, depth, root: depth === 0 });
    for (const c of n.children ?? []) walk(c, depth + 1);
  };
  walk(root, 0);
  return out;
}

/** Nilai enum skema per properti (bind enum: options bawaan diganti nilai ini). */
const TEXT_ALIGN = ['left', 'center', 'right', 'justify'] as const;
export function enumValuesOf(nodeType: string, prop: string): readonly string[] | undefined {
  if (prop === 'align') return nodeType === 'text' ? TEXT_ALIGN : Align.options;
  if (prop === 'justify') return Justify.options;
  if (prop === 'layout') return Layout.options;
  if (prop === 'blend') return Blend.options;
  return undefined;
}

/**
 * Properti yang bisa diikat per tipe prop dan tipe node. Nilai prop ditulis apa adanya, jadi enum hanya ke properti
 * bernilai string. Boolean `visible` tidak ditawarkan untuk akar master (instance akan hilang dari canvas/Layers).
 */
export function bindProps(propType: PropType, nodeType: string, root: boolean): string[] {
  // Nama ikon tak dikenal katalog ditolak route ops (ICON_UNKNOWN + saran) saat commit, bukan dirender rusak.
  if (propType === 'text') return nodeType === 'text' ? ['content'] : nodeType === 'icon' ? ['icon'] : [];
  if (propType === 'boolean') return root ? [] : [VISIBLE_BIND];
  const out: string[] = [];
  if (nodeType === 'text') out.push('content', 'color', 'align', 'family');
  else if (nodeType === 'frame') out.push('layout', 'align', 'justify');
  else if (nodeType === 'icon') out.push('icon', 'color');
  if (nodeType !== 'instance') out.push('blend');
  return out;
}

const BIND_LABEL: Record<string, string> = { content: 'Text', visible: 'Visibility', color: 'Color', align: 'Align', family: 'Font', layout: 'Layout', justify: 'Justify', blend: 'Blend', icon: 'Icon' };
export const bindLabel = (prop: string): string => BIND_LABEL[prop] ?? prop;

/** Nama camelCase dari nama layer ("Brand title" → "brandTitle"); tidak sah → fallback. */
export function camelName(source: string, fallback: string): string {
  // Awalan non-huruf dibuang sebelum camelCase ("2 Column" → "column", bukan "olumn").
  const words = source
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .replace(/^[^A-Za-z]+/, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const s = words
    .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('')
    .slice(0, 32);
  return COMPONENT_NAME_PATTERN.test(s) ? s : fallback;
}

const namesOf = (def: ComponentDef) => [...def.props.map((p) => p.name), ...def.slots.map((s) => s.name)];

/** Nama unik di gabungan props + slots: `base`, `base2`, `base3`, … */
export function uniqueName(def: ComponentDef, base: string): string {
  const taken = new Set(namesOf(def));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const n = `${base.slice(0, 32 - String(i).length)}${i}`;
    if (!taken.has(n)) return n;
  }
}

/** Pesan inline nama prop/slot (undefined = sah). `current` = nama lama yang sedang diganti. */
export function nameProblem(def: ComponentDef, name: string, current?: string): string | undefined {
  if (!COMPONENT_NAME_PATTERN.test(name)) return 'Use a camelCase name like showBadge (letters and digits, up to 32)';
  if (name !== current && namesOf(def).includes(name)) return `“${name}” is already used in this component`;
  return undefined;
}

const setDef = (masterId: string, def: ComponentDef): DocOp => ({ op: 'setComponent', id: masterId, component: def });
const instancesOf = (info: ComponentInfo, masterId: string) => (info.masterById.get(masterId)?.instances ?? []).map((id) => info.instances.get(id)!).filter(Boolean);
const propsOf = (inst: Record<string, unknown>) => (inst.props ?? {}) as Record<string, string | boolean>;
const propsPatch = (props: Record<string, string | boolean>) => (Object.keys(props).length ? props : null);

/** Options bawaan prop enum baru (diganti nilai enum skema saat di-bind ke align/justify/layout/blend). */
export const DEFAULT_ENUM_OPTIONS: readonly string[] = ['default', 'alternate'];

/** Tambah prop (menu Add property). Text: bind otomatis ke teks master pertama yang belum terikat `content`. */
export function addPropOps(doc: LakarDocument, masterId: string, type: PropType): { ops: DocOp[]; name: string } | undefined {
  const def = masterDef(doc, masterId);
  if (!def) return undefined;
  let prop: ComponentProp;
  if (type === 'text') {
    const bound = new Set(def.props.flatMap((p) => p.binds.filter((b) => b.prop === 'content').map((b) => b.nodeId)));
    const layer = masterLayers(doc, masterId).find((l) => l.type === 'text' && !bound.has(l.id));
    const node = layer ? findStored(doc, layer.id) : undefined;
    const name = uniqueName(def, camelName(layer?.name ?? '', 'text'));
    prop = { name, type: 'text', default: typeof node?.content === 'string' ? node.content : '', binds: layer ? [{ nodeId: layer.id, prop: 'content' }] : [] };
  } else if (type === 'boolean') {
    prop = { name: uniqueName(def, 'show'), type: 'boolean', default: true, binds: [] };
  } else {
    prop = { name: uniqueName(def, 'variant'), type: 'enum', options: [...DEFAULT_ENUM_OPTIONS], default: DEFAULT_ENUM_OPTIONS[0]!, binds: [] };
  }
  return { ops: [setDef(masterId, { props: [...def.props, prop], slots: def.slots })], name: prop.name };
}

/** Options enum dari teks dipisah koma: trim, tanpa kosong/duplikat. */
export function parseOptions(text: string): string[] {
  return [...new Set(text.split(',').map((s) => s.trim()).filter(Boolean))];
}

export type PropChange = { name?: string; default?: string | boolean; options?: readonly string[]; binds?: readonly Bind[] };

/**
 * Ubah prop `name`: satu `setComponent` + `update(I, {props})` yang memindah nilai ke nama baru (rename) atau
 * membuang nilai enum yang hilang dari options. Options enum kosong ditolak; default yang hilang dari options → option
 * pertama. Ganti bind enum ke properti ber-enum skema saat options tidak cocok → options = nilai enum skema, default =
 * nilai node itu (atau option pertama); options yang diketik harus cocok dengan setiap properti ber-enum terikat.
 */
export function updatePropOps(doc: LakarDocument, info: ComponentInfo, masterId: string, name: string, change: PropChange): DocOp[] | { error: string } {
  const def = masterDef(doc, masterId);
  const i = def ? def.props.findIndex((p) => p.name === name) : -1;
  if (!def || i < 0) return { error: 'This property no longer exists' };
  const old = def.props[i]!;
  const next = { ...old } as Record<string, unknown> & ComponentProp;
  if (change.name !== undefined && change.name !== old.name) {
    const problem = nameProblem(def, change.name, old.name);
    if (problem) return { error: problem };
    next.name = change.name;
  }
  if (change.binds) next.binds = change.binds.map((b) => ({ nodeId: b.nodeId, prop: b.prop }));
  if (next.type === 'enum') {
    let options = change.options ? [...change.options] : [...next.options];
    let dflt = change.default !== undefined ? String(change.default) : next.default;
    // Bind ke properti ber-enum skema (align/justify/layout/blend): options harus nilai sah properti itu.
    const enums = next.binds.flatMap((b) => {
      const node = findStored(doc, b.nodeId);
      const values = node ? enumValuesOf(node.type, b.prop) : undefined;
      return values ? [{ values, prop: b.prop, current: node?.[b.prop] }] : [];
    });
    const fits = (vals: readonly string[]) => options.every((o) => vals.includes(o));
    const first = enums[0];
    if (first && change.binds && !change.options && !fits(first.values)) {
      options = [...first.values];
      dflt = typeof first.current === 'string' && first.values.includes(first.current) ? first.current : first.values[0]!;
    }
    const misfit = enums.find((e) => !fits(e.values));
    if (misfit) return { error: `Options bound to ${bindLabel(misfit.prop)} must be among: ${misfit.values.join(', ')}` };
    if (!options.length) return { error: 'An enum needs at least one option' };
    next.options = options;
    next.default = options.includes(dflt) ? dflt : options[0]!;
  } else if (change.default !== undefined) {
    if (next.type === 'boolean' && typeof change.default === 'boolean') next.default = change.default;
    if (next.type === 'text' && typeof change.default === 'string') next.default = change.default;
  }
  if (JSON.stringify(next) === JSON.stringify(old)) return [];
  const props = def.props.map((p, j) => (j === i ? (next as ComponentProp) : p));
  const ops: DocOp[] = [setDef(masterId, { props, slots: def.slots })];
  // Instance: nilai dipindah ke nama baru (nilai yatim bernama sama dibuang), dan nilai enum yang tidak lagi ada di
  // options dibuang (kembali ke default) dalam rev yang sama.
  for (const inst of instancesOf(info, masterId)) {
    const cur = propsOf(inst);
    if (!Object.hasOwn(cur, old.name)) continue;
    const { [old.name]: value, [next.name]: _orphan, ...rest } = cur;
    const keep = next.type !== 'enum' || (typeof value === 'string' && next.options.includes(value));
    const moved = keep ? { ...rest, [next.name]: value! } : rest;
    if (!sameRecord(moved, cur)) ops.push({ op: 'update', id: inst.id, patch: { props: propsPatch(moved) } });
  }
  return ops;
}
const sameRecord = (a: Record<string, unknown>, b: Record<string, unknown>) => Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => Object.hasOwn(b, k) && b[k] === v);

/** Hapus prop: `setComponent` tanpa prop itu + buang nilainya di setiap instance. */
export function removePropOps(doc: LakarDocument, info: ComponentInfo, masterId: string, name: string): DocOp[] {
  const def = masterDef(doc, masterId);
  if (!def || !def.props.some((p) => p.name === name)) return [];
  const ops: DocOp[] = [setDef(masterId, { props: def.props.filter((p) => p.name !== name), slots: def.slots })];
  for (const inst of instancesOf(info, masterId)) {
    const cur = propsOf(inst);
    if (!Object.hasOwn(cur, name)) continue;
    const { [name]: _, ...rest } = cur;
    ops.push({ op: 'update', id: inst.id, patch: { props: propsPatch(rest) } });
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Baris panel master (Prop Row zbNXr)
// ---------------------------------------------------------------------------

export type MasterPropRow = { name: string; type: PropType; prop: ComponentProp; defaultText: string; bindText: string };
export type MasterSlotRow = { name: string; nodeId: string; frameName: string; countText: string };

const layersText = (n: number) => `${n} layer${n === 1 ? '' : 's'}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Teks default baris prop: text “…”, boolean true/false, enum `<default> · <jumlah options>`. */
export function defaultText(p: ComponentProp): string {
  if (p.type === 'text') return `“${p.default}”`;
  if (p.type === 'boolean') return String(p.default);
  return `${p.default} · ${p.options.length}`;
}

/** Target bind: akar master → label properti ("Fill"); layer lain → nama layer (+ properti bila bukan text/visibility). */
export function bindText(binds: readonly Bind[], masterId: string, nameOf: (id: string) => string | undefined): string {
  if (!binds.length) return 'Not bound';
  if (binds.length > 1) return `${binds.length} bindings`;
  const b = binds[0]!;
  if (b.nodeId === masterId) return cap(bindLabel(b.prop));
  const name = nameOf(b.nodeId) ?? 'Missing layer';
  return b.prop === 'content' || b.prop === VISIBLE_BIND ? name : `${name} · ${bindLabel(b.prop)}`;
}

export type MasterModel = { masterId: string; props: MasterPropRow[]; slots: MasterSlotRow[]; layers: LayerOption[]; frames: LayerOption[] };

/** Model grup Component master (baris props/slots, layer untuk bind, frame kandidat slot). */
export function masterModel(doc: LakarDocument, masterId: string): MasterModel | undefined {
  const def = masterDef(doc, masterId);
  if (!def) return undefined;
  const layers = masterLayers(doc, masterId);
  const nameOf = (id: string) => layers.find((l) => l.id === id)?.name;
  return {
    masterId,
    props: def.props.map((p) => ({ name: p.name, type: p.type, prop: p, defaultText: defaultText(p), bindText: bindText(p.binds, masterId, nameOf) })),
    slots: def.slots.map((s) => {
      const frame = findStored(doc, s.nodeId);
      return { name: s.name, nodeId: s.nodeId, frameName: frame?.name ?? 'Missing frame', countText: layersText(frame?.children?.length ?? 0) };
    }),
    layers,
    frames: slotFrameCandidates(doc, masterId),
  };
}

// ---------------------------------------------------------------------------
// Slot pada master
// ---------------------------------------------------------------------------

/** Frame turunan master (bukan akar, rantai children tersimpan) yang belum menjadi slot. */
export function slotFrameCandidates(doc: LakarDocument, masterId: string): LayerOption[] {
  const def = masterDef(doc, masterId);
  if (!def) return [];
  const used = new Set(def.slots.map((s) => s.nodeId));
  return masterLayers(doc, masterId).filter((l) => !l.root && l.type === 'frame' && !used.has(l.id));
}

/** Master leluhur node tersimpan (rantai parent tersimpan, berhenti di isi slot/komposit); bukan node itu sendiri. */
export function masterOfNode(info: ComponentInfo, id: string): string | undefined {
  if (isComposite(id)) return undefined;
  for (let p = info.stored.get(id)?.parentId; p && !isComposite(p); p = info.stored.get(p)?.parentId) {
    if (info.kinds.get(p) === 'master') return p;
    if (info.kinds.get(p) === 'instance') return undefined;
  }
  return undefined;
}

/** Info grup "Slot" untuk frame di dalam master: master pemilik dan nama slot (bila sudah slot). */
export function slotFrameInfo(doc: LakarDocument, info: ComponentInfo, id: string): { masterId: string; masterName: string; slot: string | undefined } | undefined {
  if (info.stored.get(id)?.type !== 'frame') return undefined;
  const masterId = masterOfNode(info, id);
  const def = masterId ? masterDef(doc, masterId) : undefined;
  if (!masterId || !def) return undefined;
  return { masterId, masterName: info.masterById.get(masterId)?.name ?? 'Component', slot: def.slots.find((s) => s.nodeId === id)?.name };
}

/** Tandai frame sebagai slot (nama = camelCase nama frame, unik). */
export function addSlotOps(doc: LakarDocument, masterId: string, frameId: string): { ops: DocOp[]; name: string } | undefined {
  const def = masterDef(doc, masterId);
  const frame = findStored(doc, frameId);
  if (!def || !frame || frame.type !== 'frame' || frameId === masterId || def.slots.some((s) => s.nodeId === frameId)) return undefined;
  if (!masterLayers(doc, masterId).some((l) => l.id === frameId)) return undefined;
  const name = uniqueName(def, camelName(frame.name, 'content'));
  return { ops: [setDef(masterId, { props: def.props, slots: [...def.slots, { name, nodeId: frameId }] })], name };
}

/** Rename slot: `setComponent` + pindahkan isi `slots` instance ke nama baru. */
export function renameSlotOps(doc: LakarDocument, info: ComponentInfo, masterId: string, name: string, to: string): DocOp[] | { error: string } {
  const def = masterDef(doc, masterId);
  if (!def || !def.slots.some((s) => s.name === name)) return { error: 'This slot no longer exists' };
  if (to === name) return [];
  const problem = nameProblem(def, to, name);
  if (problem) return { error: problem };
  const ops: DocOp[] = [setDef(masterId, { props: def.props, slots: def.slots.map((s) => (s.name === name ? { ...s, name: to } : s)) })];
  for (const inst of instancesOf(info, masterId)) {
    const slots = (inst.slots ?? {}) as Record<string, unknown>;
    if (!Object.hasOwn(slots, name)) continue;
    ops.push({ op: 'update', id: inst.id, patch: { slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k === name ? to : k, v])) } });
  }
  return ops;
}

/** Lepas slot: `setComponent` tanpa slot itu (isi slot instance menjadi yatim, LC-32; bisa di-undo). */
export function removeSlotOps(doc: LakarDocument, masterId: string, name: string): DocOp[] {
  const def = masterDef(doc, masterId);
  if (!def || !def.slots.some((s) => s.name === name)) return [];
  return [setDef(masterId, { props: def.props, slots: def.slots.filter((s) => s.name !== name) })];
}

// ---------------------------------------------------------------------------
// Instance: nilai props dan isi slot
// ---------------------------------------------------------------------------

export type InstancePropRow = { name: string; type: PropType; value: string | boolean; options: readonly string[]; visibility: boolean };
export type InstanceSlotRow = { name: string; frameId: string; address: string; filled: boolean; text: string };
export type InstanceModel = { instanceId: string; masterId: string; props: InstancePropRow[]; slots: InstanceSlotRow[] };

/** Nilai efektif prop instance: nilai tersimpan yang sah, atau default (sama dengan ekspansi). */
export function propValue(p: ComponentProp, given: Record<string, unknown>): string | boolean {
  if (!Object.hasOwn(given, p.name)) return p.default;
  const g = given[p.name];
  const ok = p.type === 'boolean' ? typeof g === 'boolean' : typeof g === 'string' && (p.type !== 'enum' || p.options.includes(g));
  return ok ? (g as string | boolean) : p.default;
}

/** Model Properties/Slots grup Instance. */
export function instanceModel(doc: LakarDocument, info: ComponentInfo, instanceId: string): InstanceModel | undefined {
  const inst = info.instances.get(instanceId);
  const masterId = inst?.componentId as string | undefined;
  const def = masterId ? masterDef(doc, masterId) : undefined;
  if (!inst || !masterId || !def) return undefined;
  const given = propsOf(inst);
  const slots = (inst.slots ?? {}) as Record<string, unknown[]>;
  return {
    instanceId,
    masterId,
    props: def.props.map((p) => ({ name: p.name, type: p.type, value: propValue(p, given), options: p.type === 'enum' ? p.options : [], visibility: p.binds.some((b) => b.prop === VISIBLE_BIND) })),
    slots: def.slots.map((s) => {
      const filled = Object.hasOwn(slots, s.name);
      const n = filled ? (slots[s.name]?.length ?? 0) : (findStored(doc, s.nodeId)?.children?.length ?? 0);
      return { name: s.name, frameId: s.nodeId, address: `${instanceId}/${s.nodeId}`, filled, text: filled ? layersText(n) : `Default · ${layersText(n)}` };
    }),
  };
}

/** Nilai prop instance: `update(I, {props})`; nilai = default membuang kunci, peta kosong → `props:null`. */
export function setInstancePropOps(doc: LakarDocument, info: ComponentInfo, instanceId: string, name: string, value: string | boolean): DocOp[] {
  const inst = info.instances.get(instanceId);
  const def = inst ? masterDef(doc, inst.componentId as string) : undefined;
  const p = def?.props.find((x) => x.name === name);
  if (!inst || !p) return [];
  if (p.type === 'boolean' ? typeof value !== 'boolean' : typeof value !== 'string' || (p.type === 'enum' && !p.options.includes(value))) return [];
  const cur = propsOf(inst);
  const { [name]: had, ...rest } = cur;
  const next = value === p.default ? rest : { ...rest, [name]: value };
  if (value === p.default ? had === undefined : had === value) return [];
  return [{ op: 'update', id: instanceId, patch: { props: propsPatch(next) } }];
}

/** Sisip node baru ke slot instance (`ref` = node baru di respons). */
export const slotAddOp = (address: string, node: Record<string, unknown>): DocOp => ({ op: 'add', parentId: address, node, ref: 'slotted' });
/** Pindahkan layer tersimpan ke akhir slot instance. */
export const slotMoveOp = (id: string, address: string): DocOp => ({ op: 'move', id, parentId: address });

export const MOVE_CANDIDATES_MAX = 20;

/**
 * Layer yang bisa dipindah ke slot instance `instanceId` (menu "Move into slot"): node tersimpan board instance itu
 * (rantai children, urut dokumen), tanpa board, instance itu dan leluhurnya, master mana pun beserta turunannya, dan
 * leluhur master instance itu. Maks. `MOVE_CANDIDATES_MAX`.
 */
export function moveCandidates(doc: LakarDocument, info: ComponentInfo, instanceId: string): { id: string; name: string; type: string }[] {
  const s = info.stored.get(instanceId);
  const masterId = info.instances.get(instanceId)?.componentId as string | undefined;
  const board = s ? findStored(doc, s.boardId) : undefined;
  if (!s || !board) return [];
  const ancestorsOf = (id: string | undefined) => {
    const out = new Set<string>();
    for (let p = id ? info.stored.get(id)?.parentId : undefined; p; ) {
      const pid: string = isComposite(p) ? instanceRootOf(p) : p;
      out.add(pid);
      p = info.stored.get(pid)?.parentId;
    }
    return out;
  };
  const blocked = new Set([...ancestorsOf(instanceId), ...ancestorsOf(masterId)]);
  const out: { id: string; name: string; type: string }[] = [];
  const walk = (n: Raw) => {
    // Master mana pun (beserta isinya) tidak ditawarkan: memindah isinya mengubah semua instance master itu.
    if (n.id === instanceId || n.id === masterId || info.kinds.get(n.id) === 'master') return;
    if (n.type !== 'board' && !blocked.has(n.id)) out.push({ id: n.id, name: n.name, type: n.type });
    for (const c of n.children ?? []) walk(c);
  };
  walk(board);
  return out.slice(0, MOVE_CANDIDATES_MAX);
}
