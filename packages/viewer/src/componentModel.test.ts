import { describe, expect, it } from 'vitest';
import type { LakarDocument } from '@lakar/schema';
import {
  componentInfo,
  componentTarget,
  dropTarget,
  exitInstanceSelection,
  groupOverrides,
  instanceNode,
  instanceRootOf,
  instancesText,
  instanceTarget,
  inSlotContent,
  isComposite,
  markerLabel,
  overrideEntry,
  overrideKey,
  overrideSummary,
  resetAllOps,
  resetGroupOps,
} from './componentModel.js';
import type { GeoNode } from './gesture.js';

/**
 * Board Home: master Card (frame CardAAAA > teks TitleAAA, slot frame BodyAAAA), Row (RowAAAAA) berisi instance
 * InstAAAA (override akar fill + teks judul, isi slot `body` = SlotAAAA) dan instance InstBBBB. Board Other: master
 * Tag (TagAAAAA) tanpa instance.
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
                id: 'CardAAAA',
                type: 'frame',
                name: 'Card',
                component: { props: [], slots: [{ name: 'body', nodeId: 'BodyAAAA' }] },
                children: [
                  { id: 'TitleAAA', type: 'text', name: 'Title', content: 'Hi', size: 12 },
                  { id: 'BodyAAAA', type: 'frame', name: 'Body', children: [] },
                ],
              },
              {
                id: 'RowAAAAA',
                type: 'frame',
                name: 'Row',
                layout: 'row',
                children: [
                  {
                    id: 'InstAAAA',
                    type: 'instance',
                    name: 'Digital products',
                    componentId: 'CardAAAA',
                    overrides: { CardAAAA: { fills: [] }, TitleAAA: { content: 'X' } },
                    slots: { body: [{ id: 'SlotAAAA', type: 'text', name: 'Slot text', content: 's', size: 10 }] },
                  },
                  { id: 'InstBBBB', type: 'instance', name: 'Spatial', componentId: 'CardAAAA' },
                ],
              },
            ],
          },
          { id: 'OtherAAA', type: 'board', name: 'Other', x: 500, y: 0, width: 100, height: 100, children: [{ id: 'TagAAAAA', type: 'rect', name: 'Tag', component: { props: [], slots: [] } }] },
        ],
      },
    ],
  } as unknown as LakarDocument;
}

describe('componentInfo', () => {
  it('master (urut dokumen) dengan instance, kind, dan isi slot dengan parent alamat slot', () => {
    const info = componentInfo(doc());
    expect(info.masters.map((m) => [m.id, m.boardName, m.instances])).toEqual([
      ['CardAAAA', 'Home', ['InstAAAA', 'InstBBBB']],
      ['TagAAAAA', 'Other', []],
    ]);
    expect(info.kinds.get('CardAAAA')).toBe('master');
    expect(info.kinds.get('InstAAAA')).toBe('instance');
    expect(info.kinds.has('HomeAAAA')).toBe(false);
    expect(info.stored.get('SlotAAAA')).toMatchObject({ parentId: 'InstAAAA/BodyAAAA', boardId: 'HomeAAAA' });
    expect(info.stored.get('InstAAAA')?.parentId).toBe('RowAAAAA');
  });

  it('isi slot instance dikenali (inspect dilewati), node lain tidak', () => {
    const info = componentInfo(doc());
    expect(inSlotContent(info, 'SlotAAAA')).toBe(true);
    expect(inSlotContent(info, 'InstAAAA')).toBe(false);
    expect(inSlotContent(info, 'TitleAAA')).toBe(false);
    expect(inSlotContent(info, 'nope')).toBe(false);
  });
});

describe('alamat dan override', () => {
  it('komposit, akar instance, kunci override akar/komposit/bersarang', () => {
    expect(isComposite('InstAAAA/TitleAAA')).toBe(true);
    expect(isComposite('InstAAAA')).toBe(false);
    expect(instanceRootOf('InstAAAA/JjjjJjjj/TitleAAA')).toBe('InstAAAA');
    expect(overrideKey('InstAAAA', 'CardAAAA')).toBe('CardAAAA');
    expect(overrideKey('InstAAAA/TitleAAA', 'CardAAAA')).toBe('TitleAAA');
    expect(overrideKey('InstAAAA/JjjjJjjj/TitleAAA', 'CardAAAA')).toBe('JjjjJjjj/TitleAAA');
    const info = componentInfo(doc());
    expect(overrideEntry(info, 'InstAAAA')).toEqual({ fills: [] });
    expect(overrideEntry(info, 'InstAAAA/TitleAAA')).toEqual({ content: 'X' });
    expect(overrideEntry(info, 'InstBBBB/TitleAAA')).toEqual({});
    expect(overrideEntry(info, 'RowAAAAA')).toBeUndefined();
  });

  it('marker per grup, label, dan op reset per target', () => {
    const targets = [
      { id: 'InstAAAA/TitleAAA', overrides: { content: 'X', size: 20 } },
      { id: 'InstBBBB/TitleAAA', overrides: { color: '#000000' } },
      { id: 'RowAAAAA' },
    ];
    expect(groupOverrides(targets, 'typography')).toEqual(['content', 'size', 'color']);
    expect(groupOverrides(targets, 'fill')).toEqual([]);
    expect(markerLabel(['content'])).toBe('Text overridden');
    expect(markerLabel(['fills'])).toBe('Overridden');
    expect(resetGroupOps(targets, 'typography')).toEqual([
      { op: 'resetOverride', id: 'InstAAAA/TitleAAA', props: ['content', 'size'] },
      { op: 'resetOverride', id: 'InstBBBB/TitleAAA', props: ['color'] },
    ]);
    expect(resetGroupOps(targets, 'effects')).toEqual([]);
    expect(resetAllOps('InstAAAA')).toEqual([{ op: 'update', id: 'InstAAAA', patch: { overrides: null } }]);
  });

  it('properti vektor (v6) masuk marker dan reset grup Fill/Stroke', () => {
    const targets = [{ id: 'InstAAAA/PathAAAA', overrides: { fillRule: 'evenodd', strokeLinecap: 'round', strokeDasharray: [4, 2], strokeLinejoin: 'bevel', strokeMiterlimit: 8, svg: { 'stroke-opacity': '0.5' } } }];
    expect(groupOverrides(targets, 'fill')).toEqual(['fillRule']);
    expect(groupOverrides(targets, 'stroke')).toEqual(['strokeLinecap', 'strokeLinejoin', 'strokeDasharray', 'strokeMiterlimit', 'svg']);
    expect(resetGroupOps(targets, 'stroke')).toEqual([{ op: 'resetOverride', id: 'InstAAAA/PathAAAA', props: ['strokeLinecap', 'strokeLinejoin', 'strokeDasharray', 'strokeMiterlimit', 'svg'] }]);
    expect(resetGroupOps(targets, 'fill')).toEqual([{ op: 'resetOverride', id: 'InstAAAA/PathAAAA', props: ['fillRule'] }]);
  });

  it('ringkasan override: akar "Fill", node lain "<nama> text", yatim, kosong', () => {
    const info = componentInfo(doc());
    const names: Record<string, string> = { TitleAAA: 'Title' };
    expect(overrideSummary(info.instances.get('InstAAAA')!, (k) => names[k])).toEqual({ count: 2, text: '2 overrides · Fill, Title text' });
    expect(overrideSummary({ id: 'I', name: 'I', type: 'instance', componentId: 'C', overrides: { GoneGone: { width: 3 } } }, () => undefined)).toEqual({ count: 1, text: '1 override · Missing layer width' });
    expect(overrideSummary(info.instances.get('InstBBBB')!, () => undefined)).toEqual({ count: 0, text: 'No overrides' });
    expect(instancesText(1)).toBe('1 instance');
    expect(instancesText(3)).toBe('3 instances');
  });
});

describe('target panel Design dan Escape', () => {
  it('akar instance dan isi instance → node efektif + entri override; node biasa / alamat tak ada → undefined', () => {
    const d = doc();
    const info = componentInfo(d);
    const root = componentTarget(d, info, 'InstAAAA');
    expect(root?.stored).toMatchObject({ id: 'InstAAAA', type: 'frame', name: 'Digital products', fills: [] });
    expect(root?.overrides).toEqual({ fills: [] });
    const title = componentTarget(d, info, 'InstAAAA/TitleAAA');
    expect(title?.stored).toMatchObject({ type: 'text', content: 'X' });
    expect(title?.overrides).toEqual({ content: 'X' });
    expect(componentTarget(d, info, 'InstBBBB/TitleAAA')?.stored).toMatchObject({ content: 'Hi' });
    expect(componentTarget(d, info, 'CardAAAA')).toBeUndefined();
    expect(componentTarget(d, info, 'InstAAAA/GoneGone')).toBeUndefined();
  });

  it('Escape: alamat komposit naik ke instance terluar, node lain tetap, tanpa duplikat', () => {
    expect(exitInstanceSelection(['InstAAAA/TitleAAA'])).toEqual(['InstAAAA']);
    expect(exitInstanceSelection(['RowAAAAA', 'InstAAAA/TitleAAA', 'InstAAAA/BodyAAAA', 'InstBBBB/J/T'])).toEqual(['RowAAAAA', 'InstAAAA', 'InstBBBB']);
    expect(exitInstanceSelection(['RowAAAAA'])).toBeUndefined();
    expect(exitInstanceSelection([])).toBeUndefined();
  });
});

describe('target sisip instance', () => {
  const info = componentInfo(doc());
  it('tombol +: frame terpilih, leaf → parent, komposit → parent instance, slot → alamat slot, kosong → board pertama', () => {
    expect(instanceTarget(info, 'TagAAAAA', 'RowAAAAA', 'HomeAAAA')).toEqual({ parentId: 'RowAAAAA' });
    expect(instanceTarget(info, 'TagAAAAA', 'InstBBBB', 'HomeAAAA')).toEqual({ parentId: 'RowAAAAA' });
    expect(instanceTarget(info, 'TagAAAAA', 'InstAAAA/TitleAAA', 'HomeAAAA')).toEqual({ parentId: 'RowAAAAA' });
    expect(instanceTarget(info, 'TagAAAAA', 'SlotAAAA', 'HomeAAAA')).toEqual({ parentId: 'InstAAAA/BodyAAAA' });
    expect(instanceTarget(info, 'TagAAAAA', 'OtherAAA', 'HomeAAAA')).toEqual({ parentId: 'OtherAAA' });
    expect(instanceTarget(info, 'TagAAAAA', undefined, 'HomeAAAA')).toEqual({ parentId: 'HomeAAAA' });
    expect(instanceTarget(info, 'TagAAAAA', undefined, undefined)).toEqual({ error: 'Add a board first, then insert the component' });
  });

  it('seleksi = master itu sendiri atau isinya (klik kartu lalu +): sisip di parent master', () => {
    expect(instanceTarget(info, 'CardAAAA', 'CardAAAA', 'HomeAAAA')).toEqual({ parentId: 'HomeAAAA' });
    expect(instanceTarget(info, 'CardAAAA', 'BodyAAAA', 'HomeAAAA')).toEqual({ parentId: 'HomeAAAA' });
    expect(instanceTarget(info, 'CardAAAA', 'TitleAAA', 'HomeAAAA')).toEqual({ parentId: 'HomeAAAA' });
  });

  it('drop: kontainer tersimpan terdalam; frame none → posisi absolut relatif; instance dilewati; luar board → error', () => {
    const g = (id: string, type: string, box: GeoNode['box'], o: Partial<GeoNode> = {}): GeoNode => ({ id, type, name: id, box, parentId: undefined, absolute: false, x: 0, y: 0, layout: undefined, children: [], ...o });
    const scene = [
      g('HomeAAAA', 'board', { x: 0, y: 0, w: 400, h: 400 }, {
        layout: 'column',
        children: [
          g('FreeAAAA', 'frame', { x: 10, y: 10, w: 100, h: 100 }, { layout: 'none' }),
          g('RowAAAAA', 'frame', { x: 0, y: 200, w: 400, h: 100 }, { layout: 'row', children: [g('InstAAAA', 'frame', { x: 0, y: 200, w: 100, h: 100 }, { layout: 'column', component: 'instance', children: [g('InstAAAA/BodyAAAA', 'frame', { x: 0, y: 200, w: 100, h: 50 }, { layout: 'none' })] })] }),
        ],
      }),
    ];
    expect(dropTarget(info, 'TagAAAAA', scene, { x: 30.4, y: 40.6 })).toEqual({ parentId: 'FreeAAAA', at: { x: 20.4, y: 30.6 } });
    expect(dropTarget(info, 'TagAAAAA', scene, { x: 50, y: 220 })).toEqual({ parentId: 'RowAAAAA' });
    expect(dropTarget(info, 'TagAAAAA', scene, { x: 300, y: 350 })).toEqual({ parentId: 'HomeAAAA' });
    expect(dropTarget(info, 'TagAAAAA', scene, { x: 900, y: 900 })).toEqual({ error: 'Drop the component onto a board' });
    expect(instanceNode({ id: 'TagAAAAA', name: 'Tag' }, { x: 20.4, y: 30.6 })).toEqual({ type: 'instance', name: 'Tag', componentId: 'TagAAAAA', position: 'absolute', x: 20, y: 31 });
    expect(instanceNode({ id: 'TagAAAAA', name: 'Tag' })).toEqual({ type: 'instance', name: 'Tag', componentId: 'TagAAAAA' });
  });
});
