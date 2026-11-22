// Tahap ekspansi instance (AD-10 tahap 1, AD-12): instance → salinan master beralamat komposit, dengan props,
// override, dan isi slot diterapkan. Konsumen di luar schema memanggil `resolveDocument`, bukan fungsi ini
// (kecuali codegen nanti). Murni: input tidak dimutasi, deterministik, tanpa IO.
import { componentIssues, hasComponents, hasInstances, visitStored } from './component-issues.js';
import { LakarError } from './errors.js';
import {
  EXPANDED_NODE_SHALLOW,
  ExpandedLakarDocument,
  VISIBLE_BIND,
  zodToLakarError,
  type ChildNode,
  type ComponentDef,
  type ExpandedChildNode,
  type ExpandedDocument,
  type InstanceNode,
  type LakarDocument as Doc,
} from './nodes.js';

/** Jenis referensi basi: override/prop/slot instance, atau bind/slot master yang menunjuk node yang hilang. */
export type InstanceIssueKind = 'override' | 'prop' | 'slot' | 'bind';

/**
 * Referensi basi di sebuah instance (AD-12: diabaikan saat ekspansi dan dilaporkan). Hanya instance di lokasi
 * tersimpannya yang melapor; salinan di dalam instance lain tidak (supaya tidak dobel).
 */
export type InstanceIssue = {
  boardId: string;
  instanceId: string;
  instanceName: string;
  kind: InstanceIssueKind;
  /** Kunci yang basi: kunci override, nama prop, nama slot, atau `<prop>.<nodeId>` untuk bind. */
  key: string;
  detail: string;
};

/** Batas jumlah node hasil ekspansi per dokumen (pengaman ledakan instance bersarang). */
export const EXPANSION_NODES_MAX = 50_000;

const ISSUES = new WeakMap<object, readonly InstanceIssue[]>();

/** Laporan referensi basi milik hasil `expandInstances`/`resolveDocument` (kosong untuk objek lain). */
export function instanceIssues(doc: object): readonly InstanceIssue[] {
  return ISSUES.get(doc) ?? [];
}

/** Tempel laporan ke objek hasil (dipakai `resolveDocument` untuk meneruskan laporan tahap ekspansi). */
export function attachInstanceIssues<T extends object>(doc: T, issues: readonly InstanceIssue[]): T {
  if (issues.length) ISSUES.set(doc, Object.freeze([...issues]));
  return doc;
}

/** Kunci posisi akar instance: diambil dari instance, bukan dari master. */
const ROOT_KEYS = ['name', 'position', 'x', 'y', 'gridColumn', 'gridRow'] as const;

type Mut = Record<string, unknown> & { id: string; type: string; children?: Mut[] };

const ABSENT = Symbol('absent');

/**
 * Kunci (dari `candidates`) yang membuat node tidak sah terhadap skema dangkal tipenya; `null` = node sah;
 * `'all'` = tidak sah tetapi penyebabnya tidak bisa diatribusikan ke kandidat.
 */
function invalidKeys(node: Mut, candidates: readonly string[]): string[] | 'all' | null {
  const schema = EXPANDED_NODE_SHALLOW[node.type];
  if (!schema) return null;
  const { children: _c, ...flat } = node;
  const r = schema.safeParse(flat);
  if (r.success) return null;
  const hit = new Set<string>();
  for (const i of r.error.issues) {
    const keys = i.code === 'unrecognized_keys' ? i.keys : typeof i.path[0] === 'string' ? [i.path[0]] : [];
    for (const k of keys) if (candidates.includes(k)) hit.add(k);
  }
  return hit.size ? [...hit] : 'all';
}

/**
 * Terapkan `patch` (null menghapus) ke `target`. Properti yang membuat node tidak sah dikembalikan ke nilai
 * sebelumnya dan dikembalikan sebagai daftar; atribusi gagal → seluruh patch dikembalikan (AD-12: diabaikan).
 */
