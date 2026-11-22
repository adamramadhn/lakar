import { describe, expect, it } from 'vitest';
import type { LakarDocument } from '@lakar/schema';
import { componentInfo } from './componentModel.js';
import {
  addPropOps,
  addSlotOps,
  bindProps,
  bindText,
  camelName,
  defaultText,
  instanceModel,
  masterModel,
  masterOfNode,
  moveCandidates,
  nameProblem,
  parseOptions,
  propValue,
  removePropOps,
  removeSlotOps,
  renameSlotOps,
  setInstancePropOps,
  slotFrameCandidates,
  slotFrameInfo,
  uniqueName,
  updatePropOps,
} from './componentProps.js';

/**
 * Board Home: Wrap (WrapAAAA) > master Card (CardAAAA: teks TitleAAA, rect TagAAAAA, frame BodyAAAA > InnerAAA,
 * frame SideAAAA); prop `title` (bind Title content); slot `body` (Body). Instance InstAAAA (props title "X", isi slot
 * body = SlotAAAA) dan InstBBBB di Row (RowAAAAA, berisi LooseAAA juga).
 */
function doc(): LakarDocument {
  return {
    pages: [
      {
        id: 'PageAAAA',
        name: 'Page 1',
        children: [
          {
            id: 'HomeAAAA',
            type: 'board',
            name: 'Home',
            x: 0,
            y: 0,
            width: 400,
            height: 400,
            children: [
              {
                id: 'WrapAAAA',
                type: 'frame',
                name: 'Wrap',
                children: [
                  {
                    id: 'CardAAAA',
                    type: 'frame',
                    name: 'Card',
                    component: { props: [{ name: 'title', type: 'text', default: 'Hi', binds: [{ nodeId: 'TitleAAA', prop: 'content' }] }], slots: [{ name: 'body', nodeId: 'BodyAAAA' }] },
                    children: [
                      { id: 'TitleAAA', type: 'text', name: 'Title', content: 'Hi', size: 12 },
                      { id: 'TagAAAAA', type: 'rect', name: 'Tag' },
                      { id: 'BodyAAAA', type: 'frame', name: 'Body', children: [{ id: 'InnerAAA', type: 'text', name: 'Inner', content: 'a', size: 12 }] },
                      { id: 'SideAAAA', type: 'frame', name: 'Side panel', children: [] },
                    ],
                  },
                ],
              },
              {
                id: 'RowAAAAA',
                type: 'frame',
                name: 'Row',
                children: [
                  { id: 'InstAAAA', type: 'instance', name: 'Card', componentId: 'CardAAAA', props: { title: 'X' }, slots: { body: [{ id: 'SlotAAAA', type: 'rect', name: 'Slotted' }] } },
                  { id: 'InstBBBB', type: 'instance', name: 'Card', componentId: 'CardAAAA' },
                  { id: 'LooseAAA', type: 'rect', name: 'Loose' },
                ],
              },
            ],
          },
        ],
      },
    ],
  } as unknown as LakarDocument;
}
const info = (d = doc()) => componentInfo(d);

describe('nama prop/slot', () => {
  it('camelCase dari nama layer, fallback bila tidak sah, unik dengan sufiks', () => {
    expect(camelName('Brand title', 'text')).toBe('brandTitle');
    expect(camelName('Side panel', 'content')).toBe('sidePanel');
    expect(camelName('123', 'text')).toBe('text');
    expect(camelName('', 'show')).toBe('show');
    expect(camelName('2 Column', 'text')).toBe('column');
    expect(camelName('3D View', 'text')).toBe('dView');
    const def = { props: [{ name: 'show', type: 'boolean', default: true, binds: [] }], slots: [{ name: 'show2', nodeId: 'BodyAAAA' }] } as never;
    expect(uniqueName(def, 'show')).toBe('show3');
    expect(uniqueName(def, 'title')).toBe('title');
    expect(nameProblem(def, 'Bad name')).toMatch(/camelCase/);
    expect(nameProblem(def, 'show2', 'show')).toMatch(/already used/);
    expect(nameProblem(def, 'show', 'show')).toBeUndefined();
  });
});

