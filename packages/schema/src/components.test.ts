// Komponen dan ekspansi instance (epic komponen story 2, AD-10/AD-12): matriks I/O spec komponen-2-schema.
import { describe, expect, it } from 'vitest';
import {
  EXPANSION_NODES_MAX,
  LakarDocument,
  LakarError,
  NodeInput,
  OVERRIDABLE_PROPS,
  SCHEMA_VERSION,
  componentIssues,
  expandInstances,
  instanceIssues,
  jsonSchemas,
  resolveDocument,
  resolveTokens,
  zodToLakarError,
  type LakarDocument as Doc,
} from './index.js';

type Raw = Record<string, unknown>;

const docOf = (children: unknown[], extra: Raw = {}): Raw => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'Dddddddd',
  rev: 0,
  ...extra,
  pages: [{ id: 'Pppppppp', name: 'P', children: [{ type: 'board', id: 'Bbbbbbbb', name: 'B', x: 0, y: 0, width: 400, height: 400, screen: 'app', children }] }],
});

const parse = (raw: unknown): Doc => {
  const r = LakarDocument.safeParse(raw);
  if (!r.success) throw zodToLakarError(r.error, 'dokumen tidak valid');
  return r.data;
};

const text = (id: string, content = 'Halo', extra: Raw = {}): Raw => ({ type: 'text', id, name: `Teks ${id}`, content, size: 14, ...extra });
const master = (extra: Raw = {}, children: unknown[] = [text('Tttttt01')], component: Raw = { props: [], slots: [] }): Raw => ({
  type: 'frame',
  id: 'Mmmmmmm1',
  name: 'Master',
  layout: 'column',
  fills: [{ type: 'solid', color: '#FFFFFF' }],
  component,
  children,
  ...extra,
});
const inst = (extra: Raw = {}, id = 'Iiiiiii1', componentId = 'Mmmmmmm1'): Raw => ({ type: 'instance', id, name: `Instance ${id}`, componentId, ...extra });

function thrown(fn: () => unknown): LakarError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(LakarError);
    return e as LakarError;
  }
  return expect.unreachable('seharusnya melempar') as never;
}

/** Semua node hasil ekspansi menurut alamat. */
function nodes(doc: { pages: { children: unknown[] }[] }): Map<string, Raw> {
  const out = new Map<string, Raw>();
  const walk = (n: Raw) => {
    out.set(String(n.id), n);
    if (Array.isArray(n.children)) (n.children as Raw[]).forEach(walk);
  };
  for (const p of doc.pages) for (const b of p.children as Raw[]) walk(b);
  return out;
}

describe('skema v5: komponen dan instance', () => {
  it('master dan instance valid; NodeInput menerima instance; jsonSchemas memuat instance', () => {
    expect(() => parse(docOf([master(), inst()]))).not.toThrow();
    expect(NodeInput.safeParse({ type: 'instance', name: 'I', componentId: 'Mmmmmmm1', props: { title: 'x', on: true }, overrides: { Tttttt01: { content: 'y' } } }).success).toBe(true);
    expect(JSON.stringify(jsonSchemas().node)).toContain('"const":"instance"');
  });

  it('OVERRIDABLE_PROPS: properti node tanpa type/id/children/component', () => {
    expect(OVERRIDABLE_PROPS).toEqual(expect.arrayContaining(['content', 'fills', 'name', 'icon', 'width', 'gridColumn']));
    for (const k of ['type', 'id', 'children', 'component']) expect(OVERRIDABLE_PROPS).not.toContain(k);
  });

  it.each([
    ['kunci override terlarang children', inst({ overrides: { Tttttt01: { children: [] } } })],
    ['kunci override terlarang type', inst({ overrides: { Tttttt01: { type: 'rect' } } })],
    ['kunci override bukan id', inst({ overrides: { 'bukan-id': { content: 'x' } } })],
    ['nilai props bukan string/boolean', inst({ props: { title: 3 } })],
    ['nama props tidak sah', inst({ props: { Title: 'x' } })],
    ['instance x tanpa absolute', inst({ x: 4 })],
    ['instance tanpa componentId', { type: 'instance', id: 'Iiiiiii1', name: 'I' }],
  ])('instance ditolak: %s', (_l, i) => {
    expect(thrown(() => parse(docOf([master(), i]))).code).toBe('SCHEMA_INVALID');
  });

  it.each([
    ['enum default di luar options', { props: [{ name: 'tone', type: 'enum', options: ['a', 'b'], default: 'c', binds: [] }], slots: [] }],
    ['enum options berulang', { props: [{ name: 'tone', type: 'enum', options: ['a', 'a'], default: 'a', binds: [] }], slots: [] }],
    ['nama prop/slot ganda', { props: [{ name: 'body', type: 'text', default: '', binds: [] }], slots: [{ name: 'body', nodeId: 'Tttttt01' }] }],
    ['default salah tipe', { props: [{ name: 'on', type: 'boolean', default: 'ya', binds: [] }], slots: [] }],
    ['bind ke properti terlarang', { props: [{ name: 'title', type: 'text', default: '', binds: [{ nodeId: 'Tttttt01', prop: 'children' }] }], slots: [] }],
    ['tanpa slots', { props: [] }],
  ])('definisi master ditolak: %s', (_l, component) => {
    expect(thrown(() => parse(docOf([master({}, undefined, component as Raw)]))).code).toBe('SCHEMA_INVALID');
  });
});