function applyLenient(target: Mut, patch: Readonly<Record<string, unknown>>): string[] {
  const before = new Map<string, unknown>();
  for (const [prop, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    before.set(prop, Object.hasOwn(target, prop) ? target[prop] : ABSENT);
    if (value === null) delete target[prop];
    else target[prop] = value;
  }
  const keys = [...before.keys()];
  const revert = (k: string) => {
    const v = before.get(k);
    if (v === ABSENT) delete target[k];
    else target[k] = v;
  };
  const bad = invalidKeys(target, keys);
  if (bad === null) return [];
  if (bad !== 'all') {
    bad.forEach(revert);
    if (invalidKeys(target, keys) === null) return bad;
  }
  keys.forEach(revert);
  return keys;
}

type Expander = {
  /** Salin node tersimpan (instance diekspansi). `owner` = alamat instance pemilik salinan (undefined = tersimpan). */
  copy(node: ChildNode, owner: string | undefined, stack: readonly string[]): Mut | null;
  issues: InstanceIssue[];
  setBoard(id: string): void;
};

/** Pabrik ekspansi untuk satu dokumen yang lolos `componentIssues`. */
function expander(doc: Doc): Expander {
  const masters = new Map<string, ChildNode & { component: ComponentDef }>();
  visitStored(doc, ({ node }) => {
    if (node.component !== undefined) masters.set(node.id as string, node as unknown as ChildNode & { component: ComponentDef });
  });
  const issues: InstanceIssue[] = [];
  let count = 0;
  let boardId = '';
  /** Alamat node salinan yang dibuang (visible:false, anak default slot yang terganti): bukan yatim bila dirujuk. */
  const removed = new Set<string>();
  const forget = (n: Mut) => {
    removed.add(n.id);
    n.children?.forEach(forget);
  };

  const copy = (node: ChildNode, owner: string | undefined, stack: readonly string[]): Mut | null => {
    // Hanya salinan di dalam instance yang dihitung (node hasil ekspansi), bukan node tersimpan biasa.
    if (owner !== undefined && ++count > EXPANSION_NODES_MAX) {
      throw new LakarError('SCHEMA_INVALID', `ekspansi instance melebihi ${EXPANSION_NODES_MAX} node`, {
        hint: 'kurangi instance bersarang atau detach sebagian instance',
      });
    }
    const addr = owner === undefined ? node.id : `${owner}/${node.id}`;
    if (node.type === 'instance') return expand(node, addr, owner, stack);
    const { children, ...rest } = node as ChildNode & { children?: ChildNode[] };
    const out = { ...rest, id: addr } as Mut;
    if (owner !== undefined) delete out.component;
    if (children) out.children = children.map((c) => copy(c, owner, stack)).filter((c): c is Mut => c !== null);
    return out;
  };

  const expand = (inst: InstanceNode, addr: string, owner: string | undefined, stack: readonly string[]): Mut | null => {
    const cid = inst.componentId;
    const master = masters.get(cid);
    // Sudah dijamin componentIssues; penjaga defensif bila dipanggil dengan dokumen yang tidak tervalidasi.
    if (!master || stack.includes(cid)) {
      throw new LakarError('SCHEMA_INVALID', `komponen tidak valid: instance ${addr} merujuk ${cid} (${master ? 'siklus' : 'tidak ada'})`, {
        hint: 'instance hanya boleh merujuk master di dokumen yang sama, tanpa siklus',
      });
    }
    const mark = issues.length;
    const issue = (kind: InstanceIssueKind, key: string, detail: string) => {
      if (owner === undefined) issues.push({ boardId, instanceId: inst.id, instanceName: inst.name, kind, key, detail });
    };
    const root = copy(master, addr, [...stack, cid])!;
    root.id = addr;
    for (const k of ROOT_KEYS) {
      delete root[k];
      if (inst[k] !== undefined) root[k] = inst[k];
    }
    const index = new Map<string, Mut>();
    const walk = (n: Mut) => {
      index.set(n.id, n);
      n.children?.forEach(walk);
    };
    walk(root);
    const full = (key: string) => (key === cid ? addr : `${addr}/${key}`);
    const at = (key: string) => index.get(full(key));
    /** Node ada di salinan tetapi dibuang instance bersarang (tersembunyi/terganti slot): diam, bukan yatim. */
    const gone = (key: string) => removed.has(full(key));
    const def = master.component;

    // Props: nilai instance yang sah, atau default; ditulis ke setiap bind (nilai yang membuat node tidak sah diabaikan).
    const hidden = new Set<Mut>();
    const given = inst.props ?? {};
    for (const name of Object.keys(given)) {
      if (!def.props.some((p) => p.name === name)) issue('prop', name, `tidak ada di master ${cid}`);
    }
    for (const p of def.props) {
      let value: string | boolean = p.default;
      if (Object.hasOwn(given, p.name)) {
        const g = given[p.name]!;
        const ok = p.type === 'boolean' ? typeof g === 'boolean' : typeof g === 'string' && (p.type !== 'enum' || p.options.includes(g));
        if (ok) value = g;
        else issue('prop', p.name, `nilai ${JSON.stringify(g)} tidak sah untuk prop ${p.type}${p.type === 'enum' ? ` (options: ${p.options.join(', ')})` : ''}; default dipakai`);
      }
      for (const b of p.binds) {
        const target = at(b.nodeId);
        if (!target) {
          if (!gone(b.nodeId)) issue('bind', `${p.name}.${b.nodeId}`, `node ${b.nodeId} tidak ada di master ${cid}`);
        } else if (b.prop === VISIBLE_BIND) {
          if (p.type !== 'boolean') issue('bind', `${p.name}.${b.nodeId}`, `bind "${VISIBLE_BIND}" hanya untuk prop boolean (bertipe ${p.type})`);
          else if (value === false) hidden.add(target);
        } else if (applyLenient(target, { [b.prop]: value }).length) {
          issue('bind', `${p.name}.${b.nodeId}`, `nilai ${JSON.stringify(value)} tidak sah untuk ${b.prop} pada ${target.type} ${b.nodeId}; bind diabaikan`);
        }
      }
    }

    // Override: merge dangkal per node; null menghapus properti master. Properti yang tidak lagi sah diabaikan.
    for (const [key, patch] of Object.entries(inst.overrides ?? {})) {
      const target = at(key);
      if (!target) {
        if (!gone(key)) issue('override', key, `node master tidak ada lagi di ${cid}; override diabaikan`);
        continue;
      }
      const bad = applyLenient(target, patch);
      if (bad.length) issue('override', key, `${bad.join(', ')} tidak sah lagi untuk ${target.type} di master ${cid}; override properti itu diabaikan`);
    }

    // Slot: isi tersimpan instance menggantikan anak frame slot (prefiks pemilik instance).
    const slots = inst.slots ?? {};
    for (const name of Object.keys(slots)) {
      if (!def.slots.some((s) => s.name === name)) issue('slot', name, `tidak ada di master ${cid}; isinya tidak ditampilkan`);
    }
    for (const s of def.slots) {
      const target = at(s.nodeId);
      if (!target || target.type !== 'frame') {
        if (target || !gone(s.nodeId)) issue('slot', s.name, target ? `node ${s.nodeId} bukan frame` : `frame ${s.nodeId} tidak ada di master ${cid}`);
        continue;
      }
      if (!Object.hasOwn(slots, s.name)) continue;
      target.children?.forEach(forget);
      target.children = slots[s.name]!.map((c) => copy(c, owner, stack)).filter((c): c is Mut => c !== null);
    }

    if (hidden.has(root)) {
      // Instance tersembunyi seluruhnya: laporan basinya tidak punya node di board untuk ditunjuk.
      issues.length = mark;
      forget(root);
      return null;
    }
    if (hidden.size) {
      const prune = (n: Mut) => {
        if (!n.children) return;
        n.children = n.children.filter((c) => {
          if (!hidden.has(c)) return true;
          forget(c);
          return false;
        });
        n.children.forEach(prune);
      };
      prune(root);
    }
    return root;
  };

  return {
    copy,
    issues,
    setBoard(id) {
      boardId = id;
    },
  };
}

function assertStructure(doc: Doc): void {
  const structural = componentIssues(doc);
  if (structural.length) {
    throw new LakarError('SCHEMA_INVALID', `komponen tidak valid: ${structural.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, {
      hint: 'instance hanya boleh merujuk master (node dengan component) di dokumen yang sama, tanpa siklus; master tidak boleh bersarang; ID node unik',
    });
  }
}

/**
 * Urai setiap instance menjadi salinan master (AD-12). Alamat: akar = id instance, turunan
 * `<alamatInstance>/<idTersimpan>`, bersarang `I/J/x`. Urutan: salin → props → override → slot → buang node
 * `visible:false`. Struktur rusak (siklus, master tak ada, master bersarang, ID ganda) → SCHEMA_INVALID. Nilai
 * bind/override yang membuat node efektif tidak sah diabaikan dan dilaporkan (`instanceIssues`), sehingga suntingan
 * master tidak pernah gagal karena override lama. Dokumen tanpa instance dikembalikan apa adanya.
 */
export function expandInstances(doc: Doc): ExpandedDocument {
  if (!hasComponents(doc)) return doc as unknown as ExpandedDocument;
  assertStructure(doc);
  if (!hasInstances(doc)) return doc as unknown as ExpandedDocument;
  const x = expander(doc);
  const pages = doc.pages.map((p) => ({
    ...p,
    children: p.children.map((b) => {
      x.setBoard(b.id);
      return { ...b, children: b.children.map((c) => x.copy(c, undefined, [])).filter((c): c is Mut => c !== null) };
    }),
  }));
  const out = { ...doc, pages };
  const r = ExpandedLakarDocument.safeParse(out);
  if (!r.success) {
    const where = [...new Set(r.error.issues.map((i) => addressAt(out, i.path)).filter((a): a is string => a !== undefined))];
    const e = zodToLakarError(r.error, 'instance tidak valid');
    throw new LakarError('SCHEMA_INVALID', where.length ? `${e.message} [node ${where.join(', ')}]` : e.message, {
      hint: 'nilai props/override instance harus sah untuk properti node master (skema sama dengan node biasa); null menghapus properti',
    });
  }
  return attachInstanceIssues(r.data, x.issues);
}

/**
 * Ekspansi satu instance tersimpan `instanceId` di lokasi tersimpannya (alamat akar = `instanceId`), seperti
 * bagian yang sama dari `expandInstances`. `undefined` = tidak ada instance tersimpan dengan id itu; `null` = akar
 * disembunyikan prop boolean instance sendiri. Dipakai core (override komposit, detach) dan exec (`get`).
 */
export function expandInstanceAt(doc: Doc, instanceId: string): ExpandedChildNode | null | undefined {
  let inst: InstanceNode | undefined;
  visitStored(doc, ({ node }) => {
    if (inst === undefined && node.type === 'instance' && node.id === instanceId) inst = node as unknown as InstanceNode;
  });
  if (!inst) return undefined;
  assertStructure(doc);
  return expander(doc).copy(inst, undefined, []) as unknown as ExpandedChildNode | null;
}

/**
 * Node efektif pada alamat (ID instance atau komposit `I/…`). `parentId`/`parent` = alamat dan node parent di dalam
 * ekspansi (`null` untuk akar instance); `names` = nama dari akar instance sampai node.
 */
export type ExpandedHit = { node: ExpandedChildNode; parentId: string | null; parent: ExpandedChildNode | null; names: string[] };

/**
 * Cari node hasil ekspansi pada `address` di dalam instance tersimpan terluar (segmen pertama). `undefined` bila
 * instance tidak ada, akarnya tersembunyi, atau alamat tidak ada di hasil ekspansi.
 */
export function expandedNodeAt(doc: Doc, address: string): ExpandedHit | undefined {
  const root = expandInstanceAt(doc, address.split('/')[0]!);
  if (!root) return undefined;
  const find = (n: ExpandedChildNode, parent: ExpandedChildNode | null, names: string[]): ExpandedHit | undefined => {
    const path = [...names, n.name];
    if (n.id === address) return { node: n, parentId: parent ? parent.id : null, parent, names: path };
    // Telusur penuh: isi slot instance tingkat atas memakai id tersimpan polos, jadi prefiks alamat tidak bisa dipakai memangkas.
    if (n.type === 'frame') {
      for (const c of n.children) {
        const hit = find(c, n, path);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  return find(root, null, []);
}

/** Alamat node terdalam di sepanjang `path` issue (undefined bila path tidak melewati node). */
function addressAt(doc: unknown, path: readonly PropertyKey[]): string | undefined {
  let cur: unknown = doc;
  let last: string | undefined;
  for (const seg of path) {
    if (typeof cur !== 'object' || cur === null) break;
    cur = (cur as Record<PropertyKey, unknown>)[seg as string];
    const id = typeof cur === 'object' && cur !== null && !Array.isArray(cur) ? (cur as { id?: unknown; type?: unknown }) : undefined;
    if (id && typeof id.id === 'string' && typeof id.type === 'string' && id.type !== 'board') last = id.id;
  }
  return last;
}