describe('properti bind per tipe', () => {
  it('text → content teks; boolean → visible kecuali akar; enum → properti string', () => {
    expect(bindProps('text', 'text', false)).toEqual(['content']);
    expect(bindProps('text', 'rect', false)).toEqual([]);
    expect(bindProps('boolean', 'rect', false)).toEqual(['visible']);
    expect(bindProps('boolean', 'frame', true)).toEqual([]);
    expect(bindProps('enum', 'text', false)).toEqual(['content', 'color', 'align', 'family', 'blend']);
    expect(bindProps('enum', 'frame', true)).toEqual(['layout', 'align', 'justify', 'blend']);
    expect(bindProps('enum', 'instance', false)).toEqual([]);
    expect(bindProps('text', 'icon', false)).toEqual(['icon']);
    expect(bindProps('enum', 'icon', false)).toEqual(['icon', 'color', 'blend']);
  });
  it('teks baris: default dan target bind', () => {
    expect(defaultText({ name: 'a', type: 'text', default: 'Brand', binds: [] })).toBe('“Brand”');
    expect(defaultText({ name: 'a', type: 'enum', options: ['x', 'y', 'z'], default: 'x', binds: [] })).toBe('x · 3');
    const nameOf = (id: string) => ({ TitleAAA: 'Title' })[id];
    expect(bindText([], 'CardAAAA', nameOf)).toBe('Not bound');
    expect(bindText([{ nodeId: 'TitleAAA', prop: 'content' }], 'CardAAAA', nameOf)).toBe('Title');
    expect(bindText([{ nodeId: 'TitleAAA', prop: 'color' }], 'CardAAAA', nameOf)).toBe('Title · Color');
    expect(bindText([{ nodeId: 'CardAAAA', prop: 'layout' }], 'CardAAAA', nameOf)).toBe('Layout');
    expect(bindText([{ nodeId: 'TitleAAA', prop: 'content' }, { nodeId: 'TagAAAAA', prop: 'blend' }], 'CardAAAA', nameOf)).toBe('2 bindings');
    expect(parseOptions(' a, b,,a , c ')).toEqual(['a', 'b', 'c']);
  });
});