describe('validasi struktural (componentIssues)', () => {
  it('dokumen tanpa komponen: kosong', () => {
    expect(componentIssues(docOf([text('Tttttt01')]))).toEqual([]);
  });

  it('siklus langsung: master memuat instance dirinya', () => {
    const raw = docOf([master({}, [text('Tttttt01'), inst({}, 'Iiiiiii9')])]);
    const e = thrown(() => parse(raw));
    expect(e.code).toBe('SCHEMA_INVALID');
    expect(e.message).toContain('siklus komponen: Mmmmmmm1 → Mmmmmmm1');
    // Jalur commit (tanpa parse ulang): expandInstances juga menolak.
    expect(thrown(() => expandInstances(raw as unknown as Doc)).message).toContain('siklus komponen');
  });

  it('siklus tidak langsung M → N → M, termasuk lewat isi slot', () => {
    const n = master({ id: 'Nnnnnnn1', name: 'N' }, [inst({}, 'Iiiiiii8', 'Mmmmmmm1')]);
    const m = master({}, [inst({}, 'Iiiiiii7', 'Nnnnnnn1')]);
    expect(thrown(() => parse(docOf([m, n]))).message).toMatch(/siklus komponen: (Mmmmmmm1 → Nnnnnnn1 → Mmmmmmm1|Nnnnnnn1 → Mmmmmmm1 → Nnnnnnn1)/);
    const ns = master({ id: 'Nnnnnnn1', name: 'N' }, [{ type: 'frame', id: 'Ffffffs1', name: 'Slot', children: [] }], { props: [], slots: [{ name: 'body', nodeId: 'Ffffffs1' }] });
    const ms = master({}, [inst({ slots: { body: [inst({}, 'Iiiiiii6', 'Mmmmmmm1')] } }, 'Iiiiiii7', 'Nnnnnnn1')]);
    expect(thrown(() => parse(docOf([ms, ns]))).message).toContain('siklus komponen');
  });

  it('instance di slot instance lain dengan master yang sama bukan siklus', () => {
    const m = master({}, [{ type: 'frame', id: 'Ffffffs1', name: 'Slot', children: [] }], { props: [], slots: [{ name: 'body', nodeId: 'Ffffffs1' }] });
    expect(() => parse(docOf([m, inst({ slots: { body: [inst({}, 'Iiiiiii2')] } })]))).not.toThrow();
  });

  it.each([
    ['master tak ada', [inst({}, 'Iiiiiii1', 'Gone1234')], 'komponen Gone1234 tidak ada'],
    ['master bersarang', [master({}, [master({ id: 'Mmmmmmm2', name: 'M2' })])], 'tidak boleh bersarang'],
    ['master di isi slot', [master({}, [{ type: 'frame', id: 'Ffffffs1', name: 'S', children: [] }], { props: [], slots: [{ name: 'body', nodeId: 'Ffffffs1' }] }), inst({ slots: { body: [master({ id: 'Mmmmmmm3' })] } })], 'isi slot'],
    ['ID ganda di isi slot', [master({}, [{ type: 'frame', id: 'Ffffffs1', name: 'S', children: [] }], { props: [], slots: [{ name: 'body', nodeId: 'Ffffffs1' }] }), inst({ slots: { body: [text('Ffffffs1')] } })], 'lebih dari sekali'],
  ])('%s → SCHEMA_INVALID', (_l, children, msg) => {
    const e = thrown(() => parse(docOf(children)));
    expect(e.code).toBe('SCHEMA_INVALID');
    expect(e.message).toContain(msg);
  });
});

