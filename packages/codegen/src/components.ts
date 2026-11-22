// Master → komponen React, instance → pemakaian komponen (AD-12, AD-16; epic kode story 3). Isi komponen diturunkan
// dari ekspansi instance sintetis master lewat `expandInstances` (AD-10) pada salinan dokumen: satu per kombinasi
// nilai prop boolean/enum yang perlu, sehingga aturan props/override/slot tidak pernah ditulis ulang di sini. Setiap
// pemakaian dicek: hasil evaluasi komponen (+ selisih akar + isi slot) harus sama dengan pohon ter-ekspansi asli;
// selain itu di-inline. Murni dan deterministik.
import { expandInstances, LakarError, type ComponentDef, type ComponentProp, type ExpandedChildNode, type IconGlyph, type LakarDocument } from '@lakar/schema';
import {
  combos,
  comboKey,
  evalComponent,
  fixed,
  fullProps,
  normDecls,
  sameTree,
  siteDiff,
  staticEl,
  type Driver,
  type ExportedProp,
  type JChild,
  type JComponent,
  type JEl,
  type JUse,
  type PropValue,
  type SiteDecl,
  type Styled,
  type Varying,
} from './jsx.js';
import { NameAllocator, pascalName } from './names.js';
import { makeCtx, nodeElement, type CodeElement, type CodeNode, type CodegenWarning, type InstanceMark, type StoredIndex, type TreeCtx } from './tree.js';

/** Batas kombinasi nilai prop per elemen komponen; lebih dari ini → komponen tidak diekspor (instance di-inline). */
export const COMBOS_MAX = 64;
/** Batas kasar node hasil ekspansi per panggilan sintetis (di bawah `EXPANSION_NODES_MAX` schema). */
const SYNTH_NODES_PER_CALL = 10_000;

type StoredMaster = Readonly<Record<string, unknown>> & { id: string; name: string; component: ComponentDef };
type NodeState = { el: CodeElement; childKeys: string[] };
type StateMap = Map<string, NodeState>;
type TNode = { key: string; drivers: Driver[]; states: Map<string, NodeState | null>; children: TNode[]; textProp?: string | undefined };

const SKIP = Symbol('skip');

/**
 * Nama prop/slot yang lolos pola schema tetapi tidak aman di kode keluaran: kata kunci/cadangan JS, nama yang dipakai
 * berkas komponen (`className`, `style`, `styles`), dan prop yang ditelan React (`key`, `ref`).
 */
const RESERVED_NAMES: ReadonlySet<string> = new Set(
  (
    'arguments await break case catch class const continue debugger default delete do else enum eval export extends false finally for function if ' +
    'implements import in instanceof interface let new null package private protected public return static super switch this throw true try typeof ' +
    'undefined var void while with yield className style styles key ref'
  ).split(' '),
);

const values = (p: ComponentProp): PropValue[] => (p.type === 'boolean' ? [true, false] : p.type === 'enum' ? [...p.options] : []);

/** Salin node ter-ekspansi dengan id relatif master: akar sintetis → id master, `sid/x` → `x`. */
function relabel(n: ExpandedChildNode, sid: string, masterId: string): ExpandedChildNode {
  const id = n.id === sid ? masterId : n.id.startsWith(`${sid}/`) ? n.id.slice(sid.length + 1) : n.id;
  const out = { ...n, id } as ExpandedChildNode;
  if (n.type === 'frame') (out as { children: ExpandedChildNode[] }).children = n.children.map((c) => relabel(c, sid, masterId));
  return out;
}

/** State per node (elemen node tanpa anak node; anak = bagian internal: teks, svg, lapisan fill). */
function statesOf(root: CodeElement | null): StateMap {
  const out: StateMap = new Map();
  const walk = (e: CodeElement) => {
    const parts: CodeNode[] = [];
    const kids: CodeElement[] = [];
    for (const c of e.children) {
      if (c.kind === 'text' || c.nodeId === e.nodeId) parts.push(c);
      else kids.push(c);
    }
    out.set(e.nodeId, { el: { ...e, children: parts }, childKeys: kids.map((k) => k.nodeId) });
    kids.forEach(walk);
  };
  if (root) walk(root);
  return out;
}