describe('definisi master', () => {
  it('model baris props/slots dan frame kandidat slot', () => {
    const m = masterModel(doc(), 'CardAAAA')!;
    expect(m.props).toEqual([expect.objectContaining({ name: 'title', defaultText: '“Hi”', bindText: 'Title' })]);
    expect(m.slots).toEqual([{ name: 'body', nodeId: 'BodyAAAA', frameName: 'Body', countText: '1 layer' }]);
    expect(m.frames.map((f) => f.id)).toEqual(['SideAAAA']);
    expect(slotFrameCandidates(doc(), 'TitleAAA')).toEqual([]);
  });

  it('tambah text tanpa teks bebas → tanpa bind; boolean/enum nama unik', () => {
    const d = doc();
    const text = addPropOps(d, 'CardAAAA', 'text')!;
    // Title sudah terikat content; Inner adalah teks berikutnya.
    expect(text.ops[0]).toMatchObject({ op: 'setComponent', id: 'CardAAAA', component: { props: [{ name: 'title' }, { name: 'inner', default: 'a', binds: [{ nodeId: 'InnerAAA', prop: 'content' }] }] } });
    expect(addPropOps(d, 'CardAAAA', 'enum')!.ops[0]).toMatchObject({ component: { props: [{}, { name: 'variant', type: 'enum', options: ['default', 'alternate'], default: 'default' }] } });
    expect(addPropOps(d, 'LooseAAA', 'boolean')).toBeUndefined();
  });

  it('ubah prop: nama tidak sah ditolak, rename memigrasi instance, options merapikan default', () => {
    const d = doc();
    expect(updatePropOps(d, info(d), 'CardAAAA', 'title', { name: 'body' })).toEqual({ error: expect.stringMatching(/already used/) });
    expect(updatePropOps(d, info(d), 'CardAAAA', 'nope', { name: 'x' })).toEqual({ error: expect.any(String) });
    expect(updatePropOps(d, info(d), 'CardAAAA', 'title', { default: 'Hi' })).toEqual([]);
    const ops = updatePropOps(d, info(d), 'CardAAAA', 'title', { name: 'heading' }) as never[];
    expect(ops).toHaveLength(2);
    expect(ops[1]).toEqual({ op: 'update', id: 'InstAAAA', patch: { props: { heading: 'X' } } });
    const enumDoc = doc();
    (enumDoc.pages[0]!.children[0] as any).children[0].children[0].component.props.push({ name: 'tone', type: 'enum', options: ['a', 'b'], default: 'b', binds: [] });
    const opt = updatePropOps(enumDoc, info(enumDoc), 'CardAAAA', 'tone', { options: ['c', 'a'] }) as any[];
    expect(opt[0].component.props[1]).toMatchObject({ options: ['c', 'a'], default: 'c' });
    expect(updatePropOps(enumDoc, info(enumDoc), 'CardAAAA', 'tone', { options: [] })).toEqual({ error: expect.any(String) });
    // Options yang bukan nilai align → bind ke align teks mengganti options dengan nilai align teks.
    const replaced = updatePropOps(enumDoc, info(enumDoc), 'CardAAAA', 'tone', { binds: [{ nodeId: 'TitleAAA', prop: 'align' }] }) as any[];
    expect(replaced[0].component.props[1]).toMatchObject({ options: ['left', 'center', 'right', 'justify'], default: 'left' });
    // Frame align → nilai Align skema; options yang sudah cocok dipertahankan.
    const frame = updatePropOps(enumDoc, info(enumDoc), 'CardAAAA', 'tone', { binds: [{ nodeId: 'BodyAAAA', prop: 'align' }] }) as any[];
    expect(frame[0].component.props[1]).toMatchObject({ options: ['start', 'center', 'end', 'stretch'], default: 'start' });
    (enumDoc.pages[0]!.children[0] as any).children[0].children[0].component.props[1] = { name: 'tone', type: 'enum', options: ['center', 'end'], default: 'end', binds: [{ nodeId: 'BodyAAAA', prop: 'align' }] };
    expect(updatePropOps(enumDoc, info(enumDoc), 'CardAAAA', 'tone', { binds: [{ nodeId: 'CardAAAA', prop: 'justify' }] })).toEqual([
      expect.objectContaining({ component: expect.objectContaining({ props: [expect.anything(), expect.objectContaining({ options: ['center', 'end'], default: 'end' })] }) }),
    ]);
    // Options diketik harus nilai sah properti ber-enum yang terikat.
    expect(updatePropOps(enumDoc, info(enumDoc), 'CardAAAA', 'tone', { options: ['center', 'middle'] })).toEqual({ error: expect.stringMatching(/Align must be among: start, center, end, stretch/) });
  });

  it('ubah default: text, boolean, enum', () => {
    const d = doc();
    const def = (d.pages[0]!.children[0] as any).children[0].children[0].component;
    def.props.push({ name: 'show', type: 'boolean', default: true, binds: [] }, { name: 'tone', type: 'enum', options: ['a', 'b'], default: 'a', binds: [] });
    expect((updatePropOps(d, info(d), 'CardAAAA', 'title', { default: 'New' }) as any[])[0].component.props[0].default).toBe('New');
    expect((updatePropOps(d, info(d), 'CardAAAA', 'show', { default: false }) as any[])[0].component.props[1].default).toBe(false);
    expect((updatePropOps(d, info(d), 'CardAAAA', 'tone', { default: 'b' }) as any[])[0].component.props[2].default).toBe('b');
    expect((updatePropOps(d, info(d), 'CardAAAA', 'tone', { default: 'zz' }) as any[])).toEqual([]);
  });

  it('options enum berubah → nilai instance yang hilang dibuang; rename membuang nilai yatim bernama sama', () => {
    const d = doc();
    const card = (d.pages[0]!.children[0] as any).children[0].children[0];
    card.component.props.push({ name: 'tone', type: 'enum', options: ['a', 'b'], default: 'a', binds: [] });
    const row = (d.pages[0]!.children[0] as any).children[1].children;
    row[0].props = { title: 'X', tone: 'b' };
    row[1].props = { tone: 'a', heading: 'stale' };
    const pruned = updatePropOps(d, info(d), 'CardAAAA', 'tone', { options: ['a', 'c'] }) as any[];
    expect(pruned.slice(1)).toEqual([{ op: 'update', id: 'InstAAAA', patch: { props: { title: 'X' } } }]);
    const renamed = updatePropOps(d, info(d), 'CardAAAA', 'tone', { name: 'heading' }) as any[];
    expect(renamed.slice(1)).toEqual([
      { op: 'update', id: 'InstAAAA', patch: { props: { title: 'X', heading: 'b' } } },
      { op: 'update', id: 'InstBBBB', patch: { props: { heading: 'a' } } },
    ]);
  });

  it('hapus prop membuang nilai instance (props:null bila kosong)', () => {
    const d = doc();
    expect(removePropOps(d, info(d), 'CardAAAA', 'title')).toEqual([
      { op: 'setComponent', id: 'CardAAAA', component: { props: [], slots: [{ name: 'body', nodeId: 'BodyAAAA' }] } },
      { op: 'update', id: 'InstAAAA', patch: { props: null } },
    ]);
    expect(removePropOps(d, info(d), 'CardAAAA', 'nope')).toEqual([]);
  });

  it('slot: tandai frame turunan, rename memindah isi instance, lepas', () => {
    const d = doc();
    expect(addSlotOps(d, 'CardAAAA', 'SideAAAA')).toMatchObject({ name: 'sidePanel', ops: [{ component: { slots: [{ name: 'body' }, { name: 'sidePanel', nodeId: 'SideAAAA' }] } }] });
    expect(addSlotOps(d, 'CardAAAA', 'CardAAAA')).toBeUndefined();
    expect(addSlotOps(d, 'CardAAAA', 'BodyAAAA')).toBeUndefined();
    expect(addSlotOps(d, 'CardAAAA', 'TitleAAA')).toBeUndefined();
    const ren = renameSlotOps(d, info(d), 'CardAAAA', 'body', 'main') as any[];
    expect(ren[1]).toEqual({ op: 'update', id: 'InstAAAA', patch: { slots: { main: [{ id: 'SlotAAAA', type: 'rect', name: 'Slotted' }] } } });
    expect(renameSlotOps(d, info(d), 'CardAAAA', 'body', 'title')).toEqual({ error: expect.stringMatching(/already used/) });
    expect(removeSlotOps(d, 'CardAAAA', 'body')).toEqual([{ op: 'setComponent', id: 'CardAAAA', component: { props: expect.any(Array), slots: [] } }]);
  });

  it('frame di dalam master → info slot; master sendiri/node luar/isi slot instance → tidak', () => {
    const d = doc();
    expect(masterOfNode(info(d), 'InnerAAA')).toBe('CardAAAA');
    expect(masterOfNode(info(d), 'CardAAAA')).toBeUndefined();
    expect(masterOfNode(info(d), 'SlotAAAA')).toBeUndefined();
    expect(slotFrameInfo(d, info(d), 'BodyAAAA')).toEqual({ masterId: 'CardAAAA', masterName: 'Card', slot: 'body' });
    expect(slotFrameInfo(d, info(d), 'SideAAAA')).toMatchObject({ slot: undefined });
    expect(slotFrameInfo(d, info(d), 'TitleAAA')).toBeUndefined();
    expect(slotFrameInfo(d, info(d), 'RowAAAAA')).toBeUndefined();
  });
});