describe('expandInstances', () => {
  it('tanpa komponen: dokumen dikembalikan apa adanya', () => {
    const d = parse(docOf([text('Tttttt01')]));
    expect(expandInstances(d)).toBe(d);
  });

  it('ekspansi dasar: akar beralamat instance, turunan komposit, posisi dari instance, tanpa component; input tidak dimutasi', () => {
    const d = parse(docOf([master({ position: 'absolute', x: 10, y: 20 }), inst({ name: 'Kartu A' })]));
    const before = structuredClone(d);
    const out = expandInstances(d);
    const at = nodes(out);
    expect(at.get('Iiiiiii1')).toMatchObject({ type: 'frame', name: 'Kartu A', layout: 'column' });
    const root = at.get('Iiiiiii1')!;
    expect([root.component, root.position, root.x, root.y]).toEqual([undefined, undefined, undefined, undefined]);
    expect(at.get('Iiiiiii1/Tttttt01')).toMatchObject({ type: 'text', content: 'Halo' });
    expect(at.get('Mmmmmmm1')!.component).toEqual({ props: [], slots: [] });
    expect(d).toEqual(before);
    expect(expandInstances(d)).toEqual(out);
  });

  it('mengubah master memperbarui instance; override tetap', () => {
    const raw = (fill: string) => docOf([master({ fills: [{ type: 'solid', color: fill }] }), inst({ overrides: { Tttttt01: { content: 'X' } } }), inst({}, 'Iiiiiii2')]);
    const at = nodes(expandInstances(parse(raw('#E0F2FE'))));
    expect(at.get('Iiiiiii1')!.fills).toEqual([{ type: 'solid', color: '#E0F2FE' }]);
    expect(at.get('Iiiiiii2')!.fills).toEqual([{ type: 'solid', color: '#E0F2FE' }]);
    expect(at.get('Iiiiiii1/Tttttt01')!.content).toBe('X');
    expect(at.get('Iiiiiii2/Tttttt01')!.content).toBe('Halo');
  });

  it('override akar dengan null menghapus properti master', () => {
    const at = nodes(expandInstances(parse(docOf([master(), inst({ overrides: { Mmmmmmm1: { fills: null, padding: 8 } } })]))));
    expect(at.get('Iiiiiii1')!.fills).toBeUndefined();
    expect(at.get('Iiiiiii1')!.padding).toBe(8);
  });

  it('instance bersarang: alamat tiga segmen dan override instance terluar menang', () => {
    const k = master({ id: 'Kkkkkkk1', name: 'K' }, [text('Uuuuuuu1', 'dalam')]);
    const m = master({}, [inst({ overrides: { Uuuuuuu1: { content: 'dari M' } } }, 'Jjjjjjj1', 'Kkkkkkk1')]);
    const at = nodes(expandInstances(parse(docOf([k, m, inst({ overrides: { 'Jjjjjjj1/Uuuuuuu1': { content: 'Y' } } })]))));
    expect(at.get('Iiiiiii1/Jjjjjjj1')).toMatchObject({ type: 'frame', name: 'Instance Jjjjjjj1' });
    expect(at.get('Iiiiiii1/Jjjjjjj1/Uuuuuuu1')!.content).toBe('Y');
    // Di lokasi tersimpannya (di dalam master M), J memakai override miliknya sendiri.
    expect(at.get('Jjjjjjj1/Uuuuuuu1')!.content).toBe('dari M');
  });

  it('props: text → content, boolean → visible, enum → icon; nilai instance atau default', () => {
    const component = {
      props: [
        { name: 'title', type: 'text', default: 'Judul', binds: [{ nodeId: 'Tttttt01', prop: 'content' }] },
        { name: 'showIcon', type: 'boolean', default: true, binds: [{ nodeId: 'Cccccc01', prop: 'visible' }] },
        { name: 'tone', type: 'enum', options: ['star', 'check'], default: 'star', binds: [{ nodeId: 'Cccccc01', prop: 'icon' }] },
      ],
      slots: [],
    };
    const icon = { type: 'icon', id: 'Cccccc01', name: 'Ikon', lib: 'lucide', icon: 'house', size: 16 };
    const m = master({}, [text('Tttttt01'), icon], component);
    const d = parse(docOf([m, inst(), inst({ props: { title: 'Baru', tone: 'check' } }, 'Iiiiiii2'), inst({ props: { showIcon: false } }, 'Iiiiiii3')]));
    const at = nodes(expandInstances(d));
    expect(at.get('Iiiiiii1/Tttttt01')!.content).toBe('Judul');
    expect(at.get('Iiiiiii1/Cccccc01')!.icon).toBe('star');
    expect(at.get('Iiiiiii2/Tttttt01')!.content).toBe('Baru');
    expect(at.get('Iiiiiii2/Cccccc01')!.icon).toBe('check');
    expect(at.has('Iiiiiii3/Cccccc01')).toBe(false);
    expect(at.has('Iiiiiii3/Tttttt01')).toBe(true);
    // Master sendiri tidak menerapkan default props (hanya instance).
    expect(at.get('Tttttt01')!.content).toBe('Halo');
  });

  it('boolean visible pada akar menghapus seluruh instance', () => {
    const component = { props: [{ name: 'on', type: 'boolean', default: true, binds: [{ nodeId: 'Mmmmmmm1', prop: 'visible' }] }], slots: [] };
    const at = nodes(expandInstances(parse(docOf([master({}, undefined, component), inst({ props: { on: false } })]))));
    expect(at.has('Iiiiiii1')).toBe(false);
  });

  it('slot: isi instance menggantikan anak frame slot dengan ID tersimpannya; tanpa isi → anak master', () => {
    const slotFrame = { type: 'frame', id: 'Ffffffs1', name: 'Slot', layout: 'column', children: [text('Tttttt02', 'bawaan')] };
    const m = master({}, [text('Tttttt01'), slotFrame], { props: [], slots: [{ name: 'body', nodeId: 'Ffffffs1' }] });
    const at = nodes(expandInstances(parse(docOf([m, inst({ slots: { body: [text('Sssssss1', 'isi')] } }), inst({}, 'Iiiiiii2')]))));
    expect((at.get('Iiiiiii1/Ffffffs1')!.children as Raw[]).map((c) => c.id)).toEqual(['Sssssss1']);
    expect(at.get('Sssssss1')!.content).toBe('isi');
    expect((at.get('Iiiiiii2/Ffffffs1')!.children as Raw[]).map((c) => c.id)).toEqual(['Iiiiiii2/Tttttt02']);
  });

  it('override yatim dan referensi basi: diabaikan dan dilaporkan sekali per instance tersimpan', () => {
    const component = {
      props: [
        { name: 'title', type: 'text', default: 'Judul', binds: [{ nodeId: 'Gone0001', prop: 'content' }] },
        { name: 'tone', type: 'enum', options: ['a', 'b'], default: 'a', binds: [] },
      ],
      slots: [{ name: 'body', nodeId: 'Tttttt01' }],
    };
    const d = parse(docOf([master({}, undefined, component), inst({ props: { tone: 'z', extra: 'x' }, overrides: { Gone1234: { content: 'x' }, Tttttt01: { content: 'ok' } }, slots: { other: [] } })]));
    const out = expandInstances(d);
    expect(nodes(out).get('Iiiiiii1/Tttttt01')!.content).toBe('ok');
    const issues = instanceIssues(out).map((i) => `${i.kind}:${i.key}`);
    expect(issues.sort()).toEqual(['bind:title.Gone0001', 'override:Gone1234', 'prop:extra', 'prop:tone', 'slot:body', 'slot:other']);
    expect(instanceIssues(out).every((i) => i.boardId === 'Bbbbbbbb' && i.instanceId === 'Iiiiiii1' && i.instanceName === 'Instance Iiiiiii1')).toBe(true);
    // resolveDocument meneruskan laporan ke hasilnya.
    expect(instanceIssues(resolveDocument(d))).toHaveLength(6);
  });

  it('instance di dalam master melapor sekali (lokasi tersimpan), salinannya tidak', () => {
    const k = master({ id: 'Kkkkkkk1', name: 'K' });
    const m = master({}, [inst({ overrides: { Gone1234: { content: 'x' } } }, 'Jjjjjjj1', 'Kkkkkkk1')]);
    const out = expandInstances(parse(docOf([k, m, inst(), inst({}, 'Iiiiiii2')])));
    expect(instanceIssues(out).map((i) => i.instanceId)).toEqual(['Jjjjjjj1']);
  });

  it('override bernilai tidak sah → SCHEMA_INVALID "instance tidak valid" dengan alamat node', () => {
    const e = thrown(() => expandInstances(parse(docOf([master(), inst({ overrides: { Tttttt01: { size: -1 } } })]))));
    expect(e.code).toBe('SCHEMA_INVALID');
    expect(e.message).toContain('instance tidak valid');
    expect(e.message).toContain('Iiiiiii1/Tttttt01');
  });

  it('token salah slot lewat override → SCHEMA_INVALID token salah tipe (resolveDocument)', () => {
    const tokens = { 'space.4': { type: 'spacing', value: 16 } };
    const e = thrown(() => resolveDocument(parse(docOf([master(), inst({ overrides: { Tttttt01: { color: { $token: 'space.4' } } } })], { tokens }))));
    expect(e.code).toBe('SCHEMA_INVALID');
    expect(e.message).toContain('token salah tipe');
  });

  it('token tak dikenal di override yatim → TOKEN_UNKNOWN', () => {
    const e = thrown(() => resolveDocument(parse(docOf([master(), inst({ overrides: { Gone1234: { color: { $token: 'colors.nope' } } } })]))));
    expect(e.code).toBe('TOKEN_UNKNOWN');
  });

  it('token di master di-resolve per instance; hasil resolveDocument berisi alamat komposit', () => {
    const tokens = { 'colors.a': { type: 'color', value: '#111111' } };
    const r = resolveDocument(parse(docOf([master({}, [text('Tttttt01', 'x', { color: { $token: 'colors.a' } })]), inst()], { tokens })));
    expect(nodes(r).get('Iiiiiii1/Tttttt01')!.color).toBe('#111111');
  });

  it('batas ekspansi: ledakan instance bersarang ditolak', () => {
    // Rantai 6 master, masing-masing memuat 8 instance master berikutnya: 8^6 node.
    const ids = ['Aaaaaaa1', 'Aaaaaaa2', 'Aaaaaaa3', 'Aaaaaaa4', 'Aaaaaaa5', 'Aaaaaaa6'];
    let n = 0;
    const id = () => `Xx${String(n++).padStart(6, '0')}`;
    const masters = ids.map((mid, i) =>
      master({ id: mid, name: mid }, i === ids.length - 1 ? [text(id())] : Array.from({ length: 8 }, () => inst({}, id(), ids[i + 1]))),
    );
    expect(8 ** 5).toBeGreaterThan(EXPANSION_NODES_MAX / 2);
    const e = thrown(() => expandInstances(parse(docOf([...masters, inst({}, id(), ids[0])]))));
    expect(e.message).toContain(`ekspansi instance melebihi ${EXPANSION_NODES_MAX} node`);
  });
});