const stateEq = (a: NodeState | null | undefined, b: NodeState | null | undefined) => (!a || !b ? !a === !b : sameTree(a.el, b.el, false));

/** Gabung daftar anak dari beberapa ekspansi dengan urutan relatif tetap. */
function mergeOrder(lists: readonly (readonly string[])[]): string[] {
  const out: string[] = [];
  for (const list of lists) {
    list.forEach((k, i) => {
      if (out.includes(k)) return;
      const prev = i > 0 ? out.indexOf(list[i - 1]!) : -1;
      out.splice(prev + 1, 0, k);
    });
  }
  return out;
}

/**
 * Proyeksi nilai per kombinasi ke driver yang relevan (`SKIP` = tidak peduli). Driver relevan bila dua kombinasi
 * yang dipedulikan dan hanya berbeda di driver itu punya nilai berbeda; proyeksi yang tidak konsisten → semua driver.
 */
function project<T>(ds: readonly Driver[], value: (c: readonly PropValue[]) => T | typeof SKIP, eq: (a: T, b: T) => boolean): Varying<T> | undefined {
  const all = combos(ds);
  const vals = new Map(all.map((c) => [comboKey(c), value(c)]));
  const care = all.filter((c) => vals.get(comboKey(c)) !== SKIP);
  if (!care.length) return undefined;
  const relevant = ds.filter((d, i) =>
    care.some((c) =>
      d.values.some((v) => {
        if (v === c[i]) return false;
        const other = vals.get(comboKey(c.map((x, j) => (j === i ? v : x))));
        return other !== undefined && other !== SKIP && !eq(other as T, vals.get(comboKey(c)) as T);
      }),
    ),
  );
  const build = (rel: readonly Driver[]): Map<string, T> | undefined => {
    const idx = rel.map((d) => ds.indexOf(d));
    const table = new Map<string, T>();
    for (const c of care) {
      const k = comboKey(idx.map((i) => c[i]!));
      const v = vals.get(comboKey(c)) as T;
      if (table.has(k) && !eq(table.get(k)!, v)) return undefined;
      if (!table.has(k)) table.set(k, v);
    }
    const fill = vals.get(comboKey(care[0]!)) as T;
    for (const c of combos(rel)) if (!table.has(comboKey(c))) table.set(comboKey(c), fill);
    return table;
  };
  const table = build(relevant);
  return table ? { drivers: relevant, table } : { drivers: ds, table: build(ds)! };
}

const styledOf = (s: NodeState): Styled => (s.el.after ? { decls: s.el.decls, after: s.el.after } : { decls: s.el.decls });
const styledEq = (a: Styled, b: Styled) => normDecls(a.decls) === normDecls(b.decls) && normDecls(a.after) === normDecls(b.after);
const jsonEq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function findEl(root: CodeElement, id: string): CodeElement | undefined {
  if (root.nodeId === id) return root;
  for (const c of root.children) {
    if (c.kind !== 'element' || c.nodeId === root.nodeId) continue;
    const hit = findEl(c, id);
    if (hit) return hit;
  }
  return undefined;
}

type Check = { site: SiteDecl[]; slots: Map<string, CodeElement>; root: CodeElement };

export type ExporterOptions = { icons?: readonly IconGlyph[] | undefined; assetBase?: string | undefined };

/** Pembangun komponen dan pemakaian untuk satu dokumen. */
export class Exporter {
  private readonly masters = new Map<string, StoredMaster>();
  private readonly models = new Map<string, JComponent | null>();
  private readonly failed = new Map<string, CodegenWarning>();
  private readonly used = new Set<string>();
  private synthN = 0;

