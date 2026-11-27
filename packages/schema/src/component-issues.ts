// Validasi struktural komponen (AD-12): master yang dirujuk instance ada, tanpa siklus, tanpa master bersarang,
// ID tersimpan unik (termasuk isi slot). Dipakai `LakarDocument` (superRefine) dan `expandInstances`.
// Sengaja tanpa impor nilai dari nodes.ts (nodes.ts mengimpor modul ini) dan toleran terhadap input mentah.

export type ComponentIssue = { path: (string | number)[]; message: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Satu node tersimpan yang dikunjungi, beserta konteks pohonnya. */
export type StoredVisit = {
  node: Obj;
  path: (string | number)[];
  /** Index board pemilik (`pages[page].children[board]`). */
  page: number;
  board: number;
  /** Id master terdekat yang memuat node ini (bukan node itu sendiri). */
  master: string | undefined;
  /** True bila node berada di isi slot sebuah instance. */
  inSlot: boolean;
};

/**
 * Kunjungi setiap node tersimpan di bawah board (pre-order): anak frame dan isi slot instance. Board sendiri tidak
 * ikut dikunjungi. Toleran terhadap input mentah.
 */
export function visitStored(doc: unknown, visit: (v: StoredVisit) => void): void {
  if (!isObj(doc) || !Array.isArray(doc.pages)) return;
  const walk = (node: unknown, path: (string | number)[], page: number, board: number, master: string | undefined, inSlot: boolean) => {
    if (!isObj(node)) return;
    visit({ node, path, page, board, master, inSlot });
    const inner = isObj(node.component) && typeof node.id === 'string' ? (master ?? node.id) : master;
    if (Array.isArray(node.children)) node.children.forEach((c, i) => walk(c, [...path, 'children', i], page, board, inner, inSlot));
    if (node.type === 'instance' && isObj(node.slots)) {
      for (const [name, list] of Object.entries(node.slots)) {
        if (Array.isArray(list)) list.forEach((c, i) => walk(c, [...path, 'slots', name, i], page, board, inner, true));
      }
    }
  };
  doc.pages.forEach((p, pi) => {
    if (!isObj(p) || !Array.isArray(p.children)) return;
    p.children.forEach((b, bi) => {
      if (isObj(b) && Array.isArray(b.children)) b.children.forEach((c, i) => walk(c, ['pages', pi, 'children', bi, 'children', i], pi, bi, undefined, false));
    });
  });
}

/** True bila dokumen memuat setidaknya satu instance. */
export function hasInstances(doc: unknown): boolean {
  let found = false;
  visitStored(doc, ({ node }) => {
    if (node.type === 'instance') found = true;
  });
  return found;
}

/** True bila dokumen memuat instance atau master (penentu jalur cepat); `variantOf` yatim ikut dihitung. */
export function hasComponents(doc: unknown): boolean {
  let found = false;
  visitStored(doc, ({ node }) => {
    if (node.type === 'instance' || node.component !== undefined || node.variantOf !== undefined) found = true;
  });
  return found;
}

/** Masalah struktural komponen; kosong bila dokumen tanpa master/instance. */
export function componentIssues(doc: unknown): ComponentIssue[] {
  if (!hasComponents(doc)) return [];
  const out: ComponentIssue[] = [];
  const masters = new Map<string, StoredVisit>();
  const instances: StoredVisit[] = [];
  const seen = new Map<string, (string | number)[]>();
  const outerIds = new Set<string>();
  if (isObj(doc) && Array.isArray(doc.pages)) {
    for (const p of doc.pages) {
      if (isObj(p) && typeof p.id === 'string') outerIds.add(p.id);
      if (isObj(p) && Array.isArray(p.children)) for (const b of p.children) if (isObj(b) && typeof b.id === 'string') outerIds.add(b.id);
    }
  }
  visitStored(doc, (v) => {
    const id = typeof v.node.id === 'string' ? v.node.id : undefined;
    if (id !== undefined) {
      const prev = seen.get(id);
      if (prev || outerIds.has(id)) {
        out.push({ path: [...v.path, 'id'], message: `ID ${id} dipakai lebih dari sekali${prev ? ` (juga di ${prev.join('.')})` : ''}; ID node harus unik di dokumen, termasuk isi slot` });
      } else seen.set(id, v.path);
    }
    if (v.node.component !== undefined && id !== undefined) {
      if (v.master !== undefined) out.push({ path: [...v.path, 'component'], message: `master ${id} berada di dalam master ${v.master}; master tidak boleh bersarang` });
      else if (v.inSlot) out.push({ path: [...v.path, 'component'], message: `master ${id} berada di isi slot instance; master hanya boleh di pohon board` });
      else masters.set(id, v);
    }
    // v16: `variantOf` pada non-master langsung dilaporkan (master-nya ikut dikumpulkan di atas).
    if (isObj(v.node.variantOf) && v.node.component === undefined) {
      out.push({ path: [...v.path, 'variantOf'], message: `variantOf hanya pada node master (node dengan component); hapus variantOf atau jadikan master lewat setComponent` });
    }
    if (v.node.type === 'instance') instances.push(v);
  });

  // Variant set (v16): semua master satu `set` wajib axis yang sama dan kombinasi nilai unik; axis = prop enum
  // master itu sendiri (nama ada + nilai salah satu options).
  /** Kunci kombinasi nilai axis: entri diurut agar {a:1,b:2} ≡ {b:2,a:1}. */
  const comboKey = (props: Obj) => Object.keys(props).sort().map((k) => `${k}=${String(props[k])}`).join('\n');
  const axesOf = (props: Obj) => Object.keys(props).sort().join(',');
  /** set → master pertama (acuan axis) dan peta kombinasi → id master. */
  const sets = new Map<string, { axes: string; combos: Map<string, string> }>();
  for (const [id, v] of masters) {
    const vo = v.node.variantOf;
    if (!isObj(vo) || typeof vo.set !== 'string' || !isObj(vo.props)) continue;
    const comp = isObj(v.node.component) ? v.node.component : {};
    const props = Array.isArray(comp.props) ? comp.props : [];
    const enums = new Map<string, unknown[]>();
    for (const p of props) if (isObj(p) && p.type === 'enum' && typeof p.name === 'string') enums.set(p.name, Array.isArray(p.options) ? p.options : []);
    for (const [axis, value] of Object.entries(vo.props)) {
      const opts = enums.get(axis);
      if (opts === undefined) {
        out.push({ path: [...v.path, 'variantOf', 'props', axis], message: `axis ${JSON.stringify(axis)} bukan prop enum master ${id}; nama axis harus nama prop bertipe enum` });
      } else if (!opts.includes(value)) {
        out.push({ path: [...v.path, 'variantOf', 'props', axis], message: `nilai axis ${JSON.stringify(axis)} harus salah satu options [${opts.map(String).join(', ')}]` });
      }
    }
    const s = sets.get(vo.set) ?? { axes: axesOf(vo.props), combos: new Map<string, string>() };
    if (!sets.has(vo.set)) sets.set(vo.set, s);
    else if (axesOf(vo.props) !== s.axes) {
      out.push({ path: [...v.path, 'variantOf', 'props'], message: `master ${id}: axis ${JSON.stringify(axesOf(vo.props))} ≠ axis set ${JSON.stringify(vo.set)} (${s.axes}); semua master dalam satu set wajib axis yang sama` });
    }
    const key = comboKey(vo.props);
    const dup = s.combos.get(key);
    if (dup !== undefined) {
      out.push({ path: [...v.path, 'variantOf', 'props'], message: `kombinasi ${key.split('\n').join(', ')} sudah dipakai master ${dup} di set ${JSON.stringify(vo.set)}; kombinasi varian harus unik` });
    } else s.combos.set(key, id);
  }
  /** Tepi graf: master → komponen yang dipakai instance di dalamnya. */
  const edges = new Map<string, { to: string; path: (string | number)[] }[]>();
  for (const inst of instances) {
    const cid = inst.node.componentId;
    if (typeof cid !== 'string') continue;
    if (!masters.has(cid)) {
      out.push({
        path: [...inst.path, 'componentId'],
        message: `instance ${String(inst.node.id)}: komponen ${cid} tidak ada (componentId harus id node master yang membawa component di dokumen ini)`,
      });
      continue;
    }
    // v16: `variant` memilih master dalam set anchor — anchor wajib `variantOf`, axis lengkap, kombinasi ada.
    const variant = inst.node.variant;
    if (isObj(variant)) {
      const anchor = masters.get(cid)!.node;
      const vo = isObj(anchor.variantOf) && typeof anchor.variantOf.set === 'string' && isObj(anchor.variantOf.props) ? anchor.variantOf : undefined;
      const s = vo ? sets.get(vo.set as string) : undefined;
      if (!vo || !s) {
        out.push({ path: [...inst.path, 'variant'], message: `instance ${String(inst.node.id)}: variant hanya untuk instance yang componentId-nya master varian (punya variantOf)` });
      } else {
        const want = axesOf(variant);
        if (want !== s.axes) {
          out.push({ path: [...inst.path, 'variant'], message: `instance ${String(inst.node.id)}: axis variant ${JSON.stringify(want)} ≠ axis set ${JSON.stringify(String(vo.set))} (${s.axes}); semua axis wajib diisi` });
        } else if (!s.combos.has(comboKey(variant))) {
          out.push({ path: [...inst.path, 'variant'], message: `instance ${String(inst.node.id)}: tidak ada varian ${comboKey(variant).split('\n').join(', ')} di set ${JSON.stringify(String(vo.set))}` });
        }
      }
    }
    if (inst.master !== undefined) {
      const list = edges.get(inst.master) ?? [];
      list.push({ to: cid, path: [...inst.path, 'componentId'] });
      edges.set(inst.master, list);
    }
  }
  // DFS warna: tepi ke simpul abu-abu = siklus. Setiap tepi balik dilaporkan sekali.
  const state = new Map<string, 'grey' | 'black'>();
  const stack: string[] = [];
  const dfs = (m: string) => {
    state.set(m, 'grey');
    stack.push(m);
    for (const e of edges.get(m) ?? []) {
      const s = state.get(e.to);
      if (s === 'grey') {
        const cycle = [...stack.slice(stack.indexOf(e.to)), e.to];
        out.push({ path: e.path, message: `siklus komponen: ${cycle.join(' → ')}; master tidak boleh memuat instance dirinya sendiri (langsung atau lewat komponen lain)` });
      } else if (s === undefined) dfs(e.to);
    }
    stack.pop();
    state.set(m, 'black');
  };
  for (const m of masters.keys()) if (!state.has(m)) dfs(m);
  return out;
}