describe('expandInstances: hasil review', () => {
  const slotMaster = (id: string, kids: unknown[] = [text(`${id.slice(0, 6)}t1`, 'bawaan')]) =>
    master({ id, name: id }, [{ type: 'frame', id: `${id.slice(0, 6)}s1`, name: 'Slot', layout: 'column', children: kids }], {
      props: [{ name: 'on', type: 'boolean', default: true, binds: [{ nodeId: `${id.slice(0, 6)}s1`, prop: 'visible' }] }],
      slots: [{ name: 'body', nodeId: `${id.slice(0, 6)}s1` }],
    });

  it('override ke node bersarang yang disembunyikan atau terganti slot instance dalam: bukan yatim', () => {
    const k = slotMaster('Kkkkkkk1');
    const hide = master({}, [inst({ props: { on: false } }, 'Jjjjjjj1', 'Kkkkkkk1')]);
    const out1 = expandInstances(parse(docOf([k, hide, inst({ overrides: { 'Jjjjjjj1/Kkkkkkt1': { content: 'x' }, 'Jjjjjjj1/Kkkkkks1': { padding: 4 } } })])));
    expect(instanceIssues(out1)).toEqual([]);
    const fill = master({}, [inst({ slots: { body: [text('Sssssss1', 'isi')] } }, 'Jjjjjjj1', 'Kkkkkkk1')]);
    const out2 = expandInstances(parse(docOf([k, fill, inst({ overrides: { 'Jjjjjjj1/Kkkkkkt1': { content: 'x' }, Sssssss1: { content: 'y' } } })])));
    expect(instanceIssues(out2)).toEqual([]);
    expect(nodes(out2).get('Iiiiiii1/Sssssss1')!.content).toBe('y');
  });

  it('instance di isi slot: alamat memakai prefiks pemilik (tingkat atas dan di dalam salinan master)', () => {
    const k = master({ id: 'Kkkkkkk1', name: 'K' }, [text('Uuuuuuu1', 'dalam')]);
    const n = slotMaster('Nnnnnnn1');
    const m = master({}, [inst({ slots: { body: [inst({}, 'Lllllll1', 'Kkkkkkk1')] } }, 'Jjjjjjj1', 'Nnnnnnn1')]);
    const at = nodes(expandInstances(parse(docOf([k, n, m, inst(), inst({ slots: { body: [inst({}, 'Lllllll2', 'Kkkkkkk1')] } }, 'Iiiiiii2', 'Nnnnnnn1')]))));
    expect(at.get('Lllllll1/Uuuuuuu1')!.content).toBe('dalam');
    expect(at.get('Iiiiiii1/Lllllll1/Uuuuuuu1')!.content).toBe('dalam');
    expect((at.get('Iiiiiii1/Jjjjjjj1/Nnnnnns1')!.children as Raw[]).map((c) => c.id)).toEqual(['Iiiiiii1/Lllllll1']);
    expect(at.get('Lllllll2/Uuuuuuu1')!.content).toBe('dalam');
  });

  it('laporan basi membawa board tempat instance tersimpan (dua board)', () => {
    const raw = docOf([master(), inst({ overrides: { Gone0001: { content: 'x' } } })]) as { pages: { children: Raw[] }[] };
    raw.pages[0]!.children.push({ type: 'board', id: 'Bbbbbbb2', name: 'B2', x: 500, y: 0, width: 400, height: 400, screen: 'app', children: [inst({ overrides: { Gone0002: { content: 'y' } } }, 'Iiiiiii2')] });
    const issues = instanceIssues(expandInstances(parse(raw)));
    expect(issues.map((i) => [i.boardId, i.instanceId, i.key])).toEqual([
      ['Bbbbbbbb', 'Iiiiiii1', 'Gone0001'],
      ['Bbbbbbb2', 'Iiiiiii2', 'Gone0002'],
    ]);
  });

  it('instance yang akarnya disembunyikan prop sendiri: tidak melapor (tidak ada node untuk ditunjuk)', () => {
    const component = { props: [{ name: 'on', type: 'boolean', default: true, binds: [{ nodeId: 'Mmmmmmm1', prop: 'visible' }] }], slots: [] };
    const out = expandInstances(parse(docOf([master({}, undefined, component), inst({ props: { on: false }, overrides: { Gone1234: { content: 'x' } } })])));
    expect(instanceIssues(out)).toEqual([]);
  });

  it('resolveTokens pada dokumen tersimpan berisi instance (jalur codegen): instance utuh, ref token diganti', () => {
    const tokens = { 'colors.a': { type: 'color', value: '#111111' } };
    const d = parse(docOf([master({}, [text('Tttttt01', 'x', { color: { $token: 'colors.a' } })]), inst({ overrides: { Tttttt01: { color: { $token: 'colors.a' } } } })], { tokens }));
    const r = resolveTokens(d);
    const at = nodes(r);
    expect(at.get('Tttttt01')!.color).toBe('#111111');
    expect(at.get('Iiiiiii1')).toMatchObject({ type: 'instance', componentId: 'Mmmmmmm1', overrides: { Tttttt01: { color: '#111111' } } });
  });
});