  constructor(
    private readonly doc: LakarDocument,
    private readonly stored: StoredIndex,
    private readonly opts: ExporterOptions,
    private readonly requested: TreeCtx['requested'],
    private readonly names: NameAllocator,
  ) {
    for (const [id, n] of stored) {
      this.used.add(id);
      if (n.component !== undefined) this.masters.set(id, n as StoredMaster);
    }
    for (const p of doc.pages) {
      this.used.add(p.id);
      for (const b of p.children) this.used.add(b.id);
    }
  }

  isMaster(id: string): boolean {
    return this.masters.has(id);
  }

  private synthId(): string {
    for (;;) {
      const id = `Cg${(this.synthN++).toString(36).padStart(6, '0')}`;
      if (!this.used.has(id)) {
        this.used.add(id);
        return id;
      }
    }
  }

  /** Ekspansi instance sintetis master untuk setiap set props (null = akar tersembunyi). */
  private expandMaster(master: StoredMaster, list: readonly Record<string, PropValue>[]): (ExpandedChildNode | null)[] {
    const ids = list.map(() => this.synthId());
    const pageId = this.synthId();
    const boardId = this.synthId();
    const insts = list.map((props, i) => ({ type: 'instance', id: ids[i], name: master.name, componentId: master.id, props }));
    // Dokumen sintetis berisi semua master (tanpa halaman lain) + instance sintetis: biaya ekspansi tidak bergantung
    // besar dokumen dan anggaran node ekspansi hanya terpakai oleh salinan master.
    const board = { type: 'board', id: boardId, name: 'codegen', x: 0, y: 0, width: 0, height: 0, screen: 'app', children: [...this.masters.values(), ...insts] };
    const doc = { ...this.doc, pages: [{ id: pageId, name: 'codegen', children: [board] }] } as unknown as LakarDocument;
    const out = expandInstances(doc).pages[0]!.children[0]!.children;
    return ids.map((id) => {
      const n = out.find((c) => c.id === id);
      return n ? relabel(n, id, master.id) : null;
    });
  }

  /** Komponen untuk master `id` (dibangun sekali); null bila tidak bisa diekspor. */
  component(id: string): JComponent | null {
    if (this.models.has(id)) return this.models.get(id)!;
    this.models.set(id, null);
    const master = this.masters.get(id);
    if (!master) return null;
    let c: JComponent | null = null;
    try {
      c = this.build(master);
    } catch (e) {
      // Hanya galat schema (batas ekspansi, LakarError) yang menjadi fallback inline; galat lain adalah bug dan dilempar.
      if (!(e instanceof LakarError)) throw e;
      c = null;
    }
    if (!c && !this.failed.has(id)) {
      this.failed.set(id, { code: 'component-too-complex', nodeId: id, message: `Component "${master.name}" could not be exported as a React component; its instances are exported inline.` });
    }
    this.models.set(id, c);
    return c;
  }

