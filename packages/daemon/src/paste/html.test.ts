// Importer paste HTML murni (story 4): snapshot sintetis → node Lakar + laporan. Integrasi Chromium dan uji piksel ada di
// `paste-html.test.ts`.
import { describe, expect, it } from 'vitest';
import { LakarDocument, SCHEMA_VERSION } from '@lakar/schema';
import { solidPng } from '../assets.js';
import { pasteOps } from '../paste.js';
import { HtmlImportError, importHtml, type FontLookup, type ImportedNode } from './html.js';
import type { HtmlSnapshot, SnapBox, SnapElement, SnapNode, SnapStyle } from './html-page.js';

const FONTS: FontLookup = (f) =>
  ({ inter: { family: 'Inter', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], styles: ['normal', 'italic'] }, 'jetbrains mono': { family: 'JetBrains Mono', weights: [400, 700], styles: ['normal'] } })[
    f.toLowerCase()
  ];

const BASE: SnapStyle = {
  display: 'block',
  position: 'static',
  'flex-direction': 'row',
  'flex-wrap': 'nowrap',
  'flex-grow': '0',
  'flex-basis': 'auto',
  'justify-content': 'normal',
  'align-items': 'normal',
  'align-self': 'auto',
  'justify-items': 'normal',
  'justify-self': 'auto',
  'row-gap': 'normal',
  'column-gap': 'normal',
  'grid-auto-flow': 'row',
  'grid-column-start': 'auto',
  'grid-column-end': 'auto',
  'grid-row-start': 'auto',
  'grid-row-end': 'auto',
  'background-color': 'rgba(0, 0, 0, 0)',
  'background-image': 'none',
  'box-shadow': 'none',
  opacity: '1',
  'mix-blend-mode': 'normal',
  filter: 'none',
  'backdrop-filter': 'none',
  transform: 'none',
  'overflow-x': 'visible',
  'overflow-y': 'visible',
  visibility: 'visible',
  'font-family': 'Inter',
  'font-size': '16px',
  'font-weight': '400',
  'font-style': 'normal',
  'line-height': 'normal',
  'letter-spacing': 'normal',
  'text-align': 'start',
  color: 'rgb(0, 0, 0)',
  'text-shadow': 'none',
  'text-decoration-line': 'none',
  'text-overflow': 'clip',
  'white-space': 'normal',
  'object-fit': 'fill',
  'outline-style': 'none',
  'clip-path': 'none',
  'mask-image': 'none',
  'z-index': 'auto',
  ...Object.fromEntries(['top', 'right', 'bottom', 'left'].flatMap((s) => [[`padding-${s}`, '0px'], [`margin-${s}`, '0px'], [`border-${s}-width`, '0px'], [`border-${s}-style`, 'none'], [`border-${s}-color`, 'rgb(0, 0, 0)']])),
  ...Object.fromEntries(['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((c) => [`border-${c}-radius`, '0px'])),
};

const el = (tag: string, box: SnapBox, style: SnapStyle = {}, children: SnapNode[] = [], extra: Partial<SnapElement> = {}): SnapElement => ({
  k: 'el',
  tag,
  box,
  style: { ...BASE, ...style },
  spec: { width: '', height: '', 'grid-template-columns': '', 'grid-template-rows': '', ...(extra.spec ?? {}) },
  children,
  ...extra,
});
const txt = (tag: string, box: SnapBox, content: string, style: SnapStyle = {}, lines = 1, extra: Partial<SnapElement> = {}) => el(tag, box, style, [], { text: { content, lines, mixed: [] }, ...extra });
const snap = (children: SnapNode[], extra: Partial<HtmlSnapshot> = {}): HtmlSnapshot => ({ width: 800, body: el('body', [0, 0, 800, 600], {}, children), scripts: 0, requests: [], truncated: false, ...extra });
const run = (s: HtmlSnapshot, name?: string) => importHtml(s, { fonts: FONTS, ...(name ? { name } : {}) });

/** Hasil impor lolos skema dokumen (sebagai anak board) lewat op paste. */
function validates(node: ImportedNode): void {
  const toStored = (n: ImportedNode, i: number[]): Record<string, unknown> => {
    const { children, ...rest } = n;
    const id = `N${i.join('').padStart(7, '0')}`.slice(0, 8);
    return { ...rest, id, ...(n.type === 'frame' ? { children: (children ?? []).map((c, j) => toStored(c, [...i, j])) } : {}) };
  };
  const ops = pasteOps(node, { id: 'Board001', type: 'board', width: 800, height: 600 });
  const root = toStored({ ...(ops[0] as unknown as { node: ImportedNode }).node, children: node.children ?? [] } as ImportedNode, [1]);
  const doc = { schemaVersion: SCHEMA_VERSION, id: 'Doc00001', rev: 1, pages: [{ id: 'Page0001', name: 'P', children: [{ type: 'board', id: 'Board001', name: 'B', x: 0, y: 0, width: 800, height: 600, screen: 'landing', children: [root] }] }] };
  const r = LakarDocument.safeParse(doc);
  expect(r.success, JSON.stringify(r.error?.issues?.slice(0, 3))).toBe(true);
}

describe('importHtml: struktur', () => {
  it('flex row → layout row, gap, justify, align; teks satu baris hug; tag semantik', () => {
    const nav = el(
      'nav',
      [0, 0, 800, 56],
      { display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'column-gap': '12px', 'padding-top': '8px', 'padding-bottom': '8px', 'padding-left': '24px', 'padding-right': '24px', 'background-color': 'rgb(15, 23, 42)' },
      [txt('a', [24, 18, 60, 20], 'Home', { color: 'rgb(203, 213, 225)' }), txt('a', [96, 18, 60, 20], 'Docs')],
      { label: 'Main' },
    );
    const r = run(snap([nav]));
    expect(r.node).toMatchObject({ type: 'frame', tag: 'nav', name: 'Main', layout: 'row', gap: 12, justify: 'space-between', align: 'center', padding: [8, 24], width: 800, fills: [{ type: 'solid', color: '#0F172A' }] });
    expect(r.node.height).toBeUndefined();
    expect(r.node.children![0]).toMatchObject({ type: 'text', tag: 'a', content: 'Home', color: '#CBD5E1', size: 16 });
    expect(r.node.children![0]!.width).toBeUndefined();
    expect(r.report).toMatchObject({ kind: 'html', layers: 3, autoLayout: 1, texts: 2, images: 0, vectors: 0, dropped: [] });
    validates(r.node);
  });

  it('grid: track tertulis repeat/minmax → track bertipe, penempatan anak; track tak terurai → px terpakai + laporan', () => {
    const cell = (x: number, extra: SnapStyle = {}) => el('div', [x, 0, 100, 50], { 'background-color': 'rgb(255, 0, 0)', ...extra });
    const grid = (spec: string, computed: string) =>
      el('section', [0, 0, 420, 50], { display: 'grid', 'column-gap': '10px', 'grid-template-columns': computed }, [cell(0), cell(110, { 'grid-column-start': 'span 2', 'grid-column-end': 'auto' })], { spec: { 'grid-template-columns': spec } });
    const ok = run(snap([grid('repeat(2, 1fr) minmax(0, 200px)', '100px 100px 200px')]));
    expect(ok.node).toMatchObject({ layout: 'grid', gridTemplateColumns: [{ fr: 1 }, { fr: 1 }, { minmax: [0, 200] }], columnGap: 10 });
    expect(ok.node.children![1]).toMatchObject({ gridColumn: { span: 2 } });
    validates(ok.node);
    const used = run(snap([grid('repeat(auto-fill, minmax(100px, 1fr))', '100px 100px 200px')]));
    expect(used.node.gridTemplateColumns).toEqual([100, 100, 200]);
    expect(used.report.dropped).toEqual([{ kind: 'value', name: 'grid-template-columns', count: 1 }]);
  });

  it('blok bertumpuk rata kiri, jarak seragam → kolom dengan padding/gap dari kotak; teks meregang fill', () => {
    const card = el('div', [0, 0, 300, 120], { 'padding-left': '16px', 'padding-right': '16px', 'padding-top': '16px', 'padding-bottom': '16px' }, [
      txt('h2', [16, 16, 268, 30], 'Title', { 'font-size': '24px', 'font-weight': '700', 'line-height': '30px' }),
      txt('p', [16, 58, 268, 40], 'Body copy that wraps', { 'line-height': '20px' }, 2),
    ]);
    const r = run(snap([card]));
    expect(r.node).toMatchObject({ layout: 'column', gap: 12, padding: [16, 16, 22, 16] });
    expect(r.node.children![0]).toMatchObject({ tag: 'h2', width: 'fill', weight: 700, size: 24, lineHeight: 30 });
    expect(r.node.children![1]).toMatchObject({ tag: 'p', width: 'fill' });
    validates(r.node);
  });

  it('jarak tidak seragam / margin anak flex / wrap-reverse → layout none dengan posisi tetap, dilaporkan', () => {
    const kids = () => [el('div', [0, 0, 50, 20], { 'background-color': 'rgb(1, 2, 3)' }), el('div', [0, 30, 50, 20], { 'background-color': 'rgb(1, 2, 3)' }), el('div', [0, 70, 50, 20], { 'background-color': 'rgb(1, 2, 3)' })];
    const r = run(snap([el('div', [0, 0, 200, 90], {}, kids())]));
    expect(r.node.layout).toBeUndefined();
    expect(r.node).toMatchObject({ width: 200, height: 90 });
    expect(r.node.children![2]).toMatchObject({ position: 'absolute', x: 0, y: 70, width: 50, height: 20 });
    expect(r.report.dropped).toEqual([{ kind: 'layout', name: 'uneven spacing', count: 1 }]);
    validates(r.node);
    const m = run(snap([el('div', [0, 0, 200, 20], { display: 'flex' }, [el('i', [150, 0, 50, 20], { 'margin-left': '150px', 'background-color': 'rgb(1, 2, 3)' })])]));
    expect(m.report.dropped).toEqual([{ kind: 'layout', name: 'margins', count: 1 }]);
    // `wrap-reverse` di luar skema v9: tetap gagal dan dilaporkan seperti semula.
    const w = run(snap([el('div', [0, 0, 200, 20], { display: 'flex', 'flex-wrap': 'wrap-reverse' }, [el('i', [0, 0, 50, 20], { 'background-color': 'rgb(1, 2, 3)' })])]));
    expect(w.report.dropped).toEqual([{ kind: 'layout', name: 'flex-wrap', count: 1 }]);
    // `align-content` non-default saat wrap: distribusi antarbaris tak terwakili → gagal dan dilaporkan.
    const ac = run(snap([el('div', [0, 0, 200, 56], { display: 'flex', 'flex-wrap': 'wrap', 'align-content': 'space-between' }, [el('i', [0, 0, 50, 20], { 'background-color': 'rgb(1, 2, 3)' })])]));
    expect(ac.node.layout).toBeUndefined();
    expect(ac.report.dropped).toEqual([{ kind: 'layout', name: 'align-content', count: 1 }]);
  });

  it('flex-wrap: wrap (v9) → frame wrap:true; gap sumbu silang → rowGap (row) / columnGap (column)', () => {
    const chip = (x: number, y: number) => el('div', [x, y, 60, 24], { 'background-color': 'rgb(1, 2, 3)' });
    const w = run(snap([el('div', [0, 0, 200, 56], { display: 'flex', 'flex-wrap': 'wrap', 'column-gap': '8px', 'row-gap': '16px' }, [chip(0, 0), chip(68, 0), chip(0, 40)])]));
    expect(w.node).toMatchObject({ layout: 'row', wrap: true, gap: 8, rowGap: 16 });
    expect(w.report.dropped).toEqual([]);
    validates(w.node);
    const col = run(snap([el('div', [0, 0, 136, 56], { display: 'flex', 'flex-direction': 'column', 'flex-wrap': 'wrap', 'row-gap': '8px', 'column-gap': '16px' }, [chip(0, 0), chip(0, 32), chip(76, 0)])]));
    expect(col.node).toMatchObject({ layout: 'column', wrap: true, gap: 8, columnGap: 16 });
    expect(col.report.dropped).toEqual([]);
    validates(col.node);
    // nowrap + gap sumbu silang tetap diimpor (properti valid juga tanpa wrap).
    const nw = run(snap([el('div', [0, 0, 200, 24], { display: 'flex', 'row-gap': '16px' }, [chip(0, 0)])]));
    expect(nw.node).toMatchObject({ layout: 'row', rowGap: 16 });
    expect(nw.node.wrap).toBeUndefined();
    validates(nw.node);
    // `align-content` stretch/normal = distribusi default → lolos; nowrap: `align-content` no-op CSS, diabaikan.
    for (const v of ['normal', 'stretch']) {
      const ok = run(snap([el('div', [0, 0, 200, 56], { display: 'flex', 'flex-wrap': 'wrap', 'align-content': v }, [chip(0, 0), chip(68, 0), chip(0, 40)])]));
      expect(ok.node).toMatchObject({ layout: 'row', wrap: true });
      expect(ok.report.dropped).toEqual([]);
      validates(ok.node);
    }
    const nwac = run(snap([el('div', [0, 0, 200, 24], { display: 'flex', 'align-content': 'space-between' }, [chip(0, 0)])]));
    expect(nwac.node).toMatchObject({ layout: 'row' });
    expect(nwac.node.wrap).toBeUndefined();
    expect(nwac.report.dropped).toEqual([]);
    validates(nwac.node);
  });

  it('anak absolute di atas anak flow, x/y relatif parent; flex-grow → fill; align-self start → hug', () => {
    const r = run(
      snap([
        el('div', [10, 10, 300, 100], { display: 'flex', 'flex-direction': 'column', position: 'relative' }, [
          el('span', [260, 20, 30, 16], { position: 'absolute', 'background-color': 'rgb(9, 9, 9)' }),
          el('div', [10, 10, 300, 40], { 'flex-grow': '1', 'background-color': 'rgb(1, 1, 1)' }),
          txt('span', [10, 50, 80, 60], 'Tag', { 'align-self': 'flow-start', 'background-color': 'rgb(1, 1, 1)' }),
        ]),
      ]),
    );
    expect(r.node.children!.map((c) => c.position ?? 'flow')).toEqual(['flow', 'flow', 'absolute']);
    expect(r.node.children![0]).toMatchObject({ height: 'fill' });
    expect(r.node.children![1]).toMatchObject({ width: 'hug' });
    expect(r.node.children![2]).toMatchObject({ x: 250, y: 10, width: 30, height: 16 });
    validates(r.node);
  });

  it('body dengan beberapa anak → frame "HTML"; body teks saja → node teks; tanpa isi → HtmlImportError', () => {
    const two = run(snap([txt('p', [0, 0, 800, 20], 'A'), txt('p', [0, 20, 800, 20], 'B')]));
    expect(two.node).toMatchObject({ type: 'frame', name: 'HTML', layout: 'column', width: 800 });
    const text: HtmlSnapshot = { ...snap([]), body: { ...el('body', [0, 0, 800, 40]), text: { content: 'Copied sentence from a page', lines: 2, mixed: ['strong'] } } };
    const t = run(text, 'Quote');
    expect(t.node).toMatchObject({ type: 'text', name: 'Quote', content: 'Copied sentence from a page', width: 800.02, wrap: 'wrap' });
    expect(t.report.dropped).toEqual([{ kind: 'value', name: 'text styles', count: 1 }]);
    expect(() => run(snap([]))).toThrow(HtmlImportError);
  });
});

describe('importHtml: gaya dan laporan', () => {
  it('font: famili tak terpasang → Inter + laporan; famili terdaftar dipakai; bobot dibulatkan ke yang tersedia', () => {
    const r = run(snap([el('div', [0, 0, 200, 40], { display: 'flex' }, [txt('b', [0, 0, 80, 20], 'Brand', { 'font-family': 'Satoshi, sans-serif', 'font-weight': '650' }), txt('code', [80, 0, 80, 20], 'x()', { 'font-family': '"JetBrains Mono", monospace', 'font-weight': '500' })])]));
    const [a, b] = r.node.children!;
    expect(a!.family).toBeUndefined();
    expect(a!.weight).toBe(700);
    expect(b).toMatchObject({ family: 'JetBrains Mono' });
    expect(b!.weight).toBeUndefined();
    expect(r.report.dropped).toEqual([{ kind: 'font', name: 'Satoshi', count: 1 }]);
  });

  it('paint: border sisi tertentu → stroke inside sides + padding; radius persen; bayangan inset; gradien di atas warna', () => {
    const r = run(
      snap([
        el('div', [0, 0, 100, 50], {
          'border-bottom-width': '2px',
          'border-bottom-style': 'solid',
          'border-bottom-color': 'rgb(255, 0, 0)',
          'border-top-left-radius': '50%',
          'border-top-right-radius': '50%',
          'border-bottom-right-radius': '50%',
          'border-bottom-left-radius': '50%',
          'box-shadow': 'rgba(0, 0, 0, 0.25) 0px 2px 4px 0px inset',
          'background-color': 'rgb(255, 255, 255)',
          'background-image': 'linear-gradient(to right, rgb(0, 0, 0), rgba(0, 0, 0, 0))',
          filter: 'blur(3px)',
          opacity: '0.5',
        }),
      ]),
    );
    expect(r.node).toMatchObject({
      stroke: { color: '#FF0000', width: 2, align: 'inside', sides: ['bottom'] },
      radius: 25,
      shadows: [{ type: 'inner', x: 0, y: 2, blur: 4, color: '#00000040' }],
      fills: [{ type: 'solid', color: '#FFFFFF' }, { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#00000000' }] }],
      blur: 6,
      opacity: 0.5,
    });
    expect(r.report.dropped).toEqual([{ kind: 'value', name: 'border-radius', count: 1 }]);
    validates(r.node);
  });

  it('tanpa padanan → property; nilai tak didukung → value; skrip, handler, permintaan, pseudo-elemen dilaporkan', () => {
    const r = run(
      snap(
        [
          el('div', [0, 0, 100, 40], { display: 'flex' }, [
            txt('a', [0, 0, 50, 20], 'Link', { 'text-decoration-line': 'underline' }, 1, { handlers: ['onclick'] }),
            el('div', [50, 0, 50, 40], { transform: 'matrix(1, 0, 0.5, 1, 0, 0)', filter: 'drop-shadow(rgb(0, 0, 0) 0px 1px 2px)', 'mix-blend-mode': 'plus-lighter', 'background-color': 'rgb(1, 1, 1)' }, [], { pseudo: ['::before'] }),
          ]),
        ],
        { scripts: 2, requests: [{ type: 'image', url: 'http://x/a.png' }, { type: 'image', url: 'http://x/b.png' }, { type: 'stylesheet', url: 'http://x/s.css' }, { type: 'fetch', url: 'http://x/f' }] },
      ),
    );
    expect(r.report.dropped).toEqual([
      { kind: 'element', name: '<script>', count: 2 },
      { kind: 'property', name: 'text-decoration' },
      { kind: 'attribute', name: 'onclick' },
      { kind: 'value', name: 'mix-blend-mode' },
      { kind: 'property', name: 'filter' },
      { kind: 'property', name: 'transform' },
      { kind: 'property', name: '::before' },
      { kind: 'request', name: 'external image', count: 2 },
      { kind: 'request', name: 'external stylesheet', count: 1 },
      { kind: 'request', name: 'network request', count: 1 },
    ].map((d) => ({ count: 1, ...d })));
  });

  it('<img> data raster → rect + fill image + aset tertunda; <img> luar → rect kosong; <input> → rect + laporan', () => {
    const png = solidPng(4, 4, [10, 20, 30]);
    const src = `data:image/png;base64,${png.toString('base64')}`;
    const r = run(
      snap([
        el('div', [0, 0, 300, 100], { display: 'flex' }, [
          el('img', [0, 0, 100, 100], { 'object-fit': 'cover', 'border-top-left-radius': '8px', 'border-top-right-radius': '8px', 'border-bottom-right-radius': '8px', 'border-bottom-left-radius': '8px' }, [], { img: { src } }),
          el('img', [100, 0, 100, 100], {}, [], { img: {} }),
          el('input', [200, 0, 100, 30], { 'background-color': 'rgb(255, 255, 255)' }),
        ]),
      ]),
    );
    const [a, b, c] = r.node.children!;
    expect(a).toMatchObject({ type: 'rect', name: 'Image', width: 100, height: 100, radius: 8, fills: [{ type: 'image', fit: 'cover', assetId: expect.stringMatching(/^[a-f0-9]{64}$/) }] });
    expect(r.assets).toEqual([{ sha: (a!.fills as { assetId: string }[])[0]!.assetId, bytes: png }]);
    expect(b).toMatchObject({ type: 'rect', width: 100, height: 100 });
    expect(b!.fills).toBeUndefined();
    expect(c).toMatchObject({ type: 'rect', fills: [{ type: 'solid', color: '#FFFFFF' }] });
    expect(r.report).toMatchObject({ images: 1, dropped: [{ kind: 'element', name: '<input>', count: 1 }] });
    validates(r.node);
  });

  it('<svg> inline → importer SVG (frame path) seukuran tampil; SVG rusak → rect + laporan elemen', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" color="rgb(56, 189, 248)"><path d="M0 0H24V24Z" fill="rgb(56, 189, 248)" stroke="none" stroke-width="1"/><circle cx="12" cy="12" r="3" fill="rgb(0, 0, 0)" stroke="none" stroke-width="1"/></svg>';
    const r = run(snap([el('div', [0, 0, 100, 32], { display: 'flex' }, [el('svg', [0, 0, 32, 32], {}, [], { svg }), el('svg', [40, 0, 10, 10], {}, [], { svg: '<svg/>' })])]));
    const [a, b] = r.node.children!;
    expect(a).toMatchObject({ type: 'frame', width: 32, height: 32 });
    expect(a!.children).toHaveLength(2);
    expect(a!.children![0]).toMatchObject({ type: 'path', fills: [{ type: 'solid', color: '#38BDF8' }] });
    expect(b).toMatchObject({ type: 'rect', width: 10, height: 10 });
    expect(r.report).toMatchObject({ vectors: 2, dropped: [{ kind: 'element', name: '<svg>', count: 1 }] });
    validates(r.node);
  });

  it('triage: snapshot terpotong dilaporkan; font-size 0 → 16 + laporan; p berkotak → tag di teks; penempatan grid di luar batas → posisi tetap; akar body tanpa tinggi tetap', () => {
    const cut = run(snap([txt('p', [0, 0, 100, 20], 'x')], { truncated: true }));
    expect(cut.report.dropped).toEqual([{ kind: 'element', name: 'elements beyond the import limit', count: 1 }]);
    const zero = run(snap([txt('span', [0, 0, 100, 20], 'x', { 'font-size': '0px' })]));
    expect(zero.node.size).toBe(16);
    expect(zero.report.dropped).toEqual([{ kind: 'value', name: 'font-size', count: 1 }]);
    const p = run(snap([txt('p', [0, 0, 200, 40], 'Boxed', { 'padding-top': '10px', 'padding-bottom': '10px', 'background-color': 'rgb(1, 2, 3)' })]));
    expect(p.node.tag).toBeUndefined();
    expect(p.node.children![0]).toMatchObject({ type: 'text', tag: 'p', content: 'Boxed' });
    const far = run(snap([el('div', [0, 0, 200, 50], { display: 'grid' }, [el('i', [0, 0, 50, 50], { 'grid-column-start': '1', 'grid-column-end': '200', 'background-color': 'rgb(1, 1, 1)' })])]));
    expect(far.node.layout).toBeUndefined();
    expect(far.report.dropped).toEqual([{ kind: 'layout', name: 'grid-area', count: 1 }]);
    validates(far.node);
    const body: HtmlSnapshot = { ...snap([txt('p', [0, 0, 800, 20], 'A'), txt('p', [0, 20, 800, 20], 'B')]) };
    body.body.spec.height = '100%';
    const b = run(body);
    expect(b.node.height).toBeUndefined();
    expect({ width: b.width, height: b.height }).toEqual({ width: 800, height: 600 });
  });

  it('pasteOps bersarang: ref paste-N untuk kontainer dalam, daun tanpa ref', () => {
    const r = run(snap([el('div', [0, 0, 200, 50], { display: 'flex' }, [el('div', [0, 0, 100, 50], { display: 'flex' }, [txt('span', [0, 0, 50, 20], 'a')]), txt('span', [100, 0, 50, 20], 'b')])]));
    const ops = pasteOps(r.node, { id: 'Board001', type: 'board', width: 800, height: 600 });
    expect(ops.map((o) => [(o as { parentId: string }).parentId, (o as { ref?: string }).ref])).toEqual([
      ['Board001', 'paste'],
      ['@paste', 'paste-1'],
      ['@paste-1', undefined],
      ['@paste', undefined],
    ]);
  });
});