describe('instance: nilai props dan isi slot', () => {
  it('model: nilai efektif dan baris slot (isi instance vs default master)', () => {
    const d = doc();
    expect(instanceModel(d, info(d), 'InstAAAA')).toEqual({
      instanceId: 'InstAAAA',
      masterId: 'CardAAAA',
      props: [{ name: 'title', type: 'text', value: 'X', options: [], visibility: false }],
      slots: [{ name: 'body', frameId: 'BodyAAAA', address: 'InstAAAA/BodyAAAA', filled: true, text: '1 layer' }],
    });
    expect(instanceModel(d, info(d), 'InstBBBB')!.props[0]!.value).toBe('Hi');
    expect(instanceModel(d, info(d), 'InstBBBB')!.slots[0]!.text).toBe('Default · 1 layer');
    expect(propValue({ name: 'tone', type: 'enum', options: ['a'], default: 'a', binds: [] }, { tone: 'zz' })).toBe('a');
  });

  it('set nilai: = default membuang kunci, tanpa perubahan → [], tipe salah → []', () => {
    const d = doc();
    expect(setInstancePropOps(d, info(d), 'InstAAAA', 'title', 'Hi')).toEqual([{ op: 'update', id: 'InstAAAA', patch: { props: null } }]);
    expect(setInstancePropOps(d, info(d), 'InstAAAA', 'title', 'X')).toEqual([]);
    expect(setInstancePropOps(d, info(d), 'InstBBBB', 'title', 'Hi')).toEqual([]);
    expect(setInstancePropOps(d, info(d), 'InstBBBB', 'title', 'Y')).toEqual([{ op: 'update', id: 'InstBBBB', patch: { props: { title: 'Y' } } }]);
    expect(setInstancePropOps(d, info(d), 'InstBBBB', 'title', true)).toEqual([]);
    expect(setInstancePropOps(d, info(d), 'InstBBBB', 'nope', 'Y')).toEqual([]);
  });

  it('kandidat pindah: tanpa board, instance itu, leluhurnya, master dan leluhurnya', () => {
    const d = doc();
    // Row = leluhur InstAAAA, Wrap = leluhur master: tidak ditawarkan, tetapi isi lainnya ditawarkan.
    expect(moveCandidates(d, info(d), 'InstAAAA').map((c) => c.id)).toEqual(['InstBBBB', 'LooseAAA']);
    // Master lain beserta isinya juga tidak ditawarkan.
    (d.pages[0]!.children[0] as any).children[1].children.push({ id: 'OtherAAA', type: 'frame', name: 'Other', component: { props: [], slots: [] }, children: [{ id: 'OtherKid', type: 'rect', name: 'Kid' }] });
    expect(moveCandidates(d, info(d), 'InstAAAA').map((c) => c.id)).toEqual(['InstBBBB', 'LooseAAA']);
  });
});