  private build(master: StoredMaster): JComponent | null {
    const def = master.component;
    const warnings: CodegenWarning[] = [];
    // Sumber terakhir `content` per node (props diterapkan berurutan; yang terakhir menang).
    const source = new Map<string, string>();
    for (const p of def.props) for (const b of p.binds) if (b.prop === 'content') source.set(b.nodeId, p.name);
    const exported: ExportedProp[] = [];
    const textProps = new Map<string, string>();
    const unsupported = new Set<string>();
    for (const p of def.props) {
      if (RESERVED_NAMES.has(p.name)) {
        unsupported.add(p.name);
        warnings.push({ code: 'prop-unsupported', nodeId: master.id, message: `Prop "${p.name}" of component "${master.name}" is a reserved name in the generated code; it is not exported.` });
        continue;
      }
      if (p.type === 'text') {
        const ok = p.binds.every((b) => b.prop === 'name' || (b.prop === 'content' && this.stored.get(b.nodeId)?.type === 'text' && source.get(b.nodeId) === p.name));
        if (!ok) {
          warnings.push({ code: 'prop-unsupported', nodeId: master.id, message: `Text prop "${p.name}" of component "${master.name}" binds a property other than text content; it is not exported.` });
          continue;
        }
        for (const b of p.binds) if (b.prop === 'content') textProps.set(b.nodeId, p.name);
      }
      exported.push(p.type === 'enum' ? { name: p.name, type: p.type, default: p.default, options: p.options } : { name: p.name, type: p.type, default: p.default });
    }
    const finite = def.props.filter((p) => p.type !== 'text' && p.binds.length && !unsupported.has(p.name));
    const d0: Record<string, PropValue> = Object.fromEntries(finite.map((p) => [p.name, p.default]));
    const fullKey = (props: Record<string, PropValue>) => comboKey(finite.map((p) => props[p.name]!));
    const driverOf = new Map(finite.map((p): [string, Driver] => [p.name, { name: p.name, values: values(p) }]));

    const base = pascalName(master.name);
    const ctx = makeCtx(base, this.opts, this.stored, this.requested);
    const cache = new Map<string, StateMap>();
    const flats = new Map<string, CodeElement | null>();
    let perCall = 1;
    const expand = (list: Record<string, PropValue>[]) => {
      const todo = list.filter((p, i) => !cache.has(fullKey(p)) && list.findIndex((q) => fullKey(q) === fullKey(p)) === i);
      for (let i = 0; i < todo.length; i += perCall) {
        const chunk = todo.slice(i, i + perCall);
        this.expandMaster(master, chunk).forEach((n, j) => {
          const flat = n ? nodeElement(ctx, n, 'column', 0, undefined) : null;
          flats.set(fullKey(chunk[j]!), flat);
          cache.set(fullKey(chunk[j]!), statesOf(flat));
        });
      }
    };
    expand([d0]);
    perCall = Math.max(1, Math.floor(SYNTH_NODES_PER_CALL / Math.max(1, cache.get(fullKey(d0))!.size)));

    // Driver per node (titik tetap): bind langsung ke node + warisan driver parent; lalu setiap prop lain yang,
    // pada salah satu kombinasi driver node, mengubah state node (termasuk daftar anaknya) bila di-flip. Diulang
    // sampai stabil, sehingga node yang hanya muncul pada kombinasi beberapa prop dan interaksi antar-prop ikut tertangkap.
    const full = (ds: readonly Driver[], c: readonly PropValue[]) => ({ ...d0, ...Object.fromEntries(ds.map((d, i) => [d.name, c[i]!])) });
    const driverSets = new Map<string, Set<string>>();
    const addDriver = (k: string, p: string) => {
      const set = driverSets.get(k) ?? driverSets.set(k, new Set()).get(k)!;
      if (set.has(p)) return false;
      set.add(p);
      return true;
    };
    for (const p of finite) for (const b of p.binds) addDriver(b.nodeId, p.name);
    const dsOf = (k: string) => finite.filter((p) => driverSets.get(k)?.has(p.name)).map((p) => driverOf.get(p.name)!);
    const stateAt = (props: Record<string, PropValue>, k: string) => cache.get(fullKey(props))?.get(k) ?? null;
    const sameState = (a: NodeState | null, b: NodeState | null) => stateEq(a, b) && (!a || !b || JSON.stringify(a.childKeys) === JSON.stringify(b.childKeys));
    // Driver parent yang diwariskan hanya yang mengubah KEHADIRAN parent (anak tidak bisa hadir tanpa parent, jadi
    // anak yang baru muncul pada kombinasi dua prop tetap tertangkap). Driver gaya parent (mis. `align` akar) tidak
    // diwariskan: pengaruhnya ke anak (bila ada) tertangkap probe. Mewariskan semua driver membuat kombinasi daun
    // meledak melewati COMBOS_MAX untuk komponen dengan beberapa enum (ditemukan uji paritas spec kode-4).
    const presenceDrivers = (k: string): string[] => {
      const ds = dsOf(k);
      return ds
        .filter((d) =>
          combos(ds).some((c) => {
            const at = full(ds, c);
            return d.values.some((v) => v !== at[d.name] && (stateAt(at, k) === null) !== (stateAt({ ...at, [d.name]: v }, k) === null));
          }),
        )
        .map((d) => d.name);
    };
    for (let changed = true; changed; ) {
      changed = false;
      const keys = mergeOrder([...[...cache.values()].map((m) => [...m.keys()]), [...driverSets.keys()]]);
      for (const k of keys) if (combos(dsOf(k)).length > COMBOS_MAX) return null;
      const probes = (k: string) =>
        combos(dsOf(k)).flatMap((c) => {
          const at = full(dsOf(k), c);
          return finite.filter((q) => !driverSets.get(k)?.has(q.name)).flatMap((q) => values(q).filter((v) => v !== q.default).map((v) => ({ at, q: q.name, flip: { ...at, [q.name]: v } })));
        });
      expand(keys.flatMap((k) => [...combos(dsOf(k)).map((c) => full(dsOf(k), c)), ...probes(k).map((p) => p.flip)]));
      for (const k of keys) {
        for (const p of probes(k)) if (!sameState(stateAt(p.at, k), stateAt(p.flip, k))) changed = addDriver(k, p.q) || changed;
      }
      const parentOf = new Map<string, string>();
      for (const m of cache.values()) for (const [k, s] of m) for (const c of s.childKeys) parentOf.set(c, k);
      const keysNow = mergeOrder([...[...cache.values()].map((m) => [...m.keys()]), [...driverSets.keys()]]);
      for (const k of keysNow) {
        const parent = parentOf.get(k);
        if (!parent) continue;
        // Kehadiran parent dinilai pada semua kombinasi drivernya (driver bisa bertambah oleh probe di putaran ini).
        const pds = dsOf(parent);
        if (combos(pds).length > COMBOS_MAX) return null;
        expand(combos(pds).map((c) => full(pds, c)));
        for (const d of presenceDrivers(parent)) changed = addDriver(k, d) || changed;
      }
      for (const k of keysNow) if (combos(dsOf(k)).length > COMBOS_MAX) return null;
    }
    const drivers = new Map([...driverSets.keys()].map((k): [string, Driver[]] => [k, dsOf(k)]));

    const childLists = new Map<string, string[][]>();
    for (const m of cache.values()) for (const [k, s] of m) (childLists.get(k) ?? childLists.set(k, []).get(k)!).push(s.childKeys);
    const tnode = (k: string): TNode => {
      const ds = drivers.get(k) ?? [];
      const states = new Map(combos(ds).map((c): [string, NodeState | null] => [comboKey(c), cache.get(fullKey(full(ds, c)))!.get(k) ?? null]));
      return { key: k, drivers: ds, states, children: mergeOrder(childLists.get(k) ?? []).map(tnode), textProp: textProps.get(k) };
    };
    const root = tnode(master.id);

    const name = this.names.take(base);
    // Slot hanya untuk frame (selain itu ekspansi mengabaikan isinya) dan nama yang aman di kode.
    const slotDefs = def.slots.filter((s) => {
      if (this.stored.get(s.nodeId)?.type !== 'frame') return false;
      if (!RESERVED_NAMES.has(s.name)) return true;
      warnings.push({ code: 'prop-unsupported', nodeId: master.id, message: `Slot "${s.name}" of component "${master.name}" is a reserved name in the generated code; it is not exported.` });
      return false;
    });
    const comp: JComponent = { name, masterId: master.id, source: master.name, props: exported, slots: slotDefs.map((s) => s.name), root: undefined as unknown as JEl, warnings };
    const slotOf = new Map(slotDefs.map((s) => [s.nodeId, s.name]));
    const e0 = flats.get(fullKey(d0)) ?? null;
    const j = this.templateEl(root, d0, full, slotOf, e0, () => true, true);
    if (!j || j.kind !== 'el') return null;
    comp.rootWhen = j.when;
    j.when = undefined;
    j.root = true;
    comp.root = j;
    return comp;
  }

  /** Node template → model JSX komponen. `parentPresent` = kehadiran parent untuk props lengkap. */
  private templateEl(
    t: TNode,
    d0: Record<string, PropValue>,
    full: (ds: readonly Driver[], c: readonly PropValue[]) => Record<string, PropValue>,
    slotOf: ReadonlyMap<string, string>,
    e0: CodeElement | null,
    parentPresent: (props: Record<string, PropValue>) => boolean,
    isRoot: boolean,
  ): JChild | null {
    const stateAt = (c: readonly PropValue[]) => t.states.get(comboKey(c)) ?? null;
    const present = (props: Record<string, PropValue>) => parentPresent(props) && t.states.get(comboKey(t.drivers.map((d) => props[d.name]!))) != null;
    const when = project(t.drivers, (c) => (parentPresent(full(t.drivers, c)) ? stateAt(c) !== null : SKIP), (a, b) => a === b);
    if (!when || ![...when.table.values()].some(Boolean)) return null;
    const whenV = when.drivers.length ? when : undefined;
    const states = [...t.states.values()].filter((s): s is NodeState => s !== null);
    const first = states[0]!;
    const warnings = this.dedupe(states.flatMap((s) => s.el.warnings ?? []));

    // Instance bersarang → pemakaian komponen bila lolos cek dan turunannya tidak bergantung prop luar.
    if (!isRoot && first.el.instance && !first.el.instance.master) {
      const mark = first.el.instance;
      const use = this.nestedUse(t, mark, d0, full, slotOf, e0, present, whenV);
      if (use) return use;
      warnings.push(
        this.failed.get(mark.componentId) ?? {
          code: 'instance-inlined',
          nodeId: t.key,
          message: `Instance "${String(this.stored.get(mark.storedId)?.name ?? first.el.name)}" differs from component "${this.masters.get(mark.componentId)?.name ?? mark.componentId}" in ways props, slots, and root classes can't express; exported inline.`,
        },
      );
    }

    const style = project(t.drivers, (c) => {
      const s = stateAt(c);
      return s ? styledOf(s) : SKIP;
    }, styledEq)!;
    const j: JEl = { kind: 'el', tag: first.el.tag, name: first.el.name, nodeId: t.key, attrs: first.el.attrs, style, children: [], when: whenV };
    if (warnings.length) j.warnings = warnings;
    const kids = t.children.map((c) => this.templateEl(c, d0, full, slotOf, e0, present, false)).filter((c): c is JChild => c !== null);
    const slot = slotOf.get(t.key);
    if (slot !== undefined) {
      j.slotFrame = slot;
      j.children = [{ kind: 'slot', name: slot, fallback: kids }];
    } else if (t.children.length) j.children = kids;
    else if (t.textProp) j.children = [{ kind: 'prop', name: t.textProp }];
    else j.children = this.partsOf(t, stateAt);
    return j;
  }

  /** Bagian internal node daun (teks, svg, lapisan fill): statis, teks bervarian, atau grup bersyarat per varian. */
  private partsOf(t: TNode, stateAt: (c: readonly PropValue[]) => NodeState | null): JChild[] {
    const eq = (a: CodeNode[], b: CodeNode[]) => {
      const wrap = (children: CodeNode[]): CodeElement => ({ kind: 'element', tag: 'x', name: '', nodeId: '', decls: [], attrs: [], children });
      return sameTree(wrap(a), wrap(b), false);
    };
    const v = project(t.drivers, (c) => {
      const s = stateAt(c);
      return s ? s.el.children : SKIP;
    }, eq)!;
    const convert = (parts: CodeNode[]): JChild[] => parts.map((p): JChild => (p.kind === 'text' ? { kind: 'text', text: fixed(p.text) } : staticEl(p)));
    const entries = [...v.table.values()];
    if (!v.drivers.length) return convert(entries[0]!);
    if (entries.every((p) => p.length === 1 && p[0]!.kind === 'text')) {
      return [{ kind: 'text', text: { drivers: v.drivers, table: new Map([...v.table].map(([k, p]) => [k, (p[0] as { text: string }).text])) } }];
    }
    const distinct: CodeNode[][] = [];
    for (const p of entries) if (!distinct.some((d) => eq(d, p))) distinct.push(p);
    return distinct
      .filter((d) => d.length)
      .map((d): JChild => ({ kind: 'cond', when: { drivers: v.drivers, table: new Map([...v.table].map(([k, p]) => [k, eq(p, d)])) }, children: convert(d) }));
  }

  /** Pemakaian komponen untuk instance bersarang di template, atau undefined (inline). */
  private nestedUse(
    t: TNode,
    mark: InstanceMark,
    d0: Record<string, PropValue>,
    full: (ds: readonly Driver[], c: readonly PropValue[]) => Record<string, PropValue>,
    slotOf: ReadonlyMap<string, string>,
    e0: CodeElement | null,
    present: (props: Record<string, PropValue>) => boolean,
    when: Varying<boolean> | undefined,
  ): JUse | undefined {
    const model = this.component(mark.componentId);
    const a = e0 ? findEl(e0, t.key) : undefined;
    if (!model || !a) return undefined;
    const props = this.propsFor(mark, a, model);
    const r = this.check(a, model, props);
    if (!r) return undefined;
    const provided = new Set([...r.slots.values()].map((e) => e.nodeId));
    // Turunan (selain isi slot yang ditulis) harus statis terhadap prop luar selama akar instance hadir.
    const invariant = (n: TNode): boolean => {
      let ref: NodeState | null | undefined;
      const same = combos(n.drivers).every((c) => {
        if (!present(full(n.drivers, c))) return true;
        const s = n.states.get(comboKey(c)) ?? null;
        if (ref === undefined) ref = s;
        return stateEq(ref, s);
      });
      return same && (provided.has(n.key) || n.children.every(invariant));
    };
    if (!t.children.every(invariant)) return undefined;
    const rootEq = (s: NodeState) =>
      s.el.tag === a.tag && normDecls(s.el.after) === normDecls(a.after) && JSON.stringify(s.el.attrs) === JSON.stringify(a.attrs) && sameTree({ ...a, decls: [], children: s.el.children }, { ...a, decls: [], children: a.children.filter((c) => c.kind === 'text' || c.nodeId === a.nodeId) }, true);
    let ok = true;
    const site = project(t.drivers, (c) => {
      const s = t.states.get(comboKey(c)) ?? null;
      if (!s || !present(full(t.drivers, c))) return SKIP;
      if (!rootEq(s)) ok = false;
      return siteDiff(s.el.decls, r.root.decls);
    }, jsonEq);
    if (!ok || !site) return undefined;
    const slotNode = (key: string): TNode | undefined => {
      const find = (n: TNode): TNode | undefined => (n.key === key ? n : n.children.map(find).find(Boolean));
      return find(t);
    };
    const slots: [string, JChild[]][] = [];
    for (const name of model.slots) {
      const frame = r.slots.get(name);
      if (!frame) continue;
      const sn = slotNode(frame.nodeId);
      if (!sn) return undefined;
      slots.push([name, sn.children.map((c) => this.templateEl(c, d0, full, slotOf, e0, present, false)).filter((c): c is JChild => c !== null)]);
    }
    return { kind: 'use', comp: model, name: a.name, nodeId: t.key, props, site, slots, when };
  }

  /** Props pemakaian (berbeda dari default): nilai tersimpan yang sah; prop text dibaca dari teks node terikat. */
  private propsFor(mark: InstanceMark, a: CodeElement, model: JComponent): [string, PropValue][] {
    const master = this.masters.get(model.masterId)!;
    const given = mark.master ? {} : ((this.stored.get(mark.storedId)?.props as Record<string, PropValue> | undefined) ?? {});
    const out: [string, PropValue][] = [];
    for (const p of model.props) {
      let v: PropValue = p.default;
      if (p.type === 'text') {
        const bind = master.component.props.find((q) => q.name === p.name)!.binds.find((b) => b.prop === 'content');
        const e = bind ? findEl(a, mark.master ? bind.nodeId : `${a.nodeId}/${bind.nodeId}`) : undefined;
        const text = e?.children.find((c) => c.kind === 'text');
        if (text && text.kind === 'text') v = text.text;
        else if (typeof given[p.name] === 'string') v = given[p.name]!;
      } else if (Object.hasOwn(given, p.name)) {
        const g = given[p.name];
        if (p.type === 'boolean' ? typeof g === 'boolean' : typeof g === 'string' && p.options!.includes(g)) v = g!;
      }
      if (v !== p.default) out.push([p.name, v]);
    }
    return out;
  }

  /** Cek pemakaian: komponen dengan `props` + selisih akar + slot = pohon asli `a`. */
  private check(a: CodeElement, model: JComponent, props: readonly [string, PropValue][]): Check | undefined {
    const slotEls = new Map<CodeElement, string>();
    const root = evalComponent(model, fullProps(model, props), new Map(), slotEls);
    if (!root) return undefined;
    const slots = new Map<string, CodeElement>();
    if (!sameTree(a, root, true, slotEls, slots)) return undefined;
    return { site: siteDiff(a.decls, root.decls), slots, root };
  }

  /** Elemen flat pohon asli → model JSX: akar instance/master menjadi pemakaian bila lolos cek, selain itu inline. */
  toJ(e: CodeElement): JChild {
    if (e.instance) {
      const model = this.component(e.instance.componentId);
      if (model) {
        const props = this.propsFor(e.instance, e, model);
        const r = this.check(e, model, props);
        if (r) {
          const slots = model.slots.flatMap((name): [string, JChild[]][] => {
            const frame = r.slots.get(name);
            return frame ? [[name, frame.children.filter((c): c is CodeElement => c.kind === 'element').map((c) => this.toJ(c))]] : [];
          });
          return { kind: 'use', comp: model, name: e.name, nodeId: e.nodeId, props, site: fixed(r.site), slots };
        }
      }
      const j = staticEl(e, (c) => this.toJ(c));
      const master = this.masters.get(e.instance.componentId);
      const w: CodegenWarning =
        this.failed.get(e.instance.componentId) ??
        ({
          code: 'instance-inlined',
          nodeId: e.nodeId,
          message: `${e.instance.master ? 'Master' : 'Instance'} "${String(this.stored.get(e.instance.storedId)?.name ?? e.name)}" differs from component "${master?.name ?? e.instance.componentId}" in ways props, slots, and root classes can't express; exported inline.`,
        } satisfies CodegenWarning);
      j.warnings = [...(j.warnings ?? []), w];
      return j;
    }
    return staticEl(e, (c) => this.toJ(c));
  }

  /** Dedup peringatan per code + nodeId + message (urutan pertama). */
  dedupe(list: readonly CodegenWarning[]): CodegenWarning[] {
    const seen = new Set<string>();
    return list.filter((w) => {
      const k = `${w.code}\u0000${w.nodeId ?? ''}\u0000${w.message}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
}

/** Peringatan dari model JSX (elemen yang ditulis; isi komponen tidak diikutkan dari pemakaian). */
export function warningsOf(nodes: readonly JChild[], out: CodegenWarning[] = []): CodegenWarning[] {
  for (const n of nodes) {
    switch (n.kind) {
      case 'el':
        if (n.warnings) out.push(...n.warnings);
        warningsOf(n.children, out);
        break;
      case 'slot':
        warningsOf(n.fallback, out);
        break;
      case 'cond':
        warningsOf(n.children, out);
        break;
      case 'use':
        n.slots.forEach(([, c]) => warningsOf(c, out));
        break;
    }
  }
  return out;
}

/** Komponen yang dipakai pohon (pre-order, rekursif ke dalam komponen). */
export function componentsOf(root: JChild): JComponent[] {
  const out: JComponent[] = [];
  const visit = (nodes: readonly JChild[]) => {
    for (const n of nodes) {
      switch (n.kind) {
        case 'el':
          visit(n.children);
          break;
        case 'slot':
          visit(n.fallback);
          break;
        case 'cond':
          visit(n.children);
          break;
        case 'use':
          if (!out.includes(n.comp)) {
            out.push(n.comp);
            visit([n.comp.root]);
          }
          n.slots.forEach(([, c]) => visit(c));
          break;
      }
    }
  };
  visit([root]);
  return out;
}
